import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { localStorage } from '../../scripts/local-storage';
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
it('local demo storage accepts relative roots and cleans only the requested owner', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jury-cache-'));
  roots.push(root);
  const store = localStorage(relative(process.cwd(), root));
  await store.write('heads/one/a.png', new Uint8Array([1]), 'image/png');
  await store.write('heads/two/b.png', new Uint8Array([2]), 'image/png');
  expect(await store.url('heads/one/a.png')).toBe(join(root, 'heads/one/a.png'));
  await store.deletePrefix('heads/one');
  expect(await store.read('heads/one/a.png')).toBeNull();
  expect(Array.from((await store.read('heads/two/b.png'))!)).toEqual([2]);
});
it('local cache rejects paths that escape its configured root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jury-cache-'));
  roots.push(root);
  const store = localStorage(root);
  await expect(store.write('../escape', new Uint8Array(), 'image/png')).rejects.toThrow(
    'Invalid cache key',
  );
  await expect(store.deletePrefix('..')).rejects.toThrow('Invalid cache key');
});
