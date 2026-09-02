import React, { useState } from 'react';
import {
  Smartphone,
  MapPin,
  Car,
  DollarSign,
  CheckCircle2,
  Navigation,
  Clock,
  Phone,
  Package,
  FileText,
  CreditCard,
  User,
  Plus,
  Trash2,
  PenTool,
  Send,
  AlertCircle,
  RefreshCw,
  Shield,
  Layers,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ServiceOrder } from '../types';

export const MobileAppSimulator: React.FC = () => {
  const {
    currentUser,
    users = [],
    orders = [],
    stock = [],
    completeServiceOrder,
    updateOrderStatus,
    currentClosing,
    settings,
    addToast,
  } = useApp();

  const safeUsers = users || [];
  const safeOrders = orders || [];
  const safeStock = stock || [];
  const safeClosing = currentClosing || { technicianSummaries: [], periodNumber: 1, referenceMonth: 8, referenceYear: 2026 };

  // Técnicos disponíveis para simulação
  const technicians = safeUsers.filter((u) => u && u.role === 'TECHNICIAN');
  const [selectedTechId, setSelectedTechId] = useState<string>(
    currentUser && currentUser.role === 'TECHNICIAN' ? currentUser.id : (technicians[0]?.id || 'tech-carlos-silva')
  );

  const activeTech = technicians.find((t) => t.id === selectedTechId) || technicians[0] || {
    id: 'tech-carlos-silva',
    name: 'Carlos Silva',
    role: 'TECHNICIAN',
    email: 'carlos.silva@ohigienizador.com.br',
    phone: '(11) 98765-4321',
    pixKey: '11987654321',
    pixKeyType: 'TELEFONE',
    documentCpf: '123.456.789-00',
    hasSpecialTaxRule: false,
  };

  // Tab ativa no App Mobile (OSs do dia, Em Execução, Extrato Financeiro)
  const [mobileTab, setMobileTab] = useState<'os_list' | 'execution' | 'paystub'>('os_list');
  const [activeOsForExecution, setActiveOsForExecution] = useState<ServiceOrder | null>(null);

  // Formulário de finalização da OS no App
  const [kmInput, setKmInput] = useState<number>(32.0);
  const [tollInput, setTollInput] = useState<number>(15.5);
  const [supportInput, setSupportInput] = useState<number>(20.0);
  const [notesInput, setNotesInput] = useState<string>('Serviço de higienização executado conforme padrão Porto Seguro.');
  const [selectedSupplies, setSelectedSupplies] = useState<{ stockItemId: string; quantity: number }[]>([
    { stockItemId: safeStock[0]?.id || 'stock-flotador-1', quantity: 1.5 },
  ]);
  const [signatureSigned, setSignatureSigned] = useState<boolean>(false);

  // OS do técnico selecionado
  const techOrders = safeOrders.filter((o) => o && o.technicianId === selectedTechId);
  const pendingOrProgressOrders = techOrders.filter((o) => o && o.status !== 'COMPLETED' && o.status !== 'CANCELLED');
  const completedTechOrders = techOrders.filter((o) => o && o.status === 'COMPLETED');

  // Resumo quinzenal do técnico ativo
  const techSummary = (safeClosing.technicianSummaries || []).find((s) => s && s.technicianId === selectedTechId);

  const handleStartOs = (order: ServiceOrder) => {
    updateOrderStatus(order.id, 'IN_PROGRESS');
    setActiveOsForExecution(order);
    setMobileTab('execution');
    setSignatureSigned(false);
  };

  const handleAddSupplyToOs = () => {
    if (safeStock.length > 0) {
      setSelectedSupplies([...selectedSupplies, { stockItemId: safeStock[0].id, quantity: 1 }]);
    }
  };

  const handleRemoveSupply = (index: number) => {
    setSelectedSupplies(selectedSupplies.filter((_, i) => i !== index));
  };

  const handleUpdateSupplyQty = (index: number, qty: number) => {
    const updated = [...selectedSupplies];
    updated[index].quantity = Math.max(0.1, Number(qty));
    setSelectedSupplies(updated);
  };

  const handleUpdateSupplyItem = (index: number, stockItemId: string) => {
    const updated = [...selectedSupplies];
    updated[index].stockItemId = stockItemId;
    setSelectedSupplies(updated);
  };

  const handleFinalizeOs = () => {
    if (!activeOsForExecution) return;

    if (!signatureSigned) {
      addToast('Assinatura Obrigatória', 'Por favor, colete a assinatura do cliente antes de finalizar.', 'error');
      return;
    }

    completeServiceOrder(activeOsForExecution.id, {
      kmTraveled: Number(kmInput),
      tollCost: Number(tollInput),
      supportCost: Number(supportInput),
      customerSignature: `assinatura_digital_cliente_${Date.now()}`,
      executionNotes: notesInput,
      itemsUsed: selectedSupplies,
    });

    setActiveOsForExecution(null);
    setMobileTab('os_list');
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar / Technician Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-2">
          <span className="px-2.5 py-1 text-[11px] font-bold bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200 uppercase tracking-wider flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Ambiente de Campo • Expo / React Native</span>
          </span>
        </div>

        {/* Technician Selector */}
        <div className="flex items-center space-x-2 bg-white p-2 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-600 pl-1">Técnico em Campo:</span>
          <select
            value={selectedTechId}
            onChange={(e) => {
              setSelectedTechId(e.target.value);
              setActiveOsForExecution(null);
              setMobileTab('os_list');
            }}
            className="text-xs font-bold text-slate-900 bg-slate-100 rounded-lg px-2.5 py-1.5 border border-slate-200 focus:ring-2 focus:ring-sky-500 focus:outline-none cursor-pointer"
          >
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} {t.hasSpecialTaxRule ? '⭐ (Exceção Fiscal 16%)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Simulator Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left / Center: Smartphone Device Mockup */}
        <div className="lg:col-span-6 flex justify-center">
          <div className="w-[380px] h-[720px] bg-slate-950 rounded-[48px] p-3.5 shadow-2xl border-4 border-slate-800 ring-1 ring-slate-700/50 flex flex-col relative overflow-hidden">
            
            {/* Dynamic Island / Speaker Notch */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-4 bg-black rounded-full z-40 flex items-center justify-center space-x-2">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-900"></div>
              <div className="w-2 h-2 rounded-full bg-sky-950"></div>
            </div>

            {/* Smartphone Inner Screen */}
            <div className="w-full h-full bg-slate-100 rounded-[38px] flex flex-col overflow-hidden text-slate-900 font-sans">
              
              {/* App Status Bar */}
              <div className="bg-sky-700 text-white px-5 pt-5 pb-3 flex items-center justify-between text-[11px] font-semibold">
                <span>09:41</span>
                <div className="flex items-center space-x-1.5 text-[10px]">
                  <span>5G</span>
                  <span>100%</span>
                </div>
              </div>

              {/* App Header */}
              <div className="bg-sky-700 text-white px-4 pb-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center font-bold text-xs">
                      <Shield className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <div className="text-xs font-black tracking-tight">O HIGIENIZADOR</div>
                      <div className="text-[10px] text-sky-200 font-medium">Técnico: {activeTech.name}</div>
                    </div>
                  </div>
                  {activeTech.hasSpecialTaxRule && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-400 text-slate-950 rounded">
                      {activeTech.specialTaxRate || 16}% Fiscal
                    </span>
                  )}
                </div>
              </div>

              {/* Mobile Screen Body / Views */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                
                {/* Tab 1: OS List */}
                {mobileTab === 'os_list' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700 px-1">
                      <span>Meus Chamados Porto Seguro</span>
                      <span className="text-[10px] font-semibold bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full">
                        {pendingOrProgressOrders.length} ativos
                      </span>
                    </div>

                    {pendingOrProgressOrders.length === 0 ? (
                      <div className="p-6 text-center bg-white rounded-2xl border border-slate-200 space-y-2">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
                        <div className="text-xs font-bold text-slate-800">Tudo em dia!</div>
                        <p className="text-[11px] text-slate-500">
                          Nenhum chamado pendente no momento. Você pode consultar seu extrato financeiro na aba inferior.
                        </p>
                      </div>
                    ) : (
                      pendingOrProgressOrders.map((os) => (
                        <div
                          key={os.id}
                          className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-2.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-sky-800">{os.callNumber}</span>
                            <span
                              className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                os.status === 'IN_PROGRESS'
                                  ? 'bg-amber-100 text-amber-800 animate-pulse'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {os.status === 'IN_PROGRESS' ? 'Em Atendimento' : 'Agendado'}
                            </span>
                          </div>

                          <div>
                            <div className="text-xs font-bold text-slate-900">{os.serviceCategory}</div>
                            <div className="text-[11px] text-slate-600 mt-0.5 flex items-center">
                              <MapPin className="h-3 w-3 mr-1 text-slate-400 shrink-0" />
                              {os.addressStreet}, {os.addressNumber} - {os.neighborhood} ({os.city})
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                              Cliente: {os.customerName} ({os.customerCpf})
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-[11px] font-bold text-emerald-700">
                              Base: R$ {os.baseServiceFee.toFixed(2)} + KM/Pedágio
                            </span>
                            <button
                              onClick={() => handleStartOs(os)}
                              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center space-x-1"
                            >
                              <Navigation className="h-3 w-3" />
                              <span>{os.status === 'IN_PROGRESS' ? 'Continuar OS' : 'Iniciar OS'}</span>
                            </button>
                          </div>
                        </div>
                      ))
                    )}

                    {/* Historical List */}
                    {completedTechOrders.length > 0 && (
                      <div className="pt-2">
                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider px-1 mb-2">
                          Finalizadas Recentemente ({completedTechOrders.length})
                        </div>
                        <div className="space-y-1.5">
                          {completedTechOrders.slice(0, 2).map((cos) => (
                            <div
                              key={cos.id}
                              className="bg-white p-2.5 rounded-xl border border-slate-200 text-xs flex justify-between items-center"
                            >
                              <div>
                                <span className="font-bold text-slate-800">{cos.callNumber}</span>
                                <div className="text-[10px] text-slate-500">{cos.serviceCategory}</div>
                              </div>
                              <span className="font-bold text-emerald-600">
                                R$ {cos.totalTechnicianGross.toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 2: Execution / Closure Form */}
                {mobileTab === 'execution' && (
                  activeOsForExecution ? (
                    <div className="space-y-3">
                      <div className="bg-sky-50 border border-sky-200 p-2.5 rounded-xl flex items-center justify-between">
                        <div>
                          <div className="text-[10px] font-bold uppercase text-sky-700">Atendimento em Andamento</div>
                          <div className="text-xs font-black text-slate-900">{activeOsForExecution.callNumber}</div>
                        </div>
                        <span className="text-[10px] bg-white px-2 py-0.5 rounded text-sky-800 font-bold">
                          {activeOsForExecution.customerName.split(' ')[0]}
                        </span>
                      </div>

                      {/* Form Fields for Closure */}
                      <div className="bg-white p-3 rounded-2xl border border-slate-200 space-y-2.5 text-xs">
                        <div className="font-bold text-slate-900 border-b border-slate-100 pb-1.5 flex items-center space-x-1.5">
                          <Car className="h-3.5 w-3.5 text-sky-600" />
                          <span>Apontamento de Deslocamento</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">
                              KM Rodado:
                            </label>
                            <input
                              type="number"
                              step="0.5"
                              value={kmInput}
                              onChange={(e) => setKmInput(Number(e.target.value))}
                              className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">
                              Pedágios (R$):
                            </label>
                            <input
                              type="number"
                              step="0.5"
                              value={tollInput}
                              onChange={(e) => setTollInput(Number(e.target.value))}
                              className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">
                            Custos de Suporte / Adicionais (R$):
                          </label>
                          <input
                            type="number"
                            step="1"
                            value={supportInput}
                            onChange={(e) => setSupportInput(Number(e.target.value))}
                            className="w-full p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                          />
                        </div>
                      </div>

                      {/* Stock Supplies Deduction Section */}
                      <div className="bg-white p-3 rounded-2xl border border-slate-200 space-y-2 text-xs">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                          <span className="font-bold text-slate-900 flex items-center space-x-1">
                            <Package className="h-3.5 w-3.5 text-teal-600" />
                            <span>Insumos / Suportes Usados</span>
                          </span>
                          <button
                            type="button"
                            onClick={handleAddSupplyToOs}
                            className="text-[10px] text-sky-600 font-bold flex items-center space-x-0.5 hover:underline cursor-pointer"
                          >
                            <Plus className="h-3 w-3" />
                            <span>Adicionar</span>
                          </button>
                        </div>

                        <div className="space-y-2">
                          {selectedSupplies.map((sup, idx) => (
                            <div key={idx} className="flex items-center space-x-1.5">
                              <select
                                value={sup.stockItemId}
                                onChange={(e) => handleUpdateSupplyItem(idx, e.target.value)}
                                className="flex-1 p-1 bg-slate-50 border border-slate-200 rounded-lg text-[10px] text-slate-800"
                              >
                                {safeStock.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.name} ({item.quantityInStock} {item.unit})
                                  </option>
                                ))}
                              </select>
                              <input
                                type="number"
                                step="0.5"
                                value={sup.quantity}
                                onChange={(e) => handleUpdateSupplyQty(idx, Number(e.target.value))}
                                className="w-14 p-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-center"
                              />
                              <button
                                onClick={() => handleRemoveSupply(idx)}
                                className="text-red-500 hover:text-red-700 p-1 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="text-[9px] text-slate-400">
                          * O sistema abaterá as quantidades do inventário central instantaneamente.
                        </div>
                      </div>

                      {/* Customer Signature & Notes */}
                      <div className="bg-white p-3 rounded-2xl border border-slate-200 space-y-2 text-xs">
                        <div className="font-bold text-slate-900 flex items-center space-x-1">
                          <PenTool className="h-3.5 w-3.5 text-indigo-600" />
                          <span>Assinatura Digital do Cliente</span>
                        </div>

                        <div
                          onClick={() => setSignatureSigned(!signatureSigned)}
                          className={`h-16 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${
                            signatureSigned
                              ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                              : 'bg-slate-50 border-slate-300 text-slate-400 hover:bg-slate-100'
                          }`}
                        >
                          {signatureSigned ? (
                            <div className="text-center">
                              <span className="font-serif italic font-bold text-sm block">
                                {activeOsForExecution.customerName}
                              </span>
                              <span className="text-[9px] text-emerald-600 font-sans">
                                ✓ Assinatura Capturada e Validada
                              </span>
                            </div>
                          ) : (
                            <div className="text-center text-[10px]">
                              <span>Toque para coletar a assinatura do cliente</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Finalize Button */}
                      <button
                        onClick={handleFinalizeOs}
                        className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Finalizar e Enviar OS</span>
                      </button>
                    </div>
                  ) : (
                    <div className="p-6 text-center bg-white rounded-2xl border border-slate-200 space-y-3 my-4 shadow-xs">
                      <div className="w-12 h-12 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center mx-auto">
                        <Car className="h-6 w-6" />
                      </div>
                      <div className="text-xs font-bold text-slate-800">Nenhum Chamado em Execução</div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Selecione uma Ordem de Serviço na aba <strong>"Chamados"</strong> e toque em <strong>"Iniciar OS"</strong> para realizar o apontamento e coletar a assinatura.
                      </p>
                      <button
                        onClick={() => setMobileTab('os_list')}
                        className="px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                      >
                        Ver Meus Chamados
                      </button>
                    </div>
                  )
                )}

                {/* Tab 3: Paystub / Extrato */}
                {mobileTab === 'paystub' && (
                  <div className="space-y-3">
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 text-xs space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <div>
                          <div className="text-[10px] font-bold uppercase text-slate-400">Extrato da Quinzena</div>
                          <div className="text-xs font-black text-slate-900">
                            {safeClosing.periodNumber === 1 ? '1ª Quinzena' : '2ª Quinzena'} de {safeClosing.referenceMonth}/{safeClosing.referenceYear}
                          </div>
                        </div>
                        <CreditCard className="h-5 w-5 text-sky-600" />
                      </div>

                      {techSummary ? (
                        <div className="space-y-2">
                          <div className="flex justify-between text-slate-600">
                            <span>OSs Atendidas:</span>
                            <strong className="text-slate-900">{techSummary.osCount}</strong>
                          </div>
                          <div className="flex justify-between text-slate-600">
                            <span>Total Base Serviços:</span>
                            <strong className="text-slate-900">R$ {techSummary.totalBaseFee.toFixed(2)}</strong>
                          </div>
                          <div className="flex justify-between text-slate-600">
                            <span>Reembolso KM ({techSummary.totalKmTraveled} km):</span>
                            <strong className="text-slate-900">R$ {techSummary.totalKmCost.toFixed(2)}</strong>
                          </div>
                          <div className="flex justify-between text-slate-600">
                            <span>Pedágios + Suporte:</span>
                            <strong className="text-slate-900">
                              R$ {(techSummary.totalTollCost + techSummary.totalSupportCost).toFixed(2)}
                            </strong>
                          </div>
                          <div className="flex justify-between text-slate-600">
                            <span>Ajuda de Custo Fixa:</span>
                            <strong className="text-slate-900">R$ {techSummary.fixedCostAllowance.toFixed(2)}</strong>
                          </div>

                          <div className="pt-2 border-t border-slate-100 flex justify-between font-bold text-sky-900">
                            <span>Total Bruto:</span>
                            <span>R$ {techSummary.grossTotal.toFixed(2)}</span>
                          </div>

                          {/* Descontos */}
                          <div className="pt-1 text-slate-600 space-y-1">
                            <div className="flex justify-between text-red-600">
                              <span>(-) Vales / Adiantamentos:</span>
                              <strong>- R$ {techSummary.advancesDeduction.toFixed(2)}</strong>
                            </div>
                            {techSummary.hasSpecialTaxRule && (
                              <div className="flex justify-between text-amber-700 font-semibold">
                                <span>(-) Impostos ({techSummary.taxDeductionRate}%):</span>
                                <strong>- R$ {techSummary.taxDeductionAmount.toFixed(2)}</strong>
                              </div>
                            )}
                          </div>

                          {/* Líquido */}
                          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex justify-between items-center">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-emerald-800 block">
                                Líquido a Receber (PIX)
                              </span>
                              <span className="text-xs text-emerald-700 font-mono">
                                {activeTech.pixKey || activeTech.documentCpf}
                              </span>
                            </div>
                            <span className="text-base font-black text-emerald-700">
                              R$ {techSummary.netTotal.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-slate-400 text-center py-4">Sem dados para o período.</div>
                      )}
                    </div>
                  </div>
                )}

              </div>

              {/* Mobile Bottom Navigation Bar */}
              <div className="bg-white border-t border-slate-200 px-4 py-2 flex items-center justify-around text-slate-600">
                <button
                  onClick={() => setMobileTab('os_list')}
                  className={`flex flex-col items-center space-y-0.5 text-[10px] font-semibold ${
                    mobileTab === 'os_list' ? 'text-sky-600' : 'text-slate-400'
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  <span>Chamados</span>
                </button>

                <button
                  onClick={() => {
                    if (pendingOrProgressOrders.length > 0) {
                      handleStartOs(pendingOrProgressOrders[0]);
                    } else {
                      setMobileTab('execution');
                    }
                  }}
                  className={`flex flex-col items-center space-y-0.5 text-[10px] font-semibold ${
                    mobileTab === 'execution' ? 'text-sky-600' : 'text-slate-400'
                  }`}
                >
                  <Car className="h-4 w-4" />
                  <span>Execução</span>
                </button>

                <button
                  onClick={() => setMobileTab('paystub')}
                  className={`flex flex-col items-center space-y-0.5 text-[10px] font-semibold ${
                    mobileTab === 'paystub' ? 'text-sky-600' : 'text-slate-400'
                  }`}
                >
                  <CreditCard className="h-4 w-4" />
                  <span>Extrato PIX</span>
                </button>
              </div>

            </div>
          </div>
        </div>

        {/* Right / Explanatory Guidelines for the App */}
        <div className="lg:col-span-6 space-y-4">
          
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
            <h2 className="text-base font-black text-slate-900 flex items-center space-x-2">
              <Smartphone className="h-5 w-5 text-sky-600" />
              <span>Funcionalidades Nativas React Native / Expo</span>
            </h2>

            <div className="space-y-3 text-xs text-slate-600">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-start space-x-3">
                <Navigation className="h-4 w-4 text-sky-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900 block font-semibold">1. Roteirização e Check-in de Chamado:</strong>
                  O técnico visualiza o número do chamado Porto Seguro, endereço e dados do cliente.
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-start space-x-3">
                <Car className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900 block font-semibold">2. Registro de KM, Pedágios e Suporte:</strong>
                  Ao finalizar, o técnico aponta a quilometragem percorrida e custos com pedágios e suportes.
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-start space-x-3">
                <Package className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900 block font-semibold">3. Abate Automático de Estoque:</strong>
                  Insumos como flotadores concentrados, impermeabilizantes e suportes de escovas são baixados do estoque central instantaneamente.
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-start space-x-3">
                <PenTool className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900 block font-semibold">4. Assinatura Digital do Cliente:</strong>
                  Coleta da assinatura do segurado Porto Seguro na tela touchscreen.
                </div>
              </div>
            </div>
          </div>

          {/* Special Tax Rule callout */}
          {activeTech.hasSpecialTaxRule && (
            <div className="bg-amber-50 rounded-2xl p-5 border border-amber-200 text-xs">
              <div className="flex items-center space-x-2 text-amber-900 font-bold mb-1">
                <Layers className="h-4 w-4 text-amber-600" />
                <span>Regra Fiscal Ativa para {activeTech.name}</span>
              </div>
              <p className="text-amber-800 leading-relaxed">
                Técnico configurado com regra de retenção de impostos ({activeTech.specialTaxRate || 16}%). O desconto já é refletido automaticamente em tempo real no demonstrativo e fechamento.
              </p>
            </div>
          )}

        </div>

      </div>

    </div>
  );
};
