# SmartProjex — Matriks Hak Akses Row Level Security (RLS)

Dokumen ini mendokumentasikan pemetaan hak akses tingkat baris (*Row Level Security*) pada seluruh tabel SmartProjex berdasarkan Matriks Hak Akses PRD Revisi 3 Bagian 3.3 dan prinsip *least privilege*.

---

## 1. Helper Functions Otorisasi

Fungsi otorisasi dieksekusi dengan atribut `SECURITY DEFINER` dan membatasi `search_path = public` secara eksplisit untuk mencegah serangan *search-path hijacking*:

1. `public.is_active_staff()`:
   Mengembalikan `true` jika `auth.uid()` terhubung ke `staff_profiles` dengan `is_active = true` dan `role IN ('STAFF', 'ADMIN')`.
2. `public.is_active_admin()`:
   Mengembalikan `true` jika `auth.uid()` terhubung ke `staff_profiles` dengan `is_active = true` dan `role = 'ADMIN'`.
3. `public.get_active_staff_id()`:
   Mengembalikan UUID `staff_profiles.id` untuk staf yang sedang login.
4. `public.get_active_student_id()`:
   Mengembalikan UUID `students.id` untuk mahasiswa yang sedang login.

> **Pencegahan Recursive RLS**: Helper function membaca `staff_profiles` menggunakan kueri langsung `SECURITY DEFINER` sehingga evaluasi policy pada tabel lain tidak memicu pemanggilan RLS melingkar (*no cyclic dependency*).

---

## 2. Matriks Operasi CRUD per Tabel

| Tabel | Role Anonim (`anon`) | Mahasiswa (`authenticated`) | Petugas (`STAFF`) | Admin (`ADMIN`) |
|---|---|---|---|---|
| **`staff_profiles`** | ❌ Ditolak | ❌ Ditolak | 👁️ SELECT (profil sendiri & rekan staf) | 👁️ SELECT, ➕ INSERT, ✏️ UPDATE |
| **`classes`** | ❌ Ditolak | 👁️ SELECT (`is_active = true`) | 👁️ SELECT (semua kelas) | 👁️ SELECT, ➕ INSERT, ✏️ UPDATE (kelola penuh) |
| **`students`** | ❌ Ditolak | 👁️ SELECT (hanya baris miliknya)<br>➕ INSERT (status awal `UNVERIFIED_EMAIL`)<br>✏️ UPDATE (nama/kelas sebelum verifikasi) | 👁️ SELECT (semua mahasiswa)<br>✏️ UPDATE (keputusan verifikasi & centang) | 👁️ SELECT (semua)<br>✏️ UPDATE (kelola penuh) |
| **`class_leader_claims`**| ❌ Ditolak | 👁️ SELECT (klaim miliknya)<br>➕ INSERT (klaim miliknya)<br>✏️ UPDATE (batal jika `PENDING`) | 👁️ SELECT (semua)<br>✏️ UPDATE (putuskan klaim) | 👁️ SELECT (semua)<br>✏️ UPDATE (putuskan / lepas ketua) |
| **`projectors`** | ❌ Ditolak | 👁️ SELECT (ketersediaan unit) | 👁️ SELECT (semua)<br>✏️ UPDATE (status via prosedur) | 👁️ SELECT, ➕ INSERT, ✏️ UPDATE (kelola aset & QR) |
| **`projector_status_logs`**| ❌ Ditolak| ❌ Ditolak | 👁️ SELECT, ➕ INSERT (via transaksi) | 👁️ SELECT, ➕ INSERT |
| **`loans`** | ❌ Ditolak | 👁️ SELECT (pinjaman miliknya) | 👁️ SELECT (semua buku besar)<br>➕ INSERT, ✏️ UPDATE (via `process_loan_transaction`) | 👁️ SELECT, ➕ INSERT, ✏️ UPDATE (buku besar & ekspor CSV) |
| **`audit_logs`** | ❌ Ditolak | ➕ INSERT (via modul audit sistem) | ➕ INSERT (via modul audit sistem) | 👁️ SELECT (baca log audit), ➕ INSERT |
| **`kiosk_sessions`** | ❌ Ditolak | ❌ Ditolak | 👁️ SELECT, ➕ INSERT, ✏️ UPDATE (konsumsi sesi) | 👁️ SELECT, ➕ INSERT, ✏️ UPDATE, 🗑️ DELETE |
| **`app_settings`** | ❌ Ditolak | 👁️ SELECT (konfigurasi umum) | 👁️ SELECT (konfigurasi umum) | 👁️ SELECT, ➕ INSERT, ✏️ UPDATE (kelola penuh) |

---

## 3. Aturan Integritas Penghapusan (DELETE)

- **`loans`**: Operasi `DELETE` diblokir 100% untuk seluruh role. Data transaksi bersifat permanen untuk akuntabilitas aset. Pembersihan foto mengikuti jadwal retensi.
- **`projector_status_logs` & `audit_logs`**: Operasi `UPDATE` dan `DELETE` diblokir 100% (*append-only*).
- **`projectors`, `classes`, `staff_profiles`**: Menggunakan *soft deactivation* (`is_active = false` atau `status = 'INACTIVE'`).

