import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getPublicEnv, getServerEnv } from '@/lib/env';

describe('Environment Module (src/lib/env.ts)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('C-1: Berhasil memvalidasi environment yang valid', () => {
    const validCustom = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      QR_TOKEN_SECRET: 'super_secret_key_that_is_at_least_32_chars_long',
      CRON_SECRET: 'cron-secret-123',
    };

    const publicEnv = getPublicEnv(validCustom);
    expect(publicEnv.NEXT_PUBLIC_SUPABASE_URL).toBe('https://project.supabase.co');
    expect(publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('test-anon-key');

    const serverEnv = getServerEnv(validCustom);
    expect(serverEnv.SUPABASE_SERVICE_ROLE_KEY).toBe('test-service-role-key');
    expect(serverEnv.QR_TOKEN_SECRET).toBe('super_secret_key_that_is_at_least_32_chars_long');
  });

  it('C-2: Melempar error jika variabel publik wajib tidak tersedia atau format URL salah', () => {
    const invalidUrl = {
      NEXT_PUBLIC_SUPABASE_URL: 'bukan-url-valid',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    };

    expect(() => getPublicEnv(invalidUrl)).toThrow('NEXT_PUBLIC_SUPABASE_URL harus berupa URL yang valid');

    const missingKey = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    };

    expect(() => getPublicEnv(missingKey)).toThrow('NEXT_PUBLIC_SUPABASE_ANON_KEY wajib diisi');
  });

  it('C-3: Melempar error jika QR_TOKEN_SECRET kurang dari 32 karakter (256-bit)', () => {
    const shortSecret = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      QR_TOKEN_SECRET: 'too-short', // Kurang dari 32 karakter
    };

    expect(() => getServerEnv(shortSecret)).toThrow('QR_TOKEN_SECRET minimal 32 karakter (256-bit)');
  });

  it('C-4: Melempar error jika getServerEnv dipanggil di Client Component (browser)', () => {
    // Simulasi berada di browser window
    const originalWindow = (globalThis as Record<string, unknown>).window;
    (globalThis as Record<string, unknown>).window = {};

    try {
      expect(() => getServerEnv()).toThrow('Keamanan Kritis: DILARANG mengakses environment server dari Client Components!');
    } finally {
      (globalThis as Record<string, unknown>).window = originalWindow;
    }
  });

  it('C-5: Pesan error validasi TIDAK PERNAH menampilkan nilai secret yang diinput', () => {
    const sensitiveString = 'VERY_CONFIDENTIAL_PASSWORD_VALUE_12345';
    const invalidConfig = {
      NEXT_PUBLIC_SUPABASE_URL: 'bukan-url-valid',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'valid-key',
      SUPABASE_SERVICE_ROLE_KEY: sensitiveString,
      QR_TOKEN_SECRET: 'pendek',
    };

    try {
      getServerEnv(invalidConfig);
      expect.unreachable('Harusnya melempar error');
    } catch (err) {
      const errorMessage = (err as Error).message;
      // Memastikan nilai sensitif sama sekali tidak terpantul di pesan error
      expect(errorMessage).not.toContain(sensitiveString);
      expect(errorMessage).toContain('QR_TOKEN_SECRET minimal 32 karakter');
    }
  });
});
