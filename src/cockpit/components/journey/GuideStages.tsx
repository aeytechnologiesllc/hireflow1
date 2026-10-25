import { useCallback, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowUpRight, Bell, Check, ChevronRight, Copy } from "lucide-react";
import { toast } from "sonner";
import { clip, avaProse } from "../../lib/avaProse";
import { alertsWords, appliedDetail, appliedHeadline, readyHeadline, type ApplicantCounts, type GuideApplicant } from "../../lib/firstHireStage";
import type { ApplicantListRow } from "../../lib/applicantList";
import type { Candidate } from "../../data";
import CkAvatar from "../Avatar";
import { JourneyDots, LineText } from "../ApplicantRow";
import type { GuideNotifications } from "./types";
import { shareTargets } from "@/lib/shareTargets";

/**
 * What each stage of "Your first hire" says under the steps. Plain words, one
 * thing to do, nothing that is not true yet. The card around it, and the
 * steps, are FirstHireGuide.tsx.
 */

const H2: CSSProperties = { fontSize: "clamp(22px, 2.3vw, 28px)", lineHeight: 1.18, color: "var(--ink)", fontWeight: 500 };
const SOFT: CSSProperties = { color: "var(--ink-2)" };

function Heading({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 max-w-[60ch]">
      <h2 className="font-display" style={H2}>
        {children}
      </h2>
      {sub && (
        <p className="mt-1.5 text-[14.5px] leading-[1.55]" style={SOFT}>
          {sub}
        </p>
      )}
    </div>
  );
}

/* ── Phone alerts ──────────────────────────────────────────────────────── */

/** The slim line under a stage's content: turn alerts on, or the promise that they are. */
export function AlertsRow({ notifications, when }: { notifications: GuideNotifications | undefined; when: "apply" | "finish" }) {
  if (!notifications || notifications.status === "unsupported") return null;
  if (notifications.status === "on") {
    // Only once somebody is applying is there a promise worth making.
    if (when === "apply") return null;
    return (
      <p className="flex items-center gap-2 text-[13px]" style={SOFT}>
        <Bell className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--jade)" }} aria-hidden />
        We&rsquo;ll tell you the moment the first one finishes.
      </p>
    );
  }
  const words = alertsWords(notifications.status, when);
  if (!words) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] px-3.5 py-2.5"
      style={{ background: "var(--jade-soft)", border: "1px solid color-mix(in srgb, var(--jade) 22%, transparent)" }}
      data-guide-alerts={notifications.status}
    >
      <Bell className="h-4 w-4 shrink-0" style={{ color: "var(--jade)" }} aria-hidden />
      <p className="min-w-0 flex-1 basis-[220px] text-[13px] leading-[1.45]" style={{ color: "var(--ink)" }}>
        {words.text}
      </p>
      {words.button && (
        <button type="button" className="ck-btn ck-btn-outline !px-3.5 !py-2 !text-[12.5px]" onClick={notifications.onTurnOn}>
          {words.button}
        </button>
      )}
    </div>
  );
}

/* ── Stage 1: post your first job ──────────────────────────────────────── */

export function PostStage({ draftTitle, onPostJob, wide }: { draftTitle: string | null; onPostJob: () => void; wide: boolean }) {
  const drafting = draftTitle !== null;
  const sub = drafting
    ? `${draftTitle ? `\u201c${draftTitle}\u201d is saved. ` : ""}A few more minutes and people can apply.`
    : "Tell HireFlow about the role. It writes the application questions, the skills check and the chat practice for you. About five minutes.";
  return (
    <div className={wide ? "flex items-center justify-between gap-8" : "flex flex-col gap-4"}>
      {/* On a phone the step above already says "Post your first job". */}
      {wide || drafting ? (
        <Heading sub={sub}>{drafting ? "Finish your draft." : "Post your first job."}</Heading>
      ) : (
        <p className="text-[14.5px] leading-[1.55]" style={SOFT}>
          {sub}
        </p>
      )}
      <button type="button" className={`ck-btn ck-btn-primary !px-5 !py-3 !text-[13.5px] ${wide ? "shrink-0" : "w-full"}`} onClick={onPostJob} data-guide-post>
        {drafting ? "Finish your draft" : "Post a job"}
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ── Stage 2: share it ─────────────────────────────────────────────────── */

function useCopyLink(link: string) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy");
    }
  }, [link]);
  return { copied, copy };
}

