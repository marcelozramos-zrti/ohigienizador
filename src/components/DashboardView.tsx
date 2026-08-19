import React from 'react';
import {
  TrendingUp,
  Award,
  CheckCircle,
  AlertTriangle,
  FileSpreadsheet,
  PlusCircle,
  Shield,
  MapPin,
  Car,
  ChevronRight,
  Package,
  Layers,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

interface DashboardViewProps {
  onNavigateTab: (tab: string) => void;
  onOpenNewOrder: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigateTab, onOpenNewOrder }) => {
  const { currentClosing, orders = [], stock = [], users = [] } = useApp();

  const safeOrders = orders || [];
  const safeStock = stock || [];
  const safeUsers = users || [];

  const completedOrders = safeOrders.filter((o) => o.status === 'COMPLETED');
  const inProgressOrders = safeOrders.filter((o) => o.status === 'IN_PROGRESS');
  const pendingOrders = safeOrders.filter((o) => o.status === 'PENDING');

  const lowStockItems = safeStock.filter((s) => s.quantityInStock <= s.minimumThreshold);
  const activeTechnicians = safeUsers.filter((u) => u.role === 'TECHNICIAN');

  const totalFaturamentoPorto = currentClosing?.totalFaturamentoPorto || 0;
  const totalTechnicianGross = currentClosing?.totalTechnicianGross || 0;
  const totalAdvancesDeducted = currentClosing?.totalAdvancesDeducted || 0;
  const totalTaxesDeducted = currentClosing?.totalTaxesDeducted || 0;
  const companyProfitMargin = currentClosing?.companyProfitMargin || 0;

  return (
    <div className="space-y-6">
      
      {/* 4 High-Density Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Chamados Porto Seguro */}
        <div
          id="metric-card-orders"
          onClick={() => onNavigateTab('orders')}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-cyan-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider group-hover:text-cyan-700 transition-colors">
              Chamados Porto Seguro
            </p>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-cyan-600 transition-colors" />
          </div>
          <div className="flex items-end justify-between mt-1">
            <span className="text-2xl font-bold text-[#003366]">
              {safeOrders.length}
            </span>
            <span className="text-xs text-green-600 font-medium bg-green-50 px-1.5 py-0.5 rounded border border-green-100">
              +{completedOrders.length} concluídas
            </span>
          </div>
        </div>

        {/* Técnicos Ativos */}
        <div
          id="metric-card-technicians"
          onClick={() => onNavigateTab('technicians')}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-cyan-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider group-hover:text-cyan-700 transition-colors">
              Técnicos Ativos
            </p>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-cyan-600 transition-colors" />
          </div>
          <div className="flex items-end justify-between mt-1">
            <span className="text-2xl font-bold text-[#003366]">
              {activeTechnicians.length}
            </span>
            <span className="text-xs text-slate-400 font-medium uppercase">
              Em Campo
            </span>
          </div>
        </div>

        {/* Insumos em Baixa */}
        <div
          id="metric-card-stock"
          onClick={() => onNavigateTab('stock')}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-cyan-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider group-hover:text-cyan-700 transition-colors">
              Insumos em Baixa
            </p>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-cyan-600 transition-colors" />
          </div>
          <div className="flex items-end justify-between mt-1">
            <span
              className={`text-2xl font-bold ${
                lowStockItems.length > 0 ? 'text-red-500' : 'text-[#003366]'
              }`}
            >
              {String(lowStockItems.length).padStart(2, '0')}
            </span>
            {lowStockItems.length > 0 ? (
              <span className="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded font-bold border border-red-100">
                URGENTE
              </span>
            ) : (
              <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-bold border border-emerald-100">
                REGULAR
              </span>
            )}
          </div>
        </div>

        {/* Faturamento Bruto */}
        <div
          id="metric-card-finance"
          onClick={() => onNavigateTab('finance')}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-md hover:border-cyan-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider group-hover:text-cyan-700 transition-colors">
              Faturamento Bruto
            </p>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-cyan-600 transition-colors" />
          </div>
          <div className="flex items-end justify-between mt-1">
            <span className="text-2xl font-bold text-[#003366]">
              R$ {(totalFaturamentoPorto / 1000).toFixed(1)}k
            </span>
            <span className="text-xs text-cyan-600 font-medium">
              Acumulado
            </span>
          </div>
        </div>
      </div>

      {/* Quick Navigation Action Row */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 shrink-0 pl-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            Acesso Rápido:
          </span>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            id="dash-quick-stock"
            onClick={() => onNavigateTab('stock')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-cyan-50 text-slate-700 hover:text-cyan-800 border border-slate-200 text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
          >
            <Package className="w-3.5 h-3.5 text-cyan-600" />
            <span>Estoque & Insumos</span>
            {lowStockItems.length > 0 && (
              <span className="px-1.5 py-0.2 bg-red-500 text-white rounded-full text-[9px] font-bold">
                {lowStockItems.length}
              </span>
            )}
          </button>

          <button
            id="dash-quick-orders"
            onClick={() => onNavigateTab('orders')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-cyan-50 text-slate-700 hover:text-cyan-800 border border-slate-200 text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-600" />
            <span>Ordens de Serviço</span>
            {pendingOrders.length > 0 && (
              <span className="px-1.5 py-0.2 bg-cyan-500 text-white rounded-full text-[9px] font-bold">
                {pendingOrders.length}
              </span>
            )}
          </button>

          <button
            id="dash-quick-technicians"
            onClick={() => onNavigateTab('technicians')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-cyan-50 text-slate-700 hover:text-cyan-800 border border-slate-200 text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
          >
            <TrendingUp className="w-3.5 h-3.5 text-cyan-600" />
            <span>Técnicos & PIX</span>
          </button>

          <button
            id="dash-quick-finance"
            onClick={() => onNavigateTab('finance')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-cyan-50 text-slate-700 hover:text-cyan-800 border border-slate-200 text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-600" />
            <span>Fechamento Quinzenal</span>
          </button>
        </div>
      </div>

      {/* Main High-Density Split Grid: Live OS Monitor (2 Cols) + Inventory/Closing Cards (1 Col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Real-time OS Monitoring Table (Col-span 2) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 flex flex-col shadow-xs overflow-hidden">
          
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-700 text-sm">
                Monitoramento em Tempo Real - OS
              </h3>
              <span className="h-2 w-2 rounded-full bg-cyan-500 animate-pulse"></span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onOpenNewOrder}
                className="text-xs text-[#003366] hover:text-cyan-700 font-bold flex items-center gap-1"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Nova OS</span>
              </button>
              <button
                onClick={() => onNavigateTab('orders')}
                className="text-xs text-cyan-600 hover:text-cyan-700 font-bold"
              >
                Ver Todas
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase text-slate-400 font-bold tracking-wider">
                  <th className="px-4 py-3">ID OS</th>
                  <th className="px-4 py-3">Serviço</th>
                  <th className="px-4 py-3">Técnico</th>
                  <th className="px-4 py-3">Bairro/UF</th>
                  <th className="px-4 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="text-xs divide-y divide-slate-50">
                {safeOrders.slice(0, 6).map((os) => {
                  let statusBadge = (
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full font-bold text-[9px]">
                      EM ANDAMENTO
                    </span>
                  );

                  if (os.status === 'COMPLETED') {
                    statusBadge = (
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full font-bold text-[9px]">
                        FINALIZADA
                      </span>
                    );
                  } else if (os.status === 'PENDING') {
                    statusBadge = (
                      <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full font-bold text-[9px]">
                        PENDENTE
                      </span>
                    );
                  }

                  return (
                    <tr key={os.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-[#003366] whitespace-nowrap">
                        #{os.callNumber}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {os.serviceCategory}
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-medium">
                        {os.technicianName || 'Não alocado'}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {os.neighborhood}, {os.uf}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {statusBadge}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-slate-50/60 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Mostrando os {Math.min(6, safeOrders.length)} chamados mais recentes</span>
            <button
              onClick={() => onNavigateTab('orders')}
              className="text-[#003366] font-bold hover:underline"
            >
              Gerenciar {safeOrders.length} ordens de serviço →
            </button>
          </div>

        </div>

        {/* Right Column: Inventory Progress + High-Density Dark Navy Closing Card */}
        <div className="flex flex-col gap-6">
          
          {/* Stock Status Card with Density Bars */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-700 text-sm">Status do Estoque</h3>
              <button
                onClick={() => onNavigateTab('stock')}
                className="text-[11px] text-cyan-600 font-bold hover:underline"
              >
                Gerenciar
              </button>
            </div>

            <div className="space-y-3.5">
              {safeStock.slice(0, 3).map((item) => {
                const isCritical = item.quantityInStock <= item.minimumThreshold;
                const ratio = Math.min(100, Math.round((item.quantityInStock / (item.minimumThreshold * 3)) * 100));

                return (
                  <div key={item.id}>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="font-medium text-slate-600 truncate max-w-[170px]">
                        {item.name}
                      </span>
                      <span className={`font-bold ${isCritical ? 'text-red-500' : 'text-slate-700'}`}>
                        {item.quantityInStock} {item.unit}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          isCritical
                            ? 'bg-red-400'
                            : ratio > 60
                            ? 'bg-green-400'
                            : 'bg-cyan-400'
                        }`}
                        style={{ width: `${Math.max(10, ratio)}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Deep Navy High-Density Executive Closing Card */}
          <div className="bg-[#003366] text-white rounded-xl p-5 flex-1 shadow-lg border border-[#004080] flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-sm mb-3 text-cyan-300 uppercase tracking-tighter">
                Extrato Quinzenal Geral
              </h3>
              
              <div className="space-y-2.5">
                <div className="flex justify-between border-b border-white/10 pb-2">
                  <span className="text-[11px] opacity-70">Receita Porto Seguro</span>
                  <span className="text-xs font-mono font-bold">
                    R$ {totalFaturamentoPorto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex justify-between border-b border-white/10 pb-2">
                  <span className="text-[11px] opacity-70">Custos Técnicos (KM + Pedágio)</span>
                  <span className="text-xs font-mono text-red-300">
                    -R$ {totalTechnicianGross.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex justify-between border-b border-white/10 pb-2">
                  <span className="text-[11px] opacity-70">Adiantamentos / Vales</span>
                  <span className="text-xs font-mono text-red-300">
                    -R$ {totalAdvancesDeducted.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {totalTaxesDeducted > 0 && (
                  <div className="flex justify-between border-b border-white/10 pb-2 text-amber-300">
                    <span className="text-[11px] opacity-80">Retenção Fiscal 6% (2 Técnicos)</span>
                    <span className="text-xs font-mono">
                      -R$ {totalTaxesDeducted.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}

                <div className="flex justify-between pt-2 items-center">
                  <span className="text-xs font-bold text-slate-200">Saldo Líquido Estimado</span>
                  <span className="text-base font-bold text-cyan-400">
                    R$ {companyProfitMargin.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => onNavigateTab('finance')}
              className="w-full mt-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
            >
              Gerar Fechamento Financeiro
            </button>
          </div>

        </div>

      </div>

    </div>
  );
};
