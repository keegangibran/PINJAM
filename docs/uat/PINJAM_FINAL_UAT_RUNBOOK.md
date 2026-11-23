# PINJAM — Master UAT Operational Runbook (Authoritative Guide)

**Project:** Sistem Peminjaman Proyektor Pintar (PINJAM)  
**Document Version:** 2.1.0 (Master Authoritative Runbook — Corrected)  
**Date:** 2026-11-23  
**Target Environment:** Staging Canonical (`https://pinjam-staging-git-staging-keegangibrans-projects.vercel.app`)  
**Commit Reference:** `5e470fdce4069c7067d5ee4c4247684e61ed7b85` (Plus Unstaged Idempotency & Concurrency Hardening)  
**Total Skenario UAT:** **Tepat 37 Skenario Definitif**  

---

## 1. Tata Kelola & Persiapan Akun Pengujian

### A. Aturan Isolasi Sesi (NFR-03)
- **Profil Browser 1 (Staf & Admin TU):** Jendela browser utama. Digunakan untuk login akun staf resmi, mengakses rute `/admin`, dan membuka Kiosk `/kiosk` pada tab terpisah.
- **Profil Browser 2 (Mahasiswa Uji):** Jendela browser profil berbeda (atau jendela Incognito/Private terpisah). Digunakan untuk pendaftaran mahasiswa, unggah berkas, dan membuka `/my-qr`.

### B. Spesifikasi 5 Akun Pengujian
| Akun Pengujian | Identitas / Peran | Alamat Email / Alias | Kebutuhan & Peran dalam Pengujian |
| :--- | :--- | :--- | :--- |
| **Admin Resmi** | Staf Admin TU | Akun terdaftar di database staging | Login utama (`UAT-AUTH-01`), verifikasi berkas, persetujuan klaim, salin semester, audit log viewer. |
| **Staf Sekunder** | Staf Loket TU | `[EMAIL_STAF_SEKUNDER]@unimed.ac.id` | Pengujian penguncian akun seketika saat dinonaktifkan Admin (`UAT-AUTH-02`). |
| **Mahasiswa 1** | Calon Ketua Kelas Awal | `[EMAIL_UTAMA]+mhs1@gmail.com` | Registrasi (`UAT-REG-01..04`), approval verifikasi (`UAT-VER-01`), initial claim (`UAT-CLM-01`), transfer kepemimpinan (`UAT-CLM-05`). |
| **Mahasiswa 2** | Anggota / Target Suksesi | `[EMAIL_UTAMA]+mhs2@gmail.com` | Pendaftaran kelas yang sama, replacement claim (`UAT-CLM-02`), penerima transfer, peminjam aktif Kiosk (`UAT-LOAN-01..06`, `UAT-RTN-01..03`). |
| **Mahasiswa 3** | Akun Kasus Negatif | `[EMAIL_UTAMA]+mhs3@gmail.com` | Pengujian foto buram resubmission (`UAT-VER-03`) dan penolakan admin wajib alasan (`UAT-VER-02`). |

### C. Prosedur Persiapan 5 Akun Pengujian Secara Lengkap

#### 1. Akun Admin Resmi Kampus
- **Peran:** `ADMIN` (aktif).
- **Kredensial:** Menggunakan akun staf admin yang telah terdaftar di database staging (`staff_profiles.role = 'ADMIN'`).
- **Verifikasi Kesiapan:** Login di `/login` untuk memastikan sesi admin terbuka dan dashboard `/admin` menampilkan menu lengkap (Classes, Projectors, Staff, Verifications, Audit Logs).

#### 2. Akun Staf Sekunder
- **Peran:** `STAFF` (aktif pada awal pengujian).
- **Prosedur Pembuatan / Verifikasi:**
  1. Login ke `/admin/staff` menggunakan akun Admin Resmi.
  2. Klik tombol "Tambah Petugas".
  3. Masukkan Nama: `[NAMA_STAF_SEKUNDER]`, Email: `[EMAIL_STAF_SEKUNDER]@unimed.ac.id` (atau alias email penguji yang disepakati), Password Awal: `[PASSWORD_STAF_SEKUNDER]`, Peran: `STAFF`.
  4. Simpan akun dan pastikan status pada tabel staf berlabel "Aktif".
  5. Akun ini siap digunakan untuk skenario pengujian penguncian akses instan pada `UAT-AUTH-02`.

#### 3. Akun Mahasiswa 1 (Calon Ketua Kelas Awal)
- **Identitas Uji:** Nama: `[NAMA_PENGUJI_1]`, NIM: `[NIM_PENGUJI_1]`, Email: `[EMAIL_UTAMA]+mhs1@gmail.com`, Password: `[PASSWORD_PENGUJI_1]`.
- **Target Kelas:** `Kelas Uji A` (Prodi Ilmu Komputer, Angkatan 2025, Rombel C, Semester 2026/2027-GANJIL).
- **Aset Fisik / Input:** Webcam perangkat untuk tangkapan wajah hidup dan kartu identitas fisik (KTM atau KTP).
- **Prosedur Lengkap:** Dijalankan secara bertahap pada Skenario `UAT-REG-01` s/d `UAT-REG-04`, lalu diverifikasi dan disetujui Admin pada `UAT-VER-01`.

#### 4. Akun Mahasiswa 2 (Anggota Kelas & Target Suksesi)
- **Identitas Uji:** Nama: `[NAMA_PENGUJI_2]`, NIM: `[NIM_PENGUJI_2]`, Email: `[EMAIL_UTAMA]+mhs2@gmail.com`, Password: `[PASSWORD_PENGUJI_2]`.
- **Target Kelas:** `Kelas Uji A` (sama persis dengan kelas Mahasiswa 1).
- **Prosedur Lengkap:**
  1. Pada Profil Browser 2, akses `/register`.
  2. Isi formulir dengan data Mahasiswa 2, pilih `Kelas Uji A`, centang persetujuan foto, dan submit.
  3. Buka kotak masuk email konfirmasi alias `+mhs2`, klik tautan aktivasi email.
  4. Ambil foto wajah live framing box dan foto dokumen identitas fisik via webcam, lalu kirim berkas.
  5. Admin membuka `/admin/verifications`, periksa 3 checklist manual, dan klik "Setujui Pendaftaran".
  6. Mahasiswa 2 kini berstatus `ACTIVE` sebagai anggota biasa di `Kelas Uji A`, siap mengajukan `UAT-CLM-02` (replacement claim) dan menerima transfer jabatan di `UAT-CLM-05`.

