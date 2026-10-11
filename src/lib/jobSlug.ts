/**
 * Short job links: hireflownow.com/<slug> (docs/SHORT-JOB-LINKS.md).
 *
 * Owner, 2026-10-06, looking at hireflownow.com/candidate/apply?code=JOB-C84E85:
 * "I don't get it. Why are link actually has a job code and all of that?" The
 * link an applicant sees has the job's name in it; the page it opens has one
 * job and one Apply button.
 *
 * Per business since 2026-10-10 (the owner, opening HireFlow to other
 * businesses: "multiple people posting multiple jobs ... no collision?"):
 * hireflownow.com/c/<business>/<job>. A job's name is unique within its
 * business (jobs_slug_per_business), a business's name across the site, so
 * the pair names exactly one job: the link someone follows, and the page they
 * are sent back to after making an account, can only ever be that job. The
 * root links already handed out (hireflownow.com/team-lead) still open their
 * job (jobs.root_link), and the page moves to the new address.
 *
 * Everything here is plain logic with ZERO imports, so
 * scripts/short_job_links.test.mjs imports this very file into Node and tests
 * the rules the app runs, never a copy of them. Anything that needs the
 * browser (the candidates' origin) lives in src/lib/jobLinks.ts.
 */

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 40;

/** The database's own rule (jobs_slug_format, migration 20261006145832):
 *  lowercase letters, digits and hyphens, 3-40 characters, starting and ending
 *  with a letter or digit. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/**
 * Every first path segment the app's own routes use (src/App.tsx). A job
 * named after one of these could never be opened: the app's page wins. The
 * test reads App.tsx and fails when a new top-level route is missing here.
 */
export const ROUTE_SEGMENTS: readonly string[] = [
  "__preview",
  // The platform admin's page and Help (2026-10-11).
  "admin",
  "analytics",
  "applicants",
  "applications",
  "apply",
  "auth",
  "ava-preview",
  // A business's careers page: /c/<slug> (2026-10-11).
  "c",
  "candidate",
  "dashboard",
  "developer",
  "documents",
  "flow-lab",
  "help",
  "interviews",
  "job",
  "jobs",
  "join-team",
  "marketing-demo",
  "messages",
  "more",
  "my-documents",
  "notifications",
  "oauth",
  // Every business's live jobs (2026-10-11).
  "open-jobs",
  "preview",
  "privacy",
  "profile",
  "settings",
  "team",
  "team-portal",
  "terms",
  "verify",
];

/** Paths the site serves before the app ever loads (vercel.json rewrites,
 *  the api folder, files in public/). */
export const SITE_PATHS: readonly string[] = [
  "api",
  "assets",
  "sitemap.xml",
  "jobs.xml",
  "adzuna.xml",
  "jooble.xml",
  "robots.txt",
  "favicon.ico",
  // The signature font (public/fonts, 2026-10-10).
  "fonts",
  "manifest.webmanifest",
  "site.webmanifest",
  "index.html",
  "landing-assets",
  "landing.html",
  "media",
  "screenshots",
  "share",
];

/** Words a page is likely to want one day, held back so a job does not take
 *  them first and break when that page arrives. */
export const HELD_BACK: readonly string[] = [
  "about",
  "careers",
  "contact",
  "home",
  "login",
  "logout",
  "register",
  "search",
  "signin",
  "signup",
  "staff",
  "support",
];

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([...ROUTE_SEGMENTS, ...SITE_PATHS, ...HELD_BACK]);

export type SlugProblem = "format" | "length" | "reserved" | "taken";

/** The editor's words for each problem (docs/SHORT-JOB-LINKS.md §4). */
export const SLUG_MESSAGES: Readonly<Record<SlugProblem, string>> = {
  format: "Use lowercase letters, numbers and hyphens",
  length: "3 to 40 characters",
  taken: "Another of your jobs has that name",
  reserved: "That name is part of the site; pick another",
};

/**
 * What is wrong with a short link name, or null when it can be saved. An empty
 * value is allowed: it means "no short link", and the job keeps its old link.
 * Whether another job holds the name is a database question (see "taken").
 */
export function slugProblem(value: string): Exclude<SlugProblem, "taken"> | null {
  if (value === "") return null;
  if (!/^[a-z0-9-]+$/.test(value) || value.startsWith("-") || value.endsWith("-")) return "format";
  if (value.length < SLUG_MIN_LENGTH || value.length > SLUG_MAX_LENGTH) return "length";
  if (RESERVED_SLUGS.has(value)) return "reserved";
  return null;
}

/** What the field keeps as the person types: lowercase, spaces become
 *  hyphens. Anything else stays visible so the error can point at it. */
export function tidySlugInput(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, "-");
}

/** Words a shortened suggestion must not end on. */
const TRAILING_SMALL_WORDS: ReadonlySet<string> = new Set([
  "a", "an", "and", "at", "by", "for", "from", "in", "of", "on", "or", "the", "to", "with",
]);

