import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(6, 'Kata sandi minimal 6 karakter'),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;
    const supabase = await createServerSupabaseClient();

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: { code: 'INVALID_CREDENTIALS', message: 'Email atau kata sandi salah. Silakan coba lagi.' } },
        { status: 401 }
      );
    }

    // Periksa peran pengguna di sisi server
    const adminClient = createAdminClient();

    // 1. Cek staf / admin
    const { data: staff } = await adminClient
      .from('staff_profiles')
      .select('id, name, role, is_active')
      .eq('auth_user_id', authData.user.id)
      .single();

    if (staff) {
      if (!staff.is_active) {
        await supabase.auth.signOut();
        return NextResponse.json(
          { error: { code: 'ACCOUNT_DISABLED', message: 'Akun petugas Anda telah dinonaktifkan oleh administrator.' } },
          { status: 403 }
        );
      }

      return NextResponse.json({
        success: true,
        role: staff.role,
        name: staff.name,
        redirectTo: '/admin',
      });
    }

    // 2. Cek mahasiswa
    const { data: student } = await adminClient
      .from('students')
      .select('id, name, registration_status')
      .eq('auth_user_id', authData.user.id)
      .single();

    if (student) {
      let currentStatus = student.registration_status;

      // Sinkronisasi status: Jika email Auth sudah dikonfirmasi tetapi registration_status di tabel students masih UNVERIFIED_EMAIL
      if (currentStatus === 'UNVERIFIED_EMAIL' && Boolean(authData.user.email_confirmed_at)) {
        const { error: updateError } = await adminClient
          .from('students')
          .update({
            registration_status: 'PENDING_DOCUMENT',
            updated_at: new Date().toISOString(),
          })
          .eq('id', student.id);

        if (updateError) {
          console.error('Gagal memperbarui status mahasiswa ke PENDING_DOCUMENT pada login:', updateError);
          return NextResponse.json(
            { error: { code: 'STATUS_UPDATE_FAILED', message: 'Gagal memperbarui status verifikasi mahasiswa.' } },
            { status: 500 }
          );
        }

        currentStatus = 'PENDING_DOCUMENT';
      }

      // Seluruh mahasiswa yang profilnya sudah terdaftar diarahkan ke /my-qr.
      // Halaman /my-qr secara otomatis menangani tampilan sesuai status (misal PENDING_DOCUMENT / ACTIVE).
      const redirectTo = '/my-qr';

      return NextResponse.json({
        success: true,
        role: 'STUDENT',
        name: student.name,
        status: currentStatus,
        redirectTo,
      });
    }

    return NextResponse.json({
      success: true,
      role: 'STUDENT',
      redirectTo: '/register',
    });
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Terjadi kesalahan sistem saat memproses login.' } },
      { status: 500 }
    );
  }
}