#### 5. Akun Mahasiswa 3 (Akun Kasus Negatif)
- **Identitas Uji:** Nama: `[NAMA_PENGUJI_3]`, NIM: `[NIM_PENGUJI_3]`, Email: `[EMAIL_UTAMA]+mhs3@gmail.com`, Password: `[PASSWORD_PENGUJI_3]`.
- **Target Kelas:** `Kelas Uji A`.
- **Prosedur Lengkap:**
  1. Pada Profil Browser 2, akses `/register`, daftarkan Mahasiswa 3 pada `Kelas Uji A`, centang persetujuan foto, submit.
  2. Buka kotak masuk email konfirmasi alias `+mhs3`, klik tautan aktivasi.
  3. Ambil foto wajah live.
  4. Pada langkah foto dokumen identitas, hadapkan dokumen dengan posisi tidak fokus / sengaja digerakkan agar citra buram (*blurry*). Kirim berkas pendaftaran.
  5. Akun berstatus `PENDING_REVIEW` dan siap digunakan untuk pengujian permintaan unggah ulang (`UAT-VER-03`) serta penolakan final dengan alasan wajib (`UAT-VER-02`).

---

## 2. Struktur 9 Fase Pengujian UAT

```
Fase 1: Pre-UAT Environmental Check & Master Class Setup (0 Skenario — Prosedur Persiapan)
Fase 2: Staff Authentication & Student Registration (6 Skenario: UAT-AUTH-01..02, UAT-REG-01..04)
Fase 3: Student Verification & Leadership Succession (9 Skenario: UAT-VER-01..03, UAT-CLM-01..06)
Fase 4: Projector Inventory & Availability State Machine (4 Skenario: UAT-PRJ-01, 02, 04, 05)
Fase 5: Borrowing Lifecycle & Idempotency Testing (6 Skenario: UAT-LOAN-01, 03, 04, 06, 05, UAT-PRJ-03)
Fase 6: Return Lifecycle & Reporting (4 Skenario: UAT-RTN-01..04)
Fase 7: Administrative Reporting & Semester Roll (3 Skenario: UAT-ADM-01, UAT-CLM-07, UAT-ADM-02)
Fase 8: Security Hardening & Edge Cases (4 Skenario: UAT-LOAN-02, UAT-LOAN-07, UAT-QR-01, UAT-ADM-04)
Fase 9: Final Acceptance, Audit Trail Sign-off & Safe Cleanup (1 Skenario: UAT-ADM-03 + Protokol Cleanup)
---------------------------------------------------------------------------------------------------------
TOTAL SKENARIO UAT: TEPAT 37 SKENARIO DEFINITIF (TIDAK ADA DUPLIKASI)
```

---

## 3. Langkah Pelaksanaan Rinci

### FASE 1: PRE-UAT SETUP (Prosedur Persiapan Lingkungan)
*(Bukan Skenario UAT)*

- **Langkah 1.1 — Pembuatan Master Kelas Uji (`Kelas Uji A`):**
  1. Login ke `/admin/classes` menggunakan akun Admin resmi.
  2. Klik tombol "Tambah Kelas".
  3. Masukkan data: Program Studi `Ilmu Komputer`, Angkatan `2025`, Rombel `C`, Semester `2026/2027-GANJIL`.
  4. Simpan kelas. Verifikasi bahwa `Kelas Uji A` terdaftar dengan `leader_student_id = null`.
  *Tujuan:* Mengisolasi seluruh pengujian Mahasiswa 1 dan Mahasiswa 2 pada satu kelas bersama tanpa menyentuh kelas historis.

---

### FASE 2: STAFF AUTHENTICATION & STUDENT REGISTRATION (6 Skenario)

#### Langkah 2.1 — UAT-AUTH-01: Admin Authentication via Web UI (/login)
- **Precondition:** Akun staf admin resmi terdaftar di database staging dan berstatus aktif.
- **Aktor:** Staf TU / Admin
- **Langkah:**
  1. Pada Profil Browser 1, akses URL `/login`.
  2. Masukkan email dan password staf resmi.
  3. Klik tombol "Masuk".
- **Expected Result:** Login berhasil, cookie sesi Supabase Auth terbentuk, diarahkan ke dashboard `/admin`. Nama dan peran staf tampil pada header dashboard.
- **Evidence:** Screenshot dashboard `/admin` dengan badge nama dan peran staf.

#### Langkah 2.2 — UAT-AUTH-02: Staff Account Lifecycle & Deactivation Lock (NFR-03)
- **Precondition:** Akun staf sekunder terdaftar dan aktif (dari Persiapan Bagian 1.C).
- **Aktor:** Admin & Staf Sekunder
- **Langkah:**
  1. Pada Profil Browser 1 di `/admin/staff`, ubah status akun staf sekunder menjadi "Nonaktif".
  2. Buka jendela incognito baru, coba login menggunakan akun staf sekunder tersebut.
- **Expected Result:** Login ditolak oleh server guards dengan pesan penolakan kredensial tidak aktif (`STAFF_INACTIVE`).
- **Evidence:** Screenshot notifikasi penolakan login staf nonaktif.
- **Pemulihan:** Aktifkan kembali akun staf sekunder via `/admin/staff`.

#### Langkah 2.3 — UAT-REG-01: Student Registration Form & Photo Consent Validation
- **Precondition:** `Kelas Uji A` telah dibuat pada Langkah 1.1.
- **Aktor:** Mahasiswa 1
- **Langkah:**
  1. Pada Profil Browser 2, akses `/register`.
  2. Isi Nama: `[NAMA_PENGUJI_1]`, NIM: `[NIM_PENGUJI_1]`, Email: `[EMAIL_UTAMA]+mhs1@gmail.com`, Password: `[PASSWORD_PENGUJI_1]`, Kelas: `Kelas Uji A`.
  3. Biarkan checkbox persetujuan foto kosong dan klik "Daftar".
  4. Verifikasi munculnya peringatan validasi persetujuan foto wajib dicentang.
  5. Centang persetujuan foto, lalu klik "Daftar".
- **Expected Result:** Form tervalidasi; akun auth dibuat; layar menampilkan instruksi konfirmasi email.
- **Evidence:** Screenshot form error persetujuan foto dan pesan sukses pengiriman email konfirmasi.

