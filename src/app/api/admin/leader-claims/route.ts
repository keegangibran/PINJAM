import { requireStaff } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    await requireStaff();
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status') || 'ALL';
    const claimTypeFilter = searchParams.get('claim_type') || 'ALL';
    const classIdFilter = searchParams.get('class_id');
    const search = searchParams.get('search')?.trim().toLowerCase() || '';

    const adminClient = createAdminClient();

    let query = adminClient
      .from('class_leader_claims')
      .select(`
        id,
        class_id,
        student_id,
        claim_type,
        status,
        decided_by,
        decided_at,
        notes,
        created_at,
        updated_at,
        student:students!student_id (
          id,
          nim,
          name,
          email,
          registration_status,
          profile_photo_path
        ),
        class:classes!class_id (
          id,
          study_program,
          cohort_year,
          section,
          academic_term,
          is_active,
          leader_student_id
        ),
        decided_by_staff:staff_profiles!decided_by (
          id,
          name,
          role
        )
      `)
      .order('created_at', { ascending: false });

    if (statusFilter !== 'ALL') {
      query = query.eq('status', statusFilter);
    }

    if (claimTypeFilter !== 'ALL') {
      query = query.eq('claim_type', claimTypeFilter);
    }

    if (classIdFilter) {
      query = query.eq('class_id', classIdFilter);
    }

    const { data: claims, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: { code: 'FETCH_CLAIMS_FAILED', message: error.message } },
        { status: 500 }
      );
    }

    // Ambil ringkasan agregat seluruh status klaim
    const { data: allStatusCounts } = await adminClient
      .from('class_leader_claims')
      .select('status');

    const summary = {
      pending_count: 0,
      approved_count: 0,
      rejected_count: 0,
      total_count: (allStatusCounts || []).length,
    };

    (allStatusCounts || []).forEach((c) => {
      if (c.status === 'PENDING') summary.pending_count++;
      else if (c.status === 'APPROVED') summary.approved_count++;
      else if (c.status === 'REJECTED') summary.rejected_count++;
    });

    let filteredClaims = claims || [];
    if (search) {
      filteredClaims = filteredClaims.filter((c: any) => {
        const studentName = c.student?.name?.toLowerCase() || '';
        const studentNim = c.student?.nim?.toLowerCase() || '';
        const studyProgram = c.class?.study_program?.toLowerCase() || '';
        return studentName.includes(search) || studentNim.includes(search) || studyProgram.includes(search);
      });
    }

    return NextResponse.json({
      success: true,
      data: filteredClaims,
      summary,
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    return NextResponse.json(
      { error: { code: err.code || 'SERVER_ERROR', message: err.message } },
      { status }
    );
  }
}
