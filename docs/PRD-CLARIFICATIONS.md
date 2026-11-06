# SmartProjex — PRD Clarifications & Design Decisions

Dokumen ini mendokumentasikan keputusan teknis, penyelarasan celah spesifikasi (*requirement gaps*), dan klarifikasi arsitektur terhadap `PRD.md` Revisi 3 tanpa memodifikasi dokumen sumber kebenaran tersebut secara langsung.

---

## 1. Penambahan Kolom `students.current_class_id` (GAP-01)

### Latar Belakang & Masalah
Pada PRD Bagian 7.2, tabel `students` hanya memuat data profil dasar dan verifikasi tanpa kolom referensi kelas, sementara:
- `FR-01` mewajibkan: *"Mahasiswa dapat mendaftar dengan Nama Lengkap, NIM, email, dan memilih kelas dari daftar baku..."*
- `FR-01E` mewajibkan: *"Ketua kelas aktif dapat mengalihkan jabatan ke mahasiswa berstatus ACTIVE pada kelas yang sama..."*
- Endpoint `POST /api/students/profile` menerima input `class_id`.

Jika relasi kelas hanya disimpan pada riwayat `class_leader_claims`, maka:
1. Mahasiswa biasa berstatus `ACTIVE` yang bukan pemegang klaim disetujui tidak memiliki sumber kebenaran tunggal mengenai kelasnya saat ini.
2. Validasi kandidat serah-terima jabatan (`TRANSFER`) menjadi ambigu jika ada mahasiswa yang klaimnya pernah ditolak atau belum pernah mengajukan klaim.

### Keputusan Desain
Menambahkan kolom `current_class_id uuid NULL REFERENCES public.classes(id) ON DELETE SET NULL` pada tabel `students`.
- Diisi saat pendaftaran profil awal (`POST /api/students/profile`).
- Diperbarui saat mahasiswa memilih kelas baru pada pergantian semester (`FR-01F`).
- Memungkinkan penegakan invariant `FR-01E` secara deterministik: target transfer wajib memiliki `current_class_id = class_id_ketua` dan `registration_status = 'ACTIVE'`.

---

## 2. Mekanisme Otoritatif Versi Token QR (`qr_token_version`)

### Latar Belakang
`FR-02` menetapkan: *"Mahasiswa dapat mencabut QR (menaikkan versi token) kapan saja."*  
`NFR-03` menetapkan: *"Token QR diverifikasi di server (tanda tangan, kedaluwarsa, versi, status akun, status ketua)."*

### Keputusan Desain
1. Nilai `students.qr_token_version` bertipe integer dengan nilai bawaan `1` (`CHECK >= 1`).
2. Payload JWS memuat klaim `v: student.qr_token_version`.
3. Fungsi verifikasi `verifyQrPassToken` membandingkan nilai `payload.v` terhadap nilai `qr_token_version` terkini di database baris mahasiswa bersangkutan.
4. Nilai `qr_token_version` dinaikkan secara atomik (`UPDATE students SET qr_token_version = qr_token_version + 1`) pada skenario:
   - Mahasiswa menekan tombol "Cabut QR" mandiri di halaman `/my-qr`.
   - Jabatan ketua dialihkan (`TRANSFER`) ke rekan sekelas.
   - Admin melepas ketua kelas secara manual dari panel Admin.
   - Semester akademik berakhir (dieksekusi oleh tugas cron retensi harian).
5. Kenaikan versi token ini secara seketika menggugurkan seluruh screenshot atau token yang sedang berjalan di memori perangkat lain tanpa memerlukan blacklist token.

---

## 3. Desain Tabel `kiosk_sessions` (GAP-02)

### Latar Belakang
PRD Bagian 7.1 baris 377 menetapkan:
*"Setelah token valid, server membuat kiosk_session_id berumur maksimal 120 detik yang terikat ke mahasiswa, sehingga transaksi tidak bergantung pada token 60 detik. UI Kiosk tetap mereset sesi setelah 30 detik tanpa aktivitas."*  
Namun, tabel `kiosk_sessions` belum dirinci dalam daftar tabel skema Bagian 7.2.

### Keputusan Desain
Pada arsitektur serverless (Next.js di Vercel), penyimpanan state sesi di in-memory cache tidak terjamin konsistensinya antar request yang berbeda kontainer. Oleh karena itu, sesi Kiosk dimodelkan ke dalam tabel `kiosk_sessions`:
- `id uuid PK`: Pengenal sesi yang dikirimkan ke Kiosk.
- `student_id uuid FK`: Mahasiswa yang berhasil diverifikasi identitasnya.
- `class_id uuid FK`: Kelas mahasiswa saat transaksi.
- `created_by_staff_id uuid FK`: Petugas yang membuka sesi Kiosk.
- `identification_method varchar(15)`: `'QR'` atau `'MANUAL_LOOKUP'`.
- `manual_reason text`: Wajib diisi jika metode identifikasi manual.
- `expires_at timestamptz`: Waktu kedaluwarsa sesi (waktu buat + 120 detik).
- `consumed_at timestamptz`: Diisi saat transaksi peminjaman berhasil disimpan agar sesi Kiosk tidak dapat dipakai ulang (*one-time use*).

