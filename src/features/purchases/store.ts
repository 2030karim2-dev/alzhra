import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product } from '../inventory/types';

export interface PurchaseInvoiceItem {
  id: string;
  productId: string;
  sku: string;
  name: string;
  partNumber?: string;
  brand?: string;
  quantity: number;
  costPrice: number;
  discount: number;
}

export interface PurchaseTotals {
  subtotal: number;
  discountTotal: number;
  grandTotal: number;
  itemCount: number;
}

interface PurchaseState {
  items: PurchaseInvoiceItem[];
  supplier: { id: string; name: string; phone?: string } | null;
  invoiceNumber: string;
  issueDate: string;
  invoiceType: string;
  currency: string;
  exchangeRate: number;
  warehouseId: string;
  cashboxId: string;
  showDiscount: boolean;
  totals: PurchaseTotals;

  initializeItems: (count: number) => void;
  addItem: () => void;
  updateItem: (index: number, field: keyof PurchaseInvoiceItem, value: string | number) => void;
  setProductForRow: (index: number, product: Product) => void;
  removeItem: (index: number) => void;
  setSupplier: (supplier: { id: string; name: string; phone?: string } | null) => void;
  setMetadata: (field: string, value: string | number | boolean | null) => void;
  resetCart: () => void;
  bulkLoadItems: (items: Array<{ productId: string; name: string; sku: string; partNumber?: string; brand?: string; quantity: number; costPrice: number; discount?: number }>) => void;
  toggleColumn: (field: keyof PurchaseState) => void;
  calculateTotals: () => void;
}

const createNewItem = (): PurchaseInvoiceItem => ({
  id: crypto.randomUUID(),
  productId: '',
  sku: '',
  name: '',
  partNumber: '',
  brand: '',
  quantity: 0,
  costPrice: 0,
  discount: 0,
});

export const usePurchaseStore = create<PurchaseState>()(
  persist(
    (set, get) => ({
      items: [],
      supplier: null,
      invoiceNumber: '',
      issueDate: new Date().toISOString().split('T')[0],
      invoiceType: 'cash',
      currency: 'SAR',
      exchangeRate: 1,
      warehouseId: 'wh_main',
      cashboxId: '',
      showDiscount: false,
      totals: { subtotal: 0, discountTotal: 0, grandTotal: 0, itemCount: 0 },

      initializeItems: (count: number) => {
        const currentItems = get().items;
        if (currentItems.length >= count) return;
        const newItems = Array.from({ length: count - currentItems.length }, () => createNewItem());
        set({ items: [...currentItems, ...newItems] });
      },

      addItem: () => {
        set((state) => ({ items: [...state.items, createNewItem()] }));
      },

      updateItem: (index: number, field: keyof PurchaseInvoiceItem, value: string | number) => {
        set((state) => {
          const items = [...state.items];
          items[index] = { ...items[index], [field]: value };
          return { items };
        });
        get().calculateTotals();
      },

      setProductForRow: (index: number, product: Product) => {
        set((state) => {
          const items = [...state.items];
          items[index] = {
            ...items[index],
            productId: product.id,
            name: product.name,
            sku: product.sku || '',
            partNumber: (product as any).part_number || '',
            brand: (product as any).brand || '',
            costPrice: product.cost_price || (product as any).last_purchase_price || 0,
          };
          return { items };
        });
      },

      removeItem: (index: number) => {
        set((state) => {
          const items = state.items.filter((_, i) => i !== index);
          if (items.length === 0) items.push(createNewItem());
          return { items };
        });
        get().calculateTotals();
      },

      setSupplier: (supplier) => set({ supplier }),

      setMetadata: (field: string, value: string | number | boolean | null) => {
        set({ [field]: value } as any);
      },

      resetCart: () => set({
        items: Array.from({ length: 6 }, () => createNewItem()),
        supplier: null,
        invoiceNumber: '',
        invoiceType: 'cash',
        totals: { subtotal: 0, discountTotal: 0, grandTotal: 0, itemCount: 0 },
      }),

      bulkLoadItems: (incoming) => {
        const converted: PurchaseInvoiceItem[] = incoming.map((item) => ({
          id: crypto.randomUUID(),
          productId: item.productId,
          sku: item.sku,
          name: item.name,
          partNumber: item.partNumber || '',
          brand: item.brand || '',
          quantity: item.quantity,
          costPrice: item.costPrice,
          discount: item.discount || 0,
        }));
        set({ items: converted });
        get().calculateTotals();
      },

      toggleColumn: (field: keyof PurchaseState) => {
        set((state) => ({ [field]: !state[field] } as any));
      },

      calculateTotals: () => {
        const { items } = get();
        const subtotal = items.reduce((sum, item) => sum + item.quantity * item.costPrice, 0);
        const discountTotal = items.reduce((sum, item) => sum + (item.discount || 0), 0);
        const grandTotal = subtotal - discountTotal;
        const itemCount = items.filter(i => i.productId && i.quantity > 0).length;
        set({ totals: { subtotal, discountTotal, grandTotal, itemCount } });
      },
    }),
    {
      name: 'purchase-store',
      partialize: (state) => ({
        items: state.items,
        currency: state.currency,
        exchangeRate: state.exchangeRate,
        showDiscount: state.showDiscount,
      }),
    }
  )
);
