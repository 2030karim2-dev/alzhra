import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('idb-keyval', () => ({
    get: vi.fn(() => null),
    set: vi.fn(),
    del: vi.fn(),
}));

import { useOfflineQueueStore } from './offlineQueueStore';

describe('OfflineQueueStore', () => {
    beforeEach(() => {
        useOfflineQueueStore.setState({ queue: [], isProcessing: false });
        vi.clearAllMocks();
    });

    it('should initialize with empty queue', () => {
        const state = useOfflineQueueStore.getState();
        expect(state.queue).toHaveLength(0);
        expect(state.isProcessing).toBe(false);
    });

    it('should enqueue an action', () => {
        useOfflineQueueStore.getState().enqueue('CREATE_INVOICE', {
            company_id: 'c1',
            user_id: 'u1',
            data: {},
        });

        const state = useOfflineQueueStore.getState();
        expect(state.queue).toHaveLength(1);
        expect(state.queue[0].type).toBe('CREATE_INVOICE');
        expect(state.queue[0].payload.company_id).toBe('c1');
    });

    it('should remove an action from queue', () => {
        useOfflineQueueStore.getState().enqueue('CREATE_INVOICE', {
            company_id: 'c1',
            user_id: 'u1',
            data: {},
        });

        const id = useOfflineQueueStore.getState().queue[0].id;
        useOfflineQueueStore.getState().removeFromQueue(id);

        const state = useOfflineQueueStore.getState();
        expect(state.queue).toHaveLength(0);
    });

    it('should update action retry count', () => {
        useOfflineQueueStore.getState().enqueue('CREATE_INVOICE', {
            company_id: 'c1',
            user_id: 'u1',
            data: {},
        });

        const id = useOfflineQueueStore.getState().queue[0].id;
        useOfflineQueueStore.getState().updateAction(id, { retryCount: 1 });

        const state = useOfflineQueueStore.getState();
        expect(state.queue[0].retryCount).toBe(1);
    });

    it('should set processing state', () => {
        useOfflineQueueStore.getState().setProcessing(true);
        expect(useOfflineQueueStore.getState().isProcessing).toBe(true);
    });

    it('should clear the queue', () => {
        useOfflineQueueStore.getState().enqueue('CREATE_INVOICE', {
            company_id: 'c1',
            user_id: 'u1',
            data: {},
        });
        useOfflineQueueStore.getState().clearQueue();

        const state = useOfflineQueueStore.getState();
        expect(state.queue).toHaveLength(0);
    });

    it('should not sync when already processing', async () => {
        useOfflineQueueStore.setState({ isProcessing: true });
        useOfflineQueueStore.getState().enqueue('CREATE_INVOICE', {
            company_id: 'c1',
            user_id: 'u1',
            data: {},
        });

        await useOfflineQueueStore.getState().syncQueue();
        expect(useOfflineQueueStore.getState().queue).toHaveLength(1);
    });
});
