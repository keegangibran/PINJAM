# PINJAM — Final Owner Action Checklist

**Project:** Sistem Peminjaman Proyektor Pintar (PINJAM)  
**Document Version:** 1.2.0 (Safety Aligned & Consistency Audited)  
**Date:** 2026-11-24  
**Status:** PRASYARAT MINIMUM SEBELUM CONTROLLED UAT (STAGE 24)  
**Deployment Verification Status:** `NOT VERIFIED / PENDING` (Menunggu bukti Vercel Dashboard)  
**Database Verification Status:** `HISTORICAL BASELINE (STAGE 23.6)` (Pemeriksaan read-only live wajib sebelum UAT)  

---

## 1. Prinsip Minimalis & Keamanan

Seluruh pekerjaan teknis, penulisan kode, penambahan regression test, hardening idempotensi, dan penyusunan runbook telah selesai 100% pada lingkungan lokal.

Daftar di bawah ini adalah **tindakan yang benar-benar membutuhkan keputusan dan verifikasi Pemilik Sistem**. Tidak ada tugas hipotetis, tidak ada permintaan password, dan tidak ada pekerjaan yang tertunda di luar checklist ini.

---

## 2. Empat (4) Tindakan Wajib Pemilik Sistem

```
┌───┐
│ 1 │  Verifikasi Deployment Vercel untuk Commit 58ec98d
└───┘
```
- **Tindakan yang Perlu Dilakukan:**  
  Buka Vercel Dashboard, periksa proyek staging PINJAM pada tab *Deployments*, pastikan deployment branch `staging` paling atas berstatus **Ready** pada commit `58ec98d`.
- **Mengapa Dibutuhkan:**  
  Respons `HTTP 200 OK` saja bukan bukti bahwa cloud menyajikan commit terbaru. Logika perbaikan idempotensi dan race recovery PG 23505 harus dipastikan telah terdeploy di cloud.

---

```
┌───┐
│ 2 │  Penyediaan 1 Alamat Gmail Aktif (dengan fitur sub-addressing +)
└───┘
```
- **Tindakan yang Perlu Dilakukan:**  
  Berikan satu alamat email Gmail aktif yang dapat Anda akses kotak masuknya saat ini (misalnya: `namaanda@gmail.com`).
- **Mengapa Dibutuhkan:**  
  Supabase Auth pada lingkungan staging PINJAM terhubung ke penyedia SMTP nyata. Saat pendaftaran akun mahasiswa uji diajukan pada Langkah 2.3, Supabase Auth akan mengirimkan email konfirmasi nyata berisi tautan verifikasi. Dengan menggunakan satu akun Gmail, sistem dapat memanfaatkan fitur sub-addressing otomatis:
  - `namaanda+mhs1@gmail.com` $\rightarrow$ untuk Mahasiswa 1 (Calon Ketua Kelas Awal)
  - `namaanda+mhs2@gmail.com` $\rightarrow$ untuk Mahasiswa 2 (Anggota & Target Transfer)
  - `namaanda+mhs3@gmail.com` $\rightarrow$ untuk Mahasiswa 3 (Pengujian Resubmission & Penolakan)  
  *Seluruh email konfirmasi akan masuk ke satu kotak masuk yang sama tanpa perlu membuat 3 email terpisah.*

---

```
┌───┐
│ 3 │  Persetujuan Semester UAT Terisolasi & Protokol Pembersihan
└───┘
```
- **Tindakan yang Perlu Dilakukan:**  
  Setujui penggunaan semester pengujian terisolasi penuh:
  - Semester Sumber: `2026/2027-UAT-GANJIL`
  - Semester Target: `2026/2027-UAT-GENAP`
  Serta setujui bahwa pembersihan pasca-UAT dilakukan secara non-destruktif berbasis status `INACTIVE` tanpa `SQL DELETE`.
- **Mengapa Dibutuhkan:**  
  Endpoint `copy-term` menyalin seluruh kelas aktif semester sumber secara massal. Menggunakan semester terisolasi melindungi seluruh kelas operasional kampus dari risiko duplikasi.

---

```
┌───┐
│ 4 │  Otorisasi Tertulis untuk Memulai Controlled UAT Stage 24
└───┘
```
- **Tindakan yang Perlu Dilakukan:**  
  Kirimkan pernyataan persetujuan formal dalam bentuk pesan singkat (contoh: *"Deployment 58ec98d Ready, email penguji disiapkan, semester isolasi disetujui, dan Controlled UAT Stage 24 diizinkan dimulai"*).
- **Mengapa Dibutuhkan:**  
  Sesuai aturan tata kelola proyek `AGENTS.md`, agen AI dilarang melakukan mutasi data nyata terhadap lingkungan database staging tanpa otorisasi formal eksplisit dari pemilik.

---

## 3. Checklist Verifikasi Mandiri Pemilik

Sebelum memberikan otorisasi, Pemilik Sistem dapat memeriksa checklist mandiri berikut:
- [x] Repositori berada di branch `staging` dengan commit HEAD `58ec98d3bd3a39b2b51fa655eb9bffc31a14ffe7` (terdorong ke `origin/staging`).
- [x] Canonical Staging URL aktif: `https://pinjam-staging-git-staging-keegangibrans-projects.vercel.app`.
- [x] 551 unit tests lolos 100% dan production build Next.js sukses (41 rute).
- [x] Catatan baseline historis Stage 23.6 (15 transaksi, 140 audit logs) terlindungi; status live akan diperiksa read-only sebelum UAT.
- [x] Matriks pengujian 37 skenario dan runbook langkah-demi-langkah menggunakan semester terisolasi `2026/2027-UAT-GANJIL` $\rightarrow$ `2026/2027-UAT-GENAP`.
- [ ] Deployment Vercel SHA `58ec98d` telah dikonfirmasi Ready di Vercel Dashboard.
- [ ] Email Gmail penguji telah disiapkan.
- [ ] Persetujuan semester UAT terisolasi dan protokol cleanup diberikan.
- [ ] Perangkat laptop Kiosk dan webcam telah disiapkan.
- [ ] Otorisasi tertulis formal diberikan.
