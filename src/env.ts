function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required (set it in .env.local)");
  }
  return url;
}

export function adminRefreshSecret(): string {
  const secret = process.env.ADMIN_REFRESH_SECRET;
  if (!secret) {
    throw new Error("ADMIN_REFRESH_SECRET is required (set it in .env.local)");
  }
  return secret;
}

export const env = {
  recentEventsTtlSeconds: () => readNumber("RECENT_EVENTS_TTL_SECONDS", 600),
  activeRoundTtlSeconds: () => readNumber("ACTIVE_ROUND_TTL_SECONDS", 60),
  eventMetadataTtlSeconds: () => readNumber("EVENT_METADATA_TTL_SECONDS", 180),
  recentEventsWindowHours: () => readNumber("RECENT_EVENTS_WINDOW_HOURS", 36)
};