---

## 4. Desain Tabel `app_settings`

### Latar Belakang
PRD Bagian 7.2 baris 504 menetapkan:
*"Pengaturan seperti jam operasional dan jumlah jam default pinjam disimpan di tabel kunci-nilai app_settings."*

### Keputusan Desain
Tabel kunci-nilai `app_settings` dibuat dengan skema:
- `key varchar(50) PRIMARY KEY`
- `value jsonb NOT NULL`
- `description text`
- `updated_by uuid FK -> staff_profiles(id)`
- `updated_at timestamptz NOT NULL`

Kunci bawaan (*seed*):
1. `'operational_hours'`: `{"closing_hour": 17, "closing_minute": 0, "fallback_hours": 2}`
2. `'academic_term'`: `{"current_term": "2026/2027-GANJIL", "term_ends_at": "2027-01-31T23:59:59+07:00"}`
3. `'storage_monitoring'`: `{"warning_threshold_pct": 70, "max_capacity_bytes": 1073741824}`

---

## 5. Penanda Penyelesaian Kendala (`loans.issue_resolved_at`)

### Latar Belakang
`NFR-08` menyatakan: *"foto transaksi dihapus 180 hari setelah transaksi selesai, kecuali terkait kendala yang belum diselesaikan."*

### Keputusan Desain
Pada tabel `loans`, ditambahkan kolom `issue_resolved_at timestamptz NULL`.
- Jika transaksi selesai dalam kondisi `NORMAL`, `issue_resolved_at` otomatis terisi sama dengan `returned_at` (atau dianggap terselesaikan secara instan).
- Jika transaksi selesai dengan `return_condition = 'REPORTED_ISSUE'`, kolom `issue_resolved_at` bernilai `NULL`.
- Ketika petugas/admin memeriksa fisik unit dan mengembalikan proyektor dari status `MAINTENANCE` kembali ke `AVAILABLE`, `issue_resolved_at` diisi `now()`.
- Tugas cron retensi foto hanya menghapus foto transaksi jika:
  `status = 'COMPLETED' AND returned_at < now() - interval '180 days' AND (return_condition = 'NORMAL' OR issue_resolved_at IS NOT NULL)`.



---

## 6. Alur Status Registrasi & Verifikasi Tatap Muka (GAP-06)

### Latar Belakang
PRD menetapkan alur verifikasi tatap muka (FR-01B, FR-01C, FT-00) di mana mahasiswa mendaftar daring, lalu hadir fisik ke loket TU membawa KTM atau KTP fisik. Status pendaftaran perlu memiliki transisi yang konsisten dan terprediksi:

### Keputusan Desain
1. **UNVERIFIED_EMAIL**: Status saat mahasiswa baru mengisi form pendaftaran di `/register`. Mahasiswa belum memverifikasi emailnya.
2. **PENDING_DOCUMENT**: Status setelah konfirmasi email berhasil di `/auth/callback`. Mahasiswa siap hadir ke loket TU membawa identitas fisik.
3. **PENDING_VERIFICATION**: Status saat petugas TU di meja loket telah mengambil foto live wajah dan foto dokumen identitas via kamera antarmuka `/admin/verifications`.
4. **Keputusan Petugas**:
   - **APPROVE**: Hanya dapat dipilih jika ketiga ceklist manual bernilai benar (`face_match = true`, `name_match = true`, `status_confirmed = true`). Status menjadi `ACTIVE`. Foto dokumen KTM/KTP dihapus seketika dari storage bucket privat (`NFR-08`). Jika ada klaim ketua awal (`INITIAL`), otomatis disetujui (`APPROVED`) dan mahasiswa dijadikan `leader_student_id` di kelasnya.
   - **REJECT**: Mewajibkan catatan penolakan dari petugas. Status menjadi `REJECTED`. Foto dokumen dihapus seketika.
   - **REQUEST_RESUBMISSION**: Mewajibkan catatan perbaikan dari petugas. Status menjadi `RESUBMISSION_REQUIRED`. Foto dokumen dihapus seketika.

---

## 7. Kesetaraan Dokumen KTM dan KTP Tanpa OCR / Biometrik

### Latar Belakang
PRD Bagian 7.1 & Aturan Workspace menegaskan bahwa mahasiswa yang belum memiliki KTM dapat menggunakan KTP fisik dengan perlakuan setara. Sistem dilarang melakukan OCR dan facial recognition otomatis.

### Keputusan Desain
1. Antarmuka petugas menyediakan pilihan jenis dokumen: `KTM` atau `KTP`.
2. Petugas melakukan perbandingan visual manual berdampingan (*side-by-side*) antara:
   - Tangkapan kamera wajah langsung di loket.
   - Foto fisik pada KTM/KTP yang ditunjukkan mahasiswa.
   - Data nama dan NIM yang diinput pada formulir.
3. Seluruh proses tidak mengandalkan kecerdasan buatan atau pemindaian biometrik otomatis untuk menjamin privasi dan kepatuhan terhadap PRD.
