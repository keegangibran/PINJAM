# PROJECT CONTEXT — PINJAM (Sistem Peminjaman Proyektor Pintar)

> **Dokumen Konteks Permanen Proyek**  
> **Terakhir Diperbarui**: 11 November 2026  
> **Status Proyek**: MVP Implementasi Lengkap (100% Quality Gates: Typecheck PASS, Lint PASS, Unit Tests 156 PASS, Production Build 35 Routes PASS)  
> **Dokumen Sumber Kebenaran (Source of Truth)**: `PRD.md` (Revisi 3, 5 November 2026)  
> **Aturan Agen**: `AGENTS.md` dan `.agents/rules/*.md`

---

## 1. Identitas & Tujuan Proyek PINJAM

- **Nama Resmi Proyek**: **PINJAM** *(Sistem Peminjaman Proyektor Pintar Berbasis Dual-Scan)*.
- **Nama Terdahulu**: *SmartProjex* (telah direbranding secara bertahap pada November 2026).
- **Domain**: Layanan peminjaman perlengkapan proyektor perkuliahan di lingkungan Tata Usaha (TU) / Laboratorium Kampus (studi kasus: UNIMED).
- **Tujuan Utama**:
  1. Menggantikan antrean panjang pencatatan manual di buku besar kertas dengan sistem digital berbasis web yang cepat ($\le$ 15 detik pada transaksi normal).
  2. Menghilangkan ketergantungan penahanan KTP fisik mahasiswa sebagai jaminan melalui penegakan batas waktu pengembalian (*due_at*) dan pelacakan keterlambatan *real-time*.
  3. Menegakkan aturan kampus: **hanya ketua kelas aktif** yang berhak mengambil proyektor kelasnya, tanpa membebani petugas untuk mengelola daftar ketua kelas secara manual.
  4. Menyediakan jejak audit komprehensif, pencatatan waktu otomatis zona WIB, dan bukti dokumentasi foto transaksi fisik.

---

## 2. Latar Belakang Masalah & Solusi

### Masalah Sistem Lama (Manual)
1. **Antrean Buku Besar**: Ketua kelas harus mengantre untuk menulis data diri, tanda tangan di buku besar fisik, dan menyerahkan KTP sebelum kelas dimulai.
2. **Risiko Jaminan Kartu Fisik**: Risiko KTP tertukar, hilang, atau lupa diambil kembali setelah perkuliahan selesai.
3. **Keterbatasan Pelacakan**: Petugas TU sulit mengetahui unit mana yang sedang dipinjam, siapa yang membawa, dan unit mana yang melewati batas jam operasional (*overdue*).
4. **Ketiadaan Bukti Kondisi**: Jika proyektor dikembalikan dalam kondisi rusak, sering terjadi silang pendapat mengenai siapa yang bertanggung jawab.

### Solusi PINJAM
1. **Dual-Scan Cepat via Kiosk**: Petugas memindai QR Pass di smartphone mahasiswa dan QR label pada unit proyektor menggunakan kamera laptop Kiosk TU.
2. **Klaim Ketua Kelas Mandiri**: Pendaftar pertama per kelas otomatis mengajukan klaim ketua kelas yang diverifikasi tatap muka oleh TU; ketua dapat mengalihkan jabatan ke teman sekelasnya yang aktif.
3. **Smart Toggle Server**: Server secara otomatis menentukan aksi peminjaman (*BORROW*) atau pengembalian (*RETURN*) berdasarkan status unit terkini di database dengan penguncian baris (*row locking*).
4. **Verifikasi Tatap Muka Setara (KTM/KTP)**: Karena belum semua mahasiswa memiliki KTM, KTM dan KTP diterima setara. Petugas mengambil foto wajah referensi dan foto dokumen identitas di meja TU; foto dokumen langsung dihapus pasca keputusan untuk menjaga privasi.
5. **Pelaporan Kendala Sederhana**: Satu langkah konfirmasi kondisi: *Normal* atau *Laporkan Kendala* dengan catatan kerusakan tanpa checklist berbelit.

---

## 3. Teknologi & Arsitektur Aplikasi

