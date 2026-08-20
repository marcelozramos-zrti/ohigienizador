import express from 'express';
import path from 'path';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { getDbPool, testDbConnection, initializeDatabaseSchema, updateDbConfig, getDbConfig } from './src/server/db';

async function startServer() {
  const app = express();
  const PORT = 3000;

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

  // 2. USERS & TECHNICIANS API (GET, POST, PUT, DELETE)
  app.get('/api/users', async (req, res) => {
    try {
      const db = getDbPool();
      const [rows]: any = await db.query('SELECT * FROM users ORDER BY name ASC');
      // Format numeric/boolean fields
      const formatted = rows.map((u: any) => ({
        ...u,
        isActive: Boolean(u.isActive),
        hasSpecialTaxRule: Boolean(u.hasSpecialTaxRule),
        baseCostAllowance: Number(u.baseCostAllowance || 0),
        specialTaxRate: Number(u.specialTaxRate || 0),
      }));
      res.json({ success: true, data: formatted });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/users', async (req, res) => {
    const u = req.body;
    if (!u.id || !u.email || !u.name) {
      return res.status(400).json({ success: false, error: 'Campos obrigatórios ausentes (id, name, email).' });
    }

    try {
      const db = getDbPool();
      const query = `
        INSERT INTO users (
          id, name, email, passwordHash, role, documentCpf, phone, avatarUrl,
          isActive, pixKeyType, pixKey, bankName, bankAgency, bankAccount,
          baseCostAllowance, hasSpecialTaxRule, specialTaxRate, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          email = VALUES(email),
          passwordHash = VALUES(passwordHash),
          role = VALUES(role),
          documentCpf = VALUES(documentCpf),
          phone = VALUES(phone),
          avatarUrl = VALUES(avatarUrl),
          isActive = VALUES(isActive),
          pixKeyType = VALUES(pixKeyType),
          pixKey = VALUES(pixKey),
          bankName = VALUES(bankName),
          bankAgency = VALUES(bankAgency),
          bankAccount = VALUES(bankAccount),
          baseCostAllowance = VALUES(baseCostAllowance),
          hasSpecialTaxRule = VALUES(hasSpecialTaxRule),
          specialTaxRate = VALUES(specialTaxRate),
          updatedAt = NOW();
      `;

      const values = [
        u.id,
        u.name,
        u.email,
        u.password || u.passwordHash || 'Porto@2026',
        u.role || 'TECHNICIAN',
        u.documentCpf || '',
        u.phone || '',
        u.avatarUrl || null,
        u.isActive !== false ? 1 : 0,
        u.pixKeyType || 'CPF',
        u.pixKey || u.documentCpf || '',
        u.bankName || 'Banco Itaú',
        u.bankAgency || '0001',
        u.bankAccount || '00000-0',
        Number(u.baseCostAllowance ?? (u.role === 'TECHNICIAN' ? 250 : 0)),
        u.hasSpecialTaxRule ? 1 : 0,
        Number(u.specialTaxRate || 0),
      ];

      await db.execute(query, values);
      console.log(`[MariaDB] Usuário gravado com sucesso: ${u.name} (${u.email})`);
      res.json({ success: true, message: `Usuário ${u.name} salvo no MariaDB.`, user: u });
    } catch (err: any) {
      console.error(`[MariaDB] Erro ao gravar usuário ${u.name}:`, err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const u = req.body;

    try {
      const db = getDbPool();
      const fields: string[] = [];
      const values: any[] = [];

      if (u.name !== undefined) { fields.push('name = ?'); values.push(u.name); }
      if (u.email !== undefined) { fields.push('email = ?'); values.push(u.email); }
      if (u.role !== undefined) { fields.push('role = ?'); values.push(u.role); }
      if (u.documentCpf !== undefined) { fields.push('documentCpf = ?'); values.push(u.documentCpf); }
      if (u.phone !== undefined) { fields.push('phone = ?'); values.push(u.phone); }
      if (u.isActive !== undefined) { fields.push('isActive = ?'); values.push(u.isActive ? 1 : 0); }
      if (u.pixKeyType !== undefined) { fields.push('pixKeyType = ?'); values.push(u.pixKeyType); }
      if (u.pixKey !== undefined) { fields.push('pixKey = ?'); values.push(u.pixKey); }
      if (u.bankName !== undefined) { fields.push('bankName = ?'); values.push(u.bankName); }
      if (u.bankAgency !== undefined) { fields.push('bankAgency = ?'); values.push(u.bankAgency); }
      if (u.bankAccount !== undefined) { fields.push('bankAccount = ?'); values.push(u.bankAccount); }
      if (u.baseCostAllowance !== undefined) { fields.push('baseCostAllowance = ?'); values.push(Number(u.baseCostAllowance)); }
      if (u.hasSpecialTaxRule !== undefined) { fields.push('hasSpecialTaxRule = ?'); values.push(u.hasSpecialTaxRule ? 1 : 0); }
      if (u.specialTaxRate !== undefined) { fields.push('specialTaxRate = ?'); values.push(Number(u.specialTaxRate)); }
      if (u.password !== undefined) { fields.push('passwordHash = ?'); values.push(u.password); }

      if (fields.length === 0) {
        return res.json({ success: true, message: 'Nenhum campo para atualizar.' });
      }

      fields.push('updatedAt = NOW()');
      values.push(id);

      const query = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
      await db.execute(query, values);
      res.json({ success: true, message: `Usuário ${id} atualizado.` });
    } catch (err: any) {
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
        baseServiceFee: Number(o.baseServiceFee || 0),
        kmTraveled: Number(o.kmTraveled || 0),
        kmRateApplied: Number(o.kmRateApplied || 0),
        kmTotalCost: Number(o.kmTotalCost || 0),
        tollCost: Number(o.tollCost || 0),
        supportCost: Number(o.supportCost || 0),
        totalTechnicianGross: Number(o.totalTechnicianGross || 0),
        faturamentoPorto: Number(o.faturamentoPorto || 0),
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
      const query = `
        INSERT INTO service_orders (
          id, callNumber, portoSeguroProtocol, serviceCategory, baseServiceFee,
          customerName, customerCpf, customerPhone, city, uf, neighborhood,
          addressStreet, addressNumber, addressComplement, postalCode,
          technicianId, status, scheduledDate, kmTraveled, kmRateApplied,
          kmTotalCost, tollCost, supportCost, totalTechnicianGross, faturamentoPorto,
          customerSignature, executionNotes, tollReceiptUrl, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          technicianId = VALUES(technicianId),
          kmTraveled = VALUES(kmTraveled),
          kmTotalCost = VALUES(kmTotalCost),
          tollCost = VALUES(tollCost),
          supportCost = VALUES(supportCost),
          totalTechnicianGross = VALUES(totalTechnicianGross),
          customerSignature = VALUES(customerSignature),
          executionNotes = VALUES(executionNotes),
          completedAt = IF(VALUES(status) = 'COMPLETED', NOW(), completedAt),
          updatedAt = NOW();
      `;

      const values = [
        o.id,
        o.callNumber,
        o.portoSeguroProtocol || null,
        o.serviceCategory,
        Number(o.baseServiceFee || 0),
        o.customerName,
        o.customerCpf,
        o.customerPhone || null,
        o.city,
        o.uf,
        o.neighborhood,
        o.addressStreet,
        o.addressNumber,
        o.addressComplement || null,
        o.postalCode,
        o.technicianId || null,
        o.status || 'PENDING',
        new Date(o.scheduledDate),
        Number(o.kmTraveled || 0),
        Number(o.kmRateApplied || 0.5),
        Number(o.kmTotalCost || 0),
        Number(o.tollCost || 0),
        Number(o.supportCost || 0),
        Number(o.totalTechnicianGross || 0),
        Number(o.faturamentoPorto || 0),
        o.customerSignature || null,
        o.executionNotes || null,
        o.tollReceiptUrl || null,
      ];

      await db.execute(query, values);
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
        quantityInStock: Number(s.quantityInStock || 0),
        minimumThreshold: Number(s.minimumThreshold || 0),
        unitCost: Number(s.unitCost || 0),
        isSupportSupply: Boolean(s.isSupportSupply),
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
      const query = `
        INSERT INTO stock_items (
          id, code, name, description, category, unit,
          quantityInStock, minimumThreshold, unitCost, isSupportSupply, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          quantityInStock = VALUES(quantityInStock),
          minimumThreshold = VALUES(minimumThreshold),
          unitCost = VALUES(unitCost),
          updatedAt = NOW();
      `;
      await db.execute(query, [
        s.id,
        s.code,
        s.name,
        s.description || null,
        s.category,
        s.unit,
        Number(s.quantityInStock || 0),
        Number(s.minimumThreshold || 5),
        Number(s.unitCost || 0),
        s.isSupportSupply ? 1 : 0,
      ]);
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
      const query = `
        INSERT INTO financial_movements (
          id, type, category, description, amount, status,
          technicianId, serviceOrderId, biweeklyClosingId, paymentMethod, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW());
      `;
      await db.execute(query, [
        m.id,
        m.type,
        m.category,
        m.description,
        Number(m.amount || 0),
        m.status || 'CONFIRMED',
        m.technicianId || null,
        m.serviceOrderId || null,
        m.biweeklyClosingId || null,
        m.paymentMethod || 'PIX',
      ]);
      res.json({ success: true, message: 'Movimentação registrada no MariaDB.' });
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
