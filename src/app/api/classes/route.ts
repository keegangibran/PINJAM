import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * Endpoint publik/terautentikasi untuk mendapatkan daftar kelas aktif
 * Digunakan pada form registrasi mahasiswa dan pencarian kelas baku.
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: classes, error } = await supabase
      .from('classes')
      .select('id, study_program, cohort_year, section, academic_term, is_active')
      .eq('is_active', true)
      .order('academic_term', { ascending: false })
      .order('study_program', { ascending: true })
      .order('cohort_year', { ascending: false })
      .order('section', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: { code: 'FETCH_CLASSES_FAILED', message: 'Gagal memuat daftar kelas aktif.' } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: classes ?? [],
    });
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Terjadi kesalahan sistem.' } },
      { status: 500 }
    );
  }
}
