import { User, ServiceOrder, FinancialMovement, TechnicianClosingSummary, BiweeklyClosing } from '../types';
import { ClosingService, ClosingCalculationOptions, ClosingStatementJson } from './closingService';

export interface CalculationOptions extends ClosingCalculationOptions {}

/**
 * Motor de Cálculo Financeiro Quinzenal (Sistema Higienizador)
 * Utiliza o ClosingService para garantir precisão matemática e conformidade
 * com as regras das planilhas operacionais:
 * - KM: R$ 0,50 / km
 * - Pedágios e Suportes 1:1
 * - Ajuda de custo: R$ 250,00
 * - Dedução de Vales e Adiantamentos
 * - Dedução de Impostos (Exceção Fiscal de 16% sobre Total Bruto)
 */
export class FinancialEngine {
  static calculateTechnicianSummary(
    technician: User,
    orders: ServiceOrder[],
    movements: FinancialMovement[],
    closingId: string,
    options?: Partial<CalculationOptions>
  ): TechnicianClosingSummary {
    const defaultOptions: ClosingCalculationOptions = {
      periodNumber: options?.periodNumber || 1,
      referenceMonth: options?.referenceMonth || 8,
      referenceYear: options?.referenceYear || 2026,
      kmRateDefault: options?.kmRateDefault ?? 0.50,
    };

    const statement = ClosingService.calculateTechnicianStatement(
      technician,
      orders,
      movements,
      defaultOptions
    );
    const fs = statement.financialSummary;

    return {
      id: `summary-${closingId}-${technician.id}`,
      closingId,
      technicianId: technician.id,
      technicianName: technician.name,
      technicianCpf: technician.documentCpf,
      technicianPhone: technician.phone,
      pixKeyType: technician.pixKeyType,
      pixKey: technician.pixKey,
      bankName: technician.bankName,
      bankAgency: technician.bankAgency,
      bankAccount: technician.bankAccount,

      osCount: fs.totalOrdersCount,
      totalBaseFee: fs.totalBaseServiceFee,
      totalKmTraveled: fs.totalKmTraveled,
      totalKmCost: fs.totalKmReimbursement,
      totalTollCost: fs.totalTollReimbursement,
      totalSupportCost: fs.totalSupportReimbursement,
      fixedCostAllowance: fs.fixedCostAllowance,
      costAllowanceFortnight: technician.costAllowanceFortnight || 1,

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
  }

  static processBiweeklyClosing(
    technicians: User[],
    orders: ServiceOrder[],
    movements: FinancialMovement[],
    options: CalculationOptions,
    closedBy?: User
  ): BiweeklyClosing {
    const fullClosing = ClosingService.processFullClosing(
      technicians,
      orders,
      movements,
      options
    );

    if (closedBy) {
      fullClosing.closedByUserId = closedBy.id;
      fullClosing.closedByName = closedBy.name;
    }

    return fullClosing;
  }

  static getDetailedStatement(
    technician: User,
    orders: ServiceOrder[],
    movements: FinancialMovement[],
    options: ClosingCalculationOptions
  ): ClosingStatementJson {
    return ClosingService.calculateTechnicianStatement(
      technician,
      orders,
      movements,
      options
    );
  }
}
