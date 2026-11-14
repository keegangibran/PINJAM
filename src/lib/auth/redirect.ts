/**
 * Memvalidasi dan memastikan parameter redirect `next` hanya mengarah ke path internal
 * pada origin aplikasi yang sama (mencegah Open Redirect vulnerability).
 */
export function getSafeNextPath(rawNext: string | null | undefined, requestUrl: URL): string {
  if (!rawNext || typeof rawNext !== 'string') {
    return '/login';
  }

  // Tolak karakter backslash yang dapat memicu host confusion pada parser browser
  if (rawNext.includes('\\')) {
    return '/login';
  }

  // Wajib diawali single slash dan bukan protocol-relative (//)
  if (!rawNext.startsWith('/') || rawNext.startsWith('//')) {
    return '/login';
  }

  try {
    const target = new URL(rawNext, requestUrl);

    // Pastikan origin hasil parsing sama persis dengan origin request aplikasi
    if (target.origin !== requestUrl.origin) {
      return '/login';
    }

    // Pastikan pathname tidak diawali ganda // (misal /\\evil.com setelah resolusi)
    if (!target.pathname.startsWith('/') || target.pathname.startsWith('//')) {
      return '/login';
    }

    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return '/login';
  }
}

