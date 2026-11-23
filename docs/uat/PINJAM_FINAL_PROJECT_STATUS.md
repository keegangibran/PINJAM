# PINJAM — Final Project Status Report

**Project:** Sistem Peminjaman Proyektor Pintar (PINJAM)  
**Document Version:** 1.0.0 (Master Status)  
**Date:** 2026-11-23  
**Repository:** `keegangibran/PINJAM`  
**Primary Branch:** `staging`  
**Latest Known Commit:** `5e470fdce4069c7067d5ee4c4247684e61ed7b85`  
**Staging URL:** `https://pinjam-staging-git-staging-keegangibrans-projects.vercel.app`  

---

## 1. Executive Summary

Pengembangan Sistem Peminjaman Proyektor Pintar (PINJAM) telah mencapai penyelesaian penuh pada seluruh lapisan kode aplikasi, antarmuka pengguna, keamanan backend, dan penegakan aturan basis data sesuai spesifikasi **PRD Revisi 3**.

Seluruh masalah teknis lokal yang teridentifikasi selama audit mendalam (termasuk isolasi mahasiswa pada replay idempotency, pencegahan konflik aksi peminjaman vs pengembalian, perbaikan urutan dependensi aset proyektor UAT, serta penanganan konkurensi in-flight RPC) telah **berhasil diperbaiki secara tuntas** disertai penambahan pengujian regresi otomatis.

---

## 2. Status Implementasi 27 Fitur Utama Sistem

Evaluasi menyeluruh terhadap 27 modul fungsional:

| No | Modul / Fitur | Status Faktual | Keterangan & Bukti Kode |
| :---: | :--- | :---: | :--- |
| 1 | **Autentikasi Staf** | **IMPLEMENTED AND VERIFIED** | `/login`, guards `requireStaff()`, isolasi peran `STAFF` vs `ADMIN`. |
| 2 | **Registrasi Mahasiswa** | **IMPLEMENTED AND VERIFIED** | `/register`, form validasi lengkap, persetujuan foto eksplisit. |
| 3 | **Email Verification** | **IMPLEMENTED AND VERIFIED** | Supabase Auth email confirmation, redirect aman `/auth/callback`. |
| 4 | **Face Reference Capture** | **IMPLEMENTED AND VERIFIED** | `/register/photo`, live webcam only, no mirror effect, framing box guide. |
| 5 | **KTM/KTP Camera Capture** | **IMPLEMENTED AND VERIFIED** | Live webcam capture dokumen identitas, upload ke bucket privat. |
| 6 | **Admin Verification Inbox** | **IMPLEMENTED AND VERIFIED** | `/admin/verifications`, periksa 3 centang manual visual petugas. |
| 7 | **Approval, Rejection, Resubmission** | **IMPLEMENTED AND VERIFIED** | Alur keputusan lengkap, alasan penolakan wajib, instruksi resubmission. |
| 8 | **Class Leader Claims** | **IMPLEMENTED AND VERIFIED** | Antrean klaim ketua kelas, pencegahan klaim mahasiswa pending. |
| 9 | **Initial Leader Approval** | **IMPLEMENTED AND VERIFIED** | Persetujuan klaim pertama pada kelas kosong via visual inbox Admin. |
| 10 | **Replacement Claims** | **IMPLEMENTED AND VERIFIED** | Pengajuan klaim suksesi saat kelas berketua (tidak aktif otomatis). |
| 11 | **Leadership Transfer** | **IMPLEMENTED AND VERIFIED** | Serah terima jabatan instan antaranggota kelas aktif via `/my-qr`. |
| 12 | **QR Pass Generation** | **IMPLEMENTED AND VERIFIED** | JWT bertanda tangan HS256, tanpa NIM, auto-refresh 60 detik. |
| 13 | **QR Token Revocation** | **IMPLEMENTED AND VERIFIED** | Pencabutan mandiri (`qr_token_version + 1`) dan revokasi suksesi. |
| 14 | **Dynamic QR Expiration** | **IMPLEMENTED AND VERIFIED** | Countdown bar visual 60s, penolakan token kedaluwarsa di Kiosk. |
| 15 | **Kiosk Dual Scanning** | **IMPLEMENTED AND VERIFIED** | `/kiosk`, pemindaian berkesinambungan QR Mhs + QR Proyektor. |
| 16 | **Manual Lookup Fallback** | **IMPLEMENTED AND VERIFIED** | Pencarian manual ketua kelas saat kamera gagal, alasan wajib dicatat. |
| 17 | **Projector Inventory** | **IMPLEMENTED AND VERIFIED** | `/admin/projectors`, penambahan unit, kode unit terkunci (*immutable*). |
| 18 | **Projector Status Transitions** | **IMPLEMENTED AND VERIFIED** | Status logs, transisi manual Admin, transisi otomatis pelaporan kendala. |
| 19 | **Atomic Borrowing** | **IMPLEMENTED AND VERIFIED** | PL/pgSQL `process_loan_transaction`, row lock `FOR UPDATE`. |
| 20 | **Idempotency Multi-Layer** | **IMPLEMENTED AND VERIFIED** | Deduplikasi route handler, isolasi student/action, unique index DB. |
| 21 | **Return Lifecycle** | **IMPLEMENTED AND VERIFIED** | Smart Toggle return, penutupan transaksi `COMPLETED`, unit `AVAILABLE`. |
| 22 | **Representative Return** | **IMPLEMENTED AND VERIFIED** | Pengembalian oleh teman sekelas, nama perwakilan wajib dicatat. |
| 23 | **Maintenance Reporting** | **IMPLEMENTED AND VERIFIED** | Opsi laporkan kendala teknis saat pinjam/kembali, transisi `MAINTENANCE`. |
| 24 | **Semester Class Copy** | **IMPLEMENTED AND VERIFIED** | Fitur `copy-term` pada `/admin/classes`, reset ketua kelas otomatis. |
| 25 | **CSV Transaction Export** | **IMPLEMENTED AND VERIFIED** | Ekspor rekap transaksi dengan timestamp WIB (+07:00). |
| 26 | **Append-Only Audit Logs** | **IMPLEMENTED AND VERIFIED** | `/admin/audit-logs`, tanpa tombol edit/delete, modal viewer JSON. |
| 27 | **Admin Dashboard** | **IMPLEMENTED AND VERIFIED** | `/admin`, ringkasan inventaris, pinjaman aktif, antrean klaim. |

