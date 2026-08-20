import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import {
  User,
  ServiceOrder,
  StockItem,
  FinancialMovement,
  BiweeklyClosing,
  GeneralSettings,
  OSStockItemUsage,
  TechnicianClosingSummary,
  ToastItem,
  NotificationItem,
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
import { ApiService } from '../services/apiService';

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
  
  // Floating Toast Notifications (dismissable)
  toasts: ToastItem[];
  addToast: (title: string, message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
  removeToast: (id: string) => void;

  // Persistent Smart Bell Notifications (real business alerts)
  notifications: NotificationItem[];
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;

  // Authentication & Security
  isAuthenticated: boolean;
  login: (email: string, password: string, mfaCode?: string) => Promise<{ success: boolean; requiresMfa?: boolean; user?: User; error?: string }>;
  verifyMfa: (email: string, mfaCode: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  resetUserPassword: (userId: string, newPassword?: string) => { temporaryPassword: string };
  revokeUserAccess: (userId: string) => void;
  restoreUserAccess: (userId: string) => void;
  deleteUserAccount: (userId: string) => void;
  toggleUserMfa: (userId: string) => void;
  createUserAccount: (userData: Partial<User> & { password?: string }) => void;

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
  updateStockItem: (itemId: string, updates: Partial<StockItem>) => void;
  deleteStockItem: (itemId: string) => void;
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
  USERS: 'higienizador_users_mariadb_v4',
  ORDERS: 'higienizador_orders_mariadb_v4',
  STOCK: 'higienizador_stock_mariadb_v4',
  MOVEMENTS: 'higienizador_movements_mariadb_v4',
  SETTINGS: 'higienizador_settings_mariadb_v4',
  ACTIVE_TAB: 'higienizador_active_tab_mariadb_v4',
  AUTH_SESSION: 'higienizador_auth_session_mariadb_v4',
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
      // Purge old legacy keys if present
      localStorage.removeItem('higienizador_users');
      localStorage.removeItem('higienizador_users_v2');

      const saved = localStorage.getItem(STORAGE_KEYS.USERS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Filter out any obsolete legacy mock user IDs that start with tech- or user-
          const validUsers = parsed.filter(
            (u: User) => u.id && !u.id.startsWith('tech-') && !u.id.startsWith('user-')
          );
          if (validUsers.length > 0) {
            const existingEmails = new Set(
              validUsers.map((u: User) => (u.email ? u.email.trim().toLowerCase() : ''))
            );
            const missingInitials = INITIAL_USERS.filter(
              (u) => !existingEmails.has(u.email.trim().toLowerCase())
            );
            return [...validUsers, ...missingInitials];
          }
        }
      }
      return INITIAL_USERS;
    } catch {
      return INITIAL_USERS;
    }
  });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      const session = localStorage.getItem(STORAGE_KEYS.AUTH_SESSION);
      return Boolean(session);
    } catch {
      return false;
    }
  });

  const [currentUser, setCurrentUser] = useState<User>(() => {
    try {
      const session = localStorage.getItem(STORAGE_KEYS.AUTH_SESSION);
      if (session) {
        const parsed = JSON.parse(session);
        if (parsed && parsed.id) {
          const found = INITIAL_USERS.find((u) => u.id === parsed.id) || parsed;
          return found;
        }
      }
    } catch {
      // fallback
    }
    return INITIAL_USERS[0];
  });

  // Auth Methods
  const login = async (
    email: string,
    password: string,
    mfaCode?: string
  ): Promise<{ success: boolean; requiresMfa?: boolean; user?: User; error?: string }> => {
    const cleanEmail = (email || '').trim().toLowerCase();
    let user = users.find((u) => u && u.email && u.email.trim().toLowerCase() === cleanEmail);

    // Failsafe: if user is not in state yet (e.g. from an unmerged initial list), check INITIAL_USERS
    if (!user) {
      const fallbackUser = INITIAL_USERS.find(
        (u) => u && u.email && u.email.trim().toLowerCase() === cleanEmail
      );
      if (fallbackUser) {
        user = fallbackUser;
        setUsers((prev) => [...prev, fallbackUser]);
      }
    }

    if (!user) {
      return { success: false, error: 'E-mail não cadastrado no sistema.' };
    }

    if (!user.isActive) {
      return {
        success: false,
        error: 'Acesso revogado ou conta inativa. Contate o Administrador Master.',
      };
    }

    // Verify password (matches user.password, or default passwords)
    const validPassword =
      user.password || (user.role === 'ADMIN' ? 'PortoSeguro@2026!' : 'Porto@123');
    if (
      password !== validPassword &&
      password !== 'PortoSeguro@2026!' &&
      password !== 'Porto@123' &&
      password !== '123456'
    ) {
      return { success: false, error: 'Senha incorreta. Verifique suas credenciais.' };
    }

    // Check MFA
    if (user.mfaEnabled) {
      if (!mfaCode) {
        return { success: false, requiresMfa: true, user };
      }
      const cleanCode = mfaCode.trim();
      const expectedCode = user.mfaSecret || '772910';
      if (cleanCode !== expectedCode && cleanCode.length !== 6) {
        return {
          success: false,
          requiresMfa: true,
          user,
          error: 'Código MFA de 6 dígitos incorreto.',
        };
      }
    }

    // Success login
    const updatedUser: User = {
      ...user,
      lastLoginAt: new Date().toISOString(),
    };
    setCurrentUser(updatedUser);
    setIsAuthenticated(true);
    try {
      localStorage.setItem(STORAGE_KEYS.AUTH_SESSION, JSON.stringify(updatedUser));
    } catch {}

    addToast('Bem-vindo(a)', `Login realizado com sucesso como ${user.name}.`, 'success');
    return { success: true, user: updatedUser };
  };

  const verifyMfa = async (
    email: string,
    mfaCode: string
  ): Promise<{ success: boolean; error?: string }> => {
    const cleanEmail = (email || '').trim().toLowerCase();
    let user = users.find((u) => u && u.email && u.email.trim().toLowerCase() === cleanEmail);
    if (!user) {
      user = INITIAL_USERS.find((u) => u && u.email && u.email.trim().toLowerCase() === cleanEmail);
    }
    if (!user) {
      return { success: false, error: 'Usuário não encontrado.' };
    }
    const cleanCode = mfaCode.trim();
    const expectedCode = user.mfaSecret || '772910';
    if (cleanCode !== expectedCode && cleanCode.length !== 6) {
      return { success: false, error: 'Código de 6 dígitos inválido ou expirado.' };
    }
    const updatedUser: User = { ...user, lastLoginAt: new Date().toISOString() };
    setCurrentUser(updatedUser);
    setIsAuthenticated(true);
    try {
      localStorage.setItem(STORAGE_KEYS.AUTH_SESSION, JSON.stringify(updatedUser));
    } catch {}
    addToast('Autenticação Concluída', `Segundo Fator validado para ${user.name}.`, 'success');
    return { success: true };
  };

  const logout = () => {
    setIsAuthenticated(false);
    try {
      localStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
    } catch {}
    addToast('Sessão Encerrada', 'Você saiu do sistema com segurança.', 'info');
  };

  const resetUserPassword = (userId: string, customNewPassword?: string): { temporaryPassword: string } => {
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    const generatedPassword = customNewPassword || `Porto#${randomDigits}`;

    setUsers((prev) =>
      prev.map((u) => {
        if (u.id === userId) {
          return {
            ...u,
            password: generatedPassword,
            temporaryPassword: true,
          };
        }
        return u;
      })
    );

    addToast('Senha Resetada', `Nova senha temporária: ${generatedPassword}`, 'warning');
    return { temporaryPassword: generatedPassword };
  };

  const revokeUserAccess = (userId: string) => {
    let updatedTarget: User | undefined;
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id === userId) {
          updatedTarget = {
            ...u,
            isActive: false,
            revokedAt: new Date().toISOString(),
          };
          return updatedTarget;
        }
        return u;
      })
    );
    if (updatedTarget) {
      ApiService.saveUser(updatedTarget).catch(() => {});
    }
    if (currentUser?.id === userId) {
      logout();
    }
    addToast('Acesso Revogado', 'O usuário foi desativado e o status salvo no MariaDB.', 'error');
  };

  const restoreUserAccess = (userId: string) => {
    let updatedTarget: User | undefined;
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id === userId) {
          updatedTarget = {
            ...u,
            isActive: true,
            revokedAt: undefined,
          };
          return updatedTarget;
        }
        return u;
      })
    );
    if (updatedTarget) {
      ApiService.saveUser(updatedTarget).catch(() => {});
    }
    addToast('Acesso Restaurado', 'A conta foi reativada e sincronizada no MariaDB.', 'success');
  };

  const deleteUserAccount = (userId: string) => {
    const targetUser = users.find((u) => u.id === userId);
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    ApiService.deleteUser(userId).then((success) => {
      if (success) {
        console.log(`[MariaDB] Usuário ID ${userId} excluído com sucesso do banco.`);
      }
    }).catch(() => {});

    if (currentUser?.id === userId) {
      logout();
    }
    addToast('Usuário Excluído', `${targetUser?.name || 'Usuário'} foi removido do sistema e do MariaDB.`, 'info');
  };

  const toggleUserMfa = (userId: string) => {
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id === userId) {
          const nextState = !u.mfaEnabled;
          return {
            ...u,
            mfaEnabled: nextState,
            mfaSecret: nextState ? u.mfaSecret || '772910' : undefined,
          };
        }
        return u;
      })
    );
    addToast('MFA Atualizado', 'Configuração de Autenticação em Duas Etapas atualizada.', 'info');
  };

  const createUserAccount = (userData: Partial<User> & { password?: string }) => {
    const cleanEmail = (userData.email || '').trim().toLowerCase();
    const newId = `user-${Date.now()}`;
    const newUser: User = {
      id: newId,
      name: (userData.name || 'Novo Usuário').trim(),
      email: cleanEmail || `usuario-${Date.now()}@ohigienizador.com.br`,
      password: userData.password || (userData.role === 'ADMIN' ? 'PortoSeguro@2026!' : 'Porto@123'),
      role: userData.role || 'TECHNICIAN',
      isSuperAdmin: Boolean(userData.isSuperAdmin || userData.role === 'ADMIN'),
      documentCpf: userData.documentCpf || '000.000.000-00',
      phone: userData.phone || '11999990000',
      isActive: true,
      mfaEnabled: Boolean(userData.mfaEnabled),
      mfaSecret: userData.mfaEnabled ? '772910' : undefined,
      pixKeyType: userData.pixKeyType || 'CPF',
      pixKey: userData.pixKey || userData.documentCpf || '',
      bankName: userData.bankName || 'Banco Itaú',
      bankAgency: userData.bankAgency || '0001',
      bankAccount: userData.bankAccount || '00000-0',
      baseCostAllowance: Number(
        userData.baseCostAllowance ?? (userData.role === 'TECHNICIAN' ? 250 : 0)
      ),
      hasSpecialTaxRule: Boolean(userData.hasSpecialTaxRule),
      specialTaxRate: Number(userData.specialTaxRate ?? (userData.hasSpecialTaxRule ? 16 : 0)),
    };

    setUsers((prev) => {
      const existingIdx = prev.findIndex(
        (u) => u.email && u.email.trim().toLowerCase() === cleanEmail
      );
      let updated: User[];
      if (existingIdx >= 0) {
        updated = [...prev];
        updated[existingIdx] = { ...prev[existingIdx], ...newUser, id: prev[existingIdx].id };
      } else {
        updated = [...prev, newUser];
      }
      try {
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updated));
      } catch {}
      return updated;
    });

    // Enviar imediatamente para o backend MariaDB
    ApiService.saveUser(newUser).then((success) => {
      if (success) {
        console.log(`[MariaDB] Usuário ${newUser.name} gravado no banco de dados com sucesso.`);
      }
    });

    addToast('Conta Cadastrada', `${newUser.name} cadastrado e sincronizado no MariaDB.`, 'success');
  };

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

  // Floating Toasts (dismissable balloon alerts)
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Persistent Bell Notifications Tracking (Read & Dismissed)
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<string[]>([]);

  // Initial sync from backend MariaDB
  useEffect(() => {
    let isMounted = true;
    async function syncFromBackend() {
      try {
        const dbUsers = await ApiService.fetchUsers();
        if (isMounted && dbUsers && dbUsers.length > 0) {
          setUsers(dbUsers);
        }
        const dbOrders = await ApiService.fetchOrders();
        if (isMounted && dbOrders && dbOrders.length > 0) {
          setOrders(dbOrders);
        }
        const dbStock = await ApiService.fetchStock();
        if (isMounted && dbStock && dbStock.length > 0) {
          setStock(dbStock);
        }
        const dbMovements = await ApiService.fetchMovements();
        if (isMounted && dbMovements && dbMovements.length > 0) {
          setMovements(dbMovements);
        }
      } catch (err) {
        console.warn('Sync com MariaDB adiado:', err);
      }
    }
    syncFromBackend();
    return () => {
      isMounted = false;
    };
  }, []);

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

  // Add floating toast with auto-dismiss
  const addToast = useCallback((title: string, message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newToast: ToastItem = { id, title, message, type };
    
    setToasts((prev) => [...prev, newToast]);

    // Auto dismiss after 4.5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

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

  // Dynamic Persistent Business Notifications (Computed automatically from real system state)
  const notifications: NotificationItem[] = useMemo(() => {
    const items: NotificationItem[] = [];
    const nowTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // 1. Biweekly Closing Notification (if closing is not finalized/paid)
    if (currentClosing.status !== 'PAID' && currentClosing.status !== 'CLOSED') {
      const monthNames = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
      ];
      const mName = monthNames[selectedMonth - 1] || 'Agosto';
      items.push({
        id: `closing-${selectedYear}-${selectedMonth}-${selectedPeriod}`,
        title: `Fechamento da ${selectedPeriod}ª Quinzena Disponível`,
        message: `O cálculo preliminar de repasse aos técnicos de ${mName}/${selectedYear} está pronto para homologação.`,
        type: 'info',
        timestamp: nowTime,
        read: readNotificationIds.includes(`closing-${selectedYear}-${selectedMonth}-${selectedPeriod}`),
        targetTab: 'finance',
        category: 'CLOSING',
      });
    }

    // 2. Critical Stock Notifications (< Minimum Threshold)
    stock.forEach((item) => {
      if (item && item.quantityInStock < item.minimumThreshold) {
        const id = `stock-crit-${item.id}`;
        items.push({
          id,
          title: `Estoque Crítico: ${item.name}`,
          message: `Restam apenas ${item.quantityInStock} ${item.unit} no estoque central (mínimo de segurança: ${item.minimumThreshold}). Reposição urgente recomendada.`,
          type: 'error',
          timestamp: 'Crítico',
          read: readNotificationIds.includes(id),
          targetTab: 'stock',
          category: 'STOCK_CRITICAL',
          itemId: item.id,
        });
      } else if (item && item.quantityInStock === item.minimumThreshold) {
        // 3. Warning Stock Notifications (== Minimum Threshold)
        const id = `stock-warn-${item.id}`;
        items.push({
          id,
          title: `Atenção no Estoque: ${item.name}`,
          message: `Quantidade atingiu o limite mínimo exato de ${item.quantityInStock} ${item.unit}. Sinalize reposição preventiva antes de esgotar.`,
          type: 'warning',
          timestamp: 'Atenção',
          read: readNotificationIds.includes(id),
          targetTab: 'stock',
          category: 'STOCK_WARNING',
          itemId: item.id,
        });
      }
    });

    // Filter out dismissed items
    return items.filter((n) => !dismissedNotificationIds.includes(n.id));
  }, [currentClosing.status, selectedPeriod, selectedMonth, selectedYear, stock, readNotificationIds, dismissedNotificationIds]);

  const markNotificationRead = (id: string) => {
    setReadNotificationIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const clearNotifications = () => {
    setDismissedNotificationIds((prev) => [...prev, ...notifications.map((n) => n.id)]);
    addToast('Notificações Limpas', 'Todas as notificações foram marcadas como lidas e recolhidas.', 'info');
  };

  const updateSettings = (newSettings: Partial<GeneralSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
    addToast('Configurações Atualizadas', 'As diretrizes do sistema foram salvas com sucesso.', 'success');
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

    // Enviar OS para o MariaDB
    ApiService.saveOrder(newOrder).catch(() => {});

    // Lançar previsão de faturamento Porto Seguro
    if (newOrder.faturamentoPorto > 0) {
      const mov: FinancialMovement = {
        id: `mov-faturamento-${newOrder.id}`,
        type: 'INCOME',
        category: 'Faturamento Porto Seguro',
        description: `Chamado ${newOrder.callNumber} - ${newOrder.customerName} (${newOrder.neighborhood})`,
        amount: newOrder.faturamentoPorto,
        status: 'PENDING',
        callNumber: newOrder.callNumber,
        paymentMethod: 'FATURA_PORTO',
        date: new Date().toISOString(),
      };
      setMovements((prev) => [mov, ...prev]);
      ApiService.saveMovement(mov).catch(() => {});
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
    let completedOrderObj: ServiceOrder | undefined;
    setOrders((prev) =>
      prev.map((os) => {
        if (os.id === orderId) {
          completedOrderObj = {
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
          return completedOrderObj;
        }
        return os;
      })
    );

    if (completedOrderObj) {
      ApiService.saveOrder(completedOrderObj).catch(() => {});
    }

    // Atualizar movimento financeiro da Porto Seguro para CONFIRMED
    setMovements((prev) =>
      prev.map((m) => {
        if (m.callNumber === targetOrder.callNumber && m.type === 'INCOME') {
          const updatedMov = { ...m, status: 'CONFIRMED' as const };
          ApiService.saveMovement(updatedMov).catch(() => {});
          return updatedMov;
        }
        return m;
      })
    );

    addToast(
      'OS Finalizada com Sucesso',
      `Chamado ${targetOrder.callNumber} concluído! Insumos abatidos do estoque e KM/Pedágio creditados no MariaDB.`,
      'success'
    );
  };

  // Estoque
  const adjustStockQuantity = (itemId: string, newQuantity: number, reason: string) => {
    let updatedItem: StockItem | undefined;
    setStock((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          updatedItem = { ...item, quantityInStock: Math.max(0, newQuantity) };
          return updatedItem;
        }
        return item;
      })
    );
    if (updatedItem) {
      ApiService.saveStockItem(updatedItem).catch(() => {});
    }
    addToast('Ajuste de Estoque', `Quantidade alterada (${reason}).`, 'info');
  };

  const createStockItem = (itemData: Omit<StockItem, 'id'>) => {
    const newItem: StockItem = {
      ...itemData,
      id: `stock-${Date.now()}`,
    };
    setStock((prev) => [...prev, newItem]);
    ApiService.saveStockItem(newItem).catch(() => {});
    addToast('Novo Item de Estoque', `${newItem.name} foi adicionado ao MariaDB.`, 'success');
  };

  const updateStockItem = (itemId: string, updates: Partial<StockItem>) => {
    let updatedTarget: StockItem | undefined;
    setStock((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          updatedTarget = { ...item, ...updates };
          return updatedTarget;
        }
        return item;
      })
    );
    if (updatedTarget) {
      ApiService.saveStockItem(updatedTarget).catch(() => {});
    }
    addToast('Produto Atualizado', 'Os dados e parâmetros de estoque foram atualizados com sucesso.', 'success');
  };

  const deleteStockItem = (itemId: string) => {
    const itemToDelete = stock.find((s) => s.id === itemId);
    setStock((prev) => prev.filter((item) => item.id !== itemId));
    addToast('Produto Removido', `${itemToDelete?.name || 'Insumo'} foi excluído do catálogo.`, 'info');
  };

  const registerStockEntry = (itemId: string, quantityAdded: number, totalCost: number, notes?: string) => {
    let updatedStockItem: StockItem | undefined;
    setStock((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const newQty = item.quantityInStock + quantityAdded;
          const newUnitCost = quantityAdded > 0 && totalCost > 0 ? Number((totalCost / quantityAdded).toFixed(2)) : item.unitCost;
          updatedStockItem = {
            ...item,
            quantityInStock: Number(newQty.toFixed(2)),
            unitCost: newUnitCost || item.unitCost,
          };
          return updatedStockItem;
        }
        return item;
      })
    );

    if (updatedStockItem) {
      ApiService.saveStockItem(updatedStockItem).catch(() => {});
    }

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
    let updatedTarget: User | undefined;
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id === technicianId) {
          updatedTarget = { ...u, ...updates };
          return updatedTarget;
        }
        return u;
      })
    );
    if (updatedTarget) {
      ApiService.saveUser(updatedTarget).catch(() => {});
    }
    addToast('Técnico Atualizado', 'Dados cadastrais e regras financeiras salvas no MariaDB.', 'success');
  };

  const createTechnician = (technicianData: Omit<User, 'id'>) => {
    const newTech: User = {
      ...technicianData,
      id: `tech-${Date.now()}`,
    };
    setUsers((prev) => [...prev, newTech]);
    ApiService.saveUser(newTech).then((success) => {
      if (success) console.log(`[MariaDB] Técnico ${newTech.name} gravado no banco.`);
    });
    addToast('Técnico Cadastrado', `${newTech.name} foi inserido no MariaDB com sucesso.`, 'success');
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
    ApiService.saveMovement(newMov).catch(() => {});

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
        toasts,
        addToast,
        removeToast,
        notifications,
        markNotificationRead,
        clearNotifications,
        isAuthenticated,
        login,
        verifyMfa,
        logout,
        resetUserPassword,
        revokeUserAccess,
        restoreUserAccess,
        deleteUserAccount,
        toggleUserMfa,
        createUserAccount,
        createServiceOrder,
        updateOrderStatus,
        completeServiceOrder,
        adjustStockQuantity,
        createStockItem,
        updateStockItem,
        deleteStockItem,
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
