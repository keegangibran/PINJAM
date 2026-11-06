# SmartProjex — Spesifikasi Transaksi Peminjaman Atomik

Dokumen ini mendokumentasikan spesifikasi teknis fungsi basis data PostgreSQL `public.process_loan_transaction` yang mengelola siklus transaksi peminjaman dan pengembalian proyektor secara atomik, konsisten, dan bebas dari *race condition*.

---

## 1. Definisi Signature & Parameter

```sql
FUNCTION public.process_loan_transaction(
  p_idempotency_key varchar(64),
  p_projector_code varchar(30),
  p_photo_path text,
  p_condition varchar(20),
  p_staff_auth_id uuid,
  p_kiosk_session_id uuid DEFAULT NULL,
  p_issue_notes text DEFAULT NULL,
  p_returner_type varchar(15) DEFAULT NULL,
  p_returner_name varchar(100) DEFAULT NULL,
  p_due_at timestamptz DEFAULT NULL
)
RETURNS jsonb
```

### Parameter Input
| Nama Parameter | Tipe Data | Wajib | Keterangan |
|---|---|---|---|
| `p_idempotency_key` | `varchar(64)` | Ya | Kunci idempotensi unik dari klien Kiosk untuk mencegah duplikasi transaksi |
| `p_projector_code` | `varchar(30)` | Ya | Kode aset unik yang dipindai dari stiker QR unit proyektor |
| `p_photo_path` | `text` | Ya | Path storage foto dokumentasi (`loans/borrow_...` atau `loans/return_...`) |
| `p_condition` | `varchar(20)` | Ya | Pilihan kondisi: `'NORMAL'` atau `'REPORTED_ISSUE'` (hanya 2 pilihan setara) |
| `p_staff_auth_id` | `uuid` | Ya | UUID `auth.uid()` staf/admin operator Kiosk |
| `p_kiosk_session_id` | `uuid` | Khusus Pinjam | UUID sesi Kiosk aktif hasil pemindaian QR Pass / pencarian manual |
| `p_issue_notes` | `text` | Opsional | Catatan kendala (wajib jika `p_condition = 'REPORTED_ISSUE'`) |
| `p_returner_type` | `varchar(15)` | Khusus Kembali | `'BORROWER'` (peminjam sendiri) atau `'REPRESENTATIVE'` (perwakilan) |
| `p_returner_name` | `varchar(100)` | Khusus Perwakilan | Nama lengkap perwakilan jika dikembalikan oleh selain peminjam |
| `p_due_at` | `timestamptz` | Opsional | Batas waktu kembali (dihitung server jika NULL) |

---

## 2. Struktur Output & Error Codes

### Sukses Respons (JSON)
```json
{
  "success": true,
  "action": "BORROW" | "RETURN" | "RETURN_ISSUE" | "CANCELLED_ISSUE",
  "loan_id": "uuid-atau-null",
  "projector_code": "SPX-001",
  "status": "BORROWED" | "AVAILABLE" | "MAINTENANCE",
  "message": "Deskripsi hasil transaksi",
  "idempotent_replay": false
}
```

### Kode Kesalahan Terkelola
| Kode Error | Kategori | Alasan & Mitigasi |
|---|---|---|
| `AKSES_DITOLAK` | Otorisasi | Operator bukan staf/admin aktif di `staff_profiles` |
| `PROYEKTOR_TIDAK_DITEMUKAN` | Validasi Aset | Kode proyektor tidak terdaftar pada tabel `projectors` |
| `STATUS_UNIT_TIDAK_VALID` | State Machine | Proyektor berstatus `MAINTENANCE` atau `INACTIVE` |
| `SESI_KIOSK_DIBUTUHKAN` | Alur Bisnis | Transaksi peminjaman tidak menyertakan `kiosk_session_id` |
| `SESI_KIOSK_KEDALUWARSA` | Keamanan | Sesi Kiosk telah melewati batas umur 120 detik |
| `SESI_KIOSK_SUDAH_DIGUNAKAN` | Integritas | Sesi Kiosk sudah pernah dikonsumsi sebelumnya |
| `MAHASISWA_TIDAK_AKTIF` | Domain Rule | Akun mahasiswa peminjam bukan `ACTIVE` |
| `BUKAN_KETUA_KELAS_AKTIF` | Domain Rule | Mahasiswa bukan ketua aktif pada kelas semester berjalan |
| `PINJAMAN_AKTIF_SUDAH_ADA` | Domain Invariant | Ketua kelas masih memiliki pinjaman proyektor aktif lain |
| `NAMA_PERWAKILAN_WAJIB` | Akuntabilitas | Pengembalian oleh perwakilan tanpa mencatat nama pihak pengembali |
| `DATA_INKONSISTEN` | Integritas | Proyektor `BORROWED` namun tidak ada record `loans` berstatus `ACTIVE` |

---

## 3. Strategi Row Locking & Anti-Race Condition

Untuk mencegah balapan konkurensi ketika dua request memproses unit yang sama secara simultan:

```text
Request Masuk
     │
     ▼
[SELECT * FROM projectors WHERE code = ... FOR UPDATE] ──► Mengunci baris unit fisik
     │
     ├─► Status = 'AVAILABLE' (Alur Pinjam)
     │     │
     │     ├─► [SELECT * FROM kiosk_sessions WHERE id = ... FOR UPDATE] ──► Kunci sesi Kiosk
     │     ├─► [SELECT * FROM students WHERE id = ... FOR UPDATE] ────────► Kunci profil mahasiswa
     │     ├─► Validasi 1 Pinjaman Aktif per Mahasiswa
     │     └─► Mutasi atomik: INSERT loans, UPDATE projectors, INSERT status_logs, INSERT audit_logs
     │
     └─► Status = 'BORROWED' (Alur Kembali)
           │
           ├─► [SELECT * FROM loans WHERE projector_id = ... AND status = 'ACTIVE' FOR UPDATE]
           └─► Mutasi atomik: UPDATE loans, UPDATE projectors, INSERT status_logs, INSERT audit_logs
```

Urutan penguncian konsisten (`projectors` → `kiosk_sessions` → `students` → `loans`) mencegah terjadinya kebuntuan (*deadlock*).

