import React, { useState, useMemo } from 'react';
import {
  Search,
  PlusCircle,
  FileDown,
  MapPin,
  Car,
  User,
  CheckCircle2,
  Clock,
  Eye,
  Edit,
  Pencil,
  Trash2,
  X,
  Shield,
  Layers,
  UserCheck,
  Calendar,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ServiceOrder } from '../types';
import { isOrderInPeriod, parseDateComponents } from '../services/closingService';
import { EditServiceOrderModal } from './EditServiceOrderModal';

interface ServiceOrdersViewProps {
  onOpenNewOrder: () => void;
}

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export const ServiceOrdersView: React.FC<ServiceOrdersViewProps> = ({ onOpenNewOrder }) => {
  const {
    orders = [],
    exportOrdersCsv,
    currentUser,
    selectedYear = 2026,
    setSelectedYear,
    selectedMonth = 8,
    setSelectedMonth,
    selectedPeriod = 1,
    setSelectedPeriod,
    deleteServiceOrder,
    addToast,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);
  const [editingOrder, setEditingOrder] = useState<ServiceOrder | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<ServiceOrder | null>(null);

  const safeOrders = orders || [];

  // Formatação amigável e precisa de Data / Hora para o DataGrid
  const formatScheduledDateTime = (dateStr?: string) => {
    if (!dateStr) return { date: '-', time: '' };
    try {
      const parsed = parseDateComponents(dateStr);
      if (parsed) {
        const day = String(parsed.day).padStart(2, '0');
        const month = String(parsed.month).padStart(2, '0');
        const year = parsed.year;
        const datePart = `${day}/${month}/${year}`;

        // Extrai horário se presente no formato ISO ou string
        let timePart = '';
        if (typeof dateStr === 'string') {
          if (dateStr.includes('T')) {
            const rawTime = dateStr.split('T')[1];
            if (rawTime) {
              const timeMatch = rawTime.match(/^(\d{1,2}):(\d{2})/);
              if (timeMatch && (timeMatch[1] !== '00' || timeMatch[2] !== '00')) {
                timePart = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
              }
            }
          } else {
            const timeMatch = dateStr.match(/(\d{1,2}):(\d{2})/);
            if (timeMatch) {
              timePart = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
            }
          }
        }
        return { date: datePart, time: timePart };
      }

      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const datePart = d.toLocaleDateString('pt-BR');
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        const timePart = hours !== '00' || mins !== '00' ? `${hours}:${mins}` : '';
        return { date: datePart, time: timePart };
      }
      return { date: dateStr, time: '' };
    } catch {
      return { date: dateStr || '-', time: '' };
    }
  };

  // Filtragem automática por Período (Ano, Mês, Quinzena), Busca Textual e Status
  const filteredOrders = useMemo(() => {
    return safeOrders.filter((os) => {
      if (!os) return false;

      // 1. Filtro Global de Período (Ano -> Mês -> Quinzena)
      const inPeriod = isOrderInPeriod(os, {
        referenceYear: selectedYear,
        referenceMonth: selectedMonth,
        periodNumber: selectedPeriod,
      });

      if (!inPeriod) return false;

      // 2. Filtro de Busca Textual
      const matchesSearch =
        !searchTerm.trim() ||
        (os.callNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (os.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (os.customerCpf || '').includes(searchTerm) ||
        (os.city || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (os.neighborhood || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (os.technicianName && os.technicianName.toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchesSearch) return false;

      // 3. Filtro de Status
      const matchesStatus = statusFilter === 'ALL' || os.status === statusFilter;
      if (!matchesStatus) return false;

      return true;
    });
  }, [safeOrders, selectedYear, selectedMonth, selectedPeriod, searchTerm, statusFilter]);

  const handleDeleteConfirm = () => {
    if (orderToDelete) {
      deleteServiceOrder(orderToDelete.id);
      addToast(
        'Ordem Excluída',
        `A Ordem de Serviço #${orderToDelete.callNumber} foi removida com sucesso.`,
        'success'
      );
      setOrderToDelete(null);
    }
  };

  const getStatusBadge = (status: ServiceOrder['status']) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-bold text-[9px] uppercase tracking-wider whitespace-nowrap">
            FINALIZADA
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full font-bold text-[9px] uppercase tracking-wider whitespace-nowrap">
            EM ANDAMENTO
          </span>
        );
      case 'PENDING':
        return (
          <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-bold text-[9px] uppercase tracking-wider whitespace-nowrap">
            PENDENTE
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-bold text-[9px] uppercase tracking-wider whitespace-nowrap">
            CANCELADA
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Title, Period Selectors & Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-[#003366] tracking-tight">
              Ordens de Serviço • Porto Seguro
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 bg-cyan-50 text-cyan-800 text-[11px] font-bold rounded-md border border-cyan-200">
              {filteredOrders.length} chamados no período
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitoramento de chamados, rotas por KM, pedágios, custos de suporte e baixa de insumos.
          </p>
        </div>

        {/* Global Period Selectors & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {/* Seletor Interativo: Quinzena */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-xs">
            <button
              id="orders-period-q1-btn"
              type="button"
              onClick={() => setSelectedPeriod(1)}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                selectedPeriod === 1
                  ? 'bg-[#003366] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
              title="Filtrar chamados da 1ª Quinzena (dias 01 a 15)"
            >
              1ª Qnz (01-15)
            </button>
            <button
              id="orders-period-q2-btn"
              type="button"
              onClick={() => setSelectedPeriod(2)}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                selectedPeriod === 2
                  ? 'bg-[#003366] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
              title="Filtrar chamados da 2ª Quinzena (dias 16 ao fim)"
            >
              2ª Qnz (16-fim)
            </button>
          </div>

          {/* Seletor Interativo: Mês */}
          <select
            id="orders-month-select"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 shadow-xs cursor-pointer focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            title="Selecionar Mês de Referência"
          >
            {MONTH_NAMES.map((m, idx) => (
              <option key={idx} value={idx + 1}>
                {m}
              </option>
            ))}
          </select>

          {/* Seletor Interativo: Ano */}
          <select
            id="orders-year-select"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 shadow-xs cursor-pointer focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            title="Selecionar Ano de Referência"
          >
            <option value={2025}>2025</option>
            <option value={2026}>2026</option>
            <option value={2027}>2027</option>
          </select>

          {/* Exportar CSV */}
          <button
            id="orders-export-csv-btn"
            onClick={exportOrdersCsv}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 shadow-xs transition-all cursor-pointer"
            title="Exportar listagem de ordens de serviço em formato CSV"
          >
            <FileDown className="h-4 w-4 text-slate-600" />
            <span className="hidden sm:inline">Exportar CSV</span>
          </button>

          {/* Nova OS Porto */}
          {currentUser.role !== 'TECHNICIAN' && (
            <button
              id="orders-new-os-btn"
              onClick={onOpenNewOrder}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-[#003366] hover:bg-[#00264d] text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
              title="Abrir formulário de nova Ordem de Serviço Porto Seguro"
            >
              <PlusCircle className="h-4 w-4 text-cyan-400" />
              <span>Nova OS</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters Bar: Search & Status Tabs */}
      <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3.5">
        {/* Search Input */}
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            id="orders-search-input"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar chamado, cliente, CPF, bairro ou técnico..."
            className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:bg-white transition-all"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center space-x-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {[
            { id: 'ALL', label: 'Todas as OS' },
            { id: 'PENDING', label: 'Pendentes' },
            { id: 'IN_PROGRESS', label: 'Em Andamento' },
            { id: 'COMPLETED', label: 'Finalizadas' },
          ].map((tab) => (
            <button
              key={tab.id}
              id={`status-filter-${tab.id.toLowerCase()}`}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-[#003366] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders High Density DataGrid */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-bold text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-3.5 whitespace-nowrap">Chamado Porto</th>
                <th className="py-3 px-3.5 min-w-[160px]">Cliente & Local</th>
                <th className="py-3 px-3.5 min-w-[140px]">Serviço</th>
                <th className="py-3 px-3.5 min-w-[130px]">Técnico</th>
                <th className="py-3 px-3.5 whitespace-nowrap bg-cyan-50/40 text-cyan-900 border-x border-cyan-100">
                  Data / Hora
                </th>
                <th className="py-3 px-3.5 whitespace-nowrap">Deslocamento (KM)</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Repasse Técnico</th>
                <th className="py-3 px-3.5 whitespace-nowrap bg-slate-100/60 text-slate-700">
                  Pedágio
                </th>
                <th className="py-3 px-3.5 whitespace-nowrap bg-slate-100/60 text-slate-700">
                  Suporte Extra
                </th>
                <th className="py-3 px-3.5 text-center whitespace-nowrap">Status</th>
                <th className="py-3 px-3.5 text-center whitespace-nowrap min-w-[90px]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    <div className="max-w-md mx-auto space-y-1.5">
                      <p className="font-semibold text-slate-600 text-sm">
                        Nenhuma ordem de serviço encontrada neste período.
                      </p>
                      <p className="text-xs text-slate-400">
                        {selectedPeriod}ª Quinzena de {MONTH_NAMES[selectedMonth - 1]}/{selectedYear}.
                        Altere os seletores de período acima ou limpe o campo de busca.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((os) => {
                  const scheduleInfo = formatScheduledDateTime(os.scheduledDate);

                  return (
                    <tr key={os.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* 1. Call Number */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <div className="font-mono font-bold text-[#003366]">
                          #{os.callNumber}
                        </div>
                        {os.portoSeguroProtocol && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            {os.portoSeguroProtocol}
                          </div>
                        )}
                      </td>

                      {/* 2. Customer & Local */}
                      <td className="py-3 px-3.5">
                        <div className="font-semibold text-slate-800 truncate max-w-[180px]" title={os.customerName}>
                          {os.customerName}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center mt-0.5 truncate max-w-[180px]">
                          <MapPin className="h-3 w-3 mr-0.5 text-slate-400 shrink-0" />
                          <span className="truncate">{os.neighborhood}, {os.uf}</span>
                        </div>
                      </td>

                      {/* 3. Service Category */}
                      <td className="py-3 px-3.5">
                        <div className="font-medium text-slate-800 truncate max-w-[160px]" title={os.serviceCategory}>
                          {os.serviceCategory}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Base: R$ {(os.baseServiceFee || 0).toFixed(2)}
                        </div>
                      </td>

                      {/* 4. Technician */}
                      <td className="py-3 px-3.5">
                        <div className="font-semibold text-slate-800 flex items-center space-x-1 truncate max-w-[140px]" title={os.technicianName || 'Não Alocado'}>
                          <User className="h-3 w-3 text-slate-400 shrink-0" />
                          <span className="truncate">{os.technicianName || 'Não Alocado'}</span>
                        </div>
                      </td>

                      {/* 5. DATA / HORA (Nova Coluna ao lado de Técnico) */}
                      <td className="py-3 px-3.5 whitespace-nowrap bg-cyan-50/20 border-x border-cyan-100/60">
                        <div className="font-mono font-bold text-slate-800 flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-cyan-600 shrink-0" />
                          <span>{scheduleInfo.date}</span>
                        </div>
                        {scheduleInfo.time ? (
                          <div className="text-[10px] text-cyan-800 font-mono flex items-center gap-1 mt-0.5 font-medium">
                            <Clock className="h-2.5 w-2.5 text-cyan-500 shrink-0" />
                            <span>{scheduleInfo.time}</span>
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400">Horário comercial</div>
                        )}
                      </td>

                      {/* 6. KM & Logistics */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <div className="font-medium text-slate-700 font-mono">
                          {os.kmTraveled > 0
                            ? `${os.kmTraveled} km (R$ ${(os.kmTotalCost || 0).toFixed(2)})`
                            : '0 km'}
                        </div>
                      </td>

                      {/* 7. Repasse Técnico */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <div className="font-bold text-[#003366] font-mono">
                          R$ {(os.totalTechnicianGross || 0).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Porto: R$ {(os.faturamentoPorto || 0).toFixed(2)}
                        </div>
                      </td>

                      {/* 8. PEDÁGIO (Nova Coluna Financeira ao lado de Repasse) */}
                      <td className="py-3 px-3.5 whitespace-nowrap bg-slate-50/50">
                        <div className={`font-mono font-medium ${os.tollCost > 0 ? 'text-amber-700 font-bold' : 'text-slate-400'}`}>
                          R$ {(os.tollCost || 0).toFixed(2)}
                        </div>
                      </td>

                      {/* 9. SUPORTE EXTRA (Nova Coluna Financeira ao lado de Pedágio) */}
                      <td className="py-3 px-3.5 whitespace-nowrap bg-slate-50/50">
                        <div className={`font-mono font-medium ${os.supportCost > 0 ? 'text-cyan-700 font-bold' : 'text-slate-400'}`}>
                          R$ {(os.supportCost || 0).toFixed(2)}
                        </div>
                      </td>

                      {/* 10. Status */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        {getStatusBadge(os.status)}
                      </td>

                      {/* 11. AÇÕES (UX Refatorada com ícones minimalistas e tooltips) */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center space-x-1">
                          {/* Visualizar */}
                          <button
                            type="button"
                            onClick={() => setSelectedOrder(os)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-700 hover:bg-cyan-50 transition-colors cursor-pointer"
                            title="Visualizar"
                            aria-label="Visualizar"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          {/* Editar */}
                          {currentUser.role !== 'TECHNICIAN' && (
                            <button
                              type="button"
                              onClick={() => setEditingOrder(os)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-[#003366] hover:bg-slate-100 transition-colors cursor-pointer"
                              title="Editar"
                              aria-label="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}

                          {/* Excluir */}
                          {currentUser.role === 'ADMIN' && (
                            <button
                              type="button"
                              onClick={() => setOrderToDelete(os)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                              title="Excluir"
                              aria-label="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal for Delete */}
      {orderToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center space-x-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Excluir Ordem de Serviço</h3>
                <p className="text-xs text-slate-500">Confirmação de segurança</p>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Tem certeza que deseja excluir o chamado <strong>#{orderToDelete.callNumber}</strong> referente ao cliente <strong>{orderToDelete.customerName}</strong>? Esta ação não poderá ser desfeita.
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setOrderToDelete(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-4 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OS Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-base font-bold text-[#003366]">
                    #{selectedOrder.callNumber}
                  </span>
                  {getStatusBadge(selectedOrder.status)}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Protocolo Porto Seguro: {selectedOrder.portoSeguroProtocol || 'SIN-PADRAO-PORTO'}
                </p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 cursor-pointer"
                title="Fechar Janela"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs">
              {/* Cliente e Endereço */}
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Dados do Cliente & Local de Atendimento
                </h3>
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-slate-500 font-medium">Cliente:</span>{' '}
                      <strong className="text-slate-800">{selectedOrder.customerName}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium">CPF:</span>{' '}
                      <strong className="text-slate-800">{selectedOrder.customerCpf}</strong>
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium">Endereço:</span>{' '}
                    <span className="text-slate-800">
                      {selectedOrder.addressStreet}, {selectedOrder.addressNumber}{' '}
                      {selectedOrder.addressComplement} - {selectedOrder.neighborhood},{' '}
                      {selectedOrder.city}/{selectedOrder.uf} (CEP: {selectedOrder.postalCode})
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedOrder.customerPhone && (
                      <div>
                        <span className="text-slate-500 font-medium">Telefone:</span>{' '}
                        <span className="text-slate-800 font-semibold">
                          {selectedOrder.customerPhone}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-slate-500 font-medium">Data / Hora Agendada:</span>{' '}
                      <span className="text-slate-800 font-semibold">
                        {formatScheduledDateTime(selectedOrder.scheduledDate).date}{' '}
                        {formatScheduledDateTime(selectedOrder.scheduledDate).time}
                      </span>
                    </div>
                  </div>
                  {selectedOrder.technicianName && (
                    <div className="pt-1 border-t border-slate-200/60 flex items-center space-x-1.5 text-cyan-800 font-bold">
                      <UserCheck className="h-3.5 w-3.5 text-cyan-600" />
                      <span>Técnico Designado: {selectedOrder.technicianName}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Demonstrativo Financeiro da OS */}
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Composição do Pagamento ao Técnico
                </h3>
                <div className="p-3.5 rounded-lg bg-cyan-50/50 border border-cyan-200/80 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Taxa Fixa Categoria:</span>
                    <span className="font-bold text-slate-800">
                      R$ {(selectedOrder.baseServiceFee || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">
                      KM Rodado ({selectedOrder.kmTraveled} km @ R${' '}
                      {selectedOrder.kmRateApplied || 0.5}/km):
                    </span>
                    <span className="font-bold text-slate-800">
                      R$ {(selectedOrder.kmTotalCost || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Pedágio Comprovado:</span>
                    <span className="font-bold text-slate-800">
                      R$ {(selectedOrder.tollCost || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Custos de Suporte / Adicionais:</span>
                    <span className="font-bold text-slate-800">
                      R$ {(selectedOrder.supportCost || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-cyan-200 flex justify-between text-xs">
                    <span className="font-bold text-[#003366]">Total Repasse Técnico:</span>
                    <span className="font-black text-[#003366]">
                      R$ {(selectedOrder.totalTechnicianGross || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Insumos Abatidos */}
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Insumos & Suportes Consumidos (Abatidos do Estoque Central)
                </h3>
                {selectedOrder.itemsUsed && selectedOrder.itemsUsed.length > 0 ? (
                  <div className="space-y-1.5">
                    {selectedOrder.itemsUsed.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded bg-slate-50 border border-slate-200 flex justify-between items-center"
                      >
                        <span className="font-semibold text-slate-800">{item.stockItemName}</span>
                        <span className="font-bold text-cyan-800 bg-cyan-50 px-2 py-0.5 rounded border border-cyan-200 text-[10px]">
                          {item.quantityUsed} {item.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-2.5 text-slate-400 italic bg-slate-50 rounded border border-slate-200">
                    Nenhum insumo registrado até o momento.
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              {currentUser.role !== 'TECHNICIAN' ? (
                <button
                  type="button"
                  onClick={() => {
                    const target = selectedOrder;
                    setSelectedOrder(null);
                    setEditingOrder(target);
                  }}
                  className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-[#003366] hover:bg-[#00264d] text-white font-bold rounded-lg text-xs transition-colors cursor-pointer"
                >
                  <Pencil className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Editar OS / Trocar Técnico</span>
                </button>
              ) : (
                <div />
              )}

              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg text-xs cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit OS Modal */}
      {editingOrder && (
        <EditServiceOrderModal
          order={editingOrder}
          onClose={() => setEditingOrder(null)}
        />
      )}
    </div>
  );
};
