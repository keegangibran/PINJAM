import { requireStudent } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateQrPassToken, QR_TOKEN_LIFETIME_SECONDS } from '@/lib/qr-token';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const userContext = await requireStudent();
    const studentProfile = userContext.studentProfile;

    if (!studentProfile) {
      return NextResponse.json(
        {
          error: {
            code: 'PROFILE_NOT_FOUND',
            message: 'Profil mahasiswa belum dibuat. Silakan lengkapi pendaftaran.',
          },
        },
        { status: 404 }
      );
    }

    // 1. Validasi status akun mahasiswa: wajib ACTIVE
    if (studentProfile.registrationStatus !== 'ACTIVE') {
      return NextResponse.json(
        {
          error: {
            code: 'ACCOUNT_NOT_ACTIVE',
            message: `Akun Anda berstatus ${studentProfile.registrationStatus}. QR Pass hanya dapat diakses oleh akun terverifikasi (ACTIVE).`,
          },
        },
        { status: 403 }
      );
    }

    if (!studentProfile.currentClassId) {
      return NextResponse.json(
        {
          error: {
            code: 'NO_CLASS_ASSIGNED',
            message: 'Anda belum terdaftar dalam kelas akademik.',
          },
        },
        { status: 403 }
      );
    }

    const adminClient = createAdminClient();

    // 2. Ambil data kelas dan pastikan mahasiswa adalah ketua kelas aktif
    const { data: currentClass, error: classError } = await adminClient
      .from('classes')
      .select('id, study_program, cohort_year, section, academic_term, leader_student_id, is_active')
      .eq('id', studentProfile.currentClassId)
      .single();

    if (classError || !currentClass) {
      return NextResponse.json(
        {
          error: {
            code: 'CLASS_NOT_FOUND',
            message: 'Kelas akademik tidak ditemukan.',
          },
        },
        { status: 404 }
      );
    }

    if (!currentClass.is_active) {
      return NextResponse.json(
        {
          error: {
            code: 'CLASS_INACTIVE',
            message: 'Kelas akademik berstatus nonaktif.',
          },
        },
        { status: 403 }
      );
    }

    if (currentClass.leader_student_id !== studentProfile.id) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_CLASS_LEADER',
            message: 'Anda bukan ketua kelas aktif dari kelas ini. QR Pass hanya tersedia untuk ketua kelas aktif.',
          },
        },
        { status: 403 }
      );
    }

    // 3. Ambil qr_token_version terkini dari baris mahasiswa
    const { data: studentRecord, error: studentError } = await adminClient
      .from('students')
      .select('qr_token_version, profile_photo_path')
      .eq('id', studentProfile.id)
      .single();

    if (studentError || !studentRecord) {
      return NextResponse.json(
        {
          error: {
            code: 'STUDENT_RECORD_NOT_FOUND',
            message: 'Gagal memuat versi token mahasiswa.',
          },
        },
        { status: 500 }
      );
    }

    const tokenVersion = studentRecord.qr_token_version || 1;

    // 4. Bangkitkan token QR Pass (HS256, 60s, tanpa NIM/PII)
    const token = await generateQrPassToken({
      studentId: studentProfile.id,
      tokenVersion,
    });

    const expiresAt = new Date(Date.now() + QR_TOKEN_LIFETIME_SECONDS * 1000).toISOString();

    return NextResponse.json({
      success: true,
      data: {
        token,
        token_version: tokenVersion,
        expires_at: expiresAt,
        expires_in: QR_TOKEN_LIFETIME_SECONDS,
        student: {
          id: studentProfile.id,
          name: studentProfile.name,
          nim: studentProfile.nim,
          profile_photo_path: studentRecord.profile_photo_path,
          class: {
            id: currentClass.id,
            study_program: currentClass.study_program,
            cohort_year: currentClass.cohort_year,
            section: currentClass.section,
            academic_term: currentClass.academic_term,
          },
        },
      },
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    return NextResponse.json(
      { error: { code: err.code || 'SERVER_ERROR', message: err.message } },
      { status }
    );
  }
}
