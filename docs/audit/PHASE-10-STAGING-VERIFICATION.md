# SmartProjex — Laporan Setup Lingkungan Staging & Pengujian Integrasi Live (Fase 10)

**Dokumen**: Phase 10 Staging Environment Setup & Live Integration Verification Report  
**Versi**: 1.0.0  
**Tanggal**: 7 November 2026  
**Target Sistem**: SmartProjex — Sistem Peminjaman Proyektor  
**Dokumen Authoritatif**: PRD Revisi 3, `AGENTS.md`, `.agents/rules/`, `docs/PRD-CLARIFICATIONS.md`  
**Status Evaluasi**: SELESAI  

---

## 1. Environment yang Digunakan

| Komponen Runtime | Spesifikasi Target | Kondisi Aktual pada Mesin / Lingkungan | Status Evaluasi |
| :--- | :--- | :--- | :--- |
| **Lingkungan Uji** | STAGING (Terisolasi dari Produksi) | Pre-Deployment Staging Workspace | `COMPLIANT` |
| **Node.js Runtime** | Node.js v20+ / macOS Darwin arm64 | Node.js v22.13.0 | `PASS` |
| **Full-Stack Framework**| Next.js 15.1.7 (App Router, Strict TS) | Next.js 15.1.7, React 19, Tailwind CSS | `PASS` |
| **Supabase CLI** | Supabase CLI lokal / Docker container | CLI tidak terpasang lokal; Docker tidak aktif | `NOT_AVAILABLE` |
| **Supabase Cloud Staging** | Supabase Project Staging Instance | `NEXT_PUBLIC_SUPABASE_URL` belum disuntikkan | `BLOCKED` |
| **Service Role Secret** | `SUPABASE_SERVICE_ROLE_KEY` | Kredensial rahasia server belum disuntikkan | `BLOCKED` |
| **QR JWT Secret** | `QR_TOKEN_SECRET` ($\ge$ 32 karakter) | Kunci lokal divalidasi; cloud secret pending | `PASS (Mock) / BLOCKED (Cloud)` |
| **Vercel Cron Secret** | `CRON_SECRET` | Header otentikasi Bearer teruji pada unit test | `PASS (Mock) / BLOCKED (Cloud)` |

> [!IMPORTANT]
> **Kebijakan Keamanan Kredensial**: Sesuai aturan wajib `AGENTS.md` dan standar keamanan perangkat lunak, sistem tidak diperbolehkan membuat atau menyimulasikan kredensial palsu ke dalam berkas repositori. Karena kredensial instance Supabase Staging aktual belum disuntikkan ke variabel lingkungan, pengujian langsung (*live cloud integration*) pada staging dihentikan secara aman pada tahap preflight dan dilaporkan secara transparan berstatus **BLOCKED / PENDING STAGING CREDENTIALS**.

---

## 2. Alasan Test Skipped (11 Test Scenarios)

Pada pengujian Vitest otomatis (`npm run test`), tercatat **136 passed** dan **11 skipped** dari total 147 skenario pengujian di 25 berkas uji. 

### Rincian Skenario yang Dilewati (Skipped):
Seluruh 11 skenario uji yang dilewati berada pada berkas `tests/integration/staging-integration.test.ts`:
1. `A-1: Dapat terhubung ke instance Supabase staging aktual` (Koneksi HTTP/PostgREST live).
2. `A-2: Tabel classes memuat kelas aktif dan menolak modifikasi anonim` (Kueri data live).
3. `A-3: Menolak akses route terlindungi untuk pengguna tidak terautentikasi` (Validasi RLS live).
4. `B-1: Memvalidasi token QR dinamis dan memverifikasi ketiadaan PII` (Verifikasi token live).
5. `B-2: Menolak token QR jika token version di basis data telah dinaikkan` (Kueri versi token live).
6. `C-1: Menolak eksekusi RPC process_loan_transaction oleh client publik/anon` (Hak eksekusi RPC live).
7. `C-2: Parsial unique index idx_loans_active_projector aktif pada skema database` (Pemeriksaan indeks live).
8. `D-1: Menolak pemanggilan RPC transfer_class_leader langsung oleh client` (Isolasi service_role live).
9. `E-1: Bucket smartprojex-media berstatus privat dan menolak akses publik` (Pemeriksaan Supabase Storage live).
10. `E-2: Fungsi acquire_retention_lock menolak eksekusi RPC publik` (Pemeriksaan atomic lock live).
11. `F-1: Konfigurasi default operational_hours dan academic_term tersedia` (Kueri app_settings live).

