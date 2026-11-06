import { requireStaff } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/audit';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const signPhotoSchema = z.object({
  path: z.string().min(1, 'Path berkas wajib diisi'),
});

const ALLOWED_PREFIXES = ['faces/', 'documents/', 'loans/'];

export async function POST(request: Request) {
  try {
    const staff = await requireStaff();
    const body = await request.json();
    const parsed = signPhotoSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const { path: objectPath } = parsed.data;

    // 1. Validasi keamanan path: anti-traversal & prefix whitelist
    if (objectPath.includes('..') || objectPath.startsWith('/') || objectPath.includes('\\')) {
      return NextResponse.json(
        { error: { code: 'INVALID_PATH', message: 'Karakter path traversal tidak diizinkan.' } },
        { status: 400 }
      );
    }

    const isAllowedPrefix = ALLOWED_PREFIXES.some((prefix) => objectPath.startsWith(prefix));
    if (!isAllowedPrefix) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN_PREFIX', message: 'Akses ke direktori penyimpanan ini tidak diizinkan.' } },
        { status: 403 }
      );
    }

    const adminClient = createAdminClient();

    // 2. Terbitkan Signed URL berumur maksimal 60 detik (NFR-07)
    const { data: signedData, error: signError } = await adminClient.storage
      .from('smartprojex-media')
      .createSignedUrl(objectPath, 60);

    if (signError || !signedData?.signedUrl) {
      return NextResponse.json(
        { error: { code: 'SIGN_URL_FAILED', message: signError?.message || 'Gagal membuat signed URL foto.' } },
        { status: 500 }
      );
    }

    // 3. Catat entri audit log (wajib menurut FR-19 & NFR-07, DILARANG mencatat URL yang dihasilkan ke metadata)
    await recordAuditLog(adminClient, {
      action: 'PHOTO_SIGNED_URL',
      entityType: 'storage',
      entityId: objectPath,
      actorStaffId: staff.staffProfile?.id,
      metadata: {
        path: objectPath,
        expires_in_seconds: 60,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        signedUrl: signedData.signedUrl,
        expiresIn: 60,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      },
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    return NextResponse.json(
      { error: { code: err.code || 'SERVER_ERROR', message: err.message } },
      { status }
    );
  }
}

