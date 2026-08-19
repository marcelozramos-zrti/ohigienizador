import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import {
  User,
  ServiceOrder,
  StockItem,
  FinancialMovement,
  BiweeklyClosing,
  GeneralSettings,
  OSStockItemUsage,
  TechnicianClosingSummary,
} from '../types';
import {
  INITIAL_USERS,
  INITIAL_ORDERS,
  INITIAL_STOCK,
  INITIAL_MOVEMENTS,
  INITIAL_SETTINGS,
} from '../mock/initialData';
import { FinancialEngine } from '../services/financialEngine';
import { PdfStatementGenerator } from '../services/pdfGenerator';
import { WhatsAppService, WhatsAppDispatchResult } from '../services/whatsappService';
import { CsvExportService } from '../services/csvExportService';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
  timestamp: string;
  read: boolean;
}

interface AppContextType {
  currentUser: User;
  setCurrentUser: (user: User) => void;
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  orders: ServiceOrder[];
  stock: StockItem[];
  movements: FinancialMovement[];
  settings: GeneralSettings;
  updateSettings: (newSettings: Partial<GeneralSettings>) => void;
  notifications: NotificationItem[];
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
  addToast: (title: string, message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;

  // OS Management
  createServiceOrder: (order: Omit<ServiceOrder, 'id' | 'totalTechnicianGross' | 'itemsUsed' | 'kmTotalCost'>) => void;
  updateOrderStatus: (orderId: string, status: ServiceOrder['status']) => void;
  completeServiceOrder: (
    orderId: string,
    data: {
      kmTraveled: number;
      tollCost: number;
      supportCost: number;
      customerSignature: string;
      executionNotes?: string;
      itemsUsed: { stockItemId: string; quantity: number }[];
    }
  ) => void;

  // Stock Management
  adjustStockQuantity: (itemId: string, newQuantity: number, reason: string) => void;
  createStockItem: (item: Omit<StockItem, 'id'>) => void;
  registerStockEntry: (itemId: string, quantityAdded: number, totalCost: number, notes?: string) => void;

  // Technician Management
  updateTechnician: (technicianId: string, updates: Partial<User>) => void;
  createTechnician: (technicianData: Omit<User, 'id'>) => void;
  toggleSpecialTaxRule: (technicianId: string) => void;

  // Financial & Vales
  createFinancialMovement: (movement: Omit<FinancialMovement, 'id' | 'date'>) => void;

  // Navigation
  activeTab: string;
  setActiveTab: (tab: string) => void;

  // Quinzenal Closing
  currentClosing: BiweeklyClosing;
  selectedMonth: number;
  setSelectedMonth: (month: number) => void;
  selectedYear: number;
  setSelectedYear: (year: number) => void;
  selectedPeriod: 1 | 2;
  setSelectedPeriod: (period: 1 | 2) => void;
  recalculateClosing: () => void;

  // PDF & WhatsApp
  generatePdfForTechnician: (summary: TechnicianClosingSummary) => { filename: string; blobUrl: string };
  dispatchWhatsAppStatement: (summary: TechnicianClosingSummary) => Promise<WhatsAppDispatchResult>;
  dispatchAllWhatsAppStatements: () => Promise<void>;

  // CSV
  exportClosingCsv: () => void;
  exportOrdersCsv: () => void;
  exportCashFlowCsv: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEYS = {
  USERS: 'higienizador_users_v2',
  ORDERS: 'higienizador_orders_v2',
  STOCK: 'higienizador_stock_v2',
  MOVEMENTS: 'higienizador_movements_v2',
  SETTINGS: 'higienizador_settings_v2',
  ACTIVE_TAB: 'higienizador_active_tab_v2',
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Navigation activeTab state with persistence
  const [activeTab, setActiveTabState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_TAB);
      if (
        saved &&
        [
          'dashboard',
          'orders',
          'technicians',
          'stock',
          'finance',
          'cashflow',
          'mobile_app',
          'settings',
        ].includes(saved)
      ) {
        return saved;
      }
    } catch {
      // fallback
    }
    return 'dashboard';
  });

  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_TAB, tab);
    } catch {
      // fallback
    }
  };
  // Load from local storage or initial
  const [users, setUsers] = useState<User[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.USERS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      return INITIAL_USERS;
    } catch {
      return INITIAL_USERS;
    }
  });

  const [currentUser, setCurrentUser] = useState<User>(() => (Array.isArray(users) && users.length > 0 ? users[0] : INITIAL_USERS[0]));

  const [orders, setOrders] = useState<ServiceOrder[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.ORDERS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
      return INITIAL_ORDERS;
    } catch {
      return INITIAL_ORDERS;
    }
  });

  const [stock, setStock] = useState<StockItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.STOCK);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
      return INITIAL_STOCK;
    } catch {
      return INITIAL_STOCK;
    }
  });

  const [movements, setMovements] = useState<FinancialMovement[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.MOVEMENTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
      return INITIAL_MOVEMENTS;
    } catch {
      return INITIAL_MOVEMENTS;
    }
  });

  const [settings, setSettings] = useState<GeneralSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return {
            ...INITIAL_SETTINGS,
            ...parsed,
            serviceCategoriesRates: {
              ...INITIAL_SETTINGS.serviceCategoriesRates,
              ...(parsed.serviceCategoriesRates || {}),
            },
          };
        }
      }
      return INITIAL_SETTINGS;
    } catch {
      return INITIAL_SETTINGS;
    }
  });

  const [selectedMonth, setSelectedMonth] = useState<number>(8); // Agosto
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedPeriod, setSelectedPeriod] = useState<1 | 2>(1); // 1ª Quinzena

  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 'notif-1',
      title: 'Fechamento da 1ª Quinzena Disponível',
      message: 'O cálculo preliminar de repasse aos técnicos de Agosto/2026 está pronto para homologação.',
      type: 'info',
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      read: false,
    },
    {
      id: 'notif-2',
      title: 'Estoque Baixo: Suporte de Bico Extratora',
      message: 'Restam apenas 8 unidades no estoque central. Considere efetuar pedido de reposição.',
      type: 'warning',
      timestamp: '14:30',
      read: false,
    },
  ]);

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.STOCK, JSON.stringify(stock));
  }, [stock]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.MOVEMENTS, JSON.stringify(movements));
  }, [movements]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }, [settings]);

  const addToast = (title: string, message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') => {
    const newNotif: NotificationItem = {
      id: `notif-${Date.now()}`,
      title,
      message,
      type,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      read: false,
    };
    setNotifications((prev) => [newNotif, ...prev]);
  };

  const markNotificationRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  const updateSettings = (newSettings: Partial<GeneralSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
    addToast('Configurações Atualizadas', 'As diretrizes do sistema foram salvas com sucesso.', 'success');
  };

  // Quinzenal calculation memo
  const currentClosing = useMemo(() => {
    return FinancialEngine.processBiweeklyClosing(
      users,
      orders,
      movements,
      {
        periodNumber: selectedPeriod,
        referenceMonth: selectedMonth,
        referenceYear: selectedYear,
        kmRateDefault: settings.kmRateDefault,
      },
      currentUser
    );
  }, [users, orders, movements, selectedPeriod, selectedMonth, selectedYear, settings.kmRateDefault, currentUser]);

  const recalculateClosing = () => {
    addToast('Recálculo Efetuado', `Valores atualizados para ${selectedPeriod}ª Quinzena de ${selectedMonth}/${selectedYear}.`, 'info');
  };

  // OS Management
  const createServiceOrder = (orderData: Omit<ServiceOrder, 'id' | 'totalTechnicianGross' | 'itemsUsed' | 'kmTotalCost'>) => {
    const kmRateApplied = orderData.kmRateApplied || settings.kmRateDefault;
    const kmTotalCost = (orderData.kmTraveled || 0) * kmRateApplied;
    const totalTechnicianGross =
      orderData.baseServiceFee + kmTotalCost + (orderData.tollCost || 0) + (orderData.supportCost || 0);

    const newOrder: ServiceOrder = {
      ...orderData,
      id: `os-${Date.now()}`,
      kmRateApplied,
      kmTotalCost,
      totalTechnicianGross,
      itemsUsed: [],
    };

    setOrders((prev) => [newOrder, ...prev]);

    // Lançar previsão de faturamento Porto Seguro
    if (newOrder.faturamentoPorto > 0) {
      setMovements((prev) => [
        {
          id: `mov-faturamento-${newOrder.id}`,
          type: 'INCOME',
          category: 'Faturamento Porto Seguro',
          description: `Chamado ${newOrder.callNumber} - ${newOrder.customerName} (${newOrder.neighborhood})`,
          amount: newOrder.faturamentoPorto,
          status: 'PENDING',
          callNumber: newOrder.callNumber,
          paymentMethod: 'FATURA_PORTO',
          date: new Date().toISOString(),
        },
        ...prev,
      ]);
    }

    addToast(
      'Ordem de Serviço Criada',
      `Chamado Porto Seguro ${newOrder.callNumber} registrado com sucesso para ${newOrder.customerName}.`,
      'success'
    );
  };

  const updateOrderStatus = (orderId: string, status: ServiceOrder['status']) => {
    setOrders((prev) =>
      prev.map((os) => {
        if (os.id === orderId) {
          const startedAt = status === 'IN_PROGRESS' && !os.startedAt ? new Date().toISOString() : os.startedAt;
          return { ...os, status, startedAt };
        }
        return os;
      })
    );
    addToast('Status da OS Atualizado', `A Ordem de Serviço foi movida para: ${status}`, 'info');
  };

  // Finalização de OS pelo App Mobile com abate automático do estoque
  const completeServiceOrder = (
    orderId: string,
    data: {
      kmTraveled: number;
      tollCost: number;
      supportCost: number;
      customerSignature: string;
      executionNotes?: string;
      itemsUsed: { stockItemId: string; quantity: number }[];
    }
  ) => {
    const targetOrder = orders.find((o) => o.id === orderId);
    if (!targetOrder) return;

    const kmTotalCost = Number((data.kmTraveled * targetOrder.kmRateApplied).toFixed(2));
    const totalTechnicianGross = Number(
      (targetOrder.baseServiceFee + kmTotalCost + data.tollCost + data.supportCost).toFixed(2)
    );

    // Preparar lista de insumos com snapshot de custo
    const processedItemsUsed: OSStockItemUsage[] = [];

    // Abatimento de estoque automático
    if (settings.autoStockDeduction && data.itemsUsed.length > 0) {
      setStock((prevStock) => {
        const updatedStock = [...prevStock];
        data.itemsUsed.forEach((itemUsage) => {
          const stockIndex = updatedStock.findIndex((s) => s.id === itemUsage.stockItemId);
          if (stockIndex !== -1) {
            const currentItem = updatedStock[stockIndex];
            const newQty = Math.max(0, currentItem.quantityInStock - itemUsage.quantity);
            updatedStock[stockIndex] = {
              ...currentItem,
              quantityInStock: Number(newQty.toFixed(2)),
            };

            processedItemsUsed.push({
              stockItemId: currentItem.id,
              stockItemName: currentItem.name,
              quantityUsed: itemUsage.quantity,
              unit: currentItem.unit,
              unitCostSnapshot: currentItem.unitCost,
            });
          }
        });
        return updatedStock;
      });
    }

    // Atualizar a Ordem de Serviço
    setOrders((prev) =>
      prev.map((os) => {
        if (os.id === orderId) {
          return {
            ...os,
            status: 'COMPLETED',
            completedAt: new Date().toISOString(),
            kmTraveled: data.kmTraveled,
            kmTotalCost,
            tollCost: data.tollCost,
            supportCost: data.supportCost,
            totalTechnicianGross,
            customerSignature: data.customerSignature,
            executionNotes: data.executionNotes,
            itemsUsed: processedItemsUsed,
          };
        }
        return os;
      })
    );

    // Atualizar movimento financeiro da Porto Seguro para CONFIRMED
    setMovements((prev) =>
      prev.map((m) => {
        if (m.callNumber === targetOrder.callNumber && m.type === 'INCOME') {
          return { ...m, status: 'CONFIRMED' };
        }
        return m;
      })
    );

    addToast(
      'OS Finalizada com Sucesso',
      `Chamado ${targetOrder.callNumber} concluído! Insumos abatidos do estoque e KM/Pedágio creditados.`,
      'success'
    );
  };

  // Estoque
  const adjustStockQuantity = (itemId: string, newQuantity: number, reason: string) => {
    setStock((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, quantityInStock: Math.max(0, newQuantity) } : item))
    );
    addToast('Ajuste de Estoque', `Quantidade alterada (${reason}).`, 'info');
  };

  const createStockItem = (itemData: Omit<StockItem, 'id'>) => {
    const newItem: StockItem = {
      ...itemData,
      id: `stock-${Date.now()}`,
    };
    setStock((prev) => [...prev, newItem]);
    addToast('Novo Item de Estoque', `${newItem.name} foi adicionado ao catálogo.`, 'success');
  };

  const registerStockEntry = (itemId: string, quantityAdded: number, totalCost: number, notes?: string) => {
    setStock((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const newQty = item.quantityInStock + quantityAdded;
          const newUnitCost = quantityAdded > 0 && totalCost > 0 ? Number((totalCost / quantityAdded).toFixed(2)) : item.unitCost;
          return {
            ...item,
            quantityInStock: Number(newQty.toFixed(2)),
            unitCost: newUnitCost || item.unitCost,
          };
        }
        return item;
      })
    );

    if (totalCost > 0) {
      const item = stock.find((s) => s.id === itemId);
      createFinancialMovement({
        type: 'EXPENSE_STOCK',
        category: 'Reposição de Estoque',
        description: `Entrada de ${quantityAdded} ${item?.unit || 'un'} de ${item?.name || 'Insumo'} - ${notes || 'Fornecedor'}`,
        amount: totalCost,
        status: 'CONFIRMED',
        paymentMethod: 'TRANSFERENCIA',
      });
    }

    addToast('Entrada de Estoque', `Reposição de ${quantityAdded} un registrada com sucesso.`, 'success');
  };

  // Técnicos
  const updateTechnician = (technicianId: string, updates: Partial<User>) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === technicianId ? { ...u, ...updates } : u))
    );
    addToast('Técnico Atualizado', 'Dados cadastrais e regras financeiras salvas.', 'success');
  };

  const createTechnician = (technicianData: Omit<User, 'id'>) => {
    const newTech: User = {
      ...technicianData,
      id: `tech-${Date.now()}`,
    };
    setUsers((prev) => [...prev, newTech]);
    addToast('Técnico Cadastrado', `${newTech.name} foi inserido no sistema com sucesso.`, 'success');
  };

  const toggleSpecialTaxRule = (technicianId: string) => {
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id === technicianId) {
          const nextState = !u.hasSpecialTaxRule;
          return {
            ...u,
            hasSpecialTaxRule: nextState,
            specialTaxRate: nextState ? (u.specialTaxRate || settings.defaultSpecialTaxRate || 6.0) : 0,
          };
        }
        return u;
      })
    );
    addToast('Regra Fiscal Alternada', 'A regra especial de 6% foi atualizada para o técnico.', 'info');
  };

  // Financeiro & Vales
  const createFinancialMovement = (movementData: Omit<FinancialMovement, 'id' | 'date'>) => {
    const newMov: FinancialMovement = {
      ...movementData,
      id: `mov-${Date.now()}`,
      date: new Date().toISOString(),
    };
    setMovements((prev) => [newMov, ...prev]);

    if (newMov.type === 'ADVANCE_VALE') {
      addToast(
        'Vale / Adiantamento Lançado',
        `R$ ${newMov.amount.toFixed(2)} registrado para o técnico ${newMov.technicianName}. Será descontado na quinzena.`,
        'warning'
      );
    } else {
      addToast('Movimentação Financeira', `${newMov.category}: R$ ${newMov.amount.toFixed(2)} registrada.`, 'success');
    }
  };

  // PDF
  const generatePdfForTechnician = (summary: TechnicianClosingSummary) => {
    const { doc, filename, blobUrl } = PdfStatementGenerator.generateTechnicianStatementPdf(
      summary,
      currentClosing,
      orders
    );
    doc.save(filename);
    addToast('PDF Gerado', `Extrato quinzenal de ${summary.technicianName} baixado com sucesso.`, 'success');
    return { filename, blobUrl };
  };

  // WhatsApp
  const dispatchWhatsAppStatement = async (summary: TechnicianClosingSummary): Promise<WhatsAppDispatchResult> => {
    const { filename, blobUrl } = PdfStatementGenerator.generateTechnicianStatementPdf(
      summary,
      currentClosing,
      orders
    );

    const result = await WhatsAppService.sendStatementViaWhatsApp(
      summary,
      currentClosing,
      blobUrl,
      filename,
      settings
    );

    // Atualizar status no resumo
    summary.whatsappDispatched = true;
    summary.whatsappDispatchedAt = result.dispatchedAt;
    summary.whatsappStatus = 'DELIVERED';
    summary.whatsappMessageId = result.messageId;

    addToast(
      'Disparo WhatsApp Concluído',
      `Extrato em PDF enviado via Evolution API para ${summary.technicianName} (${summary.technicianPhone}).`,
      'success'
    );

    return result;
  };

  const dispatchAllWhatsAppStatements = async () => {
    const activeSummaries = currentClosing.technicianSummaries.filter((s) => s.osCount > 0 || s.netTotal > 0);
    for (const summary of activeSummaries) {
      await dispatchWhatsAppStatement(summary);
    }
    addToast(
      'Disparo em Lote Finalizado',
      `Todos os ${activeSummaries.length} extratos quinzenais foram disparados aos respectivos técnicos.`,
      'success'
    );
  };

  // CSV Exports
  const exportClosingCsv = () => {
    CsvExportService.exportBiweeklyClosingCsv(currentClosing);
    addToast('Exportação CSV', 'Relatório quinzenal exportado para a diretoria.', 'success');
  };

  const exportOrdersCsv = () => {
    CsvExportService.exportServiceOrdersCsv(orders);
    addToast('Exportação CSV', 'Relatório de OS Porto Seguro exportado com sucesso.', 'success');
  };

  const exportCashFlowCsv = () => {
    CsvExportService.exportFinancialMovementsCsv(movements);
    addToast('Exportação CSV', 'Fluxo de Caixa exportado com sucesso.', 'success');
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        users,
        setUsers,
        orders,
        stock,
        movements,
        settings,
        updateSettings,
        notifications,
        markNotificationRead,
        clearNotifications,
        addToast,
        createServiceOrder,
        updateOrderStatus,
        completeServiceOrder,
        adjustStockQuantity,
        createStockItem,
        registerStockEntry,
        updateTechnician,
        createTechnician,
        toggleSpecialTaxRule,
        createFinancialMovement,
        activeTab,
        setActiveTab,
        currentClosing,
        selectedMonth,
        setSelectedMonth,
        selectedYear,
        setSelectedYear,
        selectedPeriod,
        setSelectedPeriod,
        recalculateClosing,
        generatePdfForTechnician,
        dispatchWhatsAppStatement,
        dispatchAllWhatsAppStatements,
        exportClosingCsv,
        exportOrdersCsv,
        exportCashFlowCsv,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
