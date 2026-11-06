import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getServerEnv } from '@/lib/env';

/**
 * Membuat Supabase Admin client dengan hak akses service-role.
 * PERINGATAN:
 * - Dilindungi secara ketat oleh package 'server-only' agar build gagal bila terimpor ke client.
 * - HANYA boleh digunakan di server untuk operasi sistem/otomasi terotorisasi.
 * - Melewati seluruh aturan Row Level Security (RLS).
 */
export function createAdminClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();

  return createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
