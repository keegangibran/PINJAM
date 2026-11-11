import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { GET as exportLoans } from '@/app/api/admin/export/loans/route';
import * as guards from '@/lib/auth/guards';
import * as audit from '@/lib/audit';

const mockAdminFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}));

vi.mock('@/lib/audit', () => ({
  recordAuditLog: vi.fn().mockResolvedValue({ success: true, id: 'audit-log-export' }),
}));

describe('Admin Export Loans CSV & Excel API (GET /api/admin/export/loans)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

    vi.spyOn(guards, 'requireAdmin').mockResolvedValue({
      userId: 'usr-admin',
      email: 'admin@kampus.ac.id',
      role: 'ADMIN',
      staffProfile: { id: 'stf-admin', name: 'Admin Utama', role: 'ADMIN', isActive: true },
    });
  });

  it('rejects non-admin caller with 403', async () => {
    vi.spyOn(guards, 'requireAdmin').mockRejectedValueOnce(
      new guards.AuthError('Akses ditolak: Operasi administratif ini hanya diizinkan untuk peran Administrator.', 403, 'FORBIDDEN_ADMIN_ONLY')
    );

    const req = new NextRequest('http://localhost/api/admin/export/loans');
    const res = await exportLoans(req);
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error.code).toBe('UNAUTHORIZED_OR_ERROR');
  });

  it('generates valid RFC 4180 CSV with UTF-8 BOM, WIB dates, and 21 columns', async () => {
    const sampleLoans = [
      {
        id: 'loan-1',
        borrowed_at: '2026-11-06T08:30:00Z',
        due_at: '2026-11-06T10:00:00Z',
        returned_at: '2026-11-06T09:45:00Z',
        status: 'COMPLETED',
        borrow_identification_method: 'QR',
        returned_by_type: 'BORROWER',
        returned_by_name: null,
        return_condition: 'NORMAL',
        damage_notes: null,
        student: { id: 'std-1', nim: '4223121001', name: 'Keegan Mahasiswa' },
        class: {
          id: 'cls-1',
          study_program: 'Pendidikan Matematika',
          cohort_year: 2024,
          section: 'A',
          academic_term: '2026/2027-GANJIL',
        },
        projector: { id: 'prj-1', code: 'PROJ-01', name: 'Epson EB-X400 "Superior"' },
        borrow_staff: { id: 'stf-1', name: 'Petugas Pagi' },
        return_staff: { id: 'stf-2', name: 'Petugas Siang' },
      },
    ];

    const queryBuilder: Record<string, unknown> = {};
    queryBuilder.gte = vi.fn().mockReturnValue(queryBuilder);
    queryBuilder.lte = vi.fn().mockReturnValue(queryBuilder);
    queryBuilder.order = vi.fn().mockResolvedValue({ data: sampleLoans, error: null });

    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue(queryBuilder),
    });

    const req = new NextRequest('http://localhost/api/admin/export/loans?from=2026-11-01&to=2026-11-06');
    const res = await exportLoans(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toContain('attachment; filename="smartprojex-transaksi-2026-11-01-sd-2026-11-06.csv"');

    // Must start with UTF-8 BOM (EF BB BF) for Microsoft Excel compatibility
    const arrayBuffer = await res.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    expect(bytes[0]).toBe(0xEF);
    expect(bytes[1]).toBe(0xBB);
    expect(bytes[2]).toBe(0xBF);

    // Decode to text and check rows
    const csvText = new TextDecoder().decode(bytes);

    // Check headers row
    const lines = csvText.replace(/^\uFEFF/, '').split('\r\n');
    expect(lines.length).toBe(2); // Header + 1 record

    const headerColumns = lines[0].split(',');
    expect(headerColumns.length).toBe(21);
    expect(headerColumns[0]).toBe('"ID Transaksi"');
    expect(headerColumns[6]).toBe('"NIM Peminjam"');
    expect(headerColumns[7]).toBe('"Nama Peminjam"');
    expect(headerColumns[12]).toBe('"Kode Proyektor"');

    // Check row data and escaping
    const row = lines[1];
    expect(row).toContain('"loan-1"');
    expect(row).toContain('"Keegan Mahasiswa"');
    expect(row).toContain('"4223121001"');
    expect(row).toContain('"Pendidikan Matematika"');
    expect(row).toContain('"PROJ-01"');
    // Double quote escaped in Epson EB-X400 ""Superior""
    expect(row).toContain('"Epson EB-X400 ""Superior"""');

    // Audit log recorded
    expect(audit.recordAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'LOANS_EXPORTED',
        entityType: 'loans',
        metadata: {
          from: '2026-11-01',
          to: '2026-11-06',
          record_count: 1,
          format: 'csv',
        },
      })
    );
  });

  it('generates valid Excel (.xlsx) file with bold headers, custom widths, and 21 columns', async () => {
    const sampleLoans = [
      {
        id: 'loan-xlsx-1',
        borrowed_at: '2026-11-06T08:30:00Z',
        due_at: '2026-11-06T10:00:00Z',
        returned_at: '2026-11-06T09:45:00Z',
        status: 'COMPLETED',
        borrow_identification_method: 'QR',
        returned_by_type: 'REPRESENTATIVE',
        returned_by_name: 'Budi Utomo',
        return_condition: 'REPORTED_ISSUE',
        damage_notes: 'Kabel HDMI tidak berfungsi, port VGA longgar',
        student: { id: 'std-2', nim: '4223121002', name: 'Dewi Lestari' },
        class: {
          id: 'cls-2',
          study_program: 'Pendidikan Fisika',
          cohort_year: 2023,
          section: 'B',
          academic_term: '2026/2027-GANJIL',
        },
        projector: { id: 'prj-2', code: 'PROJ-02', name: 'InFocus IN112x' },
        borrow_staff: { id: 'stf-1', name: 'Petugas Pagi' },
        return_staff: { id: 'stf-2', name: 'Petugas Siang' },
      },
    ];

    const queryBuilder: Record<string, unknown> = {};
    queryBuilder.gte = vi.fn().mockReturnValue(queryBuilder);
    queryBuilder.lte = vi.fn().mockReturnValue(queryBuilder);
    queryBuilder.order = vi.fn().mockResolvedValue({ data: sampleLoans, error: null });

    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue(queryBuilder),
    });

    const req = new NextRequest('http://localhost/api/admin/export/loans?format=xlsx&from=2026-11-01&to=2026-11-06');
    const res = await exportLoans(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(res.headers.get('Content-Disposition')).toContain(
      'attachment; filename="smartprojex-transaksi-2026-11-01-sd-2026-11-06.xlsx"'
    );

    const arrayBuffer = await res.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    const worksheet = workbook.getWorksheet('Riwayat Transaksi');
    expect(worksheet).toBeDefined();

    // Verify Header row (Row 1)
    const headerRow = worksheet!.getRow(1);
    expect(headerRow.cellCount).toBe(21);
    expect(headerRow.getCell(1).value).toBe('ID Transaksi');
    expect(headerRow.getCell(7).value).toBe('NIM Peminjam');
    expect(headerRow.getCell(8).value).toBe('Nama Peminjam');
    expect(headerRow.getCell(13).value).toBe('Kode Proyektor');
    expect(headerRow.getCell(21).value).toBe('Catatan Kendala / Kerusakan');

    // Header cells must be bold
    expect(headerRow.getCell(1).font?.bold).toBe(true);
    expect(headerRow.getCell(8).font?.bold).toBe(true);

    // Verify Data row (Row 2)
    const dataRow = worksheet!.getRow(2);
    expect(dataRow.getCell(1).value).toBe('loan-xlsx-1');
    expect(dataRow.getCell(5).value).toBe('Selesai');
    expect(dataRow.getCell(7).value).toBe('4223121002');
    expect(dataRow.getCell(8).value).toBe('Dewi Lestari');
    expect(dataRow.getCell(13).value).toBe('PROJ-02');
    expect(dataRow.getCell(17).value).toBe('Perwakilan');
    expect(dataRow.getCell(18).value).toBe('Budi Utomo');
    expect(dataRow.getCell(20).value).toBe('Kendala Dilaporkan');
    expect(dataRow.getCell(21).value).toBe('Kabel HDMI tidak berfungsi, port VGA longgar');

    // Verify column widths adjusted (>= 14 and <= 45)
    worksheet!.columns.forEach((col) => {
      expect(col.width).toBeGreaterThanOrEqual(14);
      expect(col.width).toBeLessThanOrEqual(45);
    });

    // Audit log recorded format: 'xlsx'
    expect(audit.recordAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'LOANS_EXPORTED',
        entityType: 'loans',
        metadata: {
          from: '2026-11-01',
          to: '2026-11-06',
          record_count: 1,
          format: 'xlsx',
        },
      })
    );
  });

  it('properly escapes commas and special characters in CSV damage notes without corrupting column count', async () => {
    const loanWithCommas = [
      {
        id: 'loan-notes-1',
        borrowed_at: '2026-11-06T08:00:00Z',
        due_at: '2026-11-06T10:00:00Z',
        returned_at: '2026-11-06T09:00:00Z',
        status: 'COMPLETED',
        borrow_identification_method: 'MANUAL_LOOKUP',
        returned_by_type: 'BORROWER',
        returned_by_name: null,
        return_condition: 'REPORTED_ISSUE',
        damage_notes: 'Lensa retak, tombol power macet, "remote" hilang, baut lepas',
        student: { id: 'std-1', nim: '4223121001', name: 'Andi, Pratama' },
        class: { id: 'cls-1', study_program: 'Ilmu Komputer', cohort_year: 2024, section: 'A', academic_term: '2026/2027-GANJIL' },
        projector: { id: 'prj-1', code: 'PROJ-01', name: 'Epson' },
        borrow_staff: { id: 'stf-1', name: 'Petugas' },
        return_staff: { id: 'stf-2', name: 'Petugas' },
      },
    ];

    const queryBuilder: Record<string, unknown> = {};
    queryBuilder.gte = vi.fn().mockReturnValue(queryBuilder);
    queryBuilder.lte = vi.fn().mockReturnValue(queryBuilder);
    queryBuilder.order = vi.fn().mockResolvedValue({ data: loanWithCommas, error: null });

    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue(queryBuilder),
    });

    const req = new NextRequest('http://localhost/api/admin/export/loans?format=csv');
    const res = await exportLoans(req);
    const arrayBuffer = await res.arrayBuffer();
    const csvText = new TextDecoder().decode(new Uint8Array(arrayBuffer));
    const lines = csvText.replace(/^\uFEFF/, '').split('\r\n');

    expect(lines.length).toBe(2);
    const dataLine = lines[1];

    // Commas within name and notes must be wrapped in quotes
    expect(dataLine).toContain('"Andi, Pratama"');
    expect(dataLine).toContain('"Lensa retak, tombol power macet, ""remote"" hilang, baut lepas"');

    // RFC 4180 parsing regex test: splitting while respecting quotes must yield exactly 21 fields
    const parsedFields = dataLine.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
    expect(parsedFields?.length).toBe(21);
  });

  it('exports all loan states including completed, overdue, and loans with reported issues', async () => {
    const mixedLoans = [
      {
        id: 'loan-completed',
        borrowed_at: '2026-11-06T08:00:00Z',
        due_at: '2026-11-06T10:00:00Z',
        returned_at: '2026-11-06T09:30:00Z',
        status: 'COMPLETED',
        borrow_identification_method: 'QR',
        returned_by_type: 'BORROWER',
        returned_by_name: null,
        return_condition: 'NORMAL',
        damage_notes: null,
        student: { id: 'std-1', nim: '111', name: 'Mahasiswa 1' },
        class: { id: 'cls-1', study_program: 'Matematika', cohort_year: 2024, section: 'A', academic_term: '2026/2027-GANJIL' },
        projector: { id: 'prj-1', code: 'PROJ-01', name: 'Epson' },
        borrow_staff: { id: 'stf-1', name: 'Petugas' },
        return_staff: { id: 'stf-2', name: 'Petugas' },
      },
      {
        id: 'loan-overdue',
        borrowed_at: '2026-11-01T08:00:00Z',
        due_at: '2026-11-01T10:00:00Z', // Past due
        returned_at: null,
        status: 'ACTIVE',
        borrow_identification_method: 'QR',
        returned_by_type: null,
        returned_by_name: null,
        return_condition: null,
        damage_notes: null,
        student: { id: 'std-2', nim: '222', name: 'Mahasiswa 2' },
        class: { id: 'cls-1', study_program: 'Matematika', cohort_year: 2024, section: 'A', academic_term: '2026/2027-GANJIL' },
        projector: { id: 'prj-2', code: 'PROJ-02', name: 'BenQ' },
        borrow_staff: { id: 'stf-1', name: 'Petugas' },
        return_staff: null,
      },
      {
        id: 'loan-reported-issue',
        borrowed_at: '2026-11-06T08:00:00Z',
        due_at: '2026-11-06T10:00:00Z',
        returned_at: '2026-11-06T09:50:00Z',
        status: 'COMPLETED',
        borrow_identification_method: 'MANUAL_LOOKUP',
        returned_by_type: 'REPRESENTATIVE',
        returned_by_name: 'Wakil',
        return_condition: 'REPORTED_ISSUE',
        damage_notes: 'Lampu indikator berkedip merah',
        student: { id: 'std-3', nim: '333', name: 'Mahasiswa 3' },
        class: { id: 'cls-1', study_program: 'Matematika', cohort_year: 2024, section: 'A', academic_term: '2026/2027-GANJIL' },
        projector: { id: 'prj-3', code: 'PROJ-03', name: 'Acer' },
        borrow_staff: { id: 'stf-1', name: 'Petugas' },
        return_staff: { id: 'stf-2', name: 'Petugas' },
      },
    ];

    const queryBuilder: Record<string, unknown> = {};
    queryBuilder.gte = vi.fn().mockReturnValue(queryBuilder);
    queryBuilder.lte = vi.fn().mockReturnValue(queryBuilder);
    queryBuilder.order = vi.fn().mockResolvedValue({ data: mixedLoans, error: null });

    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue(queryBuilder),
    });

    const req = new NextRequest('http://localhost/api/admin/export/loans');
    const res = await exportLoans(req);
    const arrayBuffer = await res.arrayBuffer();
    const csvText = new TextDecoder().decode(new Uint8Array(arrayBuffer));
    const lines = csvText.replace(/^\uFEFF/, '').split('\r\n');

    expect(lines.length).toBe(4); // Header + 3 loans

    // Check loan-completed
    expect(lines[1]).toContain('"loan-completed"');
    expect(lines[1]).toContain('"Selesai"');
    expect(lines[1]).toContain('"Tidak"'); // not overdue

    // Check loan-overdue
    expect(lines[2]).toContain('"loan-overdue"');
    expect(lines[2]).toContain('"Sedang Dipinjam"');
    expect(lines[2]).toContain('"Ya"'); // is overdue

    // Check loan-reported-issue
    expect(lines[3]).toContain('"loan-reported-issue"');
    expect(lines[3]).toContain('"Kendala Dilaporkan"');
    expect(lines[3]).toContain('"Lampu indikator berkedip merah"');
  });

  it('sanitizes untrusted input against CSV Formula Injection (CWE-1236)', async () => {
    const maliciousLoans = [
      {
        id: 'loan-vuln',
        borrowed_at: '2026-11-06T08:00:00Z',
        due_at: '2026-11-06T10:00:00Z',
        returned_at: '2026-11-06T09:00:00Z',
        status: 'COMPLETED',
        borrow_identification_method: 'QR',
        returned_by_type: 'REPRESENTATIVE',
        returned_by_name: '=cmd|"/C calc"!A0', // Formula attack
        return_condition: 'REPORTED_ISSUE',
        damage_notes: '+1234567890-SUM(1,2)', // Formula attack
        student: { id: 'std-1', nim: '4223121001', name: '@attacker' },
        class: { id: 'cls-1', study_program: 'Ilmu Komputer', cohort_year: 2024, section: 'A', academic_term: '2026/2027-GANJIL' },
        projector: { id: 'prj-1', code: 'PROJ-01', name: 'Epson' },
        borrow_staff: { id: 'stf-1', name: 'Petugas' },
        return_staff: { id: 'stf-2', name: 'Petugas' },
      },
    ];

    const queryBuilder: Record<string, unknown> = {};
    queryBuilder.gte = vi.fn().mockReturnValue(queryBuilder);
    queryBuilder.lte = vi.fn().mockReturnValue(queryBuilder);
    queryBuilder.order = vi.fn().mockResolvedValue({ data: maliciousLoans, error: null });

    mockAdminFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue(queryBuilder),
    });

    const req = new NextRequest('http://localhost/api/admin/export/loans');
    const res = await exportLoans(req);
    const arrayBuffer = await res.arrayBuffer();
    const csvText = new TextDecoder().decode(new Uint8Array(arrayBuffer));
    const lines = csvText.replace(/^\uFEFF/, '').split('\r\n');
    const row = lines[1];

    // Formula injection cells must be prepended with a single quote '
    expect(row).toContain('"\'=cmd|""/C calc""!A0"');
    expect(row).toContain('"\'@attacker"');
    expect(row).toContain('"\'+1234567890-SUM(1,2)"');
  });
});