#### Langkah 2.4 — UAT-REG-02: Student Email Verification Delivery & Activation
- **Precondition:** Pendaftaran `UAT-REG-01` telah berhasil disubmit.
- **Aktor:** Mahasiswa 1
- **Langkah:**
  1. Buka kotak masuk email `[EMAIL_UTAMA]@gmail.com`.
  2. Buka email konfirmasi dari Supabase Auth untuk Mahasiswa 1.
  3. Klik tautan konfirmasi email.
- **Expected Result:** Tautan membuka `/auth/callback` dan mengarahkan otomatis ke halaman `/register/photo`. Status email menjadi terkonfirmasi.
- **Evidence:** Screenshot email konfirmasi di inbox dan tampilan halaman `/register/photo`.

#### Langkah 2.5 — UAT-REG-03: Mandatory Face Reference Photo Capture
- **Precondition:** Sesi Mahasiswa 1 aktif di `/register/photo` dengan email terkonfirmasi.
- **Aktor:** Mahasiswa 1
- **Langkah:**
  1. Pada `/register/photo`, izinkan akses kamera webcam browser.
  2. Posisikan wajah pada kotak panduan framing (*framing box*).
  3. Perhatikan pratinjau: pastikan citra tidak terbalik secara horizontal (*no mirror effect*).
  4. Klik tombol "Ambil Foto Wajah" dan tinjau pratinjau.
- **Expected Result:** Citra wajah ditangkap jernih tanpa distorsi cermin; tombol "Lanjutkan ke Foto Dokumen" aktif.
- **Evidence:** Screenshot antarmuka kamera framing box saat menangkap wajah.

#### Langkah 2.6 — UAT-REG-04: Student ID Card (KTM/KTP) Document Capture
- **Precondition:** Foto wajah referensi (UAT-REG-03) telah berhasil ditangkap.
- **Aktor:** Mahasiswa 1
- **Langkah:**
  1. Arahkan kartu identitas fisik (KTM atau KTP) ke webcam perangkat.
  2. Klik "Ambil Foto Dokumen".
  3. Periksa pratinjau kartu identitas, lalu klik "Kirim Berkas Pendaftaran".
- **Expected Result:** Foto wajah dan dokumen terunggah ke bucket privat `smartprojex-media`; status pendaftaran berubah menjadi `PENDING_REVIEW`; mahasiswa melihat layar status tunggu verifikasi.
- **Evidence:** Screenshot layar mahasiswa berstatus `PENDING_REVIEW`.

---

### FASE 3: STUDENT VERIFICATION & LEADERSHIP SUCCESSION (9 Skenario)

#### Langkah 3.1 — UAT-VER-01: Admin Approval of Registration & Instant Document Purge
- **Precondition:** Berkas Mahasiswa 1 berstatus `PENDING_REVIEW` pada antrean verifikasi.
- **Aktor:** Admin
- **Langkah:**
  1. Pada Profil Browser 1, buka `/admin/verifications`.
  2. Buka berkas Mahasiswa 1.
  3. Lakukan 3 pencocokan visual: (a) wajah vs dokumen, (b) nama registrasi vs dokumen, (c) kelayakan kelas.
  4. Berikan centang pada ketiga kotak checklist manual.
  5. Klik tombol "Setujui Pendaftaran".
  6. Periksa direktori bucket storage untuk memverifikasi file foto dokumen telah terhapus permanen.
- **Expected Result:** Status Mahasiswa 1 berubah menjadi `ACTIVE`; foto dokumen identitas di storage dihapus permanen seketika (NFR-08); foto wajah referensi tetap tersimpan aman.
- **Evidence:** Screenshot modal approval dengan 3 checklist manual dan bukti file dokumen terhapus di storage.

#### Langkah 3.2 — UAT-VER-03: Admin Request Resubmission for Blurry ID Card
- **Precondition:** Mahasiswa 3 telah mendaftar dengan foto dokumen yang sengaja dibuat buram (dari Prosedur Bagian 1.C.5).
- **Aktor:** Admin & Mahasiswa 3
- **Langkah:**
  1. Pada `/admin/verifications`, buka berkas Mahasiswa 3.
  2. Klik tombol "Minta Upload Ulang".
  3. Isi instruksi perbaikan: "Foto KTM buram, mohon foto ulang di tempat terang".
  4. Submit instruksi.
- **Expected Result:** Status Mahasiswa 3 berubah menjadi `RESUBMISSION_REQUIRED`; mahasiswa melihat instruksi perbaikan pada halaman statusnya.
- **Evidence:** Screenshot modal resubmission dan tampilan instruksi perbaikan di sisi Mahasiswa 3.

#### Langkah 3.3 — UAT-VER-02: Admin Rejection with Mandatory Reason
- **Precondition:** Mahasiswa 3 telah menerima instruksi resubmission namun berkas tetap tidak valid.
- **Aktor:** Admin
- **Langkah:**
  1. Buka berkas Mahasiswa 3 di antrean verifikasi Admin.
  2. Klik tombol "Tolak Pendaftaran".
  3. Coba submit tanpa mengisi alasan (verifikasi validasi wajib isi).
  4. Isi alasan: "Data identitas tidak sesuai dokumen fisik", lalu submit.
- **Expected Result:** Alasan penolakan wajib diisi; status Mahasiswa 3 berubah menjadi `REJECTED`; dokumen identitas dihapus permanen dari storage.
- **Evidence:** Screenshot modal penolakan pendaftaran dan status akhir `REJECTED`.

#### Langkah 3.4 — UAT-CLM-01: Initial Leader Claim on Leaderless Class
- **Precondition:** Mahasiswa 1 telah berstatus `ACTIVE` di `Kelas Uji A`. `Kelas Uji A` belum memiliki ketua kelas (`leader_student_id = null`).
- **Aktor:** Mahasiswa 1
- **Langkah:**
  1. Pada Profil Browser 2, Mahasiswa 1 login dan mengakses halaman `/my-qr`.
  2. Karena kelas belum berketua, sistem menampilkan banner "Kelas Anda belum memiliki ketua kelas". Klik tombol "Ajukan Diri Sebagai Ketua Kelas".
  3. Pada modal pengajuan klaim, verifikasi pilihan `Kelas Uji A`.
  4. Masukkan alasan pengajuan: "Terpilih sebagai ketua kelas pada musyawarah kelas awal semester".
  5. Klik tombol "Kirim Pengajuan Klaim".