---

## 3. Rincian Perbaikan Teknis yang Dilakukan

1. **Perbaikan Keamanan Idempotensi & Isolasi Mahasiswa (`src/app/api/kiosk/transaction/route.ts`):**
   - Menambahkan validasi isolasi mahasiswa: jika `kiosk_session_id` disertakan pada replay request, server memvalidasi kecocokan `student_id` dengan transaksi asal. Jika tidak cocok, request ditolak dengan HTTP 409 `IDEMPOTENCY_CONFLICT`. Hal ini mencegah penyalahgunaan kunci untuk mengakses transaksi pengguna lain.
   - Menambahkan validasi konsistensi arah aksi: kunci yang pernah digunakan untuk peminjaman aktif ditolak jika dikirimkan pada alur pengembalian (HTTP 409 `IDEMPOTENCY_CONFLICT`).
2. **Penanganan Perlombaan Konkurensi & Pemetaan Error RPC:**
   - Menambahkan mekanisme *in-flight race recovery*: jika dua request simultan memicu pelanggaran `loans_idempotency_key_key` (PostgreSQL error 23505), server langsung melakukan kueri ulang dan mengembalikan respons `idempotent_replay: true` dengan HTTP 200 OK secara transparan.
   - Memetakan pesan pengecualian PL/pgSQL ke kode status HTTP yang tepat (misal: `PINJAMAN_AKTIF_SUDAH_ADA` menghasilkan HTTP 409 `ACTIVE_LOAN_EXISTS`).
3. **Penambahan Regression Tests Otomatis (`tests/unit/kiosk-transaction-api.test.ts`):**
   - Menambahkan 4 unit test regresi baru untuk menguji penolakan student mismatch, penolakan flow conflict, pemetaan status RPC, dan recovery konkurensi.
   - Total unit test pada file ini meningkat dari 11 menjadi 15 tests (seluruhnya passed).
4. **Koreksi Urutan Dependensi Aset Proyektor UAT:**
   - Memperbaiki konflik runbook antara `UAT-PRJ-03` dan `UAT-LOAN-05`: unit `TEST-PROJ-004` dipertahankan dalam status `AVAILABLE` agar pengujian penolakan batas 1 pinjaman aktif (`UAT-LOAN-05`) berjalan valid tanpa ditolak karena status maintenance. Transisi pemeliharaan manual `UAT-PRJ-03` dipindahkan tepat setelah `UAT-LOAN-05`.
5. **Strukturisasi Langkah Transisi Peminjaman UAT:**
   - Menggantikan instruksi informal "pinjam kilat" pada Fase 6 dengan langkah operasional terstruktur lengkap dengan aktor, input, expected result, dan dampak database (Langkah 6.2 dengan kunci K2 dan Langkah 6.4 dengan kunci K3).

---

## 4. Item yang Membutuhkan Pemilik Sistem (Kategori 3)

Tidak ada pekerjaan kode atau arsitektur yang tertunda. Item yang membutuhkan Pemilik Sistem sebelum pelaksanaan UAT interaktif:
1. Penyediaan 1 alamat Gmail utama dengan sub-addressing alias (`+mhs1`, `+mhs2`, `+mhs3`) untuk menerima link verifikasi email Supabase Auth.
2. Konfirmasi ketersediaan perangkat keras fisik (unit proyektor dan label stiker QR di meja TU kampus).
3. Otorisasi formal tertulis untuk memulai Controlled UAT Stage 24.
