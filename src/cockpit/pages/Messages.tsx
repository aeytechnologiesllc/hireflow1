import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import AvaSeal from "@/components/ava/AvaSeal";
import CkAvatar from "../components/Avatar";
import {
  useCockpitMessages,
  useCockpitAccount,
  useCockpitCandidates,
  useCockpitInterviews,
} from "../hooks/useCockpitData";

/**
 * Messages — every thread with an applicant, in one place.
 *
 * Two panes: the threads on the left, triaged by whether anything is actually
 * waiting on you, and the conversation on the right. No hero graphic; the
 * wax seal only appears where Ava has really done the reading.
 *
 * Ava's drafted-reply block from the mockup is deliberately absent: nothing in
 * the app produces a draft yet, and a fabricated one would be a message put in
 * the owner's mouth. The mockup's subhead ("Ava answers first · you approve
 * anything that matters") and its "Ava handled" filter go with it — both are
 * promises only that block can keep, and claiming them on a page that has no
 * draft in it is proof of work nobody did. All three return together.
 */

/** Real wax never sits square. A stable per-row tilt, so it does not jitter on re-render. */
const TILTS = [-6, 4, -3, 5, -4];

type ThreadItem = ReturnType<typeof useCockpitMessages>["conversations"][number];

function firstName(full: string) {
  return full.trim().split(/\s+/)[0] || full;
}

/** The mapper hands over a long relative stamp ("about 2 hours ago"); a thread
 *  row has 10px of type to say it in, so drop the filler, keep the fact. */
function shortWhen(when: string) {
  if (!when) return "";
  if (when.startsWith("less than a minute")) return "just now";
  return when.replace(/^(about|almost|over)\s+/, "");
}

