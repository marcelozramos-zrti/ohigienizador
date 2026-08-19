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
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { TechnicianClosingSummary, ServiceOrder } from '../types';
import { WhatsAppDispatchModal } from './WhatsAppDispatchModal';
import { CsvExportService } from '../services/csvExportService';
import { ClosingService } from '../services/closingService';

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
    selectedPeriod,
    setSelectedPeriod,
    exportClosingCsv,
    generatePdfForTechnician,
    dispatchWhatsAppStatement,
    orders = [],
    users = [],
    movements = [],
    addToast,
  } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<'datagrid' | 'technicians' | 'summary'>('datagrid');
  const [selectedTechForWhatsApp, setSelectedTechForWhatsApp] = useState<TechnicianClosingSummary | null>(null);

  // Filters state (Query Panel)
  const [filterTechnicianId, setFilterTechnicianId] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
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

  // Filtered Orders for the DataGrid
  const filteredOrders = useMemo(() => {
    return safeOrders.filter((os) => {
      if (!os) return false;

      // Filter by Technician
      if (filterTechnicianId !== 'ALL' && os.technicianId !== filterTechnicianId) {
        return false;
      }

      // Filter by Status
      if (filterStatus !== 'ALL' && os.status !== filterStatus) {
        return false;
      }

      // Search Query (Call number, customer, city, neighborhood, service)
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const matchesCall = os.callNumber?.toLowerCase().includes(query);
        const matchesCustomer = os.customerName?.toLowerCase().includes(query);
        const matchesCity = os.city?.toLowerCase().includes(query);
        const matchesNeighborhood = os.neighborhood?.toLowerCase().includes(query);
        const matchesCategory = os.serviceCategory?.toLowerCase().includes(query);
        const matchesTech = os.technicianName?.toLowerCase().includes(query);

        if (!matchesCall && !matchesCustomer && !matchesCity && !matchesNeighborhood && !matchesCategory && !matchesTech) {
          return false;
        }
      }

      return true;
    });
  }, [safeOrders, filterTechnicianId, filterStatus, searchQuery]);

  const currentPeriodLabel = `${selectedPeriod}ª Quinzena (${monthNames[selectedMonth - 1] || 'Agosto'}/2026)`;

  // Export Closing DataGrid CSV with exact 17 columns
  const handleExportDataGridCsv = () => {
    CsvExportService.exportClosingDataGridCsv(filteredOrders, currentPeriodLabel);
    addToast(
      'Exportação Concluída',
      `O arquivo CSV com as 17 colunas de fechamento foi gerado com sucesso (${filteredOrders.length} registros).`,
      'success'
    );
  };

  const totalFaturamentoPorto = currentClosing?.totalFaturamentoPorto || 0;
  const totalTechnicianGross = currentClosing?.totalTechnicianGross || 0;
  const totalAdvancesDeducted = currentClosing?.totalAdvancesDeducted || 0;
  const totalTaxesDeducted = currentClosing?.totalTaxesDeducted || 0;
  const companyProfitMargin = currentClosing?.companyProfitMargin || 0;
  const totalNetPayout = currentClosing?.totalNetPayout || 0;
  const technicianSummaries = currentClosing?.technicianSummaries || [];

  return (
    <div className="space-y-6">
      
      {/* Header with Title and Period Selectors */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-[#003366] tracking-tight">
              Fechamento Financeiro & DataGrid
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-cyan-100 text-cyan-800 border border-cyan-300">
              Regras Porto Seguro
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Cálculo auditado: KM a R$ 0,50/km, pedágios 1:1, ajuda de custo R$ 250, vales e regra fiscal (16%).
          </p>
        </div>

        {/* Period Selector & Global Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Period Toggle */}
          <div className="flex bg-white rounded-lg p-1 border border-slate-200 shadow-xs">
            <button
              id="period-q1-btn"
              onClick={() => setSelectedPeriod(1)}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                selectedPeriod === 1
                  ? 'bg-[#003366] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              1ª Quinzena (01-15)
            </button>
            <button
              id="period-q2-btn"
              onClick={() => setSelectedPeriod(2)}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                selectedPeriod === 2
                  ? 'bg-[#003366] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              2ª Quinzena (16-31)
            </button>
          </div>

          {/* Month Selector */}
          <select
            id="closing-month-select"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 shadow-xs cursor-pointer focus:ring-2 focus:ring-cyan-500 focus:outline-none"
          >
            {monthNames.map((m, idx) => (
              <option key={idx} value={idx + 1}>
                {m} / 2026
              </option>
            ))}
          </select>

          {/* Lançar Vale */}
          <button
            id="open-new-advance-btn"
            onClick={onOpenNewAdvance}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#003366] hover:bg-[#00264d] text-white text-xs font-bold rounded-lg shadow-xs transition-all cursor-pointer"
          >
            <PlusCircle className="h-3.5 w-3.5 text-cyan-300" />
            <span>Lançar Vale</span>
          </button>
        </div>
      </div>

      {/* 4 High-Density Executive Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Receita Faturada Porto Seguro */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
            Faturamento Bruto Porto
          </p>
          <div className="flex items-end justify-between mt-1">
            <span className="text-2xl font-black text-[#003366]">
              R$ {totalFaturamentoPorto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-green-600 font-semibold bg-green-50 px-1.5 py-0.5 rounded border border-green-100">
              Seguradora
            </span>
          </div>
        </div>

        {/* Repasses Brutos aos Técnicos */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
            Repasses Técnicos (+ Ajuda Custo)
          </p>
          <div className="flex items-end justify-between mt-1">
            <span className="text-2xl font-black text-slate-800">
              R$ {totalTechnicianGross.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Base + KM + R$250
            </span>
          </div>
        </div>

        {/* Deduções: Vales + Retenção 16% */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
            Deduções (Vales + Impostos)
          </p>
          <div className="flex items-end justify-between mt-1">
            <span className="text-2xl font-black text-red-600">
              -R$ {(totalAdvancesDeducted + totalTaxesDeducted).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded font-bold border border-red-100">
              Abatimentos
            </span>
          </div>
        </div>

        {/* Total Líquido a Transferir PIX */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
            Total Líquido a Transferir (PIX)
          </p>
          <div className="flex items-end justify-between mt-1">
            <span className="text-2xl font-black text-emerald-600">
              R$ {totalNetPayout.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
              Pronto PIX
            </span>
          </div>
        </div>
      </div>

      {/* Subtabs Switcher: DataGrid vs Extrato Consolidado */}
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
            <span>DataGrid de Resultados (17 Colunas)</span>
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
            <span>Extratos por Técnico & WhatsApp</span>
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

      {/* SUBTAB 1: DataGrid Completo com Painel de Query / Filtros */}
      {activeSubTab === 'datagrid' && (
        <div className="space-y-4">
          
          {/* Query Filter Panel */}
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
                  setSearchQuery('');
                }}
                className="text-[11px] text-cyan-700 hover:underline font-bold"
              >
                Limpar Filtros
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Filtro por Técnico */}
              <div>
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
                  {techniciansList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.hasSpecialTaxRule ? '(Regra 16% Impostos)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro por Status */}
              <div>
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
                  <option value="COMPLETED">Finalizadas (COMPLETED)</option>
                  <option value="IN_PROGRESS">Em Andamento (IN_PROGRESS)</option>
                  <option value="PENDING">Pendentes (PENDING)</option>
                  <option value="CANCELLED">Canceladas (CANCELLED)</option>
                </select>
              </div>

              {/* Busca Textual */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Busca Textual Rápida
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    id="query-search-input"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Nº chamado, cliente, bairro..."
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* DataGrid Table with Exact 17 Columns */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-cyan-600" />
                <h3 className="text-xs font-bold text-slate-800">
                  DataGrid Oficial de Fechamento ({filteredOrders.length} Chamados)
                </h3>
              </div>
              <div className="text-[11px] text-slate-500 font-medium">
                Modelo compatível com planilhas de transparência
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
                    <th className="py-2.5 px-3 border-r border-[#004080]">Status</th>
                    <th className="py-2.5 px-3 border-r border-[#004080]">Tecnico</th>
                    <th className="py-2.5 px-3 border-r border-[#004080]">Status Mobile</th>
                    <th className="py-2.5 px-3 border-r border-[#004080]">Cidade</th>
                    <th className="py-2.5 px-3 border-r border-[#004080]">UF</th>
                    <th className="py-2.5 px-3 border-r border-[#004080]">CEP</th>
                    <th className="py-2.5 px-3 border-r border-[#004080]">Bairro</th>
                    <th className="py-2.5 px-3 border-r border-[#004080] text-center">KM</th>
                    <th className="py-2.5 px-3 border-r border-[#004080]">Pedágio</th>
                    <th className="py-2.5 px-3 border-r border-[#004080]">Valor da Visita</th>
                    <th className="py-2.5 px-3 bg-cyan-600 text-white font-extrabold text-right">Total</th>
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

                        {/* 8. Tecnico */}
                        <td className="py-2.5 px-3 font-bold text-slate-900 border-r border-slate-100 whitespace-nowrap">
                          {os.technicianName || 'Não Alocado'}
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
                        <td className="py-2.5 px-3 font-black text-[#003366] bg-cyan-50/80 text-right whitespace-nowrap font-mono">
                          R$ {totalOs.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}

                  {filteredOrders.length === 0 && (
                    <tr>
                      <td colSpan={17} className="py-8 text-center text-slate-400">
                        Nenhuma Ordem de Serviço encontrada com os filtros selecionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer Summary Row */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-600">
              <span>
                Total de Linhas no DataGrid: <strong>{filteredOrders.length}</strong>
              </span>
              <div className="flex items-center gap-4">
                <span>
                  Soma Total das OSs:{' '}
                  <strong className="text-[#003366] font-mono">
                    R${' '}
                    {filteredOrders
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
                Resumo matemático com base de cálculo, Ajuda de Custo (R$ 250), vales e deduções fiscais.
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
                      <td className="py-3.5 px-4 text-slate-800 font-mono">
                        +R$ {(summary.fixedCostAllowance || 250.0).toFixed(2)}
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
                R$ {totalNetPayout.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
