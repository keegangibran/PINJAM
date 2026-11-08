import { requireAdmin } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/audit';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const createClassSchema = z.object({
  study_program: z.string().min(2, 'Program studi wajib diisi'),
  cohort_year: z.number().int().min(2000).max(2100, 'Tahun angkatan tidak valid'),
  section: z.string().min(1, 'Rombel wajib diisi (mis. A, B, C)'),
  academic_term: z.string().min(4, 'Semester akademik wajib diisi (mis. 2026/2027-GANJIL)'),
});

const updateClassSchema = z.object({
  id: z.string().uuid('ID kelas tidak valid'),
  study_program: z.string().min(2).optional(),
  cohort_year: z.number().int().min(2000).max(2100).optional(),
  section: z.string().min(1).optional(),
  academic_term: z.string().min(4).optional(),
  is_active: z.boolean().optional(),
  release_leader: z.boolean().optional(),
  release_reason: z.string().optional(),
});

export async function GET() {
  try {
    const admin = await requireAdmin();
    const adminClient = createAdminClient();

    const { data: classes, error } = await adminClient
      .from('classes')
      .select(`
        id,
        study_program,
        cohort_year,
        section,
        academic_term,
        leader_student_id,
        leader_since,
        is_active,
        created_at,
        leader:students!fk_classes_leader_student (
          id,
          name,
          nim,
          email,
          registration_status
        )
      `)
      .order('academic_term', { ascending: false })
      .order('study_program', { ascending: true })
      .order('cohort_year', { ascending: false })
      .order('section', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: { code: 'FETCH_FAILED', message: error.message } },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: classes });
  } catch (err: any) {
    const status = err.statusCode || 500;
    return NextResponse.json(
      { error: { code: err.code || 'SERVER_ERROR', message: err.message } },
      { status }
    );
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const parsed = createClassSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const { study_program, cohort_year, section, academic_term } = parsed.data;
    const adminClient = createAdminClient();

    // Periksa apakah kelas dengan kombinasi baku ini sudah ada
    const { data: existing } = await adminClient
      .from('classes')
      .select('id')
      .eq('study_program', study_program)
      .eq('cohort_year', cohort_year)
      .eq('section', section)
      .eq('academic_term', academic_term)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: { code: 'DUPLICATE_CLASS', message: 'Kelas dengan kombinasi prodi, angkatan, rombel, dan semester ini sudah terdaftar.' } },
        { status: 409 }
      );
    }

    const { data: newClass, error: insertError } = await adminClient
      .from('classes')
      .insert({
        study_program,
        cohort_year,
        section: section.toUpperCase(),
        academic_term: academic_term.toUpperCase(),
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: { code: 'INSERT_FAILED', message: insertError.message } },
        { status: 500 }
      );
    }

    await recordAuditLog(adminClient, {
      action: 'SETTINGS_UPDATED',
      entityType: 'classes',
      entityId: newClass.id,
      actorStaffId: admin.staffProfile?.id,
      metadata: {
        action: 'CREATE_CLASS',
        details: `${study_program} ${cohort_year}-${section} (${academic_term})`,
      },
    });

    return NextResponse.json({ success: true, data: newClass }, { status: 201 });
  } catch (err: any) {
    const status = err.statusCode || 500;
    return NextResponse.json(
      { error: { code: err.code || 'SERVER_ERROR', message: err.message } },
      { status }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const parsed = updateClassSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const { id, release_leader, release_reason, ...updateFields } = parsed.data;
    const adminClient = createAdminClient();

    // 1. Ambil data kelas saat ini
    const { data: currentClass, error: fetchError } = await adminClient
      .from('classes')
      .select('id, leader_student_id, is_active')
      .eq('id', id)
      .single();

    if (fetchError || !currentClass) {
      return NextResponse.json(
        { error: { code: 'CLASS_NOT_FOUND', message: 'Kelas tidak ditemukan.' } },
        { status: 404 }
      );
    }

    const payload: Record<string, any> = { ...updateFields };

    // 2. Alur pelepasan ketua kelas manual oleh Admin (FR-18)
    if (release_leader && currentClass.leader_student_id) {
      payload.leader_student_id = null;
      payload.leader_since = null;

      // Naikkan qr_token_version mahasiswa agar QR lamanya langsung gugur
      const { data: student } = await adminClient
        .from('students')
        .select('qr_token_version')
        .eq('id', currentClass.leader_student_id)
        .single();

      if (student) {
        await adminClient
          .from('students')
          .update({
            qr_token_version: (student.qr_token_version || 1) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', currentClass.leader_student_id);
      }

      await recordAuditLog(adminClient, {
        action: 'LEADER_REVOKED',
        entityType: 'classes',
        entityId: id,
        actorStaffId: admin.staffProfile?.id,
        metadata: {
          previous_leader_student_id: currentClass.leader_student_id,
          reason: release_reason || 'Dilepas manual oleh administrator',
        },
      });
    }

    payload.updated_at = new Date().toISOString();

    const { data: updatedClass, error: updateError } = await adminClient
      .from('classes')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: { code: 'UPDATE_FAILED', message: updateError.message } },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: updatedClass });
  } catch (err: any) {
    const status = err.statusCode || 500;
    return NextResponse.json(
      { error: { code: err.code || 'SERVER_ERROR', message: err.message } },
      { status }
    );
  }
}

