import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePOSStore } from './store';

vi.mock('./services/suspendedOrdersService', () => ({
  suspendedOrdersService: {
    getSuspendedOrders: vi.fn().mockResolvedValue([]),
    suspendOrder: vi.fn().mockResolvedValue('cloud-id-1'),
    removeSuspended: vi.fn().mockResolvedValue(undefined),
    resumeOrder: vi.fn().mockResolvedValue(null),
  },
}));

describe('POS Store - Suspended Orders', () => {
  beforeEach(() => {
    usePOSStore.setState({ suspendedOrders: [] });
  });

  describe('suspendCurrentOrder', () => {
    it('should add a new suspended order with correct structure', () => {
      usePOSStore.getState().suspendCurrentOrder(
        [{ productId: 'p1', name: 'Item 1', quantity: 2 }],
        { id: 'c1', name: 'Customer A' },
      );

      const { suspendedOrders } = usePOSStore.getState();
      expect(suspendedOrders).toHaveLength(1);
      expect(suspendedOrders[0].id).toMatch(/^SUS-\d+$/);
      expect(suspendedOrders[0].items).toEqual([{ productId: 'p1', name: 'Item 1', quantity: 2 }]);
      expect(suspendedOrders[0].customer).toEqual({ id: 'c1', name: 'Customer A' });
      expect(suspendedOrders[0].time).toBeTruthy();
    });

    it('should prepend new orders (appended to array)', () => {
      usePOSStore.getState().suspendCurrentOrder([{ productId: 'p1' }], null);
      usePOSStore.getState().suspendCurrentOrder([{ productId: 'p2' }], null);

      const { suspendedOrders } = usePOSStore.getState();
      expect(suspendedOrders).toHaveLength(2);
      expect(suspendedOrders[0].items[0].productId).toBe('p1');
      expect(suspendedOrders[1].items[0].productId).toBe('p2');
    });

    it('should handle null customer', () => {
      usePOSStore.getState().suspendCurrentOrder([], null);

      const { suspendedOrders } = usePOSStore.getState();
      expect(suspendedOrders).toHaveLength(1);
      expect(suspendedOrders[0].customer).toBeNull();
    });

    it('should handle empty items array', () => {
      usePOSStore.getState().suspendCurrentOrder([], null);

      const { suspendedOrders } = usePOSStore.getState();
      expect(suspendedOrders[0].items).toEqual([]);
    });
  });

  describe('resumeOrder', () => {
    it('should return the order and remove it from suspended list', () => {
      usePOSStore.setState({
        suspendedOrders: [
          {
            id: 'SUS-123',
            items: [{ productId: 'p1', name: 'Item' }],
            customer: { id: 'c1' },
            time: '10:30',
          },
          {
            id: 'SUS-456',
            items: [{ productId: 'p2', name: 'Item 2' }],
            customer: null,
            time: '11:00',
          },
        ],
      });

      const resumed = usePOSStore.getState().resumeOrder('SUS-123');

      expect(resumed).toBeDefined();
      expect(resumed!.id).toBe('SUS-123');
      expect(resumed!.items[0].productId).toBe('p1');
      expect(resumed!.customer).toEqual({ id: 'c1' });
      expect(resumed!.time).toBe('10:30');

      const { suspendedOrders } = usePOSStore.getState();
      expect(suspendedOrders).toHaveLength(1);
      expect(suspendedOrders[0].id).toBe('SUS-456');
    });

    it('should return undefined for non-existent order', () => {
      usePOSStore.setState({
        suspendedOrders: [{ id: 'SUS-1', items: [], customer: null, time: '10:00' }],
      });

      const resumed = usePOSStore.getState().resumeOrder('NONEXISTENT');

      expect(resumed).toBeUndefined();

      const { suspendedOrders } = usePOSStore.getState();
      expect(suspendedOrders).toHaveLength(1);
    });
  });

  describe('removeSuspended', () => {
    it('should remove a suspended order by id', () => {
      usePOSStore.setState({
        suspendedOrders: [
          { id: 'SUS-1', items: [], customer: null, time: '10:00' },
          { id: 'SUS-2', items: [], customer: null, time: '11:00' },
          { id: 'SUS-3', items: [], customer: null, time: '12:00' },
        ],
      });

      usePOSStore.getState().removeSuspended('SUS-2');

      const { suspendedOrders } = usePOSStore.getState();
      expect(suspendedOrders).toHaveLength(2);
      expect(suspendedOrders.map((o) => o.id)).toEqual(['SUS-1', 'SUS-3']);
    });

    it('should not error when removing non-existent order', () => {
      usePOSStore.setState({
        suspendedOrders: [{ id: 'SUS-1', items: [], customer: null, time: '10:00' }],
      });

      expect(() => usePOSStore.getState().removeSuspended('NONEXISTENT')).not.toThrow();

      const { suspendedOrders } = usePOSStore.getState();
      expect(suspendedOrders).toHaveLength(1);
    });

    it('should handle removing the only order', () => {
      usePOSStore.setState({
        suspendedOrders: [{ id: 'SUS-1', items: [], customer: null, time: '10:00' }],
      });

      usePOSStore.getState().removeSuspended('SUS-1');

      const { suspendedOrders } = usePOSStore.getState();
      expect(suspendedOrders).toHaveLength(0);
    });
  });
});
