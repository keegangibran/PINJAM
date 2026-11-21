/**
 * face-detection.ts
 * Utilitas deteksi wajah dan panduan framing untuk pendaftaran mandiri mahasiswa.
 * 
 * PENTING:
 * 1. Modul ini HANYA digunakan untuk memeriksa keberadaan wajah dan posisi framing
 *    (apakah wajah berada di tengah, tidak terlalu dekat, dan tidak terlalu jauh).
 * 2. DILARANG membuat facial recognition, pencocokan wajah otomatis, face embedding,
 *    atau identifikasi identitas berbasis biometrik.
 * 3. Tidak ada efek mirror / pembalikan horizontal.
 */

export interface FaceBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type FramingStatus =
  | 'NO_FACE'
  | 'TOO_FAR'
  | 'TOO_CLOSE'
  | 'OFF_CENTER'
  | 'PERFECT';

export interface FaceFramingResult {
  detected: boolean;
  isFramed: boolean;
  status: FramingStatus;
  message: string;
  box?: FaceBoundingBox;
}

export interface FramingGuideBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Mengevaluasi posisi bounding box wajah terhadap area panduan (oval/kotak).
 * Parameter toleransi disesuaikan agar andal dan ramah pengguna.
 */
export function evaluateFaceFraming(
  faceBox: FaceBoundingBox,
  guide: FramingGuideBounds,
  _frameWidth?: number,
  _frameHeight?: number
): FaceFramingResult {
  const faceCenterX = faceBox.x + faceBox.width / 2;
  const faceCenterY = faceBox.y + faceBox.height / 2;

  const guideCenterX = guide.x + guide.width / 2;
  const guideCenterY = guide.y + guide.height / 2;

  const widthRatio = faceBox.width / guide.width;

  // 1. Kriteria Jarak: Terlalu jauh (wajah < 45% lebar panduan)
  if (widthRatio < 0.45) {
    return {
      detected: true,
      isFramed: false,
      status: 'TOO_FAR',
      message: 'Wajah terlalu jauh. Silakan mendekat ke kamera.',
      box: faceBox,
    };
  }

  // 2. Kriteria Jarak: Terlalu dekat (wajah > 120% lebar panduan)
  if (widthRatio > 1.2) {
    return {
      detected: true,
      isFramed: false,
      status: 'TOO_CLOSE',
      message: 'Wajah terlalu dekat. Silakan mundur sedikit dari kamera.',
      box: faceBox,
    };
  }

  // 3. Kriteria Posisi: Offset pusat wajah dari pusat panduan
  const maxOffsetX = guide.width * 0.28;
  const maxOffsetY = guide.height * 0.28;

  const diffX = Math.abs(faceCenterX - guideCenterX);
  const diffY = Math.abs(faceCenterY - guideCenterY);

  if (diffX > maxOffsetX || diffY > maxOffsetY) {
    return {
      detected: true,
      isFramed: false,
      status: 'OFF_CENTER',
      message: 'Posisikan wajah tepat di tengah area lingkaran panduan.',
      box: faceBox,
    };
  }

  // 4. Kriteria Terpenuhi
  return {
    detected: true,
    isFramed: true,
    status: 'PERFECT',
    message: 'Posisi wajah sempurna! Silakan ambil foto.',
    box: faceBox,
  };
}

/**
 * Detektor wajah berbasis Shape Detection API bawaan browser jika didukung,
 * atau fallback analisis warna kulit & kontur piksel kanvas.
 */
