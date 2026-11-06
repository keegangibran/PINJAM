import { requireStaff } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyQrPassToken } from '@/lib/qr-token';
import { recordAuditLog } from '@/lib/audit';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const sessionSchema = z.union([
  z.object({
    student_token: z.string().min(1, 'Token QR wajib diisi'),
  }),
  z.object({
    student_id: z.string().uuid('ID mahasiswa tidak valid'),
    reason: z.string().min(3, 'Alasan pencarian manual minimal 3 karakter'),
  }),
]);

export async function POST(request: Request) {
  try {
    const staff = await requireStaff();
    const body = await request.json();
    const parsed = sessionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    let studentId: string;
    let identificationMethod: 'QR' | 'MANUAL_LOOKUP';
    let manualReason: string | null = null;

    if ('student_token' in parsed.data) {
      // Jalur A: Pemindaian QR Pass Mahasiswa
      const verification = await verifyQrPassToken({ token: parsed.data.student_token });

      if (!verification.valid) {
        return NextResponse.json(
          { error: { code: verification.error, message: verification.message } },
          { status: 400 }
        );
      }

      studentId = verification.payload.studentId;
      identificationMethod = 'QR';

      // Validasi token version terhadap versi terkini di database
      const { data: studentCheck } = await adminClient
        .from('students')
        .select('qr_token_version')
        .eq('id', studentId)
        .single();

      if (!studentCheck || studentCheck.qr_token_version !== verification.payload.tokenVersion) {
        return NextResponse.json(
          {
            error: {
              code: 'VERSION_MISMATCH',
              message: 'Versi QR Pass usang atau telah dicabut. Silakan minta mahasiswa memuat ulang QR Pass.',
            },
          },
          { status: 400 }
        );
      }
    } else {
      // Jalur B: Pencarian Manual Ketua Kelas (FR-08)
      studentId = parsed.data.student_id;
      identificationMethod = 'MANUAL_LOOKUP';
      manualReason = parsed.data.reason;
    }

    // 1. Ambil data mahasiswa
    const { data: student, error: studentError } = await adminClient
      .from('students')
      .select('id, name, nim, registration_status, current_class_id, profile_photo_path')
      .eq('id', studentId)
      .single();

    if (studentError || !student) {
      return NextResponse.json(
        { error: { code: 'STUDENT_NOT_FOUND', message: 'Data mahasiswa tidak ditemukan.' } },
        { status: 404 }
      );
    }

    if (student.registration_status !== 'ACTIVE') {
      return NextResponse.json(
        {
          error: {
            code: 'ACCOUNT_NOT_ACTIVE',
            message: `Akun mahasiswa berstatus ${student.registration_status}. Hanya akun ACTIVE yang dapat melakukan transaksi.`,
          },
        },
        { status: 403 }
      );
    }

    if (!student.current_class_id) {
      return NextResponse.json(
        { error: { code: 'NO_CLASS_ASSIGNED', message: 'Mahasiswa tidak terdaftar dalam kelas akademik.' } },
        { status: 403 }
      );
    }

    // 2. Ambil data kelas dan verifikasi peran ketua kelas aktif
    const { data: currentClass, error: classError } = await adminClient
      .from('classes')
      .select('id, study_program, cohort_year, section, academic_term, leader_student_id, is_active')
      .eq('id', student.current_class_id)
      .single();

    if (classError || !currentClass || !currentClass.is_active) {
      return NextResponse.json(
        { error: { code: 'CLASS_INACTIVE', message: 'Kelas mahasiswa berstatus nonaktif atau tidak ditemukan.' } },
        { status: 400 }
      );
    }

    if (currentClass.leader_student_id !== student.id) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_CLASS_LEADER',
            message: 'Mahasiswa bukan ketua kelas aktif dari kelas bersangkutan.',
          },
        },
        { status: 403 }
      );
    }

    // 3. Buat sesi Kiosk singkat (maksimal 120 detik terikat ke mahasiswa, PRD 7.1)
    const expiresAt = new Date(Date.now() + 120 * 1000).toISOString();

    const { data: session, error: sessionError } = await adminClient
      .from('kiosk_sessions')
      .insert({
        student_id: student.id,
        class_id: currentClass.id,
        created_by_staff_id: staff.staffProfile?.id,
        identification_method: identificationMethod,
        manual_reason: manualReason,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: { code: 'SESSION_CREATE_FAILED', message: sessionError?.message || 'Gagal membuat sesi Kiosk.' } },
        { status: 500 }
      );
    }

    // 4. Jika pencarian manual, catat audit log MANUAL_LOOKUP
    if (identificationMethod === 'MANUAL_LOOKUP') {
      await recordAuditLog(adminClient, {
        action: 'MANUAL_LOOKUP',
        entityType: 'kiosk_sessions',
        entityId: session.id,
        actorStaffId: staff.staffProfile?.id,
        actorStudentId: student.id,
        metadata: {
          student_nim: student.nim,
          student_name: student.name,
          reason: manualReason,
        },
      });
    }

    // 5. Terbitkan signed URL foto referensi wajah (60 detik) untuk pembanding visual petugas di Kiosk
    let signedPhotoUrl: string | null = null;
    if (student.profile_photo_path) {
      const { data: signedData } = await adminClient.storage
        .from('smartprojex-media')
        .createSignedUrl(student.profile_photo_path, 60);

      if (signedData?.signedUrl) {
        signedPhotoUrl = signedData.signedUrl;

        await recordAuditLog(adminClient, {
          action: 'PHOTO_SIGNED_URL',
          entityType: 'storage',
          entityId: student.profile_photo_path,
          actorStaffId: staff.staffProfile?.id,
          metadata: {
            context: 'KIOSK_IDENTIFICATION',
            path: student.profile_photo_path,
            expires_in_seconds: 60,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        kiosk_session_id: session.id,
        expires_at: expiresAt,
        student: {
          id: student.id,
          name: student.name,
          nim: student.nim,
          class_name: `${currentClass.study_program} ${currentClass.cohort_year}-${currentClass.section} (${currentClass.academic_term})`,
          profile_photo_signed_url: signedPhotoUrl,
          identification_method: identificationMethod,
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

