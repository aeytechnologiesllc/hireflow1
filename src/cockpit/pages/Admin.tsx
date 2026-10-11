import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "../components/PageHeader";
import { ActionDialog } from "../components/ActionDialog";
import { CockpitErrorCard } from "../components/ErrorCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { trustApi, trustErrorWords, type AdminBusiness, type AdminReport, type BusinessStatus, type HelpThread } from "@/lib/trustApi";
import { REPORT_REASONS } from "@/components/trust/ReportJobDialog";

/**
 * Admin (the 2026-10-11 mock-ups, #7): only the platform admin. Every
 * business with Approve / Pause / Open again, the applicants' reports, and
 * the businesses' Help messages. Each action is the database's own
 * admin_* function, which checks is_platform_admin() again; this page only
 * shows the buttons. Pausing closes the business's live jobs and asks why;
 * opening it again reopens them (admin_set_business_status).
 */

type Tab = "businesses" | "reports" | "help";
const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: "businesses", label: "Businesses" },
  { key: "reports", label: "Reports" },
  { key: "help", label: "Help" },
];

const STATUS_WORDS: Record<BusinessStatus, string> = { new: "New", approved: "Approved", suspended: "Paused" };
const STATUS_STYLE: Record<BusinessStatus, CSSProperties> = {
  new: { background: "var(--hf-gold-soft)", color: "var(--hf-gold)" },
  approved: { background: "var(--jade-soft)", color: "var(--jade-soft-fg)" },
  suspended: { background: "color-mix(in srgb, var(--hf-danger) 14%, transparent)", color: "var(--hf-danger)" },
};

function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

function reasonWords(key: string): string {
  return REPORT_REASONS.find((r) => r.key === key)?.label ?? key;
}

export default function CockpitAdmin() {
  const admin = usePlatformAdmin();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.key === params.get("tab"))?.key ?? "businesses") as Tab;
  const setTab = (next: Tab) => setParams(next === "businesses" ? {} : { tab: next }, { replace: true });

  const businesses = useQuery({ queryKey: ["admin", "businesses"], enabled: admin, queryFn: () => trustApi.adminBusinesses() });
  const reports = useQuery({ queryKey: ["admin", "reports"], enabled: admin, queryFn: () => trustApi.adminReports() });
  const threads = useQuery({ queryKey: ["admin", "help"], enabled: admin, refetchInterval: 60_000, queryFn: () => trustApi.adminHelpThreads() });
  const ids = useMemo(() => (businesses.data ?? []).map((b) => b.employer_id), [businesses.data]);
  const pages = useQuery({
    queryKey: ["admin", "pages", ids.join(",")],
    enabled: admin && ids.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("business_pages" as never).select("employer_id, slug, home_alias").in("employer_id", ids);
      return new Map(((data ?? []) as unknown as { employer_id: string; slug: string; home_alias: boolean }[]).map((p) => [p.employer_id, p]));
    },
  });

  const openReports = (reports.data ?? []).filter((r) => r.status === "open").length;
  const unread = (threads.data ?? []).reduce((n, t) => n + t.unread, 0);
  const counts: Record<Tab, number> = { businesses: (businesses.data ?? []).length, reports: openReports, help: unread };

  if (!admin) {
    return (
      <div className="space-y-5">
        <PageHeader title="Admin" />
        <div className="ck-card p-5 text-[14px]" style={{ color: "var(--hf-text-soft)" }} data-admin-locked>
          Only HireFlow can open this page.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-admin-page>
      <PageHeader title="Admin" subtitle="Every business on HireFlow, the reports and the Help messages." />
      <div role="tablist" aria-label="Admin" className="flex flex-wrap gap-5 border-b" style={{ borderColor: "var(--line)" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className="-mb-px border-b-2 py-2.5 text-[14px]"
            style={tab === t.key ? { borderColor: "var(--jade)", color: "var(--hf-text)", fontWeight: 600 } : { borderColor: "transparent", color: "var(--ink-3)" }}
            data-admin-tab={t.key}
          >
            {t.label}
            {counts[t.key] > 0 && <span className="ml-1.5 font-semibold" style={{ color: "var(--hf-gold)" }}>{counts[t.key]}</span>}
          </button>
        ))}
      </div>
      {tab === "businesses" && (
        <BusinessesTab
          query={businesses}
          pages={pages.data}
          me={user?.id ?? null}
        />
      )}
      {tab === "reports" && <ReportsTab query={reports} businesses={businesses.data ?? []} />}
      {tab === "help" && <HelpTab query={threads} />}
    </div>
  );
}

