# SmartProjex — Data Dictionary

Dokumen ini mendefinisikan kamus data lengkap untuk seluruh entitas basis data SmartProjex (PostgreSQL / Supabase), mencakup tipe data, batasan (*constraints*), nilai bawaan, relasi foreign key, serta strategi penghapusan (*retention & deletion*).

---

## 1. Tabel `staff_profiles`

Menyimpan profil petugas TU (`STAFF`) dan administrator (`ADMIN`). Akun individual terhubung ke akun autentikasi Supabase.

| Nama Kolom | Tipe Data | Nullable | Default | Batasan & Relasi | Deskripsi |
|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary Key | Pengenal unik profil petugas |
| `auth_user_id` | `uuid` | NO | - | Unique, FK → `auth.users(id)` ON DELETE CASCADE | ID akun Supabase Auth |
| `name` | `varchar(100)` | NO | - | - | Nama lengkap petugas |
| `role` | `varchar(10)` | NO | - | CHECK `IN ('STAFF', 'ADMIN')` | Peran hak akses sesuai matriks PRD 3.3 |
| `is_active` | `boolean` | NO | `true` | - | Status keaktifan akun petugas (soft disable) |
| `created_at` | `timestamptz` | NO | `now()` | - | Waktu pembuatan akun petugas |
| `updated_at` | `timestamptz` | NO | `now()` | - | Waktu terakhir profil diubah |

**Strategi Penghapusan**: Soft-delete via `is_active = false`. Baris tidak pernah dihapus secara fisik agar jejak audit dan riwayat transaksi masa lalu tetap valid.

---

## 2. Tabel `classes`

Menyimpan daftar kelas baku kombinasi program studi, tahun angkatan, rombel, dan semester akademik.

| Nama Kolom | Tipe Data | Nullable | Default | Batasan & Relasi | Deskripsi |
|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary Key | Pengenal unik kelas |
| `study_program` | `varchar(100)` | NO | - | - | Program studi (mis. Pendidikan Matematika) |
| `cohort_year` | `smallint` | NO | - | CHECK `cohort_year BETWEEN 2000 AND 2100` | Tahun angkatan masuk mahasiswa |
| `section` | `varchar(10)` | NO | - | - | Rombel / kelompok kelas (mis. A, B, C) |
| `academic_term` | `varchar(20)` | NO | - | - | Semester akademik (mis. `2026/2027-GANJIL`) |
| `leader_student_id` | `uuid` | YES | `NULL` | FK → `students(id)` ON DELETE SET NULL | Ketua kelas aktif saat ini |
| `leader_since` | `timestamptz` | YES | `NULL` | - | Waktu penetapan ketua aktif |
| `is_active` | `boolean` | NO | `true` | - | Status keaktifan kelas pada semester |
| `created_at` | `timestamptz` | NO | `now()` | - | Waktu kelas dibuat |
| `updated_at` | `timestamptz` | NO | `now()` | - | Waktu terakhir data kelas diubah |

**Unique Constraint**: `UNIQUE (study_program, cohort_year, section, academic_term)`.  
**Strategi Penghapusan**: Soft-delete via `is_active = false`. Kelas semester lama tetap dipertahankan sebagai riwayat.

---

## 3. Tabel `students`

Menyimpan profil mahasiswa, status verifikasi tatap muka, foto wajah referensi, dan versi token QR.

