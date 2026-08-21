/**
 * Weather for the Home page, via Open-Meteo (free, no key, no account).
 *
 * Three endpoints are used:
 *  - geocoding-api  — turns the user's own location label into a lat/lon, once
 *    ever per label (see `geocode`), because the answer never changes;
 *  - api            — today's conditions plus the last few days' codes, which
 *    the archive lags behind by several days;
 *  - archive-api    — one call for a whole historical range, which is what the
 *    day-log back-fill diffs against.
 *
 * Nothing here throws: every call resolves to null on a failure of any kind
 * (offline, DNS, 4xx, malformed body, timeout). The weather is decoration on a
 * calendar app — a dead network should leave no trace in the UI at all.
 */

import type { WeatherKind } from '../types'
import { todayISO } from './date'

/** Resolved place cache. Keyed by the label the user typed, verbatim. */
const GEO_KEY = 'planned-geo-v1'

/** Stamp holding the ISO date the day-log back-fill last ran on. */
export const WX_SYNC_KEY = 'planned-wx-sync'

/** Nothing waits longer than this for any one request. */
const TIMEOUT_MS = 8000

export interface GeoPoint {
  lat: number
  lon: number
  /** Open-Meteo's own name for the match — only used for a tooltip. */
  name?: string
}

export interface TodayWeather {
  kind: WeatherKind | null
  /** Degrees Celsius, unrounded. */
  tempC: number | null
  /**
   * Today's sunrise and sunset as minutes since local midnight. Null wherever
   * the day has neither — inside the polar circles for half the year — and
   * wherever the response did not carry them.
   */
  sunrise: number | null
  sunset: number | null
}

/**
 * WMO weather-interpretation code → one of our seven marks.
 *
 *   0            clear                      → sun
 *   1, 2         mainly clear / part cloud  → suncloud
 *   3            overcast                   → cloud
 *   45–48        fog, depositing rime fog   → cloud
 *   51–67        drizzle & rain, freezing   → rain
 *   71–77        snow fall, snow grains     → snow
 *   80–82        rain showers               → rain
 *   85–86        snow showers               → snow
 *   95–99        thunderstorm (± hail)      → storm
 *
 * 'wind' is deliberately unreachable: WMO has no wind code, so an auto-filled
 * windy day could only ever be a guess from wind speed. It stays a mark the
 * user alone can set.
 */
export function wmoToKind(code: number): WeatherKind | null {
  if (!Number.isFinite(code)) return null
  if (code === 0) return 'sun'
  if (code === 1 || code === 2) return 'suncloud'
  if (code === 3) return 'cloud'
  if (code >= 45 && code <= 48) return 'cloud'
  if (code >= 51 && code <= 67) return 'rain'
  if (code >= 71 && code <= 77) return 'snow'
  if (code >= 80 && code <= 82) return 'rain'
  if (code === 85 || code === 86) return 'snow'
  if (code >= 95 && code <= 99) return 'storm'
  return null
}

