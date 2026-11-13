import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';

const CACHE_CONTROL_HEADER = 'no-store, no-cache, must-revalidate';

export async function GET() {
  try {
    await requireStaff();
    const adminClient = createAdminClient();

    const [
      { data: retentionSetting },
      { data: storageSetting },
      { data: termSetting },
    ] = await Promise.all([
      adminClient.from('app_settings').select('value').eq('key', 'retention_last_run').maybeSingle(),
      adminClient.from('app_settings').select('value').eq('key', 'storage_monitoring').maybeSingle(),
      adminClient.from('app_settings').select('value').eq('key', 'academic_term').maybeSingle(),
    ]);

    return NextResponse.json(
      {
        success: true,
        data: {
          retention_last_run: retentionSetting?.value || null,
          storage_monitoring: storageSetting?.value || null,
          academic_term: termSetting?.value || null,
        },
      },
      {
        headers: {
          'Cache-Control': CACHE_CONTROL_HEADER,
          Pragma: 'no-cache',
        },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    const statusCode = (err as { statusCode?: number }).statusCode || 500;
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED_OR_ERROR', message } },
      {
        status: statusCode,
        headers: {
          'Cache-Control': CACHE_CONTROL_HEADER,
          Pragma: 'no-cache',
        },
      }
    );
  }
}