/**
 * A short link suggested from the job's title: lowercase, hyphens, at most 40
 * characters, cut at a word. A part in brackets is dropped first when what
 * is left still names the job ("Chat Support Team Leader (Zulu Royal & Zulu
 * Rush)" → "chat-support-team-leader"). A name the site already uses gets
 * "-job" on the end.
 */
export function suggestJobSlug(title: string): string {
  const words = (text: string) =>
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const full = words(title);
  const unbracketed = words(title.replace(/\([^)]*\)|\[[^\]]*\]/g, " "));
  let slug = unbracketed.length >= SLUG_MIN_LENGTH ? unbracketed : full;

  if (slug.length > SLUG_MAX_LENGTH) {
    const cut = slug.slice(0, SLUG_MAX_LENGTH + 1);
    const lastHyphen = cut.lastIndexOf("-");
    slug = (lastHyphen >= SLUG_MIN_LENGTH ? cut.slice(0, lastHyphen) : slug.slice(0, SLUG_MAX_LENGTH)).replace(/-+$/, "");
    // A cut at a word can leave a small word dangling ("customer-experience-
    // representative-for"): drop it while a real name is left.
    for (;;) {
      const lastHyphenAt = slug.lastIndexOf("-");
      if (lastHyphenAt < SLUG_MIN_LENGTH || !TRAILING_SMALL_WORDS.has(slug.slice(lastHyphenAt + 1))) break;
      slug = slug.slice(0, lastHyphenAt);
    }
  }
  if (!slug) return "";
  if (slug.length < SLUG_MIN_LENGTH || RESERVED_SLUGS.has(slug)) slug = `${slug}-job`;
  return slug;
}

/** The names tried, in order, when a suggested name is already taken:
 *  team-lead, team-lead-2, team-lead-3 … each still at most 40 characters. */
export function slugCandidates(base: string, count = 6): string[] {
  if (!base) return [];
  const out = [base];
  for (let n = 2; out.length < count; n += 1) {
    const suffix = `-${n}`;
    const stem = base.slice(0, SLUG_MAX_LENGTH - suffix.length).replace(/-+$/, "");
    out.push(`${stem}${suffix}`);
  }
  return out;
}

export interface LinkableJob {
  id: string;
  slug?: string | null;
  /** The business's careers name (business_pages.slug): /c/<business>/<slug>. */
  business_slug?: string | null;
  /** The job's root link (hireflownow.com/<slug>) was handed out before links
   *  went per business (jobs.root_link); only those jobs have one. */
  root_link?: boolean | null;
  /** The job code (jobs.job_code, or a showcase role's role_code). */
  roleCode?: string | null;
}

/** business_pages.slug's own rule: lowercase words joined by hyphens, 2-60. */
export const BUSINESS_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The URL's business name as the database stores it, or null when it cannot be one. */
export function businessSlugFromParam(param: string | null | undefined): string | null {
  const value = (param ?? "").trim().toLowerCase();
  return value.length >= 2 && value.length <= 60 && BUSINESS_SLUG_PATTERN.test(value) ? value : null;
}

/** A job's address: hireflownow.com/c/<business>/<job>. */
export function businessJobPath(business: string, slug: string): string {
  return `/c/${business}/${slug}`;
}

/** The old code link, still honoured for links already shared. */
export function applyWithCodePath(code: string): string {
  return `/candidate/apply?code=${encodeURIComponent(code)}`;
}

/**
 * The job's short link name when the site can actually open it, otherwise
 * null. The database only checks the name's shape (jobs_slug_format), so a
 * name written without the editor (an import, a future tool) could be one of
 * the app's own paths: /dashboard would open the dashboard, never the job.
 * Such a name is treated as no short link, so every link keeps working.
 */
export function usableSlug(slug: string | null | undefined): string | null {
  return slug && SLUG_PATTERN.test(slug) && !RESERVED_SLUGS.has(slug) ? slug : null;
}

/**
 * The job's own short path: /c/<business>/<job>; for a job whose business
 * address is not known, its root link if it was handed one; otherwise null.
 */
export function shortLinkFor(job: Pick<LinkableJob, "slug" | "business_slug" | "root_link"> | null | undefined): string | null {
  const slug = usableSlug(job?.slug);
  if (!slug) return null;
  const business = businessSlugFromParam(job?.business_slug);
  if (business) return businessJobPath(business, slug);
  return job?.root_link ? `/${slug}` : null;
}

/** The job's page on the candidates' site: its short path when it has one. */
export function jobPagePath(job: LinkableJob): string {
  return shortLinkFor(job) ?? `/candidate/job/${job.id}`;
}

/**
 * The one link every share surface hands out (the Share Kit, its QR code and
 * flyer, the Dashboard, the Jobs page, the publish screens): the short link
 * when the job has one, and the link it always had otherwise.
 */
