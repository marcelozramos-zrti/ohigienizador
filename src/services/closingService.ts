import { User, ServiceOrder, FinancialMovement, TechnicianClosingSummary, BiweeklyClosing } from '../types';

export interface ClosingCalculationOptions {
  kmRateDefault?: number; // Padrão R$ 0,50 por KM
  periodNumber: 1 | 2; // 1ª Quinzena (01-15) ou 2ª Quinzena (16-fim)
  referenceMonth: number; // 1 - 12
  referenceYear: number; // e.g. 2026
}

export function parseDateComponents(val: any): { year: number; month: number; day: number } | null {
  if (!val) return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return {
      year: val.getFullYear(),
      month: val.getMonth() + 1,
      day: val.getDate(),
    };
  }

  if (typeof val === 'number') {
    const d = new Date(val > 100000000000 ? val : (val - 25569) * 86400 * 1000);
    if (!isNaN(d.getTime())) {
      return {
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        day: d.getDate(),
      };
    }
  }

  if (typeof val === 'string') {
    const clean = val.trim();
    // Formato Brasileiro: DD/MM/YYYY ou DD-MM-YYYY
    const brMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (brMatch) {
      return {
        day: parseInt(brMatch[1], 10),
        month: parseInt(brMatch[2], 10),
        year: parseInt(brMatch[3], 10),
      };
    }

    // Formato ISO: YYYY-MM-DD ou YYYY/MM/DD
    const isoMatch = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (isoMatch) {
      return {
        year: parseInt(isoMatch[1], 10),
        month: parseInt(isoMatch[2], 10),
        day: parseInt(isoMatch[3], 10),
      };
    }

    const d = new Date(clean);
    if (!isNaN(d.getTime())) {
      return {
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        day: d.getDate(),
      };
    }
  }

  return null;
}

export function isOrderInPeriod(
  os: ServiceOrder,
  options: { referenceYear: number; referenceMonth: number; periodNumber: 0 | 1 | 2 }
): boolean {
  if (!os) return false;
  const dateVal = os.scheduledDate || os.completedAt || os.startedAt;
  if (!dateVal) return false;

  const parsed = parseDateComponents(dateVal);
  if (!parsed) return false;

  if (parsed.year !== options.referenceYear || parsed.month !== options.referenceMonth) {
    return false;
  }

  if (options.periodNumber === 0) {
    return true; // Match all quinzenas in this month
  }

  if (options.periodNumber === 1) {
    return parsed.day >= 1 && parsed.day <= 15;
  } else {
    return parsed.day >= 16;
  }
}

export interface ClosingStatementJson {
  statementId: string;
  technician: {
    id: string;
    name: string;
    cpf: string;
    phone: string;
    pixKey: string;
    pixKeyType: string;
    bankInfo: string;
  };
  period: {
    label: string;
    periodNumber: number;
    referenceMonth: number;
    referenceYear: number;
    startDate: string;
    endDate: string;
  };
  orders: {
    id: string;
    callNumber: string;
    serviceCategory: string;
    visitDate: string;
    customerName: string;
    location: string;
    city: string;
    uf: string;
    postalCode: string;
    neighborhood: string;
    kmTraveled: number;
    kmRateApplied: number;
    kmTotalCost: number;
    tollCost: number;
    supportCost: number;
    baseServiceFee: number;
    totalOrderAmount: number;
  }[];
  financialSummary: {
    totalOrdersCount: number;
    totalBaseServiceFee: number;
    totalKmTraveled: number;
    totalKmReimbursement: number;
    totalTollReimbursement: number;
    totalSupportReimbursement: number;
    sumOfOrders: number;
    fixedCostAllowance: number; // Ajuda de Custo (ex: R$ 250,00)
    grossTotal: number; // Soma das OS + Ajuda de Custo
    advancesAndDiscounts: number; // Vales / Descontos (ex: R$ 200,00)
    hasSpecialTaxRule: boolean;
    taxRatePercentage: number; // ex: 16%
    taxDeductionAmount: number; // ex: R$ 630,40
    totalDeductions: number;
    netPayableAmount: number; // (=) VALOR LÍQUIDO A RECEBER
  };
  metadata: {
    generatedAt: string;
    ruleModel: string;
    authHash: string;
  };
}

