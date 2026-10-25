/**
 * signupSource.ts — where a new account came from (2026-10-25;
 * docs/LAUNCH-PLAN.md, Phase 2, task 3).
 *
 * Before the marketing push the owner could not tell a YouTube sign-up from
 * a Quora one: the front page was not counted at all, and an account kept no
 * trace of how its owner arrived. The front page (public/landing.html) now
 * carries the campaign tags of the address that brought the visitor
 * (utm_source, utm_medium, utm_campaign) and the bare host of the site they
 * came from (as `ref`) onto its sign-up links. The sign-up page reads them
 * from its own address here, and useAuth's signUp stores them on the account
 * as signup_source (auth user metadata; no database change).
 *
 * The same privacy rules as public/beacon.js: no cookie, no storage, no id.
 * Only short, plain values are kept (letters, digits, dot, dash, underscore,
 * at most 60 characters), so nothing personal rides along in a tag.
 */

export interface SignupSource {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  ref?: string;
}

const KEYS: (keyof SignupSource)[] = ["utm_source", "utm_medium", "utm_campaign", "ref"];

/** A tag value we keep, or null: lower case, anything but plain characters
 *  a dash, at most 60. The same tidy value public/beacon.js counts and
 *  public/carry-source.js carries: "Spring Sale" is "spring-sale", never
 *  dropped (the third growth review: a link straight to the sign-up page
 *  lost it here while the visit was counted). */
export function cleanTag(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return v || null;
}

/** The source carried in an address, or null when it carries none. */
export function signupSourceFrom(href: string | null | undefined): SignupSource | null {
  if (!href) return null;
  let params: URLSearchParams;
  try {
    params = new URL(href, "https://hireflownow.com").searchParams;
  } catch {
    return null;
  }
  const out: SignupSource = {};
  for (const key of KEYS) {
    const v = cleanTag(params.get(key));
    if (v) out[key] = v;
  }
  return Object.keys(out).length ? out : null;
}
