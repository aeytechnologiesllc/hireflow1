import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "../components/PageHeader";
import { CockpitErrorCard } from "../components/ErrorCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { trustApi, trustErrorWords, type HelpMessage } from "@/lib/trustApi";
import { ReportBusinessNote } from "@/components/trust/ReportBusinessNote";

/**
 * Help (the 2026-10-11 mock-ups, #6): a business writes to HireFlow and
 * reads the answers here (they also land in its bell). Three quick answers
 * for what new businesses ask first. The thread is the business's own
 * (help_messages: the business and the platform admin read it; writes go
 * through send_help_message). The "account paused" alert links here.
 *
 * An applicant has a thread of their own here too ("Contact us" in their
 * account menu, at /contact: /help is staff-only on the staff host) (2026-10-25,
 * 20261025200000_help_for_applicants.sql): the Privacy Policy sends them
 * here to ask the company for a copy of their information, a correction or
 * a deletion. The hiring business never sees it. It also offers "Report a
 * business you were in touch with" (report_choices()): the Privacy Policy and
 * the Terms send someone whose job is gone here to report its business (the
 * twentieth Phase 5 review, finding 3).
 */

const APPLICANT_QUICK_ANSWERS: ReadonlyArray<{ q: string; a: string }> = [
  { q: "How do I get a copy of my information?", a: "Ask here. We answer here, usually within a day." },
  { q: "How do I delete my account?", a: "Settings, then Delete Account. Your applications and files go with it." },
  { q: "Something about a job looks wrong?", a: "Report the job from its page, or tell us here." },
];

const QUICK_ANSWERS: ReadonlyArray<{ q: string; a: string }> = [
  { q: "How do I share my job?", a: "Jobs, then Share. Copy the full post and paste it anywhere." },
  { q: "Why is my account paused?", a: "When three people you have been in touch with report your business, it pauses by itself and its jobs close until we look. Message us here." },
  { q: "How do I stop taking applications?", a: "Jobs, then the job, then Close. You can open it again any time." },
];

function when(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? `Today, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Whose thread this is: the business's (the owner's own, or the team's), or an applicant's own. */
function useHelpBusiness(): string | null {
  const { user, role, isTeamMember } = useAuth();
  const { data } = useQuery({
    queryKey: ["help-business", user?.id, role, isTeamMember],
    enabled: !!user,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      if (role === "employer" && !isTeamMember) return user!.id;
      if (role === "candidate") return user!.id;
      const { data: row } = await supabase.from("team_members").select("employer_id").eq("user_id", user!.id).eq("status", "active").limit(1).maybeSingle();
      return (row?.employer_id as string | undefined) ?? null;
    },
  });
  return data ?? null;
}

export default function CockpitHelp() {
  const business = useHelpBusiness();
  const { role } = useAuth();
  const applicant = role === "candidate";
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const { data: thread, isLoading, isError, refetch } = useQuery({
    queryKey: ["help-thread", business],
    enabled: !!business,
    refetchInterval: 30_000,
    queryFn: () => trustApi.helpThread(business!),
  });

  const unreadAnswers = (thread ?? []).some((m) => m.from_admin && !m.read_at);
  useEffect(() => {
    if (!unreadAnswers) return;
    trustApi.markHelpRead().catch(() => {});
  }, [unreadAnswers]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [thread?.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await trustApi.sendHelp(body);
      setDraft("");
      await queryClient.invalidateQueries({ queryKey: ["help-thread", business] });
      toast.success("Sent. We usually reply within a day.");
    } catch (error) {
      toast.error(trustErrorWords(error, "Your message didn't go through. Please try again."));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5" data-help-page>
      <PageHeader
        title={applicant ? "Contact us" : "Help"}
        subtitle={applicant ? "Write to the people who run HireFlow. The hiring team of a job you applied to does not see this, unless the job is one of ours." : "Write to HireFlow. We usually reply within a day."}
      />
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,320px)] md:items-start">
        <section className="ck-card p-4 md:p-5" aria-labelledby="help-thread-title">
          <h2 id="help-thread-title" className="font-display text-[20px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
            Message HireFlow
          </h2>
          {isError ? (
            <div className="mt-3">
              <CockpitErrorCard message="We couldn't load your messages just now." onRetry={refetch} />
            </div>
          ) : isLoading && business ? (
            <div className="mt-4 flex justify-center" aria-busy="true">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--hf-text-muted)" }} aria-label="Loading messages" />
            </div>
          ) : (thread ?? []).length === 0 ? (
            <p className="mt-2 text-[13.5px]" style={{ color: "var(--hf-text-soft)" }}>
              {applicant
                ? "Ask about your information: a copy of it, a correction, or deleting it. Your messages and our answers stay here."
                : "Ask anything about hiring on HireFlow. Your messages and our answers stay here."}
            </p>
          ) : (
            <div className="mt-3 flex max-h-[420px] flex-col gap-2.5 overflow-y-auto pr-1" data-help-thread>
              {(thread ?? []).map((m: HelpMessage) => (
                <div
                  key={m.id}
                  className={`max-w-[85%] rounded-[14px] px-3.5 py-2.5 text-[14px] leading-[1.5] ${m.from_admin ? "self-start" : "self-end"}`}
                  style={
                    m.from_admin
                      ? { background: "var(--surface-2)", color: "var(--hf-text)" }
                      : { background: "var(--action-soft)", color: "var(--hf-text)", border: "1px solid color-mix(in srgb, var(--action) 25%, transparent)" }
                  }
                  data-help-message={m.from_admin ? "hireflow" : "business"}
                >
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  <div className="mt-1 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                    {m.from_admin ? `HireFlow · ${when(m.created_at)}` : when(m.created_at)}
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}
          <label htmlFor="help-draft" className="mt-4 block text-[13px] font-medium" style={{ color: "var(--hf-text)" }}>
            Your message
          </label>
          <textarea
            id="help-draft"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
            }}
            rows={3}
            maxLength={4000}
            placeholder="Write to us…"
            className="ck-input mt-1.5 w-full resize-y px-3 py-2 !text-[16px] leading-[1.45] md:!text-[14px]"
            disabled={!business || sending}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
              {business ? "We usually reply within a day." : "Only a hiring team can write to HireFlow here."}
            </span>
            <button className="ck-btn ck-btn-primary" onClick={() => void send()} disabled={!business || sending || !draft.trim()} data-help-send>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </button>
          </div>
        </section>
        <aside className="flex flex-col gap-2.5" aria-label="Quick answers">
          {(applicant ? APPLICANT_QUICK_ANSWERS : QUICK_ANSWERS).map((item) => (
            <div key={item.q} className="ck-card px-4 py-3">
              <div className="text-[14px] font-medium" style={{ color: "var(--hf-text)" }}>{item.q}</div>
              <div className="mt-0.5 text-[12.5px] leading-[1.5]" style={{ color: "var(--hf-text-muted)" }}>{item.a}</div>
            </div>
          ))}
          {applicant && <ReportBusinessNote place="anywhere" />}
        </aside>
      </div>
    </div>
  );
}