/**
 * ClosingService (Node.js & Client Service)
 * Implementa a engenharia reversa exata e modelagem matemática das planilhas de fechamento:
 * - KM: R$ 0,50 por KM rodado
 * - Pedágio e Suporte: 1 para 1
 * - Total OS: Valor Visita + (KM * 0.50) + Pedágio + Suporte
 * - Ajuda de Custo: R$ 250,00 fixo adicionado ao final
 * - Vales/Adiantamentos: Dedução do Total Bruto (ex: R$ 200,00)
 * - Regra de Imposto (Exceção): 16% de retenção sobre Total Bruto (ex: Robertinho R$ 3.940,00 - 16% = R$ 3.309,60)
 */
export class ClosingService {
  public static readonly DEFAULT_KM_RATE = 0.50; // R$ 0,50 / km
  public static readonly DEFAULT_COST_ALLOWANCE = 250.00; // R$ 250,00
  public static readonly DEFAULT_TAX_EXCEPTION_RATE = 16.0; // 16.0%

  /**
   * Obtém o valor acordado com o técnico (preposto) para determinado escopo/serviço da sua tabela de preços
   */
  public static getTechnicianPriceForService(technician: User, serviceName: string): number | null {
    if (!technician.priceTable || !Array.isArray(technician.priceTable) || technician.priceTable.length === 0) {
      return null;
    }
    const cleanSearch = (serviceName || '').toLowerCase().trim();
    if (!cleanSearch) return null;

    // Busca exata ou por substring
    const found = technician.priceTable.find((item) => {
      const itemService = (item.serviceType || '').toLowerCase().trim();
      return itemService === cleanSearch || cleanSearch.includes(itemService) || itemService.includes(cleanSearch);
    });

    if (found && typeof found.prepostoPrice === 'number' && found.prepostoPrice > 0) {
      return found.prepostoPrice;
    }
    return null;
  }

