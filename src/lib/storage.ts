export interface StoredUser {
  id: string;
  email?: string;
  full_name?: string;
  role?: string;
  company_id?: string;
  [key: string]: unknown;
}

const AUTH_STORAGE_KEY = 'auth_token_encrypted';
const SALT_SESSION_KEY = 'alzhra_auth_salt';
const KEY_MATERIAL_SEED = 'alzhra-auth-encryption-key-seed-v1';
const PBKDF2_ITERATIONS = 100000;

function base64Encode(bytes: Uint8Array<ArrayBuffer>): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64Decode(b64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
}

async function getOrCreateSalt(): Promise<Uint8Array<ArrayBuffer>> {
  const existing = sessionStorage.getItem(SALT_SESSION_KEY);
  if (existing) {
    return base64Decode(existing);
  }
  const salt = crypto.getRandomValues(new Uint8Array(32)) as Uint8Array<ArrayBuffer>;
  sessionStorage.setItem(SALT_SESSION_KEY, base64Encode(salt));
  return salt;
}

async function deriveKey(salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(KEY_MATERIAL_SEED),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

interface EncryptedPayload {
  iv: string;
  ciphertext: string;
}

export async function getAuthToken(): Promise<string | null> {
  try {
    const saltB64 = sessionStorage.getItem(SALT_SESSION_KEY);
    if (!saltB64) {
      return null;
    }

    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const { iv: ivB64, ciphertext: ctB64 } = JSON.parse(stored) as EncryptedPayload;

    const salt = base64Decode(saltB64);
    const key = await deriveKey(salt);
    const iv = base64Decode(ivB64);
    const ciphertext = base64Decode(ctB64);

    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );

    return new TextDecoder().decode(plaintext);
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    sessionStorage.removeItem(SALT_SESSION_KEY);
    return null;
  }
}

export async function setAuthToken(token: string): Promise<void> {
  try {
    const salt = await getOrCreateSalt();
    const key = await deriveKey(salt);

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(token);

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded,
    );

    const payload: EncryptedPayload = {
      iv: base64Encode(iv),
      ciphertext: base64Encode(new Uint8Array(ciphertext)),
    };

    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    throw new Error('Failed to encrypt and store auth token');
  }
}

export function removeAuthToken(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.removeItem(SALT_SESSION_KEY);
}

export const storage = {
  getToken: (): string | null => {
    return localStorage.getItem('auth_token');
  },
  setToken: (token: string): void => {
    localStorage.setItem('auth_token', token);
  },
  removeToken: (): void => {
    localStorage.removeItem('auth_token');
  },
  setUser: (user: StoredUser): void => {
    localStorage.setItem('user_data', JSON.stringify(user));
  },
  getUser: (): StoredUser | null => {
    const user = localStorage.getItem('user_data');
    return user ? (JSON.parse(user) as StoredUser) : null;
  },
};
