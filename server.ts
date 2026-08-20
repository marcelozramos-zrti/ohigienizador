import express from 'express';
import path from 'path';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { getDbPool, testDbConnection, initializeDatabaseSchema, updateDbConfig, getDbConfig } from './src/server/db';
import { INITIAL_USERS, INITIAL_SERVICE_ORDERS, INITIAL_STOCK, INITIAL_MOVEMENTS, INITIAL_SETTINGS } from './src/mock/initialData';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors());
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // In-memory fallback stores for when MariaDB is offline / in preview sandbox
  let memUsers: any[] = [...INITIAL_USERS];
  let memOrders: any[] = [...INITIAL_SERVICE_ORDERS];
  let memStock: any[] = [...INITIAL_STOCK];
  let memMovements: any[] = [...INITIAL_MOVEMENTS];
  let memSettings: any = { ...INITIAL_SETTINGS };

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

  // Iniciar verificação do MariaDB
  initializeDatabaseSchema().catch(() => {});

  // =========================================================================
  // API ROUTES - BANCO MARIADB (192.168.15.246 / higienizador_db)
  // =========================================================================

  // 1. Health & Database Status Check
  app.get('/api/health', async (req, res) => {
    const status = await testDbConnection();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: status,
    });
  });

  // In-memory log buffer for database diagnostic inspection
  const dbLogs: Array<{ id: string; timestamp: string; level: 'INFO' | 'WARN' | 'ERROR'; message: string; query?: string; details?: any }> = [];
  function logDb(level: 'INFO' | 'WARN' | 'ERROR', message: string, query?: string, details?: any) {
    // If it's a network timeout/offline error, downgrade to WARN to keep logs clean
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

  app.get('/api/db/logs', (req, res) => {
    res.json({ success: true, logs: dbLogs });
  });

  app.get('/api/db/diagnostics', async (req, res) => {
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
        logs: dbLogs.slice(0, 20),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Automatic safe column updater endpoint
  app.post('/api/db/sync-schema', async (req, res) => {
    try {
      const db = getDbPool();
      logDb('INFO', 'Iniciando sincronização e verificação de colunas no MariaDB...');
      
      // Get existing columns in 'users'
      const [userCols]: any = await db.query('SHOW COLUMNS FROM users').catch(() => [[]]);
      const existingUserFields = new Set(userCols.map((c: any) => c.Field.toLowerCase()));

      const columnDefs: Array<{ name: string; type: string }> = [
        { name: 'email', type: 'VARCHAR(150) NULL' },
        { name: 'passwordHash', type: 'VARCHAR(255) NULL' },
        { name: 'role', type: "VARCHAR(30) NOT NULL DEFAULT 'TECHNICIAN'" },
        { name: 'documentCpf', type: 'VARCHAR(18) NULL' },
        { name: 'phone', type: 'VARCHAR(25) NULL' },
        { name: 'avatarUrl', type: 'VARCHAR(255) NULL' },
        { name: 'isActive', type: 'TINYINT(1) NOT NULL DEFAULT 1' },
        { name: 'pixKeyType', type: "VARCHAR(20) DEFAULT 'CPF'" },
        { name: 'pixKey', type: 'VARCHAR(100) NULL' },
        { name: 'bankName', type: 'VARCHAR(80) NULL' },
        { name: 'bankAgency', type: 'VARCHAR(20) NULL' },
        { name: 'bankAccount', type: 'VARCHAR(30) NULL' },
        { name: 'baseCostAllowance', type: 'DECIMAL(10, 2) NOT NULL DEFAULT 0.00' },
        { name: 'hasSpecialTaxRule', type: 'TINYINT(1) NOT NULL DEFAULT 0' },
        { name: 'specialTaxRate', type: 'DECIMAL(5, 2) NOT NULL DEFAULT 0.00' },
        { name: 'createdAt', type: 'DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3)' },
        { name: 'updatedAt', type: 'DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)' },
      ];

      const added: string[] = [];
      const skipped: string[] = [];
      const errors: string[] = [];

      for (const col of columnDefs) {
        if (existingUserFields.has(col.name.toLowerCase())) {
          skipped.push(col.name);
          continue;
        }

        try {
          await db.query(`ALTER TABLE \`users\` ADD COLUMN \`${col.name}\` ${col.type}`);
          added.push(col.name);
          logDb('INFO', `Coluna criada com sucesso: users.${col.name}`);
        } catch (err: any) {
          if (err.code === 'ER_DUP_FIELDNAME' || err.message?.includes('Duplicate column')) {
            skipped.push(col.name);
          } else {
            errors.push(`${col.name}: ${err.message}`);
            logDb('WARN', `Falha ao adicionar users.${col.name}: ${err.message}`);
          }
        }
      }

      // Relax any existing legacy strict columns if they exist
      const legacyToRelax = [
        'document_cpf VARCHAR(18) NULL DEFAULT \'\'',
        'documentCpf VARCHAR(18) NULL DEFAULT \'\'',
        'password_hash VARCHAR(255) NULL',
        'passwordHash VARCHAR(255) NULL',
        'phone VARCHAR(25) NULL DEFAULT \'\'',
        'email VARCHAR(150) NULL',
        'pix_key VARCHAR(100) NULL DEFAULT \'\'',
        'pixKey VARCHAR(100) NULL DEFAULT \'\'',
      ];

      for (const leg of legacyToRelax) {
        const colName = leg.split(' ')[0];
        if (existingUserFields.has(colName.toLowerCase())) {
          try {
            await db.query(`ALTER TABLE \`users\` MODIFY COLUMN ${leg}`);
          } catch {
            // ignore
          }
        }
      }

      res.json({
        success: true,
        message: `Schema sincronizado. ${added.length} criadas, ${skipped.length} já existiam.`,
        added,
        skipped,
        errors,
      });
    } catch (err: any) {
      logDb('ERROR', `Erro na sincronização de schema: ${err.message}`);
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
        tableCounts = {
          users: userRows[0]?.count ?? 0,
          service_orders: orderRows[0]?.count ?? 0,
          stock_items: stockRows[0]?.count ?? 0,
          financial_movements: movementRows[0]?.count ?? 0,
        };
      } catch (err: any) {
        console.error('Erro ao consultar contagem de tabelas:', err);
      }
    }
    res.json({
      ...status,
      tableCounts,
    });
  });

  app.post('/api/db/test', async (req, res) => {
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

  // Helper to get all column metadata of a table (Field, Type, Null, Default, Key)
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

  // Helper to get map of column names
  async function getTableColumnsMap(tableName: string): Promise<Map<string, string>> {
    const cols = await getTableColumnsInfo(tableName);
    const colMap = new Map<string, string>();
    for (const c of cols) {
      colMap.set(c.Field.toLowerCase(), c.Field);
    }
    return colMap;
  }

  // 2. USERS & TECHNICIANS API (GET, POST, PUT, DELETE)
  app.get('/api/users', async (req, res) => {
    try {
      const db = getDbPool();
      const [rows]: any = await db.query('SELECT * FROM users ORDER BY name ASC');
      // Format numeric/boolean fields
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
      res.json({ success: true, data: formatted });
    } catch (err: any) {
      if (isNetworkError(err)) {
        logDb('INFO', 'MariaDB inacessível no ambiente atual. Servindo lista de usuários da memória.');
        return res.json({ success: true, data: memUsers });
      }
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/users', async (req, res) => {
    const u = req.body;
    if (!u.id || !u.name) {
      return res.status(400).json({ success: false, error: 'Campos obrigatórios ausentes (id, name).' });
    }

    // Always update in-memory list
    const existingIdx = memUsers.findIndex((item) => item.id === u.id);
    if (existingIdx >= 0) {
      memUsers[existingIdx] = { ...memUsers[existingIdx], ...u };
    } else {
      memUsers.push(u);
    }

    try {
      const db = getDbPool();
      const cols = await getTableColumnsInfo('users');

      // Dicionário completo de valores suportados por campo (lowercase)
      const userValues: Record<string, any> = {
        id: u.id,
        name: u.name,
        nome: u.name,
        email: u.email || `${u.id}@higienizador.com.br`,
        passwordhash: u.password || u.passwordHash || 'Porto@2026',
        password_hash: u.password || u.passwordHash || 'Porto@2026',
        password: u.password || u.passwordHash || 'Porto@2026',
        senha: u.password || u.passwordHash || 'Porto@2026',
        role: u.role || 'TECHNICIAN',
        cargo: u.role || 'TECHNICIAN',
        perfil: u.role || 'TECHNICIAN',
        documentcpf: u.documentCpf || u.cpf || '',
        document_cpf: u.documentCpf || u.cpf || '',
        cpf: u.documentCpf || u.cpf || '',
        phone: u.phone || '',
        telefone: u.phone || '',
        whatsapp: u.phone || '',
        avatarurl: u.avatarUrl || null,
        avatar_url: u.avatarUrl || null,
        avatar: u.avatarUrl || null,
        isactive: u.isActive !== false ? 1 : 0,
        is_active: u.isActive !== false ? 1 : 0,
        ativo: u.isActive !== false ? 1 : 0,
        pixkeytype: u.pixKeyType || 'CPF',
        pix_key_type: u.pixKeyType || 'CPF',
        tipo_pix: u.pixKeyType || 'CPF',
        pixkey: u.pixKey || u.documentCpf || '',
        pix_key: u.pixKey || u.documentCpf || '',
        chave_pix: u.pixKey || u.documentCpf || '',
        bankname: u.bankName || 'Banco Itaú',
        bank_name: u.bankName || 'Banco Itaú',
        banco: u.bankName || 'Banco Itaú',
        bankagency: u.bankAgency || '0001',
        bank_agency: u.bankAgency || '0001',
        agencia: u.bankAgency || '0001',
        bankaccount: u.bankAccount || '00000-0',
        bank_account: u.bankAccount || '00000-0',
        conta: u.bankAccount || '00000-0',
        basecostallowance: Number(u.baseCostAllowance ?? (u.role === 'TECHNICIAN' ? 250 : 0)),
        base_cost_allowance: Number(u.baseCostAllowance ?? (u.role === 'TECHNICIAN' ? 250 : 0)),
        ajuda_custo: Number(u.baseCostAllowance ?? (u.role === 'TECHNICIAN' ? 250 : 0)),
        hasspecialtaxrule: u.hasSpecialTaxRule ? 1 : 0,
        has_special_tax_rule: u.hasSpecialTaxRule ? 1 : 0,
        regra_fiscal: u.hasSpecialTaxRule ? 1 : 0,
        specialtaxrate: Number(u.specialTaxRate || 0),
        special_tax_rate: Number(u.specialTaxRate || 0),
        taxa_retencao: Number(u.specialTaxRate || 0),
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
            if (col.Type.includes('int') || col.Type.includes('decimal') || col.Type.includes('float') || col.Type.includes('double')) {
              val = 0;
            } else if (col.Type.includes('date') || col.Type.includes('time')) {
              val = new Date();
            } else {
              val = '';
            }
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

        logDb('INFO', `Executando INSERT/UPDATE para usuário ${u.name} (${u.id})`, query, insertValues);
        await db.execute(query, insertValues);
        logDb('INFO', `Usuário ${u.name} salvo com sucesso no MariaDB.`);
      }
      res.json({ success: true, message: `Usuário ${u.name} salvo com sucesso.`, user: u });
    } catch (err: any) {
      if (isNetworkError(err)) {
        logDb('INFO', `Usuário ${u.name} salvo na memória local (MariaDB offline no ambiente atual).`);
        return res.json({ success: true, message: `Usuário ${u.name} salvo na memória local.`, user: u });
      }
      logDb('ERROR', `Erro ao gravar usuário ${u.name}: ${err.message}`, undefined, { user: u, stack: err.stack });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const u = req.body;

    const existingIdx = memUsers.findIndex((item) => item.id === id);
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
        nome: u.name,
        email: u.email,
        role: u.role,
        cargo: u.role,
        perfil: u.role,
        documentcpf: u.documentCpf ?? u.cpf,
        document_cpf: u.documentCpf ?? u.cpf,
        cpf: u.documentCpf ?? u.cpf,
        phone: u.phone,
        telefone: u.phone,
        whatsapp: u.phone,
        avatarurl: u.avatarUrl,
        avatar_url: u.avatarUrl,
        isactive: u.isActive !== undefined ? (u.isActive ? 1 : 0) : undefined,
        is_active: u.isActive !== undefined ? (u.isActive ? 1 : 0) : undefined,
        pixkeytype: u.pixKeyType,
        pix_key_type: u.pixKeyType,
        pixkey: u.pixKey,
        pix_key: u.pixKey,
        bankname: u.bankName,
        bank_name: u.bankName,
        bankagency: u.bankAgency,
        bank_agency: u.bankAgency,
        bankaccount: u.bankAccount,
        bank_account: u.bankAccount,
        basecostallowance: u.baseCostAllowance !== undefined ? Number(u.baseCostAllowance) : undefined,
        base_cost_allowance: u.baseCostAllowance !== undefined ? Number(u.baseCostAllowance) : undefined,
        hasspecialtaxrule: u.hasSpecialTaxRule !== undefined ? (u.hasSpecialTaxRule ? 1 : 0) : undefined,
        has_special_tax_rule: u.hasSpecialTaxRule !== undefined ? (u.hasSpecialTaxRule ? 1 : 0) : undefined,
        specialtaxrate: u.specialTaxRate !== undefined ? Number(u.specialTaxRate) : undefined,
        special_tax_rate: u.specialTaxRate !== undefined ? Number(u.specialTaxRate) : undefined,
        passwordhash: u.password,
        password_hash: u.password,
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
        logDb('INFO', `Atualizando usuário ${id}`, query, values);
        await db.execute(query, values);
        logDb('INFO', `Usuário ${id} atualizado com sucesso.`);
      }
      res.json({ success: true, message: `Usuário ${id} atualizado.` });
    } catch (err: any) {
      if (isNetworkError(err)) {
        return res.json({ success: true, message: `Usuário ${id} atualizado na memória local.` });
      }
      logDb('ERROR', `Erro ao atualizar usuário ${id}: ${err.message}`, undefined, { id, stack: err.stack });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    memUsers = memUsers.filter((u) => u.id !== id);
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

  // 3. SERVICE ORDERS API (GET, POST, PUT, DELETE)
  app.get('/api/orders', async (req, res) => {
    try {
      const db = getDbPool();
      const cols = await getTableColumnsMap('service_orders');
      let orderClause = 'id DESC';
      if (cols.has('scheduleddate')) orderClause = `\`${cols.get('scheduleddate')}\` DESC`;
      else if (cols.has('scheduled_date')) orderClause = `\`${cols.get('scheduled_date')}\` DESC`;
      else if (cols.has('createdat')) orderClause = `\`${cols.get('createdat')}\` DESC`;
      else if (cols.has('created_at')) orderClause = `\`${cols.get('created_at')}\` DESC`;

      const [rows]: any = await db.query(`SELECT * FROM \`service_orders\` ORDER BY ${orderClause}`);
      const formatted = rows.map((o: any) => ({
        ...o,
        id: o.id,
        callNumber: o.callNumber || o.call_number || o.numero_chamado || '',
        portoSeguroProtocol: o.portoSeguroProtocol || o.porto_seguro_protocol || o.protocolo_porto || null,
        serviceCategory: o.serviceCategory || o.service_category || o.categoria || 'Higienização Padrão',
        baseServiceFee: Number(o.baseServiceFee ?? o.base_service_fee ?? o.valor_base ?? 0),
        customerName: o.customerName || o.customer_name || o.cliente_nome || '',
        customerCpf: o.customerCpf || o.customer_cpf || o.cliente_cpf || '',
        customerPhone: o.customerPhone || o.customer_phone || o.cliente_telefone || null,
        city: o.city || o.cidade || 'São Paulo',
        uf: o.uf || o.estado || 'SP',
        neighborhood: o.neighborhood || o.bairro || '',
        addressStreet: o.addressStreet || o.address_street || o.endereco || '',
        addressNumber: o.addressNumber || o.address_number || o.numero || '',
        addressComplement: o.addressComplement || o.address_complement || o.complemento || null,
        postalCode: o.postalCode || o.postal_code || o.cep || '',
        technicianId: o.technicianId || o.technician_id || o.tecnico_id || null,
        status: o.status || 'PENDING',
        scheduledDate: o.scheduledDate || o.scheduled_date || o.data_agendada,
        startedAt: o.startedAt || o.started_at,
        completedAt: o.completedAt || o.completed_at,
        kmTraveled: Number(o.kmTraveled ?? o.km_traveled ?? o.km_rodado ?? 0),
        kmRateApplied: Number(o.kmRateApplied ?? o.km_rate_applied ?? o.valor_km ?? 0.5),
        kmTotalCost: Number(o.kmTotalCost ?? o.km_total_cost ?? o.total_km ?? 0),
        tollCost: Number(o.tollCost ?? o.toll_cost ?? o.pedagio ?? 0),
        supportCost: Number(o.supportCost ?? o.support_cost ?? o.ajuda_custo_adicional ?? 0),
        totalTechnicianGross: Number(o.totalTechnicianGross ?? o.total_technician_gross ?? o.total_bruto_tecnico ?? 0),
        faturamentoPorto: Number(o.faturamentoPorto ?? o.faturamento_porto ?? o.valor_porto ?? 0),
        customerSignature: o.customerSignature || o.customer_signature || o.assinatura || null,
        executionNotes: o.executionNotes || o.execution_notes || o.observacoes || null,
        tollReceiptUrl: o.tollReceiptUrl || o.toll_receipt_url || o.comprovante_pedagio || null,
        itemsUsed: [],
      }));
      memOrders = formatted;
      res.json({ success: true, data: formatted });
    } catch (err: any) {
      if (isNetworkError(err)) {
        logDb('INFO', 'MariaDB inacessível no ambiente atual. Servindo ordens de serviço da memória.');
        return res.json({ success: true, data: memOrders });
      }
      logDb('ERROR', `Erro ao buscar ordens de serviço: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/orders', async (req, res) => {
    const o = req.body;
    const existingIdx = memOrders.findIndex((item) => item.id === o.id);
    const isEdit = existingIdx >= 0;
    const oldOrder = isEdit ? memOrders[existingIdx] : null;

    if (isEdit) {
      memOrders[existingIdx] = { ...memOrders[existingIdx], ...o };
    } else {
      memOrders.unshift(o);
    }

    const techName = o.technicianName || o.technicianId || 'Não Alocado';
    const totalGross = Number(o.totalTechnicianGross || 0);

    try {
      const db = getDbPool();
      const cols = await getTableColumnsInfo('service_orders');

      const orderValues: Record<string, any> = {
        id: o.id,
        callnumber: o.callNumber,
        call_number: o.callNumber,
        numero_chamado: o.callNumber,
        portoseguroprotocol: o.portoSeguroProtocol || null,
        porto_seguro_protocol: o.portoSeguroProtocol || null,
        protocolo_porto: o.portoSeguroProtocol || null,
        servicecategory: o.serviceCategory || 'Higienização Padrão',
        service_category: o.serviceCategory || 'Higienização Padrão',
        categoria: o.serviceCategory || 'Higienização Padrão',
        baseservicefee: Number(o.baseServiceFee || 0),
        base_service_fee: Number(o.baseServiceFee || 0),
        valor_base: Number(o.baseServiceFee || 0),
        customername: o.customerName || '',
        customer_name: o.customerName || '',
        cliente_nome: o.customerName || '',
        customercpf: o.customerCpf || '',
        customer_cpf: o.customerCpf || '',
        cliente_cpf: o.customerCpf || '',
        customerphone: o.customerPhone || null,
        customer_phone: o.customerPhone || null,
        cliente_telefone: o.customerPhone || null,
        city: o.city || 'São Paulo',
        cidade: o.city || 'São Paulo',
        uf: o.uf || 'SP',
        estado: o.uf || 'SP',
        neighborhood: o.neighborhood || '',
        bairro: o.neighborhood || '',
        addressstreet: o.addressStreet || '',
        address_street: o.addressStreet || '',
        endereco: o.addressStreet || '',
        addressnumber: o.addressNumber || '',
        address_number: o.addressNumber || '',
        numero: o.addressNumber || '',
        addresscomplement: o.addressComplement || null,
        address_complement: o.addressComplement || null,
        complemento: o.addressComplement || null,
        postalcode: o.postalCode || '',
        postal_code: o.postalCode || '',
        cep: o.postalCode || '',
        technicianid: o.technicianId || null,
        technician_id: o.technicianId || null,
        tecnico_id: o.technicianId || null,
        status: o.status || 'PENDING',
        scheduleddate: o.scheduledDate ? new Date(o.scheduledDate) : new Date(),
        scheduled_date: o.scheduledDate ? new Date(o.scheduledDate) : new Date(),
        data_agendada: o.scheduledDate ? new Date(o.scheduledDate) : new Date(),
        startedat: o.startedAt ? new Date(o.startedAt) : null,
        started_at: o.startedAt ? new Date(o.startedAt) : null,
        completedat: o.completedAt ? new Date(o.completedAt) : null,
        completed_at: o.completedAt ? new Date(o.completedAt) : null,
        kmtraveled: Number(o.kmTraveled || 0),
        km_traveled: Number(o.kmTraveled || 0),
        km_rodado: Number(o.kmTraveled || 0),
        kmrateapplied: Number(o.kmRateApplied || 0.5),
        km_rate_applied: Number(o.kmRateApplied || 0.5),
        valor_km: Number(o.kmRateApplied || 0.5),
        kmtotalcost: Number(o.kmTotalCost || 0),
        km_total_cost: Number(o.kmTotalCost || 0),
        total_km: Number(o.kmTotalCost || 0),
        tollcost: Number(o.tollCost || 0),
        toll_cost: Number(o.tollCost || 0),
        pedagio: Number(o.tollCost || 0),
        supportcost: Number(o.supportCost || 0),
        support_cost: Number(o.supportCost || 0),
        ajuda_custo_adicional: Number(o.supportCost || 0),
        totaltechniciangross: Number(o.totalTechnicianGross || 0),
        total_technician_gross: Number(o.totalTechnicianGross || 0),
        total_bruto_tecnico: Number(o.totalTechnicianGross || 0),
        faturamentoporto: Number(o.faturamentoPorto || 0),
        faturamento_porto: Number(o.faturamentoPorto || 0),
        valor_porto: Number(o.faturamentoPorto || 0),
        customersignature: o.customerSignature || null,
        customer_signature: o.customerSignature || null,
        assinatura: o.customerSignature || null,
        executionnotes: o.executionNotes || null,
        execution_notes: o.executionNotes || null,
        observacoes: o.executionNotes || null,
        tollreceipturl: o.tollReceiptUrl || null,
        toll_receipt_url: o.tollReceiptUrl || null,
        comprovante_pedagio: o.tollReceiptUrl || null,
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
            if (col.Type.includes('int') || col.Type.includes('decimal') || col.Type.includes('float') || col.Type.includes('double')) {
              val = 0;
            } else if (col.Type.includes('date') || col.Type.includes('time')) {
              val = new Date();
            } else {
              val = '';
            }
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

        if (isEdit) {
          const techChangeMsg = oldOrder && oldOrder.technicianId !== o.technicianId
            ? ` | Técnico alterado de [${oldOrder.technicianName || oldOrder.technicianId || 'Nenhum'}] para [${techName}]`
            : '';
          logDb(
            'INFO',
            `[OS-EDIT/UPDATE] Gravando alterações da OS #${o.callNumber} (${o.id}) - Status: ${o.status} - Técnico: ${techName}${techChangeMsg} - Bruto: R$ ${totalGross.toFixed(2)}`,
            query,
            { id: o.id, callNumber: o.callNumber, technicianId: o.technicianId, status: o.status }
          );
        } else {
          logDb(
            'INFO',
            `[OS-CREATE/INSERT] Registrando nova OS #${o.callNumber} (${o.id}) para cliente "${o.customerName}" - Técnico: ${techName} - Status: ${o.status} - Taxa Base: R$ ${Number(o.baseServiceFee || 0).toFixed(2)}`,
            query,
            { id: o.id, callNumber: o.callNumber, customerName: o.customerName, technicianId: o.technicianId }
          );
        }

        await db.execute(query, insertValues);

        if (isEdit) {
          logDb('INFO', `[OS-SUCCESS] OS #${o.callNumber} atualizada com sucesso no MariaDB (brsaolxdb01).`);
        } else {
          logDb('INFO', `[OS-SUCCESS] Nova OS #${o.callNumber} persistida com sucesso no MariaDB (brsaolxdb01).`);
        }
      }
      res.json({ success: true, message: `OS ${o.callNumber} gravada com sucesso.` });
    } catch (err: any) {
      if (isNetworkError(err)) {
        logDb('INFO', `[OS-MEMORY-FALLBACK] OS #${o.callNumber} (${isEdit ? 'edição' : 'criação'}) gravada na memória local resiliente.`);
        return res.json({ success: true, message: `OS ${o.callNumber} salva com sucesso.` });
      }
      logDb('ERROR', `[OS-ERROR] Erro ao gravar OS #${o.callNumber}: ${err.message}`, undefined, { order: o });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/orders/:id', async (req, res) => {
    const { id } = req.params;
    const target = memOrders.find((o) => o.id === id);
    const callNum = target ? target.callNumber : id;
    memOrders = memOrders.filter((o) => o.id !== id);

    logDb(
      'INFO',
      `[OS-DELETE] Solicitada exclusão da OS #${callNum} (${id}) - Cliente: ${target?.customerName || 'N/A'} - Técnico: ${target?.technicianName || target?.technicianId || 'N/A'}`,
      'DELETE FROM service_orders WHERE id = ?',
      [id]
    );

    try {
      const db = getDbPool();
      await db.execute('DELETE FROM service_orders WHERE id = ?', [id]);
      logDb('INFO', `[OS-DELETE-SUCCESS] OS #${callNum} (${id}) excluída com sucesso do MariaDB.`);
      res.json({ success: true, message: `OS ${id} removida.` });
    } catch (err: any) {
      if (isNetworkError(err)) {
        logDb('INFO', `[OS-DELETE-FALLBACK] OS #${callNum} removida da memória local.`);
        return res.json({ success: true, message: `OS ${id} removida da memória local.` });
      }
      logDb('ERROR', `[OS-DELETE-ERROR] Erro ao excluir OS #${callNum} (${id}): ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4. STOCK ITEMS API (GET, POST, PUT, DELETE)
  app.get('/api/stock', async (req, res) => {
    try {
      const db = getDbPool();
      const cols = await getTableColumnsMap('stock_items');
      let orderClause = 'id ASC';
      if (cols.has('name')) orderClause = `\`${cols.get('name')}\` ASC`;
      else if (cols.has('nome')) orderClause = `\`${cols.get('nome')}\` ASC`;

      const [rows]: any = await db.query(`SELECT * FROM \`stock_items\` ORDER BY ${orderClause}`);
      const formatted = rows.map((s: any) => ({
        ...s,
        id: s.id,
        code: s.code || s.codigo || '',
        name: s.name || s.nome || '',
        description: s.description || s.descricao || '',
        category: s.category || s.categoria || 'Geral',
        unit: s.unit || s.unidade || 'UN',
        quantityInStock: Number(s.quantityInStock ?? s.quantity_in_stock ?? s.quantity ?? s.quantidade ?? 0),
        minimumThreshold: Number(s.minimumThreshold ?? s.minimum_threshold ?? s.minimo ?? 0),
        unitCost: Number(s.unitCost ?? s.unit_cost ?? s.custo_unitario ?? 0),
        isSupportSupply: Boolean(s.isSupportSupply ?? s.is_support_supply ?? true),
      }));
      memStock = formatted;
      res.json({ success: true, data: formatted });
    } catch (err: any) {
      if (isNetworkError(err)) {
        logDb('INFO', 'MariaDB inacessível no ambiente atual. Servindo estoque da memória.');
        return res.json({ success: true, data: memStock });
      }
      logDb('ERROR', `Erro ao buscar estoque: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/stock', async (req, res) => {
    const s = req.body;
    const existingIdx = memStock.findIndex((item) => item.id === s.id);
    if (existingIdx >= 0) {
      memStock[existingIdx] = { ...memStock[existingIdx], ...s };
    } else {
      memStock.push(s);
    }

    try {
      const db = getDbPool();
      const cols = await getTableColumnsInfo('stock_items');

      const stockValues: Record<string, any> = {
        id: s.id,
        code: s.code,
        codigo: s.code,
        name: s.name,
        nome: s.name,
        description: s.description || null,
        descricao: s.description || null,
        category: s.category || 'Geral',
        categoria: s.category || 'Geral',
        unit: s.unit || 'UN',
        unidade: s.unit || 'UN',
        quantityinstock: Number(s.quantityInStock || 0),
        quantity_in_stock: Number(s.quantityInStock || 0),
        quantity: Number(s.quantityInStock || 0),
        quantidade: Number(s.quantityInStock || 0),
        minimumthreshold: Number(s.minimumThreshold || 5),
        minimum_threshold: Number(s.minimumThreshold || 5),
        minimo: Number(s.minimumThreshold || 5),
        unitcost: Number(s.unitCost || 0),
        unit_cost: Number(s.unitCost || 0),
        custo_unitario: Number(s.unitCost || 0),
        issupportsupply: s.isSupportSupply ? 1 : 0,
        is_support_supply: s.isSupportSupply ? 1 : 0,
      };

      const insertCols: string[] = [];
      const insertPlaceholders: string[] = [];
      const insertValues: any[] = [];
      const updateClauses: string[] = [];

      for (const col of cols) {
        const colLower = col.Field.toLowerCase();
        let val = stockValues[colLower];

        if (val === undefined) {
          if (colLower === 'createdat' || colLower === 'created_at') {
            val = new Date();
          } else if (colLower === 'updatedat' || colLower === 'updated_at') {
            val = new Date();
          } else if (col.Null === 'NO' && col.Default === null && col.Key !== 'PRI') {
            if (col.Type.includes('int') || col.Type.includes('decimal') || col.Type.includes('float') || col.Type.includes('double')) {
              val = 0;
            } else if (col.Type.includes('date') || col.Type.includes('time')) {
              val = new Date();
            } else {
              val = '';
            }
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
          INSERT INTO \`stock_items\` (${insertCols.join(', ')})
          VALUES (${insertPlaceholders.join(', ')})
          ON DUPLICATE KEY UPDATE
          ${updateClauses.length > 0 ? updateClauses.join(', ') : 'id = id'}
        `;

        logDb('INFO', `Salvando item de estoque ${s.name} (${s.id})...`);
        await db.execute(query, insertValues);
        logDb('INFO', `Item ${s.name} salvo com sucesso no MariaDB.`);
      }
      res.json({ success: true, message: `Item ${s.name} salvo no estoque.` });
    } catch (err: any) {
      if (isNetworkError(err)) {
        logDb('INFO', `Item ${s.name} salvo na memória local.`);
        return res.json({ success: true, message: `Item ${s.name} salvo no estoque.` });
      }
      logDb('ERROR', `Erro ao gravar item ${s.name}: ${err.message}`, undefined, { stock: s });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/stock/:id', async (req, res) => {
    const { id } = req.params;
    memStock = memStock.filter((s) => s.id !== id);
    try {
      const db = getDbPool();
      await db.execute('DELETE FROM stock_items WHERE id = ?', [id]);
      logDb('INFO', `Item de estoque ${id} excluído do MariaDB.`);
      res.json({ success: true, message: `Item ${id} removido.` });
    } catch (err: any) {
      if (isNetworkError(err)) {
        return res.json({ success: true, message: `Item ${id} removido da memória local.` });
      }
      logDb('ERROR', `Erro ao excluir item de estoque ${id}: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5. FINANCIAL MOVEMENTS API (GET, POST, DELETE)
  app.get('/api/movements', async (req, res) => {
    try {
      const db = getDbPool();
      const cols = await getTableColumnsMap('financial_movements');
      let orderClause = 'id DESC';
      if (cols.has('createdat')) orderClause = `\`${cols.get('createdat')}\` DESC`;
      else if (cols.has('created_at')) orderClause = `\`${cols.get('created_at')}\` DESC`;
      else if (cols.has('duedate')) orderClause = `\`${cols.get('duedate')}\` DESC`;
      else if (cols.has('due_date')) orderClause = `\`${cols.get('due_date')}\` DESC`;

      const [rows]: any = await db.query(`SELECT * FROM \`financial_movements\` ORDER BY ${orderClause}`);
      const formatted = rows.map((m: any) => ({
        ...m,
        id: m.id,
        type: m.type || m.tipo || 'INCOME',
        category: m.category || m.categoria || 'Geral',
        description: m.description || m.descricao || '',
        amount: Number(m.amount ?? m.valor ?? 0),
        status: m.status || 'CONFIRMED',
        technicianId: m.technicianId || m.technician_id || m.tecnico_id || null,
        serviceOrderId: m.serviceOrderId || m.service_order_id || m.os_id || null,
        biweeklyClosingId: m.biweeklyClosingId || m.biweekly_closing_id || m.fechamento_id || null,
        paymentMethod: m.paymentMethod || m.payment_method || m.forma_pagamento || null,
        date: m.date || m.dueDate || m.due_date || m.createdAt || m.created_at || new Date().toISOString(),
      }));
      memMovements = formatted;
      res.json({ success: true, data: formatted });
    } catch (err: any) {
      if (isNetworkError(err)) {
        logDb('INFO', 'MariaDB inacessível no ambiente atual. Servindo movimentações da memória.');
        return res.json({ success: true, data: memMovements });
      }
      logDb('ERROR', `Erro ao buscar movimentações financeiras: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/movements', async (req, res) => {
    const m = req.body;
    const existingIdx = memMovements.findIndex((item) => item.id === m.id);
    if (existingIdx >= 0) {
      memMovements[existingIdx] = { ...memMovements[existingIdx], ...m };
    } else {
      memMovements.unshift(m);
    }

    try {
      const db = getDbPool();
      const cols = await getTableColumnsInfo('financial_movements');

      const movValues: Record<string, any> = {
        id: m.id,
        type: m.type || 'INCOME',
        tipo: m.type || 'INCOME',
        category: m.category || 'Geral',
        categoria: m.category || 'Geral',
        description: m.description || '',
        descricao: m.description || '',
        amount: Number(m.amount || 0),
        valor: Number(m.amount || 0),
        status: m.status || 'CONFIRMED',
        technicianid: m.technicianId || null,
        technician_id: m.technicianId || null,
        tecnico_id: m.technicianId || null,
        serviceorderid: m.serviceOrderId || null,
        service_order_id: m.serviceOrderId || null,
        os_id: m.serviceOrderId || null,
        biweeklyclosingid: m.biweeklyClosingId || null,
        biweekly_closing_id: m.biweeklyClosingId || null,
        fechamento_id: m.biweeklyClosingId || null,
        paymentmethod: m.paymentMethod || null,
        payment_method: m.paymentMethod || null,
        forma_pagamento: m.paymentMethod || null,
        duedate: m.date || m.dueDate ? new Date(m.date || m.dueDate) : new Date(),
        due_date: m.date || m.dueDate ? new Date(m.date || m.dueDate) : new Date(),
        paymentdate: m.paymentDate ? new Date(m.paymentDate) : null,
        payment_date: m.paymentDate ? new Date(m.paymentDate) : null,
      };

      const insertCols: string[] = [];
      const insertPlaceholders: string[] = [];
      const insertValues: any[] = [];
      const updateClauses: string[] = [];

      for (const col of cols) {
        const colLower = col.Field.toLowerCase();
        let val = movValues[colLower];

        if (val === undefined) {
          if (colLower === 'createdat' || colLower === 'created_at') {
            val = new Date();
          } else if (colLower === 'updatedat' || colLower === 'updated_at') {
            val = new Date();
          } else if (col.Null === 'NO' && col.Default === null && col.Key !== 'PRI') {
            if (col.Type.includes('int') || col.Type.includes('decimal') || col.Type.includes('float') || col.Type.includes('double')) {
              val = 0;
            } else if (col.Type.includes('date') || col.Type.includes('time')) {
              val = new Date();
            } else {
              val = '';
            }
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
          INSERT INTO \`financial_movements\` (${insertCols.join(', ')})
          VALUES (${insertPlaceholders.join(', ')})
          ON DUPLICATE KEY UPDATE
          ${updateClauses.length > 0 ? updateClauses.join(', ') : 'id = id'}
        `;

        logDb('INFO', `Salvando movimento financeiro ${m.description || m.id} no MariaDB...`);
        await db.execute(query, insertValues);
        logDb('INFO', `Movimento ${m.id} salvo no MariaDB.`);
      }
      res.json({ success: true, message: 'Movimento financeiro gravado no MariaDB.' });
    } catch (err: any) {
      if (isNetworkError(err)) {
        logDb('INFO', `Movimento financeiro ${m.description || m.id} salvo na memória local.`);
        return res.json({ success: true, message: 'Movimento financeiro salvo com sucesso.' });
      }
      logDb('ERROR', `Erro ao gravar movimento financeiro: ${err.message}`, undefined, { movement: m });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/movements/:id', async (req, res) => {
    const { id } = req.params;
    memMovements = memMovements.filter((m) => m.id !== id);
    try {
      const db = getDbPool();
      await db.execute('DELETE FROM financial_movements WHERE id = ?', [id]);
      logDb('INFO', `Movimento financeiro ${id} excluído.`);
      res.json({ success: true, message: `Movimento ${id} removido.` });
    } catch (err: any) {
      if (isNetworkError(err)) {
        return res.json({ success: true, message: `Movimento ${id} removido da memória local.` });
      }
      logDb('ERROR', `Erro ao excluir movimento ${id}: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6. GENERAL SETTINGS API (GET, POST)
  app.get('/api/settings', async (req, res) => {
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
    const s = req.body;
    memSettings = { ...memSettings, ...s };
    try {
      const db = getDbPool();
      const cols = await getTableColumnsInfo('general_settings');
      if (cols.length === 0) {
        return res.json({ success: true, message: 'Configurações salvas em memória.' });
      }

      const settingsValues: Record<string, any> = {
        id: 'default',
        companyname: s.companyName || 'O Higienizador',
        company_name: s.companyName || 'O Higienizador',
        companycnpj: s.companyCnpj || '32.145.890/0001-44',
        company_cnpj: s.companyCnpj || '32.145.890/0001-44',
        kmratedefault: Number(s.kmRateDefault || 0.5),
        km_rate_default: Number(s.kmRateDefault || 0.5),
        portosegurobasefeedefault: Number(s.portoSeguroBaseFeeDefault || 180),
        porto_seguro_base_fee_default: Number(s.portoSeguroBaseFeeDefault || 180),
        defaultspecialtaxrate: Number(s.defaultSpecialTaxRate || 16),
        default_special_tax_rate: Number(s.defaultSpecialTaxRate || 16),
        whatsappapiurl: s.whatsappApiUrl || '',
        whatsapp_api_url: s.whatsappApiUrl || '',
        whatsappapikey: s.whatsappApiKey || '',
        whatsapp_api_key: s.whatsappApiKey || '',
        whatsappinstancename: s.whatsappInstanceName || '',
        whatsapp_instance_name: s.whatsappInstanceName || '',
        whatsapptemplatemessage: s.whatsappTemplateMessage || '',
        whatsapp_template_message: s.whatsappTemplateMessage || '',
        autostockdeduction: s.autoStockDeduction ? 1 : 0,
        auto_stock_deduction: s.autoStockDeduction ? 1 : 0,
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
        logDb('INFO', 'Configurações do sistema salvas no MariaDB.');
      }
      res.json({ success: true, message: 'Configurações salvas no MariaDB.' });
    } catch (err: any) {
      if (isNetworkError(err)) {
        return res.json({ success: true, message: 'Configurações salvas em memória local.' });
      }
      logDb('ERROR', `Erro ao salvar configurações no MariaDB: ${err.message}`);
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
    console.log(`[Sistema Higienizador] Banco configurado: MariaDB (192.168.15.246 / higienizador_db)`);
  });
}

startServer();
