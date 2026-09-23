import mysql from 'mysql2/promise';

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  ssl?: boolean;
}

const parseDbConfig = (): DbConfig => {
  const host = process.env.MARIADB_HOST || process.env.DB_HOST || '192.168.15.246';
  const port = Number(process.env.MARIADB_PORT || process.env.DB_PORT || 3306);
  const database = process.env.MARIADB_DATABASE || process.env.DB_NAME || 'higienizador_db';
  const user = process.env.MARIADB_USER || process.env.DB_USER || 'app_higienizador';
  const password = process.env.MARIADB_PASSWORD || process.env.DB_PASSWORD || 'PortoSeguro@2026!';
  const ssl = process.env.MARIADB_SSL === 'true' || process.env.DB_SSL === 'true';

  if (process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL.replace('mysql://', 'http://'));
      return {
        host: url.hostname || host,
        port: url.port ? Number(url.port) : port,
        database: url.pathname ? url.pathname.replace('/', '') : database,
        user: url.username || user,
        password: url.password || password,
        ssl,
      };
    } catch {
      // fallback to env vars
    }
  }

  return { host, port, database, user, password, ssl };
};

let pool: mysql.Pool | null = null;
let isConnected = false;
let lastError: string | null = null;

let currentDbConfig: DbConfig | null = null;

export const getDbConfig = (): DbConfig => {
  if (!currentDbConfig) {
    currentDbConfig = parseDbConfig();
  }
  return currentDbConfig;
};

export const updateDbConfig = async (newConfig: Partial<DbConfig>): Promise<void> => {
  const base = getDbConfig();
  currentDbConfig = {
    ...base,
    ...newConfig,
  };
  if (pool) {
    try {
      await pool.end();
    } catch {}
    pool = null;
  }
};

export function getDbPool(): mysql.Pool {
  if (!pool) {
    const config = getDbConfig();
    console.log(`[MariaDB] Inicializando Pool de Conexão para ${config.user}@${config.host}:${config.port}/${config.database} (SSL: ${config.ssl ? 'Ativo' : 'Desativado/Skip-SSL'})`);
    
    pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 2000, // 2s timeout for fast failover
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });
  }
  return pool;
}

export async function testDbConnection(customConfig?: Partial<DbConfig>): Promise<{
  connected: boolean;
  host: string;
  port: number;
  database: string;
  latencyMs: number;
  error?: string;
}> {
  const config = customConfig ? { ...getDbConfig(), ...customConfig } : getDbConfig();
  const startTime = Date.now();
  let tempPool: mysql.Pool | null = null;
  try {
    const db = customConfig ? (tempPool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      connectTimeout: 3000,
    })) : getDbPool();

    const [rows] = await db.query('SELECT 1 as ping');
    const latencyMs = Date.now() - startTime;
    isConnected = true;
    lastError = null;
    if (tempPool) await tempPool.end().catch(() => {});
    return {
      connected: true,
      host: config.host,
      port: config.port,
      database: config.database,
      latencyMs,
    };
  } catch (err: any) {
    if (tempPool) await tempPool.end().catch(() => {});
    isConnected = false;
    lastError = err?.message || 'Erro desconhecido ao conectar no MariaDB';
    const latencyMs = Date.now() - startTime;
    console.warn(`[MariaDB] Conexão direta com ${config.host}:${config.port} indisponível: ${lastError}`);
    return {
      connected: false,
      host: config.host,
      port: config.port,
      database: config.database,
      latencyMs,
      error: lastError,
    };
  }
}

