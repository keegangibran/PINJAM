import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaff();
    const { id } = await params;
    const adminClient = createAdminClient();

    const { data: logs, error } = await adminClient
      .from('projector_status_logs')
      .select(`
        id,
        projector_id,
        from_status,
        to_status,
        reason,
        photo_path,
        created_at,
        staff:staff_profiles (
          id,
          name,
          role
        )
      `)
      .eq('projector_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        {
          error: {
            code: 'FETCH_LOGS_FAILED',
            message: error.message,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      logs: logs || [],
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
