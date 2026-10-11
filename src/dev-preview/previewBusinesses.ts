import type { FixtureRow, FixtureTables } from "./fixtureClient";

/**
 * Two businesses with the same job name, offline (`?__previewBusinesses=two`;
 * docs/SHORT-JOB-LINKS.md, "Per business"). The scenario's first job becomes
 * Zulu Support Team's "team-lead" (with the root link it was handed before
 * links went per business), and a second business, Lucky Star Support, gets a
 * "team-lead" of its own. So /c/zulu-support-team/team-lead,
 * /c/lucky-star-support/team-lead, /team-lead and /c/lucky-star-support can
 * each be opened and checked to land on the right job. Without the flag
 * nothing changes.
 */

export const LUCKY_EMPLOYER = "b0000000-0000-4000-8000-00000000000b";
export const LUCKY_JOB = "b0000000-0000-4000-8000-0000000000b1";

export function previewBusinesses(tables: FixtureTables, spec: string | null) {
  if (spec !== "two") return;
  const jobs = tables.jobs ?? [];
  const home = jobs[0];
  if (!home) return;
  const homeEmployer = String(home.employer_id);
  const pub = (tables.published_jobs_public ??= []);
  for (const row of [...jobs, ...pub]) {
    if (row.id === home.id) Object.assign(row, { slug: "team-lead", root_link: true, business_slug: "zulu-support-team" });
  }
  (tables.business_pages ??= []).push(
    { employer_id: homeEmployer, slug: "zulu-support-team", about: null, home_alias: true },
    { employer_id: LUCKY_EMPLOYER, slug: "lucky-star-support", about: "Remote chat support · Philippines", home_alias: false },
  );
  (tables.employer_public_branding ??= []).push({ user_id: LUCKY_EMPLOYER, company_name: "Lucky Star Support", company_logo: null });
  const lucky: FixtureRow = {
    ...(pub.find((r) => r.id === home.id) ?? home),
    id: LUCKY_JOB,
    employer_id: LUCKY_EMPLOYER,
    title: "Team Leader (Night Shift)",
    description: "Lead a small night-shift chat team for Lucky Star Support.",
    slug: "team-lead",
    business_slug: "lucky-star-support",
    root_link: false,
    job_code: "JOB-LUCKY1",
    salary_min: 35000,
    salary_max: 35000,
    salary_currency: "PHP",
    salary_period: "MONTH",
    created_at: new Date(Date.now() - 86_400_000).toISOString(),
  };
  pub.push(lucky);
  // The job itself, as the jobs table holds it (the application pages read it).
  const { business_slug: _business, ...asJob } = lucky;
  void _business;
  jobs.push({ ...asJob, status: "published" });
}
