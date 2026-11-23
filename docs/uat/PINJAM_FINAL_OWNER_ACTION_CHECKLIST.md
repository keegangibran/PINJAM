# PINJAM — Final Owner Action Checklist

**Project:** Sistem Peminjaman Proyektor Pintar (PINJAM)  
**Document Version:** 1.0.0 (Authoritative Checklist)  
**Date:** 2026-11-23  
**Status:** PRASYARAT MINIMUM SEBELUM CONTROLLED UAT (STAGE 24)  

---

## 1. Prinsip Minimalis & Keamanan

Seluruh pekerjaan teknis, penulisan kode, penambahan regression test, validasi basis data baseline, dan penyusunan runbook telah selesai 100% secara mandiri.

Daftar di bawah ini adalah **satu-satunya tindakan yang benar-benar membutuhkan Pemilik Sistem**. Tidak ada tugas hipotetis, tidak ada permintaan password, dan tidak ada pekerjaan yang tertunda di luar checklist ini.

---

## 2. Tiga (3) Tindakan Wajib Pemilik Sistem

```
┌───┐
│ 1 │  Penyediaan 1 Alamat Gmail Aktif (dengan fitur alias +)
└───┘
```
- **Tindakan yang Perlu Dilakukan:**  
  Berikan satu alamat email Gmail aktif yang dapat Anda akses kotak masuknya saat ini (misalnya: `namaanda@gmail.com`).
- **Mengapa Dibutuhkan:**  
  Supabase Auth pada lingkungan staging PINJAM terhubung ke penyedia SMTP nyata. Saat pendaftaran akun mahasiswa uji diajukan pada Langkah 2.3, Supabase Auth akan mengirimkan email konfirmasi nyata berisi tautan verifikasi. Dengan menggunakan satu akun Gmail, sistem dapat memanfaatkan fitur sub-addressing otomatis:
  - `namaanda+mhs1@gmail.com` $\rightarrow$ untuk Mahasiswa 1 (Calon Ketua Kelas)
  - `namaanda+mhs2@gmail.com` $\rightarrow$ untuk Mahasiswa 2 (Anggota & Target Transfer)
  - `namaanda+mhs3@gmail.com` $\rightarrow$ untuk Mahasiswa 3 (Pengujian Penolakan & Resubmission)  
  *Seluruh email konfirmasi akan masuk ke satu kotak masuk yang sama tanpa perlu membuat 3 email terpisah.*

---

```
┌───┐
│ 2 │  Konfirmasi Mode Pemindaian Kamera & Kesiapan Perangkat Keras
└───┘
```
- **Tindakan yang Perlu Dilakukan:**  
  Konfirmasikan mode pemindaian yang akan digunakan untuk pengujian Kiosk:
  - **Opsi A (Rekomendasi / Praktis):** Mengarahkan webcam laptop ke layar HP atau layar kedua yang menampilkan gambar QR Pass mahasiswa dan QR label unit proyektor.
  - **Opsi B (Fisik Meja TU):** Menggunakan unit fisik proyektor (`TEST-PROJ-003`) dan stiker label barcode QR yang telah dicetak di meja TU kampus.
- **Mengapa Dibutuhkan:**  
  Untuk memastikan pengujian fungsi kamera HTML5 QR scanner berjalan lancar sesuai ketersediaan perangkat keras di lokasi penguji.

---

```
┌───┐
│ 3 │  Otorisasi Tertulis untuk Memulai Controlled UAT Stage 24
└───┘
```
- **Tindakan yang Perlu Dilakukan:**  
  Kirimkan pernyataan persetujuan formal dalam bentuk pesan singkat (contoh: *"Saya menyetujui hasil Stage 23.6 dan mengotorisasi pelaksanaan Controlled UAT Stage 24"*).
- **Mengapa Dibutuhkan:**  
  Sesuai aturan tata kelola proyek `AGENTS.md`, agen AI dilarang melakukan mutasi data nyata terhadap lingkungan database staging tanpa otorisasi formal eksplisit dari pemilik.

---

## 3. Checklist Verifikasi Mandiri Pemilik

Sebelum memberikan otorisasi, Pemilik Sistem dapat memeriksa checklist mandiri berikut:
- [x] Repositori berada di branch `staging` dengan commit HEAD `5e470fdce4069c7067d5ee4c4247684e61ed7b85`.
- [x] Canonical Staging URL aktif: `https://pinjam-staging-git-staging-keegangibrans-projects.vercel.app`.
- [x] 550 unit tests lolos 100% dan production build Next.js sukses (41 halaman).
- [x] Seluruh 15 transaksi historis dan 140 audit logs terlindungi aman (zero mutations).
- [x] Matriks pengujian 37 skenario dan runbook langkah-demi-langkah tersedia lengkap di direktori artefak.
- [ ] Email Gmail penguji telah disiapkan.
- [ ] Otorisasi tertulis diberikan.