- **Expected Result:** Sistem memvalidasi bahwa kelas belum berketua, membuat entri di tabel `class_leader_claims` bertipe `INITIAL` dengan status `PENDING`. UI Mahasiswa 1 menampilkan status antrean menunggu verifikasi Admin.
- **Evidence:** Screenshot konfirmasi sukses pengajuan klaim pada sisi Mahasiswa 1 dan tampilan antrean klaim `INITIAL` (`PENDING`) pada `/admin/classes?tab=claims`.

#### Langkah 3.5 — UAT-CLM-03: Leader Claim Approval via Visual UI (FR-01F)
- **Precondition:** Klaim `INITIAL` milik Mahasiswa 1 berstatus `PENDING` di inbox klaim Admin.
- **Aktor:** Admin
- **Langkah:**
  1. Pada Profil Browser 1, buka `/admin/classes?tab=claims`.
  2. Temukan klaim `INITIAL` milik Mahasiswa 1.
  3. Klik tombol centang hijau "Setujui".
- **Expected Result:** Klaim disetujui; status menjadi `APPROVED`; `classes.leader_student_id` terisi ID Mahasiswa 1; Mahasiswa 1 resmi menjadi ketua aktif.
- **Evidence:** Screenshot tabel antrean klaim dengan status `APPROVED`.

#### Langkah 3.6 — UAT-CLM-02: Replacement Claim Submission on Existing Class
- **Precondition:** Mahasiswa 2 telah mendaftar di `Kelas Uji A` dan telah disetujui sebagai mahasiswa `ACTIVE` (dari Persiapan Bagian 1.C.4). Mahasiswa 1 adalah ketua aktif saat ini.
- **Aktor:** Mahasiswa 2
- **Langkah:**
  1. Mahasiswa 2 login pada Profil Browser 2 dan mengakses halaman `/my-qr`.
  2. Klik tombol "Ajukan Penggantian Ketua Kelas".
  3. Masukkan alasan: "Pergantian kepengurusan rombel berdasarkan hasil rapat kelas".
  4. Submit pengajuan klaim.
- **Expected Result:** Sistem mencatat klaim bertipe `REPLACEMENT` dengan status `PENDING`. Mahasiswa 1 tetap memegang jabatan ketua aktif; Mahasiswa 2 tidak otomatis menjadi ketua.
- **Evidence:** Screenshot riwayat klaim Mahasiswa 2 berstatus `PENDING (REPLACEMENT)`.

#### Langkah 3.7 — UAT-CLM-06: Leader Claim Rejection with Mandatory Reason via Visual UI
- **Precondition:** Klaim `REPLACEMENT` milik Mahasiswa 2 berstatus `PENDING` di inbox klaim Admin.
- **Aktor:** Admin
- **Langkah:**
  1. Buka `/admin/classes?tab=claims`.
  2. Temukan klaim `REPLACEMENT` milik Mahasiswa 2.
  3. Klik tombol silang merah "Tolak".
  4. Isi alasan: "Ketua kelas saat ini (Mahasiswa 1) masih aktif bertugas".
  5. Klik "Tolak Klaim".
- **Expected Result:** Klaim berstatus `REJECTED`; alasan tersimpan; kepemimpinan kelas tetap dipegang oleh Mahasiswa 1.
- **Evidence:** Screenshot modal penolakan klaim dan status `REJECTED` di tabel.

#### Langkah 3.8 — Screenshot QR Aktif Mahasiswa 1 (Persiapan Pengujian Revokasi)
*(Langkah Transisi Operasional)*
- **Langkah:** Mahasiswa 1 membuka `/my-qr` dan mengambil tangkapan layar (*screenshot*) QR Pass aktifnya. Tangkapan layar ini akan diuji pada Langkah 3.10 setelah serah terima jabatan dilakukan.

#### Langkah 3.9 — UAT-CLM-05: Direct Leadership Transfer between Classmates
- **Precondition:** Mahasiswa 1 ketua kelas aktif, Mahasiswa 2 anggota aktif pada `Kelas Uji A` yang sama. Tangkapan layar QR Mahasiswa 1 telah disimpan.
- **Aktor:** Mahasiswa 1 (Ketua Lama) & Mahasiswa 2 (Ketua Baru)
- **Langkah:**
  1. Pada `/my-qr` Mahasiswa 1, buka menu Transfer Kepemimpinan.
  2. Pilih Mahasiswa 2 dari daftar anggota kelas aktif `Kelas Uji A`.
  3. Klik konfirmasi pemindahan jabatan.
- **Expected Result:** Jabatan seketika berpindah ke Mahasiswa 2 (`classes.leader_student_id` = Mahasiswa 2); Mahasiswa 2 memperoleh akses QR Pass aktif; audit log mencatat event `LEADERSHIP_TRANSFER`.
- **Evidence:** Screenshot konfirmasi transfer sukses dan tampilan `/my-qr` Mahasiswa 2 yang aktif.

#### Langkah 3.10 — UAT-CLM-04: Old Leader QR Pass Revocation upon Replacement
- **Precondition:** Jabatan telah dialihkan ke Mahasiswa 2 pada Langkah 3.9. Tangkapan layar QR lama Mahasiswa 1 tersedia.
- **Aktor:** Mahasiswa 1 & Petugas Kiosk
- **Langkah:**
  1. Arahkan tangkapan layar QR Pass lama Mahasiswa 1 (dari Langkah 3.8) ke webcam Kiosk.
- **Expected Result:** Kiosk menolak pemindaian dengan pesan kesalahan bahwa mahasiswa bukan ketua kelas aktif (`BUKAN_KETUA_KELAS_AKTIF`).
- **Evidence:** Screenshot Kiosk menampilkan penolakan pemindaian QR ketua lama.

---

### FASE 4: PROJECTOR INVENTORY & HARDWARE AVAILABILITY (4 Skenario)
*(Catatan: Unit `TEST-PROJ-004` dipertahankan berstatus `AVAILABLE` agar dapat digunakan pada Langkah 5.5)*

#### Langkah 4.1 — UAT-PRJ-01: Create New Projector Unit (TEST-PROJ-004)
- **Precondition:** Halaman `/admin/projectors` terbuka dengan sesi Admin aktif.
- **Aktor:** Admin
- **Langkah:**
  1. Buka `/admin/projectors`.
  2. Klik tombol "Tambah Proyektor".
  3. Masukkan Kode: `TEST-PROJ-004`, Nama: `Epson EB-E500 (Unit UAT 2)`.
  4. Simpan data unit.