export function ShareStage({ link, onCopyPost, wide }: { link: string; onCopyPost: () => void; wide: boolean }) {
  const { copied, copy } = useCopyLink(link);
  return (
    <div className="flex flex-col gap-4">
      <Heading sub="Post it where the people you want to hire are looking. Everyone who applies shows up on this page.">Your job is live. Now share it.</Heading>
      <div className={`flex gap-2.5 ${wide ? "flex-wrap items-center" : "flex-col"}`}>
        <button type="button" className="ck-btn ck-btn-primary !min-h-[42px] !px-4 !text-[13px]" onClick={onCopyPost} data-guide-copy-post>
          Copy full post
        </button>
        {/* Where to post it (src/lib/shareTargets.ts): HireFlow posts to no board itself. */}
        {shareTargets(link).map((t) => (
          <a
            key={t.id}
            className="ck-btn ck-btn-outline !min-h-[42px] !px-4 !text-[13px]"
            href={t.href}
            target="_blank"
            rel="noopener noreferrer"
            title={t.hint}
            data-guide-share={t.id}
          >
            {t.label}
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </a>
        ))}
        <div
          className={`flex min-h-[42px] min-w-0 items-center gap-2 rounded-[10px] py-0.5 pl-3 pr-1 ${wide ? "flex-1 basis-[270px]" : ""}`}
          style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
        >
          <span className="min-w-0 flex-1 truncate text-[12.5px]" style={{ color: "var(--ink)", fontFamily: "ui-monospace, SFMono-Regular, monospace" }} title={link}>
            {link.replace(/^https?:\/\//, "")}
          </span>
          <button type="button" className="ck-btn ck-btn-ghost shrink-0 !px-2.5 !py-2 !text-[12.5px]" onClick={() => void copy()}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── People ────────────────────────────────────────────────────────────── */

const ROW_RULE = "1px solid var(--line-soft)";

/** One person who is still in the tests: name, where they are, the dots. */
function TestingRow({ person, row, candidate, first, wide, onOpen }: { person: GuideApplicant; row: ApplicantListRow | undefined; candidate: Candidate | undefined; first: boolean; wide: boolean; onOpen: () => void }) {
  const dots = row?.dots ?? [];
  const where = row ? <LineText line={row.line} /> : <>{candidate?.appliedAgo ?? "Applied"}</>;
  const who = (
    <span className="min-w-0">
      <span className="block truncate text-[14px] font-semibold leading-[1.3]" style={{ color: "var(--ink)" }}>
        {person.name}
      </span>
      <span className="block truncate text-[12.5px] leading-[1.35]" style={{ color: "var(--ink-3)" }}>
        {where}
      </span>
    </span>
  );
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full text-left transition-opacity hover:opacity-80 ${wide ? "items-center gap-4 py-2.5" : "flex-col items-stretch gap-2 py-2.5"}`}
      style={{ borderTop: first ? "none" : ROW_RULE }}
      data-guide-person={person.id}
    >
      {wide ? (
        <>
          <span className="flex min-w-0 items-center gap-3" style={{ flex: "1 1 0" }}>
            <CkAvatar who={person.name} size={32} />
            {who}
          </span>
          {dots.length > 0 && (
            <span className="min-w-0 max-w-[340px] flex-1 basis-0">
              <JourneyDots dots={dots} size={12} />
            </span>
          )}
          <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--ink-3)" }} aria-hidden />
        </>
      ) : (
        <>
          {who}
          {dots.length > 0 && <JourneyDots dots={dots} size={12} />}
        </>
      )}
    </button>
  );
}

export function ApplyingStage({
  counts,
  people,
  rowsById,
  candidatesById,
  notifications,
  wide,
  onOpenPerson,
  onSeeAll,
  loading,
}: {
  counts: ApplicantCounts;
  people: GuideApplicant[];
  rowsById: ReadonlyMap<string, ApplicantListRow>;
  candidatesById: ReadonlyMap<string, Candidate>;
  notifications: GuideNotifications | undefined;
  wide: boolean;
  onOpenPerson: (id: string) => void;
  onSeeAll: () => void;
  /** The list that has the dots has not come yet: the words are known, the rows are not. */
  loading: boolean;
}) {
  const detail = appliedDetail(counts);
  const alertsHere = !!notifications && notifications.status !== "unsupported" && (wide || notifications.status === "on");
  return (
    <div className="flex flex-col gap-3">
      <Heading sub={detail || undefined}>{appliedHeadline(counts)}</Heading>
      <div data-guide-people>
        {loading
          ? [0, 1].map((i) => <div key={i} className="my-2.5 h-[38px] rounded-[10px]" style={{ background: "var(--surface-2)", opacity: 0.55 }} />)
          : people.map((p, i) => (
              <TestingRow key={p.id} person={p} row={rowsById.get(p.id)} candidate={candidatesById.get(p.id)} first={i === 0} wide={wide} onOpen={() => onOpenPerson(p.id)} />
            ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2" style={{ borderTop: ROW_RULE, paddingTop: 12 }}>
        <div className="min-w-0 flex-1 basis-[260px]">
          {/* A phone's alerts step carries its own button; here, only the promise once they are on. */}
          {alertsHere ? (
            <AlertsRow notifications={notifications} when="finish" />
          ) : (
            <p className="text-[13px]" style={SOFT}>
              The first one to finish shows up right here.
            </p>
          )}
        </div>
        <button type="button" className="text-[13px] font-semibold transition-opacity hover:opacity-75" style={{ color: "var(--brass)" }} onClick={onSeeAll}>
          See everyone who applied →
        </button>
      </div>
    </div>
  );
}

/* ── Stage 4: your best three ──────────────────────────────────────────── */

function oneLineRead(candidate: Candidate | undefined): string {
  if (!candidate) return "";
  const raw = avaProse(candidate.readFull) || candidate.read;
  if (!raw || /^screening in progress/i.test(raw)) return "";
  return clip(raw, 130);
}

function ReadyRow({ person, candidate, role, first, onOpen }: { person: GuideApplicant; candidate: Candidate | undefined; role: string | null; first: boolean; onOpen: () => void }) {
  const read = oneLineRead(candidate);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3.5 py-3 text-left transition-opacity hover:opacity-80"
      style={{ borderTop: first ? "none" : ROW_RULE }}
      data-guide-person={person.id}
    >
      <CkAvatar who={person.name} size={38} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-semibold leading-[1.3]" style={{ color: "var(--ink)" }}>
          {person.name}
          {role && (
            <span className="font-normal" style={{ color: "var(--ink-3)" }}>
              {" · "}
              {role}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[13px] leading-[1.4] max-[640px]:line-clamp-2 min-[641px]:truncate" style={SOFT}>
          {read || "Finished every step."}
        </span>
      </span>
      <span className="w-[52px] shrink-0 text-right">
        <span className="ck-num block text-[30px] font-semibold leading-[0.9]" style={{ color: "var(--jade)" }}>
          {person.score}
        </span>
        <span className="mt-1 block text-[10px] font-bold uppercase leading-none tracking-[0.08em]" style={{ color: "var(--ink-3)" }}>
          Score
        </span>
      </span>
    </button>
  );
}

export function ReadyStage({
  top,
  readyCount,
  candidatesById,
  roleOf,
  wide,
  onOpenPerson,
  onReview,
}: {
  top: GuideApplicant[];
  readyCount: number;
  candidatesById: ReadonlyMap<string, Candidate>;
  /** The role to name beside a person (only when the three span more than one). */
  roleOf: (person: GuideApplicant) => string | null;
  wide: boolean;
  onOpenPerson: (id: string) => void;
  onReview: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Heading sub="All finished. Here is how they scored.">{readyHeadline(readyCount)}</Heading>
      <div className="mt-1" data-guide-people>
        {top.map((p, i) => (
          <ReadyRow key={p.id} person={p} candidate={candidatesById.get(p.id)} role={roleOf(p)} first={i === 0} onOpen={() => onOpenPerson(p.id)} />
        ))}
      </div>
      <div className={`flex gap-3 pt-3 ${wide ? "items-center justify-between" : "flex-col"}`} style={{ borderTop: ROW_RULE }}>
        <p className="text-[13px] max-[640px]:hidden" style={SOFT}>
          Open anyone to read their answers, then pass or move them on.
        </p>
        <button type="button" className="ck-btn ck-btn-primary !px-5 !py-2.5 !text-[13.5px] shrink-0" onClick={onReview} data-guide-review>
          Review them
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
