-- ==============================================================================
-- SmartProjex — Seed Data: Konfigurasi Sistem Default (app_settings)
-- Nilai konfigurasi dasar sistem operasional tanpa data dummy pengguna.
-- ==============================================================================

INSERT INTO public.app_settings (key, value, description)
VALUES 
(
  'operational_hours',
  '{"closing_hour": 17, "closing_minute": 0, "fallback_hours": 2}'::jsonb,
  'Konfigurasi batas akhir operasional TU (WIB) untuk perhitungan default due_at peminjaman proyektor.'
),
(
  'academic_term',
  '{"current_term": "2026/2027-GANJIL", "term_ends_at": "2027-01-31T23:59:59+07:00"}'::jsonb,
  'Kode semester akademik aktif dan batas waktu akhir semester untuk kedaluwarsa ketua kelas.'
),
(
  'storage_monitoring',
  '{"warning_threshold_pct": 70, "max_capacity_bytes": 1073741824}'::jsonb,
  'Ambang batas pemantauan kuota Supabase Storage Free-Tier (1 GB).'
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = now();
