
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { suspendedOrdersService } from './services/suspendedOrdersService';

export interface SuspendedOrder {
  id: string;
  items: any[];
  customer: any;
  time: string;
}

export interface POSState {
  suspendedOrders: SuspendedOrder[];
  suspendCurrentOrder: (items: any[], customer: any) => void;
  suspendToCloud: (items: any[], customer: any, companyId: string, branchId: string | null, userId: string) => Promise<void>;
  resumeOrder: (id: string) => SuspendedOrder | undefined;
  resumeFromCloud: (companyId: string, userId: string) => Promise<SuspendedOrder[]>;
  removeSuspended: (id: string) => void;
  removeFromCloud: (id: string) => Promise<void>;
  loadFromCloud: (companyId: string, userId: string) => Promise<void>;
}

export const usePOSStore = create<POSState>()(
  persist(
    (set, get) => ({
      suspendedOrders: [],

      suspendCurrentOrder: (items, customer) => {
        const newOrder = {
          id: `SUS-${Date.now()}`,
          items,
          customer,
          time: new Date().toLocaleTimeString('ar-SA')
        };
        set({ suspendedOrders: [...get().suspendedOrders, newOrder] });
      },

      suspendToCloud: async (items, customer, companyId, branchId, userId) => {
        const cloudId = await suspendedOrdersService.suspendOrder(companyId, branchId, userId, items, customer);
        const newOrder = { id: cloudId, items, customer, time: new Date().toLocaleTimeString('ar-SA') };
        set({ suspendedOrders: [...get().suspendedOrders, newOrder] });
      },

      resumeOrder: (id) => {
        const order = get().suspendedOrders.find(o => o.id === id);
        if (order) {
          set({ suspendedOrders: get().suspendedOrders.filter(o => o.id !== id) });
        }
        return order;
      },

      resumeFromCloud: async (companyId, userId) => {
        const orders = await suspendedOrdersService.getSuspendedOrders(companyId, userId);
        set({ suspendedOrders: [...orders, ...get().suspendedOrders] });
        return orders;
      },

      removeSuspended: (id) => set({ suspendedOrders: get().suspendedOrders.filter(o => o.id !== id) }),

      removeFromCloud: async (id) => {
        await suspendedOrdersService.removeSuspended(id);
        set({ suspendedOrders: get().suspendedOrders.filter(o => o.id !== id) });
      },

      loadFromCloud: async (companyId, userId) => {
        try {
          const cloudOrders = await suspendedOrdersService.getSuspendedOrders(companyId, userId);
          // Merge with local, avoid duplicates by id
          const local = get().suspendedOrders;
          const localIds = new Set(local.map(o => o.id));
          const newOrders = cloudOrders.filter((o: SuspendedOrder) => !localIds.has(o.id));
          if (newOrders.length > 0) {
            set({ suspendedOrders: [...local, ...newOrders] });
          }
        } catch {
          // Cloud not available, use local only
        }
      },
    }),
    { name: 'al-zahra-pos-cache' }
  )
);
