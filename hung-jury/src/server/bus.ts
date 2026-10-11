import type { RoomEvent } from '@/contracts';
import { SERVER_CONFIG } from './constants';

/**
 * In-process realtime fan-out. One logical channel per case, named CONFIG.channel(caseId) in the
 * contracts. The SSE route is the transport: it attaches a subscriber and writes each frame.
 * Every published event gets a per-case sequence id so a client that reconnects with Last-Event-ID
 * resumes without a gap.
 */

export interface Frame {
  id: number;
  event: RoomEvent;
}

export interface Subscriber {
  handle: string;
  send(frame: Frame): void;
  close(): void;
}

interface Attached extends Subscriber {
  ready: boolean;
  queue: Frame[];
}

export interface Attachment {
  /** Send the snapshot frames, then anything published while the snapshot was being built. */
  ready(initial: Frame[]): void;
  detach(): void;
}

export class RoomBus {
  private seq = new Map<string, number>();
  private log = new Map<string, Frame[]>();
  private subs = new Map<string, Set<Attached>>();
  /** Set by the engine to react to arguers joining or leaving. */
  onPresence: ((caseId: string, handle: string, connections: number) => void) | null = null;

  currentSeq(caseId: string): number {
    return this.seq.get(caseId) ?? 0;
  }

  publish(caseId: string, event: RoomEvent): Frame {
    const frame: Frame = { id: this.currentSeq(caseId) + 1, event };
    this.seq.set(caseId, frame.id);
    const log = this.log.get(caseId) ?? [];
    log.push(frame);
    if (log.length > SERVER_CONFIG.sseReplayFrames)
      log.splice(0, log.length - SERVER_CONFIG.sseReplayFrames);
    this.log.set(caseId, log);
    for (const sub of [...(this.subs.get(caseId) ?? [])]) this.deliver(caseId, sub, frame);
    return frame;
  }

  private deliver(caseId: string, sub: Attached, frame: Frame) {
    if (!sub.ready) {
      sub.queue.push(frame);
      return;
    }
    try {
      sub.send(frame);
    } catch {
      this.remove(caseId, sub);
    }
  }

  /** Frames after `lastId`, or null when the client missed more than the log holds. */
  replaySince(caseId: string, lastId: number): Frame[] | null {
    const seq = this.currentSeq(caseId);
    if (!Number.isInteger(lastId) || lastId < 0 || lastId > seq) return null;
    if (lastId === seq) return [];
    const log = this.log.get(caseId) ?? [];
    if (!log.length || log[0].id > lastId + 1) return null;
    return log.filter((f) => f.id > lastId);
  }

  attach(caseId: string, subscriber: Subscriber): Attachment {
    const sub: Attached = { ...subscriber, ready: false, queue: [] };
    const set = this.subs.get(caseId) ?? new Set<Attached>();
    set.add(sub);
    this.subs.set(caseId, set);
    this.notify(caseId, sub.handle);
    return {
      ready: (initial) => {
        if (!set.has(sub)) return;
        try {
          for (const f of initial) sub.send(f);
          sub.ready = true;
          for (const f of sub.queue.splice(0)) sub.send(f);
        } catch {
          this.remove(caseId, sub);
        }
      },
      detach: () => this.remove(caseId, sub),
    };
  }

  private remove(caseId: string, sub: Attached) {
    const set = this.subs.get(caseId);
    if (!set || !set.delete(sub)) return;
    if (!set.size) this.subs.delete(caseId);
    this.notify(caseId, sub.handle);
  }

  private notify(caseId: string, handle: string) {
    try {
      this.onPresence?.(caseId, handle, this.connections(caseId, handle));
    } catch {
      // presence handling must never break a stream
    }
  }

  connections(caseId: string, handle: string): number {
    let n = 0;
    for (const s of this.subs.get(caseId) ?? []) if (s.handle === handle) n++;
    return n;
  }

  connectedHandles(caseId: string): string[] {
    return [...new Set([...(this.subs.get(caseId) ?? [])].map((s) => s.handle))];
  }

  /** Distinct connected handles that are not in `exclude` (the arguers). */
  viewers(caseId: string, exclude: string[]): string[] {
    return this.connectedHandles(caseId).filter((h) => !exclude.includes(h));
  }

  /** Close matching streams. Used after a safety event to remove spectators. */
  closeWhere(caseId: string, predicate: (handle: string) => boolean) {
    for (const sub of [...(this.subs.get(caseId) ?? [])]) {
      if (!predicate(sub.handle)) continue;
      this.remove(caseId, sub);
      try {
        sub.close();
      } catch {
        // already closed
      }
    }
  }
}
