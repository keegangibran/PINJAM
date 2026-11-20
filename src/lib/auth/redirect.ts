/**
 * Tipe peran autentikasi pada sistem PINJAM.
 * ORPHAN merepresentasikan pengguna Auth yang belum memiliki profil students maupun staff_profiles.
 */
export type AuthUserRole = 'ADMIN' | 'STAFF' | 'STUDENT' | 'ORPHAN';

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
 * Menentukan halaman tujuan redirect default berdasarkan peran pengguna (server authoritative).
 */
export function getDefaultRedirectForRole(role: AuthUserRole): string {
  switch (role) {
    case 'ADMIN':
      return '/admin';
    case 'STAFF':
      return '/kiosk';
    case 'STUDENT':
      return '/my-qr';
    case 'ORPHAN':
      return '/register';
    default:
      return '/';
  }
}

/**
 * Memeriksa apakah suatu pathname diawali segmen path tertentu secara ketat (strict segment matching).
 * Mencegah kerentanan path prefix matching longgar, misalnya /admin-evil tidak cocok dengan /admin.
 */
export function matchesStrictSegment(pathname: string, allowedPrefix: string): boolean {
  if (pathname === allowedPrefix) {
    return true;
  }
  const prefixWithSlash = allowedPrefix.endsWith('/') ? allowedPrefix : `${allowedPrefix}/`;
  return pathname.startsWith(prefixWithSlash);
}

/**
 * Memvalidasi apakah suatu pathname internal diizinkan untuk diakses oleh peran tertentu.
 * Aturan Whitelist:
 * - ADMIN: /admin, /admin/*, /kiosk, /kiosk/*
 * - STAFF: /kiosk, /kiosk/*, /admin, /admin/verifications, /admin/projectors
 *          (Rute /admin/classes dan subpath lain yang mewajibkan requireAdmin() TIDAK diizinkan untuk STAFF)
 * - STUDENT: /my-qr, /my-qr/*, /register, /register/*
 * - ORPHAN: /register, /register/*
 * Catatan: /login-history TIDAK dimasukkan ke whitelist karena rute tersebut tidak tersedia.
 */
export function isPathAllowedForRole(pathname: string, role: AuthUserRole): boolean {
  if (!pathname || typeof pathname !== 'string') {
    return false;
  }

  // Normalisasi pathname: hapus trailing slash berlebih jika bukan root '/'
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  // Larang keras pengalihan kembali ke /login untuk mencegah siklus loop
  if (normalized === '/login') {
    return false;
  }

  switch (role) {
    case 'ADMIN':
      return matchesStrictSegment(normalized, '/admin') || matchesStrictSegment(normalized, '/kiosk');

    case 'STAFF':
      // STAFF diizinkan mengakses Kiosk dan subpath Kiosk
      if (matchesStrictSegment(normalized, '/kiosk')) {
        return true;
      }
      // Khusus area Admin: HANYA rute yang otorisasi guard-nya terbukti mengizinkan STAFF
      // Berdasarkan audit aktual: /admin (dashboard), /admin/verifications, /admin/projectors
      // Rute /admin/classes dan rute administratif lainnya DILARANG untuk STAFF
      if (
        normalized === '/admin' ||
        matchesStrictSegment(normalized, '/admin/verifications') ||
        matchesStrictSegment(normalized, '/admin/projectors')
      ) {
        return true;
      }
      return false;

    case 'STUDENT':
      return matchesStrictSegment(normalized, '/my-qr') || matchesStrictSegment(normalized, '/register');

    case 'ORPHAN':
      return matchesStrictSegment(normalized, '/register');

    default:
      return false;
  }
}

/**
 * Memvalidasi dan menentukan path tujuan redirect yang aman dan role-aware di server.
 * Memvalidasi returnUrl terhadap whitelist peran menggunakan strict path segment matching.
 * Query string dan hash hanya dipertahankan apabila path dasarnya lolos validasi peran.
 * Jika returnUrl tidak valid atau tidak diizinkan, mengembalikan tujuan default dari peran tersebut.
 */
export function getRoleSafeRedirectDestination(
  returnUrl: string | null | undefined,
  role: AuthUserRole,
  baseOriginOrUrl: string | URL = 'http://localhost:3000'
): string {
  const defaultPath = getDefaultRedirectForRole(role);
  const base = typeof baseOriginOrUrl === 'string' ? new URL(baseOriginOrUrl) : baseOriginOrUrl;

  if (!returnUrl) {
    return defaultPath;
  }

  // 1. Validasi keamanan dasar path (mencegah open redirect, protocol-relative, backslash)
  const safeReturn = getSafeNextPath(returnUrl, base, '');
  if (!safeReturn) {
    return defaultPath;
  }

  try {
    const parsed = new URL(safeReturn, base);
    const normalizedPath = parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/, '') : parsed.pathname;

    // 2. Validasi kesesuaian peran dengan strict path segment matching
    if (isPathAllowedForRole(normalizedPath, role)) {
      // Pertahankan query parameters dan hash HANYA setelah lolos validasi peran
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    // Abaikan error parsing dan kembalikan defaultPath
  }

  return defaultPath;
}

/**
 * Memvalidasi dan menentukan path tujuan redirect setelah login berhasil (generik/non-role).
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
        // Tolak jika pathname tujuan tepat sama dengan '/login'
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
