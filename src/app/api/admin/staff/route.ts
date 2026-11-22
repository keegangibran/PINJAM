import { requireAdmin } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/audit';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const createStaffSchema = z.object({
  name: z.string().trim().min(2, 'Nama staf minimal 2 karakter').max(100, 'Nama staf maksimal 100 karakter'),
  email: z.string().trim().email('Format email tidak valid').toLowerCase(),
  role: z.enum(['STAFF', 'ADMIN']).default('STAFF'),
  password: z.string().min(8, 'Kata sandi minimal 8 karakter').optional(),
  send_invite: z.boolean().optional(),
});

export async function GET() {
  try {
    await requireAdmin();
    const adminClient = createAdminClient();

    // 1. Ambil seluruh data staff_profiles
    const { data: staffProfiles, error: staffError } = await adminClient
      .from('staff_profiles')
      .select('id, auth_user_id, name, role, is_active, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (staffError) {
      return NextResponse.json(
        { error: { code: 'FETCH_FAILED', message: staffError.message } },
        { status: 500 }
      );
    }

    // 2. Ambil metadata auth.users untuk mencocokkan email & last_sign_in
    let userMap = new Map<string, { email: string; lastSignInAt: string | null; emailConfirmedAt: string | null }>();
    try {
      const { data: authUsersData, error: authUsersError } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

      if (!authUsersError && authUsersData?.users) {
        userMap = new Map(
          authUsersData.users.map((u) => [
            u.id,
            {
              email: u.email ?? '',
              lastSignInAt: u.last_sign_in_at ?? null,
              emailConfirmedAt: u.email_confirmed_at ?? null,
            },
          ])
        );
      }
    } catch (e) {
      console.warn('Gagal memuat auth.users metadata:', e);
    }

    const data = (staffProfiles || []).map((staff) => {
      const authInfo = userMap.get(staff.auth_user_id);
      return {
        ...staff,
        email: authInfo?.email || 'N/A',
        last_sign_in_at: authInfo?.lastSignInAt || null,
        email_confirmed_at: authInfo?.emailConfirmedAt || null,
      };
    });

    return NextResponse.json({ success: true, data });
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
    const parsed = createStaffSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const { name, email, role, password, send_invite } = parsed.data;
    const adminClient = createAdminClient();

    // 1. Validasi: Jangan izinkan email yang sudah terdaftar sebagai mahasiswa (NFR-03: pemisahan peran)
    const { data: existingStudent } = await adminClient
      .from('students')
      .select('id, name')
      .eq('email', email)
      .maybeSingle();

    if (existingStudent) {
      return NextResponse.json(
        {
          error: {
            code: 'EMAIL_REGISTERED_AS_STUDENT',
            message: 'Email ini telah terdaftar sebagai mahasiswa. Akun petugas harus menggunakan email terpisah.',
          },
        },
        { status: 400 }
      );
    }

    // 2. Validasi: Periksa apakah email sudah terdaftar di Supabase Auth / staff_profiles
    try {
      const { data: authUsersData } = await adminClient.auth.admin.listUsers();
      const existingAuthUser = authUsersData?.users?.find(
        (u) => u.email?.toLowerCase() === email.toLowerCase()
      );

      if (existingAuthUser) {
        const { data: existingStaff } = await adminClient
          .from('staff_profiles')
          .select('id')
          .eq('auth_user_id', existingAuthUser.id)
          .maybeSingle();

        if (existingStaff) {
          return NextResponse.json(
            {
              error: {
                code: 'DUPLICATE_STAFF_EMAIL',
                message: 'Email sudah terdaftar sebagai akun staf/admin.',
              },
            },
            { status: 409 }
          );
        }
      }
    } catch {
      // Lanjutkan jika listUsers gagal
    }

    // 3. Buat akun di Supabase Auth
    let authUserId: string;
    let isInvited = false;

    if (password) {
      // Pembuatan langsung dengan password awal dan email auto-confirm
      const { data: authUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role },
      });

      if (createError || !authUser.user) {
        return NextResponse.json(
          {
            error: {
              code: 'AUTH_CREATION_FAILED',
              message: createError?.message || 'Gagal membuat pengguna di Supabase Auth.',
            },
          },
          { status: 400 }
        );
      }
      authUserId = authUser.user.id;
    } else {
      // Pengiriman undangan via email Supabase Auth
      const { data: invitedUser, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
        email,
        { data: { name, role } }
      );

      if (inviteError || !invitedUser.user) {
        return NextResponse.json(
          {
            error: {
              code: 'INVITE_FAILED',
              message: inviteError?.message || 'Gagal mengirim undangan email Supabase Auth.',
            },
          },
          { status: 400 }
        );
      }
      authUserId = invitedUser.user.id;
      isInvited = true;
    }

    // 4. Masukkan ke tabel staff_profiles
    const { data: newProfile, error: profileError } = await adminClient
      .from('staff_profiles')
      .insert({
        auth_user_id: authUserId,
        name,
        role,
        is_active: true,
      })
      .select('id, auth_user_id, name, role, is_active, created_at, updated_at')
      .single();

    if (profileError || !newProfile) {
      // Rollback: Hapus auth user yang baru dibuat agar tidak menjadi orphan
      await adminClient.auth.admin.deleteUser(authUserId);
      return NextResponse.json(
        {
          error: {
            code: 'PROFILE_CREATION_FAILED',
            message: profileError?.message || 'Gagal menyimpan profil staf ke basis data.',
          },
        },
        { status: 500 }
      );
    }

    // 5. Catat audit log
    await recordAuditLog(adminClient, {
      action: 'STAFF_CREATED',
      entityType: 'staff_profiles',
      entityId: newProfile.id,
      actorStaffId: admin.staffProfile?.id || null,
      metadata: {
        staff_name: name,
        email,
        role,
        is_invited: isInvited,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          ...newProfile,
          email,
        },
        message: isInvited
          ? 'Undangan akun petugas berhasil dikirim ke email.'
          : 'Akun petugas berhasil dibuat dengan kata sandi awal.',
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
