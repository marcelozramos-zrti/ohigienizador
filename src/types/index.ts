export type Role = 'ADMIN' | 'OPERATIONAL' | 'TECHNICIAN';

export type DataScope = 'ALL' | 'OWN' | 'NONE';

export type AppModule =
  | 'AUTH'
  | 'SERVICE_ORDERS'
  | 'USERS'
  | 'STOCK'
  | 'FINANCE'
  | 'CASHFLOW'
  | 'SETTINGS'
  | 'DATABASE'
  | 'AUDIT';

export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'LOGIN_FAILED'
  | 'PASSWORD_CHANGE'
  | 'MFA_TOGGLE'
  | 'USER_CREATE'
  | 'USER_UPDATE'
  | 'USER_DEACTIVATE'
  | 'USER_RESTORE'
  | 'USER_DELETE'
  | 'USER_ROLE_CHANGE'
  | 'PIX_CHANGE'
  | 'SPECIAL_TAX_CHANGE'
  | 'COST_ALLOWANCE_CHANGE'
  | 'OS_CREATE'
  | 'OS_UPDATE'
  | 'OS_STATUS_CHANGE'
  | 'OS_DELETE'
  | 'OS_TECHNICIAN_REASSIGN'
  | 'OS_PAYMENT_SETTLED'
  | 'OS_PAYMENT_REVERTED'
  | 'STOCK_CREATE'
  | 'STOCK_UPDATE'
  | 'STOCK_DELETE'
  | 'STOCK_ADJUST'
  | 'FINANCIAL_MOVEMENT_CREATE'
  | 'FINANCIAL_MOVEMENT_DELETE'
  | 'FINANCIAL_CLOSING_CREATE'
  | 'FINANCIAL_CLOSING_PAY'
  | 'SETTINGS_UPDATE'
  | 'DB_CONFIG_UPDATE'
  | 'DATA_EXPORT'
  | 'DATA_IMPORT'
  | 'ACCESS_DENIED';

export type AuditResult = 'SUCCESS' | 'BLOCKED' | 'FAILED';

export interface AuditLog {
  id: string;
  timestamp: string; // ISO String
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
}

export type OsStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type MovementType =
  | 'INCOME'
  | 'EXPENSE'
  | 'ADVANCE_VALE'
  | 'TECHNICIAN_PAYMENT'
  | 'TAX_DEDUCTION'
  | 'COST_ALLOWANCE'
  | 'EXPENSE_ADVANCE'
  | 'INCOME_PORTO'
  | 'INCOME_OTHER'
  | 'EXPENSE_STOCK'
  | 'EXPENSE_OPERATIONAL';

export type MovementStatus = 'PENDING' | 'CONFIRMED' | 'PAID' | 'CANCELLED';

export type ClosingStatus = 'OPEN' | 'CALCULATING' | 'CLOSED' | 'PAID';

export type PixKeyType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'RANDOM';

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: Role;
  isSuperAdmin?: boolean;
  documentCpf: string;
  phone: string; // DDD + Celular (e.g. "11987654321")
  avatarUrl?: string;
  isActive: boolean;
  
  // Security & MFA
  mfaEnabled?: boolean;
  mfaSecret?: string;
  lastLoginAt?: string;
  temporaryPassword?: boolean;
  revokedAt?: string;
  
  // Banking & PIX
  pixKeyType?: PixKeyType;
  pixKey?: string;
  bankName?: string;
  bankAgency?: string;
  bankAccount?: string;

  // Remuneration rules
  baseCostAllowance: number; // Ajuda de custo mensal fixa (ex: R$ 250,00)
  costAllowanceFortnight?: 1 | 2; // Quinzena de pagamento da ajuda de custo mensal (1: 1ª Quinzena, 2: 2ª Quinzena)
  
  // REGRA DE EXCEÇÃO: Flag para os 2 técnicos específicos na base com cálculo de impostos separado
  hasSpecialTaxRule: boolean;
  specialTaxRate: number; // Porcentagem de dedução independente (ex: 16%)

  // Tabela de Preços de Serviços Customizada por Técnico (Preposto / Negociado)
  priceTable?: TechnicianPriceTableItem[];
}

