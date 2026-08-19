import React, { useState } from 'react';
import {
  LayoutDashboard,
  ClipboardList,
  Smartphone,
  FileSpreadsheet,
  PackageCheck,
  Users,
  DollarSign,
  Sliders,
  X,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BrandLogo } from './BrandLogo';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isOpen = false,
  onClose,
}) => {
  const { currentUser, orders = [], stock = [] } = useApp();
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  const safeOrders = orders || [];
  const safeStock = stock || [];
  const safeUser = currentUser || { name: 'Admin', role: 'ADMIN' };

  const pendingOrdersCount = safeOrders.filter(
    (o) => o && (o.status === 'PENDING' || o.status === 'IN_PROGRESS')
  ).length;
  const lowStockCount = safeStock.filter(
    (s) => s && s.quantityInStock <= s.minimumThreshold
  ).length;

  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'orders',
      label: 'Ordens de Serviço',
      icon: ClipboardList,
      badge: pendingOrdersCount > 0 ? pendingOrdersCount : null,
      badgeColor: 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/30',
    },
    {
      id: 'technicians',
      label: 'Técnicos & PIX',
      icon: Users,
      badge: null,
    },
    {
      id: 'stock',
      label: 'Estoque & Insumos',
      icon: PackageCheck,
      badge: lowStockCount > 0 ? `${lowStockCount} alertas` : null,
      badgeColor: 'bg-red-500/20 text-red-200 border border-red-400/30',
    },
    {
      id: 'finance',
      label: 'Financeiro Quinzenal',
      icon: FileSpreadsheet,
      badge: 'Auditado',
      badgeColor: 'bg-cyan-400/20 text-cyan-200 border border-cyan-300/30',
    },
    {
      id: 'cashflow',
      label: 'Fluxo de Caixa & Vales',
      icon: DollarSign,
      badge: null,
    },
    {
      id: 'mobile_app',
      label: 'App Mobile Técnico',
      icon: Smartphone,
      badge: 'Ao Vivo',
      badgeColor: 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30',
    },
    {
      id: 'settings',
      label: 'Configurações',
      icon: Sliders,
      badge: null,
    },
  ];

  const handleSelectTab = (tabId: string) => {
    setActiveTab(tabId);
    if (onClose) {
      onClose();
    }
  };

  const renderSidebar = (collapsed: boolean, isMobile: boolean = false) => (
    <div
      className={`${
        collapsed ? 'w-20' : 'w-64'
      } bg-[#003366] text-slate-300 flex flex-col shrink-0 select-none border-r border-[#00264d] h-screen max-h-screen overflow-hidden transition-all duration-300 ease-in-out`}
    >
      {/* Brand & Logo Header */}
      <div
        className={`p-4 flex items-center ${
          collapsed ? 'justify-center' : 'justify-between'
        } border-b border-white/10 bg-[#00264d]/60 min-h-[64px]`}
      >
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2.5'}`}>
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shrink-0 shadow-md p-1">
            <BrandLogo size="sm" variant="icon-only" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="text-white font-extrabold text-sm leading-tight tracking-tight truncate">
                O Higienizador
              </h1>
              <p className="text-cyan-300 text-[9px] font-medium tracking-tight truncate">
                Gestão Porto Seguro
              </p>
            </div>
          )}
        </div>

        {/* Toggle Collapse/Expand Button (Desktop only) */}
        {!isMobile && (
          <button
            id="toggle-sidebar-collapse-btn"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer ${
              collapsed ? 'hidden' : 'block'
            }`}
            title={collapsed ? 'Maximizar Menu Lateral' : 'Minimizar Menu Lateral'}
            aria-label={collapsed ? 'Maximizar Menu' : 'Minimizar Menu'}
          >
            <PanelLeftClose className="w-4 h-4 text-cyan-300" />
          </button>
        )}

        {/* Close Button on Mobile Drawer */}
        {isMobile && onClose && (
          <button
            id="close-mobile-sidebar-button"
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* When collapsed on desktop: small expand button bar */}
      {!isMobile && collapsed && (
        <div className="pt-2 px-3 flex justify-center">
          <button
            id="expand-sidebar-collapsed-btn"
            onClick={() => setIsCollapsed(false)}
            className="w-full py-1.5 flex items-center justify-center rounded-lg text-cyan-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Expandir Menu Lateral"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation Links */}
      <nav className={`mt-3 flex-1 ${collapsed ? 'px-2' : 'px-3'} space-y-1.5 overflow-y-auto`}>
        {!collapsed && (
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-cyan-200/50">
            Navegação Principal
          </div>
        )}

        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;

          return (
            <button
              id={`sidebar-nav-${item.id}`}
              key={item.id}
              onClick={() => handleSelectTab(item.id)}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center ${
                collapsed ? 'justify-center p-3' : 'justify-between px-3.5 py-2.5'
              } rounded-lg text-xs font-semibold transition-all cursor-pointer relative group ${
                isActive
                  ? collapsed
                    ? 'bg-white/20 text-white shadow-sm border-l-4 border-cyan-400 font-bold'
                    : 'bg-white/20 text-white shadow-sm border-l-4 border-cyan-400 pl-2.5 font-bold'
                  : 'text-slate-200 hover:text-white hover:bg-white/10 hover:translate-x-0.5'
              }`}
            >
              <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? 'text-cyan-300' : 'text-slate-300 group-hover:text-white'
                  }`}
                />
                {!collapsed && <span className="truncate text-xs">{item.label}</span>}
              </div>

              {!collapsed && item.badge && (
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0 ${
                    isActive
                      ? 'bg-cyan-500 text-white'
                      : item.badgeColor || 'bg-white/10 text-cyan-200'
                  }`}
                >
                  {item.badge}
                </span>
              )}

              {/* Notification dot indicator when collapsed */}
              {collapsed && item.badge && (
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-cyan-400"></span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Porto SLA High Density Widget */}
      {!collapsed ? (
        <div className="p-3 m-3 rounded-lg bg-white/5 border border-white/10 text-xs">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-200">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse"></span>
              <span className="text-cyan-200 text-[10px] uppercase font-bold tracking-tight">
                Porto Seguro API
              </span>
            </span>
            <span className="text-emerald-400 font-bold text-[10px]">99.9%</span>
          </div>
          <p className="text-[10px] text-slate-300/70 mt-1 leading-tight">
            Sincronização em tempo real de sinistros homologados.
          </p>
        </div>
      ) : (
        <div
          className="p-2 mx-2 mb-3 rounded-lg bg-white/5 border border-white/10 flex justify-center items-center cursor-pointer"
          title="Porto Seguro API: 99.9% Online"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
        </div>
      )}

      {/* User Context Footer */}
      <div className={`${collapsed ? 'p-3' : 'p-4'} border-t border-white/10 bg-white/5`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <div
            className="w-8 h-8 rounded-full bg-cyan-500 flex items-center justify-center font-bold text-xs text-white shadow-xs shrink-0"
            title={collapsed ? `${safeUser.name} (${safeUser.role})` : undefined}
          >
            {(safeUser.name || 'U').charAt(0)}
          </div>
          {!collapsed && (
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-bold text-white truncate">{safeUser.name}</p>
              <p className="text-[10px] text-cyan-300 uppercase font-semibold tracking-tight">
                {safeUser.role === 'ADMIN' && 'Acesso Master'}
                {safeUser.role === 'OPERATIONAL' && 'Gestão Operacional'}
                {safeUser.role === 'TECHNICIAN' && 'Técnico Campo'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar (Collapsible & Fixed) */}
      <aside className="hidden md:block shrink-0 h-screen sticky top-0">
        {renderSidebar(isCollapsed, false)}
      </aside>

      {/* Mobile Drawer Sidebar (Always expanded) */}
      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div
            id="sidebar-mobile-backdrop"
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={onClose}
          />
          {/* Slide-out Panel */}
          <aside className="relative z-10 animate-in slide-in-from-left duration-200 shadow-2xl">
            {renderSidebar(false, true)}
          </aside>
        </div>
      )}
    </>
  );
};
