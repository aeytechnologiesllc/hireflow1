/**
 * Stored links can only become in-app paths or http(s) addresses
 * (2026-10-25; docs/LAUNCH-PLAN.md, Phase 1, task 1).
 *
 * The hole: an applicant could create a notification for the business they
 * applied to with link = "javascript:...", and the Notifications page
 * rendered it through <Link to>, which turns an absolute URL into a plain
 * <a href>; React 18 does not block javascript:. The same shape existed for
 * an applicant's LinkedIn/portfolio address, a business's meeting link, a
 * message attachment, a document's embedded PDF address, an inline document
 * opened as a blob, and sign-in redirects that let "/\evil.example" through.
 *
 * Fixed three ways, each guarded here:
 *   1. src/lib/safeLink.ts (inAppPath / externalHref / openExternal) at every
 *      place a value from the database or the address bar becomes something
 *      to click, open or frame;
 *   2. supabase/migrations/20261025010000_safe_links.sql cleans the stored
 *      columns (and its CHECKs use IS NOT DISTINCT FROM: a CHECK that
 *      evaluates to NULL passes, which `f(x) = x` did for every bad value);
 *   3. a Content-Security-Policy (vercel.json, built by scripts/csp.mjs).
 *
 * Proven by scripts/safe_links.pglite.test.mjs and scripts/csp.test.mjs.
 */

