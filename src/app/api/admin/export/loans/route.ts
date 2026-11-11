import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
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

  // RFC 4180: Selalu duplikasi tanda kutip ganda dan bungkus dengan kutip
  // sehingga karakter koma, tanda kutip, atau newline dalam catatan tidak merusak struktur kolom
  return `"${str.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  try {
    const authContext = await requireAdmin();
    const adminClient = createAdminClient();

    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const formatParam = (searchParams.get('format') || 'csv').toLowerCase();

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

    const now = new Date();
    type ExportLoan = (typeof loans)[number];

    const dataRows: string[][] = [];

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

      dataRows.push(row);
    }

    // Catat ke Audit Log
    await recordAuditLog(adminClient, {
      action: 'LOANS_EXPORTED',
      entityType: 'loans',
      actorStaffId: authContext.staffProfile?.id || null,
      metadata: {
        from: fromParam || null,
        to: toParam || null,
        record_count: (loans || []).length,
        format: formatParam === 'xlsx' ? 'xlsx' : 'csv',
      },
    });

    if (formatParam === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'PINJAM';
      workbook.lastModifiedBy = authContext.staffProfile?.name || 'Administrator';
      workbook.created = new Date();
      workbook.modified = new Date();

      const worksheet = workbook.addWorksheet('Riwayat Transaksi', {
        views: [{ state: 'frozen', ySplit: 1, xSplit: 0 }],
        properties: { defaultRowHeight: 20 },
      });

      // Definisikan kolom
      worksheet.columns = headers.map((header) => ({
        header,
        key: header,
      }));

      // Format Header Row (Baris 1): Tebal, latar belakang bersih, rapi
      const headerRow = worksheet.getRow(1);
      headerRow.height = 28;
      headerRow.eachCell((cell) => {
        cell.font = {
          name: 'Segoe UI',
          size: 11,
          bold: true,
          color: { argb: 'FF1E293B' }, // Slate-800
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE2E8F0' }, // Slate-200
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: true,
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'medium', color: { argb: 'FF94A3B8' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
      });

      // Tambahkan seluruh baris data dan terapkan format sel
      dataRows.forEach((rowValues) => {
        const row = worksheet.addRow(rowValues);
        row.height = 20;
        row.eachCell((cell, colNumber) => {
          cell.font = {
            name: 'Segoe UI',
            size: 10,
            color: { argb: 'FF334155' }, // Slate-700
          };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFF1F5F9' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFF1F5F9' } },
            right: { style: 'thin', color: { argb: 'FFF1F5F9' } },
          };
          // Kolom status / identifier pendek diletakkan di tengah
          const isCenterCol = [1, 5, 6, 10, 11, 15, 17, 20].includes(colNumber);
          cell.alignment = {
            vertical: 'middle',
            horizontal: isCenterCol ? 'center' : 'left',
            wrapText: colNumber === 21,
          };
        });
      });

      // Sesuaikan lebar setiap kolom secara dinamis berdasarkan panjang isi
      worksheet.columns.forEach((column) => {
        let maxLen = 0;
        if (column.header) {
          maxLen = column.header.toString().length;
        }
        if (column.eachCell) {
          column.eachCell({ includeEmpty: false }, (cell) => {
            const val = cell.value ? cell.value.toString() : '';
            const lines = val.split('\n');
            for (const line of lines) {
              if (line.length > maxLen) {
                maxLen = line.length;
              }
            }
          });
        }
        // Min 14, padding +3, maksimum 45 agar rapi
        column.width = Math.min(Math.max(maxLen + 3, 14), 45);
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const filename = `pinjam-transaksi-${fromParam || 'all'}-sd-${toParam || 'all'}.xlsx`;

      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    // Default: CSV dengan UTF-8 BOM
    const rows: string[] = [];
    rows.push(headers.map(escapeCsvCell).join(','));
    for (const row of dataRows) {
      rows.push(row.map(escapeCsvCell).join(','));
    }

    // Prepend UTF-8 BOM (\uFEFF) untuk kompatibilitas Microsoft Excel
    const csvContent = '\uFEFF' + rows.join('\r\n');
    const filename = `pinjam-transaksi-${fromParam || 'all'}-sd-${toParam || 'all'}.csv`;

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
