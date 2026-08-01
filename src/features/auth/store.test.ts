import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuthStore } from './store';

vi.mock('../../lib/supabaseClient', () => ({
    supabase: {
        auth: {
            getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
            signOut: vi.fn().mockResolvedValue({ error: null }),
            onAuthStateChange: vi.fn().mockReturnValue({
                data: { subscription: { unsubscribe: vi.fn() } },
            }),
        },
    },
}));

vi.mock('../../core/lib/react-query', () => ({
    queryClient: {
        clear: vi.fn(),
        invalidateQueries: vi.fn(),
        getMutationCache: vi.fn().mockReturnValue({
            build: vi.fn(),
        }),
    },
    createQueryClient: vi.fn(),
    ReactQueryProvider: (props: any) => props.children || null,
}));

vi.mock('../../core/lib/persistence', () => ({
    createIndexedDBPersister: () => ({
        persistClient: vi.fn().mockResolvedValue(undefined),
        restoreClient: vi.fn().mockResolvedValue(undefined),
        removeClient: vi.fn().mockResolvedValue(undefined),
    }),
    localStoragePersister: {},
}));

vi.mock('../../core/utils/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

describe('Auth Store', () => {
    beforeEach(() => {
        useAuthStore.setState({
            user: null,
            isAuthenticated: false,
            isLoading: true,
            isReady: false,
        });
        vi.clearAllMocks();
    });

    it('should initialize with correct default state', () => {
        const state = useAuthStore.getState();
        expect(state.user).toBeNull();
        expect(state.isAuthenticated).toBe(false);
        expect(state.isLoading).toBe(true);
        expect(state.isReady).toBe(false);
    });

    it('should login user correctly', () => {
        const mockUser = {
            id: 'user-123',
            email: 'test@example.com',
            full_name: 'Test User',
            role: 'admin',
        };

        useAuthStore.getState().login(mockUser as any);

        const state = useAuthStore.getState();
        expect(state.user).toEqual(mockUser);
        expect(state.isAuthenticated).toBe(true);
        expect(state.isLoading).toBe(false);
        expect(state.isReady).toBe(true);
    });

    it('should logout and clear state', async () => {
        useAuthStore.setState({
            user: { id: '1', email: 'test@test.com', full_name: 'Test', role: 'admin' } as any,
            isAuthenticated: true,
            isLoading: false,
            isReady: true,
        });

        await useAuthStore.getState().logout();

        const state = useAuthStore.getState();
        expect(state.user).toBeNull();
        expect(state.isAuthenticated).toBe(false);
        expect(state.isLoading).toBe(false);
        expect(state.isReady).toBe(true);
    });
});