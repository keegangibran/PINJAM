import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { StaffRole, StudentRegistrationStatus } from '@/types/database';

export interface UserAuthContext {
  userId: string;
  email: string;
  role: 'STUDENT' | 'STAFF' | 'ADMIN';
  staffProfile?: {
    id: string;
    name: string;
    role: StaffRole;
    isActive: boolean;
  } | null;
  studentProfile?: {
    id: string;
    nim: string;
    name: string;
    registrationStatus: StudentRegistrationStatus;
    currentClassId: string | null;
  } | null;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number = 401,
    public code: string = 'UNAUTHORIZED'
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Mendapatkan sesi pengguna terotentikasi saat ini dan memvalidasi perannya
 * dari sumber data server yang otoritatif (staff_profiles / students).
 */
export async function getCurrentUserContext(): Promise<UserAuthContext | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  // Gunakan adminClient untuk memeriksa profil pengguna secara aman
  const adminClient = createAdminClient();

  // 1. Periksa apakah pengguna adalah staf TU atau Admin
  const { data: staff } = await adminClient
    .from('staff_profiles')
    .select('id, name, role, is_active')
    .eq('auth_user_id', user.id)
    .single();

  if (staff && staff.is_active) {
    return {
      userId: user.id,
      email: user.email ?? '',
      role: staff.role as 'STAFF' | 'ADMIN',
      staffProfile: {
        id: staff.id,
        name: staff.name,
        role: staff.role as StaffRole,
        isActive: staff.is_active,
      },
      studentProfile: null,
    };
  }

  // 2. Periksa apakah pengguna adalah mahasiswa
  const { data: student } = await adminClient
    .from('students')
    .select('id, nim, name, registration_status, current_class_id')
    .eq('auth_user_id', user.id)
    .single();

  if (student) {
    return {
      userId: user.id,
      email: user.email ?? '',
      role: 'STUDENT',
      staffProfile: null,
      studentProfile: {
        id: student.id,
        nim: student.nim,
        name: student.name,
        registrationStatus: student.registration_status as StudentRegistrationStatus,
        currentClassId: student.current_class_id,
      },
    };
  }

  // Pengguna terdaftar di auth.users tetapi belum memiliki profil mahasiswa/staf
  return {
    userId: user.id,
    email: user.email ?? '',
    role: 'STUDENT',
    staffProfile: null,
    studentProfile: null,
  };
}

/**
 * Memastikan pengguna telah login. Melempar AuthError jika tidak terautentikasi.
 */
export async function requireAuth(): Promise<UserAuthContext> {
  const context = await getCurrentUserContext();
  if (!context) {
    throw new AuthError('Sesi tidak ditemukan atau telah kedaluwarsa. Silakan masuk kembali.', 401, 'UNAUTHORIZED');
  }
  return context;
}

/**
 * Memastikan pengguna memiliki peran STAFF atau ADMIN aktif.
 */
export async function requireStaff(): Promise<UserAuthContext> {
  const context = await requireAuth();
  if (context.role !== 'STAFF' && context.role !== 'ADMIN') {
    throw new AuthError('Akses ditolak: Operasi ini memerlukan hak akses Petugas TU atau Administrator.', 403, 'FORBIDDEN');
  }
  if (!context.staffProfile || !context.staffProfile.isActive) {
    throw new AuthError('Akses ditolak: Akun petugas Anda berstatus nonaktif.', 403, 'STAFF_INACTIVE');
  }
  return context;
}

/**
 * Memastikan pengguna memiliki peran ADMIN aktif.
 */
export async function requireAdmin(): Promise<UserAuthContext> {
  const context = await requireAuth();
  if (context.role !== 'ADMIN') {
    throw new AuthError('Akses ditolak: Operasi administratif ini hanya diizinkan untuk peran Administrator.', 403, 'FORBIDDEN_ADMIN_ONLY');
  }
  if (!context.staffProfile || !context.staffProfile.isActive) {
    throw new AuthError('Akses ditolak: Akun administrator Anda berstatus nonaktif.', 403, 'STAFF_INACTIVE');
  }
  return context;
}

/**
 * Memastikan pengguna adalah mahasiswa.
 */
export async function requireStudent(): Promise<UserAuthContext> {
  const context = await requireAuth();
  if (context.role === 'STAFF' || context.role === 'ADMIN') {
    throw new AuthError('Akun petugas tidak dapat melakukan tindakan mahasiswa.', 403, 'ROLE_MISMATCH');
  }
  return context;
}

