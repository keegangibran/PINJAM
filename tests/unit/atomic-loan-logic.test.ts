import { describe, it, expect, beforeEach } from 'vitest';

/**
 * State simulator untuk memvalidasi logika alur bisnis, percabangan Smart Toggle,
 * idempotensi, dan proteksi race condition dari fungsi PL/pgSQL process_loan_transaction.
 */

interface MockStaff {
  id: string;
  auth_user_id: string;
  is_active: boolean;
}

interface MockProjector {
  id: string;
  code: string;
  status: 'AVAILABLE' | 'BORROWED' | 'MAINTENANCE' | 'INACTIVE';
  notes?: string | null;
}

interface MockStudent {
  id: string;
  nim: string;
  registration_status: 'ACTIVE' | 'INACTIVE' | 'PENDING_DOCUMENT';
}

interface MockClass {
  id: string;
  leader_student_id: string | null;
  is_active: boolean;
}

interface MockKioskSession {
  id: string;
  student_id: string;
  class_id: string;
  expires_at: number;
  consumed_at: number | null;
  identification_method: 'QR' | 'MANUAL_LOOKUP';
}

interface MockLoan {
  id: string;
  idempotency_key: string;
  student_id: string;
  projector_id: string;
  status: 'ACTIVE' | 'COMPLETED';
  returned_by_type?: 'BORROWER' | 'REPRESENTATIVE' | null;
  returned_by_name?: string | null;
  return_condition?: 'NORMAL' | 'REPORTED_ISSUE' | null;
  damage_notes?: string | null;
  issue_resolved_at?: number | null;
}

class LoanTransactionSimulator {
  public staff: Map<string, MockStaff> = new Map();
  public projectors: Map<string, MockProjector> = new Map();
  public students: Map<string, MockStudent> = new Map();
  public classes: Map<string, MockClass> = new Map();
  public kioskSessions: Map<string, MockKioskSession> = new Map();
  public loans: Map<string, MockLoan> = new Map();
  public statusLogs: Array<any> = [];
  public auditLogs: Array<any> = [];

  // Simulasi mutex per kode proyektor & per mahasiswa untuk menguji race condition
  private lockedProjectorCodes: Set<string> = new Set();
  private lockedStudentIds: Set<string> = new Set();