| Lapisan / Komponen | Teknologi yang Digunakan | Penjelasan |
| :--- | :--- | :--- |
| **Framework Web** | Next.js 15 (App Router, Server-side Route Handlers) | React 19, Server Components untuk keamanan & Client Components untuk scanner/kamera. |
| **Bahasa & Typing** | TypeScript 5.7+ (Mode Strict) | 100% type-safe, dilarang menggunakan `any` tanpa justifikasi ketat. |
| **Styling & UI** | Tailwind CSS 3.4+ & PostCSS | Responsif mobile (layar smartphone QR Pass) dan desktop 1366x768+ (Kiosk TU). |
| **Backend & Database** | Supabase (PostgreSQL 15+) | RLS (*deny-by-default*), partial unique indexes, foreign keys terisolasi. |
| **Autentikasi** | Supabase Auth & `@supabase/ssr` | Cookie-based session, RBAC (`STUDENT`, `STAFF`, `ADMIN`), auth guards server-side. |
| **Kriptografi QR Token** | `jose` (v5.9.6) | Token JWS HS256, TTL 60 detik, zero-PII di payload, diverifikasi server-side. |
| **Scanner & Renderer QR** | `html5-qrcode` & `qrcode.react` | Webcam stream scanning dan rendering SVG QR Pass mahasiswa. |
| **Penyimpanan Berkas** | Supabase Storage (Bucket privat) | Penyimpanan privat foto wajah, dokumen sementara, dan transaksi via Signed URL $\le$ 60s. |
| **Generator Ekspor** | `exceljs` & Generator CSV RFC 4180 | Ekspor buku besar ke Excel (.xlsx terformat rapi) dan CSV dengan UTF-8 BOM (`\uFEFF`). |
| **Test Runner** | Vitest (v3.0.5) | Pengujian unit dan integrasi dengan mock Supabase lengkap. |

---

## 4. Struktur Direktori Penting

```
.
├── .agents/                       # Konfigurasi AI rules & workflows Google Antigravity
│   ├── rules/
│   │   ├── prd-and-scope.md       # Invariants PRD & batasan anti-scope yang dilarang
│   │   ├── supabase-security.md   # Pedoman RLS, storage privat, auth guards, signed URLs
│   │   └── implementation-quality.md # Standar typecheck, testing, dan verifikasi
│   └── workflows/
│       └── phase-execution.md     # Prosedur eksekusi fase pengembangan
├── docs/                          # Dokumentasi teknis & rekam jejak historis
│   ├── audit/                     # Laporan audit kesiapan produksi & verifikasi staging
│   ├── database/                  # ERD, Kamus Data, RLS Matrix, Storage Rules, Transaksi Atomik
│   └── PRD-CLARIFICATIONS.md      # Keputusan arsitektur dan klarifikasi PRD
├── src/
│   ├── app/
│   │   ├── (auth)/login/          # Halaman masuk untuk staf TU dan mahasiswa
│   │   ├── (student)/
│   │   │   ├── my-qr/             # Halaman QR Pass dinamis ketua kelas
│   │   │   └── register/          # Halaman registrasi mandiri akun mahasiswa
│   │   ├── admin/
│   │   │   ├── page.tsx           # Dashboard Admin: statistik, monitoring overdue, buku besar
│   │   │   ├── classes/           # Manajemen rombel kelas baku & klaim ketua kelas
│   │   │   ├── projectors/        # Manajemen inventaris unit proyektor & log status
│   │   │   └── verifications/     # Antarmuka verifikasi fisik & dokumen mahasiswa oleh TU
│   │   ├── api/                   # Route Handlers backend Next.js (REST API server-only)
│   │   ├── kiosk/page.tsx         # Antarmuka Kiosk dual-scan untuk laptop meja TU
│   │   ├── layout.tsx             # Root layout dengan metadata resmi PINJAM
│   │   └── page.tsx               # Landing page navigasi utama
│   ├── components/                # Komponen UI modular (VerificationCapture, RegistrationForm)
│   ├── lib/
│   │   ├── audit.ts               # Utilitas pencatatan audit log append-only
│   │   ├── auth/guards.ts         # Server guards: requireAuth, requireStaff, requireAdmin
│   │   ├── qr-token.ts            # Utilitas generate & verify token QR HS256
│   │   ├── retention.ts           # Logika pembersihan otomatis foto privat kedaluwarsa
│   │   ├── supabase/              # Inisialisasi klien Supabase (admin, server, client)
│   │   └── timezone.ts            # Utilitas zona waktu bisnis Asia/Jakarta (WIB)
│   └── types/database.ts          # Skema tipe data TypeScript untuk basis data Supabase
├── supabase/
│   ├── migrations/                # 6 berkas migrasi SQL (skema, RLS, storage, fungsi atomik)
│   └── seed.sql                   # Data awal sistem (konfigurasi jam operasional & semester)
└── tests/
    ├── integration/               # Pengujian integrasi staging live (conditional skip)
    └── unit/                      # 27 berkas pengujian unit (156 tes lulus 100%)
```

