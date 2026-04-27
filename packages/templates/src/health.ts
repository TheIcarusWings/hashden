// Health tracker for template sources.
//
// Tracks consecutive-failure count per source key. The stratum's per-group
// template loop calls recordSuccess() / recordFailure() based on each
// fetch attempt; should() exposes whether to keep trying or fall back to
// the platform default for that group.
//
// Pure in-memory; the stratum re-creates the tracker on restart. That's
// fine — the auto-fallback is a circuit breaker, not durable state.

export interface HealthOpts {
  /**
   * Fall back to platform-default after this many consecutive failures.
   * Default 3 (covers transient network blips while still reacting fast
   * if an operator's node truly went down).
   */
  failureThreshold?: number;
  /**
   * Once we've fallen back, retry the operator's source after this many
   * milliseconds. Default 60000 (1 minute).
   */
  retryAfterMs?: number;
  /** Wall-clock source for tests. Defaults to Date.now. */
  now?: () => number;
}

export interface HealthState {
  consecutiveFailures: number;
  /** ms timestamp of last failure (used for retry-backoff). */
  lastFailureAt: number | null;
  /** ms timestamp of last success (informational). */
  lastSuccessAt: number | null;
  /** Cached fallback decision; recomputed on each state change. */
  fallback: boolean;
}

export class TemplateSourceHealth {
  private readonly state = new Map<string, HealthState>();
  private readonly threshold: number;
  private readonly retryAfterMs: number;
  private readonly now: () => number;

  constructor(opts: HealthOpts = {}) {
    this.threshold = opts.failureThreshold ?? 3;
    this.retryAfterMs = opts.retryAfterMs ?? 60_000;
    this.now = opts.now ?? Date.now;
  }

  /** Should we try this source now, or fall back? */
  shouldFallback(key: string): boolean {
    const s = this.state.get(key);
    if (!s) return false;
    if (!s.fallback) return false;
    // After retryAfterMs since last failure, give the source another shot.
    if (
      s.lastFailureAt !== null &&
      this.now() - s.lastFailureAt >= this.retryAfterMs
    ) {
      return false;
    }
    return true;
  }

  recordSuccess(key: string): void {
    const s = this.getOrInit(key);
    s.consecutiveFailures = 0;
    s.lastSuccessAt = this.now();
    s.fallback = false;
  }

  recordFailure(key: string): void {
    const s = this.getOrInit(key);
    s.consecutiveFailures += 1;
    s.lastFailureAt = this.now();
    if (s.consecutiveFailures >= this.threshold) {
      s.fallback = true;
    }
  }

  /** Snapshot the state for a key (informational; exposed for dashboards). */
  inspect(key: string): HealthState | null {
    const s = this.state.get(key);
    return s ? { ...s } : null;
  }

  private getOrInit(key: string): HealthState {
    let s = this.state.get(key);
    if (!s) {
      s = {
        consecutiveFailures: 0,
        lastFailureAt: null,
        lastSuccessAt: null,
        fallback: false,
      };
      this.state.set(key, s);
    }
    return s;
  }
}
