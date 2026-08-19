import React, { useState } from 'react';
import {
  PackageCheck,
  AlertTriangle,
  PlusCircle,
  TrendingDown,
  RefreshCw,
  Search,
  Package,
  Layers,
  CheckCircle2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { StockItem } from '../types';

export const InventoryView: React.FC = () => {
  const { stock = [], registerStockEntry, currentUser, addToast } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const safeStock = stock || [];
  const safeUser = currentUser || { role: 'ADMIN', name: 'Admin' };

  const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
  const [selectedStockItem, setSelectedStockItem] = useState<StockItem | null>(null);
  const [restockQty, setRestockQty] = useState<number>(10);
  const [restockCost, setRestockCost] = useState<number>(0);
  const [restockNotes, setRestockNotes] = useState<string>(
    'Entrada de reposição mensal de insumos'
  );

  const categories = Array.from(
    new Set(safeStock.filter((s) => s && s.category).map((s) => s.category))
  );

  const filteredStock = safeStock.filter((item) => {
    if (!item) return false;
    const matchesSearch =
      (item.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.sku || item.code || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat =
      selectedCategory === 'ALL' || item.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const handleOpenRestock = (item?: StockItem) => {
    const target = item || safeStock[0];
    if (!target) return;
    setSelectedStockItem(target);
    setRestockCost((target.unitCost || 25) * 10);
    setIsRestockModalOpen(true);
  };

  const handleConfirmRestock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStockItem || restockQty <= 0) return;

    registerStockEntry(
      selectedStockItem.id,
      Number(restockQty),
      Number(restockCost),
      restockNotes
    );

    setIsRestockModalOpen(false);
    setSelectedStockItem(null);
  };

  const lowStockCount = safeStock.filter(
    (s) => s && s.quantityInStock <= s.minimumThreshold
  ).length;

  const totalStockValue = safeStock.reduce(
    (acc, s) => acc + (s ? (s.quantityInStock || 0) * (s.unitCost || 0) : 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#003366] tracking-tight">
            Controle de Estoque & Baixa Automática
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Gerencie insumos químicos, bactericidas, escovas e suportes. A cada OS finalizada pelo técnico no app, os itens são baixados automaticamente.
          </p>
        </div>

        {safeUser.role !== 'TECHNICIAN' && (
          <button
            id="btn-register-restock"
            onClick={() => handleOpenRestock(safeStock[0])}
            className="flex items-center space-x-1.5 px-4 py-2 bg-[#003366] hover:bg-[#00264d] text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
          >
            <PlusCircle className="h-4 w-4 text-cyan-400" />
            <span>Registrar Entrada / Reposição</span>
          </button>
        )}
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
            Total de Itens Cadastrados
          </p>
          <div className="flex items-end justify-between mt-1">
            <span className="text-2xl font-bold text-[#003366]">
              {safeStock.length}
            </span>
            <span className="text-xs text-slate-400 font-medium uppercase">
              SKUs
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
            Itens Abaixo do Mínimo
          </p>
          <div className="flex items-end justify-between mt-1">
            <span
              className={`text-2xl font-bold ${
                lowStockCount > 0 ? 'text-red-500' : 'text-[#003366]'
              }`}
            >
              {lowStockCount}
            </span>
            {lowStockCount > 0 ? (
              <span className="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded font-bold border border-red-100">
                ALERTA
              </span>
            ) : (
              <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-bold border border-emerald-100">
                REGULAR
              </span>
            )}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
            Valor Total em Estoque
          </p>
          <div className="flex items-end justify-between mt-1">
            <span className="text-2xl font-bold text-[#003366]">
              R${' '}
              {totalStockValue.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
              })}
            </span>
            <span className="text-xs text-cyan-600 font-medium">Patrimônio</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome do produto ou SKU..."
            className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:bg-white"
          />
        </div>

        <div className="flex items-center space-x-1.5 overflow-x-auto w-full md:w-auto">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap cursor-pointer ${
              selectedCategory === 'ALL'
                ? 'bg-[#003366] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Todas as Categorias
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-[#003366] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Stock High Density Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-400 uppercase font-bold text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">SKU / Código</th>
                <th className="py-3 px-4">Produto & Categoria</th>
                <th className="py-3 px-4">Qtd Atual</th>
                <th className="py-3 px-4">Nível de Reposição</th>
                <th className="py-3 px-4">Custo Unitário</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStock.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Nenhum insumo encontrado para o filtro selecionado.
                  </td>
                </tr>
              ) : (
                filteredStock.map((item) => {
                  const isCritical =
                    item.quantityInStock <= item.minimumThreshold;
                  const ratio = Math.min(
                    100,
                    Math.round(
                      (item.quantityInStock / (item.minimumThreshold * 3 || 1)) *
                        100
                    )
                  );

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-[#003366]">
                        {item.sku || item.code}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">
                          {item.name}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {item.category}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="text-sm font-bold text-slate-800">
                          {item.quantityInStock}{' '}
                          <span className="text-xs text-slate-500 font-normal">
                            {item.unit}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Mínimo: {item.minimumThreshold} {item.unit}
                        </div>
                      </td>

                      {/* Reposition Level Bar */}
                      <td className="py-3.5 px-4 min-w-[140px]">
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-1">
                          <span>Nível</span>
                          <span>{ratio}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isCritical
                                ? 'bg-red-500'
                                : ratio > 60
                                ? 'bg-emerald-500'
                                : 'bg-cyan-500'
                            }`}
                            style={{ width: `${Math.max(8, ratio)}%` }}
                          />
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-700">
                        R${' '}
                        {(item.unitCost || 0).toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                        })}
                      </td>

                      <td className="py-3.5 px-4">
                        {isCritical ? (
                          <span className="inline-flex items-center px-2 py-0.5 bg-red-100 text-red-800 rounded-full font-bold text-[9px] uppercase tracking-wider">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            CRÍTICO
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[9px] uppercase tracking-wider">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            NORMAL
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        {safeUser.role !== 'TECHNICIAN' && (
                          <button
                            onClick={() => handleOpenRestock(item)}
                            className="px-2.5 py-1 bg-cyan-50 hover:bg-cyan-100 text-cyan-800 text-[11px] font-bold rounded border border-cyan-200 transition-colors cursor-pointer"
                          >
                            + Repor
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Restock Modal */}
      {isRestockModalOpen && selectedStockItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <PackageCheck className="w-5 h-5 text-cyan-600" />
                <span>Entrada de Insumo: {selectedStockItem.name}</span>
              </h3>
              <button
                onClick={() => setIsRestockModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmRestock} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">
                  Quantidade a Adicionar ({selectedStockItem.unit}):
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={restockQty}
                  onChange={(e) => {
                    const q = Number(e.target.value);
                    setRestockQty(q);
                    setRestockCost(q * (selectedStockItem.unitCost || 25));
                  }}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">
                  Custo Total da Entrada (R$):
                </label>
                <input
                  type="number"
                  step="0.10"
                  required
                  value={restockCost}
                  onChange={(e) => setRestockCost(Number(e.target.value))}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">
                  Observações / Fornecedor / NF:
                </label>
                <input
                  type="text"
                  value={restockNotes}
                  onChange={(e) => setRestockNotes(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsRestockModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#003366] hover:bg-[#00264d] text-white font-bold rounded-lg shadow-sm"
                >
                  Confirmar Entrada
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
