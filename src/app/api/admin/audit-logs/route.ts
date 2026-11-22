import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { sanitizeAuditMetadata, AuditAction } from '@/lib/audit';
import { sanitizeSearchTerm } from '@/lib/sanitizer';
import { z } from 'zod';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  action: z.string().optional(),
  entity_type: z.string().optional(),
  actor_type: z.enum(['ALL', 'STAFF', 'STUDENT', 'SYSTEM']).default('ALL'),
  search: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    // 1. Otorisasi Server-Side: Hanya ADMIN aktif yang berwenang (FR-19 / NFR-03)
    await requireAdmin();
    const adminClient = createAdminClient();

    // 2. Validasi Parameter Kueri
    const { searchParams } = new URL(request.url);
    const parsedParams = querySchema.safeParse({
      page: searchParams.get('page') || 1,
      limit: searchParams.get('limit') || 20,
      start_date: searchParams.get('start_date') || undefined,
      end_date: searchParams.get('end_date') || undefined,
      action: searchParams.get('action') || undefined,
      entity_type: searchParams.get('entity_type') || undefined,
      actor_type: searchParams.get('actor_type') || 'ALL',
      search: searchParams.get('search') || undefined,
    });

    if (!parsedParams.success) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_QUERY_PARAMS',
            message: parsedParams.error.issues[0].message,
          },
        },
        { status: 400 }
      );
    }

    const { page, limit, start_date, end_date, action, entity_type, actor_type, search } =
      parsedParams.data;

    const fromIndex = (page - 1) * limit;
    const toIndex = fromIndex + limit - 1;

    // 3. Bangun Kueri Audit Logs
    let query = adminClient
      .from('audit_logs')
      .select(
        `
        id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at,
        actor_staff_id,
        actor_student_id,
        actor_staff:staff_profiles!actor_staff_id (
          id,
          name,
          role
        ),
        actor_student:students!actor_student_id (
          id,
          name
        )
      `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false });

    // Filter Aksi (Action)
    if (action && action !== 'ALL') {
      query = query.eq('action', action);
    }

    // Filter Jenis Entitas (Entity Type)
    if (entity_type && entity_type !== 'ALL') {
      query = query.eq('entity_type', entity_type);
    }

    // Filter Rentang Tanggal
    if (start_date) {
      query = query.gte('created_at', start_date);
    }
    if (end_date) {
      // Jika hanya format YYYY-MM-DD, tambahkan akhir hari agar inklusif
      const formattedEndDate =
        end_date.length === 10 ? `${end_date}T23:59:59.999Z` : end_date;
      query = query.lte('created_at', formattedEndDate);
    }

    // Filter Tipe Aktor
    if (actor_type === 'STAFF') {
      query = query.not('actor_staff_id', 'is', null);
    } else if (actor_type === 'STUDENT') {
      query = query.not('actor_student_id', 'is', null);
    } else if (actor_type === 'SYSTEM') {
      query = query.is('actor_staff_id', null).is('actor_student_id', null);
    }

    // Filter Pencarian Teks Aman
    if (search) {
      const sanitized = sanitizeSearchTerm(search);
      if (sanitized) {
        query = query.or(`action.ilike.%${sanitized}%,entity_id.ilike.%${sanitized}%`);
      }
    }

    const { data: logs, count, error } = await query.range(fromIndex, toIndex);

    if (error) {
      return NextResponse.json(
        { error: { code: 'FETCH_FAILED', message: error.message } },
        { status: 500 }
      );
    }

    // 4. Transformasi & Sanitasi Data Output (Fail-safe Privacy & Security)
    const sanitizedLogs = (logs || []).map((item: any) => {
      let actorType: 'STAFF' | 'ADMIN' | 'STUDENT' | 'SYSTEM' = 'SYSTEM';
      let actorName = 'Sistem Otomatis (Cron / Background)';
      let actorDetail: string | null = null;

      if (item.actor_staff) {
        actorType = item.actor_staff.role === 'ADMIN' ? 'ADMIN' : 'STAFF';
        actorName = item.actor_staff.name;
        actorDetail = item.actor_staff.role === 'ADMIN' ? 'Administrator' : 'Petugas TU';
      } else if (item.actor_student) {
        actorType = 'STUDENT';
        actorName = item.actor_student.name;
        actorDetail = 'Mahasiswa';
      }

      return {
        id: item.id,
        action: item.action as AuditAction,
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        created_at: item.created_at,
        actor: {
          type: actorType,
          name: actorName,
          detail: actorDetail,
          id: item.actor_staff_id || item.actor_student_id || null,
        },
        metadata: sanitizeAuditMetadata(item.metadata || {}),
      };
    });

    const total = count || 0;
    const totalPages = Math.ceil(total / limit) || 1;

    return NextResponse.json({
      success: true,
      data: sanitizedLogs,
      pagination: {
        page,
        limit,
        total,
        total_pages: totalPages,
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
