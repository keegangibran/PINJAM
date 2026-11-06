import { createBrowserClient } from '@supabase/ssr';
import { getPublicEnv } from '@/lib/env';

/**
 * Membuat Supabase client untuk Client Components (berjalan di browser).
 * Menggunakan kredensial publik anon.
 */
export function createClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getPublicEnv();

  return createBrowserClient(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
