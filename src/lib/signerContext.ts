/**
 * What the browser tells the signing record about the device and the place a
 * document is signed from (docs/DOCUMENT-SIGNING.md, "Signing record";
 * supabase/functions/_shared/signerContext.ts cleans it on the server).
 *
 * The owner, 2026-10-11: "whatever is free to add, go ahead". Time zone,
 * languages, screen size, kind of device, platform, a device id this browser
 * keeps, and the place hireflownow.com's host saw the connection at
 * (api/where.mjs). Nothing here can stop a signature: every part is
 * best-effort and a missing part is simply left out.
 */

export interface SignerContext {
  timeZone?: string;
  languages?: string[];
  screen?: string;
  deviceType?: "phone" | "tablet" | "computer";
  platform?: string;
  deviceId?: string;
  place?: { country?: string | null; region?: string | null; city?: string | null; ip?: string | null };
}

const DEVICE_KEY = "hf-device-id";

function deviceId(): string | undefined {
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`).toLowerCase();
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return undefined;
  }
}

export function platformOf(ua: string): string | undefined {
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/CrOS/i.test(ua)) return "ChromeOS";
  if (/Linux/i.test(ua)) return "Linux";
  return undefined;
}

export function deviceTypeOf(ua: string, width: number, touch: boolean): "phone" | "tablet" | "computer" {
  if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return "tablet";
  if (/iPhone|iPod|Mobile/i.test(ua) || (touch && width < 768)) return "phone";
  return "computer";
}

async function place(): Promise<SignerContext["place"]> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 1500);
  try {
    const r = await fetch("/api/where", { cache: "no-store", signal: controller.signal });
    if (!r.ok) return undefined;
    const body = (await r.json()) as SignerContext["place"];
    return body && (body.country || body.city || body.ip) ? body : undefined;
  } catch {
    return undefined;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function collectSignerContext(): Promise<SignerContext> {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const out: SignerContext = {};
  try {
    out.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    /* left out */
  }
  try {
    out.languages = Array.from(navigator.languages ?? [navigator.language]).filter(Boolean).slice(0, 5);
    out.screen = `${window.screen.width}x${window.screen.height}`;
    out.deviceType = deviceTypeOf(ua, window.screen.width, navigator.maxTouchPoints > 0);
    out.platform = platformOf(ua);
  } catch {
    /* left out */
  }
  out.deviceId = deviceId();
  out.place = await place();
  return out;
}
