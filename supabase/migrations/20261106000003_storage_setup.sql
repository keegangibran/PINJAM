-- ==============================================================================
-- SmartProjex — Migration 3: Storage Setup & Policies
-- Konfigurasi bucket privat smartprojex-media dan pembatasan akses berbasis role.
-- Sesuai PRD Revisi 3 Bagian 7.1, NFR-05, NFR-07, dan NFR-08.
-- ==============================================================================

-- 1. Buat bucket privat 'smartprojex-media' (jika belum ada)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'smartprojex-media',
  'smartprojex-media',
  false, -- DILARANG publik (harus privat murni)
  2097152, -- Batas maks 2 MB (foto dikompresi klien target <= 250 KB)
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- ------------------------------------------------------------------------------
-- 2. Kebijakan Akses Objek Storage (storage.objects)
-- ------------------------------------------------------------------------------

-- Membaca Objek: Hanya Staf/Admin aktif (atau via Signed URL berumur <= 60 detik)
CREATE POLICY "staff_read_media" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'smartprojex-media'
  AND public.is_active_staff()
);

-- Mengunggah Objek: Staf aktif dapat mengunggah ke faces/, documents/, dan loans/
CREATE POLICY "staff_upload_media" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'smartprojex-media'
  AND public.is_active_staff()
  AND (
    name LIKE 'faces/%'
    OR name LIKE 'documents/%'
    OR name LIKE 'loans/%'
  )
);

-- Menghapus Objek: Staf aktif dapat menghapus foto dokumen segera setelah keputusan (NFR-08)
CREATE POLICY "staff_delete_documents" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'smartprojex-media'
  AND (
    public.is_active_staff()
    OR public.is_active_admin()
  )
);