export async function detectFaceInVideo(
  video: HTMLVideoElement,
  guide: FramingGuideBounds
): Promise<FaceFramingResult> {
  const videoWidth = video.videoWidth || 640;
  const videoHeight = video.videoHeight || 480;

  if (videoWidth === 0 || videoHeight === 0) {
    return {
      detected: false,
      isFramed: false,
      status: 'NO_FACE',
      message: 'Menyiapkan umpan kamera...',
    };
  }

  // 1. Coba Native Shape Detection API (window.FaceDetector) jika tersedia di browser
  if (typeof window !== 'undefined' && 'FaceDetector' in window) {
    try {
      const FaceDetectorConstructor = (window as unknown as {
        FaceDetector: new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
          detect: (source: ImageBitmapSource) => Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
        };
      }).FaceDetector;

      const detector = new FaceDetectorConstructor({ fastMode: true, maxDetectedFaces: 1 });
      const faces = await detector.detect(video);

      if (faces && faces.length > 0) {
        const rect = faces[0].boundingBox;
        const box: FaceBoundingBox = {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        };
        return evaluateFaceFraming(box, guide, videoWidth, videoHeight);
      }
    } catch {
      // Abaikan dan lanjutkan ke fallback
    }
  }

  // 2. Fallback: Analisis piksel rona kulit & kecerahan manusia pada kanvas beresolusi rendah
  try {
    const box = detectSkinCluster(video, videoWidth, videoHeight);
    if (box) {
      return evaluateFaceFraming(box, guide, videoWidth, videoHeight);
    }
  } catch {
    // Abaikan error kanvas
  }

  return {
    detected: false,
    isFramed: false,
    status: 'NO_FACE',
    message: 'Arahkan wajah ke dalam area panduan dengan pencahayaan cukup.',
  };
}

/**
 * Detektor rona kulit dan klaster wajah berbasis kanvas (fallback ringan cross-browser).
 * Menggunakan kanvas mini (160x120) agar hemat memori dan berjalan < 5ms.
 */
function detectSkinCluster(
  video: HTMLVideoElement,
  origWidth: number,
  origHeight: number
): FaceBoundingBox | null {
  const sampleWidth = 160;
  const sampleHeight = Math.round((origHeight / origWidth) * sampleWidth);

  const canvas = document.createElement('canvas');
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // DILARANG mirror / flip horizontal (transform normal)
  ctx.drawImage(video, 0, 0, sampleWidth, sampleHeight);

  const imgData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
  const data = imgData.data;

  let minX = sampleWidth;
  let maxX = 0;
  let minY = sampleHeight;
  let maxY = 0;
  let skinPixelCount = 0;

  // Model segmentasi warna kulit RGB standar:
  // R > 95, G > 40, B > 20, max(R,G,B) - min(R,G,B) > 15, |R - G| > 15, R > G, R > B
  for (let y = 0; y < sampleHeight; y++) {
    for (let x = 0; x < sampleWidth; x++) {
      const idx = (y * sampleWidth + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);

      if (
        r > 95 &&
        g > 40 &&
        b > 20 &&
        max - min > 15 &&
        Math.abs(r - g) > 15 &&
        r > g &&
        r > b
      ) {
        skinPixelCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Ambang batas: Klaster kulit harus mencakup area minimal
  const minPixels = (sampleWidth * sampleHeight) * 0.04;
  if (skinPixelCount < minPixels || minX >= maxX || minY >= maxY) {
    return null;
  }

  // Hitung titik berat (centroid) dan densitas piksel untuk mengeliminasi noise latar/tangan
  let sumX = 0;
  let sumY = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const idx = (y * sampleWidth + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);

      if (
        r > 95 &&
        g > 40 &&
        b > 20 &&
        max - min > 15 &&
        Math.abs(r - g) > 15 &&
        r > g &&
        r > b
      ) {
        sumX += x;
        sumY += y;
      }
    }
  }

  const centroidX = sumX / skinPixelCount;
  const centroidY = sumY / skinPixelCount;

  // Filter outlier jika pusat massa terlalu mendekati tepi bawah (misal tangan di atas meja)
  if (centroidY > sampleHeight * 0.88) {
    return null;
  }

  const clusterWidth = maxX - minX;
  const clusterHeight = maxY - minY;
  const boundingArea = clusterWidth * clusterHeight;

  // Densitas piksel kulit di dalam bounding box minimal 20% (menolak piksel terpencar acak)
  const density = skinPixelCount / boundingArea;
  if (density < 0.20) {
    return null;
  }

  // Rasio aspek wajah manusia berkisar antara 0.75 s.d 2.2
  const ratio = clusterHeight / clusterWidth;
  if (ratio < 0.75 || ratio > 2.2) {
    return null;
  }

  // Skalakan koordinat kembali ke resolusi video asli
  const scaleX = origWidth / sampleWidth;
  const scaleY = origHeight / sampleHeight;

  return {
    x: minX * scaleX,
    y: minY * scaleY,
    width: clusterWidth * scaleX,
    height: clusterHeight * scaleY,
  };
}
