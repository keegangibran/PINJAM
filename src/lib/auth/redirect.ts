/**
 * Memvalidasi dan memastikan parameter redirect `next` hanya mengarah ke path internal
 * pada origin aplikasi yang sama (mencegah Open Redirect vulnerability).
 */
export function getSafeNextPath(
  rawNext: string | null | undefined,
  requestUrl: URL,
  fallbackPath: string = '/login'
): string {
  if (!rawNext || typeof rawNext !== 'string') {
    return fallbackPath;
  }

  // Tolak karakter backslash yang dapat memicu host confusion pada parser browser
  if (rawNext.includes('\\')) {
    return fallbackPath;
  }

  // Wajib diawali single slash dan bukan protocol-relative (//)
  if (!rawNext.startsWith('/') || rawNext.startsWith('//')) {
    return fallbackPath;
  }

  try {
    const target = new URL(rawNext, requestUrl);

    // Pastikan origin hasil parsing sama persis dengan origin request aplikasi
    if (target.origin !== requestUrl.origin) {
      return fallbackPath;
    }

    // Pastikan pathname tidak diawali ganda // (misal /\\evil.com setelah resolusi)
    if (!target.pathname.startsWith('/') || target.pathname.startsWith('//')) {
      return fallbackPath;
    }

    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallbackPath;
  }
}

/**
 * Memvalidasi dan menentukan path tujuan redirect setelah login berhasil.
 * Memprioritaskan `returnUrl` jika valid dan aman; jika tidak, menggunakan `apiRedirectTo` jika aman;
 * dan terakhir menggunakan `fallback` default ('/').
 */
export function getSafeRedirectDestination(
  returnUrl: string | null | undefined,
  apiRedirectTo: string | null | undefined,
  baseOriginOrUrl: string | URL,
  fallback: string = '/'
): string {
  const base = typeof baseOriginOrUrl === 'string' ? new URL(baseOriginOrUrl) : baseOriginOrUrl;

  // 1. Coba validasi returnUrl terlebih dahulu
  if (returnUrl) {
    const safeReturn = getSafeNextPath(returnUrl, base, '');
    if (safeReturn) {
      try {
        const parsed = new URL(safeReturn, base);
        const normalizedPath = parsed.pathname.replace(/\/+$/, '');
        // Tolak jika pathname tujuan tepat sama dengan '/login' (misal /login atau /login?error=...)
        // Jangan tolak path lain seperti '/login-history'
        if (normalizedPath !== '/login') {
          return safeReturn;
        }
      } catch {
        // Jika gagal parsing, abaikan dan lanjut ke alternatif berikutnya
      }
    }
  }

  // 2. Coba validasi redirectTo dari respons API
  if (apiRedirectTo) {
    const safeApiRedirect = getSafeNextPath(apiRedirectTo, base, '');
    if (safeApiRedirect) {
      try {
        const parsedApi = new URL(safeApiRedirect, base);
        const normalizedApiPath = parsedApi.pathname.replace(/\/+$/, '');
        if (normalizedApiPath !== '/login') {
          return safeApiRedirect;
        }
      } catch {
        // Jika gagal parsing, abaikan dan lanjut ke fallback
      }
    }
  }

  // 3. Fallback aman terakhir
  return getSafeNextPath(fallback, base, '/');
}

