import { requireStaff } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBase64SizeBytes, isValidImageMimeType, MAX_PHOTO_SIZE_BYTES } from '@/lib/image';
import { calculateDueAt } from '@/lib/timezone';
import { recordAuditLog } from '@/lib/audit';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const transactionSchema = z.object({
  idempotency_key: z.string().min(10, 'Idempotency key minimal 10 karakter').max(64),
  projector_code: z.string().min(1, 'Kode proyektor wajib diisi'),
  kiosk_session_id: z.string().uuid('ID sesi Kiosk tidak valid').optional(),
  photo_base64: z.string().min(10, 'Foto dokumentasi wajib diambil'),
  condition: z.enum(['NORMAL', 'ISSUE']),
  issue_notes: z.string().max(500, 'Catatan kendala maksimal 500 karakter').optional(),
  returner: z
    .object({
      type: z.enum(['BORROWER', 'REPRESENTATIVE']),
      name: z.string().max(100, 'Nama perwakilan maksimal 100 karakter').optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
  try {
    const staff = await requireStaff();
    const body = await request.json();
    const parsed = transactionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const {
      idempotency_key,
      projector_code,
      kiosk_session_id,
      photo_base64,
      condition,
      issue_notes,
      returner,
    } = parsed.data;

    const normalizedCode = projector_code.trim().toUpperCase();
    const dbCondition = condition === 'NORMAL' ? 'NORMAL' : 'REPORTED_ISSUE';

    // 1. Validasi Ukuran & Format Foto Dokumentasi (NFR-02: target <= 250 KB)
    const photoBytes = getBase64SizeBytes(photo_base64);
    if (photoBytes > MAX_PHOTO_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: {
            code: 'IMAGE_TOO_LARGE',
            message: `Ukuran foto (${Math.round(photoBytes / 1024)} KB) melebihi batas maksimal 250 KB. Kompresi klien gagal.`,
          },
        },
        { status: 400 }
      );
    }

    const mimeMatch = photo_base64.match(/^data:(image\/[a-zA-Z+]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    if (!isValidImageMimeType(mimeType)) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_MIME_TYPE',
            message: 'Format foto dokumentasi tidak didukung. Gunakan format JPEG, PNG, atau WebP.',
          },
        },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // 2. Pemeriksaan Idempotensi: Cegah Replay dengan Parameter Berbeda
    const { data: existingLoan } = await adminClient
      .from('loans')
      .select('id, status, projector_id, return_condition, projectors:projector_id(code)')
      .eq('idempotency_key', idempotency_key)
      .maybeSingle();

    if (existingLoan) {
      const existingCode = (existingLoan.projectors as any)?.code;
      // Jika key sama tetapi parameter proyektor berbeda -> Tolak konflik idempotensi
      if (existingCode && existingCode !== normalizedCode) {
        return NextResponse.json(
          {
            error: {
              code: 'IDEMPOTENCY_CONFLICT',
              message: 'Idempotency key telah digunakan sebelumnya untuk unit proyektor yang berbeda.',
            },
          },
          { status: 409 }
        );
      }

      return NextResponse.json({
        success: true,
        idempotent_replay: true,
        data: {
          action: existingLoan.status === 'ACTIVE' ? 'BORROW' : 'RETURN',
          loan_id: existingLoan.id,
          projector_code: normalizedCode,
          status: existingLoan.status,
          message: 'Transaksi telah diproses sebelumnya (idempotency key cocok).',
        },
      });
    }

    // 3. Ambil data unit proyektor
    const { data: projector, error: projectorError } = await adminClient
      .from('projectors')
      .select('id, code, name, status')
      .eq('code', normalizedCode)
      .single();

    if (projectorError || !projector) {
      return NextResponse.json(
        { error: { code: 'PROJECTOR_NOT_FOUND', message: `Proyektor "${normalizedCode}" tidak ditemukan.` } },
        { status: 404 }
      );
    }

    if (projector.status === 'INACTIVE') {
      return NextResponse.json(
        { error: { code: 'PROJECTOR_INACTIVE', message: 'Unit proyektor berstatus nonaktif.' } },
        { status: 400 }
      );
    }

    if (projector.status === 'MAINTENANCE') {
      return NextResponse.json(
        { error: { code: 'PROJECTOR_MAINTENANCE', message: 'Unit proyektor sedang dalam perbaikan/perawatan.' } },
        { status: 400 }
      );
    }

    // 4. Validasi Skenario Berdasarkan Status Unit (Smart Toggle)
    if (projector.status === 'AVAILABLE') {
      // Peminjaman: Sesi Kiosk wajib ada
      if (!kiosk_session_id) {
        return NextResponse.json(
          { error: { code: 'SESSION_REQUIRED', message: 'Sesi Kiosk ketua kelas diperlukan untuk meminjam.' } },
          { status: 400 }
        );
      }
    } else if (projector.status === 'BORROWED') {
      // Pengembalian: Validasi tipe pengembali
      if (!returner || !returner.type) {
        return NextResponse.json(
          { error: { code: 'RETURNER_REQUIRED', message: 'Identitas pengembali wajib dipilih (peminjam / perwakilan).' } },
          { status: 400 }
        );
      }
      if (returner.type === 'REPRESENTATIVE' && (!returner.name || returner.name.trim() === '')) {
        return NextResponse.json(
          { error: { code: 'REPRESENTATIVE_NAME_REQUIRED', message: 'Nama perwakilan pengembali wajib dicatat oleh petugas.' } },
          { status: 400 }
        );
      }
    }

    // 5. Unggah Foto Dokumentasi ke Supabase Storage privat (prefix: loans/)
    const base64Data = photo_base64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
    const photoBuffer = Buffer.from(base64Data, 'base64');
    const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const photoPath = `loans/${normalizedCode.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${extension}`;

    const { error: uploadError } = await adminClient.storage
      .from('smartprojex-media')
      .upload(photoPath, photoBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: { code: 'PHOTO_UPLOAD_FAILED', message: uploadError.message } },
        { status: 500 }
      );
    }

    // 6. Hitung estimasi due_at jika peminjaman baru (17:00 WIB hari ini atau fallback +2 jam)
    let dueAt: string | null = null;
    if (projector.status === 'AVAILABLE') {
      dueAt = calculateDueAt(new Date()).toISOString();
    }

    // 7. Eksekusi fungsi atomik PL/pgSQL process_loan_transaction
    const { data: txResult, error: rpcError } = await adminClient.rpc('process_loan_transaction', {
      p_idempotency_key: idempotency_key,
      p_projector_code: normalizedCode,
      p_photo_path: photoPath,
      p_condition: dbCondition,
      p_staff_auth_id: staff.userId,
      p_kiosk_session_id: kiosk_session_id || null,
      p_issue_notes: issue_notes || null,
      p_returner_type: returner?.type || null,
      p_returner_name: returner?.name?.trim() || null,
      p_due_at: dueAt,
    });

    if (rpcError) {
      return NextResponse.json(
        { error: { code: 'TRANSACTION_FAILED', message: rpcError.message } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: txResult,
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    return NextResponse.json(
      { error: { code: err.code || 'SERVER_ERROR', message: err.message } },
      { status }
    );
  }
}
