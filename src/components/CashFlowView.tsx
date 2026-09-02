import React, { useState, useMemo } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  FileDown,
  Search,
  User,
  X,
  Calendar,
  RotateCcw,
  Wallet,
  PiggyBank,
  Receipt,
  Shield,
  CheckCircle2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { FinancialMovement } from '../types';

interface CashFlowViewProps {
  showNewModal: boolean;
  onCloseNewModal: () => void;
  onOpenNewModal: () => void;
}

export const CashFlowView: React.FC<CashFlowViewProps> = ({
  showNewModal,
  onCloseNewModal,
  onOpenNewModal,
}) => {
  const { movements = [], createFinancialMovement, exportCashFlowCsv, users = [] } = useApp();
  
  // Filter States
  const [filterType, setFilterType] = useState<string>('ALL');
  const [selectedTechFilter, setSelectedTechFilter] = useState<string>('ALL');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('ALL');
  const [startDateFilter, setStartDateFilter] = useState<string>('');
  const [endDateFilter, setEndDateFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const safeMovements = movements || [];
  const safeUsers = users || [];

  // Form states inside modal
  const [desc, setDesc] = useState('');
  const [type, setType] = useState<FinancialMovement['type']>('EXPENSE_ADVANCE');
  const [category, setCategory] = useState('Adiantamento de Quinzena (Vale)');
  const [amount, setAmount] = useState<number>(100);
  const [techId, setTechId] = useState<string>(safeUsers.find((u) => u.role === 'TECHNICIAN')?.id || '');
  const [paymentMethod, setPaymentMethod] = useState('PIX');

  const technicians = safeUsers.filter((u) => u.role === 'TECHNICIAN');

  // Formatar data ISO (YYYY-MM-DD) para PT-BR (DD/MM/YYYY)
  const formatDateBR = (isoStr: string) => {
    if (!isoStr) return '';
    const parts = isoStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return isoStr;
  };

  // Executive Dashboard Stats
  const stats = useMemo(() => {
    let totalInflow = 0;
    let totalOutflow = 0;
    let totalAdvances = 0;
    let advanceCount = 0;
    let incomeCount = 0;
    let expenseCount = 0;

    safeMovements.forEach((m) => {
      if (!m) return;
      const amt = m.amount || 0;
      if (m.type?.startsWith('INCOME') || m.type === 'INCOME_PORTO') {
        totalInflow += amt;
        incomeCount++;
      } else {
        totalOutflow += amt;
        expenseCount++;
        if (m.type === 'EXPENSE_ADVANCE' || m.type === 'ADVANCE_VALE') {
          totalAdvances += amt;
          advanceCount++;
        }
      }
    });

    const netBalance = totalInflow - totalOutflow;

    return {
      totalInflow,
      totalOutflow,
      totalAdvances,
      advanceCount,
      incomeCount,
      expenseCount,
      netBalance,
      totalMovements: safeMovements.length,
    };
  }, [safeMovements]);

  // PowerQuery multi-criteria + search logic
  const filteredMovements = useMemo(() => {
    return safeMovements.filter((m) => {
      if (!m) return false;

      // 1. Tipo filter
      const matchesType =
        filterType === 'ALL'
          ? true
          : filterType === 'INCOME'
          ? (m.type?.startsWith('INCOME') || m.type === 'INCOME_PORTO')
          : filterType === 'ADVANCE'
          ? (m.type === 'EXPENSE_ADVANCE' || m.type === 'ADVANCE_VALE')
          : m.type?.startsWith('EXPENSE');

      if (!matchesType) return false;

      // 2. Technician filter
      if (selectedTechFilter !== 'ALL') {
        if (m.technicianId !== selectedTechFilter && m.technicianName !== selectedTechFilter) {
          return false;
        }
      }

      // 3. Payment Method filter
      if (paymentMethodFilter !== 'ALL') {
        const method = (m.paymentMethod || 'PIX').toUpperCase();
        if (!method.includes(paymentMethodFilter.toUpperCase())) {
          return false;
        }
      }

      // 4. Date Range Filter (Início e Fim)
      const movDateStr = m.movementDate || m.date || '';
      if (startDateFilter && movDateStr) {
        if (movDateStr < startDateFilter) return false;
      }
      if (endDateFilter && movDateStr) {
        if (movDateStr > endDateFilter) return false;
      }

      // 5. PowerQuery Search (suporte a ; para múltiplos critérios)
      if (!searchTerm.trim()) return true;

      const subQueries = searchTerm
        .split(';')
        .map((q) => q.trim().toLowerCase())
        .filter((q) => q.length > 0);

      // Formatar data em PT-BR para conferência na busca (ex: 15/08/2026 e 15/08)
      let formattedDateBR = '';
      if (movDateStr) {
        const parts = movDateStr.split('-');
        if (parts.length === 3) {
          formattedDateBR = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
      }

      const searchableText = [
        m.description || '',
        m.category || '',
        m.technicianName || '',
        m.paymentMethod || 'PIX',
        movDateStr,
        formattedDateBR,
        `r$ ${m.amount || 0}`,
        `${m.amount || 0}`,
      ]
        .join(' ')
        .toLowerCase();

      // ALL subqueries must match (AND logic)
      return subQueries.every((sub) => searchableText.includes(sub));
    });
  }, [
    safeMovements,
    filterType,
    selectedTechFilter,
    paymentMethodFilter,
    startDateFilter,
    endDateFilter,
    searchTerm,
  ]);

  const hasActiveFilters =
    filterType !== 'ALL' ||
    selectedTechFilter !== 'ALL' ||
    paymentMethodFilter !== 'ALL' ||
    startDateFilter !== '' ||
    endDateFilter !== '' ||
    searchTerm !== '';

  const clearFilters = () => {
    setFilterType('ALL');
    setSelectedTechFilter('ALL');
    setPaymentMethodFilter('ALL');
    setStartDateFilter('');
    setEndDateFilter('');
    setSearchTerm('');
  };

  const handleCreateMovement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc || amount <= 0) return;

    const selectedTech = technicians.find((t) => t.id === techId);

    createFinancialMovement({
      description: desc,
      type: type,
      category: category,
      amount: Number(amount),
      movementDate: new Date().toISOString().split('T')[0],
      technicianId: type === 'EXPENSE_ADVANCE' ? techId : undefined,
      technicianName: type === 'EXPENSE_ADVANCE' ? selectedTech?.name : undefined,
      paymentMethod: paymentMethod,
    });

    onCloseNewModal();
    setDesc('');
    setAmount(100);
  };

  return (
    <div className="space-y-6">
      {/* Executive Status Dashboard - Quadros Informativos de Fluxo de Caixa */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Entradas */}
        <div
          onClick={() => setFilterType(filterType === 'INCOME' ? 'ALL' : 'INCOME')}
          className={`bg-white rounded-xl p-3 border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
            filterType === 'INCOME'
              ? 'border-emerald-500 ring-2 ring-emerald-400/30 bg-emerald-50/20'
              : 'border-slate-200 hover:border-emerald-300'
          }`}
          title="Clique para filtrar Entradas (Receitas)"
        >
          <div className="flex items-center justify-between text-emerald-700 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Total Entradas</span>
            <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black text-emerald-900">
              R$ {stats.totalInflow.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-emerald-700 font-medium truncate">
            {stats.incomeCount} recebimentos registrados
          </div>
        </div>

        {/* Saídas */}
        <div
          onClick={() => setFilterType(filterType === 'EXPENSE' ? 'ALL' : 'EXPENSE')}
          className={`bg-white rounded-xl p-3 border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
            filterType === 'EXPENSE'
              ? 'border-red-500 ring-2 ring-red-400/30 bg-red-50/20'
              : 'border-slate-200 hover:border-red-300'
          }`}
          title="Clique para filtrar Saídas (Despesas Gerais)"
        >
          <div className="flex items-center justify-between text-red-700 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-red-800">Total Saídas</span>
            <div className="p-1.5 rounded-lg bg-red-100 text-red-800">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black text-red-900">
              R$ {stats.totalOutflow.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-red-700 font-medium truncate">
            {stats.expenseCount} despesas pagas
          </div>
        </div>

        {/* Vales & Adiantamentos */}
        <div
          onClick={() => setFilterType(filterType === 'ADVANCE' ? 'ALL' : 'ADVANCE')}
          className={`bg-white rounded-xl p-3 border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
            filterType === 'ADVANCE'
              ? 'border-purple-500 ring-2 ring-purple-400/30 bg-purple-50/20'
              : 'border-slate-200 hover:border-purple-300'
          }`}
          title="Clique para filtrar Vales de Técnicos"
        >
          <div className="flex items-center justify-between text-purple-700 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-800">Vales Concedidos</span>
            <div className="p-1.5 rounded-lg bg-purple-100 text-purple-800">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black text-purple-900">
              R$ {stats.totalAdvances.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-purple-700 font-medium truncate">
            {stats.advanceCount} vales quinzenais
          </div>
        </div>

        {/* Saldo Consolidado */}
        <div
          onClick={() => setFilterType('ALL')}
          className={`bg-white rounded-xl p-3 border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
            filterType === 'ALL'
              ? 'border-cyan-500 ring-2 ring-cyan-400/30 bg-cyan-50/20'
              : 'border-slate-200 hover:border-cyan-300'
          }`}
          title="Clique para ver o Saldo Geral em Caixa"
        >
          <div className="flex items-center justify-between text-slate-700 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-800">Saldo em Caixa</span>
            <div className={`p-1.5 rounded-lg ${stats.netBalance >= 0 ? 'bg-cyan-100 text-[#003366]' : 'bg-red-100 text-red-800'}`}>
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-xl sm:text-2xl font-black ${stats.netBalance >= 0 ? 'text-[#003366]' : 'text-red-600'}`}>
              R$ {stats.netBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500 font-medium truncate">
            Saldo acumulado disponível
          </div>
        </div>

        {/* Gestor - Abatimento Quinzena */}
        <div
          onClick={() => setFilterType('ADVANCE')}
          className="bg-white rounded-xl p-3 border border-amber-300 bg-amber-50/20 hover:border-amber-400 transition-all cursor-pointer shadow-2xs hover:shadow-md"
          title="Valor total que será descontado no próximo fechamento dos técnicos"
        >
          <div className="flex items-center justify-between text-amber-800 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Abatimento Quinzena</span>
            <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800">
              <Shield className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black text-amber-900">
              R$ {stats.totalAdvances.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-amber-800 font-bold truncate flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block" />
            A descontar na folha
          </div>
        </div>
      </div>

      {/* Filters & Actions Box */}
      <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs space-y-2.5">
        {/* Linha 1: Filtros de Tipo, Técnico, Forma de Pagamento, Período e Botões de Ação */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Esquerda: Selects de Tipo, Técnico, Forma de Pagamento e Período */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Tipo */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0">Tipo:</span>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer py-0.5"
              >
                <option value="ALL">Todos os Lançamentos</option>
                <option value="INCOME">🟢 Entradas (Receitas)</option>
                <option value="ADVANCE">🟣 Vales / Adiantamentos</option>
                <option value="EXPENSE">🔴 Saídas / Despesas</option>
              </select>
            </div>

            {/* Técnico */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0">Técnico:</span>
              <select
                value={selectedTechFilter}
                onChange={(e) => setSelectedTechFilter(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer py-0.5 max-w-[170px] truncate"
              >
                <option value="ALL">Todos os Técnicos</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Forma Pagamento */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0">Pagamento:</span>
              <select
                value={paymentMethodFilter}
                onChange={(e) => setPaymentMethodFilter(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer py-0.5"
              >
                <option value="ALL">Todas as Formas</option>
                <option value="PIX">PIX</option>
                <option value="TED">TED / Transferência</option>
                <option value="Boleto">Boleto</option>
                <option value="Dinheiro">Dinheiro</option>
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

          {/* Actions: Clear Filters & Icon-only Export CSV */}
          <div className="flex items-center gap-2 shrink-0">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-all cursor-pointer"
                title="Limpar todos os filtros"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Limpar Filtros</span>
              </button>
            )}

            {/* Export CSV Icon-only Button with Tooltip */}
            <div className="relative group">
              <button
                id="btn-export-cashflow-csv-icon"
                onClick={exportCashFlowCsv}
                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-lg transition-all cursor-pointer border border-slate-200 shadow-2xs"
                aria-label="Exportar CSV"
              >
                <FileDown className="h-4 w-4 text-cyan-700" />
              </button>
              <div className="absolute right-0 top-full mt-1 hidden group-hover:block bg-slate-900 text-white text-[10px] font-bold py-1 px-2 rounded shadow-lg whitespace-nowrap z-30">
                Exportar CSV
              </div>
            </div>
          </div>
        </div>

        {/* Linha 2: Busca por Texto Estilo PowerQuery com suporte a ; */}
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por descrição, técnico, categoria, valor, data (ex: 15/ ou 15/08) ou filtro duplo com ; (ex: Vale; Marcelo)..."
            className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:bg-white transition-all font-medium"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200"
              title="Limpar busca"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Movements Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-400 uppercase font-bold text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Data</th>
                <th className="py-3 px-4">Descrição</th>
                <th className="py-3 px-4">Categoria</th>
                <th className="py-3 px-4">Técnico Vinculado</th>
                <th className="py-3 px-4">Forma Pagamento</th>
                <th className="py-3 px-4 text-right">Valor (R$)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    <p className="font-semibold text-xs">Nenhum lançamento encontrado para os filtros selecionados.</p>
                    {hasActiveFilters && (
                      <button
                        onClick={clearFilters}
                        className="mt-2 text-xs font-bold text-cyan-700 hover:underline cursor-pointer"
                      >
                        Limpar todos os filtros
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredMovements.map((mov) => {
                  const isIncome = mov.type?.startsWith('INCOME') || mov.type === 'INCOME_PORTO';
                  const isAdvance = mov.type === 'EXPENSE_ADVANCE' || mov.type === 'ADVANCE_VALE';
                  const movDateStr = mov.movementDate || mov.date || '';

                  return (
                    <tr key={mov.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-slate-600 font-medium">
                        {formatDateBR(movDateStr)}
                      </td>

                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        {mov.description}
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isIncome
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : isAdvance
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : 'bg-red-100 text-red-800 border border-red-200'
                          }`}
                        >
                          {mov.category}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-700">
                        {mov.technicianName ? (
                          <div className="font-semibold text-slate-800 flex items-center space-x-1">
                            <User className="h-3 w-3 text-slate-400 shrink-0" />
                            <span>{mov.technicianName}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-slate-600 font-mono text-[11px]">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-semibold border border-slate-200">
                          {mov.paymentMethod || 'PIX'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <span
                          className={`font-black font-mono text-xs ${
                            isIncome ? 'text-emerald-700' : 'text-red-600'
                          }`}
                        >
                          {isIncome ? '+' : '-'} R${' '}
                          {(mov.amount || 0).toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Movement Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <form
            onSubmit={handleCreateMovement}
            className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-cyan-50 text-[#003366] border border-cyan-200">
                  <DollarSign className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#003366]">Novo Lançamento Financeiro</h3>
                  <p className="text-[10px] text-slate-400">Registre entradas, despesas ou vales para técnicos</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onCloseNewModal}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Tipo de Lançamento:</label>
                <select
                  value={type}
                  onChange={(e) => {
                    const val = e.target.value as any;
                    setType(val);
                    if (val === 'EXPENSE_ADVANCE') {
                      setCategory('Adiantamento de Quinzena (Vale)');
                    } else if (val === 'INCOME_PORTO') {
                      setCategory('Recebimento Porto Seguro');
                    } else if (val === 'INCOME_OTHER') {
                      setCategory('Outras Receitas');
                    } else if (val === 'EXPENSE_STOCK') {
                      setCategory('Compra de Insumos');
                    } else {
                      setCategory('Despesa Operacional');
                    }
                  }}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                >
                  <option value="EXPENSE_ADVANCE">🟣 Vale / Adiantamento de Técnico (Desconta na Quinzena)</option>
                  <option value="INCOME_PORTO">🟢 Entrada: Faturamento Porto Seguro</option>
                  <option value="INCOME_OTHER">🟢 Entrada: Outras Receitas</option>
                  <option value="EXPENSE_STOCK">🔴 Saída: Compra de Insumos Fornecedor</option>
                  <option value="EXPENSE_OPERATIONAL">🔴 Saída: Custos Operacionais Empresa</option>
                </select>
              </div>

              {type === 'EXPENSE_ADVANCE' && (
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">
                    Selecione o Técnico que recebeu o Vale:
                  </label>
                  <select
                    value={techId}
                    onChange={(e) => setTechId(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                  >
                    {technicians.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} (PIX: {t.pixKey || t.documentCpf})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Descrição:</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Adiantamento solicitado para combustível / manutenção"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">Valor (R$):</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">Forma de Pagamento:</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                  >
                    <option value="PIX">PIX</option>
                    <option value="TED / Transferência">TED / Transferência</option>
                    <option value="Boleto">Boleto</option>
                    <option value="Dinheiro">Dinheiro</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
              <button
                type="button"
                onClick={onCloseNewModal}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-[#003366] hover:bg-[#00264d] text-white font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                Confirmar Lançamento
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