- **Expected Result:** Unit `TEST-PROJ-004` terdaftar di database dengan status awal `AVAILABLE`.
- **Evidence:** Screenshot baris inventaris `TEST-PROJ-004` di `/admin/projectors`.

#### Langkah 4.2 — UAT-PRJ-02: Update Projector Details & Immutability of Code
- **Precondition:** Unit `TEST-PROJ-004` telah terdaftar.
- **Aktor:** Admin
- **Langkah:**
  1. Klik "Edit" pada unit `TEST-PROJ-004`.
  2. Verifikasi bahwa field kode unit berstatus *disabled / readonly*.
  3. Ubah catatan unit menjadi: "Unit cadangan UAT".
  4. Simpan perubahan.
- **Expected Result:** Kode unit terkunci; catatan unit berhasil diperbarui.
- **Evidence:** Screenshot modal edit memperlihatkan kode proyektor terkunci dan pesan sukses.

#### Langkah 4.3 — UAT-PRJ-04: Projector QR Label Rendering & Print Modal
- **Precondition:** Unit `TEST-PROJ-004` terdaftar di inventaris.
- **Aktor:** Admin
- **Langkah:**
  1. Klik ikon barcode QR / tombol "Cetak Label QR" pada baris unit `TEST-PROJ-004`.
- **Expected Result:** Modal cetak menampilkan kode unit, nama proyektor, dan QR code SVG siap cetak beresolusi tinggi.
- **Evidence:** Screenshot modal cetak label QR proyektor.

#### Langkah 4.4 — UAT-PRJ-05: Projector Availability State Machine Enforcement
- **Precondition:** Sesi Kiosk aktif. Unit `TEST-PROJ-001` berstatus `MAINTENANCE` (kondisi alami sah dari baseline).
- **Aktor:** Petugas Kiosk
- **Langkah:**
  1. Pindai stiker QR `TEST-PROJ-001` pada Kiosk untuk transaksi peminjaman.
- **Expected Result:** Kiosk menolak peminjaman dengan notifikasi bahwa unit sedang dalam perawatan/perbaikan (`STATUS_UNIT_TIDAK_VALID`).
- **Evidence:** Screenshot layar Kiosk menampilkan penolakan peminjaman unit maintenance.

---

### FASE 5: BORROWING LIFECYCLE & IDEMPOTENCY TESTING (6 Skenario)

#### Langkah 5.1 — UAT-LOAN-01: Dynamic QR Pass Display & Expiration (60 Seconds)
- **Precondition:** Mahasiswa 2 adalah ketua kelas aktif. Halaman `/my-qr` terbuka.
- **Aktor:** Mahasiswa 2
- **Langkah:**
  1. Buka `/my-qr`.
  2. Amati progress bar hitungan mundur 60 detik.
  3. Tunggu hingga hitungan mundur mencapai 0 detik.
- **Expected Result:** QR code diperbarui otomatis tanpa reload halaman; token JWT baru diterbitkan; payload tidak memuat NIM.
- **Evidence:** Screenshot countdown bar bergerak dan token payload di DevTools.

#### Langkah 5.2 — UAT-LOAN-03: Dual-Scan Borrowing via Kiosk & Face Verification
- **Precondition:** Mahasiswa 2 ketua kelas aktif. Unit `TEST-PROJ-003` berstatus `AVAILABLE`.
- **Aktor:** Petugas Kiosk & Mahasiswa 2
- **Langkah:**
  1. Buka antarmuka Kiosk pada tab terpisah.
  2. Pindai QR Pass Mahasiswa 2 yang aktif.
  3. Pindai stiker QR unit `TEST-PROJ-003` (`AVAILABLE`).
- **Expected Result:** Kiosk memvalidasi kedua QR; menampilkan ringkasan data ketua kelas dan unit proyektor; foto wajah referensi dimuat via Signed URL 60 detik untuk verifikasi tatap muka petugas.
- **Evidence:** Screenshot Kiosk menampilkan ringkasan data dan foto wajah referensi.

#### Langkah 5.3 — UAT-LOAN-04: Handover Photo Capture & Transaction Creation
- **Precondition:** Pemindaian ganda Langkah 5.2 telah berhasil divalidasi.
- **Aktor:** Petugas Kiosk & Mahasiswa 2
- **Langkah:**
  1. Pilih opsi "Kondisi Terlihat Normal".
  2. Klik tombol "Ambil Foto Serah Terima" (hitung mundur 3 detik berjalan).
  3. Periksa pratinjau foto dan klik "Selesaikan Peminjaman" (menggunakan kunci idempotensi K1).
- **Expected Result:** Foto serah terima terkompresi (<250 KB) terunggah ke bucket privat; transaksi peminjaman `ACTIVE` dibuat di database; status unit `TEST-PROJ-003` berubah menjadi `BORROWED`.
- **Evidence:** Screenshot modal sukses peminjaman di Kiosk dan status unit `BORROWED` di inventaris.

#### Langkah 5.4 — UAT-LOAN-06: Idempotency Key Handling on Network Retries
- **Precondition:** Transaksi Langkah 5.3 baru saja selesai dengan kunci K1.
- **Aktor:** Petugas Kiosk / Tester Network
- **Langkah:**
  1. Pada browser DevTools Network Tab, temukan request POST `/api/kiosk/transaction` dari Langkah 5.3.
  2. Lakukan "Replay XHR" pada request dengan kunci K1 tersebut.
- **Expected Result:** Server merespons HTTP 200 dengan payload `idempotent_replay: true` dan mengembalikan `loan_id` yang sama persis tanpa membuat baris baru di tabel `loans`.
- **Evidence:** Screenshot respons Network Tab menampilkan `idempotent_replay: true`.

#### Langkah 5.5 — UAT-LOAN-05: Atomic Lock & Single Active Loan Enforcement
- **Precondition:** Mahasiswa 2 memegang pinjaman aktif unit `TEST-PROJ-003`. Unit `TEST-PROJ-004` masih berstatus `AVAILABLE`.
- **Aktor:** Petugas Kiosk & Mahasiswa 2
- **Langkah:**
  1. Pindai kembali QR Pass Mahasiswa 2 di Kiosk.
  2. Pindai unit proyektor kedua `TEST-PROJ-004` (`AVAILABLE`).
  3. Coba submit transaksi peminjaman kedua (menggunakan kunci baru K_DUP).
