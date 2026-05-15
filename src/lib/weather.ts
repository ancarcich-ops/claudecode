// Wind / weather lookup via Open-Meteo's free API. No key needed, no
// signup, ~500ms response time. We cache responses for 10 minutes per
// course coord so a typical 4-hour round generates ~24 requests total.
//
// Result is a small object the on-course view renders as a compass
// arrow + mph reading; null on any failure (offline at the course is
// the norm).

type WindReading = {
  speedMph: number;
  // Direction the wind is blowing FROM, in degrees (0 = north, 90 = east).
  fromDeg: number;
  // ISO timestamp of the most recent reading.
  observedAt: string;
};

const CACHE = new Map<string, { v: WindReading | null; expiresAt: number }>();
const TTL_MS = 10 * 60 * 1000;

function cacheKey(lat: number, lng: number): string {
  // Round to 3 decimal places (~110m) so nearby coords share a cache slot.
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

export async function getWindForCoord(
  lat: number,
  lng: number,
): Promise<WindReading | null> {
  const key = cacheKey(lat, lng);
  const cached = CACHE.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.v;

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("current", "wind_speed_10m,wind_direction_10m");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("forecast_days", "1");
  try {
    const res = await fetch(url.toString(), {
      // Edge / server-side fetch. Open-Meteo doesn't allow CORS so this
      // can't be called from the browser.
      next: { revalidate: 600 },
    });
    if (!res.ok) {
      CACHE.set(key, { v: null, expiresAt: now + TTL_MS });
      return null;
    }
    const data = (await res.json()) as {
      current?: {
        wind_speed_10m?: number;
        wind_direction_10m?: number;
        time?: string;
      };
    };
    const c = data.current;
    if (
      !c ||
      typeof c.wind_speed_10m !== "number" ||
      typeof c.wind_direction_10m !== "number"
    ) {
      CACHE.set(key, { v: null, expiresAt: now + TTL_MS });
      return null;
    }
    const reading: WindReading = {
      speedMph: Math.round(c.wind_speed_10m),
      fromDeg: c.wind_direction_10m,
      observedAt: c.time ?? new Date().toISOString(),
    };
    CACHE.set(key, { v: reading, expiresAt: now + TTL_MS });
    return reading;
  } catch {
    CACHE.set(key, { v: null, expiresAt: now + TTL_MS });
    return null;
  }
}
