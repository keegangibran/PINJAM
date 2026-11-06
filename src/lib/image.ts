/**
 * Modul Kompresi & Pemrosesan Gambar Sisi Klien (NFR-02)
 * Target ukuran maksimal berkas foto: <= 250 KB.
 * Format yang didukung: image/jpeg, image/png, image/webp.
 */

export const MAX_PHOTO_SIZE_BYTES = 250 * 1024; // 250 KB
export const DEFAULT_MAX_DIMENSION = 1280; // Maksimal lebar / tinggi 1280px

export interface CompressionOptions {
  maxDimension?: number;
  initialQuality?: number;
  minQuality?: number;
  targetMaxBytes?: number;
  mimeType?: 'image/jpeg' | 'image/webp';
}

/**
 * Menghitung perkiraan ukuran biner (dalam bytes) dari string data URL Base64.
 */
export function getBase64SizeBytes(dataUrl: string): number {
  if (!dataUrl) return 0;
  const commaIndex = dataUrl.indexOf(',');
  const base64Data = commaIndex !== -1 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  const padding = base64Data.endsWith('==') ? 2 : base64Data.endsWith('=') ? 1 : 0;
  return Math.floor((base64Data.length * 3) / 4) - padding;
}

/**
 * Memvalidasi apakah tipe MIME gambar diperbolehkan oleh kebijakan Supabase Storage.
 */
export function isValidImageMimeType(mimeType: string): boolean {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  return allowed.includes(mimeType.toLowerCase());
}

/**
 * Mengonversi Data URL Base64 menjadi Blob.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);

  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }

  return new Blob([u8arr], { type: mime });
}

/**
 * Mengompresi elemen gambar (HTMLImageElement) atau Kanvas ke Data URL Base64
 * dengan kompresi iteratif hingga ukuran <= targetMaxBytes (default 250 KB).
 */
export async function compressCanvasToDataUrl(
  canvas: HTMLCanvasElement,
  options?: CompressionOptions
): Promise<{ dataUrl: string; sizeBytes: number; qualityUsed: number }> {
  const targetMaxBytes = options?.targetMaxBytes ?? MAX_PHOTO_SIZE_BYTES;
  const mimeType = options?.mimeType ?? 'image/jpeg';
  let quality = options?.initialQuality ?? 0.85;
  const minQuality = options?.minQuality ?? 0.4;

  let dataUrl = canvas.toDataURL(mimeType, quality);
  let sizeBytes = getBase64SizeBytes(dataUrl);

  // Jika ukuran melebihi target, turunkan kualitas secara bertahap
  while (sizeBytes > targetMaxBytes && quality > minQuality) {
    quality = Math.max(minQuality, quality - 0.1);
    dataUrl = canvas.toDataURL(mimeType, quality);
    sizeBytes = getBase64SizeBytes(dataUrl);
  }

  return {
    dataUrl,
    sizeBytes,
    qualityUsed: quality,
  };
}

/**
 * Mengubah ukuran gambar ke dimensi proporsional baru jika melebihi batas maksimal.
 */
export function calculateTargetDimensions(
  originalWidth: number,
  originalHeight: number,
  maxDimension: number = DEFAULT_MAX_DIMENSION
): { width: number; height: number } {
  if (originalWidth <= maxDimension && originalHeight <= maxDimension) {
    return { width: originalWidth, height: originalHeight };
  }

  if (originalWidth > originalHeight) {
    const ratio = maxDimension / originalWidth;
    return {
      width: maxDimension,
      height: Math.round(originalHeight * ratio),
    };
  } else {
    const ratio = maxDimension / originalHeight;
    return {
      width: Math.round(originalWidth * ratio),
      height: maxDimension,
    };
  }
}

