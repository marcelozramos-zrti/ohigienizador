import { BiweeklyClosing, ServiceOrder, FinancialMovement } from '../types';

export class CsvExportService {
  /**
   * Converte array de objetos em string CSV compatível com Excel (separador ponto-e-vírgula e UTF-8 BOM)
   */
  private static convertToCsv(headers: string[], rows: (string | number)[][]): string {
    const headerLine = headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(';');
    const bodyLines = rows.map((row) =>
      row
        .map((cell) => {
          const val = cell !== undefined && cell !== null ? String(cell) : '';
          return `"${val.replace(/"/g, '""')}"`;
        })
        .join(';')
    );

    // Adiciona o BOM UTF-8 (\uFEFF) para abrir com acentuação correta no Microsoft Excel
    return '\uFEFF' + [headerLine, ...bodyLines].join('\r\n');
  }

  private static triggerDownload(csvContent: string, filename: string) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Exporta a Tabela de Resultados (DataGrid de Fechamento) com as 17 colunas exatas do modelo das planilhas:
   * Origem, IdChamado, Dt.Visita, Periodo, Tipo Visita, Prestador, Status, Tecnico, Status Mobile, Cidade, UF, CEP, Bairro, KM, Pedagio, Valor Visita, Total da OS
   */
  static exportClosingDataGridCsv(orders: ServiceOrder[], periodLabel: string = '1ª Quinzena') {
    const headers = [
      'Origem',
      'IdChamado',
      'Dt.Visita',
      'Periodo',
      'Tipo Visita',
      'Prestador',
      'Status',
      'Tecnico',
      'Status Mobile',
      'Cidade',
      'UF',
      'CEP',
      'Bairro',
      'KM',
      'Pedágio',
      'Valor da Visita',
      'Total',
      'Status Pagto',
      'Data Pagto',
    ];

    const safeOrders = orders || [];
    const rows = safeOrders.map((os) => {
      const visitDate = os.completedAt || os.scheduledDate || new Date().toISOString();
      const dateFormatted = new Date(visitDate).toLocaleDateString('pt-BR');
      const paymentDateFormatted = os.paymentDate
        ? new Date(os.paymentDate).toLocaleString('pt-BR')
        : '-';
      const km = os.kmTraveled || 0;
      const kmCost = os.kmTotalCost ?? Number((km * 0.50).toFixed(2));
      const baseFee = os.baseServiceFee || 0;
      const toll = os.tollCost || 0;
      const support = os.supportCost || 0;
      const totalOs = baseFee + kmCost + toll + support;

      const mobileStatus =
        os.status === 'COMPLETED'
          ? 'Concluído em Campo'
          : os.status === 'IN_PROGRESS'
          ? 'Em Rota'
          : os.status === 'CANCELLED'
          ? 'Cancelado'
          : 'Pendente';

      return [
        'Porto Seguro',
        os.callNumber || '',
        dateFormatted,
        periodLabel,
        os.serviceCategory || '',
        'O Higienizador',
        os.status || '',
        os.technicianName || 'Não Alocado',
        mobileStatus,
        os.city || 'São Paulo',
        os.uf || 'SP',
        os.postalCode || '',
        os.neighborhood || '',
        km,
        `R$ ${toll.toFixed(2)}`,
        `R$ ${baseFee.toFixed(2)}`,
        `R$ ${totalOs.toFixed(2)}`,
        os.paymentStatus === 'PAID' ? 'PAGO' : 'PENDENTE',
        paymentDateFormatted,
      ];
    });

    const csv = this.convertToCsv(headers, rows);
    const filename = `Extrato_Detalhado_OS_${periodLabel.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    this.triggerDownload(csv, filename);
  }

  /**
   * Exporta o Fechamento Quinzenal dos Técnicos para a Diretoria (Henrique / Sócios)
   */
  static exportBiweeklyClosingCsv(closing: BiweeklyClosing) {
    const headers = [
      'ID Fechamento',
      'Período',
      'Mês/Ano',
      'Nome do Técnico',
      'CPF',
      'Telefone',
      'Chave PIX',
      'Tipo Chave',
      'Banco',
      'Agência',
      'Conta',
      'Qtd OS Atendidas',
      'Total Base Serviços (R$)',
      'KM Total Rodado',
      'Reembolso KM (R$)',
      'Reembolso Pedágios (R$)',
      'Custos Suporte (R$)',
      'Ajuda Custo Fixa (R$)',
      'TOTAL BRUTO (R$)',
      'Vales / Adiantamentos (R$)',
      'Regra Especial Impostos?',
      'Alíquota Imposto (%)',
      'Dedução Imposto (R$)',
      'Total Descontos (R$)',
      'TOTAL LÍQUIDO A PAGAR (R$)',
      'Status WhatsApp',
    ];

    const periodLabel = closing.periodNumber === 1 ? '1ª Quinzena' : '2ª Quinzena';
    const monthYear = `${String(closing.referenceMonth).padStart(2, '0')}/${closing.referenceYear}`;

    const safeSummaries = closing.technicianSummaries || [];

    const rows = safeSummaries.map((s) => [
      closing.id,
      periodLabel,
      monthYear,
      s.technicianName || '',
      s.technicianCpf || '',
      s.technicianPhone || '',
      s.pixKey || '',
      s.pixKeyType || '',
      s.bankName || '',
      s.bankAgency || '',
      s.bankAccount || '',
      s.osCount || 0,
      (s.totalBaseFee || 0).toFixed(2),
      (s.totalKmTraveled || 0).toFixed(2),
      (s.totalKmCost || 0).toFixed(2),
      (s.totalTollCost || 0).toFixed(2),
      (s.totalSupportCost || 0).toFixed(2),
      (s.fixedCostAllowance || 0).toFixed(2),
      (s.grossTotal || 0).toFixed(2),
      (s.advancesDeduction || 0).toFixed(2),
      s.hasSpecialTaxRule ? 'SIM (Regra Exceção)' : 'NÃO',
      s.taxDeductionRate ? `${s.taxDeductionRate}%` : '0%',
      (s.taxDeductionAmount || 0).toFixed(2),
      (s.totalDeductions || 0).toFixed(2),
      (s.netTotal || 0).toFixed(2),
      s.whatsappDispatched ? 'ENVIADO' : 'PENDENTE',
    ]);

    const csv = this.convertToCsv(headers, rows);
    const filename = `Fechamento_Diretoria_${periodLabel.replace(/\s+/g, '_')}_${closing.referenceMonth}_${closing.referenceYear}.csv`;
    this.triggerDownload(csv, filename);
  }

  /**
   * Exporta Relatório de Ordens de Serviço Porto Seguro
   */
  static exportServiceOrdersCsv(orders: ServiceOrder[]) {
    const headers = [
      'Nº Chamado Porto',
      'Protocolo',
      'Cliente',
      'CPF Cliente',
      'Telefone',
      'Categoria Serviço',
      'Cidade',
      'UF',
      'Bairro',
      'Endereço',
      'Técnico Responsável',
      'Status',
      'Data Agendada',
      'Data Conclusão',
      'KM Rodado',
      'Reembolso KM (R$)',
      'Pedágio (R$)',
      'Custo Suporte (R$)',
      'Repasse Técnico (R$)',
      'Faturamento Porto (R$)',
    ];

    const safeOrders = orders || [];
    const rows = safeOrders.map((os) => [
      os.callNumber || '',
      os.portoSeguroProtocol || '',
      os.customerName || '',
      os.customerCpf || '',
      os.customerPhone || '',
      os.serviceCategory || '',
      os.city || '',
      os.uf || '',
      os.neighborhood || '',
      `${os.addressStreet || ''}, ${os.addressNumber || ''}`,
      os.technicianName || 'Não Alocado',
      os.status || '',
      os.scheduledDate ? new Date(os.scheduledDate).toLocaleDateString('pt-BR') : '',
      os.completedAt ? new Date(os.completedAt).toLocaleDateString('pt-BR') : '',
      os.kmTraveled || 0,
      (os.kmTotalCost || 0).toFixed(2),
      (os.tollCost || 0).toFixed(2),
      (os.supportCost || 0).toFixed(2),
      (os.totalTechnicianGross || 0).toFixed(2),
      (os.faturamentoPorto || 0).toFixed(2),
    ]);

    const csv = this.convertToCsv(headers, rows);
    const filename = `Relatorio_OS_PortoSeguro_${new Date().toISOString().slice(0, 10)}.csv`;
    this.triggerDownload(csv, filename);
  }

  /**
   * Exporta Fluxo de Caixa / Movimentações Financeiras
   */
  static exportFinancialMovementsCsv(movements: FinancialMovement[]) {
    const headers = [
      'ID',
      'Data',
      'Tipo',
      'Categoria',
      'Descrição',
      'Valor (R$)',
      'Status',
      'Técnico Vinculado',
      'OS Vinculada',
      'Forma Pagamento',
    ];

    const safeMovements = movements || [];
    const rows = safeMovements.map((m) => [
      m.id,
      m.date ? new Date(m.date).toLocaleDateString('pt-BR') : '',
      m.type || '',
      m.category || '',
      m.description || '',
      (m.amount || 0).toFixed(2),
      m.status || '',
      m.technicianName || '',
      m.callNumber || '',
      m.paymentMethod || '',
    ]);

    const csv = this.convertToCsv(headers, rows);
    const filename = `Fluxo_Caixa_Higienizador_${new Date().toISOString().slice(0, 10)}.csv`;
    this.triggerDownload(csv, filename);
  }
}