function BusinessesTab({
  query,
  pages,
  me,
}: {
  query: { data?: AdminBusiness[]; isLoading: boolean; isError: boolean; refetch: () => unknown };
  pages?: Map<string, { slug: string; home_alias: boolean }>;
  me: string | null;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [pausing, setPausing] = useState<AdminBusiness | null>(null);

  const setStatus = async (b: AdminBusiness, status: BusinessStatus, reason?: string) => {
    setBusy(b.employer_id);
    try {
      await trustApi.adminSetStatus(b.employer_id, status, reason);
      const name = b.company_name || b.email;
      toast.success(status === "approved" ? (b.status === "suspended" ? `${name} is open again. Its jobs are back.` : `${name} is approved.`) : status === "suspended" ? `${name} is paused. Its jobs are closed.` : `${name} is back to new.`);
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    } catch (error) {
      toast.error(trustErrorWords(error, "That didn't go through. Please try again."));
    } finally {
      setBusy(null);
      setPausing(null);
    }
  };

  if (query.isError) return <CockpitErrorCard message="We couldn't load the businesses just now." onRetry={query.refetch} />;
  if (query.isLoading) return <Loader2 className="mx-auto h-5 w-5 animate-spin" style={{ color: "var(--hf-text-muted)" }} aria-label="Loading" />;
  const rows = [...(query.data ?? [])].sort((a, b) => {
    const order: Record<BusinessStatus, number> = { new: 0, suspended: 1, approved: 2 };
    return order[a.status] - order[b.status] || +new Date(b.signed_up_at) - +new Date(a.signed_up_at);
  });

  return (
    <>
      <ActionDialog
        open={!!pausing}
        title={`Pause ${pausing?.company_name || pausing?.email || "this business"}?`}
        description="Its live jobs close and applicants can't apply. It sees why in its bell and can message you in Help. You can open it again any time; its jobs come back."
        confirmLabel="Pause business"
        tone="danger"
        busy={!!busy}
        withReason
        reasonRequired
        reasonLabel="Why (they see this)"
        reasonPlaceholder="Asked applicants for a fee"
        onConfirm={(reason) => pausing && void setStatus(pausing, "suspended", reason)}
        onClose={() => setPausing(null)}
      />
      <div className="ck-card overflow-x-auto" data-admin-businesses>
        <table className="w-full min-w-[760px] text-[13.5px]">
          <thead>
            <tr className="text-left text-[12px]" style={{ color: "var(--ink-3)" }}>
              <th className="px-4 pb-2 pt-3 font-medium">Business</th>
              <th className="px-3 pb-2 pt-3 font-medium">Joined</th>
              <th className="px-3 pb-2 pt-3 text-right font-medium">Jobs</th>
              <th className="px-3 pb-2 pt-3 text-right font-medium">Applicants</th>
              <th className="px-3 pb-2 pt-3 font-medium">Standing</th>
              <th className="px-4 pb-2 pt-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const page = pages?.get(b.employer_id);
              const mine = b.employer_id === me;
              return (
                <tr key={b.employer_id} style={{ borderTop: "1px solid var(--line)" }} data-admin-business={b.status}>
                  <td className="px-4 py-3">
                    <div style={{ color: "var(--hf-text)" }}>{b.company_name || b.full_name || b.email}</div>
                    <div className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                      {mine ? "you" : b.email}
                      {page ? ` · ${page.home_alias ? "/careers" : `/c/${page.slug}`}` : ""}
                      {b.open_reports > 0 ? ` · ${b.open_reports} open report${b.open_reports === 1 ? "" : "s"}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-3" style={{ color: "var(--hf-text-soft)" }}>{shortDate(b.signed_up_at)}</td>
                  <td className="px-3 py-3 text-right tabular-nums" style={{ color: "var(--hf-text-soft)" }}>{b.jobs_live}<span style={{ color: "var(--ink-3)" }}> / {b.jobs_total}</span></td>
                  <td className="px-3 py-3 text-right tabular-nums" style={{ color: "var(--hf-text-soft)" }}>{b.applicants}</td>
                  <td className="px-3 py-3">
                    <span className="inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-medium" style={STATUS_STYLE[b.status]}>{STATUS_WORDS[b.status]}</span>
                    {b.status === "suspended" && b.status_reason && (
                      <div className="mt-1 max-w-[220px] text-[12px]" style={{ color: "var(--ink-3)" }}>&ldquo;{b.status_reason}&rdquo;</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {mine ? (
                        <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>Free forever</span>
                      ) : (
                        <>
                          {b.status === "new" && (
                            <button className="ck-btn ck-btn-primary !min-h-8 !px-3 !text-[13px]" disabled={busy === b.employer_id} onClick={() => void setStatus(b, "approved")} data-admin-approve>
                              Approve
                            </button>
                          )}
                          {b.status === "suspended" ? (
                            <button className="ck-btn ck-btn-outline !min-h-8 !px-3 !text-[13px]" disabled={busy === b.employer_id} onClick={() => void setStatus(b, "approved")} data-admin-reopen>
                              Open again
                            </button>
                          ) : (
                            <button
                              className="ck-btn ck-btn-ghost !min-h-8 !px-3 !text-[13px]"
                              style={{ color: "var(--hf-danger)" }}
                              disabled={busy === b.employer_id}
                              onClick={() => setPausing(b)}
                              data-admin-pause
                            >
                              Pause
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-4 pb-4 text-[13.5px]" style={{ color: "var(--hf-text-soft)" }}>No businesses yet.</p>}
      </div>
    </>
  );
}

function ReportsTab({ query, businesses }: { query: { data?: AdminReport[]; isLoading: boolean; isError: boolean; refetch: () => unknown }; businesses: AdminBusiness[] }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [pausing, setPausing] = useState<AdminReport | null>(null);

  const close = async (r: AdminReport) => {
    setBusy(r.id);
    try {
      await trustApi.adminCloseReport(r.id);
      toast.success("Report closed.");
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    } catch (error) {
      toast.error(trustErrorWords(error, "That didn't go through. Please try again."));
    } finally {
      setBusy(null);
    }
  };
  const pause = async (r: AdminReport, reason?: string) => {
    setBusy(r.id);
    try {
      await trustApi.adminSetStatus(r.employer_id, "suspended", reason);
      toast.success(`${r.company_name || "The business"} is paused. Its jobs are closed.`);
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    } catch (error) {
      toast.error(trustErrorWords(error, "That didn't go through. Please try again."));
    } finally {
      setBusy(null);
      setPausing(null);
    }
  };

  if (query.isError) return <CockpitErrorCard message="We couldn't load the reports just now." onRetry={query.refetch} />;
  if (query.isLoading) return <Loader2 className="mx-auto h-5 w-5 animate-spin" style={{ color: "var(--hf-text-muted)" }} aria-label="Loading" />;
  const rows = query.data ?? [];
  const paused = new Set(businesses.filter((b) => b.status === "suspended").map((b) => b.employer_id));

  return (
    <>
      <ActionDialog
        open={!!pausing}
        title={`Pause ${pausing?.company_name || "this business"}?`}
        description="Its live jobs close and applicants can't apply. It sees why in its bell and can message you in Help."
        confirmLabel="Pause business"
        tone="danger"
        busy={!!busy}
        withReason
        reasonRequired
        reasonLabel="Why (they see this)"
        reasonPlaceholder={pausing ? reasonWords(pausing.reason) : ""}
        onConfirm={(reason) => pausing && void pause(pausing, reason)}
        onClose={() => setPausing(null)}
      />
      <div className="ck-card px-4" data-admin-reports>
        {rows.length === 0 ? (
          <p className="py-4 text-[13.5px]" style={{ color: "var(--hf-text-soft)" }}>No reports. Applicants report a job from its page or their application.</p>
        ) : (
          rows.map((r, i) => (
            <div key={r.id} className="grid gap-3 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)", opacity: r.status === "open" ? 1 : 0.55 }} data-admin-report={r.status}>
              <div className="min-w-0">
                <div className="text-[14px]" style={{ color: "var(--hf-text)" }}>
                  <strong className="font-semibold">{reasonWords(r.reason)}</strong>
                  {` · ${r.company_name || "A business"}${r.job_title ? ` · ${r.job_title}` : ""}`}
                </div>
                {r.details && <div className="mt-0.5 text-[13.5px]" style={{ color: "var(--hf-text-soft)" }}>&ldquo;{r.details}&rdquo;</div>}
                <div className="mt-0.5 text-[12px]" style={{ color: "var(--ink-3)" }}>
                  {r.reporter_name ? `From ${r.reporter_name} · ` : ""}
                  {shortDate(r.created_at)}
                  {r.status !== "open" ? " · closed" : ""}
                </div>
              </div>
              {r.status === "open" && (
                <div className="flex flex-wrap gap-1.5 sm:justify-end">
                  {!paused.has(r.employer_id) && (
                    <button className="ck-btn ck-btn-ghost !min-h-8 !px-3 !text-[13px]" style={{ color: "var(--hf-danger)" }} disabled={busy === r.id} onClick={() => setPausing(r)}>
                      Pause business
                    </button>
                  )}
                  <button className="ck-btn ck-btn-outline !min-h-8 !px-3 !text-[13px]" disabled={busy === r.id} onClick={() => void close(r)} data-admin-close-report>
                    Close
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}

function HelpTab({ query }: { query: { data?: HelpThread[]; isLoading: boolean; isError: boolean; refetch: () => unknown } }) {
  const [open, setOpen] = useState<string | null>(null);
  if (query.isError) return <CockpitErrorCard message="We couldn't load the Help messages just now." onRetry={query.refetch} />;
  if (query.isLoading) return <Loader2 className="mx-auto h-5 w-5 animate-spin" style={{ color: "var(--hf-text-muted)" }} aria-label="Loading" />;
  const rows = query.data ?? [];
  if (rows.length === 0) {
    return <div className="ck-card p-4 text-[13.5px]" style={{ color: "var(--hf-text-soft)" }}>No messages yet. Businesses write to you from Help.</div>;
  }
  const current = rows.find((t) => t.employer_id === open) ?? null;
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] md:items-start" data-admin-help>
      <div className="ck-card overflow-hidden">
        {rows.map((t, i) => (
          <button
            key={t.employer_id}
            onClick={() => setOpen(t.employer_id)}
            className="block w-full px-4 py-3 text-left"
            style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)", background: open === t.employer_id ? "var(--surface-2)" : "transparent" }}
            data-admin-thread={t.employer_id}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[14px] font-medium" style={{ color: "var(--hf-text)" }}>{t.company_name || t.email}</span>
              {t.unread > 0 && <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "var(--hf-gold-soft)", color: "var(--hf-gold)" }}>{t.unread}</span>}
            </div>
            <div className="mt-0.5 truncate text-[12.5px]" style={{ color: "var(--ink-3)" }}>
              {t.last_from_admin ? "You: " : ""}
              {t.last_body}
            </div>
          </button>
        ))}
      </div>
      {current ? <AdminThread thread={current} /> : <div className="ck-card p-4 text-[13.5px]" style={{ color: "var(--hf-text-soft)" }}>Pick a business to read and answer.</div>}
    </div>
  );
}

function AdminThread({ thread }: { thread: HelpThread }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const { data: messages, isLoading } = useQuery({
    queryKey: ["admin", "help-thread", thread.employer_id],
    queryFn: () => trustApi.helpThread(thread.employer_id),
  });
  useEffect(() => {
    if (thread.unread > 0) trustApi.adminMarkHelpRead(thread.employer_id).then(() => queryClient.invalidateQueries({ queryKey: ["admin", "help"] })).catch(() => {});
  }, [thread.employer_id, thread.unread, queryClient]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await trustApi.adminReplyHelp(thread.employer_id, body);
      setDraft("");
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast.success(`Sent to ${thread.company_name || thread.email}.`);
    } catch (error) {
      toast.error(trustErrorWords(error, "Your answer didn't go through. Please try again."));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="ck-card p-4" data-admin-thread-open>
      <h2 className="font-display text-[19px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>{thread.company_name || thread.email}</h2>
      <div className="text-[12px]" style={{ color: "var(--ink-3)" }}>{thread.email}</div>
      {isLoading ? (
        <Loader2 className="mx-auto mt-4 h-5 w-5 animate-spin" style={{ color: "var(--hf-text-muted)" }} aria-label="Loading" />
      ) : (
        <div className="mt-3 flex max-h-[420px] flex-col gap-2.5 overflow-y-auto pr-1">
          {(messages ?? []).map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] rounded-[14px] px-3.5 py-2.5 text-[14px] leading-[1.5] ${m.from_admin ? "self-end" : "self-start"}`}
              style={m.from_admin ? { background: "var(--jade-soft)", color: "var(--hf-text)" } : { background: "var(--surface-2)", color: "var(--hf-text)" }}
            >
              <div className="whitespace-pre-wrap break-words">{m.body}</div>
              <div className="mt-1 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                {m.from_admin ? "You" : thread.company_name || "They"} · {shortDate(m.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        maxLength={4000}
        placeholder="Your answer…"
        aria-label="Your answer"
        className="ck-input mt-4 w-full resize-y px-3 py-2 !text-[16px] leading-[1.45] md:!text-[14px]"
        disabled={sending}
      />
      <div className="mt-3 flex justify-end">
        <button className="ck-btn ck-btn-primary" onClick={() => void send()} disabled={sending || !draft.trim()} data-admin-reply>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send answer
        </button>
      </div>
    </section>
  );
}