export interface TechnicianPriceTableItem {
  id?: string;
  serviceType: string; // Ex: "Instalação Lava e Seca", "Impermeabilização 3 Assentos"
  category: string; // Ex: "Instalação", "Impermeabilização Assentos", "Impermeabilização Cadeiras", "Impermeabilização Colchões", "Higienização"
  prepostoPrice: number; // Valor Preposto negociado em R$
}

export interface OSStockItemUsage {
  stockItemId: string;
  stockItemName: string;
  quantityUsed: number;
  unit: string;
  unitCostSnapshot: number;
}

export interface ServiceOrder {
  id: string;
  callNumber: string; // Número do Chamado Porto Seguro (ex: "PS-2026-8941")
  portoSeguroProtocol?: string;
  serviceCategory: string; // e.g., "Higienização de Sofá 3L", "Impermeabilização Premium", "Higienização Automotiva"
  baseServiceFee: number; // Valor base repassado ao técnico (ex: R$ 130,00)
  
  customerName: string;
  customerCpf: string;
  customerPhone?: string;
  
  city: string;
  uf: string;
  neighborhood: string;
  addressStreet: string;
  addressNumber: string;
  addressComplement?: string;
  postalCode: string;

  technicianId?: string;
  technicianName?: string;
  status: OsStatus;
  scheduledDate: string; // ISO date
  startedAt?: string;
  completedAt?: string;

  // App Mobile Closure attributes
  kmTraveled: number; // KM rodado
  kmRateApplied: number; // R$ por KM (ex: R$ 1,20)
  kmTotalCost: number; // kmTraveled * kmRateApplied
  tollCost: number; // Custos de pedágio
  supportCost: number; // Custos de suporte/adicionais
  
  totalTechnicianGross: number; // Base + KM + Pedágio + Suporte
  faturamentoPorto: number; // Valor faturado da Porto Seguro (ex: R$ 380,00)

  customerSignature?: string; // Data URL / signature string
  executionNotes?: string;
  tollReceiptUrl?: string;

  // Insumos/suportes abatidos
  itemsUsed: OSStockItemUsage[];

  // Controle de Quitação Financeira (Dar Baixa ao Técnico)
  paymentStatus?: 'PENDING' | 'PAID';
  paymentDate?: string | null;
}

export interface StockItem {
  id: string;
  code: string;
  sku?: string;
  name: string;
  description?: string;
  category: 'Químicos / Limpeza' | 'Impermeabilizantes' | 'Suportes / Acessórios' | 'Equipamentos' | string;
  unit: string;
  quantityInStock: number;
  minimumThreshold: number;
  unitCost: number;
  isSupportSupply: boolean; // Se true, o técnico aponta e abate da OS
}

export interface FinancialMovement {
  id: string;
  type: MovementType;
  category: string;
  description: string;
  amount: number;
  status: MovementStatus;
  technicianId?: string;
  technicianName?: string;
  serviceOrderId?: string;
  callNumber?: string;
  biweeklyClosingId?: string;
  paymentMethod?: string;
  date: string;
  movementDate?: string;
}

export interface TechnicianClosingSummary {
  id: string;
  closingId: string;
  technicianId: string;
  technicianName: string;
  technicianCpf: string;
  technicianPhone: string;
  pixKeyType?: PixKeyType;
  pixKey?: string;
  bankName?: string;
  bankAgency?: string;
  bankAccount?: string;

  osCount: number;
  totalBaseFee: number;
  totalKmTraveled: number;
  totalKmCost: number;
  totalTollCost: number;
  totalSupportCost: number;
  fixedCostAllowance: number; // Valor da ajuda de custo creditado nesta quinzena
  costAllowanceFortnight?: 1 | 2; // Quinzena definida no perfil do técnico (1 ou 2)

