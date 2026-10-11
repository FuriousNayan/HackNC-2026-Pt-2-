import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { CONFIG, MEDIA_CONFIG } from '../contracts';
import { moderateImage } from './moderation';
import { storage } from './storage';
export async function processAvatar(
  file: Blob,
): Promise<{ headImageUrl: string } | { error: 'no_face' | 'unsafe' }> {
  return processAvatarForOwner(file, 'unassigned');
}
// Part 2 must call this owner-aware extension through the route, then persist the URL/reference.
export async function processAvatarForOwner(
  file: Blob,
  owner: string,
): Promise<{ headImageUrl: string } | { error: 'no_face' | 'unsafe' }> {
  if (!/^[a-zA-Z0-9_-]+$/.test(owner)) throw new Error('Invalid avatar owner');
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    file.size === 0 ||
    file.size > MEDIA_CONFIG.maxUploadBytes
  )
    throw new Error('Use a PNG, JPEG, or WebP under 5 MB');
  const input = Buffer.from(await file.arrayBuffer());
  const image = sharp(input, { limitInputPixels: MEDIA_CONFIG.maxImagePixels });
  const metadata = await image.metadata();
  if (
    !['png', 'jpeg', 'webp'].includes(metadata.format ?? '') ||
    (metadata.pages && metadata.pages > 1)
  )
    throw new Error('Unsupported image');
  if (metadata.width !== CONFIG.avatar.headSizePx || metadata.height !== CONFIG.avatar.headSizePx)
    throw new Error('Upload only the 256px cropped head, never the original photo');
  // Re-encoding strips metadata. Moderate these exact bytes before storing anything.
  const bytes = await image.rotate().png().toBuffer(),
    result = await moderateImage(bytes);
  if (result.safe !== true) return { error: 'unsafe' };
  if (result.hasFace !== true) return { error: 'no_face' };
  const path = `heads/${owner}/${randomUUID()}.png`,
    store = storage();
  await store.write(path, bytes, 'image/png');
  return { headImageUrl: await store.url(path) };
}
export async function deleteAvatarHeads(owner: string): Promise<void> {
  if (!/^[a-zA-Z0-9_-]+$/.test(owner)) throw new Error('Invalid avatar owner');
  await storage().deletePrefix(`heads/${owner}`);
}
