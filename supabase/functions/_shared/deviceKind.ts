/**
 * deviceKind — phone, tablet, computer or unknown, from a request's own
 * headers (docs/COMPUTER-ONLY-TESTS.md). Import-free on purpose: the edge
 * functions import it under Deno and scripts/computer_only_server.test.mjs
 * imports it under Node.
 *
 * The rule is the page's (`deviceKindOf` in src/lib/connectionTest.ts), as
 * far as a server can see it:
 *
 *   1. `mobile` → phone. Sec-CH-UA-Mobile (`?1` / `?0`, which Chromium sends
 *      on every request) when present, else the User-Agent's own word
 *      (iPhone, iPod, Android + Mobile, a bare "Mobile" that is not an iPad):
 *      the same order as the page (userAgentData.mobile, then the UA string).
 *   2. Windows and ChromeOS → computer (a touch laptop or a 2-in-1 is the
 *      computer they work from). The OS is Sec-CH-UA-Platform when present,
 *      else the User-Agent, exactly as the page reads it.
 *   3. The User-Agent says tablet (iPad, Android without Mobile, "Tablet")
 *      → tablet.
 *   4. iOS, iPadOS or Android that did not say mobile → tablet. The page
 *      reaches the same answer through `touch`; every such device has touch.
 *   5. Anything else with a recognised OS → computer.
 *   6. No User-Agent and no client hints, or a User-Agent naming no OS and no
 *      device word (curl, a bot) → unknown. Unknown is ALLOWED: nothing is
 *      ever refused for a missing header.
 *
 * Where the headers alone get it wrong (the server has no screen and no touch
 * reading), so every gated request ALSO carries the page's own reading in its
 * body (`deviceKind`, see bodyDeviceKind) and either one saying phone or
 * tablet decides (deviceKindOfRequest):
 *   - A phone asking for the desktop site reads as a computer here. Chromium
 *     on Android (and WebView) rewrites the client hints too: an X11 Linux
 *     User-Agent, Sec-CH-UA-Mobile ?0, Sec-CH-UA-Platform "Linux". iPhone
 *     Safari's "Request Desktop Website" and Chrome on iOS send a Macintosh
 *     User-Agent and no client hints. Both are "computer" from headers.
 *   - iPadOS Safari, iPad Chrome and Chrome on large Android tablets use the
 *     desktop site by default (a Mac or Linux User-Agent), so the headers'
 *     "tablet" answer is rare: it is the page's reading in the body that
 *     catches a tablet. The page decides every touch device on Linux or
 *     macOS itself: a Mac with touch is an iPad (or an iPhone, by its
 *     screen); Linux with touch is a computer only when its main pointer is
 *     a mouse or a trackpad and it is not an ARM device, else a phone or a
 *     tablet by its screen. Before 2026-10-06 a Linux tablet with a screen
 *     like 1280×800 fell through to computer on the page too.
 *   - The page never answers unknown; it falls through to computer.
 * Turning on "desktop site" is not hostile, so the body reading is the real
 * fix for it. A page that lies about its own device can still get past the
 * server: the page's own gate is the first line, this is the second.
 */

export type ServerDeviceKind = "phone" | "tablet" | "computer" | "unknown";

/** What a request carries about its device. Every field may be missing. */
export interface DeviceSignals {
  userAgent: string | null;
  /** The raw Sec-CH-UA-Mobile header: "?1", "?0" or null. */
  chMobile: string | null;
  /** The raw Sec-CH-UA-Platform header, quoted as sent: "\"Windows\"". */
  chPlatform: string | null;
}

/** The refusal every gated start answers with (docs/COMPUTER-ONLY-TESTS.md). */
export const COMPUTER_REQUIRED_CODE = "computer_required";
export const COMPUTER_REQUIRED_ERROR =
  "This part needs the computer you will work on. On that computer, go to hireflownow.com/applications and sign in with the same email: you will be taken straight to this step. Your answers so far are saved.";

