import { createClient } from '@supabase/supabase-js';
import { MEDIA_CONFIG } from '../contracts';
import { optionalAdapter, type MediaStorage } from './runtime';
let defaultStorage: MediaStorage | undefined;
export function storage(): MediaStorage {
  const injected = optionalAdapter('storage');
  if (injected) return injected;
  if (defaultStorage) return defaultStorage;
  const e = MEDIA_CONFIG.env,
    url = process.env[e.supabaseUrl],
    key = process.env[e.serviceKey],
    bucket = process.env[e.bucket];
  if (!url || !key || !bucket)
    throw new Error('Configure Supabase media storage or inject a MediaStorage adapter');
  const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    s = client.storage.from(bucket);
  defaultStorage = {
    async read(path) {
      const { data, error } = await s.download(path);
      if (error) {
        if (
          String(error.statusCode) === '404' ||
          (String(error.statusCode) === '400' && error.message === 'Object not found')
        )
          return null;
        throw new Error('Media cache read failed');
      }
      return new Uint8Array(await data.arrayBuffer());
    },
    async write(path, bytes, contentType) {
      const { error } = await s.upload(path, bytes, { contentType, upsert: true });
      if (error) throw new Error('Media storage upload failed');
    },
    async url(path) {
      const { data, error } = await s.createSignedUrl(path, MEDIA_CONFIG.signedUrlSeconds);
      if (error) throw new Error('Media URL creation failed');
      return data.signedUrl;
    },
    async deletePrefix(prefix) {
      const paths: string[] = [];
      let offset = 0;
      while (true) {
        const { data, error } = await s.list(prefix, {
          limit: 100,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        });
        if (error) throw new Error('Media cleanup listing failed');
        if (!data?.length) break;
        for (const item of data) {
          if (!item.id) throw new Error('Cleanup expects a flat upload prefix');
          paths.push(`${prefix}/${item.name}`);
        }
        offset += data.length;
      }
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await s.remove(paths.slice(i, i + 100));
        if (error) throw new Error('Media cleanup failed');
      }
    },
  };
  return defaultStorage;
}
