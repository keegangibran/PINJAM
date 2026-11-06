import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getPublicEnv } from '@/lib/env';

export interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

/**
 * Membuat Supabase client untuk Server Components, Server Actions, atau Route Handlers.
 * Beroperasi dalam konteks otorisasi user aktif via cookie HTTP-only.
 */
export async function createServerSupabaseClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getPublicEnv();
  const cookieStore = await cookies();

  return createServerClient(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set({ name, value, ...options });
            });
          } catch {
            // Dipanggil dari Server Component di mana cookies bersifat read-only.
            // Sesi akan disegarkan oleh middleware atau Route Handler.
          }
        },
      },
    }
  );
}