  /**
   * Calcula o extrato individual do técnico e gera o JSON exato para o PDF e WhatsApp
   */
  public static calculateTechnicianStatement(
    technician: User,
    orders: ServiceOrder[],
    movements: FinancialMovement[],
    options: ClosingCalculationOptions
  ): ClosingStatementJson {
    const kmRate = options.kmRateDefault ?? this.DEFAULT_KM_RATE;
    const safeOrders = orders || [];
    const safeMovements = movements || [];

    // 1. Filtrar ordens concluídas
    const completedOrders = safeOrders.filter(
      (os) =>
        os &&
        os.technicianId === technician.id &&
        (os.status === 'COMPLETED' ||
          (os as any).statusOS === 'COMPLETED' ||
          (os.status as string) === 'VISITA_PERDIDA' ||
          (os.serviceCategory && os.serviceCategory.toLowerCase().includes('perdida'))) &&
        isOrderInPeriod(os, options)
    );

    // Variáveis de acumulação (utilizando centavos para evitar floating point drift / falha na precisão IEEE 754)
    let sumBaseServiceCents = 0;
    let sumKmTraveledCents = 0; // KM traveled isn't currency, but multiplied by 100 for consistency
    let sumKmCostCents = 0;
    let sumTollCostCents = 0;
    let sumSupportCostCents = 0;
    let sumOrdersTotalCents = 0;

    const formattedOrdersList = completedOrders.map((os) => {
      let baseFee = Number(os.baseServiceFee ?? 0);
      if (baseFee <= 0 && os.serviceCategory) {
        const tablePrice = this.getTechnicianPriceForService(technician, os.serviceCategory);
        if (tablePrice !== null && tablePrice > 0) {
          baseFee = tablePrice;
        }
      }
      if (baseFee <= 0 && (os.serviceCategory?.toLowerCase().includes('perdida') || (os.status as string)?.toLowerCase().includes('perdida'))) {
        baseFee = 20.00; // Valor padrão fixo Visita Perdida
      }

      const km = Number(os.kmTraveled || 0);
      const kmCost = Number((km * kmRate).toFixed(2));
      const toll = Number(os.tollCost || 0);
      const support = Number(os.supportCost || 0);
      const orderTotal = Number((baseFee + kmCost + toll + support).toFixed(2));

      // Soma segura em inteiros (Math.round resolve as rebarbas de ponto flutuante, multiplicando por 100)
      sumBaseServiceCents += Math.round(baseFee * 100);
      sumKmTraveledCents += Math.round(km * 100); 
      sumKmCostCents += Math.round(kmCost * 100);
      sumTollCostCents += Math.round(toll * 100);
      sumSupportCostCents += Math.round(support * 100);
      sumOrdersTotalCents += Math.round(orderTotal * 100);

      return {
        id: os.id,
        callNumber: os.callNumber,
        serviceCategory: os.serviceCategory || 'Serviço Porto Seguro',
        visitDate: os.scheduledDate || os.completedAt || new Date().toISOString(),
        customerName: os.customerName || 'Cliente Porto',
        location: `${os.city || ''} / ${os.uf || 'SP'} (${os.neighborhood || ''})`,
        city: os.city || 'São Paulo',
        uf: os.uf || 'SP',
        postalCode: os.postalCode || '',
        neighborhood: os.neighborhood || '',
        kmTraveled: km,
        kmRateApplied: kmRate,
        kmTotalCost: kmCost,
        tollCost: toll,
        supportCost: support,
        baseServiceFee: baseFee,
        totalOrderAmount: orderTotal,
      };
    });

    // 2. Ajuda de Custo Mensal (Vulnerabilidade RBAC/Lógica Corrigida: Fallback condicional rígido)
    const rawFortnight = technician.costAllowanceFortnight;
    const technicianFortnight = (rawFortnight !== undefined && rawFortnight !== null) ? Number(rawFortnight) : 2; 
    
    // 0 = Ambas as quinzenas, 1 = Apenas 1ª, 2 = Apenas 2ª
    const isCostAllowancePeriod = (technicianFortnight === 0) || (technicianFortnight === options.periodNumber);

    const monthlyAllowanceValue =
      technician.baseCostAllowance !== undefined && technician.baseCostAllowance !== null
        ? Number(technician.baseCostAllowance)
        : (technician.role === 'TECHNICIAN' ? this.DEFAULT_COST_ALLOWANCE : 0);

    const fixedCostAllowance = isCostAllowancePeriod ? monthlyAllowanceValue : 0.00;

    // 3. (=) Total Bruto
    const sumOrdersTotal = sumOrdersTotalCents / 100;
    const grossTotal = Number((sumOrdersTotal + fixedCostAllowance).toFixed(2));

    // 4. (-) Vales e Adiantamentos do período
    const techAdvances = safeMovements.filter(
      (m) =>
        m &&
        m.technicianId === technician.id &&
        (m.type === 'ADVANCE_VALE' || m.type === 'EXPENSE_ADVANCE') &&
        m.status === 'CONFIRMED'
    );
    const advancesAndDiscountsCents = techAdvances.reduce((acc, m) => acc + Math.round((m.amount || 0) * 100), 0);
    const advancesAndDiscounts = advancesAndDiscountsCents / 100;

    // 5. (-) Exceção Fiscal (Imposto de 16%)
    const hasSpecialTaxRule = Boolean(technician.hasSpecialTaxRule);
    const taxRatePercentage = hasSpecialTaxRule ? (technician.specialTaxRate || this.DEFAULT_TAX_EXCEPTION_RATE) : 0;

    // Cálculo exato via centavos para prevenir perda de dízima em R$ altos
    const grossTotalCents = Math.round(grossTotal * 100);
    const taxDeductionAmountCents = hasSpecialTaxRule && taxRatePercentage > 0
      ? Math.round((grossTotalCents * taxRatePercentage) / 100) 
      : 0;
    const taxDeductionAmount = taxDeductionAmountCents / 100;

    // 6. Total de Deduções
    const totalDeductionsCents = advancesAndDiscountsCents + taxDeductionAmountCents;
    const totalDeductions = totalDeductionsCents / 100;

    // 7. (=) VALOR LÍQUIDO A RECEBER
    const netPayableAmount = Math.max(0, Number((grossTotal - totalDeductions).toFixed(2)));

    const startDate = new Date(options.referenceYear, options.referenceMonth - 1, options.periodNumber === 1 ? 1 : 16).toISOString();
    const lastDayOfMonth = new Date(options.referenceYear, options.referenceMonth, 0).getDate();
    const endDate = new Date(options.referenceYear, options.referenceMonth - 1, options.periodNumber === 1 ? 15 : lastDayOfMonth, 23, 59, 59).toISOString();
    
    const periodLabel = `${options.periodNumber === 1 ? '1ª Quinzena' : '2ª Quinzena'} (${String(options.referenceMonth).padStart(2, '0')}/${options.referenceYear})`;
    const statementId = `stmt-${technician.id}-${options.referenceYear}-${String(options.referenceMonth).padStart(2, '0')}-q${options.periodNumber}`;

    return {
      statementId,
      technician: {
        id: technician.id,
        name: technician.name,
        cpf: technician.documentCpf || '000.000.000-00',
        phone: technician.phone || '',
        pixKey: technician.pixKey || technician.documentCpf || '',
        pixKeyType: technician.pixKeyType || 'CPF',
        bankInfo: `${technician.bankName || 'Banco'} Ag: ${technician.bankAgency || '0001'} CC: ${technician.bankAccount || '---'}`,
      },
      period: {
        label: periodLabel,
        periodNumber: options.periodNumber,
        referenceMonth: options.referenceMonth,
        referenceYear: options.referenceYear,
        startDate,
        endDate,
      },
      orders: formattedOrdersList,
      financialSummary: {
        totalOrdersCount: completedOrders.length,
        totalBaseServiceFee: sumBaseServiceCents / 100,
        totalKmTraveled: sumKmTraveledCents / 100,
        totalKmReimbursement: sumKmCostCents / 100,
        totalTollReimbursement: sumTollCostCents / 100,
        totalSupportReimbursement: sumSupportCostCents / 100,
        sumOfOrders: sumOrdersTotal,
        fixedCostAllowance: Number(fixedCostAllowance.toFixed(2)),
        grossTotal,
        advancesAndDiscounts,
        hasSpecialTaxRule,
        taxRatePercentage,
        taxDeductionAmount,
        totalDeductions,
        netPayableAmount,
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        ruleModel: 'Sistema Higienizador v2 - Porto Seguro Rule Engine',
        authHash: `AUTH-${Math.random().toString(36).substring(2, 9).toUpperCase()}-${Date.now()}`,
      },
    };
  }