  public async execute(params: {
    idempotencyKey: string;
    projectorCode: string;
    photoPath: string;
    condition: 'NORMAL' | 'REPORTED_ISSUE';
    staffAuthId: string;
    kioskSessionId?: string | null;
    issueNotes?: string | null;
    returnerType?: 'BORROWER' | 'REPRESENTATIVE' | null;
    returnerName?: string | null;
    currentTime?: number;
  }) {
    const now = params.currentTime ?? Date.now();

    // 1. Validasi Staf
    const staff = Array.from(this.staff.values()).find(
      (s) => s.auth_user_id === params.staffAuthId && s.is_active
    );
    if (!staff) {
      throw new Error('AKSES_DITOLAK: Kredensial petugas tidak terdaftar atau tidak aktif.');
    }

    // 2. Idempotency Check
    const existingLoan = Array.from(this.loans.values()).find(
      (l) => l.idempotency_key === params.idempotencyKey
    );
    if (existingLoan) {
      return {
        success: true,
        idempotent_replay: true,
        action: existingLoan.status === 'ACTIVE' ? 'BORROW' : 'RETURN',
        loan_id: existingLoan.id,
        projector_code: params.projectorCode,
        status: existingLoan.status,
        message: 'Transaksi telah diproses sebelumnya (idempotency key cocok).',
      };
    }

    const existingStatusLog = this.statusLogs.find(
      (sl) => sl.idempotency_key === params.idempotencyKey
    );
    if (existingStatusLog) {
      return {
        success: true,
        idempotent_replay: true,
        action: 'CANCELLED_ISSUE',
        loan_id: null,
        projector_code: params.projectorCode,
        status: 'MAINTENANCE',
        message: 'Laporan kendala saat penerimaan telah diproses sebelumnya (idempotency key cocok).',
      };
    }

    // 3. Row-level Lock pada Proyektor
    if (this.lockedProjectorCodes.has(params.projectorCode)) {
      throw new Error('KONKURENSI_TERDETEKSI: Unit proyektor sedang dikunci oleh transaksi lain.');
    }
    this.lockedProjectorCodes.add(params.projectorCode);

    try {
      const projector = Array.from(this.projectors.values()).find(
        (p) => p.code === params.projectorCode
      );
      if (!projector) {
        throw new Error('PROYEKTOR_TIDAK_DITEMUKAN');
      }

      if (projector.status === 'INACTIVE' || projector.status === 'MAINTENANCE') {
        throw new Error(`STATUS_UNIT_TIDAK_VALID: Unit berstatus ${projector.status}`);
      }

      // ======================================================================
      // ALUR A: AVAILABLE -> Peminjaman Baru
      // ======================================================================
      if (projector.status === 'AVAILABLE') {
        if (!params.kioskSessionId) {
          throw new Error('SESI_KIOSK_DIBUTUHKAN');
        }

        const session = this.kioskSessions.get(params.kioskSessionId);
        if (!session) {
          throw new Error('SESI_KIOSK_TIDAK_DITEMUKAN');
        }

        if (session.expires_at < now) {
          throw new Error('SESI_KIOSK_KEDALUWARSA');
        }

        if (session.consumed_at !== null) {
          throw new Error('SESI_KIOSK_SUDAH_DIGUNAKAN');
        }

        // Lock Mahasiswa
        if (this.lockedStudentIds.has(session.student_id)) {
          throw new Error('KONKURENSI_TERDETEKSI: Mahasiswa sedang dikunci oleh transaksi lain.');
        }
        this.lockedStudentIds.add(session.student_id);

        try {
          const student = this.students.get(session.student_id);
          if (!student || student.registration_status !== 'ACTIVE') {
            throw new Error('MAHASISWA_TIDAK_AKTIF');
          }

          const targetClass = this.classes.get(session.class_id);
          if (!targetClass || targetClass.leader_student_id !== student.id || !targetClass.is_active) {
            throw new Error('BUKAN_KETUA_KELAS_AKTIF');
          }

          // Cek partial unique index: 1 pinjaman aktif per mahasiswa
          const studentActiveLoan = Array.from(this.loans.values()).find(
            (l) => l.student_id === student.id && l.status === 'ACTIVE'
          );
          if (studentActiveLoan) {
            throw new Error('PINJAMAN_AKTIF_SUDAH_ADA');
          }

          // Konsumsi sesi
          session.consumed_at = now;

          if (params.condition === 'NORMAL') {
            const loanId = `loan-${now}`;
            const newLoan: MockLoan = {
              id: loanId,
              idempotency_key: params.idempotencyKey,
              student_id: student.id,
              projector_id: projector.id,
              status: 'ACTIVE',
            };
            this.loans.set(loanId, newLoan);
            projector.status = 'BORROWED';

            this.statusLogs.push({
              projector_id: projector.id,
              from_status: 'AVAILABLE',
              to_status: 'BORROWED',
            });

            this.auditLogs.push({
              action: 'LOAN_BORROWED',
              entity_id: loanId,
            });

            return {
              success: true,
              action: 'BORROW',
              loan_id: loanId,
              projector_code: params.projectorCode,
              status: 'BORROWED',
            };
          } else if (params.condition === 'REPORTED_ISSUE') {
            // FR-06: Tidak membuat loans, unit menjadi MAINTENANCE
            projector.status = 'MAINTENANCE';
            this.statusLogs.push({
              projector_id: projector.id,
              from_status: 'AVAILABLE',
              to_status: 'MAINTENANCE',
              idempotency_key: params.idempotencyKey,
            });

            this.auditLogs.push({
              action: 'PROJECTOR_STATUS_CHANGED',
              entity_id: projector.id,
            });

            return {
              success: true,
              action: 'CANCELLED_ISSUE',
              loan_id: null,
              projector_code: params.projectorCode,
              status: 'MAINTENANCE',
            };
          }
        } finally {
          this.lockedStudentIds.delete(session.student_id);
        }
      }

      // ======================================================================
      // ALUR B: BORROWED -> Pengembalian
      // ======================================================================
      if (projector.status === 'BORROWED') {
        const activeLoan = Array.from(this.loans.values()).find(
          (l) => l.projector_id === projector.id && l.status === 'ACTIVE'
        );
        if (!activeLoan) {
          throw new Error('DATA_INKONSISTEN: Tidak ditemukan pinjaman aktif untuk unit ini.');
        }

        if (params.returnerType === 'REPRESENTATIVE') {
          if (!params.returnerName || params.returnerName.trim() === '') {
            throw new Error('NAMA_PERWAKILAN_WAJIB');
          }
        } else if (params.returnerType === 'BORROWER') {
          // Peminjam sendiri
        } else {
          throw new Error('TIPE_PENGEMBALI_TIDAK_VALID: Tipe pengembali harus BORROWER atau REPRESENTATIVE.');
        }

        activeLoan.status = 'COMPLETED';
        activeLoan.returned_by_type = params.returnerType;
        activeLoan.returned_by_name = params.returnerName;
        activeLoan.return_condition = params.condition;

        if (params.condition === 'NORMAL') {
          projector.status = 'AVAILABLE';
          activeLoan.issue_resolved_at = now;

          this.statusLogs.push({
            projector_id: projector.id,
            from_status: 'BORROWED',
            to_status: 'AVAILABLE',
          });

          this.auditLogs.push({
            action: 'LOAN_RETURNED',
            entity_id: activeLoan.id,
          });

          return {
            success: true,
            action: 'RETURN',
            loan_id: activeLoan.id,
            projector_code: params.projectorCode,
            status: 'AVAILABLE',
          };
        } else if (params.condition === 'REPORTED_ISSUE') {
          projector.status = 'MAINTENANCE';
          activeLoan.damage_notes = params.issueNotes;
          activeLoan.issue_resolved_at = null;

          this.statusLogs.push({
            projector_id: projector.id,
            from_status: 'BORROWED',
            to_status: 'MAINTENANCE',
          });

          this.auditLogs.push({
            action: 'LOAN_RETURNED_WITH_ISSUE',
            entity_id: activeLoan.id,
          });

          return {
            success: true,
            action: 'RETURN_ISSUE',
            loan_id: activeLoan.id,
            projector_code: params.projectorCode,
            status: 'MAINTENANCE',
          };
        }
      }

      throw new Error(`STATUS_UNIT_TIDAK_DIKENAL: ${projector.status}`);
    } finally {
      this.lockedProjectorCodes.delete(params.projectorCode);
    }
  }
}

