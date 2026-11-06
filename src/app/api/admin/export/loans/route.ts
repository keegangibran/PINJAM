import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/audit';
import { formatWib } from '@/lib/timezone';

function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) {
    return '""';
  }
  let str = String(val);

  // Mitigasi CSV Formula Injection (CWE-1236):
  // Jika teks dimulai dengan karakter pemicu formula (=, +, @, tab, CR) atau ekspresi formula minus
  if (
    str.startsWith('=') ||
    str.startsWith('+') ||
    str.startsWith('@') ||
    str.startsWith('\t') ||
    str.startsWith('\r') ||
    (str.startsWith('-') && str.length > 1 && !/^-?\d+(\.\d+)?$/.test(str))
  ) {
    str = `'${str}`;
  }

  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

export async function GET(request: NextRequest) {
  try {
    const authContext = await requireAdmin();
    const adminClient = createAdminClient();

    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');

    let query = adminClient
      .from('loans')
      .select(`
        id,
        borrowed_at,
        due_at,
        returned_at,
        status,
        borrow_identification_method,
        returned_by_type,
        returned_by_name,
        return_condition,
        damage_notes,
        student:students (
          id,
          nim,
          name
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
          name
        ),
        borrow_staff:staff_profiles!loans_borrow_processed_by_fkey (
          id,
          name
        ),
        return_staff:staff_profiles!loans_return_processed_by_fkey (
          id,
          name
        )
      `);

    if (fromParam) {
      const fromDate = new Date(fromParam).toISOString();
      query = query.gte('borrowed_at', fromDate);
    }

    if (toParam) {
      const toDate = toParam.includes('T')
        ? new Date(toParam).toISOString()
        : new Date(`${toParam}T23:59:59.999Z`).toISOString();
      query = query.lte('borrowed_at', toDate);
    }

    query = query.order('borrowed_at', { ascending: false });

    const { data: loans, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: { code: 'EXPORT_FAILED', message: error.message } },
        { status: 500 }
      );
    }

    const rows: string[] = [];
    const headers = [
      'ID Transaksi',
      'Tanggal & Waktu Pinjam (WIB)',
      'Batas Waktu Pengembalian (WIB)',
      'Tanggal & Waktu Kembali (WIB)',
      'Status Transaksi',
      'Terlambat',
      'NIM Peminjam',
      'Nama Peminjam',
      'Program Studi',
      'Angkatan',
      'Rombel',
      'Semester Akademik',
      'Kode Proyektor',
      'Nama Proyektor',
      'Metode Identifikasi Pinjam',
      'Petugas Pemroses Pinjam',
      'Tipe Pengembali',
      'Nama Pengembali',
      'Petugas Pemroses Kembali',
      'Kondisi Saat Kembali',
      'Catatan Kendala / Kerusakan',
    ];

    rows.push(headers.map(escapeCsvCell).join(','));

    const now = new Date();
    type ExportLoan = (typeof loans)[number];

    for (const loan of (loans || []) as ExportLoan[]) {
      const isOverdue = loan.status === 'ACTIVE' && new Date(loan.due_at) < now;
      const statusLabel = loan.status === 'ACTIVE' ? 'Sedang Dipinjam' : 'Selesai';
      const overdueLabel = isOverdue ? 'Ya' : 'Tidak';
      const student = loan.student as { nim?: string; name?: string } | null;
      const classInfo = loan.class as {
        study_program?: string;
        cohort_year?: number;
        section?: string;
        academic_term?: string;
      } | null;
      const projector = loan.projector as { code?: string; name?: string } | null;
      const borrowStaff = loan.borrow_staff as { name?: string } | null;
      const returnStaff = loan.return_staff as { name?: string } | null;

      const returnerTypeLabel =
        loan.returned_by_type === 'BORROWER'
          ? 'Peminjam Sendiri'
          : loan.returned_by_type === 'REPRESENTATIVE'
          ? 'Perwakilan'
          : '-';

      const conditionLabel =
        loan.return_condition === 'NORMAL'
          ? 'Normal'
          : loan.return_condition === 'REPORTED_ISSUE'
          ? 'Kendala Dilaporkan'
          : '-';

      const row = [
        loan.id,
        formatWib(loan.borrowed_at, 'full'),
        formatWib(loan.due_at, 'full'),
        loan.returned_at ? formatWib(loan.returned_at, 'full') : '-',
        statusLabel,
        overdueLabel,
        student?.nim || '-',
        student?.name || '-',
        classInfo?.study_program || '-',
        classInfo?.cohort_year ? String(classInfo.cohort_year) : '-',
        classInfo?.section || '-',
        classInfo?.academic_term || '-',
        projector?.code || '-',
        projector?.name || '-',
        loan.borrow_identification_method,
        borrowStaff?.name || '-',
        returnerTypeLabel,
        loan.returned_by_name || '-',
        returnStaff?.name || '-',
        conditionLabel,
        loan.damage_notes || '-',
      ];

      rows.push(row.map(escapeCsvCell).join(','));
    }

    // Prepend UTF-8 BOM untuk kompatibilitas Microsoft Excel
    const csvContent = '\uFEFF' + rows.join('\r\n');

    // Catat ke Audit Log
    await recordAuditLog(adminClient, {
      action: 'LOANS_EXPORTED',
      entityType: 'loans',
      actorStaffId: authContext.staffProfile?.id || null,
      metadata: {
        from: fromParam || null,
        to: toParam || null,
        record_count: (loans || []).length,
      },
    });

    const filename = `smartprojex-transaksi-${fromParam || 'all'}-sd-${toParam || 'all'}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
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
