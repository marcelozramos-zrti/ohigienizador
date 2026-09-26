import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { TechnicianClosingSummary, ServiceOrder, BiweeklyClosing } from '../types';
import { isOrderInPeriod } from './closingService';

export class PdfStatementGenerator {
  /**
   * Gera um documento PDF oficial e detalhado para o fechamento quinzenal do técnico
   * com o formato exato solicitado:
   * - Cabeçalho: Logotipo O Higienizador, Nome do Técnico, Quinzena de Referência
   * - Corpo: Lista detalhada das OS filtradas da quinzena (IdChamado, Data, Tipo Visita, KM, Valor Visita, Total OS)
   * - Resumo Financeiro:
   *   (+) Soma das OS (Linha 1: (+) Soma das OS / Linha 2: (Serviços + KM + Pedágio))
   *   (+) Ajuda de Custo (ex: R$ 250,00)
   *   (=) Total Bruto
   *   (-) Vales / Descontos
   *   (-) Impostos (se aplicável, ex: 16%)
   *   (=) VALOR LÍQUIDO A RECEBER
   * - Assinaturas com quebra de página inteligente contra colisão
   * - Rodapé fixo na base da página
   */
  static generateTechnicianStatementPdf(
    summary: TechnicianClosingSummary,
    closing: BiweeklyClosing,
    orders: ServiceOrder[] | any[]
  ): { doc: jsPDF; filename: string; blobUrl: string } {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const primaryNavy = [0, 51, 102];   // #003366 (Deep Navy)
    const textDark = [15, 23, 42];      // #0F172A

    // 1. CABEÇALHO CORPORATIVO
    // Faixa Superior
    doc.setFillColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    doc.rect(0, 0, pageWidth, 6, 'F');

    // Logo & Nome da Empresa
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    doc.text('O HIGIENIZADOR', 14, 18);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text('Higienização e Impermeabilização de Estofados', 14, 23);
    doc.text('Parceiro Oficial de Atendimento: Porto Seguro Serviços', 14, 27);

    // Box do Período à direita
    doc.setFillColor(240, 249, 255);
    doc.setDrawColor(186, 230, 253);
    doc.roundedRect(pageWidth - 85, 11, 71, 19, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    doc.text('EXTRATO DE FECHAMENTO', pageWidth - 80, 16);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    const quinzenaText = `${closing.periodNumber === 1 ? '1ª Quinzena' : '2ª Quinzena'}`;
    doc.text(`Período: ${quinzenaText} (${String(closing.referenceMonth).padStart(2, '0')}/${closing.referenceYear})`, pageWidth - 80, 21);
    doc.text(`Emissão: ${new Date().toLocaleDateString('pt-BR')}`, pageWidth - 80, 25);

    // Linha divisória
    doc.setDrawColor(226, 232, 240);
    doc.line(14, 32, pageWidth - 14, 32);

    // 2. DADOS DO PRESTADOR / TÉCNICO
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    doc.text('1. DADOS DO TÉCNICO PRESTADOR', 14, 39);

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, 42, pageWidth - 28, 22, 2, 2, 'FD');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text('Nome:', 18, 48);
    doc.text('CPF:', 18, 54);
    doc.text('Telefone / WhatsApp:', 18, 60);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text(summary.technicianName, 50, 48);
    doc.text(summary.technicianCpf || '000.000.000-00', 50, 54);
    doc.text(summary.technicianPhone || '(11) 99999-9999', 50, 60);

    // Coluna 2: Chave PIX e Regra Fiscal
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text('Chave PIX:', 110, 48);
    doc.text('Banco / Conta:', 110, 54);
    doc.text('Regra Fiscal:', 110, 60);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text(`${summary.pixKey || summary.technicianCpf || 'Não informado'} (${summary.pixKeyType || 'PIX'})`, 135, 48);
    doc.text(`${summary.bankName || 'Banco'} / Ag: ${summary.bankAgency || '0001'} CC: ${summary.bankAccount || '---'}`, 135, 54);

    if (summary.hasSpecialTaxRule) {
      doc.setTextColor(180, 83, 9); // Amber
      doc.setFont('helvetica', 'bold');
      doc.text(`Regra de Exceção Ativa (${summary.taxDeductionRate || 16}% Impostos)`, 135, 60);
    } else {
      doc.setTextColor(16, 185, 129); // Emerald
      doc.setFont('helvetica', 'bold');
      doc.text('Regime Padrão (Isento de Retenção)', 135, 60);
    }

    // 3. TABELA DE ORDENS DE SERVIÇO ATENDIDAS (EXCLUSIVAMENTE DA QUINZENA)
    const safeOrders = orders || [];
    const technicianOrders = safeOrders.filter((os: any) => {
      if (!os) return false;
      // Se for formato pré-filtrado de statement.orders (onde já pertence à quinzena)
      if (os.callNumber && os.visitDate && !os.technicianId) {
        return true;
      }
      // Se for formato ServiceOrder padrão, valida técnico e quinzena de fechamento
      const matchTech = !os.technicianId || os.technicianId === summary.technicianId;
      const matchStatus = !os.status || os.status === 'COMPLETED' || os.status === 'LOST_VISIT' || (os.serviceCategory && os.serviceCategory.toLowerCase().includes('perdida'));
      const inPeriod = isOrderInPeriod(os, {
        referenceYear: closing.referenceYear,
        referenceMonth: closing.referenceMonth,
        periodNumber: closing.periodNumber,
      });
      return matchTech && matchStatus && inPeriod;
    });

    const displayCount = summary.osCount > 0 ? summary.osCount : technicianOrders.length;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    doc.text(`2. LISTA DETALHADA DE ORDENS DE SERVIÇO (${displayCount} Atendimentos)`, 14, 71);

    const tableRows = technicianOrders.map((os: any, index: number) => {
      const visitDate = os.visitDate || os.completedAt || os.scheduledDate || new Date().toISOString();
      const dateFormatted = typeof visitDate === 'string' && visitDate.includes('/')
        ? visitDate
        : new Date(visitDate).toLocaleDateString('pt-BR');
      
      const rate = Number(os.kmRateApplied ?? 0.75) || 0.75;
      const km = Number(os.kmTraveled || 0);
      const kmCost = Number(os.kmTotalCost ?? (km * rate)) || 0;
      const baseFee = Number(os.baseServiceFee || 0);
      const toll = Number(os.tollCost || 0);
      const support = Number(os.supportCost || 0);
      const totalOs = Number(os.totalOrderAmount ?? os.totalTechnicianGross ?? (baseFee + kmCost + toll + support)) || 0;

      return [
        (index + 1).toString(),
        os.callNumber || '',
        dateFormatted,
        os.serviceCategory || '',
        `${km} km (R$ ${kmCost.toFixed(2)})`,
        `R$ ${baseFee.toFixed(2)}`,
        `R$ ${totalOs.toFixed(2)}`,
      ];
    });

    autoTable(doc, {
      startY: 75,
      head: [
        ['#', 'IdChamado', 'Dt. Visita', 'Tipo Visita', 'KM / Deslocamento', 'Valor Visita', 'Total OS']
      ],
      body: tableRows.length > 0 ? tableRows : [['-', 'Nenhuma OS finalizada no período', '-', '-', '-', '-', '-']],
      styles: {
        fontSize: 7.5,
        cellPadding: 2.2,
      },
      headStyles: {
        fillColor: [0, 51, 102],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      margin: { left: 14, right: 14 },
    });

    // Posição final após a tabela
    // @ts-ignore
    let currentY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 6 : 160;

    // Se a tabela terminou muito perto do fim da folha e não cabe o Resumo Financeiro (~54mm)
    if (currentY + 54 > pageHeight - 40) {
      doc.addPage();
      currentY = 20;
    }

    // 4. RODAPÉ - RESUMO FINANCEIRO (Layout Blindado em 2 Linhas)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    doc.text('3. RESUMO FINANCEIRO DO FECHAMENTO', 14, currentY);

    const boxY = currentY + 4;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, boxY, pageWidth - 28, 48, 2, 2, 'FD');

    // 1. (+) Soma das OS (Linha 1: (+) Soma das OS / Linha 2: (Serviços + KM + Pedágio))
    const sumOfOrders = (summary.totalBaseFee || 0) + (summary.totalKmCost || 0) + (summary.totalTollCost || 0) + (summary.totalSupportCost || 0);
    const costAllowanceValue = summary.fixedCostAllowance !== undefined && summary.fixedCostAllowance !== null
      ? Number(summary.fixedCostAllowance)
      : 0.0;
    const costAllowanceLabel = summary.costAllowanceFortnight
      ? `(+) Ajuda Custo (${summary.costAllowanceFortnight}ª Qz):`
      : '(+) Ajuda de Custo:';

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    doc.text('(+) Soma das OS', 20, boxY + 7);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('(Serviços + KM + Pedágio)', 20, boxY + 11.5);

    // Valor da Soma das OS alinhado à direita com offset seguro (X=94)
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text(`R$ ${sumOfOrders.toFixed(2)}`, 94, boxY + 8.5, { align: 'right' });

    // 2. (+) Ajuda de Custo
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(costAllowanceLabel, 20, boxY + 17);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text(`R$ ${costAllowanceValue.toFixed(2)}`, 94, boxY + 17, { align: 'right' });

    // Linha divisória subtotal
    doc.setDrawColor(203, 213, 225);
    doc.line(20, boxY + 21, 94, boxY + 21);

    // (=) Total Bruto
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    doc.text('(=) TOTAL BRUTO:', 20, boxY + 27);
    doc.text(`R$ ${summary.grossTotal.toFixed(2)}`, 94, boxY + 27, { align: 'right' });

    // Divisor vertical
    doc.setDrawColor(226, 232, 240);
    doc.line(98, boxY + 5, 98, boxY + 43);

    // Coluna Direita: Deduções e Líquido
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text('(-) Vales / Adiantamentos:', 104, boxY + 8);

    const taxLabel = summary.hasSpecialTaxRule
      ? `(-) Impostos Retidos (${summary.taxDeductionRate || 16}%):`
      : '(-) Impostos Retidos (Isento):';
    doc.text(taxLabel, 104, boxY + 15);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38); // Red
    doc.text(`- R$ ${(summary.advancesDeduction || 0).toFixed(2)}`, pageWidth - 20, boxY + 8, { align: 'right' });
    doc.text(`- R$ ${(summary.taxDeductionAmount || 0).toFixed(2)}`, pageWidth - 20, boxY + 15, { align: 'right' });