---

## 5. Peran Pengguna & Matriks Hak Akses

| Hak Akses / Fungsionalitas | Mahasiswa Biasa | Ketua Kelas Aktif | Petugas TU (`STAFF`) | Administrator (`ADMIN`) |
| :--- | :---: | :---: | :---: | :---: |
| Mendaftar akun & verifikasi email | ✔ | ✔ | – | – |
| Mengajukan klaim ketua kelas | ✔ | ✔ | – | – |
| Mengakses QR Pass dinamis (`/my-qr`) | – | ✔ | – | – |
| Mengalihkan jabatan ketua kelas | – | ✔ | – | – |
| Mengoperasikan Kiosk scanner (`/kiosk`) | – | – | ✔ | ✔ |
| Melakukan verifikasi fisik tatap muka | – | – | ✔ | ✔ |
| Dashboard monitoring & overdue tracking | – | – | ✔ | ✔ |
| Mengubah status unit (Tersedia / Kendala) | – | – | ✔ | ✔ |
| Menyetujui / menolak klaim ketua kelas | – | – | ✔ | ✔ |
| Mengunduh buku besar (CSV & Excel .xlsx) | – | – | – | ✔ |
| Manajemen master kelas & salin semester | – | – | – | ✔ |
| Manajemen akun staf TU & lihat Audit Log | – | – | – | ✔ |

---

## 6. Daftar Fitur, Status Implementasi, & Verifikasi

| Kode | Fitur / Kebutuhan PRD | Status Implementasi | Status Verifikasi | Bukti / Catatan |
| :--- | :--- | :---: | :---: | :--- |
| **FR-01** | Registrasi mahasiswa & pemilihan kelas baku | Selesai | **PASS (Unit Test)** | `tests/unit/student-registration.test.ts` |
| **FR-01A-C** | Verifikasi fisik TU, foto webcam, hapus dokumen | Selesai | **PASS (Unit Test)** | `tests/unit/verification-flow.test.ts` (6/6) |
| **FR-02** | Dinamika QR Pass (HS256, 60s, revokasi) | Selesai | **PASS (Unit Test)** | `tests/unit/qr-token.test.ts`, `qr-pass-api.test.ts` |
| **FR-03** | Autentikasi Staf & Admin (RBAC, HttpOnly cookies) | Selesai | **PASS (Unit Test)** | `tests/unit/auth-guards.test.ts`, `auth-login-sync.test.ts` |
| **FR-04** | Sesi Kiosk meja TU & auto-lock idle timeout | Selesai | **PASS (Unit Test)** | `tests/unit/kiosk-session-api.test.ts` |
| **FR-06** | Peminjaman unit proyektor (Smart Toggle BORROW) | Selesai | **PASS (Unit Test)** | `tests/unit/atomic-loan-logic.test.ts` |
| **FR-07** | Pengembalian unit proyektor (Smart Toggle RETURN) | Selesai | **PASS (Unit Test)** | `tests/unit/kiosk-transaction-api.test.ts` |
| **FR-08** | Laporan kendala & pengalihan ke `MAINTENANCE` | Selesai | **PASS (Unit Test)** | `tests/unit/admin-projectors-api.test.ts` |
| **FR-09** | Manajemen rombel kelas baku & salin semester | Selesai | **PASS (Unit Test)** | `tests/unit/classes-management.test.ts` |
| **FR-10** | Inventaris proyektor fisik & riwayat status unit | Selesai | **PASS (Unit Test)** | `tests/unit/admin-projectors-api.test.ts` |
| **FR-11** | Dashboard operasional & monitoring unit terlambat | Selesai | **PASS (Unit Test)** | `tests/unit/admin-loans-api.test.ts` |
| **FR-13** | Ekspor buku besar CSV (BOM) & Excel (.xlsx) | Selesai | **PASS (Unit Test)** | `tests/unit/admin-export-loans-api.test.ts` (6/6) |
| **FR-14** | Audit trail append-only pada seluruh aksi | Selesai | **PASS (Unit Test)** | `tests/unit/audit.test.ts` |
| **FR-17** | Idempotensi transaksi pinjam/kembali | Selesai | **PASS (Unit Test)** | `tests/unit/atomic-loan-logic.test.ts` |
| **FR-18** | Akses foto via Signed URL maksimal 60 detik | Selesai | **PASS (Unit Test)** | `tests/unit/photo-signing.test.ts` |
| **FR-19** | Transfer ketua kelas instan & revokasi QR | Selesai | **PASS (Unit Test)** | `tests/unit/leader-transfer-api.test.ts`, `qr-revoke-api.test.ts` |
| **FR-20** | Retensi data otomatis & pembersihan cron | Selesai | **PASS (Unit Test)** | `tests/unit/retention-logic.test.ts`, `cron-api.test.ts` |
| **Fase 0** | Uji kecocokan hardware webcam laptop Kiosk TU | Siap Uji | **Belum Diverifikasi** | Butuh uji coba fisik di laptop meja TU kampus. |