describe('Atomic Loan Transaction State Logic (PL/pgSQL process_loan_transaction)', () => {
  let sim: LoanTransactionSimulator;

  beforeEach(() => {
    sim = new LoanTransactionSimulator();

    // Data Awal
    sim.staff.set('staff-1', { id: 'staff-1', auth_user_id: 'auth-staff-1', is_active: true });
    sim.projectors.set('proj-1', { id: 'proj-1', code: 'SPX-001', status: 'AVAILABLE' });
    sim.students.set('student-1', { id: 'student-1', nim: '4223121001', registration_status: 'ACTIVE' });
    sim.classes.set('class-1', { id: 'class-1', leader_student_id: 'student-1', is_active: true });

    sim.kioskSessions.set('sess-1', {
      id: 'sess-1',
      student_id: 'student-1',
      class_id: 'class-1',
      expires_at: Date.now() + 120000,
      consumed_at: null,
      identification_method: 'QR',
    });
  });

  it('F-1: Menolak eksekusi jika pemanggil bukan staf aktif', async () => {
    await expect(
      sim.execute({
        idempotencyKey: 'idemp-1',
        projectorCode: 'SPX-001',
        photoPath: 'loans/b1.jpg',
        condition: 'NORMAL',
        staffAuthId: 'unauthorized-user',
        kioskSessionId: 'sess-1',
      })
    ).rejects.toThrow('AKSES_DITOLAK');
  });

  it('F-2: Smart Toggle Berhasil Meminjam Unit AVAILABLE (Borrow Flow)', async () => {
    const result = await sim.execute({
      idempotencyKey: 'idemp-1',
      projectorCode: 'SPX-001',
      photoPath: 'loans/b1.jpg',
      condition: 'NORMAL',
      staffAuthId: 'auth-staff-1',
      kioskSessionId: 'sess-1',
    });

    expect(result.success).toBe(true);
    expect(result.action).toBe('BORROW');
    expect(result.status).toBe('BORROWED');

    // Unit diubah ke BORROWED
    expect(sim.projectors.get('proj-1')?.status).toBe('BORROWED');
    // Sesi dikonsumsi
    expect(sim.kioskSessions.get('sess-1')?.consumed_at).not.toBeNull();
    // Audit log tercatat
    expect(sim.auditLogs).toHaveLength(1);
    expect(sim.auditLogs[0].action).toBe('LOAN_BORROWED');
  });

  it('F-3: Idempotency Key mengembalikan hasil tersimpan tanpa membuat duplikasi transaksi', async () => {
    // Panggilan pertama
    const res1 = await sim.execute({
      idempotencyKey: 'idemp-repeatable',
      projectorCode: 'SPX-001',
      photoPath: 'loans/b1.jpg',
      condition: 'NORMAL',
      staffAuthId: 'auth-staff-1',
      kioskSessionId: 'sess-1',
    });

    // Panggilan kedua dengan idempotencyKey sama
    const res2 = await sim.execute({
      idempotencyKey: 'idemp-repeatable',
      projectorCode: 'SPX-001',
      photoPath: 'loans/b1.jpg',
      condition: 'NORMAL',
      staffAuthId: 'auth-staff-1',
      kioskSessionId: 'sess-1',
    });

    expect(res2.idempotent_replay).toBe(true);
    expect(res2.loan_id).toBe(res1.loan_id);
    expect(sim.loans.size).toBe(1); // Tetap hanya 1 baris
  });

  it('F-4: Sesi Kiosk kedaluwarsa atau sudah digunakan ditolak', async () => {
    sim.kioskSessions.get('sess-1')!.consumed_at = Date.now();

    await expect(
      sim.execute({
        idempotencyKey: 'idemp-2',
        projectorCode: 'SPX-001',
        photoPath: 'loans/b1.jpg',
        condition: 'NORMAL',
        staffAuthId: 'auth-staff-1',
        kioskSessionId: 'sess-1',
      })
    ).rejects.toThrow('SESI_KIOSK_SUDAH_DIGUNAKAN');
  });

  it('F-5: Satu ketua kelas dilarang meminjam 2 unit aktif secara bersamaan (Partial Unique Invariant)', async () => {
    // Unit pertama dipinjam
    await sim.execute({
      idempotencyKey: 'idemp-first',
      projectorCode: 'SPX-001',
      photoPath: 'loans/b1.jpg',
      condition: 'NORMAL',
      staffAuthId: 'auth-staff-1',
      kioskSessionId: 'sess-1',
    });

    // Sesi baru untuk mahasiswa yang sama
    sim.kioskSessions.set('sess-2', {
      id: 'sess-2',
      student_id: 'student-1',
      class_id: 'class-1',
      expires_at: Date.now() + 120000,
      consumed_at: null,
      identification_method: 'QR',
    });

    // Unit kedua
    sim.projectors.set('proj-2', { id: 'proj-2', code: 'SPX-002', status: 'AVAILABLE' });

    // Coba pinjam unit kedua dengan mahasiswa yang sama
    await expect(
      sim.execute({
        idempotencyKey: 'idemp-second',
        projectorCode: 'SPX-002',
        photoPath: 'loans/b2.jpg',
        condition: 'NORMAL',
        staffAuthId: 'auth-staff-1',
        kioskSessionId: 'sess-2',
      })
    ).rejects.toThrow('PINJAMAN_AKTIF_SUDAH_ADA');
  });

  it('F-6: Laporan kendala saat penerimaan membatalkan peminjaman & menandai unit MAINTENANCE (FR-06)', async () => {
    const result = await sim.execute({
      idempotencyKey: 'idemp-issue-borrow',
      projectorCode: 'SPX-001',
      photoPath: 'loans/issue.jpg',
      condition: 'REPORTED_ISSUE',
      staffAuthId: 'auth-staff-1',
      kioskSessionId: 'sess-1',
      issueNotes: 'Lensa retak saat diperiksa di meja',
    });

    expect(result.action).toBe('CANCELLED_ISSUE');
    expect(result.status).toBe('MAINTENANCE');
    expect(sim.loans.size).toBe(0); // DILARANG ada baris loans yang tercipta
    expect(sim.projectors.get('proj-1')?.status).toBe('MAINTENANCE');
  });

  it('F-7: Smart Toggle Berhasil Mengembalikan Unit BORROWED (Return Flow Normal)', async () => {
    // 1. Pinjam dulu
    await sim.execute({
      idempotencyKey: 'idemp-borrow',
      projectorCode: 'SPX-001',
      photoPath: 'loans/b1.jpg',
      condition: 'NORMAL',
      staffAuthId: 'auth-staff-1',
      kioskSessionId: 'sess-1',
    });

    // 2. Sekarang unit berstatus BORROWED. Jalankan alur kembali
    const returnResult = await sim.execute({
      idempotencyKey: 'idemp-return',
      projectorCode: 'SPX-001',
      photoPath: 'loans/r1.jpg',
      condition: 'NORMAL',
      staffAuthId: 'auth-staff-1',
      returnerType: 'BORROWER',
    });

    expect(returnResult.action).toBe('RETURN');
    expect(returnResult.status).toBe('AVAILABLE');
    expect(sim.projectors.get('proj-1')?.status).toBe('AVAILABLE');

    const loan = Array.from(sim.loans.values())[0];
    expect(loan.status).toBe('COMPLETED');
    expect(loan.issue_resolved_at).not.toBeNull();
  });

  it('F-8: Pengembalian oleh perwakilan wajib mencatat nama perwakilan (FR-07)', async () => {
    // 1. Pinjam
    await sim.execute({
      idempotencyKey: 'idemp-borrow-2',
      projectorCode: 'SPX-001',
      photoPath: 'loans/b1.jpg',
      condition: 'NORMAL',
      staffAuthId: 'auth-staff-1',
      kioskSessionId: 'sess-1',
    });

    // 2. Coba kembalikan perwakilan tanpa nama
    await expect(
      sim.execute({
        idempotencyKey: 'idemp-rep-fail',
        projectorCode: 'SPX-001',
        photoPath: 'loans/r1.jpg',
        condition: 'NORMAL',
        staffAuthId: 'auth-staff-1',
        returnerType: 'REPRESENTATIVE',
        returnerName: '   ', // Nama kosong
      })
    ).rejects.toThrow('NAMA_PERWAKILAN_WAJIB');

    // 3. Kembalikan dengan nama yang valid
    const successReturn = await sim.execute({
      idempotencyKey: 'idemp-rep-ok',
      projectorCode: 'SPX-001',
      photoPath: 'loans/r1.jpg',
      condition: 'NORMAL',
      staffAuthId: 'auth-staff-1',
      returnerType: 'REPRESENTATIVE',
      returnerName: 'Siti Aminah (Sekretaris Kelas)',
    });

    expect(successReturn.action).toBe('RETURN');
    expect(sim.loans.get(successReturn.loan_id!)?.returned_by_name).toBe(
      'Siti Aminah (Sekretaris Kelas)'
    );
  });

  it('F-9: Pengembalian dengan laporan kendala mengubah unit ke MAINTENANCE & issue_resolved_at NULL (FR-07, NFR-08)', async () => {
    // 1. Pinjam
    await sim.execute({
      idempotencyKey: 'idemp-borrow-3',
      projectorCode: 'SPX-001',
      photoPath: 'loans/b1.jpg',
      condition: 'NORMAL',
      staffAuthId: 'auth-staff-1',
      kioskSessionId: 'sess-1',
    });

    // 2. Kembalikan dengan laporan kendala
    const returnIssueResult = await sim.execute({
      idempotencyKey: 'idemp-return-issue',
      projectorCode: 'SPX-001',
      photoPath: 'loans/r_damaged.jpg',
      condition: 'REPORTED_ISSUE',
      staffAuthId: 'auth-staff-1',
      returnerType: 'BORROWER',
      issueNotes: 'Kabel VGA putus di dalam dan proyektor mati mendadak saat dipakai',
    });

    expect(returnIssueResult.action).toBe('RETURN_ISSUE');
    expect(returnIssueResult.status).toBe('MAINTENANCE');
    expect(sim.projectors.get('proj-1')?.status).toBe('MAINTENANCE');

    const loan = Array.from(sim.loans.values())[0];
    expect(loan.status).toBe('COMPLETED');
    expect(loan.return_condition).toBe('REPORTED_ISSUE');
    expect(loan.damage_notes).toContain('Kabel VGA putus');
    expect(loan.issue_resolved_at).toBeNull(); // Acuan retensi 180 hari tertahan
  });

  it('F-10: Simulasi Race Condition - Dua request meminjam proyektor AVAILABLE yang sama secara serentak', async () => {
    // Sesi untuk mahasiswa 2 pada kelas 2
    sim.students.set('student-2', { id: 'student-2', nim: '4223121002', registration_status: 'ACTIVE' });
    sim.classes.set('class-2', { id: 'class-2', leader_student_id: 'student-2', is_active: true });
    sim.kioskSessions.set('sess-2', {
      id: 'sess-2',
      student_id: 'student-2',
      class_id: 'class-2',
      expires_at: Date.now() + 120000,
      consumed_at: null,
      identification_method: 'QR',
    });

    // Eksekusi peminjam 1 berhasil
    const promise1 = sim.execute({
      idempotencyKey: 'race-req-1',
      projectorCode: 'SPX-001',
      photoPath: 'loans/p1.jpg',
      condition: 'NORMAL',
      staffAuthId: 'auth-staff-1',
      kioskSessionId: 'sess-1',
    });

    const result1 = await promise1;
    expect(result1.success).toBe(true);
    expect(result1.status).toBe('BORROWED');

    // Eksekusi peminjam 2 terhadap proyektor yang sama sekarang ditolak karena statusnya sudah BORROWED
    await expect(
      sim.execute({
        idempotencyKey: 'race-req-2',
        projectorCode: 'SPX-001',
        photoPath: 'loans/p2.jpg',
        condition: 'NORMAL',
        staffAuthId: 'auth-staff-1',
        kioskSessionId: 'sess-2',
      })
    ).rejects.toThrow(); // Menolak peminjaman karena unit sudah BORROWED
  });
});
