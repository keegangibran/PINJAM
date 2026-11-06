-- ==============================================================================
-- SmartProjex — Migration 2: Row Level Security (RLS) & Role Policies
-- Mengaktifkan RLS deny-by-default di 100% tabel dan menerapkan prinsip least privilege.
-- Sesuai PRD Revisi 3 Bagian 3.3 dan Invariants AGENTS.md.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Helper Functions (SECURITY DEFINER dengan search_path eksplisit = public)
-- ------------------------------------------------------------------------------

-- Memeriksa apakah pengguna saat ini adalah staf TU / Admin yang aktif
CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_profiles
    WHERE auth_user_id = auth.uid()
      AND is_active = true
      AND role IN ('STAFF', 'ADMIN')
  );
$$;

-- Memeriksa apakah pengguna saat ini adalah Admin yang aktif
CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_profiles
    WHERE auth_user_id = auth.uid()
      AND is_active = true
      AND role = 'ADMIN'
  );
$$;

-- Mendapatkan ID baris staff_profiles dari pengguna yang sedang login
CREATE OR REPLACE FUNCTION public.get_active_staff_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.staff_profiles
  WHERE auth_user_id = auth.uid()
    AND is_active = true
  LIMIT 1;
$$;

-- Mendapatkan ID baris students dari pengguna mahasiswa yang sedang login
CREATE OR REPLACE FUNCTION public.get_active_student_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.students
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$;

-- ------------------------------------------------------------------------------
-- 2. Mengaktifkan RLS pada seluruh tabel
-- ------------------------------------------------------------------------------
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_leader_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projector_status_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiosk_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 3. Kebijakan RLS: staff_profiles
-- ------------------------------------------------------------------------------
-- Membaca: Staf/Admin dapat membaca semua profil staf; pengguna biasa hanya profil miliknya jika staf
CREATE POLICY "staff_read_profiles" ON public.staff_profiles
FOR SELECT TO authenticated
USING (auth_user_id = auth.uid() OR public.is_active_staff());

-- Menambah / Mengubah: Hanya Admin aktif
CREATE POLICY "admin_insert_staff" ON public.staff_profiles
FOR INSERT TO authenticated
WITH CHECK (public.is_active_admin());

CREATE POLICY "admin_update_staff" ON public.staff_profiles
FOR UPDATE TO authenticated
USING (public.is_active_admin())
WITH CHECK (public.is_active_admin());

-- ------------------------------------------------------------------------------
-- 4. Kebijakan RLS: classes
-- ------------------------------------------------------------------------------
-- Membaca: Pengguna terautentikasi dapat membaca kelas aktif; staf aktif membaca seluruh kelas
CREATE POLICY "authenticated_read_classes" ON public.classes
FOR SELECT TO authenticated
USING (is_active = true OR public.is_active_staff());

-- Mengelola: Hanya Admin aktif
CREATE POLICY "admin_manage_classes" ON public.classes
FOR ALL TO authenticated
USING (public.is_active_admin())
WITH CHECK (public.is_active_admin());

-- ------------------------------------------------------------------------------
-- 5. Kebijakan RLS: students
-- ------------------------------------------------------------------------------
-- Membaca: Mahasiswa hanya dapat membaca data miliknya; Staf aktif dapat membaca semua mahasiswa
CREATE POLICY "student_read_self" ON public.students
FOR SELECT TO authenticated
USING (auth_user_id = auth.uid() OR public.is_active_staff());

-- Membuat profil saat registrasi pertama
CREATE POLICY "student_insert_self" ON public.students
FOR INSERT TO authenticated
WITH CHECK (
  auth_user_id = auth.uid()
  AND registration_status = 'UNVERIFIED_EMAIL'
);

-- Memperbarui: Mahasiswa dapat memperbarui nama & kelas sebelum diverifikasi; Staf aktif dapat memperbarui verifikasi
CREATE POLICY "student_update_self" ON public.students
FOR UPDATE TO authenticated
USING (auth_user_id = auth.uid() OR public.is_active_staff())
WITH CHECK (
  (auth_user_id = auth.uid() AND registration_status = 'UNVERIFIED_EMAIL')
  OR public.is_active_staff()
);

-- ------------------------------------------------------------------------------
-- 6. Kebijakan RLS: class_leader_claims
-- ------------------------------------------------------------------------------
-- Membaca: Mahasiswa dapat membaca klaim miliknya; Staf aktif membaca semua klaim
CREATE POLICY "claim_read" ON public.class_leader_claims
FOR SELECT TO authenticated
USING (student_id = public.get_active_student_id() OR public.is_active_staff());

-- Mahasiswa mengajukan klaim
CREATE POLICY "student_insert_claim" ON public.class_leader_claims
FOR INSERT TO authenticated
WITH CHECK (student_id = public.get_active_student_id());

