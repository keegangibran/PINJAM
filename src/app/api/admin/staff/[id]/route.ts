import { requireAdmin } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/audit';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const updateStaffSchema = z.object({
  is_active: z.boolean().optional(),
  name: z.string().trim().min(2, 'Nama staf minimal 2 karakter').max(100, 'Nama staf maksimal 100 karakter').optional(),
  role: z.enum(['STAFF', 'ADMIN']).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;

    // Validasi format UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: { code: 'INVALID_ID', message: 'ID staf tidak valid.' } },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = updateStaffSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // 1. Ambil data staf target
    const { data: targetStaff, error: fetchError } = await adminClient
      .from('staff_profiles')
      .select('id, auth_user_id, name, role, is_active')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !targetStaff) {
      return NextResponse.json(
        { error: { code: 'STAFF_NOT_FOUND', message: 'Akun staf tidak ditemukan.' } },
        { status: 404 }
      );
    }

    // 2. Cegah perubahan role ADMIN melalui endpoint manajemen staf biasa
    if (parsed.data.role !== undefined) {
      if (targetStaff.role === 'ADMIN' || parsed.data.role === 'ADMIN') {
        return NextResponse.json(
          {
            error: {
              code: 'ROLE_CHANGE_FORBIDDEN',
              message: 'Perubahan peran Administrator tidak diizinkan melalui endpoint manajemen staff biasa.',
            },
          },
          { status: 400 }
        );
      }
    }

    // 3. Cegah Admin menonaktifkan dirinya sendiri (Self-Deactivation Prevention)
    if (parsed.data.is_active === false) {
      const isSelf =
        targetStaff.id === admin.staffProfile?.id || targetStaff.auth_user_id === admin.userId;

      if (isSelf) {
        return NextResponse.json(
          {
            error: {
              code: 'CANNOT_DEACTIVATE_SELF',
              message: 'Administrator tidak dapat menonaktifkan akunnya sendiri demi mencegah hilangnya akses sistem.',
            },
          },
          { status: 400 }
        );
      }
    }

    // 4. Lakukan update profil staf
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (parsed.data.is_active !== undefined) {
      updatePayload.is_active = parsed.data.is_active;
    }
    if (parsed.data.name !== undefined) {
      updatePayload.name = parsed.data.name;
    }
    if (parsed.data.role !== undefined && targetStaff.role === 'STAFF') {
      updatePayload.role = parsed.data.role;
    }

    const { data: updatedStaff, error: updateError } = await adminClient
      .from('staff_profiles')
      .update(updatePayload)
      .eq('id', id)
      .select('id, auth_user_id, name, role, is_active, created_at, updated_at')
      .single();

    if (updateError || !updatedStaff) {
      return NextResponse.json(
        {
          error: {
            code: 'UPDATE_FAILED',
            message: updateError?.message || 'Gagal memperbarui status akun staf.',
          },
        },
        { status: 500 }
      );
    }

    // 5. Catat audit log
    const auditAction =
      parsed.data.is_active === false
        ? 'STAFF_DEACTIVATED'
        : parsed.data.is_active === true
          ? 'STAFF_ACTIVATED'
          : 'SETTINGS_UPDATED';

    await recordAuditLog(adminClient, {
      action: auditAction,
      entityType: 'staff_profiles',
      entityId: id,
      actorStaffId: admin.staffProfile?.id || null,
      metadata: {
        staff_name: updatedStaff.name,
        role: updatedStaff.role,
        is_active: updatedStaff.is_active,
        previous_status: targetStaff.is_active,
      },
    });

    const statusMessage =
      parsed.data.is_active !== undefined
        ? parsed.data.is_active
          ? `Akun ${updatedStaff.name} berhasil diaktifkan.`
          : `Akun ${updatedStaff.name} berhasil dinonaktifkan.`
        : `Profil ${updatedStaff.name} berhasil diperbarui.`;

    return NextResponse.json({
      success: true,
      data: updatedStaff,
      message: statusMessage,
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    return NextResponse.json(
      { error: { code: err.code || 'SERVER_ERROR', message: err.message } },
      { status }
    );
  }
}
