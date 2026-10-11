import type { RecordedEvent, RoomEvent } from '@/contracts';

export type JumpTarget = 'statements' | 'cross' | 'verdict' | 'ruling' | 'safety';

type Listener = (event: RoomEvent) => void;
type ResetListener = () => void;

/**
 * Replays a recorded trial of { atMs, event }. Same event shapes as the live channel,
 * so the UI cannot tell the difference.
 */
export class MockPlayer {
  private events: RecordedEvent[];
  private index = 0;
  private clock = 0; // virtual ms since start
  private timer: ReturnType<typeof setTimeout> | null = null;
  private startedAt = 0;
  private playing = false;
  private onEvent: Listener;
  private onReset: ResetListener;

  constructor(events: RecordedEvent[], onEvent: Listener, onReset: ResetListener) {
    this.events = [...events].sort((a, b) => a.atMs - b.atMs);
    this.onEvent = onEvent;
    this.onReset = onReset;
  }

  get isPlaying() {
    return this.playing;
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    this.startedAt = Date.now() - this.clock;
    this.schedule();
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    this.clock = Date.now() - this.startedAt;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  restart() {
    this.pause();
    this.index = 0;
    this.clock = 0;
    this.onReset();
    this.play();
  }

  /** Reset, then synchronously fast-forward to the first event of the target phase. */
  jump(target: JumpTarget) {
    this.pause();
    this.onReset();
    this.index = 0;
    const stop = this.findTargetIndex(target);
    for (let i = 0; i < stop; i += 1) this.onEvent(this.events[i].event);
    this.index = stop;
    this.clock = stop > 0 ? this.events[stop - 1].atMs : 0;
    this.play();
  }

  destroy() {
    this.pause();
  }

  private findTargetIndex(target: JumpTarget): number {
    const idx = this.events.findIndex(({ event }) => {
      if (target === 'safety') return event.type === 'safety';
      if (target === 'ruling') return event.type === 'judge' && event.verdict !== null;
      if (target === 'verdict') return event.type === 'state' && event.phase === 'verdict';
      if (target === 'cross') return event.type === 'state' && event.phase === 'cross';
      return event.type === 'state' && event.phase === 'statements';
    });
    if (idx === -1) return this.events.length;
    // 'ruling' stops after the verdict event so the popup is already showing
    return target === 'ruling' ? idx + 1 : idx;
  }

  private schedule() {
    if (!this.playing || this.index >= this.events.length) {
      if (this.index >= this.events.length) this.playing = false;
      return;
    }
    const next = this.events[this.index];
    const elapsed = Date.now() - this.startedAt;
    const wait = Math.max(0, next.atMs - elapsed);
    this.timer = setTimeout(() => {
      this.onEvent(next.event);
      this.index += 1;
      this.schedule();
    }, wait);
  }
}
