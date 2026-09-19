import React, { useState, useEffect } from 'react';
import {
  Tag,
  DollarSign,
  Search,
  Sliders,
  Edit2,
  Save,
  X,
  RotateCcw,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Users,
  ChevronLeft,
  ChevronRight,
  Info,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

interface PortoPrice {
  id: number;
  category: string;
  service_name: string;
  search_keywords: string | null;
  completed_price: string | number;
  additional_price: string | number;
  additional_item_price: string | number;
  effective_date: string | null;
  active: boolean | number;
}

interface CustomRate {
  id?: number;
  technicianId: string;
  serviceCategory: string;
  customFee: number;
}

export const PriceTablesView: React.FC = () => {
  const { addToast, users } = useApp();

  // Abas
  const [activeSubTab, setActiveSubTab] = useState<'porto' | 'technician'>('porto');

  // Aba 1: Tabela Porto Seguro
  const [portoPrices, setPortoPrices] = useState<PortoPrice[]>([]);
  const [loadingPorto, setLoadingPorto] = useState<boolean>(false);
  const [savingPortoId, setSavingPortoId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Paginação Porto
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;

  // Edição Porto
  const [editingPortoId, setEditingPortoId] = useState<number | null>(null);
  const [editingCompletedPrice, setEditingCompletedPrice] = useState<string>('');
  const [editingAdditionalPrice, setEditingAdditionalPrice] = useState<string>('');
  const [editingAdditionalItemPrice, setEditingAdditionalItemPrice] = useState<string>('');

  // Aba 2: Repasse por Técnico
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [selectedTechId, setSelectedTechId] = useState<string>('');
  const [techKmRate, setTechKmRate] = useState<number>(0.75);
  const [loadingTech, setLoadingTech] = useState<boolean>(false);
  const [savingTech, setSavingTech] = useState<boolean>(false);

  // Mapeamento de repasses customizados (categoria -> valor)
  const [customRatesMap, setCustomRatesMap] = useState<Record<string, string>>({});
  const [originalKmRate, setOriginalKmRate] = useState<number>(0.75);
  const [originalRatesMap, setOriginalRatesMap] = useState<Record<string, string>>({});

  // Carregar dados iniciais
  const fetchPortoPrices = async () => {
    setLoadingPorto(true);
    try {
      const response = await fetch('/api/admin/porto-prices');
      const data = await response.json();
      if (data.success && Array.isArray(data.data)) {
        setPortoPrices(data.data);
      } else if (Array.isArray(data)) {
        setPortoPrices(data);
      }
    } catch (err: any) {
      console.error('Erro ao buscar preços Porto Seguro:', err);
      addToast('Erro', 'Não foi possível carregar a tabela de preços da Porto Seguro.', 'error');
    } finally {
      setLoadingPorto(false);
    }
  };

  useEffect(() => {
    fetchPortoPrices();
    // Filtra técnicos cadastrados do AppContext
    if (users && users.length > 0) {
      const techs = users.filter((u: any) => u.role === 'TECHNICIAN');
      setTechnicians(techs);
      if (techs.length > 0 && !selectedTechId) {
        setSelectedTechId(techs[0].id);
      }
    }
  }, [users]);

  // Carregar dados de repasse do técnico selecionado
  const fetchTechnicianRates = async (techId: string) => {
    if (!techId) return;
    setLoadingTech(true);
    try {
      const response = await fetch(`/api/admin/technicians/${techId}/rates`);
      const resData = await response.json();
      if (resData.success && resData.data) {
        const { kmRate, customRates } = resData.data;
        setTechKmRate(Number(kmRate || 0.75));
        setOriginalKmRate(Number(kmRate || 0.75));

        const ratesMap: Record<string, string> = {};
        if (Array.isArray(customRates)) {
          customRates.forEach((r: any) => {
            ratesMap[r.serviceCategory] = String(Number(r.customFee).toFixed(2));
          });
        }
        setCustomRatesMap(ratesMap);
        setOriginalRatesMap({ ...ratesMap });
      }
    } catch (err: any) {
      console.error('Erro ao buscar regras de repasse do técnico:', err);
      addToast('Erro', 'Não foi possível obter as regras de repasse do técnico.', 'error');
    } finally {
      setLoadingTech(false);
    }
  };

  useEffect(() => {
    if (selectedTechId && activeSubTab === 'technician') {
      fetchTechnicianRates(selectedTechId);
    }
  }, [selectedTechId, activeSubTab]);

  // Categorias únicas para filtros
  const categories = ['ALL', ...Array.from(new Set(portoPrices.map((p) => p.category)))];

  // Filtros aplicados para a Tabela Porto
  const filteredPortoPrices = portoPrices.filter((p) => {
    const matchesSearch =
      p.service_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.category && p.category.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.search_keywords && p.search_keywords.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory = categoryFilter === 'ALL' || p.category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  // Paginação
  const totalPages = Math.ceil(filteredPortoPrices.length / itemsPerPage) || 1;
  const paginatedPortoPrices = filteredPortoPrices.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter]);

  // Ativar edição do item Porto
  const handleStartEditPorto = (item: PortoPrice) => {
    setEditingPortoId(item.id);
    setEditingCompletedPrice(String(item.completed_price));
    setEditingAdditionalPrice(String(item.additional_price || '0.00'));
    setEditingAdditionalItemPrice(String(item.additional_item_price || '0.00'));
  };

  // Salvar alteração de preço Porto
  const handleSavePortoPrice = async (id: number) => {
    if (!editingCompletedPrice || isNaN(Number(editingCompletedPrice))) {
      addToast('Validação', 'Preço de serviço concluído deve ser um número válido.', 'warning');
      return;
    }

    setSavingPortoId(id);
    try {
      const response = await fetch(`/api/admin/porto-prices/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completed_price: Number(editingCompletedPrice),
          additional_price: Number(editingAdditionalPrice || 0),
          additional_item_price: Number(editingAdditionalItemPrice || 0),
        }),
      });

      const data = await response.json();
      if (data.success) {
        addToast('Sucesso', 'Preço contratual Porto Seguro atualizado com sucesso.', 'success');
        setEditingPortoId(null);
        // Atualiza a lista local de preços
        setPortoPrices((prev) =>
          prev.map((p) =>
            p.id === id
              ? {
                  ...p,
                  completed_price: Number(editingCompletedPrice),
                  additional_price: Number(editingAdditionalPrice || 0),
                  additional_item_price: Number(editingAdditionalItemPrice || 0),
                }
              : p
          )
        );
      } else {
        addToast('Erro', data.error || 'Falha ao atualizar preço contratual.', 'error');
      }
    } catch (err: any) {
      console.error('Erro de rede ao salvar preço Porto:', err);
      addToast('Erro de Rede', 'Não foi possível conectar com o servidor.', 'error');
    } finally {
      setSavingPortoId(null);
    }
  };

  // Salvar taxa de KM e regras customizadas de repasse
  const handleSaveTechnicianRates = async () => {
    if (techKmRate === undefined || isNaN(Number(techKmRate)) || Number(techKmRate) < 0) {
      addToast('Validação', 'A taxa de KM deve ser um número maior ou igual a zero.', 'warning');
      return;
    }

    setSavingTech(true);
    try {
      // Montar lista de customizações a atualizar
      const customRatesList = Object.keys(customRatesMap).map((cat) => ({
        serviceCategory: cat,
        customFee: customRatesMap[cat] !== '' ? Number(customRatesMap[cat]) : null,
      }));

      const response = await fetch(`/api/admin/technicians/${selectedTechId}/rates`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kmRate: Number(techKmRate),
          customRates: customRatesList,
        }),
      });

      const resData = await response.json();
      if (resData.success) {
        addToast('Sucesso', 'Regras de repasse do técnico atualizadas com sucesso.', 'success');
        setOriginalKmRate(Number(techKmRate));
        setOriginalRatesMap({ ...customRatesMap });
        fetchTechnicianRates(selectedTechId);
      } else {
        addToast('Erro', resData.error || 'Falha ao salvar regras de repasse.', 'error');
      }
    } catch (err: any) {
      console.error('Erro de rede ao salvar repasses de técnico:', err);
      addToast('Erro de Rede', 'Não foi possível conectar com o servidor.', 'error');
    } finally {
      setSavingTech(false);
    }
  };

  // Resetar tarifa de repasse específica localmente
  const handleResetLocalRate = (category: string) => {
    setCustomRatesMap((prev) => ({
      ...prev,
      [category]: '',
    }));
  };

  // Modificar tarifa localmente
  const handleLocalRateChange = (category: string, value: string) => {
    setCustomRatesMap((prev) => ({
      ...prev,
      [category]: value,
    }));
  };

  // Obter vigência ativa
  const activeEffectiveDate = portoPrices.length > 0 && portoPrices[0].effective_date
    ? new Date(portoPrices[0].effective_date).toLocaleDateString('pt-BR')
    : '29/07/2026';

  // Obter lista das categorias de faturamento disponíveis
  const uniqueServiceCategories = Array.from(new Set(portoPrices.map((p) => p.category))).sort() as string[];

  return (
    <div id="price-tables-view" className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Cabeçalho de Controle */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-extrabold text-[#003366] tracking-tight">
            Gestão de Tabelas de Preços e Repasses
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Consulte faturamentos oficiais contratados com a Porto Seguro e defina taxas personalizadas de repasse por técnico individualmente.
          </p>
        </div>

        {/* Sub-Abas Nav */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg self-start md:self-auto">
          <button
            onClick={() => setActiveSubTab('porto')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'porto'
                ? 'bg-[#003366] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Faturamento Porto Seguro</span>
          </button>
          <button
            onClick={() => setActiveSubTab('technician')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'technician'
                ? 'bg-[#003366] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Repasse por Técnico</span>
          </button>
        </div>
      </div>

      {/* ABA 1: TABELA PORTO SEGURO (FATURAMENTO) */}
      {activeSubTab === 'porto' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Card superior informativo */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Tag className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-extrabold text-slate-400 block uppercase">Vigência Ativa</span>
                <span className="text-lg font-black text-slate-800">{activeEffectiveDate}</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-extrabold text-slate-400 block uppercase">Serviços Catalogados</span>
                <span className="text-lg font-black text-slate-800">{portoPrices.length} itens ativos</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4 md:col-span-1">
              <div className="w-12 h-12 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <Info className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-extrabold text-slate-400 block uppercase">Importação Automática</span>
                <span className="text-xs text-slate-500 font-semibold leading-tight block mt-0.5">Sincronizado com os chamados Porto</span>
              </div>
            </div>
          </div>

          {/* Filtros e Pesquisa */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por nome do serviço ou palavra-chave..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
              <span className="text-[11px] font-bold text-slate-500 shrink-0">Categoria:</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full sm:w-48 py-2 px-3 border border-slate-200 rounded-lg text-xs bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-medium"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === 'ALL' ? 'Todas as Categorias' : cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tabela de Preços Porto Seguro */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              {loadingPorto ? (
                <div className="p-16 text-center flex flex-col items-center justify-center gap-3">
                  <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
                  <span className="text-xs text-slate-500 font-semibold">Buscando tabela de preços oficiais do banco de dados...</span>
                </div>
              ) : paginatedPortoPrices.length === 0 ? (
                <div className="p-16 text-center text-xs text-slate-500 font-medium">
                  Nenhum serviço correspondente aos filtros encontrados.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-extrabold text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3 px-5">Categoria</th>
                      <th className="py-3 px-5">Serviço Oficial (Porto Seguro)</th>
                      <th className="py-3 px-5">Palavras-Chave de Busca</th>
                      <th className="py-3 px-5 text-right w-36">Serviço Concluído</th>
                      <th className="py-3 px-5 text-right w-36">Novo Serviço</th>
                      <th className="py-3 px-5 text-right w-36">Item Adicional</th>
                      <th className="py-3 px-5 text-center w-24">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {paginatedPortoPrices.map((item) => {
                      const isEditing = editingPortoId === item.id;
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3.5 px-5 font-bold text-[#003366]">{item.category}</td>
                          <td className="py-3.5 px-5 text-slate-700 font-semibold">{item.service_name}</td>
                          <td className="py-3.5 px-5 font-mono text-[10px] text-slate-400">
                            {item.search_keywords || '-'}
                          </td>
                          <td className="py-3.5 px-5 text-right">
                            {isEditing ? (
                              <div className="relative inline-block w-full">
                                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">R$</span>
                                <input
                                  type="text"
                                  value={editingCompletedPrice}
                                  onChange={(e) => setEditingCompletedPrice(e.target.value)}
                                  className="w-full pl-6 pr-1.5 py-1 text-right border border-blue-400 rounded-md focus:ring-1 focus:ring-blue-500 text-xs font-bold"
                                />
                              </div>
                            ) : (
                              <span className="font-extrabold text-slate-900 font-mono text-sm">
                                R$ {Number(item.completed_price).toFixed(2)}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-5 text-right">
                            {isEditing ? (
                              <div className="relative inline-block w-full">
                                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">R$</span>
                                <input
                                  type="text"
                                  value={editingAdditionalPrice}
                                  onChange={(e) => setEditingAdditionalPrice(e.target.value)}
                                  className="w-full pl-6 pr-1.5 py-1 text-right border border-blue-400 rounded-md focus:ring-1 focus:ring-blue-500 text-xs font-bold"
                                />
                              </div>
                            ) : (
                              <span className="text-slate-500 font-mono">
                                R$ {Number(item.additional_price || 0).toFixed(2)}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-5 text-right">
                            {isEditing ? (
                              <div className="relative inline-block w-full">
                                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">R$</span>
                                <input
                                  type="text"
                                  value={editingAdditionalItemPrice}
                                  onChange={(e) => setEditingAdditionalItemPrice(e.target.value)}
                                  className="w-full pl-6 pr-1.5 py-1 text-right border border-blue-400 rounded-md focus:ring-1 focus:ring-blue-500 text-xs font-bold"
                                />
                              </div>
                            ) : (
                              <span className="text-slate-500 font-mono">
                                R$ {Number(item.additional_item_price || 0).toFixed(2)}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-5 text-center">
                            {isEditing ? (
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => handleSavePortoPrice(item.id)}
                                  disabled={savingPortoId === item.id}
                                  className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-md cursor-pointer disabled:opacity-50"
                                  title="Salvar preço"
                                >
                                  {savingPortoId === item.id ? (
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Save className="w-4 h-4" />
                                  )}
                                </button>
                                <button
                                  onClick={() => setEditingPortoId(null)}
                                  className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md cursor-pointer"
                                  title="Cancelar"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleStartEditPorto(item)}
                                className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md cursor-pointer inline-flex items-center"
                                title="Editar serviço"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Rodapé Paginação */}
            {!loadingPorto && filteredPortoPrices.length > 0 && (
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">
                  Exibindo <strong className="text-slate-800">{(currentPage - 1) * itemsPerPage + 1}</strong> a{' '}
                  <strong className="text-slate-800">
                    {Math.min(currentPage * itemsPerPage, filteredPortoPrices.length)}
                  </strong>{' '}
                  de <strong className="text-slate-800">{filteredPortoPrices.length}</strong> itens
                </span>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-bold px-3 text-slate-700">
                    Página {currentPage} de {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ABA 2: REPASSE POR TÉCNICO (INDIVIDUAL) */}
      {activeSubTab === 'technician' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Seleção do Técnico */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Selecione o Técnico</span>
                <select
                  value={selectedTechId}
                  onChange={(e) => setSelectedTechId(e.target.value)}
                  className="py-1.5 px-3 border border-slate-200 rounded-lg text-xs bg-white focus:ring-1 focus:ring-blue-500 font-bold text-slate-800"
                >
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.isActive ? 'Ativo' : 'Inativo'})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Ações Rápidas de Salvamento da aba */}
            {selectedTechId && (
              <button
                onClick={handleSaveTechnicianRates}
                disabled={savingTech || loadingTech}
                className="px-4 py-2 bg-[#003366] hover:bg-[#00264d] text-white font-extrabold rounded-lg text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {savingTech ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>{savingTech ? 'Salvando Alterações...' : 'Salvar Regras de Repasse'}</span>
              </button>
            )}
          </div>

          {selectedTechId && !loadingTech && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* Painel Esquerdo: Taxa de KM */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 pb-3 border-b border-slate-100">
                  <Sliders className="w-4 h-4 text-blue-600" />
                  Taxa de KM Individual
                </h3>

                <p className="text-xs text-slate-500 leading-relaxed">
                  Defina o custo/reembolso por quilômetro rodado específico para este técnico em deslocamentos pós-cutoff de 26/07/2026.
                </p>

                <div className="space-y-1.5 pt-1">
                  <label className="text-[11px] font-bold text-slate-500 block">Reembolso (R$ / km)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={techKmRate}
                      onChange={(e) => setTechKmRate(Number(e.target.value))}
                      className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-1">
                    Valor base herda o padrão geral de R$ 0.75/km
                  </span>
                </div>

                {techKmRate !== originalKmRate && (
                  <div className="pt-2 flex items-center justify-end">
                    <button
                      onClick={() => setTechKmRate(originalKmRate)}
                      className="text-[10px] text-red-500 hover:text-red-700 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Resetar alteração do KM
                    </button>
                  </div>
                )}
              </div>

              {/* Tabela de Customização Comparativa */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs lg:col-span-2 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">
                      Tabela Comparativa de Repasses por Categoria
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">
                      Deixe em branco para herdar a tabela de preços oficial do banco de dados.
                    </p>
                  </div>
                  <div className="px-3 py-1 bg-amber-50 border border-amber-200 rounded-lg text-[10px] font-bold text-amber-800 inline-flex items-center gap-1.5 self-start sm:self-auto">
                    <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Campos em branco herdam o padrão</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50/50 border-b border-slate-100 text-slate-500 uppercase font-bold text-[9px] tracking-wider">
                      <tr>
                        <th className="py-2.5 px-4">Categoria de Serviço</th>
                        <th className="py-2.5 px-4 text-right">Repasse Padrão (Faturamento)</th>
                        <th className="py-2.5 px-4 text-center w-48">Repasse Customizado (R$)</th>
                        <th className="py-2.5 px-4 text-center w-24">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {uniqueServiceCategories.map((category) => {
                        // Acha o primeiro serviço dessa categoria para usar como "Repasse Padrão"
                        const matchingPriceObj = portoPrices.find((p) => p.category === category);
                        const defaultRepasseVal = matchingPriceObj ? Number(matchingPriceObj.completed_price) : 0;

                        const customVal = customRatesMap[category] ?? '';
                        const hasCustomValue = customVal !== '';

                        return (
                          <tr key={category} className="hover:bg-slate-50/20 transition-colors">
                            <td className="py-2.5 px-4 font-bold text-slate-800">{category}</td>
                            <td className="py-2.5 px-4 text-right">
                              <span className="font-mono text-slate-500">
                                R$ {defaultRepasseVal.toFixed(2)}
                              </span>
                            </td>
                            <td className="py-2.5 px-4">
                              <div className="relative max-w-[140px] mx-auto">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-bold">R$</span>
                                <input
                                  type="text"
                                  value={customVal}
                                  placeholder="Herdado"
                                  onChange={(e) => handleLocalRateChange(category, e.target.value)}
                                  className={`w-full pl-7 pr-1.5 py-1 text-right border rounded-md text-xs font-bold ${
                                    hasCustomValue
                                      ? 'border-blue-500 bg-blue-50/30 text-blue-800'
                                      : 'border-slate-200 text-slate-400 placeholder-slate-300'
                                  }`}
                                />
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-center">
                              {hasCustomValue && (
                                <button
                                  onClick={() => handleResetLocalRate(category)}
                                  className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md cursor-pointer inline-flex items-center"
                                  title="Resetar para o padrão herdado"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {loadingTech && (
            <div className="p-16 text-center flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
              <span className="text-xs text-slate-500 font-semibold">Buscando tarifas do técnico...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
