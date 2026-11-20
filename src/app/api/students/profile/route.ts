import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const studentRegistrationSchema = z.object({
  name: z.string().min(2, 'Nama lengkap minimal 2 karakter').max(100),
  nim: z.string().min(5, 'NIM minimal 5 karakter').max(20).regex(/^[0-9]+$/, 'NIM harus berupa angka'),
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(6, 'Kata sandi minimal 6 karakter').optional(),
  class_id: z.string().uuid('Kelas yang dipilih tidak valid'),
  consent: z.boolean().refine((val) => val === true, 'Persetujuan pengambilan foto wajib dicentang'),
});

/**
 * Menghasilkan URL callback verifikasi email yang aman.
 * Mencegah open-redirect / SSRF dengan memvalidasi origin terhadap konfigurasi tepercaya.
 */
function getSafeEmailRedirectTo(request: Request): string {
  // 1. Prioritaskan URL aplikasi yang didefinisikan secara eksplisit di environment
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (configuredAppUrl) {
    try {
      const parsed = new URL(configuredAppUrl);
      return `${parsed.origin}/auth/callback`;
    } catch {
      // Abaikan konfigurasi yang tidak valid
    }
  }

  // 2. Evaluasi URL request tanpa mempercayai header origin eksternal secara sembarangan
  try {
    const reqUrl = new URL(request.url);
    const hostname = reqUrl.hostname.toLowerCase();

    // Hanya izinkan domain tepercaya (localhost, 127.0.0.1, Vercel deployments)
    const isAllowedHost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.endsWith('.vercel.app');

    if (isAllowedHost) {
      return `${reqUrl.origin}/auth/callback`;
    }
  } catch {
    // Fallback bila parsing URL gagal
  }

  // 3. Fallback default yang aman
  return 'http://localhost:3000/auth/callback';
}

