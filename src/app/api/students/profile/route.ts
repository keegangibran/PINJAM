import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/audit';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const studentRegistrationSchema = z.object({
  name: z.string().min(2, 'Nama lengkap minimal 2 karakter').max(100),
  nim: z.string().min(5, 'NIM minimal 5 karakter').max(20).regex(/^[0-9]+$/, 'NIM harus berupa angka'),
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(6, 'Kata sandi minimal 6 karakter'),
  class_id: z.string().uuid('Kelas yang dipilih tidak valid'),
  consent: z.boolean().refine((val) => val === true, 'Persetujuan pengambilan foto wajib dicentang'),
});

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
    const supabase = await createServerSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
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

    // 4. Tentukan status awal: jika email sudah terkonfirmasi otomatis (mis. dev environment), PENDING_DOCUMENT, jika belum, UNVERIFIED_EMAIL
    const isEmailConfirmed = Boolean(authData.user.email_confirmed_at);
    const initialStatus = isEmailConfirmed ? 'PENDING_DOCUMENT' : 'UNVERIFIED_EMAIL';

    // 5. Masukkan ke tabel students
    const { data: newStudent, error: studentError } = await adminClient
      .from('students')
      .insert({
        auth_user_id: authData.user.id,
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
      return NextResponse.json(
        { error: { code: 'STUDENT_PROFILE_FAILED', message: studentError.message } },
        { status: 500 }
      );
    }

    // 6. Logika Klaim Ketua Kelas (FR-01D):
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
  } catch (err: any) {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: err.message || 'Terjadi kesalahan sistem.' } },
      { status: 500 }
    );
  }
}
