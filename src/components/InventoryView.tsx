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
  Edit2,
  Plus,
  Trash2,
  AlertCircle,
  Sliders,
  DollarSign,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { StockItem } from '../types';

export const InventoryView: React.FC = () => {
  const {
    stock = [],
    registerStockEntry,
    updateStockItem,
    createStockItem,
    deleteStockItem,
    currentUser,
    addToast,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const safeStock = stock || [];
  const safeUser = currentUser || { role: 'ADMIN', name: 'Admin' };

  // Modals state
  const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedStockItem, setSelectedStockItem] = useState<StockItem | null>(null);

  // Form states for Edit / Create
  const [formData, setFormData] = useState({
    code: '',
    sku: '',
    name: '',
    category: 'Químicos / Limpeza',
    unit: 'Litros',
    quantityInStock: 0,
    minimumThreshold: 5,
    unitCost: 0,
    isSupportSupply: true,
    description: '',
  });

  // Restock form
  const [restockQty, setRestockQty] = useState<number>(10);
  const [restockCost, setRestockCost] = useState<number>(0);
  const [restockNotes, setRestockNotes] = useState<string>(
    'Entrada de reposição de insumos operacionais'
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

  // Open Edit Modal
  const handleOpenEdit = (item: StockItem) => {
    setSelectedStockItem(item);
    setFormData({
      code: item.code || item.sku || '',
      sku: item.sku || item.code || '',
      name: item.name || '',
      category: item.category || 'Químicos / Limpeza',
      unit: item.unit || 'Unidades',
      quantityInStock: Number(item.quantityInStock || 0),
      minimumThreshold: Number(item.minimumThreshold || 0),
      unitCost: Number(item.unitCost || 0),
      isSupportSupply: Boolean(item.isSupportSupply),
      description: item.description || '',
    });
    setIsEditModalOpen(true);
  };

  // Open Create Modal
  const handleOpenCreate = () => {
    setSelectedStockItem(null);
    setFormData({
      code: `INS-${String(safeStock.length + 1).padStart(3, '0')}`,
      sku: `INS-${String(safeStock.length + 1).padStart(3, '0')}`,
      name: '',
      category: 'Químicos / Limpeza',
      unit: 'Unidades',
      quantityInStock: 20,
      minimumThreshold: 10,
      unitCost: 35.0,
      isSupportSupply: true,
      description: '',
    });
    setIsCreateModalOpen(true);
  };

  // Save Edit
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStockItem) return;

    updateStockItem(selectedStockItem.id, {
      code: formData.code.trim().toUpperCase(),
      sku: formData.sku.trim().toUpperCase() || formData.code.trim().toUpperCase(),
      name: formData.name.trim(),
      category: formData.category,
      unit: formData.unit.trim(),
      quantityInStock: Number(formData.quantityInStock),
      minimumThreshold: Number(formData.minimumThreshold),
      unitCost: Number(formData.unitCost),
      isSupportSupply: formData.isSupportSupply,
      description: formData.description,
    });

    setIsEditModalOpen(false);
    setSelectedStockItem(null);
  };

  // Save Create
  const handleSaveCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    createStockItem({
      code: formData.code.trim().toUpperCase(),
      sku: formData.sku.trim().toUpperCase() || formData.code.trim().toUpperCase(),
      name: formData.name.trim(),
      category: formData.category,
      unit: formData.unit.trim(),
      quantityInStock: Number(formData.quantityInStock),
      minimumThreshold: Number(formData.minimumThreshold),
      unitCost: Number(formData.unitCost),
      isSupportSupply: formData.isSupportSupply,
      description: formData.description,
    });

    setIsCreateModalOpen(false);
  };

  // Restock Open
  const handleOpenRestock = (item?: StockItem) => {
    const target = item || safeStock[0];
    if (!target) return;
    setSelectedStockItem(target);
    setRestockCost((target.unitCost || 25) * 10);
    setRestockQty(10);
    setIsRestockModalOpen(true);
  };

  // Restock Confirm
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

  // Stats
  const criticalCount = safeStock.filter(
    (s) => s && s.quantityInStock < s.minimumThreshold
  ).length;

  const warningCount = safeStock.filter(
    (s) => s && s.quantityInStock === s.minimumThreshold
  ).length;

  const totalStockValue = safeStock.reduce(
    (acc, s) => acc + (s ? (s.quantityInStock || 0) * (s.unitCost || 0) : 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Header with Title & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#003366] tracking-tight">
            Estoque & Insumos Operacionais
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Cadastre, edite produtos e parâmetros de reposição. Alterações de quantidade e estoque mínimo refletem em tempo real no sino de notificações.
          </p>
        </div>

        {safeUser.role !== 'TECHNICIAN' && (
          <div className="flex items-center gap-2">
            <button
              id="btn-register-new-stock-item"
              onClick={handleOpenCreate}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-[#003366] border border-slate-300 text-xs font-bold rounded-lg shadow-xs transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4 text-cyan-600" />
              <span>+ Cadastrar Novo Insumo</span>
            </button>

            <button
              id="btn-register-restock"
              onClick={() => handleOpenRestock(safeStock[0])}
              className="flex items-center space-x-1.5 px-4 py-2 bg-[#003366] hover:bg-[#00264d] text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
            >
              <PlusCircle className="h-4 w-4 text-cyan-400" />
              <span>Registrar Entrada / Reposição</span>
            </button>
          </div>
        )}
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
            Total de Insumos
          </p>
          <div className="flex items-end justify-between mt-1">
            <span className="text-2xl font-bold text-[#003366]">
              {safeStock.length}
            </span>
            <span className="text-xs text-slate-400 font-medium uppercase">
              SKUs Ativos
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
            Abaixo do Mínimo
          </p>
          <div className="flex items-end justify-between mt-1">
            <span
              className={`text-2xl font-bold ${
                criticalCount > 0 ? 'text-red-600' : 'text-[#003366]'
              }`}
            >
              {criticalCount}
            </span>
            {criticalCount > 0 ? (
              <span className="text-[10px] text-red-700 bg-red-50 px-2 py-0.5 rounded font-bold border border-red-200 animate-pulse">
                CRÍTICO
              </span>
            ) : (
              <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-bold border border-emerald-100">
                0 PENDÊNCIAS
              </span>
            )}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
            No Limite Mínimo
          </p>
          <div className="flex items-end justify-between mt-1">
            <span
              className={`text-2xl font-bold ${
                warningCount > 0 ? 'text-amber-600' : 'text-[#003366]'
              }`}
            >
              {warningCount}
            </span>
            {warningCount > 0 ? (
              <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-bold border border-amber-200">
                ATENÇÃO
              </span>
            ) : (
              <span className="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded font-bold">
                REGULAR
              </span>
            )}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
            Valor em Estoque
          </p>
          <div className="flex items-end justify-between mt-1">
            <span className="text-xl font-bold text-[#003366]">
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

      {/* Stock Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-400 uppercase font-bold text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">SKU / Código</th>
                <th className="py-3 px-4">Produto & Categoria</th>
                <th className="py-3 px-4">Qtd Atual</th>
                <th className="py-3 px-4">Estoque Mínimo</th>
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
                  const isCrit = item.quantityInStock < item.minimumThreshold;
                  const isWarn = item.quantityInStock === item.minimumThreshold;
                  const isNormal = item.quantityInStock > item.minimumThreshold;

                  const ratio = Math.min(
                    100,
                    Math.round(
                      (item.quantityInStock / (item.minimumThreshold * 2 || 1)) * 100
                    )
                  );

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-[#003366]">
                        {item.sku || item.code}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{item.name}</span>
                          {item.isSupportSupply && (
                            <span className="px-1.5 py-0.2 bg-cyan-50 text-cyan-700 text-[9px] font-bold rounded border border-cyan-100">
                              OS
                            </span>
                          )}
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
                        <div className="w-24 h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isCrit
                                ? 'bg-red-500'
                                : isWarn
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.max(10, ratio)}%` }}
                          />
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-700">
                          {item.minimumThreshold}
                        </span>{' '}
                        <span className="text-slate-400">{item.unit}</span>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-700">
                        R${' '}
                        {(item.unitCost || 0).toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                        })}
                      </td>

                      <td className="py-3.5 px-4">
                        {isCrit ? (
                          <span className="inline-flex items-center px-2 py-0.5 bg-red-100 text-red-800 rounded-full font-bold text-[9px] uppercase tracking-wider border border-red-200">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            CRÍTICO (&lt; MÍNIMO)
                          </span>
                        ) : isWarn ? (
                          <span className="inline-flex items-center px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full font-bold text-[9px] uppercase tracking-wider border border-amber-200">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            ATENÇÃO (= MÍNIMO)
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[9px] uppercase tracking-wider border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            NORMAL (&gt; MÍNIMO)
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        {safeUser.role !== 'TECHNICIAN' && (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              id={`btn-edit-stock-${item.id}`}
                              onClick={() => handleOpenEdit(item)}
                              title="Editar dados, código, quantidade e custos do produto"
                              className="p-1.5 bg-slate-100 hover:bg-cyan-50 text-slate-600 hover:text-cyan-700 rounded-lg border border-slate-200 hover:border-cyan-200 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>Editar</span>
                            </button>

                            <button
                              id={`btn-repor-stock-${item.id}`}
                              onClick={() => handleOpenRestock(item)}
                              title="Registrar entrada de reposição"
                              className="px-2.5 py-1.5 bg-[#003366] hover:bg-[#00264d] text-white text-[11px] font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
                            >
                              + Repor
                            </button>
                          </div>
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

      {/* Edit Product Modal */}
      {isEditModalOpen && selectedStockItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#003366] text-white flex items-center justify-center font-bold">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Editar Insumo / Produto
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {selectedStockItem.name} ({selectedStockItem.sku || selectedStockItem.code})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">
                    Código / SKU:
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value, sku: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold uppercase"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">
                    Categoria:
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                  >
                    <option value="Químicos / Limpeza">Químicos / Limpeza</option>
                    <option value="Impermeabilizantes">Impermeabilizantes</option>
                    <option value="Suportes / Acessórios">Suportes / Acessórios</option>
                    <option value="Equipamentos">Equipamentos & Máquinas</option>
                    <option value="Outros Insumos">Outros Insumos</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-700 block mb-1">
                  Nome do Produto / Descrição:
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Químico Flotador Alcalino 5L"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">
                    Qtd em Estoque:
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={formData.quantityInStock}
                    onChange={(e) => setFormData({ ...formData, quantityInStock: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">
                    Estoque Mínimo:
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={formData.minimumThreshold}
                    onChange={(e) => setFormData({ ...formData, minimumThreshold: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-amber-700"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">
                    Unidade:
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    placeholder="Litros / un"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">
                    Custo Unitário Médio (R$):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formData.unitCost}
                    onChange={(e) => setFormData({ ...formData, unitCost: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                  />
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100">
                    <input
                      type="checkbox"
                      checked={formData.isSupportSupply}
                      onChange={(e) => setFormData({ ...formData, isSupportSupply: e.target.checked })}
                      className="rounded text-[#003366] focus:ring-cyan-500 h-4 w-4"
                    />
                    <span className="text-[11px] font-bold text-slate-700">
                      Abater direto em OS
                    </span>
                  </label>
                </div>
              </div>

              {/* Status Preview */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Impacto na Notificação:</span>
                  <div className="text-xs font-bold text-slate-800 mt-0.5">
                    {formData.quantityInStock < formData.minimumThreshold ? (
                      <span className="text-red-600 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Gerará alerta de Estoque Crítico no Sino
                      </span>
                    ) : formData.quantityInStock === formData.minimumThreshold ? (
                      <span className="text-amber-600 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Gerará sinalização de Atenção (Limite Mínimo)
                      </span>
                    ) : (
                      <span className="text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Estoque Normal (Sem pendência no Sino)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Deseja realmente remover o produto ${selectedStockItem.name}?`)) {
                      deleteStockItem(selectedStockItem.id);
                      setIsEditModalOpen(false);
                    }
                  }}
                  className="px-3 py-2 text-red-600 hover:bg-red-50 font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir</span>
                </button>

                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#003366] hover:bg-[#00264d] text-white font-bold rounded-lg shadow-sm cursor-pointer"
                  >
                    Salvar Alterações
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create New Product Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Cadastrar Novo Insumo / Produto
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Defina SKU, estoque mínimo e regras de baixa em OS
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCreate} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">
                    Código / SKU:
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value, sku: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold uppercase"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">
                    Categoria:
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                  >
                    <option value="Químicos / Limpeza">Químicos / Limpeza</option>
                    <option value="Impermeabilizantes">Impermeabilizantes</option>
                    <option value="Suportes / Acessórios">Suportes / Acessórios</option>
                    <option value="Equipamentos">Equipamentos & Máquinas</option>
                    <option value="Outros Insumos">Outros Insumos</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-700 block mb-1">
                  Nome do Produto:
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Neutralizador de Odores 5L"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">
                    Quantidade Inicial:
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={formData.quantityInStock}
                    onChange={(e) => setFormData({ ...formData, quantityInStock: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">
                    Estoque Mínimo:
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={formData.minimumThreshold}
                    onChange={(e) => setFormData({ ...formData, minimumThreshold: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-amber-700"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">
                    Unidade:
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    placeholder="Litros / un"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">
                    Custo Unitário (R$):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formData.unitCost}
                    onChange={(e) => setFormData({ ...formData, unitCost: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                  />
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100">
                    <input
                      type="checkbox"
                      checked={formData.isSupportSupply}
                      onChange={(e) => setFormData({ ...formData, isSupportSupply: e.target.checked })}
                      className="rounded text-[#003366] focus:ring-cyan-500 h-4 w-4"
                    />
                    <span className="text-[11px] font-bold text-slate-700">
                      Disponibilizar na OS móvel
                    </span>
                  </label>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#003366] hover:bg-[#00264d] text-white font-bold rounded-lg shadow-sm cursor-pointer"
                >
                  Cadastrar Produto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Restock Entry Modal */}
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
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
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
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#003366] hover:bg-[#00264d] text-white font-bold rounded-lg shadow-sm cursor-pointer"
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