- **Expected Result:** Sistem menolak pembuatan pinjaman kedua dengan notifikasi bahwa ketua kelas masih memiliki pinjaman aktif lain (`PINJAMAN_AKTIF_SUDAH_ADA`).
- **Evidence:** Screenshot Kiosk menampilkan penolakan peminjaman ganda aktif.

#### Langkah 5.6 — UAT-PRJ-03: Manual Maintenance Status Transition with Reason
- **Precondition:** Langkah 5.5 telah selesai dieksekusi (unit `TEST-PROJ-004` terbukti tidak dipinjam).
- **Aktor:** Admin
- **Langkah:**
  1. Buka `/admin/projectors`.
  2. Pada unit `TEST-PROJ-004`, klik opsi ubah status ke `MAINTENANCE`.
  3. Masukkan alasan: "Pembersihan berkala lampu proyektor".
  4. Konfirmasi perubahan status.
- **Expected Result:** Status unit berubah menjadi `MAINTENANCE` (badge kuning); riwayat tercatat di `projector_status_logs`.
- **Evidence:** Screenshot status unit `MAINTENANCE` dan riwayat log status inventaris.

---

### FASE 6: RETURN LIFECYCLE & REPORTING (4 Skenario)

#### Langkah 6.1 — UAT-RTN-01: Direct Borrower Return (Normal Condition)
- **Precondition:** Unit `TEST-PROJ-003` berstatus `BORROWED` oleh Mahasiswa 2 dari Langkah 5.3.
- **Aktor:** Petugas Kiosk & Mahasiswa 2
- **Langkah:**
  1. Pindai unit proyektor `TEST-PROJ-003` pada Kiosk.
  2. Sistem mendeteksi unit sedang dipinjam dan beralih ke alur pengembalian.
  3. Pindai QR Pass Mahasiswa 2 (peminjam asli).
  4. Pilih opsi "Kondisi Normal", ambil foto pengembalian, klik "Konfirmasi Pengembalian".
- **Expected Result:** Transaksi pinjaman berstatus `COMPLETED`; kolom `returned_at` terisi; status unit kembali `AVAILABLE`.
- **Evidence:** Screenshot modal sukses pengembalian dan status unit `AVAILABLE` di inventaris.

#### Langkah 6.2 — Peminjaman Transisi Unit TEST-PROJ-003 untuk Uji Pengembalian Perwakilan
*(Langkah Operasional Terstruktur)*
- **Precondition:** Unit `TEST-PROJ-003` berstatus `AVAILABLE` dari Langkah 6.1.
- **Aktor:** Petugas Kiosk & Mahasiswa 2
- **Input:** QR Pass Mahasiswa 2, QR Unit `TEST-PROJ-003`, Kondisi Normal, Foto serah terima, Kunci Idempotensi K2.
- **Langkah:** Buka Kiosk, lakukan peminjaman normal unit `TEST-PROJ-003` oleh Mahasiswa 2.
- **Expected Result:** Transaksi pinjaman `ACTIVE` baru terbentuk (ID Pinjaman K2); unit menjadi `BORROWED`.
- **Dampak Data:** 1 baris pinjaman `ACTIVE` baru tersimpan di tabel `loans`.

#### Langkah 6.3 — UAT-RTN-02: Representative Return with Mandatory Representative Name
- **Precondition:** Unit `TEST-PROJ-003` berstatus `BORROWED` dari Langkah 6.2.
- **Aktor:** Petugas Kiosk & Perwakilan Mahasiswa
- **Langkah:**
  1. Pindai unit `TEST-PROJ-003` di Kiosk.
  2. Pilih pengembali: "Perwakilan / Teman Sekelas".
  3. Coba submit tanpa mengisi nama perwakilan (verifikasi validasi wajib isi).
  4. Masukkan nama perwakilan: `[NAMA_PERWAKILAN_PENGUJI]` (misalnya: "Penguji Perwakilan Mahasiswa"), ambil foto serah terima, dan konfirmasi.
- **Expected Result:** Validasi form aktif; transaksi selesai (`COMPLETED`); nama perwakilan tersimpan pada kolom `returned_by_name`.
- **Evidence:** Screenshot form input nama perwakilan dan baris transaksi database.

#### Langkah 6.4 — Peminjaman Transisi Unit TEST-PROJ-003 untuk Uji Pelaporan Kendala
*(Langkah Operasional Terstruktur)*
- **Precondition:** Unit `TEST-PROJ-003` berstatus `AVAILABLE` dari Langkah 6.3.
- **Aktor:** Petugas Kiosk & Mahasiswa 2
- **Input:** QR Pass Mahasiswa 2, QR Unit `TEST-PROJ-003`, Kondisi Normal, Foto serah terima, Kunci Idempotensi K3.
- **Langkah:** Buka Kiosk, lakukan peminjaman normal unit `TEST-PROJ-003` oleh Mahasiswa 2.
- **Expected Result:** Transaksi pinjaman `ACTIVE` baru terbentuk (ID Pinjaman K3); unit menjadi `BORROWED`.
- **Dampak Data:** 1 baris pinjaman `ACTIVE` baru tersimpan di tabel `loans`.

#### Langkah 6.5 — UAT-RTN-03: Return with Reported Issue & Automatic Maintenance Transition
- **Precondition:** Unit `TEST-PROJ-003` berstatus `BORROWED` dari Langkah 6.4.
- **Aktor:** Petugas Kiosk
- **Langkah:**
  1. Pindai unit `TEST-PROJ-003` di Kiosk.
  2. Pilih kondisi: "Laporkan Kendala / Kerusakan".
  3. Masukkan catatan: "Port HDMI longgar / gambar berkedip", ambil foto kondisi unit, klik konfirmasi.
- **Expected Result:** Transaksi selesai (`COMPLETED`) dengan `return_condition = 'REPORTED_ISSUE'`; unit proyektor otomatis bertransisi ke status `MAINTENANCE`; log tercatat di status logs.
- **Evidence:** Screenshot Kiosk konfirmasi status maintenance dan status inventaris admin.

