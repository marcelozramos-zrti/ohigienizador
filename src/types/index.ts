export type Role = 'ADMIN' | 'OPERATIONAL' | 'TECHNICIAN';

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
  role: Role;
  documentCpf: string;
  phone: string; // DDD + Celular (e.g. "11987654321")
  avatarUrl?: string;
  isActive: boolean;
  
  // Banking & PIX
  pixKeyType?: PixKeyType;
  pixKey?: string;
  bankName?: string;
  bankAgency?: string;
  bankAccount?: string;

  // Remuneration rules
  baseCostAllowance: number; // Ajuda de custo fixa quinzenal (ex: R$ 250,00)
  
  // REGRA DE EXCEÇÃO: Flag para os 2 técnicos específicos na base com cálculo de impostos separado
  hasSpecialTaxRule: boolean;
  specialTaxRate: number; // Porcentagem de dedução independente (ex: 6%)
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
  fixedCostAllowance: number;

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
}
