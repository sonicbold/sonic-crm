/**
 * Shared AI request pool for Finder enrichment.
 *
 * Groq GPT-OSS 120B defaults: 30 RPM, 1,000 RPD per key.
 * Three Groq keys are three independent slots. Override with FINDER_* env vars.
 *
 * Override with FINDER_GROQ_RPM, FINDER_GROQ_RPD, FINDER_GEMINI_RPM,
 * FINDER_GEMINI_RPD, FINDER_OPENROUTER_RPM, FINDER_OPENROUTER_RPD,
 * FINDER_AI_MIN_DELAY_MS.
 */

export type AiUsage = {
  promptTokens: number;
  completionTokens: number;
};

export type AiCompleteCall = {
  system: string;
  user: string;
  json?: boolean;
  jsonSchema?: Record<string, unknown>;
  /** Groq model id. Finder name detection uses openai/gpt-oss-120b. */
  model?: string;
};

export type AiCompleteResult = {
  text: string;
  provider: string;
  usage?: AiUsage;
};

export type AiPoolStatus = {
  provider: string;
  nextRequestInMs: number;
};

export type AiProviderConfig = {
  id: string;
  label: string;
  family: "gemini" | "groq" | "openrouter";
  rpm: number;
  rpd: number;
  /** In-flight requests allowed on this key. Default 1. */
  maxConcurrent?: number;
  complete: (call: AiCompleteCall) => Promise<string | { text: string; usage?: AiUsage }>;
};

export type AiPoolLimits = {
  minDelayMs: number;
  groqRpm: number;
  groqRpd: number;
  geminiRpm: number;
  geminiRpd: number;
  openrouterRpm: number;
  openrouterRpd: number;
};

export type AiPoolOptions = {
  providers: AiProviderConfig[];
  minDelayMs: number;
  target?: number;
  getRemainingLeads?: () => number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onStatus?: (status: AiPoolStatus) => void;
};

export class RateLimitError extends Error {
  readonly status = 429;
  readonly retryAfterMs: number;
  readonly daily: boolean;

  constructor(message: string, opts?: { retryAfterMs?: number; daily?: boolean }) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterMs = Math.max(250, opts?.retryAfterMs ?? 60_000);
    this.daily = Boolean(opts?.daily);
  }
}

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function loadAiPoolLimits(): AiPoolLimits {
  return {
    minDelayMs: envInt("FINDER_AI_MIN_DELAY_MS", 0),
    groqRpm: envInt("FINDER_GROQ_RPM", 30),
    groqRpd: envInt("FINDER_GROQ_RPD", 1000),
    geminiRpm: envInt("FINDER_GEMINI_RPM", 10),
    geminiRpd: envInt("FINDER_GEMINI_RPD", 250),
    openrouterRpm: envInt("FINDER_OPENROUTER_RPM", 10_000),
    openrouterRpd: envInt("FINDER_OPENROUTER_RPD", 1_000_000),
  };
}

export function nextUtcMidnight(nowMs: number): number {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

export function parseRetryAfterMs(value: unknown, fallbackMs = 60_000): number {
  if (value === null || value === undefined || value === "") return fallbackMs;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1000 ? value : Math.max(250, value * 1000);
  }
  const raw = String(value).trim();
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds > 1000 ? seconds : Math.max(250, seconds * 1000);
  }
  const date = Date.parse(raw);
  if (Number.isFinite(date)) return Math.max(250, date - Date.now());
  return fallbackMs;
}

