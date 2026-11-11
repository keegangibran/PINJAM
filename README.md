# PINJAM — Sistem Peminjaman Proyektor Pintar

Aplikasi web peminjaman proyektor kampus berbasis dual-scan (QR Pass Mahasiswa & QR Unit Proyektor), verifikasi tatap muka TU, pelacakan batas waktu pengembalian, dan dokumentasi foto transaksi berbasis PRD Revisi 3.

## Struktur Aturan & Alur Kerja Agen
- `AGENTS.md` — instruksi inti workspace, selalu aktif.
- `.agents/rules/prd-and-scope.md` — invariants scope PRD.
- `.agents/rules/supabase-security.md` — aturan keamanan database, RLS, storage privat, dan token QR.
- `.agents/rules/implementation-quality.md` — standar kualitas kode, pengujian, dan verifikasi.
- `.agents/workflows/phase-execution.md` — prosedur fase pengembangan bertahap.
- `PRD.md` — dokumen sumber kebenaran produk.

## Persyaratan Sistem
- Node.js 18+ / 20+
- Supabase CLI / Instance Supabase (PostgreSQL, Auth, Storage)

## Panduan Instalasi & Pengembangan
1. **Instal Dependensi**:
   ```bash
   npm install
   ```
2. **Konfigurasi Environment**:
   Salin berkas template lingkungan:
   ```bash
   cp .env.example .env.local
   ```
   Lengkapi variabel environment Supabase URL, Anon Key, Service Role Key, QR Token Secret, dan Cron Secret.
3. **Jalankan Pemeriksaan Kualitas**:
   ```bash
   npm run lint        # Verifikasi ESLint
   npm run typecheck   # Pemeriksaan tipe TypeScript strict
   npm run test        # Menjalankan test suite Vitest
   ```
4. **Jalankan Server Pengembangan**:
   ```bash
   npm run dev
   ```
   Akses antarmuka di `http://localhost:3000`.

Jangan tempatkan secrets atau data mahasiswa asli dalam paket, repo, prompt, atau fixture.
