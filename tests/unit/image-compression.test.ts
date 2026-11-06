import { describe, it, expect } from 'vitest';
import {
  getBase64SizeBytes,
  isValidImageMimeType,
  calculateTargetDimensions,
  dataUrlToBlob,
  MAX_PHOTO_SIZE_BYTES,
} from '@/lib/image';

describe('Image Compression & Processing Module (src/lib/image.ts)', () => {
  it('G-1: Menghitung ukuran biner dari Data URL Base64 secara akurat', () => {
    // 100 karakter base64 mewakili ~75 bytes
    const base64Sample = 'data:image/jpeg;base64,' + 'A'.repeat(100);
    const size = getBase64SizeBytes(base64Sample);
    expect(size).toBe(75);

    // Target kompresi NFR-02 adalah <= 250 KB (256.000 bytes)
    expect(MAX_PHOTO_SIZE_BYTES).toBe(256000);
  });

  it('G-2: Memvalidasi whitelist tipe MIME gambar (JPEG, PNG, WebP)', () => {
    expect(isValidImageMimeType('image/jpeg')).toBe(true);
    expect(isValidImageMimeType('image/png')).toBe(true);
    expect(isValidImageMimeType('image/webp')).toBe(true);

    // Tipe terlarang
    expect(isValidImageMimeType('image/gif')).toBe(false);
    expect(isValidImageMimeType('application/pdf')).toBe(false);
    expect(isValidImageMimeType('text/plain')).toBe(false);
  });

  it('G-3: Menghitung dimensi proporsional baru jika ukuran melebihi batas (Downscaling)', () => {
    // Gambar landscape 1920x1080 -> max dimension 1280
    const dims = calculateTargetDimensions(1920, 1080, 1280);
    expect(dims.width).toBe(1280);
    expect(dims.height).toBe(720); // 16:9 terjaga

    // Gambar portrait 1080x1920 -> max dimension 1280
    const portraitDims = calculateTargetDimensions(1080, 1920, 1280);
    expect(portraitDims.height).toBe(1280);
    expect(portraitDims.width).toBe(720);

    // Gambar kecil (800x600) tidak di-upscale
    const smallDims = calculateTargetDimensions(800, 600, 1280);
    expect(smallDims.width).toBe(800);
    expect(smallDims.height).toBe(600);
  });

  it('G-4: Mengonversi Data URL Base64 menjadi objek Blob dengan MIME type yang sesuai', () => {
    const sampleDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    const blob = dataUrlToBlob(sampleDataUrl);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/jpeg');
    expect(blob.size).toBeGreaterThan(0);
  });
});
