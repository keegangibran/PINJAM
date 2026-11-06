import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/audit';
import { dataUrlToBlob, isValidImageMimeType, getBase64SizeBytes } from '@/lib/image';
import { z } from 'zod';

const updateStatusSchema = z.object({
  status: z.enum(['AVAILABLE', 'MAINTENANCE']),
  reason: z.string().min(3, 'Alasan perubahan status wajib diisi minimal 3 karakter').max(500),
  photo_base64: z.string().optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authContext = await requireStaff();
    const { id } = await params;
    const body = await request.json();
    const parseResult = updateStatusSchema.safeParse(body);

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

    const { status: targetStatus, reason, photo_base64 } = parseResult.data;
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

    // 2. Cegah perubahan manual jika unit sedang dipinjam (BORROWED)
    if (projector.status === 'BORROWED') {
      return NextResponse.json(
        {
          error: {
            code: 'CANNOT_MANUALLY_CHANGE_BORROWED_STATUS',
            message: 'Unit sedang dalam masa peminjaman aktif. Status hanya dapat diubah melalui proses pengembalian di Kiosk.',
          },
        },
        { status: 400 }
      );
    }

    // 3. Cegah perubahan jika unit nonaktif (INACTIVE)
    if (projector.status === 'INACTIVE') {
      return NextResponse.json(
        {
          error: {
            code: 'CANNOT_CHANGE_INACTIVE_PROJECTOR',
            message: 'Unit berstatus nonaktif. Aktifkan kembali unit terlebih dahulu di menu manajemen unit.',
          },
        },
        { status: 400 }
      );
    }

    // 4. Jika ada foto bukti kendala, simpan ke storage
    let photoPath: string | null = null;
    if (photo_base64) {
      const sizeBytes = getBase64SizeBytes(photo_base64);
      if (sizeBytes > 250 * 1024) {
        return NextResponse.json(
          {
            error: {
              code: 'PHOTO_TOO_LARGE',
              message: 'Ukuran foto melebihi batas 250 KB sesuai NFR-02.',
            },
          },
          { status: 400 }
        );
      }

      const blob = dataUrlToBlob(photo_base64);
      if (!isValidImageMimeType(blob.type)) {
        return NextResponse.json(
          {
            error: {
              code: 'INVALID_MIME_TYPE',
              message: 'Format foto harus berupa JPEG, PNG, atau WebP.',
            },
          },
          { status: 400 }
        );
      }

      const timestamp = Date.now();
      photoPath = `loans/maintenance_${id}_${timestamp}.jpg`;
      const buffer = Buffer.from(await blob.arrayBuffer());

      const { error: uploadError } = await adminClient.storage
        .from('smartprojex-media')
        .upload(photoPath, buffer, {
          contentType: blob.type || 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        return NextResponse.json(
          {
            error: {
              code: 'PHOTO_UPLOAD_FAILED',
              message: `Gagal mengunggah foto kendala: ${uploadError.message}`,
            },
          },
          { status: 500 }
        );
      }
    }

    // 5. Perbarui status proyektor di database
    const { data: updatedProjector, error: updateError } = await adminClient
      .from('projectors')
      .update({
        status: targetStatus,
        notes: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError || !updatedProjector) {
      return NextResponse.json(
        {
          error: {
            code: 'UPDATE_STATUS_FAILED',
            message: updateError?.message || 'Gagal mengubah status proyektor.',
          },
        },
        { status: 500 }
      );
    }

    // 6. Catat riwayat status di projector_status_logs
    await adminClient.from('projector_status_logs').insert({
      projector_id: id,
      from_status: projector.status,
      to_status: targetStatus,
      reason,
      photo_path: photoPath,
      changed_by: authContext.staffProfile?.id || null,
    });

    // 7. Jika dikembalikan ke AVAILABLE dari MAINTENANCE, tandai kendala terselesaikan (PRD Clarifications #5)
    if (projector.status === 'MAINTENANCE' && targetStatus === 'AVAILABLE') {
      await adminClient
        .from('loans')
        .update({ issue_resolved_at: new Date().toISOString() })
        .eq('projector_id', id)
        .is('issue_resolved_at', null)
        .eq('return_condition', 'REPORTED_ISSUE');
    }

    // 8. Tulis audit log
    await recordAuditLog(adminClient, {
      action: 'PROJECTOR_STATUS_CHANGED',
      entityType: 'projectors',
      entityId: id,
      actorStaffId: authContext.staffProfile?.id || null,
      metadata: {
        code: projector.code,
        from_status: projector.status,
        to_status: targetStatus,
        reason,
        has_photo: !!photoPath,
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
