-- =========================================================================
-- BANCO DE DADOS: MariaDB 10.11+ / MySQL 8.0+ (Servidor brsaolxdb01 / 192.168.15.246)
-- BASE: higienizador_db
-- PROJETO: Sistema Higienizador - Gestão de OS (Porto Seguro), Estoque e Repasses
-- =========================================================================

CREATE DATABASE IF NOT EXISTS `higienizador_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `higienizador_db`;

-- 1. TABELA DE USUÁRIOS E TÉCNICOS
CREATE TABLE IF NOT EXISTS `users` (
    `id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(150) NOT NULL UNIQUE,
    `passwordHash` VARCHAR(255) NOT NULL,
    `role` ENUM('ADMIN', 'OPERATIONAL', 'TECHNICIAN') NOT NULL DEFAULT 'TECHNICIAN',
    `documentCpf` VARCHAR(14) NOT NULL UNIQUE,
    `phone` VARCHAR(20) NOT NULL,
    `avatarUrl` VARCHAR(255) NULL,
    `isActive` TINYINT(1) NOT NULL DEFAULT 1,
    `pixKeyType` ENUM('CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM') DEFAULT 'CPF',
    `pixKey` VARCHAR(100) NULL,
    `bankName` VARCHAR(80) NULL,
    `bankAgency` VARCHAR(20) NULL,
    `bankAccount` VARCHAR(30) NULL,
    `baseCostAllowance` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    -- REGRA DE EXCEÇÃO: Flag para os 2 técnicos com retenção de impostos independente
    `hasSpecialTaxRule` TINYINT(1) NOT NULL DEFAULT 0,
    `specialTaxRate` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    INDEX `idx_users_role` (`role`),
    INDEX `idx_users_hasSpecialTaxRule` (`hasSpecialTaxRule`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. TABELA DE ORDENS DE SERVIÇO (OS)
CREATE TABLE IF NOT EXISTS `service_orders` (
    `id` VARCHAR(80) NOT NULL,
    `callNumber` VARCHAR(50) NOT NULL,
    `portoSeguroProtocol` VARCHAR(50) NULL,
    `serviceCategory` VARCHAR(80) NOT NULL,
    `baseServiceFee` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `customerName` VARCHAR(120) NOT NULL,
    `customerCpf` VARCHAR(14) NOT NULL,
    `customerPhone` VARCHAR(20) NULL,
    `city` VARCHAR(80) NOT NULL,
    `uf` VARCHAR(2) NOT NULL,
    `neighborhood` VARCHAR(80) NOT NULL,
    `addressStreet` VARCHAR(150) NOT NULL,
    `addressNumber` VARCHAR(20) NOT NULL,
    `addressComplement` VARCHAR(50) NULL,
    `postalCode` VARCHAR(10) NOT NULL,
    `technicianId` VARCHAR(36) NULL,
    `status` ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `scheduledDate` DATETIME(3) NOT NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `kmTraveled` DECIMAL(8, 2) NOT NULL DEFAULT 0.00,
    `kmRateApplied` DECIMAL(8, 2) NOT NULL DEFAULT 1.20,
    `kmTotalCost` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `tollCost` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `supportCost` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `totalTechnicianGross` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `faturamentoPorto` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `customerSignature` LONGTEXT NULL,
    `executionNotes` TEXT NULL,
    `tollReceiptUrl` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    INDEX `idx_os_status` (`status`),
    INDEX `idx_os_technicianId` (`technicianId`),
    INDEX `idx_os_scheduledDate` (`scheduledDate`),
    CONSTRAINT `fk_os_technician` FOREIGN KEY (`technicianId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. TABELA DE ESTOQUE E INVENTÁRIO
CREATE TABLE IF NOT EXISTS `stock_items` (
    `id` VARCHAR(36) NOT NULL,
    `code` VARCHAR(30) NOT NULL UNIQUE,
    `name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(255) NULL,
    `category` VARCHAR(60) NOT NULL,
    `unit` VARCHAR(20) NOT NULL,
    `quantityInStock` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `minimumThreshold` DECIMAL(10, 2) NOT NULL DEFAULT 5.00,
    `unitCost` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `isSupportSupply` TINYINT(1) NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3.1 TABELA ASSOCIATIVA OS / ESTOQUE (Baixa Automática)
CREATE TABLE IF NOT EXISTS `os_stock_usage` (
    `id` VARCHAR(36) NOT NULL,
    `serviceOrderId` VARCHAR(36) NOT NULL,
    `stockItemId` VARCHAR(36) NOT NULL,
    `quantityUsed` DECIMAL(10, 2) NOT NULL,
    `unitCostSnapshot` DECIMAL(10, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_os_stock` (`serviceOrderId`, `stockItemId`),
    CONSTRAINT `fk_os_stock_order` FOREIGN KEY (`serviceOrderId`) REFERENCES `service_orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_os_stock_item` FOREIGN KEY (`stockItemId`) REFERENCES `stock_items` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. TABELA DE FECHAMENTO QUINZENAL
CREATE TABLE IF NOT EXISTS `biweekly_closings` (
    `id` VARCHAR(36) NOT NULL,
    `referenceMonth` INT NOT NULL,
    `referenceYear` INT NOT NULL,
    `periodNumber` INT NOT NULL, -- 1 ou 2
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `status` ENUM('OPEN', 'CALCULATING', 'CLOSED', 'PAID') NOT NULL DEFAULT 'OPEN',
    `totalFaturamentoPorto` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `totalTechnicianGross` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `totalKmReimbursement` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `totalTollsReimbursement` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `totalSupportPaid` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `totalAdvancesDeducted` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `totalTaxesDeducted` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `totalNetPayout` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `companyProfitMargin` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `closedByUserId` VARCHAR(36) NULL,
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_closing_period` (`referenceYear`, `referenceMonth`, `periodNumber`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. RESUMO QUINZENAL POR TÉCNICO (Base para PDF e WhatsApp)
CREATE TABLE IF NOT EXISTS `technician_closing_summaries` (
    `id` VARCHAR(36) NOT NULL,
    `closingId` VARCHAR(36) NOT NULL,
    `technicianId` VARCHAR(36) NOT NULL,
    `osCount` INT NOT NULL DEFAULT 0,
    `totalBaseFee` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `totalKmTraveled` DECIMAL(8, 2) NOT NULL DEFAULT 0.00,
    `totalKmCost` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `totalTollCost` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `totalSupportCost` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `fixedCostAllowance` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `grossTotal` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `advancesDeduction` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `hasSpecialTaxRule` TINYINT(1) NOT NULL DEFAULT 0,
    `taxDeductionRate` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    `taxDeductionAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `otherDeductions` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `totalDeductions` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `netTotal` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `pdfStatementHash` VARCHAR(64) NULL,
    `pdfStatementUrl` VARCHAR(255) NULL,
    `whatsappDispatched` TINYINT(1) NOT NULL DEFAULT 0,
    `whatsappDispatchedAt` DATETIME(3) NULL,
    `whatsappMessageId` VARCHAR(100) NULL,
    `whatsappStatus` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_closing_tech` (`closingId`, `technicianId`),
    CONSTRAINT `fk_summary_closing` FOREIGN KEY (`closingId`) REFERENCES `biweekly_closings` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_summary_tech` FOREIGN KEY (`technicianId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. TABELA DE MOVIMENTAÇÕES FINANCEIRAS (Fluxo de Caixa)
CREATE TABLE IF NOT EXISTS `financial_movements` (
    `id` VARCHAR(36) NOT NULL,
    `type` ENUM('INCOME', 'EXPENSE', 'ADVANCE_VALE', 'TECHNICIAN_PAYMENT', 'TAX_DEDUCTION', 'COST_ALLOWANCE') NOT NULL,
    `category` VARCHAR(80) NOT NULL,
    `description` VARCHAR(200) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `status` ENUM('PENDING', 'CONFIRMED', 'PAID', 'CANCELLED') NOT NULL DEFAULT 'CONFIRMED',
    `technicianId` VARCHAR(36) NULL,
    `serviceOrderId` VARCHAR(36) NULL,
    `biweeklyClosingId` VARCHAR(36) NULL,
    `paymentMethod` VARCHAR(50) NULL,
    `dueDate` DATETIME(3) NULL,
    `paymentDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    INDEX `idx_financial_type` (`type`),
    CONSTRAINT `fk_fin_tech` FOREIGN KEY (`technicianId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_fin_os` FOREIGN KEY (`serviceOrderId`) REFERENCES `service_orders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_fin_closing` FOREIGN KEY (`biweeklyClosingId`) REFERENCES `biweekly_closings` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. CONFIGURAÇÕES GERAIS
CREATE TABLE IF NOT EXISTS `general_settings` (
    `id` VARCHAR(36) NOT NULL DEFAULT 'default',
    `companyName` VARCHAR(100) NOT NULL DEFAULT 'O Higienizador',
    `companyCnpj` VARCHAR(20) NOT NULL DEFAULT '32.145.890/0001-44',
    `kmRateDefault` DECIMAL(6, 2) NOT NULL DEFAULT 1.20,
    `portoSeguroBaseFeeDefault` DECIMAL(10, 2) NOT NULL DEFAULT 180.00,
    `defaultSpecialTaxRate` DECIMAL(5, 2) NOT NULL DEFAULT 6.00,
    `whatsappApiUrl` VARCHAR(255) NOT NULL,
    `whatsappApiKey` VARCHAR(255) NOT NULL,
    `whatsappInstanceName` VARCHAR(100) NOT NULL,
    `whatsappTemplateMessage` TEXT NOT NULL,
    `autoStockDeduction` TINYINT(1) NOT NULL DEFAULT 1,
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================================
-- CARGA INICIAL DE USUÁRIOS E TÉCNICOS NO MARIADB
-- =========================================================================
INSERT INTO `users` (
    `id`, `name`, `email`, `passwordHash`, `role`, `documentCpf`, `phone`,
    `isActive`, `pixKeyType`, `pixKey`, `bankName`, `bankAgency`, `bankAccount`,
    `baseCostAllowance`, `hasSpecialTaxRule`, `specialTaxRate`
) VALUES
('admin1', 'Gestor Master Porto', 'gestor@ohigienizador.com.br', 'Porto@2026', 'ADMIN', '123.456.789-00', '11988887777', 1, 'EMAIL', 'gestor@ohigienizador.com.br', 'Banco Itaú', '0450', '19842-1', 0.00, 0, 0.00),
('u1', 'Carlos Henrique Silva', 'carlos.silva@ohigienizador.com.br', 'Porto@2026', 'TECHNICIAN', '234.567.890-11', '11977776666', 1, 'CPF', '234.567.890-11', 'Banco Bradesco', '1820', '33410-2', 250.00, 0, 0.00),
('u2', 'Lucas Eduardo Rocha', 'lucas.rocha@ohigienizador.com.br', 'Porto@2026', 'TECHNICIAN', '345.678.901-22', '11966665555', 1, 'EMAIL', 'lucas.rocha@ohigienizador.com.br', 'Nubank (0260)', '0001', '4589211-0', 250.00, 0, 0.00),
('u3', 'Marcos Vinícius Santos', 'marcos.santos@ohigienizador.com.br', 'Porto@2026', 'TECHNICIAN', '456.789.012-33', '11955554444', 1, 'PHONE', '11955554444', 'Banco Santander', '2109', '55401-9', 250.00, 0, 0.00),
('u4', 'Rafael Albuquerque', 'rafael.albuquerque@ohigienizador.com.br', 'Porto@2026', 'TECHNICIAN', '567.890.123-44', '11944443333', 1, 'CPF', '567.890.123-44', 'Caixa Econômica', '0231', '11200-8', 250.00, 1, 16.00),
('u5', 'Marcelo Ramos', 'zrticonsultoria@gmail.com', 'Porto@2026', 'TECHNICIAN', '16157696842', '11942080165', 1, 'CPF', '16157696842', 'Banco Itaú', '0001', '00000-0', 250.00, 0, 0.00)
ON DUPLICATE KEY UPDATE
    `name` = VALUES(`name`),
    `phone` = VALUES(`phone`),
    `pixKey` = VALUES(`pixKey`),
    `bankName` = VALUES(`bankName`),
    `baseCostAllowance` = VALUES(`baseCostAllowance`),
    `hasSpecialTaxRule` = VALUES(`hasSpecialTaxRule`),
    `specialTaxRate` = VALUES(`specialTaxRate`);