---

## 7. Alur Bisnis Detail

### 7.1 Alur Registrasi & Verifikasi Mahasiswa
1. Mahasiswa mendaftar di `/register` (Nama, NIM, Email Kampus, Password, Kelas). Status awal: `UNVERIFIED_EMAIL`.
2. Mahasiswa memverifikasi email melalui tautan Supabase Auth $\rightarrow$ status otomatis menjadi `PENDING_DOCUMENT`.
3. Jika kelas belum memiliki ketua, pendaftar pertama otomatis berstatus calon ketua kelas (`INITIAL claim`).
4. Mahasiswa datang tatap muka ke meja TU membawa fisik KTM atau KTP.
5. Petugas TU membuka antarmuka `/admin/verifications/[studentId]`.
6. Petugas mengambil **foto wajah mahasiswa** (disimpan privat sebagai referensi visual) dan **foto dokumen identitas** menggunakan kamera perangkat petugas (dengan persetujuan eksplisit).
7. Petugas memeriksa secara manual 3 hal: (a) kecocokan wajah dengan foto dokumen, (b) kecocokan nama, (c) bukti status ketua kelas.
8. Keputusan Petugas:
   - **Setujui (`APPROVE`)**: Status mahasiswa menjadi `ACTIVE`. Foto dokumen fisik **langsung dihapus permanen**.
   - **Tolak (`REJECT`)**: Status menjadi `REJECTED`. Foto dokumen dan foto wajah dihapus.
   - **Minta Unggah Ulang (`REQUEST_RESUBMISSION`)**: Wajib menyertakan catatan kendala (*verification_notes*); foto dokumen dihapus, mahasiswa diminta verifikasi ulang tatap muka.

### 7.2 Alur QR Pass Mahasiswa
- Setelah akun `ACTIVE` dan berstatus ketua kelas aktif pada kelasnya, mahasiswa dapat membuka `/my-qr`.
- Sistem membuat token JWS bertanda tangan HS256 dengan payload `{ sub: studentId, clid: classId, ver: qrTokenVersion, exp: now + 60s }`. Token **tidak memuat NIM**.
- Tampilan QR Pass menyertakan hitung mundur (*countdown timer*) dan melakukan pembaruan otomatis setiap 30 detik.
- Jika mahasiswa kehilangan HP, tombol **Revokasi QR** dapat ditekan untuk menaikkan `qr_token_version` sehingga seluruh QR yang telah digenerate sebelumnya otomatis tidak berlaku.