interface HeaderSource {
  get(name: string): string | null;
}

/** Pure: the three device headers of a request. */
export function deviceSignalsFrom(headers: HeaderSource | null | undefined): DeviceSignals {
  const read = (name: string): string | null => {
    try {
      const value = headers?.get(name);
      return typeof value === "string" && value.trim() ? value.trim() : null;
    } catch {
      return null;
    }
  };
  return { userAgent: read("user-agent"), chMobile: read("sec-ch-ua-mobile"), chPlatform: read("sec-ch-ua-platform") };
}

/** Pure: Sec-CH-UA-Mobile as a boolean, null when absent or malformed. */
export function chMobileFlag(value: string | null | undefined): boolean | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (v === "?1") return true;
  if (v === "?0") return false;
  return null;
}

/** Pure: Sec-CH-UA-Platform in the page's words (connectionTest.ts osFromPlatform). */
export function osFromChPlatform(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const p = value.trim().replace(/^"(.*)"$/, "$1").trim();
  if (!p || /^unknown$/i.test(p)) return null;
  if (/^windows$/i.test(p)) return "Windows";
  if (/^macos$/i.test(p)) return "macOS";
  if (/^android$/i.test(p)) return "Android";
  if (/^chrome ?os$/i.test(p) || /^chromeos$/i.test(p)) return "ChromeOS";
  if (/^linux$/i.test(p)) return "Linux";
  if (/^ios$/i.test(p)) return "iOS";
  return p;
}

/**
 * Pure: the OS and the phone/tablet words in a User-Agent string. The same
 * tests, in the same order, as parseUserAgent in src/lib/connectionTest.ts
 * (only the parts the device decision reads).
 */
export function userAgentDeviceWords(ua: string | null | undefined): { os: string | null; mobile: boolean; tablet: boolean } {
  const text = typeof ua === "string" ? ua : "";
  let os: string | null = null;
  const iphone = /iPhone OS (\d+[._]\d+(?:[._]\d+)?)/.exec(text) ?? (/iPhone|iPod/.test(text) ? /OS (\d+[._]\d+)/.exec(text) : null);
  if (iphone) os = "iOS";
  else if (/iPad/.test(text)) os = "iPadOS";
  else if (/Android/.test(text)) os = "Android";
  else if (/Windows NT (\d+\.\d+)/.test(text)) os = "Windows";
  else if (/CrOS/.test(text)) os = "ChromeOS";
  else if (/Mac OS X (\d+[._]\d+(?:[._]\d+)?)/.test(text) || /Macintosh/.test(text)) os = "macOS";
  else if (/Linux/.test(text)) os = "Linux";
  const mobile = /iPhone|iPod/.test(text) || (/Android/.test(text) && /Mobile/.test(text)) || (/\bMobile\b/.test(text) && !/iPad/.test(text));
  const tablet = /iPad/.test(text) || (/Android/.test(text) && !/Mobile/.test(text)) || /\bTablet\b/.test(text);
  return { os, mobile, tablet };
}

/** Pure: the decision, from the signals (see the rule at the top). */
export function deviceKindFromSignals(signals: Partial<DeviceSignals> | null | undefined): ServerDeviceKind {
  const ua = typeof signals?.userAgent === "string" ? signals.userAgent : "";
  const chMobile = chMobileFlag(signals?.chMobile ?? null);
  const chOs = osFromChPlatform(signals?.chPlatform ?? null);
  if (!ua.trim() && chMobile === null && chOs === null) return "unknown";

  const words = userAgentDeviceWords(ua);
  const mobile = chMobile ?? words.mobile;
  const os = chOs ?? words.os;

  if (mobile) return "phone";
  if (os === "Windows" || os === "ChromeOS") return "computer";
  if (words.tablet) return "tablet";
  if (os === "iOS" || os === "iPadOS" || os === "Android") return "tablet";
  if (os) return "computer";
  return "unknown";
}

