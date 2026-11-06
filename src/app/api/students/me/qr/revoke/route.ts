import { requireStudent } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/audit';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const userContext = await requireStudent();
    const studentProfile = userContext.studentProfile;

    if (!studentProfile) {
      return NextResponse.json(
        {
          error: {
            code: 'PROFILE_NOT_FOUND',
            message: 'Profil mahasiswa belum dibuat.',
          },
        },
        { status: 404 }
      );
    }

    if (studentProfile.registrationStatus !== 'ACTIVE') {
      return NextResponse.json(
        {
          error: {
            code: 'ACCOUNT_NOT_ACTIVE',
            message: 'Hanya akun mahasiswa aktif yang dapat mencabut QR Pass.',
          },
        },
        { status: 403 }
      );
    }

    const adminClient = createAdminClient();

    // 1. Ambil versi saat ini
    const { data: student, error: fetchError } = await adminClient
      .from('students')
      .select('qr_token_version')
      .eq('id', studentProfile.id)
      .single();

    if (fetchError || !student) {
      return NextResponse.json(
        {
          error: {
            code: 'STUDENT_NOT_FOUND',
            message: 'Data mahasiswa tidak ditemukan.',
          },
        },
        { status: 404 }
      );
    }

    const currentVersion = student.qr_token_version || 1;
    const newVersion = currentVersion + 1;

    // 2. Naikkan versi token secara atomik
    const { error: updateError } = await adminClient
      .from('students')
      .update({
        qr_token_version: newVersion,
        updated_at: new Date().toISOString(),
      })
      .eq('id', studentProfile.id);

    if (updateError) {
      return NextResponse.json(
        {
          error: {
            code: 'UPDATE_FAILED',
            message: updateError.message,
          },
        },
        { status: 500 }
      );
    }

    // 3. Catat audit log (tanpa memuat token atau rahasia apapun)
    await recordAuditLog(adminClient, {
      action: 'QR_REVOKED',
      entityType: 'students',
      entityId: studentProfile.id,
      actorStudentId: studentProfile.id,
      metadata: {
        previous_version: currentVersion,
        new_version: newVersion,
        reason: 'Pencabutan mandiri darurat oleh ketua kelas',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'QR Pass berhasil dicabut. Seluruh QR Code sebelumnya langsung tidak berlaku.',
      data: {
        new_version: newVersion,
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