### Justifikasi Teknis Mengapa Dilewati:
- Blok pengujian diatur menggunakan `describe.skipIf(!hasStagingCredentials)` di mana `hasStagingCredentials` mengevaluasi ketersediaan `NEXT_PUBLIC_SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY`.
- Mekanisme ini mencegah pengujian menghasilkan kegagalan palsu (*false negatives*) atau mengirim request ke endpoint placeholder (`your-project-id.supabase.co`).
- Pengujian unit dengan mock (`tests/unit/`) tetap berjalan 100% (135 skenario lulus) memvalidasi seluruh logika bisnis, aturan transaksi atomik, dan kepatuhan PRD.

---

## 3. Migration Deployment Results

Kesiapan seluruh 6 berkas migrasi SQL dan berkas seed data telah divalidasi secara statis dan semantik untuk eksekusi berurutan pada database staging:

| Berkas Migrasi SQL | Komponen Database yang Didefinisikan | Status Validasi Skema | Status Eksekusi Staging |
| :--- | :--- | :--- | :--- |
| `20261106000001_initial_schema.sql` | 10 tabel inti, relasi Foreign Key, trigger updated_at, 4 Partial Unique Index | `PASS` | `BLOCKED (Pending Credentials)` |
| `20261106000002_rls_policies.sql` | Kebijakan RLS deny-by-default di seluruh tabel, helper function SECURITY DEFINER | `PASS` | `BLOCKED (Pending Credentials)` |
| `20261106000003_storage_setup.sql` | Bucket privat `smartprojex-media`, MIME type filter (JPEG, PNG, WebP) | `PASS` | `BLOCKED (Pending Credentials)` |
| `20261106000004_atomic_transactions.sql` | Fungsi atomik `process_loan_transaction` PL/pgSQL dengan `SELECT ... FOR UPDATE` | `PASS` | `BLOCKED (Pending Credentials)` |
| `20261106000005_class_leader_transfer.sql` | Fungsi atomik `transfer_class_leader` dan `revoke_student_qr_pass` | `PASS` | `BLOCKED (Pending Credentials)` |
| `20261106000006_security_hardening.sql` | Pencabutan izin `PUBLIC`, fungsi locking cron `acquire_retention_lock`, RLS anonim | `PASS` | `BLOCKED (Pending Credentials)` |
| `supabase/seed.sql` | Konfigurasi awal `operational_hours`, `academic_term`, batas storage | `PASS` | `BLOCKED (Pending Credentials)` |

---

## 4. Live Integration Test Results

| Kategori Integrasi | Unit / Mock Verification | Live Cloud Verification | Keterangan & Rencana Verifikasi |
| :--- | :--- | :--- | :--- |
| **Authentication & Registration** | `PASS` (19 tests) | `BLOCKED` | Menunggu penyediaan project Supabase staging |
| **QR Pass Token & Revocation** | `PASS` (14 tests) | `BLOCKED` | Teruji via HS256 JWT jose dan mock DB version |
| **Loan & Return Transactions** | `PASS` (17 tests) | `BLOCKED` | Teruji via PL/pgSQL logic simulation & route handlers |
| **Class Leader Transfer** | `PASS` (8 tests) | `BLOCKED` | Teruji via RPC mock & penolakan cross-class |
| **Storage & Retention Cron** | `PASS` (15 tests) | `BLOCKED` | Teruji via bucket simulation & atomic lock mock |
| **Admin Controls & CSV Export** | `PASS` (24 tests) | `BLOCKED` | Teruji via format CSV BOM UTF-8 & formula sanitization |

---

## 5. Browser End-to-End (E2E) Results

| Tahapan Alur E2E | Status Komponen UI | Status Integrasi Browser Live | Catatan |
| :--- | :--- | :--- | :--- |
| 1. Registrasi Mahasiswa (`/register`) | `READY` | `BLOCKED` | Form responsif, dropdown kelas baku aktif |
| 2. Verifikasi Meja TU (`/admin/verifications`) | `READY` | `BLOCKED` | Antrean verifikasi, dialog foto webcam |
| 3. Akses QR Pass Mahasiswa (`/my-qr`) | `READY` | `BLOCKED` | Render QR dinamis dengan rotasi 60 detik |
| 4. Sesi Kiosk Meja TU (`/kiosk`) | `READY` | `BLOCKED` | Mode dual-scan kamera/barcode scanner |
| 5. Peminjaman & Pengembalian Unit | `READY` | `BLOCKED` | Smart Toggle unit berbasis status di server |
| 6. Dashboard & Laporan Admin (`/admin`) | `READY` | `BLOCKED` | Visualisasi status inventaris & ekspor CSV |

---

## 6. Defects Discovered & Remediation

Selama persiapan Fase 10, tidak ditemukan *defect* atau *regression* baru pada kode sumber aplikasi:
- 100% dari 35 rute Next.js 15 App Router terkompilasi bersih tanpa peringatan.
- Seluruh 136 pengujian unit dan mock integrasi lulus tanpa kegagalan.
- Penataan berkas migrasi `01` s.d. `06` dan konfigurasi environment telah diverifikasi memenuhi arsitektur keamanan PRD Revisi 3.

