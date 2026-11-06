import { requireStaff } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    await requireStaff();
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');

    const adminClient = createAdminClient();

    let query = adminClient
      .from('students')
      .select(`
        id,
        nim,
        name,
        email,
        registration_status,
        profile_photo_path,
        verification_document_path,
        verification_document_type,
        verification_checks,
        verification_notes,
        verified_at,
        created_at,
        current_class:classes!students_current_class_id_fkey (
          id,
          study_program,
          cohort_year,
          section,
          academic_term
        ),
        claims:class_leader_claims (
          id,
          claim_type,
          status,
          created_at
        )
      `)
      .order('created_at', { ascending: false });

    if (statusFilter && statusFilter !== 'ALL') {
      query = query.eq('registration_status', statusFilter);
    } else {
      // Tampilkan status antrean yang relevan untuk diproses
      query = query.in('registration_status', [
        'PENDING_DOCUMENT',
        'PENDING_REVIEW',
        'RESUBMISSION_REQUIRED',
        'REJECTED',
      ]);
    }

    const { data: students, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: { code: 'FETCH_QUEUE_FAILED', message: error.message } },
        { status: 500 }
      );
    }

    if (!students || students.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Identifikasi duplikasi NIM (FR-01, FT-00 Acceptance Criteria #8)
    const nims = students.map((s) => s.nim);
    const { data: allSameNims } = await adminClient
      .from('students')
      .select('id, nim, registration_status')
      .in('nim', nims);

    const nimCounts: Record<string, { total: number; hasActive: boolean }> = {};
    allSameNims?.forEach((row) => {
      if (!nimCounts[row.nim]) {
        nimCounts[row.nim] = { total: 0, hasActive: false };
      }
      nimCounts[row.nim].total += 1;
      if (row.registration_status === 'ACTIVE') {
        nimCounts[row.nim].hasActive = true;
      }
    });

    const enrichedQueue = students.map((st) => {
      const nimInfo = nimCounts[st.nim];
      const isDuplicateNim = (nimInfo?.total ?? 0) > 1;
      const hasAnotherActiveNim = Boolean(nimInfo?.hasActive && st.registration_status !== 'ACTIVE');

      return {
        ...st,
        is_duplicate_nim: isDuplicateNim,
        has_active_nim_conflict: hasAnotherActiveNim,
        duplicate_nim_count: nimInfo?.total ?? 1,
      };
    });

    return NextResponse.json({
      success: true,
      data: enrichedQueue,
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    return NextResponse.json(
      { error: { code: err.code || 'SERVER_ERROR', message: err.message } },
      { status }
    );
  }
}

