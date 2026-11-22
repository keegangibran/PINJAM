import { requireStudent } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/audit';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const claimSchema = z.object({
  class_id: z.string().uuid('ID kelas tidak valid'),
  notes: z.string().max(300).optional(),
});

/**
 * GET /api/students/me/leader/claim
 * Mengambil riwayat klaim ketua kelas dan permohonan pending mahasiswa saat ini.
 */
export async function GET() {
  try {
    const userContext = await requireStudent();
    const studentProfile = userContext.studentProfile;

    if (!studentProfile) {
      return NextResponse.json(
        { error: { code: 'PROFILE_NOT_FOUND', message: 'Profil mahasiswa belum dibuat.' } },
        { status: 404 }
      );
    }

    const adminClient = createAdminClient();
    const { data: claims, error } = await adminClient
      .from('class_leader_claims')
      .select(`
        id,
        class_id,
        claim_type,
        status,
        notes,
        created_at,
        updated_at,
        class:classes (
          id,
          study_program,
          cohort_year,
          section,
          academic_term,
          is_active
        )
      `)
      .eq('student_id', studentProfile.id)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      return NextResponse.json(
        { error: { code: 'FETCH_CLAIMS_FAILED', message: error.message } },
        { status: 500 }
      );
    }

    const pendingClaim = claims?.find((c: any) => c.status === 'PENDING') || null;

    return NextResponse.json({
      success: true,
      data: {
        claims: claims || [],
        pendingClaim,
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
/**
 * POST /api/students/me/leader/claim
 * Mengajukan klaim ketua kelas untuk semester baru atau kelas pergantian.
 * Sesuai PRD FR-01D dan FR-01F:
 * - Hanya mahasiswa ACTIVE yang diizinkan.
 * - Tidak memerlukan foto ulang jika akun sudah terverifikasi ACTIVE.
 * - Mencegah klaim duplikat (409) dan kepemimpinan ganda (400).
 */
export async function POST(request: Request) {
  try {
    const userContext = await requireStudent();
    const studentProfile = userContext.studentProfile;

    if (!studentProfile) {
      return NextResponse.json(
        { error: { code: 'PROFILE_NOT_FOUND', message: 'Profil mahasiswa belum dibuat.' } },
        { status: 404 }
      );
    }

    if (studentProfile.registrationStatus !== 'ACTIVE') {
      return NextResponse.json(
        {
          error: {
            code: 'ACCOUNT_NOT_ACTIVE',
            message: 'Hanya akun mahasiswa aktif yang dapat mengajukan klaim ketua kelas semester baru.',
          },
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = claimSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const { class_id, notes } = parsed.data;
    const adminClient = createAdminClient();

    // 1. Verifikasi kelas tujuan
    const { data: targetClass, error: classError } = await adminClient
      .from('classes')
      .select('id, study_program, cohort_year, section, academic_term, leader_student_id, is_active')
      .eq('id', class_id)
      .single();

    if (classError || !targetClass) {
      return NextResponse.json(
        { error: { code: 'CLASS_NOT_FOUND', message: 'Kelas tidak ditemukan.' } },
        { status: 404 }
      );
    }

    if (!targetClass.is_active) {
      return NextResponse.json(
        { error: { code: 'CLASS_INACTIVE', message: 'Kelas yang dipilih berstatus nonaktif.' } },
        { status: 400 }
      );
    }

    // 2. Cegah klaim jika mahasiswa sudah menjadi ketua aktif kelas ini
    if (targetClass.leader_student_id === studentProfile.id) {
      return NextResponse.json(
        { error: { code: 'ALREADY_CLASS_LEADER', message: 'Anda sudah menjadi ketua aktif pada kelas ini.' } },
        { status: 400 }
      );
    }

    // 3. Cegah pengajuan duplikat jika mahasiswa sudah memiliki klaim PENDING pada kelas ini
    const { data: existingStudentClaim } = await adminClient
      .from('class_leader_claims')
      .select('id, status')
      .eq('class_id', class_id)
      .eq('student_id', studentProfile.id)
      .eq('status', 'PENDING')
      .maybeSingle();

    if (existingStudentClaim) {
      return NextResponse.json(
        {
          error: {
            code: 'DUPLICATE_CLAIM',
            message: 'Anda sudah memiliki permohonan klaim ketua kelas yang sedang menunggu keputusan petugas.',
          },
        },
        { status: 409 }
      );
    }

    // 4. Hubungkan mahasiswa ke kelas baru jika berganti kelas
    await adminClient
      .from('students')
      .update({
        current_class_id: class_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', studentProfile.id);

    // 5. Tentukan tipe klaim: INITIAL atau REPLACEMENT
    let claimType: 'INITIAL' | 'REPLACEMENT' = 'INITIAL';

    if (targetClass.leader_student_id) {
      // Kelas sudah memiliki ketua aktif
      claimType = 'REPLACEMENT';
    } else {
      // Periksa apakah sudah ada pendaftar lain dengan klaim INITIAL yang masih PENDING
      const { data: existingInitial } = await adminClient
        .from('class_leader_claims')
        .select('id, student_id')
        .eq('class_id', class_id)
        .eq('claim_type', 'INITIAL')
        .eq('status', 'PENDING')
        .maybeSingle();

      if (existingInitial && existingInitial.student_id !== studentProfile.id) {
        claimType = 'REPLACEMENT';
      }
    }

    // 6. Masukkan baris klaim baru
    const { data: newClaim, error: claimError } = await adminClient
      .from('class_leader_claims')
      .insert({
        class_id,
        student_id: studentProfile.id,
        claim_type: claimType,
        status: 'PENDING',
        notes: notes || `Pengajuan klaim ${claimType} ketua kelas semester berjalan`,
      })
      .select()
      .single();

    if (claimError) {
      return NextResponse.json(
        { error: { code: 'CLAIM_FAILED', message: claimError.message } },
        { status: 500 }
      );
    }

    await recordAuditLog(adminClient, {
      action: 'LEADER_CLAIM_DECIDED',
      entityType: 'class_leader_claims',
      entityId: newClaim.id,
      actorStudentId: studentProfile.id,
      metadata: {
        action: 'SUBMIT_CLAIM',
        claim_type: claimType,
        class_id,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: `Klaim ketua kelas (${claimType}) berhasil diajukan dan menunggu persetujuan petugas TU.`,
        data: newClaim,
      },
      { status: 201 }
    );
  } catch (err: any) {
    const status = err.statusCode || 500;
    return NextResponse.json(
      { error: { code: err.code || 'SERVER_ERROR', message: err.message } },
      { status }
    );
  }
}

