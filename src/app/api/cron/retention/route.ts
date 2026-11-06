import { NextRequest, NextResponse } from 'next/server';
import { executeRetentionAndMaintenance } from '@/lib/retention';
import { requireAdmin } from '@/lib/auth/guards';

/**
 * Validasi otentikasi Vercel Cron Secret.
 */
function isCronAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // Jika CRON_SECRET belum diset di development lokal, tolak bila di production
    return process.env.NODE_ENV !== 'production';
  }

  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * Handler GET /api/cron/retention
 * Dipanggil secara terjadwal setiap hari oleh Vercel Cron (PRD FR-20, NFR-08, NFR-10).
 */
export async function GET(request: NextRequest) {
  try {
    if (!isCronAuthorized(request)) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED_CRON',
            message: 'Akses ditolak: Kredensial Vercel Cron tidak valid atau tidak disediakan.',
          },
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';

    const result = await executeRetentionAndMaintenance({ force });

    if (!result.success && result.code === 'CRON_ALREADY_RUNNING') {
      return NextResponse.json(
        {
          error: {
            code: result.code,
            message: result.failures[0] || 'Tugas pembersihan retensi sedang berjalan.',
          },
        },
        { status: 409 }
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json(
      {
        error: {
          code: 'CRON_EXECUTION_FAILED',
          message,
        },
      },
      { status: 500 }
    );
  }
}

/**
 * Handler POST /api/cron/retention
 * Memungkinkan Administrator memicu pembersihan retensi manual dari antarmuka Admin (PRD 3.3).
 */
export async function POST(request: NextRequest) {
  try {
    // Boleh dipicu oleh Vercel Cron Secret ATAU Administrator terotentikasi
    const isCron = isCronAuthorized(request);
    if (!isCron) {
      await requireAdmin();
    }

    const body = await request.json().catch(() => ({}));
    const force = body.force === true;

    const result = await executeRetentionAndMaintenance({ force });

    if (!result.success && result.code === 'CRON_ALREADY_RUNNING') {
      return NextResponse.json(
        {
          error: {
            code: result.code,
            message: result.failures[0] || 'Tugas pembersihan retensi sedang berjalan.',
          },
        },
        { status: 409 }
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    const statusCode = (err as { statusCode?: number }).statusCode || 500;
    return NextResponse.json(
      {
        error: {
          code: 'CRON_EXECUTION_FAILED',
          message,
        },
      },
      { status: statusCode }
    );
  }
}