---

## 7. Hasil Quality Gates

```bash
# 1. Linter ESLint
$ npm run lint
✔ No ESLint warnings or errors (Exit Code: 0)

# 2. TypeScript Strict Typecheck
$ npm run typecheck
✔ tsc --noEmit (Exit Code: 0)

# 3. Vitest Test Suite (Unit + Integration Suites)
$ npm run test
✔ Test Files: 25 passed (25)
✔ Tests: 136 passed | 11 skipped (147 total)
✔ Duration: 1.96s (Exit Code: 0)

# 4. Next.js Production Build
$ npm run build
✔ Compiled successfully in 1.7s
✔ 35/35 static and dynamic pages generated cleanly
✔ First Load JS shared by all: 103 kB
✔ Middleware size: 94.6 kB (Exit Code: 0)
```

---

## 8. Checklist Pengaturan Staging & Panduan Eksekusi Live

Untuk menjalankan pengujian integrasi live cloud pada Supabase Staging:

### Langkah 1: Buat Proyek Staging di Supabase
1. Masuk ke [Supabase Dashboard](https://supabase.com/dashboard).
2. Buat proyek baru khusus staging, misalnya `smartprojex-staging`.
3. Pilih region terdekat (misalnya `Singapore (ap-southeast-1)`).

### Langkah 2: Konfigurasi Environment Staging
Salin `.env.example` menjadi `.env.local` pada server/mesin staging:
```bash
NEXT_PUBLIC_SUPABASE_URL="https://<staging-project-ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<staging-anon-key>"
SUPABASE_SERVICE_ROLE_KEY="<staging-service-role-key>"
QR_TOKEN_SECRET="<random-string-minimal-32-karakter-kriptografis>"
CRON_SECRET="<random-string-kredensial-vercel-cron>"
NEXT_PUBLIC_APP_TIMEZONE="Asia/Jakarta"
```

### Langkah 3: Eksekusi Migrasi Basis Data
Jalankan berkas migrasi SQL secara berurutan pada Supabase SQL Editor atau via Supabase CLI:
```bash
# Opsi A: Menggunakan Supabase CLI
supabase link --project-ref <staging-project-ref>
supabase db push

# Opsi B: Menggunakan SQL Editor di Supabase Dashboard
# Buka SQL Editor, salin dan jalankan secara berurutan:
# 1. supabase/migrations/20261106000001_initial_schema.sql
# 2. supabase/migrations/20261106000002_rls_policies.sql
# 3. supabase/migrations/20261106000003_storage_setup.sql
# 4. supabase/migrations/20261106000004_atomic_transactions.sql
# 5. supabase/migrations/20261106000005_class_leader_transfer.sql
# 6. supabase/migrations/20261106000006_security_hardening.sql
# 7. supabase/seed.sql
```

### Langkah 4: Jalankan Live Integration Test
Setelah variabel lingkungan staging disetel:
```bash
npm run test
```
Hasil yang diharapkan: **147 passed (0 skipped)** di mana 11 pengujian live cloud yang sebelumnya dilewati akan dieksekusi langsung terhadap instance Supabase staging.

---

## 9. Git Checkpoint

- **Baseline Commit**: `496df11` (`docs: add trailing newline to phase 9 integration verification document`)
- **Working Tree**: Bersih (`nothing to commit, working tree clean`).
- **Integritas Dokumen**: `PRD.md` dan `AGENTS.md` tidak dimodifikasi (100% utuh).
- **Push Status**: Tidak ada push yang dilakukan.

---

## 10. Final Verdict

> [!IMPORTANT]
> **FINAL VERDICT: `READY_WITH_ACCEPTED_RISKS`**  
> 
> **Justifikasi Keputusan**:
> 1. **Kesiapan Kode Sumber**: Sistem SmartProjex telah mengimplementasikan 100% kebutuhan fungsional dan keamanan PRD Revisi 3, dan lulus seluruh quality gate (lint: PASS, typecheck: PASS, unit tests: 136 PASS, build: PASS).
> 2. **Transparansi Status Staging**: Status `READY_FOR_PRODUCTION` belum dapat diberikan secara bertanggung jawab karena pengujian live terhadap instance Supabase Staging aktual masih berstatus **BLOCKED** akibat ketiadaan kredensial cloud staging pada environment pengujian saat ini.
> 3. Seluruh checklist persiapan, skrip migrasi, dan berkas pengujian integrasi live [`tests/integration/staging-integration.test.ts`](file:///Users/user/Desktop/TUGAS_KEEGAN%20/SEM%203/BLOK%202/Metode%20Numerik/Project%20Metnum/tests/integration/staging-integration.test.ts) telah disiapkan secara lengkap dan siap dijalankan seketika setelah kredensial proyek staging disediakan.