    // Box Destacado: (=) VALOR LÍQUIDO A RECEBER
    doc.setFillColor(236, 253, 245); // Emerald-50
    doc.setDrawColor(167, 243, 208); // Emerald-200
    doc.roundedRect(102, boxY + 21, pageWidth - 102 - 18, 22, 2, 2, 'FD');

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(16, 185, 129);
    doc.text('(=) VALOR LÍQUIDO A RECEBER (PIX):', 106, boxY + 28);

    doc.setFontSize(12.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`R$ ${summary.netTotal.toFixed(2)}`, pageWidth - 22, boxY + 37, { align: 'right' });

    // 5. AUTENTICAÇÃO E ASSINATURAS (Proteção contra colisão com rodapé)
    currentY = boxY + 53;

    // Se o Y atual for maior que a altura da página menos 50, adiciona nova página
    if (currentY > pageHeight - 50) {
      doc.addPage();
      currentY = 25;
    }

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Extrato emitido em conformidade com as regras operacionais do Sistema Higienizador e faturamento Porto Seguro.', 14, currentY);

    // Linhas de assinatura
    const lineY = currentY + 16;
    doc.setDrawColor(148, 163, 184);
    doc.line(20, lineY, 85, lineY);
    doc.line(115, lineY, 180, lineY);

    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text('Henrique (Diretoria)', 35, lineY + 4);
    doc.text('O Higienizador Serviços Ltda', 32, lineY + 8);

    doc.text(summary.technicianName, 132, lineY + 4);
    doc.text('Técnico / Prestador Homologado', 125, lineY + 8);

    // 6. RODAPÉ INSTITUCIONAL FIXO NO FUNDO DE TODAS AS PÁGINAS (pageHeight - 10)
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text(
        'Sistema Higienizador - Gestão Integrada Porto Seguro | www.ohigienizador.com.br',
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      );
      doc.text(`Página ${i} de ${totalPages}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
    }

    const safeTechName = (summary.technicianName || 'Tecnico').replace(/\s+/g, '_');
    const filename = `Extrato_Quinzenal_${safeTechName}_${closing.periodNumber === 1 ? '1Q' : '2Q'}_${closing.referenceMonth}_${closing.referenceYear}.pdf`;
    const blobUrl = doc.output('bloburl');

    return { doc, filename, blobUrl: typeof blobUrl === 'string' ? blobUrl : '' };
  }
}

