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
      if (!res.ok) throw new Error('Status endpoint returned non-200');
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

  async saveUser(user: User): Promise<boolean> {
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      });
      const json = await res.json();
      return Boolean(json.success);
    } catch (err) {
      console.warn('[ApiService] Falha ao enviar usuário para o backend MariaDB:', err);
      return false;
    }
  },

  async deleteUser(userId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      const json = await res.json();
      return Boolean(json.success);
    } catch {
      return false;
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
};
