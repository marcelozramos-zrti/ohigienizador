import React, { useState } from 'react';
import {
  X,
  PlusCircle,
  MapPin,
  User,
  Phone,
  Calendar,
  DollarSign,
  Shield,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

interface NewServiceOrderModalProps {
  onClose: () => void;
}

export const NewServiceOrderModal: React.FC<NewServiceOrderModalProps> = ({ onClose }) => {
  const { createServiceOrder, users = [], settings } = useApp();

  const safeUsers = users || [];
  const technicians = safeUsers.filter((u) => u && u.role === 'TECHNICIAN');

  const [callNumber, setCallNumber] = useState(`PS-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
  const [portoProtocol, setPortoProtocol] = useState(`SIN-2025-${Math.floor(10000 + Math.random() * 90000)}`);
  const [customerName, setCustomerName] = useState('');
  const [customerCpf, setCustomerCpf] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressNumber, setAddressNumber] = useState('');
  const [addressComplement, setAddressComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('São Paulo');
  const [uf, setUf] = useState('SP');
  const [postalCode, setPostalCode] = useState('01310-100');
  const [serviceCategory, setServiceCategory] = useState('Higienização de Sofá 3 Lugares');
  const [technicianId, setTechnicianId] = useState(technicians[0]?.id || '');
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().split('T')[0]);

  const baseFee = settings?.serviceCategoriesRates?.[serviceCategory] || 120.0;
  const faturamentoPorto = baseFee * 1.6; // Valor bruto cobrado da seguradora

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !customerCpf || !addressStreet) return;

    createServiceOrder({
      callNumber,
      portoSeguroProtocol: portoProtocol,
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
      serviceCategory,
      technicianId: technicianId || undefined,
      scheduledDate,
      baseServiceFee: baseFee,
      faturamentoPorto: faturamentoPorto,
      status: technicianId ? 'IN_PROGRESS' : 'PENDING',
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 bg-sky-50/50 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="h-9 w-9 rounded-xl bg-sky-600 text-white flex items-center justify-center shadow-xs">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">
                Nova Ordem de Serviço • Porto Seguro
              </h2>
              <p className="text-xs text-slate-500">
                Abertura e atribuição de chamado para técnico de campo
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          
          {/* Protocolos */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">Nº Chamado Sistema:</label>
              <input
                type="text"
                required
                value={callNumber}
                onChange={(e) => setCallNumber(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">Sinistro / Protocolo Porto:</label>
              <input
                type="text"
                value={portoProtocol}
                onChange={(e) => setPortoProtocol(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
              />
            </div>
          </div>

          {/* Dados do Cliente */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px] block">
              Dados do Segurado / Cliente
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="sm:col-span-2">
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Nome Completo:</label>
                <input
                  type="text"
                  required
                  placeholder="Nome do cliente Porto Seguro"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">CPF:</label>
                <input
                  type="text"
                  required
                  placeholder="000.000.000-00"
                  value={customerCpf}
                  onChange={(e) => setCustomerCpf(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">Telefone / WhatsApp:</label>
              <input
                type="text"
                placeholder="(11) 99999-8888"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs"
              />
            </div>
          </div>

          {/* Endereço */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px] block">
              Local de Atendimento
            </span>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Logradouro:</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Av. Paulista"
                  value={addressStreet}
                  onChange={(e) => setAddressStreet(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Número:</label>
                <input
                  type="text"
                  placeholder="1000"
                  value={addressNumber}
                  onChange={(e) => setAddressNumber(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Complemento:</label>
                <input
                  type="text"
                  placeholder="Apto 42"
                  value={addressComplement}
                  onChange={(e) => setAddressComplement(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Bairro:</label>
                <input
                  type="text"
                  placeholder="Bela Vista"
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">Cidade:</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-1">UF:</label>
                <input
                  type="text"
                  value={uf}
                  onChange={(e) => setUf(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs uppercase"
                />
              </div>
            </div>
          </div>

          {/* Serviço & Técnico Alocado */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">Serviço Solicitado:</label>
              <select
                value={serviceCategory}
                onChange={(e) => setServiceCategory(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
              >
                {Object.keys(settings?.serviceCategoriesRates || {}).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat} (Repasse: R$ {(settings?.serviceCategoriesRates?.[cat] || 0).toFixed(2)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">Técnico Responsável:</label>
              <select
                value={technicianId}
                onChange={(e) => setTechnicianId(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
              >
                <option value="">Aguardando Alocação</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Data Agendada */}
          <div>
            <label className="text-[10px] font-bold text-slate-600 block mb-1">Data Agendada:</label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
            />
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-xl"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow"
            >
              Criar Ordem de Serviço
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
