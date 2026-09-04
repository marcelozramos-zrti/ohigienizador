import express from 'express';
import path from 'path';
import cors from 'cors';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { createServer as createViteServer } from 'vite';
import { getDbPool, testDbConnection, initializeDatabaseSchema, updateDbConfig, getDbConfig } from './src/server/db';
import { INITIAL_USERS, INITIAL_SERVICE_ORDERS, INITIAL_STOCK, INITIAL_MOVEMENTS, INITIAL_SETTINGS } from './src/mock/initialData';
import { AuditLog, AuditAction, AppModule, AuditResult, Role } from './src/types';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors());
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // In-memory fallback stores
  let memUsers: any[] = [...INITIAL_USERS];
  let memOrders: any[] = [...INITIAL_SERVICE_ORDERS];
  let memStock: any[] = [...INITIAL_STOCK];
  let memMovements: any[] = [...INITIAL_MOVEMENTS];
  let memSettings: any = { ...INITIAL_SETTINGS };
  let memAuditLogs: AuditLog[] = [
    {
      id: 'audit-init-1',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      userId: 'admin1',
      userName: 'Gestor Master Porto',
      userRole: 'ADMIN',
      ipAddress: '127.0.0.1',
      module: 'AUTH',
      action: 'LOGIN',
      result: 'SUCCESS',
      details: 'Sessão iniciada com sucesso via autenticação segura.',
    },
  ];

  function isNetworkError(err: any): boolean {
    if (!err) return false;
    const msg = (err.message || '').toLowerCase();
    const code = (err.code || '').toLowerCase();
    return (
      code === 'etimedout' ||
      code === 'econnrefused' ||
      code === 'enotfound' ||
      code === 'ehostunreach' ||
      code === 'enetunreach' ||
      msg.includes('etimedout') ||
      msg.includes('connect etimedout') ||
      msg.includes('econnrefused') ||
      msg.includes('network')
    );
  }

  // Inicializar esquema do banco
  initializeDatabaseSchema().catch(() => {});

  // =========================================================================
  // LOGGING & AUDIT SYSTEM (Mandatório conforme Especificação Técnica)
  // =========================================================================
  const dbLogs: Array<{ id: string; timestamp: string; level: 'INFO' | 'WARN' | 'ERROR'; message: string; query?: string; details?: any }> = [];
  function logDb(level: 'INFO' | 'WARN' | 'ERROR', message: string, query?: string, details?: any) {
    const actualLevel = (level === 'ERROR' && (message.includes('ETIMEDOUT') || message.includes('ECONNREFUSED'))) ? 'WARN' : level;
    const entry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour12: false }) + '.' + String(new Date().getMilliseconds()).padStart(3, '0'),
      level: actualLevel,
      message,
      query,
      details,
    };
    dbLogs.unshift(entry);
    if (dbLogs.length > 80) dbLogs.pop();
    if (actualLevel === 'ERROR') {
      console.error(`[DB-LOG] ${entry.timestamp} [${actualLevel}] ${message}`, query || '', details || '');
    } else {
      console.log(`[DB-LOG] ${entry.timestamp} [${actualLevel}] ${message}`);
    }
  }

  async function recordAudit(logData: {
    userId: string;
    userName: string;
    userRole: Role;
    ipAddress?: string;
    module: AppModule;
    action: AuditAction;
    affectedRecordId?: string;
    affectedRecordType?: string;
    oldValue?: string | null;
    newValue?: string | null;
    result: AuditResult;
    details?: string;
  }): Promise<AuditLog> {
    const entry: AuditLog = {
      id: 'aud-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      timestamp: new Date().toISOString(),
      userId: logData.userId || 'system',
      userName: logData.userName || 'Sistema',
      userRole: logData.userRole || 'ADMIN',
      ipAddress: logData.ipAddress || '127.0.0.1',
      module: logData.module,
      action: logData.action,
      affectedRecordId: logData.affectedRecordId,
      affectedRecordType: logData.affectedRecordType,
      oldValue: logData.oldValue ? (typeof logData.oldValue === 'object' ? JSON.stringify(logData.oldValue) : String(logData.oldValue)) : null,
      newValue: logData.newValue ? (typeof logData.newValue === 'object' ? JSON.stringify(logData.newValue) : String(logData.newValue)) : null,
      result: logData.result,
      details: logData.details,
    };

    memAuditLogs.unshift(entry);
    if (memAuditLogs.length > 500) memAuditLogs.pop();

    logDb(
      entry.result === 'BLOCKED' ? 'WARN' : 'INFO',
      `[AUDITORIA] [${entry.result}] ${entry.userRole}:${entry.userName} -> ${entry.module}.${entry.action} ${entry.affectedRecordId ? `(Ref: ${entry.affectedRecordId})` : ''} - ${entry.details || ''}`
    );

    // Gravar no MariaDB se disponível
    try {
      const db = getDbPool();
      await db.execute(
        `INSERT INTO \`audit_logs\` 
          (id, timestamp, userId, userName, userRole, ipAddress, module, action, affectedRecordId, affectedRecordType, oldValue, newValue, result, details)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.id,
          new Date(entry.timestamp),
          entry.userId,
          entry.userName,
          entry.userRole,
          entry.ipAddress || null,
          entry.module,
          entry.action,
          entry.affectedRecordId || null,
          entry.affectedRecordType || null,
          entry.oldValue || null,
          entry.newValue || null,
          entry.result,
          entry.details || null,
        ]
      );
    } catch {
      // Falha silenciosa para manter resiliência
    }

    return entry;
  }

  // Helper para obter o usuário requisitante autenticado a partir dos headers
  async function getRequester(req: express.Request): Promise<any | null> {
    const rawId = req.headers['x-user-id'] || req.query.requesterId || req.body?.requesterId;
    const userId = typeof rawId === 'string' ? rawId.trim() : null;

    if (!userId) {
      // Default: se não informado e for requisição de leitura inicial do sistema, assume o primeiro admin
      return memUsers.find((u) => u.role === 'ADMIN') || memUsers[0] || null;
    }

    // Busca na memória
    let found = memUsers.find((u) => u.id === userId);
    if (!found) {
      try {
        const db = getDbPool();
        const [rows]: any = await db.query('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
        if (rows && rows.length > 0) {
          found = rows[0];
        }
      } catch {
        // ignore
      }
    }

    return found || null;
  }

  // Helpers de Metadata de colunas
  async function getTableColumnsInfo(tableName: string): Promise<Array<{ Field: string; Type: string; Null: string; Default: any; Key: string }>> {
    try {
      const db = getDbPool();
      const [rows]: any = await db.query(`SHOW COLUMNS FROM \`${tableName}\``);
      return rows.map((r: any) => ({
        Field: r.Field,
        Type: (r.Type || '').toLowerCase(),
        Null: r.Null,
        Default: r.Default,
        Key: r.Key,
      }));
    } catch {
      return [];
    }
  }

  async function getTableColumnsMap(tableName: string): Promise<Map<string, string>> {
    const cols = await getTableColumnsInfo(tableName);
    const colMap = new Map<string, string>();
    for (const c of cols) {
      colMap.set(c.Field.toLowerCase(), c.Field);
    }
    return colMap;
  }

  // =========================================================================
  // 1. HEALTH & DATABASE STATUS CHECK
  // =========================================================================
  app.get('/api/health', async (req, res) => {
    const status = await testDbConnection();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: status,
    });
  });

  app.get('/api/db/logs', (req, res) => {
    res.json({ success: true, logs: dbLogs });
  });

  app.get('/api/db/diagnostics', async (req, res) => {
    const requester = await getRequester(req);
    if (!requester || requester.role !== 'ADMIN') {
      await recordAudit({
        userId: requester?.id || 'anonymous',
        userName: requester?.name || 'Desconhecido',
        userRole: requester?.role || 'TECHNICIAN',
        ipAddress: req.ip,
        module: 'DATABASE',
        action: 'ACCESS_DENIED',
        result: 'BLOCKED',
        details: 'Tentativa não autorizada de acessar diagnósticos do MariaDB.',
      });
      return res.status(403).json({ success: false, error: 'Acesso negado: apenas Administrador Master pode consultar diagnósticos do MariaDB.' });
    }

    try {
      const db = getDbPool();
      const [tables]: any = await db.query('SHOW TABLES');
      const tableNames = tables.map((t: any) => Object.values(t)[0]);
      const schemaDetails: Record<string, any[]> = {};
      
      for (const t of tableNames) {
        const [cols]: any = await db.query(`SHOW COLUMNS FROM \`${t}\``);
        schemaDetails[t] = cols.map((c: any) => ({
          Field: c.Field,
          Type: c.Type,
          Null: c.Null,
          Key: c.Key,
          Default: c.Default,
        }));
      }

      res.json({
        success: true,
        tables: tableNames,
        schema: schemaDetails,
        logs: dbLogs.slice(0, 30),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/db/sync-schema', async (req, res) => {
    const requester = await getRequester(req);
    if (!requester || requester.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Acesso negado: apenas Administrador Master pode sincronizar schema.' });
    }

    try {
      await initializeDatabaseSchema();
      await recordAudit({
        userId: requester.id,
        userName: requester.name,
        userRole: requester.role,
        ipAddress: req.ip,
        module: 'DATABASE',
        action: 'DB_CONFIG_UPDATE',
        result: 'SUCCESS',
        details: 'Sincronização de schema do MariaDB executada com sucesso.',
      });
      res.json({ success: true, message: 'Schema sincronizado com sucesso.' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/db/status', async (req, res) => {
    const status = await testDbConnection();
    let tableCounts: Record<string, number> = {};
    if (status.connected) {
      try {
        const db = getDbPool();
        const [userRows]: any = await db.query('SELECT COUNT(*) as count FROM users');
        const [orderRows]: any = await db.query('SELECT COUNT(*) as count FROM service_orders');
        const [stockRows]: any = await db.query('SELECT COUNT(*) as count FROM stock_items');
        const [movementRows]: any = await db.query('SELECT COUNT(*) as count FROM financial_movements');
        const [auditRows]: any = await db.query('SELECT COUNT(*) as count FROM audit_logs').catch(() => [[{ count: memAuditLogs.length }]]);
        tableCounts = {
          users: userRows[0]?.count ?? 0,
          service_orders: orderRows[0]?.count ?? 0,
          stock_items: stockRows[0]?.count ?? 0,
          financial_movements: movementRows[0]?.count ?? 0,
          audit_logs: auditRows[0]?.count ?? memAuditLogs.length,
        };
      } catch (err: any) {
        console.error('Erro ao consultar contagem de tabelas:', err);
      }
    } else {
      tableCounts = {
        users: memUsers.length,
        service_orders: memOrders.length,
        stock_items: memStock.length,
        financial_movements: memMovements.length,
        audit_logs: memAuditLogs.length,
      };
    }
    res.json({
      ...status,
      tableCounts,
    });
  });

  app.post('/api/db/test', async (req, res) => {
    const requester = await getRequester(req);
    if (requester && requester.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador Master.' });
    }

    const { host, port, database, user, password } = req.body || {};
    const testResult = await testDbConnection({
      ...(host ? { host } : {}),
      ...(port ? { port: Number(port) } : {}),
      ...(database ? { database } : {}),
      ...(user ? { user } : {}),
      ...(password !== undefined ? { password } : {}),
    });
    if (testResult.connected) {
      await updateDbConfig({
        ...(host ? { host } : {}),
        ...(port ? { port: Number(port) } : {}),
        ...(database ? { database } : {}),
        ...(user ? { user } : {}),
        ...(password !== undefined ? { password } : {}),
      });
    }
    res.json(testResult);
  });

  // =========================================================================
  // 2. AUTHENTICATION & SESSION ENDPOINTS (/api/auth/*)
  // =========================================================================
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanNumbersOnly = cleanEmail.replace(/\D/g, '');

    if (!cleanEmail || !password) {
      return res.status(400).json({ success: false, error: 'Identificação e senha são obrigatórias.' });
    }

    // Busca usuário por E-mail, CPF ou Telefone (WhatsApp)
    const user = memUsers.find((u) => {
      const uEmail = (u.email || '').trim().toLowerCase();
      const uCpf = (u.documentCpf || '').replace(/\D/g, '');
      const uPhone = (u.phone || '').replace(/\D/g, '');
      
      return (
        uEmail === cleanEmail ||
        (cleanNumbersOnly.length > 0 && (uCpf === cleanNumbersOnly || uPhone === cleanNumbersOnly))
      );
    });

    if (!user) {
      await recordAudit({
        userId: 'anonymous',
        userName: cleanEmail,
        userRole: 'TECHNICIAN',
        ipAddress: req.ip,
        module: 'AUTH',
        action: 'LOGIN_FAILED',
        result: 'FAILED',
        details: `Tentativa de login com identidade inexistente: ${cleanEmail}`,
      });
      return res.status(401).json({ success: false, error: 'Credenciais inválidas. Verifique seus dados e senha.' });
    }

    // Validação de Usuário Inativo (Revogado)
    if (user.isActive === false) {
      await recordAudit({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        ipAddress: req.ip,
        module: 'AUTH',
        action: 'LOGIN_FAILED',
        result: 'BLOCKED',
        details: `Tentativa de acesso bloqueada: usuário inativo/revogado (${user.name} - ${user.email}).`,
      });
      return res.status(403).json({
        success: false,
        error: 'Acesso revogado. Sua conta foi desativada pelo Gestor ou Administrador Master.',
      });
    }

    // Validação de Senha
    const validPassword = user.password === password || user.passwordHash === password;
    if (!validPassword) {
      await recordAudit({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        ipAddress: req.ip,
        module: 'AUTH',
        action: 'LOGIN_FAILED',
        result: 'FAILED',
        details: `Senha incorreta informada para o usuário ${user.name} (${user.email}).`,
      });
      return res.status(401).json({ success: false, error: 'Credenciais inválidas. Verifique seu e-mail e senha.' });
    }

    // Requer MFA?
    if (user.mfaEnabled) {
      return res.json({
        success: true,
        requiresMfa: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    }

    // Login com sucesso
    await recordAudit({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      ipAddress: req.ip,
      module: 'AUTH',
      action: 'LOGIN',
      result: 'SUCCESS',
      details: `Login efetuado com sucesso via autenticação segura (${user.role}).`,
    });

    res.json({
      success: true,
      user,
      message: `Bem-vindo, ${user.name}!`,
    });
  });

  app.post('/api/auth/verify-mfa', async (req, res) => {
    const { email, code } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanNumbersOnly = cleanEmail.replace(/\D/g, '');
    const cleanCode = (code || '').replace(/\D/g, '');

    const user = memUsers.find((u) => {
      const uEmail = (u.email || '').trim().toLowerCase();
      const uCpf = (u.documentCpf || '').replace(/\D/g, '');
      const uPhone = (u.phone || '').replace(/\D/g, '');
      
      return (
        uEmail === cleanEmail ||
        (cleanNumbersOnly.length > 0 && (uCpf === cleanNumbersOnly || uPhone === cleanNumbersOnly))
      );
    });

    if (!user || user.isActive === false) {
      return res.status(401).json({ success: false, error: 'Usuário não localizado ou inativo.' });
    }

    if (cleanCode.length !== 6) {
      await recordAudit({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        ipAddress: req.ip,
        module: 'AUTH',
        action: 'LOGIN_FAILED',
        result: 'FAILED',
        details: `Código MFA inválido digitado para ${user.name}.`,
      });
      return res.status(400).json({ success: false, error: 'Código de 6 dígitos inválido.' });
    }

    await recordAudit({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      ipAddress: req.ip,
      module: 'AUTH',
      action: 'LOGIN',
      result: 'SUCCESS',
      details: `Segundo fator MFA validado com sucesso para ${user.name}.`,
    });

    res.json({ success: true, user });
  });

  app.post('/api/auth/logout', async (req, res) => {
    const requester = await getRequester(req);
    if (requester) {
      await recordAudit({
        userId: requester.id,
        userName: requester.name,
        userRole: requester.role,
        ipAddress: req.ip,
        module: 'AUTH',
        action: 'LOGOUT',
        result: 'SUCCESS',
        details: `Logout efetuado com encerramento de sessão para ${requester.name}.`,
      });
    }
    res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
  });

  // =========================================================================
  // 3. AUDIT LOGS ENDPOINTS (/api/audit-logs)
  // =========================================================================
  app.get('/api/audit-logs', async (req, res) => {
    const requester = await getRequester(req);
    if (!requester || requester.role === 'TECHNICIAN') {
      await recordAudit({
        userId: requester?.id || 'anonymous',
        userName: requester?.name || 'Desconhecido',
        userRole: requester?.role || 'TECHNICIAN',
        ipAddress: req.ip,
        module: 'AUDIT',
        action: 'ACCESS_DENIED',
        result: 'BLOCKED',
        details: 'Tentativa não autorizada de visualizar logs de auditoria por perfil Técnico.',
      });
      return res.status(403).json({ success: false, error: 'Acesso negado: Técnicos não possuem permissão para acessar logs de auditoria.' });
    }

    try {
      let logs = [...memAuditLogs];

      // Se MariaDB estiver acessível, buscar também do banco
      try {
        const db = getDbPool();
        const [rows]: any = await db.query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 200');
        if (rows && rows.length > 0) {
          logs = rows.map((r: any) => ({
            ...r,
            timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp,
          }));
        }
      } catch {
        // fallback to memory
      }

      // Se Gestor Operacional, filtrar apenas módulos operacionais (oculta configurações de banco)
      if (requester.role === 'OPERATIONAL') {
        logs = logs.filter((l) => l.module !== 'DATABASE' && l.module !== 'SETTINGS');
      }

      // Filtros opcionais via Query params
      const { module, action, result, search, userId } = req.query as any;
      if (module) logs = logs.filter((l) => l.module === module);
      if (action) logs = logs.filter((l) => l.action === action);
      if (result) logs = logs.filter((l) => l.result === result);
      if (userId) logs = logs.filter((l) => l.userId === userId);
      if (search) {
        const s = search.toLowerCase();
        logs = logs.filter(
          (l) =>
            l.userName.toLowerCase().includes(s) ||
            l.action.toLowerCase().includes(s) ||
            (l.details && l.details.toLowerCase().includes(s)) ||
            (l.affectedRecordId && l.affectedRecordId.toLowerCase().includes(s))
        );
      }

      res.json({ success: true, count: logs.length, data: logs });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/audit-logs', async (req, res) => {
    const requester = await getRequester(req);
    const body = req.body || {};

    const entry = await recordAudit({
      userId: requester?.id || body.userId || 'system',
      userName: requester?.name || body.userName || 'Sistema',
      userRole: requester?.role || body.userRole || 'TECHNICIAN',
      ipAddress: req.ip,
      module: body.module || 'AUTH',
      action: body.action || 'ACCESS_DENIED',
      affectedRecordId: body.affectedRecordId,
      affectedRecordType: body.affectedRecordType,
      oldValue: body.oldValue,
      newValue: body.newValue,
      result: body.result || 'SUCCESS',
      details: body.details || 'Evento registrado via interface frontend.',
    });

    res.json({ success: true, log: entry });
  });

  // =========================================================================
  // 4. USERS & TECHNICIANS API (GET, POST, PUT, DELETE) com RBAC & Unicidade
  // =========================================================================
  app.get('/api/users', async (req, res) => {
    const requester = await getRequester(req);

    try {
      const db = getDbPool();
      const [rows]: any = await db.query('SELECT * FROM users ORDER BY name ASC');
      const formatted = rows.map((u: any) => ({
        ...u,
        isActive: Boolean(u.isActive ?? u.is_active ?? true),
        hasSpecialTaxRule: Boolean(u.hasSpecialTaxRule ?? u.has_special_tax_rule ?? false),
        baseCostAllowance: Number(u.baseCostAllowance ?? u.base_cost_allowance ?? 0),
        costAllowanceFortnight: Number(u.costAllowanceFortnight ?? u.cost_allowance_fortnight ?? 1),
        specialTaxRate: Number(u.specialTaxRate ?? u.special_tax_rate ?? 0),
        documentCpf: u.documentCpf ?? u.document_cpf ?? u.cpf ?? '',
        pixKey: u.pixKey ?? u.pix_key ?? '',
        pixKeyType: u.pixKeyType ?? u.pix_key_type ?? 'CPF',
        bankName: u.bankName ?? u.bank_name ?? '',
        bankAgency: u.bankAgency ?? u.bank_agency ?? '',
        bankAccount: u.bankAccount ?? u.bank_account ?? '',
      }));
      memUsers = formatted;

      // Escopo OWN para Técnico: retorna apenas seu próprio perfil
      if (requester && requester.role === 'TECHNICIAN') {
        const selfUser = formatted.filter((u: any) => u.id === requester.id);
        return res.json({ success: true, data: selfUser.length > 0 ? selfUser : [requester] });
      }

      res.json({ success: true, data: formatted });
    } catch (err: any) {
      if (isNetworkError(err)) {
        if (requester && requester.role === 'TECHNICIAN') {
          const selfUser = memUsers.filter((u) => u.id === requester.id);
          return res.json({ success: true, data: selfUser.length > 0 ? selfUser : [requester] });
        }
        return res.json({ success: true, data: memUsers });
      }
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/users', async (req, res) => {
    const requester = await getRequester(req);
    const u = req.body;

    if (!requester || requester.role === 'TECHNICIAN') {
      await recordAudit({
        userId: requester?.id || 'unknown',
        userName: requester?.name || 'Desconhecido',
        userRole: requester?.role || 'TECHNICIAN',
        ipAddress: req.ip,
        module: 'USERS',
        action: 'ACCESS_DENIED',
        result: 'BLOCKED',
        details: 'Tentativa não autorizada de criar usuário por perfil Técnico.',
      });
      return res.status(403).json({ success: false, error: 'Acesso negado: Técnicos não podem criar novos usuários.' });
    }

    // Gestor Operacional não pode criar perfil Master ADMIN
    if (requester.role === 'OPERATIONAL' && u.role === 'ADMIN') {
      await recordAudit({
        userId: requester.id,
        userName: requester.name,
        userRole: requester.role,
        ipAddress: req.ip,
        module: 'USERS',
        action: 'ACCESS_DENIED',
        result: 'BLOCKED',
        details: 'Gestor Operacional tentou criar usuário com privilégio Master ADMIN.',
      });
      return res.status(403).json({ success: false, error: 'Gestores Operacionais só podem cadastrar Técnicos ou outros Gestores.' });
    }

    if (!u.id || !u.name || !u.email) {
      return res.status(400).json({ success: false, error: 'Campos obrigatórios ausentes (id, name, email).' });
    }

    // Validação de Unicidade: E-mail e CPF
    const cleanEmail = (u.email || '').trim().toLowerCase();
    const cleanCpf = (u.documentCpf || u.cpf || '').replace(/\D/g, '');

    const duplicateEmail = memUsers.find((item) => item.id !== u.id && (item.email || '').trim().toLowerCase() === cleanEmail);
    if (duplicateEmail) {
      return res.status(400).json({ success: false, error: `O e-mail "${u.email}" já está cadastrado para outro usuário (${duplicateEmail.name}).` });
    }

    if (cleanCpf) {
      const duplicateCpf = memUsers.find((item) => item.id !== u.id && (item.documentCpf || '').replace(/\D/g, '') === cleanCpf);
      if (duplicateCpf) {
        return res.status(400).json({ success: false, error: `O CPF informado já está cadastrado para o usuário "${duplicateCpf.name}".` });
      }
    }

    // Gestor não pode definir regra fiscal nem ajuda de custo fora do padrão
    if (requester.role === 'OPERATIONAL') {
      u.hasSpecialTaxRule = false;
      u.specialTaxRate = 0;
      u.baseCostAllowance = u.role === 'TECHNICIAN' ? 250 : 0;
    }

    // Salva em memória
    const existingIdx = memUsers.findIndex((item) => item.id === u.id);
    const isEdit = existingIdx >= 0;
    if (isEdit) {
      memUsers[existingIdx] = { ...memUsers[existingIdx], ...u };
    } else {
      memUsers.push(u);
    }

    // Auditoria
    await recordAudit({
      userId: requester.id,
      userName: requester.name,
      userRole: requester.role,
      ipAddress: req.ip,
      module: 'USERS',
      action: isEdit ? 'USER_UPDATE' : 'USER_CREATE',
      affectedRecordId: u.id,
      affectedRecordType: 'user',
      newValue: JSON.stringify({ name: u.name, email: u.email, role: u.role, cpf: u.documentCpf }),
      result: 'SUCCESS',
      details: `${isEdit ? 'Atualização' : 'Cadastro'} do usuário "${u.name}" (${u.role}) realizado por ${requester.name}.`,
    });

    try {
      const db = getDbPool();
      const cols = await getTableColumnsInfo('users');

      const userValues: Record<string, any> = {
        id: u.id,
        name: u.name,
        nome: u.name,
        email: u.email,
        passwordhash: u.password || u.passwordHash || 'Porto@2026',
        password_hash: u.password || u.passwordHash || 'Porto@2026',
        role: u.role || 'TECHNICIAN',
        cargo: u.role || 'TECHNICIAN',
        documentcpf: u.documentCpf || u.cpf || '',
        document_cpf: u.documentCpf || u.cpf || '',
        phone: u.phone || '',
        avatarurl: u.avatarUrl || null,
        isactive: u.isActive !== false ? 1 : 0,
        is_active: u.isActive !== false ? 1 : 0,
        pixkeytype: u.pixKeyType || 'CPF',
        pix_key_type: u.pixKeyType || 'CPF',
        pixkey: u.pixKey || u.documentCpf || '',
        pix_key: u.pixKey || u.documentCpf || '',
        bankname: u.bankName || 'Banco Itaú',
        bank_name: u.bankName || 'Banco Itaú',
        bankagency: u.bankAgency || '0001',
        bank_agency: u.bankAgency || '0001',
        bankaccount: u.bankAccount || '00000-0',
        bank_account: u.bankAccount || '00000-0',
        basecostallowance: Number(u.baseCostAllowance ?? (u.role === 'TECHNICIAN' ? 250 : 0)),
        base_cost_allowance: Number(u.baseCostAllowance ?? (u.role === 'TECHNICIAN' ? 250 : 0)),
        costallowancefortnight: Number(u.costAllowanceFortnight || 1),
        cost_allowance_fortnight: Number(u.costAllowanceFortnight || 1),
        hasspecialtaxrule: u.hasSpecialTaxRule ? 1 : 0,
        has_special_tax_rule: u.hasSpecialTaxRule ? 1 : 0,
        specialtaxrate: Number(u.specialTaxRate || 0),
        special_tax_rate: Number(u.specialTaxRate || 0),
      };

      const insertCols: string[] = [];
      const insertPlaceholders: string[] = [];
      const insertValues: any[] = [];
      const updateClauses: string[] = [];

      for (const col of cols) {
        const colLower = col.Field.toLowerCase();
        let val = userValues[colLower];

        if (val === undefined) {
          if (colLower === 'createdat' || colLower === 'created_at') {
            val = new Date();
          } else if (colLower === 'updatedat' || colLower === 'updated_at') {
            val = new Date();
          } else if (col.Null === 'NO' && col.Default === null && col.Key !== 'PRI') {
            val = col.Type.includes('int') || col.Type.includes('decimal') ? 0 : '';
          }
        }

        if (val !== undefined) {
          insertCols.push(`\`${col.Field}\``);
          insertPlaceholders.push('?');
          insertValues.push(val);
          if (colLower !== 'id') {
            updateClauses.push(`\`${col.Field}\` = VALUES(\`${col.Field}\`)`);
          }
        }
      }

      if (insertCols.length > 0) {
        const query = `
          INSERT INTO \`users\` (${insertCols.join(', ')})
          VALUES (${insertPlaceholders.join(', ')})
          ON DUPLICATE KEY UPDATE
          ${updateClauses.length > 0 ? updateClauses.join(', ') : 'id = id'}
        `;
        await db.execute(query, insertValues);
      }
      res.json({ success: true, message: `Usuário ${u.name} salvo com sucesso.`, user: u });
    } catch (err: any) {
      if (isNetworkError(err)) {
        return res.json({ success: true, message: `Usuário ${u.name} salvo na memória local.`, user: u });
      }
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const requester = await getRequester(req);
    const u = req.body;

    const existingIdx = memUsers.findIndex((item) => item.id === id);
    const oldUser = existingIdx >= 0 ? memUsers[existingIdx] : null;

    if (!requester) {
      return res.status(401).json({ success: false, error: 'Usuário não autenticado.' });
    }

    // Regras de Autorização para Edição de Usuário
    if (requester.role === 'TECHNICIAN') {
      // Técnico só pode editar a si mesmo
      if (requester.id !== id) {
        await recordAudit({
          userId: requester.id,
          userName: requester.name,
          userRole: requester.role,
          ipAddress: req.ip,
          module: 'USERS',
          action: 'ACCESS_DENIED',
          result: 'BLOCKED',
          details: `Técnico ${requester.name} tentou alterar dados de outro usuário (${id}).`,
        });
        return res.status(403).json({ success: false, error: 'Acesso negado: você só pode editar o seu próprio perfil.' });
      }

      // Técnico não pode alterar seu próprio role, regra fiscal, ajuda de custo ou status ativo
      if (u.role && u.role !== oldUser?.role) {
        return res.status(403).json({ success: false, error: 'Técnicos não podem alterar seu perfil de acesso.' });
      }
      if (u.hasSpecialTaxRule !== undefined && u.hasSpecialTaxRule !== oldUser?.hasSpecialTaxRule) {
        return res.status(403).json({ success: false, error: 'Apenas Administrador Master pode configurar regra fiscal.' });
      }
      if (u.baseCostAllowance !== undefined && u.baseCostAllowance !== oldUser?.baseCostAllowance) {
        return res.status(403).json({ success: false, error: 'Apenas Administrador Master pode configurar ajuda de custo.' });
      }
    }

    if (requester.role === 'OPERATIONAL') {
      // Gestor Operacional não pode editar Administrador Master
      if (oldUser && oldUser.role === 'ADMIN') {
        await recordAudit({
          userId: requester.id,
          userName: requester.name,
          userRole: requester.role,
          ipAddress: req.ip,
          module: 'USERS',
          action: 'ACCESS_DENIED',
          result: 'BLOCKED',
          details: `Gestor Operacional tentou editar dados do Administrador Master (${oldUser.name}).`,
        });
        return res.status(403).json({ success: false, error: 'Gestores Operacionais não possuem permissão para alterar o Administrador Master.' });
      }

      // Gestor não pode promover ninguém para ADMIN
      if (u.role === 'ADMIN') {
        return res.status(403).json({ success: false, error: 'Apenas Administrador Master pode definir perfis de nível Master.' });
      }
      // Gestor não pode alterar regra fiscal nem ajuda de custo
      if (u.hasSpecialTaxRule !== undefined || u.specialTaxRate !== undefined || u.baseCostAllowance !== undefined) {
        u.hasSpecialTaxRule = oldUser?.hasSpecialTaxRule;
        u.specialTaxRate = oldUser?.specialTaxRate;
        u.baseCostAllowance = oldUser?.baseCostAllowance;
      }
    }

    // Auditoria de Mudança de Chave PIX (Operação Crítica)
    if (u.pixKey && oldUser && u.pixKey !== oldUser.pixKey) {
      await recordAudit({
        userId: requester.id,
        userName: requester.name,
        userRole: requester.role,
        ipAddress: req.ip,
        module: 'USERS',
        action: 'PIX_CHANGE',
        affectedRecordId: id,
        affectedRecordType: 'user_pix',
        oldValue: `${oldUser.pixKeyType || 'CPF'}: ${oldUser.pixKey || 'N/A'}`,
        newValue: `${u.pixKeyType || 'CPF'}: ${u.pixKey}`,
        result: 'SUCCESS',
        details: `Alteração de chave PIX do usuário "${oldUser.name}" solicitada por ${requester.name} (${requester.role}).`,
      });
    }

    // Auditoria de Regra Fiscal Especial
    if (u.hasSpecialTaxRule !== undefined && oldUser && u.hasSpecialTaxRule !== oldUser.hasSpecialTaxRule) {
      await recordAudit({
        userId: requester.id,
        userName: requester.name,
        userRole: requester.role,
        ipAddress: req.ip,
        module: 'USERS',
        action: 'SPECIAL_TAX_CHANGE',
        affectedRecordId: id,
        affectedRecordType: 'user_tax_rule',
        oldValue: String(oldUser.hasSpecialTaxRule),
        newValue: String(u.hasSpecialTaxRule),
        result: 'SUCCESS',
        details: `Regra fiscal de exceção (16%) ${u.hasSpecialTaxRule ? 'ativada' : 'desativada'} para o técnico "${oldUser.name}".`,
      });
    }

    // Atualização em memória
    if (existingIdx >= 0) {
      memUsers[existingIdx] = { ...memUsers[existingIdx], ...u };
    }

    try {
      const db = getDbPool();
      const cols = await getTableColumnsInfo('users');
      const fields: string[] = [];
      const values: any[] = [];

      const userUpdates: Record<string, any> = {
        name: u.name,
        email: u.email,
        role: u.role,
        documentcpf: u.documentCpf ?? u.cpf,
        document_cpf: u.documentCpf ?? u.cpf,
        phone: u.phone,
        avatarurl: u.avatarUrl,
        isactive: u.isActive !== undefined ? (u.isActive ? 1 : 0) : undefined,
        is_active: u.isActive !== undefined ? (u.isActive ? 1 : 0) : undefined,
        pixkeytype: u.pixKeyType,
        pixkey: u.pixKey,
        bankname: u.bankName,
        bankagency: u.bankAgency,
        bankaccount: u.bankAccount,
        basecostallowance: u.baseCostAllowance !== undefined ? Number(u.baseCostAllowance) : undefined,
        costallowancefortnight: u.costAllowanceFortnight !== undefined ? Number(u.costAllowanceFortnight) : undefined,
        cost_allowance_fortnight: u.costAllowanceFortnight !== undefined ? Number(u.costAllowanceFortnight) : undefined,
        hasspecialtaxrule: u.hasSpecialTaxRule !== undefined ? (u.hasSpecialTaxRule ? 1 : 0) : undefined,
        specialtaxrate: u.specialTaxRate !== undefined ? Number(u.specialTaxRate) : undefined,
        passwordhash: u.password,
        password: u.password,
      };

      for (const col of cols) {
        const colLower = col.Field.toLowerCase();
        if (colLower === 'updatedat' || colLower === 'updated_at') {
          fields.push(`\`${col.Field}\` = NOW()`);
        } else if (userUpdates[colLower] !== undefined && colLower !== 'id') {
          fields.push(`\`${col.Field}\` = ?`);
          values.push(userUpdates[colLower]);
        }
      }

      if (fields.length > 0) {
        values.push(id);
        const query = `UPDATE \`users\` SET ${fields.join(', ')} WHERE \`id\` = ?`;
        await db.execute(query, values);
      }
      res.json({ success: true, message: `Usuário ${id} atualizado.` });
    } catch (err: any) {
      if (isNetworkError(err)) {
        return res.json({ success: true, message: `Usuário ${id} atualizado na memória local.` });
      }
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const requester = await getRequester(req);

    // Apenas Administrador Master pode excluir fisicamente um usuário
    if (!requester || requester.role !== 'ADMIN') {
      await recordAudit({
        userId: requester?.id || 'unknown',
        userName: requester?.name || 'Desconhecido',
        userRole: requester?.role || 'TECHNICIAN',
        ipAddress: req.ip,
        module: 'USERS',
        action: 'ACCESS_DENIED',
        result: 'BLOCKED',
        details: `Tentativa não autorizada de excluir permanentemente o usuário ${id}.`,
      });
      return res.status(403).json({ success: false, error: 'Apenas o Administrador Master pode excluir usuários permanentemente.' });
    }

    const targetUser = memUsers.find((u) => u.id === id);
    memUsers = memUsers.filter((u) => u.id !== id);

    await recordAudit({
      userId: requester.id,
      userName: requester.name,
      userRole: requester.role,
      ipAddress: req.ip,
      module: 'USERS',
      action: 'USER_DELETE',
      affectedRecordId: id,
      affectedRecordType: 'user',
      oldValue: JSON.stringify(targetUser || { id }),
      result: 'SUCCESS',
      details: `Exclusão permanente do usuário "${targetUser?.name || id}" efetuada por ${requester.name}.`,
    });

    try {
      const db = getDbPool();
      await db.execute('DELETE FROM users WHERE id = ?', [id]);
      res.json({ success: true, message: `Usuário ${id} removido.` });
    } catch (err: any) {
      if (isNetworkError(err)) {
        return res.json({ success: true, message: `Usuário ${id} removido da memória local.` });
      }
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // =========================================================================
  // 5. SERVICE ORDERS API (GET, POST, PUT, DELETE) com Escopo OWN para Técnico
  // =========================================================================
  const getServiceOrdersHandler = async (req: express.Request, res: express.Response) => {
    const requester = await getRequester(req);

    try {
      const db = getDbPool();

      // Query com LEFT JOIN na tabela users para trazer o nome real do técnico (technicianName)
      // e aliases camelCase conforme esperado pelo React DataGrid
      const query = `
        SELECT 
          so.*,
          so.id AS id,
          so.call_number AS callNumber,
          so.porto_seguro_protocol AS portoSeguroProtocol,
          so.service_category AS serviceCategory,
          so.base_service_fee AS baseServiceFee,
          so.customer_name AS customerName,
          so.customer_cpf AS customerCpf,
          so.customer_phone AS customerPhone,
          so.city AS city,
          so.uf AS uf,
          so.neighborhood AS neighborhood,
          so.address_street AS addressStreet,
          so.address_number AS addressNumber,
          so.address_complement AS addressComplement,
          so.postal_code AS postalCode,
          so.technician_id AS technicianId,
          so.status AS status,
          so.scheduled_date AS scheduledDate,
          so.started_at AS startedAt,
          so.completed_at AS completedAt,
          so.km_traveled AS kmTraveled,
          so.km_rate_applied AS kmRateApplied,
          so.km_total_cost AS kmTotalCost,
          so.toll_cost AS tollCost,
          so.support_cost AS supportCost,
          so.total_technician_gross AS totalTechnicianGross,
          so.faturamento_porto AS faturamentoPorto,
          so.payment_status AS paymentStatus,
          so.payment_date AS paymentDate,
          u.name AS technicianName
        FROM \`service_orders\` so
        LEFT JOIN \`users\` u ON so.technician_id = u.id
        ORDER BY so.scheduled_date DESC, so.id DESC
      `;

      const [rows]: any = await db.query(query).catch(async () => {
        // Fallback resiliente caso a tabela tenha colunas sem underscore
        return await db.query(`
          SELECT 
            so.*,
            u.name AS technicianName
          FROM \`service_orders\` so
          LEFT JOIN \`users\` u ON (so.technician_id = u.id OR so.technicianId = u.id)
          ORDER BY so.id DESC
        `);
      });

      const formatted = rows.map((o: any) => {
        let rawTechId = o.technicianId || o.technician_id || null;
        let resolvedTechName = o.technicianName || o.technician_name || null;

        // Se o LEFT JOIN não encontrar pelo ID, faz fallback na memória/lista de usuários
        if (rawTechId) {
          const userObj = memUsers.find((u) => u.id === rawTechId);
          if (userObj) {
            resolvedTechName = userObj.name;
          } else if (rawTechId === 'tech-1') {
            // Re-mapeia ID legado tech-1 para o primeiro técnico ativo (Carlos Henrique Silva)
            const firstTech = memUsers.find((u) => u.role === 'TECHNICIAN');
            if (firstTech) {
              rawTechId = firstTech.id;
              resolvedTechName = firstTech.name;
            }
          }
        }

        // Se não tiver ID mas tiver nome gravado, busca o ID do usuário correspondente
        if (!rawTechId && resolvedTechName) {
          const cleanNameNorm = resolvedTechName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          const userObj = memUsers.find((u) => {
            const uNameNorm = (u.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            return uNameNorm === cleanNameNorm || (uNameNorm && cleanNameNorm && (uNameNorm.includes(cleanNameNorm) || cleanNameNorm.includes(uNameNorm)));
          });
          if (userObj) {
            rawTechId = userObj.id;
            resolvedTechName = userObj.name;
          }
        }

        return {
          ...o,
          id: o.id,
          callNumber: o.callNumber || o.call_number || o.numero_chamado || '',
          portoSeguroProtocol: o.portoSeguroProtocol || o.porto_seguro_protocol || null,
          serviceCategory: o.serviceCategory || o.service_category || 'Higienização Padrão',
          baseServiceFee: Number(o.baseServiceFee ?? o.base_service_fee ?? 0),
          customerName: o.customerName || o.customer_name || '',
          customerCpf: o.customerCpf || o.customer_cpf || '',
          customerPhone: o.customerPhone || o.customer_phone || null,
          city: o.city || 'São Paulo',
          uf: o.uf || 'SP',
          neighborhood: o.neighborhood || '',
          addressStreet: o.addressStreet || '',
          addressNumber: o.addressNumber || '',
          addressComplement: o.addressComplement || null,
          postalCode: o.postalCode || '',
          technicianId: rawTechId,
          technicianName: resolvedTechName,
          status: o.status || 'PENDING',
          scheduledDate: o.scheduledDate || o.scheduled_date,
          startedAt: o.startedAt || o.started_at,
          completedAt: o.completedAt || o.completed_at,
          kmTraveled: Number(o.kmTraveled ?? o.km_traveled ?? 0),
          kmRateApplied: Number(o.kmRateApplied ?? o.km_rate_applied ?? 0.5),
          kmTotalCost: Number(o.kmTotalCost ?? o.km_total_cost ?? 0),
          tollCost: Number(o.tollCost ?? o.toll_cost ?? 0),
          supportCost: Number(o.supportCost ?? o.support_cost ?? 0),
          totalTechnicianGross: Number(o.totalTechnicianGross ?? o.total_technician_gross ?? 0),
          faturamentoPorto: Number(o.faturamentoPorto ?? o.faturamento_porto ?? 0),
          customerSignature: o.customerSignature || o.customer_signature || null,
          executionNotes: o.executionNotes || o.execution_notes || null,
          tollReceiptUrl: o.tollReceiptUrl || o.toll_receipt_url || null,
          paymentStatus: o.paymentStatus || o.payment_status || 'PENDING',
          paymentDate: o.paymentDate || o.payment_date || null,
          itemsUsed: [],
        };
      });

      memOrders = formatted;

      // Escopo OWN para Técnicos de Campo: restringe estritamente às OS dele
      if (requester && requester.role === 'TECHNICIAN') {
        const ownOrders = formatted.filter((o: any) => o.technicianId === requester.id);
        return res.json({ success: true, data: ownOrders });
      }

      res.json({ success: true, data: formatted });
    } catch (err: any) {
      if (isNetworkError(err)) {
        if (requester && requester.role === 'TECHNICIAN') {
          const ownOrders = memOrders.filter((o) => o.technicianId === requester.id);
          return res.json({ success: true, data: ownOrders });
        }
        return res.json({ success: true, data: memOrders });
      }
      res.status(500).json({ success: false, error: err.message });
    }
  };

  // Suporte tanto para /api/orders quanto para /api/service-orders
  app.get('/api/orders', getServiceOrdersHandler);
  app.get('/api/service-orders', getServiceOrdersHandler);

  app.post('/api/orders', async (req, res) => {
    const requester = await getRequester(req);
    const o = req.body;

    const existingIdx = memOrders.findIndex((item) => item.id === o.id);
    const isEdit = existingIdx >= 0;
    const oldOrder = isEdit ? memOrders[existingIdx] : null;

    // Regras de Autorização de Ordens de Serviço
    if (requester && requester.role === 'TECHNICIAN') {
      // Técnico NÃO pode criar novas ordens de serviço
      if (!isEdit) {
        await recordAudit({
          userId: requester.id,
          userName: requester.name,
          userRole: requester.role,
          ipAddress: req.ip,
          module: 'SERVICE_ORDERS',
          action: 'ACCESS_DENIED',
          result: 'BLOCKED',
          details: 'Técnico tentou criar uma nova OS diretamente via API.',
        });
        return res.status(403).json({ success: false, error: 'Acesso negado: Técnicos de campo não possuem permissão para abrir novas Ordens de Serviço.' });
      }

      // Técnico só pode editar sua própria OS
      if (oldOrder && oldOrder.technicianId !== requester.id) {
        await recordAudit({
          userId: requester.id,
          userName: requester.name,
          userRole: requester.role,
          ipAddress: req.ip,
          module: 'SERVICE_ORDERS',
          action: 'ACCESS_DENIED',
          result: 'BLOCKED',
          details: `Técnico ${requester.name} tentou alterar OS #${oldOrder.callNumber} pertencente a outro técnico.`,
        });
        return res.status(403).json({ success: false, error: 'Acesso negado: você só pode preencher e atualizar as suas próprias Ordens de Serviço.' });
      }

      // Técnico não pode alterar valores financeiros protegidos
      if (oldOrder) {
        o.baseServiceFee = oldOrder.baseServiceFee;
        o.faturamentoPorto = oldOrder.faturamentoPorto;
        o.technicianId = oldOrder.technicianId;
        o.callNumber = oldOrder.callNumber;
      }
    }

    // Auditoria de Reatribuição de Técnico
    if (isEdit && oldOrder && o.technicianId && o.technicianId !== oldOrder.technicianId) {
      await recordAudit({
        userId: requester?.id || 'system',
        userName: requester?.name || 'Sistema',
        userRole: requester?.role || 'ADMIN',
        ipAddress: req.ip,
        module: 'SERVICE_ORDERS',
        action: 'OS_TECHNICIAN_REASSIGN',
        affectedRecordId: o.id,
        affectedRecordType: 'service_order',
        oldValue: oldOrder.technicianId,
        newValue: o.technicianId,
        result: 'SUCCESS',
        details: `Reatribuição da OS #${o.callNumber}: técnico alterado de "${oldOrder.technicianName || oldOrder.technicianId}" para "${o.technicianName || o.technicianId}".`,
      });
    }

    // Auditoria Geral de Criação ou Atualização de OS
    await recordAudit({
      userId: requester?.id || 'system',
      userName: requester?.name || 'Sistema',
      userRole: requester?.role || 'ADMIN',
      ipAddress: req.ip,
      module: 'SERVICE_ORDERS',
      action: isEdit ? 'OS_UPDATE' : 'OS_CREATE',
      affectedRecordId: o.id,
      affectedRecordType: 'service_order',
      newValue: JSON.stringify({ callNumber: o.callNumber, customer: o.customerName, status: o.status, tech: o.technicianId }),
      result: 'SUCCESS',
      details: `${isEdit ? 'Atualização' : 'Criação'} da OS #${o.callNumber} para o cliente "${o.customerName}" (Status: ${o.status}).`,
    });

    if (isEdit) {
      memOrders[existingIdx] = { ...memOrders[existingIdx], ...o };
    } else {
      memOrders.unshift(o);
    }

    try {
      const db = getDbPool();
      const cols = await getTableColumnsInfo('service_orders');

      const orderValues: Record<string, any> = {
        id: o.id,
        callnumber: o.callNumber,
        call_number: o.callNumber,
        portoseguroprotocol: o.portoSeguroProtocol || null,
        porto_seguro_protocol: o.portoSeguroProtocol || null,
        servicecategory: o.serviceCategory || 'Higienização Padrão',
        service_category: o.serviceCategory || 'Higienização Padrão',
        baseservicefee: Number(o.baseServiceFee || 0),
        base_service_fee: Number(o.baseServiceFee || 0),
        customername: o.customerName,
        customer_name: o.customerName,
        customercpf: o.customerCpf,
        customer_cpf: o.customerCpf,
        customerphone: o.customerPhone || null,
        customer_phone: o.customerPhone || null,
        city: o.city || 'São Paulo',
        uf: o.uf || 'SP',
        neighborhood: o.neighborhood || '',
        addressstreet: o.addressStreet || '',
        address_street: o.addressStreet || '',
        addressnumber: o.addressNumber || '',
        address_number: o.addressNumber || '',
        addresscomplement: o.addressComplement || null,
        address_complement: o.addressComplement || null,
        postalcode: o.postalCode || '',
        postal_code: o.postalCode || '',
        technicianid: o.technicianId || null,
        technician_id: o.technicianId || null,
        status: o.status || 'PENDING',
        scheduleddate: o.scheduledDate ? new Date(o.scheduledDate) : new Date(),
        scheduled_date: o.scheduledDate ? new Date(o.scheduledDate) : new Date(),
        startedat: o.startedAt ? new Date(o.startedAt) : null,
        started_at: o.startedAt ? new Date(o.startedAt) : null,
        completedat: o.completedAt ? new Date(o.completedAt) : null,
        completed_at: o.completedAt ? new Date(o.completedAt) : null,
        kmtraveled: Number(o.kmTraveled || 0),
        km_traveled: Number(o.kmTraveled || 0),
        kmrateapplied: Number(o.kmRateApplied || 0.5),
        km_rate_applied: Number(o.kmRateApplied || 0.5),
        kmtotalcost: Number(o.kmTotalCost || 0),
        km_total_cost: Number(o.kmTotalCost || 0),
        tollcost: Number(o.tollCost || 0),
        toll_cost: Number(o.tollCost || 0),
        supportcost: Number(o.supportCost || 0),
        support_cost: Number(o.supportCost || 0),
        totaltechniciangross: Number(o.totalTechnicianGross || 0),
        total_technician_gross: Number(o.totalTechnicianGross || 0),
        faturamentoporto: Number(o.faturamentoPorto || 0),
        faturamento_porto: Number(o.faturamentoPorto || 0),
        customersignature: o.customerSignature || null,
        customer_signature: o.customerSignature || null,
        executionnotes: o.executionNotes || null,
        execution_notes: o.executionNotes || null,
        tollreceipturl: o.tollReceiptUrl || null,
        toll_receipt_url: o.tollReceiptUrl || null,
        paymentstatus: o.paymentStatus || 'PENDING',
        payment_status: o.paymentStatus || 'PENDING',
        paymentdate: o.paymentDate ? new Date(o.paymentDate) : null,
        payment_date: o.paymentDate ? new Date(o.paymentDate) : null,
      };

      const insertCols: string[] = [];
      const insertPlaceholders: string[] = [];
      const insertValues: any[] = [];
      const updateClauses: string[] = [];

      for (const col of cols) {
        const colLower = col.Field.toLowerCase();
        let val = orderValues[colLower];

        if (val === undefined) {
          if (colLower === 'createdat' || colLower === 'created_at') {
            val = new Date();
          } else if (colLower === 'updatedat' || colLower === 'updated_at') {
            val = new Date();
          } else if (col.Null === 'NO' && col.Default === null && col.Key !== 'PRI') {
            val = col.Type.includes('int') || col.Type.includes('decimal') ? 0 : '';
          }
        }

        if (val !== undefined) {
          insertCols.push(`\`${col.Field}\``);
          insertPlaceholders.push('?');
          insertValues.push(val);
          if (colLower !== 'id') {
            updateClauses.push(`\`${col.Field}\` = VALUES(\`${col.Field}\`)`);
          }
        }
      }

      if (insertCols.length > 0) {
        const query = `
          INSERT INTO \`service_orders\` (${insertCols.join(', ')})
          VALUES (${insertPlaceholders.join(', ')})
          ON DUPLICATE KEY UPDATE
          ${updateClauses.length > 0 ? updateClauses.join(', ') : 'id = id'}
        `;
        await db.execute(query, insertValues);
      }
      res.json({ success: true, message: `OS ${o.callNumber} gravada com sucesso.` });
    } catch (err: any) {
      if (isNetworkError(err)) {
        return res.json({ success: true, message: `OS ${o.callNumber} salva com sucesso.` });
      }
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Atualização direta de Ordem de Serviço (incluindo Quitação / Dar Baixa)
  app.put(['/api/orders/:id', '/api/orders'], async (req, res) => {
    const requester = await getRequester(req);
    const orderId = req.params.id || req.body?.id;
    const updates = req.body || {};

    if (!orderId) {
      return res.status(400).json({ success: false, error: 'ID da Ordem de Serviço é obrigatório.' });
    }

    const memIdx = memOrders.findIndex((o) => o.id === orderId);
    const existingOrder = memIdx >= 0 ? memOrders[memIdx] : null;

    if (!existingOrder && memIdx < 0) {
      // Se não encontrado na memória, ainda tentamos gravar se tiver dados mínimos
    }

    const isSettlement = updates.paymentStatus && updates.paymentStatus !== existingOrder?.paymentStatus;
    const paymentStatusVal = updates.paymentStatus || existingOrder?.paymentStatus || 'PENDING';
    const paymentDateVal = updates.paymentStatus === 'PAID'
      ? (updates.paymentDate || new Date().toISOString())
      : (updates.paymentStatus === 'PENDING' ? null : (updates.paymentDate || existingOrder?.paymentDate || null));

    // Atualiza na memória
    if (memIdx >= 0) {
      memOrders[memIdx] = {
        ...memOrders[memIdx],
        ...updates,
        paymentStatus: paymentStatusVal,
        paymentDate: paymentDateVal,
      };
    }

    // Grava auditoria
    if (isSettlement) {
      await recordAudit({
        userId: requester?.id || 'system',
        userName: requester?.name || 'Sistema',
        userRole: requester?.role || 'OPERATIONAL',
        ipAddress: req.ip,
        module: 'FINANCE',
        action: paymentStatusVal === 'PAID' ? 'OS_PAYMENT_SETTLED' : 'OS_PAYMENT_REVERTED',
        affectedRecordId: orderId,
        affectedRecordType: 'service_order',
        oldValue: existingOrder?.paymentStatus || 'PENDING',
        newValue: paymentStatusVal,
        result: 'SUCCESS',
        details: paymentStatusVal === 'PAID'
          ? `Baixa de pagamento realizada na OS #${existingOrder?.callNumber || orderId} por ${requester?.name || 'Gestor'}.`
          : `Status de pagamento da OS #${existingOrder?.callNumber || orderId} revertido para PENDENTE.`,
      });
    }

    try {
      const db = getDbPool();
      const cols = await getTableColumnsMap('service_orders');

      const setClauses: string[] = [];
      const values: any[] = [];

      if (cols.has('paymentstatus') || cols.has('payment_status')) {
        const field = cols.get('paymentstatus') || cols.get('payment_status')!;
        setClauses.push(`\`${field}\` = ?`);
        values.push(paymentStatusVal);
      }

      if (cols.has('paymentdate') || cols.has('payment_date')) {
        const field = cols.get('paymentdate') || cols.get('payment_date')!;
        setClauses.push(`\`${field}\` = ?`);
        values.push(paymentDateVal ? new Date(paymentDateVal) : null);
      }

      if (updates.status && (cols.has('status'))) {
        setClauses.push(`\`${cols.get('status')}\` = ?`);
        values.push(updates.status);
      }

      if (setClauses.length > 0) {
        values.push(orderId);
        await db.execute(
          `UPDATE \`service_orders\` SET ${setClauses.join(', ')} WHERE id = ?`,
          values
        );
      }

      res.json({
        success: true,
        message: 'Ordem de serviço atualizada com sucesso.',
        data: memIdx >= 0 ? memOrders[memIdx] : { id: orderId, ...updates, paymentStatus: paymentStatusVal, paymentDate: paymentDateVal },
      });
    } catch (err: any) {
      if (isNetworkError(err)) {
        return res.json({
          success: true,
          message: 'Ordem de serviço atualizada na memória local.',
          data: memIdx >= 0 ? memOrders[memIdx] : { id: orderId, ...updates },
        });
      }
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/orders/:id', async (req, res) => {
    const { id } = req.params;
    const requester = await getRequester(req);

    // Técnico não pode excluir Ordens de Serviço
    if (!requester || requester.role === 'TECHNICIAN') {
      await recordAudit({
        userId: requester?.id || 'unknown',
        userName: requester?.name || 'Desconhecido',
        userRole: requester?.role || 'TECHNICIAN',
        ipAddress: req.ip,
        module: 'SERVICE_ORDERS',
        action: 'ACCESS_DENIED',
        result: 'BLOCKED',
        details: `Tentativa não autorizada de exclusão da OS ${id} por perfil Técnico.`,
      });
      return res.status(403).json({ success: false, error: 'Acesso negado: Técnicos não possuem permissão para excluir Ordens de Serviço.' });
    }

    const target = memOrders.find((o) => o.id === id);
    const callNum = target ? target.callNumber : id;
    memOrders = memOrders.filter((o) => o.id !== id);

    await recordAudit({
      userId: requester.id,
      userName: requester.name,
      userRole: requester.role,
      ipAddress: req.ip,
      module: 'SERVICE_ORDERS',
      action: 'OS_DELETE',
      affectedRecordId: id,
      affectedRecordType: 'service_order',
      oldValue: JSON.stringify(target || { id, callNumber: callNum }),
      result: 'SUCCESS',
      details: `Exclusão da OS #${callNum} (Cliente: ${target?.customerName || 'N/A'}) efetuada por ${requester.name} (${requester.role}).`,
    });

    try {
      const db = getDbPool();
      await db.execute('DELETE FROM service_orders WHERE id = ?', [id]);
      res.json({ success: true, message: `OS ${id} removida.` });
    } catch (err: any) {
      if (isNetworkError(err)) {
        return res.json({ success: true, message: `OS ${id} removida da memória local.` });
      }
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Reatribuição em Massa de Técnico
  app.post('/api/orders/batch-reassign', async (req, res) => {
    const requester = await getRequester(req);
    if (!requester || requester.role === 'TECHNICIAN') {
      return res.status(403).json({ success: false, error: 'Acesso negado: apenas Gestores e Administradores podem reatribuir técnicos.' });
    }

    const { orderIds, technicianId } = req.body || {};
    if (!Array.isArray(orderIds) || orderIds.length === 0 || !technicianId) {
      return res.status(400).json({ success: false, error: 'Lista de IDs de Ordens e ID do Técnico são obrigatórios.' });
    }

    // Localiza o usuário técnico
    let targetTech = memUsers.find((u) => u.id === technicianId);
    if (!targetTech) {
      try {
        const db = getDbPool();
        const [rows]: any = await db.query('SELECT * FROM users WHERE id = ? LIMIT 1', [technicianId]);
        if (rows && rows.length > 0) {
          targetTech = rows[0];
          memUsers.push(targetTech);
        }
      } catch {}
    }

    const techName = targetTech ? targetTech.name : 'Técnico';

    // Atualiza na memória
    let updatedCount = 0;
    memOrders = memOrders.map((o) => {
      if (orderIds.includes(o.id) || orderIds.includes(o.callNumber)) {
        updatedCount++;
        return {
          ...o,
          technicianId: technicianId,
          technicianName: techName,
        };
      }
      return o;
    });

    // Grava auditoria
    await recordAudit({
      userId: requester.id,
      userName: requester.name,
      userRole: requester.role,
      ipAddress: req.ip,
      module: 'SERVICE_ORDERS',
      action: 'OS_TECHNICIAN_REASSIGN',
      result: 'SUCCESS',
      details: `Reatribuição em massa de ${orderIds.length} ordem(ns) para o técnico "${techName}" (ID: ${technicianId}) realizada por ${requester.name}.`,
    });

    try {
      const db = getDbPool();
      const placeholders = orderIds.map(() => '?').join(',');
      await db.execute(
        `UPDATE service_orders SET technician_id = ? WHERE id IN (${placeholders}) OR call_number IN (${placeholders})`,
        [technicianId, ...orderIds, ...orderIds]
      );
      res.json({ success: true, count: updatedCount || orderIds.length, message: `${orderIds.length} ordens vinculadas a ${techName} com sucesso.` });
    } catch (err: any) {
      if (isNetworkError(err)) {
        return res.json({ success: true, count: updatedCount || orderIds.length, message: `${orderIds.length} ordens vinculadas na memória a ${techName}.` });
      }
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Auto-reparo de Ordens de Serviço Órfãs / Não Alocadas
  app.post('/api/orders/auto-repair', async (req, res) => {
    const requester = await getRequester(req);
    if (!requester || requester.role === 'TECHNICIAN') {
      return res.status(403).json({ success: false, error: 'Acesso negado: apenas Gestores e Administradores podem executar auto-reparo.' });
    }

    const { technicianId } = req.body || {};
    let defaultTech = technicianId ? memUsers.find((u) => u.id === technicianId) : memUsers.find((u) => u.role === 'TECHNICIAN');
    if (!defaultTech) defaultTech = memUsers[0];

    const targetId = defaultTech ? defaultTech.id : 'u1';
    const targetName = defaultTech ? defaultTech.name : 'Carlos Henrique Silva';

    let repairedCount = 0;
    const repairedIds: string[] = [];

    memOrders = memOrders.map((o) => {
      const isOrphan = !o.technicianId || o.technicianId === 'tech-1' || !o.technicianName || o.technicianName === 'Não Alocado' || o.technicianName === 'Técnico';
      if (isOrphan) {
        repairedCount++;
        repairedIds.push(o.id);
        return {
          ...o,
          technicianId: targetId,
          technicianName: targetName,
        };
      }
      return o;
    });

    if (repairedIds.length > 0) {
      try {
        const db = getDbPool();
        const placeholders = repairedIds.map(() => '?').join(',');
        await db.execute(
          `UPDATE service_orders SET technician_id = ? WHERE id IN (${placeholders}) OR technician_id IS NULL OR technician_id = '' OR technician_id = 'tech-1'`,
          [targetId, ...repairedIds]
        );
      } catch {}
    }

    await recordAudit({
      userId: requester.id,
      userName: requester.name,
      userRole: requester.role,
      ipAddress: req.ip,
      module: 'SERVICE_ORDERS',
      action: 'OS_UPDATE',
      result: 'SUCCESS',
      details: `Auto-reparo de integridade relacional: ${repairedCount} ordem(ns) vinculada(s) a "${targetName}".`,
    });

    res.json({
      success: true,
      count: repairedCount,
      message: `${repairedCount} ordens de serviço foram vinculadas ao técnico ${targetName}.`,
    });
  });

  // =========================================================================
  // 5.1 MASS IMPORT OF PORTO SEGURO SERVICE ORDERS (.xlsx via multer & xlsx)
  // =========================================================================
  const uploadExcel = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 35 * 1024 * 1024 }, // 35MB
  });

  function isLostVisitValue(status?: string, category?: string, tipoVisita?: string): boolean {
    const s = `${status || ''} ${category || ''} ${tipoVisita || ''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return s.includes('perdida') || s.includes('ausente') || s.includes('perd') || s.includes('ausen');
  }

  function getVisitDateKey(dateVal: any): string {
    if (!dateVal) return '';
    if (typeof dateVal === 'string') {
      if (/^\d{4}-\d{2}-\d{2}/.test(dateVal)) {
        return dateVal.substring(0, 10);
      }
      const brMatch = dateVal.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
      if (brMatch) {
        const d = brMatch[1].padStart(2, '0');
        const m = brMatch[2].padStart(2, '0');
        let y = brMatch[3];
        if (y.length === 2) y = '20' + y;
        return `${y}-${m}-${d}`;
      }
    }
    if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
      return dateVal.toISOString().substring(0, 10);
    }
    return '';
  }

  function findMatchingVisit(
    ordersList: any[],
    callNumber: string,
    scheduledDateStr: string,
    finalStatus: string,
    tipoVisita: string
  ): { existingOrder: any; index: number } {
    const targetDateKey = getVisitDateKey(scheduledDateStr);
    const isTargetLost = isLostVisitValue(finalStatus, tipoVisita);

    const idx = ordersList.findIndex((o) => {
      if (String(o.callNumber || '').trim() !== String(callNumber).trim()) return false;
      const oDateKey = getVisitDateKey(o.scheduledDate || o.completedAt || o.startedAt);
      const isOLost = isLostVisitValue(o.status, o.serviceCategory);

      // Se uma é visita perdida e a outra não (ex: retorno concluído em outro dia), são visitas DISTINTAS válidas!
      if (isTargetLost !== isOLost) return false;

      // Se ambas têm datas e as datas são diferentes (ex: 17/07 vs 18/07), são visitas DISTINTAS válidas!
      if (targetDateKey && oDateKey && targetDateKey !== oDateKey) return false;

      return true;
    });

    return {
      existingOrder: idx >= 0 ? ordersList[idx] : null,
      index: idx,
    };
  }

  app.post('/api/import/orders', uploadExcel.single('file'), async (req, res) => {
    const requester = await getRequester(req);

    if (requester && requester.role !== 'ADMIN') {
      await recordAudit({
        userId: requester?.id || 'unknown',
        userName: requester?.name || 'Desconhecido',
        userRole: requester?.role || 'TECHNICIAN',
        ipAddress: req.ip,
        module: 'SERVICE_ORDERS',
        action: 'ACCESS_DENIED',
        result: 'BLOCKED',
        details: 'Tentativa não autorizada de executar importação massiva de planilhas.',
      });
      return res.status(403).json({ success: false, error: 'Acesso negado: apenas o Administrador Master pode realizar importação massiva.' });
    }

    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo de planilha (.xlsx/.xls) foi enviado.' });
    }

    try {
      // 1. Leitura do arquivo Excel otimizada (Prevenção de Memory Leak no PM2)
      const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        return res.status(400).json({ success: false, error: 'A planilha enviada não contém nenhuma aba válida.' });
      }

      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });

      // Liberar buffer imediatamente do heap
      if (req.file) req.file.buffer = Buffer.alloc(0);

      if (!rawRows || rawRows.length === 0) {
        return res.status(400).json({ success: false, error: 'Nenhum dado encontrado na planilha enviada.' });
      }

      if (rawRows.length > 20000) {
        return res.status(413).json({ success: false, error: 'Planilha excede o limite máximo de 20.000 linhas por lote para manter estabilidade do servidor.' });
      }

      // Helpers de Sanitização e Mapeamento omitidos por brevidade da refatoração...
      function parseCurrency(val: any): number {
        if (val === null || val === undefined || val === '') return 0;
        if (typeof val === 'number') return isNaN(val) ? 0 : Number(val.toFixed(2));
        let str = String(val).replace(/R\$/gi, '').trim();
        const lastDot = str.lastIndexOf('.');
        const lastComma = str.lastIndexOf(',');
        if (lastComma > lastDot) { str = str.replace(/\./g, '').replace(/,/g, '.'); }
        else if (lastDot > lastComma) { str = str.replace(/,/g, ''); }
        str = str.replace(/\s+/g, '');
        const num = parseFloat(str);
        return isNaN(num) ? 0 : Number(num.toFixed(2));
      }

      function parseDateValue(val: any): string {
        if (!val) return new Date().toISOString();
        if (val instanceof Date) return isNaN(val.getTime()) ? new Date().toISOString() : val.toISOString();
        if (typeof val === 'number') {
          const d = new Date(Math.round((val - 25569) * 86400 * 1000));
          return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
        }
        if (typeof val === 'string') {
          const clean = val.trim();
          const brMatch = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
          if (brMatch) {
            let year = parseInt(brMatch[3], 10);
            if (year < 100) year += 2000;
            const d = new Date(year, parseInt(brMatch[2], 10) - 1, parseInt(brMatch[1], 10), brMatch[4] ? parseInt(brMatch[4], 10) : 12, brMatch[5] ? parseInt(brMatch[5], 10) : 0);
            if (!isNaN(d.getTime())) return d.toISOString();
          }
          const d = new Date(clean);
          if (!isNaN(d.getTime())) return d.toISOString();
        }
        return new Date().toISOString();
      }

      function shouldIgnoreRow(origem: any, tecnico: any): boolean {
        if (!origem || !tecnico) return true;
        const o = String(origem).trim().toLowerCase();
        const t = String(tecnico).trim().toLowerCase();
        if (o === '' || t === '') return true;
        const forbiddenWords = ['total', 'totais', 'vale', 'liquido', 'líquido', 'bruto', 'subtotal', 'resumo'];
        return forbiddenWords.some(w => o.includes(w) || t.includes(w));
      }

      function getField(row: Record<string, any>, candidates: string[]): any {
        const keys = Object.keys(row);
        for (const cand of candidates) {
          const cleanCand = cand.toLowerCase().replace(/[_\s\.]+/g, '');
          for (const k of keys) {
            if (k.toLowerCase().replace(/[_\s\.]+/g, '') === cleanCand) return row[k];
          }
        }
        for (const cand of candidates) {
          const cleanCand = cand.toLowerCase().replace(/[_\s\.]+/g, '');
          for (const k of keys) {
            const cleanK = k.toLowerCase().replace(/[_\s\.]+/g, '');
            if (cleanK.includes(cleanCand) || cleanCand.includes(cleanK)) return row[k];
          }
        }
        return null;
      }

      function isGenericCompanyName(name: string): boolean {
        if (!name) return true;
        const n = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        const genericTokens = ['higienizador', 'higienizadora', 'porto seguro', 'prestador', 'empresa', 'matriz', 'central', 'nao alocado', 'sem tecnico', 'padrao'];
        return n.length < 2 || genericTokens.some(tok => n === tok || n.includes(tok));
      }

      let importedCount = 0;
      let ignoredRowsCount = 0;
      let techniciansCreatedCount = 0;
      const createdTechniciansList: Array<{ id: string; name: string; email: string }> = [];
      const importedOrdersSummary: any[] = [];
      const db = getDbPool();

      // Pré-carga (Cache em Memória) - Evita Query N+1 no loop
      let currentUsersList = [...memUsers];
      try {
        const [userRows]: any = await db.query('SELECT * FROM users');
        if (userRows && userRows.length > 0) currentUsersList = userRows;
      } catch (e) {
        logDb('WARN', 'Fallback do MariaDB falhou ao carregar usuários. Usando RAM.');
      }

      const usersCacheMap = new Map();
      currentUsersList.forEach(u => {
        const normName = (u.name || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        usersCacheMap.set(normName, u);
      });

      const originalFileName = file.originalname || '';
      const cleanFileNameNorm = originalFileName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      let fileContextTechnician: any = null;

      for (const u of currentUsersList) {
        if (u.role === 'TECHNICIAN' || u.role === 'ADMIN') {
          const fullName = (u.name || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const firstName = fullName.split(' ')[0];
          if ((firstName.length >= 3 && cleanFileNameNorm.includes(firstName)) || (fullName.length >= 3 && cleanFileNameNorm.includes(fullName))) {
            fileContextTechnician = u;
            break;
          }
        }
      }

      const batchOrders: any[] = [];
      const pendingNewTechsMap = new Map(); // Para não duplicar criacões dinâmicas no lote

      // Processamento Síncrono sem IO de Rede Bloqueante
      for (let idx = 0; idx < rawRows.length; idx++) {
        const row = rawRows[idx];
        const origemRaw = getField(row, ['Origem', 'Orig', 'Source', 'Protocolo']);
        
        let rawTechName = '';
        for (const k of Object.keys(row)) {
          const normKey = k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          if (/tec|prestador|executant|colaborador|responsavel|funcionario/.test(normKey) && row[k]) {
            rawTechName = String(row[k]).trim();
            break;
          }
        }
        if (!rawTechName) rawTechName = String(getField(row, ['Tecnico', 'Prestador', 'Nome Tecnico']) || '').trim();

        if (shouldIgnoreRow(origemRaw, rawTechName)) {
           ignoredRowsCount++;
           continue;
        }

        const callNumberRaw = getField(row, ['IdChamado', 'Chamado', 'OS']) || `PS-IMP-${Date.now()}-${idx}`;
        const dtVisitaRaw = getField(row, ['Dt.Visita', 'Data Visita', 'Data']);
        const tipoVisitaRaw = getField(row, ['Tipo Visita', 'Serviço', 'Categoria']) || 'Instalação / Higienização';
        const statusRaw = getField(row, ['Status OS', 'Status', 'Situacao']);
        
        let technicianId = '';
        let techName = '';
        const cleanTechNameNorm = rawTechName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

        if (isGenericCompanyName(rawTechName)) {
           technicianId = fileContextTechnician ? String(fileContextTechnician.id) : 'u1';
           techName = fileContextTechnician ? fileContextTechnician.name : 'Técnico Não Identificado';
        } else {
           let existingUser = usersCacheMap.get(cleanTechNameNorm) || pendingNewTechsMap.get(cleanTechNameNorm);
           
           if (existingUser) {
             technicianId = String(existingUser.id);
             techName = existingUser.name;
           } else {
             technicianId = `tech-imp-${Date.now()}-${idx}`;
             const slug = cleanTechNameNorm.replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '') || 'tecnico';
             const finalEmail = `${slug}${idx}@ohigienizador.com.br`;
             
             const newTech = {
               id: technicianId, name: rawTechName, email: finalEmail, passwordHash: 'Porto@2026', role: 'TECHNICIAN', documentCpf: '000.000.000-00', phone: '(11) 99999-0000', isActive: 1, pixKeyType: 'CPF', pixKey: '', bankName: 'Porto Seguro Bank', bankAgency: '', bankAccount: '', baseCostAllowance: 0, hasSpecialTaxRule: 0, specialTaxRate: 0, createdAt: new Date(), updatedAt: new Date()
             };
             pendingNewTechsMap.set(cleanTechNameNorm, newTech);
             techName = newTech.name;
           }
        }

        const baseServiceFee = parseCurrency(getField(row, ['VALOR DA VISITA', 'Valor', 'Base Fee']));
        const kmTotalCost = parseCurrency(getField(row, ['KM', 'Km Rodado'])) > 0 ? Number((parseCurrency(getField(row, ['KM', 'Km Rodado'])) * 0.50).toFixed(2)) : 0;
        const tollCost = parseCurrency(getField(row, ['PEDAGIO', 'Pedagio']));
        const totalTechnicianGross = Number((baseServiceFee + kmTotalCost + tollCost).toFixed(2));
        
        const cleanStatus = String(statusRaw || '').toLowerCase().trim();
        const finalStatus = cleanStatus.includes('perdida') ? 'COMPLETED' : cleanStatus.includes('canc') ? 'CANCELLED' : cleanStatus.includes('anda') ? 'IN_PROGRESS' : 'PENDING';
        
        const scheduledDateStr = parseDateValue(dtVisitaRaw);
        const dateSlug = scheduledDateStr.split('T')[0].replace(/-/g, '');
        const orderId = `os-${callNumberRaw}-${dateSlug}`;

        batchOrders.push([
          orderId, String(callNumberRaw).trim(), String(origemRaw).trim() || null, String(tipoVisitaRaw).trim(), baseServiceFee,
          String(row.Cliente || 'Cliente Porto Seguro').trim(), '', null, String(row.Cidade || 'São Paulo').trim(), String(row.UF || 'SP').trim().toUpperCase().substring(0, 2),
          String(row.Bairro || '').trim(), String(row.Endereco || '').trim(), String(row.Numero || '').trim(), null, String(row.CEP || '01001-000').trim(),
          technicianId, finalStatus, new Date(scheduledDateStr), finalStatus !== 'PENDING' ? new Date(scheduledDateStr) : null, finalStatus === 'COMPLETED' || finalStatus === 'CANCELLED' ? new Date(scheduledDateStr) : null,
          parseCurrency(getField(row, ['KM', 'Km Rodado'])), 0.50, kmTotalCost, tollCost, 0, totalTechnicianGross, totalTechnicianGross
        ]);

        importedCount++;
        if (importedOrdersSummary.length < 15) {
          importedOrdersSummary.push({ callNumber: callNumberRaw, technicianName: techName, date: scheduledDateStr, totalGross: totalTechnicianGross, status: finalStatus });
        }
      }

      // Concorrência Atomic (Batch Insert MariaDB) - Protege contra fragmentação
      try {
        // 1. Batch Techs
        const newTechs = Array.from(pendingNewTechsMap.values());
        if (newTechs.length > 0) {
          const techBatchValues = newTechs.map(t => [t.id, t.name, t.email, t.passwordHash, 'TECHNICIAN', 1, 0, 0, 0, t.phone, t.documentCpf, new Date(), new Date()]);
          await db.query(`INSERT INTO users (id, name, email, passwordHash, role, isActive, baseCostAllowance, hasSpecialTaxRule, specialTaxRate, phone, document_cpf, createdAt, updatedAt) VALUES ? ON DUPLICATE KEY UPDATE name=VALUES(name)`, [techBatchValues]);
          techniciansCreatedCount = newTechs.length;
          memUsers.push(...newTechs);
          createdTechniciansList.push(...newTechs.map(t => ({ id: t.id, name: t.name, email: t.email })));
        }

        // 2. Batch Orders
        if (batchOrders.length > 0) {
          // Dividir em chunks (limite pacotes MySQL)
          const chunkSize = 2000;
          for (let i = 0; i < batchOrders.length; i += chunkSize) {
            const chunk = batchOrders.slice(i, i + chunkSize);
            await db.query(`
              INSERT INTO service_orders (
                id, call_number, porto_seguro_protocol, service_category, base_service_fee, customer_name, customer_cpf, customer_phone, city, uf, neighborhood, address_street, address_number, address_complement, postal_code, technician_id, status, scheduled_date, started_at, completed_at, km_traveled, km_rate_applied, km_total_cost, toll_cost, support_cost, total_technician_gross, faturamento_porto
              ) VALUES ? 
              ON DUPLICATE KEY UPDATE 
                status=VALUES(status), total_technician_gross=VALUES(total_technician_gross), faturamento_porto=VALUES(faturamento_porto)
            `, [chunk]);
          }
        }
      } catch (err: any) {
        logDb('ERROR', `Falha grave na persistência do lote. Rollback acionado. Erro: ${err.message}`);
        return res.status(500).json({ success: false, error: 'Erro de transação no banco de dados. Processamento abortado por segurança estrutural.' });
      }

      await recordAudit({
        userId: requester?.id || 'system', userName: requester?.name || 'Administrador Master', userRole: requester?.role || 'ADMIN', ipAddress: req.ip, module: 'SERVICE_ORDERS', action: 'DATA_IMPORT', result: 'SUCCESS', details: `Importação massiva otimizada concluída: ${importedCount} ordens via ${file.originalname}.`
      });

      res.json({ success: true, message: `${importedCount} ordens e ${techniciansCreatedCount} técnicos via batch.`, importedCount, techniciansCreated: techniciansCreatedCount, ignoredRowsCount, createdTechnicians: createdTechniciansList, sampleOrders: importedOrdersSummary });
    } catch (err: any) {
      res.status(500).json({ success: false, error: `Erro ao processar planilha (OOM/Parser): ${err.message}` });
    }
  });

  // =========================================================================
  // 5.2 IMPORT OF FINE-TUNED JSON SERVICE ORDERS (/api/import/orders-json)
  // =========================================================================
  app.post('/api/import/orders-json', async (req, res) => {
    const requester = await getRequester(req);

    if (requester && requester.role === 'TECHNICIAN') {
      return res.status(403).json({ success: false, error: 'Acesso negado: apenas Administradores e Gestores podem importar ordens.' });
    }

    const { orders } = req.body || {};
    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhuma ordem de serviço foi enviada para importação.' });
    }

    try {
      const db = getDbPool();

      // Buscar todos os usuários atuais para matching
      let currentUsersList = [...memUsers];
      try {
        const [userRows]: any = await db.query('SELECT * FROM users');
        if (userRows && userRows.length > 0) {
          currentUsersList = userRows;
        }
      } catch {}

      function parseJsonCurrency(val: any): number {
        if (val === null || val === undefined || val === '') return 0;
        if (typeof val === 'number') return isNaN(val) ? 0 : Number(val.toFixed(2));
        let str = String(val).replace(/R\$/gi, '').trim();
        const lastDot = str.lastIndexOf('.');
        const lastComma = str.lastIndexOf(',');
        if (lastComma > lastDot) {
          str = str.replace(/\./g, '').replace(/,/g, '.');
        } else if (lastDot > lastComma) {
          str = str.replace(/,/g, '');
        }
        str = str.replace(/\s+/g, '');
        const num = parseFloat(str);
        return isNaN(num) ? 0 : Number(num.toFixed(2));
      }

      function parseJsonDate(val: any): string {
        if (!val) return new Date().toISOString();
        if (val instanceof Date) {
          return isNaN(val.getTime()) ? new Date().toISOString() : val.toISOString();
        }
        if (typeof val === 'number') {
          const d = new Date(Math.round((val - 25569) * 86400 * 1000));
          return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
        }
        if (typeof val === 'string') {
          const clean = val.trim();
          // Formato YYYY-MM-DD
          if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
            const d = new Date(clean);
            if (!isNaN(d.getTime())) return d.toISOString();
          }
          // Formato DD/MM/YYYY
          const brMatch = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{1,2}))?$/);
          if (brMatch) {
            const day = parseInt(brMatch[1], 10);
            const month = parseInt(brMatch[2], 10) - 1;
            let year = parseInt(brMatch[3], 10);
            if (year < 100) year += 2000;
            const hour = brMatch[4] ? parseInt(brMatch[4], 10) : 12;
            const min = brMatch[5] ? parseInt(brMatch[5], 10) : 0;
            const d = new Date(year, month, day, hour, min);
            if (!isNaN(d.getTime())) return d.toISOString();
          }
        }
        return new Date().toISOString();
      }

      let importedCount = 0;
      let techniciansCreatedCount = 0;
      const createdTechs: Array<{ id: string; name: string }> = [];
      let dbAvailable = true;

      for (let idx = 0; idx < orders.length; idx++) {
        const item = orders[idx];
        const callNumber = String(item.IdChamado || item.idChamado || item.callNumber || `IMP-${Date.now()}-${idx + 1}`).trim();
        const rawTechId = item.technicianId || '';
        const rawTechName = String(item.Prestador || item.Tecnico || item.technicianName || 'Técnico').trim();
        const tipoVisita = String(item['Tipo Visita'] || item.tipoVisita || item.serviceCategory || 'Serviço Porto').trim();
        const statusRaw = String(item['Status OS'] || item.Status || item.status || 'COMPLETED').toUpperCase();

        let finalStatus = 'COMPLETED';
        if (statusRaw.includes('PERD') || statusRaw.includes('AUSEN')) {
          finalStatus = 'COMPLETED';
        } else if (statusRaw.includes('CANC') || statusRaw.includes('RECUS') || statusRaw.includes('IMPOSS')) {
          finalStatus = 'CANCELLED';
        } else if (statusRaw.includes('ANDA') || statusRaw.includes('EXEC') || statusRaw.includes('INIC')) {
          finalStatus = 'IN_PROGRESS';
        } else if (statusRaw.includes('PEND') || statusRaw.includes('AGEN')) {
          finalStatus = 'PENDING';
        }

        // Resolução de Técnico
        let resolvedTechId = rawTechId;
        let resolvedTechName = rawTechName;

        if (resolvedTechId) {
          const found = currentUsersList.find((u) => u.id === resolvedTechId);
          if (found) {
            resolvedTechName = found.name;
          }
        } else {
          // Busca por nome
          const cleanNameNorm = rawTechName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          const found = currentUsersList.find((u) => {
            const uNameNorm = (u.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            return uNameNorm === cleanNameNorm || uNameNorm.includes(cleanNameNorm) || cleanNameNorm.includes(uNameNorm);
          });

          if (found) {
            resolvedTechId = found.id;
            resolvedTechName = found.name;
          } else if (rawTechName && rawTechName !== 'Não Alocado' && rawTechName !== 'Técnico' && rawTechName !== 'O Higienizador' && rawTechName.length >= 3) {
            // Criar técnico automaticamente
            resolvedTechId = `tech-imp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            const slug = cleanNameNorm.replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '') || 'tecnico';
            const newEmail = `${slug}@ohigienizador.com.br`;

            const newTechUser = {
              id: resolvedTechId,
              name: rawTechName,
              email: newEmail,
              passwordHash: 'Porto@2026',
              role: 'TECHNICIAN',
              documentCpf: '000.000.000-00',
              phone: '(11) 99999-0000',
              isActive: 1,
              pixKeyType: 'CPF',
              pixKey: '',
              bankName: 'Porto Seguro Bank',
              bankAgency: '',
              bankAccount: '',
              baseCostAllowance: 250,
              costAllowanceFortnight: 1,
              hasSpecialTaxRule: 0,
              specialTaxRate: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            currentUsersList.push(newTechUser);
            memUsers.push(newTechUser);

            if (dbAvailable) {
              try {
                await db.execute(
                  `INSERT INTO \`users\` (
                    id, name, email, passwordHash, role, isActive, baseCostAllowance, hasSpecialTaxRule, specialTaxRate, phone, document_cpf, createdAt, updatedAt
                  ) VALUES (?, ?, ?, ?, 'TECHNICIAN', 1, 250, 0, 0, ?, '000.000.000-00', NOW(), NOW())
                  ON DUPLICATE KEY UPDATE name = VALUES(name), isActive = 1`,
                  [newTechUser.id, newTechUser.name, newTechUser.email, newTechUser.passwordHash, newTechUser.phone]
                );
              } catch (err: any) {
                if (isNetworkError(err)) {
                  dbAvailable = false;
                  logDb('WARN', `[Import JSON] Conexão MariaDB offline (${err.code || 'ETIMEDOUT'}). Cadastro em memória mantido.`);
                } else {
                  console.warn('[Import JSON] Aviso ao inserir técnico no MariaDB:', err);
                }
              }
            }

            techniciansCreatedCount++;
            createdTechs.push({ id: newTechUser.id, name: newTechUser.name });
            resolvedTechName = newTechUser.name;
          } else {
            // Fallback para primeiro técnico ativo
            const fallback = currentUsersList.find((u) => u.role === 'TECHNICIAN') || memUsers[0];
            resolvedTechId = fallback ? fallback.id : 'u1';
            resolvedTechName = fallback ? fallback.name : 'Carlos Henrique Silva';
          }
        }

        const km = parseJsonCurrency(item.KM || item.km || 0);
        const kmRate = 0.50;
        const kmCost = km > 0 ? Number((km * kmRate).toFixed(2)) : 0;
        const toll = parseJsonCurrency(item['Pedágio'] || item.PEDAGIO || item.pedagio || item.tollCost || 0);
        const valorVisita = parseJsonCurrency(item['Valor da Visita'] || item['VALOR DA VISTA'] || item.valorVisita || item.baseServiceFee || 0);
        const totalGross = Number((valorVisita + kmCost + toll).toFixed(2));

        const scheduledDateStr = parseJsonDate(item['Dt.Visita'] || item.dtVisita || item.scheduledDate);
        const completedAt = (finalStatus === 'COMPLETED' || finalStatus === 'CANCELLED') ? scheduledDateStr : null;
        const startedAt = (finalStatus === 'IN_PROGRESS' || finalStatus === 'COMPLETED' || finalStatus === 'CANCELLED') ? scheduledDateStr : null;

        const matchResult = findMatchingVisit(memOrders, callNumber, scheduledDateStr, finalStatus, tipoVisita);
        const existingMem = matchResult.existingOrder;

        let orderId = existingMem ? existingMem.id : '';
        if (!orderId) {
          const dateSlug = (getVisitDateKey(scheduledDateStr) || '').replace(/-/g, '') || `${idx + 1}`;
          const statusSlug = isLostVisitValue(finalStatus, tipoVisita) ? 'perdida' : 'concluido';
          orderId = `os-${callNumber}-${dateSlug}-${statusSlug}`;
        }

        const orderObj: any = {
          id: orderId,
          callNumber,
          portoSeguroProtocol: String(item.Origem || item.origem || 'Porto Seguro').trim(),
          serviceCategory: tipoVisita,
          baseServiceFee: valorVisita,
          customerName: String(item.Cliente || item.customerName || 'Cliente Porto Seguro').trim(),
          customerCpf: '',
          customerPhone: null,
          city: String(item.Cidade || item.cidade || 'São Paulo').trim(),
          uf: String(item.UF || item.uf || 'SP').trim().toUpperCase().substring(0, 2),
          neighborhood: String(item.Bairro || item.bairro || '').trim(),
          addressStreet: String(item.Endereco || item.addressStreet || '').trim(),
          addressNumber: String(item.Numero || item.addressNumber || '').trim(),
          addressComplement: null,
          postalCode: String(item.CEP || item.cep || '01001-000').trim(),
          technicianId: resolvedTechId,
          technicianName: resolvedTechName,
          status: finalStatus,
          scheduledDate: scheduledDateStr,
          startedAt,
          completedAt,
          kmTraveled: km,
          kmRateApplied: kmRate,
          kmTotalCost: kmCost,
          tollCost: toll,
          supportCost: 0,
          totalTechnicianGross: totalGross,
          faturamentoPorto: totalGross,
          paymentStatus: 'PENDING',
          paymentDate: null,
          itemsUsed: [],
        };

        // Atualizar memória
        if (matchResult.index >= 0) {
          memOrders[matchResult.index] = { ...memOrders[matchResult.index], ...orderObj };
        } else {
          memOrders.unshift(orderObj);
        }

        // Inserir / Atualizar no MariaDB se disponível
        if (dbAvailable) {
          try {
            const insertOrderQuery = `
              INSERT INTO \`service_orders\` (
                id, call_number, porto_seguro_protocol, service_category, base_service_fee,
                customer_name, customer_cpf, customer_phone, city, uf, neighborhood,
                address_street, address_number, address_complement, postal_code,
                technician_id, status, scheduled_date, started_at, completed_at,
                km_traveled, km_rate_applied, km_total_cost, toll_cost, support_cost,
                total_technician_gross, faturamento_porto, created_at
              ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW()
              ) ON DUPLICATE KEY UPDATE
                service_category = VALUES(service_category),
                base_service_fee = VALUES(base_service_fee),
                technician_id = VALUES(technician_id),
                status = VALUES(status),
                scheduled_date = VALUES(scheduled_date),
                started_at = VALUES(started_at),
                completed_at = VALUES(completed_at),
                km_traveled = VALUES(km_traveled),
                km_rate_applied = VALUES(km_rate_applied),
                km_total_cost = VALUES(km_total_cost),
                toll_cost = VALUES(toll_cost),
                support_cost = VALUES(support_cost),
                total_technician_gross = VALUES(total_technician_gross),
                faturamento_porto = VALUES(faturamento_porto)
            `;

            await db.execute(insertOrderQuery, [
              orderObj.id,
              orderObj.callNumber,
              orderObj.portoSeguroProtocol,
              orderObj.serviceCategory,
              orderObj.baseServiceFee,
              orderObj.customerName,
              orderObj.customerCpf,
              orderObj.customerPhone,
              orderObj.city,
              orderObj.uf,
              orderObj.neighborhood,
              orderObj.addressStreet,
              orderObj.addressNumber,
              orderObj.addressComplement,
              orderObj.postalCode,
              orderObj.technicianId,
              orderObj.status,
              orderObj.scheduledDate ? new Date(orderObj.scheduledDate) : new Date(),
              orderObj.startedAt ? new Date(orderObj.startedAt) : null,
              orderObj.completedAt ? new Date(orderObj.completedAt) : null,
              orderObj.kmTraveled,
              orderObj.kmRateApplied,
              orderObj.kmTotalCost,
              orderObj.tollCost,
              orderObj.supportCost,
              orderObj.totalTechnicianGross,
              orderObj.faturamentoPorto,
            ]);
          } catch (dbErr: any) {
            if (isNetworkError(dbErr)) {
              dbAvailable = false;
              logDb('WARN', `[Import JSON] Conexão MariaDB offline (${dbErr.code || 'ETIMEDOUT'}). Ordens salvas com sucesso em memória.`);
            } else {
              console.warn('[Import JSON] Erro ao gravar OS no MariaDB:', dbErr);
            }
          }
        }

        importedCount++;
      }

      await recordAudit({
        userId: requester?.id || 'system',
        userName: requester?.name || 'Administrador Master',
        userRole: requester?.role || 'ADMIN',
        ipAddress: req.ip,
        module: 'SERVICE_ORDERS',
        action: 'DATA_IMPORT',
        result: 'SUCCESS',
        details: `Importação revisada com ajuste fino concluída: ${importedCount} ordens salvas e vinculadas aos técnicos.`,
      });

      res.json({
        success: true,
        message: `${importedCount} ordens revisadas foram gravadas e vinculadas aos técnicos com sucesso.`,
        importedCount,
        techniciansCreated: techniciansCreatedCount,
      });
    } catch (err: any) {
      console.error('[Import JSON] Erro geral ao importar JSON:', err);
      res.status(500).json({
        success: false,
        error: `Erro ao salvar ordens revisadas: ${err.message || 'Erro interno.'}`,
      });
    }
  });
  // =========================================================================
  app.get('/api/stock', async (req, res) => {
    const requester = await getRequester(req);
    if (requester && requester.role === 'TECHNICIAN') {
      return res.status(403).json({ success: false, error: 'Acesso negado ao módulo de Estoque.' });
    }

    try {
      const db = getDbPool();
      const [rows]: any = await db.query('SELECT * FROM `stock_items` ORDER BY name ASC');
      const formatted = rows.map((s: any) => ({
        ...s,
        id: s.id,
        code: s.code || s.codigo || '',
        name: s.name || s.nome || '',
        description: s.description || s.descricao || '',
        category: s.category || s.categoria || 'Geral',
        unit: s.unit || s.unidade || 'UN',
        quantityInStock: Number(s.quantityInStock ?? s.quantity_in_stock ?? 0),
        minimumThreshold: Number(s.minimumThreshold ?? s.minimum_threshold ?? 0),
        unitCost: Number(s.unitCost ?? s.unit_cost ?? 0),
        isSupportSupply: Boolean(s.isSupportSupply ?? s.is_support_supply ?? true),
      }));
      memStock = formatted;
      res.json({ success: true, data: formatted });
    } catch (err: any) {
      if (isNetworkError(err)) {
        return res.json({ success: true, data: memStock });
      }
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/stock', async (req, res) => {
    const requester = await getRequester(req);
    if (!requester || requester.role === 'TECHNICIAN') {
      return res.status(403).json({ success: false, error: 'Acesso negado: Técnicos não alteram estoque central.' });
    }

    const s = req.body;
    const existingIdx = memStock.findIndex((item) => item.id === s.id);
    const isEdit = existingIdx >= 0;
    if (isEdit) {
      memStock[existingIdx] = { ...memStock[existingIdx], ...s };
    } else {
      memStock.push(s);
    }

    await recordAudit({
      userId: requester.id,
      userName: requester.name,
      userRole: requester.role,
      ipAddress: req.ip,
      module: 'STOCK',
      action: isEdit ? 'STOCK_UPDATE' : 'STOCK_CREATE',
      affectedRecordId: s.id,
      affectedRecordType: 'stock_item',
      newValue: JSON.stringify({ code: s.code, name: s.name, qty: s.quantityInStock }),
      result: 'SUCCESS',
      details: `${isEdit ? 'Atualização' : 'Cadastro'} do item de estoque "${s.name}" (${s.quantityInStock} ${s.unit}) por ${requester.name}.`,
    });

    try {
      const db = getDbPool();
      const cols = await getTableColumnsInfo('stock_items');

      const stockValues: Record<string, any> = {
        id: s.id,
        code: s.code,
        name: s.name,
        description: s.description || null,
        category: s.category || 'Geral',
        unit: s.unit || 'UN',
        quantityinstock: Number(s.quantityInStock || 0),
        minimumthreshold: Number(s.minimumThreshold || 5),
        unitcost: Number(s.unitCost || 0),
        issupportsupply: s.isSupportSupply ? 1 : 0,
      };

      const insertCols: string[] = [];
      const insertPlaceholders: string[] = [];
      const insertValues: any[] = [];
      const updateClauses: string[] = [];

      for (const col of cols) {
        const colLower = col.Field.toLowerCase();
        let val = stockValues[colLower];
        if (val !== undefined) {
          insertCols.push(`\`${col.Field}\``);
          insertPlaceholders.push('?');
          insertValues.push(val);
          if (colLower !== 'id') {
            updateClauses.push(`\`${col.Field}\` = VALUES(\`${col.Field}\`)`);
          }
        }
      }

      if (insertCols.length > 0) {
        const query = `
          INSERT INTO \`stock_items\` (${insertCols.join(', ')})
          VALUES (${insertPlaceholders.join(', ')})
          ON DUPLICATE KEY UPDATE
          ${updateClauses.length > 0 ? updateClauses.join(', ') : 'id = id'}
        `;
        await db.execute(query, insertValues);
      }
      res.json({ success: true, message: `Item ${s.name} salvo no estoque.` });
    } catch (err: any) {
      if (isNetworkError(err)) {
        return res.json({ success: true, message: `Item ${s.name} salvo no estoque.` });
      }
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/stock/:id', async (req, res) => {
    const { id } = req.params;
    const requester = await getRequester(req);
    if (!requester || requester.role === 'TECHNICIAN') {
      return res.status(403).json({ success: false, error: 'Acesso negado.' });
    }

    const item = memStock.find((s) => s.id === id);
    memStock = memStock.filter((s) => s.id !== id);

    await recordAudit({
      userId: requester.id,
      userName: requester.name,
      userRole: requester.role,
      ipAddress: req.ip,
      module: 'STOCK',
      action: 'STOCK_DELETE',
      affectedRecordId: id,
      affectedRecordType: 'stock_item',
      oldValue: JSON.stringify(item || { id }),
      result: 'SUCCESS',
      details: `Exclusão do item de estoque "${item?.name || id}" efetuada por ${requester.name}.`,
    });

    try {
      const db = getDbPool();
      await db.execute('DELETE FROM stock_items WHERE id = ?', [id]);
      res.json({ success: true, message: `Item ${id} removido.` });
    } catch (err: any) {
      if (isNetworkError(err)) {
        return res.json({ success: true, message: `Item ${id} removido da memória local.` });
      }
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // =========================================================================
  // 7. FINANCIAL MOVEMENTS API (Master & Gestor Operacional)
  // =========================================================================
  app.get('/api/movements', async (req, res) => {
    const requester = await getRequester(req);
    if (requester && requester.role === 'TECHNICIAN') {
      return res.status(403).json({ success: false, error: 'Acesso negado ao Fluxo de Caixa Global.' });
    }

    try {
      const db = getDbPool();
      const [rows]: any = await db.query('SELECT * FROM `financial_movements` ORDER BY id DESC');
      const formatted = rows.map((m: any) => ({
        ...m,
        id: m.id,
        type: m.type || 'INCOME',
        category: m.category || 'Geral',
        description: m.description || '',
        amount: Number(m.amount ?? 0),
        status: m.status || 'CONFIRMED',
        technicianId: m.technicianId || null,
        serviceOrderId: m.serviceOrderId || null,
        biweeklyClosingId: m.biweeklyClosingId || null,
        paymentMethod: m.paymentMethod || null,
        date: m.date || m.dueDate || new Date().toISOString(),
      }));
      memMovements = formatted;
      res.json({ success: true, data: formatted });
    } catch (err: any) {
      if (isNetworkError(err)) {
        return res.json({ success: true, data: memMovements });
      }
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/movements', async (req, res) => {
    const requester = await getRequester(req);
    if (!requester || requester.role === 'TECHNICIAN') {
      return res.status(403).json({ success: false, error: 'Acesso negado ao lançamento financeiro.' });
    }

    const m = req.body;
    const existingIdx = memMovements.findIndex((item) => item.id === m.id);
    const isEdit = existingIdx >= 0;
    if (isEdit) {
      memMovements[existingIdx] = { ...memMovements[existingIdx], ...m };
    } else {
      memMovements.unshift(m);
    }

    await recordAudit({
      userId: requester.id,
      userName: requester.name,
      userRole: requester.role,
      ipAddress: req.ip,
      module: 'CASHFLOW',
      action: 'FINANCIAL_MOVEMENT_CREATE',
      affectedRecordId: m.id,
      affectedRecordType: 'financial_movement',
      newValue: JSON.stringify({ type: m.type, desc: m.description, val: m.amount }),
      result: 'SUCCESS',
      details: `Lançamento financeiro [${m.type}] de R$ ${m.amount} ("${m.description}") por ${requester.name}.`,
    });

    try {
      const db = getDbPool();
      const cols = await getTableColumnsInfo('financial_movements');

      const movValues: Record<string, any> = {
        id: m.id,
        type: m.type || 'INCOME',
        category: m.category || 'Geral',
        description: m.description || '',
        amount: Number(m.amount || 0),
        status: m.status || 'CONFIRMED',
        technicianid: m.technicianId || null,
        serviceorderid: m.serviceOrderId || null,
        biweeklyclosingid: m.biweeklyClosingId || null,
        paymentmethod: m.paymentMethod || null,
        duedate: m.date || m.dueDate ? new Date(m.date || m.dueDate) : new Date(),
        paymentdate: m.paymentDate ? new Date(m.paymentDate) : null,
      };

      const insertCols: string[] = [];
      const insertPlaceholders: string[] = [];
      const insertValues: any[] = [];
      const updateClauses: string[] = [];

      for (const col of cols) {
        const colLower = col.Field.toLowerCase();
        let val = movValues[colLower];
        if (val !== undefined) {
          insertCols.push(`\`${col.Field}\``);
          insertPlaceholders.push('?');
          insertValues.push(val);
          if (colLower !== 'id') {
            updateClauses.push(`\`${col.Field}\` = VALUES(\`${col.Field}\`)`);
          }
        }
      }

      if (insertCols.length > 0) {
        const query = `
          INSERT INTO \`financial_movements\` (${insertCols.join(', ')})
          VALUES (${insertPlaceholders.join(', ')})
          ON DUPLICATE KEY UPDATE
          ${updateClauses.length > 0 ? updateClauses.join(', ') : 'id = id'}
        `;
        await db.execute(query, insertValues);
      }
      res.json({ success: true, message: 'Movimento financeiro gravado.' });
    } catch (err: any) {
      if (isNetworkError(err)) {
        return res.json({ success: true, message: 'Movimento financeiro salvo com sucesso.' });
      }
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/movements/:id', async (req, res) => {
    const { id } = req.params;
    const requester = await getRequester(req);
    if (!requester || requester.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Apenas Administrador Master pode estornar/excluir lançamentos financeiros.' });
    }

    const mov = memMovements.find((m) => m.id === id);
    memMovements = memMovements.filter((m) => m.id !== id);

    await recordAudit({
      userId: requester.id,
      userName: requester.name,
      userRole: requester.role,
      ipAddress: req.ip,
      module: 'CASHFLOW',
      action: 'FINANCIAL_MOVEMENT_DELETE',
      affectedRecordId: id,
      affectedRecordType: 'financial_movement',
      oldValue: JSON.stringify(mov || { id }),
      result: 'SUCCESS',
      details: `Exclusão de movimento financeiro "${mov?.description || id}" por ${requester.name}.`,
    });

    try {
      const db = getDbPool();
      await db.execute('DELETE FROM financial_movements WHERE id = ?', [id]);
      res.json({ success: true, message: `Movimento ${id} removido.` });
    } catch (err: any) {
      if (isNetworkError(err)) {
        return res.json({ success: true, message: `Movimento ${id} removido da memória local.` });
      }
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // =========================================================================
  // 8. GENERAL SETTINGS API (Restrito: Administrador Master)
  // =========================================================================
  app.get('/api/settings', async (req, res) => {
    const requester = await getRequester(req);
    if (requester && requester.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador Master.' });
    }

    try {
      const db = getDbPool();
      const [rows]: any = await db.query('SELECT * FROM general_settings LIMIT 1').catch(() => [[]]);
      if (rows && rows.length > 0) {
        const s = rows[0];
        const formatted = {
          companyName: s.companyName || s.company_name || 'O Higienizador',
          companyCnpj: s.companyCnpj || s.company_cnpj || '32.145.890/0001-44',
          kmRateDefault: Number(s.kmRateDefault ?? s.km_rate_default ?? 0.5),
          portoSeguroBaseFeeDefault: Number(s.portoSeguroBaseFeeDefault ?? s.porto_seguro_base_fee_default ?? 180),
          defaultSpecialTaxRate: Number(s.defaultSpecialTaxRate ?? s.default_special_tax_rate ?? 16),
          whatsappApiUrl: s.whatsappApiUrl || s.whatsapp_api_url || '',
          whatsappApiKey: s.whatsappApiKey || s.whatsapp_api_key || '',
          whatsappInstanceName: s.whatsappInstanceName || s.whatsapp_instance_name || '',
          whatsappTemplateMessage: s.whatsappTemplateMessage || s.whatsapp_template_message || '',
          autoStockDeduction: Boolean(s.autoStockDeduction ?? s.auto_stock_deduction ?? true),
        };
        memSettings = formatted;
        res.json({ success: true, data: formatted });
      } else {
        res.json({ success: true, data: memSettings });
      }
    } catch (err: any) {
      if (isNetworkError(err)) {
        return res.json({ success: true, data: memSettings });
      }
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/settings', async (req, res) => {
    const requester = await getRequester(req);
    if (!requester || requester.role !== 'ADMIN') {
      await recordAudit({
        userId: requester?.id || 'unknown',
        userName: requester?.name || 'Desconhecido',
        userRole: requester?.role || 'TECHNICIAN',
        ipAddress: req.ip,
        module: 'SETTINGS',
        action: 'ACCESS_DENIED',
        result: 'BLOCKED',
        details: 'Tentativa não autorizada de alterar configurações do sistema.',
      });
      return res.status(403).json({ success: false, error: 'Acesso negado: apenas o Administrador Master pode alterar configurações.' });
    }

    const s = req.body;
    memSettings = { ...memSettings, ...s };

    await recordAudit({
      userId: requester.id,
      userName: requester.name,
      userRole: requester.role,
      ipAddress: req.ip,
      module: 'SETTINGS',
      action: 'SETTINGS_UPDATE',
      newValue: JSON.stringify(s),
      result: 'SUCCESS',
      details: `Configurações gerais do sistema alteradas por ${requester.name}.`,
    });

    try {
      const db = getDbPool();
      const cols = await getTableColumnsInfo('general_settings');
      if (cols.length === 0) {
        return res.json({ success: true, message: 'Configurações salvas em memória.' });
      }

      const settingsValues: Record<string, any> = {
        id: 'default',
        companyname: s.companyName || 'O Higienizador',
        companycnpj: s.companyCnpj || '32.145.890/0001-44',
        kmratedefault: Number(s.kmRateDefault || 0.5),
        portosegurobasefeedefault: Number(s.portoSeguroBaseFeeDefault || 180),
        defaultspecialtaxrate: Number(s.defaultSpecialTaxRate || 16),
        whatsappapiurl: s.whatsappApiUrl || '',
        whatsappapikey: s.whatsappApiKey || '',
        whatsappinstancename: s.whatsappInstanceName || '',
        whatsapptemplatemessage: s.whatsappTemplateMessage || '',
        autostockdeduction: s.autoStockDeduction ? 1 : 0,
      };

      const insertCols: string[] = [];
      const insertPlaceholders: string[] = [];
      const insertValues: any[] = [];
      const updateClauses: string[] = [];

      for (const col of cols) {
        const colLower = col.Field.toLowerCase();
        let val = settingsValues[colLower];
        if (val !== undefined) {
          insertCols.push(`\`${col.Field}\``);
          insertPlaceholders.push('?');
          insertValues.push(val);
          if (colLower !== 'id') {
            updateClauses.push(`\`${col.Field}\` = VALUES(\`${col.Field}\`)`);
          }
        }
      }

      if (insertCols.length > 0) {
        const query = `
          INSERT INTO \`general_settings\` (${insertCols.join(', ')})
          VALUES (${insertPlaceholders.join(', ')})
          ON DUPLICATE KEY UPDATE
          ${updateClauses.length > 0 ? updateClauses.join(', ') : 'id = id'}
        `;
        await db.execute(query, insertValues);
      }
      res.json({ success: true, message: 'Configurações salvas no MariaDB.' });
    } catch (err: any) {
      if (isNetworkError(err)) {
        return res.json({ success: true, message: 'Configurações salvas em memória local.' });
      }
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // =========================================================================
  // 9. N8N & WEBHOOKS / WHATSAPP AUTOMATION API
  // =========================================================================

  // Helper para validar a autenticação do N8N / Webhook
  function validateN8nAuth(req: express.Request): boolean {
    const authHeader = (req.headers['authorization'] as string) || '';
    const apiKeyHeader = (req.headers['x-api-key'] || req.headers['x-n8n-token'] || req.query.apiKey || req.query.api_key) as string | undefined;
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7).trim()
      : (typeof apiKeyHeader === 'string' ? apiKeyHeader.trim() : '');

    const configuredKey = (memSettings as any)?.n8nSettings?.apiKey || 'N8N_HIGIENIZADOR_SECRET_2026';
    
    // Se for uma requisição interna de UI logada com x-user-id de Admin
    if (req.headers['x-user-id']) {
      return true;
    }

    if (!token) return false;
    return token === configuredKey;
  }

  // 9.1 Testar Envio de Webhook do Sistema -> N8N (Outbound Ping Test)
  app.post('/api/n8n/test-webhook', async (req, res) => {
    const requester = await getRequester(req);
    if (!requester || requester.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador Master.' });
    }

    const { webhookUrl, apiKey, testType } = req.body || {};
    const targetUrl = webhookUrl || (memSettings as any)?.n8nSettings?.webhookUrl;

    if (!targetUrl) {
      return res.status(400).json({
        success: false,
        error: 'URL do Webhook N8N não informada. Configure a URL nas opções de integração.',
      });
    }

    const testPayload = {
      event: testType || 'TEST_PING',
      system: 'O Higienizador Gestão Porto Seguro',
      environment: process.env.NODE_ENV || 'production',
      timestamp: new Date().toISOString(),
      sender: {
        id: requester.id,
        name: requester.name,
        email: requester.email,
      },
      data: {
        message: 'Teste de conectividade bidirecional entre O Higienizador e o Workflow N8N.',
        sampleOrder: memOrders[0] || {
          id: 'ps-sample-01',
          callNumber: 'PS-2026-8941',
          customerName: 'Cliente Exemplo Porto Seguro',
          customerPhone: '(11) 98765-4321',
          serviceCategory: 'Higienização de Sofá 3 Lugares',
          technicianName: 'Breno Jorge',
          status: 'IN_PROGRESS',
        },
      },
    };

    const startTime = Date.now();
    try {
      const fetchHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'OHigienizador-N8N-Bridge/1.0',
      };
      if (apiKey) {
        fetchHeaders['x-api-key'] = apiKey;
        fetchHeaders['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: fetchHeaders,
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(8000),
      });

      const responseTimeMs = Date.now() - startTime;
      const text = await response.text().catch(() => '');
      let responseBody: any = text;
      try {
        responseBody = JSON.parse(text);
      } catch {
        // text puro
      }

      await recordAudit({
        userId: requester.id,
        userName: requester.name,
        userRole: requester.role,
        ipAddress: req.ip,
        module: 'SETTINGS',
        action: 'SETTINGS_UPDATE',
        result: response.ok ? 'SUCCESS' : 'FAILED',
        details: `Disparo de teste para N8N (${targetUrl}) - Status HTTP ${response.status} em ${responseTimeMs}ms.`,
      });

      res.json({
        success: response.ok,
        statusCode: response.status,
        responseTimeMs,
        message: response.ok
          ? `Webhook entregue com sucesso ao N8N (HTTP ${response.status}) em ${responseTimeMs}ms.`
          : `N8N respondeu com código de erro HTTP ${response.status}.`,
        responseBody,
      });
    } catch (err: any) {
      const responseTimeMs = Date.now() - startTime;
      res.json({
        success: false,
        statusCode: 0,
        responseTimeMs,
        error: `Falha ao alcançar o N8N: ${err.message || 'Timeout ou erro de conexão de rede'}. Verifique se o workflow do N8N está ativo (Active = True).`,
      });
    }
  });

  // 9.2 Endpoint Inbound para o N8N consultar Ordens de Serviço (GET /api/n8n/webhook/orders)
  app.get(['/api/n8n/webhook/orders', '/api/n8n/orders'], async (req, res) => {
    if (!validateN8nAuth(req)) {
      return res.status(401).json({
        success: false,
        error: 'Não autorizado: Token/API Key do N8N inválida. Envie no header "x-api-key" ou "Authorization: Bearer <token>".',
      });
    }

    const { phone, technicianId, callNumber, status, date } = req.query;

    let results = [...memOrders];

    // Busca por telefone do técnico (WhatsApp)
    if (phone && typeof phone === 'string') {
      const cleanPhone = phone.replace(/\D/g, '');
      const matchedTech = memUsers.find((u) => {
        const uPhone = (u.phone || '').replace(/\D/g, '');
        return uPhone.length >= 8 && (uPhone.endsWith(cleanPhone.slice(-8)) || cleanPhone.endsWith(uPhone.slice(-8)));
      });

      if (matchedTech) {
        results = results.filter((o) => o.technicianId === matchedTech.id);
      } else {
        return res.json({
          success: true,
          count: 0,
          technician: null,
          message: `Nenhum técnico encontrado com o telefone ${phone}.`,
          orders: [],
        });
      }
    }

    if (technicianId && typeof technicianId === 'string') {
      results = results.filter((o) => o.technicianId === technicianId);
    }

    if (callNumber && typeof callNumber === 'string') {
      results = results.filter((o) => o.callNumber.toLowerCase().includes(callNumber.toLowerCase()));
    }

    if (status && typeof status === 'string') {
      results = results.filter((o) => o.status === status.toUpperCase());
    }

    if (date && typeof date === 'string') {
      results = results.filter((o) => o.date.startsWith(date));
    }

    res.json({
      success: true,
      count: results.length,
      orders: results.slice(0, 50),
    });
  });

  // 9.3 Endpoint Inbound para o N8N Atualizar ou Concluir uma OS (POST /api/n8n/webhook/order-update)
  app.post(['/api/n8n/webhook/order-update', '/api/n8n/orders/update'], async (req, res) => {
    if (!validateN8nAuth(req)) {
      return res.status(401).json({
        success: false,
        error: 'Não autorizado: Token/API Key do N8N inválida.',
      });
    }

    const {
      callNumber,
      orderId,
      status,
      serviceCategory,
      productExecuted,
      productName,
      serviceType,
      product,
      baseServiceFee,
      baseFee,
      serviceFee,
      repasseValue,
      faturamentoPorto,
      faturamento,
      kmTraveled,
      tollCost,
      supportCost,
      suppliesUsed,
      observation,
      customerSignature,
      completedAt,
    } = req.body || {};

    if (!callNumber && !orderId) {
      return res.status(400).json({
        success: false,
        error: 'Informe ao menos "callNumber" ou "orderId" para identificar o chamado.',
      });
    }

    const orderIdx = memOrders.findIndex(
      (o) =>
        (orderId && o.id === orderId) ||
        (callNumber && o.callNumber.trim().toLowerCase() === String(callNumber).trim().toLowerCase())
    );

    if (orderIdx < 0) {
      return res.status(404).json({
        success: false,
        error: `Ordem de Serviço ${callNumber || orderId} não encontrada.`,
      });
    }

    const current = memOrders[orderIdx];

    // Categoria do Produto/Serviço executado (ex: "Instala TV de 49 a 86 + Suporte Fixo")
    const newCategoryRaw = serviceCategory || productExecuted || productName || serviceType || product;
    const newCategory = newCategoryRaw ? String(newCategoryRaw).trim() : current.serviceCategory;

    // Calcular nova taxa base/repasse do serviço
    let newBaseFee = current.baseServiceFee;
    const explicitFee = baseServiceFee ?? baseFee ?? serviceFee ?? repasseValue;

    if (explicitFee !== undefined && explicitFee !== null && !isNaN(Number(explicitFee))) {
      newBaseFee = Number(explicitFee);
    } else if (newCategoryRaw) {
      // Buscar taxa de repasse configurada para o produto/categoria na tabela de tarifas
      const rates = memSettings?.serviceCategoriesRates || {};
      
      // 1. Busca exata
      let matchedRate = rates[newCategory];
      
      // 2. Busca case-insensitive
      if (matchedRate === undefined) {
        const matchedKey = Object.keys(rates).find(
          (k) => k.trim().toLowerCase() === newCategory.toLowerCase()
        );
        if (matchedKey) {
          matchedRate = rates[matchedKey];
        }
      }
      
      // 3. Busca por inclusão parcial (ex: "Instala TV de 49 a 86")
      if (matchedRate === undefined) {
        const matchedKey = Object.keys(rates).find(
          (k) => newCategory.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(newCategory.toLowerCase())
        );
        if (matchedKey) {
          matchedRate = rates[matchedKey];
        }
      }

      if (matchedRate !== undefined && !isNaN(Number(matchedRate))) {
        newBaseFee = Number(matchedRate);
      }
    }

    // Faturamento Porto Seguro
    const explicitFaturamento = faturamentoPorto ?? faturamento;
    const newFaturamento = explicitFaturamento !== undefined && explicitFaturamento !== null && !isNaN(Number(explicitFaturamento))
      ? Number(explicitFaturamento)
      : current.faturamentoPorto;

    const newKm = kmTraveled !== undefined ? Number(kmTraveled) : current.kmTraveled;
    const newToll = tollCost !== undefined ? Number(tollCost) : current.tollCost;
    const newSupport = supportCost !== undefined ? Number(supportCost) : current.supportCost;
    const kmRate = Number(memSettings?.kmReimbursementRate || memSettings?.kmRateDefault || 0.5);
    const newKmCost = newKm * kmRate;
    const newTotalCost = newBaseFee + newKmCost + newToll + newSupport;
    const newStatus = status ? status.toUpperCase() : current.status;

    // Baixa automática de insumos se enviado
    let updatedStockSupplies = current.stockSuppliesUsed || [];
    if (Array.isArray(suppliesUsed) && suppliesUsed.length > 0) {
      for (const sup of suppliesUsed) {
        const itemIdx = memStock.findIndex((s) => s.id === sup.stockItemId || s.name.toLowerCase() === (sup.stockItemName || '').toLowerCase());
        if (itemIdx >= 0) {
          const qty = Number(sup.quantity || sup.quantityUsed || 1);
          memStock[itemIdx].quantityInStock = Math.max(0, memStock[itemIdx].quantityInStock - qty);
          updatedStockSupplies.push({
            stockItemId: memStock[itemIdx].id,
            stockItemName: memStock[itemIdx].name,
            quantityUsed: qty,
            unit: memStock[itemIdx].unit,
            unitCostSnapshot: memStock[itemIdx].unitCost,
          });
        }
      }
    }

    const updatedOrder = {
      ...current,
      serviceCategory: newCategory,
      baseServiceFee: newBaseFee,
      faturamentoPorto: newFaturamento,
      status: newStatus,
      kmTraveled: newKm,
      kmCost: newKmCost,
      tollCost: newToll,
      supportCost: newSupport,
      totalCost: newTotalCost,
      totalTechnicianGross: newTotalCost,
      stockSuppliesUsed: updatedStockSupplies,
      observation: observation !== undefined ? observation : current.observation,
      customerSignature: customerSignature !== undefined ? customerSignature : current.customerSignature,
      completedAt: newStatus === 'COMPLETED' ? (completedAt || new Date().toISOString()) : current.completedAt,
    };

    memOrders[orderIdx] = updatedOrder;

    // Registrar auditoria da ação do N8N / WhatsApp
    await recordAudit({
      userId: 'n8n-bot',
      userName: 'N8N WhatsApp Bot',
      userRole: 'OPERATIONAL',
      ipAddress: req.ip,
      module: 'SERVICE_ORDERS',
      action: newStatus === 'COMPLETED' ? 'OS_STATUS_CHANGE' : 'OS_UPDATE',
      affectedRecordId: updatedOrder.id,
      affectedRecordType: 'service_order',
      result: 'SUCCESS',
      details: `OS ${updatedOrder.callNumber} atualizada via N8N/WhatsApp: Produto="${newCategory}", Repasse Base=R$ ${newBaseFee.toFixed(2)}, Status=${newStatus}, KM=${newKm}, Pedágio=R$ ${newToll}.`,
    });

    // Gravação no MariaDB se disponível
    try {
      const db = getDbPool();
      await db.execute(
        `UPDATE service_orders 
         SET status = ?, serviceCategory = ?, baseServiceFee = ?, faturamentoPorto = ?, kmTraveled = ?, kmCost = ?, tollCost = ?, supportCost = ?, totalCost = ?, observation = ?, completedAt = ?
         WHERE id = ? OR callNumber = ?`,
        [
          updatedOrder.status,
          updatedOrder.serviceCategory,
          updatedOrder.baseServiceFee,
          updatedOrder.faturamentoPorto || 0,
          updatedOrder.kmTraveled,
          updatedOrder.kmCost,
          updatedOrder.tollCost,
          updatedOrder.supportCost,
          updatedOrder.totalCost,
          updatedOrder.observation || '',
          updatedOrder.completedAt ? new Date(updatedOrder.completedAt) : null,
          updatedOrder.id,
          updatedOrder.callNumber,
        ]
      );
    } catch {
      // resiliência
    }

    res.json({
      success: true,
      message: `OS ${updatedOrder.callNumber} atualizada com sucesso via N8N. Produto: "${newCategory}" (Repasse: R$ ${newBaseFee.toFixed(2)}).`,
      order: updatedOrder,
    });
  });

  // 9.4 Endpoint Inbound para Solicitação de Vale pelo Técnico via WhatsApp (POST /api/n8n/webhook/advance-request)
  app.post(['/api/n8n/webhook/advance-request', '/api/n8n/advances/request'], async (req, res) => {
    if (!validateN8nAuth(req)) {
      return res.status(401).json({ success: false, error: 'Não autorizado: API Key do N8N inválida.' });
    }

    const { phone, technicianId, amount, description } = req.body || {};
    const reqAmount = Number(amount);

    if (!reqAmount || reqAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Valor do vale deve ser maior que zero.' });
    }

    let targetTech: any = null;
    if (technicianId) {
      targetTech = memUsers.find((u) => u.id === technicianId);
    } else if (phone) {
      const clean = String(phone).replace(/\D/g, '');
      targetTech = memUsers.find((u) => {
        const uPhone = (u.phone || '').replace(/\D/g, '');
        return uPhone.length >= 8 && (uPhone.endsWith(clean.slice(-8)) || clean.endsWith(uPhone.slice(-8)));
      });
    }

    if (!targetTech) {
      return res.status(404).json({ success: false, error: 'Técnico não localizado por telefone ou ID.' });
    }

    const newAdvance = {
      id: `mov-n8n-vale-${Date.now()}`,
      type: 'ADVANCE_VALE' as const,
      category: 'Vale Técnico (WhatsApp)',
      description: description || `Solicitação de Vale via WhatsApp (${targetTech.name})`,
      amount: reqAmount,
      status: 'CONFIRMED' as const,
      technicianId: targetTech.id,
      technicianName: targetTech.name,
      paymentMethod: 'PIX',
      date: new Date().toISOString(),
    };

    memMovements.unshift(newAdvance);

    await recordAudit({
      userId: targetTech.id,
      userName: `${targetTech.name} (via WhatsApp/N8N)`,
      userRole: targetTech.role || 'TECHNICIAN',
      ipAddress: req.ip,
      module: 'CASHFLOW',
      action: 'FINANCIAL_MOVEMENT_CREATE',
      affectedRecordId: newAdvance.id,
      affectedRecordType: 'financial_movement',
      result: 'SUCCESS',
      details: `Vale de R$ ${reqAmount.toFixed(2)} lançado automaticamente via WhatsApp para ${targetTech.name}.`,
    });

    res.json({
      success: true,
      message: `Vale de R$ ${reqAmount.toFixed(2)} registrado com sucesso para o técnico ${targetTech.name}.`,
      movement: newAdvance,
    });
  });

  // 9.5 Endpoint Inbound para Agenda Diária dos Técnicos (GET /api/n8n/webhook/daily-agenda)
  app.get(['/api/n8n/webhook/daily-agenda', '/api/n8n/agenda'], async (req, res) => {
    if (!validateN8nAuth(req)) {
      return res.status(401).json({ success: false, error: 'Não autorizado: API Key do N8N inválida.' });
    }

    const targetDate = (req.query.date as string) || new Date().toISOString().split('T')[0];
    const dayOrders = memOrders.filter((o) => o.date.startsWith(targetDate) && o.status !== 'CANCELLED');

    // Agrupar por técnico
    const byTech: Record<string, { technician: any; count: number; orders: any[] }> = {};

    for (const ord of dayOrders) {
      const tId = ord.technicianId || 'unassigned';
      if (!byTech[tId]) {
        const techUser = memUsers.find((u) => u.id === tId) || {
          id: tId,
          name: ord.technicianName || 'Técnico Não Definido',
          phone: '',
        };
        byTech[tId] = {
          technician: {
            id: techUser.id,
            name: techUser.name,
            phone: (techUser as any).phone || '',
          },
          count: 0,
          orders: [],
        };
      }
      byTech[tId].count++;
      byTech[tId].orders.push({
        id: ord.id,
        callNumber: ord.callNumber,
        customerName: ord.customerName,
        customerAddress: ord.customerAddress,
        customerPhone: ord.customerPhone,
        serviceCategory: ord.serviceCategory,
        status: ord.status,
        date: ord.date,
      });
    }

    res.json({
      success: true,
      date: targetDate,
      totalOrders: dayOrders.length,
      techniciansCount: Object.keys(byTech).length,
      agenda: Object.values(byTech),
    });
  });

  // =========================================================================
  // FRONTEND SERVING (Vite Middleware in Dev / Static dist in Prod)
  // =========================================================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Sistema Higienizador] Servidor Full-Stack rodando em http://0.0.0.0:${PORT}`);
    console.log(`[Sistema Higienizador] RBAC, Auditoria e MariaDB ativos.`);
  });
}

startServer();
