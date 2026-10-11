import { CONFIG, MEDIA_CONFIG } from '../contracts';
import type { FaceDetector } from '@mediapipe/tasks-vision';
let detector: Promise<FaceDetector> | undefined;
async function getDetector() {
  if (!detector)
    detector = (async () => {
      const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
      return FaceDetector.createFromOptions(
        await FilesetResolver.forVisionTasks(MEDIA_CONFIG.wasmUrl),
        {
          baseOptions: { modelAssetPath: MEDIA_CONFIG.faceModelUrl },
          runningMode: 'IMAGE',
          minDetectionConfidence: 0.5,
        },
      );
    })();
  try {
    return await detector;
  } catch (error) {
    detector = undefined;
    throw error;
  }
}
export async function cropHead(file: Blob): Promise<Blob | null> {
  if (file.size > MEDIA_CONFIG.maxUploadBytes) throw new Error('Choose an image under 5 MB');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > MEDIA_CONFIG.maxImagePixels)
      throw new Error('Image is too large');
    const faces = (await getDetector()).detect(bitmap).detections;
    const box = faces.sort(
      (a, b) =>
        (b.boundingBox?.width ?? 0) * (b.boundingBox?.height ?? 0) -
        (a.boundingBox?.width ?? 0) * (a.boundingBox?.height ?? 0),
    )[0]?.boundingBox;
    if (!box) return null;
    const side = Math.min(
      Math.max(box.width, box.height) * MEDIA_CONFIG.cropPadding,
      bitmap.width,
      bitmap.height,
    );
    const x = Math.min(Math.max(box.originX + box.width / 2 - side / 2, 0), bitmap.width - side),
      y = Math.min(Math.max(box.originY + box.height / 2 - side / 2, 0), bitmap.height - side);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = CONFIG.avatar.headSizePx;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(bitmap, x, y, side, side, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Crop failed'))),
        'image/png',
      ),
    );
  } finally {
    bitmap.close();
  }
}
