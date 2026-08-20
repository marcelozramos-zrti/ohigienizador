import express from 'express';
import path from 'path';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { getDbPool, testDbConnection, initializeDatabaseSchema, updateDbConfig, getDbConfig } from './src/server/db';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors());
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

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
    const entry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour12: false }) + '.' + String(new Date().getMilliseconds()).padStart(3, '0'),
      level,
      message,
      query,
      details,
    };
    dbLogs.unshift(entry);
    if (dbLogs.length > 80) dbLogs.pop();
    if (level === 'ERROR') {
      console.error(`[DB-LOG] ${entry.timestamp} [${level}] ${message}`, query || '', details || '');
    } else {
      console.log(`[DB-LOG] ${entry.timestamp} [${level}] ${message}`);
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

  // Helper to get all column names of a table (lowercase)
  async function getTableColumnsMap(tableName: string): Promise<Map<string, string>> {
    try {
      const db = getDbPool();
      const [rows]: any = await db.query(`SHOW COLUMNS FROM \`${tableName}\``);
      const colMap = new Map<string, string>(); // lowercase -> exact case in DB
      for (const r of rows) {
        colMap.set(r.Field.toLowerCase(), r.Field);
      }
      return colMap;
    } catch {
      return new Map<string, string>();
    }
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
      res.json({ success: true, data: formatted });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/users', async (req, res) => {
    const u = req.body;
    if (!u.id || !u.name) {
      return res.status(400).json({ success: false, error: 'Campos obrigatórios ausentes (id, name).' });
    }

    try {
      const db = getDbPool();
      const colMap = await getTableColumnsMap('users');

      // Possíveis mapeamentos de campos (campo lógico -> valor a inserir)
      const candidates: Array<{ keys: string[]; value: any }> = [
        { keys: ['id'], value: u.id },
        { keys: ['name', 'nome'], value: u.name },
        { keys: ['email'], value: u.email || `${u.id}@higienizador.com.br` },
        { keys: ['passwordhash', 'password_hash', 'password', 'senha'], value: u.password || u.passwordHash || 'Porto@2026' },
        { keys: ['role', 'cargo', 'perfil'], value: u.role || 'TECHNICIAN' },
        { keys: ['documentcpf', 'document_cpf', 'cpf'], value: u.documentCpf || '' },
        { keys: ['phone', 'telefone', 'whatsapp'], value: u.phone || '' },
        { keys: ['avatarurl', 'avatar_url', 'avatar'], value: u.avatarUrl || null },
        { keys: ['isactive', 'is_active', 'ativo'], value: u.isActive !== false ? 1 : 0 },
        { keys: ['pixkeytype', 'pix_key_type', 'tipo_pix'], value: u.pixKeyType || 'CPF' },
        { keys: ['pixkey', 'pix_key', 'chave_pix'], value: u.pixKey || u.documentCpf || '' },
        { keys: ['bankname', 'bank_name', 'banco'], value: u.bankName || 'Banco Itaú' },
        { keys: ['bankagency', 'bank_agency', 'agencia'], value: u.bankAgency || '0001' },
        { keys: ['bankaccount', 'bank_account', 'conta'], value: u.bankAccount || '00000-0' },
        { keys: ['basecostallowance', 'base_cost_allowance', 'ajuda_custo'], value: Number(u.baseCostAllowance ?? (u.role === 'TECHNICIAN' ? 250 : 0)) },
        { keys: ['hasspecialtaxrule', 'has_special_tax_rule', 'regra_fiscal'], value: u.hasSpecialTaxRule ? 1 : 0 },
        { keys: ['specialtaxrate', 'special_tax_rate', 'taxa_retencao'], value: Number(u.specialTaxRate || 0) },
      ];

      const insertCols: string[] = [];
      const insertPlaceholders: string[] = [];
      const insertValues: any[] = [];
      const updateClauses: string[] = [];

      for (const item of candidates) {
        // Encontra o nome exato da coluna existente no banco
        let matchedCol: string | undefined;
        for (const k of item.keys) {
          if (colMap.has(k.toLowerCase())) {
            matchedCol = colMap.get(k.toLowerCase());
            break;
          }
        }

        if (matchedCol) {
          insertCols.push(`\`${matchedCol}\``);
          insertPlaceholders.push('?');
          insertValues.push(item.value);
          if (matchedCol.toLowerCase() !== 'id') {
            updateClauses.push(`\`${matchedCol}\` = VALUES(\`${matchedCol}\`)`);
          }
        }
      }

      if (colMap.has('updatedat')) {
        const uCol = colMap.get('updatedat')!;
        updateClauses.push(`\`${uCol}\` = NOW()`);
      } else if (colMap.has('updated_at')) {
        const uCol = colMap.get('updated_at')!;
        updateClauses.push(`\`${uCol}\` = NOW()`);
      }

      if (insertCols.length === 0) {
        throw new Error('Nenhuma coluna correspondente encontrada na tabela users.');
      }

      const query = `
        INSERT INTO \`users\` (${insertCols.join(', ')})
        VALUES (${insertPlaceholders.join(', ')})
        ON DUPLICATE KEY UPDATE
        ${updateClauses.length > 0 ? updateClauses.join(', ') : 'id = id'}
      `;

      logDb('INFO', `Executando INSERT/UPDATE para usuário ${u.name} (${u.id})`, query, insertValues);
      await db.execute(query, insertValues);
      logDb('INFO', `Usuário ${u.name} salvo com sucesso no MariaDB.`);
      res.json({ success: true, message: `Usuário ${u.name} gravado no MariaDB.`, user: u });
    } catch (err: any) {
      logDb('ERROR', `Erro ao gravar usuário ${u.name}: ${err.message}`, undefined, { user: u, stack: err.stack });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const u = req.body;

    try {
      const db = getDbPool();
      const colMap = await getTableColumnsMap('users');
      const fields: string[] = [];
      const values: any[] = [];

      const candidateUpdates: Array<{ keys: string[]; value: any }> = [
        { keys: ['name', 'nome'], value: u.name },
        { keys: ['email'], value: u.email },
        { keys: ['role', 'cargo', 'perfil'], value: u.role },
        { keys: ['documentcpf', 'document_cpf', 'cpf'], value: u.documentCpf },
        { keys: ['phone', 'telefone', 'whatsapp'], value: u.phone },
        { keys: ['avatarurl', 'avatar_url'], value: u.avatarUrl },
        { keys: ['isactive', 'is_active'], value: u.isActive !== undefined ? (u.isActive ? 1 : 0) : undefined },
        { keys: ['pixkeytype', 'pix_key_type'], value: u.pixKeyType },
        { keys: ['pixkey', 'pix_key'], value: u.pixKey },
        { keys: ['bankname', 'bank_name'], value: u.bankName },
        { keys: ['bankagency', 'bank_agency'], value: u.bankAgency },
        { keys: ['bankaccount', 'bank_account'], value: u.bankAccount },
        { keys: ['basecostallowance', 'base_cost_allowance'], value: u.baseCostAllowance !== undefined ? Number(u.baseCostAllowance) : undefined },
        { keys: ['hasspecialtaxrule', 'has_special_tax_rule'], value: u.hasSpecialTaxRule !== undefined ? (u.hasSpecialTaxRule ? 1 : 0) : undefined },
        { keys: ['specialtaxrate', 'special_tax_rate'], value: u.specialTaxRate !== undefined ? Number(u.specialTaxRate) : undefined },
        { keys: ['passwordhash', 'password_hash', 'password'], value: u.password },
      ];

      for (const item of candidateUpdates) {
        if (item.value !== undefined) {
          for (const k of item.keys) {
            if (colMap.has(k.toLowerCase())) {
              const matchedCol = colMap.get(k.toLowerCase())!;
              fields.push(`\`${matchedCol}\` = ?`);
              values.push(item.value);
              break;
            }
          }
        }
      }

      if (fields.length === 0) {
        return res.json({ success: true, message: 'Nenhum campo para atualizar.' });
      }

      if (colMap.has('updatedat')) {
        fields.push(`\`${colMap.get('updatedat')}\` = NOW()`);
      } else if (colMap.has('updated_at')) {
        fields.push(`\`${colMap.get('updated_at')}\` = NOW()`);
      }

      values.push(id);
      const query = `UPDATE \`users\` SET ${fields.join(', ')} WHERE \`id\` = ?`;
      logDb('INFO', `Atualizando usuário ${id}`, query, values);
      await db.execute(query, values);
      logDb('INFO', `Usuário ${id} atualizado com sucesso.`);
      res.json({ success: true, message: `Usuário ${id} atualizado no MariaDB.` });
    } catch (err: any) {
      logDb('ERROR', `Erro ao atualizar usuário ${id}: ${err.message}`, undefined, { id, stack: err.stack });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const db = getDbPool();
      await db.execute('DELETE FROM users WHERE id = ?', [id]);
      res.json({ success: true, message: `Usuário ${id} removido.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3. SERVICE ORDERS API (GET, POST, PUT)
  app.get('/api/orders', async (req, res) => {
    try {
      const db = getDbPool();
      const [rows]: any = await db.query('SELECT * FROM service_orders ORDER BY scheduledDate DESC');
      const formatted = rows.map((o: any) => ({
        ...o,
        baseServiceFee: Number(o.baseServiceFee ?? o.base_service_fee ?? 0),
        kmTraveled: Number(o.kmTraveled ?? o.km_traveled ?? 0),
        kmRateApplied: Number(o.kmRateApplied ?? o.km_rate_applied ?? 0),
        kmTotalCost: Number(o.kmTotalCost ?? o.km_total_cost ?? 0),
        tollCost: Number(o.tollCost ?? o.toll_cost ?? 0),
        supportCost: Number(o.supportCost ?? o.support_cost ?? 0),
        totalTechnicianGross: Number(o.totalTechnicianGross ?? o.total_technician_gross ?? 0),
        faturamentoPorto: Number(o.faturamentoPorto ?? o.faturamento_porto ?? 0),
        itemsUsed: [],
      }));
      res.json({ success: true, data: formatted });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/orders', async (req, res) => {
    const o = req.body;
    try {
      const db = getDbPool();
      const colMap = await getTableColumnsMap('service_orders');

      const candidates: Array<{ keys: string[]; value: any }> = [
        { keys: ['id'], value: o.id },
        { keys: ['callnumber', 'call_number', 'numero_chamado'], value: o.callNumber },
        { keys: ['portoseguroprotocol', 'porto_seguro_protocol', 'protocolo_porto'], value: o.portoSeguroProtocol || null },
        { keys: ['servicecategory', 'service_category', 'categoria'], value: o.serviceCategory || 'Higienização Padrão' },
        { keys: ['baseservicefee', 'base_service_fee', 'valor_base'], value: Number(o.baseServiceFee || 0) },
        { keys: ['customername', 'customer_name', 'cliente_nome'], value: o.customerName || '' },
        { keys: ['customercpf', 'customer_cpf', 'cliente_cpf'], value: o.customerCpf || '' },
        { keys: ['customerphone', 'customer_phone', 'cliente_telefone'], value: o.customerPhone || null },
        { keys: ['city', 'cidade'], value: o.city || 'São Paulo' },
        { keys: ['uf', 'estado'], value: o.uf || 'SP' },
        { keys: ['neighborhood', 'bairro'], value: o.neighborhood || '' },
        { keys: ['addressstreet', 'address_street', 'endereco'], value: o.addressStreet || '' },
        { keys: ['addressnumber', 'address_number', 'numero'], value: o.addressNumber || '' },
        { keys: ['addresscomplement', 'address_complement', 'complemento'], value: o.addressComplement || null },
        { keys: ['postalcode', 'postal_code', 'cep'], value: o.postalCode || '' },
        { keys: ['technicianid', 'technician_id', 'tecnico_id'], value: o.technicianId || null },
        { keys: ['status'], value: o.status || 'PENDING' },
        { keys: ['scheduleddate', 'scheduled_date', 'data_agendada'], value: o.scheduledDate ? new Date(o.scheduledDate) : new Date() },
        { keys: ['kmtraveled', 'km_traveled', 'km_rodado'], value: Number(o.kmTraveled || 0) },
        { keys: ['kmrateapplied', 'km_rate_applied', 'valor_km'], value: Number(o.kmRateApplied || 0.5) },
        { keys: ['kmtotalcost', 'km_total_cost', 'total_km'], value: Number(o.kmTotalCost || 0) },
        { keys: ['tollcost', 'toll_cost', 'pedagio'], value: Number(o.tollCost || 0) },
        { keys: ['supportcost', 'support_cost', 'ajuda_custo_adicional'], value: Number(o.supportCost || 0) },
        { keys: ['totaltechniciangross', 'total_technician_gross', 'total_bruto_tecnico'], value: Number(o.totalTechnicianGross || 0) },
        { keys: ['faturamentoporto', 'faturamento_porto', 'valor_porto'], value: Number(o.faturamentoPorto || 0) },
        { keys: ['customersignature', 'customer_signature', 'assinatura'], value: o.customerSignature || null },
        { keys: ['executionnotes', 'execution_notes', 'observacoes'], value: o.executionNotes || null },
        { keys: ['tollreceipturl', 'toll_receipt_url', 'comprovante_pedagio'], value: o.tollReceiptUrl || null },
      ];

      const insertCols: string[] = [];
      const insertPlaceholders: string[] = [];
      const insertValues: any[] = [];
      const updateClauses: string[] = [];

      for (const item of candidates) {
        let matchedCol: string | undefined;
        for (const k of item.keys) {
          if (colMap.has(k.toLowerCase())) {
            matchedCol = colMap.get(k.toLowerCase());
            break;
          }
        }

        if (matchedCol) {
          insertCols.push(`\`${matchedCol}\``);
          insertPlaceholders.push('?');
          insertValues.push(item.value);
          if (matchedCol.toLowerCase() !== 'id') {
            updateClauses.push(`\`${matchedCol}\` = VALUES(\`${matchedCol}\`)`);
          }
        }
      }

      if (colMap.has('updatedat')) {
        updateClauses.push(`\`${colMap.get('updatedat')}\` = NOW()`);
      } else if (colMap.has('updated_at')) {
        updateClauses.push(`\`${colMap.get('updated_at')}\` = NOW()`);
      }

      if (insertCols.length === 0) {
        throw new Error('Nenhuma coluna correspondente na tabela service_orders.');
      }

      const query = `
        INSERT INTO \`service_orders\` (${insertCols.join(', ')})
        VALUES (${insertPlaceholders.join(', ')})
        ON DUPLICATE KEY UPDATE
        ${updateClauses.length > 0 ? updateClauses.join(', ') : 'id = id'}
      `;

      await db.execute(query, insertValues);
      res.json({ success: true, message: `OS ${o.callNumber} gravada no MariaDB.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4. STOCK ITEMS API (GET, POST, PUT)
  app.get('/api/stock', async (req, res) => {
    try {
      const db = getDbPool();
      const [rows]: any = await db.query('SELECT * FROM stock_items ORDER BY name ASC');
      const formatted = rows.map((s: any) => ({
        ...s,
        quantityInStock: Number(s.quantityInStock ?? s.quantity_in_stock ?? s.quantity ?? 0),
        minimumThreshold: Number(s.minimumThreshold ?? s.minimum_threshold ?? 0),
        unitCost: Number(s.unitCost ?? s.unit_cost ?? 0),
        isSupportSupply: Boolean(s.isSupportSupply ?? s.is_support_supply ?? true),
      }));
      res.json({ success: true, data: formatted });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/stock', async (req, res) => {
    const s = req.body;
    try {
      const db = getDbPool();
      const colMap = await getTableColumnsMap('stock_items');

      const candidates: Array<{ keys: string[]; value: any }> = [
        { keys: ['id'], value: s.id },
        { keys: ['code', 'codigo'], value: s.code },
        { keys: ['name', 'nome'], value: s.name },
        { keys: ['description', 'descricao'], value: s.description || null },
        { keys: ['category', 'categoria'], value: s.category || 'Geral' },
        { keys: ['unit', 'unidade'], value: s.unit || 'UN' },
        { keys: ['quantityinstock', 'quantity_in_stock', 'quantity', 'quantidade'], value: Number(s.quantityInStock || 0) },
        { keys: ['minimumthreshold', 'minimum_threshold', 'minimo'], value: Number(s.minimumThreshold || 5) },
        { keys: ['unitcost', 'unit_cost', 'custo_unitario'], value: Number(s.unitCost || 0) },
        { keys: ['issupportsupply', 'is_support_supply'], value: s.isSupportSupply ? 1 : 0 },
      ];

      const insertCols: string[] = [];
      const insertPlaceholders: string[] = [];
      const insertValues: any[] = [];
      const updateClauses: string[] = [];

      for (const item of candidates) {
        let matchedCol: string | undefined;
        for (const k of item.keys) {
          if (colMap.has(k.toLowerCase())) {
            matchedCol = colMap.get(k.toLowerCase());
            break;
          }
        }

        if (matchedCol) {
          insertCols.push(`\`${matchedCol}\``);
          insertPlaceholders.push('?');
          insertValues.push(item.value);
          if (matchedCol.toLowerCase() !== 'id') {
            updateClauses.push(`\`${matchedCol}\` = VALUES(\`${matchedCol}\`)`);
          }
        }
      }

      if (colMap.has('updatedat')) {
        updateClauses.push(`\`${colMap.get('updatedat')}\` = NOW()`);
      } else if (colMap.has('updated_at')) {
        updateClauses.push(`\`${colMap.get('updated_at')}\` = NOW()`);
      }

      if (insertCols.length === 0) {
        throw new Error('Nenhuma coluna correspondente na tabela stock_items.');
      }

      const query = `
        INSERT INTO \`stock_items\` (${insertCols.join(', ')})
        VALUES (${insertPlaceholders.join(', ')})
        ON DUPLICATE KEY UPDATE
        ${updateClauses.length > 0 ? updateClauses.join(', ') : 'id = id'}
      `;

      await db.execute(query, insertValues);
      res.json({ success: true, message: `Item ${s.name} salvo no estoque.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5. FINANCIAL MOVEMENTS API
  app.get('/api/movements', async (req, res) => {
    try {
      const db = getDbPool();
      const [rows]: any = await db.query('SELECT * FROM financial_movements ORDER BY createdAt DESC');
      const formatted = rows.map((m: any) => ({
        ...m,
        amount: Number(m.amount || 0),
      }));
      res.json({ success: true, data: formatted });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/movements', async (req, res) => {
    const m = req.body;
    try {
      const db = getDbPool();
      const colMap = await getTableColumnsMap('financial_movements');

      const candidates: Array<{ keys: string[]; value: any }> = [
        { keys: ['id'], value: m.id },
        { keys: ['type', 'tipo'], value: m.type },
        { keys: ['category', 'categoria'], value: m.category },
        { keys: ['description', 'descricao'], value: m.description },
        { keys: ['amount', 'valor'], value: Number(m.amount || 0) },
        { keys: ['status'], value: m.status || 'CONFIRMED' },
        { keys: ['technicianid', 'technician_id', 'tecnico_id'], value: m.technicianId || null },
        { keys: ['serviceorderid', 'service_order_id', 'os_id'], value: m.serviceOrderId || null },
        { keys: ['biweeklyclosingid', 'biweekly_closing_id', 'fechamento_id'], value: m.biweeklyClosingId || null },
        { keys: ['paymentmethod', 'payment_method', 'forma_pagamento'], value: m.paymentMethod || null },
      ];

      const insertCols: string[] = [];
      const insertPlaceholders: string[] = [];
      const insertValues: any[] = [];

      for (const item of candidates) {
        let matchedCol: string | undefined;
        for (const k of item.keys) {
          if (colMap.has(k.toLowerCase())) {
            matchedCol = colMap.get(k.toLowerCase());
            break;
          }
        }

        if (matchedCol) {
          insertCols.push(`\`${matchedCol}\``);
          insertPlaceholders.push('?');
          insertValues.push(item.value);
        }
      }

      if (colMap.has('createdat')) {
        insertCols.push(`\`${colMap.get('createdat')}\``);
        insertPlaceholders.push('NOW()');
      } else if (colMap.has('created_at')) {
        insertCols.push(`\`${colMap.get('created_at')}\``);
        insertPlaceholders.push('NOW()');
      }

      if (insertCols.length === 0) {
        throw new Error('Nenhuma coluna correspondente na tabela financial_movements.');
      }

      const query = `
        INSERT INTO \`financial_movements\` (${insertCols.join(', ')})
        VALUES (${insertPlaceholders.join(', ')})
      `;

      await db.execute(query, insertValues);
      res.json({ success: true, message: 'Movimento financeiro gravado no MariaDB.' });
    } catch (err: any) {
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
