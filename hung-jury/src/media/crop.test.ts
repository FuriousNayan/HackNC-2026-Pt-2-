import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ resolver: vi.fn(), create: vi.fn(), detect: vi.fn() }));
vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: mock.resolver },
  FaceDetector: { createFromOptions: mock.create },
}));
let close: ReturnType<typeof vi.fn>,
  draw: ReturnType<typeof vi.fn>,
  encode: ReturnType<typeof vi.fn>,
  canvas: {
    width: number;
    height: number;
    getContext: () => unknown;
    toBlob: ReturnType<typeof vi.fn>;
  };
beforeEach(() => {
  vi.resetModules();
  mock.resolver.mockReset().mockResolvedValue({});
  mock.create.mockReset().mockResolvedValue({ detect: mock.detect });
  mock.detect.mockReset().mockReturnValue({ detections: [] });
  close = vi.fn();
  draw = vi.fn();
  encode = vi.fn((cb) => cb(new Blob(['cropped'], { type: 'image/png' })));
  canvas = { width: 0, height: 0, getContext: () => ({ drawImage: draw }), toBlob: encode };
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 640, height: 480, close })),
  );
  vi.stubGlobal('document', { createElement: () => canvas });
});
afterEach(() => vi.unstubAllGlobals());
it('loads face detection only on crop request and chooses the largest face', async () => {
  const { cropHead } = await import('./crop');
  expect(mock.resolver).not.toHaveBeenCalled();
  mock.detect.mockReturnValue({
    detections: [
      { boundingBox: { originX: 10, originY: 10, width: 20, height: 20 } },
      { boundingBox: { originX: 500, originY: 370, width: 100, height: 100 } },
    ],
  });
  expect((await cropHead(new Blob(['photo'])))?.type).toBe('image/png');
  expect(canvas.width).toBe(256);
  expect(canvas.height).toBe(256);
  expect(draw.mock.calls[0].slice(1)).toEqual([477.5, 335, 145, 145, 0, 0, 256, 256]);
  expect(close).toHaveBeenCalledOnce();
});
it('returns no face without creating an upload and releases the bitmap', async () => {
  const { cropHead } = await import('./crop');
  expect(await cropHead(new Blob(['photo']))).toBeNull();
  expect(draw).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});
it('rejects images above the pixel limit before initializing detection', async () => {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 8000, height: 8000, close })),
  );
  const { cropHead } = await import('./crop');
  await expect(cropHead(new Blob(['photo']))).rejects.toThrow('too large');
  expect(mock.create).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});
it('retries failed lazy detector initialization on the next picture', async () => {
  mock.create
    .mockRejectedValueOnce(new Error('Model load failed'))
    .mockResolvedValueOnce({ detect: mock.detect });
  const { cropHead } = await import('./crop');
  await expect(cropHead(new Blob(['photo']))).rejects.toThrow('Model load failed');
  expect(await cropHead(new Blob(['next']))).toBeNull();
  expect(mock.create).toHaveBeenCalledTimes(2);
  expect(close).toHaveBeenCalledTimes(2);
});
it('rejects failed PNG encoding and releases the bitmap', async () => {
  mock.detect.mockReturnValue({
    detections: [{ boundingBox: { originX: 0, originY: 0, width: 100, height: 100 } }],
  });
  encode.mockImplementation((cb) => cb(null));
  const { cropHead } = await import('./crop');
  await expect(cropHead(new Blob(['photo']))).rejects.toThrow('Crop failed');
  expect(close).toHaveBeenCalledOnce();
});