export function retryAfterFromMessage(message: string, fallbackMs = 60_000): number {
  const text = message.toLowerCase();
  const msMatch = text.match(/try again in\s+(\d+(?:\.\d+)?)\s*ms/i);
  if (msMatch) return Math.max(250, Number(msMatch[1]));
  const secMatch = text.match(/try again in\s+(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?/i);
  if (secMatch) return Math.max(250, Number(secMatch[1]) * 1000);
  const minMatch = text.match(/try again in\s+(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?/i);
  if (minMatch) return Math.max(250, Number(minMatch[1]) * 60_000);
  return fallbackMs;
}

function errorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const rec = err as { status?: unknown; statusCode?: unknown };
  const n = Number(rec.status ?? rec.statusCode);
  return Number.isFinite(n) ? n : undefined;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function isDailyLimitMessage(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes("per day") ||
    text.includes("daily") ||
    /\brpd\b/.test(text) ||
    text.includes("tokens per day") ||
    text.includes("requests per day")
  );
}

/** Gemini 503s and similar outages should move the call to the next key. */
export function isTransientProviderError(err: unknown): boolean {
  const status = errorStatus(err);
  if (status === 500 || status === 502 || status === 503 || status === 504) return true;
  const msg = errorMessage(err).toLowerCase();
  return (
    /\bfailed \(50[0234]\)/.test(msg) ||
    msg.includes("high demand") ||
    msg.includes("unavailable") ||
    msg.includes("overloaded") ||
    msg.includes("try again later")
  );
}

export function isRequestTooLarge(err: unknown): boolean {
  if (errorStatus(err) === 413) return true;
  const msg = errorMessage(err).toLowerCase();
  return msg.includes("request too large") || (msg.includes("413") && msg.includes("tpm"));
}

export function isRateLimitError(err: unknown): boolean {
  if (err instanceof RateLimitError) return true;
  if (isRequestTooLarge(err)) return false;
  if (errorStatus(err) === 429) return true;
  const msg = errorMessage(err).toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("rate_limit") ||
    (msg.includes("rpm") && msg.includes("limit"))
  );
}

export function toRateLimitError(err: unknown, source = "AI provider"): RateLimitError {
  if (err instanceof RateLimitError) return err;
  const msg = errorMessage(err);
  const headers =
    err && typeof err === "object"
      ? ((err as { headers?: Record<string, string> | Headers }).headers ?? undefined)
      : undefined;
  let retryAfterMs: number | undefined;
  if (headers) {
    const value =
      typeof (headers as Headers).get === "function"
        ? (headers as Headers).get("retry-after")
        : (headers as Record<string, string>)["retry-after"] ||
          (headers as Record<string, string>)["Retry-After"];
    if (value) retryAfterMs = parseRetryAfterMs(value);
  }
  if (retryAfterMs === undefined) retryAfterMs = retryAfterFromMessage(msg);
  return new RateLimitError(`${source} rate limit: ${msg}`.slice(0, 400), {
    retryAfterMs,
    daily: isDailyLimitMessage(msg),
  });
}

export function computeRequestDelay(opts: {
  minDelayMs: number;
  remainingLeads: number;
  providers: { rpm: number; usedInWindow: number; paused: boolean }[];
}): number {
  const minDelay = Math.max(0, opts.minDelayMs);
  const active = opts.providers.filter((p) => !p.paused);
  if (!active.length) return minDelay;
  const remainingRpm = active.reduce(
    (sum, p) => sum + Math.max(0, p.rpm - p.usedInWindow),
    0,
  );
  const safeRpm = Math.max(1, remainingRpm * 0.85);
  const spacing = Math.ceil(60_000 / safeRpm);
  const requestsLeft = Math.max(1, opts.remainingLeads * 2);
  const extra = requestsLeft / safeRpm > 25 ? 400 : 0;
  return Math.max(minDelay, Math.min(spacing + extra, 6_000));
}

type Slot = AiProviderConfig & {
  starts: number[];
  dailyCount: number;
  dailyResetAt: number;
  pausedUntil: number;
  lastStartAt: number;
  maxConcurrent: number;
};

type Job = {
  call: AiCompleteCall;
  attempts: number;
  resolve: (value: AiCompleteResult) => void;
  reject: (err: unknown) => void;
};