| Nama Kolom | Tipe Data | Nullable | Default | Batasan & Relasi | Deskripsi |
|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary Key | Pengenal unik mahasiswa |
| `auth_user_id` | `uuid` | NO | - | Unique, FK → `auth.users(id)` ON DELETE CASCADE | ID akun Supabase Auth mahasiswa |
| `nim` | `varchar(20)` | NO | - | Partial Unique: 1 `ACTIVE` per NIM | Nomor Induk Mahasiswa |
| `name` | `varchar(100)` | NO | - | - | Nama lengkap sesuai identitas |
| `email` | `varchar(100)` | NO | - | - | Alamat email terdaftar |
| `current_class_id` | `uuid` | YES | `NULL` | FK → `classes(id)` ON DELETE SET NULL | Kelas aktif mahasiswa di semester berjalan |
| `registration_status` | `varchar(30)` | NO | `'UNVERIFIED_EMAIL'` | CHECK: 7 status PRD | Status tahapan registrasi & verifikasi |
| `profile_photo_path` | `text` | YES | `NULL` | - | Path storage foto wajah referensi |
| `verification_document_path` | `text` | YES | `NULL` | - | Path sementara foto KTM/KTP |
| `verification_document_type` | `varchar(10)` | YES | `NULL` | CHECK `IN ('KTM', 'KTP')` | Jenis dokumen identitas yang dipotret |
| `verification_checks` | `jsonb` | YES | `NULL` | `{face_match, name_match, status_confirmed}` | Catatan centang pemeriksaan petugas |
| `verification_notes` | `text` | YES | `NULL` | - | Catatan penolakan / perbaikan |
| `verified_by` | `uuid` | YES | `NULL` | FK → `staff_profiles(id)` ON DELETE SET NULL | Petugas yang memutuskan verifikasi |
| `verified_at` | `timestamptz` | YES | `NULL` | - | Waktu keputusan verifikasi tatap muka |
| `qr_token_version` | `integer` | NO | `1` | CHECK `qr_token_version >= 1` | Versi token QR; naik jika QR dicabut |
| `deactivated_at` | `timestamptz` | YES | `NULL` | - | Waktu status menjadi INACTIVE |
| `created_at` | `timestamptz` | NO | `now()` | - | Waktu akun didaftarkan |
| `updated_at` | `timestamptz` | NO | `now()` | - | Waktu profil terakhir diubah |

**Nilai `registration_status`**: `'UNVERIFIED_EMAIL'`, `'PENDING_DOCUMENT'`, `'PENDING_REVIEW'`, `'ACTIVE'`, `'REJECTED'`, `'RESUBMISSION_REQUIRED'`, `'INACTIVE'`.  
**Strategi Penghapusan**:
- `verification_document_path`: dihapus instan segera setelah keputusan petugas (atau maks 24 jam via cron sapuan).
- `profile_photo_path`: dihapus 90 hari setelah akun `INACTIVE` (`deactivated_at < now() - interval '90 days'`).
- Baris database `students` tidak dihapus fisik agar riwayat audit pinjaman masa lalu tidak putus.

---

## 4. Tabel `class_leader_claims`

Menyimpan permohonan dan riwayat penetapan ketua kelas (`INITIAL`, `REPLACEMENT`, `TRANSFER`).

| Nama Kolom | Tipe Data | Nullable | Default | Batasan & Relasi | Deskripsi |
|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary Key | Pengenal unik klaim |
| `class_id` | `uuid` | NO | - | FK → `classes(id)` ON DELETE CASCADE | Kelas yang diklaim |
| `student_id` | `uuid` | NO | - | FK → `students(id)` ON DELETE CASCADE | Mahasiswa pemohon klaim |
| `claim_type` | `varchar(15)` | NO | - | CHECK `IN ('INITIAL', 'REPLACEMENT', 'TRANSFER')` | Jenis pengajuan klaim ketua |
| `status` | `varchar(15)` | NO | `'PENDING'` | CHECK `IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')` | Status keputusan klaim |
| `decided_by` | `uuid` | YES | `NULL` | FK → `staff_profiles(id)` ON DELETE SET NULL | Petugas yang memutuskan klaim |
| `decided_at` | `timestamptz` | YES | `NULL` | - | Waktu keputusan klaim |
| `notes` | `text` | YES | `NULL` | - | Catatan keputusan petugas |
| `created_at` | `timestamptz` | NO | `now()` | - | Waktu klaim diajukan |
| `updated_at` | `timestamptz` | NO | `now()` | - | Waktu status klaim diubah |

**Partial Unique Index**: `UNIQUE (class_id) WHERE claim_type = 'INITIAL' AND status = 'PENDING'`.

---

## 5. Tabel `projectors`

Menyimpan data fisik aset unit proyektor.