### 7.3 Alur Dual-Scan Kiosk, Peminjaman, & Pengembalian
1. Petugas TU login dan membuka antarmuka `/kiosk`. Sesi kiosk dibuat dengan proteksi *idle timeout*.
2. **Scan 1 (Identifikasi Mahasiswa)**:
   - Mahasiswa menghadapkan layar HP berisi QR Pass ke webcam laptop TU.
   - *Jalur Cadangan*: Jika kamera/HP bermasalah, petugas dapat menggunakan form pencarian manual berbasis NIM atau nama.
   - Sistem memverifikasi validitas token kriptografis, memastikan status mahasiswa `ACTIVE`, memastikan mahasiswa adalah ketua aktif, dan memastikan mahasiswa **belum memiliki pinjaman aktif lain**.
3. **Scan 2 (Identifikasi Unit)**:
   - Petugas menghadapkan stiker QR pada badan proyektor ke webcam laptop TU.
   - Server mengecek status unit proyektor di database (**Smart Toggle**):
     - Jika unit berstatus `AVAILABLE`: Aksi disiapkan sebagai **BORROW (Peminjaman)**.
     - Jika unit berstatus `BORROWED`: Aksi disiapkan sebagai **RETURN (Pengembalian)**.
     - Jika unit berstatus `MAINTENANCE` atau `INACTIVE`: Transaksi otomatis ditolak dengan pesan informatif.
4. **Dokumentasi & Konfirmasi**:
   - Petugas mengambil satu foto serah-terima fisik via webcam (menampilkan peminjam bersama unit proyektor).
   - Petugas memilih kondisi unit: **"Normal"** atau **"Laporkan Kendala"** (wajib mengisi catatan jika ada kendala).
   - Pada alur pengembalian: dapat dikembalikan oleh peminjam sendiri (`BORROWER`) atau perwakilan (`REPRESENTATIVE`, nama dicatat).
5. **Penyimpanan Atomik**:
   - Transaksi diproses melalui Route Handler `/api/kiosk/transaction` dengan `idempotency_key` unik.
   - Fungsi SQL atomik `process_loan_transaction` mengunci baris proyektor (`SELECT ... FOR UPDATE`), memperbarui status unit, mencatat log status, dan menyimpan catatan pinjaman dalam satu transaksi database.

---

## 8. Struktur Database & Integrasi Supabase

Skema database terdiri dari 10 tabel yang saling terhubung:

1. **`staff_profiles`**: Profil staf TU dan admin (role: `STAFF` | `ADMIN`, `is_active`). Relasi 1-to-1 dengan `auth.users`.
2. **`classes`**: Master data kelas baku (Prodi, Angkatan, Rombel A/B/C, Semester). Memiliki FK `leader_student_id` ke `students`.
3. **`students`**: Master data mahasiswa (NIM, Nama, Email, Status Registrasi, `qr_token_version`, path foto wajah).
4. **`class_leader_claims`**: Pengajuan ketua kelas (`INITIAL`, `REPLACEMENT`, `TRANSFER`) dan status keputusannya.
5. **`projectors`**: Inventaris unit proyektor fisik (Kode unik misal `PROJ-01`, Nama, Status: `AVAILABLE`, `BORROWED`, `MAINTENANCE`, `INACTIVE`).
6. **`loans`**: Buku besar transaksi (`borrowed_at`, `due_at`, `returned_at`, status `ACTIVE` / `COMPLETED`, petugas pinjam/kembali, foto, kondisi, catatan kerusakan, `idempotency_key`).
7. **`projector_status_logs`**: Rekam jejak audit setiap perubahan status unit proyektor.
8. **`kiosk_sessions`**: Pengelolaan sesi aktif antarmuka kiosk meja TU.
9. **`audit_logs`**: Catatan jejak audit komprehensif append-only (ekspor data, penerbitan signed URL, dll.).
10. **`app_settings`**: Konfigurasi dinamis sistem (jam operasional TU WIB, semester akademik aktif, status retensi data).