/** Fetch + parse JSON, or null for anything at all going wrong. */
async function getJson(url: string): Promise<any | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctl.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** The whole label → point cache, or an empty map if it is unreadable. */
function readGeoCache(): Record<string, GeoPoint | null> {
  try {
    const raw = localStorage.getItem(GEO_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeGeoCache(cache: Record<string, GeoPoint | null>): void {
  try {
    localStorage.setItem(GEO_KEY, JSON.stringify(cache))
  } catch {
    // A full or blocked localStorage just means we look the place up again.
  }
}

/**
 * The coordinates behind a place name, resolved at most once per label.
 *
 * A definite "no such place" is cached as null alongside the hits, so a typo
 * is not re-queried on every load — correcting the typo is a different label
 * and therefore a different cache key. A *failed* lookup caches nothing, so
 * coming back online retries.
 */
export async function geocode(label: string): Promise<GeoPoint | null> {
  const key = label.trim()
  if (!key) return null

  const cache = readGeoCache()
  if (key in cache) return cache[key]

  const url = 'https://geocoding-api.open-meteo.com/v1/search'
    + `?name=${encodeURIComponent(key)}&count=1&language=en&format=json`
  const data = await getJson(url)
  if (!data) return null // network trouble: leave the cache alone and retry later

  const hit = Array.isArray(data.results) ? data.results[0] : null
  const point: GeoPoint | null = hit && Number.isFinite(hit.latitude) && Number.isFinite(hit.longitude)
    ? { lat: hit.latitude, lon: hit.longitude, ...(hit.name ? { name: hit.name } : null) }
    : null

  cache[key] = point
  writeGeoCache(cache)
  return point
}

/** `daily.time` / `daily.weather_code` zipped into a date → mark map. */
function dailyCodes(daily: any): Record<string, WeatherKind> {
  const out: Record<string, WeatherKind> = {}
  const times: unknown = daily?.time
  const codes: unknown = daily?.weather_code
  if (!Array.isArray(times) || !Array.isArray(codes)) return out
  times.forEach((iso, i) => {
    const kind = typeof codes[i] === 'number' ? wmoToKind(codes[i] as number) : null
    if (typeof iso === 'string' && kind) out[iso.slice(0, 10)] = kind
  })
  return out
}

/**
 * "2026-08-21T06:12" → 372. `timezone=auto` makes every time in the response
 * local wall time with no offset on it, so only the clock part is of interest
 * — and reading it with a regex keeps Date's parsing rules out of it.
 */
function localMinutes(v: unknown): number | null {
  if (typeof v !== 'string') return null
  const m = /T(\d{2}):(\d{2})/.exec(v)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * Today's conditions and today's sunrise and sunset, plus the daily codes for
 * the last `pastDays` days. Those recent days matter: the archive lags real
 * time by several days, so the forecast endpoint is the only place the gap
 * between them can be filled from.
 *
 * The sun times ride along on the daily block this call already asks for — the
 * Home page's arc costs no request of its own.
 */
export async function fetchForecast(
  p: GeoPoint,
  pastDays = 7,
): Promise<{ today: TodayWeather; daily: Record<string, WeatherKind> } | null> {
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${p.lat}&longitude=${p.lon}`
    + '&current=temperature_2m,weather_code&daily=weather_code,sunrise,sunset'
    + `&timezone=auto&forecast_days=1&past_days=${Math.max(0, Math.min(92, Math.round(pastDays)))}`
  const data = await getJson(url)
  if (!data) return null

  const code = data.current?.weather_code
  const temp = data.current?.temperature_2m

  // The daily block runs from `pastDays` ago to today, so today is found by
  // date rather than counted to — a range the server trimmed cannot mislead it.
  const times: unknown = data.daily?.time
  const i = Array.isArray(times)
    ? times.findIndex((t) => typeof t === 'string' && t.slice(0, 10) === todayISO())
    : -1

  return {
    today: {
      kind: typeof code === 'number' ? wmoToKind(code) : null,
      tempC: typeof temp === 'number' ? temp : null,
      sunrise: i < 0 ? null : localMinutes(data.daily?.sunrise?.[i]),
      sunset: i < 0 ? null : localMinutes(data.daily?.sunset?.[i]),
    },
    daily: dailyCodes(data.daily),
  }
}

/**
 * Historical daily marks for [from, to] inclusive — one request for the whole
 * range. Days the archive has not caught up with simply come back missing.
 */
export async function fetchArchive(
  p: GeoPoint,
  from: string,
  to: string,
): Promise<Record<string, WeatherKind> | null> {
  const url = 'https://archive-api.open-meteo.com/v1/archive'
    + `?latitude=${p.lat}&longitude=${p.lon}`
    + `&start_date=${from}&end_date=${to}&daily=weather_code&timezone=auto`
  const data = await getJson(url)
  if (!data) return null
  return dailyCodes(data.daily)
}
