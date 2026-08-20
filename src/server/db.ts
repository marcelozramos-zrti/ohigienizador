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
  const user = process.env.MARIADB_USER || process.env.DB_USER || 'root';
  const password = process.env.MARIADB_PASSWORD || process.env.DB_PASSWORD || '';
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

export function getDbPool(): mysql.Pool {
  if (!pool) {
    const config = parseDbConfig();
    console.log(`[MariaDB] Inicializando Pool de Conexão para ${config.user}@${config.host}:${config.port}/${config.database}`);
    
    pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 4000, // 4s timeout
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });
  }
  return pool;
}

export async function testDbConnection(): Promise<{
  connected: boolean;
  host: string;
  port: number;
  database: string;
  latencyMs: number;
  error?: string;
}> {
  const config = parseDbConfig();
  const startTime = Date.now();
  try {
    const db = getDbPool();
    const [rows] = await db.query('SELECT 1 as ping');
    const latencyMs = Date.now() - startTime;
    isConnected = true;
    lastError = null;
    return {
      connected: true,
      host: config.host,
      port: config.port,
      database: config.database,
      latencyMs,
    };
  } catch (err: any) {
    isConnected = false;
    lastError = err?.message || 'Erro desconhecido ao conectar no MariaDB';
    const latencyMs = Date.now() - startTime;
    console.warn(`[MariaDB] Conexão direta com ${config.host}:${config.port} indisponível neste ambiente: ${lastError}`);
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
        passwordHash VARCHAR(255) NOT NULL,
        role ENUM('ADMIN', 'OPERATIONAL', 'TECHNICIAN') NOT NULL DEFAULT 'TECHNICIAN',
        documentCpf VARCHAR(18) NOT NULL,
        phone VARCHAR(25) NOT NULL,
        avatarUrl VARCHAR(255) NULL,
        isActive TINYINT(1) NOT NULL DEFAULT 1,
        pixKeyType ENUM('CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM') DEFAULT 'CPF',
        pixKey VARCHAR(100) NULL,
        bankName VARCHAR(80) NULL,
        bankAgency VARCHAR(20) NULL,
        bankAccount VARCHAR(30) NULL,
        baseCostAllowance DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        hasSpecialTaxRule TINYINT(1) NOT NULL DEFAULT 0,
        specialTaxRate DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_users_role (role)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. service_orders table
    await db.query(`
      CREATE TABLE IF NOT EXISTS service_orders (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        callNumber VARCHAR(50) NOT NULL UNIQUE,
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
        status ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
        scheduledDate DATETIME(3) NOT NULL,
        startedAt DATETIME(3) NULL,
        completedAt DATETIME(3) NULL,
        kmTraveled DECIMAL(8, 2) NOT NULL DEFAULT 0.00,
        kmRateApplied DECIMAL(8, 2) NOT NULL DEFAULT 0.50,
        kmTotalCost DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        tollCost DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        supportCost DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        totalTechnicianGross DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        faturamentoPorto DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        customerSignature LONGTEXT NULL,
        executionNotes TEXT NULL,
        tollReceiptUrl VARCHAR(255) NULL,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_os_status (status),
        INDEX idx_os_tech (technicianId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

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

    console.log('[MariaDB] Tabelas verificadas/criadas com sucesso no banco `higienizador_db`.');
  } catch (err: any) {
    console.warn(`[MariaDB] Inicialização de schema adiada: ${err.message}`);
  }
}
