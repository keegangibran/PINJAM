import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();

    return NextResponse.json({ success: true, message: 'Berhasil keluar.' });
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'LOGOUT_ERROR', message: 'Gagal memproses keluar akun.' } },
      { status: 500 }
    );
  }
}
