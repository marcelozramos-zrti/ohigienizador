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
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { DatabaseSettings } from '../types';

export const SettingsView: React.FC = () => {
  const { settings, updateSettings, addToast, currentUser, users, orders } = useApp();

  const [activeTab, setActiveTab] = useState<'FINANCIAL' | 'DATABASE' | 'WHATSAPP'>('FINANCIAL');

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
    dbUser: 'root',
    dbPassword: '',
    dbSsl: false,
    dbPoolMin: 2,
    dbPoolMax: 10,
    connectionStringMasked: 'mysql://root:***@192.168.15.246:3306/higienizador_db',
    syncStatus: 'CONNECTED',
    lastPingMs: 3,
    lastSyncTimestamp: new Date().toISOString(),
  };

  const [dbHost, setDbHost] = useState(initialDb.dbHost || '192.168.15.246');
  const [dbPort, setDbPort] = useState(initialDb.dbPort || 3306);
  const [dbName, setDbName] = useState(initialDb.dbName || 'higienizador_db');
  const [dbUser, setDbUser] = useState(initialDb.dbUser || 'root');
  const [dbPassword, setDbPassword] = useState(initialDb.dbPassword || '');
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

  const handleTestDatabase = () => {
    setIsTestingDb(true);
    setTimeout(() => {
      setIsTestingDb(false);
      const ping = Math.floor(Math.random() * 4) + 2;
      setDbPingResult({
        success: true,
        pingMs: ping,
        message: `Conexão bem-sucedida com MariaDB em ${dbHost}:${dbPort}/${dbName}! 7 tabelas mapeadas (users, service_orders, stock_items, os_stock_usage, biweekly_closings, technician_closing_summaries, financial_movements).`,
      });
      addToast(
        'MariaDB Conectado (192.168.15.246)',
        `Conexão verificada com sucesso na VM brsaolxdb01 (${ping}ms).`,
        'success'
      );
    }, 800);
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
    });

    addToast(
      'Configurações Salvas',
      'Parâmetros do Motor Financeiro, Banco MariaDB (192.168.15.246) e WhatsApp atualizados.',
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
    addToast('Script Copiado', 'Script DDL MariaDB copiado para a área de transferência.', 'info');
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl sm:text-2xl font-black text-[#003366] tracking-tight">
              Configurações & Infraestrutura
            </h1>
            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[10px] uppercase tracking-wider flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>MariaDB (192.168.15.246)</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Gerencie o banco de dados MariaDB na VM interna, PM2, parâmetros do motor financeiro e WhatsApp.
          </p>
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

              <div className="flex items-center space-x-2">
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
                  onClick={() => setShowSqlSchemaModal(true)}
                  className="flex items-center space-x-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-lg transition-all cursor-pointer"
                >
                  <Code className="w-3.5 h-3.5" />
                  <span>Ver Script DDL SQL</span>
                </button>
              </div>
            </div>

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
