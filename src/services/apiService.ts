import { User, ServiceOrder, StockItem, FinancialMovement, AuditLog, AuditAction, AppModule, AuditResult } from '../types';

let currentAuthUserId: string | null = null;

export const setApiAuthUserId = (userId: string | null) => {
  currentAuthUserId = userId;
};

const getHeaders = (extraHeaders?: Record<string, string>): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extraHeaders || {}),
  };
  if (currentAuthUserId) {
    headers['x-user-id'] = currentAuthUserId;
  }
  return headers;
};

export const ApiService = {
  setAuthUser(userId: string | null) {
    setApiAuthUserId(userId);
  },

  // ==========================================
  // AUTHENTICATION
  // ==========================================
  async login(email: string, password: string): Promise<{ success: boolean; user?: User; requiresMfa?: boolean; error?: string }> {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Falha ao autenticar.' };
      }
      if (data.user?.id) {
        setApiAuthUserId(data.user.id);
      }
      return data;
    } catch (err: any) {
      return { success: false, error: err.message || 'Falha na comunicação com o servidor de autenticação.' };
    }
  },

  async verifyMfa(email: string, code: string): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const res = await fetch('/api/auth/verify-mfa', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Código MFA inválido.' };
      }
      if (data.user?.id) {
        setApiAuthUserId(data.user.id);
      }
      return data;
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao validar código MFA.' };
    }
  },

  async logout(): Promise<void> {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: getHeaders(),
      });
    } catch {
      // ignore
    } finally {
      setApiAuthUserId(null);
    }
  },

  // ==========================================
  // AUDIT LOGS
  // ==========================================
  async fetchAuditLogs(filters?: {
    module?: string;
    action?: string;
    result?: string;
    search?: string;
    userId?: string;
  }): Promise<AuditLog[]> {
    try {
      const params = new URLSearchParams();
      if (filters?.module) params.set('module', filters.module);
      if (filters?.action) params.set('action', filters.action);
      if (filters?.result) params.set('result', filters.result);
      if (filters?.search) params.set('search', filters.search);
      if (filters?.userId) params.set('userId', filters.userId);

      const res = await fetch(`/api/audit-logs?${params.toString()}`, {
        headers: getHeaders(),
      });
      if (!res.ok) return [];
      const json = await res.json();
      return json.success && Array.isArray(json.data) ? json.data : [];
    } catch {
      return [];
    }
  },

  async recordAuditLog(payload: {
    module: AppModule;
    action: AuditAction;
    affectedRecordId?: string;
    affectedRecordType?: string;
    oldValue?: any;
    newValue?: any;
    result?: AuditResult;
    details?: string;
  }): Promise<boolean> {
    try {
      const res = await fetch('/api/audit-logs', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      return Boolean(json.success);
    } catch {
      return false;
    }
  },

  // ==========================================
  // DATABASE STATUS
  // ==========================================
  async getDbStatus(): Promise<{
    connected: boolean;
    host: string;
    port: number;
    database: string;
    latencyMs: number;
    tableCounts?: Record<string, number>;
    error?: string;
  }> {
    try {
      const res = await fetch('/api/db/status', { headers: getHeaders() });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Endpoint retornou status ${res.status}: ${text.slice(0, 100)}`);
      }
      return await res.json();
    } catch (err: any) {
      return {
        connected: false,
        host: '192.168.15.246',
        port: 3306,
        database: 'higienizador_db',
        latencyMs: 0,
        error: err.message,
      };
    }
  },

  async testDb(config?: {
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
  }): Promise<{
    connected: boolean;
    host: string;
    port: number;
    database: string;
    latencyMs: number;
    error?: string;
  }> {
    try {
      const res = await fetch('/api/db/test', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(config || {}),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Servidor retornou HTTP ${res.status}: ${text.slice(0, 150)}`);
      }
      return await res.json();
    } catch (err: any) {
      return {
        connected: false,
        host: config?.host || '192.168.15.246',
        port: config?.port || 3306,
        database: config?.database || 'higienizador_db',
        latencyMs: 0,
        error: err.message,
      };
    }
  },

  // ==========================================
  // USERS / TECHNICIANS
  // ==========================================
  async fetchUsers(): Promise<User[] | null> {
    try {
      const res = await fetch('/api/users', { headers: getHeaders() });
      if (!res.ok) return null;
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        return json.data;
      }
      return null;
    } catch {
      return null;
    }
  },

  async saveUser(user: User): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(user),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, error: json.error || `HTTP ${res.status}` };
      }
      return { success: Boolean(json.success), error: json.error };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async updateUser(userId: string, updates: Partial<User>): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(updates),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, error: json.error || `HTTP ${res.status}` };
      }
      return { success: Boolean(json.success), error: json.error };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async deleteUser(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, error: json.error || `HTTP ${res.status}` };
      }
      return { success: Boolean(json.success), error: json.error };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  // ==========================================
  // SERVICE ORDERS
  // ==========================================
  async fetchOrders(): Promise<ServiceOrder[] | null> {
    try {
      const res = await fetch('/api/orders', { headers: getHeaders() });
      if (!res.ok) return null;
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        return json.data;
      }
      return null;
    } catch {
      return null;
    }
  },

  async saveOrder(order: ServiceOrder): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(order),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, error: json.error || `HTTP ${res.status}` };
      }
      return { success: Boolean(json.success), error: json.error };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async deleteOrder(orderId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, error: json.error || `HTTP ${res.status}` };
      }
      return { success: Boolean(json.success), error: json.error };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  // ==========================================
  // STOCK ITEMS
  // ==========================================
  async fetchStock(): Promise<StockItem[] | null> {
    try {
      const res = await fetch('/api/stock', { headers: getHeaders() });
      if (!res.ok) return null;
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        return json.data;
      }
      return null;
    } catch {
      return null;
    }
  },

  async saveStockItem(item: StockItem): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch('/api/stock', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(item),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, error: json.error || `HTTP ${res.status}` };
      }
      return { success: Boolean(json.success), error: json.error };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async deleteStockItem(itemId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/stock/${itemId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, error: json.error || `HTTP ${res.status}` };
      }
      return { success: Boolean(json.success), error: json.error };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  // ==========================================
  // FINANCIAL MOVEMENTS
  // ==========================================
  async fetchMovements(): Promise<FinancialMovement[] | null> {
    try {
      const res = await fetch('/api/movements', { headers: getHeaders() });
      if (!res.ok) return null;
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        return json.data;
      }
      return null;
    } catch {
      return null;
    }
  },

  async saveMovement(movement: FinancialMovement): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch('/api/movements', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(movement),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, error: json.error || `HTTP ${res.status}` };
      }
      return { success: Boolean(json.success), error: json.error };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async deleteMovement(movementId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/movements/${movementId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, error: json.error || `HTTP ${res.status}` };
      }
      return { success: Boolean(json.success), error: json.error };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  // ==========================================
  // GENERAL SETTINGS
  // ==========================================
  async fetchSettings(): Promise<any | null> {
    try {
      const res = await fetch('/api/settings', { headers: getHeaders() });
      if (!res.ok) return null;
      const json = await res.json();
      return json.success ? json.data : null;
    } catch {
      return null;
    }
  },

  async saveSettings(settings: any): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(settings),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, error: json.error || `HTTP ${res.status}` };
      }
      return { success: Boolean(json.success), error: json.error };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  // ==========================================
  // DATABASE DIAGNOSTICS & LOGS
  // ==========================================
  async getDbLogs(): Promise<Array<{ id: string; timestamp: string; level: 'INFO' | 'WARN' | 'ERROR'; message: string; query?: string; details?: any }>> {
    try {
      const res = await fetch('/api/db/logs', { headers: getHeaders() });
      if (!res.ok) return [];
      const json = await res.json();
      return json.logs || [];
    } catch {
      return [];
    }
  },

  async getDbDiagnostics(): Promise<{
    success: boolean;
    tables: string[];
    schema: Record<string, any[]>;
    logs: any[];
    error?: string;
  }> {
    try {
      const res = await fetch('/api/db/diagnostics', { headers: getHeaders() });
      return await res.json();
    } catch (err: any) {
      return { success: false, tables: [], schema: {}, logs: [], error: err.message };
    }
  },

  async syncDbSchema(): Promise<{
    success: boolean;
    message: string;
    added: string[];
    skipped: string[];
    errors: string[];
  }> {
    try {
      const res = await fetch('/api/db/sync-schema', {
        method: 'POST',
        headers: getHeaders(),
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, message: err.message, added: [], skipped: [], errors: [err.message] };
    }
  },

  // ==========================================
  // MASS IMPORT (SPREADSHEET / EXCEL)
  // ==========================================
  async importOrdersSpreadsheet(file: File): Promise<{
    success: boolean;
    message?: string;
    importedCount?: number;
    techniciansCreated?: number;
    ignoredRowsCount?: number;
    createdTechnicians?: Array<{ id: string; name: string; email: string }>;
    sampleOrders?: any[];
    error?: string;
  }> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const headers: Record<string, string> = {};
      if (currentAuthUserId) {
        headers['x-user-id'] = currentAuthUserId;
      }

      const res = await fetch('/api/import/orders', {
        method: 'POST',
        headers,
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        return {
          success: false,
          error: json.error || `Erro ao importar arquivo (Status ${res.status})`,
        };
      }
      return json;
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Falha de comunicação durante a importação da planilha.',
      };
    }
  },
};
