/** Small in-memory sliding window limiter. Single process only, like the rest of the in-memory backend. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private readonly now: () => number = Date.now) {}

  /** Returns true and records the hit when allowed. */
  take(key: string, max: number, windowMs: number): boolean {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((x) => t - x < windowMs);
    if (recent.length >= max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(key, recent);
    return true;
  }

  /** Cooldown helper: one hit per `cooldownMs`. */
  cooldown(key: string, cooldownMs: number): boolean {
    return this.take(key, 1, cooldownMs);
  }

  sweep(maxAgeMs = 3_600_000) {
    const t = this.now();
    for (const [k, v] of this.hits) {
      const kept = v.filter((x) => t - x < maxAgeMs);
      if (kept.length) this.hits.set(k, kept);
      else this.hits.delete(k);
    }
  }
}
