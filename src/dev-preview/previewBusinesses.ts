import type { FixtureAuthUser, FixtureRow, FixtureTables } from "./fixtureClient";

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

/** Signing in as Lucky Star Support's owner (`?__previewEmployer=lucky`). */
export const LUCKY_USER: FixtureAuthUser = {
  id: LUCKY_EMPLOYER,
  email: "maria@luckystar.example",
  user_metadata: { role: "employer", full_name: "Maria Santos" },
};

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
  // Lucky Star's owner, so the preview can sign in as them too.
  (tables.user_roles ??= []).push({ user_id: LUCKY_EMPLOYER, role: "employer" });
  const someProfile = (tables.profiles ?? []).find((p) => p.company_name) ?? {};
  (tables.profiles ??= []).push({ ...someProfile, id: LUCKY_EMPLOYER, user_id: LUCKY_EMPLOYER, full_name: "Maria Santos", email: LUCKY_USER.email, company_name: "Lucky Star Support", company_logo: null, avatar_url: null });
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

/**
 * One applicant who applied to both businesses (`?__previewApplied=both`,
 * with `__previewBusinesses=two`): the owner's question of 2026-10-11, "if
 * another person also uses the same app for the job, the same lady clicks on
 * that special link ... does she see both of the applications? Will it
 * collide?" She has one account and two separate applications: Zulu's
 * team-lead at a later step, Lucky Star's just started, and one paper asked
 * by each. Each business's screens show only its own.
 */
export function previewAppliedToBoth(tables: FixtureTables, candidateId: string, spec: string | null) {
  if (spec !== "both") return;
  const jobs = tables.jobs ?? [];
  const home = jobs[0];
  const lucky = jobs.find((j) => j.id === LUCKY_JOB);
  const template = (tables.applications ?? [])[0];
  if (!home || !lucky || !template) return;
  const apps = (tables.applications ??= []);
  const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  // Her profile, as every business she applied to sees it.
  const profiles = (tables.profiles ??= []);
  const mine = profiles.find((p) => p.user_id === candidateId);
  const profile = { full_name: "Jordan Alvarez", email: "jordan.alvarez@example.com", country: "Philippines", location: "Cebu, Philippines", onboarding_completed: true };
  if (mine) Object.assign(mine, profile);
  else profiles.push({ id: candidateId, user_id: candidateId, avatar_url: null, ...profile });
  // Zulu: every step done, waiting on the team's decision.
  const zuluApp: FixtureRow = {
    ...template,
    id: "a1000000-0000-4000-8000-0000000000a1",
    candidate_id: candidateId,
    job_id: home.id,
    status: "reviewing",
    phase: "review",
    ai_score: null,
    ai_scorecard: null,
    notes: null,
    created_at: day(3),
    updated_at: day(1),
    jobs: home,
  };
  const luckyApp: FixtureRow = {
    ...template,
    id: "a1000000-0000-4000-8000-0000000000a2",
    candidate_id: candidateId,
    job_id: LUCKY_JOB,
    status: "in_progress",
    phase: "application",
    ai_score: null,
    ai_scorecard: null,
    notes: null,
    created_at: day(0),
    updated_at: day(0),
    jobs: lucky,
  };
  apps.push(zuluApp, luckyApp);
  const request = (app: FixtureRow, id: string, type: string, ask: string): FixtureRow => ({
    id,
    application_id: app.id,
    employer_id: (app.jobs as FixtureRow).employer_id,
    candidate_id: candidateId,
    document_type: type,
    custom_document_name: null,
    description: ask,
    is_required: true,
    due_date: day(-5),
    status: "pending",
    file_url: null,
    file_name: null,
    answer_text: null,
    created_at: day(0),
    updated_at: day(0),
    applications: { id: app.id, candidate_id: candidateId, jobs: app.jobs },
  });
  (tables.document_requests ??= []).push(
    request(zuluApp, "d1000000-0000-4000-8000-0000000000d1", "government_id", "A clear photo of a government ID."),
    request(luckyApp, "d1000000-0000-4000-8000-0000000000d2", "payment_email", "The email you use on Wise or PayPal."),
  );
}