/** The device kind of a request, from its own headers. Never throws. */
export function requestDeviceKind(req: { headers?: HeaderSource | null } | null | undefined): ServerDeviceKind {
  return deviceKindFromSignals(deviceSignalsFrom(req?.headers ?? null));
}

/** A phone or a tablet: the gated steps refuse to START there. Unknown is allowed. */
export function needsComputer(kind: string | null | undefined): kind is "phone" | "tablet" {
  return kind === "phone" || kind === "tablet";
}

/** Pure: the page's own device reading as a request body carries it
 *  (`deviceKind`, or `device_kind` as connection-test's record sends it):
 *  phone, tablet or computer, else null (absent, or anything else). */
export function bodyDeviceKind(body: unknown): "phone" | "tablet" | "computer" | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const raw = b.deviceKind ?? b.device_kind;
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return v === "phone" || v === "tablet" || v === "computer" ? v : null;
}

/**
 * Pure: the headers' answer and the page's own answer, together. Either one
 * saying phone (then tablet) decides: a phone asking for the desktop site
 * sends a computer's headers, and only the page sees its touch and its
 * screen. Otherwise a computer if either says so, else unknown.
 */
export function combinedDeviceKind(headerKind: string | null | undefined, pageKind: string | null | undefined): ServerDeviceKind {
  if (headerKind === "phone" || pageKind === "phone") return "phone";
  if (headerKind === "tablet" || pageKind === "tablet") return "tablet";
  if (headerKind === "computer" || pageKind === "computer") return "computer";
  return "unknown";
}

/** The device kind of a request: its headers plus the page's own reading in its body. Never throws. */
export function deviceKindOfRequest(req: { headers?: HeaderSource | null } | null | undefined, body: unknown): ServerDeviceKind {
  return combinedDeviceKind(requestDeviceKind(req), bodyDeviceKind(body));
}

/** Whether an attempt's recorded start device (context.started_device_kind)
 *  says a computer started it: set, and not a phone or tablet. */
export function startedOnComputer(startedDeviceKind: unknown): boolean {
  return typeof startedDeviceKind === "string" && startedDeviceKind.trim() !== "" && !needsComputer(startedDeviceKind);
}

/** The step types that put the rest of a job on a computer when the job has no connection check. */
export const TESTS_THAT_MATTER: readonly string[] = ["typing_test", "chat_simulation", "sales_simulation", "chat_interview", "voice_interview"];

/**
 * Pure: whether the rule puts this step on a computer
 * (docs/COMPUTER-ONLY-TESTS.md): the job's first `equipment_check` step and
 * every step after it; with no check, its first test that matters (typing,
 * chat or sales practice, written or voice interview) and every step after
 * it. `steps` is the journey in order (buildCandidateJourney, or the job's
 * own workflow_steps: the stages it adds are never gated). Null when the
 * step is not in it; callers treat that as gated.
 */
export function stepNeedsComputer(
  steps: readonly ({ id?: unknown; type?: unknown } | null | undefined)[] | null | undefined,
  stepId: string,
): boolean | null {
  const list = (Array.isArray(steps) ? steps : []).filter(
    (s): s is { id: string; type: string } => !!s && typeof s.id === "string" && !!s.id && typeof s.type === "string" && !!s.type,
  );
  const at = list.findIndex((s) => s.id === stepId);
  if (at === -1) return null;
  let gate = list.findIndex((s) => s.type === "equipment_check");
  if (gate === -1) gate = list.findIndex((s) => TESTS_THAT_MATTER.includes(s.type));
  return gate !== -1 && at >= gate;
}

/** The 400 body every gated start answers a phone or tablet with. */
export function computerRequiredBody(kind: "phone" | "tablet"): { error: string; code: string; deviceKind: "phone" | "tablet" } {
  return { error: COMPUTER_REQUIRED_ERROR, code: COMPUTER_REQUIRED_CODE, deviceKind: kind };
}
