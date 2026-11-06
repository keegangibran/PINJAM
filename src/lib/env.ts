import { z } from 'zod';

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL harus berupa URL yang valid'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY wajib diisi'),
});

const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY wajib diisi'),
  QR_TOKEN_SECRET: z.string().min(32, 'QR_TOKEN_SECRET minimal 32 karakter (256-bit)'),
  CRON_SECRET: z.string().min(1, 'CRON_SECRET wajib diisi').optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

function formatEnvError(error: z.ZodError): string {
  // Hanya menampilkan nama variabel yang bermasalah dan deskripsi, TANPA nilai input/secret
  const issueMessages = error.issues.map((issue) => {
    const fieldName = issue.path.join('.');
    return `- ${fieldName}: ${issue.message}`;
  });
  return `Konfigurasi Environment tidak valid:\n${issueMessages.join('\n')}`;
}

/**
 * Validasi dan akses environment variabel publik (aman dipanggil di browser maupun server).
 */
export function getPublicEnv(customEnv?: Record<string, string | undefined>): PublicEnv {
  const source = customEnv ?? {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };

  const result = publicEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(formatEnvError(result.error));
  }
  return result.data;
}

/**
 * Validasi dan akses environment variabel server (HANYA boleh dipanggil di server).
 * Melempar error jika dipanggil di browser.
 */
export function getServerEnv(customEnv?: Record<string, string | undefined>): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error('Keamanan Kritis: DILARANG mengakses environment server dari Client Components!');
  }

  const source = customEnv ?? process.env;
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(formatEnvError(result.error));
  }
  return result.data;
}
