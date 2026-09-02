import React, { useState, useMemo, useRef } from 'react';
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
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  ClipboardList,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ServiceOrder } from '../types';
import { parseDateComponents } from '../services/closingService';
import { EditServiceOrderModal } from './EditServiceOrderModal';

interface ServiceOrdersViewProps {
  onOpenNewOrder: () => void;
}

type SortField =
  | 'callNumber'
  | 'customerName'
  | 'serviceCategory'
  | 'technicianName'
  | 'scheduledDate'
  | 'kmTraveled'
  | 'totalTechnicianGross'
  | 'tollCost'
  | 'supportCost'
  | 'status';

export const ServiceOrdersView: React.FC<ServiceOrdersViewProps> = ({ onOpenNewOrder }) => {
  const {
    orders = [],
    users = [],
    exportOrdersCsv,
    currentUser,
    deleteServiceOrder,
    reassignOrderTechnician,
    batchReassignTechnician,
    autoRepairOrders,
    addToast,
  } = useApp();

  // Filters State - All on a summarized single line
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [technicianFilter, setTechnicianFilter] = useState<string>('ALL');
  const [startDateFilter, setStartDateFilter] = useState<string>('');
  const [endDateFilter, setEndDateFilter] = useState<string>('');

  // Sorting State (Excel-like column header sorting)
  const [sortField, setSortField] = useState<SortField>('scheduledDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Modals
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);
  const [editingOrder, setEditingOrder] = useState<ServiceOrder | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<ServiceOrder | null>(null);
  const [batchTechId, setBatchTechId] = useState<string>('');
  const [isBatchBusy, setIsBatchBusy] = useState<boolean>(false);

  const safeOrders = orders || [];
  const safeUsers = users || [];

  const techniciansList = useMemo(() => {
    return safeUsers.filter((u) => u && u.role === 'TECHNICIAN' && u.isActive);
  }, [safeUsers]);

  // Handler para alternar ordenação de colunas (estilo Excel)
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Renderiza a seta de ordenação visual na coluna do DataGrid
  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 ml-1 text-slate-300 inline-block group-hover:text-slate-500 transition-colors" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="h-3 w-3 ml-1 text-[#003366] inline-block font-bold" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1 text-[#003366] inline-block font-bold" />
    );
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setStatusFilter('ALL');
    setTechnicianFilter('ALL');
    setStartDateFilter('');
    setEndDateFilter('');
  };

  const unallocatedOrders = useMemo(() => {
    return safeOrders.filter((os) => {
      if (!os) return false;
      const matched = safeUsers.find(
        (u) =>
          u.id === os.technicianId ||
          (os.technicianName && u.name.toLowerCase() === os.technicianName.toLowerCase())
      );
      const displayName = matched?.name || os.technicianName;
      return !displayName || displayName === 'Não Alocado' || !os.technicianId || os.technicianId === 'tech-1';
    });
  }, [safeOrders, safeUsers]);

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

  // 1. Filtragem unificada com suporte a busca estilo PowerQuery
  const filteredOrders = useMemo(() => {
    return safeOrders.filter((os) => {
      if (!os) return false;

      // Filtro de Busca Textual estilo PowerQuery (Suporta múltiplos critérios separados por ';')
      if (searchTerm.trim()) {
        const tokens = searchTerm
          .split(';')
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean);

        if (tokens.length > 0) {
          const { date: formattedDate, time: formattedTime } = formatScheduledDateTime(os.scheduledDate);
          const isoDateStr = os.scheduledDate ? os.scheduledDate.split('T')[0] : ''; // YYYY-MM-DD

          let statusText = '';
          if (os.status === 'PENDING') statusText = 'pendente';
          else if (os.status === 'IN_PROGRESS') statusText = 'em andamento em rota';
          else if (os.status === 'COMPLETED') statusText = 'finalizada concluida concluída';
          else if (os.status === 'CANCELLED') statusText = 'cancelada';

          const searchableFields = [
            (os.callNumber || '').toLowerCase(),
            (os.customerName || '').toLowerCase(),
            (os.customerCpf || '').toLowerCase(),
            (os.city || '').toLowerCase(),
            (os.neighborhood || '').toLowerCase(),
            (os.addressStreet || '').toLowerCase(),
            (os.serviceCategory || '').toLowerCase(),
            (os.technicianName || '').toLowerCase(),
            statusText,
            formattedDate.toLowerCase(), // e.g. "15/08/2026"
            formattedTime.toLowerCase(), // e.g. "14:30"
            isoDateStr,                  // e.g. "2026-08-15"
          ];

          // Todas as cláusulas (tokens) devem ser satisfeitas no mesmo registro (AND)
          const matchesAllTokens = tokens.every((token) => {
            return searchableFields.some((field) => field.includes(token));
          });

          if (!matchesAllTokens) return false;
        }
      }

      // Filtro de Status (suporta PENDING, IN_PROGRESS, COMPLETED, CANCELLED e NOT_COMPLETED para OS não finalizadas)
      if (statusFilter === 'NOT_COMPLETED') {
        if (os.status === 'COMPLETED') return false;
      } else if (statusFilter !== 'ALL' && os.status !== statusFilter) {
        return false;
      }

      // Filtro de Técnico
      if (technicianFilter !== 'ALL') {
        if (technicianFilter === 'UNALLOCATED') {
          const matched = safeUsers.find(
            (u) =>
              u.id === os.technicianId ||
              (os.technicianName && u.name.toLowerCase() === os.technicianName.toLowerCase())
          );
          const displayName = matched?.name || os.technicianName;
          if (displayName && displayName !== 'Não Alocado' && os.technicianId && os.technicianId !== 'tech-1') {
            return false;
          }
        } else if (os.technicianId !== technicianFilter) {
          return false;
        }
      }

      // Filtro de Data Personalizado (Início e Fim)
      if (startDateFilter || endDateFilter) {
        const osDateStr = os.scheduledDate ? os.scheduledDate.split('T')[0] : '';
        if (startDateFilter && osDateStr && osDateStr < startDateFilter) return false;
        if (endDateFilter && osDateStr && osDateStr > endDateFilter) return false;
      }

      return true;
    });
  }, [safeOrders, searchTerm, statusFilter, technicianFilter, startDateFilter, endDateFilter, safeUsers]);

  // 2. Ordenação das Colunas (Excel-like Sorting)
  const sortedOrders = useMemo(() => {
    const sorted = [...filteredOrders];
    sorted.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'callNumber') {
        valA = Number(a.callNumber) || a.callNumber || '';
        valB = Number(b.callNumber) || b.callNumber || '';
      } else if (sortField === 'scheduledDate') {
        valA = a.scheduledDate || '';
        valB = b.scheduledDate || '';
      } else if (sortField === 'technicianName') {
        valA = a.technicianName || 'Não Alocado';
        valB = b.technicianName || 'Não Alocado';
      } else if (
        sortField === 'kmTraveled' ||
        sortField === 'totalTechnicianGross' ||
        sortField === 'tollCost' ||
        sortField === 'supportCost'
      ) {
        valA = Number(valA || 0);
        valB = Number(valB || 0);
      } else {
        valA = String(valA || '').toLowerCase();
        valB = String(valB || '').toLowerCase();
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredOrders, sortField, sortDirection]);

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

  const formatDateBR = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  // Métricas do Dashboard Informativo do Gestor (Cobrança em Tempo Real)
  const orderStats = useMemo(() => {
    const total = safeOrders.length;
    let pending = 0;
    let inProgress = 0;
    let completed = 0;
    let cancelled = 0;
    let unallocated = 0;

    safeOrders.forEach((os) => {
      if (!os) return;
      if (os.status === 'PENDING') pending++;
      else if (os.status === 'IN_PROGRESS') inProgress++;
      else if (os.status === 'COMPLETED') completed++;
      else if (os.status === 'CANCELLED') cancelled++;

      if (!os.technicianId || os.technicianName === 'Não Alocado' || os.technicianId === 'tech-1') {
        unallocated++;
      }
    });

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const remainingToClose = pending + inProgress;

    return { total, pending, inProgress, completed, cancelled, unallocated, completionRate, remainingToClose };
  }, [safeOrders]);

  return (
    <div className="space-y-6">
      {/* Executive Status Dashboard - Quadros Informativos de Cobrança em Tempo Real */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total de Chamados */}
        <div
          onClick={() => setStatusFilter('ALL')}
          className={`bg-white rounded-xl p-3 border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
            statusFilter === 'ALL'
              ? 'border-cyan-500 ring-2 ring-cyan-400/30 bg-cyan-50/20'
              : 'border-slate-200 hover:border-cyan-300'
          }`}
          title="Clique para ver Todos os Chamados"
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Geral</span>
            <div className="p-1.5 rounded-lg bg-slate-100 text-slate-700">
              <ClipboardList className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{orderStats.total}</span>
            <span className="text-[10px] font-semibold text-slate-500">chamados</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500 font-medium truncate">
            Base completa cadastrada
          </div>
        </div>

        {/* Pendentes */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'PENDING' ? 'ALL' : 'PENDING')}
          className={`bg-white rounded-xl p-3 border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
            statusFilter === 'PENDING'
              ? 'border-amber-500 ring-2 ring-amber-400/30 bg-amber-50/30'
              : 'border-slate-200 hover:border-amber-300'
          }`}
          title="Clique para filtrar Chamados Pendentes"
        >
          <div className="flex items-center justify-between text-amber-700 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">Pendentes</span>
            <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-900">{orderStats.pending}</span>
            <span className="text-[10px] font-bold text-amber-700">não iniciadas</span>
          </div>
          <div className="mt-1 text-[10px] text-amber-700 font-medium truncate">
            Aguardando atendimento
          </div>
        </div>

        {/* Em Andamento */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'IN_PROGRESS' ? 'ALL' : 'IN_PROGRESS')}
          className={`bg-white rounded-xl p-3 border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
            statusFilter === 'IN_PROGRESS'
              ? 'border-blue-500 ring-2 ring-blue-400/30 bg-blue-50/30'
              : 'border-slate-200 hover:border-blue-300'
          }`}
          title="Clique para filtrar Chamados em Andamento"
        >
          <div className="flex items-center justify-between text-blue-700 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800">Em Andamento</span>
            <div className="p-1.5 rounded-lg bg-blue-100 text-blue-800">
              <Car className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-blue-900">{orderStats.inProgress}</span>
            <span className="text-[10px] font-bold text-blue-700">em atendimento</span>
          </div>
          <div className="mt-1 text-[10px] text-blue-700 font-medium truncate">
            Técnico em rota / atendimento
          </div>
        </div>

        {/* Finalizadas */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'COMPLETED' ? 'ALL' : 'COMPLETED')}
          className={`bg-white rounded-xl p-3 border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
            statusFilter === 'COMPLETED'
              ? 'border-emerald-500 ring-2 ring-emerald-400/30 bg-emerald-50/30'
              : 'border-slate-200 hover:border-emerald-300'
          }`}
          title="Clique para filtrar Chamados Finalizados"
        >
          <div className="flex items-center justify-between text-emerald-700 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Finalizadas</span>
            <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-900">{orderStats.completed}</span>
            <span className="text-[10px] font-bold text-emerald-700">{orderStats.completionRate}% total</span>
          </div>
          <div className="mt-1 text-[10px] text-emerald-700 font-medium truncate">
            Concluídas com sucesso
          </div>
        </div>

        {/* Painel do Gestor - Cobrança de Fechamento */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'NOT_COMPLETED' ? 'ALL' : 'NOT_COMPLETED')}
          className={`bg-white rounded-xl p-3 border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
            statusFilter === 'NOT_COMPLETED'
              ? 'border-purple-500 ring-2 ring-purple-400/30 bg-purple-50/30'
              : orderStats.remainingToClose > 0
              ? 'border-amber-300 hover:border-amber-400 bg-amber-50/20'
              : 'border-emerald-200 bg-emerald-50/20'
          }`}
          title="Clique para filtrar Chamados Não Finalizados"
        >
          <div className="flex items-center justify-between text-slate-700 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-800">Meta do Gestor</span>
            <div className={`p-1.5 rounded-lg ${orderStats.remainingToClose > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
              <Shield className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-black ${orderStats.remainingToClose > 0 ? 'text-amber-900' : 'text-emerald-900'}`}>
              {orderStats.remainingToClose}
            </span>
            <span className="text-[10px] font-bold text-slate-600">a fechar</span>
          </div>
          <div className="mt-1 text-[10px] font-bold truncate">
            {orderStats.remainingToClose > 0 ? (
              <span className="text-amber-800 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping inline-block" />
                Cobrar preenchimento!
              </span>
            ) : (
              <span className="text-emerald-700 font-bold">
                🎉 100% Finalizadas no Dia!
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filters & Actions Box */}
      <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs space-y-2.5">
        {/* Linha 1: Filtros de Status, Técnico, Período e Botões de Ação */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter Select */}
            <div className="flex items-center space-x-1.5 shrink-0">
              <label className="text-[11px] font-semibold text-slate-500 hidden sm:inline">Status:</label>
              <select
                id="orders-status-filter-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-cyan-500 focus:outline-none cursor-pointer"
              >
                <option value="ALL">Todos os Status</option>
                <option value="NOT_COMPLETED">⚠️ Não Finalizadas</option>
                <option value="PENDING">Pendentes</option>
                <option value="IN_PROGRESS">Em Andamento</option>
                <option value="COMPLETED">Finalizadas</option>
                <option value="CANCELLED">Canceladas</option>
              </select>
            </div>

            {/* Technician Filter Select */}
            <div className="flex items-center space-x-1.5 shrink-0">
              <label className="text-[11px] font-semibold text-slate-500 hidden sm:inline">Técnico:</label>
              <select
                id="orders-tech-filter-select"
                value={technicianFilter}
                onChange={(e) => setTechnicianFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-cyan-500 focus:outline-none cursor-pointer"
              >
                <option value="ALL">Todos os Técnicos</option>
                <option value="UNALLOCATED">⚠️ Apenas Não Alocados</option>
                {techniciansList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Period Filter: Início */}
            <div className="relative inline-flex items-center space-x-1.5 bg-slate-50 hover:bg-cyan-50/50 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-cyan-300 transition-all group shrink-0">
              <Calendar className="h-4 w-4 text-cyan-700 group-hover:scale-110 transition-transform shrink-0 pointer-events-none" />
              <span className="text-xs font-bold text-slate-700 group-hover:text-cyan-900 select-none pointer-events-none">
                Início{startDateFilter ? `: ${formatDateBR(startDateFilter)}` : ''}
              </span>
              <input
                type="date"
                value={startDateFilter}
                onChange={(e) => setStartDateFilter(e.target.value)}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                title="Clique para selecionar a Data Inicial"
              />
              {startDateFilter && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setStartDateFilter('');
                  }}
                  className="z-20 p-0.5 text-slate-400 hover:text-red-500 rounded-full hover:bg-slate-200 transition-colors cursor-pointer"
                  title="Limpar Data Inicial"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Period Filter: Fim */}
            <div className="relative inline-flex items-center space-x-1.5 bg-slate-50 hover:bg-cyan-50/50 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-cyan-300 transition-all group shrink-0">
              <Calendar className="h-4 w-4 text-cyan-700 group-hover:scale-110 transition-transform shrink-0 pointer-events-none" />
              <span className="text-xs font-bold text-slate-700 group-hover:text-cyan-900 select-none pointer-events-none">
                Fim{endDateFilter ? `: ${formatDateBR(endDateFilter)}` : ''}
              </span>
              <input
                type="date"
                value={endDateFilter}
                onChange={(e) => setEndDateFilter(e.target.value)}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                title="Clique para selecionar a Data Final"
              />
              {endDateFilter && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEndDateFilter('');
                  }}
                  className="z-20 p-0.5 text-slate-400 hover:text-red-500 rounded-full hover:bg-slate-200 transition-colors cursor-pointer"
                  title="Limpar Data Final"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Actions: Clear Filters & Icon-only Export CSV with Tooltip */}
          <div className="flex items-center space-x-1.5 shrink-0 ml-auto">
            {(searchTerm || statusFilter !== 'ALL' || technicianFilter !== 'ALL' || startDateFilter || endDateFilter) && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-semibold flex items-center space-x-1 cursor-pointer transition-all"
                title="Limpar todos os filtros"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="text-[11px]">Limpar</span>
              </button>
            )}

            {/* Exportar CSV - Apenas Ícone com Tooltip no Hover */}
            <div className="relative group inline-block">
              <button
                id="orders-export-csv-btn"
                onClick={exportOrdersCsv}
                className="p-1.5 bg-white hover:bg-cyan-50 text-slate-700 hover:text-cyan-800 rounded-lg border border-slate-200 hover:border-cyan-300 shadow-2xs transition-all cursor-pointer flex items-center justify-center"
                aria-label="Exportar CSV"
              >
                <FileDown className="h-4 w-4 text-slate-600 group-hover:text-cyan-700 transition-colors" />
              </button>

              {/* Tooltip Popup no Hover */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[11px] font-bold px-2.5 py-1 rounded-md shadow-lg whitespace-nowrap pointer-events-none z-30 flex items-center gap-1">
                <span>Exportar CSV</span>
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[1px] border-4 border-transparent border-t-slate-900" />
              </div>
            </div>
          </div>
        </div>

        {/* Linha 2: Campo de Busca (Search Input) com suporte a PowerQuery */}
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            id="orders-search-input"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por chamado, cliente, CPF, data (ex: 15/ ou 15/08) ou filtro duplo com ; (ex: 15/08; Marcelo)..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:bg-white transition-all shadow-2xs"
          />
        </div>
      </div>

      {/* Banner de Ação Rápida para Ordens Não Alocadas */}
      {unallocatedOrders.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800 shrink-0 font-bold text-sm">
              ⚠️
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-950">
                {unallocatedOrders.length} Ordem(ns) de Serviço Não Alocadas
              </h4>
              <p className="text-[11px] text-amber-800">
                Selecione o técnico para vincular todas as OSs pendentes ou altere individualmente na tabela:
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={batchTechId}
              onChange={(e) => setBatchTechId(e.target.value)}
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
              disabled={!batchTechId || isBatchBusy}
              onClick={async () => {
                if (!batchTechId) return;
                try {
                  setIsBatchBusy(true);
                  const idsToAssign = unallocatedOrders.map((o) => o.id);
                  await batchReassignTechnician(idsToAssign, batchTechId);
                } finally {
                  setIsBatchBusy(false);
                  setBatchTechId('');
                }
              }}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {isBatchBusy ? 'Vinculando...' : `Atribuir Todas (${unallocatedOrders.length} OSs)`}
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

      {/* Orders High Density DataGrid with Clickable Excel-like Column Headers */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-bold text-[10px] tracking-wider select-none">
              <tr>
                {/* 1. Chamado Porto */}
                <th
                  onClick={() => handleSort('callNumber')}
                  className="py-3 px-3.5 whitespace-nowrap cursor-pointer hover:bg-slate-100 transition-colors group"
                >
                  <div className="flex items-center">
                    <span>Chamado Porto</span>
                    {renderSortIndicator('callNumber')}
                  </div>
                </th>

                {/* 2. Cliente & Local */}
                <th
                  onClick={() => handleSort('customerName')}
                  className="py-3 px-3.5 min-w-[160px] cursor-pointer hover:bg-slate-100 transition-colors group"
                >
                  <div className="flex items-center">
                    <span>Cliente & Local</span>
                    {renderSortIndicator('customerName')}
                  </div>
                </th>

                {/* 3. Serviço */}
                <th
                  onClick={() => handleSort('serviceCategory')}
                  className="py-3 px-3.5 min-w-[140px] cursor-pointer hover:bg-slate-100 transition-colors group"
                >
                  <div className="flex items-center">
                    <span>Serviço</span>
                    {renderSortIndicator('serviceCategory')}
                  </div>
                </th>

                {/* 4. Técnico */}
                <th
                  onClick={() => handleSort('technicianName')}
                  className="py-3 px-3.5 min-w-[130px] cursor-pointer hover:bg-slate-100 transition-colors group"
                >
                  <div className="flex items-center">
                    <span>Técnico</span>
                    {renderSortIndicator('technicianName')}
                  </div>
                </th>

                {/* 5. Data / Hora */}
                <th
                  onClick={() => handleSort('scheduledDate')}
                  className="py-3 px-3.5 whitespace-nowrap bg-cyan-50/40 text-cyan-900 border-x border-cyan-100 cursor-pointer hover:bg-cyan-100/60 transition-colors group"
                >
                  <div className="flex items-center">
                    <span>Data / Hora</span>
                    {renderSortIndicator('scheduledDate')}
                  </div>
                </th>

                {/* 6. Deslocamento (KM) */}
                <th
                  onClick={() => handleSort('kmTraveled')}
                  className="py-3 px-3.5 whitespace-nowrap cursor-pointer hover:bg-slate-100 transition-colors group"
                >
                  <div className="flex items-center">
                    <span>Deslocamento (KM)</span>
                    {renderSortIndicator('kmTraveled')}
                  </div>
                </th>

                {/* 7. Repasse Técnico */}
                <th
                  onClick={() => handleSort('totalTechnicianGross')}
                  className="py-3 px-3.5 whitespace-nowrap cursor-pointer hover:bg-slate-100 transition-colors group"
                >
                  <div className="flex items-center">
                    <span>Repasse Técnico</span>
                    {renderSortIndicator('totalTechnicianGross')}
                  </div>
                </th>

                {/* 8. Pedágio */}
                <th
                  onClick={() => handleSort('tollCost')}
                  className="py-3 px-3.5 whitespace-nowrap bg-slate-100/60 text-slate-700 cursor-pointer hover:bg-slate-200/60 transition-colors group"
                >
                  <div className="flex items-center">
                    <span>Pedágio</span>
                    {renderSortIndicator('tollCost')}
                  </div>
                </th>

                {/* 9. Suporte Extra */}
                <th
                  onClick={() => handleSort('supportCost')}
                  className="py-3 px-3.5 whitespace-nowrap bg-slate-100/60 text-slate-700 cursor-pointer hover:bg-slate-200/60 transition-colors group"
                >
                  <div className="flex items-center">
                    <span>Suporte Extra</span>
                    {renderSortIndicator('supportCost')}
                  </div>
                </th>

                {/* 10. Status */}
                <th
                  onClick={() => handleSort('status')}
                  className="py-3 px-3.5 text-center whitespace-nowrap cursor-pointer hover:bg-slate-100 transition-colors group"
                >
                  <div className="flex items-center justify-center">
                    <span>Status</span>
                    {renderSortIndicator('status')}
                  </div>
                </th>

                <th className="py-3 px-3.5 text-center whitespace-nowrap min-w-[90px]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedOrders.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    <div className="max-w-md mx-auto space-y-1.5">
                      <p className="font-semibold text-slate-600 text-sm">
                        Nenhuma ordem de serviço encontrada com os filtros selecionados.
                      </p>
                      <p className="text-xs text-slate-400">
                        Altere os filtros acima ou limpe o campo de busca.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                sortedOrders.map((os) => {
                  const scheduleInfo = formatScheduledDateTime(os.scheduledDate);
                  const matchedTech = safeUsers.find(
                    (u) =>
                      u.id === os.technicianId ||
                      (os.technicianName && u.name.toLowerCase() === os.technicianName.toLowerCase())
                  );
                  const displayName = matchedTech?.name || os.technicianName || null;
                  const isUnallocated = !displayName || displayName === 'Não Alocado';

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
                        <div className="flex items-center gap-1.5">
                          <select
                            value={matchedTech?.id || os.technicianId || ''}
                            onChange={async (e) => {
                              const newTechId = e.target.value;
                              if (newTechId) {
                                await reassignOrderTechnician(os.id, newTechId);
                              }
                            }}
                            className={`text-xs font-semibold py-1 px-2 rounded-lg border transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                              isUnallocated
                                ? 'bg-amber-50 text-amber-900 border-amber-300 ring-1 ring-amber-400/50'
                                : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-cyan-50 hover:border-cyan-300'
                            }`}
                            title="Alterar técnico responsável"
                          >
                            {isUnallocated && <option value="">⚠️ Não Alocado (Selecione)</option>}
                            {techniciansList.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>

                      {/* 5. DATA / HORA */}
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

                      {/* 8. PEDÁGIO */}
                      <td className="py-3 px-3.5 whitespace-nowrap bg-slate-50/50">
                        <div className={`font-mono font-medium ${os.tollCost > 0 ? 'text-amber-700 font-bold' : 'text-slate-400'}`}>
                          R$ {(os.tollCost || 0).toFixed(2)}
                        </div>
                      </td>

                      {/* 9. SUPORTE EXTRA */}
                      <td className="py-3 px-3.5 whitespace-nowrap bg-slate-50/50">
                        <div className={`font-mono font-medium ${os.supportCost > 0 ? 'text-cyan-700 font-bold' : 'text-slate-400'}`}>
                          R$ {(os.supportCost || 0).toFixed(2)}
                        </div>
                      </td>

                      {/* 10. Status */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        {getStatusBadge(os.status)}
                      </td>

                      {/* 11. AÇÕES */}
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
