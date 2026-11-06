import { requireAdmin } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/audit';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const copyTermSchema = z.object({
  source_term: z.string().min(4, 'Semester asal wajib diisi'),
  target_term: z.string().min(4, 'Semester tujuan baru wajib diisi'),
});

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const parsed = copyTermSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const { source_term, target_term } = parsed.data;
    const adminClient = createAdminClient();

    // 1. Ambil seluruh kelas aktif pada semester sumber
    const { data: sourceClasses, error: fetchError } = await adminClient
      .from('classes')
      .select('study_program, cohort_year, section')
      .eq('academic_term', source_term)
      .eq('is_active', true);

    if (fetchError || !sourceClasses || sourceClasses.length === 0) {
      return NextResponse.json(
        { error: { code: 'NO_CLASSES_FOUND', message: `Tidak ada kelas aktif ditemukan pada semester ${source_term}.` } },
        { status: 404 }
      );
    }

    // 2. Siapkan data kelas baru tanpa ketua kelas (leader_student_id = null)
    const newClassesPayload = sourceClasses.map((cls) => ({
      study_program: cls.study_program,
      cohort_year: cls.cohort_year,
      section: cls.section,
      academic_term: target_term.toUpperCase(),
      leader_student_id: null,
      leader_since: null,
      is_active: true,
    }));

    // 3. Masukkan ke database (abaikan yang duplikat jika ada yang sudah dibuat)
    const { data: inserted, error: insertError } = await adminClient
      .from('classes')
      .upsert(newClassesPayload, {
        onConflict: 'study_program, cohort_year, section, academic_term',
        ignoreDuplicates: true,
      })
      .select();

    if (insertError) {
      return NextResponse.json(
        { error: { code: 'COPY_FAILED', message: insertError.message } },
        { status: 500 }
      );
    }

    await recordAuditLog(adminClient, {
      action: 'SETTINGS_UPDATED',
      entityType: 'classes',
      actorStaffId: admin.staffProfile?.id,
      metadata: {
        action: 'COPY_SEMESTER_CLASSES',
        source_term,
        target_term,
        classes_copied_count: inserted?.length || 0,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Berhasil menyalin ${inserted?.length || 0} kelas ke semester ${target_term}.`,
      data: inserted,
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    return NextResponse.json(
      { error: { code: err.code || 'SERVER_ERROR', message: err.message } },
      { status }
    );
  }
}

