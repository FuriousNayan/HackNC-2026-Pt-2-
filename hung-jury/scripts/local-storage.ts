import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type { MediaStorage } from '../src/media/runtime';
export function localStorage(root = resolve('.media-cache')): MediaStorage {
  root = resolve(root);
  function path(key: string) {
    const p = resolve(root, key);
    if (!p.startsWith(root + sep)) throw new Error('Invalid cache key');
    return p;
  }
  return {
    async read(key) {
      try {
        return await readFile(path(key));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw e;
      }
    },
    async write(key, bytes) {
      const p = path(key);
      await mkdir(resolve(p, '..'), { recursive: true });
      await writeFile(p, bytes);
    },
    async url(key) {
      return path(key);
    },
    async deletePrefix(key) {
      await rm(path(key), { recursive: true, force: true });
    },
  };
}
