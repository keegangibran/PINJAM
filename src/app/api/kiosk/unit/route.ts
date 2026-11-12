import { requireStaff } from '@/lib/auth/guards';
import { validateProjectorScanInput } from '@/lib/kiosk-scanner';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const unitSchema = z.object({
  projector_code: z.string().min(1, 'Kode proyektor wajib diisi'),
});

export async function POST(request: Request) {
  try {
    await requireStaff();
    const body = await request.json();
    const parsed = unitSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const validation = validateProjectorScanInput(parsed.data.projector_code);
    if (!validation.valid) {
      return NextResponse.json(
        { error: { code: validation.errorCode, message: validation.message } },
        { status: 400 }
      );
    }

    const code = validation.normalizedCode;
    const adminClient = createAdminClient();

    // 1. Ambil data proyektor
    const { data: projector, error: projectorError } = await adminClient
      .from('projectors')
      .select('id, code, name, status, notes')
      .eq('code', code)
      .single();

    if (projectorError || !projector) {
      return NextResponse.json(
        {
          error: {
            code: 'PROJECTOR_NOT_FOUND',
            message:
              'Kode proyektor tidak ditemukan. Pastikan QR Code yang dipindai merupakan QR Code unit yang terdaftar.',
          },
        },
        { status: 404 }
      );
    }

    // 2. Jika unit sedang dipinjam (BORROWED), ambil data peminjam aktif dan due_at (FR-05)
    let activeLoan = null;

    if (projector.status === 'BORROWED') {
      const { data: loan } = await adminClient
        .from('loans')
        .select(`
          id,
          student_id,
          borrowed_at,
          due_at,
          students (
            id,
            name,
            nim,
            profile_photo_path
          ),
          classes (
            study_program,
            cohort_year,
            section,
            academic_term
          )
        `)
        .eq('projector_id', projector.id)
        .eq('status', 'ACTIVE')
        .maybeSingle();

      if (loan) {
        const student = loan.students as any;
        const cls = loan.classes as any;
        const isOverdue = new Date() > new Date(loan.due_at);

        let signedPhotoUrl: string | null = null;
        if (student?.profile_photo_path) {
          const { data: signedData } = await adminClient.storage
            .from('smartprojex-media')
            .createSignedUrl(student.profile_photo_path, 60);
          if (signedData?.signedUrl) {
            signedPhotoUrl = signedData.signedUrl;
          }
        }

        activeLoan = {
          loan_id: loan.id,
          student_id: student?.id,
          student_name: student?.name,
          student_nim: student?.nim,
          class_name: cls ? `${cls.study_program} ${cls.cohort_year}-${cls.section}` : '',
          borrowed_at: loan.borrowed_at,
          due_at: loan.due_at,
          is_overdue: isOverdue,
          profile_photo_signed_url: signedPhotoUrl,
        };
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: projector.id,
        code: projector.code,
        name: projector.name,
        status: projector.status,
        notes: projector.notes,
        active_loan: activeLoan,
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

