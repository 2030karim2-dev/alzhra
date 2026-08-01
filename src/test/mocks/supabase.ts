import { vi } from 'vitest';

export const createMockSupabaseClient = () => ({
    auth: {
        getSession: vi.fn().mockResolvedValue({
            data: { session: null },
            error: null
        }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
        signInWithPassword: vi.fn(),
        signUp: vi.fn(),
        resetPasswordForEmail: vi.fn(),
        updateUser: vi.fn(),
        onAuthStateChange: vi.fn().mockReturnValue({
            data: { subscription: { unsubscribe: vi.fn() } }
        }),
        getOAuthSession: vi.fn(),
    },
    from: vi.fn().mockReturnThis(),
    channel: vi.fn().mockReturnThis(),
    rpc: vi.fn().mockReturnThis(),
    storage: {
        from: vi.fn().mockReturnThis(),
    },
});

export const mockSupabase = createMockSupabaseClient();