import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { ServiceOrdersView } from './components/ServiceOrdersView';
import { FinancialClosingView } from './components/FinancialClosingView';
import { InventoryView } from './components/InventoryView';
import { TechniciansView } from './components/TechniciansView';
import { CashFlowView } from './components/CashFlowView';
import { MobileAppSimulator } from './components/MobileAppSimulator';
import { SettingsView } from './components/SettingsView';
import { NewServiceOrderModal } from './components/NewServiceOrderModal';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const MainLayout: React.FC = () => {
  const { activeTab = 'dashboard', setActiveTab, toasts = [], removeToast } = useApp();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [showNewOrderModal, setShowNewOrderModal] = useState<boolean>(false);
  const [showNewAdvanceModal, setShowNewAdvanceModal] = useState<boolean>(false);

  const safeToasts = toasts || [];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-800 font-sans antialiased">
      {/* Sidebar Navigation (Static & Fixed to viewport) */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Content Column (Only this area scrolls) */}
      <div className="flex-1 flex flex-col h-screen min-w-0 overflow-hidden">
        {/* Top Header */}
        <Header
          activeTab={activeTab}
          onNavigateTab={setActiveTab}
          onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          onOpenNewOrder={() => setShowNewOrderModal(true)}
        />

        {/* Dynamic Scrollable Page Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl w-full mx-auto">
            {activeTab === 'dashboard' && (
              <DashboardView
                onNavigateTab={setActiveTab}
                onOpenNewOrder={() => setShowNewOrderModal(true)}
              />
            )}

            {activeTab === 'orders' && (
              <ServiceOrdersView onOpenNewOrder={() => setShowNewOrderModal(true)} />
            )}

            {activeTab === 'finance' && (
              <FinancialClosingView onOpenNewAdvance={() => setShowNewAdvanceModal(true)} />
            )}

            {activeTab === 'stock' && <InventoryView />}

            {activeTab === 'technicians' && <TechniciansView />}

            {activeTab === 'cashflow' && (
              <CashFlowView
                showNewModal={showNewAdvanceModal}
                onOpenNewModal={() => setShowNewAdvanceModal(true)}
                onCloseNewModal={() => setShowNewAdvanceModal(false)}
              />
            )}

            {activeTab === 'mobile_app' && <MobileAppSimulator />}

            {activeTab === 'settings' && <SettingsView />}
          </div>
        </main>
      </div>

      {/* New Service Order Modal */}
      {showNewOrderModal && (
        <NewServiceOrderModal onClose={() => setShowNewOrderModal(false)} />
      )}

      {/* Global Toast Notifications Container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col space-y-2 max-w-md w-full pointer-events-none">
        {safeToasts.map((toast) => {
          const bg =
            toast.type === 'success'
              ? 'bg-[#003366] text-white border border-[#004080]'
              : toast.type === 'error'
              ? 'bg-red-900 text-white border border-red-700'
              : 'bg-slate-900 text-white border border-slate-700';

          const Icon =
            toast.type === 'success'
              ? CheckCircle2
              : toast.type === 'error'
              ? AlertCircle
              : Info;

          return (
            <div
              key={toast.id}
              className={`p-3.5 rounded-xl shadow-xl backdrop-blur-md pointer-events-auto flex items-start space-x-3 transition-all animate-in slide-in-from-bottom-2 ${bg}`}
            >
              <Icon className="h-4 w-4 shrink-0 mt-0.5 text-cyan-300" />
              <div className="flex-1 text-xs">
                <strong className="font-bold block text-xs">{toast.title}</strong>
                <p className="mt-0.5 opacity-90 text-[11px]">{toast.message}</p>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="opacity-70 hover:opacity-100 text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
