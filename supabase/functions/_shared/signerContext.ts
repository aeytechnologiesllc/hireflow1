// signerContext: what a signature records about the device and the place it
// was signed from, besides the IP address the server sees itself
// (docs/DOCUMENT-SIGNING.md, "Signing record").
//
// The owner, 2026-10-11: whatever is free to add, add it; the hiring team sees
// all of it, the applicant never sees the team's (public.document_audit_log
// shows each side only its own).
//
// The browser sends `signerContext` with a sign or countersign: its time
// zone, languages, screen size, kind of device, platform, a device id it
// keeps, and the place hireflownow.com's own host saw it at (api/where.mjs:
// country, region, city, and the address it saw). None of it is taken on
// trust: every field is cut to a plain short value or dropped, and the place
// is marked with whether its address matches the one this server saw.

export interface SignerDevice {
  timeZone?: string;
  languages?: string[];
  screen?: string;
  deviceType?: "phone" | "tablet" | "computer";
  platform?: string;
  deviceId?: string;
}

export interface SignerPlace {
  city?: string;
  region?: string;
  country?: string;
}

export interface CleanSignerContext {
  device: SignerDevice;
  place: SignerPlace | null;
  /** True when the place's address is the one the server saw; null when no address came with it. */
  placeIpMatches: boolean | null;
}

function plain(value: unknown, max: number, pattern?: RegExp): string | undefined {
  if (typeof value !== "string") return undefined;
  // deno-lint-ignore no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  if (!text) return undefined;
  if (pattern && !pattern.test(text)) return undefined;
  return text;
}

const TIME_ZONE = /^[A-Za-z]+(?:[/_+-][A-Za-z0-9_+-]+)*$/;
const LANGUAGE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const SCREEN = /^\d{2,5}x\d{2,5}$/;
const DEVICE_ID = /^[a-z0-9-]{8,64}$/;
const COUNTRY = /^[A-Z]{2}$/;

export function cleanSignerContext(raw: unknown, serverIp: string): CleanSignerContext {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const languages = Array.isArray(r.languages)
    ? r.languages.map((l) => plain(l, 35, LANGUAGE)).filter((l): l is string => !!l).slice(0, 5)
    : [];
  const deviceType = r.deviceType === "phone" || r.deviceType === "tablet" || r.deviceType === "computer" ? r.deviceType : undefined;
  const device: SignerDevice = {};
  const tz = plain(r.timeZone, 64, TIME_ZONE);
  if (tz) device.timeZone = tz;
  if (languages.length) device.languages = languages;
  const screen = plain(r.screen, 11, SCREEN);
  if (screen) device.screen = screen;
  if (deviceType) device.deviceType = deviceType;
  const platform = plain(r.platform, 40);
  if (platform) device.platform = platform;
  const deviceId = plain(r.deviceId, 64, DEVICE_ID);
  if (deviceId) device.deviceId = deviceId;

  const p = r.place && typeof r.place === "object" && !Array.isArray(r.place) ? (r.place as Record<string, unknown>) : null;
  let place: SignerPlace | null = null;
  let placeIpMatches: boolean | null = null;
  if (p) {
    const cleanPlace: SignerPlace = {};
    const city = plain(p.city, 64);
    const region = plain(p.region, 64);
    const country = plain(p.country, 2, COUNTRY);
    if (city) cleanPlace.city = city;
    if (region) cleanPlace.region = region;
    if (country) cleanPlace.country = country;
    if (Object.keys(cleanPlace).length) place = cleanPlace;
    const seenAt = plain(p.ip, 45);
    placeIpMatches = seenAt ? seenAt === serverIp : null;
  }
  return { device, place, placeIpMatches };
}

/** "Manila, Metro Manila, PH" from a place, or null. */
export function placeLine(place: SignerPlace | null | undefined): string | null {
  if (!place) return null;
  const parts = [place.city, place.region, place.country].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** "Phone, iOS, 390x844, Asia/Manila" from a device, or null. */
export function deviceLine(device: SignerDevice | null | undefined): string | null {
  if (!device) return null;
  const kind = device.deviceType ? device.deviceType.charAt(0).toUpperCase() + device.deviceType.slice(1) : null;
  const parts = [kind, device.platform, device.screen, device.timeZone].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}
