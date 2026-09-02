import React, { useState, useMemo } from 'react';
import {
  PackageCheck,
  AlertTriangle,
  Plus,
  Search,
  CheckCircle2,
  X,
  Edit2,
  Trash2,
  AlertCircle,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  RefreshCw,
  DollarSign,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { StockItem } from '../types';

type SortField = 'sku' | 'name' | 'quantityInStock' | 'minimumThreshold' | 'unitCost' | 'totalValue' | 'status';
type SortOrder = 'asc' | 'desc';

export const InventoryView: React.FC = () => {
  const {
    stock = [],
    updateStockItem,
    createStockItem,
    deleteStockItem,
    currentUser,
    addToast,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const safeStock = stock || [];
  const safeUser = currentUser || { role: 'ADMIN', name: 'Admin' };
  const isAdminOrOps = safeUser.role !== 'TECHNICIAN';

  // Modals state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedStockItem, setSelectedStockItem] = useState<StockItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<StockItem | null>(null);

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

  const categories = useMemo(() => {
    return Array.from(
      new Set(safeStock.filter((s) => s && s.category).map((s) => s.category))
    );
  }, [safeStock]);

  // Handle Sort Toggle
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Filtered and Sorted Stock Items with PowerQuery `;` support
  const filteredAndSortedStock = useMemo(() => {
    let result = safeStock.filter((item) => {
      if (!item) return false;

      // Status check
      const isCrit = item.quantityInStock < item.minimumThreshold;
      const isWarn = item.quantityInStock === item.minimumThreshold;
      const isNormal = item.quantityInStock > item.minimumThreshold;

      if (selectedStatusFilter === 'CRITICAL' && !isCrit) return false;
      if (selectedStatusFilter === 'WARNING' && !isWarn) return false;
      if (selectedStatusFilter === 'NORMAL' && !isNormal) return false;

      // Category check
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) {
        return false;
      }

      // PowerQuery multi-criteria search (separated by ;)
      if (searchTerm.trim() !== '') {
        const terms = searchTerm
          .toLowerCase()
          .split(';')
          .map((t) => t.trim())
          .filter(Boolean);

        const itemText = [
          item.name,
          item.sku,
          item.code,
          item.category,
          item.unit,
          item.description,
          String(item.quantityInStock),
          String(item.unitCost),
          isCrit ? 'crítico' : isWarn ? 'atenção' : 'normal',
        ]
          .join(' ')
          .toLowerCase();

        // All search terms separated by ; must match (AND condition)
        const matchesAllTerms = terms.every((term) => itemText.includes(term));
        if (!matchesAllTerms) return false;
      }

      return true;
    });

    // Sorting
    return result.sort((a, b) => {
      let valA: any;
      let valB: any;

      switch (sortField) {
        case 'sku':
          valA = (a.sku || a.code || '').toLowerCase();
          valB = (b.sku || b.code || '').toLowerCase();
          break;
        case 'name':
          valA = (a.name || '').toLowerCase();
          valB = (b.name || '').toLowerCase();
          break;
        case 'quantityInStock':
          valA = Number(a.quantityInStock || 0);
          valB = Number(b.quantityInStock || 0);
          break;
        case 'minimumThreshold':
          valA = Number(a.minimumThreshold || 0);
          valB = Number(b.minimumThreshold || 0);
          break;
        case 'unitCost':
          valA = Number(a.unitCost || 0);
          valB = Number(b.unitCost || 0);
          break;
        case 'totalValue':
          valA = Number(a.quantityInStock || 0) * Number(a.unitCost || 0);
          valB = Number(b.quantityInStock || 0) * Number(b.unitCost || 0);
          break;
        case 'status':
          const statRank = (i: StockItem) =>
            i.quantityInStock < i.minimumThreshold
              ? 0
              : i.quantityInStock === i.minimumThreshold
              ? 1
              : 2;
          valA = statRank(a);
          valB = statRank(b);
          break;
        default:
          valA = (a.name || '').toLowerCase();
          valB = (b.name || '').toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [safeStock, selectedCategory, selectedStatusFilter, searchTerm, sortField, sortOrder]);

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
      code: `PROD-${String(safeStock.length + 1).padStart(3, '0')}`,
      sku: `PROD-${String(safeStock.length + 1).padStart(3, '0')}`,
      name: '',
      category: 'Químicos / Limpeza',
      unit: 'Litros',
      quantityInStock: 20,
      minimumThreshold: 5,
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

    addToast('Produto Atualizado', `Os dados de ${formData.name} foram atualizados com sucesso.`, 'success');
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

    addToast('Produto Cadastrado', `O produto ${formData.name} foi adicionado ao catálogo.`, 'success');
    setIsCreateModalOpen(false);
  };

  // Confirm Delete
  const handleConfirmDelete = () => {
    if (!itemToDelete) return;
    deleteStockItem(itemToDelete.id);
    addToast('Produto Removido', `O produto ${itemToDelete.name} foi excluído do cadastro.`, 'info');
    setItemToDelete(null);
  };

  // Export CSV
  const handleExportCsv = () => {
    const headers = ['SKU / Código', 'Nome do Produto', 'Categoria', 'Quantidade', 'Unidade', 'Estoque Mínimo', 'Custo Unitário (R$)', 'Valor Total (R$)', 'Status'];
    const rows = filteredAndSortedStock.map((item) => {
      const isCrit = item.quantityInStock < item.minimumThreshold;
      const isWarn = item.quantityInStock === item.minimumThreshold;
      const statusText = isCrit ? 'Crítico' : isWarn ? 'Atenção' : 'Normal';
      const total = (item.quantityInStock || 0) * (item.unitCost || 0);

      return [
        item.sku || item.code || '',
        item.name || '',
        item.category || '',
        item.quantityInStock || 0,
        item.unit || '',
        item.minimumThreshold || 0,
        `R$ ${(item.unitCost || 0).toFixed(2)}`,
        `R$ ${total.toFixed(2)}`,
        statusText,
      ];
    });

    const headerLine = headers.map((h) => `"${h}"`).join(';');
    const bodyLines = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'));
    const csvContent = '\uFEFF' + [headerLine, ...bodyLines].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Produtos_Estoque_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    addToast('CSV Exportado', `${filteredAndSortedStock.length} produtos exportados com sucesso.`, 'success');
  };

  // Stats Calculations
  const criticalCount = safeStock.filter(
    (s) => s && s.quantityInStock < s.minimumThreshold
  ).length;

  const warningCount = safeStock.filter(
    (s) => s && s.quantityInStock === s.minimumThreshold
  ).length;

  const normalCount = safeStock.filter(
    (s) => s && s.quantityInStock > s.minimumThreshold
  ).length;

  const totalStockValue = safeStock.reduce(
    (acc, s) => acc + (s ? (s.quantityInStock || 0) * (s.unitCost || 0) : 0),
    0
  );

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-300 ml-1 inline-block" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-cyan-600 ml-1 inline-block" />
    ) : (
      <ArrowDown className="w-3 h-3 text-cyan-600 ml-1 inline-block" />
    );
  };

  return (
    <div className="space-y-5">
      {/* Executive Metric Cards (Matching Chamados & Caixa - 5 Cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Card 1: Total de Produtos */}
        <div
          onClick={() => {
            setSelectedStatusFilter('ALL');
            setSelectedCategory('ALL');
          }}
          className={`bg-white rounded-xl p-3 border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
            selectedStatusFilter === 'ALL' ? 'border-cyan-500 ring-2 ring-cyan-400/30 bg-cyan-50/20' : 'border-slate-200'
          }`}
          title="Clique para ver Todos os Produtos"
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
              Total de Produtos
            </span>
            <div className="p-1.5 rounded-lg bg-cyan-50 text-[#003366]">
              <PackageCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-black text-[#003366]">
              {safeStock.length}
            </span>
            <span className="text-[10px] text-slate-500 font-medium">produtos</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500 font-medium truncate">
            SKUs Cadastrados
          </div>
        </div>

        {/* Card 2: Crítico (< Mínimo) */}
        <div
          onClick={() => setSelectedStatusFilter(selectedStatusFilter === 'CRITICAL' ? 'ALL' : 'CRITICAL')}
          className={`bg-white rounded-xl p-3 border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
            selectedStatusFilter === 'CRITICAL' ? 'border-red-500 ring-2 ring-red-400/30 bg-red-50/20' : 'border-slate-200'
          }`}
          title="Clique para filtrar Estoque Crítico"
        >
          <div className="flex items-center justify-between text-red-700 mb-1">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
              Abaixo do Mínimo
            </span>
            <div className="p-1.5 rounded-lg bg-red-100 text-red-700">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span
              className={`text-2xl font-black ${
                criticalCount > 0 ? 'text-red-600' : 'text-slate-800'
              }`}
            >
              {criticalCount}
            </span>
            <span className="text-[10px] text-red-700 font-bold">críticos</span>
          </div>
          <div className="mt-1 text-[10px] text-red-700 font-medium truncate">
            {criticalCount > 0 ? 'Necessita Reposição' : 'Sem pendências'}
          </div>
        </div>

        {/* Card 3: Atenção (= Mínimo) */}
        <div
          onClick={() => setSelectedStatusFilter(selectedStatusFilter === 'WARNING' ? 'ALL' : 'WARNING')}
          className={`bg-white rounded-xl p-3 border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
            selectedStatusFilter === 'WARNING' ? 'border-amber-500 ring-2 ring-amber-400/30 bg-amber-50/20' : 'border-slate-200'
          }`}
          title="Clique para filtrar No Limite Mínimo"
        >
          <div className="flex items-center justify-between text-amber-700 mb-1">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
              No Limite Mínimo
            </span>
            <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span
              className={`text-2xl font-black ${
                warningCount > 0 ? 'text-amber-600' : 'text-slate-800'
              }`}
            >
              {warningCount}
            </span>
            <span className="text-[10px] text-amber-700 font-bold">no limite</span>
          </div>
          <div className="mt-1 text-[10px] text-amber-700 font-medium truncate">
            Atenção para Repor
          </div>
        </div>

        {/* Card 4: Estoque Normal */}
        <div
          onClick={() => setSelectedStatusFilter(selectedStatusFilter === 'NORMAL' ? 'ALL' : 'NORMAL')}
          className={`bg-white rounded-xl p-3 border transition-all cursor-pointer shadow-2xs hover:shadow-md ${
            selectedStatusFilter === 'NORMAL' ? 'border-emerald-500 ring-2 ring-emerald-400/30 bg-emerald-50/20' : 'border-slate-200'
          }`}
          title="Clique para filtrar Estoque Normal"
        >
          <div className="flex items-center justify-between text-emerald-700 mb-1">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
              Estoque Normal
            </span>
            <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-black text-emerald-700">
              {normalCount}
            </span>
            <span className="text-[10px] text-emerald-700 font-bold">regulares</span>
          </div>
          <div className="mt-1 text-[10px] text-emerald-700 font-medium truncate">
            Nível Suficiente
          </div>
        </div>

        {/* Card 5: Valor Total em Estoque */}
        <div
          className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs hover:shadow-md transition-all cursor-pointer"
          title="Patrimônio Total em Estoque"
        >
          <div className="flex items-center justify-between text-emerald-700 mb-1">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
              Valor em Estoque
            </span>
            <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-xl sm:text-2xl font-black text-[#003366] font-mono">
              R$ {totalStockValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500 font-medium truncate">
            Patrimônio em Insumos
          </div>
        </div>
      </div>

      {/* Structured Filter & Search Panel (Matching Chamados & Caixa) */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        {/* Row 1: Filters, Export CSV, and + Novo Button */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            <div className="flex items-center gap-1.5 shrink-0">
              <Filter className="w-4 h-4 text-cyan-600" />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Filtros:
              </span>
            </div>

            {/* Category Dropdown */}
            <select
              id="product-category-filter-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-cyan-500 focus:outline-none cursor-pointer"
            >
              <option value="ALL">Todas as Categorias</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            {/* Status Dropdown */}
            <select
              id="product-status-filter-select"
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-cyan-500 focus:outline-none cursor-pointer"
            >
              <option value="ALL">Todos os Status</option>
              <option value="NORMAL">Normal (&gt; Mínimo)</option>
              <option value="WARNING">Atenção (= Mínimo)</option>
              <option value="CRITICAL">Crítico (&lt; Mínimo)</option>
            </select>

            {(selectedCategory !== 'ALL' || selectedStatusFilter !== 'ALL' || searchTerm !== '') && (
              <button
                onClick={() => {
                  setSelectedCategory('ALL');
                  setSelectedStatusFilter('ALL');
                  setSearchTerm('');
                }}
                className="text-[11px] text-cyan-700 hover:underline font-bold cursor-pointer shrink-0 ml-1"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Action Buttons: Export CSV Icon + Novo Button */}
          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
            <button
              id="btn-export-products-csv"
              onClick={handleExportCsv}
              title="Exportar Tabela de Produtos (CSV)"
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 transition-colors cursor-pointer flex items-center justify-center"
            >
              <Download className="w-4 h-4 text-slate-700" />
            </button>

            {isAdminOrOps && (
              <button
                id="btn-create-new-product"
                onClick={handleOpenCreate}
                className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-[#003366] hover:bg-[#00264d] text-white text-xs font-bold rounded-lg shadow-xs transition-all cursor-pointer"
              >
                <Plus className="h-4 w-4 text-cyan-300" />
                <span>Novo</span>
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Search Bar supporting PowerQuery `;` Syntax */}
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            id="product-search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, SKU, categoria ou usar ';' para múltiplos filtros (ex: Químicos; Litros)..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:bg-white"
          />
        </div>
      </div>

      {/* Stock Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-bold text-[10px] tracking-wider">
              <tr>
                <th
                  onClick={() => handleSort('sku')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                >
                  <span className="flex items-center">
                    SKU / Código {renderSortIcon('sku')}
                  </span>
                </th>
                <th
                  onClick={() => handleSort('name')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                >
                  <span className="flex items-center">
                    Produto & Categoria {renderSortIcon('name')}
                  </span>
                </th>
                <th
                  onClick={() => handleSort('quantityInStock')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                >
                  <span className="flex items-center">
                    Qtd Atual {renderSortIcon('quantityInStock')}
                  </span>
                </th>
                <th
                  onClick={() => handleSort('minimumThreshold')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                >
                  <span className="flex items-center">
                    Mínimo {renderSortIcon('minimumThreshold')}
                  </span>
                </th>
                <th
                  onClick={() => handleSort('unitCost')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                >
                  <span className="flex items-center">
                    Custo Unit. {renderSortIcon('unitCost')}
                  </span>
                </th>
                <th
                  onClick={() => handleSort('totalValue')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                >
                  <span className="flex items-center">
                    Valor Total {renderSortIcon('totalValue')}
                  </span>
                </th>
                <th
                  onClick={() => handleSort('status')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                >
                  <span className="flex items-center">
                    Status {renderSortIcon('status')}
                  </span>
                </th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAndSortedStock.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    Nenhum produto encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredAndSortedStock.map((item) => {
                  const isCrit = item.quantityInStock < item.minimumThreshold;
                  const isWarn = item.quantityInStock === item.minimumThreshold;

                  const ratio = Math.min(
                    100,
                    Math.round(
                      (item.quantityInStock / (item.minimumThreshold * 2 || 1)) * 100
                    )
                  );
                  const totalValue = (item.quantityInStock || 0) * (item.unitCost || 0);

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

                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        R${' '}
                        {totalValue.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                        })}
                      </td>

                      <td className="py-3.5 px-4">
                        {isCrit ? (
                          <span className="inline-flex items-center px-2 py-0.5 bg-red-100 text-red-800 rounded-full font-bold text-[9px] uppercase tracking-wider border border-red-200">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            CRÍTICO
                          </span>
                        ) : isWarn ? (
                          <span className="inline-flex items-center px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full font-bold text-[9px] uppercase tracking-wider border border-amber-200">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            ATENÇÃO
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[9px] uppercase tracking-wider border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            NORMAL
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        {isAdminOrOps && (
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Icon Button: Editar (Lápis) */}
                            <button
                              id={`btn-edit-product-${item.id}`}
                              onClick={() => handleOpenEdit(item)}
                              title="Editar dados, quantidade e valores do produto"
                              className="p-1.5 bg-slate-100 hover:bg-cyan-50 text-slate-600 hover:text-cyan-700 rounded-lg border border-slate-200 hover:border-cyan-200 transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Icon Button: Excluir (Lixeira) */}
                            <button
                              id={`btn-delete-product-${item.id}`}
                              onClick={() => setItemToDelete(item)}
                              title="Excluir produto"
                              className="p-1.5 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 rounded-lg border border-slate-200 hover:border-red-200 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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

      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-sm w-full p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Excluir Produto</h3>
                <p className="text-xs text-slate-500">
                  Tem certeza que deseja remover <strong>{itemToDelete.name}</strong> ({itemToDelete.sku || itemToDelete.code})?
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

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
                    Editar Produto
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
                  Nome do Produto:
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

              {/* Quantity adjustment section */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
                <label className="text-[10px] font-bold text-slate-700 block">
                  Ajuste de Estoque (Quantidade Atual):
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, quantityInStock: Math.max(0, formData.quantityInStock - 10) })}
                    className="px-2 py-1 bg-white border border-slate-300 rounded font-bold text-slate-700 hover:bg-slate-100 cursor-pointer text-xs"
                  >
                    -10
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, quantityInStock: Math.max(0, formData.quantityInStock - 1) })}
                    className="px-2 py-1 bg-white border border-slate-300 rounded font-bold text-slate-700 hover:bg-slate-100 cursor-pointer text-xs"
                  >
                    -1
                  </button>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={formData.quantityInStock}
                    onChange={(e) => setFormData({ ...formData, quantityInStock: Number(e.target.value) })}
                    className="w-24 text-center p-1.5 bg-white border border-slate-300 rounded-lg text-sm font-black text-[#003366]"
                  />
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, quantityInStock: formData.quantityInStock + 1 })}
                    className="px-2 py-1 bg-white border border-slate-300 rounded font-bold text-slate-700 hover:bg-slate-100 cursor-pointer text-xs"
                  >
                    +1
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, quantityInStock: formData.quantityInStock + 10 })}
                    className="px-2 py-1 bg-white border border-slate-300 rounded font-bold text-slate-700 hover:bg-slate-100 cursor-pointer text-xs"
                  >
                    +10
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
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
                    Custo Unit. (R$):
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={formData.unitCost}
                    onChange={(e) => setFormData({ ...formData, unitCost: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
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
                    placeholder="Ex: Litros, Galão"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="edit-isSupportSupply"
                  checked={formData.isSupportSupply}
                  onChange={(e) => setFormData({ ...formData, isSupportSupply: e.target.checked })}
                  className="rounded text-cyan-600 focus:ring-cyan-500"
                />
                <label htmlFor="edit-isSupportSupply" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Insumo associado a Ordens de Serviço (OS)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#003366] hover:bg-[#00264d] text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Product Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#003366] text-white flex items-center justify-center font-bold">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Cadastrar Novo Produto
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Insira as informações do novo item
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
                  placeholder="Ex: Impermeabilizante Teflon 5L"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">
                    Qtd Inicial:
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
                    Custo Unit. (R$):
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={formData.unitCost}
                    onChange={(e) => setFormData({ ...formData, unitCost: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                  />
                </div>
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
                  placeholder="Ex: Litros, Galão, Unidades"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="create-isSupportSupply"
                  checked={formData.isSupportSupply}
                  onChange={(e) => setFormData({ ...formData, isSupportSupply: e.target.checked })}
                  className="rounded text-cyan-600 focus:ring-cyan-500"
                />
                <label htmlFor="create-isSupportSupply" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Insumo associado a Ordens de Serviço (OS)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#003366] hover:bg-[#00264d] text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer"
                >
                  Cadastrar Produto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