export function jobShareLink(origin: string, job: LinkableJob): string {
  const path = shortLinkFor(job);
  if (path) return `${origin}${path}`;
  if (job.roleCode) return `${origin}${applyWithCodePath(job.roleCode)}`;
  return `${origin}/candidate/job/${job.id}`;
}

/**
 * Where the careers page's root (hireflownow.com/) goes. Exactly one open job:
 * straight to it. None or several: null, and the careers page shows them (or
 * its empty state).
 */
export function rootDestination(openJobs: ReadonlyArray<LinkableJob> | null | undefined): string | null {
  if (!openJobs || openJobs.length !== 1) return null;
  return jobPagePath(openJobs[0]);
}

/** The URL's slug as the database stores it (a link typed as /Team-Lead/
 *  still finds team-lead), or null when it cannot be a short link at all. */
export function slugFromParam(param: string | null | undefined): string | null {
  const value = (param ?? "").trim().toLowerCase();
  return SLUG_PATTERN.test(value) ? value : null;
}

/** The job page an auth redirect came back to, without its "apply" ask, or
 *  null when the redirect is not a public job page. Used by the sign-in
 *  screen's way back: a redirect into the signed-in steps would just send a
 *  signed-out person to sign-in again. */
export function jobPageFromRedirect(redirect: string | null | undefined): string | null {
  if (!redirect || !redirect.startsWith("/") || redirect.startsWith("//")) return null;
  const [path, query = ""] = redirect.split("?");
  const segment = path.slice(1);
  const isShortLink = slugFromParam(segment) === segment && !RESERVED_SLUGS.has(segment);
  const isJobPage = isShortLink || isBusinessJobPath(path) || /^\/candidate\/job\/[^/]+\/?$/.test(path);
  if (!isJobPage) return null;
  const params = new URLSearchParams(query);
  params.delete("apply");
  const rest = params.toString();
  return rest ? `${path}?${rest}` : path;
}

/** /c/<business>/<job>, exactly as the database would store both names. */
function isBusinessJobPath(path: string): boolean {
  const m = /^\/c\/([^/]+)\/([^/]+)\/?$/.exec(path);
  return !!m && businessSlugFromParam(m[1]) === m[1] && slugFromParam(m[2]) === m[2];
}

export type JobPageRef = { business: string; slug: string } | { slug: string } | { id: string };

/** Which job a public job page path names: its business and name, its root
 *  link, or its id. Used by the sign-in screen to say which job the person is
 *  applying for. */
export function jobRefFromPagePath(path: string | null | undefined): JobPageRef | null {
  if (!path) return null;
  const bare = path.split("?")[0].replace(/\/+$/, "");
  const scoped = /^\/c\/([^/]+)\/([^/]+)$/.exec(bare);
  if (scoped) {
    const business = businessSlugFromParam(scoped[1]);
    const slug = slugFromParam(scoped[2]);
    return business && slug && business === scoped[1] && slug === scoped[2] ? { business, slug } : null;
  }
  const byId = /^\/candidate\/job\/([^/]+)$/.exec(bare);
  if (byId) {
    try {
      return { id: decodeURIComponent(byId[1]) };
    } catch {
      return null;
    }
  }
  const segment = bare.slice(1);
  const slug = slugFromParam(segment);
  return slug && slug === segment && !RESERVED_SLUGS.has(slug) ? { slug } : null;
}

/** The job page's cache key for a job named by its business and name. */
export function jobLookupKey(business: string, slug: string): string {
  return `job:${business}/${slug}`;
}

/** The cache key the job page reads for a path's job (the sign-in screen and
 *  the careers page hand the row over under it). */
export function refLookupKey(ref: JobPageRef | null | undefined): string | null {
  if (!ref) return null;
  if ("business" in ref) return jobLookupKey(ref.business, ref.slug);
  if ("slug" in ref) return `slug:${ref.slug}`;
  return ref.id;
}

/** The cache key of the page a job's short path opens. */
export function pageLookupKey(job: Pick<LinkableJob, "id" | "slug" | "business_slug" | "root_link">): string {
  return refLookupKey(jobRefFromPagePath(shortLinkFor(job))) ?? job.id;
}

/** The job page with the "start my application" ask that sign-in carries back. */
export function withApplyAsk(path: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}apply=1`;
}

/**
 * The database's answer to a save that broke a short-link rule, in the
 * editor's terms: the unique index (another job holds the name, including a
 * draft this person cannot see) or the format check. Anything else: null.
 */
export function slugSaveProblem(error: unknown): "taken" | "format" | null {
  const e = (error ?? null) as { code?: string; message?: string; details?: string } | null;
  const text = `${e?.message ?? ""} ${e?.details ?? ""}`;
  if (e?.code === "23505" && /jobs_slug_per_business|jobs_slug_unique/.test(text)) return "taken";
  if (e?.code === "23514" && /jobs_slug_format/.test(text)) return "format";
  return null;
}