### Partial Unique Indexes (Penegakan Integritas Database)
- `idx_loans_one_active_per_projector`: Menjamin proyektor yang sedang dipinjam tidak dapat dipinjam kembali sebelum statusnya `COMPLETED`.
- `idx_loans_one_active_per_student`: Menjamin satu ketua kelas maksimal hanya memiliki 1 unit pinjaman aktif pada satu waktu.
- `idx_classes_active_leader`: Menjamin satu kelas hanya memiliki 1 ketua aktif.

---

## 9. Aturan Keamanan, Privasi, & Batasan Sistem

- **Row Level Security (RLS)**: Wajib aktif di seluruh tabel basis data dengan prinsip *deny-by-default*.
- **Penyimpanan Privat**: Seluruh foto disimpan di bucket privat Supabase Storage. Database hanya menyimpan *object path*, bukan URL publik.
- **Signed URL Maksimal 60 Detik**: Setiap penayangan foto menggunakan URL bertanda tangan berumur maksimal 60 detik dan wajib dicatat di `audit_logs`.
- **Nol Biometrik Otomatis & Nol OCR**: Dilarang mengimplementasikan pencocokan wajah otomatis (*face recognition*) atau OCR otomatis. Pemeriksaan identitas 100% merupakan pembanding visual manual oleh staf TU.
- **Retensi Dokumen Singkat**: Foto dokumen identitas (KTM/KTP) wajib dihapus segera setelah keputusan verifikasi ($\le$ 24 jam). Sistem tidak menyimpan NIK mahasiswa.
- **Waktu Transaksi Resmi**: Seluruh logika bisnis mengacu pada waktu server dalam zona waktu **Asia/Jakarta (WIB, UTC+7)**.
- **Mitigasi CSV Formula Injection (CWE-1236)**: Karakter pemicu formula (`=`, `+`, `@`, tab, CR) pada data ekspor otomatis disanitasi dengan tanda petik tunggal (`'`).

---

## 10. Panduan Instalasi & Menjalankan Aplikasi Lokal

### Prasyarat
- Node.js versi 18.18+ atau 20+
- Manajer paket `npm`
- Instance Supabase (Cloud Staging atau Local CLI)

### Langkah Menjalankan
1. **Pasang Dependensi**:
   ```bash
   npm install
   ```
2. **Konfigurasi Environment**:
   Salin berkas template lingkungan ke berkas lokal:
   ```bash
   cp .env.example .env.local
   ```
   Lengkapi variabel environment di `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `QR_TOKEN_SECRET` (string acak minimal 32 karakter)
   - `CRON_SECRET` (string acak untuk pengamanan cron job)
   - `NEXT_PUBLIC_APP_TIMEZONE="Asia/Jakarta"`
3. **Jalankan Server Pengembangan**:
   ```bash
   npm run dev
   ```
   Buka peramban di `http://localhost:3000`.

---

## 11. Perintah Pengujian & Quality Gates

| Perintah | Deskripsi | Standar Kualitas |
| :--- | :--- | :--- |
| `npm run typecheck` | Pemeriksaan tipe TypeScript strict (`tsc --noEmit`) | **Harus 0 error** |
| `npm run lint` | Pemeriksaan linter ESLint bawaan Next.js | **Harus 0 error, 0 warning** |
| `npm run test` | Menjalankan seluruh test suite Vitest | **Harus lulus seluruh skenario unit test** |
| `npm run build` | Membuat build produksi Next.js teroptimasi | **Harus sukses mengompilasi seluruh rute** |

---

## 12. Ringkasan Hasil Pengujian Terakhir (11 November 2026)

- **TypeScript Typecheck**: **PASS (0 error)**.
- **ESLint**: **PASS (0 error, 0 warning)**.
- **Unit Tests (Vitest)**: **28 test files PASS (156 tests passed, 11 live staging skipped secara aman)**.
  - Termasuk pengujian transaksi atomik, idempotensi, verifikasi catatan wajib `REQUEST_RESUBMISSION`, masa berlaku QR HS256, batas waktu overdue deterministik, pembersihan retensi cron, serta ekspor CSV & Excel.
- **Next.js Production Build**: **PASS (35 rute terkompilasi sukses)**.

---

