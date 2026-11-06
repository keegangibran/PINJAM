import { requireStudent } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const userContext = await requireStudent();
    const studentProfile = userContext.studentProfile;

    if (!studentProfile || studentProfile.registrationStatus !== 'ACTIVE' || !studentProfile.currentClassId) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Hanya mahasiswa aktif yang terdaftar dalam kelas yang dapat melihat daftar rekan sekelas.',
          },
        },
        { status: 403 }
      );
    }

    const adminClient = createAdminClient();

    // Verifikasi bahwa pemohon adalah ketua kelas aktif
    const { data: currentClass, error: classError } = await adminClient
      .from('classes')
      .select('id, leader_student_id, is_active')
      .eq('id', studentProfile.currentClassId)
      .single();

    if (classError || !currentClass || !currentClass.is_active || currentClass.leader_student_id !== studentProfile.id) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_CLASS_LEADER',
            message: 'Hanya ketua kelas aktif yang dapat mengakses daftar calon penerima jabatan.',
          },
        },
        { status: 403 }
      );
    }

    // Ambil seluruh rekan sekelas yang berstatus ACTIVE (selain pemohon)
    const { data: classmates, error: fetchError } = await adminClient
      .from('students')
      .select('id, name, nim')
      .eq('current_class_id', studentProfile.currentClassId)
      .eq('registration_status', 'ACTIVE')
      .neq('id', studentProfile.id)
      .order('name', { ascending: true });

    if (fetchError) {
      return NextResponse.json(
        {
          error: {
            code: 'FETCH_FAILED',
            message: fetchError.message,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: classmates || [],
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    return NextResponse.json(
      { error: { code: err.code || 'SERVER_ERROR', message: err.message } },
      { status }
    );
  }
}