async function createStudentAndClaim({
  adminClient,
  targetAuthUserId,
  nim,
  name,
  email,
  class_id,
  initialStatus,
  isEmailConfirmed,
  targetClass,
}: {
  adminClient: any;
  targetAuthUserId: string;
  nim: string;
  name: string;
  email: string;
  class_id: string;
  initialStatus: 'PENDING_DOCUMENT' | 'UNVERIFIED_EMAIL';
  isEmailConfirmed: boolean;
  targetClass: {
    id: string;
    leader_student_id: string | null;
  };
}) {
  // Masukkan ke tabel students
  const { data: newStudent, error: studentError } = await adminClient
    .from('students')
    .insert({
      auth_user_id: targetAuthUserId,
      nim,
      name,
      email,
      current_class_id: class_id,
      registration_status: initialStatus,
      qr_token_version: 1,
    })
    .select()
    .single();

  if (studentError) {
    if (studentError.code === '23505') {
      const errContext = `${studentError.message || ''} ${studentError.details || ''}`.toLowerCase();
      // Benturan pada unique constraint students.auth_user_id (students_auth_user_id_key)
      if (errContext.includes('auth_user_id') || errContext.includes('students_auth_user_id_key')) {
        return NextResponse.json(
          {
            error: {
              code: 'PROFILE_ALREADY_EXISTS',
              message: 'Akun Anda sudah memiliki profil mahasiswa terdaftar.',
            },
          },
          { status: 409 }
        );
      }

      // Benturan pada partial unique index NIM aktif (idx_students_active_nim)
      if (errContext.includes('idx_students_active_nim') || errContext.includes('nim')) {
        return NextResponse.json(
          {
            error: {
              code: 'NIM_ALREADY_ACTIVE',
              message: 'NIM ini telah terdaftar dengan akun aktif. Silakan hubungi meja TU jika ini adalah NIM Anda.',
            },
          },
          { status: 409 }
        );
      }

      // Unique constraint lainnya
      return NextResponse.json(
        {
          error: {
            code: 'DUPLICATE_DATA',
            message: 'Data mahasiswa yang dimasukkan bertentangan dengan data yang sudah terdaftar.',
          },
        },
        { status: 409 }
      );
    }

    console.error('Database error creating student profile:', studentError);
    return NextResponse.json(
      {
        error: {
          code: 'STUDENT_PROFILE_FAILED',
          message: 'Gagal membuat profil mahasiswa. Terjadi kesalahan pada sistem basis data.',
        },
      },
      { status: 500 }
    );
  }

  // Logika Klaim Ketua Kelas (FR-01D):
  // Cek apakah sudah ada klaim INITIAL yang berstatus PENDING atau APPROVED pada kelas ini
  const { data: existingInitialClaim } = await adminClient
    .from('class_leader_claims')
    .select('id, status')
    .eq('class_id', class_id)
    .eq('claim_type', 'INITIAL')
    .in('status', ['PENDING', 'APPROVED'])
    .maybeSingle();

  const hasActiveLeader = Boolean(targetClass.leader_student_id);
  const claimType = (!existingInitialClaim && !hasActiveLeader) ? 'INITIAL' : 'REPLACEMENT';

  const { data: newClaim, error: claimError } = await adminClient
    .from('class_leader_claims')
    .insert({
      class_id,
      student_id: newStudent.id,
      claim_type: claimType,
      status: 'PENDING',
      notes: claimType === 'INITIAL'
        ? 'Calon ketua pertama pada kelas (INITIAL)'
        : 'Permintaan penggantian ketua kelas (REPLACEMENT)',
    })
    .select()
    .single();

  if (claimError) {
    console.error('Claim creation error:', claimError);
  }

  return NextResponse.json({
    success: true,
    data: {
      student_id: newStudent.id,
      status: initialStatus,
      claim_type: claimType,
      is_email_confirmed: isEmailConfirmed,
      message: isEmailConfirmed
        ? 'Registrasi berhasil. Silakan datang ke meja TU untuk verifikasi tatap muka.'
        : 'Registrasi berhasil. Tautan verifikasi telah dikirimkan ke email Anda. Silakan verifikasi email Anda sebelum datang ke meja TU.',
    },
  }, { status: 201 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = studentRegistrationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const { name, nim, email, password, class_id } = parsed.data;
    const adminClient = createAdminClient();
    const supabase = await createServerSupabaseClient();

    // Periksa apakah request membawa sesi Supabase yang valid (pengguna Auth yang sudah login / orphan)
    const { data: authUserData } = typeof supabase.auth?.getUser === 'function'
      ? await supabase.auth.getUser()
      : { data: { user: null } };
    const activeAuthUser = authUserData?.user ?? null;

    if (activeAuthUser) {
      // 1. Verifikasi kecocokan email: email profil wajib sama dengan email akun Auth yang sedang login
      if (activeAuthUser.email && activeAuthUser.email.toLowerCase() !== email.toLowerCase()) {
        return NextResponse.json(
          { error: { code: 'EMAIL_MISMATCH', message: 'Alamat email profil harus sesuai dengan akun autentikasi yang sedang login.' } },
          { status: 400 }
        );
      }

      // 2. Pastikan belum ada profil pada students (mencegah akun atau profil duplikat)
      const { data: existingStudent } = await adminClient
        .from('students')
        .select('id')
        .eq('auth_user_id', activeAuthUser.id)
        .maybeSingle();

      if (existingStudent) {
        return NextResponse.json(
          { error: { code: 'PROFILE_ALREADY_EXISTS', message: 'Akun Anda sudah memiliki profil mahasiswa terdaftar.' } },
          { status: 409 }
        );
      }

      // 3. Pastikan belum ada profil pada staff_profiles (akun staf/admin tidak boleh membuat profil mahasiswa)
      const { data: existingStaff } = await adminClient
        .from('staff_profiles')
        .select('id')
        .eq('auth_user_id', activeAuthUser.id)
        .maybeSingle();

      if (existingStaff) {
        return NextResponse.json(
          { error: { code: 'STAFF_CANNOT_BE_STUDENT', message: 'Akun petugas atau administrator tidak dapat didaftarkan sebagai mahasiswa.' } },
          { status: 403 }
        );
      }

      // 4. Validasi bahwa kelas yang dipilih aktif
      const { data: targetClass, error: classError } = await adminClient
        .from('classes')
        .select('id, study_program, cohort_year, section, academic_term, is_active, leader_student_id')
        .eq('id', class_id)
        .single();

      if (classError || !targetClass || !targetClass.is_active) {
        return NextResponse.json(
          { error: { code: 'INVALID_CLASS', message: 'Kelas yang dipilih tidak aktif atau tidak ditemukan.' } },
          { status: 400 }
        );
      }

      // 5. Periksa apakah sudah ada akun mahasiswa ACTIVE dengan NIM yang sama
      const { data: existingActiveNim } = await adminClient
        .from('students')
        .select('id, nim')
        .eq('nim', nim)
        .eq('registration_status', 'ACTIVE')
        .single();

      if (existingActiveNim) {
        return NextResponse.json(
          { error: { code: 'NIM_ALREADY_ACTIVE', message: 'NIM ini telah terdaftar dengan akun aktif. Silakan hubungi meja TU jika ini adalah NIM Anda.' } },
          { status: 409 }
        );
      }

      // Jalur orphan: gunakan ID pengguna hasil autentikasi server dan JANGAN panggil signUp()
      const targetAuthUserId = activeAuthUser.id;
      const isEmailConfirmed = Boolean(activeAuthUser.email_confirmed_at);
      const initialStatus = isEmailConfirmed ? 'PENDING_DOCUMENT' : 'UNVERIFIED_EMAIL';

      return await createStudentAndClaim({
        adminClient,
        targetAuthUserId,
        nim,
        name,
        email,
        class_id,
        initialStatus,
        isEmailConfirmed,
        targetClass,
      });
    }

    // Jalur registrasi normal bagi pengguna tanpa sesi aktif:
    // Wajib memasukkan kata sandi minimal 6 karakter
    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Kata sandi minimal 6 karakter' } },
        { status: 400 }
      );
    }

    // 1. Validasi bahwa kelas yang dipilih aktif
    const { data: targetClass, error: classError } = await adminClient
      .from('classes')
      .select('id, study_program, cohort_year, section, academic_term, is_active, leader_student_id')
      .eq('id', class_id)
      .single();

    if (classError || !targetClass || !targetClass.is_active) {
      return NextResponse.json(
        { error: { code: 'INVALID_CLASS', message: 'Kelas yang dipilih tidak aktif atau tidak ditemukan.' } },
        { status: 400 }
      );
    }

    // 2. Periksa apakah sudah ada akun mahasiswa ACTIVE dengan NIM yang sama
    const { data: existingActiveNim } = await adminClient
      .from('students')
      .select('id, nim')
      .eq('nim', nim)
      .eq('registration_status', 'ACTIVE')
      .single();

    if (existingActiveNim) {
      return NextResponse.json(
        { error: { code: 'NIM_ALREADY_ACTIVE', message: 'NIM ini telah terdaftar dengan akun aktif. Silakan hubungi meja TU jika ini adalah NIM Anda.' } },
        { status: 409 }
      );
    }

    // 3. Daftarkan akun ke Supabase Auth
    const emailRedirectTo = getSafeEmailRedirectTo(request);
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: {
          name,
          nim,
          role: 'STUDENT',
        },
      },
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: { code: 'AUTH_REGISTRATION_FAILED', message: authError?.message || 'Gagal mendaftarkan akun autentikasi.' } },
        { status: 400 }
      );
    }

    // Deteksi akun email sudah terdaftar di Supabase Auth (identities kosong menandakan fake user anti-enumeration)
    if (!authData.user.identities || authData.user.identities.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'EMAIL_ALREADY_REGISTERED',
            message: 'Alamat email ini sudah terdaftar pada sistem PINJAM. Silakan gunakan email mahasiswa lain atau masuk ke akun Anda.',
          },
        },
        { status: 409 }
      );
    }

    const targetAuthUserId = authData.user.id;
    const isEmailConfirmed = Boolean(authData.user.email_confirmed_at);
    const initialStatus = isEmailConfirmed ? 'PENDING_DOCUMENT' : 'UNVERIFIED_EMAIL';

    return await createStudentAndClaim({
      adminClient,
      targetAuthUserId,
      nim,
      name,
      email,
      class_id,
      initialStatus,
      isEmailConfirmed,
      targetClass,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: err.message || 'Terjadi kesalahan sistem.' } },
      { status: 500 }
    );
  }
}
