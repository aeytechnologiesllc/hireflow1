import type { FixtureAuthUser, FixtureRow, FixtureTables } from "./fixtureClient";

/**
 * The new-business screens, offline (the 2026-10-11 mock-ups): standing,
 * Help and Admin. Switches:
 *   ?__previewAdmin=1        the signed-in person runs HireFlow (sees Admin)
 *   ?__previewStanding=new   the business is new / approved / suspended
 *                            (default approved)
 *   ?__previewHelp=1         a Help thread and an Admin inbox with messages
 *   ?__previewReports=1      two reports in Admin
 *   ?__previewNoJobs=1       a business that has posted nothing yet (first steps)
 * Nothing here reaches the network; it answers the same database functions
 * the live screens call (src/lib/trustApi.ts).
 */

const NIGHT_OWL = "c0000000-0000-4000-8000-00000000000c";
const LUCKY = "b0000000-0000-4000-8000-00000000000b";

type Status = "new" | "approved" | "suspended";

export function previewTrustHandlers(
  tables: FixtureTables,
  user: FixtureAuthUser,
  params: URLSearchParams,
): Record<string, (args: unknown) => unknown> {
  const rows = (name: string): FixtureRow[] => (tables[name] ??= []);
  const admin = params.get("__previewAdmin") === "1";
  const standing: Status = (["new", "approved", "suspended"] as const).find((s) => s === params.get("__previewStanding")) ?? "approved";
  const now = Date.now();
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
  const me = user.id;
  rows("help_messages");
  rows("employer_reports");
  if (params.get("__previewNoJobs") === "1") {
    for (const name of ["jobs", "published_jobs_public", "applications", "interviews", "documents", "document_requests"]) tables[name] = [];
  }

  const businesses: Array<{ employer_id: string; email: string; company_name: string; full_name: string; signed_up_at: string; status: Status; status_reason: string | null; jobs_live: number; jobs_total: number; applicants: number; open_reports: number }> = [
    { employer_id: me, email: user.email ?? "you@example.com", company_name: "Zulu Support Team", full_name: "Zack", signed_up_at: iso(40 * 86_400_000), status: "approved", status_reason: null, jobs_live: 1, jobs_total: 1, applicants: 38, open_reports: 0 },
    { employer_id: LUCKY, email: "maria@luckystar.example", company_name: "Lucky Star Support", full_name: "Maria Santos", signed_up_at: iso(3_600_000), status: "approved", status_reason: null, jobs_live: 1, jobs_total: 1, applicants: 4, open_reports: 0 },
    { employer_id: NIGHT_OWL, email: "rico@nightowl.example", company_name: "Night Owl Chat", full_name: "Rico", signed_up_at: iso(3 * 86_400_000), status: "suspended", status_reason: "Asked applicants for a fee", jobs_live: 0, jobs_total: 1, applicants: 11, open_reports: 2 },
  ];
  if (params.get("__previewReports") === "1") {
    rows("employer_reports").push(
      { id: "rep-1", employer_id: NIGHT_OWL, company_name: "Night Owl Chat", job_id: null, job_title: "Chat agent", reporter_name: "Ana Reyes", reason: "asked_for_money", details: "They asked for 500 pesos for training.", status: "open", created_at: iso(2 * 86_400_000) },
      { id: "rep-2", employer_id: LUCKY, company_name: "Lucky Star Support", job_id: null, job_title: "Team Leader (Night Shift)", reporter_name: "Ben Cruz", reason: "unsafe", details: null, status: "closed", created_at: iso(5 * 86_400_000) },
    );
  }
  if (params.get("__previewHelp") === "1") {
    rows("help_messages").push(
      { id: "help-1", employer_id: me, from_admin: false, author_id: me, body: "How do I add my logo to the careers page?", created_at: iso(2 * 3_600_000), read_at: iso(3_600_000) },
      { id: "help-2", employer_id: me, from_admin: true, author_id: "admin", body: "Open Profile and add it under Company logo. It shows on your careers page right away.", created_at: iso(3_600_000), read_at: null },
      { id: "help-3", employer_id: LUCKY, from_admin: false, author_id: LUCKY, body: "Can I invite my supervisor to see applicants?", created_at: iso(20 * 60_000), read_at: null },
    );
  }

  const isAdmin = () => {
    if (!admin) throw new Error("admins_only");
  };
  const helpThreads = () =>
    [...new Set(rows("help_messages").map((m) => String(m.employer_id)))]
      .map((id) => {
        const thread = rows("help_messages").filter((m) => m.employer_id === id).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
        const last = thread[thread.length - 1];
        const biz = businesses.find((b) => b.employer_id === id);
        return {
          employer_id: id,
          company_name: biz?.company_name ?? null,
          email: biz?.email ?? "",
          last_body: last.body,
          last_at: last.created_at,
          last_from_admin: last.from_admin,
          unread: thread.filter((m) => !m.from_admin && !m.read_at).length,
        };
      })
      .sort((a, b) => String(b.last_at).localeCompare(String(a.last_at)));

  return {
    is_platform_admin: () => admin,
    my_business_standing: () => ({ status: standing, can_request_ids: standing === "approved", is_admin: admin }),
    admin_businesses: () => (isAdmin(), businesses.map((b) => ({ ...b, last_sign_in_at: b.signed_up_at }))),
    admin_reports: () => (isAdmin(), rows("employer_reports").map((r) => ({ ...r }))),
    admin_close_report: (args) => {
      isAdmin();
      const { p_report_id } = (args ?? {}) as { p_report_id?: string };
      const r = rows("employer_reports").find((x) => x.id === p_report_id);
      if (r) r.status = "closed";
      return null;
    },
    admin_set_business_status: (args) => {
      isAdmin();
      const { p_employer, p_status, p_reason } = (args ?? {}) as { p_employer?: string; p_status?: Status; p_reason?: string | null };
      if (p_employer === me && p_status === "suspended") throw new Error("cannot_suspend_yourself");
      const b = businesses.find((x) => x.employer_id === p_employer);
      if (!b || !p_status) throw new Error("not_a_business");
      b.status = p_status;
      b.status_reason = p_status === "suspended" ? (p_reason ?? null) : null;
      b.jobs_live = p_status === "suspended" ? 0 : Math.max(b.jobs_live, b.jobs_total);
      return p_status;
    },
    admin_help_threads: () => (isAdmin(), helpThreads()),
    admin_reply_help: (args) => {
      isAdmin();
      const { p_employer, p_body } = (args ?? {}) as { p_employer?: string; p_body?: string };
      if (!p_body?.trim()) throw new Error("empty_message");
      for (const m of rows("help_messages")) if (m.employer_id === p_employer && !m.from_admin) m.read_at = new Date().toISOString();
      const id = `help-${Math.random().toString(36).slice(2)}`;
      rows("help_messages").push({ id, employer_id: p_employer ?? "", from_admin: true, author_id: me, body: p_body.trim(), created_at: new Date().toISOString(), read_at: null });
      return id;
    },
    send_help_message: (args) => {
      const { p_body } = (args ?? {}) as { p_body?: string };
      if (!p_body?.trim()) throw new Error("empty_message");
      // An applicant writes in a thread of their own (20261025200000_help_for_applicants.sql).
      const id = `help-${Math.random().toString(36).slice(2)}`;
      rows("help_messages").push({ id, employer_id: me, from_admin: false, author_id: me, body: p_body.trim(), created_at: new Date().toISOString(), read_at: null });
      return id;
    },
    mark_help_read: (args) => {
      const { p_employer } = (args ?? {}) as { p_employer?: string | null };
      for (const m of rows("help_messages")) {
        if (p_employer ? m.employer_id === p_employer && !m.from_admin : m.employer_id === me && m.from_admin) m.read_at = new Date().toISOString();
      }
      return null;
    },
    report_employer: () => "rep-new",
    // The caller's careers page, made the first time (as ensure_business_page does).
    ensure_business_page: () => {
      const pages = rows("business_pages");
      const found = pages.find((p) => p.employer_id === me);
      if (found) return found.slug;
      const profile = rows("profiles").find((p) => p.user_id === me);
      const base = String(profile?.company_name || profile?.full_name || "business").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "business";
      pages.push({ employer_id: me, slug: base, about: null, home_alias: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      return base;
    },
  };
}
