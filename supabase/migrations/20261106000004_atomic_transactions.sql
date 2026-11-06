-- ==============================================================================
-- SmartProjex — Migration 4: Atomic Loan Transaction Function
-- Mengimplementasikan fungsi PL/pgSQL process_loan_transaction dengan row locking,
-- Smart Toggle berbasis status unit di server, pencegahan race condition, dan idempotensi.
-- Sesuai PRD Revisi 3 Bagian 3.1 (FR-06, FR-07, FR-17), NFR-06, dan Invariants AGENTS.md.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.process_loan_transaction(
  p_idempotency_key varchar(64),
  p_projector_code varchar(30),
  p_photo_path text,
  p_condition varchar(20), -- 'NORMAL' | 'REPORTED_ISSUE'
  p_staff_auth_id uuid,
  p_kiosk_session_id uuid DEFAULT NULL,
  p_issue_notes text DEFAULT NULL,
  p_returner_type varchar(15) DEFAULT NULL, -- 'BORROWER' | 'REPRESENTATIVE'
  p_returner_name varchar(100) DEFAULT NULL,
  p_due_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff record;
  v_projector record;
  v_kiosk_session record;
  v_student record;
  v_existing_loan record;
  v_active_loan record;
  v_status_log record;
  v_loan_id uuid;
  v_calculated_due_at timestamptz;
BEGIN
  -- 1. Validasi Otorisasi Pemanggil (Harus Staf / Admin Aktif)
  SELECT * INTO v_staff
  FROM public.staff_profiles
  WHERE auth_user_id = p_staff_auth_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AKSES_DITOLAK: Kredensial petugas tidak terdaftar atau tidak aktif.';
  END IF;

  -- 2. Pemeriksaan Idempotency Key (Mencegah Eksekusi Transaksi Ganda)
  -- A. Periksa apakah idempotency_key sudah pernah menghasilkan baris loans
  SELECT * INTO v_existing_loan
  FROM public.loans
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent_replay', true,
      'action', CASE WHEN v_existing_loan.status = 'ACTIVE' THEN 'BORROW' ELSE 'RETURN' END,
      'loan_id', v_existing_loan.id,
      'projector_code', p_projector_code,
      'status', v_existing_loan.status,
      'message', 'Transaksi telah diproses sebelumnya (idempotency key cocok).'
    );
  END IF;

  -- B. Periksa apakah idempotency_key sudah pernah menghasilkan pembatalan pinjam karena kendala
  SELECT * INTO v_status_log
  FROM public.projector_status_logs
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent_replay', true,
      'action', 'CANCELLED_ISSUE',
      'loan_id', null,
      'projector_code', p_projector_code,
      'status', 'MAINTENANCE',
      'message', 'Laporan kendala saat penerimaan telah diproses sebelumnya (idempotency key cocok).'
    );
  END IF;

  -- 3. Kunci Baris Proyektor (SELECT ... FOR UPDATE) untuk Menghindari Race Condition
  SELECT * INTO v_projector
  FROM public.projectors
  WHERE code = p_projector_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROYEKTOR_TIDAK_DITEMUKAN: Unit proyektor dengan kode % tidak terdaftar.', p_projector_code;
  END IF;

  IF v_projector.status = 'INACTIVE' THEN
    RAISE EXCEPTION 'STATUS_UNIT_TIDAK_VALID: Unit proyektor berstatus nonaktif dan tidak dapat dipinjam.';
  END IF;

  IF v_projector.status = 'MAINTENANCE' THEN
    RAISE EXCEPTION 'STATUS_UNIT_TIDAK_VALID: Unit proyektor sedang dalam perawatan/perbaikan.';
  END IF;

  -- ============================================================================
  -- 4. SMART TOGGLE ALUR A: Unit AVAILABLE -> Peminjaman Baru (Borrow Flow)
  -- ============================================================================
  IF v_projector.status = 'AVAILABLE' THEN
    IF p_kiosk_session_id IS NULL THEN
      RAISE EXCEPTION 'SESI_KIOSK_DIBUTUHKAN: Transaksi peminjaman memerlukan sesi Kiosk yang valid.';
    END IF;

    -- Kunci dan validasi sesi Kiosk
    SELECT * INTO v_kiosk_session
    FROM public.kiosk_sessions
    WHERE id = p_kiosk_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SESI_KIOSK_TIDAK_DITEMUKAN: Sesi Kiosk tidak terdaftar.';
    END IF;

    IF v_kiosk_session.expires_at < now() THEN
      RAISE EXCEPTION 'SESI_KIOSK_KEDALUWARSA: Sesi Kiosk telah kedaluwarsa (maks. 120 detik).';
    END IF;

    IF v_kiosk_session.consumed_at IS NOT NULL THEN
      RAISE EXCEPTION 'SESI_KIOSK_SUDAH_DIGUNAKAN: Sesi Kiosk ini telah digunakan untuk transaksi lain.';
    END IF;

    -- Kunci dan validasi mahasiswa peminjam
    SELECT * INTO v_student
    FROM public.students
    WHERE id = v_kiosk_session.student_id
    FOR UPDATE;

    IF NOT FOUND OR v_student.registration_status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'MAHASISWA_TIDAK_AKTIF: Akun mahasiswa peminjam tidak aktif.';
    END IF;

    -- Validasi bahwa mahasiswa adalah ketua aktif kelas bersangkutan di kelas aktif
    IF NOT EXISTS (
      SELECT 1 FROM public.classes
      WHERE id = v_kiosk_session.class_id
        AND leader_student_id = v_student.id
        AND is_active = true
    ) THEN
      RAISE EXCEPTION 'BUKAN_KETUA_KELAS_AKTIF: Mahasiswa bukan ketua aktif pada kelas yang bersangkutan.';
    END IF;

    -- Validasi partial unique constraint: 1 pinjaman aktif per mahasiswa
    IF EXISTS (
      SELECT 1 FROM public.loans
      WHERE student_id = v_student.id AND status = 'ACTIVE'
    ) THEN
      RAISE EXCEPTION 'PINJAMAN_AKTIF_SUDAH_ADA: Ketua kelas masih memiliki transaksi peminjaman aktif lain.';
    END IF;

    -- Tandai sesi Kiosk telah dikonsumsi
    UPDATE public.kiosk_sessions
    SET consumed_at = now()
    WHERE id = v_kiosk_session.id;

    -- Percabangan kondisi penerimaan unit
    IF p_condition = 'NORMAL' THEN
      -- Hitung default due_at jika tidak diberikan (hari ini jam 17:00 WIB atau +2 jam)
      IF p_due_at IS NOT NULL THEN
        v_calculated_due_at := p_due_at;
      ELSE
        -- Fallback default: +6 jam dari waktu server jika tanpa parameter eksplisit
        v_calculated_due_at := now() + interval '6 hours';
      END IF;

      -- A. Simpan baris peminjaman loans berstatus ACTIVE
      INSERT INTO public.loans (
        idempotency_key,
        student_id,
        class_id,
        projector_id,
        borrowed_at,
        due_at,
        borrow_photo_path,
        borrow_identification_method,
        borrow_processed_by,
        status
      ) VALUES (
        p_idempotency_key,
        v_student.id,
        v_kiosk_session.class_id,
        v_projector.id,
        now(),
        v_calculated_due_at,
        p_photo_path,
        v_kiosk_session.identification_method,
        v_staff.id,
        'ACTIVE'
      ) RETURNING id INTO v_loan_id;

      -- B. Ubah status proyektor menjadi BORROWED
      UPDATE public.projectors
      SET status = 'BORROWED', updated_at = now()
      WHERE id = v_projector.id;

      -- C. Tulis riwayat perubahan status proyektor
      INSERT INTO public.projector_status_logs (
        projector_id,
        from_status,
        to_status,
        reason,
        photo_path,
        loan_id,
        changed_by,
        created_at
      ) VALUES (
        v_projector.id,
        'AVAILABLE',
        'BORROWED',
        'Peminjaman unit proyektor kondisi normal',
        p_photo_path,
        v_loan_id,
        v_staff.id,
        now()
      );

      -- D. Tulis audit log transaksi peminjaman
      INSERT INTO public.audit_logs (
        actor_staff_id,
        actor_student_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
      ) VALUES (
        v_staff.id,
        v_student.id,
        'LOAN_BORROWED',
        'loans',
        v_loan_id::varchar,
        jsonb_build_object(
          'projector_code', p_projector_code,
          'method', v_kiosk_session.identification_method,
          'condition', 'NORMAL'
        ),
        now()
      );

      RETURN jsonb_build_object(
        'success', true,
        'action', 'BORROW',
        'loan_id', v_loan_id,
        'projector_code', p_projector_code,
        'status', 'BORROWED',
        'message', 'Peminjaman proyektor berhasil dicatat.'
      );

    ELSIF p_condition = 'REPORTED_ISSUE' THEN
      -- Sesuai FR-06: Pilihan kendala TIDAK membuat transaksi loans; unit ditandai MAINTENANCE
      UPDATE public.projectors
      SET status = 'MAINTENANCE',
          notes = COALESCE(p_issue_notes, 'Kendala dilaporkan saat penerimaan unit.'),
          updated_at = now()
      WHERE id = v_projector.id;

      INSERT INTO public.projector_status_logs (
        projector_id,
        from_status,
        to_status,
        reason,
        photo_path,
        loan_id,
        idempotency_key,
        changed_by,
        created_at
      ) VALUES (
        v_projector.id,
        'AVAILABLE',
        'MAINTENANCE',
        COALESCE(p_issue_notes, 'Kendala dilaporkan oleh peminjam saat penerimaan unit.'),
        p_photo_path,
        NULL,
        p_idempotency_key,
        v_staff.id,
        now()
      );

      INSERT INTO public.audit_logs (
        actor_staff_id,
        actor_student_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
      ) VALUES (
        v_staff.id,
        v_student.id,
        'PROJECTOR_STATUS_CHANGED',
        'projectors',
        v_projector.id::varchar,
        jsonb_build_object(
          'from_status', 'AVAILABLE',
          'to_status', 'MAINTENANCE',
          'reason', p_issue_notes
        ),
        now()
      );

      RETURN jsonb_build_object(
        'success', true,
        'action', 'CANCELLED_ISSUE',
        'loan_id', null,
        'projector_code', p_projector_code,
        'status', 'MAINTENANCE',
        'message', 'Peminjaman dibatalkan karena laporan kendala. Unit dialihkan ke status MAINTENANCE.'
      );
    ELSE
      RAISE EXCEPTION 'KONDISI_TIDAK_VALID: Nilai kondisi harus NORMAL atau REPORTED_ISSUE.';
    END IF;

  -- ============================================================================
  -- 5. SMART TOGGLE ALUR B: Unit BORROWED -> Pengembalian Proyektor (Return Flow)
  -- ============================================================================
  ELSIF v_projector.status = 'BORROWED' THEN
    -- Cari dan kunci baris peminjaman aktif untuk unit proyektor ini
    SELECT * INTO v_active_loan
    FROM public.loans
    WHERE projector_id = v_projector.id AND status = 'ACTIVE'
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'DATA_INKONSISTEN: Unit berstatus BORROWED tetapi transaksi peminjaman aktif tidak ditemukan.';
    END IF;

    -- Validasi identitas pengembali sesuai FR-07
    IF p_returner_type = 'REPRESENTATIVE' THEN
      IF p_returner_name IS NULL OR trim(p_returner_name) = '' THEN
        RAISE EXCEPTION 'NAMA_PERWAKILAN_WAJIB: Nama perwakilan yang mengembalikan proyektor wajib dicatat.';
      END IF;
    ELSIF p_returner_type = 'BORROWER' THEN
      -- Peminjam sendiri
      p_returner_name := NULL;
    ELSE
      RAISE EXCEPTION 'TIPE_PENGEMBALI_TIDAK_VALID: Tipe pengembali harus BORROWER atau REPRESENTATIVE.';
    END IF;

    -- Evaluasi kondisi unit saat pengembalian
    IF p_condition = 'NORMAL' THEN
      -- A. Perbarui baris loans menjadi COMPLETED
      UPDATE public.loans
      SET status = 'COMPLETED',
          returned_at = now(),
          return_photo_path = p_photo_path,
          returned_by_type = p_returner_type,
          returned_by_name = p_returner_name,
          return_processed_by = v_staff.id,
          return_condition = 'NORMAL',
          issue_resolved_at = now(),
          updated_at = now()
      WHERE id = v_active_loan.id;

      -- B. Ubah status proyektor kembali ke AVAILABLE
      UPDATE public.projectors
      SET status = 'AVAILABLE', updated_at = now()
      WHERE id = v_projector.id;

      -- C. Tulis log status unit
      INSERT INTO public.projector_status_logs (
        projector_id,
        from_status,
        to_status,
        reason,
        photo_path,
        loan_id,
        changed_by,
        created_at
      ) VALUES (
        v_projector.id,
        'BORROWED',
        'AVAILABLE',
        'Pengembalian unit proyektor kondisi normal',
        p_photo_path,
        v_active_loan.id,
        v_staff.id,
        now()
      );

      -- D. Tulis audit log transaksi pengembalian
      INSERT INTO public.audit_logs (
        actor_staff_id,
        actor_student_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
      ) VALUES (
        v_staff.id,
        v_active_loan.student_id,
        'LOAN_RETURNED',
        'loans',
        v_active_loan.id::varchar,
        jsonb_build_object(
          'projector_code', p_projector_code,
          'condition', 'NORMAL',
          'returner_type', p_returner_type,
          'returner_name', p_returner_name
        ),
        now()
      );

      RETURN jsonb_build_object(
        'success', true,
        'action', 'RETURN',
        'loan_id', v_active_loan.id,
        'projector_code', p_projector_code,
        'status', 'AVAILABLE',
        'message', 'Pengembalian proyektor kondisi normal berhasil dicatat.'
      );

    ELSIF p_condition = 'REPORTED_ISSUE' THEN
      -- Sesuai FR-07: Laporan kendala saat kembali menyelesaikan transaksi loans dan mengubah unit ke MAINTENANCE
      UPDATE public.loans
      SET status = 'COMPLETED',
          returned_at = now(),
          return_photo_path = p_photo_path,
          returned_by_type = p_returner_type,
          returned_by_name = p_returner_name,
          return_processed_by = v_staff.id,
          return_condition = 'REPORTED_ISSUE',
          damage_notes = p_issue_notes,
          issue_resolved_at = NULL, -- Belum terselesaikan sampai staf memeriksa fisik
          updated_at = now()
      WHERE id = v_active_loan.id;

      UPDATE public.projectors
      SET status = 'MAINTENANCE',
          notes = COALESCE(p_issue_notes, 'Kendala dilaporkan saat pengembalian unit.'),
          updated_at = now()
      WHERE id = v_projector.id;

      INSERT INTO public.projector_status_logs (
        projector_id,
        from_status,
        to_status,
        reason,
        photo_path,
        loan_id,
        changed_by,
        created_at
      ) VALUES (
        v_projector.id,
        'BORROWED',
        'MAINTENANCE',
        COALESCE(p_issue_notes, 'Kendala dilaporkan saat pengembalian unit.'),
        p_photo_path,
        v_active_loan.id,
        v_staff.id,
        now()
      );

      INSERT INTO public.audit_logs (
        actor_staff_id,
        actor_student_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
      ) VALUES (
        v_staff.id,
        v_active_loan.student_id,
        'LOAN_RETURNED_WITH_ISSUE',
        'loans',
        v_active_loan.id::varchar,
        jsonb_build_object(
          'projector_code', p_projector_code,
          'condition', 'REPORTED_ISSUE',
          'damage_notes', p_issue_notes,
          'returner_type', p_returner_type,
          'returner_name', p_returner_name
        ),
        now()
      );

      RETURN jsonb_build_object(
        'success', true,
        'action', 'RETURN_ISSUE',
        'loan_id', v_active_loan.id,
        'projector_code', p_projector_code,
        'status', 'MAINTENANCE',
        'message', 'Pengembalian dicatat dengan laporan kendala. Unit dialihkan ke status MAINTENANCE.'
      );
    ELSE
      RAISE EXCEPTION 'KONDISI_TIDAK_VALID: Nilai kondisi harus NORMAL atau REPORTED_ISSUE.';
    END IF;
  ELSE
    RAISE EXCEPTION 'STATUS_UNIT_TIDAK_DIKENAL: Status unit % tidak didukung.', v_projector.status;
  END IF;
END;
$$;