#### Langkah 6.6 — UAT-RTN-04: Return Lifecycle Audit Trail & Metadata Logging
- **Precondition:** Pengembalian dengan kendala Langkah 6.5 telah selesai.
- **Aktor:** Admin
- **Langkah:**
  1. Buka `/admin/audit-logs`.
  2. Filter aksi berdasarkan `LOAN_RETURN`.
  3. Buka detail log pengembalian kendala terakhir.
- **Expected Result:** Audit log memuat rincian pengembalian, nama petugas, kondisi kendala, dan metadata transaksi.
- **Evidence:** Screenshot tabel audit log dengan modal detail payload JSON.

---

### FASE 7: ADMINISTRATIVE REPORTING & SEMESTER ROLL (3 Skenario)

#### Langkah 7.1 — UAT-ADM-01: Semester Class Copy (copy-term)
- **Precondition:** Halaman `/admin/classes` terbuka dengan sesi Admin aktif. Kelas semester ganjil (`Kelas Uji A`) telah aktif.
- **Aktor:** Admin
- **Langkah:**
  1. Buka `/admin/classes`.
  2. Klik tombol "Salin Semester".
  3. Masukkan semester sumber: `2026/2027-GANJIL`, semester target: `2026/2027-GENAP`.
  4. Konfirmasi salin semester.
- **Expected Result:** Seluruh rombel kelas semester ganjil tersalin ke semester genap dengan status ketua kosong (`leader_student_id = null`).
- **Evidence:** Screenshot tabel kelas semester genap baru dengan ketua belum terisi.

#### Langkah 7.2 — UAT-CLM-07: New Academic Term Class Copy & Leadership Re-claim
- **Precondition:** Skenario `UAT-ADM-01` (Langkah 7.1) telah selesai dieksekusi dan kelas semester genap telah terbentuk di database. Mahasiswa 2 adalah mahasiswa `ACTIVE`.
- **Aktor:** Mahasiswa 2
- **Langkah:**
  1. Mahasiswa 2 membuka menu klaim kelas semester baru pada `/my-qr`.
  2. Pilih kelas semester genap hasil salinan dan submit klaim.
- **Expected Result:** Klaim terbuat tanpa meminta mahasiswa mengulang proses upload foto KTM/wajah.
- **Evidence:** Screenshot form klaim semester baru tanpa step foto identitas.

#### Langkah 7.3 — UAT-ADM-02: CSV Transaction Export with WIB Timestamps
- **Precondition:** Transaksi pengujian telah tersimpan di database.
- **Aktor:** Admin
- **Langkah:**
  1. Buka `/admin/loans`.
  2. Klik tombol "Ekspor CSV".
  3. Buka berkas CSV yang diunduh menggunakan spreadsheet/editor teks.
- **Expected Result:** File CSV memuat seluruh transaksi pengujian; seluruh kolom tanggal diformat dalam zona waktu WIB (+07:00).
- **Evidence:** Screenshot isi file CSV dengan header lengkap dan timestamp WIB.

---

### FASE 8: SECURITY HARDENING & EDGE CASES (4 Skenario)

#### Langkah 8.1 — UAT-LOAN-02: Expired QR Pass Rejection on Kiosk
- **Precondition:** Screenshot QR Pass Mahasiswa 2 diambil dan ditahan selama >65 detik.
- **Aktor:** Petugas Kiosk & Tester
- **Langkah:**
  1. Ambil screenshot QR Pass Mahasiswa dan tahan selama >65 detik.
  2. Hadapkan screenshot QR yang sudah kedaluwarsa ke kamera Kiosk.
- **Expected Result:** Kiosk menolak pemindaian dengan kode error `EXPIRED_TOKEN` / `TOKEN_KEDALUWARSA`.
- **Evidence:** Screenshot Kiosk menampilkan penolakan token kedaluwarsa.

#### Langkah 8.2 — UAT-LOAN-07: Manual Lookup Fallback Borrowing with Mandatory Reason
- **Precondition:** Kamera Kiosk disimulasikan bermasalah / mahasiswa tidak dapat memindai QR.
- **Aktor:** Petugas Kiosk & Mahasiswa
- **Langkah:**
  1. Pada Kiosk, klik tombol "Cari Mahasiswa Manual".
  2. Masukkan NIM/Nama ketua kelas.
  3. Coba submit tanpa mengisi alasan (verifikasi validasi wajib isi).
  4. Isi alasan: "Layar ponsel mahasiswa retak", submit sesi.
- **Expected Result:** Sesi Kiosk manual terbentuk dengan `borrow_identification_method = 'MANUAL_LOOKUP'`; alasan tersimpan dalam audit log.
- **Evidence:** Screenshot form manual lookup dan log pencatatan sesi manual.

#### Langkah 8.3 — UAT-QR-01: Self-Revocation of Active Leader QR Token
- **Precondition:** Screenshot QR Pass Mahasiswa 2 aktif saat ini disimpan sebelum tombol cabut ditekan.
- **Aktor:** Mahasiswa 2 (Ketua Aktif) & Petugas Kiosk
- **Langkah:**
  1. Ambil screenshot QR Pass Mahasiswa 2 saat ini.
  2. Pada `/my-qr`, klik tombol "Cabut QR Pass Ini" dan konfirmasi.
  3. Pindai tangkapan layar QR lama pada Kiosk.
- **Expected Result:** Versi token akun naik (`qr_token_version + 1`); QR lama yang discan di Kiosk seketika ditolak dengan error `VERSION_MISMATCH`.
- **Evidence:** Screenshot modal pencabutan mandiri sukses dan error penolakan token lama di Kiosk.

#### Langkah 8.4 — UAT-ADM-04: Role-Based Access Control (RBAC) Enforcement
- **Precondition:** Sesi Mahasiswa aktif di Profil Browser 2; sesi Staf/Admin aktif di Profil Browser 1.
- **Aktor:** Tester Multi-Role
- **Langkah:**
  1. Pada jendela sesi Mahasiswa, buka paksa URL `/admin` dan `/kiosk`.
  2. Pada jendela sesi Staf, buka URL `/my-qr`.
- **Expected Result:** Akses lintas peran ditolak server; pengguna dialihkan ke rute aman atau menerima 403 Forbidden.
- **Evidence:** Screenshot penolakan akses rute lintas peran.

---

### FASE 9: FINAL ACCEPTANCE, AUDIT TRAIL SIGN-OFF & SAFE CLEANUP (1 Skenario + Protokol)