| Nama Kolom | Tipe Data | Nullable | Default | Batasan & Relasi | Deskripsi |
|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary Key | Pengenal unik aset proyektor |
| `code` | `varchar(30)` | NO | - | Unique | Kode aset yang dikodekan pada QR unit |
| `name` | `varchar(100)` | NO | - | - | Nama/model unit proyektor (mis. Epson EB-X500 #01) |
| `status` | `varchar(15)` | NO | `'AVAILABLE'` | CHECK `IN ('AVAILABLE', 'BORROWED', 'MAINTENANCE', 'INACTIVE')` | Status ketersediaan fisik unit |
| `notes` | `text` | YES | `NULL` | - | Catatan teknis / kondisi aset |
| `created_at` | `timestamptz` | NO | `now()` | - | Waktu aset didaftarkan |
| `updated_at` | `timestamptz` | NO | `now()` | - | Waktu data aset diperbarui |

**Strategi Penghapusan**: Soft-delete via `status = 'INACTIVE'`. Dilarang menghapus baris fisik aset yang telah memiliki riwayat peminjaman (`FR-10`).

---

## 6. Tabel `loans`

Menyimpan transaksi peminjaman dan pengembalian unit proyektor.

| Nama Kolom | Tipe Data | Nullable | Default | Batasan & Relasi | Deskripsi |
|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary Key | Pengenal unik transaksi |
| `idempotency_key` | `varchar(64)` | NO | - | Unique | Kunci idempotensi transaksi |
| `student_id` | `uuid` | NO | - | FK → `students(id)` ON DELETE RESTRICT | Peminjam utama (ketua kelas) |
| `class_id` | `uuid` | NO | - | FK → `classes(id)` ON DELETE RESTRICT | Kelas saat peminjaman terjadi |
| `projector_id` | `uuid` | NO | - | FK → `projectors(id)` ON DELETE RESTRICT | Unit proyektor yang dipinjam |
| `borrowed_at` | `timestamptz` | NO | `now()` | - | Waktu transaksi peminjaman (server WIB) |
| `due_at` | `timestamptz` | NO | - | Indeks keterlambatan | Batas waktu pengembalian proyektor |
| `borrow_photo_path` | `text` | YES | `NULL` | - | Path storage foto peminjam bersama unit |
| `borrow_identification_method`| `varchar(15)` | NO | `'QR'` | CHECK `IN ('QR', 'MANUAL_LOOKUP')` | Metode verifikasi peminjam |
| `borrow_processed_by` | `uuid` | NO | - | FK → `staff_profiles(id)` ON DELETE RESTRICT | Petugas TU yang menyerahkan unit |
| `returned_at` | `timestamptz` | YES | `NULL` | - | Waktu pengembalian proyektor |
| `return_photo_path` | `text` | YES | `NULL` | - | Path storage foto pengembalian unit |
| `returned_by_type` | `varchar(15)` | YES | `NULL` | CHECK `IN ('BORROWER', 'REPRESENTATIVE')` | Tipe pihak yang mengembalikan |
| `returned_by_name` | `varchar(100)`| YES | `NULL` | - | Nama perwakilan jika dikembalikan perwakilan |
| `return_processed_by` | `uuid` | YES | `NULL` | FK → `staff_profiles(id)` ON DELETE SET NULL | Petugas TU yang menerima pengembalian |
| `return_condition` | `varchar(20)` | YES | `NULL` | CHECK `IN ('NORMAL', 'REPORTED_ISSUE')` | Kondisi unit saat diterima kembali |
| `damage_notes` | `text` | YES | `NULL` | - | Catatan kendala / laporan kerusakan |
| `issue_resolved_at` | `timestamptz` | YES | `NULL` | - | Penanda penyelesaian kendala (acuan retensi) |
| `status` | `varchar(15)` | NO | `'ACTIVE'` | CHECK `IN ('ACTIVE', 'COMPLETED')` | Status transaksi peminjaman |
| `photos_deleted_at` | `timestamptz` | YES | `NULL` | - | Waktu foto transaksi dibersihkan retensi |
| `created_at` | `timestamptz` | NO | `now()` | - | Waktu record dibuat |
| `updated_at` | `timestamptz` | NO | `now()` | - | Waktu record diubah |

**Partial Unique Indexes**:
1. `UNIQUE (projector_id) WHERE status = 'ACTIVE'` (1 pinjaman aktif per proyektor)
2. `UNIQUE (student_id) WHERE status = 'ACTIVE'` (1 pinjaman aktif per mahasiswa)

**Strategi Retensi**: Baris transaksi disimpan permanen. Foto `borrow_photo_path` dan `return_photo_path` dihapus 180 hari setelah `returned_at` jika `issue_resolved_at IS NOT NULL` (atau transaksi berkondisi `NORMAL`).

---

## 7. Tabel `projector_status_logs`

Menyimpan log audit setiap kali status unit proyektor berubah.

| Nama Kolom | Tipe Data | Nullable | Default | Batasan & Relasi | Deskripsi |
|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary Key | Pengenal unik log status |
| `projector_id` | `uuid` | NO | - | FK → `projectors(id)` ON DELETE CASCADE | Unit proyektor terkait |
| `from_status` | `varchar(15)` | NO | - | CHECK 4 status proyektor | Status unit sebelumnya |
| `to_status` | `varchar(15)` | NO | - | CHECK 4 status proyektor | Status unit yang baru |
| `reason` | `text` | YES | `NULL` | - | Alasan perubahan / catatan kendala |
| `photo_path` | `text` | YES | `NULL` | - | Foto bukti kendala (jika ada) |
| `loan_id` | `uuid` | YES | `NULL` | FK → `loans(id)` ON DELETE SET NULL | Transaksi terkait (jika dipicu transaksi) |
| `idempotency_key` | `varchar(64)` | YES | `NULL` | - | Kunci idempotensi jika dipicu pembatalan pinjam |
| `changed_by` | `uuid` | YES | `NULL` | FK → `staff_profiles(id)` ON DELETE SET NULL | Petugas yang mengubah status manual |
| `created_at` | `timestamptz` | NO | `now()` | - | Waktu perubahan status dicatat |

---

## 8. Tabel `audit_logs`

Jejak audit keamanan sistem yang bersifat *append-only* (tidak boleh di-update maupun di-delete).

| Nama Kolom | Tipe Data | Nullable | Default | Batasan & Relasi | Deskripsi |
|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary Key | Pengenal unik baris audit |
| `actor_staff_id` | `uuid` | YES | `NULL` | FK → `staff_profiles(id)` ON DELETE SET NULL | Petugas/Admin pelaku aksi |
| `actor_student_id`| `uuid` | YES | `NULL` | FK → `students(id)` ON DELETE SET NULL | Mahasiswa pelaku aksi |
| `action` | `varchar(50)` | NO | - | - | Nama tindakan terstruktur (mis. `PHOTO_SIGNED_URL`) |
| `entity_type` | `varchar(50)` | NO | - | - | Tipe entitas objek sasaran |
| `entity_id` | `varchar(64)` | YES | `NULL` | - | ID entitas objek sasaran |
| `metadata` | `jsonb` | NO | `'{}'::jsonb` | Bebas dari PII/Secret/Token | Data kontekstual audit yang telah disanitasi |
| `created_at` | `timestamptz` | NO | `now()` | - | Waktu aksi terjadi (server WIB) |

---

## 9. Tabel `kiosk_sessions`

Menyimpan sesi pemindaian Kiosk berumur pendek (maksimal 120 detik) untuk mendukung *serverless state isolation*.

| Nama Kolom | Tipe Data | Nullable | Default | Batasan & Relasi | Deskripsi |
|---|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary Key | Pengenal unik sesi Kiosk |
| `student_id` | `uuid` | NO | - | FK → `students(id)` ON DELETE CASCADE | Mahasiswa yang tervalidasi di Kiosk |
| `class_id` | `uuid` | NO | - | FK → `classes(id)` ON DELETE CASCADE | Kelas mahasiswa saat sesi dibuat |
| `created_by_staff_id`| `uuid` | NO | - | FK → `staff_profiles(id)` ON DELETE CASCADE| Petugas operator Kiosk |
| `identification_method`| `varchar(15)`| NO | - | CHECK `IN ('QR', 'MANUAL_LOOKUP')` | Cara mahasiswa diidentifikasi |
| `manual_reason` | `text` | YES | `NULL` | - | Alasan petugas jika pencarian manual |
| `expires_at` | `timestamptz` | NO | - | TTL maks. 120 detik | Batas waktu sesi Kiosk kedaluwarsa |
| `consumed_at` | `timestamptz` | YES | `NULL` | - | Waktu sesi dikonsumsi transaksi |
| `created_at` | `timestamptz` | NO | `now()` | - | Waktu sesi Kiosk dibuat |

---

## 10. Tabel `app_settings`

Menyimpan pengaturan sistem operasional (jam operasional TU, durasi fallback, semester aktif, metrik kuota storage).

| Nama Kolom | Tipe Data | Nullable | Default | Batasan & Relasi | Deskripsi |
|---|---|---|---|---|---|
| `key` | `varchar(50)` | NO | - | Primary Key | Kunci pengaturan (mis. `operational_hours`) |
| `value` | `jsonb` | NO | - | - | Nilai pengaturan terstruktur JSON |
| `description` | `text` | YES | `NULL` | - | Keterangan fungsi pengaturan |
| `updated_by` | `uuid` | YES | `NULL` | FK → `staff_profiles(id)` ON DELETE SET NULL | Admin yang terakhir mengubah |
| `updated_at` | `timestamptz` | NO | `now()` | - | Waktu terakhir pengaturan diperbarui |
