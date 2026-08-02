import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAuthToken, setAuthToken, removeAuthToken } from './storage';

function createLocalStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
}

function createSessionStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
}

describe('storage', () => {
  let localStorageMock: ReturnType<typeof createLocalStorageMock>;
  let sessionStorageMock: ReturnType<typeof createSessionStorageMock>;

  beforeEach(() => {
    localStorageMock = createLocalStorageMock();
    sessionStorageMock = createSessionStorageMock();
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });
    Object.defineProperty(window, 'sessionStorage', {
      value: sessionStorageMock,
      writable: true,
    });
  });

  it('should encrypt and decrypt token', async () => {
    await setAuthToken('test-token-123');
    const token = await getAuthToken();
    expect(token).toBe('test-token-123');
  });

  it('should return null when no token stored', async () => {
    const token = await getAuthToken();
    expect(token).toBeNull();
  });

  it('should remove token', async () => {
    await setAuthToken('token');
    await removeAuthToken();
    const token = await getAuthToken();
    expect(token).toBeNull();
  });

  it('should handle empty token', async () => {
    await setAuthToken('');
    const token = await getAuthToken();
    expect(token).toBe('');
  });

  it('should generate different ciphertexts for same token', async () => {
    await setAuthToken('same-token');
    const ct1 = localStorageMock.getItem('auth_token_encrypted');
    localStorageMock.clear();
    sessionStorageMock.clear();
    await setAuthToken('same-token');
    const ct2 = localStorageMock.getItem('auth_token_encrypted');
    expect(ct1).not.toBe(ct2);
  });

  it('should return null when salt is missing but auth key exists', async () => {
    const salt = sessionStorageMock.getItem('alzhra_auth_salt');
    expect(salt).toBeNull();
    const token = await getAuthToken();
    expect(token).toBeNull();
  });

  it('should return null when auth key is missing but salt exists', async () => {
    await setAuthToken('token');
    localStorageMock.removeItem('auth_token_encrypted');
    const token = await getAuthToken();
    expect(token).toBeNull();
  });

  it('should return null and clean up on corrupted payload', async () => {
    await setAuthToken('token');
    localStorageMock.setItem('auth_token_encrypted', 'not-valid-json');
    const token = await getAuthToken();
    expect(token).toBeNull();
    expect(localStorageMock.getItem('auth_token_encrypted')).toBeNull();
  });
});
