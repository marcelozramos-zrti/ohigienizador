import React, { useState } from 'react';
import {
  X,
  Save,
  Trash2,
  User,
  MapPin,
  Calendar,
  DollarSign,
  Shield,
  Car,
  Clock,
  Phone,
  FileText,
  AlertTriangle,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ServiceOrder } from '../types';

interface EditServiceOrderModalProps {
  order: ServiceOrder;
  onClose: () => void;
}

export const EditServiceOrderModal: React.FC<EditServiceOrderModalProps> = ({ order, onClose }) => {
  const { updateServiceOrder, deleteServiceOrder, users = [], settings, addToast } = useApp();

  const safeUsers = users || [];
  const technicians = safeUsers.filter((u) => u && u.role === 'TECHNICIAN');

  // Order identifiers & insurance details
  const [callNumber, setCallNumber] = useState(order.callNumber || '');
  const [portoProtocol, setPortoProtocol] = useState(order.portoSeguroProtocol || '');
  const [serviceCategory, setServiceCategory] = useState(order.serviceCategory || 'Higienização de Sofá 3 Lugares');
  const [scheduledDate, setScheduledDate] = useState(
    order.scheduledDate ? order.scheduledDate.split('T')[0] : new Date().toISOString().split('T')[0]
  );
  const [status, setStatus] = useState<ServiceOrder['status']>(order.status || 'PENDING');
  const [technicianId, setTechnicianId] = useState<string>(order.technicianId || '');

  // Customer details
  const [customerName, setCustomerName] = useState(order.customerName || '');
  const [customerCpf, setCustomerCpf] = useState(order.customerCpf || '');
  const [customerPhone, setCustomerPhone] = useState(order.customerPhone || '');
  const [addressStreet, setAddressStreet] = useState(order.addressStreet || '');
  const [addressNumber, setAddressNumber] = useState(order.addressNumber || '');
  const [addressComplement, setAddressComplement] = useState(order.addressComplement || '');
  const [neighborhood, setNeighborhood] = useState(order.neighborhood || '');
  const [city, setCity] = useState(order.city || 'São Paulo');
  const [uf, setUf] = useState(order.uf || 'SP');
  const [postalCode, setPostalCode] = useState(order.postalCode || '01310-100');

  // Financial & Logistics
  const [baseServiceFee, setBaseServiceFee] = useState<number>(order.baseServiceFee ?? 140);
  const [kmTraveled, setKmTraveled] = useState<number>(order.kmTraveled ?? 0);
  const [kmRateApplied, setKmRateApplied] = useState<number>(order.kmRateApplied ?? settings.kmRateDefault ?? 0.5);
  const [tollCost, setTollCost] = useState<number>(order.tollCost ?? 0);
  const [supportCost, setSupportCost] = useState<number>(order.supportCost ?? 0);
  const [faturamentoPorto, setFaturamentoPorto] = useState<number>(order.faturamentoPorto ?? (order.baseServiceFee * 1.6));
  const [executionNotes, setExecutionNotes] = useState<string>(order.executionNotes || '');

  // Deletion confirm state & validation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Live calculation of technician gross payout
  const kmTotalCost = Number((kmTraveled * kmRateApplied).toFixed(2));
  const liveTechnicianGross = Number(
    (Number(baseServiceFee || 0) + kmTotalCost + Number(tollCost || 0) + Number(supportCost || 0)).toFixed(2)
  );

  // Quick category change helper
  const handleCategoryChange = (newCategory: string) => {
    setServiceCategory(newCategory);
    const suggestedFee = settings?.serviceCategoriesRates?.[newCategory];
    if (suggestedFee) {
      setBaseServiceFee(suggestedFee);
      setFaturamentoPorto(suggestedFee * 1.6);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // Basic required check
    if (!customerName || !customerCpf || !addressStreet) {
      const msg = 'Por favor, preencha o Nome do Cliente, CPF e Endereço.';
      setValidationError(msg);
      addToast('Campos Obrigatórios', msg, 'error');
      return;
    }

    // Regra de Negócio: Finalização apenas com todos os campos preenchidos
    if (status === 'COMPLETED') {
      const missingFields: string[] = [];
      if (!technicianId || technicianId === 'tech-1') missingFields.push('Técnico Responsável (Não Alocado)');
      if (!serviceCategory) missingFields.push('Categoria do Serviço');
      if (!baseServiceFee || Number(baseServiceFee) <= 0) missingFields.push('Taxa Base de Serviço (R$)');
      if (kmTraveled === undefined || kmTraveled === null) missingFields.push('Quilometragem/Deslocamento');

      if (missingFields.length > 0) {
        const errorMsg = `Não é possível finalizar (COMPLETED) a OS. Preencha os seguintes campos obrigatórios: ${missingFields.join(', ')}.`;
        setValidationError(errorMsg);
        addToast('Regra de Negócio Violada', errorMsg, 'warning');
        return;
      }
    }

    setIsSaving(true);

    const selectedTech = technicians.find((t) => t.id === technicianId);

    updateServiceOrder(order.id, {
      callNumber,
      portoSeguroProtocol: portoProtocol,
      serviceCategory,
      scheduledDate,
      status,
      technicianId: technicianId || undefined,
      technicianName: selectedTech ? selectedTech.name : undefined,
      customerName,
      customerCpf,
      customerPhone,
      addressStreet,
      addressNumber,
      addressComplement,
      neighborhood,
      city,
      uf,
      postalCode,
      baseServiceFee: Number(baseServiceFee || 0),
      kmTraveled: Number(kmTraveled || 0),
      kmRateApplied: Number(kmRateApplied || 0.5),
      kmTotalCost,
      tollCost: Number(tollCost || 0),
      supportCost: Number(supportCost || 0),
      totalTechnicianGross: liveTechnicianGross,
      faturamentoPorto: Number(faturamentoPorto || 0),
      executionNotes,
    });

    setTimeout(() => {
      setIsSaving(false);
      onClose();
    }, 200);
  };

  const handleDelete = () => {
    deleteServiceOrder(order.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-[#003366] text-white flex items-center justify-center shadow-xs">
              <Shield className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-slate-900">
                  Editar Ordem de Serviço • #{order.callNumber}
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-cyan-100 text-[#003366]">
                  {status}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Altere dados do chamado, reatribua para outro técnico e ajuste valores com gravação no MariaDB.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Delete Confirmation Warning Box */}
        {showDeleteConfirm && (
          <div className="p-4 bg-red-50 border-b border-red-200 flex items-center justify-between animate-in fade-in">
            <div className="flex items-center space-x-2.5 text-xs text-red-900">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
              <div>
                <strong className="block font-bold">Deseja realmente excluir esta Ordem de Serviço?</strong>
                <span>Esta ação excluirá o chamado #{order.callNumber} do banco de dados MariaDB permanentemente.</span>
              </div>
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-xs"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-5 text-xs">
          
          {/* Validation Error Banner */}
          {validationError && (
            <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl flex items-start space-x-2.5 text-amber-900 text-xs animate-in fade-in">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <strong className="block font-bold">Validação de Regra de Negócio:</strong>
                <span>{validationError}</span>
              </div>
            </div>
          )}
          
          {/* SECTION 1: Technician Assignment & Status */}
          <div className="p-4 bg-cyan-50/50 rounded-xl border border-cyan-200/80 space-y-3">
            <div className="flex items-center justify-between border-b border-cyan-200/60 pb-2">
              <span className="font-bold text-[#003366] uppercase tracking-wider text-[10px] flex items-center space-x-1.5">
                <User className="h-3.5 w-3.5 text-cyan-600" />
                <span>Atribuição de Técnico & Situação do Atendimento</span>
              </span>
              <span className="text-[10px] text-slate-500">
                {technicians.length} técnicos ativos disponíveis
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-700 block mb-1">
                  Designar / Trocar Técnico Responsável:
                </label>
                <select
                  value={technicianId}
                  onChange={(e) => setTechnicianId(e.target.value)}
                  className="w-full p-2.5 bg-white border border-cyan-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                >
                  <option value="">-- Nenhum Técnico (Pendente de Alocação) --</option>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} • CPF: {t.documentCpf} {t.phone ? `(${t.phone})` : ''}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Ao trocar o técnico, todos os cálculos da quinzena e repasses são reatribuídos automaticamente.
                </span>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-700 block mb-1">
                  Status da Ordem de Serviço:
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ServiceOrder['status'])}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                >
                  <option value="PENDING">PENDING • Pendente de Início</option>
                  <option value="IN_PROGRESS">IN_PROGRESS • Em Andamento / Em Rota</option>
                  <option value="COMPLETED">COMPLETED • Finalizada com Sucesso</option>
                  <option value="CANCELLED">CANCELLED • Cancelada</option>
                </select>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Status atualizado sincroniza instantaneamente com o aplicativo móvel do técnico.
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 2: Identification & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">Nº Chamado Sistema:</label>
              <input
                type="text"
                required
                value={callNumber}
                onChange={(e) => setCallNumber(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">Sinistro / Protocolo Porto:</label>
              <input
                type="text"
                value={portoProtocol}
                onChange={(e) => setPortoProtocol(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">Data Agendada:</label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              />
            </div>
          </div>

          {/* SECTION 3: Service Category */}
          <div>
            <label className="text-[10px] font-bold text-slate-600 block mb-1">Categoria do Serviço Porto:</label>
            <select
              value={serviceCategory}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
            >
              <option value="Higienização de Sofá 3 Lugares">Higienização de Sofá 3 Lugares (R$ 140,00)</option>
              <option value="Impermeabilização de Estofado">Impermeabilização de Estofado (R$ 190,00)</option>
              <option value="Higienização Automotiva Completa">Higienização Automotiva Completa (R$ 160,00)</option>
              <option value="Higienização de Colchão Queen">Higienização de Colchão Queen (R$ 150,00)</option>
              <option value="Higienização de Tapetes e Carpetes">Higienização de Tapetes e Carpetes (R$ 175,00)</option>
              <option value="Instalação Lava e Seca">Instalação Lava e Seca (R$ 40,00)</option>
              <option value="Instalação TV de 44 a 70 + Suporte Fixo">Instalação TV de 44 a 70 + Suporte Fixo (R$ 60,00)</option>
              <option value="Instalação Purificador de Água">Instalação Purificador de Água (R$ 40,00)</option>
              <option value="Visita Perdida">Visita Perdida (R$ 40,00)</option>
            </select>
          </div>

          {/* SECTION 4: Customer Details & Address */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px] block">
              Dados do Segurado / Cliente & Local de Atendimento
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="sm:col-span-2">
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Nome Completo:</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">CPF:</label>
                <input
                  type="text"
                  required
                  value={customerCpf}
                  onChange={(e) => setCustomerCpf(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <div className="sm:col-span-2">
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Telefone / Celular:</label>
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">CEP:</label>
                <input
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">UF:</label>
                <input
                  type="text"
                  value={uf}
                  onChange={(e) => setUf(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold uppercase text-slate-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <div className="sm:col-span-2">
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Logradouro (Rua / Av):</label>
                <input
                  type="text"
                  required
                  value={addressStreet}
                  onChange={(e) => setAddressStreet(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Número:</label>
                <input
                  type="text"
                  value={addressNumber}
                  onChange={(e) => setAddressNumber(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Bairro:</label>
                <input
                  type="text"
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800"
                />
              </div>
            </div>
          </div>

          {/* SECTION 5: Financial Values & Logistics */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px] block">
              Composição Financeira, Faturamento & Repasse ao Técnico
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Taxa Base Repasse (R$):</label>
                <input
                  type="number"
                  step="0.50"
                  value={baseServiceFee}
                  onChange={(e) => setBaseServiceFee(Number(e.target.value))}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Deslocamento (KM):</label>
                <input
                  type="number"
                  step="1"
                  value={kmTraveled}
                  onChange={(e) => setKmTraveled(Number(e.target.value))}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Pedágio Comprovado (R$):</label>
                <input
                  type="number"
                  step="0.50"
                  value={tollCost}
                  onChange={(e) => setTollCost(Number(e.target.value))}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Suporte / Adicional (R$):</label>
                <input
                  type="number"
                  step="0.50"
                  value={supportCost}
                  onChange={(e) => setSupportCost(Number(e.target.value))}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Faturamento Bruto Porto (R$):</label>
                <input
                  type="number"
                  step="1.00"
                  value={faturamentoPorto}
                  onChange={(e) => setFaturamentoPorto(Number(e.target.value))}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">Valor faturado contra a seguradora</span>
              </div>

              <div className="p-2.5 bg-cyan-50 rounded-xl border border-cyan-200 flex flex-col justify-center">
                <span className="text-[10px] font-bold uppercase text-[#003366]">Total Repasse Técnico Calculado:</span>
                <span className="text-base font-black text-[#003366]">
                  R$ {liveTechnicianGross.toFixed(2)}
                </span>
                <span className="text-[9px] text-slate-500">
                  Base (R$ {Number(baseServiceFee).toFixed(2)}) + KM (R$ {kmTotalCost.toFixed(2)}) + Pedágio (R$ {Number(tollCost).toFixed(2)}) + Suporte (R$ {Number(supportCost).toFixed(2)})
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 6: Execution Notes */}
          <div>
            <label className="text-[10px] font-bold text-slate-600 block mb-1">Observações da Execução / Ocorrências:</label>
            <textarea
              rows={2}
              value={executionNotes}
              onChange={(e) => setExecutionNotes(e.target.value)}
              placeholder="Descreva detalhes adicionais ou instruções ao técnico..."
              className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center space-x-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-xl border border-red-200 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Excluir OS</span>
            </button>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center space-x-1.5 px-5 py-2 bg-[#003366] hover:bg-[#00264d] text-white text-xs font-bold rounded-xl shadow-xs transition-all disabled:opacity-50"
              >
                <Save className="h-4 w-4 text-cyan-400" />
                <span>{isSaving ? 'Salvando no MariaDB...' : 'Salvar Alterações'}</span>
              </button>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
};
