import { User, ServiceOrder, StockItem, FinancialMovement } from '../types';

export const ApiService = {
  // Check Database & Backend Status
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
      const res = await fetch('/api/db/status');
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
        headers: { 'Content-Type': 'application/json' },
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

  // USERS / TECHNICIANS
  async fetchUsers(): Promise<User[] | null> {
    try {
      const res = await fetch('/api/users');
      if (!res.ok) return null;
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { success: false, error: `HTTP ${res.status}: ${text}` };
      }
      const json = await res.json();
      return { success: Boolean(json.success), error: json.error };
    } catch (err: any) {
      console.warn('[ApiService] Falha ao enviar usuário para o backend MariaDB:', err);
      return { success: false, error: err.message };
    }
  },

  async deleteUser(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { success: false, error: `HTTP ${res.status}: ${text}` };
      }
      const json = await res.json();
      return { success: Boolean(json.success), error: json.error };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  // SERVICE ORDERS
  async fetchOrders(): Promise<ServiceOrder[] | null> {
    try {
      const res = await fetch('/api/orders');
      if (!res.ok) return null;
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        return json.data;
      }
      return null;
    } catch {
      return null;
    }
  },

  async saveOrder(order: ServiceOrder): Promise<boolean> {
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order),
      });
      const json = await res.json();
      return Boolean(json.success);
    } catch {
      return false;
    }
  },

  // STOCK ITEMS
  async fetchStock(): Promise<StockItem[] | null> {
    try {
      const res = await fetch('/api/stock');
      if (!res.ok) return null;
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        return json.data;
      }
      return null;
    } catch {
      return null;
    }
  },

  async saveStockItem(item: StockItem): Promise<boolean> {
    try {
      const res = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      const json = await res.json();
      return Boolean(json.success);
    } catch {
      return false;
    }
  },

  // FINANCIAL MOVEMENTS
  async fetchMovements(): Promise<FinancialMovement[] | null> {
    try {
      const res = await fetch('/api/movements');
      if (!res.ok) return null;
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        return json.data;
      }
      return null;
    } catch {
      return null;
    }
  },

  async saveMovement(movement: FinancialMovement): Promise<boolean> {
    try {
      const res = await fetch('/api/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(movement),
      });
      const json = await res.json();
      return Boolean(json.success);
    } catch {
      return false;
    }
  },

  // DATABASE DIAGNOSTICS & LIVE LOGS
  async getDbLogs(): Promise<Array<{ id: string; timestamp: string; level: 'INFO' | 'WARN' | 'ERROR'; message: string; query?: string; details?: any }>> {
    try {
      const res = await fetch('/api/db/logs');
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
      const res = await fetch('/api/db/diagnostics');
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
      const res = await fetch('/api/db/sync-schema', { method: 'POST' });
      return await res.json();
    } catch (err: any) {
      return { success: false, message: err.message, added: [], skipped: [], errors: [err.message] };
    }
  },
};
