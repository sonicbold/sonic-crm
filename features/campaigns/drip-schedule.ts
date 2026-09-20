const WINDOW_START_HOUR = 9;
const WINDOW_END_HOUR = 19; // 7:00 PM exclusive
export const MIN_GAP_MS = 20_000;
const JITTER_MIN = 0.72;
const JITTER_MAX = 1.28;

export function campaignTimezone() {
  return process.env.CRM_TIMEZONE || "America/New_York";
}

function partsInZone(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const bag: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") bag[p.type] = p.value;
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

/** Convert a civil time in `timeZone` to a UTC Date. */
export function zonedCivilToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const got = partsInZone(new Date(utcGuess), timeZone);
  const asUtc = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute, got.second);
  return new Date(utcGuess - (asUtc - utcGuess));
}

export function addDaysCivil(year: number, month: number, day: number, days: number) {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function windowBounds(now: Date, timeZone: string) {
  const p = partsInZone(now, timeZone);
  const start = zonedCivilToUtc(p.year, p.month, p.day, WINDOW_START_HOUR, 0, timeZone);
  const end = zonedCivilToUtc(p.year, p.month, p.day, WINDOW_END_HOUR, 0, timeZone);
  return { start, end, parts: p };
}

export function nextWindowOpen(now: Date, timeZone: string) {
  const { start, end, parts } = windowBounds(now, timeZone);
  if (now < start) return start;
  if (now >= end) {
    const n = addDaysCivil(parts.year, parts.month, parts.day, 1);
    return zonedCivilToUtc(n.year, n.month, n.day, WINDOW_START_HOUR, 0, timeZone);
  }
  return now;
}

export function currentWindowEnd(from: Date, timeZone: string) {
  const { end } = windowBounds(from, timeZone);
  if (from < end) return end;
  const p = partsInZone(from, timeZone);
  const n = addDaysCivil(p.year, p.month, p.day, 1);
  return zonedCivilToUtc(n.year, n.month, n.day, WINDOW_END_HOUR, 0, timeZone);
}

export function isInSendWindow(now: Date, timeZone: string) {
  const { start, end } = windowBounds(now, timeZone);
  return now >= start && now < end;
}

function jitteredGap(baseMs: number) {
  const factor = JITTER_MIN + Math.random() * (JITTER_MAX - JITTER_MIN);
  const extra = 1000 + Math.floor(Math.random() * 8000);
  return Math.max(MIN_GAP_MS, Math.round(baseMs * factor) + extra);
}

/**
 * Spread `count` sends from `from` across 9am–7pm windows, carrying leftovers to the next day.
 */
export function planSendTimes(count: number, from = new Date(), timeZone = campaignTimezone()): Date[] {
  if (count <= 0) return [];
  const times: Date[] = [];
  let remaining = count;
  let dayAnchor = nextWindowOpen(from, timeZone);
  let guard = 0;

  while (remaining > 0 && guard < 400) {
    guard++;
    const end = currentWindowEnd(dayAnchor, timeZone);
    let cursor = new Date(dayAnchor.getTime() + 4000 + Math.floor(Math.random() * 14000));
    if (cursor >= end) {
      dayAnchor = nextWindowOpen(end, timeZone);
      continue;
    }
    const usableMs = end.getTime() - cursor.getTime();
    const capacity = Math.max(1, Math.floor(usableMs / MIN_GAP_MS));
    const todayCount = Math.min(remaining, capacity);

    for (let i = 0; i < todayCount; i++) {
      const left = todayCount - i;
      const remMs = Math.max(MIN_GAP_MS, end.getTime() - cursor.getTime());
      if (i > 0) {
        cursor = new Date(cursor.getTime() + jitteredGap(remMs / left));
      }
      if (cursor >= end) {
        cursor = new Date(end.getTime() - MIN_GAP_MS - Math.floor(Math.random() * 5000));
      }
      const prev = times[times.length - 1];
      if (prev && cursor.getTime() - prev.getTime() < MIN_GAP_MS) {
        cursor = new Date(prev.getTime() + MIN_GAP_MS + Math.floor(Math.random() * 4000));
      }
      if (cursor >= end) break;
      times.push(new Date(cursor));
    }

    remaining = count - times.length;
    if (remaining > 0) {
      dayAnchor = nextWindowOpen(end, timeZone);
    }
  }

  return times;
}

export function formatInZone(date: Date, timeZone = campaignTimezone()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function describePlan(times: Date[], timeZone = campaignTimezone()) {
  if (!times.length) {
    return { firstSend: null as string | null, lastSend: null as string | null, days: 0, count: 0 };
  }
  const first = times[0];
  const last = times[times.length - 1];
  const a = partsInZone(first, timeZone);
  const b = partsInZone(last, timeZone);
  const days =
    Math.round(
      (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86400000
    ) + 1;
  return {
    firstSend: formatInZone(first, timeZone),
    lastSend: formatInZone(last, timeZone),
    days,
    count: times.length,
    timezone: timeZone,
    window: "9:00 AM – 7:00 PM",
  };
}