  // Bruto
  grossTotal: number;

  // Descontos
  advancesDeduction: number; // Vales retirados no período
  
  // Regra de Exceção dos 2 Técnicos com dedução de impostos
  hasSpecialTaxRule: boolean;
  taxDeductionRate: number; // ex: 6%
  taxDeductionAmount: number; // grossTotal * (taxDeductionRate / 100)

  otherDeductions: number;
  totalDeductions: number;

  // Líquido
  netTotal: number;

  // Status de Envio WhatsApp & PDF
  pdfStatementUrl?: string;
  pdfStatementHash?: string;
  whatsappDispatched: boolean;
  whatsappDispatchedAt?: string;
  whatsappStatus?: 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED';
  whatsappMessageId?: string;
}

export interface BiweeklyClosing {
  id: string;
  referenceMonth: number; // 1-12
  referenceYear: number; // 2026
  periodNumber: 1 | 2; // 1 = 1-15, 2 = 16-fim
  startDate: string;
  endDate: string;
  status: ClosingStatus;

  totalFaturamentoPorto: number;
  totalTechnicianGross: number;
  totalKmReimbursement: number;
  totalTollsReimbursement: number;
  totalSupportPaid: number;
  totalAdvancesDeducted: number;
  totalTaxesDeducted: number;
  totalNetPayout: number;
  companyProfitMargin: number;

  closedByUserId?: string;
  closedByName?: string;
  closedAt?: string;

  technicianSummaries: TechnicianClosingSummary[];
}

export interface DatabaseSettings {
  dbEngine: 'MARIADB' | 'MYSQL';
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPassword?: string;
  dbSsl: boolean;
  dbPoolMin: number;
  dbPoolMax: number;
  connectionStringMasked: string;
  syncStatus: 'CONNECTED' | 'DISCONNECTED' | 'SYNCHRONIZING' | 'LOCAL_FALLBACK';
  lastPingMs?: number;
  lastSyncTimestamp?: string;
}

export interface N8nEventsConfig {
  onOrderCreated: boolean;
  onOrderAssigned: boolean;
  onOrderCompleted: boolean;
  onDailySummary: boolean;
  onStockAlert: boolean;
  onBiweeklyClosing: boolean;
  onAdvanceRequested: boolean;
}

export interface N8nSettings {
  enabled: boolean;
  webhookUrl: string; // URL do Webhook no seu N8N (ex: https://n8n.seuservidor.com/webhook/higienizador-events)
  apiKey: string; // Token de segurança compartilhado entre o sistema e o N8N
  events: N8nEventsConfig;
  lastPingStatus?: 'SUCCESS' | 'ERROR' | 'IDLE';
  lastPingAt?: string;
  lastPingResponse?: string;
  lastPingCode?: number;
}

export interface GeneralSettings {
  companyName: string;
  companyCnpj: string;
  kmRateDefault: number;
  kmReimbursementRate: number;
  fixedCostAllowance: number;
  portoSeguroBaseFeeDefault: number;
  defaultSpecialTaxRate: number;
  defaultTaxDeductionRate: number;
  whatsappProvider: 'EVOLUTION_API' | 'Z_API' | 'BAILEYS';
  whatsappApiUrl: string;
  whatsappApiEndpoint: string;
  whatsappApiKey: string;
  whatsappInstanceName: string;
  whatsappTemplateMessage: string;
  autoStockDeduction: boolean;
  serviceCategoriesRates: Record<string, number>;
  databaseSettings?: DatabaseSettings;
  n8nSettings?: N8nSettings;
}

export interface ToastItem {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
  timestamp: string;
  read: boolean;
  targetTab?: string;
  category?: 'STOCK_CRITICAL' | 'STOCK_WARNING' | 'CLOSING' | 'ORDERS' | 'SYSTEM';
  itemId?: string;
}
