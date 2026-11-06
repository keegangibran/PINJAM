import { requireStaff } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/audit';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const decisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT', 'REQUEST_RESUBMISSION']),
  checks: z.object({
    face_match: z.boolean(),
    name_match: z.boolean(),
    status_confirmed: z.boolean(),
  }),
  notes: z.string().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ studentId: string }> }
) {
  try {
    const staff = await requireStaff();
    const { studentId } = await context.params;

    if (!studentId) {
      return NextResponse.json(
        { error: { code: 'INVALID_ID', message: 'ID mahasiswa tidak valid.' } },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = decisionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const { decision, checks, notes } = parsed.data;

    // Validasi aturan PRD FR-01B & FR-01C:
    // Keputusan APPROVE mewajibkan ketiga centang bernilai true
    if (decision === 'APPROVE') {
      if (!checks.face_match || !checks.name_match || !checks.status_confirmed) {
        return NextResponse.json(
          {
            error: {
              code: 'CHECKS_INCOMPLETE',
              message: 'Ketiga centang pemeriksaan manual (kesesuaian wajah, kesesuaian nama, dan konfirmasi status ketua kelas) wajib terpenuhi untuk menyetujui akun.',
            },
          },
          { status: 400 }
        );
      }
    } else {
      // Penolakan atau permintaan perbaikan memerlukan catatan alasan
      if (!notes || notes.trim() === '') {
        return NextResponse.json(
          {
            error: {
              code: 'NOTES_REQUIRED',
              message: 'Alasan penolakan atau permintaan perbaikan wajib dicatat oleh petugas.',
            },
          },
          { status: 400 }
        );
      }
    }

    const adminClient = createAdminClient();

    // 1. Ambil data mahasiswa saat ini
    const { data: student, error: fetchError } = await adminClient
      .from('students')
      .select('id, nim, name, current_class_id, verification_document_path, registration_status')
      .eq('id', studentId)
      .single();

    if (fetchError || !student) {
      return NextResponse.json(
        { error: { code: 'STUDENT_NOT_FOUND', message: 'Data mahasiswa tidak ditemukan.' } },
        { status: 404 }
      );
    }

    // 2. Jika APPROVE, periksa kembali partial unique index: tidak boleh ada akun ACTIVE lain dengan NIM yang sama
    if (decision === 'APPROVE') {
      const { data: existingActive } = await adminClient
        .from('students')
        .select('id, name')
        .eq('nim', student.nim)
        .eq('registration_status', 'ACTIVE')
        .neq('id', student.id)
        .single();

      if (existingActive) {
        return NextResponse.json(
          {
            error: {
              code: 'ACTIVE_NIM_EXISTS',
              message: `Tidak dapat menyetujui akun: Sudah ada akun ACTIVE lain atas nama ${existingActive.name} dengan NIM ${student.nim}. Hanya 1 akun aktif yang diizinkan per NIM.`,
            },
          },
          { status: 409 }
        );
      }
    }

    const newStatus =
      decision === 'APPROVE'
        ? 'ACTIVE'
        : decision === 'REJECT'
        ? 'REJECTED'
        : 'RESUBMISSION_REQUIRED';

    const now = new Date().toISOString();

    // 3. Perbarui baris students
    const { error: updateError } = await adminClient
      .from('students')
      .update({
        registration_status: newStatus,
        verification_checks: checks,
        verification_notes: notes || null,
        verified_by: staff.staffProfile?.id,
        verified_at: now,
        verification_document_path: null, // Dikosongkan dari DB setelah berkas dihapus
        updated_at: now,
      })
      .eq('id', student.id);

    if (updateError) {
      return NextResponse.json(
        { error: { code: 'UPDATE_FAILED', message: updateError.message } },
        { status: 500 }
      );
    }

    // 4. Jika disetujui (APPROVE), tangani klaim ketua kelas (FR-01D)
    if (decision === 'APPROVE' && student.current_class_id) {
      // Ambil klaim calon ketua awal (INITIAL) milik mahasiswa ini
      const { data: initialClaim } = await adminClient
        .from('class_leader_claims')
        .select('id, status')
        .eq('student_id', student.id)
        .eq('class_id', student.current_class_id)
        .eq('claim_type', 'INITIAL')
        .eq('status', 'PENDING')
        .maybeSingle();

      if (initialClaim) {
        // Tetapkan mahasiswa sebagai ketua kelas di tabel classes
        await adminClient
          .from('classes')
          .update({
            leader_student_id: student.id,
            leader_since: now,
            updated_at: now,
          })
          .eq('id', student.current_class_id);

        // Ubah status klaim INITIAL menjadi APPROVED
        await adminClient
          .from('class_leader_claims')
          .update({
            status: 'APPROVED',
            decided_by: staff.staffProfile?.id,
            decided_at: now,
            updated_at: now,
          })
          .eq('id', initialClaim.id);

        await recordAuditLog(adminClient, {
          action: 'LEADER_CLAIM_DECIDED',
          entityType: 'class_leader_claims',
          entityId: initialClaim.id,
          actorStaffId: staff.staffProfile?.id,
          actorStudentId: student.id,
          metadata: {
            claim_type: 'INITIAL',
            status: 'APPROVED',
            class_id: student.current_class_id,
          },
        });
      }
    } else if (decision === 'REJECT') {
      // Jika ditolak, batalkan klaim PENDING mahasiswa ini jika ada
      await adminClient
        .from('class_leader_claims')
        .update({
          status: 'REJECTED',
          decided_by: staff.staffProfile?.id,
          decided_at: now,
          notes: notes || 'Akun mahasiswa ditolak saat verifikasi tatap muka',
          updated_at: now,
        })
        .eq('student_id', student.id)
        .eq('status', 'PENDING');
    }

    // 5. PENGHAPUSAN INSTAN FOTO DOKUMEN IDENTITAS (NFR-08 & FR-01C)
    // Foto KTM/KTP wajib dihapus segera dari storage setelah keputusan dibuat
    if (student.verification_document_path) {
      try {
        await adminClient.storage
          .from('smartprojex-media')
          .remove([student.verification_document_path]);
      } catch (storageErr) {
        console.error('Failed to remove document photo immediately:', storageErr);
      }
    }

    // 6. Catat entri audit log keputusan verifikasi (FR-19)
    await recordAuditLog(adminClient, {
      action: 'VERIFICATION_DECIDED',
      entityType: 'students',
      entityId: student.id,
      actorStaffId: staff.staffProfile?.id,
      actorStudentId: student.id,
      metadata: {
        decision,
        checks,
        notes: notes || null,
        document_photo_deleted: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Verifikasi berhasil diputuskan: ${decision}`,
      data: {
        student_id: student.id,
        new_status: newStatus,
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

