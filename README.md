# PINJAM — Sistem Peminjaman Proyektor Pintar

Aplikasi web peminjaman proyektor kampus berbasis dual-scan (QR Pass Mahasiswa & QR Unit Proyektor), registrasi mandiri kamera dengan panduan deteksi wajah, verifikasi admin, pelacakan batas waktu pengembalian, dan dokumentasi foto transaksi berbasis PRD Revisi 3.

## Struktur Aturan & Alur Kerja Agen
- `AGENTS.md` — instruksi inti workspace, selalu aktif.
- `.agents/rules/prd-and-scope.md` — invariants scope PRD.
- `.agents/rules/supabase-security.md` — aturan keamanan database, RLS, storage privat, dan token QR.
- `.agents/rules/implementation-quality.md` — standar kualitas kode, pengujian, dan verifikasi.
- `.agents/workflows/phase-execution.md` — prosedur fase pengembangan bertahap.
- `PRD.md` — dokumen sumber kebenaran produk.

## Persyaratan Sistem
- Node.js 18+ / 20+
- Supabase Instance (PostgreSQL, Auth, Storage)

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
   npm run build       # Memverifikasi build produksi Next.js
   ```
4. **Jalankan Server Pengembangan**:
   ```bash
   npm run dev
   ```
   Akses antarmuka di `http://localhost:3000`.

---

## Panduan Penting Pengujian & Operasional

### 1. Pengujian Multi-Peran (Admin & Mahasiswa Secara Bersamaan)
- **Perilaku Sesi Browser**: Sesuai standar web dan Supabase SSR, seluruh tab di dalam **profil peramban yang sama** pada origin yang sama (`http://localhost:3000`) berbagi cookie sesi autentikasi.
- **Cara Pengujian Bersamaan**:
  - Gunakan dua profil browser berbeda, misalnya:
    - **Chrome Profile 1** (atau Jendela Normal): Masuk sebagai Administrator / Petugas TU.
    - **Chrome Profile 2** (atau Mode Samaran / Browser Lain seperti Firefox/Edge): Masuk sebagai Mahasiswa / Pendaftar.
  - Otorisasi rute diamankan secara mutlak di sisi server melalui Server Layout Guards (`/admin/layout.tsx`, `/kiosk/layout.tsx`, `/(student)/layout.tsx`) dan route handlers.

### 2. Registrasi Mandiri & Verifikasi Kamera
- Mahasiswa mengambil foto wajah referensi dan foto fisik kartu identitas (KTM/KTP) secara mandiri langsung menggunakan kamera perangkat.
- **Deteksi Wajah (Face Detection)**: Digunakan semata-mata sebagai panduan visual *framing* posisi (tengah) dan jarak (proporsional), tanpa pengenalan wajah biometrik otomatis (*facial recognition*) atau inferensi identitas.
- **Tanpa Efek Mirror**: Seluruh pratinjau kamera depan/belakang, kanvas, dan hasil tangkapan ditampilkan secara normal tanpa refleksi horizontal (`scaleX(-1)` dilarang keras).
- **Kebijakan Penyimpanan & Retensi**:
  - Foto kartu identitas disimpan sementara di storage privat dan **dihapus secara permanen** segera setelah keputusan admin (Approve, Reject, maupun Request Resubmission).
  - Foto wajah referensi disimpan selama akun aktif sebagai pembanding visual manual di loket TU/Kiosk.

### 3. Operasional Kiosk pada Tab Terpisah & Monitor Kedua
- Tombol **Buka Kiosk** pada Dashboard Admin membuka Kiosk pada **tab browser baru** (`target="_blank"`, `rel="noopener noreferrer"`). Dashboard admin tetap terbuka di tab sebelumnya.
- Operator dapat menarik tab Kiosk ke **monitor kedua** melalui sistem operasi.
- Antarmuka Kiosk beroperasi mandiri tanpa navigasi atau sidebar admin, dan dilengkapi tombol **Layar Penuh (Fullscreen API)** untuk tampilan loket yang bersih dan fokus.

Jangan tempatkan secrets atau data mahasiswa asli dalam paket, repo, prompt, atau fixture.
