# SmartProjex Antigravity Starter Pack

Paket ini berisi instruksi agent dan prompt kickoff berbasis PRD SmartProjex Revisi 3.

## Isi
- `AGENTS.md` — instruksi inti workspace, selalu aktif.
- `.agents/rules/prd-and-scope.md` — invariants scope PRD.
- `.agents/rules/supabase-security.md` — rule keamanan database/API/storage/token.
- `.agents/rules/implementation-quality.md` — kualitas implementasi dan pelaporan.
- `.agents/workflows/phase-execution.md` — prosedur fase yang dapat digunakan berulang.
- `FIRST_PROMPT.md` — prompt pertama: inspeksi dan rencana saja, belum coding.
- `PRD.md` — PRD sumber kebenaran yang dipaketkan.

## Cara memakai
1. Extract ZIP ke root workspace project Antigravity (atau salin isinya ke root repo).
2. Pastikan `PRD.md` berada di root workspace dan sesuai revisi yang Anda maksud.
3. Buka workspace di Antigravity. Aturan root `AGENTS.md` dan `.agents/rules/*.md` akan ditemukan otomatis.
4. Kirim isi `FIRST_PROMPT.md` sebagai prompt pertama.
5. Review rencana dan clarifications dari agent; approve sebelum prompt implementasi fase 0/1.

Jangan tempatkan secrets atau data mahasiswa asli dalam paket, repo, prompt, atau fixture.