function FilterPill({
  label,
  count,
  tone,
  pressed,
  onClick,
}: {
  label: string;
  count?: number;
  tone: "neutral" | "amber" | "jade";
  pressed: boolean;
  onClick: () => void;
}) {
  const dot =
    tone === "amber" ? "var(--amber-fg)" : tone === "jade" ? "var(--jade)" : "var(--ink-3)";
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border px-[11px] py-1.5 text-[10px] font-bold uppercase tracking-[0.06em] transition-colors hover:border-[var(--hair)]"
      style={{
        background: pressed ? "var(--surface-2)" : "var(--surface)",
        borderColor: pressed ? "var(--hair)" : "var(--line)",
        color: pressed ? "var(--ink)" : "var(--ink-3)",
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
      {label}
      {count != null ? ` · ${count}` : ""}
    </button>
  );
}

function ThreadRow({
  conv,
  index,
  active,
  sealed,
  onPick,
}: {
  conv: ThreadItem;
  index: number;
  active: boolean;
  sealed: boolean;
  onPick: () => void;
}) {
  const unread = conv.unread ?? 0;
  return (
    <button
      type="button"
      onClick={onPick}
      aria-current={active ? "true" : undefined}
      className="flex w-[220px] shrink-0 items-start gap-[11px] rounded-[10px] border p-3 text-left transition-colors hover:border-[var(--line-soft)] hover:bg-[var(--surface)] min-[1120px]:w-full min-[1120px]:shrink"
      style={{
        background: active ? "var(--surface)" : "transparent",
        borderColor: active ? "var(--hair)" : "transparent",
        boxShadow: active ? "var(--hf-shadow-soft)" : undefined,
      }}
    >
      <span className="relative shrink-0">
        <CkAvatar who={conv.name} size={34} />
        {sealed && (
          <AvaSeal
            size={19}
            tilt={TILTS[index % TILTS.length]}
            style={{ position: "absolute", right: -6, bottom: -6 }}
          />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-[13px] leading-[1.3]"
          style={{ color: unread ? "var(--ink)" : "var(--ink-2)", fontWeight: unread ? 700 : 600 }}
        >
          {conv.name}
        </span>
        <span
          className="mt-0.5 block truncate text-[11px]"
          style={{ color: unread ? "var(--ink-2)" : "var(--ink-3)" }}
        >
          {conv.preview}
        </span>
      </span>
      <span className="flex shrink-0 items-start gap-1.5">
        {conv.time && (
          <span
            className="text-[10px]"
            style={{ color: unread ? "var(--brass)" : "var(--ink-3)", fontWeight: unread ? 600 : 400 }}
          >
            {shortWhen(conv.time)}
          </span>
        )}
        {unread > 0 && (
          <span
            className="mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full"
            style={{ background: "var(--jade)" }}
            aria-label={`${unread} unread`}
          />
        )}
      </span>
    </button>
  );
}

function Bubble({
  who,
  time,
  text,
  mine,
}: {
  who: string;
  time: string;
  text: string;
  mine: boolean;
}) {
  return (
    <div
      className="max-w-[76%] rounded-xl px-[13px] py-2.5 text-[13px] leading-[1.5] sm:max-w-[70%]"
      style={
        mine
          ? {
              alignSelf: "flex-end",
              background: "var(--jade-soft)",
              color: "var(--jade-soft-fg)",
              borderBottomRightRadius: 4,
            }
          : {
              alignSelf: "flex-start",
              background: "var(--surface-2)",
              color: "var(--ink)",
              borderBottomLeftRadius: 4,
            }
      }
    >
      <span className="mb-[3px] block text-[10px] font-bold uppercase leading-[1.2] tracking-[0.06em] opacity-75">
        {who}
        {time ? ` · ${time}` : ""}
      </span>
      {text}
    </div>
  );
}

export default function CockpitMessages() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const candidateParam = searchParams.get("candidate");
  const { account } = useCockpitAccount();
  const { candidates } = useCockpitCandidates();
  const { interviews } = useCockpitInterviews();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "needs" | "quiet">("all");
  const [draft, setDraft] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const bubblesRef = useRef<HTMLDivElement>(null);
  const appliedParam = useRef<string | null>(null);

  const contactId = activeId;
  // `isLoading` is the conversations fetch OR the thread fetch. Coarse, but the
  // page-level skeleton below already absorbs the first, so by the time a thread
  // is on screen it reads as "this conversation is still in flight".
  const { conversations, thread, rawThread, send, markRead, isLoading, isSending } =
    useCockpitMessages(contactId);

  // A deep link may carry the candidate's user id (what messaging addresses) or
  // the application id (what a list row has to hand). Accept either.
  const linkedContactId = useMemo(() => {
    if (!candidateParam) return null;
    const byApplication = candidates.find((c) => c.id === candidateParam);
    return byApplication?.avatar ?? candidateParam;
  }, [candidateParam, candidates]);

  // Honour the deep link once. Re-applying it on every render would pin the
  // page to that person and make every other thread unclickable.
  useEffect(() => {
    if (linkedContactId && appliedParam.current !== linkedContactId) {
      appliedParam.current = linkedContactId;
      setActiveId(linkedContactId);
      return;
    }
    if (!activeId && conversations[0]) setActiveId(conversations[0].id);
  }, [linkedContactId, conversations, activeId]);

  // Only the messages addressed to you can be marked read — marking your own
  // outbound ones would refetch forever, since the update can never take.
  //
  // Asking twice is the other way to loop forever: markRead invalidates the
  // query, the refetch hands back new array identities, the effect runs again,
  // and if the write did not land (offline, a policy refusal) it asks again
  // immediately. Remembering what we have already asked for makes the effect
  // idempotent, so the worst case is one wasted request per message.
  const askedRead = useRef<Set<string>>(new Set());
  useEffect(() => {
    const incoming = new Set(thread.filter((m) => m.from === "them").map((m) => m.id));
    const unread = rawThread
      .filter((m) => !m.is_read && incoming.has(m.id) && !askedRead.current.has(m.id))
      .map((m) => m.id);
    if (!unread.length) return;
    unread.forEach((id) => askedRead.current.add(id));
    void markRead(unread);
  }, [thread, rawThread, markRead]);

  const activeConv = conversations.find((c) => c.id === contactId);
  const activeCandidate = candidates.find((c) => c.avatar === contactId);

  // The person on screen: their thread if one exists, otherwise the applicant
  // the deep link named — so a first message is always possible.
  const partner = useMemo(() => {
    if (activeConv) {
      return {
        id: activeConv.id,
        name: activeConv.name,
        role: activeConv.role,
      };
    }
    if (activeCandidate && contactId) {
      return { id: contactId, name: activeCandidate.name, role: activeCandidate.role };
    }
    return null;
  }, [activeConv, activeCandidate, contactId]);

  const needsYou = conversations.filter((c) => (c.unread ?? 0) > 0).length;
  const quiet = conversations.length - needsYou;

  const rows = useMemo(() => {
    const list =
      filter === "needs"
        ? conversations.filter((c) => (c.unread ?? 0) > 0)
        : filter === "quiet"
          ? conversations.filter((c) => !(c.unread ?? 0))
          : conversations;

    // A deep-linked applicant with no history yet still belongs in the list.
    if (partner && !conversations.some((c) => c.id === partner.id)) {
      const pending: ThreadItem = {
        id: partner.id,
        avatar: partner.id,
        name: partner.name,
        role: partner.role,
        time: "",
        preview: "No messages yet",
        unread: undefined,
      };
      return [pending, ...list];
    }
    return list;
  }, [conversations, filter, partner]);

  const hasInterview = !!contactId && interviews.upcoming.some((i) => i.avatar === contactId);
  // `.analyzed` (not `overall > 0`) — a genuine finished score of 0 must still
  // read as sealed, not fall back to looking unscored.
  const sealedScore = activeCandidate?.analyzed ? activeCandidate.overall : null;

  // Land at the newest message whenever the conversation changes or grows.
  useEffect(() => {
    const el = bubblesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [contactId, thread.length]);

  // A half-written line belongs to the person it was written to — never carry
  // it across when the thread changes.
  useEffect(() => {
    setDraft("");
    if (composerRef.current) composerRef.current.style.height = "auto";
  }, [contactId]);

  // Everywhere else in the cockpit a failed write says so; here the payload is
  // the owner's own words, so it is the one place where a silent failure costs
  // something that cannot be recovered. Empty the box only once the insert has
  // landed — offline, or on a policy refusal, the line stays where they typed it.
  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !contactId) return;
    try {
      await send(text, contactId);
      setDraft("");
      if (composerRef.current) composerRef.current.style.height = "auto";
    } catch {
      toast.error("I couldn't send that — your message is still in the box.");
    }
  };

  if (isLoading && !conversations.length) {
    return (
      <div className="space-y-4">
        <div className="ck-rise h-[42px] w-56 rounded-lg" style={{ background: "var(--surface)", opacity: 0.55 }} />
        <div className="flex flex-col gap-3.5 min-[1120px]:flex-row">
          <div className="ck-card h-[220px] min-[1120px]:h-[440px] min-[1120px]:w-[320px]" style={{ opacity: 0.55 }} />
          <div className="ck-card h-[300px] flex-1 min-[1120px]:h-[440px]" style={{ opacity: 0.55 }} />
        </div>
      </div>
    );
  }

  const header = (
    <header className="ck-rise flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
      <h1
        className="font-display"
        style={{
          fontSize: "clamp(26px, 3.2vw, 30px)",
          lineHeight: 1.15,
          fontWeight: 500,
          color: "var(--hf-text)",
        }}
      >
        Messages
      </h1>
      <span className="text-[13px]" style={{ color: "var(--ink-3)" }}>
        Every message with an applicant, in one place.
      </span>
    </header>
  );

  // Brand-new account: no threads, nobody deep-linked. Say so, and point at the
  // one thing that starts them.
  if (!conversations.length && !partner) {
    return (
      <div className="space-y-5">
        {header}
        <section className="ck-card ck-reveal p-6 md:p-8" style={{ ["--ck-i" as string]: 1 }}>
          <h2 className="font-display text-[20px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
            Nobody has written to you yet.
          </h2>
          <p className="mt-2 max-w-[54ch] text-[14px]" style={{ color: "var(--hf-text-soft)" }}>
            {candidates.length > 0
              ? "Open an applicant and message them — everything you send lands back here."
              : "Post a role and share its link. The first time an applicant writes, the thread opens here."}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {candidates.length > 0 ? (
              <button className="ck-btn ck-btn-primary" onClick={() => navigate("/applicants")}>
                See your applicants
              </button>
            ) : (
              <button className="ck-btn ck-btn-primary" onClick={() => navigate("/jobs")}>
                Post a job
              </button>
            )}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-5">
      {header}

      <div className="flex flex-col gap-3.5 min-[1120px]:h-[calc(100dvh-180px)] min-[1120px]:min-h-[440px] min-[1120px]:flex-row min-[1120px]:items-stretch">
        {/* ── The threads, triaged ──────────────────────────── */}
        <div className="ck-reveal flex min-w-0 flex-col min-[1120px]:w-[320px] min-[1120px]:min-h-0 min-[1120px]:shrink-0" style={{ ["--ck-i" as string]: 0 }}>
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            <FilterPill label="All" tone="neutral" pressed={filter === "all"} onClick={() => setFilter("all")} />
            <FilterPill
              label="Needs you"
              count={needsYou}
              tone="amber"
              pressed={filter === "needs"}
              onClick={() => setFilter("needs")}
            />
            <FilterPill
              label="Caught up"
              count={quiet}
              tone="jade"
              pressed={filter === "quiet"}
              onClick={() => setFilter("quiet")}
            />
          </div>

          {/* Narrow: a horizontal selector strip, so the conversation stays on
              screen. Wide: the full column. Neither scrolls the page sideways. */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 min-[1120px]:min-h-0 min-[1120px]:flex-1 min-[1120px]:flex-col min-[1120px]:overflow-x-hidden min-[1120px]:overflow-y-auto min-[1120px]:pb-0">
            {rows.length === 0 ? (
              <p className="px-1 py-3 text-[12px]" style={{ color: "var(--ink-3)" }}>
                {filter === "needs" ? "Nothing is waiting on you." : "Nothing here."}
              </p>
            ) : (
              rows.map((c, i) => {
                const cand = candidates.find((x) => x.avatar === c.id);
                return (
                  <ThreadRow
                    key={c.id}
                    conv={c}
                    index={i}
                    active={c.id === contactId}
                    sealed={!!cand?.analyzed}
                    onPick={() => setActiveId(c.id)}
                  />
                );
              })
            )}
          </div>

          {quiet > 0 && filter !== "needs" && (
            <div
              className="mt-2 hidden items-center gap-2.5 rounded-[10px] border border-dashed px-3 py-2 text-[11px] min-[1120px]:flex"
              style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}
            >
              <span>
                <b style={{ color: "var(--ink-2)" }}>
                  {quiet} caught up
                </b>{" "}
                · nothing unread waiting in {quiet === 1 ? "it" : "them"}
              </span>
            </div>
          )}
        </div>

        {/* ── The conversation ──────────────────────────────── */}
        <section
          className="ck-card ck-reveal flex min-h-[420px] min-w-0 flex-1 flex-col overflow-hidden min-[1120px]:min-h-0"
          style={{ ["--ck-i" as string]: 1 }}
        >
          {partner ? (
            <>
              <div
                className="flex items-center gap-[11px] px-4 py-3 min-[1120px]:px-[18px]"
                style={{ borderBottom: "1px solid var(--line-soft)" }}
              >
                <span className="relative shrink-0">
                  <CkAvatar who={partner.name} size={34} />
                  {sealedScore != null && (
                    <AvaSeal size={19} tilt={-4} style={{ position: "absolute", right: -6, bottom: -6 }} />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
                    {partner.name}
                  </div>
                  <div className="truncate text-[11px]" style={{ color: "var(--ink-3)" }}>
                    {partner.role}
                    {sealedScore != null ? ` · sealed ${sealedScore}` : ""}
                    {hasInterview ? " · interview scheduled" : ""}
                  </div>
                </div>
                {activeCandidate && (
                  <button
                    className="ck-btn ck-btn-outline ml-auto shrink-0 !px-3 !py-1.5 !text-[12px]"
                    onClick={() => navigate(`/applicants/${activeCandidate.id}`)}
                  >
                    View application
                  </button>
                )}
              </div>

              {/* mt-auto, not justify-end: a short thread still hugs the
                  composer, but a long one scrolls without clipping its top. */}
              <div
                ref={bubblesRef}
                className="ck-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 min-[1120px]:px-[18px]"
              >
                <div className="mt-auto flex flex-col gap-2.5">
                  {thread.length === 0 && isLoading ? (
                    // Switching threads swaps the query key, so `thread` is empty
                    // for the length of the fetch. Saying "no messages yet" there
                    // tells the owner a real person never wrote — about a thread
                    // that may hold twenty. Wait first, and say what we're doing.
                    <div className="flex flex-col items-center gap-2.5 py-4">
                      {/* The line below already says it, so the seal stays decorative. */}
                      <span className="ck-seal-breathe">
                        <AvaSeal size={26} />
                      </span>
                      <p className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                        Pulling up your messages with {firstName(partner.name)}…
                      </p>
                    </div>
                  ) : thread.length === 0 ? (
                    <p className="text-center text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                      No messages with {firstName(partner.name)} yet — write the first one.
                    </p>
                  ) : (
                    thread.map((m) => (
                      <Bubble
                        key={m.id}
                        mine={m.from === "me"}
                        who={m.from === "me" ? account.name : firstName(partner.name)}
                        time={m.time}
                        text={m.text}
                      />
                    ))
                  )}
                </div>
              </div>

              <div
                className="flex items-end gap-2 px-4 py-3 min-[1120px]:px-[18px]"
                style={{ borderTop: "1px solid var(--line-soft)" }}
              >
                <textarea
                  ref={composerRef}
                  rows={1}
                  value={draft}
                  aria-label={`Write to ${firstName(partner.name)}`}
                  placeholder={`Write to ${firstName(partner.name)}…`}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  className="min-h-[38px] max-h-24 flex-1 resize-none rounded-[10px] px-3 py-2.5 text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--jade)]"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    color: "var(--ink)",
                  }}
                />
                <button
                  type="button"
                  className="ck-btn ck-btn-primary shrink-0 !px-4 !py-2.5 !text-[13px]"
                  onClick={() => void handleSend()}
                  disabled={isSending || !draft.trim()}
                  style={isSending || !draft.trim() ? { opacity: 0.55 } : undefined}
                >
                  {isSending ? "Sending…" : "Send"}
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center px-6 text-center">
              <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>
                Pick a thread to read it.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
