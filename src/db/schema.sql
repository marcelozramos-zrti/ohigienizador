-- =========================================================================
-- BANCO DE DADOS: MariaDB 10.11+ / MySQL 8.0+
-- PROJETO: Sistema Higienizador - Gestão SaaS de OS (Porto Seguro) e Finanças
-- =========================================================================

CREATE DATABASE IF NOT EXISTS `sistema_higienizador` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `sistema_higienizador`;

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
    `id` VARCHAR(36) NOT NULL,
    `callNumber` VARCHAR(50) NOT NULL UNIQUE,
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

-- TABELA ASSOCIATIVA OS / ESTOQUE (Baixa Automática)
CREATE TABLE IF NOT EXISTS `os_stock_items` (
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