export async function initializeDatabaseSchema(): Promise<void> {
  try {
    const db = getDbPool();
    
    // 1. users table
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        passwordHash VARCHAR(255) NULL,
        role ENUM('ADMIN', 'OPERATIONAL', 'TECHNICIAN') NOT NULL DEFAULT 'TECHNICIAN',
        documentCpf VARCHAR(18) NULL,
        phone VARCHAR(25) NULL,
        avatarUrl VARCHAR(255) NULL,
        isActive TINYINT(1) NOT NULL DEFAULT 1,
        pixKeyType VARCHAR(20) DEFAULT 'CPF',
        pixKey VARCHAR(100) NULL,
        bankName VARCHAR(80) NULL,
        bankAgency VARCHAR(20) NULL,
        bankAccount VARCHAR(30) NULL,
        baseCostAllowance DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        costAllowanceFortnight INT NOT NULL DEFAULT 1,
        hasSpecialTaxRule TINYINT(1) NOT NULL DEFAULT 0,
        specialTaxRate DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
        price_table LONGTEXT NULL,
        km_rate DECIMAL(5, 2) NOT NULL DEFAULT 0.75,
        kmRate DECIMAL(5, 2) NOT NULL DEFAULT 0.75,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_users_role (role)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure all missing columns exist in existing 'users' table (MariaDB 10.2+)
    const userAlterStatements = [
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(150) NULL",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS passwordHash VARCHAR(255) NULL",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(30) NOT NULL DEFAULT 'TECHNICIAN'",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS documentCpf VARCHAR(18) NULL",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(25) NULL",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatarUrl VARCHAR(255) NULL",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS isActive TINYINT(1) NOT NULL DEFAULT 1",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS pixKeyType VARCHAR(20) DEFAULT 'CPF'",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS pixKey VARCHAR(100) NULL",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS bankName VARCHAR(80) NULL",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS bankAgency VARCHAR(20) NULL",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS bankAccount VARCHAR(30) NULL",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS baseCostAllowance DECIMAL(10, 2) NOT NULL DEFAULT 0.00",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS costAllowanceFortnight INT NOT NULL DEFAULT 1",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS cost_allowance_fortnight INT NOT NULL DEFAULT 1",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS hasSpecialTaxRule TINYINT(1) NOT NULL DEFAULT 0",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS specialTaxRate DECIMAL(5, 2) NOT NULL DEFAULT 0.00",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS price_table LONGTEXT NULL",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS km_rate DECIMAL(5, 2) NOT NULL DEFAULT 0.75",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS kmRate DECIMAL(5, 2) NOT NULL DEFAULT 0.75",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS qra_code VARCHAR(50) NULL",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS qra VARCHAR(50) NULL",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS createdAt DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3)",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS updatedAt DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)",
    ];

    for (const stmt of userAlterStatements) {
      await db.query(stmt).catch((err: any) => {
        console.warn(`[MariaDB Migration Notice] ${stmt}: ${err.message}`);
      });
    }

    // 2. services table (Catálogo de Serviços)
    await db.query(`
      CREATE TABLE IF NOT EXISTS services (
        id VARCHAR(80) NOT NULL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL DEFAULT 'Porto Seguro',
        description TEXT NULL,
        default_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_services_name (name),
        INDEX idx_services_category (category)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2.0 products table (Catálogo de Produtos)
    await db.query(`
      CREATE TABLE IF NOT EXISTS products (
        id VARCHAR(80) NOT NULL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL DEFAULT 'Suportes',
        unit_price DECIMAL(10, 2) NOT NULL DEFAULT 60.00,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_products_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2.a. service_orders table
    await db.query(`
      CREATE TABLE IF NOT EXISTS service_orders (
        id VARCHAR(80) NOT NULL PRIMARY KEY,
        callNumber VARCHAR(50) NOT NULL,
        portoSeguroProtocol VARCHAR(50) NULL,
        serviceCategory VARCHAR(80) NOT NULL,
        baseServiceFee DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        customerName VARCHAR(120) NOT NULL,
        customerCpf VARCHAR(18) NOT NULL,
        customerPhone VARCHAR(25) NULL,
        city VARCHAR(80) NOT NULL,
        uf VARCHAR(2) NOT NULL,
        neighborhood VARCHAR(80) NOT NULL,
        addressStreet VARCHAR(150) NOT NULL,
        addressNumber VARCHAR(20) NOT NULL,
        addressComplement VARCHAR(50) NULL,
        postalCode VARCHAR(10) NOT NULL,
        technicianId VARCHAR(36) NULL,
        status ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'LOST_VISIT') NOT NULL DEFAULT 'PENDING',
        scheduledDate DATETIME(3) NOT NULL,
        startedAt DATETIME(3) NULL,
        completedAt DATETIME(3) NULL,
        kmTraveled DECIMAL(8, 2) NOT NULL DEFAULT 0.00,
        kmRateApplied DECIMAL(8, 2) NOT NULL DEFAULT 0.50,
        km_rate_applied DECIMAL(8, 2) NOT NULL DEFAULT 0.50,
        kmPayout DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        km_payout DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        kmTotalCost DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        tollCost DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        supportCost DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        totalTechnicianGross DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        faturamentoPorto DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        customerSignature LONGTEXT NULL,
        executionNotes TEXT NULL,
        tollReceiptUrl VARCHAR(255) NULL,
        paymentStatus VARCHAR(30) NOT NULL DEFAULT 'PENDING',
        paymentDate DATETIME(3) NULL,
        active_call_token VARCHAR(60) AS (IF(status = 'IN_PROGRESS', callNumber, NULL)) PERSISTENT,
        is_cross_selling TINYINT(1) NOT NULL DEFAULT 0,
        additional_items_qty INT NOT NULL DEFAULT 0,
        additional_item_unit_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        porto_billing_value DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE KEY uq_active_call_token (active_call_token),
        INDEX idx_os_status (status),
        INDEX idx_os_tech (technicianId),
        INDEX idx_os_payment (paymentStatus),
        INDEX idx_os_callNumber (callNumber)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure all missing columns exist in existing 'service_orders' table (MariaDB 10.2+)
    const orderAlterStatements = [
      "ALTER TABLE service_orders MODIFY COLUMN id VARCHAR(80) NOT NULL",
      "ALTER TABLE service_orders DROP INDEX callNumber",
      "ALTER TABLE service_orders DROP INDEX call_number",
      "ALTER TABLE service_orders ADD INDEX idx_os_callNumber (callNumber)",
      "ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS paymentStatus VARCHAR(30) NOT NULL DEFAULT 'PENDING'",
      "ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS paymentDate DATETIME(3) NULL",
      "ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS km_rate_applied DECIMAL(8, 2) NOT NULL DEFAULT 0.50",
      "ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS km_payout DECIMAL(10, 2) NOT NULL DEFAULT 0.00",
      "ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS kmPayout DECIMAL(10, 2) NOT NULL DEFAULT 0.00",
      "ALTER TABLE service_orders MODIFY COLUMN status ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'LOST_VISIT') NOT NULL DEFAULT 'PENDING'",
      "ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS active_call_token VARCHAR(60) AS (IF(status = 'IN_PROGRESS', callNumber, NULL)) PERSISTENT",
      "ALTER TABLE service_orders ADD UNIQUE INDEX uq_active_call_token (active_call_token)",
      "ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS service_motive VARCHAR(255) NULL",
      "ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS porto_billing_value DECIMAL(10, 2) NOT NULL DEFAULT 0.00",
      "ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS has_bracket TINYINT(1) NOT NULL DEFAULT 0",
      "ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS bracket_cost DECIMAL(10, 2) NOT NULL DEFAULT 0.00",
      "ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS is_cross_selling TINYINT(1) NOT NULL DEFAULT 0",
      "ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS additional_items_qty INT NOT NULL DEFAULT 0",
      "ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS additional_item_unit_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00",
      "ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS service_id VARCHAR(100) NULL",
      "ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS product_id VARCHAR(100) NULL",
      "ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS product_name VARCHAR(255) NULL"
    ];

    for (const stmt of orderAlterStatements) {
      await db.query(stmt).catch((err: any) => {
        console.warn(`[MariaDB Migration Notice] ${stmt}: ${err.message}`);
      });
    }

    // 2.b. porto_service_prices table
    await db.query(`
      CREATE TABLE IF NOT EXISTS porto_service_prices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category VARCHAR(100) NOT NULL,
        service_name VARCHAR(255) NOT NULL,
        search_keywords VARCHAR(255) NULL,
        completed_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        additional_price DECIMAL(10,2) DEFAULT 0.00,
        additional_item_price DECIMAL(10,2) DEFAULT 0.00,
        effective_date DATE DEFAULT '2026-07-29',
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure all columns exist in porto_service_prices
    const portoAlterStatements = [
      "ALTER TABLE porto_service_prices ADD COLUMN IF NOT EXISTS completed_price DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Valor padrão da OS concluída'",
      "ALTER TABLE porto_service_prices ADD COLUMN IF NOT EXISTS additional_price DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Valor de novo serviço comercializado no local'",
      "ALTER TABLE porto_service_prices ADD COLUMN IF NOT EXISTS additional_item_price DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Valor unitário por almofada/assento adicional em estofados'"
    ];

    for (const stmt of portoAlterStatements) {
      await db.query(stmt).catch((err: any) => {
        console.warn(`[MariaDB Migration Notice] ${stmt}: ${err.message}`);
      });
    }

    // 3. stock_items table
    await db.query(`
      CREATE TABLE IF NOT EXISTS stock_items (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        code VARCHAR(30) NOT NULL UNIQUE,
        name VARCHAR(120) NOT NULL,
        description VARCHAR(255) NULL,
        category VARCHAR(60) NOT NULL,
        unit VARCHAR(20) NOT NULL,
        quantityInStock DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        minimumThreshold DECIMAL(10, 2) NOT NULL DEFAULT 5.00,
        unitCost DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        isSupportSupply TINYINT(1) NOT NULL DEFAULT 1,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. financial_movements table
    await db.query(`
      CREATE TABLE IF NOT EXISTS financial_movements (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        category VARCHAR(80) NOT NULL,
        description VARCHAR(200) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'CONFIRMED',
        technicianId VARCHAR(36) NULL,
        serviceOrderId VARCHAR(36) NULL,
        biweeklyClosingId VARCHAR(36) NULL,
        paymentMethod VARCHAR(50) NULL,
        dueDate DATETIME(3) NULL,
        paymentDate DATETIME(3) NULL,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_fin_tech (technicianId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 5. audit_logs table (Mandatório conforme Especificação Técnica)
    await db.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        timestamp DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        userId VARCHAR(36) NOT NULL,
        userName VARCHAR(120) NOT NULL,
        userRole VARCHAR(30) NOT NULL,
        ipAddress VARCHAR(50) NULL,
        module VARCHAR(50) NOT NULL,
        action VARCHAR(60) NOT NULL,
        affectedRecordId VARCHAR(100) NULL,
        affectedRecordType VARCHAR(60) NULL,
        oldValue LONGTEXT NULL,
        newValue LONGTEXT NULL,
        result ENUM('SUCCESS', 'BLOCKED', 'FAILED') NOT NULL DEFAULT 'SUCCESS',
        details TEXT NULL,
        INDEX idx_audit_user (userId),
        INDEX idx_audit_module (module),
        INDEX idx_audit_action (action),
        INDEX idx_audit_time (timestamp)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 6. technician_custom_rates table
    await db.query(`
      CREATE TABLE IF NOT EXISTS technician_custom_rates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        technician_id VARCHAR(100) NOT NULL,
        service_category VARCHAR(100) NOT NULL,
        custom_fee DECIMAL(10,2) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_tech_service (technician_id, service_category)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 7. pending_km_buffer table
    await db.query(`
      CREATE TABLE IF NOT EXISTS pending_km_buffer (
        id INT AUTO_INCREMENT PRIMARY KEY,
        call_number_partial VARCHAR(50) NOT NULL,
        km_traveled DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        toll_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        technician_name VARCHAR(150),
        technician_id VARCHAR(100),
        sender_phone VARCHAR(50),
        is_lost_visit BOOLEAN DEFAULT FALSE,
        status ENUM('PENDING', 'ATTACHED') DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        attached_at TIMESTAMP NULL,
        INDEX idx_call_partial (call_number_partial),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('[MariaDB] Tabelas verificadas/atualizadas com sucesso no banco `higienizador_db` (incluindo audit_logs, technician_custom_rates e pending_km_buffer).');

    // Executar saneamento retroativo de base de dados para taxas de KM (Corte Histórico 26/07/2026)
    try {
      // 1. Forçar km_rate_applied = 0.50 para todos os chamados com data de execução <= '2026-07-26 23:59:59'
      await db.query(`
        UPDATE service_orders
        SET km_rate_applied = 0.50, kmRateApplied = 0.50
        WHERE scheduled_date <= '2026-07-26 23:59:59' OR scheduledDate <= '2026-07-26 23:59:59'
      `);

      // 2. Para chamados pós cutoff, aplicar a taxa do técnico (se houver) ou fallback de 0.75
      await db.query(`
        UPDATE service_orders o
        LEFT JOIN users u ON o.technicianId = u.id OR o.technician_id = u.id
        SET o.km_rate_applied = COALESCE(u.km_rate, u.kmRate, 0.75),
            o.kmRateApplied = COALESCE(u.km_rate, u.kmRate, 0.75)
        WHERE (o.scheduled_date > '2026-07-26 23:59:59' OR o.scheduledDate > '2026-07-26 23:59:59')
      `);

      // 3. Preencher km_payout e kmPayout
      await db.query(`
        UPDATE service_orders
        SET km_payout = ROUND(COALESCE(km_traveled, kmTraveled, 0) * km_rate_applied, 2),
            kmPayout = ROUND(COALESCE(km_traveled, kmTraveled, 0) * km_rate_applied, 2),
            kmTotalCost = ROUND(COALESCE(km_traveled, kmTraveled, 0) * km_rate_applied, 2)
      `);

      // 4. Atualizar total_technician_gross e totalTechnicianGross
      await db.query(`
        UPDATE service_orders
        SET total_technician_gross = ROUND(COALESCE(base_service_fee, baseServiceFee, 0) + km_payout + COALESCE(toll_cost, tollCost, 0) + COALESCE(support_cost, supportCost, 0), 2),
            totalTechnicianGross = ROUND(COALESCE(base_service_fee, baseServiceFee, 0) + km_payout + COALESCE(toll_cost, tollCost, 0) + COALESCE(support_cost, supportCost, 0), 2)
      `);

      console.log('[MariaDB] Saneamento retroativo de dados financeiros executado com sucesso.');
    } catch (sanitizationErr: any) {
      console.warn(`[MariaDB Sanitization Notice] Falha ao executar saneamento automático: ${sanitizationErr.message}`);
    }
  } catch (err: any) {
    console.warn(`[MariaDB] Inicialização de schema adiada: ${err.message}`);
  }
}
