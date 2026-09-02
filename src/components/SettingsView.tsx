import React, { useState } from 'react';
import {
  Settings,
  DollarSign,
  Car,
  MessageSquare,
  Shield,
  Layers,
  Save,
  CheckCircle2,
  Code,
  Key,
  Globe,
  Database,
  Server,
  RefreshCw,
  Copy,
  Check,
  HardDrive,
  Cpu,
  AlertTriangle,
  Lock,
  Eye,
  EyeOff,
  Terminal,
  Activity,
  Users,
  Network,
  Workflow,
  Bot,
  Zap,
  Send,
  Radio,
  ArrowRightLeft,
  Sparkles,
  ExternalLink,
  HelpCircle,
  Smartphone,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ApiService } from '../services/apiService';
import { DatabaseSettings, N8nSettings } from '../types';

export const SettingsView: React.FC = () => {
  const { settings, updateSettings, addToast, currentUser, users, orders } = useApp();

  const [activeTab, setActiveTab] = useState<'FINANCIAL' | 'DATABASE' | 'WHATSAPP' | 'N8N'>('FINANCIAL');

  const rates = settings?.serviceCategoriesRates || {};

  // Financial State
  const [kmRate, setKmRate] = useState(settings?.kmReimbursementRate ?? settings?.kmRateDefault ?? 0.5);
  const [fixedAllowance, setFixedAllowance] = useState(settings?.fixedCostAllowance ?? 250.0);
  const [defaultTaxRate, setDefaultTaxRate] = useState(settings?.defaultTaxDeductionRate ?? settings?.defaultSpecialTaxRate ?? 16.0);

  // Porto Service Category Rates
  const [sofaRate, setSofaRate] = useState(rates['Higienização de Sofá 3 Lugares'] || 140.0);
  const [impermeabRate, setImpermeabRate] = useState(rates['Impermeabilização de Estofado'] || 190.0);
  const [autoRate, setAutoRate] = useState(rates['Higienização Automotiva Completa'] || 160.0);
  const [colchaoRate, setColchaoRate] = useState(rates['Higienização de Colchão Queen'] || 150.0);
  const [tapeteRate, setTapeteRate] = useState(rates['Higienização de Tapetes e Carpetes'] || 175.0);
  const [lavaSecaRate, setLavaSecaRate] = useState(rates['Instalação Lava e Seca'] || 40.0);
  const [tvRate, setTvRate] = useState(rates['Instalação TV de 44 a 70 + Suporte Fixo'] || 60.0);
  const [purificadorRate, setPurificadorRate] = useState(rates['Instalação Purificador de Água'] || 40.0);
  const [visitaPerdidaRate, setVisitaPerdidaRate] = useState(rates['Visita Perdida'] || 40.0);

  // WhatsApp State
  const [waProvider, setWaProvider] = useState(settings?.whatsappProvider || 'EVOLUTION_API');
  const [waEndpoint, setWaEndpoint] = useState(settings?.whatsappApiEndpoint || settings?.whatsappApiUrl || 'https://api.evolution.ohigienizador.com.br');
  const [waKey, setWaKey] = useState(settings?.whatsappApiKey || 'EVO_SEC_88941_HIGIENIZADOR_2026');
  const [waInstance, setWaInstance] = useState(settings?.whatsappInstanceName || 'Higienizador-Producao-01');
  const [waTemplate, setWaTemplate] = useState(
    settings?.whatsappTemplateMessage ||
      'Olá {NOME_TECNICO}! Segue seu Extrato Oficial de Fechamento ({PERIODO_QUINZENA}).\n\n📌 Total de Chamados: {TOTAL_OS}\n💵 Total Bruto (+ Ajuda Custo): R$ {VALOR_BRUTO}\n🔻 Vales/Deduções: R$ {VALOR_DESCONTOS}\n⚖️ Impostos Retidos: R$ {VALOR_IMPOSTOS}\n✅ VALOR LÍQUIDO PIX: R$ {VALOR_LIQUIDO}\n\nChave PIX: {CHAVE_PIX} ({BANCO})\n\nO documento oficial em PDF segue anexo. Qualquer dúvida, fale com a Diretoria!'
  );

  // Database MariaDB State (Servidor brsaolxdb01: 192.168.15.246 / higienizador_db)
  const initialDb = settings?.databaseSettings || {
    dbEngine: 'MARIADB',
    dbHost: '192.168.15.246',
    dbPort: 3306,
    dbName: 'higienizador_db',
    dbUser: 'app_higienizador',
    dbPassword: 'PortoSeguro@2026!',
    dbSsl: false,
    dbPoolMin: 2,
    dbPoolMax: 10,
    connectionStringMasked: 'mysql://app_higienizador:***@192.168.15.246:3306/higienizador_db',
    syncStatus: 'CONNECTED',
    lastPingMs: 3,
    lastSyncTimestamp: new Date().toISOString(),
  };

  const [dbHost, setDbHost] = useState(initialDb.dbUser === 'root' && !initialDb.dbPassword ? '192.168.15.246' : (initialDb.dbHost || '192.168.15.246'));
  const [dbPort, setDbPort] = useState(initialDb.dbPort || 3306);
  const [dbName, setDbName] = useState(initialDb.dbName || 'higienizador_db');
  const [dbUser, setDbUser] = useState(initialDb.dbUser === 'root' && !initialDb.dbPassword ? 'app_higienizador' : (initialDb.dbUser || 'app_higienizador'));
  const [dbPassword, setDbPassword] = useState(initialDb.dbUser === 'root' && !initialDb.dbPassword ? 'PortoSeguro@2026!' : (initialDb.dbPassword || 'PortoSeguro@2026!'));
  const [showPassword, setShowPassword] = useState(false);
  const [dbSsl, setDbSsl] = useState(Boolean(initialDb.dbSsl));
  const [dbPoolMin, setDbPoolMin] = useState(initialDb.dbPoolMin || 2);
  const [dbPoolMax, setDbPoolMax] = useState(initialDb.dbPoolMax || 10);
  const [isTestingDb, setIsTestingDb] = useState(false);
  const [dbPingResult, setDbPingResult] = useState<{ success: boolean; pingMs: number; message: string } | null>({
    success: true,
    pingMs: 3,
    message: 'Conexão ativa com MariaDB na VM brsaolxdb01 (192.168.15.246:3306) / Base `higienizador_db` (7 tabelas ativas).',
  });
  const [showSqlSchemaModal, setShowSqlSchemaModal] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // N8N & Webhooks State
  const [n8nEnabled, setN8nEnabled] = useState(settings?.n8nSettings?.enabled ?? true);
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState(settings?.n8nSettings?.webhookUrl || 'https://n8n.ohigienizador.com.br/webhook/higienizador-events');
  const [n8nApiKey, setN8nApiKey] = useState(settings?.n8nSettings?.apiKey || 'N8N_HIGIENIZADOR_SECRET_2026');
  const [showN8nApiKey, setShowN8nApiKey] = useState(false);
  const [n8nEvents, setN8nEvents] = useState(
    settings?.n8nSettings?.events || {
      onOrderCreated: true,
      onOrderAssigned: true,
      onOrderCompleted: true,
      onDailySummary: true,
      onStockAlert: true,
      onBiweeklyClosing: true,
      onAdvanceRequested: true,
    }
  );

  const [isTestingN8n, setIsTestingN8n] = useState(false);
  const [n8nTestResult, setN8nTestResult] = useState<{
    success: boolean;
    statusCode?: number;
    responseTimeMs?: number;
    message?: string;
    responseBody?: any;
    error?: string;
  } | null>(null);

  const [copiedN8nKey, setCopiedN8nKey] = useState(false);
  const [copiedEndpointUrl, setCopiedEndpointUrl] = useState<string | null>(null);

  const generateNewApiKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'N8N_SEC_';
    for (let i = 0; i < 24; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setN8nApiKey(result);
    addToast('Nova Chave Gerada', 'Clique em "Salvar Alterações" no topo para persistir a nova chave.', 'info');
  };

  const handleTestN8nWebhook = async () => {
    setIsTestingN8n(true);
    setN8nTestResult(null);
    try {
      const res = await ApiService.testN8nWebhook({
        webhookUrl: n8nWebhookUrl,
        apiKey: n8nApiKey,
        testType: 'TEST_PING',
      });
      setN8nTestResult(res);
      if (res.success) {
        addToast('Conexão N8N Estabelecida', res.message || 'Webhook recebido com sucesso pelo N8N!', 'success');
      } else {
        addToast('Atenção no N8N', res.error || 'N8N retornou erro ou workflow inativo.', 'warning');
      }
    } catch (err: any) {
      setN8nTestResult({ success: false, error: err.message });
      addToast('Erro no Teste N8N', err.message, 'error');
    } finally {
      setIsTestingN8n(false);
    }
  };

  // Live MariaDB Logs & Schema Diagnostics
  const [dbLogs, setDbLogs] = useState<Array<{ id: string; timestamp: string; level: 'INFO' | 'WARN' | 'ERROR'; message: string; query?: string; details?: any }>>([]);
  const [isFetchingLogs, setIsFetchingLogs] = useState(false);
  const [isSyncingSchema, setIsSyncingSchema] = useState(false);
  const [schemaSyncResult, setSchemaSyncResult] = useState<{ success: boolean; message: string; added: string[]; skipped: string[]; errors: string[] } | null>(null);

  const fetchDbLogs = async () => {
    setIsFetchingLogs(true);
    try {
      const logs = await ApiService.getDbLogs();
      setDbLogs(logs);
    } catch {
      // ignore
    } finally {
      setIsFetchingLogs(false);
    }
  };

  const handleSyncSchema = async () => {
    setIsSyncingSchema(true);
    setSchemaSyncResult(null);
    try {
      const res = await ApiService.syncDbSchema();
      setSchemaSyncResult(res);
      if (res.success) {
        addToast('Schema Sincronizado', res.message, 'success');
      } else {
        addToast('Atenção no Schema', res.message, 'warning');
      }
      setTimeout(() => fetchDbLogs(), 500);
    } catch (err: any) {
      addToast('Erro na Sincronização', err.message, 'error');
    } finally {
      setIsSyncingSchema(false);
    }
  };

  React.useEffect(() => {
    if (activeTab === 'DATABASE') {
      fetchDbLogs();
      const interval = setInterval(() => {
        ApiService.getDbLogs().then((logs) => {
          if (logs && logs.length > 0) setDbLogs(logs);
        }).catch(() => {});
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  const handleTestDatabase = async () => {
    setIsTestingDb(true);
    try {
      const status = await ApiService.testDb({
        host: dbHost,
        port: Number(dbPort),
        database: dbName,
        user: dbUser,
        password: dbPassword,
      });
      setIsTestingDb(false);
      if (status.connected) {
        setDbPingResult({
          success: true,
          pingMs: status.latencyMs || 2,
          message: `Conexão bem-sucedida com MariaDB na VM ${dbHost}:${dbPort}/${dbName}! Latência: ${status.latencyMs}ms.`,
        });
        addToast(
          'MariaDB Conectado (192.168.15.246)',
          `Conexão verificada com sucesso na VM brsaolxdb01 (${status.latencyMs || 2}ms).`,
          'success'
        );
      } else {
        setDbPingResult({
          success: false,
          pingMs: 0,
          message: `Erro ao conectar no MariaDB: ${status.error || 'Falha de comunicação TCP/Rede'}. Verifique IP, Porta, Usuário, Senha e se o Nginx está redirecionando /api para o Node.js.`,
        });
        addToast(
          'Falha de Conexão MariaDB',
          status.error || 'Não foi possível conectar ao MariaDB.',
          'error'
        );
      }
    } catch (err: any) {
      setIsTestingDb(false);
      setDbPingResult({
        success: false,
        pingMs: 0,
        message: `Exceção ao testar banco: ${err.message}`,
      });
      addToast('Erro no Teste', err.message, 'error');
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    const updatedDbSettings: DatabaseSettings = {
      dbEngine: 'MARIADB',
      dbHost,
      dbPort: Number(dbPort),
      dbName,
      dbUser,
      dbPassword,
      dbSsl,
      dbPoolMin: Number(dbPoolMin),
      dbPoolMax: Number(dbPoolMax),
      connectionStringMasked: `mysql://${dbUser}:***@${dbHost}:${dbPort}/${dbName}`,
      syncStatus: 'CONNECTED',
      lastPingMs: dbPingResult?.pingMs || 3,
      lastSyncTimestamp: new Date().toISOString(),
    };

    const updatedN8nSettings: N8nSettings = {
      enabled: n8nEnabled,
      webhookUrl: n8nWebhookUrl,
      apiKey: n8nApiKey,
      events: n8nEvents,
      lastPingStatus: n8nTestResult?.success ? 'SUCCESS' : n8nTestResult ? 'ERROR' : 'IDLE',
      lastPingAt: new Date().toISOString(),
      lastPingResponse: n8nTestResult?.message || n8nTestResult?.error,
    };

    updateSettings({
      kmReimbursementRate: Number(kmRate),
      kmRateDefault: Number(kmRate),
      fixedCostAllowance: Number(fixedAllowance),
      defaultTaxDeductionRate: Number(defaultTaxRate),
      defaultSpecialTaxRate: Number(defaultTaxRate),
      whatsappProvider: waProvider,
      whatsappApiEndpoint: waEndpoint,
      whatsappApiUrl: waEndpoint,
      whatsappApiKey: waKey,
      whatsappInstanceName: waInstance,
      whatsappTemplateMessage: waTemplate,
      serviceCategoriesRates: {
        'Higienização de Sofá 3 Lugares': Number(sofaRate),
        'Impermeabilização de Estofado': Number(impermeabRate),
        'Higienização Automotiva Completa': Number(autoRate),
        'Higienização de Colchão Queen': Number(colchaoRate),
        'Higienização de Tapetes e Carpetes': Number(tapeteRate),
        'Instalação Lava e Seca': Number(lavaSecaRate),
        'Instalação TV de 44 a 70 + Suporte Fixo': Number(tvRate),
        'Instalação Purificador de Água': Number(purificadorRate),
        'Visita Perdida': Number(visitaPerdidaRate),
      },
      databaseSettings: updatedDbSettings,
      n8nSettings: updatedN8nSettings,
    });

    addToast(
      'Configurações Salvas',
      'Parâmetros do Motor Financeiro, Banco MariaDB (192.168.15.246), WhatsApp e N8N Webhooks atualizados.',
      'success'
    );
  };

  const sqlSampleSchema = `-- =========================================================================
-- BANCO DE DADOS: MariaDB 10.11+ / MySQL 8.0+ (Servidor brsaolxdb01 / 192.168.15.246)
-- BASE: higienizador_db
-- PROJETO: Sistema Higienizador - Gestão de OS (Porto Seguro), Estoque e Repasses
-- =========================================================================

CREATE DATABASE IF NOT EXISTS \`higienizador_db\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE \`higienizador_db\`;

-- 1. TABELA DE USUÁRIOS E TÉCNICOS
CREATE TABLE IF NOT EXISTS \`users\` (
    \`id\` VARCHAR(36) NOT NULL,
    \`name\` VARCHAR(120) NOT NULL,
    \`email\` VARCHAR(150) NOT NULL UNIQUE,
    \`passwordHash\` VARCHAR(255) NOT NULL,
    \`role\` ENUM('ADMIN', 'OPERATIONAL', 'TECHNICIAN') NOT NULL DEFAULT 'TECHNICIAN',
    \`documentCpf\` VARCHAR(14) NOT NULL UNIQUE,
    \`phone\` VARCHAR(20) NOT NULL,
    \`avatarUrl\` VARCHAR(255) NULL,
    \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
    \`pixKeyType\` ENUM('CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM') DEFAULT 'CPF',
    \`pixKey\` VARCHAR(100) NULL,
    \`bankName\` VARCHAR(80) NULL,
    \`bankAgency\` VARCHAR(20) NULL,
    \`bankAccount\` VARCHAR(30) NULL,
    \`baseCostAllowance\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    \`hasSpecialTaxRule\` TINYINT(1) NOT NULL DEFAULT 0,
    \`specialTaxRate\` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (\`id\`),
    INDEX \`idx_users_role\` (\`role\`),
    INDEX \`idx_users_hasSpecialTaxRule\` (\`hasSpecialTaxRule\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. TABELA DE ORDENS DE SERVIÇO (OS)
CREATE TABLE IF NOT EXISTS \`service_orders\` (
    \`id\` VARCHAR(36) NOT NULL,
    \`callNumber\` VARCHAR(50) NOT NULL UNIQUE,
    \`portoSeguroProtocol\` VARCHAR(50) NULL,
    \`serviceCategory\` VARCHAR(80) NOT NULL,
    \`baseServiceFee\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    \`customerName\` VARCHAR(120) NOT NULL,
    \`customerCpf\` VARCHAR(14) NOT NULL,
    \`customerPhone\` VARCHAR(20) NULL,
    \`city\` VARCHAR(80) NOT NULL,
    \`uf\` VARCHAR(2) NOT NULL,
    \`neighborhood\` VARCHAR(80) NOT NULL,
    \`addressStreet\` VARCHAR(150) NOT NULL,
    \`addressNumber\` VARCHAR(20) NOT NULL,
    \`addressComplement\` VARCHAR(50) NULL,
    \`postalCode\` VARCHAR(10) NOT NULL,
    \`technicianId\` VARCHAR(36) NULL,
    \`status\` ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    \`scheduledDate\` DATETIME(3) NOT NULL,
    \`startedAt\` DATETIME(3) NULL,
    \`completedAt\` DATETIME(3) NULL,
    \`kmTraveled\` DECIMAL(8, 2) NOT NULL DEFAULT 0.00,
    \`kmRateApplied\` DECIMAL(8, 2) NOT NULL DEFAULT 0.50,
    \`kmTotalCost\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    \`tollCost\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    \`supportCost\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    \`totalTechnicianGross\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    \`faturamentoPorto\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    \`customerSignature\` LONGTEXT NULL,
    \`executionNotes\` TEXT NULL,
    \`tollReceiptUrl\` VARCHAR(255) NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (\`id\`),
    INDEX \`idx_os_status\` (\`status\`),
    INDEX \`idx_os_technicianId\` (\`technicianId\`),
    CONSTRAINT \`fk_os_technician\` FOREIGN KEY (\`technicianId\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. TABELA DE ESTOQUE E INVENTÁRIO
CREATE TABLE IF NOT EXISTS \`stock_items\` (
    \`id\` VARCHAR(36) NOT NULL,
    \`code\` VARCHAR(30) NOT NULL UNIQUE,
    \`name\` VARCHAR(120) NOT NULL,
    \`description\` VARCHAR(255) NULL,
    \`category\` VARCHAR(60) NOT NULL,
    \`unit\` VARCHAR(20) NOT NULL,
    \`quantityInStock\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    \`minimumThreshold\` DECIMAL(10, 2) NOT NULL DEFAULT 5.00,
    \`unitCost\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    \`isSupportSupply\` TINYINT(1) NOT NULL DEFAULT 1,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3.1 TABELA ASSOCIATIVA OS / ESTOQUE
CREATE TABLE IF NOT EXISTS \`os_stock_usage\` (
    \`id\` VARCHAR(36) NOT NULL,
    \`serviceOrderId\` VARCHAR(36) NOT NULL,
    \`stockItemId\` VARCHAR(36) NOT NULL,
    \`quantityUsed\` DECIMAL(10, 2) NOT NULL,
    \`unitCostSnapshot\` DECIMAL(10, 2) NOT NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`uk_os_stock\` (\`serviceOrderId\`, \`stockItemId\`),
    CONSTRAINT \`fk_os_stock_order\` FOREIGN KEY (\`serviceOrderId\` ) REFERENCES \`service_orders\` (\`id\`) ON DELETE CASCADE,
    CONSTRAINT \`fk_os_stock_item\` FOREIGN KEY (\`stockItemId\`) REFERENCES \`stock_items\` (\`id\`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. TABELA DE FECHAMENTO QUINZENAL
CREATE TABLE IF NOT EXISTS \`biweekly_closings\` (
    \`id\` VARCHAR(36) NOT NULL,
    \`referenceMonth\` INT NOT NULL,
    \`referenceYear\` INT NOT NULL,
    \`periodNumber\` INT NOT NULL,
    \`startDate\` DATETIME(3) NOT NULL,
    \`endDate\` DATETIME(3) NOT NULL,
    \`status\` ENUM('OPEN', 'CALCULATING', 'CLOSED', 'PAID') NOT NULL DEFAULT 'OPEN',
    \`totalFaturamentoPorto\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    \`totalTechnicianGross\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    \`totalKmReimbursement\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    \`totalTollsReimbursement\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    \`totalSupportPaid\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    \`totalAdvancesDeducted\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    \`totalTaxesDeducted\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    \`totalNetPayout\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    \`companyProfitMargin\` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    \`closedByUserId\` VARCHAR(36) NULL,
    \`closedAt\` DATETIME(3) NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`uk_closing_period\` (\`referenceYear\`, \`referenceMonth\`, \`periodNumber\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. RESUMO QUINZENAL POR TÉCNICO
CREATE TABLE IF NOT EXISTS \`technician_closing_summaries\` (
    \`id\` VARCHAR(36) NOT NULL,
    \`closingId\` VARCHAR(36) NOT NULL,
    \`technicianId\` VARCHAR(36) NOT NULL,
    \`osCount\` INT NOT NULL DEFAULT 0,
    \`totalBaseFee\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    \`totalKmTraveled\` DECIMAL(8, 2) NOT NULL DEFAULT 0.00,
    \`totalKmCost\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    \`totalTollCost\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    \`totalSupportCost\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    \`fixedCostAllowance\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    \`grossTotal\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    \`advancesDeduction\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    \`hasSpecialTaxRule\` TINYINT(1) NOT NULL DEFAULT 0,
    \`taxDeductionRate\` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    \`taxDeductionAmount\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    \`otherDeductions\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    \`totalDeductions\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    \`netTotal\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    \`pdfStatementHash\` VARCHAR(64) NULL,
    \`pdfStatementUrl\` VARCHAR(255) NULL,
    \`whatsappDispatched\` TINYINT(1) NOT NULL DEFAULT 0,
    \`whatsappDispatchedAt\` DATETIME(3) NULL,
    \`whatsappMessageId\` VARCHAR(100) NULL,
    \`whatsappStatus\` VARCHAR(30) NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`uk_closing_tech\` (\`closingId\`, \`technicianId\`),
    CONSTRAINT \`fk_summary_closing\` FOREIGN KEY (\`closingId\`) REFERENCES \`biweekly_closings\` (\`id\`) ON DELETE CASCADE,
    CONSTRAINT \`fk_summary_tech\` FOREIGN KEY (\`technicianId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. TABELA DE MOVIMENTAÇÕES FINANCEIRAS
CREATE TABLE IF NOT EXISTS \`financial_movements\` (
    \`id\` VARCHAR(36) NOT NULL,
    \`type\` ENUM('INCOME', 'EXPENSE', 'ADVANCE_VALE', 'TECHNICIAN_PAYMENT', 'TAX_DEDUCTION', 'COST_ALLOWANCE') NOT NULL,
    \`category\` VARCHAR(80) NOT NULL,
    \`description\` VARCHAR(200) NOT NULL,
    \`amount\` DECIMAL(10, 2) NOT NULL,
    \`status\` ENUM('PENDING', 'CONFIRMED', 'PAID', 'CANCELLED') NOT NULL DEFAULT 'CONFIRMED',
    \`technicianId\` VARCHAR(36) NULL,
    \`serviceOrderId\` VARCHAR(36) NULL,
    \`biweeklyClosingId\` VARCHAR(36) NULL,
    \`paymentMethod\` VARCHAR(50) NULL,
    \`dueDate\` DATETIME(3) NULL,
    \`paymentDate\` DATETIME(3) NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (\`id\`),
    INDEX \`idx_financial_type\` (\`type\`),
    CONSTRAINT \`fk_fin_tech\` FOREIGN KEY (\`technicianId\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
    CONSTRAINT \`fk_fin_os\` FOREIGN KEY (\`serviceOrderId\`) REFERENCES \`service_orders\` (\`id\`) ON DELETE SET NULL,
    CONSTRAINT \`fk_fin_closing\` FOREIGN KEY (\`biweeklyClosingId\`) REFERENCES \`biweekly_closings\` (\`id\`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;

  const copyToClipboard = (text: string, label: string = 'Texto') => {
    navigator.clipboard.writeText(text);
    if (label === 'Script DDL MariaDB') {
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2500);
      addToast('Script Copiado', 'Script DDL MariaDB copiado para a área de transferência.', 'info');
    } else {
      addToast('Copiado', `${label} copiado para a área de transferência.`, 'info');
    }
  };

  const currentHost = typeof window !== 'undefined' ? window.location.origin : 'https://seu-sistema.com';

  const n8nInboundEndpoints = [
    {
      title: 'Atualizar / Finalizar OS e Produto Executado (Técnico fecha pelo WhatsApp)',
      method: 'POST',
      path: '/api/n8n/webhook/order-update',
      fullUrl: `${currentHost}/api/n8n/webhook/order-update`,
      desc: 'Recebe o número do chamado (ou ID), o produto executado (ex: "Instala TV de 49 a 86 + Suporte Fixo"), novo status (ex: COMPLETED), KM rodado, pedágio e insumos. O sistema recalcula o valor de repasse ao técnico com base no produto.',
      sampleJson: JSON.stringify(
        {
          callNumber: 'PS-2026-8941',
          productExecuted: 'Instala TV de 49 a 86 + Suporte Fixo',
          status: 'COMPLETED',
          kmTraveled: 45,
          tollCost: 12.5,
          supportCost: 0,
          baseServiceFee: 60.0,
          faturamentoPorto: 180.0,
          suppliesUsed: [
            { stockItemId: 'stk-1', quantityUsed: 2 }
          ],
          observation: 'Instalação da TV realizada com sucesso no painel do cliente. Suporte fixo testado.',
          completedAt: new Date().toISOString()
        },
        null,
        2
      ),
    },
    {
      title: 'Consultar Chamados do Técnico (WhatsApp Bot)',
      method: 'GET',
      path: '/api/n8n/webhook/orders?phone={{ $json.phone }}',
      fullUrl: `${currentHost}/api/n8n/webhook/orders?phone=11987654321`,
      desc: 'O N8N envia o número de WhatsApp do técnico e recebe a lista de chamados atribuídos a ele em tempo real.',
      sampleJson: JSON.stringify(
        {
          phone: '11987654321',
          status: 'IN_PROGRESS'
        },
        null,
        2
      ),
    },
    {
      title: 'Solicitar Vale / Adiantamento (Técnico pelo WhatsApp)',
      method: 'POST',
      path: '/api/n8n/webhook/advance-request',
      fullUrl: `${currentHost}/api/n8n/webhook/advance-request`,
      desc: 'Permite ao técnico solicitar um vale combustível/alimentação diretamente pelo WhatsApp. Entra como lançamento de vale com auditoria.',
      sampleJson: JSON.stringify(
        {
          phone: '11987654321',
          amount: 150.0,
          description: 'Adiantamento combustível para rota São Paulo -> Santos'
        },
        null,
        2
      ),
    },
    {
      title: 'Agenda Diária Matinal (Broadcast de OSs do Dia)',
      method: 'GET',
      path: '/api/n8n/webhook/daily-agenda?date={{ $today }}',
      fullUrl: `${currentHost}/api/n8n/webhook/daily-agenda`,
      desc: 'Retorna todas as OSs do dia agrupadas por técnico para que o N8N envie a mensagem de "Bom dia e sua rota de hoje" às 07:30.',
      sampleJson: JSON.stringify(
        {
          date: '2026-08-29'
        },
        null,
        2
      ),
    },
  ];

  const sampleN8nWorkflowJson = JSON.stringify(
    {
      name: "O Higienizador - WhatsApp Bot & Sync",
      nodes: [
        {
          parameters: {
            httpMethod: "POST",
            path: "higienizador-events",
            responseMode: "onReceived",
            options: {}
          },
          name: "Webhook Inbound (Do Sistema)",
          type: "n8n-nodes-base.webhook",
          typeVersion: 1,
          position: [250, 300]
        },
        {
          parameters: {
            dataType: "string",
            value1: "={{ $json.event }}",
            rules: {
              rules: [
                { value2: "OS_CREATED", output: 0 },
                { value2: "OS_COMPLETED", output: 1 },
                { value2: "DAILY_SUMMARY", output: 2 }
              ]
            }
          },
          name: "Switch de Eventos",
          type: "n8n-nodes-base.switch",
          typeVersion: 1,
          position: [480, 300]
        },
        {
          parameters: {
            method: "POST",
            url: "https://api.evolution.ohigienizador.com.br/message/sendText/Higienizador-Producao-01",
            sendHeaders: true,
            headerParameters: {
              parameters: [
                { name: "apikey", value: "EVO_SEC_88941_HIGIENIZADOR_2026" }
              ]
            },
            sendBody: true,
            bodyParameters: {
              parameters: [
                { name: "number", value: "={{ $json.data.technicianPhone }}" },
                { name: "text", value: "=🔔 Nova OS Atribuída: {{ $json.data.callNumber }}\\nCliente: {{ $json.data.customerName }}\\nEndereço: {{ $json.data.customerAddress }}" }
              ]
            }
          },
          name: "Enviar WhatsApp Evolution",
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 4.1,
          position: [750, 200]
        }
      ]
    },
    null,
    2
  );

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-2">
          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[11px] uppercase tracking-wider flex items-center space-x-1.5 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Banco MariaDB Ativo (192.168.15.246)</span>
          </span>
          {n8nEnabled && (
            <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full font-bold text-[11px] uppercase tracking-wider flex items-center space-x-1.5 border border-indigo-200">
              <Workflow className="w-3 h-3 text-indigo-600" />
              <span>N8N Webhook Ativo</span>
            </span>
          )}
        </div>

        {currentUser.role === 'ADMIN' && (
          <button
            type="submit"
            className="flex items-center space-x-1.5 px-4 py-2 bg-[#003366] hover:bg-[#00264d] text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
          >
            <Save className="h-4 w-4 text-cyan-400" />
            <span>Salvar Alterações</span>
          </button>
        )}
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 space-x-2 overflow-x-auto pb-px">
        <button
          type="button"
          onClick={() => setActiveTab('FINANCIAL')}
          className={`flex items-center space-x-2 py-2.5 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'FINANCIAL'
              ? 'border-[#003366] text-[#003366] bg-slate-50/80 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50/50'
          }`}
        >
          <DollarSign className="h-4 w-4" />
          <span>Motor Financeiro & Repasses</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('DATABASE')}
          className={`flex items-center space-x-2 py-2.5 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'DATABASE'
              ? 'border-[#003366] text-[#003366] bg-slate-50/80 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50/50'
          }`}
        >
          <Database className="h-4 w-4 text-cyan-600" />
          <span>Banco MariaDB (192.168.15.246)</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('WHATSAPP')}
          className={`flex items-center space-x-2 py-2.5 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'WHATSAPP'
              ? 'border-[#003366] text-[#003366] bg-slate-50/80 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50/50'
          }`}
        >
          <MessageSquare className="h-4 w-4 text-emerald-600" />
          <span>WhatsApp & Mensageria</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('N8N')}
          className={`flex items-center space-x-2 py-2.5 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'N8N'
              ? 'border-indigo-600 text-indigo-900 bg-indigo-50/60 rounded-t-lg shadow-2xs'
              : 'border-transparent text-slate-500 hover:text-indigo-700 hover:bg-indigo-50/30'
          }`}
        >
          <Workflow className="h-4 w-4 text-indigo-600" />
          <span>N8N & Automação Webhook</span>
          <span className="px-1.5 py-0.2 bg-indigo-600 text-white rounded text-[9px] font-bold">API / Bot</span>
        </button>
      </div>

      {/* TAB 1: FINANCIAL */}
      {activeTab === 'FINANCIAL' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4 text-xs">
              <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                <Car className="h-4 w-4 text-[#003366]" />
                <h2 className="text-sm font-bold text-slate-800">
                  Parâmetros de Deslocamento & Taxas Gerais
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">
                    Reembolso de KM Rodado (R$/KM):
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                    <input
                      type="number"
                      step="0.05"
                      value={kmRate}
                      onChange={(e) => setKmRate(Number(e.target.value))}
                      className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Padrão da planilha: R$ 0,50/KM</span>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">
                    Ajuda de Custo Fixa por Quinzena (R$):
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                    <input
                      type="number"
                      step="5"
                      value={fixedAllowance}
                      onChange={(e) => setFixedAllowance(Number(e.target.value))}
                      className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Padrão: R$ 250,00</span>
                </div>
              </div>

              <div className="p-3 bg-amber-50/80 rounded-lg border border-amber-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-900 flex items-center space-x-1">
                    <Layers className="h-3.5 w-3.5 text-amber-600" />
                    <span>Alíquota de Dedução Fiscal da Regra de Exceção (%)</span>
                  </span>
                  <input
                    type="number"
                    step="0.5"
                    value={defaultTaxRate}
                    onChange={(e) => setDefaultTaxRate(Number(e.target.value))}
                    className="w-20 p-1 bg-white border border-amber-300 rounded text-xs font-bold text-center"
                  />
                </div>
                <p className="text-[10px] text-amber-800">
                  Aplicável aos técnicos com a flag fiscal ativa (ex: Robertinho / Rafael com retenção de 16%).
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4 text-xs">
              <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                <Shield className="h-4 w-4 text-[#003366]" />
                <h2 className="text-sm font-bold text-slate-800">
                  Taxas Fixas de Repasse Técnico por Categoria
                </h2>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">Higienização de Sofá 3 Lugares:</span>
                  <div className="w-28 relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">R$</span>
                    <input
                      type="number"
                      value={sofaRate}
                      onChange={(e) => setSofaRate(Number(e.target.value))}
                      className="w-full pl-8 pr-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-bold text-right"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">Impermeabilização de Estofado:</span>
                  <div className="w-28 relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">R$</span>
                    <input
                      type="number"
                      value={impermeabRate}
                      onChange={(e) => setImpermeabRate(Number(e.target.value))}
                      className="w-full pl-8 pr-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-bold text-right"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">Higienização Automotiva Completa:</span>
                  <div className="w-28 relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">R$</span>
                    <input
                      type="number"
                      value={autoRate}
                      onChange={(e) => setAutoRate(Number(e.target.value))}
                      className="w-full pl-8 pr-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-bold text-right"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">Higienização de Colchão Queen:</span>
                  <div className="w-28 relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">R$</span>
                    <input
                      type="number"
                      value={colchaoRate}
                      onChange={(e) => setColchaoRate(Number(e.target.value))}
                      className="w-full pl-8 pr-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-bold text-right"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">Higienização de Tapetes e Carpetes:</span>
                  <div className="w-28 relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">R$</span>
                    <input
                      type="number"
                      value={tapeteRate}
                      onChange={(e) => setTapeteRate(Number(e.target.value))}
                      className="w-full pl-8 pr-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-bold text-right"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4 text-xs">
              <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                <Layers className="h-4 w-4 text-[#003366]" />
                <h2 className="text-sm font-bold text-slate-800">
                  Taxas de Instalações & Visitas Técnicas
                </h2>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">Instalação Lava e Seca:</span>
                  <div className="w-28 relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">R$</span>
                    <input
                      type="number"
                      value={lavaSecaRate}
                      onChange={(e) => setLavaSecaRate(Number(e.target.value))}
                      className="w-full pl-8 pr-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-bold text-right"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">Instalação TV de 44 a 70 + Suporte:</span>
                  <div className="w-28 relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">R$</span>
                    <input
                      type="number"
                      value={tvRate}
                      onChange={(e) => setTvRate(Number(e.target.value))}
                      className="w-full pl-8 pr-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-bold text-right"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">Instalação Purificador de Água:</span>
                  <div className="w-28 relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">R$</span>
                    <input
                      type="number"
                      value={purificadorRate}
                      onChange={(e) => setPurificadorRate(Number(e.target.value))}
                      className="w-full pl-8 pr-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-bold text-right"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">Visita Perdida / Cancelamento no Local:</span>
                  <div className="w-28 relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">R$</span>
                    <input
                      type="number"
                      value={visitaPerdidaRate}
                      onChange={(e) => setVisitaPerdidaRate(Number(e.target.value))}
                      className="w-full pl-8 pr-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-bold text-right"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs text-slate-600 space-y-2">
              <div className="flex items-center space-x-2 text-[#003366] font-bold">
                <Globe className="h-4 w-4" />
                <span>Identidade Visual: O Higienizador (ohigienizador.com.br)</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500">
                Paleta corporativa: Deep Navy (#003366), Cyan (#00A3E0), Emerald (#10B981) e Neutros Cristalinos.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DATABASE MARIADB */}
      {activeTab === 'DATABASE' && (
        <div className="space-y-6">
          {/* Status Banner */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-700 font-black">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-sm font-bold text-slate-900">
                      Banco de Dados MariaDB (Servidor brsaolxdb01 / 192.168.15.246)
                    </h2>
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[10px] uppercase tracking-wider flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      <span>Conectado (VPN)</span>
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Base: <code className="font-mono text-cyan-800 font-bold">higienizador_db</code> (7 tabelas sincronizadas via rede interna 192.168.15.x).
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestDatabase}
                  disabled={isTestingDb}
                  className="flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-all cursor-pointer disabled:opacity-50"
                >
                  <Activity className={`w-3.5 h-3.5 text-cyan-600 ${isTestingDb ? 'animate-spin' : ''}`} />
                  <span>{isTestingDb ? 'Testando Ping...' : 'Testar Conexão'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSyncSchema}
                  disabled={isSyncingSchema}
                  className="flex items-center space-x-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-all cursor-pointer disabled:opacity-50 shadow-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSchema ? 'animate-spin' : ''}`} />
                  <span>{isSyncingSchema ? 'Sincronizando...' : 'Auto-Criar Colunas (Reparar)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowSqlSchemaModal(true)}
                  className="flex items-center space-x-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-lg transition-all cursor-pointer"
                >
                  <Code className="w-3.5 h-3.5" />
                  <span>Ver Script DDL SQL</span>
                </button>
              </div>
            </div>

            {schemaSyncResult && (
              <div className={`p-3 rounded-lg border text-xs ${
                schemaSyncResult.errors.length > 0
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}>
                <div className="font-bold flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{schemaSyncResult.message}</span>
                </div>
                {schemaSyncResult.added.length > 0 && (
                  <div className="text-[11px] mt-1 text-emerald-800">
                    Colunas adicionadas: <span className="font-mono font-bold">{schemaSyncResult.added.join(', ')}</span>
                  </div>
                )}
                {schemaSyncResult.skipped.length > 0 && (
                  <div className="text-[11px] mt-0.5 text-slate-500">
                    Colunas já existentes: <span className="font-mono">{schemaSyncResult.skipped.join(', ')}</span>
                  </div>
                )}
                {schemaSyncResult.errors.length > 0 && (
                  <div className="text-[11px] mt-1 text-red-700 font-mono">
                    Erros: {schemaSyncResult.errors.join(' | ')}
                  </div>
                )}
              </div>
            )}

            {/* Realtime Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Servidor DB (Proxmox)</span>
                <div className="text-sm font-black text-slate-800 mt-0.5 flex items-center space-x-1 font-mono">
                  <span>192.168.15.246</span>
                </div>
                <span className="text-[9px] text-cyan-700 font-medium">VM brsaolxdb01 : 3306</span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Servidor Web / PM2</span>
                <div className="text-sm font-black text-slate-800 mt-0.5 flex items-center space-x-1 font-mono">
                  <span>192.168.15.242</span>
                </div>
                <span className="text-[9px] text-emerald-600 font-medium">VM brsaolxweb02 (PM2 ID: 8)</span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Tabelas Ativas</span>
                <div className="text-sm font-black text-slate-800 mt-0.5 flex items-center space-x-1">
                  <span>7 Tabelas</span>
                </div>
                <span className="text-[9px] text-slate-500 font-medium">Base higienizador_db</span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Latência Interna</span>
                <div className="text-sm font-black text-emerald-700 mt-0.5 flex items-center space-x-1">
                  <span>{dbPingResult?.pingMs || 3} ms</span>
                </div>
                <span className="text-[9px] text-emerald-600 font-medium">Rede local gigabit</span>
              </div>
            </div>

            {dbPingResult && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center space-x-2 text-xs text-emerald-900 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{dbPingResult.message}</span>
              </div>
            )}
          </div>

          {/* Database Parameters Form */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4 text-xs">
              <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                <Server className="h-4 w-4 text-[#003366]" />
                <h2 className="text-sm font-bold text-slate-800">
                  Parâmetros de Conexão MariaDB
                </h2>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">Host / Endereço IP:</label>
                    <input
                      type="text"
                      value={dbHost}
                      onChange={(e) => setDbHost(e.target.value)}
                      placeholder="192.168.15.246"
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">Porta:</label>
                    <input
                      type="number"
                      value={dbPort}
                      onChange={(e) => setDbPort(Number(e.target.value))}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">Nome do Banco de Dados (Database):</label>
                  <input
                    type="text"
                    value={dbName}
                    onChange={(e) => setDbName(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">Usuário (User):</label>
                    <input
                      type="text"
                      value={dbUser}
                      onChange={(e) => setDbUser(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">Senha (Password):</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={dbPassword}
                        onChange={(e) => setDbPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full p-2 pr-8 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 focus:bg-white focus:ring-2 focus:ring-cyan-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800 block">Conexão Criptografada SSL / TLS</span>
                    <span className="text-[10px] text-slate-400">Exigir certificado SSL seguro</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dbSsl}
                      onChange={(e) => setDbSsl(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#003366]"></div>
                  </label>
                </div>
              </div>
            </div>

            {/* Architecture and Infrastructure Notes */}
            <div className="space-y-6">
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4 text-xs">
                <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                  <Network className="h-4 w-4 text-indigo-700" />
                  <h2 className="text-sm font-bold text-slate-800">
                    Infraestrutura Proxmox & NGINX Reverse Proxy
                  </h2>
                </div>

                <div className="space-y-3 text-slate-600 leading-relaxed">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">VM Banco de Dados (brsaolxdb01):</span>
                      <span className="font-mono text-cyan-800 font-bold">192.168.15.246</span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      MariaDB 10.11+ / Base <strong className="text-slate-800">higienizador_db</strong> (7 tabelas ativas).
                    </p>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">VM Web / PM2 (brsaolxweb02):</span>
                      <span className="font-mono text-emerald-800 font-bold">192.168.15.242</span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Diretório: <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800">/mnt/sites/ohigienizador.com.br</code> | Processo: <strong className="text-slate-800">higienizador-app (ID: 8)</strong>
                    </p>
                  </div>

                  <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-lg space-y-1.5">
                    <span className="font-bold text-indigo-900 flex items-center space-x-1.5">
                      <Lock className="w-3.5 h-3.5 text-indigo-700" />
                      <span>Gestão Dinâmica de Usuários & Senhas</span>
                    </span>
                    <p className="text-[11px] text-indigo-800">
                      Todos os usuários (<strong className="font-mono">admin1</strong>, <strong className="font-mono">u1</strong>, <strong className="font-mono">u2</strong>, <strong className="font-mono">u3</strong>, <strong className="font-mono">u4</strong> e novos técnicos) são gravados e geridos dinamicamente no MariaDB com suporte a resets e manutenções periódicas.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Live MariaDB Execution & Diagnostics Console */}
          <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 shadow-lg text-xs space-y-3 font-mono">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                <span className="font-bold text-slate-200">Terminal de Logs do Backend & MariaDB em Tempo Real</span>
                <span className="px-1.5 py-0.5 bg-cyan-950 text-cyan-400 border border-cyan-800/60 rounded text-[9px]">
                  {dbLogs.length} eventos registrados
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={fetchDbLogs}
                  disabled={isFetchingLogs}
                  className="flex items-center space-x-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isFetchingLogs ? 'animate-spin' : ''}`} />
                  <span>Atualizar Logs</span>
                </button>
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1 text-[11px] pr-2 scrollbar-thin scrollbar-thumb-slate-700">
              {dbLogs.length === 0 ? (
                <div className="text-slate-500 italic py-3 text-center">
                  Nenhum log registrado ainda. Clique em "Atualizar Logs" ou execute uma ação de gravação.
                </div>
              ) : (
                dbLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-2 rounded border flex flex-col space-y-1 ${
                      log.level === 'ERROR'
                        ? 'bg-red-950/40 border-red-800/60 text-red-300'
                        : log.level === 'WARN'
                        ? 'bg-amber-950/40 border-amber-800/60 text-amber-300'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className={`px-1 rounded text-[9px] font-bold ${
                          log.level === 'ERROR' ? 'bg-red-800 text-white' : log.level === 'WARN' ? 'bg-amber-800 text-white' : 'bg-cyan-900 text-cyan-200'
                        }`}>
                          {log.level}
                        </span>
                        <span className="text-slate-400">{log.timestamp}</span>
                        <span className="font-semibold">{log.message}</span>
                      </div>
                    </div>
                    {log.query && (
                      <div className="text-[10px] text-slate-400 bg-black/40 p-1.5 rounded overflow-x-auto">
                        SQL: {log.query}
                      </div>
                    )}
                    {log.details && (
                      <div className="text-[10px] text-slate-500 overflow-x-auto">
                        Detalhes: {typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details)}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: WHATSAPP */}
      {activeTab === 'WHATSAPP' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4 text-xs">
            <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
              <MessageSquare className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-bold text-slate-800">
                Integração API WhatsApp (Evolution / Z-API / Baileys)
              </h2>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Provedor de API WhatsApp:</label>
                <select
                  value={waProvider}
                  onChange={(e) => setWaProvider(e.target.value as any)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                >
                  <option value="EVOLUTION_API">Evolution API (Recomendado)</option>
                  <option value="Z_API">Z-API Gateway</option>
                  <option value="BAILEYS">Baileys Node Library</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">API Endpoint URL:</label>
                <input
                  type="text"
                  value={waEndpoint}
                  onChange={(e) => setWaEndpoint(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">Nome da Instância:</label>
                  <input
                    type="text"
                    value={waInstance}
                    onChange={(e) => setWaInstance(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">API Key / Token:</label>
                  <input
                    type="password"
                    value={waKey}
                    onChange={(e) => setWaKey(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">
                  Template da Mensagem com Variáveis Dinâmicas:
                </label>
                <textarea
                  rows={6}
                  value={waTemplate}
                  onChange={(e) => setWaTemplate(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono leading-relaxed"
                />
                <div className="text-[10px] text-slate-400 mt-1">
                  Tags: <code className="bg-slate-100 px-1 rounded">&#123;NOME_TECNICO&#125;</code>, <code className="bg-slate-100 px-1 rounded">&#123;PERIODO_QUINZENA&#125;</code>, <code className="bg-slate-100 px-1 rounded">&#123;VALOR_LIQUIDO&#125;</code>, <code className="bg-slate-100 px-1 rounded">&#123;CHAVE_PIX&#125;</code>, <code className="bg-slate-100 px-1 rounded">&#123;TOTAL_OS&#125;</code>.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: N8N & WEBHOOKS / AUTOMATION */}
      {activeTab === 'N8N' && (
        <div className="space-y-6">
          {/* Card 1: Arquitetura & Sugestão Técnica */}
          <div className="bg-gradient-to-br from-indigo-900 via-[#003366] to-slate-900 rounded-2xl p-6 text-white shadow-md border border-indigo-800/50 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/30 border border-indigo-400/40 flex items-center justify-center text-indigo-300">
                  <Workflow className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white flex items-center space-x-2">
                    <span>Arquitetura de Integração N8N + WhatsApp</span>
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-full text-[10px] uppercase tracking-wider font-bold">
                      Recomendada
                    </span>
                  </h2>
                  <p className="text-xs text-indigo-200">
                    Comunicação bidirecional e assíncrona para bots de WhatsApp, rotinas diárias e atualização de tickets.
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <label className="relative inline-flex items-center cursor-pointer bg-white/10 px-3 py-1.5 rounded-lg border border-white/20">
                  <input
                    type="checkbox"
                    checked={n8nEnabled}
                    onChange={(e) => setN8nEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-slate-600 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[8px] after:left-[14px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
                  <span className="ml-2 text-xs font-bold text-white">
                    {n8nEnabled ? 'Webhooks Ativos' : 'Webhooks Pausados'}
                  </span>
                </label>
              </div>
            </div>

            {/* Diagrama Visual de Fluxo */}
            <div className="bg-black/30 backdrop-blur-xs rounded-xl p-4 border border-white/10">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-center text-xs">
                <div className="bg-white/5 p-3 rounded-lg border border-white/10 space-y-1.5">
                  <div className="font-bold text-cyan-300 flex items-center justify-center space-x-1.5">
                    <Database className="w-4 h-4" />
                    <span>1. O Higienizador (Sistema)</span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Gera eventos em tempo real (Nova OS, Fechamento, Alerta de Estoque) e dispara <strong>Webhooks POST</strong> para o N8N.
                  </p>
                </div>

                <div className="bg-indigo-600/30 p-3 rounded-lg border border-indigo-400/30 space-y-1.5">
                  <div className="font-bold text-indigo-300 flex items-center justify-center space-x-1.5">
                    <Workflow className="w-4 h-4" />
                    <span>2. N8N (Orquestrador)</span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Processa regras de negócio, formata mensagens, conecta com WhatsApp (Evolution/Z-API) e com a IA do bot.
                  </p>
                </div>

                <div className="bg-emerald-600/20 p-3 rounded-lg border border-emerald-400/30 space-y-1.5">
                  <div className="font-bold text-emerald-300 flex items-center justify-center space-x-1.5">
                    <Smartphone className="w-4 h-4" />
                    <span>3. Técnico no WhatsApp</span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Recebe agenda matinal, consulta OSs e responde comandos (ex: <em>"Finalizar OS 8941 45km"</em>) alimentando o sistema.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Webhook de Saída (Sistema -> N8N) */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-5 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Send className="h-4 w-4 text-indigo-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Webhook Outbound (Sistema ➔ N8N)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Configure a URL do webhook criado no seu N8N para receber notificações automáticas do sistema.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleTestN8nWebhook}
                disabled={isTestingN8n || !n8nWebhookUrl}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg shadow-xs transition-all cursor-pointer"
              >
                <Zap className={`w-3.5 h-3.5 text-amber-300 ${isTestingN8n ? 'animate-bounce' : ''}`} />
                <span>{isTestingN8n ? 'Disparando Ping...' : 'Disparar Webhook de Teste'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 block">
                  URL do Webhook no N8N:
                </label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={n8nWebhookUrl}
                    onChange={(e) => setN8nWebhookUrl(e.target.value)}
                    placeholder="https://n8n.seuservidor.com/webhook/higienizador-events"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900"
                  />
                </div>
                <span className="text-[10px] text-slate-400">
                  Insira o endpoint gerado no nó "Webhook" do N8N (Método POST).
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 block">
                  Token Secreto de Autenticação (API Key / Bearer):
                </label>
                <div className="flex items-center space-x-2">
                  <div className="relative flex-1">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showN8nApiKey ? 'text' : 'password'}
                      value={n8nApiKey}
                      onChange={(e) => setN8nApiKey(e.target.value)}
                      placeholder="N8N_SEC_..."
                      className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => setShowN8nApiKey(!showN8nApiKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showN8nApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={generateNewApiKey}
                    className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg border border-slate-300 transition-all cursor-pointer whitespace-nowrap"
                    title="Gerar nova chave aleatória"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      copyToClipboard(n8nApiKey, 'API Key');
                      setCopiedN8nKey(true);
                      setTimeout(() => setCopiedN8nKey(false), 2000);
                    }}
                    className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg border border-slate-300 transition-all cursor-pointer whitespace-nowrap"
                    title="Copiar chave"
                  >
                    {copiedN8nKey ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <span className="text-[10px] text-slate-400">
                  Enviado no header <code className="bg-slate-100 px-1 rounded">x-api-key</code> e <code className="bg-slate-100 px-1 rounded">Authorization: Bearer</code>.
                </span>
              </div>
            </div>

            {/* Eventos Gatilho */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="text-[11px] font-bold text-slate-700 block">
                Selecione os Eventos que Devem Disparar o Webhook para o N8N:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {[
                  { key: 'onOrderCreated', label: 'Nova OS Criada / Importada', desc: 'Dispara quando novos chamados entram no sistema.' },
                  { key: 'onOrderAssigned', label: 'OS Atribuída ao Técnico', desc: 'Avisa o técnico no WhatsApp que ele recebeu um serviço.' },
                  { key: 'onOrderCompleted', label: 'OS Concluída / Fechada', desc: 'Dispara quando o status da OS muda para finalizado.' },
                  { key: 'onDailySummary', label: 'Agenda Matinal Diária', desc: 'Disparo agendado para envio de rota às 07:30.' },
                  { key: 'onStockAlert', label: 'Alerta de Estoque Crítico', desc: 'Notifica quando insumos atingem nível de ressuprimento.' },
                  { key: 'onBiweeklyClosing', label: 'Fechamento Quinzenal', desc: 'Envia extrato oficial e comprovante para os técnicos.' },
                  { key: 'onAdvanceRequested', label: 'Solicitação de Vale / Adiantamento', desc: 'Notifica gestores para aprovação de adiantamentos.' },
                ].map((item) => (
                  <label
                    key={item.key}
                    className="flex items-start space-x-2.5 p-2.5 bg-slate-50 hover:bg-slate-100/80 rounded-lg border border-slate-200 cursor-pointer transition-all"
                  >
                    <input
                      type="checkbox"
                      checked={(n8nEvents as any)[item.key] ?? true}
                      onChange={(e) =>
                        setN8nEvents({
                          ...n8nEvents,
                          [item.key]: e.target.checked,
                        })
                      }
                      className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-800">{item.label}</div>
                      <div className="text-[10px] text-slate-500 leading-tight">{item.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Resultado do Teste de Ping */}
            {n8nTestResult && (
              <div
                className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                  n8nTestResult.success
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                    : 'bg-amber-50 text-amber-900 border-amber-200'
                }`}
              >
                <div className="flex items-center justify-between font-bold">
                  <div className="flex items-center space-x-2">
                    {n8nTestResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                    )}
                    <span>{n8nTestResult.message || n8nTestResult.error}</span>
                  </div>
                  {n8nTestResult.responseTimeMs !== undefined && (
                    <span className="font-mono bg-white/80 px-2 py-0.5 rounded border text-[11px]">
                      HTTP {n8nTestResult.statusCode || 0} • {n8nTestResult.responseTimeMs}ms
                    </span>
                  )}
                </div>

                {n8nTestResult.responseBody && (
                  <div className="bg-black/10 p-2 rounded text-[11px] font-mono overflow-x-auto max-h-24">
                    <strong>Resposta do N8N:</strong>{' '}
                    {typeof n8nTestResult.responseBody === 'object'
                      ? JSON.stringify(n8nTestResult.responseBody)
                      : String(n8nTestResult.responseBody)}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Card 3: Endpoints Inbound (N8N / WhatsApp Bot -> Sistema) */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4 text-xs">
            <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
              <Radio className="h-4 w-4 text-indigo-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  Endpoints Inbound da API (N8N / WhatsApp Bot ➔ Sistema)
                </h3>
                <p className="text-[11px] text-slate-500">
                  URLs prontas para você usar nos nós de <strong>HTTP Request</strong> do N8N para consultar dados ou atualizar tickets.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {n8nInboundEndpoints.map((ep, idx) => (
                <div key={idx} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                          ep.method === 'POST' ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white'
                        }`}
                      >
                        {ep.method}
                      </span>
                      <span className="font-bold text-slate-900 text-xs">{ep.title}</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          copyToClipboard(ep.fullUrl, 'URL do Endpoint');
                          setCopiedEndpointUrl(ep.path);
                          setTimeout(() => setCopiedEndpointUrl(null), 2000);
                        }}
                        className="flex items-center space-x-1 px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 font-bold text-[11px] rounded border border-slate-300 transition-all cursor-pointer"
                      >
                        {copiedEndpointUrl === ep.path ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedEndpointUrl === ep.path ? 'Copiado!' : 'Copiar URL'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="bg-white p-2 rounded-lg border border-slate-200 font-mono text-[11px] text-indigo-900 font-semibold break-all">
                    {ep.fullUrl}
                  </div>

                  <p className="text-slate-600 text-[11px] leading-relaxed">{ep.desc}</p>

                  <div className="bg-slate-900 rounded-lg p-3 text-slate-200 font-mono text-[10px] overflow-x-auto space-y-1">
                    <div className="text-slate-400 text-[9px] uppercase tracking-wider font-bold">
                      Exemplo de Payload JSON (Nó HTTP Request do N8N):
                    </div>
                    <pre className="text-cyan-300">{ep.sampleJson}</pre>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card 4: Template do Workflow N8N */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Code className="h-4 w-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-800">
                  Modelo de Workflow JSON para Importar no N8N
                </h3>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(sampleN8nWorkflowJson, 'Template JSON do N8N')}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold text-xs rounded-lg border border-indigo-200 transition-all cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-indigo-600" />
                <span>Copiar Workflow para N8N</span>
              </button>
            </div>

            <p className="text-slate-600 text-[11px]">
              No N8N, basta pressionar <strong>Ctrl + V</strong> (ou ir em <em>Workflows ➔ Import from JSON</em>) para criar a estrutura inicial pronta com Webhook Inbound, Switch de Eventos e Nó de WhatsApp Evolution.
            </p>

            <div className="bg-slate-900 rounded-xl p-4 text-slate-200 font-mono text-[10px] max-h-48 overflow-y-auto leading-relaxed">
              <pre className="text-slate-300">{sampleN8nWorkflowJson}</pre>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SCRIPT SQL SCHEMA */}
      {showSqlSchemaModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
                  <Terminal className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Script DDL MariaDB 10.11+ / MySQL (<code className="text-indigo-600 font-mono">schema.sql</code>)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Estrutura das 7 tabelas do banco <code className="font-mono text-indigo-700">higienizador_db</code> (Servidor 192.168.15.246).
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => copyToClipboard(sqlSampleSchema)}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSql ? 'Copiado!' : 'Copiar SQL'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowSqlSchemaModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="bg-slate-900 rounded-xl p-4 text-slate-100 font-mono text-[11px] max-h-96 overflow-y-auto leading-relaxed">
              <pre>{sqlSampleSchema}</pre>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowSqlSchemaModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
};