  /**
   * Processa o fechamento global de todos os técnicos da empresa
   */
  public static processFullClosing(
    technicians: User[],
    orders: ServiceOrder[],
    movements: FinancialMovement[],
    options: ClosingCalculationOptions
  ): BiweeklyClosing {
    const closingId = `closing-${options.referenceYear}-${String(
      options.referenceMonth
    ).padStart(2, '0')}-q${options.periodNumber}`;

    const startDate = new Date(
      options.referenceYear,
      options.referenceMonth - 1,
      options.periodNumber === 1 ? 1 : 16
    ).toISOString();

    const lastDayOfMonth = new Date(
      options.referenceYear,
      options.referenceMonth,
      0
    ).getDate();

    const endDate = new Date(
      options.referenceYear,
      options.referenceMonth - 1,
      options.periodNumber === 1 ? 15 : lastDayOfMonth,
      23,
      59,
      59
    ).toISOString();

    const activeTechs = (technicians || []).filter(
      (t) => t && t.role === 'TECHNICIAN' && t.isActive
    );

    const summaries: TechnicianClosingSummary[] = activeTechs.map((tech) => {
      const statement = this.calculateTechnicianStatement(tech, orders, movements, options);
      const fs = statement.financialSummary;

      return {
        id: `summary-${closingId}-${tech.id}`,
        closingId,
        technicianId: tech.id,
        technicianName: tech.name,
        technicianCpf: tech.documentCpf,
        technicianPhone: tech.phone,
        pixKeyType: tech.pixKeyType,
        pixKey: tech.pixKey,
        bankName: tech.bankName,
        bankAgency: tech.bankAgency,
        bankAccount: tech.bankAccount,

        osCount: fs.totalOrdersCount,
        totalBaseFee: fs.totalBaseServiceFee,
        totalKmTraveled: fs.totalKmTraveled,
        totalKmCost: fs.totalKmReimbursement,
        totalTollCost: fs.totalTollReimbursement,
        totalSupportCost: fs.totalSupportReimbursement,
        fixedCostAllowance: fs.fixedCostAllowance,
        costAllowanceFortnight: tech.costAllowanceFortnight || 1,

        grossTotal: fs.grossTotal,
        advancesDeduction: fs.advancesAndDiscounts,
        hasSpecialTaxRule: fs.hasSpecialTaxRule,
        taxDeductionRate: fs.taxRatePercentage,
        taxDeductionAmount: fs.taxDeductionAmount,
        otherDeductions: 0,
        totalDeductions: fs.totalDeductions,

        netTotal: fs.netPayableAmount,
        whatsappDispatched: false,
      };
    });

    const totalFaturamentoPortoCents = (orders || [])
      .filter((os) => os && os.status === 'COMPLETED' && isOrderInPeriod(os, options))
      .reduce((sum, os) => sum + Math.round((os.faturamentoPorto || 0) * 100), 0);
    const totalFaturamentoPorto = totalFaturamentoPortoCents / 100;

    const totalTechnicianGross = summaries.reduce((acc, s) => acc + Math.round(s.grossTotal * 100), 0) / 100;
    const totalKmReimbursement = summaries.reduce((acc, s) => acc + Math.round(s.totalKmCost * 100), 0) / 100;
    const totalTollsReimbursement = summaries.reduce((acc, s) => acc + Math.round(s.totalTollCost * 100), 0) / 100;
    const totalSupportPaid = summaries.reduce((acc, s) => acc + Math.round(s.totalSupportCost * 100), 0) / 100;
    const totalAdvancesDeducted = summaries.reduce((acc, s) => acc + Math.round(s.advancesDeduction * 100), 0) / 100;
    const totalTaxesDeducted = summaries.reduce((acc, s) => acc + Math.round(s.taxDeductionAmount * 100), 0) / 100;
    const totalNetPayout = summaries.reduce((acc, s) => acc + Math.round(s.netTotal * 100), 0) / 100;
    
    const companyProfitMargin = Number((totalFaturamentoPorto - totalTechnicianGross).toFixed(2));

    return {
      id: closingId,
      referenceMonth: options.referenceMonth,
      referenceYear: options.referenceYear,
      periodNumber: options.periodNumber,
      startDate,
      endDate,
      status: 'CLOSED',

      totalFaturamentoPorto: Number(totalFaturamentoPorto.toFixed(2)),
      totalTechnicianGross: Number(totalTechnicianGross.toFixed(2)),
      totalKmReimbursement: Number(totalKmReimbursement.toFixed(2)),
      totalTollsReimbursement: Number(totalTollsReimbursement.toFixed(2)),
      totalSupportPaid: Number(totalSupportPaid.toFixed(2)),
      totalAdvancesDeducted: Number(totalAdvancesDeducted.toFixed(2)),
      totalTaxesDeducted: Number(totalTaxesDeducted.toFixed(2)),
      totalNetPayout: Number(totalNetPayout.toFixed(2)),
      companyProfitMargin,

      closedByUserId: 'henrique-admin',
      closedByName: 'Henrique (Diretoria)',
      closedAt: new Date().toISOString(),

      technicianSummaries: summaries,
    };
  }
}
