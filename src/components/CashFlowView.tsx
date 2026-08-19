import React, { useState } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Plus,
  FileDown,
  Search,
  User,
  ArrowUpRight,
  ArrowDownRight,
  X,
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
  const { movements = [], createFinancialMovement, exportCashFlowCsv, users = [], currentUser } = useApp();
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const safeMovements = movements || [];
  const safeUsers = users || [];

  // Form states
  const [desc, setDesc] = useState('');
  const [type, setType] = useState<FinancialMovement['type']>('EXPENSE_ADVANCE');
  const [category, setCategory] = useState('Adiantamento de Quinzena (Vale)');
  const [amount, setAmount] = useState<number>(100);
  const [techId, setTechId] = useState<string>(safeUsers.find(u => u.role === 'TECHNICIAN')?.id || '');
  const [paymentMethod, setPaymentMethod] = useState('PIX');

  const technicians = safeUsers.filter((u) => u.role === 'TECHNICIAN');

  const totalInflow = safeMovements
    .filter((m) => m && m.type && (m.type.startsWith('INCOME') || m.type === 'INCOME_PORTO'))
    .reduce((sum, m) => sum + (m.amount || 0), 0);

  const totalOutflow = safeMovements
    .filter((m) => m && m.type && (m.type.startsWith('EXPENSE') || m.type === 'EXPENSE_ADVANCE' || m.type === 'ADVANCE_VALE'))
    .reduce((sum, m) => sum + (m.amount || 0), 0);

  const netBalance = totalInflow - totalOutflow;

  const filteredMovements = safeMovements.filter((m) => {
    const matchesSearch =
      (m.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.technicianName && m.technicianName.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesType =
      filterType === 'ALL'
        ? true
        : filterType === 'INCOME'
        ? (m.type.startsWith('INCOME') || m.type === 'INCOME_PORTO')
        : filterType === 'ADVANCE'
        ? (m.type === 'EXPENSE_ADVANCE' || m.type === 'ADVANCE_VALE')
        : m.type.startsWith('EXPENSE');

    return matchesSearch && matchesType;
  });

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
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#003366] tracking-tight">
            Fluxo de Caixa & Gestão de Vales / Adiantamentos
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Registro de faturamento Porto Seguro, despesas de fornecedores e adiantamentos automáticos descontados na quinzena.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={exportCashFlowCsv}
            className="flex items-center space-x-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 shadow-xs transition-all"
          >
            <FileDown className="h-4 w-4 text-slate-600" />
            <span>Exportar CSV</span>
          </button>

          {currentUser.role !== 'TECHNICIAN' && (
            <button
              onClick={onOpenNewModal}
              className="flex items-center space-x-1.5 px-4 py-2 bg-[#003366] hover:bg-[#00264d] text-white text-xs font-bold rounded-lg shadow-sm transition-all"
            >
              <Plus className="h-4 w-4 text-cyan-400" />
              <span>Novo Lançamento / Vale</span>
            </button>
          )}
        </div>
      </div>

      {/* 3 High-Density Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        {/* Entradas */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
            Total Entradas (Receitas)
          </p>
          <div className="flex items-end justify-between mt-1">
            <span className="text-2xl font-bold text-[#003366]">
              R$ {totalInflow.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-green-600 font-medium bg-green-50 px-1.5 py-0.5 rounded border border-green-100">
              Porto Seguro
            </span>
          </div>
        </div>

        {/* Saídas */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
            Total Saídas & Vales
          </p>
          <div className="flex items-end justify-between mt-1">
            <span className="text-2xl font-bold text-red-500">
              R$ {totalOutflow.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded font-bold border border-red-100">
              DESPESAS
            </span>
          </div>
        </div>

        {/* Saldo Líquido */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
            Saldo Consolidado em Caixa
          </p>
          <div className="flex items-end justify-between mt-1">
            <span className={`text-2xl font-bold ${netBalance >= 0 ? 'text-[#003366]' : 'text-red-500'}`}>
              R$ {netBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-cyan-600 font-medium">
              Disponível
            </span>
          </div>
        </div>

      </div>

      {/* Filter Tabs and Search Bar */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por descrição ou técnico..."
            className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:bg-white"
          />
        </div>

        <div className="flex items-center space-x-1.5 w-full md:w-auto overflow-x-auto">
          {[
            { id: 'ALL', label: 'Todos os Lançamentos' },
            { id: 'INCOME', label: 'Entradas' },
            { id: 'ADVANCE', label: 'Vales / Adiantamentos' },
            { id: 'EXPENSE', label: 'Outras Despesas' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all ${
                filterType === tab.id
                  ? 'bg-[#003366] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

      </div>

      {/* Movements High Density Table */}
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
                <th className="py-3 px-4 text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMovements.map((mov) => {
                const isIncome = mov.type.startsWith('INCOME');
                return (
                  <tr key={mov.id} className="hover:bg-slate-50/70 transition-colors">
                    
                    <td className="py-3.5 px-4 font-mono text-slate-600">
                      {new Date(mov.movementDate).toLocaleDateString('pt-BR')}
                    </td>

                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {mov.description}
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isIncome
                            ? 'bg-green-100 text-green-700'
                            : mov.type === 'EXPENSE_ADVANCE'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {mov.category}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-slate-700">
                      {mov.technicianName ? (
                        <div className="font-semibold text-slate-800 flex items-center space-x-1">
                          <User className="h-3 w-3 text-slate-400" />
                          <span>{mov.technicianName}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-slate-600 font-mono text-[11px]">
                      {mov.paymentMethod || 'PIX'}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <span
                        className={`font-bold font-mono text-xs ${
                          isIncome ? 'text-green-600' : 'text-red-500'
                        }`}
                      >
                        {isIncome ? '+' : '-'} R$ {mov.amount.toFixed(2)}
                      </span>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Movement / Advance Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <form
            onSubmit={handleCreateMovement}
            className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-[#003366]">Novo Lançamento Financeiro / Vale</h3>
              <button type="button" onClick={onCloseNewModal} className="text-slate-400 hover:text-slate-600">
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
                    } else {
                      setCategory('Despesa Operacional');
                    }
                  }}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                >
                  <option value="EXPENSE_ADVANCE">🔴 Vale / Adiantamento de Técnico (Desconta na Quinzena)</option>
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
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
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
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">Valor (R$):</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
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
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
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
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-[#003366] hover:bg-[#00264d] text-white font-bold rounded-lg shadow-sm"
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
