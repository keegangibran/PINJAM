import { requireStaff } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const searchSchema = z.object({
  q: z.string().min(2, 'Kata kunci pencarian minimal 2 karakter'),
});

export async function POST(request: Request) {
  try {
    await requireStaff();
    const body = await request.json();
    const parsed = searchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const { q } = parsed.data;
    const adminClient = createAdminClient();

    // 1. Kueri mahasiswa berstatus ACTIVE yang cocok dengan NIM atau Nama
    const { data: students, error: studentError } = await adminClient
      .from('students')
      .select(`
        id,
        nim,
        name,
        profile_photo_path,
        current_class_id,
        classes:current_class_id (
          id,
          study_program,
          cohort_year,
          section,
          academic_term,
          leader_student_id,
          is_active
        )
      `)
      .eq('registration_status', 'ACTIVE')
      .or(`nim.ilike.%${q}%,name.ilike.%${q}%`)
      .limit(10);

    if (studentError) {
      return NextResponse.json(
        { error: { code: 'SEARCH_FAILED', message: studentError.message } },
        { status: 500 }
      );
    }

    // 2. Filter hanya mahasiswa yang saat ini menjabat sebagai ketua aktif pada kelas aktif
    const activeLeaders = (students || []).filter((s) => {
      const cls = s.classes as any;
      return cls && cls.is_active && cls.leader_student_id === s.id;
    });

    // 3. Siapkan signed URL foto referensi berumur pendek (60s) untuk pembanding visual manual oleh staf TU
    const results = await Promise.all(
      activeLeaders.map(async (s) => {
        const cls = s.classes as any;
        let signedPhotoUrl: string | null = null;

        if (s.profile_photo_path) {
          const { data: signedData } = await adminClient.storage
            .from('smartprojex-media')
            .createSignedUrl(s.profile_photo_path, 60);
          if (signedData?.signedUrl) {
            signedPhotoUrl = signedData.signedUrl;
          }
        }

        return {
          id: s.id,
          name: s.name,
          nim: s.nim,
          class_id: cls.id,
          class_name: `${cls.study_program} ${cls.cohort_year}-${cls.section} (${cls.academic_term})`,
          profile_photo_signed_url: signedPhotoUrl,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: results,
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    return NextResponse.json(
      { error: { code: err.code || 'SERVER_ERROR', message: err.message } },
      { status }
    );
  }
}

