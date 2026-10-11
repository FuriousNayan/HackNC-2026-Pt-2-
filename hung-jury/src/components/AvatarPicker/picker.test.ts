// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AvatarPicker } from './index';
import { cropHead } from '../../media/crop';
vi.mock('../../media/crop', () => ({ cropHead: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined, host: HTMLDivElement;
const crop = vi.mocked(cropHead);
let fetchMock: ReturnType<typeof vi.fn>,
  revoke: ReturnType<typeof vi.fn>,
  getUserMedia: ReturnType<typeof vi.fn>;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  crop.mockReset();
  crop.mockResolvedValue(new Blob(['cropped-face'], { type: 'image/png' }));
  fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ headImageUrl: 'https://media.test/head.png' }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  revoke = vi.fn();
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:cropped-head'),
  });
  getUserMedia = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function mount(defaultKind: 'avatar' | 'photo' | 'webcam' = 'avatar') {
  const onDone = vi.fn();
  await act(async () => root!.render(createElement(AvatarPicker, { defaultKind, onDone })));
  return onDone;
}
function button(label: string) {
  const found = [...host.querySelectorAll('button')].find((b) => b.textContent === label);
  if (!found) throw new Error('Missing ' + label);
  return found;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
async function chooseFile() {
  const input = host.querySelector('input')!;
  const file = new File(['original-private-photo-with-extra-data'], 'photo.png', {
    type: 'image/png',
  });
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  return file;
}
function media() {
  const stop = vi.fn();
  return { stop, stream: { getTracks: () => [{ stop }] } as unknown as MediaStream };
}
describe('partner avatar picker lifecycle', () => {
  it('presets work locally without cropping, camera or upload', async () => {
    const onDone = await mount();
    expect(host.querySelectorAll('.avatar-grid button')).toHaveLength(6);
    await click('Use this avatar');
    expect(onDone).toHaveBeenCalledOnce();
    expect(onDone.mock.calls[0][0].kind).toBe('avatar');
    expect(crop).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getUserMedia).not.toHaveBeenCalled();
  });
  it('uploads only the cropped head and returns the partner callback shape', async () => {
    const onDone = await mount('photo'),
      file = await chooseFile();
    expect(crop).toHaveBeenCalledWith(file);
    await click('Use this avatar');
    const form = fetchMock.mock.calls[0][1].body as FormData;
    const uploaded = form.get('file') as File;
    expect(uploaded.size).toBe('cropped-face'.length);
    expect(uploaded.name).toBe('head.png');
    expect(uploaded.type).toBe('image/png');
    expect(onDone).toHaveBeenCalledWith({
      kind: 'photo',
      headImageUrl: 'https://media.test/head.png',
    });
  });
  it('clears the previous crop when a replacement photo has no face', async () => {
    await mount('photo');
    await chooseFile();
    expect(button('Use this avatar').disabled).toBe(false);
    crop.mockResolvedValueOnce(null);
    await chooseFile();
    expect(button('Use this avatar').disabled).toBe(true);
    expect(host.textContent).toContain('No face found');
    expect(revoke).toHaveBeenCalledWith('blob:cropped-head');
    await click('Use this avatar');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('camera denial leaves presets available and sends no photo', async () => {
    getUserMedia.mockRejectedValueOnce(new Error('Denied'));
    await mount('webcam');
    await click('Start camera');
    expect(host.textContent).toContain('Camera permission denied');
    await click('Presets');
    expect(host.querySelectorAll('.avatar-grid button')).toHaveLength(6);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('stops a camera granted after the component has unmounted', async () => {
    let release!: (value: MediaStream) => void;
    getUserMedia.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const m = media();
    await mount('webcam');
    await click('Start camera');
    await act(async () => root!.unmount());
    root = undefined;
    await act(async () => release(m.stream));
    expect(m.stop).toHaveBeenCalledOnce();
  });
  it('stops tracks when canceling, switching tabs and unmounting', async () => {
    const first = media(),
      second = media(),
      third = media();
    getUserMedia
      .mockResolvedValueOnce(first.stream)
      .mockResolvedValueOnce(second.stream)
      .mockResolvedValueOnce(third.stream);
    await mount('webcam');
    await click('Start camera');
    expect(button('Use this avatar').disabled).toBe(true);
    await click('Cancel camera');
    expect(first.stop).toHaveBeenCalledOnce();
    await click('Start camera');
    await click('Presets');
    expect(second.stop).toHaveBeenCalledOnce();
    await click('Webcam');
    await click('Start camera');
    await act(async () => root!.unmount());
    root = undefined;
    expect(third.stop).toHaveBeenCalledOnce();
  });
  it('stops capture immediately and disables submission while encoding', async () => {
    const m = media();
    getUserMedia.mockResolvedValueOnce(m.stream);
    let encode!: (blob: Blob | null) => void;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      encode = callback;
    });
    await mount('webcam');
    await click('Start camera');
    const video = host.querySelector('video')!;
    Object.defineProperty(video, 'videoWidth', { value: 640 });
    Object.defineProperty(video, 'videoHeight', { value: 480 });
    await click('Capture');
    expect(m.stop).toHaveBeenCalledOnce();
    expect(button('Use this avatar').disabled).toBe(true);
    expect(crop).not.toHaveBeenCalled();
    await act(async () => encode(new Blob(['snapshot'], { type: 'image/jpeg' })));
    expect(crop).toHaveBeenCalledOnce();
    expect(button('Use this avatar').disabled).toBe(false);
  });
  it('clears the previous webcam head on retake and reports failed encoding', async () => {
    const first = media(),
      second = media();
    getUserMedia.mockResolvedValueOnce(first.stream).mockResolvedValueOnce(second.stream);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    const encode = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((cb) => cb(new Blob(['snapshot'], { type: 'image/jpeg' })));
    await mount('webcam');
    await click('Start camera');
    const v = host.querySelector('video')!;
    Object.defineProperty(v, 'videoWidth', { value: 640 });
    Object.defineProperty(v, 'videoHeight', { value: 480 });
    await click('Capture');
    expect(button('Use this avatar').disabled).toBe(false);
    await click('Retake');
    expect(button('Use this avatar').disabled).toBe(true);
    expect(revoke).toHaveBeenCalled();
    const next = host.querySelector('video')!;
    Object.defineProperty(next, 'videoWidth', { value: 640 });
    Object.defineProperty(next, 'videoHeight', { value: 480 });
    encode.mockImplementationOnce((cb) => cb(null));
    await click('Capture');
    expect(host.textContent).toContain('Camera capture failed');
    expect(button('Use this avatar').disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not invoke onDone after an in-flight upload unmounts', async () => {
    let finish!: (value: unknown) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const onDone = await mount('photo');
    await chooseFile();
    await click('Use this avatar');
    await act(async () => root!.unmount());
    root = undefined;
    await act(async () => finish({ ok: true, json: async () => ({ headImageUrl: 'late' }) }));
    expect(onDone).not.toHaveBeenCalled();
  });
  it('refuses malformed upload success replies', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const onDone = await mount('photo');
    await chooseFile();
    await click('Use this avatar');
    expect(onDone).not.toHaveBeenCalled();
    expect(host.textContent).toContain('did not return a head image');
  });
});
