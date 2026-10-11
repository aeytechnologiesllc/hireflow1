import { CAREERS_PATH } from "@/lib/hosts";
import { BUSINESS_SLUG_PATTERN } from "@/lib/jobSlug";

/**
 * Where "See open roles" goes for an applicant: the careers page of the
 * business whose job they last looked at (/c/<business>; the home business's
 * own address forwards to /careers), so another business's applicant is
 * never sent to the home business's roles (the 2026-10-11 overview). With
 * nothing remembered (a fresh device, private browsing) it is /careers, as
 * before.
 *
 * Kept in this browser only: a convenience, never a decision.
 */
const KEY = "hf:last-business";

export function rememberBusiness(businessSlug: string | null | undefined): void {
  if (!businessSlug || !BUSINESS_SLUG_PATTERN.test(businessSlug)) return;
  try {
    window.localStorage.setItem(KEY, businessSlug);
  } catch {
    // Storage blocked: the fallback still works.
  }
}

export function openRolesPath(): string {
  try {
    const slug = window.localStorage.getItem(KEY);
    if (slug && BUSINESS_SLUG_PATTERN.test(slug)) return `/c/${slug}`;
  } catch {
    // Storage blocked: fall through.
  }
  return CAREERS_PATH;
}
