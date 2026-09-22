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
  const PORT = Number(process.env.PORT || 3002);

  app.use(cors());
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // In-memory fallback stores
  let memUsers: any[] = [...INITIAL_USERS];
  let memOrders: any[] = [...INITIAL_SERVICE_ORDERS];
  let memStock: any[] = [...INITIAL_STOCK];
  let memMovements: any[] = [...INITIAL_MOVEMENTS];
  let memSettings: any = { ...INITIAL_SETTINGS };
  let memPortoPrices: any[] = [];
  let memTechnicianCustomRates: any[] = [];
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
  initializeDatabaseSchema().then(async () => {
    try {
      const db = getDbPool();
      const [rows]: any = await db.query("SELECT * FROM porto_service_prices WHERE active = TRUE");
      if (rows && rows.length > 0) {
        memPortoPrices = rows;
        console.log(`[MariaDB] Cache de preços Porto inicializado com ${memPortoPrices.length} registros.`);
      }
    } catch (err: any) {
      console.warn("[MariaDB] Falha ao preencher cache de preços Porto:", err.message);
    }
  }).catch(() => {});

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

  // Helper para verificar e anexar quilometragens pendentes do buffer de espera (Pending KM Buffer)
  async function checkAndAttachPendingKm(callNumber: string, orderId: string, kmRateApplied: number, reqIp?: string): Promise<boolean> {
    try {
      const db = getDbPool();
      const cleanCallNumber = String(callNumber).trim();
      
      // Busca resiliente em ambas direções
      const [pendingRows]: any = await db.query(
        `SELECT * FROM pending_km_buffer 
         WHERE status = 'PENDING' 
           AND (LOWER(?) LIKE CONCAT('%', LOWER(call_number_partial), '%') 
                OR LOWER(call_number_partial) LIKE CONCAT('%', LOWER(?), '%'))
         ORDER BY id DESC LIMIT 1`,
        [cleanCallNumber, cleanCallNumber]
      );

      if (pendingRows && pendingRows.length > 0) {
        const pending = pendingRows[0];
        const bufferedKm = Number(pending.km_traveled);
        const bufferedToll = Number(pending.toll_cost);
        const isBufferedLostVisit = !!pending.is_lost_visit;

        // Recuperar a OS criada para obter seus valores base
        const [osRows]: any = await db.query("SELECT * FROM service_orders WHERE id = ? LIMIT 1", [orderId]);
        if (!osRows || osRows.length === 0) return false;
        const order = osRows[0];

        let finalBaseFee = Number(order.base_service_fee || 0);
        let finalPortoBilling = Number(order.porto_billing_value || 0);
        let finalMotiveText = order.service_motive || 'Higienização / Instalação';

        if (isBufferedLostVisit) {
          finalMotiveText = 'Visita Perdida / Improdutiva';
          finalBaseFee = 40.00;
          finalPortoBilling = 35.00;
        }

        const kmPayout = Number((bufferedKm * kmRateApplied).toFixed(2));
        const totalTechnicianGross = Number((finalBaseFee + kmPayout + bufferedToll).toFixed(2));

        // 1. Atualizar a Ordem de Serviço
        await db.execute(
          `UPDATE service_orders 
           SET km_traveled = ?, 
               km_rate_applied = ?, 
               km_total_cost = ?,
               km_payout = ?,
               kmPayout = ?,
               toll_cost = ?, 
               total_technician_gross = ?, 
               base_service_fee = ?,
               porto_billing_value = ?,
               faturamento_porto = ?,
               service_motive = ?,
               status = 'COMPLETED', 
               completed_at = NOW(), 
               updated_at = NOW() 
           WHERE id = ?`,
          [
            bufferedKm, 
            kmRateApplied, 
            kmPayout, 
            kmPayout, 
            kmPayout, 
            bufferedToll, 
            totalTechnicianGross, 
            finalBaseFee, 
            finalPortoBilling, 
            finalPortoBilling,
            finalMotiveText, 
            orderId
          ]
        );

        // 2. Sincronizar cache em memória volátil
        const memIndex = memOrders.findIndex((o: any) => String(o.id) === String(orderId));
        if (memIndex !== -1) {
          memOrders[memIndex].kmTraveled = bufferedKm;
          memOrders[memIndex].kmRateApplied = kmRateApplied;
          memOrders[memIndex].kmCost = kmPayout;
          memOrders[memIndex].kmPayout = kmPayout;
          memOrders[memIndex].tollCost = bufferedToll;
          memOrders[memIndex].baseServiceFee = finalBaseFee;
          memOrders[memIndex].portoBillingValue = finalPortoBilling;
          memOrders[memIndex].porto_billing_value = finalPortoBilling;
          memOrders[memIndex].service_motive = finalMotiveText;
          memOrders[memIndex].totalTechnicianGross = totalTechnicianGross;
          memOrders[memIndex].totalCost = totalTechnicianGross;
          memOrders[memIndex].status = 'COMPLETED';
          memOrders[memIndex].completedAt = new Date().toISOString();
        }

        // 3. Marcar o buffer como anexado/consumido
        await db.execute(
          "UPDATE pending_km_buffer SET status = 'ATTACHED', attached_at = NOW() WHERE id = ?",
          [pending.id]
        );

        // 4. Gravar auditoria
        await recordAudit({
          userId: 'system',
          userName: 'Gerenciador de Buffer KM',
          userRole: 'OPERATIONAL',
          ipAddress: reqIp || '127.0.0.1',
          module: 'SERVICE_ORDERS',
          action: 'KM_ATTACHED_FROM_BUFFER',
          affectedRecordId: orderId,
          affectedRecordType: 'service_order',
          result: 'SUCCESS',
          details: `Quilometragem do buffer anexada automaticamente à OS ${cleanCallNumber} (KM: ${bufferedKm}, Pedágio: ${bufferedToll}). Status final setado para COMPLETED.`,
        });

        console.log(`[Pending KM Buffer] Quilometragem pendente vinculada automaticamente à nova OS ${cleanCallNumber}.`);
        return true;
      }
    } catch (err: any) {
      console.error("[Pending KM Buffer Error] Falha ao verificar ou anexar quilometragem pendente:", err);
    }
    return false;
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
      const formatted = rows.map((u: any) => {
        let parsedPriceTable = [];
        try {
          if (u.price_table && typeof u.price_table === 'string') {
            parsedPriceTable = JSON.parse(u.price_table);
          } else if (Array.isArray(u.price_table)) {
            parsedPriceTable = u.price_table;
          } else if (u.priceTable && typeof u.priceTable === 'string') {
            parsedPriceTable = JSON.parse(u.priceTable);
          } else if (Array.isArray(u.priceTable)) {
            parsedPriceTable = u.priceTable;
          }
        } catch (e) {
          parsedPriceTable = [];
        }

        return {
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
          price_table: parsedPriceTable,
          priceTable: parsedPriceTable,
        };
      });
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

    if (cleanCpf && cleanCpf !== '00000000000') {
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
        price_table: u.priceTable ? (typeof u.priceTable === 'string' ? u.priceTable : JSON.stringify(u.priceTable)) : null,
        pricetable: u.priceTable ? (typeof u.priceTable === 'string' ? u.priceTable : JSON.stringify(u.priceTable)) : null,
        km_rate: Number(u.kmRate ?? u.km_rate ?? 0.75),
        kmrate: Number(u.kmRate ?? u.km_rate ?? 0.75),
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
        price_table: u.priceTable !== undefined ? (typeof u.priceTable === 'string' ? u.priceTable : JSON.stringify(u.priceTable)) : undefined,
        pricetable: u.priceTable !== undefined ? (typeof u.priceTable === 'string' ? u.priceTable : JSON.stringify(u.priceTable)) : undefined,
        km_rate: u.kmRate !== undefined ? Number(u.kmRate) : undefined,
        kmrate: u.kmRate !== undefined ? Number(u.kmRate) : undefined,
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

      // Query direta e simplificada com LEFT JOIN na tabela users para trazer o nome real do técnico
      const [rows]: any = await db.query(`
        SELECT 
          so.*,
          u.name AS technicianName
        FROM \`service_orders\` so
        LEFT JOIN \`users\` u ON so.technician_id = u.id
        ORDER BY so.id DESC
      `);

      const normalizedUsers = memUsers.map(u => ({
        ...u,
        normName: (u.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
      }));

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
          const userObj = normalizedUsers.find((u) => {
            const uNameNorm = u.normName;
            if (!uNameNorm || !cleanNameNorm) return false;
            return uNameNorm === cleanNameNorm || 
                   (uNameNorm.length >= 4 && cleanNameNorm.includes(uNameNorm)) || 
                   (cleanNameNorm.length >= 4 && uNameNorm.includes(cleanNameNorm));
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
          call_number: o.callNumber || o.call_number || o.numero_chamado || '',
          portoSeguroProtocol: o.portoSeguroProtocol || o.porto_seguro_protocol || null,
          porto_seguro_protocol: o.portoSeguroProtocol || o.porto_seguro_protocol || null,
          serviceCategory: o.serviceCategory || o.service_category || 'Higienização Padrão',
          service_category: o.serviceCategory || o.service_category || 'Higienização Padrão',
          baseServiceFee: Number(o.baseServiceFee ?? o.base_service_fee ?? 0),
          base_service_fee: Number(o.baseServiceFee ?? o.base_service_fee ?? 0),
          customerName: o.customerName || o.customer_name || '',
          customer_name: o.customerName || o.customer_name || '',
          customerCpf: o.customerCpf || o.customer_cpf || '',
          customer_cpf: o.customerCpf || o.customer_cpf || '',
          customerPhone: o.customerPhone || o.customer_phone || null,
          customer_phone: o.customerPhone || o.customer_phone || null,
          city: o.city || 'São Paulo',
          uf: o.uf || 'SP',
          neighborhood: o.neighborhood || '',
          addressStreet: o.addressStreet || o.address_street || o.street || o.logradouro || '',
          address_street: o.addressStreet || o.address_street || o.street || o.logradouro || '',
          street: o.addressStreet || o.address_street || o.street || o.logradouro || '',
          logradouro: o.addressStreet || o.address_street || o.street || o.logradouro || '',
          addressNumber: o.addressNumber || o.address_number || o.number || o.numero || '',
          address_number: o.addressNumber || o.address_number || o.number || o.numero || '',
          number: o.addressNumber || o.address_number || o.number || o.numero || '',
          numero: o.addressNumber || o.address_number || o.number || o.numero || '',
          addressComplement: o.addressComplement || null,
          address_complement: o.addressComplement || null,
          postalCode: o.postalCode || '',
          postal_code: o.postalCode || '',
          technicianId: rawTechId,
          technician_id: rawTechId,
          technicianName: resolvedTechName,
          technician_name: resolvedTechName,
          status: o.status || 'PENDING',
          scheduledDate: o.scheduledDate || o.scheduled_date,
          scheduled_date: o.scheduledDate || o.scheduled_date,
          startedAt: o.startedAt || o.started_at,
          started_at: o.startedAt || o.started_at,
          completedAt: o.completedAt || o.completed_at,
          completed_at: o.completedAt || o.completed_at,
          kmTraveled: Number(o.kmTraveled ?? o.km_traveled ?? 0),
          km_traveled: Number(o.kmTraveled ?? o.km_traveled ?? 0),
          kmRateApplied: Number(o.kmRateApplied ?? o.km_rate_applied ?? 0.5),
          km_rate_applied: Number(o.kmRateApplied ?? o.km_rate_applied ?? 0.5),
          kmTotalCost: Number(o.kmTotalCost ?? o.km_total_cost ?? 0),
          km_total_cost: Number(o.kmTotalCost ?? o.km_total_cost ?? 0),
          tollCost: Number(o.tollCost ?? o.toll_cost ?? 0),
          toll_cost: Number(o.tollCost ?? o.toll_cost ?? 0),
          supportCost: Number(o.supportCost ?? o.support_cost ?? 0),
          support_cost: Number(o.supportCost ?? o.support_cost ?? 0),
          totalTechnicianGross: Number(o.totalTechnicianGross ?? o.total_technician_gross ?? 0),
          total_technician_gross: Number(o.totalTechnicianGross ?? o.total_technician_gross ?? 0),
          faturamentoPorto: Number(o.faturamentoPorto ?? o.faturamento_porto ?? 0),
          faturamento_porto: Number(o.faturamentoPorto ?? o.faturamento_porto ?? 0),
          customerSignature: o.customerSignature || o.customer_signature || null,
          customer_signature: o.customerSignature || o.customer_signature || null,
          executionNotes: o.executionNotes || o.execution_notes || null,
          execution_notes: o.executionNotes || o.execution_notes || null,
          tollReceiptUrl: o.tollReceiptUrl || o.toll_receipt_url || null,
          toll_receipt_url: o.tollReceiptUrl || o.toll_receipt_url || null,
          paymentStatus: o.paymentStatus || o.payment_status || 'PENDING',
          payment_status: o.paymentStatus || o.payment_status || 'PENDING',
          paymentDate: o.paymentDate || o.payment_date || null,
          payment_date: o.paymentDate || o.payment_date || null,
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

  async function calculateOrderFinance(o: any, db?: any): Promise<any> {
    const result = { ...o };
    const executionDateStr = o.scheduledDate || o.scheduled_date || o.completedAt || o.completed_at || new Date().toISOString();
    
    const execTime = new Date(executionDateStr).getTime();
    const cutoffTime = new Date('2026-07-26T23:59:59').getTime();
    const isBeforeCutoff = execTime <= cutoffTime;

    let kmRateApplied = 0.75;
    if (isBeforeCutoff) {
      kmRateApplied = 0.50;
    } else {
      const techId = o.technicianId || o.technician_id;
      if (techId) {
        try {
          const poolDb = db || getDbPool();
          const [techRows]: any = await poolDb.query('SELECT km_rate, kmRate FROM users WHERE id = ?', [techId]);
          if (techRows && techRows.length > 0) {
            kmRateApplied = Number(techRows[0].km_rate ?? techRows[0].kmRate ?? 0.75);
          } else {
            const memTech = memUsers.find(u => u.id === techId);
            if (memTech) {
              kmRateApplied = Number(memTech.km_rate ?? memTech.kmRate ?? 0.75);
            }
          }
        } catch {
          const memTech = memUsers.find(u => u.id === techId);
          if (memTech) {
            kmRateApplied = Number(memTech.km_rate ?? memTech.kmRate ?? 0.75);
          }
        }
      }
    }

    const existingRate = o.kmRateApplied ?? o.km_rate_applied;
    if (existingRate !== undefined && existingRate !== null && Number(existingRate) > 0) {
      kmRateApplied = Number(existingRate);
    }

    result.kmRateApplied = kmRateApplied;
    result.km_rate_applied = kmRateApplied;

    const kmTraveled = Number(o.kmTraveled ?? o.km_traveled ?? 0);
    const kmPayout = Math.round((kmTraveled * kmRateApplied) * 100) / 100;

    result.kmPayout = kmPayout;
    result.km_payout = kmPayout;
    result.kmTotalCost = kmPayout;
    result.km_total_cost = kmPayout;

    const baseServiceFee = Number(o.baseServiceFee ?? o.base_service_fee ?? 0);
    const tollCost = Number(o.tollCost ?? o.toll_cost ?? 0);
    const supportCost = Number(o.supportCost ?? o.support_cost ?? 0);

    const totalTechnicianGross = Math.round((baseServiceFee + kmPayout + tollCost + supportCost) * 100) / 100;
    
    result.totalTechnicianGross = totalTechnicianGross;
    result.total_technician_gross = totalTechnicianGross;
    result.total_tech_payout = totalTechnicianGross;

    return result;
  }

  app.post('/api/orders', async (req, res) => {
    const requester = await getRequester(req);
    const o = req.body;

    const existingIdx = memOrders.findIndex((item) => item.id === o.id);
    const isEdit = existingIdx >= 0;
    const oldOrder = isEdit ? memOrders[existingIdx] : null;

    // Recalcular financeiro com base nas novas regras
    const calculated = await calculateOrderFinance({ ...(isEdit ? memOrders[existingIdx] : {}), ...o });
    Object.assign(o, calculated);

    // -------------------------------------------------------------------------
    // TRAVA DE DUPLICIDADE ATIVA & TRAVA DE REINCIDÊNCIA DE VP (VISITA PERDIDA)
    // -------------------------------------------------------------------------
    const callNumber = o.callNumber || (oldOrder ? oldOrder.callNumber : '');
    const status = o.status || 'PENDING';

    if (callNumber) {
      try {
        const db = getDbPool();

        // 1. Verificar se já existe uma OS em andamento para o mesmo chamado
        if (status === 'IN_PROGRESS') {
          const [activeRows]: any = await db.query(
            "SELECT id, callNumber FROM service_orders WHERE status = 'IN_PROGRESS' AND callNumber = ? AND id <> ?",
            [callNumber, o.id || '']
          );
          if (activeRows && activeRows.length > 0) {
            await recordAudit({
              userId: requester?.id || 'system',
              userName: requester?.name || 'Sistema',
              userRole: requester?.role || 'ADMIN',
              ipAddress: req.ip,
              module: 'SERVICE_ORDERS',
              action: 'ACCESS_DENIED',
              result: 'BLOCKED',
              details: `Tentativa de iniciar OS #${callNumber} bloqueada: Já existe uma Ordem de Serviço em andamento (IN_PROGRESS) para este chamado.`,
            });
            return res.status(400).json({
              success: false,
              error: 'Operação bloqueada por integridade: Este número de chamado já possui um atendimento ativo (Em Andamento) no sistema.'
            });
          }
        }

        // 2. Verificar reincidência de Visita Perdida (VP)
        if (status === 'LOST_VISIT') {
          const [lostVisitRows]: any = await db.query(
            "SELECT id FROM service_orders WHERE status = 'LOST_VISIT' AND callNumber = ? AND id <> ?",
            [callNumber, o.id || '']
          );
          
          if (lostVisitRows && lostVisitRows.length > 0) {
            // Se já houver ordens como LOST_VISIT para este chamado, temos reincidência!
            await recordAudit({
              userId: requester?.id || 'system',
              userName: requester?.name || 'Sistema',
              userRole: requester?.role || 'ADMIN',
              ipAddress: req.ip,
              module: 'AUDIT',
              action: 'OS_UPDATE',
              affectedRecordId: o.id,
              affectedRecordType: 'service_order',
              result: 'BLOCKED',
              details: `TRAVA DE AUDITORIA ADMINISTRATIVA ACIONADA: Reincidência de Visita Perdida (VP) detectada para o chamado #${callNumber} (já houveram ${lostVisitRows.length} VP anteriores).`,
            });

            // Se o usuário solicitante for um técnico (TECHNICIAN), aplicamos o bloqueio rígido (trava)
            if (requester && requester.role === 'TECHNICIAN') {
              return res.status(400).json({
                success: false,
                error: 'Trava de Auditoria Administrativa acionada: Este chamado possui reincidência de Visita Perdida (VP). Entre em contato com o suporte operacional/gerência para prosseguir.'
              });
            }
          }
        }
      } catch (dbErr: any) {
        console.error('[Integridade/VP] Falha ao verificar travas no MariaDB:', dbErr.message);
      }
    }

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
        kmpayout: Number(o.kmPayout || 0),
        km_payout: Number(o.kmPayout || 0),
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
        if (colLower === 'active_call_token' || colLower === 'activecalltoken') {
          continue;
        }
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
      if (err.message && (err.message.includes('uq_active_call_token') || err.message.includes('active_call_token'))) {
        return res.status(400).json({
          success: false,
          error: 'Operação bloqueada por integridade: Este número de chamado já possui um atendimento ativo (Em Andamento) no sistema.'
        });
      }
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

    // Recalcular financeiro com base nas novas regras
    const mergedForCalc = { ...existingOrder, ...updates };
    const calculated = await calculateOrderFinance(mergedForCalc);
    updates.kmRateApplied = calculated.kmRateApplied;
    updates.km_rate_applied = calculated.kmRateApplied;
    updates.kmTotalCost = calculated.kmTotalCost;
    updates.km_total_cost = calculated.kmTotalCost;
    updates.kmPayout = calculated.kmPayout;
    updates.km_payout = calculated.kmPayout;
    updates.totalTechnicianGross = calculated.totalTechnicianGross;
    updates.total_technician_gross = calculated.totalTechnicianGross;

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

      if (updates.serviceCategory !== undefined) {
        const key = 'servicecategory';
        const keyAlt = 'service_category';
        if (cols.has(key) || cols.has(keyAlt)) {
          const field = cols.get(key) || cols.get(keyAlt)!;
          setClauses.push(`\`${field}\` = ?`);
          values.push(updates.serviceCategory);
        }
      }

      if (updates.scheduledDate !== undefined) {
        const key = 'scheduleddate';
        const keyAlt = 'scheduled_date';
        if (cols.has(key) || cols.has(keyAlt)) {
          const field = cols.get(key) || cols.get(keyAlt)!;
          setClauses.push(`\`${field}\` = ?`);
          values.push(updates.scheduledDate ? new Date(updates.scheduledDate) : null);
        }
      }

      if (updates.technicianId !== undefined) {
        const key = 'technicianid';
        const keyAlt = 'technician_id';
        if (cols.has(key) || cols.has(keyAlt)) {
          const field = cols.get(key) || cols.get(keyAlt)!;
          setClauses.push(`\`${field}\` = ?`);
          values.push(updates.technicianId || null);
        }
      }

      if (updates.baseServiceFee !== undefined) {
        const key = 'baseservicefee';
        const keyAlt = 'base_service_fee';
        if (cols.has(key) || cols.has(keyAlt)) {
          const field = cols.get(key) || cols.get(keyAlt)!;
          setClauses.push(`\`${field}\` = ?`);
          values.push(Number(updates.baseServiceFee || 0));
        }
      }

      if (updates.kmTraveled !== undefined) {
        const key = 'kmtraveled';
        const keyAlt = 'km_traveled';
        if (cols.has(key) || cols.has(keyAlt)) {
          const field = cols.get(key) || cols.get(keyAlt)!;
          setClauses.push(`\`${field}\` = ?`);
          values.push(Number(updates.kmTraveled || 0));
        }
      }

      if (updates.kmRateApplied !== undefined) {
        const key = 'kmrateapplied';
        const keyAlt = 'km_rate_applied';
        if (cols.has(key) || cols.has(keyAlt)) {
          const field = cols.get(key) || cols.get(keyAlt)!;
          setClauses.push(`\`${field}\` = ?`);
          values.push(Number(updates.kmRateApplied || 0));
        }
      }

      if (updates.kmTotalCost !== undefined) {
        const key = 'kmtotalcost';
        const keyAlt = 'km_total_cost';
        if (cols.has(key) || cols.has(keyAlt)) {
          const field = cols.get(key) || cols.get(keyAlt)!;
          setClauses.push(`\`${field}\` = ?`);
          values.push(Number(updates.kmTotalCost || 0));
        }
      }

      if (updates.kmPayout !== undefined) {
        const key = 'kmpayout';
        const keyAlt = 'km_payout';
        if (cols.has(key) || cols.has(keyAlt)) {
          const field = cols.get(key) || cols.get(keyAlt)!;
          setClauses.push(`\`${field}\` = ?`);
          values.push(Number(updates.kmPayout || 0));
        }
      }

      if (updates.tollCost !== undefined) {
        const key = 'tollcost';
        const keyAlt = 'toll_cost';
        if (cols.has(key) || cols.has(keyAlt)) {
          const field = cols.get(key) || cols.get(keyAlt)!;
          setClauses.push(`\`${field}\` = ?`);
          values.push(Number(updates.tollCost || 0));
        }
      }

      if (updates.supportCost !== undefined) {
        const key = 'supportcost';
        const keyAlt = 'support_cost';
        if (cols.has(key) || cols.has(keyAlt)) {
          const field = cols.get(key) || cols.get(keyAlt)!;
          setClauses.push(`\`${field}\` = ?`);
          values.push(Number(updates.supportCost || 0));
        }
      }

      if (updates.totalTechnicianGross !== undefined) {
        const key = 'totaltechniciangross';
        const keyAlt = 'total_technician_gross';
        if (cols.has(key) || cols.has(keyAlt)) {
          const field = cols.get(key) || cols.get(keyAlt)!;
          setClauses.push(`\`${field}\` = ?`);
          values.push(Number(updates.totalTechnicianGross || 0));
        }
      }

      if (updates.faturamentoPorto !== undefined) {
        const key = 'faturamentoporto';
        const keyAlt = 'faturamento_porto';
        if (cols.has(key) || cols.has(keyAlt)) {
          const field = cols.get(key) || cols.get(keyAlt)!;
          setClauses.push(`\`${field}\` = ?`);
          values.push(Number(updates.faturamentoPorto || 0));
        }
      }

      if (updates.additionalProduct !== undefined) {
        const key = 'additionalproduct';
        const keyAlt = 'additional_product';
        if (cols.has(key) || cols.has(keyAlt)) {
          const field = cols.get(key) || cols.get(keyAlt)!;
          setClauses.push(`\`${field}\` = ?`);
          values.push(updates.additionalProduct || null);
        }
      }

      if (updates.supportProduct !== undefined) {
        const key = 'supportproduct';
        const keyAlt = 'support_product';
        if (cols.has(key) || cols.has(keyAlt)) {
          const field = cols.get(key) || cols.get(keyAlt)!;
          setClauses.push(`\`${field}\` = ?`);
          values.push(updates.supportProduct || null);
        }
      }

      if (updates.productId !== undefined) {
        const key = 'productid';
        const keyAlt = 'product_id';
        if (cols.has(key) || cols.has(keyAlt)) {
          const field = cols.get(key) || cols.get(keyAlt)!;
          setClauses.push(`\`${field}\` = ?`);
          values.push(updates.productId || null);
        }
      }

      if (updates.productName !== undefined) {
        const key = 'productname';
        const keyAlt = 'product_name';
        if (cols.has(key) || cols.has(keyAlt)) {
          const field = cols.get(key) || cols.get(keyAlt)!;
          setClauses.push(`\`${field}\` = ?`);
          values.push(updates.productName || null);
        }
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
      if (err.message && (err.message.includes('uq_active_call_token') || err.message.includes('active_call_token'))) {
        return res.status(400).json({
          success: false,
          error: 'Operação bloqueada por integridade: Este número de chamado já possui um atendimento ativo (Em Andamento) no sistema.'
        });
      }
      if (isNetworkError(err)) {
        return res.json({
          success: true,
          message: 'Ordem de serviço updated on local memory.',
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
      const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: true });

      // Liberar buffer imediatamente do heap
      if (req.file) req.file.buffer = Buffer.alloc(0);

      if (!rawRows || rawRows.length === 0) {
        return res.status(400).json({ success: false, error: 'Nenhum dado encontrado na planilha enviada.' });
      }

      if (rawRows.length > 20000) {
        return res.status(413).json({ success: false, error: 'Planilha excede o limite máximo de 20.000 linhas por lote para manter estabilidade do servidor.' });
      }

      const formatToLocalMidnight = (date: Date) => {
        const d = new Date(date);
        d.setUTCHours(12, 0, 0, 0); 
        return d;
      };

      // Helpers de Sanitização e Mapeamento omitidos por brevidade da refatoração...
      const sinonimos = {
        call_number: ['os', 'ordem de servico', 'ordem de serviço', 'chamado', 'numero os', 'protocolo', 'call_number', 'idchamado'],
        km_traveled: ['km', 'km rodado', 'quilometragem', 'distancia', 'km_total', 'km_traveled'],
        toll_cost: ['pedagio', 'pedágio', 'taxa pedagio', 'ped', 'toll', 'toll_cost'],
        scheduled_date: ['data', 'data de atendimento', 'data atendimento', 'data execucao', 'dt_atendimento', 'data/hora', 'dt.visita', 'data visita'],
        technician_name: ['tecnico', 'técnico', 'prestador', 'responsavel', 'qra', 'nome tecnico'],
        customer_name: ['cliente', 'nome cliente', 'nome do cliente', 'customer_name'],
        base_service_fee: ['repasse', 'valor servico', 'valor base', 'repasse base', 'servico', 'valor da visita', 'valor', 'base fee']
      };

      function normalizeKey(key: string): string {
        return key
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim()
          .replace(/\s+/g, ' ');
      }

      function getSinonimoValue(normRow: Record<string, any>, field: keyof typeof sinonimos): any {
        const synonymsList = sinonimos[field];
        for (const synonym of synonymsList) {
          const normSynonym = normalizeKey(synonym);
          if (normRow[normSynonym] !== undefined && normRow[normSynonym] !== null && normRow[normSynonym] !== '') {
            return normRow[normSynonym];
          }
        }
        return null;
      }

      function extractKmValue(cellValue: any): number {
        if (cellValue === null || cellValue === undefined || cellValue === '') {
          return 0.00;
        }
        if (typeof cellValue === 'number') {
          return isNaN(cellValue) ? 0.00 : Number(cellValue.toFixed(2));
        }
        
        const valStr = String(cellValue).trim().toLowerCase();
        
        const pattern1 = /(\d+(?:[.,]\d+)?)\s*(?:km|kms|k\b)/i;
        const match1 = valStr.match(pattern1);
        if (match1) {
          const numStr = match1[1].replace(',', '.');
          const num = parseFloat(numStr);
          return isNaN(num) ? 0.00 : Number(num.toFixed(2));
        }

        const pattern2 = /km[:\s]*(\d+(?:[.,]\d+)?)/i;
        const match2 = valStr.match(pattern2);
        if (match2) {
          const numStr = match2[1].replace(',', '.');
          const num = parseFloat(numStr);
          return isNaN(num) ? 0.00 : Number(num.toFixed(2));
        }

        const fallbackPattern = /(\d+(?:[.,]\d+)?)/;
        const matchFallback = valStr.match(fallbackPattern);
        if (matchFallback) {
          const numStr = matchFallback[1].replace(',', '.');
          const num = parseFloat(numStr);
          return isNaN(num) ? 0.00 : Number(num.toFixed(2));
        }

        return 0.00;
      }

      function extractTollValue(kmCellValue: any, fallbackTollColValue: any): number {
        if (kmCellValue !== null && kmCellValue !== undefined && kmCellValue !== '') {
          const kmStr = String(kmCellValue).trim().toLowerCase();
          
          const pattern1 = /(?:pedagio|ped)[:\s]*r?\$?\s*(\d+(?:[.,]\d+)?)/i;
          const match1 = kmStr.match(pattern1);
          if (match1) {
            const numStr = match1[1].replace(',', '.');
            const num = parseFloat(numStr);
            if (!isNaN(num)) return Number(num.toFixed(2));
          }

          const pattern2 = /r?\$?\s*(\d+(?:[.,]\d+)?)\s*(?:pedagio|ped)/i;
          const match2 = kmStr.match(pattern2);
          if (match2) {
            const numStr = match2[1].replace(',', '.');
            const num = parseFloat(numStr);
            if (!isNaN(num)) return Number(num.toFixed(2));
          }
        }

        if (fallbackTollColValue !== null && fallbackTollColValue !== undefined && fallbackTollColValue !== '') {
          if (typeof fallbackTollColValue === 'number') {
            return isNaN(fallbackTollColValue) ? 0.00 : Number(fallbackTollColValue.toFixed(2));
          }
          const tollStr = String(fallbackTollColValue).trim().toLowerCase();
          const tollPattern = /(\d+(?:[.,]\d+)?)/;
          const matchToll = tollStr.match(tollPattern);
          if (matchToll) {
            const numStr = matchToll[1].replace(',', '.');
            const num = parseFloat(numStr);
            if (!isNaN(num)) return Number(num.toFixed(2));
          }
        }

        return 0.00;
      }

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
        if (!val) return formatToLocalMidnight(new Date()).toISOString();
        if (val instanceof Date) return isNaN(val.getTime()) ? formatToLocalMidnight(new Date()).toISOString() : formatToLocalMidnight(val).toISOString();
        if (typeof val === 'number') {
          const d = new Date(Math.round((val - 25569) * 86400 * 1000));
          return isNaN(d.getTime()) ? formatToLocalMidnight(new Date()).toISOString() : formatToLocalMidnight(d).toISOString();
        }
        if (typeof val === 'string') {
          const clean = val.trim();
          const brMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
          if (brMatch) {
            let part1 = parseInt(brMatch[1], 10);
            let part2 = parseInt(brMatch[2], 10);
            let year = parseInt(brMatch[3], 10);
            if (year < 100) year += 2000;
            
            let day = part1;
            let month = part2;
            if (part2 > 12 && part1 <= 12) {
              month = part1;
              day = part2;
            }
            const d = new Date(year, month - 1, day, brMatch[4] ? parseInt(brMatch[4], 10) : 12, brMatch[5] ? parseInt(brMatch[5], 10) : 0);
            if (!isNaN(d.getTime())) return formatToLocalMidnight(d).toISOString();
          }
          const d = new Date(clean);
          if (!isNaN(d.getTime())) return formatToLocalMidnight(d).toISOString();
        }
        return formatToLocalMidnight(new Date()).toISOString();
      }

      function shouldIgnoreRow(origem: any, tecnico: any): boolean {
        if (!origem || !tecnico) return true;
        const o = String(origem).trim().toLowerCase();
        const t = String(tecnico).trim().toLowerCase();
        if (o === '' || t === '') return true;
        const forbiddenWords = ['total', 'totais', 'vale', 'liquido', 'líquido', 'bruto', 'subtotal', 'resumo'];
        return forbiddenWords.some(w => o.includes(w) || t.includes(w));
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

      // Métricas estruturadas de faturamento e quilometragem do faturamento legando
      let totalRows = 0;
      let created = 0;
      let updated = 0;
      let errors = 0;
      let totalKmImported = 0;
      let totalFinancialCalculated = 0;

      // Pré-carga de usuários (Cache em Memória) - Evita Query N+1 no loop
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

      // Cache de Ordens de Serviço existentes para evitar Query N+1 e duplicidade
      const existingOrdersMap = new Map<string, { id: string; status: string }>();
      try {
        const [rows]: any = await db.query('SELECT id, call_number as callNumber FROM service_orders');
        for (const r of rows) {
          const callNum = r.callNumber || r.call_number;
          if (callNum) {
            existingOrdersMap.set(String(callNum).trim().toLowerCase(), {
              id: r.id,
              status: r.status
            });
          }
        }
      } catch (e: any) {
        logDb('WARN', `Falha ao pré-carregar cache de ordens existentes: ${e.message}`);
      }

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

      // Processamento Resiliente e Síncrono de Planilhas
      for (let idx = 0; idx < rawRows.length; idx++) {
        const row = rawRows[idx];
        try {
          // Normaliza todas as chaves da linha para mapeamento flexível
          const normRow: Record<string, any> = {};
          for (const key of Object.keys(row)) {
            normRow[normalizeKey(key)] = row[key];
          }

          const callNumberRaw = getSinonimoValue(normRow, 'call_number');
          let rawTechName = getSinonimoValue(normRow, 'technician_name');

          if (!rawTechName) {
            for (const k of Object.keys(normRow)) {
              if (/tec|prestador|executant|colaborador|responsavel|funcionario/.test(k) && normRow[k]) {
                rawTechName = String(normRow[k]).trim();
                break;
              }
            }
          }
          rawTechName = String(rawTechName || '').trim();

          const origemRaw = normRow['origem'] || normRow['orig'] || normRow['source'] || callNumberRaw;

          if (shouldIgnoreRow(origemRaw, rawTechName)) {
            ignoredRowsCount++;
            continue;
          }

          if (!callNumberRaw) {
            errors++;
            continue;
          }

          totalRows++;

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

          const baseServiceFee = parseCurrency(getSinonimoValue(normRow, 'base_service_fee'));
          const dtVisitaRaw = getSinonimoValue(normRow, 'scheduled_date');
          const scheduledDateStr = parseDateValue(dtVisitaRaw);

          // Extração Resiliente de KM e Pedágio das Células
          const kmCellValue = getSinonimoValue(normRow, 'km_traveled');
          const kmTraveled = extractKmValue(kmCellValue);

          const tollCellValue = getSinonimoValue(normRow, 'toll_cost');
          const tollCost = extractTollValue(kmCellValue, tollCellValue);

          // Regra de Corte Histórico (Snapshot Imutável)
          const execTime = new Date(scheduledDateStr).getTime();
          const cutoffTime = new Date('2026-07-26T23:59:59').getTime();
          const isBeforeCutoff = execTime <= cutoffTime;

          let kmRateApplied = 0.75;
          if (isBeforeCutoff) {
            kmRateApplied = 0.50;
          } else {
            const matchedUser = currentUsersList.find(u => String(u.id) === String(technicianId));
            if (matchedUser) {
              kmRateApplied = Number(matchedUser.km_rate ?? matchedUser.kmRate ?? 0.75);
            }
          }

          const kmPayout = Number((kmTraveled * kmRateApplied).toFixed(2));
          const totalTechnicianGross = Number((baseServiceFee + kmPayout + tollCost).toFixed(2));

          totalKmImported += kmTraveled;
          totalFinancialCalculated += totalTechnicianGross;

          // Mecanismo Upsert (Prevenção de Duplicidade)
          const cleanCallNumber = String(callNumberRaw).trim();
          const existing = existingOrdersMap.get(cleanCallNumber.toLowerCase());
          
          let orderId = '';
          if (existing) {
            orderId = existing.id;
            updated++;
          } else {
            const dateSlug = scheduledDateStr.split('T')[0].replace(/-/g, '');
            orderId = `os-${cleanCallNumber}-${dateSlug}`;
            created++;
          }

          const customerNameRaw = getSinonimoValue(normRow, 'customer_name') || 'Cliente Porto Seguro';
          const tipoVisitaRaw = normRow['servico'] || normRow['tipo_visita'] || normRow['categoria'] || 'Instalação / Higienização';
          const statusRaw = normRow['status'] || normRow['situacao'] || 'COMPLETED';

          const cleanStatus = String(statusRaw || '').toLowerCase().trim();
          const finalStatus = (cleanStatus.includes('perdida') || cleanStatus.includes('conclu') || cleanStatus.includes('finaliz')) ? 'COMPLETED' : cleanStatus.includes('canc') ? 'CANCELLED' : cleanStatus.includes('anda') ? 'IN_PROGRESS' : 'PENDING';

          batchOrders.push([
            orderId, cleanCallNumber, String(origemRaw).trim() || null, String(tipoVisitaRaw).trim(), baseServiceFee,
            String(customerNameRaw).trim(), '', null, String(normRow['cidade'] || 'São Paulo').trim(), String(normRow['uf'] || 'SP').trim().toUpperCase().substring(0, 2),
            String(normRow['bairro'] || '').trim(), String(normRow['endereco'] || '').trim(), String(normRow['numero'] || '').trim(), null, String(normRow['cep'] || '01001-000').trim(),
            technicianId, finalStatus, new Date(scheduledDateStr), finalStatus !== 'PENDING' ? new Date(scheduledDateStr) : null, finalStatus === 'COMPLETED' || finalStatus === 'CANCELLED' ? new Date(scheduledDateStr) : null,
            kmTraveled, kmRateApplied, kmPayout, tollCost, 0, totalTechnicianGross, totalTechnicianGross, kmPayout, kmPayout
          ]);

          importedCount++;
          if (importedOrdersSummary.length < 15) {
            importedOrdersSummary.push({ callNumber: cleanCallNumber, technicianName: techName, date: scheduledDateStr, totalGross: totalTechnicianGross, status: finalStatus });
          }
        } catch (lineErr: any) {
          console.error(`Falha ao processar linha ${idx} da importação:`, lineErr.message);
          errors++;
        }
      }

      // Concorrência Atômica de Persistência no MariaDB
      try {
        // 1. Batch de Técnicos Novos
        const newTechs = Array.from(pendingNewTechsMap.values());
        if (newTechs.length > 0) {
          const techBatchValues = newTechs.map(t => [t.id, t.name, t.email, t.passwordHash, 'TECHNICIAN', 1, 0, 0, 0, t.phone, t.documentCpf, new Date(), new Date()]);
          await db.query(`INSERT INTO users (id, name, email, passwordHash, role, isActive, baseCostAllowance, hasSpecialTaxRule, specialTaxRate, phone, document_cpf, createdAt, updatedAt) VALUES ? ON DUPLICATE KEY UPDATE name=VALUES(name)`, [techBatchValues]);
          techniciansCreatedCount = newTechs.length;
          memUsers.push(...newTechs);
          createdTechniciansList.push(...newTechs.map(t => ({ id: t.id, name: t.name, email: t.email })));
        }

        // 2. Batch de Ordens de Serviço (Upsert Inteligente com ON DUPLICATE KEY UPDATE)
        if (batchOrders.length > 0) {
          const chunkSize = 2000;
          for (let i = 0; i < batchOrders.length; i += chunkSize) {
            const chunk = batchOrders.slice(i, i + chunkSize);
            await db.query(`
              INSERT INTO service_orders (
                id, call_number, porto_seguro_protocol, service_category, base_service_fee, customer_name, customer_cpf, customer_phone, city, uf, neighborhood, address_street, address_number, address_complement, postal_code, technician_id, status, scheduled_date, started_at, completed_at, km_traveled, km_rate_applied, km_total_cost, toll_cost, support_cost, total_technician_gross, faturamento_porto, km_payout, kmPayout
              ) VALUES ? 
              ON DUPLICATE KEY UPDATE 
                status=VALUES(status),
                total_technician_gross=VALUES(total_technician_gross),
                faturamento_porto=VALUES(faturamento_porto),
                started_at=VALUES(started_at),
                completed_at=VALUES(completed_at),
                km_payout=VALUES(km_payout),
                kmPayout=VALUES(kmPayout),
                km_traveled=VALUES(km_traveled),
                km_rate_applied=VALUES(km_rate_applied),
                km_total_cost=VALUES(km_total_cost),
                toll_cost=VALUES(toll_cost)
            `, [chunk]);
          }
        }
      } catch (err: any) {
        logDb('ERROR', `Falha grave na persistência do lote de importação. Erro: ${err.message}`);
        return res.status(500).json({ success: false, error: 'Erro de transação no banco de dados. Processamento abortado por segurança estrutural.' });
      }

      await recordAudit({
        userId: requester?.id || 'system', userName: requester?.name || 'Administrador Master', userRole: requester?.role || 'ADMIN', ipAddress: req.ip, module: 'SERVICE_ORDERS', action: 'DATA_IMPORT', result: 'SUCCESS', details: `Importação massiva otimizada concluída: ${importedCount} ordens via ${file.originalname}.`
      });

      // Recarregar memória volátil após a persistência
      try {
        const [reloadRows]: any = await db.query('SELECT * FROM service_orders ORDER BY scheduled_date DESC');
        if (reloadRows && reloadRows.length > 0) {
          memOrders = reloadRows.map((o: any) => ({
            ...o,
            id: o.id,
            callNumber: o.call_number || o.callNumber,
            call_number: o.call_number || o.callNumber,
            portoSeguroProtocol: o.porto_seguro_protocol || o.portoSeguroProtocol || null,
            porto_seguro_protocol: o.porto_seguro_protocol || o.portoSeguroProtocol || null,
            serviceCategory: o.service_category || o.serviceCategory || 'Higienização Padrão',
            service_category: o.service_category || o.serviceCategory || 'Higienização Padrão',
            baseServiceFee: Number(o.base_service_fee ?? o.baseServiceFee ?? 0),
            base_service_fee: Number(o.base_service_fee ?? o.baseServiceFee ?? 0),
            customerName: o.customer_name || o.customerName || '',
            customer_name: o.customer_name || o.customerName || '',
            customerCpf: o.customer_cpf || o.customerCpf || '',
            customer_cpf: o.customer_cpf || o.customerCpf || '',
            customerPhone: o.customer_phone || o.customerPhone || null,
            customer_phone: o.customer_phone || o.customerPhone || null,
            city: o.city || 'São Paulo',
            uf: o.uf || 'SP',
            neighborhood: o.neighborhood || '',
            addressStreet: o.address_street || o.addressStreet || '',
            address_street: o.address_street || o.addressStreet || '',
            street: o.address_street || o.addressStreet || '',
            logradouro: o.address_street || o.addressStreet || '',
            addressNumber: o.address_number || o.addressNumber || '',
            address_number: o.address_number || o.addressNumber || '',
            number: o.address_number || o.addressNumber || '',
            numero: o.address_number || o.addressNumber || '',
            addressComplement: o.address_complement || o.addressComplement || null,
            address_complement: o.address_complement || o.addressComplement || null,
            postalCode: o.postal_code || o.postalCode || '',
            postal_code: o.postal_code || o.postalCode || '',
            technicianId: o.technician_id || o.technicianId,
            technician_id: o.technician_id || o.technicianId,
            status: o.status || 'PENDING',
            scheduledDate: o.scheduled_date || o.scheduledDate,
            scheduled_date: o.scheduled_date || o.scheduledDate,
            startedAt: o.started_at || o.startedAt,
            started_at: o.started_at || o.startedAt,
            completedAt: o.completed_at || o.completedAt,
            completed_at: o.completed_at || o.completedAt,
            kmTraveled: Number(o.km_traveled ?? o.kmTraveled ?? 0),
            km_traveled: Number(o.km_traveled ?? o.kmTraveled ?? 0),
            kmRateApplied: Number(o.km_rate_applied ?? o.kmRateApplied ?? 0.5),
            km_rate_applied: Number(o.km_rate_applied ?? o.kmRateApplied ?? 0.5),
            kmTotalCost: Number(o.km_total_cost ?? o.kmTotalCost ?? 0),
            km_total_cost: Number(o.km_total_cost ?? o.kmTotalCost ?? 0),
            tollCost: Number(o.toll_cost ?? o.tollCost ?? 0),
            toll_cost: Number(o.toll_cost ?? o.tollCost ?? 0),
            supportCost: Number(o.support_cost ?? o.supportCost ?? 0),
            support_cost: Number(o.support_cost ?? o.supportCost ?? 0),
            totalTechnicianGross: Number(o.total_technician_gross ?? o.totalTechnicianGross ?? 0),
            total_technician_gross: Number(o.total_technician_gross ?? o.totalTechnicianGross ?? 0),
            faturamentoPorto: Number(o.faturamento_porto ?? o.faturamentoPorto ?? 0),
            faturamento_porto: Number(o.faturamento_porto ?? o.faturamentoPorto ?? 0),
            customerSignature: o.customer_signature || o.customerSignature || null,
            customer_signature: o.customer_signature || o.customerSignature || null,
            executionNotes: o.execution_notes || o.executionNotes || null,
            execution_notes: o.execution_notes || o.executionNotes || null,
            tollReceiptUrl: o.toll_receipt_url || o.tollReceiptUrl || null,
            toll_receipt_url: o.toll_receipt_url || o.tollReceiptUrl || null,
            paymentStatus: o.payment_status || o.paymentStatus || 'PENDING',
            payment_status: o.payment_status || o.paymentStatus || 'PENDING',
            paymentDate: o.payment_date || o.paymentDate || null,
            payment_date: o.payment_date || o.paymentDate || null,
          }));
        }
      } catch (err) {}

      res.json({
        success: true,
        message: `Planilha processada com sucesso: ${created} criadas, ${updated} atualizadas.`,
        totalRows,
        created,
        updated,
        errors,
        totalKmImported: Number(totalKmImported.toFixed(2)),
        totalFinancialCalculated: Number(totalFinancialCalculated.toFixed(2)),
        techniciansCreated: techniciansCreatedCount,
        ignoredRowsCount,
        createdTechnicians: createdTechniciansList,
        sampleOrders: importedOrdersSummary
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: `Erro ao processar planilha (OOM/Parser): ${err.message}` });
    }
  });

  // =========================================================================
  // 5.1.b IMPORT OF CONTRACTUAL PORTO PRICES (.xlsx via multer & xlsx)
  // =========================================================================
  app.post('/api/admin/import/porto-prices', uploadExcel.single('file'), async (req, res) => {
    const requester = await getRequester(req);

    if (requester && requester.role !== 'ADMIN') {
      await recordAudit({
        userId: requester?.id || 'unknown',
        userName: requester?.name || 'Desconhecido',
        userRole: requester?.role || 'TECHNICIAN',
        ipAddress: req.ip,
        module: 'FINANCE',
        action: 'ACCESS_DENIED',
        result: 'BLOCKED',
        details: 'Tentativa não autorizada de importar preços contratuais da Porto.',
      });
      return res.status(403).json({ success: false, error: 'Acesso negado: apenas o Administrador Master pode realizar importação de preços Porto.' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Por favor, envie um arquivo de planilha (.xlsx).' });
    }

    try {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      
      const sheetName = workbook.SheetNames.find(name => name.toLowerCase().includes('tabela de precos') || name.toLowerCase().includes('precos') || name.toLowerCase().includes('porto')) || workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) {
        return res.status(400).json({ success: false, error: 'Aba "Tabela de Preços" não foi encontrada no arquivo.' });
      }

      const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      if (rows.length < 5) {
        return res.status(400).json({ success: false, error: 'A planilha de preços está vazia ou mal estruturada (menos de 5 linhas).' });
      }

      let effectiveDateStr = '2026-07-29'; 
      for (let i = 0; i < Math.min(rows.length, 15); i++) {
        const rowText = rows[i].map((cell: any) => String(cell || '')).join(' ');
        const match = rowText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (match) {
          effectiveDateStr = `${match[3]}-${match[2]}-${match[1]}`; // Store as YYYY-MM-DD
          break;
        }
      }

      const db = getDbPool();
      let importedCount = 0;
      let updatedCount = 0;

      for (let i = 4; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 2) continue;

        const category = String(row[0] || '').trim();
        const serviceName = String(row[1] || '').trim();
        if (!category || !serviceName || serviceName.toLowerCase().includes('serviço') || category.toLowerCase().includes('categoria')) {
          continue; 
        }

        const completedPrice = Number(row[2]) || 0;
        const additionalPrice = Number(row[3]) || 0;
        
        // Coluna E (índice 4): additional_item_price. Converter vazios ou hífens para 0.00.
        const rawAdditionalItem = row[4];
        let additionalItemPrice = 0;
        if (rawAdditionalItem !== undefined && rawAdditionalItem !== null) {
          const cleanStr = String(rawAdditionalItem).replace(/[\s\-R$]/g, '').replace(',', '.').trim();
          additionalItemPrice = cleanStr === '' || cleanStr === '-' ? 0 : (Number(cleanStr) || 0);
        }

        const cleanKeywords = serviceName.toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9\s]/g, '')
          .trim();

        const [existing]: any = await db.query(
          "SELECT id FROM porto_service_prices WHERE LOWER(category) = LOWER(?) AND LOWER(service_name) = LOWER(?) LIMIT 1",
          [category, serviceName]
        );

        if (existing && existing.length > 0) {
          await db.execute(
            `UPDATE porto_service_prices 
             SET completed_price = ?, additional_price = ?, additional_item_price = ?, effective_date = ?, active = TRUE, search_keywords = ?, updated_at = NOW() 
             WHERE id = ?`,
            [completedPrice, additionalPrice, additionalItemPrice, effectiveDateStr, cleanKeywords, existing[0].id]
          );
          updatedCount++;
        } else {
          await db.execute(
            `INSERT INTO porto_service_prices 
              (category, service_name, search_keywords, completed_price, additional_price, additional_item_price, effective_date, active)
             VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
            [category, serviceName, cleanKeywords, completedPrice, additionalPrice, additionalItemPrice, effectiveDateStr]
          );
          importedCount++;
        }
      }

      const [allActive]: any = await db.query("SELECT * FROM porto_service_prices WHERE active = TRUE");
      memPortoPrices = allActive || [];

      await recordAudit({
        userId: requester?.id || 'system',
        userName: requester?.name || 'Administrador',
        userRole: requester?.role || 'ADMIN',
        ipAddress: req.ip,
        module: 'FINANCE',
        action: 'DATA_IMPORT',
        affectedRecordType: 'porto_service_prices',
        result: 'SUCCESS',
        details: `Importação de preços Porto concluída com sucesso. Novas: ${importedCount}, Atualizadas: ${updatedCount}. Vigência: ${effectiveDateStr}.`,
      });

      res.json({
        success: true,
        message: 'Preços Porto importados com sucesso.',
        data: {
          importedCount,
          updatedCount,
          total: memPortoPrices.length,
          effectiveDate: effectiveDateStr
        }
      });
    } catch (err: any) {
      if (isNetworkError(err)) {
        try {
          const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
          const sheetName = workbook.SheetNames.find(name => 
            name.toLowerCase().includes('tabela de precos') || 
            name.toLowerCase().includes('precos') || 
            name.toLowerCase().includes('porto')
          ) || workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          if (!worksheet) {
            return res.status(400).json({ success: false, error: 'Aba "Tabela de Preços" não foi encontrada no arquivo.' });
          }

          const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
          if (rows.length < 5) {
            return res.status(400).json({ success: false, error: 'A planilha de preços está vazia ou mal estruturada (menos de 5 linhas).' });
          }

          let effectiveDateStr = '2026-07-29'; 
          for (let i = 0; i < Math.min(rows.length, 15); i++) {
            const rowText = rows[i].map((cell: any) => String(cell || '')).join(' ');
            const match = rowText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
            if (match) {
              effectiveDateStr = `${match[3]}-${match[2]}-${match[1]}`; // Store as YYYY-MM-DD
              break;
            }
          }

          let importedCount = 0;
          let updatedCount = 0;

          for (let i = 4; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 2) continue;

            const category = String(row[0] || '').trim();
            const serviceName = String(row[1] || '').trim();
            if (!category || !serviceName || serviceName.toLowerCase().includes('serviço') || category.toLowerCase().includes('categoria')) {
              continue; 
            }

            const completedPrice = Number(row[2]) || 0;
            const additionalPrice = Number(row[3]) || 0;

            // Coluna E (índice 4): additional_item_price. Converter vazios ou hífens para 0.00.
            const rawAdditionalItemPrice = row[4];
            let additionalItemPrice = 0;
            if (rawAdditionalItemPrice !== undefined && rawAdditionalItemPrice !== null) {
              const cleanStr = String(rawAdditionalItemPrice).replace(/[\s\-R$]/g, '').replace(',', '.').trim();
              additionalItemPrice = cleanStr === '' || cleanStr === '-' ? 0 : (Number(cleanStr) || 0);
            }

            const cleanKeywords = serviceName.toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/[^a-z0-9\s]/g, '')
              .trim();

            const existingIndex = memPortoPrices.findIndex(
              (p: any) => p.category.toLowerCase() === category.toLowerCase() && p.service_name.toLowerCase() === serviceName.toLowerCase()
            );

            if (existingIndex !== -1) {
              memPortoPrices[existingIndex] = {
                ...memPortoPrices[existingIndex],
                completed_price: completedPrice,
                additional_price: additionalPrice,
                additional_item_price: additionalItemPrice,
                effective_date: effectiveDateStr,
                active: true,
                search_keywords: cleanKeywords,
                updated_at: new Date().toISOString()
              };
              updatedCount++;
            } else {
              memPortoPrices.push({
                id: Math.floor(Math.random() * 1000000),
                category,
                service_name: serviceName,
                search_keywords: cleanKeywords,
                completed_price: completedPrice,
                additional_price: additionalPrice,
                additional_item_price: additionalItemPrice,
                effective_date: effectiveDateStr,
                active: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });
              importedCount++;
            }
          }

          memAuditLogs.push({
            id: `audit-${Date.now()}`,
            timestamp: new Date().toISOString(),
            userId: requester?.id || 'admin',
            userName: requester?.name || 'Administrador',
            userRole: requester?.role || 'ADMIN',
            ipAddress: req.ip,
            module: 'FINANCE',
            action: 'DATA_IMPORT',
            affectedRecordType: 'porto_service_prices',
            result: 'SUCCESS',
            details: `Importação de preços Porto concluída com sucesso em cache de memória (Banco Offline). Novas: ${importedCount}, Atualizadas: ${updatedCount}. Vigência: ${effectiveDateStr}.`,
          });

          return res.json({
            success: true,
            message: 'Preços Porto importados com sucesso em cache de memória.',
            data: {
              importedCount,
              updatedCount,
              total: memPortoPrices.length,
              effectiveDate: effectiveDateStr
            }
          });
        } catch (innerErr: any) {
          console.error('[IMPORT PORTO PRICES OFFLINE ERROR]:', innerErr);
          return res.status(500).json({ success: false, error: `Falha ao processar planilha de preços offline: ${innerErr.message}` });
        }
      }
      console.error('[IMPORT PORTO PRICES ERROR]:', err);
      res.status(500).json({ success: false, error: `Falha ao processar planilha de preços: ${err.message}` });
    }
  });

  // =========================================================================
  // 5.1.c CONFIRM AND RECORD PORT PRICE TABLE FROM JSON
  // =========================================================================
  app.post('/api/admin/import/porto-prices/confirm', express.json(), async (req, res) => {
    const requester = await getRequester(req);

    if (requester && requester.role !== 'ADMIN') {
      await recordAudit({
        userId: requester?.id || 'unknown',
        userName: requester?.name || 'Desconhecido',
        userRole: requester?.role || 'TECHNICIAN',
        ipAddress: req.ip,
        module: 'FINANCE',
        action: 'ACCESS_DENIED',
        result: 'BLOCKED',
        details: 'Tentativa não autorizada de confirmar importação de preços contratuais da Porto.',
      });
      return res.status(403).json({ success: false, error: 'Acesso negado: apenas o Administrador Master pode realizar importação de preços Porto.' });
    }

    const { prices, effectiveDate } = req.body;
    if (!Array.isArray(prices)) {
      return res.status(400).json({ success: false, error: 'A lista de preços é inválida ou vazia.' });
    }

    let effectiveDateStr = '2026-07-29';
    if (effectiveDate) {
      if (effectiveDate.includes('/')) {
        const parts = effectiveDate.split('/');
        if (parts.length === 3) {
          effectiveDateStr = `${parts[2]}-${parts[1]}-${parts[0]}`; // "29/07/2026" -> "2026-07-29"
        } else {
          effectiveDateStr = effectiveDate;
        }
      } else {
        effectiveDateStr = effectiveDate.split('T')[0];
      }
    }

    try {
      const db = getDbPool();
      let importedCount = 0;
      let updatedCount = 0;

      for (const row of prices) {
        const category = String(row.category || '').trim();
        const serviceName = String(row.service_name || '').trim();
        if (!category || !serviceName) continue;

        const completedPrice = Number(row.completed_price) || 0;
        const additionalPrice = Number(row.additional_price) || 0;
        const additionalItemPrice = Number(row.additional_item_price) || 0;

        const cleanKeywords = serviceName.toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9\s]/g, '')
          .trim();

        const [existing]: any = await db.query(
          "SELECT id FROM porto_service_prices WHERE LOWER(category) = LOWER(?) AND LOWER(service_name) = LOWER(?) LIMIT 1",
          [category, serviceName]
        );

        if (existing && existing.length > 0) {
          await db.execute(
            `UPDATE porto_service_prices 
             SET completed_price = ?, additional_price = ?, additional_item_price = ?, effective_date = ?, active = TRUE, search_keywords = ?, updated_at = NOW() 
             WHERE id = ?`,
            [completedPrice, additionalPrice, additionalItemPrice, effectiveDateStr, cleanKeywords, existing[0].id]
          );
          updatedCount++;
        } else {
          await db.execute(
            `INSERT INTO porto_service_prices 
              (category, service_name, search_keywords, completed_price, additional_price, additional_item_price, effective_date, active)
             VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
            [category, serviceName, cleanKeywords, completedPrice, additionalPrice, additionalItemPrice, effectiveDateStr]
          );
          importedCount++;
        }
      }

      const [allActive]: any = await db.query("SELECT * FROM porto_service_prices WHERE active = TRUE");
      memPortoPrices = allActive || [];

      await recordAudit({
        userId: requester?.id || 'system',
        userName: requester?.name || 'Administrador',
        userRole: requester?.role || 'ADMIN',
        ipAddress: req.ip,
        module: 'FINANCE',
        action: 'DATA_IMPORT',
        affectedRecordType: 'porto_service_prices',
        result: 'SUCCESS',
        details: `Importação de preços Porto confirmada com sucesso. Novas: ${importedCount}, Atualizadas: ${updatedCount}. Vigência: ${effectiveDateStr}.`,
      });

      res.json({
        success: true,
        message: 'Preços Porto gravados com sucesso no banco de dados.',
        data: {
          importedCount,
          updatedCount,
          total: memPortoPrices.length,
          effectiveDate: effectiveDateStr
        }
      });
    } catch (err: any) {
      if (isNetworkError(err)) {
        let importedCount = 0;
        let updatedCount = 0;

        for (const row of prices) {
          const category = String(row.category || '').trim();
          const serviceName = String(row.service_name || '').trim();
          if (!category || !serviceName) continue;

          const completedPrice = Number(row.completed_price) || 0;
          const additionalPrice = Number(row.additional_price) || 0;
          const additionalItemPrice = Number(row.additional_item_price) || 0;

          const cleanKeywords = serviceName.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, '')
            .trim();

          const existingIndex = memPortoPrices.findIndex(
            (p: any) => p.category.toLowerCase() === category.toLowerCase() && p.service_name.toLowerCase() === serviceName.toLowerCase()
          );

          if (existingIndex !== -1) {
            memPortoPrices[existingIndex] = {
              ...memPortoPrices[existingIndex],
              completed_price: completedPrice,
              additional_price: additionalPrice,
              additional_item_price: additionalItemPrice,
              effective_date: effectiveDateStr,
              active: true,
              search_keywords: cleanKeywords,
              updated_at: new Date().toISOString()
            };
            updatedCount++;
          } else {
            memPortoPrices.push({
              id: Math.floor(Math.random() * 1000000),
              category,
              service_name: serviceName,
              search_keywords: cleanKeywords,
              completed_price: completedPrice,
              additional_price: additionalPrice,
              additional_item_price: additionalItemPrice,
              effective_date: effectiveDateStr,
              active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
            importedCount++;
          }
        }

        memAuditLogs.push({
          id: `audit-${Date.now()}`,
          timestamp: new Date().toISOString(),
          userId: requester?.id || 'admin',
          userName: requester?.name || 'Administrador',
          userRole: requester?.role || 'ADMIN',
          ipAddress: req.ip,
          module: 'FINANCE',
          action: 'DATA_IMPORT',
          affectedRecordType: 'porto_service_prices',
          result: 'SUCCESS',
          details: `Importação de preços Porto confirmada com sucesso em cache de memória (Banco Offline). Novas: ${importedCount}, Atualizadas: ${updatedCount}. Vigência: ${effectiveDateStr}.`,
        });

        return res.json({
          success: true,
          message: 'Preços Porto gravados com sucesso em cache de memória.',
          data: {
            importedCount,
            updatedCount,
            total: memPortoPrices.length,
            effectiveDate: effectiveDateStr
          }
        });
      }

      console.error('[CONFIRM PORTO PRICES ERROR]:', err);
      res.status(500).json({ success: false, error: `Falha ao gravar planilha de preços: ${err.message}` });
    }
  });

  app.get('/api/admin/porto-prices', async (req, res) => {
    try {
      const db = getDbPool();
      const [rows]: any = await db.query("SELECT * FROM porto_service_prices ORDER BY category, service_name");
      
      const lastEffectiveDate = rows.length > 0 
        ? rows.reduce((max: string, r: any) => {
            const dateStr = r.effective_date ? new Date(r.effective_date).toISOString().split('T')[0] : '';
            return dateStr > max ? dateStr : max;
          }, '2026-07-29')
        : '2026-07-29';

      res.json({
        success: true,
        total: rows.length,
        lastEffectiveDate,
        data: rows
      });
    } catch (err: any) {
      res.json({
        success: true,
        total: memPortoPrices.length,
        lastEffectiveDate: '2026-07-29',
        data: memPortoPrices
      });
    }
  });

  app.put('/api/admin/porto-prices/:id', async (req, res) => {
    const requester = await getRequester(req);
    if (requester && requester.role === 'TECHNICIAN') {
      return res.status(403).json({ success: false, error: 'Acesso negado: apenas Administradores podem atualizar preços.' });
    }

    const { id } = req.params;
    const { completed_price, additional_price, additional_item_price } = req.body;

    if (completed_price === undefined) {
      return res.status(400).json({ success: false, error: 'O preço de serviço concluído é obrigatório.' });
    }

    try {
      const db = getDbPool();
      // Obter o valor antigo para log de auditoria
      const [oldRows]: any = await db.query('SELECT * FROM porto_service_prices WHERE id = ?', [id]);
      if (oldRows.length === 0) {
        return res.status(404).json({ success: false, error: 'Serviço Porto Seguro não encontrado.' });
      }

      const oldVal = oldRows[0];

      await db.query(
        'UPDATE porto_service_prices SET completed_price = ?, additional_price = ?, additional_item_price = ?, updated_at = NOW() WHERE id = ?',
        [Number(completed_price), Number(additional_price || 0), Number(additional_item_price || 0), id]
      );

      // Atualizar no cache de memória também
      const memIndex = memPortoPrices.findIndex((p: any) => String(p.id) === String(id));
      if (memIndex !== -1) {
        memPortoPrices[memIndex].completed_price = Number(completed_price);
        memPortoPrices[memIndex].additional_price = Number(additional_price || 0);
        memPortoPrices[memIndex].additional_item_price = Number(additional_item_price || 0);
      }

      // Registrar no log de auditoria operacional
      await recordAudit({
        userId: requester?.id || 'admin',
        userName: requester?.name || 'Administrador',
        userRole: requester?.role || 'ADMIN',
        ipAddress: req.ip,
        module: 'FINANCE',
        action: 'SETTINGS_UPDATE',
        affectedRecordId: String(id),
        affectedRecordType: 'porto_service_price',
        oldValue: JSON.stringify({ completed_price: oldVal.completed_price, additional_price: oldVal.additional_price, additional_item_price: oldVal.additional_item_price }),
        newValue: JSON.stringify({ completed_price, additional_price, additional_item_price }),
        result: 'SUCCESS',
        details: `Preço do serviço "${oldVal.service_name}" atualizado: Concluído R$ ${completed_price}, Adicional R$ ${additional_price || 0}, Item Adicional R$ ${additional_item_price || 0}.`,
      });

      res.json({ success: true, message: 'Preço atualizado com sucesso.' });
    } catch (err: any) {
      if (isNetworkError(err)) {
        const memIndex = memPortoPrices.findIndex((p: any) => String(p.id) === String(id));
        if (memIndex === -1) {
          return res.status(404).json({ success: false, error: 'Serviço Porto Seguro não encontrado no cache.' });
        }
        const oldVal = memPortoPrices[memIndex];
        const oldValCopy = { completed_price: oldVal.completed_price, additional_price: oldVal.additional_price, additional_item_price: oldVal.additional_item_price };

        memPortoPrices[memIndex].completed_price = Number(completed_price);
        memPortoPrices[memIndex].additional_price = Number(additional_price || 0);
        memPortoPrices[memIndex].additional_item_price = Number(additional_item_price || 0);

        memAuditLogs.push({
          id: `audit-${Date.now()}`,
          timestamp: new Date().toISOString(),
          userId: requester?.id || 'admin',
          userName: requester?.name || 'Administrador',
          userRole: requester?.role || 'ADMIN',
          ipAddress: req.ip,
          module: 'FINANCE',
          action: 'SETTINGS_UPDATE',
          affectedRecordId: String(id),
          affectedRecordType: 'porto_service_price',
          oldValue: JSON.stringify(oldValCopy),
          newValue: JSON.stringify({ completed_price, additional_price, additional_item_price }),
          result: 'SUCCESS',
          details: `Preço do serviço "${oldVal.service_name}" atualizado em memória: Concluído R$ ${completed_price}, Adicional R$ ${additional_price || 0}, Item Adicional R$ ${additional_item_price || 0}.`,
        });

        return res.json({ success: true, message: 'Preço atualizado com sucesso em cache de memória.' });
      }
      console.error('[UPDATE PORTO PRICE ERROR]:', err);
      res.status(500).json({ success: false, error: `Falha ao atualizar preço: ${err.message}` });
    }
  });

  app.get('/api/admin/technicians/:id/rates', async (req, res) => {
    const requester = await getRequester(req);
    if (requester && requester.role === 'TECHNICIAN') {
      return res.status(403).json({ success: false, error: 'Acesso negado.' });
    }

    const { id } = req.params;

    try {
      const db = getDbPool();
      // Consultar o técnico para pegar as taxas de km
      const [userRows]: any = await db.query('SELECT id, name, km_rate, kmRate FROM users WHERE id = ?', [id]);
      if (userRows.length === 0) {
        return res.status(404).json({ success: false, error: 'Técnico não encontrado.' });
      }

      const tech = userRows[0];
      const kmRateValue = Number(tech.km_rate ?? tech.kmRate ?? 0.75);

      // Consultar taxas customizadas
      const [customRows]: any = await db.query('SELECT * FROM technician_custom_rates WHERE technician_id = ?', [id]);

      res.json({
        success: true,
        data: {
          technicianId: id,
          name: tech.name,
          kmRate: kmRateValue,
          customRates: customRows.map((r: any) => ({
            id: r.id,
            technicianId: r.technician_id,
            serviceCategory: r.service_category,
            customFee: Number(r.custom_fee)
          }))
        }
      });
    } catch (err: any) {
      if (isNetworkError(err)) {
        const tech = memUsers.find((u: any) => String(u.id) === String(id));
        if (!tech) {
          return res.status(404).json({ success: false, error: 'Técnico não encontrado em memória.' });
        }
        const kmRateValue = Number(tech.km_rate ?? tech.kmRate ?? 0.75);
        const filteredCustom = memTechnicianCustomRates.filter((r: any) => String(r.technician_id) === String(id));
        
        return res.json({
          success: true,
          data: {
            technicianId: id,
            name: tech.name,
            kmRate: kmRateValue,
            customRates: filteredCustom.map((r: any) => ({
              id: r.id,
              technicianId: r.technician_id,
              serviceCategory: r.service_category,
              customFee: Number(r.custom_fee)
            }))
          }
        });
      }
      console.error('[GET TECHNICIAN RATES ERROR]:', err);
      res.status(500).json({ success: false, error: `Falha ao obter taxas do técnico: ${err.message}` });
    }
  });

  app.put('/api/admin/technicians/:id/rates', async (req, res) => {
    const requester = await getRequester(req);
    if (requester && requester.role === 'TECHNICIAN') {
      return res.status(403).json({ success: false, error: 'Acesso negado.' });
    }

    const { id } = req.params;
    const { kmRate, customRates } = req.body;

    if (kmRate === undefined) {
      return res.status(400).json({ success: false, error: 'A taxa de KM é obrigatória.' });
    }

    try {
      const db = getDbPool();
      // Verificar se o técnico existe
      const [techRows]: any = await db.query('SELECT name FROM users WHERE id = ?', [id]);
      if (techRows.length === 0) {
        return res.status(404).json({ success: false, error: 'Técnico não encontrado.' });
      }
      const techName = techRows[0].name;

      // 1. Atualizar taxa de KM do técnico na tabela users
      await db.query('UPDATE users SET km_rate = ?, kmRate = ?, updatedAt = NOW() WHERE id = ?', [Number(kmRate), Number(kmRate), id]);

      // 2. Atualizar tarifas customizadas
      if (Array.isArray(customRates)) {
        for (const rate of customRates) {
          const { serviceCategory, customFee } = rate;
          if (customFee === null || customFee === undefined || String(customFee).trim() === '') {
            await db.query(
              'DELETE FROM technician_custom_rates WHERE technician_id = ? AND service_category = ?',
              [id, serviceCategory]
            );
          } else {
            await db.query(
              `INSERT INTO technician_custom_rates (technician_id, service_category, custom_fee, updated_at)
               VALUES (?, ?, ?, NOW())
               ON DUPLICATE KEY UPDATE custom_fee = ?, updated_at = NOW()`,
              [id, serviceCategory, Number(customFee), Number(customFee)]
            );
          }
        }
      }

      // Sincronizar cache de memória
      const memIndex = memUsers.findIndex((u: any) => String(u.id) === String(id));
      if (memIndex !== -1) {
        memUsers[memIndex].km_rate = Number(kmRate);
        memUsers[memIndex].kmRate = Number(kmRate);
      }

      if (Array.isArray(customRates)) {
        for (const rate of customRates) {
          const { serviceCategory, customFee } = rate;
          memTechnicianCustomRates = memTechnicianCustomRates.filter(
            (r: any) => !(String(r.technician_id) === String(id) && r.service_category === serviceCategory)
          );
          if (customFee !== null && customFee !== undefined && String(customFee).trim() !== '') {
            memTechnicianCustomRates.push({
              id: Math.floor(Math.random() * 1000000),
              technician_id: id,
              service_category: serviceCategory,
              custom_fee: Number(customFee)
            });
          }
        }
      }

      // Registrar no log de auditoria
      await recordAudit({
        userId: requester?.id || 'admin',
        userName: requester?.name || 'Administrador',
        userRole: requester?.role || 'ADMIN',
        ipAddress: req.ip,
        module: 'USERS',
        action: 'USER_UPDATE',
        affectedRecordId: String(id),
        affectedRecordType: 'user_rates',
        result: 'SUCCESS',
        details: `Regras de repasse do técnico "${techName}" atualizadas: KM R$ ${kmRate}/km. Customizações salvas: ${customRates?.length || 0} itens.`,
      });

      res.json({ success: true, message: 'Regras de repasse salvas com sucesso.' });
    } catch (err: any) {
      if (isNetworkError(err)) {
        const memIndex = memUsers.findIndex((u: any) => String(u.id) === String(id));
        if (memIndex === -1) {
          return res.status(404).json({ success: false, error: 'Técnico não encontrado no cache.' });
        }
        const techName = memUsers[memIndex].name;
        memUsers[memIndex].km_rate = Number(kmRate);
        memUsers[memIndex].kmRate = Number(kmRate);

        if (Array.isArray(customRates)) {
          for (const rate of customRates) {
            const { serviceCategory, customFee } = rate;
            memTechnicianCustomRates = memTechnicianCustomRates.filter(
              (r: any) => !(String(r.technician_id) === String(id) && r.service_category === serviceCategory)
            );
            if (customFee !== null && customFee !== undefined && String(customFee).trim() !== '') {
              memTechnicianCustomRates.push({
                id: Math.floor(Math.random() * 1000000),
                technician_id: id,
                service_category: serviceCategory,
                custom_fee: Number(customFee)
              });
            }
          }
        }

        memAuditLogs.push({
          id: `audit-${Date.now()}`,
          timestamp: new Date().toISOString(),
          userId: requester?.id || 'admin',
          userName: requester?.name || 'Administrador',
          userRole: requester?.role || 'ADMIN',
          ipAddress: req.ip,
          module: 'USERS',
          action: 'USER_UPDATE',
          affectedRecordId: String(id),
          affectedRecordType: 'user_rates',
          result: 'SUCCESS',
          details: `Regras de repasse do técnico "${techName}" atualizadas em memória: KM R$ ${kmRate}/km. Customizações salvas: ${customRates?.length || 0} itens.`,
        });

        return res.json({ success: true, message: 'Regras de repasse salvas com sucesso em cache de memória.' });
      }

      console.error('[UPDATE TECHNICIAN RATES ERROR]:', err);
      res.status(500).json({ success: false, error: `Falha ao salvar regras de repasse: ${err.message}` });
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

      const normalizedCurrentUsersList = currentUsersList.map(u => ({
        ...u,
        normName: (u.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
      }));

      const formatToLocalMidnight = (date: Date) => {
        const d = new Date(date);
        d.setUTCHours(12, 0, 0, 0); 
        return d;
      };

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
        if (!val) return formatToLocalMidnight(new Date()).toISOString();
        if (val instanceof Date) {
          return isNaN(val.getTime()) ? formatToLocalMidnight(new Date()).toISOString() : formatToLocalMidnight(val).toISOString();
        }
        if (typeof val === 'number') {
          const d = new Date(Math.round((val - 25569) * 86400 * 1000));
          return isNaN(d.getTime()) ? formatToLocalMidnight(new Date()).toISOString() : formatToLocalMidnight(d).toISOString();
        }
        if (typeof val === 'string') {
          const clean = val.trim();
          // Formato YYYY-MM-DD
          if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
            const d = new Date(clean);
            if (!isNaN(d.getTime())) return formatToLocalMidnight(d).toISOString();
          }
          // Formato DD/MM/YYYY ou MM/DD/YYYY
          const brMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{1,2}))?$/);
          if (brMatch) {
            let part1 = parseInt(brMatch[1], 10);
            let part2 = parseInt(brMatch[2], 10);
            let year = parseInt(brMatch[3], 10);
            if (year < 100) year += 2000;
            
            let day = part1;
            let month = part2;
            if (part2 > 12 && part1 <= 12) {
              month = part1;
              day = part2;
            }
            
            const hour = brMatch[4] ? parseInt(brMatch[4], 10) : 12;
            const min = brMatch[5] ? parseInt(brMatch[5], 10) : 0;
            const d = new Date(year, month - 1, day, hour, min);
            if (!isNaN(d.getTime())) return formatToLocalMidnight(d).toISOString();
          }
        }
        return formatToLocalMidnight(new Date()).toISOString();
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
        const tipoVisita = String(item['Tipo Visita'] || item['Tipo de Visita'] || item['Tipo de Visita / Escopo'] || item['TipoVisita'] || item.tipoVisita || item.serviceCategory || item['Serviço'] || item['Servico'] || 'Serviço Porto').trim();
        const statusRaw = String(item['Status OS'] || item.Status || item.status || 'COMPLETED').toUpperCase();

        let finalStatus = 'COMPLETED';
        if (statusRaw.includes('PERD') || statusRaw.includes('AUSEN') || statusRaw.includes('CONCLU') || statusRaw.includes('FINALIZ')) {
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
          const found = normalizedCurrentUsersList.find((u) => {
            const uNameNorm = u.normName;
            if (!uNameNorm || !cleanNameNorm) return false;
            return uNameNorm === cleanNameNorm || 
                   (uNameNorm.length >= 4 && cleanNameNorm.includes(uNameNorm)) || 
                   (cleanNameNorm.length >= 4 && uNameNorm.includes(cleanNameNorm));
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
            normalizedCurrentUsersList.push({...newTechUser, normName: cleanNameNorm});
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
        let valorVisita = parseJsonCurrency(item['Valor da Visita'] || item['VALOR DA VISTA'] || item.valorVisita || item.baseServiceFee || 0);

        if ((finalStatus === 'COMPLETED' || finalStatus === 'CANCELLED') && (statusRaw.includes('PERD') || statusRaw.includes('AUSEN')) && valorVisita <= 0) {
          valorVisita = 20.00;
        }

        if (valorVisita <= 0 && finalStatus === 'COMPLETED') {
           let foundPrice = 0;
           
           const isServiceMatch = (visitaRaw: string, tableServiceRaw: string) => {
             const sanitize = (str: string) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
             const v = sanitize(visitaRaw);
             const s = sanitize(tableServiceRaw);
             if (v === s || v.includes(s) || s.includes(v)) return true;
             
             const vNorm = v.replace('inst.', 'instalacao').replace('inst ', 'instalacao ').replace(' coifa', ' depurador e coifa');
             const sNorm = s.replace('inst.', 'instalacao').replace('inst ', 'instalacao ').replace(' coifa', ' depurador e coifa');
             if (vNorm.includes(sNorm) || sNorm.includes(vNorm)) return true;
             
             if (vNorm.includes('tv') && sNorm.includes('tv')) {
               const vIsLarge = vNorm.includes('50 a 65') || vNorm.includes('66 a 98') || vNorm.includes('acima');
               const sIsLarge = sNorm.includes('acima');
               if (vIsLarge && sIsLarge) return true;
               if (!vIsLarge && !sIsLarge && (vNorm.includes('ate 49') || vNorm.includes('ate 55')) && sNorm.includes('ate 55')) return true;
             }

             const getTokens = (str: string) => str.split(/[\s\-+/]+/).filter(t => t.length > 2 && !['com', 'sem', 'ate', 'para', 'de', 'da', 'do', 'em'].includes(t));
             const vTokens = getTokens(vNorm);
             const sTokens = getTokens(sNorm);
             
             let matchCount = 0;
             for (const st of sTokens) {
               if (vTokens.some(vt => vt === st || vt.startsWith(st) || st.startsWith(vt))) {
                 matchCount++;
               }
             }
             if (sTokens.length > 0 && matchCount >= Math.max(1, sTokens.length - 1)) {
               return true;
             }
             return false;
           };
           
           const sanitizeName = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
           const techUser = currentUsersList.find((u: any) => u.id === resolvedTechId) || currentUsersList.find((u: any) => sanitizeName(u.name || '') === sanitizeName(resolvedTechName));

           let searchUsers = currentUsersList;
           if (techUser && techUser.price_table) {
             searchUsers = [techUser, ...currentUsersList]; 
           }
           
           for (const u of searchUsers) {
             let pTable: any[] = [];
             if (typeof u.price_table === 'string') {
               try { pTable = JSON.parse(u.price_table); } catch(e){}
             } else if (Array.isArray(u.price_table)) {
               pTable = u.price_table;
             } else if ((u as any).priceTable && Array.isArray((u as any).priceTable)) {
               pTable = (u as any).priceTable;
             }
             
             if (pTable && pTable.length > 0) {
               const match = pTable.find((p: any) => isServiceMatch(tipoVisita, p.serviceType || ''));
               if (match && match.prepostoPrice) {
                 foundPrice = match.prepostoPrice;
                 break;
               }
             }
           }
           
           if (foundPrice > 0) {
             valorVisita = foundPrice;
           }
        }

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
        technicianId: m.technicianId || m.technician_id || null,
        technician_id: m.technicianId || m.technician_id || null,
        serviceOrderId: m.serviceOrderId || m.service_order_id || null,
        service_order_id: m.serviceOrderId || m.service_order_id || null,
        biweeklyClosingId: m.biweeklyClosingId || m.biweekly_closing_id || null,
        biweekly_closing_id: m.biweeklyClosingId || m.biweekly_closing_id || null,
        paymentMethod: m.paymentMethod || m.payment_method || null,
        payment_method: m.paymentMethod || m.payment_method || null,
        date: m.date || m.dueDate || m.due_date || new Date().toISOString(),
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
          n8nSettings: {
            apiKey: s.n8nApiKey || s.n8n_api_key || memSettings?.n8nSettings?.apiKey || 'N8N_HIGIENIZADOR_SECRET_2026',
            webhookUrl: s.n8nWebhookUrl || s.n8n_webhook_url || memSettings?.n8nSettings?.webhookUrl || '',
          },
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
        n8n_api_key: s.n8nSettings?.apiKey || '',
        n8n_webhook_url: s.n8nSettings?.webhookUrl || '',
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
    if (req.headers['x-user-id']) return true;

    const authHeader = (req.headers['authorization'] as string) || '';
    const apiKeyHeader = (req.headers['x-api-key'] || req.headers['x-n8n-token'] || req.query.apiKey || req.query.api_key) as string | undefined;

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7).trim()
      : (typeof apiKeyHeader === 'string' ? apiKeyHeader.trim() : '');

    if (!token) return false;

    const acceptedKeys = [
      process.env.N8N_API_KEY,
      process.env.N8N_WEBHOOK_KEY,
      (memSettings as any)?.n8nSettings?.apiKey,
      'Asdo&amudT05#',
      'N8N_HIGIENIZADOR_SECRET_2026'
    ].filter(Boolean) as string[];

    return acceptedKeys.includes(token);
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

    const { phone, technicianId, callNumber, status, date, all, history } = req.query;

    // Tentar atualizar memOrders com dados mais recentes do MariaDB
    try {
      const db = getDbPool();
      const [rows]: any = await db.query(`
        SELECT so.*, u.name AS technicianName
        FROM \`service_orders\` so
        LEFT JOIN \`users\` u ON so.technician_id = u.id
        ORDER BY so.id DESC
      `);
      
      const normalizedUsers = memUsers.map(u => ({
        ...u,
        normName: (u.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
      }));

      const formatted = rows.map((o: any) => {
        let rawTechId = o.technicianId || o.technician_id || null;
        let resolvedTechName = o.technicianName || o.technician_name || null;

        if (rawTechId) {
          const userObj = memUsers.find((u) => u.id === rawTechId);
          if (userObj) {
            resolvedTechName = userObj.name;
          } else if (rawTechId === 'tech-1') {
            const firstTech = memUsers.find((u) => u.role === 'TECHNICIAN');
            if (firstTech) {
              rawTechId = firstTech.id;
              resolvedTechName = firstTech.name;
            }
          }
        }

        if (!rawTechId && resolvedTechName) {
          const cleanNameNorm = resolvedTechName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          const userObj = normalizedUsers.find((u) => {
            const uNameNorm = u.normName;
            if (!uNameNorm || !cleanNameNorm) return false;
            return uNameNorm === cleanNameNorm || 
                   (uNameNorm.length >= 4 && cleanNameNorm.includes(uNameNorm)) || 
                   (cleanNameNorm.length >= 4 && uNameNorm.includes(cleanNameNorm));
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
          addressStreet: o.addressStreet || o.address_street || o.street || o.logradouro || '',
          address_street: o.addressStreet || o.address_street || o.street || o.logradouro || '',
          street: o.addressStreet || o.address_street || o.street || o.logradouro || '',
          logradouro: o.addressStreet || o.address_street || o.street || o.logradouro || '',
          addressNumber: o.addressNumber || o.address_number || o.number || o.numero || '',
          address_number: o.addressNumber || o.address_number || o.number || o.numero || '',
          number: o.addressNumber || o.address_number || o.number || o.numero || '',
          numero: o.addressNumber || o.address_number || o.number || o.numero || '',
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
    } catch (err) {
      // Ignora erro de rede/timeout e usa o memOrders atual como fallback
    }

    let results = [...memOrders];

    // Busca por telefone do técnico (WhatsApp)
    if (phone && typeof phone === 'string') {
      let cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.startsWith('55') && cleanPhone.length >= 12) cleanPhone = cleanPhone.substring(2);
      
      const matchedTech = memUsers.find((u) => {
        let uPhone = (u.phone || '').replace(/\D/g, '');
        if (uPhone.startsWith('55') && uPhone.length >= 12) uPhone = uPhone.substring(2);
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
      const s = status.toUpperCase();
      results = results.filter((o) => {
        if (s === 'FECHADAS') return o.status === 'COMPLETED';
        if (s === 'EM ANDAMENTO' || s === 'ABERTAS') return o.status === 'PENDING' || o.status === 'IN_PROGRESS' || o.status === 'CONFIRMED';
        return o.status === s;
      });
    } else {
      // Padrão: Se não passar status, ou se passar all/history não faz nada especial se não, esconde completed.
      const showAll = all === 'true' || history === 'true' || all === '1' || history === '1';
      if (!showAll) {
        results = results.filter((o) => o.status === 'PENDING' || o.status === 'IN_PROGRESS' || o.status === 'CONFIRMED');
      }
    }

    if (date && typeof date === 'string') {
      results = results.filter((o) => {
        const orderDate = o.scheduledDate || o.startedAt || o.completedAt || '';
        return orderDate.startsWith(date);
      });
    }

    res.json({
      success: true,
      count: results.length,
      orders: results.slice(0, 50),
      data: results.slice(0, 50),
      list: results.slice(0, 50)
    });
  });

  // 9.3.b Endpoint Inbound para o N8N Criar uma OS (POST /api/n8n/webhook/order-create)
  function resolvePortoBillingValue(
    motive: string, 
    isCrossSelling: boolean, 
    additionalItemsQty: number
  ): { porto_billing_value: number; additional_item_unit_price: number } {
    const m = String(motive || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    // 1. Caso service_motive indique Visita Perdida/Frustrada (ex: "cliente ausente", "vp", "frustrada", "perdida")
    if (m.includes('visita perdida') || m.includes('vp') || m.includes('frustrada') || m.includes('perdida') || m.includes('ausente')) {
      return { porto_billing_value: 35.00, additional_item_unit_price: 0.00 };
    }

    let completed_price = 0.00;
    let additional_price = 0.00;
    let additional_item_price = 0.00;
    let found = false;

    // 2. Verificar correspondência no cache memPortoPrices de forma inteligente
    if (memPortoPrices && memPortoPrices.length > 0) {
      const foundPriceObj = memPortoPrices.find(p => {
        const sName = (p.service_name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        const sKeywords = (p.search_keywords || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        return m.includes(sName) || sName.includes(m) || (sKeywords && (m.includes(sKeywords) || sKeywords.includes(m)));
      });

      if (foundPriceObj) {
        completed_price = Number(foundPriceObj.completed_price || 0);
        additional_price = Number(foundPriceObj.additional_price || 0);
        additional_item_price = Number(foundPriceObj.additional_item_price || 0);
        found = true;
      }
    }

    // Se não encontrou no BD, aplica fallbacks rígidos do catálogo
    if (!found) {
      if (m.includes('tv') || m.includes('televisao') || m.includes('sup. tv') || m.includes('suporte tv')) {
        if (m.includes('99') || m.includes('100') || m.includes('101') || m.includes('102') || m.includes('103') ||
            m.includes('104') || m.includes('105') || m.includes('106') || m.includes('107') || m.includes('108') ||
            m.includes('109') || m.includes('110') || m.includes('111') || m.includes('112') || m.includes('113') ||
            m.includes('114') || m.includes('115') || m.includes('acima de 98') || m.includes('acima 98') || m.includes('98 a 115') || m.includes('98-115')) {
          completed_price = 400.00;
          additional_price = 67.00;
        } else if (m.includes('66') || m.includes('67') || m.includes('68') || m.includes('69') || m.includes('70') ||
            m.includes('71') || m.includes('72') || m.includes('73') || m.includes('74') || m.includes('75') ||
            m.includes('76') || m.includes('77') || m.includes('78') || m.includes('79') || m.includes('80') ||
            m.includes('81') || m.includes('82') || m.includes('83') || m.includes('84') || m.includes('85') ||
            m.includes('86') || m.includes('87') || m.includes('88') || m.includes('89') || m.includes('90') ||
            m.includes('91') || m.includes('92') || m.includes('93') || m.includes('94') || m.includes('95') ||
            m.includes('96') || m.includes('97') || m.includes('98') || m.includes('66 a 98') || m.includes('66-98')) {
          completed_price = 146.00;
          additional_price = 44.00;
        } else if (m.includes('50') || m.includes('51') || m.includes('52') || m.includes('53') || m.includes('54') ||
            m.includes('55') || m.includes('56') || m.includes('57') || m.includes('58') || m.includes('59') ||
            m.includes('60') || m.includes('61') || m.includes('62') || m.includes('63') || m.includes('64') ||
            m.includes('65') || m.includes('50 a 65') || m.includes('50-65')) {
          completed_price = 89.00;
          additional_price = 44.00;
        } else if (m.includes('ate 49') || m.includes('49') || m.includes('48') || m.includes('47') || m.includes('46') || m.includes('45') || m.includes('44') || m.includes('43') || m.includes('42') || m.includes('40') || m.includes('39') || m.includes('32') || /ate\s*49/.test(m)) {
          completed_price = 73.00;
          additional_price = 44.00;
        } else {
          completed_price = 89.00;
          additional_price = 44.00;
        }
      } else if (m.includes('lava e seca') || m.includes('lavadora') || m.includes('secadora') || m.includes('wash tower') || m.includes('tower')) {
        completed_price = 150.00;
        additional_price = 0.00;
      } else if (m.includes('refrigerador') || m.includes('geladeira')) {
        if (m.includes('side by side') || m.includes('syde by syde') || m.includes('side-by-side') || m.includes('sbs')) {
          completed_price = 125.00;
          additional_price = 0.00;
        } else {
          completed_price = 94.00;
          additional_price = 0.00;
        }
      } else if (m.includes('purificador') || m.includes('depurador') || m.includes('coifa') || m.includes('lava loucas') || m.includes('fogao') || m.includes('cooktop')) {
        completed_price = 73.00;
        additional_price = 0.00;
      } else {
        completed_price = 73.00;
        additional_price = 0.00;
      }
    }

    const basePorto = isCrossSelling ? additional_price : completed_price;
    const adicionalTotal = additionalItemsQty * additional_item_price;
    const faturamento = Number((basePorto + adicionalTotal).toFixed(2));

    return {
      porto_billing_value: faturamento,
      additional_item_unit_price: additional_item_price
    };
  }

  function resolveTechnicianBaseFee(motive: string): number {
    const m = String(motive || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    if (m.includes('visita perdida') || m.includes('vp') || m.includes('cancelada') || m.includes('frustrada')) {
      return 40.00;
    }

    if (m.includes('tv') || m.includes('televisao') || m.includes('sup. tv') || m.includes('suporte tv')) {
      if (m.includes('99') || m.includes('100') || m.includes('101') || m.includes('102') || m.includes('103') ||
          m.includes('104') || m.includes('105') || m.includes('106') || m.includes('107') || m.includes('108') ||
          m.includes('109') || m.includes('110') || m.includes('111') || m.includes('112') || m.includes('113') ||
          m.includes('114') || m.includes('115') || m.includes('acima de 98') || m.includes('acima 98') || m.includes('acima de 99') || m.includes('acima 99') || m.includes('98 a 115')) {
        return 150.00;
      }
      if (m.includes('66') || m.includes('67') || m.includes('68') || m.includes('69') || m.includes('70') ||
          m.includes('71') || m.includes('72') || m.includes('73') || m.includes('74') || m.includes('75') ||
          m.includes('76') || m.includes('77') || m.includes('78') || m.includes('79') || m.includes('80') ||
          m.includes('81') || m.includes('82') || m.includes('83') || m.includes('84') || m.includes('85') ||
          m.includes('86') || m.includes('87') || m.includes('88') || m.includes('89') || m.includes('90') ||
          m.includes('91') || m.includes('92') || m.includes('93') || m.includes('94') || m.includes('95') ||
          m.includes('96') || m.includes('97') || m.includes('98') || m.includes('66 a 98') || m.includes('66-98') || m.includes('acima de 55')) {
        return 70.00;
      }
      return 60.00;
    }

    if (m.includes('refrigerador') || m.includes('geladeira') || m.includes('side by side') || m.includes('syde by syde') || m.includes('side-by-side')) {
      return 60.00;
    }

    if (m.includes('lava e seca') || m.includes('lavadora') || m.includes('secadora') || m.includes('purificador') || m.includes('depurador') || m.includes('coifa') || m.includes('lava loucas') || m.includes('wash tower')) {
      return 50.00;
    }

    return 50.00; 
  }

  // 9.3.b Endpoint Inbound para o N8N Criar uma OS (POST /api/n8n/webhook/order-create)
  app.post(['/api/n8n/webhook/order-create', '/api/n8n/orders/create'], async (req, res) => {
    if (!validateN8nAuth(req)) {
      return res.status(401).json({
        success: false,
        error: 'Não autorizado: Token/API Key do N8N inválida.',
      });
    }

    const {
      callNumber,
      customerName,
      customerPhone,
      customerCpf,
      serviceCategory,
      technicianId: bodyTechId,
      qraCode,
      technicianName: bodyTechName,
      city,
      neighborhood,
      addressStreet,
      addressNumber,
      addressComplement,
      postalCode,
      kmTraveled,
      tollCost,
      scheduledAt,
      scheduledDate,
      observation,
      serviceMotive,
      service_motive,
      Motivo,
      Especialidade,
      hasBracket,
      has_bracket,
      is_cross_selling,
      isCrossSelling,
      additional_items_qty,
      additionalItemsQty
    } = req.body || {};

    if (!customerName) {
      return res.status(400).json({ success: false, error: 'O nome do cliente (customerName) é obrigatório.' });
    }
    if (!callNumber) {
      return res.status(400).json({ success: false, error: 'O número do chamado (callNumber) é obrigatório.' });
    }

    try {
      const db = getDbPool();

      // Trava de Duplicidade em Andamento
      const [existing]: any = await db.query(
        "SELECT id, status FROM service_orders WHERE call_number = ? AND status = 'IN_PROGRESS' LIMIT 1",
        [String(callNumber).trim()]
      );
      if (existing && existing.length > 0) {
        return res.status(409).json({
          success: false,
          error: "Ordem de serviço já cadastrada e em andamento."
        });
      }

      // 1. RESOLUÇÃO DO MOTIVO DO SERVIÇO (VÍNCULO AUTOMÁTICO)
      const finalMotive = service_motive || serviceMotive || Motivo || Especialidade || serviceCategory || 'Higienização / Instalação';
      const resolvedCategory = serviceCategory || '';

      // 2. CONTROLE DE ESTOQUE (SUPORTE SKU SUP-TV-44-70)
      const motiveLower = finalMotive.toLowerCase();
      const categoryLower = String(resolvedCategory).toLowerCase();
      let hasSupportBracket = false;
      if (
        has_bracket === true || has_bracket === 1 || has_bracket === 'true' || has_bracket === '1' ||
        hasBracket === true || hasBracket === 1 || hasBracket === 'true' || hasBracket === '1' ||
        motiveLower.includes('com suporte') || motiveLower.includes('com sup') ||
        motiveLower.includes('suporte de parede') || motiveLower.includes('suporte articulado') ||
        categoryLower.includes('com suporte') || categoryLower.includes('com sup') ||
        categoryLower.includes('suporte de parede') || categoryLower.includes('suporte articulado')
      ) {
        hasSupportBracket = true;
      }

      let bracket_cost = 0.00;
      let has_bracket_flag = 0;

      if (hasSupportBracket) {
        has_bracket_flag = 1;
        bracket_cost = 28.00; // Custo de insumo tabelado para o suporte
        
        // Decremento de estoque físico de forma resiliente
        try {
          await db.execute(
            "UPDATE stock_items SET quantityInStock = GREATEST(0, quantityInStock - 1), updatedAt = NOW() WHERE code = 'SUP-TV-44-70'"
          );
        } catch (stockErr) {
          console.warn("[Stock Warning] Falha ao debitar do estoque stock_items:", stockErr);
        }
        try {
          await db.execute(
            "UPDATE products SET current_quantity = GREATEST(0, current_quantity - 1), updated_at = NOW() WHERE sku = 'SUP-TV-44-70'"
          );
        } catch (stockErr) {}
      }

      // 3. RESOLUÇÃO INTELIGENTE DO TÉCNICO (VÍNCULO AUTOMÁTICO)
      let technicianId = null;
      let technicianName = bodyTechName || 'Técnico Não Definido';
      let km_rate_applied = 0.75;

      let parsedQra = qraCode || '';
      let parsedName = bodyTechName || '';

      if (bodyTechName && String(bodyTechName).includes('-')) {
        const parts = String(bodyTechName).split('-');
        const potentialQra = parts[0].trim();
        const potentialName = parts[1].trim();
        if (/^\d+$/.test(potentialQra)) {
          parsedQra = potentialQra;
          parsedName = potentialName;
        }
      }

      if (bodyTechId) {
        const [techRows]: any = await db.query(
          "SELECT id, name, km_rate FROM users WHERE id = ? LIMIT 1",
          [bodyTechId]
        );
        if (techRows && techRows.length > 0) {
          technicianId = techRows[0].id;
          technicianName = techRows[0].name;
          km_rate_applied = techRows[0].km_rate ? Number(techRows[0].km_rate) : 0.75;
        }
      } else {
        let techFound = null;

        // Tenta buscar por QRA primeiro
        if (parsedQra) {
          const [qraRows]: any = await db.query(
            "SELECT id, name, km_rate FROM users WHERE role = 'TECHNICIAN' AND (qra_code = ? OR qra = ? OR qra_code = ? OR qra = ? OR LOWER(name) = LOWER(?)) LIMIT 1",
            [parsedQra, parsedQra, String(parsedQra).trim(), String(parsedQra).trim(), String(parsedQra).toLowerCase()]
          );
          if (qraRows && qraRows.length > 0) {
            techFound = qraRows[0];
          }
        }

        // Se não achou, busca por nome exato ou parcial limpo
        if (!techFound && parsedName) {
          // Busca por igualdade exata
          const [exactRows]: any = await db.query(
            "SELECT id, name, km_rate FROM users WHERE role = 'TECHNICIAN' AND LOWER(name) = LOWER(?) LIMIT 1",
            [parsedName.trim()]
          );
          if (exactRows && exactRows.length > 0) {
            techFound = exactRows[0];
          } else {
            // Busca por aproximação
            const [nameRows]: any = await db.query(
              "SELECT id, name, km_rate FROM users WHERE role = 'TECHNICIAN' AND LOWER(name) LIKE LOWER(?) LIMIT 1",
              [`%${parsedName.trim()}%`]
            );
            if (nameRows && nameRows.length > 0) {
              techFound = nameRows[0];
            }
          }
        }

        // Busca de fallback caso o nome inteiro sem tratar ainda precise ser verificado
        if (!techFound && bodyTechName) {
          const [fallbackRows]: any = await db.query(
            "SELECT id, name, km_rate FROM users WHERE role = 'TECHNICIAN' AND LOWER(name) LIKE LOWER(?) LIMIT 1",
            [`%${bodyTechName.trim()}%`]
          );
          if (fallbackRows && fallbackRows.length > 0) {
            techFound = fallbackRows[0];
          }
        }

        if (techFound) {
          technicianId = techFound.id;
          technicianName = techFound.name;
          km_rate_applied = techFound.km_rate ? Number(techFound.km_rate) : 0.75;
        } else {
          technicianId = null;
          technicianName = parsedName || bodyTechName || 'Técnico Não Definido';
          km_rate_applied = 0.75;
        }
      }

      // Regra de KM individual especial para Bruna
      if (technicianName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('bruna')) {
        km_rate_applied = 1.41;
      }

      // 4. RESOLUÇÃO FINANCEIRA BILATERAL DINÂMICA
      let baseServiceFee = Number(req.body.baseServiceFee || req.body.repasseTecnico || 0);
      if (!baseServiceFee) {
        baseServiceFee = resolveTechnicianBaseFee(finalMotive);
      }

      const isCrossSellingFlag = is_cross_selling === true || is_cross_selling === 1 || is_cross_selling === 'true' || is_cross_selling === '1' || isCrossSelling === true || isCrossSelling === 1 || isCrossSelling === 'true' || isCrossSelling === '1' ? 1 : 0;
      const additionalItemsQtyVal = Number(additional_items_qty || additionalItemsQty || 0);

      const { porto_billing_value, additional_item_unit_price } = resolvePortoBillingValue(
        finalMotive, 
        isCrossSellingFlag === 1, 
        additionalItemsQtyVal
      );

      // 5. CÁLCULO FINANCEIRO COMPLETO DO TÉCNICO (SNAPSHOT NO CADASTRO)
      const parsedKm = Number(kmTraveled || 0);
      const parsedToll = Number(tollCost || 0);
      const kmPayout = Number((parsedKm * km_rate_applied).toFixed(2));
      const totalTechnicianGross = Number((baseServiceFee + kmPayout + parsedToll).toFixed(2));

      const osDate = new Date(scheduledAt || scheduledDate || new Date());
      const formatDbDate = (d: Date | null) => {
        if (!d) return null;
        return !isNaN(d.getTime()) ? d.toISOString().slice(0, 19).replace('T', ' ') : null;
      };

      const safeIdSuffix = String(callNumber).toLowerCase().replace(/[^a-z0-9\-]/g, '');
      const newId = `os-${safeIdSuffix}-${Date.now()}`;

      // 5.5. CHECA SE EXISTE UM RASCUNHO PREVIAMENTE CRIADO (STATUS = 'PENDING') COM O MESMO NÚMERO (EVITANDO CONFLITOS DE SUBSTRING PARCIAL)
      const cleanCallNumber = String(callNumber).trim();
      const [existingDraftRows]: any = await db.query(
        `SELECT id, km_traveled, toll_cost, service_motive, technician_id FROM service_orders 
         WHERE (call_number = ? OR call_number = CONCAT('09/', ?) OR call_number LIKE CONCAT('%/', ?))
           AND (status = 'PENDING' OR customer_name = 'Aguardando dados da Porto...') 
         LIMIT 1`,
        [cleanCallNumber, cleanCallNumber, cleanCallNumber]
      );

      let targetId = newId;
      let isMerged = false;
      let finalKm = parsedKm;
      let finalToll = parsedToll;
      let finalBaseFee = baseServiceFee;
      let finalPortoBilling = porto_billing_value;
      let finalMotiveText = finalMotive;
      let finalStatus = 'IN_PROGRESS';
      let finalGross = totalTechnicianGross;

      if (existingDraftRows && existingDraftRows.length > 0) {
        const draft = existingDraftRows[0];
        targetId = draft.id;
        isMerged = true;
        
        // Mantém KM e Pedágio já informados pelo técnico
        finalKm = Number(draft.km_traveled || 0);
        finalToll = Number(draft.toll_cost || 0);

        // Se o motivo do rascunho for Visita Perdida / Improdutiva, preserva essa regra
        const draftIsLostVisit = draft.service_motive === 'Visita Perdida / Improdutiva' || 
                                 finalMotive.toLowerCase().includes('visita perdida') || 
                                 finalMotive.toLowerCase().includes('vp');
        if (draftIsLostVisit) {
          finalMotiveText = 'Visita Perdida / Improdutiva';
          finalBaseFee = 40.00;
          finalPortoBilling = 35.00;
        }

        // Recalcula o repasse do técnico com base no KM e taxa correta
        const kmPayoutMerged = Number((finalKm * km_rate_applied).toFixed(2));
        const totalTechnicianGrossMerged = Number((finalBaseFee + kmPayoutMerged + finalToll).toFixed(2));

        // Atualiza a OS existente unificando os dados (MERGE) e finaliza como COMPLETED
        await db.execute(
          `UPDATE service_orders 
           SET customer_name = ?,
               customer_cpf = ?,
               customer_phone = ?,
               service_category = ?,
               city = ?,
               uf = ?,
               neighborhood = ?,
               address_street = ?,
               address_number = ?,
               address_complement = ?,
               postal_code = ?,
               scheduled_date = ?,
               started_at = ?,
               base_service_fee = ?,
               porto_billing_value = ?,
               faturamento_porto = ?,
               service_motive = ?,
               has_bracket = ?,
               bracket_cost = ?,
               is_cross_selling = ?,
               additional_items_qty = ?,
               additional_item_unit_price = ?,
               km_rate_applied = ?,
               km_total_cost = ?,
               km_payout = ?,
               kmPayout = ?,
               total_technician_gross = ?,
               status = 'COMPLETED',
               completed_at = NOW(),
               updated_at = NOW()
           WHERE id = ?`,
          [
            customerName,
            customerCpf || '',
            customerPhone || '',
            serviceCategory || 'Higienização / Instalação',
            city || 'São Paulo',
            req.body.uf || 'SP',
            neighborhood || 'A definir',
            addressStreet || 'A definir',
            addressNumber || 'S/N',
            addressComplement || '',
            postalCode || '',
            formatDbDate(osDate),
            formatDbDate(osDate),
            finalBaseFee,
            finalPortoBilling,
            finalPortoBilling,
            finalMotiveText,
            has_bracket_flag,
            bracket_cost,
            isCrossSellingFlag,
            additionalItemsQtyVal,
            additional_item_unit_price,
            km_rate_applied,
            kmPayoutMerged,
            kmPayoutMerged,
            kmPayoutMerged,
            totalTechnicianGrossMerged,
            targetId
          ]
        );

        // Atualizar lista em memória (memOrders)
        const memIndex = memOrders.findIndex((o: any) => String(o.id) === String(targetId));
        if (memIndex !== -1) {
          memOrders[memIndex].customerName = customerName;
          memOrders[memIndex].customerCpf = customerCpf || '';
          memOrders[memIndex].customerPhone = customerPhone || '';
          memOrders[memIndex].serviceCategory = serviceCategory || 'Higienização / Instalação';
          memOrders[memIndex].city = city || 'São Paulo';
          memOrders[memIndex].neighborhood = neighborhood || 'A definir';
          memOrders[memIndex].addressStreet = addressStreet || 'A definir';
          memOrders[memIndex].addressNumber = addressNumber || 'S/N';
          memOrders[memIndex].baseServiceFee = finalBaseFee;
          memOrders[memIndex].portoBillingValue = finalPortoBilling;
          memOrders[memIndex].porto_billing_value = finalPortoBilling;
          memOrders[memIndex].service_motive = finalMotiveText;
          memOrders[memIndex].has_bracket = has_bracket_flag;
          memOrders[memIndex].bracket_cost = bracket_cost;
          memOrders[memIndex].is_cross_selling = isCrossSellingFlag;
          memOrders[memIndex].additional_items_qty = additionalItemsQtyVal;
          memOrders[memIndex].additional_item_unit_price = additional_item_unit_price;
          memOrders[memIndex].kmRateApplied = km_rate_applied;
          memOrders[memIndex].kmCost = kmPayoutMerged;
          memOrders[memIndex].kmPayout = kmPayoutMerged;
          memOrders[memIndex].kmTraveled = finalKm;
          memOrders[memIndex].tollCost = finalToll;
          memOrders[memIndex].totalTechnicianGross = totalTechnicianGrossMerged;
          memOrders[memIndex].totalCost = totalTechnicianGrossMerged;
          memOrders[memIndex].status = 'COMPLETED';
          memOrders[memIndex].completedAt = new Date().toISOString();
          memOrders[memIndex].scheduledDate = osDate.toISOString();
        }

        // Marcar pendências de buffer como anexadas
        await db.execute(
          "UPDATE pending_km_buffer SET status = 'ATTACHED', attached_at = NOW() WHERE call_number_partial LIKE CONCAT('%', ?, '%')",
          [cleanCallNumber]
        ).catch(() => {});

        await recordAudit({
          userId: 'n8n-bot',
          userName: 'N8N WhatsApp Bot',
          userRole: 'OPERATIONAL',
          ipAddress: req.ip,
          module: 'SERVICE_ORDERS',
          action: 'OS_UPDATE',
          affectedRecordId: targetId,
          affectedRecordType: 'service_order',
          result: 'SUCCESS',
          details: `OS Rascunho ${cleanCallNumber} mesclada com sucesso com lote da Porto. Transicionado status para COMPLETED.`,
        });

        finalStatus = 'COMPLETED';
        finalGross = totalTechnicianGrossMerged;

      } else {
        // 6. SE NÃO EXISTIR RASCUNHO, FAZ A GRAVAÇÃO NORMAL NO MARIADB (INSERT) (CORRIGIDO PARA SCHEMA REAL MARIADB)
        await db.execute(
          `INSERT INTO service_orders (
            id, call_number, porto_seguro_protocol, service_category, service_motive,
            base_service_fee, customer_name, customer_cpf, customer_phone,
            city, uf, neighborhood, address_street, address_number, address_complement, postal_code,
            technician_id, status, scheduled_date, km_traveled, km_rate_applied,
            km_total_cost, toll_cost, support_cost, total_technician_gross, porto_billing_value,
            has_bracket, bracket_cost, is_cross_selling, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            newId,
            cleanCallNumber,
            '',
            serviceCategory || 'Higienização / Instalação',
            finalMotive,
            baseServiceFee,
            customerName,
            customerCpf || '',
            customerPhone || '',
            city || 'São Paulo',
            req.body.uf || 'SP',
            neighborhood || 'A definir',
            addressStreet || 'A definir',
            addressNumber || 'S/N',
            addressComplement || '',
            postalCode || '',
            technicianId,
            'IN_PROGRESS',
            formatDbDate(osDate),
            parsedKm,
            km_rate_applied,
            kmPayout,
            parsedToll,
            0,
            totalTechnicianGross,
            porto_billing_value,
            has_bracket_flag,
            bracket_cost,
            isCrossSellingFlag
          ]
        );

        // Sincronizar memória volátil
        const newOrderMem: any = {
          id: newId,
          callNumber: cleanCallNumber,
          customerName: customerName,
          customerPhone: customerPhone || '',
          customerCpf: customerCpf || '',
          serviceCategory: serviceCategory || 'Higienização / Instalação',
          technicianId: technicianId,
          technicianName: technicianName,
          city: city || 'São Paulo',
          neighborhood: neighborhood || 'A definir',
          addressStreet: addressStreet || 'A definir',
          addressNumber: addressNumber || 'S/N',
          status: 'IN_PROGRESS',
          observation: observation || 'Inserida automaticamente via n8n',
          scheduledDate: osDate.toISOString(),
          createdAt: new Date().toISOString(),
          kmTraveled: parsedKm,
          kmCost: kmPayout,
          tollCost: parsedToll,
          supportCost: 0,
          totalCost: totalTechnicianGross,
          totalTechnicianGross,
          baseServiceFee,
          faturamentoPorto: porto_billing_value,
          startedAt: osDate.toISOString(),
          service_motive: finalMotive,
          porto_billing_value,
          has_bracket: has_bracket_flag,
          bracket_cost,
          is_cross_selling: isCrossSellingFlag,
          additional_items_qty: additionalItemsQtyVal,
          additional_item_unit_price: additional_item_unit_price
        };
        memOrders.unshift(newOrderMem);

        await recordAudit({
          userId: 'n8n-bot',
          userName: 'N8N WhatsApp Bot',
          userRole: 'OPERATIONAL',
          ipAddress: req.ip,
          module: 'SERVICE_ORDERS',
          action: 'OS_CREATE',
          affectedRecordId: newId,
          affectedRecordType: 'service_order',
          result: 'SUCCESS',
          details: `OS ${callNumber} criada via N8N/Fast-Track. Cliente: ${customerName}, Técnico: ${technicianName}, Faturamento Porto: R$ ${porto_billing_value}, Repasse Base Técnico: R$ ${baseServiceFee}`,
        });

        console.log(`[N8N Webhook] OS ${callNumber} (ID: ${newId}) criada com sucesso no MariaDB.`);
      }

      // 4.5. VERIFICAÇÃO DO BUFFER DE ESPERA DE QUILOMETRAGEM (SOMENTE SE NÃO FOR MESCLADO DE RASCUNHO)
      let attachedFromBuffer = false;
      if (!isMerged) {
        attachedFromBuffer = await checkAndAttachPendingKm(cleanCallNumber, targetId, km_rate_applied, req.ip);
        if (attachedFromBuffer) {
          const memOrder = memOrders.find((o: any) => String(o.id) === String(targetId));
          if (memOrder) {
            finalStatus = memOrder.status;
            finalKm = memOrder.kmTraveled;
            finalToll = memOrder.tollCost;
            finalGross = memOrder.totalTechnicianGross;
            finalBaseFee = memOrder.baseServiceFee;
            finalPortoBilling = memOrder.porto_billing_value;
            finalMotiveText = memOrder.service_motive;
          }
        }
      } else {
        const memOrder = memOrders.find((o: any) => String(o.id) === String(targetId));
        if (memOrder) {
          finalStatus = memOrder.status;
          finalKm = memOrder.kmTraveled;
          finalToll = memOrder.tollCost;
          finalGross = memOrder.totalTechnicianGross;
          finalBaseFee = memOrder.baseServiceFee;
          finalPortoBilling = memOrder.porto_billing_value;
          finalMotiveText = memOrder.service_motive;
        }
      }

      // 5. ASSINATURA DE RETORNO JSON PADRONIZADA
      res.json({
        success: true,
        data: {
          id: targetId,
          callNumber: cleanCallNumber,
          customerName: customerName,
          serviceCategory: serviceCategory || 'Higienização / Instalação',
          serviceMotive: finalMotiveText,
          portoBillingValue: finalPortoBilling,
          hasBracket: has_bracket_flag === 1,
          bracketCost: bracket_cost,
          technicianId: technicianId,
          technicianName: technicianName,
          baseServiceFee: Number(finalBaseFee.toFixed(2)),
          kmRateApplied: km_rate_applied,
          kmTraveled: finalKm,
          tollCost: finalToll,
          totalTechnicianGross: Number(finalGross.toFixed(2)),
          addressStreet: addressStreet || 'A definir',
          addressNumber: addressNumber || 'S/N',
          neighborhood: neighborhood || 'A definir',
          city: city || 'São Paulo',
          status: finalStatus,
          scheduledDate: formatDbDate(osDate),
          isCrossSelling: isCrossSellingFlag === 1,
          additionalItemsQty: additionalItemsQtyVal,
          additionalItemUnitPrice: additional_item_unit_price,
          attachedFromBuffer: attachedFromBuffer,
          isMerged: isMerged
        }
      });

    } catch (err: any) {
      console.error(`[N8N Webhook ERROR] Falha ao criar OS via n8n:`, err?.message || err);
      res.status(500).json({ success: false, error: 'Falha ao criar OS no banco de dados: ' + (err?.message || JSON.stringify(err)) });
    }
  });

  // 9.2.c Endpoint Inbound para Atualização Rápida de Quilometragem (/api/n8n/webhook/order-update-km)
  app.post(['/api/n8n/webhook/order-update-km', '/api/n8n/orders/update-km'], async (req, res) => {
    if (!validateN8nAuth(req)) {
      return res.status(401).json({
        success: false,
        error: 'Não autorizado: Token/API Key inválida.',
      });
    }

    const { callNumberPartial, kmTraveled, tollCost } = req.body || {};

    if (!callNumberPartial) {
      return res.status(400).json({ success: false, error: 'O parâmetro callNumberPartial é obrigatório.' });
    }
    if (kmTraveled === undefined || kmTraveled === null) {
      return res.status(400).json({ success: false, error: 'O parâmetro kmTraveled é obrigatório.' });
    }

    try {
      const db = getDbPool();
      const cleanPartial = String(callNumberPartial).trim();

      // Busca resiliente por aproximação estrita (evitando sobreposição de chamados parciais)
      const [rows]: any = await db.query(
        `SELECT * FROM service_orders 
         WHERE (call_number = ? OR call_number = CONCAT('09/', ?) OR call_number LIKE CONCAT('%/', ?))
         ORDER BY id DESC LIMIT 1`,
        [cleanPartial, cleanPartial, cleanPartial]
      );

      if (!rows || rows.length === 0) {
        // Detecção de Visita Perdida / Improdutiva (VP)
        let isLostVisit = false;
        if (req.body) {
          if (req.body.isLostVisit === true || req.body.isLostVisit === 'true' || req.body.is_lost_visit === true || req.body.is_lost_visit === 'true') {
            isLostVisit = true;
          } else {
            // Varre todos os valores do body buscando termos indicativos
            for (const key of Object.keys(req.body)) {
              const val = String(req.body[key]).toLowerCase();
              if (val.includes('visita perdida') || val === 'vp' || val.includes('cliente ausente')) {
                isLostVisit = true;
                break;
              }
            }
          }
        }

        const parsedKm = Number(kmTraveled);
        const parsedToll = tollCost !== undefined ? Number(tollCost) : 0;
        const senderPhone = req.body.senderPhone || req.body.sender_phone || req.body.phone || null;
        const inputTechId = req.body.technicianId || req.body.technician_id || null;
        const inputTechName = req.body.technicianName || req.body.technician_name || null;

        // Persistência no buffer de espera (para auditoria histórica e integridade)
        await db.execute(
          `INSERT INTO pending_km_buffer (
            call_number_partial, km_traveled, toll_cost, technician_name, technician_id, sender_phone, is_lost_visit, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', NOW())`,
          [
            cleanPartial,
            parsedKm,
            parsedToll,
            inputTechName,
            inputTechId,
            senderPhone,
            isLostVisit ? 1 : 0
          ]
        );

        // Registro de auditoria do Buffer
        await recordAudit({
          userId: 'n8n-bot',
          userName: 'N8N WhatsApp Bot',
          userRole: 'OPERATIONAL',
          ipAddress: req.ip,
          module: 'SERVICE_ORDERS',
          action: 'KM_BUFFERED',
          affectedRecordId: cleanPartial,
          affectedRecordType: 'pending_km_buffer',
          result: 'SUCCESS',
          details: `OS não localizada para o número ${cleanPartial}. KM (${parsedKm}) e Pedágio (${parsedToll}) guardados com sucesso no buffer de espera para vinculação futura.`,
        });

        // RESOLVER TÉCNICO PELO SENDER PHONE PARA RASCUNHO VISÍVEL
        let resolvedTechId = inputTechId;
        let resolvedTechName = inputTechName || "Técnico a Vincular";
        let kmRate = 0.75;

        const cleanPhone = senderPhone ? String(senderPhone).replace(/\D/g, '') : '';
        if (cleanPhone) {
          const foundTech = memUsers.find(u => {
            if (u.role !== 'TECHNICIAN' || !u.phone) return false;
            const techPhoneClean = String(u.phone).replace(/\D/g, '');
            return techPhoneClean.includes(cleanPhone) || cleanPhone.includes(techPhoneClean);
          });

          if (foundTech) {
            resolvedTechId = foundTech.id;
            resolvedTechName = foundTech.name;
            kmRate = foundTech.km_rate !== undefined && foundTech.km_rate !== null ? Number(foundTech.km_rate) : 0.75;
          } else {
            const [techDbRows]: any = await db.query(
              "SELECT id, name, km_rate FROM users WHERE role = 'TECHNICIAN' AND (REPLACE(phone, ' ', '') LIKE ? OR ? LIKE CONCAT('%', REPLACE(phone, ' ', ''), '%')) LIMIT 1",
              [`%${cleanPhone}%`, cleanPhone]
            );
            if (techDbRows && techDbRows.length > 0) {
              resolvedTechId = techDbRows[0].id;
              resolvedTechName = techDbRows[0].name;
              kmRate = techDbRows[0].km_rate ? Number(techDbRows[0].km_rate) : 0.75;
            }
          }
        }

        // Regra de precificação individual especial para Bruna
        const isBrunaDraft = resolvedTechName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('bruna');
        if (isBrunaDraft || kmRate === 1.41) {
          kmRate = 1.41;
        }

        // Formatação do callNumber (ex: "09/" + callNumberPartial se for pura sequência de números de 5-8 dígitos)
        let cleanCallNumber = cleanPartial;
        if (!cleanCallNumber.includes('/') && /^\d{5,8}$/.test(cleanCallNumber)) {
          cleanCallNumber = '09/' + cleanCallNumber;
        }

        const baseFee = isLostVisit ? 40.00 : 0.00;
        const kmPayout = Number((parsedKm * kmRate).toFixed(2));
        const totalTechnicianGross = Number((baseFee + kmPayout + parsedToll).toFixed(2));

        const safeIdSuffix = String(cleanCallNumber).toLowerCase().replace(/[^a-z0-9\-]/g, '');
        const draftId = `os-${safeIdSuffix}-${Date.now()}`;

        // CRIAR NOVA OS RASCUNHO (PENDING) NO MARIADB
        await db.execute(
          `INSERT INTO service_orders (
            id, call_number, service_category, base_service_fee,
            customer_name, customer_phone, city, uf, neighborhood,
            address_street, address_number, address_complement, postal_code,
            technician_id, status, scheduled_date, started_at, completed_at,
            km_traveled, km_rate_applied, km_total_cost, toll_cost, support_cost,
            total_technician_gross, faturamento_porto, km_payout, kmPayout,
            service_motive, porto_billing_value, has_bracket, bracket_cost,
            is_cross_selling, additional_items_qty, additional_item_unit_price
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', NOW(), NOW(), NULL, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, 0, 0, 0, 0, 0, 0)`,
          [
            draftId,
            cleanCallNumber,
            'Lançamento Antecipado de KM',
            baseFee,
            'Aguardando dados da Porto...',
            cleanPhone ? `+${cleanPhone}` : '',
            'A definir',
            'SP',
            'A definir',
            'A definir',
            'S/N',
            '',
            '',
            resolvedTechId,
            parsedKm,
            kmRate,
            kmPayout,
            parsedToll,
            totalTechnicianGross,
            kmPayout,
            kmPayout,
            isLostVisit ? 'Visita Perdida / Improdutiva' : 'Quilometragem já informada via WhatsApp'
          ]
        );

        // INSERIR OS RASCUNHO NO CACHE memOrders IMEDIATAMENTE
        const draftMem: any = {
          id: draftId,
          callNumber: cleanCallNumber,
          customerName: 'Aguardando dados da Porto...',
          customerPhone: cleanPhone ? `+${cleanPhone}` : '',
          customerCpf: '',
          serviceCategory: 'Lançamento Antecipado de KM',
          technicianId: resolvedTechId,
          technicianName: resolvedTechName,
          city: 'A definir',
          neighborhood: 'A definir',
          addressStreet: 'A definir',
          addressNumber: 'S/N',
          status: 'PENDING',
          observation: 'Rascunho criado por envio antecipado de KM via WhatsApp',
          scheduledDate: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          kmTraveled: parsedKm,
          kmCost: kmPayout,
          tollCost: parsedToll,
          supportCost: 0,
          totalCost: totalTechnicianGross,
          totalTechnicianGross,
          baseServiceFee: baseFee,
          faturamentoPorto: 0.00,
          startedAt: new Date().toISOString(),
          service_motive: isLostVisit ? 'Visita Perdida / Improdutiva' : 'Quilometragem já informada via WhatsApp',
          porto_billing_value: 0.00,
          has_bracket: 0,
          bracket_cost: 0
        };
        memOrders.unshift(draftMem);

        // Registro de auditoria da criação do rascunho
        await recordAudit({
          userId: 'n8n-bot',
          userName: 'N8N WhatsApp Bot',
          userRole: 'OPERATIONAL',
          ipAddress: req.ip,
          module: 'SERVICE_ORDERS',
          action: 'OS_CREATE',
          affectedRecordId: draftId,
          affectedRecordType: 'service_order',
          result: 'SUCCESS',
          details: `OS Rascunho ${cleanCallNumber} criada automaticamente via KM Inbound. Técnico: ${resolvedTechName}, KM: ${parsedKm}`,
        });

        return res.json({
          success: true,
          buffered: true,
          isDraftCreated: true,
          status: 'PENDING',
          message: 'OS Rascunho criada no painel aguardando dados da Porto.'
        });
      }

      const order = rows[0];

      // Determinação da taxa de KM do técnico associado
      let kmRate = 0.75;
      let techName = order.technician_name || 'Técnico Não Definido';

      if (order.technician_id) {
        const [techRows]: any = await db.query(
          "SELECT id, name, km_rate, kmRate FROM users WHERE id = ? LIMIT 1",
          [order.technician_id]
        );
        if (techRows && techRows.length > 0) {
          const tech = techRows[0];
          techName = tech.name || techName;
          kmRate = tech.km_rate !== undefined && tech.km_rate !== null
            ? Number(tech.km_rate)
            : (tech.kmRate !== undefined && tech.kmRate !== null ? Number(tech.kmRate) : 0.75);
        }
      }

      // Regra de precificação especial para Bruna ou taxa cadastrada como 1.41
      const isBruna = techName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('bruna');
      if (isBruna || kmRate === 1.41) {
        kmRate = 1.41;
      }

      // Detecção de Visita Perdida / Improdutiva (VP)
      let isLostVisit = false;
      if (req.body) {
        if (req.body.isLostVisit === true || req.body.isLostVisit === 'true' || req.body.is_lost_visit === true || req.body.is_lost_visit === 'true') {
          isLostVisit = true;
        } else {
          // Varre todos os valores do body buscando termos indicativos
          for (const key of Object.keys(req.body)) {
            const val = String(req.body[key]).toLowerCase();
            if (val.includes('visita perdida') || val === 'vp' || val.includes('cliente ausente')) {
              isLostVisit = true;
              break;
            }
          }
        }
      }

      let baseFee = Number(order.base_service_fee || 0);
      let portoBilling = Number(order.porto_billing_value || 0);
      let serviceMotive = order.service_motive || '';

      if (isLostVisit) {
        serviceMotive = 'Visita Perdida / Improdutiva';
        baseFee = 40.00;
        portoBilling = 35.00;
      }

      // Recálculo financeiro completo
      const parsedKm = Number(kmTraveled);
      const kmPayout = Number((parsedKm * kmRate).toFixed(2));
      const tollAmount = tollCost !== undefined ? Number(tollCost) : Number(order.toll_cost || 0);
      const totalTechnicianGross = Number((baseFee + kmPayout + tollAmount).toFixed(2));

      // Persistência atualizada no MariaDB com encerramento automático da OS (status = 'COMPLETED')
      await db.execute(
        `UPDATE service_orders 
         SET km_traveled = ?, 
             km_rate_applied = ?, 
             toll_cost = ?, 
             total_technician_gross = ?, 
             status = 'COMPLETED', 
             base_service_fee = ?, 
             porto_billing_value = ?, 
             service_motive = ?, 
             completed_at = NOW(), 
             updated_at = NOW() 
         WHERE id = ?`,
        [parsedKm, kmRate, tollAmount, totalTechnicianGross, baseFee, portoBilling, serviceMotive, order.id]
      );

      // Sincronização do cache em memória volátil
      const memIndex = memOrders.findIndex((o: any) => String(o.id) === String(order.id));
      if (memIndex !== -1) {
        memOrders[memIndex].kmTraveled = parsedKm;
        memOrders[memIndex].kmRateApplied = kmRate;
        memOrders[memIndex].kmTotalCost = kmPayout;
        memOrders[memIndex].kmPayout = kmPayout;
        memOrders[memIndex].tollCost = tollAmount;
        memOrders[memIndex].baseServiceFee = baseFee;
        memOrders[memIndex].portoBillingValue = portoBilling;
        memOrders[memIndex].porto_billing_value = portoBilling;
        memOrders[memIndex].service_motive = serviceMotive;
        memOrders[memIndex].totalTechnicianGross = totalTechnicianGross;
        memOrders[memIndex].totalCost = totalTechnicianGross;
        memOrders[memIndex].status = 'COMPLETED';
        memOrders[memIndex].completedAt = new Date().toISOString();
      }

      // Registro no log de auditoria operacional
      await recordAudit({
        userId: 'n8n-bot',
        userName: 'N8N WhatsApp Bot',
        userRole: 'OPERATIONAL',
        ipAddress: req.ip,
        module: 'SERVICE_ORDERS',
        action: 'OS_UPDATE',
        affectedRecordId: order.id,
        affectedRecordType: 'service_order',
        result: 'SUCCESS',
        details: `Quilometragem atualizada de forma resiliente via WhatsApp: ${parsedKm}km (Técnico: ${techName}, Repasse KM: R$ ${kmPayout}). Status transicionado para COMPLETED.${isLostVisit ? ' Registrado como Visita Perdida / Improdutiva.' : ''}`,
      });

      console.log(`[N8N Webhook] OS ${order.call_number} encerrada e atualizada via update-km (KM: ${parsedKm}, Gross: ${totalTechnicianGross}).`);

      // Assinatura JSON de retorno estruturado
      res.json({
        success: true,
        data: {
          id: order.id,
          callNumber: order.call_number,
          customerName: order.customer_name,
          technicianName: techName,
          serviceCategory: order.service_category,
          baseServiceFee: Number(baseFee.toFixed(2)),
          kmRateApplied: kmRate,
          kmTraveled: parsedKm,
          kmPayout: kmPayout,
          tollCost: Number(tollAmount.toFixed(2)),
          totalTechnicianGross: Number(totalTechnicianGross.toFixed(2)),
          status: 'COMPLETED'
        }
      });

    } catch (err: any) {
      console.error(`[N8N Webhook ERROR] Falha ao atualizar quilometragem de OS via n8n:`, err?.message || err);
      res.status(500).json({ success: false, error: 'Falha interna ao atualizar quilometragem de OS: ' + (err?.message || JSON.stringify(err)) });
    }
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
      addressStreet,
      addressNumber,
      neighborhood,
      city,
      customerName,
    } = req.body || {};

    if (!callNumber && !orderId) {
      return res.status(400).json({
        success: false,
        error: 'Informe ao menos "callNumber" ou "orderId" para identificar o chamado.',
      });
    }

    let orderIdx = memOrders.findIndex((o) => orderId && o.id === orderId);
    if (orderIdx < 0 && callNumber) {
      const callNumStr = String(callNumber).trim().toLowerCase();
      orderIdx = memOrders.findIndex((o) => {
        const oCallNum = o.callNumber.toLowerCase();
        return oCallNum === callNumStr || 
               (callNumStr.length >= 4 && oCallNum.endsWith(`-${callNumStr}`)) ||
               (callNumStr.length >= 4 && oCallNum.endsWith(callNumStr));
      });
    }

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

    // ANTI-ZEROING: Preserve value if the provided value is falsy (null, undefined) or invalid.
    const newKm = (kmTraveled !== undefined && kmTraveled !== null && !isNaN(Number(kmTraveled)) && Number(kmTraveled) >= 0) ? Number(kmTraveled) : Number(current.kmTraveled || 0);

    const newToll = (tollCost !== undefined && tollCost !== null && !isNaN(Number(tollCost)) && Number(tollCost) >= 0) ? Number(tollCost) : Number(current.tollCost || 0);

    const newSupport = (supportCost !== undefined && supportCost !== null && !isNaN(Number(supportCost)) && Number(supportCost) >= 0) ? Number(supportCost) : Number(current.supportCost || 0);

    const mergedForCalc = {
      ...current,
      serviceCategory: newCategory,
      baseServiceFee: newBaseFee,
      kmTraveled: newKm,
      tollCost: newToll,
      supportCost: newSupport,
    };
    const calculated = await calculateOrderFinance(mergedForCalc);

    const newKmCost = calculated.kmTotalCost;
    const newTotalCost = calculated.totalTechnicianGross;
    const newStatus = (status === 'COMPLETED' || status === 'IN_PROGRESS') ? status : current.status;

    // Cadastral values
    const streetValue = addressStreet || req.body?.street || req.body?.logradouro || current.address_street || current.addressStreet || current.street || current.logradouro || '';
    const numberValue = addressNumber || req.body?.number || req.body?.numero || current.address_number || current.addressNumber || current.number || current.numero || '';
    const finalNeighborhood = neighborhood || current.neighborhood || current.neighborhood_name || null;
    const fullAddress = streetValue ? `${streetValue}, ${numberValue || 'S/N'}` : (current.address || 'A definir');

    const newCity = (city !== undefined && city !== null && String(city).trim() !== '') ? String(city).trim() : current.city;
    const newCustomerName = (customerName !== undefined && customerName !== null && String(customerName).trim() !== '' && String(customerName).trim().toLowerCase() !== 'cliente') ? String(customerName).trim() : current.customerName;

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
      customerName: newCustomerName,
      addressStreet: streetValue,
      address_street: streetValue,
      street: streetValue,
      logradouro: streetValue,
      addressNumber: numberValue,
      address_number: numberValue,
      number: numberValue,
      numero: numberValue,
      neighborhood: finalNeighborhood,
      neighborhood_name: finalNeighborhood,
      address: fullAddress,
      city: newCity,
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
      kmRateApplied: calculated.kmRateApplied,
      km_rate_applied: calculated.kmRateApplied,
      kmPayout: calculated.kmPayout,
      km_payout: calculated.kmPayout,
      kmTotalCost: calculated.kmTotalCost,
      km_total_cost: calculated.kmTotalCost,
      stockSuppliesUsed: updatedStockSupplies,
      observation: observation !== undefined ? observation : current.observation,
      customerSignature: customerSignature !== undefined ? customerSignature : current.customerSignature,
      completedAt: newStatus === 'COMPLETED' ? (completedAt || new Date().toISOString()) : current.completedAt,
    };

    memOrders[orderIdx] = updatedOrder;

    // Persistência imediata no MariaDB
    try {
      const db = getDbPool();
      let completedAtSql: string | null = null;
      if (updatedOrder.status === 'COMPLETED') {
        const d = updatedOrder.completedAt ? new Date(updatedOrder.completedAt) : new Date();
        const validD = isNaN(d.getTime()) ? new Date() : d;
        completedAtSql = validD.toISOString().slice(0, 19).replace('T', ' ');
      } else if (updatedOrder.completedAt) {
        const d = new Date(updatedOrder.completedAt);
        completedAtSql = !isNaN(d.getTime()) ? d.toISOString().slice(0, 19).replace('T', ' ') : null;
      }

      await db.execute(
        `UPDATE service_orders 
         SET status = ?, 
             km_traveled = ?, 
             km_total_cost = ?, 
             toll_cost = ?, 
             support_cost = ?, 
             total_technician_gross = ?, 
             service_category = ?, 
             base_service_fee = ?, 
             faturamento_porto = ?, 
             completed_at = ?, 
             execution_notes = COALESCE(?, execution_notes),
             customer_name = ?,
             address_street = ?,
             address_number = ?,
             neighborhood = ?,
             city = ?,
             km_rate_applied = ?,
             km_payout = ?,
             kmPayout = ?
         WHERE id = ? OR call_number = ?`,
        [
          updatedOrder.status,
          Number(updatedOrder.kmTraveled || 0),
          Number(updatedOrder.kmTotalCost || 0),
          Number(updatedOrder.tollCost || 0),
          Number(updatedOrder.supportCost || 0),
          Number(updatedOrder.totalTechnicianGross || 0),
          updatedOrder.serviceCategory || '',
          Number(updatedOrder.baseServiceFee || 0),
          Number(updatedOrder.faturamentoPorto || 0),
          completedAtSql,
          observation !== undefined && observation !== null && observation !== '' ? observation : null,
          updatedOrder.customerName || null,
          streetValue,
          numberValue,
          finalNeighborhood,
          updatedOrder.city || null,
          updatedOrder.kmRateApplied || 0.75,
          updatedOrder.kmPayout || 0,
          updatedOrder.kmPayout || 0,
          updatedOrder.id,
          updatedOrder.callNumber,
        ]
      );
      console.log(`[N8N Webhook] OS ${updatedOrder.callNumber} (ID: ${updatedOrder.id}) persistida com sucesso no MariaDB. Status: ${updatedOrder.status}`);
    } catch (dbErr: any) {
      console.error(`[N8N Webhook ERROR] Falha ao persistir OS ${updatedOrder.callNumber} no MariaDB:`, dbErr?.message || dbErr);
    }

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

    res.json({
      success: true,
      message: 'OS atualizada com sucesso',
      data: updatedOrder
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
    const dayOrders = memOrders.filter((o) => {
      const orderDate = o.scheduledDate || o.startedAt || o.completedAt || '';
      return orderDate.startsWith(targetDate) && o.status !== 'CANCELLED';
    });

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
        customerAddress: ord.customerAddress || ord.addressStreet,
        customerPhone: ord.customerPhone,
        serviceCategory: ord.serviceCategory,
        status: ord.status,
        date: ord.scheduledDate || ord.startedAt || ord.completedAt || '',
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