const MINUTE_MS = 60_000;
const DAILY_WAIT_GIVE_UP_MS = 5 * 60_000;
/** RPM 429s used to retry forever and stall Canvass with 0 saved leads. */
const MAX_JOB_ATTEMPTS = 4;

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export class AiRequestPool {
  private readonly slots: Slot[];
  private readonly minDelayMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly onStatus?: (status: AiPoolStatus) => void;
  private getRemainingLeads: () => number;
  private readonly queue: Job[] = [];
  private readonly inFlight = new Map<string, number>();
  private looping = false;
  private stopped = false;

  constructor(opts: AiPoolOptions) {
    if (!opts.providers.length) {
      throw new Error("No Gemini, Groq, or OpenRouter key is configured.");
    }
    const now = opts.now ?? Date.now;
    this.now = now;
    this.sleep = opts.sleep ?? defaultSleep;
    this.onStatus = opts.onStatus;
    this.minDelayMs = Math.max(0, opts.minDelayMs);
    this.getRemainingLeads = opts.getRemainingLeads ?? (() => 0);
    this.slots = opts.providers.map((p) => ({
      ...p,
      rpm: Math.max(1, p.rpm),
      rpd: Math.max(1, p.rpd),
      maxConcurrent: Math.max(1, p.maxConcurrent ?? 1),
      starts: [],
      dailyCount: 0,
      dailyResetAt: nextUtcMidnight(now()),
      pausedUntil: 0,
      lastStartAt: 0,
    }));
  }

  setRemainingLeads(count: number) {
    this.getRemainingLeads = () => Math.max(0, count);
  }

  stop() {
    this.stopped = true;
  }

  get labels(): string[] {
    return this.slots.map((s) => s.label);
  }

  snapshot() {
    const now = this.now();
    return this.slots.map((s) => ({
      id: s.id,
      label: s.label,
      pausedUntil: s.pausedUntil,
      paused: s.pausedUntil > now || this.rpdUsed(s, now) >= s.rpd,
      usedRpm: this.rpmUsed(s, now),
      usedRpd: this.rpdUsed(s, now),
      rpm: s.rpm,
      rpd: s.rpd,
    }));
  }

  async complete(call: AiCompleteCall): Promise<AiCompleteResult> {
    if (this.stopped) throw new Error("AI request pool has been stopped.");
    return new Promise((resolve, reject) => {
      this.queue.push({ call, attempts: 0, resolve, reject });
      void this.loop();
    });
  }

  private rpmUsed(slot: Slot, now: number): number {
    slot.starts = slot.starts.filter((t) => now - t < MINUTE_MS);
    return slot.starts.length;
  }

  private rpdUsed(slot: Slot, now: number): number {
    if (now >= slot.dailyResetAt) {
      slot.dailyCount = 0;
      slot.dailyResetAt = nextUtcMidnight(now);
    }
    return slot.dailyCount;
  }

  private remainingRpm(slot: Slot, now: number): number {
    return Math.max(0, slot.rpm - this.rpmUsed(slot, now));
  }

  private flying(id: string): number {
    return this.inFlight.get(id) ?? 0;
  }

  private flyingTotal(): number {
    let n = 0;
    for (const count of this.inFlight.values()) n += count;
    return n;
  }

  private isReady(slot: Slot, now: number): boolean {
    if (this.flying(slot.id) >= slot.maxConcurrent) return false;
    if (slot.pausedUntil > now) return false;
    if (this.rpdUsed(slot, now) >= slot.rpd) return false;
    if (this.rpmUsed(slot, now) >= slot.rpm) return false;
    return true;
  }

  private pickReady(now: number): Slot | null {
    const ready = this.slots.filter((s) => this.isReady(s, now));
    if (!ready.length) return null;
    const familyRank = { gemini: 0, groq: 1, openrouter: 2 };
    ready.sort((a, b) => {
      if (a.family !== b.family) return familyRank[a.family] - familyRank[b.family];
      return this.remainingRpm(b, now) - this.remainingRpm(a, now);
    });
    return ready[0];
  }

  private delayFor(slot: Slot, now: number): number {
    if (slot.rpm >= 1_000) {
      const sinceLast = slot.lastStartAt ? now - slot.lastStartAt : this.minDelayMs;
      return Math.max(0, this.minDelayMs - sinceLast);
    }
    const providers = this.slots.map((s) => ({
      rpm: s.rpm,
      usedInWindow: this.rpmUsed(s, now),
      paused: !this.isReady(s, now) && s.id !== slot.id ? s.pausedUntil > now || this.rpdUsed(s, now) >= s.rpd : false,
    }));
    const dynamic = computeRequestDelay({
      minDelayMs: this.minDelayMs,
      remainingLeads: this.getRemainingLeads(),
      providers,
    });
    const rpmSpacing = Math.ceil(MINUTE_MS / Math.max(1, slot.rpm * 0.9));
    const needed = Math.max(this.minDelayMs, rpmSpacing, dynamic);
    const sinceLast = slot.lastStartAt ? now - slot.lastStartAt : needed;
    return Math.max(0, needed - sinceLast);
  }

  private msUntilNextReady(now: number): number {
    let wait = MINUTE_MS;
    for (const slot of this.slots) {
      if (this.flying(slot.id) >= slot.maxConcurrent) continue;
      if (this.rpdUsed(slot, now) >= slot.rpd) {
        wait = Math.min(wait, Math.max(250, slot.dailyResetAt - now));
        continue;
      }
      if (slot.pausedUntil > now) {
        wait = Math.min(wait, slot.pausedUntil - now);
      }
      const used = this.rpmUsed(slot, now);
      if (used >= slot.rpm && slot.starts.length) {
        const oldest = Math.min(...slot.starts);
        wait = Math.min(wait, oldest + MINUTE_MS - now);
      }
      if (this.isReady(slot, now)) return 0;
    }
    return Math.max(250, wait);
  }

  private emit(provider: string, nextRequestInMs: number) {
    this.onStatus?.({ provider, nextRequestInMs: Math.max(0, Math.round(nextRequestInMs)) });
  }

  private allDailyLimited(now: number): boolean {
    return this.slots.every((s) => this.rpdUsed(s, now) >= s.rpd);
  }

  private pause(slot: Slot, err: RateLimitError, now: number) {
    if (err.daily) {
      slot.pausedUntil = slot.dailyResetAt;
      slot.dailyCount = slot.rpd;
    } else {
      const until = now + err.retryAfterMs;
      const oldest = slot.starts[0];
      const windowEnd = oldest ? oldest + MINUTE_MS : until;
      slot.pausedUntil = Math.max(until, windowEnd);
    }
  }

  private async loop() {
    if (this.looping) return;
    this.looping = true;
    try {
      while (!this.stopped && (this.queue.length > 0 || this.flyingTotal() > 0)) {
        const now = this.now();
        if (this.queue.length > 0 && this.allDailyLimited(now)) {
          const wait = Math.min(...this.slots.map((s) => s.dailyResetAt - now));
          if (wait > DAILY_WAIT_GIVE_UP_MS) {
            const err = new Error(
              "All AI providers hit their daily request limit. Valid leads collected so far will be saved; retry after the daily reset.",
            );
            while (this.queue.length) this.queue.shift()?.reject(err);
            break;
          }
        }

        const slot = this.pickReady(now);
        if (slot && this.queue.length > 0) {
          const job = this.queue.shift()!;
          this.inFlight.set(slot.id, this.flying(slot.id) + 1);
          void this.run(slot, job);
          continue;
        }

        if (this.queue.length > 0) {
          const wait = this.msUntilNextReady(now);
          const next = this.slots.find((s) => s.pausedUntil > now) ?? this.slots[0];
          this.emit(next ? `waiting (${next.label})` : "waiting", wait);
          await this.sleep(Math.min(Math.max(wait, 50), 1000));
          continue;
        }

        if (this.flyingTotal() > 0) {
          await this.sleep(50);
        }
      }
    } finally {
      this.looping = false;
      if (!this.stopped && this.queue.length > 0) void this.loop();
    }
  }

  private async run(slot: Slot, job: Job) {
    try {
      const delay = this.delayFor(slot, this.now());
      if (delay > 0) {
        this.emit(slot.label, delay);
        await this.sleep(delay);
      }
      this.emit(slot.label, 0);
      const started = this.now();
      slot.lastStartAt = started;
      slot.starts.push(started);
      slot.dailyCount += 1;
      const raw = await slot.complete(job.call);
      const text = typeof raw === "string" ? raw : raw.text;
      const usage = typeof raw === "string" ? undefined : raw.usage;
      job.resolve({ text, provider: slot.label, usage });
    } catch (err) {
      if (isRateLimitError(err)) {
        const rateErr = toRateLimitError(err, slot.label);
        job.attempts += 1;
        if (job.attempts >= MAX_JOB_ATTEMPTS) {
          job.reject(rateErr);
        } else {
          this.pause(slot, rateErr, this.now());
          this.queue.unshift(job);
          this.emit(`paused ${slot.label}`, rateErr.retryAfterMs);
        }
      } else if (isTransientProviderError(err) && job.attempts < Math.max(this.slots.length, MAX_JOB_ATTEMPTS - 1)) {
        job.attempts += 1;
        this.pause(slot, new RateLimitError(`${slot.label} is unavailable`, { retryAfterMs: 20_000 }), this.now());
        this.queue.unshift(job);
        this.emit(`retry after ${slot.label}`, 20_000);
      } else {
        job.reject(err);
      }
    } finally {
      this.inFlight.set(slot.id, Math.max(0, this.flying(slot.id) - 1));
    }
  }
}
