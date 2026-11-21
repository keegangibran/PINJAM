import { describe, it, expect } from 'vitest';
import {
  evaluateFaceFraming,
  detectFaceInVideo,
  type FaceBoundingBox,
  type FramingGuideBounds,
} from '@/lib/face-detection';

describe('Face Detection & Framing Evaluation Module (src/lib/face-detection.ts)', () => {
  const guide: FramingGuideBounds = {
    x: 200,
    y: 100,
    width: 200,
    height: 280,
  };

  it('1. Returns TOO_FAR when face bounding box is too small compared to guide (< 45%)', () => {
    const tinyFace: FaceBoundingBox = {
      x: 260,
      y: 200,
      width: 80, // 80 / 200 = 0.40 (< 0.45)
      height: 110,
    };

    const result = evaluateFaceFraming(tinyFace, guide, 640, 480);

    expect(result.detected).toBe(true);
    expect(result.isFramed).toBe(false);
    expect(result.status).toBe('TOO_FAR');
    expect(result.message).toContain('terlalu jauh');
  });

  it('2. Returns TOO_CLOSE when face bounding box is too large compared to guide (> 120%)', () => {
    const largeFace: FaceBoundingBox = {
      x: 170,
      y: 70,
      width: 260, // 260 / 200 = 1.30 (> 1.20)
      height: 340,
    };

    const result = evaluateFaceFraming(largeFace, guide, 640, 480);

    expect(result.detected).toBe(true);
    expect(result.isFramed).toBe(false);
    expect(result.status).toBe('TOO_CLOSE');
    expect(result.message).toContain('terlalu dekat');
  });

  it('3. Returns OFF_CENTER when face is not aligned with guide center', () => {
    const offCenterFace: FaceBoundingBox = {
      x: 50, // shifted significantly to the left
      y: 100,
      width: 150,
      height: 210,
    };

    const result = evaluateFaceFraming(offCenterFace, guide, 640, 480);

    expect(result.detected).toBe(true);
    expect(result.isFramed).toBe(false);
    expect(result.status).toBe('OFF_CENTER');
    expect(result.message).toContain('tengah');
  });

  it('4. Returns PERFECT and isFramed: true when face size and position match guide bounds', () => {
    // Guide center: x = 200 + 100 = 300, y = 100 + 140 = 240
    // Face center: x = 225 + 75 = 300, y = 135 + 105 = 240
    // Face width: 150 (150 / 200 = 0.75, ideal distance)
    const idealFace: FaceBoundingBox = {
      x: 225,
      y: 135,
      width: 150,
      height: 210,
    };

    const result = evaluateFaceFraming(idealFace, guide, 640, 480);

    expect(result.detected).toBe(true);
    expect(result.isFramed).toBe(true);
    expect(result.status).toBe('PERFECT');
    expect(result.message).toContain('sempurna');
  });

  it('5. detectFaceInVideo handles uninitialized video stream gracefully', async () => {
    const mockVideo = {
      videoWidth: 0,
      videoHeight: 0,
    } as unknown as HTMLVideoElement;

    const result = await detectFaceInVideo(mockVideo, guide);

    expect(result.detected).toBe(false);
    expect(result.isFramed).toBe(false);
    expect(result.status).toBe('NO_FACE');
  });
});
