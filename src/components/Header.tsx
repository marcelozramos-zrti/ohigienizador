import React, { useState } from 'react';
import {
  Bell,
  Search,
  CheckCircle2,
  ChevronDown,
  PlusCircle,
  Menu,
  LayoutDashboard,
  ClipboardList,
  Users,
  PackageCheck,
  FileSpreadsheet,
  DollarSign,
  Smartphone,
  Sliders,
  LogOut,
  Shield,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

interface HeaderProps {
  activeTab: string;
  onNavigateTab?: (tab: string) => void;
  onToggleMobileMenu?: () => void;
  onOpenNewOrder?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onNavigateTab,
  onToggleMobileMenu,
  onOpenNewOrder,
}) => {
  const {
    currentUser,
    setCurrentUser,
    users = [],
    notifications = [],
    markNotificationRead,
    clearNotifications,
    selectedMonth = 8,
    selectedPeriod = 1,
    addToast,
    logout,
  } = useApp();

  const safeUsers = users || [];
  const safeNotifications = notifications || [];
  const safeUser =
    currentUser ||
    safeUsers[0] || {
      name: 'Admin',
      role: 'ADMIN',
      email: 'admin@ohigienizador.com.br',
    };

  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);

  const unreadCount = safeNotifications.filter((n) => !n.read).length;

  const handleSwitchUser = (userId: string) => {
    const selected = safeUsers.find((u) => u.id === userId);
    if (selected) {
      setCurrentUser(selected);
      setShowRoleMenu(false);
      addToast(
        'Perfil Alternado',
        `Você está navegando como ${selected.name} (${selected.role}).`,
        'info'
      );
    }
  };

  const monthNames = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ];

  const getPageDetails = (tab: string) => {
    switch (tab) {
      case 'dashboard':
        return {
          title: 'Visão Geral Operacional',
          subtitle: 'Métricas e Indicadores em Tempo Real',
          icon: LayoutDashboard,
        };
      case 'orders':
        return {
          title: 'Ordens de Serviço (OS)',
          subtitle: 'Chamados Homologados Porto Seguro',
          icon: ClipboardList,
        };
      case 'finance':
        return {
          title: 'Fechamento Financeiro & DataGrid',
          subtitle: 'Apuração Quinzenal e Extratos Oficiais',
          icon: FileSpreadsheet,
        };
      case 'stock':
        return {
          title: 'Controle de Estoque & Insumos',
          subtitle: 'Químicos, Impermeabilizantes e Suportes',
          icon: PackageCheck,
        };
      case 'technicians':
        return {
          title: 'Gestão de Técnicos & PIX',
          subtitle: 'Ajuda de Custo (R$ 250) e Regra Fiscal (16%)',
          icon: Users,
        };
      case 'cashflow':
        return {
          title: 'Fluxo de Caixa & Vales',
          subtitle: 'Controle de Adiantamentos e Recebíveis',
          icon: DollarSign,
        };
      case 'mobile_app':
        return {
          title: 'Simulador do Aplicativo de Campo',
          subtitle: 'Interface Mobile do Técnico',
          icon: Smartphone,
        };
      case 'settings':
        return {
          title: 'Configurações do Sistema',
          subtitle: 'Parâmetros Gerais e Integração WhatsApp',
          icon: Sliders,
        };
      default:
        return {
          title: 'Painel de Controle',
          subtitle: 'Sistema de Gestão Operacional',
          icon: LayoutDashboard,
        };
    }
  };

  const page = getPageDetails(activeTab);
  const PageIcon = page.icon;

  return (
    <header className="bg-white border-b border-slate-200 shrink-0 sticky top-0 z-30 shadow-xs">
      {/* Executive Header Row */}
      <div className="h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
        {/* Left Side: Mobile Menu Button, Current View Title & Badges */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile hamburger button */}
          <button
            id="mobile-menu-toggle-btn"
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Abrir Menu de Navegação"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-cyan-50 border border-cyan-200 flex items-center justify-center shrink-0 text-[#003366]">
              <PageIcon className="w-4 h-4 text-[#003366]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold text-[#003366] truncate">
                  {page.title}
                </h2>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 bg-cyan-50 text-cyan-800 text-[10px] font-bold rounded border border-cyan-200 uppercase tracking-wider">
                  {selectedPeriod}ª Quinzena • {monthNames[selectedMonth - 1] || 'Agosto'}/2026
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium truncate hidden md:block">
                {page.subtitle}
              </p>
            </div>
          </div>
        </div>

        {/* Right Side: Search, Quick Action, Notifications, User Profile */}
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          {/* Search Input Bar (Desktop) */}
          <div className="hidden lg:flex items-center gap-2 text-slate-400 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs w-52 xl:w-64 focus-within:ring-2 focus-within:ring-cyan-500 focus-within:bg-white transition-all">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Pesquisar no sistema..."
              className="w-full bg-transparent border-none text-slate-800 placeholder-slate-400 focus:outline-none text-xs"
            />
          </div>

          {/* Quick New Order Button */}
          {onOpenNewOrder && (
            <button
              id="header-quick-new-os-btn"
              onClick={onOpenNewOrder}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-[#003366] hover:bg-[#00264d] text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5 text-cyan-300" />
              <span>Nova OS</span>
            </button>
          )}

          {/* Notifications Dropdown */}
          <div className="relative">
            <button
              id="header-notifications-btn"
              onClick={() => setShowNotifs(!showNotifs)}
              className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition-colors relative cursor-pointer"
              title="Notificações"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-xs">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifs && (
              <div className="absolute right-0 mt-2 w-88 bg-white rounded-xl shadow-2xl border border-slate-200 py-2 z-50 animate-in fade-in">
                <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Notificações Pendentes
                    </span>
                    {safeNotifications.length > 0 && (
                      <span className="px-1.5 py-0.5 bg-[#003366] text-white text-[10px] font-bold rounded-full">
                        {safeNotifications.length}
                      </span>
                    )}
                  </div>
                  {safeNotifications.length > 0 && (
                    <button
                      onClick={clearNotifications}
                      className="text-[10px] text-slate-500 hover:text-cyan-600 hover:underline font-bold cursor-pointer"
                    >
                      Limpar visualização
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {safeNotifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-xs text-slate-400">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1.5 opacity-80" />
                      Tudo em ordem! Nenhuma pendência de estoque ou fechamento.
                    </div>
                  ) : (
                    safeNotifications.map((n) => {
                      const isCrit = n.type === 'error' || n.category === 'STOCK_CRITICAL';
                      const isWarn = n.type === 'warning' || n.category === 'STOCK_WARNING';
                      const isClose = n.category === 'CLOSING';

                      return (
                        <div
                          key={n.id}
                          onClick={() => {
                            markNotificationRead(n.id);
                            if (n.targetTab && onNavigateTab) {
                              onNavigateTab(n.targetTab);
                              setShowNotifs(false);
                            }
                          }}
                          className={`px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors ${
                            !n.read ? (isCrit ? 'bg-red-50/50' : isWarn ? 'bg-amber-50/50' : 'bg-cyan-50/40') : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  isCrit ? 'bg-red-500' : isWarn ? 'bg-amber-500' : 'bg-cyan-500'
                                }`}
                              />
                              <h4 className="text-xs font-bold text-slate-900 leading-snug">{n.title}</h4>
                            </div>
                            <span className="text-[10px] text-slate-400 font-medium shrink-0">{n.timestamp}</span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1 pl-3.5 leading-relaxed">{n.message}</p>
                          {n.targetTab && (
                            <div className="mt-1.5 pl-3.5 flex items-center text-[10px] text-cyan-700 font-bold hover:underline">
                              <span>
                                {n.targetTab === 'stock' ? '→ Abrir Estoque & Editar Insumo' : '→ Acessar Fechamento Financeiro'}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User / RBAC Profile Switcher */}
          <div className="relative">
            <button
              id="header-user-profile-menu-btn"
              onClick={() => setShowRoleMenu(!showRoleMenu)}
              className="flex items-center gap-2 p-1.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-slate-50 hover:bg-slate-100 transition-all text-left cursor-pointer"
            >
              <div className="w-7 h-7 rounded-full bg-[#003366] text-white flex items-center justify-center font-bold text-xs shadow-xs">
                {(safeUser.name || 'U').charAt(0)}
              </div>
              <div className="hidden sm:block">
                <div className="text-xs font-bold text-slate-800 truncate max-w-[110px] leading-tight">
                  {(safeUser.name || '').split(' ')[0]}
                </div>
                <div className="text-[9px] text-cyan-700 font-semibold uppercase">
                  {safeUser.role}
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showRoleMenu && (
              <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 py-2 z-50 animate-in fade-in">
                <div className="px-4 py-2 border-b border-slate-100">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Alternar Perfil Ativo
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Clique para testar a visão de outros usuários
                  </p>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {safeUsers.map((u) => {
                    const isSelected = u.id === safeUser.id;
                    return (
                      <button
                        key={u.id}
                        id={`switch-user-${u.id}`}
                        onClick={() => handleSwitchUser(u.id)}
                        className={`w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer ${
                          isSelected ? 'bg-cyan-50/60' : ''
                        }`}
                      >
                        <div>
                          <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                            <span>{u.name}</span>
                            {u.hasSpecialTaxRule && (
                              <span className="text-[9px] px-1 py-0.2 bg-amber-100 text-amber-800 rounded font-bold">
                                16% Fiscal
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {u.email} • <span className="font-semibold">{u.role}</span>
                          </div>
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="w-4 h-4 text-cyan-600 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="p-2 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between">
                  <div className="text-[10px] text-slate-400 font-mono">
                    ID: {safeUser.id.substring(0, 14)}
                  </div>
                  <button
                    onClick={() => {
                      setShowRoleMenu(false);
                      logout();
                    }}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sair da Conta</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Quick Logout Button on Header */}
          <button
            onClick={logout}
            title="Encerrar Sessão"
            className="hidden sm:flex items-center justify-center p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors border border-transparent hover:border-red-100 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