#### Langkah 9.1 — UAT-ADM-03: Append-Only Audit Log Viewer with Filters & JSON Inspector
- **Precondition:** Seluruh skenario Fase 1 s/d 8 telah selesai dieksekusi.
- **Aktor:** Admin
- **Langkah:**
  1. Buka `/admin/audit-logs`.
  2. Verifikasi ketiadaan tombol edit dan delete (append-only proof).
  3. Uji filter pencarian dan buka modal inspeksi JSON.
- **Expected Result:** Seluruh aktivitas pengujian Fase 1 s/d 8 tercatat kronologis dan tidak dapat dimanipulasi.
- **Evidence:** Screenshot tabel audit logs lengkap dengan modal payload JSON terbuka.

---

## 4. Analisis Status Proyektor & Kelas: Baseline vs UAT vs Post-UAT Cleanup

Pembersihan lingkungan pengujian wajib mematuhi pemetaan status berikut untuk melindungi kondisi pemeliharaan yang sah dan menjaga integritas 15 transaksi historis kampus:

| Aset Pengujian | Status Awal (Baseline DB) | Perubahan yang Terjadi Selama UAT | Status Akhir Saat UAT Selesai | Rekomendasi Pemulihan Pasca-UAT (Safe Cleanup) | Keterangan & Proteksi Status Sah |
| :--- | :---: | :--- | :---: | :--- | :--- |
| **TEST-PROJ-001** | **MAINTENANCE** | Diuji pada `UAT-PRJ-05` (Kiosk menolak pinjaman). Status **tidak berubah**. | **MAINTENANCE** | **JANGAN DIUBAH (TETAP MAINTENANCE)** | **KONDISI SAH**: Merupakan proyektor yang memang sedang rusak sebelum UAT. Dilarang mereset unit ini ke AVAILABLE. |
| **TEST-PROJ-002** | **AVAILABLE** | Tidak dimutasi selama pengujian 37 skenario (unit kontrol). | **AVAILABLE** | **TETAP AVAILABLE** | Tidak ada tindakan cleanup yang diperlukan. |
| **TEST-PROJ-003** | **AVAILABLE** | Dipinjam & dikembalikan 3x. Terakhir dikembalikan dengan laporan kendala teknis port HDMI pada `UAT-RTN-03`. | **MAINTENANCE** | **UBAH KEMBALI KE AVAILABLE** | Pemulihan dilakukan oleh Admin TU via UI `/admin/projectors` dengan catatan: "Pemulihan status pasca-UAT kendala simulasi". |
| **TEST-PROJ-004** | *Belum ada di DB* | Didaftarkan baru (`UAT-PRJ-01`) $\rightarrow$ `AVAILABLE`, diuji batas 1 unit (`UAT-LOAN-05`), lalu diubah manual ke `MAINTENANCE` (`UAT-PRJ-03`). | **MAINTENANCE** | **UBAH KE INACTIVE** | Nonaktifkan unit melalui UI Admin inventaris agar tidak muncul sebagai proyektor aktif operasional kampus. |
| **Kelas Uji A** | *Belum ada di DB* | Dibuat pada Langkah 1.1 (`is_active = true`). Digunakan Mahasiswa 1 dan Mahasiswa 2. | **ACTIVE** | **NONAKTIFKAN (is_active = false)** | Dinonaktifkan via UI kelas setelah memastikan tidak ada pinjaman aktif. |
| **Kelas Semester Genap** | *Belum ada di DB* | Dihasilkan dari salin semester (`UAT-ADM-01`). | **ACTIVE** | **SESUAI KEBIJAKAN OWNER** | Dapat dipertahankan untuk semester depan atau dinonaktifkan (`is_active = false`). |
| **Akun Mahasiswa (M1, M2, M3)** | *Belum ada di DB* | Didaftarkan dan digunakan selama pengujian UAT. | **ACTIVE / REJECTED** | **DEAKTIVASI (INACTIVE)** | **DILARANG SQL DELETE**: Ubah status menjadi `INACTIVE` (`deactivated_at = NOW()`). Ini menjaga relasi `ON DELETE RESTRICT` pada tabel `loans`. |

---

## 5. Protokol Keamanan Data Pasca-UAT (Safe Cleanup Protocol)

| Tindakan Cleanup | Klasifikasi Keamanan | Alasan & Mekanisme yang Diizinkan |
| :--- | :---: | :--- |
| **Penghapusan Transaksi Historis (`loans`)** | **PROHIBITED** | **DILARANG KERAS**. Riwayat transaksi dilindungi oleh aturan `ON DELETE RESTRICT` dan wajib dipertahankan untuk integritas audit kampus. |
| **Penghapusan Baris Audit Log (`audit_logs`)** | **PROHIBITED** | **DILARANG KERAS**. Tabel audit bersifat append-only dan merupakan bukti kepatuhan hukum sistem. |
| **Penghapusan Masal Storage Bucket** | **PROHIBITED** | **DILARANG KERAS**. Dilarang menjalankan operasi *empty bucket* atau penghapusan massal. |
| **SQL DELETE pada Akun Mahasiswa Penguji** | **PROHIBITED** | **DILARANG KERAS**. Mahasiswa yang memiliki riwayat pinjaman akan memicu *foreign_key_violation* jika dihapus dengan SQL DELETE. |
| **Deaktivasi Akun Mahasiswa Penguji** | **SAFE AFTER OWNER APPROVAL** | **DIIZINKAN**. Ubah status mahasiswa penguji menjadi `registration_status: 'INACTIVE'` dengan `deactivated_at = NOW()`. Ini mencabut hak akses tanpa merusak foreign key transaksi. |
| **Pengembalian Status Proyektor TEST-PROJ-003** | **SAFE AFTER OWNER APPROVAL** | **DIIZINKAN**. Ubah kembali status `TEST-PROJ-003` menjadi `AVAILABLE` melalui UI Admin setelah pengujian kendala selesai. |
| **Penonaktifan Unit `TEST-PROJ-004`** | **SAFE AFTER OWNER APPROVAL** | **DIIZINKAN**. Ubah status unit `TEST-PROJ-004` menjadi `INACTIVE` melalui antarmuka Admin inventaris. |
| **Penonaktifan `Kelas Uji A`** | **REQUIRES DEPENDENCY CHECK** | Periksa apakah kelas memiliki relasi aktif; jika aman, ubah `is_active = false`. |
