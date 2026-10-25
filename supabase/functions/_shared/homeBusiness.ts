/**
 * homeBusiness.ts — is this job's business the owner's own (2026-10-25;
 * docs/LAUNCH-PLAN.md, Phase 2)?
 *
 * business_pages.home_alias marks the owner's own business (its careers page
 * is the site's /careers). Its jobs keep the owner's own words ("players",
 * the home interview script); every other business gets the general ones
 * (_shared/counterpart.ts, _shared/interviewGuide.ts). A business with no
 * page, a failed read, or no employer id is not the home business: the safe
 * answer is the general words.
 */

type PageReader = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => { maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }> };
    };
  };
};

export async function isHomeBusiness(admin: PageReader, employerId: unknown): Promise<boolean> {
  if (typeof employerId !== "string" || !employerId) return false;
  try {
    const { data, error } = await admin.from("business_pages").select("home_alias").eq("employer_id", employerId).maybeSingle();
    if (error || !data || typeof data !== "object") return false;
    return (data as { home_alias?: unknown }).home_alias === true;
  } catch {
    return false;
  }
}
