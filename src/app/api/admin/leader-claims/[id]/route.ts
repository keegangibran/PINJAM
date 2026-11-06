import { requireStaff } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/audit';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const claimDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  notes: z.string().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const staff = await requireStaff();
    const { id: claimId } = await context.params;

    if (!claimId) {
      return NextResponse.json(
        { error: { code: 'INVALID_ID', message: 'ID klaim tidak valid.' } },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = claimDecisionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const { decision, notes } = parsed.data;
    const adminClient = createAdminClient();

    // 1. Ambil data klaim
    const { data: claim, error: claimError } = await adminClient
      .from('class_leader_claims')
      .select('id, class_id, student_id, claim_type, status')
      .eq('id', claimId)
      .single();

    if (claimError || !claim) {
      return NextResponse.json(
        { error: { code: 'CLAIM_NOT_FOUND', message: 'Klaim ketua kelas tidak ditemukan.' } },
        { status: 404 }
      );
    }

    if (claim.status !== 'PENDING') {
      return NextResponse.json(
        { error: { code: 'CLAIM_ALREADY_DECIDED', message: `Klaim ini sudah berstatus ${claim.status}.` } },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    if (decision === 'APPROVED') {
      // Pastikan mahasiswa pemohon berstatus ACTIVE
      const { data: student } = await adminClient
        .from('students')
        .select('id, registration_status, name')
        .eq('id', claim.student_id)
        .single();

      if (!student || student.registration_status !== 'ACTIVE') {
        return NextResponse.json(
          { error: { code: 'STUDENT_NOT_ACTIVE', message: 'Hanya mahasiswa dengan akun ACTIVE yang dapat disetujui sebagai ketua kelas.' } },
          { status: 400 }
        );
      }

      // Ambil ketua kelas lama jika ada
      const { data: targetClass } = await adminClient
        .from('classes')
        .select('id, leader_student_id')
        .eq('id', claim.class_id)
        .single();

      if (targetClass?.leader_student_id && targetClass.leader_student_id !== claim.student_id) {
        // Cabut QR ketua lama (naikkan qr_token_version)
        const { data: oldLeader } = await adminClient
          .from('students')
          .select('qr_token_version')
          .eq('id', targetClass.leader_student_id)
          .single();

        if (oldLeader) {
          await adminClient
            .from('students')
            .update({
              qr_token_version: (oldLeader.qr_token_version || 1) + 1,
              updated_at: now,
            })
            .eq('id', targetClass.leader_student_id);
        }
      }

      // Tetapkan ketua baru pada kelas
      await adminClient
        .from('classes')
        .update({
          leader_student_id: claim.student_id,
          leader_since: now,
          updated_at: now,
        })
        .eq('id', claim.class_id);

      // Perbarui status klaim menjadi APPROVED
      await adminClient
        .from('class_leader_claims')
        .update({
          status: 'APPROVED',
          decided_by: staff.staffProfile?.id,
          decided_at: now,
          notes: notes || null,
          updated_at: now,
        })
        .eq('id', claim.id);

      await recordAuditLog(adminClient, {
        action: 'LEADER_CLAIM_DECIDED',
        entityType: 'class_leader_claims',
        entityId: claim.id,
        actorStaffId: staff.staffProfile?.id,
        actorStudentId: claim.student_id,
        metadata: {
          decision: 'APPROVED',
          claim_type: claim.claim_type,
          class_id: claim.class_id,
          notes,
        },
      });
    } else {
      // Tolak klaim
      await adminClient
        .from('class_leader_claims')
        .update({
          status: 'REJECTED',
          decided_by: staff.staffProfile?.id,
          decided_at: now,
          notes: notes || 'Klaim ditolak oleh petugas TU',
          updated_at: now,
        })
        .eq('id', claim.id);

      await recordAuditLog(adminClient, {
        action: 'LEADER_CLAIM_DECIDED',
        entityType: 'class_leader_claims',
        entityId: claim.id,
        actorStaffId: staff.staffProfile?.id,
        actorStudentId: claim.student_id,
        metadata: {
          decision: 'REJECTED',
          claim_type: claim.claim_type,
          class_id: claim.class_id,
          notes,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: `Klaim ketua kelas berhasil diputuskan: ${decision}`,
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    return NextResponse.json(
      { error: { code: err.code || 'SERVER_ERROR', message: err.message } },
      { status }
    );
  }
}