-- Staf memutuskan klaim; Mahasiswa membatalkan klaim miliknya yang masih PENDING
CREATE POLICY "claim_update" ON public.class_leader_claims
FOR UPDATE TO authenticated
USING (
  public.is_active_staff()
  OR (student_id = public.get_active_student_id() AND status = 'PENDING')
)
WITH CHECK (
  public.is_active_staff()
  OR (student_id = public.get_active_student_id() AND status = 'CANCELLED')
);

-- ------------------------------------------------------------------------------
-- 7. Kebijakan RLS: projectors
-- ------------------------------------------------------------------------------
-- Membaca: Staf/Admin aktif dapat membaca semua proyektor; Mahasiswa terautentikasi dapat melihat status ketersediaan unit
CREATE POLICY "projectors_read" ON public.projectors
FOR SELECT TO authenticated
USING (true);

-- Menambah/Menonaktifkan unit: Hanya Admin aktif
CREATE POLICY "admin_insert_projector" ON public.projectors
FOR INSERT TO authenticated
WITH CHECK (public.is_active_admin());

CREATE POLICY "admin_update_projector" ON public.projectors
FOR UPDATE TO authenticated
USING (public.is_active_admin() OR public.is_active_staff())
WITH CHECK (public.is_active_admin() OR public.is_active_staff());

-- ------------------------------------------------------------------------------
-- 8. Kebijakan RLS: projector_status_logs
-- ------------------------------------------------------------------------------
-- Membaca: Staf aktif dapat membaca seluruh riwayat status unit
CREATE POLICY "staff_read_projector_logs" ON public.projector_status_logs
FOR SELECT TO authenticated
USING (public.is_active_staff());

-- Menambah: Staf aktif dapat menambah log perubahan status manual
CREATE POLICY "staff_insert_projector_logs" ON public.projector_status_logs
FOR INSERT TO authenticated
WITH CHECK (public.is_active_staff());

-- Dilarang update/delete pada log riwayat status (append-only)

-- ------------------------------------------------------------------------------
-- 9. Kebijakan RLS: loans
-- ------------------------------------------------------------------------------
-- Membaca: Staf aktif dapat membaca seluruh buku besar; Mahasiswa membaca pinjaman miliknya
CREATE POLICY "loans_read" ON public.loans
FOR SELECT TO authenticated
USING (student_id = public.get_active_student_id() OR public.is_active_staff());

-- Mutasi transaksi peminjaman/pengembalian dikunci via fungsi server/staf aktif
CREATE POLICY "staff_insert_loans" ON public.loans
FOR INSERT TO authenticated
WITH CHECK (public.is_active_staff());

CREATE POLICY "staff_update_loans" ON public.loans
FOR UPDATE TO authenticated
USING (public.is_active_staff())
WITH CHECK (public.is_active_staff());

-- Dilarang delete pada loans (data buku besar bersifat permanen)

-- ------------------------------------------------------------------------------
-- 10. Kebijakan RLS: audit_logs
-- ------------------------------------------------------------------------------
-- Membaca: Hanya Admin aktif yang dapat melihat jejak audit
CREATE POLICY "admin_read_audit_logs" ON public.audit_logs
FOR SELECT TO authenticated
USING (public.is_active_admin());

-- Menambah: Pengguna terautentikasi atau staf dapat menambahkan catatan audit via modul audit server
CREATE POLICY "authenticated_insert_audit_logs" ON public.audit_logs
FOR INSERT TO authenticated
WITH CHECK (
  actor_staff_id = public.get_active_staff_id()
  OR actor_student_id = public.get_active_student_id()
  OR public.is_active_staff()
);

-- Dilarang update/delete pada audit_logs (append-only strictly enforced)

-- ------------------------------------------------------------------------------
-- 11. Kebijakan RLS: kiosk_sessions
-- ------------------------------------------------------------------------------
-- Membaca, membuat, dan mengonsumsi sesi Kiosk: Hanya Staf aktif
CREATE POLICY "staff_manage_kiosk_sessions" ON public.kiosk_sessions
FOR ALL TO authenticated
USING (public.is_active_staff())
WITH CHECK (public.is_active_staff());

-- ------------------------------------------------------------------------------
-- 12. Kebijakan RLS: app_settings
-- ------------------------------------------------------------------------------
-- Membaca: Pengguna terautentikasi dapat membaca konfigurasi umum sistem
CREATE POLICY "authenticated_read_settings" ON public.app_settings
FOR SELECT TO authenticated
USING (true);

-- Mengelola: Hanya Admin aktif
CREATE POLICY "admin_manage_settings" ON public.app_settings
FOR ALL TO authenticated
USING (public.is_active_admin())
WITH CHECK (public.is_active_admin());
