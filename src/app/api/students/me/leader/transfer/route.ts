import { requireStudent } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/audit';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const transferSchema = z.object({
  target_student_id: z.string().uuid('ID mahasiswa penerima tidak valid'),
  reason: z.string().max(300, 'Alasan maksimal 300 karakter').optional(),
});

export async function POST(request: Request) {
  try {
    const userContext = await requireStudent();
    const studentProfile = userContext.studentProfile;

    if (!studentProfile || studentProfile.registrationStatus !== 'ACTIVE' || !studentProfile.currentClassId) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Hanya mahasiswa aktif yang terdaftar dalam kelas yang dapat melakukan serah-terima jabatan.',
          },
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = transferSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues[0].message,
          },
        },
        { status: 400 }
      );
    }

    const { target_student_id, reason } = parsed.data;

    // 1. Cegah transfer ke diri sendiri
    if (target_student_id === studentProfile.id) {
      return NextResponse.json(
        {
          error: {
            code: 'CANNOT_TRANSFER_TO_SELF',
            message: 'Tidak dapat mengalihkan jabatan ketua kepada diri sendiri.',
          },
        },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // 2. Coba eksekusi melalui fungsi atomik PostgreSQL transfer_class_leader
    const { data: rpcResult, error: rpcError } = await adminClient.rpc('transfer_class_leader', {
      p_caller_student_id: studentProfile.id,
      p_target_student_id: target_student_id,
      p_reason: reason || null,
    });

    if (!rpcError && rpcResult) {
      return NextResponse.json({
        success: true,
        message: 'Jabatan ketua kelas berhasil dialihkan. QR Pass lama Anda telah dicabut.',
        data: rpcResult,
      });
    }

    // 3. Fallback jika rpc belum termigrasi pada lingkungan test mock
    // Verifikasi kelas pemohon
    const { data: currentClass, error: classError } = await adminClient
      .from('classes')
      .select('id, leader_student_id, is_active')
      .eq('id', studentProfile.currentClassId)
      .single();

    if (classError || !currentClass || !currentClass.is_active) {
      return NextResponse.json(
        { error: { code: 'CLASS_INVALID', message: 'Kelas tidak valid atau berstatus nonaktif.' } },
        { status: 400 }
      );
    }

    if (currentClass.leader_student_id !== studentProfile.id) {
      return NextResponse.json(
        { error: { code: 'NOT_CLASS_LEADER', message: 'Anda bukan ketua kelas aktif dari kelas ini.' } },
        { status: 403 }
      );
    }

    // Verifikasi mahasiswa target
    const { data: targetStudent, error: targetError } = await adminClient
      .from('students')
      .select('id, name, registration_status, current_class_id')
      .eq('id', target_student_id)
      .single();

    if (targetError || !targetStudent) {
      return NextResponse.json(
        { error: { code: 'TARGET_NOT_FOUND', message: 'Mahasiswa penerima tidak ditemukan.' } },
        { status: 404 }
      );
    }

    if (targetStudent.registration_status !== 'ACTIVE') {
      return NextResponse.json(
        {
          error: {
            code: 'TARGET_NOT_ACTIVE',
            message: `Mahasiswa penerima berstatus ${targetStudent.registration_status}. Hanya mahasiswa ACTIVE yang dapat menjadi ketua.`,
          },
        },
        { status: 400 }
      );
    }

    if (targetStudent.current_class_id !== currentClass.id) {
      return NextResponse.json(
        {
          error: {
            code: 'TARGET_NOT_IN_SAME_CLASS',
            message: 'Mahasiswa penerima tidak berada pada kelas yang sama.',
          },
        },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // Perbarui leader_student_id pada kelas
    await adminClient
      .from('classes')
      .update({
        leader_student_id: target_student_id,
        leader_since: now,
        updated_at: now,
      })
      .eq('id', currentClass.id);

    // Ambil dan naikkan versi token ketua lama (+1)
    const { data: callerData } = await adminClient
      .from('students')
      .select('qr_token_version')
      .eq('id', studentProfile.id)
      .single();

    const newVersion = (callerData?.qr_token_version || 1) + 1;

    await adminClient
      .from('students')
      .update({
        qr_token_version: newVersion,
        updated_at: now,
      })
      .eq('id', studentProfile.id);

    // Catat klaim transfer
    const { data: newClaim } = await adminClient
      .from('class_leader_claims')
      .insert({
        class_id: currentClass.id,
        student_id: target_student_id,
        claim_type: 'TRANSFER',
        status: 'APPROVED',
        decided_by: null,
        decided_at: now,
        notes: reason || 'Serah-terima jabatan mandiri oleh ketua kelas aktif',
      })
      .select()
      .single();

    // Catat audit log
    await recordAuditLog(adminClient, {
      action: 'LEADER_TRANSFERRED',
      entityType: 'classes',
      entityId: currentClass.id,
      actorStudentId: studentProfile.id,
      metadata: {
        previous_leader_id: studentProfile.id,
        new_leader_id: target_student_id,
        class_id: currentClass.id,
        claim_id: newClaim?.id,
        reason: reason || null,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Jabatan ketua kelas berhasil dialihkan. QR Pass lama Anda telah dicabut.',
      data: {
        class_id: currentClass.id,
        new_leader_id: target_student_id,
        new_leader_name: targetStudent.name,
        caller_new_token_version: newVersion,
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
