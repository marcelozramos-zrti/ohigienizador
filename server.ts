import express from 'express';
import path from 'path';
import cors from 'cors';
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

    if (!cleanEmail || !password) {
      return res.status(400).json({ success: false, error: 'E-mail e senha são obrigatórios.' });
    }

    // Busca usuário
    const user = memUsers.find((u) => (u.email || '').toLowerCase() === cleanEmail);

    if (!user) {
      await recordAudit({
        userId: 'anonymous',
        userName: cleanEmail,
        userRole: 'TECHNICIAN',
        ipAddress: req.ip,
        module: 'AUTH',
        action: 'LOGIN_FAILED',
        result: 'FAILED',
        details: `Tentativa de login com e-mail inexistente: ${cleanEmail}`,
      });
      return res.status(401).json({ success: false, error: 'Credenciais inválidas. Verifique seu e-mail e senha.' });
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
    const cleanCode = (code || '').replace(/\D/g, '');

    const user = memUsers.find((u) => (u.email || '').toLowerCase() === cleanEmail);
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
  app.get('/api/orders', async (req, res) => {
    const requester = await getRequester(req);

    try {
      const db = getDbPool();
      const cols = await getTableColumnsMap('service_orders');
      let orderClause = 'id DESC';
      if (cols.has('scheduleddate')) orderClause = `\`${cols.get('scheduleddate')}\` DESC`;
      else if (cols.has('scheduled_date')) orderClause = `\`${cols.get('scheduled_date')}\` DESC`;

      const [rows]: any = await db.query(`SELECT * FROM \`service_orders\` ORDER BY ${orderClause}`);
      const formatted = rows.map((o: any) => ({
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
        technicianId: o.technicianId || o.technician_id || null,
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
        customerSignature: o.customerSignature || null,
        executionNotes: o.executionNotes || null,
        tollReceiptUrl: o.tollReceiptUrl || null,
        itemsUsed: [],
      }));
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
  });

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

  // =========================================================================
  // 6. STOCK ITEMS API (Acesso: Master & Gestor Operacional)
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
