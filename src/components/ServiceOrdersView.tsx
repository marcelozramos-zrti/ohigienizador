import React, { useState, useMemo } from 'react';
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
  X,
  Shield,
  Layers,
  UserCheck,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ServiceOrder } from '../types';
import { EditServiceOrderModal } from './EditServiceOrderModal';

interface ServiceOrdersViewProps {
  onOpenNewOrder: () => void;
}

export const ServiceOrdersView: React.FC<ServiceOrdersViewProps> = ({ onOpenNewOrder }) => {
  const { orders = [], exportOrdersCsv, currentUser } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);
  const [editingOrder, setEditingOrder] = useState<ServiceOrder | null>(null);

  const safeOrders = orders || [];

  const filteredOrders = useMemo(() => {
    return safeOrders.filter((os) => {
      const matchesSearch =
        (os.callNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (os.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (os.customerCpf || '').includes(searchTerm) ||
        (os.city || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (os.neighborhood || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (os.technicianName && os.technicianName.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus = statusFilter === 'ALL' || os.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [safeOrders, searchTerm, statusFilter]);

  const getStatusBadge = (status: ServiceOrder['status']) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-bold text-[9px] uppercase tracking-wider">
            FINALIZADA
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full font-bold text-[9px] uppercase tracking-wider">
            EM ANDAMENTO
          </span>
        );
      case 'PENDING':
        return (
          <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-bold text-[9px] uppercase tracking-wider">
            PENDENTE
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-bold text-[9px] uppercase tracking-wider">
            CANCELADA
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header with Title & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#003366] tracking-tight">
            Ordens de Serviço • Porto Seguro
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitoramento de chamados, rotas por KM, pedágios, custos de suporte e baixa de insumos.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={exportOrdersCsv}
            className="flex items-center space-x-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 shadow-xs transition-all"
          >
            <FileDown className="h-4 w-4 text-slate-600" />
            <span>Exportar CSV</span>
          </button>

          {currentUser.role !== 'TECHNICIAN' && (
            <button
              onClick={onOpenNewOrder}
              className="flex items-center space-x-1.5 px-4 py-2 bg-[#003366] hover:bg-[#00264d] text-white text-xs font-bold rounded-lg shadow-sm transition-all"
            >
              <PlusCircle className="h-4 w-4 text-cyan-400" />
              <span>Nova OS Porto</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Search Input */}
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar chamado, cliente, CPF, bairro ou técnico..."
            className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:bg-white transition-all"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center space-x-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {[
            { id: 'ALL', label: 'Todas as OS' },
            { id: 'PENDING', label: 'Pendentes' },
            { id: 'IN_PROGRESS', label: 'Em Andamento' },
            { id: 'COMPLETED', label: 'Finalizadas' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
                statusFilter === tab.id
                  ? 'bg-[#003366] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

      </div>

      {/* Orders High Density Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-400 uppercase font-bold text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Chamado Porto</th>
                <th className="py-3 px-4">Cliente & Local</th>
                <th className="py-3 px-4">Serviço</th>
                <th className="py-3 px-4">Técnico</th>
                <th className="py-3 px-4">Deslocamento (KM)</th>
                <th className="py-3 px-4">Repasse Técnico</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Nenhuma ordem de serviço encontrada.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((os) => (
                  <tr key={os.id} className="hover:bg-slate-50/70 transition-colors">
                    
                    {/* Call Number */}
                    <td className="py-3.5 px-4">
                      <div className="font-mono font-bold text-[#003366]">
                        #{os.callNumber}
                      </div>
                      {os.portoSeguroProtocol && (
                        <div className="text-[10px] text-slate-400 font-mono">
                          {os.portoSeguroProtocol}
                        </div>
                      )}
                    </td>

                    {/* Customer */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-800">{os.customerName}</div>
                      <div className="text-[11px] text-slate-500 flex items-center mt-0.5">
                        <MapPin className="h-3 w-3 mr-0.5 text-slate-400 shrink-0" />
                        <span>{os.neighborhood}, {os.uf}</span>
                      </div>
                    </td>

                    {/* Service Category */}
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-800">{os.serviceCategory}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Base: R$ {os.baseServiceFee.toFixed(2)}
                      </div>
                    </td>

                    {/* Technician */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-800 flex items-center space-x-1">
                        <User className="h-3 w-3 text-slate-400" />
                        <span>{os.technicianName || 'Não Alocado'}</span>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(os.scheduledDate).toLocaleDateString('pt-BR')}
                      </div>
                    </td>

                    {/* KM & Logistics */}
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-700">
                        {os.kmTraveled > 0 ? `${os.kmTraveled} km (R$ ${os.kmTotalCost.toFixed(2)})` : '0 km'}
                      </div>
                      {(os.tollCost > 0 || os.supportCost > 0) && (
                        <div className="text-[10px] text-slate-500">
                          Pedágio: R$ {os.tollCost.toFixed(2)} | Suporte: R$ {os.supportCost.toFixed(2)}
                        </div>
                      )}
                    </td>

                    {/* Repasse Bruto ao Técnico */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-[#003366]">
                        R$ {os.totalTechnicianGross.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Porto: R$ {os.faturamentoPorto.toFixed(2)}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4 text-center">{getStatusBadge(os.status)}</td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <button
                          onClick={() => setSelectedOrder(os)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-600 hover:bg-cyan-50 transition-colors"
                          title="Visualizar Detalhes da OS"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        
                        {currentUser.role !== 'TECHNICIAN' && (
                          <button
                            onClick={() => setEditingOrder(os)}
                            className="flex items-center space-x-1 px-2 py-1 rounded-lg text-[#003366] bg-cyan-50 hover:bg-cyan-100 hover:text-[#00264d] border border-cyan-200 text-[11px] font-bold transition-all"
                            title="Editar Ordem de Serviço & Trocar Técnico"
                          >
                            <Pencil className="h-3.5 w-3.5 text-cyan-700" />
                            <span className="hidden sm:inline">Editar</span>
                          </button>
                        )}
                      </div>
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

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
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200"
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
                      {selectedOrder.addressStreet}, {selectedOrder.addressNumber} {selectedOrder.addressComplement} - {selectedOrder.neighborhood}, {selectedOrder.city}/{selectedOrder.uf} (CEP: {selectedOrder.postalCode})
                    </span>
                  </div>
                  {selectedOrder.customerPhone && (
                    <div>
                      <span className="text-slate-500 font-medium">Telefone:</span>{' '}
                      <span className="text-slate-800 font-semibold">{selectedOrder.customerPhone}</span>
                    </div>
                  )}
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
                    <span className="font-bold text-slate-800">R$ {selectedOrder.baseServiceFee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">KM Rodado ({selectedOrder.kmTraveled} km @ R$ {selectedOrder.kmRateApplied}/km):</span>
                    <span className="font-bold text-slate-800">R$ {selectedOrder.kmTotalCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Pedágio Comprovado:</span>
                    <span className="font-bold text-slate-800">R$ {selectedOrder.tollCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Custos de Suporte / Adicionais:</span>
                    <span className="font-bold text-slate-800">R$ {selectedOrder.supportCost.toFixed(2)}</span>
                  </div>
                  <div className="pt-2 border-t border-cyan-200 flex justify-between text-xs">
                    <span className="font-bold text-[#003366]">Total Repasse Técnico:</span>
                    <span className="font-black text-[#003366]">R$ {selectedOrder.totalTechnicianGross.toFixed(2)}</span>
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
                      <div key={idx} className="p-2 rounded bg-slate-50 border border-slate-200 flex justify-between items-center">
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
                  onClick={() => {
                    const target = selectedOrder;
                    setSelectedOrder(null);
                    setEditingOrder(target);
                  }}
                  className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-[#003366] hover:bg-[#00264d] text-white font-bold rounded-lg text-xs transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Editar OS / Trocar Técnico</span>
                </button>
              ) : <div />}

              <button
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg text-xs"
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
