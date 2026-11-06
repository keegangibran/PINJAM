# SmartProjex — Storage Rules & Retention Specifications

Dokumen ini mendefinisikan aturan penyimpanan objek media privat, pembatasan prefix, kompresi klien, dan masa retensi berdasarkan PRD Revisi 3 Bagian 7.1, NFR-02, NFR-05, NFR-07, dan NFR-08.

---

## 1. Identifikasi Bucket
- **Nama Bucket**: `smartprojex-media`
- **Sifat Akses**: Privat murni (`public = false`). Dilarang keras mengaktifkan akses publik.
- **Batas Ukuran Berkas Maksimal**: 2.097.152 bytes (2 MB).
- **Target Kompresi Sisi Klien**: ≤ 250 KB per berkas (`NFR-02`).
- **MIME Types yang Diizinkan**:
  - `image/jpeg` (`.jpg`, `.jpeg`)
  - `image/png` (`.png`)
  - `image/webp` (`.webp`)

---

## 2. Struktur Ruang Prefix & Kepemilikan

```text
smartprojex-media/
├── faces/       # Foto wajah referensi saat registrasi tatap muka
├── documents/   # Foto dokumen KTM atau KTP saat registrasi tatap muka (sementara)
└── loans/       # Foto dokumentasi saat peminjaman dan pengembalian unit proyektor
```

### A. Prefix `faces/`
- **Kegunaan**: Menyimpan foto wajah referensi mahasiswa yang diambil langsung oleh kamera perangkat petugas pada sesi verifikasi tatap muka (`FR-01A`).
- **Penamaan Objek**: `faces/{student_id}_{timestamp}.jpg`
- **Akses**: Hanya petugas TU/Admin berwenang untuk pembanding visual manual. Dilarang digunakan untuk pencocokan biometrik otomatis (`NFR-05`).
- **Masa Retensi**: Disimpan selama akun mahasiswa berstatus `ACTIVE`. Dihapus otomatis **90 hari** setelah akun mahasiswa berstatus `INACTIVE` (`NFR-08`).

### B. Prefix `documents/`
- **Kegunaan**: Menyimpan foto KTM atau KTP mahasiswa untuk dicocokkan secara manual oleh petugas (`FR-01A`, `FR-01B`).
- **Penamaan Objek**: `documents/{student_id}_{timestamp}.jpg`
- **Akses**: Hanya petugas TU yang memproses antrean verifikasi.
- **Masa Retensi**: **Dihapus segera** setelah keputusan verifikasi dibuat (`APPROVE`, `REJECT`, `REQUEST_RESUBMISSION`). Batas sapuan jaring pengaman maksimal 24 jam via tugas harian (`NFR-08`). Sistem dilarang menyimpan NIK atau teks hasil OCR.

### C. Prefix `loans/`
- **Kegunaan**: Menyimpan foto dokumentasi peminjaman (wajah peminjam bersama unit proyektor) dan foto dokumentasi pengembalian fisik unit proyektor (`FR-04`, `FR-07`).
- **Penamaan Objek**:
  - Pinjam: `loans/borrow_{loan_id}_{timestamp}.jpg`
  - Kembali: `loans/return_{loan_id}_{timestamp}.jpg`
- **Akses**: Petugas TU dan Admin untuk penelusuran buku besar dan bukti jika ada kerusakan/kendala.
- **Masa Retensi**: Dihapus **180 hari** setelah transaksi selesai (`status = 'COMPLETED'`), **kecuali** transaksi tersebut memiliki laporan kendala yang belum diselesaikan (`issue_resolved_at IS NULL`).

---

## 3. Ketentuan Akses & Signed URL (`NFR-07`)

1. Basis data PostgreSQL hanya menyimpan **object path** (contoh: `loans/borrow_123.jpg`), bukan URL publik maupun base64.
2. Setiap kali petugas/admin membuka foto di antarmuka buku besar digital atau antrean verifikasi, aplikasi memanggil endpoint `POST /api/admin/photos/sign`.
3. Server memverifikasi otorisasi petugas, mencatat entri `PHOTO_SIGNED_URL` ke tabel `audit_logs`, lalu menerbitkan **Signed URL dengan masa berlaku maksimal 60 detik**.
4. URL kedaluwarsa setelah 60 detik sehingga tautan tidak dapat dibagikan keluar sesi.
