import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') ?? '/login';

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent('Verifikasi email gagal atau tautan telah kedaluwarsa.')}`, request.url)
      );
    }

    if (data.user) {
      // Periksa dan perbarui status mahasiswa jika masih UNVERIFIED_EMAIL (Penyelesaian GAP-06)
      const adminClient = createAdminClient();
      const { data: student } = await adminClient
        .from('students')
        .select('id, registration_status')
        .eq('auth_user_id', data.user.id)
        .single();

      if (student && student.registration_status === 'UNVERIFIED_EMAIL') {
        await adminClient
          .from('students')
          .update({
            registration_status: 'PENDING_DOCUMENT',
            updated_at: new Date().toISOString(),
          })
          .eq('id', student.id);
      }
    }
  }

  return NextResponse.redirect(new URL(next, request.url));
}