## 13. Riwayat Rebranding SmartProjex $\rightarrow$ PINJAM

Rebranding dilakukan secara bertahap dan terukur:

1. **Kategori A (User-Facing Exports & Document Metadata)**:
   - Nama file unduhan di Route Handler `/api/admin/export/loans` diperbarui menjadi `pinjam-transaksi-*` (.csv dan .xlsx).
   - Metadata pembuat dokumen Excel diatur menjadi `workbook.creator = 'PINJAM'`.
   - Unit test `admin-export-loans-api.test.ts` disesuaikan untuk menguji nama baru.
2. **Kategori B (Project Config, README, Rules, & AI Workflows)**:
   - `package.json` dan `package-lock.json` diubah menjadi `"name": "pinjam"`.
   - `.env.example` diperbarui dengan judul PINJAM.
   - `README.md` diperbarui dengan panduan lengkap PINJAM.
   - `AGENTS.md`, `.agents/rules/prd-and-scope.md`, dan `.agents/workflows/phase-execution.md` diperbarui merefleksikan PINJAM.
3. **Kategori C (Referensi Teknis & Historis yang Sengaja Dipertahankan)**:
   - Lihat rincian pada Bagian 14 di bawah.

---

## 14. Referensi Teknis Lama yang Sengaja Dipertahankan

Referensi berikut **TIDAK DIUBAH** demi menjaga stabilitas dan integritas sistem:

1. **Nama Supabase Storage Bucket: `smartprojex-media`**:
   - *Alasan*: Bucket ini adalah entitas penyimpanan cloud fisik di Supabase yang telah terikat dengan RLS Storage Policies dan foreign key file path. Mengubah nama bucket di kode tanpa migrasi storage cloud akan mematahkan seluruh akses signed URL foto wajah, dokumen, dan foto transaksi.
2. **Komentar Header SQL Migration & Seed Data**:
   - *Alasan*: Berkas migrasi pada `supabase/migrations/*.sql` dan `supabase/seed.sql` adalah catatan historis DDL permanen.
3. **Dokumen Persyaratan Produk (`PRD.md`)**:
   - *Alasan*: Dokumen sumber kebenaran formal bertanggal 5 November 2026. Revisi PRD dilakukan melalui rilis formal terpisah jika disepakati.

---

## 15. Kondisi Staging Terakhir yang Diketahui

Berdasarkan pengujian manual dan simulasi staging:
- **Kredensial Staging**: Kredensial instance Supabase Staging telah terpasang di `.env.local`.
- **Unit Dummy Staging**: Terdapat unit proyektor pengujian dengan kode **`TEST-PROJ-001`** yang terakhir disimulasikan mengalami kendala fisik saat pengembalian dan berstatus **`MAINTENANCE`**. Status ini sengaja dibiarkan untuk memverifikasi bahwa Kiosk menolak peminjaman unit yang sedang dalam perawatan.
- **Foto Uji Staging**: Foto-foto simulasi wajah dan dokumen mahasiswa pengujian tersimpan aman di bucket privat `smartprojex-media`.

---

## 16. Pekerjaan Selanjutnya & Rencana Pengembangan

1. **Uji Coba Perangkat Keras Meja TU (Fase 0 PRD)**:
   - Menguji performa webcam laptop 720p+ di meja TU untuk memindai QR Pass di layar berbagai jenis HP mahasiswa (dengan variasi kecerahan dan pantulan cahaya) serta stiker QR fisik unit proyektor.
2. **Eksekusi Pengujian Integrasi Live Staging**:
   - Menjalankan 11 pengujian live database pada `tests/integration/staging-integration.test.ts` dengan memasukkan kredensial staging ke lingkungan pengujian.
3. **Penyelesaian Open Questions Kampus (Q-01 s.d. Q-07 PRD)**:
   - Konfirmasi kebijakan batas jam operasional TU aktual, prosedur penggantian ketua kelas darurat, dan penanganan akhir semester akademik.
4. **Persiapan Pilot Paralel**:
   - Menjalankan pilot paralel sistem PINJAM bersamaan dengan buku besar manual untuk mengukur metrik keberhasilan (target durasi transaksi $\le$ 15 detik).

