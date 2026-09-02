import React, { useState, useMemo } from 'react';
import {
  Calendar,
  FileSpreadsheet,
  FileDown,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  TrendingDown,
  TrendingUp,
  Percent,
  PlusCircle,
  FileText,
  Shield,
  Layers,
  Search,
  Filter,
  Users,
  MapPin,
  Car,
  Download,
  Eye,
  CheckCircle,
  Clock,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { TechnicianClosingSummary, ServiceOrder } from '../types';
import { WhatsAppDispatchModal } from './WhatsAppDispatchModal';
import { CsvExportService } from '../services/csvExportService';
import { isOrderInPeriod } from '../services/closingService';

interface FinancialClosingViewProps {
  onOpenNewAdvance: () => void;
}

export const FinancialClosingView: React.FC<FinancialClosingViewProps> = ({
  onOpenNewAdvance,
}) => {
  const {
    currentClosing,
    selectedMonth,
    setSelectedMonth,
    selectedYear,
    setSelectedYear,
    selectedPeriod,
    setSelectedPeriod,
    exportClosingCsv,
    generatePdfForTechnician,
    dispatchWhatsAppStatement,
    settleOrderPayment,
    reassignOrderTechnician,
    batchReassignTechnician,
    autoRepairOrders,
    reloadAllData,
    orders = [],
    users = [],
    movements = [],
    addToast,
  } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<'datagrid' | 'technicians' | 'summary'>('datagrid');
  const [selectedTechForWhatsApp, setSelectedTechForWhatsApp] = useState<TechnicianClosingSummary | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [batchTargetTechId, setBatchTargetTechId] = useState<string>('');
  const [isBatchAssigning, setIsBatchAssigning] = useState<boolean>(false);

  // Filters state (Query Panel)
  const [filterTechnicianId, setFilterTechnicianId] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];

  const safeOrders = orders || [];
  const safeUsers = users || [];
  const safeMovements = movements || [];

  const techniciansList = useMemo(() => {
    return safeUsers.filter((u) => u && u.role === 'TECHNICIAN' && u.isActive);
  }, [safeUsers]);

  // Unallocated Orders in the selected period
  const unallocatedOrdersInPeriod = useMemo(() => {
    return safeOrders.filter((os) => {
      if (!os) return false;
      if (
        !isOrderInPeriod(os, {
          referenceYear: selectedYear,
          referenceMonth: selectedMonth,
          periodNumber: selectedPeriod,
        })
      ) {
        return false;
      }
      const matched = safeUsers.find((u) => u.id === os.technicianId || (os.technicianName && u.name.toLowerCase() === os.technicianName.toLowerCase()));
      const displayName = matched?.name || os.technicianName;
      return !displayName || displayName === 'Não Alocado' || !os.technicianId || os.technicianId === 'tech-1';
    });
  }, [safeOrders, selectedYear, selectedMonth, selectedPeriod, safeUsers]);

  // Filtered Orders for the DataGrid (Visualização Operacional: Respeita o filtro de status selecionado no período)
  const filteredOrders = useMemo(() => {
    return safeOrders.filter((os) => {
      if (!os) return false;

      // 1. Period Filter: Year, Month, and Quinzena (1: 01-15, 2: 16-end)
      if (
        !isOrderInPeriod(os, {
          referenceYear: selectedYear,
          referenceMonth: selectedMonth,
          periodNumber: selectedPeriod,
        })
      ) {
        return false;
      }

      // 2. Status Filter: Se 'ALL', exibe todos os status; se específico, filtra exatamente
      if (filterStatus !== 'ALL' && os.status !== filterStatus) {
        return false;
      }

      // 3. Filter by Technician
      if (filterTechnicianId === 'UNASSIGNED') {
        const matched = safeUsers.find((u) => u.id === os.technicianId || (os.technicianName && u.name.toLowerCase() === os.technicianName.toLowerCase()));
        const displayName = matched?.name || os.technicianName;
        if (displayName && displayName !== 'Não Alocado' && os.technicianId && os.technicianId !== 'tech-1') {
          return false;
        }
      } else if (filterTechnicianId !== 'ALL' && os.technicianId !== filterTechnicianId) {
        return false;
      }

      // 4. Filter by Payment Status (Quitação)
      const payStatus = os.paymentStatus || 'PENDING';
      if (filterPaymentStatus !== 'ALL' && payStatus !== filterPaymentStatus) {
        return false;
      }

      // 5. Search Query (PowerQuery multi-criteria ; support)
      if (searchQuery.trim() !== '') {
        const terms = searchQuery
          .toLowerCase()
          .split(';')
          .map((t) => t.trim())
          .filter(Boolean);

        const orderText = [
          os.callNumber,
          os.customerName,
          os.city,
          os.uf,
          os.neighborhood,
          os.serviceCategory,
          os.technicianName,
          os.status,
          os.paymentStatus === 'PAID' ? 'pago' : 'pendente',
          os.scheduledDate,
          os.completedAt,
          String(os.baseServiceFee || 0),
          String(os.kmTraveled || 0),
          os.isVisitFeeOnly ? 'visita' : 'atendimento',
        ]
          .join(' ')
          .toLowerCase();

        const matchesAllTerms = terms.every((term) => orderText.includes(term));
        if (!matchesAllTerms) return false;
      }

      return true;
    });
  }, [
    safeOrders,
    selectedYear,
    selectedMonth,
    selectedPeriod,
    filterStatus,
    filterTechnicianId,
    filterPaymentStatus,
    searchQuery,
  ]);

  const currentPeriodLabel =
    selectedPeriod === 0
      ? `Todas as Quinzenas (${monthNames[selectedMonth - 1] || 'Agosto'}/${selectedYear})`
      : `${selectedPeriod}ª Quinzena (${monthNames[selectedMonth - 1] || 'Agosto'}/${selectedYear})`;

  // Handle Quitação ("Dar Baixa" / "Reverter")
  const handleTogglePayment = async (orderId: string, currentStatus?: 'PAID' | 'PENDING') => {
    try {
      setActionLoadingId(orderId);
      const nextStatus = currentStatus === 'PAID' ? 'PENDING' : 'PAID';
      await settleOrderPayment(orderId, nextStatus);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Export Closing DataGrid CSV with exact columns
  const handleExportDataGridCsv = () => {
    CsvExportService.exportClosingDataGridCsv(filteredOrders, currentPeriodLabel);
    addToast(
      'Exportação Concluída',
      `O arquivo CSV com as colunas de fechamento foi gerado com sucesso (${filteredOrders.length} registros).`,
      'success'
    );
  };

  // Cálculos financeiros dinâmicos e reativos para os KPI Cards
  const dynamicFinancialMetrics = useMemo(() => {
    // 1. Ordens concluídas no período de referência (Mês, Ano e Quinzena) - inclui visitas perdidas que são remuneradas
    const periodCompletedOrders = safeOrders.filter(
      (os) =>
        os &&
        (os.status === 'COMPLETED' ||
          (os as any).statusOS === 'COMPLETED' ||
          os.status === 'VISITA_PERDIDA' ||
          (os.serviceCategory && os.serviceCategory.toLowerCase().includes('perdida'))) &&
        isOrderInPeriod(os, {
          referenceYear: selectedYear,
          referenceMonth: selectedMonth,
          periodNumber: selectedPeriod,
        })
    );

    // Se o usuário selecionou um técnico específico no filtro do DataGrid
    const isFilteredByTech = filterTechnicianId !== 'ALL';

    const kpiOrders = isFilteredByTech
      ? periodCompletedOrders.filter((os) => os.technicianId === filterTechnicianId)
      : periodCompletedOrders;

    // Faturamento Porto
    const totalFaturamentoPorto = kpiOrders.reduce((sum, os) => {
      const fat = os.faturamentoPorto;
      if (fat !== undefined && fat !== null && fat > 0) return sum + fat;
      const kmCost = os.kmTotalCost ?? Number(((os.kmTraveled || 0) * 0.50).toFixed(2));
      let base = Number(os.baseServiceFee ?? 0);
      if (base <= 0 && (os.serviceCategory?.toLowerCase().includes('perdida') || (os.status as string)?.toLowerCase().includes('perdida'))) {
        base = 20;
      }
      return sum + base + kmCost + (os.tollCost || 0) + (os.supportCost || 0);
    }, 0);

    // Soma das ordens de serviço (Base + KM + Pedágio + Suporte)
    const totalOrdersAmount = kpiOrders.reduce((acc, os) => {
      const kmCost = os.kmTotalCost ?? Number(((os.kmTraveled || 0) * 0.50).toFixed(2));
      let base = Number(os.baseServiceFee ?? 0);
      if (base <= 0 && (os.serviceCategory?.toLowerCase().includes('perdida') || (os.status as string)?.toLowerCase().includes('perdida'))) {
        base = 20;
      }
      return acc + base + kmCost + (os.tollCost || 0) + (os.supportCost || 0);
    }, 0);

    let totalCostAllowances = 0;
    let totalAdvances = 0;
    let totalTaxes = 0;

    if (isFilteredByTech) {
      const tech = safeUsers.find((u) => u.id === filterTechnicianId);
      const allowance =
        tech?.baseCostAllowance !== undefined && tech?.baseCostAllowance !== null
          ? Number(tech.baseCostAllowance)
          : (tech?.role === 'TECHNICIAN' ? 250 : 0);

      totalCostAllowances = allowance;

      // Vales do técnico no período
      const techAdvances = safeMovements.filter(
        (m) =>
          m &&
          m.technicianId === filterTechnicianId &&
          (m.type === 'ADVANCE_VALE' || m.type === 'EXPENSE_ADVANCE') &&
          m.status === 'CONFIRMED'
      );
      totalAdvances = techAdvances.reduce((acc, m) => acc + (m.amount || 0), 0);

      // Regra fiscal
      const gross = totalOrdersAmount + totalCostAllowances;
      if (tech?.hasSpecialTaxRule) {
        const rate = tech.specialTaxRate || 16;
        totalTaxes = Number((gross * (rate / 100)).toFixed(2));
      }
    } else {
      // Identifica os técnicos únicos com ordens concluídas no período
      const activeTechIds = new Set(periodCompletedOrders.map((os) => os.technicianId).filter(Boolean));

      activeTechIds.forEach((techId) => {
        const tech = safeUsers.find((u) => u.id === techId);
        const allowance =
          tech?.baseCostAllowance !== undefined && tech?.baseCostAllowance !== null
            ? Number(tech.baseCostAllowance)
            : (tech?.role === 'TECHNICIAN' ? 250 : 0);

        totalCostAllowances += allowance;

        // Vales
        const techAdvances = safeMovements.filter(
          (m) =>
            m &&
            m.technicianId === techId &&
            (m.type === 'ADVANCE_VALE' || m.type === 'EXPENSE_ADVANCE') &&
            m.status === 'CONFIRMED'
        );
        totalAdvances += techAdvances.reduce((acc, m) => acc + (m.amount || 0), 0);

        // Impostos
        if (tech?.hasSpecialTaxRule) {
          const techOrders = periodCompletedOrders.filter((os) => os.technicianId === techId);
          const techOrdersSum = techOrders.reduce((acc, os) => {
            const kmCost = os.kmTotalCost ?? Number(((os.kmTraveled || 0) * 0.50).toFixed(2));
            return acc + (os.baseServiceFee || 0) + kmCost + (os.tollCost || 0) + (os.supportCost || 0);
          }, 0);
          const techGross = techOrdersSum + allowance;
          const rate = tech.specialTaxRate || 16;
          totalTaxes += Number((techGross * (rate / 100)).toFixed(2));
        }
      });
    }

    const totalTechnicianGross = Number((totalOrdersAmount + totalCostAllowances).toFixed(2));
    const totalDeductions = Number((totalAdvances + totalTaxes).toFixed(2));
    const totalNetPayout = Math.max(0, Number((totalTechnicianGross - totalDeductions).toFixed(2)));

    return {
      totalFaturamentoPorto: Number(totalFaturamentoPorto.toFixed(2)),
      totalTechnicianGross,
      totalCostAllowances,
      totalAdvancesDeducted: Number(totalAdvances.toFixed(2)),
      totalTaxesDeducted: Number(totalTaxes.toFixed(2)),
      totalNetPayout,
    };
  }, [safeOrders, safeUsers, safeMovements, selectedYear, selectedMonth, selectedPeriod, filterTechnicianId]);

  const technicianSummaries = currentClosing?.technicianSummaries || [];

  const availableOrderPeriods = useMemo(() => {
    const counts: Record<string, { year: number; month: number; period: 1 | 2; count: number; monthName: string }> = {};
    safeOrders.forEach((os) => {
      const dateStr = os.completedAt || os.scheduledDate || os.startedAt || '';
      if (dateStr) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = d.getMonth() + 1;
          const day = d.getDate();
          const p: 1 | 2 = day <= 15 ? 1 : 2;
          const key = `${y}-${m}-${p}`;
          if (!counts[key]) {
            counts[key] = {
              year: y,
              month: m,
              period: p,
              count: 0,
              monthName: monthNames[m - 1] || `Mês ${m}`,
            };
          }
          counts[key].count++;
        }
      }
    });
    return Object.values(counts).sort((a, b) => b.year - a.year || b.month - a.month || b.period - a.period);
  }, [safeOrders]);

  const paidOrdersCount = filteredOrders.filter((o) => o.paymentStatus === 'PAID').length;
  const pendingOrdersCount = filteredOrders.length - paidOrdersCount;

  return (
    <div className="space-y-6">
      {/* Period Notice Banner if current period is empty but orders exist in other periods */}
      {filteredOrders.length === 0 && availableOrderPeriods.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-lg shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-amber-900">
                Nenhuma ordem encontrada para o período selecionado ({currentPeriodLabel}).
              </p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                Existem ordens registradas em outros períodos. Clique abaixo para alternar rapidamente:
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {availableOrderPeriods.map((ap) => (
              <button
                key={`${ap.year}-${ap.month}-${ap.period}`}
                onClick={() => {
                  setSelectedYear(ap.year);
                  setSelectedMonth(ap.month);
                  setSelectedPeriod(ap.period);
                }}
                className="px-3 py-1.5 text-xs font-bold bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                {ap.period}ª Qz {ap.monthName}/{ap.year} ({ap.count} OS)
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 5 High-Density Executive Financial KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Card 1: Receita Faturada Porto Seguro */}
        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs hover:shadow-md transition-all cursor-pointer">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Faturamento Porto</span>
            <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-xl sm:text-2xl font-black text-[#003366] font-mono">
              R$ {dynamicFinancialMetrics.totalFaturamentoPorto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-emerald-700 font-medium truncate">
            Seguradora Porto
          </div>
        </div>

        {/* Card 2: Total de Chamados no Período */}
        <div
          onClick={() => setFilterStatus(filterStatus === 'COMPLETED' ? 'ALL' : 'COMPLETED')}
          className={`bg-white rounded-xl p-3 border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
            filterStatus === 'COMPLETED' ? 'border-cyan-500 ring-2 ring-cyan-400/30 bg-cyan-50/20' : 'border-slate-200'
          }`}
          title="Clique para filtrar Chamados no Período"
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Chamados no Período</span>
            <div className="p-1.5 rounded-lg bg-cyan-50 text-[#003366]">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-black text-slate-900">{filteredOrders.length}</span>
            <span className="text-[10px] text-slate-500 font-medium">ordens</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500 font-medium truncate">
            {paidOrdersCount} Pagos • {pendingOrdersCount} Pendentes
          </div>
        </div>

        {/* Card 3: Repasses Brutos aos Técnicos */}
        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs hover:shadow-md transition-all cursor-pointer">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Repasses Técnicos</span>
            <div className="p-1.5 rounded-lg bg-blue-50 text-[#003366]">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-xl sm:text-2xl font-black text-slate-800 font-mono">
              R$ {dynamicFinancialMetrics.totalTechnicianGross.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500 font-medium truncate">
            Base + KM + Ajuda Custo
          </div>
        </div>

        {/* Card 4: Deduções: Vales + Retenção 16% */}
        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs hover:shadow-md transition-all cursor-pointer">
          <div className="flex items-center justify-between text-red-700 mb-1">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Deduções (Vales/Impostos)</span>
            <div className="p-1.5 rounded-lg bg-red-100 text-red-800">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-xl sm:text-2xl font-black text-red-600 font-mono">
              -R$ {(dynamicFinancialMetrics.totalAdvancesDeducted + dynamicFinancialMetrics.totalTaxesDeducted).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-red-700 font-medium truncate">
            Vales e Retenção 16%
          </div>
        </div>

        {/* Card 5: Total Líquido a Transferir PIX */}
        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs hover:shadow-md transition-all cursor-pointer">
          <div className="flex items-center justify-between text-emerald-700 mb-1">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Líquido a Transferir</span>
            <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-xl sm:text-2xl font-black text-emerald-600 font-mono">
              R$ {dynamicFinancialMetrics.totalNetPayout.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-emerald-700 font-medium truncate">
            Pronto para PIX
          </div>
        </div>
      </div>

      {/* Query Filter Panel - Posicionado ANTES da barra de sub-abas e exportação */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-cyan-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Painel de Filtros e Busca (Query)
            </h3>
          </div>
          <button
            onClick={() => {
              setFilterTechnicianId('ALL');
              setFilterStatus('ALL');
              setFilterPaymentStatus('ALL');
              setSearchQuery('');
            }}
            className="text-[11px] text-cyan-700 hover:underline font-bold cursor-pointer"
          >
            Limpar Filtros
          </button>
        </div>

        {/* Painel de Filtros em 2 Linhas */}
        <div className="space-y-3">
          {/* Linha 1: Dropdown de Técnico, Dropdown de Status da OS e Seletores de Quinzena, Mês e Ano */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            {/* Filtro por Técnico (4 cols) */}
            <div className="md:col-span-4">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                Filtrar por Técnico
              </label>
              <select
                id="query-technician-select"
                value={filterTechnicianId}
                onChange={(e) => setFilterTechnicianId(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              >
                <option value="ALL">Todos os Técnicos</option>
                <option value="UNASSIGNED">⚠️ Ordens Não Alocadas ({unallocatedOrdersInPeriod.length})</option>
                {techniciansList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.hasSpecialTaxRule ? '(Regra 16% Impostos)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Filtro por Status da OS (3 cols) */}
            <div className="md:col-span-3">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                Status da OS
              </label>
              <select
                id="query-status-select"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              >
                <option value="ALL">Todos os Status</option>
                <option value="COMPLETED">Finalizadas (COMPLETED) [Elegíveis Fechamento]</option>
                <option value="IN_PROGRESS">Em Andamento (IN_PROGRESS)</option>
                <option value="PENDING">Pendentes (PENDING)</option>
                <option value="CANCELLED">Canceladas (CANCELLED)</option>
              </select>
            </div>

            {/* Seletores de Quinzena, Mês e Ano (5 cols) */}
            <div className="md:col-span-5">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                Período (Quinzena, Mês, Ano)
              </label>
              <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
                {/* Period Toggle */}
                <div className="flex bg-slate-100 rounded-lg p-0.5 border border-slate-200 shrink-0">
                  <button
                    id="period-q1-btn"
                    type="button"
                    onClick={() => setSelectedPeriod(1)}
                    className={`px-2 py-1 text-xs font-bold rounded-md transition-all cursor-pointer whitespace-nowrap ${
                      selectedPeriod === 1
                        ? 'bg-[#003366] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    1ª Qnz (01-15)
                  </button>
                  <button
                    id="period-q2-btn"
                    type="button"
                    onClick={() => setSelectedPeriod(2)}
                    className={`px-2 py-1 text-xs font-bold rounded-md transition-all cursor-pointer whitespace-nowrap ${
                      selectedPeriod === 2
                        ? 'bg-[#003366] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    2ª Qnz (16-fim)
                  </button>
                  <button
                    id="period-all-btn"
                    type="button"
                    onClick={() => setSelectedPeriod(0)}
                    className={`px-2 py-1 text-xs font-bold rounded-md transition-all cursor-pointer whitespace-nowrap ${
                      selectedPeriod === 0
                        ? 'bg-[#003366] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Todas
                  </button>
                </div>

                {/* Month Selector */}
                <select
                  id="closing-month-select"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 shadow-xs cursor-pointer focus:bg-white focus:ring-2 focus:ring-cyan-500 focus:outline-none flex-1 min-w-[95px]"
                >
                  {monthNames.map((m, idx) => (
                    <option key={idx} value={idx + 1}>
                      {m}
                    </option>
                  ))}
                </select>

                {/* Year Selector */}
                <select
                  id="closing-year-select"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 shadow-xs cursor-pointer focus:bg-white focus:ring-2 focus:ring-cyan-500 focus:outline-none w-20 shrink-0"
                >
                  <option value={2025}>2025</option>
                  <option value={2026}>2026</option>
                  <option value={2027}>2027</option>
                </select>
              </div>
            </div>
          </div>

          {/* Linha 2: Dropdown de Pagamento e Input de Busca Textual Rápida */}
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            {/* Filtro por Status de Quitação */}
            <div className="w-full sm:w-64 shrink-0">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                Status de Pagamento (Quitação)
              </label>
              <select
                id="query-payment-status-select"
                value={filterPaymentStatus}
                onChange={(e) => setFilterPaymentStatus(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              >
                <option value="ALL">Todos (Pagos e Pendentes)</option>
                <option value="PAID">Apenas Pagos (PAGO)</option>
                <option value="PENDING">Apenas Pendentes (PENDENTE)</option>
              </select>
            </div>

            {/* Busca Textual que estica com flex-grow */}
            <div className="flex-1 w-full">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                Busca Textual Rápida (PowerQuery)
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  id="query-search-input"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Nº chamado, cliente, bairro, cidade, técnico... (separe por ;)"
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Subtabs Switcher: DataGrid vs Extrato Consolidado + Botão Exportar CSV */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex items-center space-x-2">
          <button
            id="tab-view-datagrid"
            onClick={() => setActiveSubTab('datagrid')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'datagrid'
                ? 'bg-[#003366] text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-cyan-300" />
            <span>DataGrid</span>
            <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">
              {filteredOrders.length}
            </span>
          </button>

          <button
            id="tab-view-technicians"
            onClick={() => setActiveSubTab('technicians')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'technicians'
                ? 'bg-[#003366] text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Users className="w-4 h-4 text-cyan-300" />
            <span>Extrato</span>
            <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">
              {technicianSummaries.length}
            </span>
          </button>
        </div>

        {/* Direct Export CSV Button */}
        <div className="flex items-center gap-2">
          {activeSubTab === 'datagrid' ? (
            <button
              id="export-datagrid-csv-btn"
              onClick={handleExportDataGridCsv}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg shadow-xs transition-all cursor-pointer"
            >
              <FileDown className="w-4 h-4 text-emerald-200" />
              <span>Exportar CSV (DataGrid 17 Colunas)</span>
            </button>
          ) : (
            <button
              id="export-directoria-csv-btn"
              onClick={exportClosingCsv}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg shadow-xs transition-all cursor-pointer"
            >
              <FileDown className="w-4 h-4 text-emerald-200" />
              <span>Exportar Fechamento Diretoria (CSV)</span>
            </button>
          )}
        </div>
      </div>

      {/* SUBTAB 1: DataGrid Completo */}
      {activeSubTab === 'datagrid' && (
        <div className="space-y-4">

          {/* Banner de Ação Rápida para Ordens Não Alocadas */}
          {unallocatedOrdersInPeriod.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800 shrink-0 font-bold text-sm">
                  ⚠️
                </div>
                <div>
                  <h4 className="text-xs font-bold text-amber-950">
                    Atenção: Existem {unallocatedOrdersInPeriod.length} Ordem(ns) de Serviço Não Alocadas neste período
                  </h4>
                  <p className="text-[11px] text-amber-800">
                    Ordens sem técnico vinculado não entram nos extratos individuais nem nos repasses quinzenais. Vincule-as abaixo:
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={batchTargetTechId}
                  onChange={(e) => setBatchTargetTechId(e.target.value)}
                  className="p-1.5 bg-white border border-amber-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="">Selecione o Técnico Destino...</option>
                  {techniciansList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={!batchTargetTechId || isBatchAssigning}
                  onClick={async () => {
                    if (!batchTargetTechId) return;
                    try {
                      setIsBatchAssigning(true);
                      const idsToAssign = unallocatedOrdersInPeriod.map((o) => o.id);
                      await batchReassignTechnician(idsToAssign, batchTargetTechId);
                    } finally {
                      setIsBatchAssigning(false);
                      setBatchTargetTechId('');
                    }
                  }}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isBatchAssigning ? 'Vinculando...' : `Atribuir Todas as ${unallocatedOrdersInPeriod.length} OSs`}
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    await autoRepairOrders();
                  }}
                  className="px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
                  title="Detecta e vincula automaticamente ordens órfãs ao técnico principal"
                >
                  Auto-Vincular
                </button>
              </div>
            </div>
          )}

          {/* DataGrid Table with Complete Columns & Quitação Controls */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-cyan-600" />
                <h3 className="text-xs font-bold text-slate-800">
                  DataGrid de Ordens de Serviço ({filteredOrders.length} OSs no Período)
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                <span className="text-cyan-800 bg-cyan-50 px-2 py-0.5 rounded border border-cyan-200">
                  {filteredOrders.filter((o) => o.status === 'COMPLETED').length} Concluídas (Elegíveis)
                </span>
                {filteredOrders.filter((o) => o.status !== 'COMPLETED').length > 0 && (
                  <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    {filteredOrders.filter((o) => o.status !== 'COMPLETED').length} Não Concluídas (R$ 0,00 no Fechamento)
                  </span>
                )}
                <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {paidOrdersCount} Pagos
                </span>
                <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  {pendingOrdersCount} Pendentes
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#003366] text-white uppercase font-bold text-[9px] tracking-wider sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3 border-r border-[#004080]">Origem</th>
                    <th className="py-2.5 px-3 border-r border-[#004080]">IdChamado</th>
                    <th className="py-2.5 px-3 border-r border-[#004080]">Dt.Visita</th>
                    <th className="py-2.5 px-3 border-r border-[#004080]">Periodo</th>
                    <th className="py-2.5 px-3 border-r border-[#004080]">Tipo Visita</th>
                    <th className="py-2.5 px-3 border-r border-[#004080]">Prestador</th>
                    <th className="py-2.5 px-3 border-r border-[#004080]">Status OS</th>
                    <th className="py-2.5 px-3 border-r border-[#004080]">Tecnico</th>
                    <th className="py-2.5 px-3 border-r border-[#004080]">Status Mobile</th>
                    <th className="py-2.5 px-3 border-r border-[#004080]">Cidade</th>
                    <th className="py-2.5 px-3 border-r border-[#004080]">UF</th>
                    <th className="py-2.5 px-3 border-r border-[#004080]">CEP</th>
                    <th className="py-2.5 px-3 border-r border-[#004080]">Bairro</th>
                    <th className="py-2.5 px-3 border-r border-[#004080] text-center">KM</th>
                    <th className="py-2.5 px-3 border-r border-[#004080]">Pedágio</th>
                    <th className="py-2.5 px-3 border-r border-[#004080]">Valor da Visita</th>
                    <th className="py-2.5 px-3 bg-cyan-700 text-white font-extrabold text-right border-r border-[#004080]">Total</th>
                    <th className="py-2.5 px-3 border-r border-[#004080] text-center">Status Pagto</th>
                    <th className="py-2.5 px-3 border-r border-[#004080] text-center">Data Pagto</th>
                    <th className="py-2.5 px-3 bg-[#00264d] text-white font-extrabold text-center">Ações / Quitação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredOrders.map((os, idx) => {
                    const visitDate = os.completedAt || os.scheduledDate || new Date().toISOString();
                    const dateFormatted = new Date(visitDate).toLocaleDateString('pt-BR');
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

                    const isPaid = os.paymentStatus === 'PAID';
                    const isLoading = actionLoadingId === os.id;

                    const matchedTech = safeUsers.find((u) => u.id === os.technicianId || (os.technicianName && u.name.toLowerCase() === os.technicianName.toLowerCase()));
                    const displayName = matchedTech?.name || os.technicianName || null;
                    const isUnallocated = !displayName || displayName === 'Não Alocado';

                    return (
                      <tr
                        key={os.id || idx}
                        className={`hover:bg-cyan-50/50 transition-colors ${
                          idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                        }`}
                      >
                        {/* 1. Origem */}
                        <td className="py-2.5 px-3 text-slate-700 font-bold border-r border-slate-100 whitespace-nowrap">
                          Porto Seguro
                        </td>

                        {/* 2. IdChamado */}
                        <td className="py-2.5 px-3 font-mono font-bold text-[#003366] border-r border-slate-100 whitespace-nowrap">
                          {os.callNumber}
                        </td>

                        {/* 3. Dt.Visita */}
                        <td className="py-2.5 px-3 text-slate-600 border-r border-slate-100 whitespace-nowrap">
                          {dateFormatted}
                        </td>

                        {/* 4. Periodo */}
                        <td className="py-2.5 px-3 text-slate-600 border-r border-slate-100 whitespace-nowrap">
                          {currentPeriodLabel}
                        </td>

                        {/* 5. Tipo Visita */}
                        <td className="py-2.5 px-3 text-slate-900 font-medium border-r border-slate-100">
                          {os.serviceCategory}
                        </td>

                        {/* 6. Prestador */}
                        <td className="py-2.5 px-3 text-slate-700 font-semibold border-r border-slate-100 whitespace-nowrap">
                          O Higienizador
                        </td>

                        {/* 7. Status */}
                        <td className="py-2.5 px-3 border-r border-slate-100 whitespace-nowrap">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              os.status === 'COMPLETED'
                                ? 'bg-green-100 text-green-800'
                                : os.status === 'IN_PROGRESS'
                                ? 'bg-amber-100 text-amber-800'
                                : os.status === 'CANCELLED'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {os.status}
                          </span>
                        </td>

                        {/* 8. Tecnico (Smart Direct Selector & Badge) */}
                        <td className="py-2.5 px-3 font-bold text-slate-900 border-r border-slate-100 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <select
                              value={matchedTech?.id || os.technicianId || ''}
                              onChange={async (e) => {
                                const newTechId = e.target.value;
                                if (newTechId) {
                                  await reassignOrderTechnician(os.id, newTechId);
                                }
                              }}
                              className={`text-[11px] font-bold py-1 px-2 rounded-lg border transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                                isUnallocated
                                  ? 'bg-amber-50 text-amber-900 border-amber-300 font-semibold ring-1 ring-amber-400/50'
                                  : 'bg-slate-50 text-slate-900 border-slate-200 hover:bg-cyan-50 hover:border-cyan-300'
                              }`}
                              title="Clique para alterar ou vincular o técnico responsável desta OS"
                            >
                              {isUnallocated && <option value="">⚠️ Não Alocado (Selecione)</option>}
                              {techniciansList.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>

                            {matchedTech && (
                              (() => {
                                const allowance =
                                  matchedTech.baseCostAllowance !== undefined && matchedTech.baseCostAllowance !== null
                                    ? Number(matchedTech.baseCostAllowance)
                                    : (matchedTech.role === 'TECHNICIAN' ? 250 : null);
                                if (allowance !== null && allowance !== undefined) {
                                  return (
                                    <span
                                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      title={`Ajuda de Custo cadastrada no perfil: R$ ${allowance.toFixed(2)}`}
                                    >
                                      +R${allowance.toFixed(0)}
                                    </span>
                                  );
                                }
                                return null;
                              })()
                            )}
                          </div>
                        </td>

                        {/* 9. Status Mobile */}
                        <td className="py-2.5 px-3 text-slate-600 border-r border-slate-100 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                os.status === 'COMPLETED'
                                  ? 'bg-emerald-500'
                                  : os.status === 'IN_PROGRESS'
                                  ? 'bg-amber-500'
                                  : 'bg-slate-400'
                              }`}
                            />
                            {mobileStatus}
                          </span>
                        </td>

                        {/* 10. Cidade */}
                        <td className="py-2.5 px-3 text-slate-700 border-r border-slate-100 whitespace-nowrap">
                          {os.city || 'São Paulo'}
                        </td>

                        {/* 11. UF */}
                        <td className="py-2.5 px-3 text-slate-600 border-r border-slate-100">
                          {os.uf || 'SP'}
                        </td>

                        {/* 12. CEP */}
                        <td className="py-2.5 px-3 font-mono text-slate-500 border-r border-slate-100 whitespace-nowrap">
                          {os.postalCode || '---'}
                        </td>

                        {/* 13. Bairro */}
                        <td className="py-2.5 px-3 text-slate-700 border-r border-slate-100 whitespace-nowrap">
                          {os.neighborhood || '---'}
                        </td>

                        {/* 14. KM */}
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800 border-r border-slate-100">
                          {km}
                        </td>

                        {/* 15. Pedágio */}
                        <td className="py-2.5 px-3 text-slate-700 border-r border-slate-100 whitespace-nowrap font-mono">
                          R$ {toll.toFixed(2)}
                        </td>

                        {/* 16. Valor da Visita */}
                        <td className="py-2.5 px-3 font-semibold text-slate-800 border-r border-slate-100 whitespace-nowrap font-mono">
                          R$ {baseFee.toFixed(2)}
                        </td>

                        {/* 17. Total */}
                        <td className="py-2.5 px-3 font-black text-[#003366] bg-cyan-50/80 text-right whitespace-nowrap font-mono border-r border-slate-100">
                          <div>R$ {totalOs.toFixed(2)}</div>
                          {os.status === 'CANCELLED' && !os.serviceCategory?.toLowerCase().includes('perdida') && (
                            <div className="text-[8px] font-bold text-amber-600 tracking-tight uppercase">
                              Cancelado (R$ 0,00)
                            </div>
                          )}
                        </td>

                        {/* 18. Status Pagto */}
                        <td className="py-2.5 px-3 border-r border-slate-100 whitespace-nowrap text-center">
                          {os.status === 'CANCELLED' && !os.serviceCategory?.toLowerCase().includes('perdida') ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200" title="Chamado cancelado não é elegível para pagamento">
                              Cancelado
                            </span>
                          ) : isPaid ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              PAGO
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
                              <Clock className="w-3 h-3 text-amber-600" />
                              PENDENTE
                            </span>
                          )}
                        </td>

                        {/* 19. Data Pagto */}
                        <td className="py-2.5 px-3 text-slate-600 border-r border-slate-100 whitespace-nowrap text-center font-mono text-[11px]">
                          {os.status === 'COMPLETED' && os.paymentDate ? (
                            <span>
                              {new Date(os.paymentDate).toLocaleDateString('pt-BR')}{' '}
                              <span className="text-[10px] text-slate-400">
                                {new Date(os.paymentDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </span>
                          ) : (
                            <span className="text-slate-400 font-sans italic text-[10px]">-</span>
                          )}
                        </td>

                        {/* 20. Ações / Quitação */}
                        <td className="py-2 px-3 text-center whitespace-nowrap">
                          {os.status !== 'COMPLETED' ? (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-slate-400 bg-slate-50 border border-slate-200 rounded-md cursor-not-allowed"
                              title="Apenas chamados finalizados (COMPLETED) geram repasse ao técnico e podem receber baixa de pagamento"
                            >
                              <Clock className="w-3 h-3 text-slate-400" />
                              Aguardando Conclusão
                            </span>
                          ) : isPaid ? (
                            <button
                              id={`revert-payment-${os.id}`}
                              disabled={isLoading}
                              onClick={() => handleTogglePayment(os.id, 'PAID')}
                              title="Clique para estornar o pagamento deste chamado para PENDENTE"
                              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-slate-600 hover:text-red-700 bg-slate-100 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-md transition-all cursor-pointer disabled:opacity-50"
                            >
                              {isLoading ? (
                                <span className="animate-spin inline-block w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full" />
                              ) : (
                                <RotateCcw className="w-3 h-3 text-slate-500" />
                              )}
                              <span>Estornar</span>
                            </button>
                          ) : (
                            <button
                              id={`settle-payment-${os.id}`}
                              disabled={isLoading}
                              onClick={() => handleTogglePayment(os.id, 'PENDING')}
                              title="Dar baixa e marcar como PAGO para este técnico"
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 rounded-md shadow-xs transition-all cursor-pointer disabled:opacity-50"
                            >
                              {isLoading ? (
                                <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                              ) : (
                                <DollarSign className="w-3 h-3 text-emerald-200" />
                              )}
                              <span>Dar Baixa</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {filteredOrders.length === 0 && (
                    <tr>
                      <td colSpan={20} className="py-8 text-center text-slate-400">
                        Nenhuma Ordem de Serviço encontrada para {currentPeriodLabel}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer Summary Row */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <span>
                  Total no DataGrid: <strong>{filteredOrders.length}</strong>
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-cyan-800 font-semibold">
                  Concluídas (Elegíveis): <strong>{filteredOrders.filter((o) => o.status === 'COMPLETED').length}</strong>
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-emerald-700 font-semibold">
                  Quitados: <strong>{paidOrdersCount}</strong>
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-slate-600 font-semibold">
                  Pendentes: <strong>{pendingOrdersCount}</strong>
                </span>
                {filteredOrders.filter((o) => o.status !== 'COMPLETED').length > 0 && (
                  <>
                    <span className="text-slate-300">|</span>
                    <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-medium">
                      ({filteredOrders.filter((o) => o.status !== 'COMPLETED').length} OS(s) em aberto não somam no fechamento)
                    </span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-4">
                <span>
                  Soma Total das OSs Concluídas:{' '}
                  <strong className="text-[#003366] font-mono font-bold">
                    R${' '}
                    {filteredOrders
                      .filter((os) => os.status === 'COMPLETED')
                      .reduce((acc, os) => {
                        const kmCost = os.kmTotalCost ?? (os.kmTraveled || 0) * 0.50;
                        return acc + (os.baseServiceFee || 0) + kmCost + (os.tollCost || 0) + (os.supportCost || 0);
                      }, 0)
                      .toFixed(2)}
                  </strong>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: Extrato Individual por Técnico & Disparo WhatsApp */}
      {activeSubTab === 'technicians' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-800">
                Extrato Consolidado por Técnico Homologado
              </h2>
              <p className="text-[11px] text-slate-400">
                Resumo matemático com base de cálculo, Ajuda de Custo parametrizada por técnico, vales e deduções fiscais.
              </p>
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Total de Técnicos Ativos: <strong className="text-slate-800">{technicianSummaries.length}</strong>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-400 uppercase font-bold text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Técnico & PIX</th>
                  <th className="py-3 px-4 text-center">Qtd OS</th>
                  <th className="py-3 px-4">Soma das OS</th>
                  <th className="py-3 px-4">Ajuda Custo</th>
                  <th className="py-3 px-4">Total Bruto</th>
                  <th className="py-3 px-4">Vales/Adiantamentos</th>
                  <th className="py-3 px-4">Regra Fiscal</th>
                  <th className="py-3 px-4 font-bold text-[#003366]">Líquido a Pagar</th>
                  <th className="py-3 px-4 text-right">Ações de Exportação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {technicianSummaries.map((summary) => {
                  const sumOfOrders =
                    summary.totalBaseFee + summary.totalKmCost + summary.totalTollCost + summary.totalSupportCost;
                  const displayCostAllowance =
                    summary.fixedCostAllowance !== undefined && summary.fixedCostAllowance !== null
                      ? Number(summary.fixedCostAllowance)
                      : 0.0;

                  return (
                    <tr key={summary.technicianId} className="hover:bg-slate-50/70 transition-colors">
                      {/* Technician info */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{summary.technicianName}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          PIX: {summary.pixKey || 'Não cadastrado'} ({summary.pixKeyType || 'CPF'})
                        </div>
                      </td>

                      {/* Quantity of OS */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-bold text-xs">
                          {summary.osCount}
                        </span>
                      </td>

                      {/* Sum of orders */}
                      <td className="py-3.5 px-4 font-semibold text-slate-700 font-mono">
                        R$ {sumOfOrders.toFixed(2)}
                      </td>

                      {/* Ajuda de Custo */}
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-slate-800">
                          {displayCostAllowance > 0 ? `+R$ ${displayCostAllowance.toFixed(2)}` : 'R$ 0,00'}
                        </div>
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border inline-block mt-0.5 ${
                          displayCostAllowance > 0
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}>
                          {displayCostAllowance > 0
                            ? `Creditada (${summary.costAllowanceFortnight || 1}ª Qz)`
                            : `Paga na ${summary.costAllowanceFortnight || 1}ª Qz`}
                        </span>
                      </td>

                      {/* Total Gross */}
                      <td className="py-3.5 px-4 font-black text-slate-900 font-mono">
                        R$ {summary.grossTotal.toFixed(2)}
                      </td>

                      {/* Advances deducted */}
                      <td className="py-3.5 px-4 text-red-500 font-semibold font-mono">
                        {summary.advancesDeduction > 0
                          ? `-R$ ${summary.advancesDeduction.toFixed(2)}`
                          : 'R$ 0,00'}
                      </td>

                      {/* Special Tax Deduction (e.g. Robertinho 16%) */}
                      <td className="py-3.5 px-4">
                        {summary.hasSpecialTaxRule ? (
                          <div>
                            <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded font-bold text-[9px]">
                              Retenção {summary.taxDeductionRate || 16}%
                            </span>
                            <div className="text-[10px] text-red-600 font-semibold font-mono mt-0.5">
                              -R$ {summary.taxDeductionAmount.toFixed(2)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-medium">Isento</span>
                        )}
                      </td>

                      {/* Net payable via PIX */}
                      <td className="py-3.5 px-4">
                        <div className="text-sm font-black text-[#003366] font-mono">
                          R$ {summary.netTotal.toFixed(2)}
                        </div>
                        <span className="text-[9px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded font-bold border border-emerald-200">
                          Pronto para PIX
                        </span>
                      </td>

                      {/* Action Buttons: PDF + WhatsApp */}
                      <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => generatePdfForTechnician(summary)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs inline-flex items-center space-x-1 border border-slate-200 transition-colors cursor-pointer"
                          title="Gerar e Baixar Extrato PDF Oficial"
                        >
                          <FileText className="h-3.5 w-3.5 text-[#003366]" />
                          <span>PDF</span>
                        </button>

                        <button
                          onClick={() => setSelectedTechForWhatsApp(summary)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center space-x-1 shadow-xs transition-colors cursor-pointer"
                          title="Disparar Extrato via WhatsApp API"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          <span>WhatsApp</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table Footer with Summary */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-600 gap-2">
            <span>
              Total líquido a transferir via PIX aos técnicos:{' '}
              <strong className="text-[#003366] text-sm font-mono">
                R$ {dynamicFinancialMetrics.totalNetPayout.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </strong>
            </span>
            <span className="text-slate-400 text-[11px]">
              * Estrutura visual e matemática em conformidade com as planilhas consolidadas.
            </span>
          </div>
        </div>
      )}

      {/* WhatsApp Dispatch Modal */}
      {selectedTechForWhatsApp && (
        <WhatsAppDispatchModal
          summary={selectedTechForWhatsApp}
          onClose={() => setSelectedTechForWhatsApp(null)}
          onConfirmDispatch={async () => {
            await dispatchWhatsAppStatement(selectedTechForWhatsApp);
            setSelectedTechForWhatsApp(null);
          }}
        />
      )}

    </div>
  );
};
