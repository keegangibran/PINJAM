import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/audit';
import { z } from 'zod';

const updateProjectorSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(['AVAILABLE', 'INACTIVE']).optional(),
  deactivate: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authContext = await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    const parseResult = updateProjectorSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: parseResult.error.issues[0]?.message || 'Input tidak valid',
          },
        },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // 1. Ambil data proyektor saat ini
    const { data: projector, error: fetchError } = await adminClient
      .from('projectors')
      .select('id, code, name, status, notes')
      .eq('id', id)
      .single();

    if (fetchError || !projector) {
      return NextResponse.json(
        {
          error: {
            code: 'PROJECTOR_NOT_FOUND',
            message: 'Unit proyektor tidak ditemukan.',
          },
        },
        { status: 404 }
      );
    }

    const { name, notes, status, deactivate } = parseResult.data;
    const isDeactivating = deactivate === true || status === 'INACTIVE';

    // 2. Jika menonaktifkan unit, periksa apakah sedang dipinjam (ACTIVE loan)
    if (isDeactivating) {
      const { data: activeLoan } = await adminClient
        .from('loans')
        .select('id')
        .eq('projector_id', id)
        .eq('status', 'ACTIVE')
        .maybeSingle();

      if (activeLoan) {
        return NextResponse.json(
          {
            error: {
              code: 'CANNOT_DEACTIVATE_BORROWED_UNIT',
              message: 'Unit sedang dalam masa peminjaman aktif. Selesaikan pengembalian terlebih dahulu sebelum menonaktifkan unit.',
            },
          },
          { status: 400 }
        );
      }
    }

    // 3. Bangun payload pembaruan
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) {
      updates.name = name.trim();
    }
    if (notes !== undefined) {
      updates.notes = notes;
    }
    if (isDeactivating) {
      updates.status = 'INACTIVE';
    } else if (status === 'AVAILABLE' && projector.status === 'INACTIVE') {
      updates.status = 'AVAILABLE';
    }

    const { data: updatedProjector, error: updateError } = await adminClient
      .from('projectors')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError || !updatedProjector) {
      return NextResponse.json(
        {
          error: {
            code: 'UPDATE_PROJECTOR_FAILED',
            message: updateError?.message || 'Gagal memperbarui unit proyektor.',
          },
        },
        { status: 500 }
      );
    }

    // Jika terjadi perubahan status nonaktif
    if (isDeactivating && projector.status !== 'INACTIVE') {
      await adminClient.from('projector_status_logs').insert({
        projector_id: id,
        from_status: projector.status,
        to_status: 'INACTIVE',
        reason: 'Unit dinonaktifkan oleh administrator',
        changed_by: authContext.staffProfile?.id || null,
      });
    }

    // Catat audit log
    await recordAuditLog(adminClient, {
      action: 'PROJECTOR_ASSET_MODIFIED',
      entityType: 'projectors',
      entityId: id,
      actorStaffId: authContext.staffProfile?.id || null,
      metadata: {
        code: projector.code,
        previous_status: projector.status,
        new_status: updatedProjector.status,
        is_deactivated: isDeactivating,
      },
    });

    return NextResponse.json({
      success: true,
      projector: updatedProjector,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    const statusCode = (err as { statusCode?: number }).statusCode || 500;
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED_OR_ERROR', message } },
      { status: statusCode }
    );
  }
}

