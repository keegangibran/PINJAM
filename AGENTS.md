# PINJAM — Aturan Agen Antigravity

## Sumber kebenaran dan prioritas
- `PRD.md` adalah sumber kebenaran produk. Implementasi harus mengikuti PRD Revisi 3.
- Jangan mengubah requirement, alur, role, retensi, keamanan, atau scope secara diam-diam. Jika terdapat kontradiksi/ambiguitas, dokumentasikan sebagai `PRD Clarification` dan gunakan default MVP di PRD bila dinyatakan.
- Jika perubahan produk diperlukan, usulkan perubahan PRD terlebih dahulu; jangan menyesuaikan kode untuk “memperbaiki” PRD tanpa persetujuan.
- Jangan menganggap keputusan atau kebijakan kampus yang belum dikonfirmasi sebagai fakta. Open Questions Q-01–Q-07 harus dicatat.

## Cara bekerja
- Kerjakan bertahap, kecil, dapat diuji. Sebelum coding: inspeksi repo, baca PRD penuh, identifikasi kondisi awal, lalu buat rencana dan daftar risiko.
- Jangan membangun seluruh MVP dalam satu perubahan besar. Selesaikan satu fase/vertical slice, jalankan lint/typecheck/test/build yang tersedia, dan laporkan hasil.
- Jangan menandai acceptance criteria selesai kecuali ada implementasi dan bukti pengujian.
- Jangan membuat file, dependensi, endpoint, tabel, atau fitur di luar kebutuhan tanpa alasan yang jelas.
- Bila tindakan destruktif, perubahan schema berisiko, deploy, atau operasi terhadap data/akun nyata diperlukan, berhenti dan minta persetujuan eksplisit.
- Jangan mengklaim pengujian berhasil jika tidak dijalankan; catat command, hasil, dan blocker.

## Stack dan arsitektur
- Stack yang ditetapkan: Next.js 15 App Router, TypeScript, Tailwind CSS, Supabase PostgreSQL/Auth/Storage, `html5-qrcode`, `qrcode.react`, `jose`, Vercel Hobby.
- Gunakan Route Handlers server-side untuk API dan akses database. Supabase service-role key hanya di server; jangan pernah expose di browser, logs, atau commit.
- UI Bahasa Indonesia, responsif: mobile QR Pass dan kiosk laptop 1366x768+.
- Pertahankan struktur folder PRD bila masuk akal; perubahan struktur harus dijelaskan.
- Timestamp disimpan `timestamptz`, sumber waktu transaksi dari server, UI tampil Asia/Jakarta (WIB).

## Keamanan dan privasi — wajib
- RLS aktif di seluruh tabel. Terapkan prinsip least privilege dan validasi otorisasi server-side pada setiap endpoint.
- Foto wajah referensi, dokumen identitas, dan foto transaksi berada di bucket privat. Database menyimpan object path, bukan URL publik.
- Signed URL maksimum 60 detik dan setiap penerbitannya tercatat dalam audit log.
- Foto dokumen KTM/KTP dihapus segera setelah keputusan (maksimal 24 jam); jangan menyimpan NIK atau teks hasil OCR. OCR dan facial recognition otomatis tidak boleh dibuat.
- Persetujuan eksplisit untuk pengambilan foto harus ada. Jangan ambil atau upload foto sebelum persetujuan.
- Foto referensi hanya pembanding visual manual oleh petugas berwenang. Jangan membuat inference biometrik otomatis.
- Jangan menaruh token QR, secrets, PII, dokumen, atau base64 foto di query string, logs, error reports, fixtures, atau commits.
- QR Pass token signed HS256, 60 detik, tanpa NIM di payload, verifikasi server-side (signature, exp, version, ACTIVE status, active class leader). Token QR jangan dikirim via query string.
- Kiosk API transaction dan lookup menggunakan POST; gunakan idempotency key.
- Enforce one ACTIVE loan per projector and one ACTIVE loan per student at database level (partial unique indexes), bukan hanya UI.
- Perubahan transaksi dan status projector harus atomic via DB function/transaction + row locking. Jangan percayakan keputusan borrow/return kepada klien.
- Akun staff individual; role STAFF dan ADMIN mengikuti matriks hak akses PRD. Audit log untuk aksi yang diwajibkan PRD.
- Retensi: face reference selama akun ACTIVE, hapus 90 hari setelah INACTIVE; foto transaksi 180 hari sesudah transaksi selesai kecuali unresolved issue; scheduled retention harian. Foto document dihapus segera pasca keputusan.

## Aturan domain yang tidak boleh dilanggar
- Hanya ketua kelas aktif, akun ACTIVE dan email terverifikasi, yang dapat meminjam.
- Peminjam utama satu unit per transaksi dan maksimal satu pinjaman aktif per ketua kelas.
- Ketua kelas ditetapkan melalui claim; INITIAL pada kelas tanpa ketua, REPLACEMENT harus disetujui; transfer hanya ke mahasiswa ACTIVE di kelas yang sama; expiry per semester.
- Daftar kelas baku (prodi + angkatan + rombel + semester), bukan input bebas.
- Smart Toggle ditentukan status unit di server: AVAILABLE -> borrow; BORROWED -> return; MAINTENANCE/INACTIVE menolak borrow.
- Kondisi cukup dua pilihan: normal / laporkan kendala. Tidak ada checklist komponen.
- Return oleh borrower atau representative dengan nama dicatat petugas.
- Due date default akhir jam operasional TU pada hari peminjaman; configurable oleh admin.
- Tidak ada auto-fines/sanctions, booking, SIAKAD integration, native mobile, OCR, facial recognition, direct handoff, multi-unit borrowing, or non-leader borrowing in MVP.
- Jika sistem/internet down, manual ledger fallback, lalu input kembali saat pulih.

## Kualitas
- TypeScript strict; hindari `any` tanpa alasan dan komentar.
- Validasi input server-side (gunakan Zod bila tersedia/ditambahkan secara justified).
- Tulis test untuk domain logic, permissions, transaction race/idempotency, expiry, and retention.
- UI harus accessible, kontras dan status tak bergantung pada warna saja.
- Jangan gunakan mock/demo data sebagai production behavior. Test fixtures harus jelas dan tidak memuat PII nyata.
- Update README, env example (tanpa secrets), migrations, tests, dan docs saat perubahan membutuhkannya.

## Definition of Done setiap fase
1. Scope/requirements yang dipenuhi dicantumkan.
2. Implementasi dan migration (jika diperlukan) selesai.
3. Lint, typecheck, test, build yang relevan dijalankan; hasil dicatat.
4. Acceptance criteria diverifikasi atau ditandai belum.
5. Security/privacy review ringkas dan daftar known issues diberikan.
6. PRD tidak diubah tanpa approval.
