import type { CardFormat, SpeechKind, VerdictCardData } from '../contracts';
export interface MediaStorage {
  read(key: string): Promise<Uint8Array | null>;
  write(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  url(key: string): Promise<string>;
  deletePrefix(prefix: string): Promise<void>;
}
export interface TtsAuthorizationContext {
  text: string;
  toneDial: number;
  kind: SpeechKind;
}
export interface MediaRuntime {
  storage: MediaStorage;
  // Return null/false to deny. The backend must authenticate AND apply per-user limits.
  authorize(
    request: Request,
    action: 'avatar' | 'tts',
    speech?: TtsAuthorizationContext,
  ): Promise<{ userId: string } | null>;
  loadVerdict(caseId: string, format: CardFormat): Promise<VerdictCardData>;
  moderateImage(bytes: Uint8Array): Promise<{ safe: boolean; hasFace: boolean }>;
}
let runtime: Partial<MediaRuntime> = {};
export function configureMedia(adapters: Partial<MediaRuntime>) {
  runtime = { ...runtime, ...adapters };
}
export function resetMediaRuntime() {
  runtime = {};
}
export function adapter<K extends keyof MediaRuntime>(key: K): MediaRuntime[K] {
  const value = runtime[key];
  if (!value) throw new Error(`Part 4 integration missing: ${key}`);
  return value as MediaRuntime[K];
}
export function optionalAdapter<K extends keyof MediaRuntime>(key: K): MediaRuntime[K] | undefined {
  return runtime[key] as MediaRuntime[K] | undefined;
}
