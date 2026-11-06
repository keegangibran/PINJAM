import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const adminClient = createAdminClient();

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status') || 'ALL';
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const qParam = searchParams.get('q')?.trim().toLowerCase();
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 200);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    const nowISO = new Date().toISOString();

    // 1. Hitung Ringkasan Inventaris & Keterlambatan Real-time (FR-12, FR-15)
    const [
      { count: totalProjectors },
      { count: availableCount },
      { count: borrowedCount },
      { count: overdueCount },
      { count: maintenanceCount },
    ] = await Promise.all([
      adminClient.from('projectors').select('id', { count: 'exact', head: true }).neq('status', 'INACTIVE'),
      adminClient.from('projectors').select('id', { count: 'exact', head: true }).eq('status', 'AVAILABLE'),
      adminClient.from('projectors').select('id', { count: 'exact', head: true }).eq('status', 'BORROWED'),
      adminClient.from('loans').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE').lt('due_at', nowISO),
      adminClient.from('projectors').select('id', { count: 'exact', head: true }).eq('status', 'MAINTENANCE'),
    ]);

    const summary = {
      total_projectors: totalProjectors ?? 0,
      available_count: availableCount ?? 0,
      borrowed_count: borrowedCount ?? 0,
      overdue_count: overdueCount ?? 0,
      maintenance_count: maintenanceCount ?? 0,
    };

    // 2. Kueri Buku Besar Transaksi (FR-11, FR-15)
    let query = adminClient
      .from('loans')
      .select(`
        id,
        idempotency_key,
        student_id,
        class_id,
        projector_id,
        borrowed_at,
        due_at,
        borrow_photo_path,
        borrow_identification_method,
        borrow_processed_by,
        returned_at,
        return_photo_path,
        returned_by_type,
        returned_by_name,
        return_processed_by,
        return_condition,
        damage_notes,
        issue_resolved_at,
        status,
        photos_deleted_at,
        created_at,
        student:students (
          id,
          nim,
          name,
          profile_photo_path,
          registration_status
        ),
        class:classes (
          id,
          study_program,
          cohort_year,
          section,
          academic_term
        ),
        projector:projectors (
          id,
          code,
          name,
          status
        ),
        borrow_staff:staff_profiles!loans_borrow_processed_by_fkey (
          id,
          name,
          role
        ),
        return_staff:staff_profiles!loans_return_processed_by_fkey (
          id,
          name,
          role
        )
      `, { count: 'exact' });

    if (statusFilter === 'ACTIVE') {
      query = query.eq('status', 'ACTIVE');
    } else if (statusFilter === 'OVERDUE') {
      query = query.eq('status', 'ACTIVE').lt('due_at', nowISO);
    } else if (statusFilter === 'COMPLETED') {
      query = query.eq('status', 'COMPLETED');
    }

    if (fromParam) {
      const fromDate = new Date(fromParam).toISOString();
      query = query.gte('borrowed_at', fromDate);
    }

    if (toParam) {
      // Jika format tanggal YYYY-MM-DD, set ke akhir hari 23:59:59.999Z
      const toDate = toParam.includes('T')
        ? new Date(toParam).toISOString()
        : new Date(`${toParam}T23:59:59.999Z`).toISOString();
      query = query.lte('borrowed_at', toDate);
    }

    query = query.order('borrowed_at', { ascending: false });

    const { data: rawLoans, error, count } = await query.range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json(
        { error: { code: 'FETCH_LOANS_FAILED', message: error.message } },
        { status: 500 }
      );
    }

    const now = new Date();
    type RawLoan = (typeof rawLoans)[number];

    let loans = (rawLoans || []).map((loan: RawLoan) => {
      const is_overdue = loan.status === 'ACTIVE' && new Date(loan.due_at) < now;
      return {
        ...loan,
        is_overdue,
      };
    });

    // Filter teks pencarian jika parameter q diberikan
    if (qParam) {
      loans = loans.filter((loan: (typeof loans)[number]) => {
        const studentName = (loan.student as { name?: string } | null)?.name?.toLowerCase() || '';
        const studentNim = (loan.student as { nim?: string } | null)?.nim?.toLowerCase() || '';
        const projectorCode = (loan.projector as { code?: string } | null)?.code?.toLowerCase() || '';
        const projectorName = (loan.projector as { name?: string } | null)?.name?.toLowerCase() || '';
        const returnerName = loan.returned_by_name?.toLowerCase() || '';

        return (
          studentName.includes(qParam) ||
          studentNim.includes(qParam) ||
          projectorCode.includes(qParam) ||
          projectorName.includes(qParam) ||
          returnerName.includes(qParam)
        );
      });
    }

    return NextResponse.json({
      success: true,
      summary,
      loans,
      total_count: count ?? loans.length,
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