const SINK = /(href=\{|<Link\b[^>]*?\sto=\{|window\.open\(|<iframe\b[^>]*?\ssrc=\{|\.location\.href\s*=\s*)([^}\n,);]*)/g;
const FILTERED = /externalHref\(|inAppPath\(|openExternal\(/;
const LITERAL_SAFE = /^["'`](\/|#|https:\/\/|mailto:|tel:)/;

/**
 * Dynamic sinks reviewed on 2026-10-25 and safe as they are: the value is a
 * route from the app's own config, a URL the server signed or the page made
 * itself (blob:), or a variable already passed through safeLink. A new entry
 * needs the same review: say where the value comes from.
 */
const REVIEWED = {
  "src/cockpit/Shell.tsx": ["item.to"], // nav config
  "src/components/AppSidebar.tsx": ["to"], // nav config
  "src/components/LegalPage.tsx": ["other.to"], // static legal pages list
  "src/cockpit/components/journey/GuideStepper.tsx": ["s.href"], // static guide steps
  "src/components/GettingStartedChecklist.tsx": ["item.link"], // static checklist
  "src/cockpit/components/ApplicantRow.tsx": ["applicantPath(row.id"], // built route
  "src/pages/BusinessCareers.tsx": ["jobPagePath(role"],
  "src/pages/OpenJobs.tsx": ["jobPagePath(job", "`${staffOrigin("],
  "src/pages/Index.tsx": ["CAREERS_PATH", "account.to", "jobPagePath(job", "staffSignInHref("],
  "src/pages/CandidateContinue.tsx": ["openRolesPath("],
  "src/pages/CandidatePortalLanding.tsx": ["openRolesPath("],
  "src/pages/CandidateAuth.tsx": ['backToJob ?? "/candidate"', "staffSignInHref("], // backToJob: jobPageFromRedirect(inAppPath(...))
  "src/pages/Auth.tsx": ['inWebView ? "/?showLanding=true" : "/"'],
  "src/pages/AuthCallback.tsx": ["signInPath"], // built from the portal role
  "src/pages/NotFound.tsx": ["isStaffHost("],
  "src/pages/AvaCreateJob.tsx": ["jobPageUrl({ id: publishedRoleId"],
  "src/cockpit/components/ShareJobCard.tsx": ["jobPageUrl(job"],
  "src/components/JobPublishedDialog.tsx": ["shareLink"], // built from the job's own slug
  "src/components/business/CareersPageCard.tsx": ["link"], // the business's own careers address
  "src/components/trust/ReportJobDialog.tsx": ["signIn"], // built sign-in route
  "src/cockpit/components/ShareKitDialog.tsx": ['""', "ONLINEJOBS_URL"], // blank print window; constant
  "src/cockpit/components/journey/GuideStages.tsx": ["ONLINEJOBS_URL"],
  "src/components/InterviewSchedulingWizard.tsx": ["authUrl.toString("], // Google OAuth URL built here
  "src/cockpit/components/ApplicantDocumentsPanel.tsx": ['""', "url"], // blank tab, then the server-signed URL
  "src/cockpit/components/DocumentPreviewDialog.tsx": ["`${displayUrl", "displayUrl"], // storage-signed
  "src/cockpit/components/ResumeViewerDialog.tsx": ["`${displayUrl"], // storage-signed
  "src/cockpit/components/TeamDocumentSheet.tsx": ["url"], // document-signing download URL
  "src/components/documents/ApplicantDocumentSheet.tsx": ["url"], // document-signing download URL
  "src/components/documents/SignedDocumentViewer.tsx": ["data.url", "uploadedSrc"], // server URL; externalHref'd
  "src/cockpit/pages/Documents.tsx": ["url"], // blob made in openDocument after the type allow-list
  "src/pages/ApplicationFormPhase.tsx": ["url", "s"], // blob of the applicant's own file; storage-signed
  "src/pages/Profile.tsx": ["signed"], // storage-signed
  "src/pages/Notifications.tsx": ["link"], // = inAppPath(...)
  "src/lib/safeLink.ts": ["href"], // openExternal itself, after externalHref
  "src/cockpit/pages/Messages.tsx": ["fileHref", "fileHref ?? undefined"], // = externalHref(...)
  "src/cockpit/components/AvasRead.tsx": ["recording"], // = externalHref(...)
};

/**
 * The REVIEWED entries that are variables already filtered: each must still
 * be assigned through safeLink, or the allow-list would hide a revert (the
 * Pass C review, 2026-10-25: changing `const link = inAppPath(...)` back to
 * the raw value left the sink text as `link`, and the guard still passed).
 */
const SAFE_ASSIGNMENTS = {
  "src/pages/Notifications.tsx": /const link = inAppPath\(/,
  "src/cockpit/pages/Messages.tsx": /const fileHref = file \? externalHref\(file\.url\) : null;/,
  "src/cockpit/components/AvasRead.tsx": /const recording = externalHref\(/,
  "src/components/documents/SignedDocumentViewer.tsx": /const uploadedSrc = externalHref\(/,
  "src/pages/CandidateAuth.tsx": /const safeRedirectTarget = inAppPath\(redirectTarget\);/,
  "src/pages/AuthCallback.tsx": /return inAppPath\(value\);/,
};

function codeOnly(text) {
  return text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    })
    .join("\n");
}

export default [
  {
    id: "dynamic-links-go-through-safelink",
    why:
      "A value from the database or the address bar reached href / <Link to> / window.open / an " +
      "iframe src without src/lib/safeLink.ts. A stored javascript: link runs in the HireFlow page " +
      "when clicked (the 2026-10-24 audit's notification hole). Wrap it in inAppPath (in-app " +
      "paths) or externalHref / openExternal (http(s) addresses), or, if it is a route from the " +
      "app's own config or a URL the server signed, add it to REVIEWED in this guard with where " +
      "the value comes from.",
    run: async ({ read, walk }) => {
      const detail = [];
      for (const rel of await walk("src", [".tsx", ".ts"])) {
        if (rel.startsWith("src/dev-preview/")) continue;
        const text = codeOnly((await read(rel)) ?? "");
        for (const m of text.matchAll(SINK)) {
          const expr = m[2].trim();
          if (!expr || LITERAL_SAFE.test(expr) || FILTERED.test(expr)) continue;
          if ((REVIEWED[rel] ?? []).includes(expr)) continue;
          detail.push(`${rel}: ${m[1].trim()} ${expr}`);
        }
      }
      for (const [rel, pattern] of Object.entries(SAFE_ASSIGNMENTS)) {
        const text = codeOnly((await read(rel)) ?? "");
        if (!pattern.test(text)) detail.push(`${rel}: the value REVIEWED trusts is no longer assigned through safeLink (${pattern})`);
      }
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },

  {
    id: "redirect-params-reject-backslash",
    why:
      'A redirect check of the form startsWith("/") && !startsWith("//") lets "/\\evil.example" ' +
      "through, which browsers treat as //evil.example: an off-site redirect after sign-in. Use " +
      "inAppPath from src/lib/safeLink.ts.",
    run: async ({ read, walk }) => {
      const detail = [];
      const allowed = new Set(["src/lib/safeLink.ts", "src/lib/authRouting.ts", "src/lib/jobSlug.ts"]);
      for (const rel of await walk("src", [".tsx", ".ts"])) {
        if (allowed.has(rel) || rel.startsWith("src/dev-preview/")) continue;
        const text = codeOnly((await read(rel)) ?? "");
        if (/startsWith\(["']\/["']\)\s*&&\s*!\s*[\w.?]+\.startsWith\(["']\/\/["']\)/.test(text)) {
          detail.push(`${rel}: hand-written redirect check; use inAppPath()`);
        }
      }
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },

  {
    id: "stored-link-columns-cleaned-in-db",
    why:
      "supabase/migrations/20261025010000_safe_links.sql must keep cleaning notifications.link, " +
      "interviews.meeting_link, profiles.linkedin_url/portfolio_url and messages.file_url, and its " +
      "CHECKs must use IS NOT DISTINCT FROM (a CHECK that evaluates to NULL passes).",
    run: async ({ read }) => {
      const sql = await read("supabase/migrations/20261025010000_safe_links.sql");
      if (sql == null) return { ok: false, detail: ["the safe_links migration is missing"] };
      const detail = [];
      for (const t of ["notifications_safe_link", "interviews_safe_meeting_link", "profiles_safe_urls", "messages_safe_file_url"]) {
        if (!new RegExp(`create trigger ${t}\\b`).test(sql)) detail.push(`trigger ${t} is missing`);
      }
      for (const c of ["notifications_link_in_app", "messages_file_url_no_script"]) {
        const m = new RegExp(`add constraint ${c}\\s+check \\(([^;]+)\\);`).exec(sql);
        if (!m) detail.push(`constraint ${c} is missing`);
        else if (!/is not distinct from/i.test(m[1])) detail.push(`constraint ${c} must use IS NOT DISTINCT FROM`);
      }
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },

  {
    id: "csp-header-matches-sources",
    why:
      "vercel.json's Content-Security-Policy must be exactly what scripts/csp.mjs builds from " +
      "index.html and public/landing.html. Editing an inline script changes its sha256, and a " +
      "stale hash blocks that script once the policy is enforced. Run: node scripts/csp.mjs --write",
    run: async ({ read }) => {
      const csp = await import(new URL("../csp.mjs", import.meta.url));
      const vercel = JSON.parse((await read("vercel.json")) ?? "{}");
      const block = (vercel.headers ?? []).find(csp.isCspBlock);
      if (!block) return { ok: false, detail: ["vercel.json has no Content-Security-Policy header block"] };
      const header = block.headers.find((h) => h.key === csp.HEADER_REPORT_ONLY || h.key === csp.HEADER_ENFORCED);
      const expected = csp.buildPolicy({ indexHtml: (await read("index.html")) ?? "", landingHtml: (await read("public/landing.html")) ?? "" });
      const detail = [];
      if (header.value !== expected) detail.push("the policy in vercel.json is stale; run node scripts/csp.mjs --write");
      if (!header.value.includes(csp.REPORT_URI)) detail.push("the policy has lost its report-uri");
      for (const key of ["X-Content-Type-Options", "Referrer-Policy"]) {
        if (!block.headers.some((h) => h.key === key)) detail.push(`${key} header is missing`);
      }
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
];
