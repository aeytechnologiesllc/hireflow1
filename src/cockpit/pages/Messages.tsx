import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Paperclip, Trash2 } from "lucide-react";
import AvaSeal from "@/components/ava/AvaSeal";
import { useAuth } from "@/hooks/useAuth";
import { useMessageableEmployers, type MessageableEmployer } from "@/hooks/useMessages";
import { resolveCandidateMediaUrls } from "@/utils/candidateMediaUrl";
import { ActionDialog } from "../components/ActionDialog";
import { StatusChip } from "../components/ApplicantRow";
import CkAvatar from "../components/Avatar";
import type { Conversation } from "../data";
import { CockpitErrorCard } from "../components/ErrorCard";
import {
  useCockpitMessages,
  useCockpitAccount,
  useCockpitCandidates,
  useCockpitInterviews,
} from "../hooks/useCockpitData";
import { isRecordNotDeployed } from "../hooks/useAssessmentSessions";
import { useChatMarks } from "../hooks/useChatMarks";
import { quickRepliesFor } from "../lib/quickReplies";
import { tidyMessage } from "../lib/tidyMessage";
import {
  MOVED_BACK_WORDS,
  archivedWords,
  chatMarkFailureWords,
  chatStatusChip,
  chatsFor,
  deleteChatWords,
  emptyListWords,
  isArchivedChat,
  nextChatAfter,
  splitChats,
  type ChatFilter,
  type ChatMark,
} from "../lib/chatMarks";

/**
 * Messages — every thread with the person on the other side, in one place.
 *
 * Shared by both roles. An employer reads it as "every applicant who wrote";
 * a candidate reads it as "every hiring team I can talk to" — including the
 * ones who have not written yet, because a candidate has no applicant record
 * to start a thread from the way an employer does.
 *
 * Two panes: the threads on the left, triaged by whether anything is actually
 * waiting on you, and the conversation on the right. No hero graphic; the
 * wax seal only appears where Ava has really done the reading.
 *
 * The hiring team's side also says where each applicant stands (the same
 * chip as the applicants list), and can archive a chat or delete it from
 * their own side (lib/chatMarks.ts, docs/MESSAGES.md). An applicant's side
 * has none of the three.
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

/** One chat in the list (the live shape; the showcase's rows fit it too). */
type ThreadItem = Conversation;

/** An applicant has no marks of their own here: nothing is archived for them. */
const NO_MARKS: ReadonlyMap<string, ChatMark> = new Map();

interface Attachment {
  url: string;
  name: string;
  type: string;
}

function firstName(full: string) {
  return full.trim().split(/\s+/)[0] || full;
}

/** A candidate knows the hiring team by the company; fall back to whoever posted. */
function employerName(e: MessageableEmployer) {
  return e.employer_profile?.company_name || e.employer_profile?.full_name || "Hiring team";
}

function isImageFile(file: Attachment) {
  return file.type.startsWith("image/") || /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(file.name);
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
  chip,
  onPick,
}: {
  conv: ThreadItem;
  index: number;
  active: boolean;
  sealed: boolean;
  /** Where the applicant stands, once decided (the hiring team's side only). */
  chip: ReturnType<typeof chatStatusChip>;
  onPick: () => void;
}) {
  const unread = conv.unread ?? 0;
  return (
    <button
      type="button"
      onClick={onPick}
      aria-current={active ? "true" : undefined}
      data-thread-row={conv.id}
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
      <span className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="flex items-start gap-1.5">
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
        {chip && (
          <span data-thread-status>
            <StatusChip chip={chip} />
          </span>
        )}
      </span>
    </button>
  );
}

/** The message box: one line tall when empty, and never taller than this (or about half the window, whichever is less). */
const COMPOSER_MIN_PX = 26;
const COMPOSER_MAX_PX = 460;
const COMPOSER_SHARE = 0.46;
const COMPOSER_SHARE_PHONE = 0.3;
/** How long after a send the page keeps following the end of the chat (the
    sent line arrives a moment after the request finishes). */
const SENT_FOLLOW_MS = 4000;
/** How long after a chat is drawn its end is followed while the page settles
    (the real font arriving, a picture loading). */
const SETTLE_MS = 2500;

/** What scrolls the page a box sits in: the staff shell's <main>, whatever
 *  ancestor scrolls in another shell, or null when the window does. */
function pageScroller(el: HTMLElement): HTMLElement | null {
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    const { overflowY } = window.getComputedStyle(n);
    if ((overflowY === "auto" || overflowY === "scroll") && n.scrollHeight > n.clientHeight + 1) return n;
  }
  return null;
}

function Bubble({
  who,
  time,
  text,
  mine,
  file,
}: {
  who: string;
  time: string;
  text: string;
  mine: boolean;
  file?: Attachment;
}) {
  // A message that carried a file was stored with "Sent a file: <name>" as its
  // text so a client with no file rendering had something to print. Once the
  // file itself is on screen that line is just the filename twice.
  const showText = !!text && !(file && /^Sent a file:/i.test(text));
  return (
    <div
      className="max-w-[86%] rounded-[18px] px-4 py-3 text-[14.5px] leading-[1.55] sm:max-w-[72%]"
      data-message-bubble={mine ? "mine" : "theirs"}
      style={
        mine
          ? {
              alignSelf: "flex-end",
              background: "var(--jade-soft)",
              color: "var(--jade-soft-fg)",
              borderBottomRightRadius: 6,
            }
          : {
              alignSelf: "flex-start",
              background: "var(--surface-2)",
              color: "var(--ink)",
              borderBottomLeftRadius: 6,
            }
      }
    >
      <span className="mb-1 block text-[10.5px] font-bold uppercase leading-[1.2] tracking-[0.06em] opacity-75">
        {who}
        {time ? ` · ${time}` : ""}
      </span>
      {file &&
        (isImageFile(file) ? (
          <a
            href={file.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${file.name}`}
            className={`block overflow-hidden rounded-lg ${showText ? "mb-1.5" : ""}`}
          >
            <img src={file.url} alt={file.name} loading="lazy" className="block max-h-[240px] w-auto max-w-full" />
          </a>
        ) : (
          <a
            href={file.url}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex max-w-full items-center gap-1.5 underline underline-offset-2 ${showText ? "mb-1" : ""}`}
          >
            <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{file.name}</span>
          </a>
        ))}
      {showText && <span className="block whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{text}</span>}
    </div>
  );
}

export default function CockpitMessages() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  // An employer arrives with ?candidate=, a candidate with ?employer=. Either
  // names the person on the other end, so both are read the same way.
  const linkParam = searchParams.get("candidate") ?? searchParams.get("employer");
  const { role } = useAuth();
  const isCandidate = role === "candidate";
  const { account } = useCockpitAccount();
  const { candidates, isLoading: candidatesLoading } = useCockpitCandidates();
  const { interviews } = useCockpitInterviews();
  // Who a candidate may write to: the hiring team behind every application.
  // Employer-side callers never run this — it can only come back empty for them.
  const { data: employers = [], isLoading: employersLoading } = useMessageableEmployers({
    enabled: isCandidate,
  });

  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ChatFilter>("all");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const bubblesRef = useRef<HTMLDivElement>(null);
  /** When the last message was sent from this screen (see SENT_FOLLOW_MS). */
  const sentAt = useRef(0);

  const contactId = activeId;
  // `isLoading` is the conversations fetch OR the thread fetch. Coarse, but the
  // page-level skeleton below already absorbs the first, so by the time a thread
  // is on screen it reads as "this conversation is still in flight".
  const { conversations, thread, rawThread, send, markRead, isLoading, isError, refetch, isSending } =
    useCockpitMessages(contactId);

  // Archived, and deleted from this side: the hiring team's own marks.
  const { byContact: teamMarks, everDeleted, deployed: marksDeployed, ready: marksReady, setChat, busy: markBusy } = useChatMarks({
    enabled: !isCandidate,
  });
  const marks = isCandidate ? NO_MARKS : teamMarks;
  const split = useMemo(() => splitChats<ThreadItem>(conversations, marks), [conversations, marks]);
  const chatCount = split.inbox.length + split.archived.length;

  // A deep link may carry the other person's user id (what messaging addresses)
  // or an application id (what a list row has to hand). Accept either — but not
  // before the lookup that tells them apart has loaded, or an application id
  // would briefly be addressed as if it were a person.
  const lookupPending = isCandidate ? employersLoading : candidatesLoading;
  const linkedContactId = useMemo(() => {
    if (!linkParam || lookupPending) return null;
    if (isCandidate) {
      const byApplication = employers.find((e) => e.application_id === linkParam);
      return byApplication?.employer_id ?? linkParam;
    }
    const byApplication = candidates.find((c) => c.id === linkParam);
    return byApplication?.avatar ?? linkParam;
  }, [linkParam, lookupPending, isCandidate, employers, candidates]);

  // Honour the deep link once per navigation. Re-applying it on every render
  // would pin the page to that person and make every other thread unclickable;
  // applying it only once per person meant a second "Message" click on the same
  // applicant, after reading someone else, landed on the wrong thread. The
  // navigation key changes on every click that brings you here, so each one
  // is honoured exactly once. Without a link, open the newest thread.
  const appliedLink = useRef<string | null>(null);
  useEffect(() => {
    if (linkParam) {
      if (!linkedContactId) return;
      const key = `${location.key}:${linkedContactId}`;
      if (appliedLink.current !== key) {
        appliedLink.current = key;
        setActiveId(linkedContactId);
      }
      return;
    }
    // Never an archived chat: that one was put away on purpose.
    if (!activeId && split.inbox[0]) setActiveId(split.inbox[0].id);
  }, [linkParam, linkedContactId, location.key, split.inbox, activeId]);

  // A chat opened from somewhere else ("Message" on an applicant's page) may
  // be an archived one: show the list it is in. Once per chat opened, so the
  // filter pills still work while it stays open.
  const openChat = split.archived.find((c) => c.id === activeId) ?? split.inbox.find((c) => c.id === activeId);
  const openChatArchived = !!openChat && split.archived.includes(openChat);
  const listShownFor = useRef<string | null>(null);
  useEffect(() => {
    if (!activeId || !marksReady || !openChat || listShownFor.current === activeId) return;
    listShownFor.current = activeId;
    if (openChatArchived) setFilter("archived");
  }, [activeId, marksReady, openChat, openChatArchived]);

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

  // The mapper keeps a message down to its text; the attachment, when there is
  // one, is still on the raw row. Look it up by id so a file renders as a file
  // instead of as the "Sent a file: x" placeholder it was stored with.
  const filesById = useMemo(() => {
    const map = new Map<string, Attachment>();
    for (const m of rawThread) {
      if (m.file_url) {
        map.set(m.id, { url: m.file_url, name: m.file_name ?? "Attachment", type: m.file_type ?? "" });
      }
    }
    return map;
  }, [rawThread]);

  // `message-attachments` is a private bucket now — `file.url` above is a bare
  // storage path (or, for a message sent before that change, a full public URL
  // that no longer serves anything), not something a browser can load directly.
  // Resolve every attachment in the thread to a short-lived signed URL before
  // rendering; a message with no file, or a signing failure, is left out and
  // falls back to the stored value in `filesById`.
  const [signedFileUrls, setSignedFileUrls] = useState<Map<string, string>>(new Map());
  // `filesById` is a fresh Map on every render (it's rebuilt from `rawThread`,
  // itself a new array identity on every query refetch even when the rows
  // haven't changed) — keying the effect on the Map itself re-signs every
  // attachment, and re-requests every open thread's URLs, each time anything
  // else on the page re-renders. Key on the actual (id, path) pairs instead:
  // a plain string that only changes when a file is added, removed, or its
  // stored path changes, so the effect only re-runs when there is new signing
  // to do.
  const fileKey = useMemo(
    () => Array.from(filesById.entries()).map(([id, f]) => `${id}:${f.url}`).join("|"),
    [filesById]
  );
  useEffect(() => {
    let cancelled = false;
    const entries = Array.from(filesById.entries());
    if (entries.length === 0) {
      setSignedFileUrls(new Map());
      return;
    }
    void (async () => {
      const resolved = await resolveCandidateMediaUrls(
        "message-attachments",
        entries.map(([, f]) => f.url)
      );
      if (cancelled) return;
      const next = new Map<string, string>();
      entries.forEach(([id], i) => {
        if (resolved[i]) next.set(id, resolved[i]!);
      });
      setSignedFileUrls(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileKey]);

  const resolvedFilesById = useMemo(() => {
    const map = new Map<string, Attachment>();
    filesById.forEach((f, id) => {
      const signed = signedFileUrls.get(id);
      map.set(id, signed ? { ...f, url: signed } : f);
    });
    return map;
  }, [filesById, signedFileUrls]);

  const activeConv: ThreadItem | undefined = conversations.find((c) => c.id === contactId);
  const activeCandidate = candidates.find((c) => c.avatar === contactId);
  const activeEmployer = isCandidate ? employers.find((e) => e.employer_id === contactId) : undefined;
  const employersById = useMemo(
    () => new Map(employers.map((e) => [e.employer_id, e])),
    [employers],
  );

  // The person on screen: their thread if one exists, otherwise whoever the
  // deep link or the opener list named — so a first message is always possible.
  // A candidate's thread partner is a company, not the account that posted, so
  // the hiring-team lookup overrides the bare profile the conversation carries.
  const partner = useMemo(() => {
    if (activeConv) {
      const team = isCandidate ? employersById.get(activeConv.id) : undefined;
      return {
        id: activeConv.id,
        name: team ? employerName(team) : activeConv.name,
        role: team ? team.job_title : activeConv.role,
      };
    }
    if (activeCandidate && contactId) {
      return { id: contactId, name: activeCandidate.name, role: activeCandidate.role };
    }
    if (activeEmployer && contactId) {
      return { id: contactId, name: employerName(activeEmployer), role: activeEmployer.job_title };
    }
    return null;
  }, [activeConv, activeCandidate, activeEmployer, contactId, isCandidate, employersById]);

  // A company name is not a first name: a candidate writes to "Ridgeline
  // Coffee", not to "Ridgeline".
  const partnerShort = partner ? (isCandidate ? partner.name : firstName(partner.name)) : "";

  // Team-member RLS on messages is keyed on application_id — a row without one
  // is invisible to them, including their own. Send every message with the
  // application it belongs to when we know it.
  const activeApplicationId = activeCandidate?.id ?? activeEmployer?.application_id;

  // The inbox's own counts: an archived chat is in neither.
  const needsYou = split.inbox.filter((c) => (c.unread ?? 0) > 0).length;
  const quiet = split.inbox.length - needsYou;
  const archivedCount = split.archived.length;

  const rows = useMemo<ThreadItem[]>(() => {
    const list = chatsFor(filter, split);

    // A candidate's list also holds the hiring teams they have not written to
    // yet — with no applicant record to start from, this is their only door.
    // Named by company, since that is how a candidate knows them.
    const known = new Set(conversations.map((c) => c.id));
    const openers: ThreadItem[] =
      isCandidate && filter === "all"
        ? employers
            .filter((e) => !known.has(e.employer_id))
            .map((e) => ({
              id: e.employer_id,
              avatar: e.employer_id,
              name: employerName(e),
              role: e.job_title,
              time: "",
              preview: `${e.job_title} · no messages yet`,
              unread: undefined,
            }))
        : [];
    const named = isCandidate
      ? list.map((c) => {
          const team = employersById.get(c.id);
          return team ? { ...c, name: employerName(team), role: team.job_title } : c;
        })
      : list;
    const all = [...named, ...openers];

    // A deep-linked applicant with no history yet still belongs in the list.
    // Only when there is no chat with them at all: one that is merely under
    // another filter (archived, or caught up) is not "no messages yet".
    if (partner && filter !== "archived" && !all.some((c) => c.id === partner.id) && !conversations.some((c) => c.id === partner.id)) {
      const pending: ThreadItem = {
        id: partner.id,
        avatar: partner.id,
        name: partner.name,
        role: partner.role,
        time: "",
        preview: "No messages yet",
        unread: undefined,
      };
      return [pending, ...all];
    }
    return all;
  }, [conversations, split, filter, partner, isCandidate, employers, employersById]);

  // Where the applicant on screen stands, once decided. From their chat when
  // there is one, else from their record (a first message to someone declined).
  const partnerChip = isCandidate
    ? null
    : chatStatusChip(
        activeConv?.status ??
          (activeCandidate?.stage === "Rejected" ? "rejected" : activeCandidate?.stage === "Hired" ? "hired" : null),
      );

  // Ready-made replies for the hiring team, chosen by where this applicant
  // stands (lib/quickReplies.ts). Written by hand, not by AI: a tap puts one
  // in the box, to be read and changed before it is sent.
  const quickReplies = useMemo(
    () =>
      isCandidate || !partner
        ? []
        : quickRepliesFor({
            status: activeConv?.status,
            stage: activeCandidate?.stage,
            stillTesting: activeCandidate?.stillTesting,
            name: partner.name,
            jobTitle: partner.role,
          }),
    [isCandidate, partner, activeConv?.status, activeCandidate?.stage, activeCandidate?.stillTesting],
  );
  const fillReply = (text: string) => {
    setDraft(text);
    // After the box has grown to fit it: the cursor at the end, ready to edit.
    window.requestAnimationFrame(() => {
      const box = composerRef.current;
      if (!box) return;
      box.focus();
      box.setSelectionRange(text.length, text.length);
      // On a phone the page scrolls and the box has just grown by several
      // lines: keep Send above the tab bar.
      const el = bubblesRef.current;
      if (el && el.scrollHeight <= el.clientHeight + 1) {
        const page = pageScroller(el);
        if (page) page.scrollTo({ top: page.scrollHeight });
        else window.scrollTo({ top: document.documentElement.scrollHeight });
      }
    });
  };

  // Archive and delete are offered on a real chat, to the hiring team, once
  // the database has them.
  const canMark = !isCandidate && marksDeployed && !!activeConv && !!contactId;

  // The open chat leaves the list being looked at: open the one beside it.
  const handleArchive = async (archive: boolean) => {
    if (!contactId || markBusy) return;
    const id = contactId;
    const leaves = archive ? filter !== "archived" : filter === "archived";
    const beside = nextChatAfter(rows, id);
    try {
      await setChat(id, archive ? "archive" : "unarchive");
      if (leaves) setActiveId(beside);
      if (!archive) {
        toast.success(MOVED_BACK_WORDS);
        return;
      }
      const words = archivedWords(partnerShort);
      toast.success(words.title, {
        description: words.body,
        action: {
          label: "Undo",
          onClick: () => {
            void setChat(id, "unarchive")
              .then(() => setActiveId(id))
              .catch(() => toast.error(chatMarkFailureWords(null, false)));
          },
        },
      });
    } catch (error) {
      console.error("[set_chat_state]", error);
      toast.error(chatMarkFailureWords(error as { code?: string }, isRecordNotDeployed(error as { code?: string })));
    }
  };

  const deleteWords = deleteChatWords(partnerShort);
  const handleDelete = async () => {
    if (!contactId || markBusy) return;
    const id = contactId;
    const beside = nextChatAfter(rows, id);
    try {
      await setChat(id, "delete");
      setConfirmDelete(false);
      setActiveId(beside);
      toast.success(deleteWords.done);
    } catch (error) {
      console.error("[set_chat_state]", error);
      toast.error(chatMarkFailureWords(error as { code?: string }, isRecordNotDeployed(error as { code?: string })));
    }
  };

  const hasInterview = !!contactId && interviews.upcoming.some((i) => i.avatar === contactId);
  // `.analyzed` (not `overall > 0`) — a genuine finished score of 0 must still
  // read as sealed, not fall back to looking unscored.
  const sealedScore = activeCandidate?.analyzed ? activeCandidate.overall : null;

  // Land at the newest message whenever the conversation changes or grows.
  useEffect(() => {
    const el = bubblesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    // On a phone the card is as tall as the conversation and the PAGE scrolls,
    // so the line above moves nothing there: the message just sent pushes the
    // reply box down under the tab bar. After a send, keep the end in view.
    if (el.scrollHeight <= el.clientHeight + 1 && Date.now() - sentAt.current < SENT_FOLLOW_MS) {
      const page = pageScroller(el);
      if (page) page.scrollTo({ top: page.scrollHeight });
      else window.scrollTo({ top: document.documentElement.scrollHeight });
    }
    // The chat can get taller a moment after it is drawn: the first paint is
    // in the stand-in font and the lines wrap again when the real one arrives,
    // and a picture has no height until it loads. The scroll above was aimed
    // at the old end, so the newest message sat cut off under the reply box.
    // For a short while, follow the end, unless the reader has taken hold.
    const inner = el.firstElementChild;
    if (!inner || typeof ResizeObserver === "undefined") return;
    const until = Date.now() + SETTLE_MS;
    let held = false;
    const hold = () => { held = true; };
    const watch = new ResizeObserver(() => {
      if (!held && Date.now() < until) el.scrollTop = el.scrollHeight;
    });
    watch.observe(inner);
    el.addEventListener("wheel", hold, { passive: true });
    el.addEventListener("touchstart", hold, { passive: true });
    el.addEventListener("keydown", hold);
    return () => {
      watch.disconnect();
      el.removeEventListener("wheel", hold);
      el.removeEventListener("touchstart", hold);
      el.removeEventListener("keydown", hold);
    };
  }, [contactId, thread.length]);

  // A half-written line belongs to the person it was written to — never carry
  // it across when the thread changes.
  useEffect(() => {
    setDraft("");
    setConfirmDelete(false);
  }, [contactId]);

  // The box is as tall as what is in it, up to about half the window, then
  // it scrolls. It used to stop at four lines: the owner pasted a
  // twelve-line reply and could see three of them (2026-10-08: "wherever my
  // message is being displayed looks kind of small ... make it more modern").
  // Measured after every change to the words, however they got there
  // (typing, a paste, a send, another thread).
  useLayoutEffect(() => {
    const box = composerRef.current;
    if (!box) return;
    box.style.height = "auto";
    // A phone gets less of its screen: Send has to stay above the tab bar and the keyboard.
    const share = window.innerWidth < 768 ? COMPOSER_SHARE_PHONE : COMPOSER_SHARE;
    const most = Math.max(COMPOSER_MIN_PX, Math.min(Math.round(window.innerHeight * share), COMPOSER_MAX_PX));
    box.style.height = `${Math.max(COMPOSER_MIN_PX, Math.min(box.scrollHeight, most))}px`;
    box.style.overflowY = box.scrollHeight > most ? "auto" : "hidden";
    // `partnerShort`: the box only exists once there is someone to write to.
  }, [draft, contactId, partnerShort]);

  // Everywhere else in the cockpit a failed write says so; here the payload is
  // the owner's own words, so it is the one place where a silent failure costs
  // something that cannot be recovered. Empty the box only once the insert has
  // landed — offline, or on a policy refusal, the line stays where they typed it.
  const handleSend = async () => {
    // The hiring team's message is tidied as it goes (lib/tidyMessage.ts):
    // capitals, the applicant's name, spacing, a closing full stop. Never a
    // different word. An applicant's own message is sent exactly as written.
    const text = isCandidate ? draft.trim() : tidyMessage(draft, { recipientName: partner?.name });
    if (!text || !contactId) return;
    try {
      sentAt.current = Date.now();
      await send(text, contactId, activeApplicationId);
      setDraft("");
    } catch {
      toast.error("I couldn't send that — your message is still in the box.");
    }
  };

  // Hold the skeleton while a deep link is still being resolved, and while a
  // candidate's list of hiring teams is on its way: the empty state below
  // would otherwise flash "nobody to write to" at someone who has applied.
  const settling =
    (!!linkParam && lookupPending) || (isCandidate && employersLoading && !conversations.length);
  if ((isLoading && !conversations.length) || settling) {
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
        {isCandidate
          ? "Every message with a hiring team, in one place."
          : "Every message with an applicant, in one place."}
      </span>
    </header>
  );

  // A failed load must never read as "nobody has written yet" — that is a
  // claim about the inbox, not the network.
  if (isError && !conversations.length && !partner) {
    return (
      <div className="space-y-5">
        {header}
        <CockpitErrorCard message="We couldn't load your messages just now." onRetry={refetch} />
      </div>
    );
  }

  // No threads, nobody deep-linked. Say so, and point at the one thing that
  // starts them — which differs by who is looking.
  if (!chatCount && !partner) {
    if (isCandidate) {
      return (
        <div className="space-y-5">
          {header}
          <section className="ck-card ck-reveal p-6 md:p-8" style={{ ["--ck-i" as string]: 1 }}>
            <h2 className="font-display text-[20px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
              Nobody has written yet.
            </h2>
            {employers.length > 0 ? (
              <>
                <p className="mt-2 max-w-[54ch] text-[14px]" style={{ color: "var(--hf-text-soft)" }}>
                  You can message the hiring team for any role you've applied to:
                </p>
                <div className="mt-5 flex max-w-[520px] flex-col gap-2">
                  {employers.map((e) => {
                    const name = employerName(e);
                    return (
                      <button
                        key={e.employer_id}
                        type="button"
                        onClick={() => setActiveId(e.employer_id)}
                        className="flex items-center gap-3 rounded-[10px] border p-3 text-left transition-colors hover:border-[var(--hair)] hover:bg-[var(--surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--jade)]"
                        style={{ borderColor: "var(--line)" }}
                      >
                        <CkAvatar who={name} size={34} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
                            {name}
                          </span>
                          <span className="block truncate text-[11px]" style={{ color: "var(--ink-3)" }}>
                            {e.job_title}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--jade)" }}>
                          Write
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <p className="mt-2 max-w-[54ch] text-[14px]" style={{ color: "var(--hf-text-soft)" }}>
                  Once you've applied to a role, its hiring team shows up here and you can write to them
                  any time.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button className="ck-btn ck-btn-primary" onClick={() => navigate("/applications")}>
                    See your applications
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      );
    }

    return (
      <div className="space-y-5">
        {header}
        <section className="ck-card ck-reveal p-6 md:p-8" style={{ ["--ck-i" as string]: 1 }}>
          <h2 className="font-display text-[20px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
            {everDeleted ? "No chats in your Messages." : "Nobody has written to you yet."}
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
            {!isCandidate && marksDeployed && (
              <FilterPill
                label="Archived"
                count={archivedCount}
                tone="neutral"
                pressed={filter === "archived"}
                onClick={() => setFilter("archived")}
              />
            )}
          </div>

          {/* Narrow: a horizontal selector strip, so the conversation stays on
              screen. Wide: the full column. Neither scrolls the page sideways. */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 min-[1120px]:min-h-0 min-[1120px]:flex-1 min-[1120px]:flex-col min-[1120px]:overflow-x-hidden min-[1120px]:overflow-y-auto min-[1120px]:pb-0">
            {rows.length === 0 ? (
              <p className="px-1 py-3 text-[12px] leading-[1.5]" style={{ color: "var(--ink-3)" }} data-thread-list-empty>
                {emptyListWords(filter, archivedCount)}
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
                    chip={isCandidate ? null : chatStatusChip(c.status)}
                    onPick={() => setActiveId(c.id)}
                  />
                );
              })
            )}
          </div>

          {quiet > 0 && filter !== "needs" && filter !== "archived" && (
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
                className="flex flex-wrap items-center gap-x-[11px] gap-y-2 px-4 py-3 min-[1120px]:px-[18px]"
                style={{ borderBottom: "1px solid var(--line-soft)" }}
                data-chat-header
              >
                <span className="relative shrink-0">
                  <CkAvatar who={partner.name} size={34} />
                  {sealedScore != null && (
                    <AvaSeal size={19} tilt={-4} style={{ position: "absolute", right: -6, bottom: -6 }} />
                  )}
                </span>
                {/* The name keeps its room: on a phone the actions drop to a
                    line of their own instead of squeezing it to nothing. */}
                <div className="min-w-[min(100%,170px)] flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
                      {partner.name}
                    </span>
                    {partnerChip && (
                      <span className="shrink-0" data-chat-status>
                        <StatusChip chip={partnerChip} />
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[11px]" style={{ color: "var(--ink-3)" }}>
                    {partner.role}
                    {sealedScore != null ? ` · final score ${sealedScore}/100` : ""}
                    {hasInterview ? " · interview scheduled" : ""}
                  </div>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  {canMark && (
                    <>
                      <button
                        type="button"
                        className="ck-btn ck-btn-ghost ck-chat-action !gap-1.5 !px-2.5 !py-1.5 !text-[12px] max-sm:!h-9 max-sm:!w-9 max-sm:!p-0"
                        onClick={() => void handleArchive(!openChatArchived)}
                        disabled={markBusy}
                        title={openChatArchived ? "Move this chat back to your inbox" : "Move this chat out of your inbox"}
                        data-chat-archive={openChatArchived ? "back" : "archive"}
                      >
                        {openChatArchived ? <ArchiveRestore className="h-[15px] w-[15px]" aria-hidden /> : <Archive className="h-[15px] w-[15px]" aria-hidden />}
                        <span className="max-sm:sr-only">{openChatArchived ? "Move to inbox" : "Archive"}</span>
                      </button>
                      <button
                        type="button"
                        className="ck-btn ck-btn-ghost ck-chat-action ck-chat-action--danger !gap-1.5 !px-2.5 !py-1.5 !text-[12px] max-sm:!h-9 max-sm:!w-9 max-sm:!p-0"
                        onClick={() => setConfirmDelete(true)}
                        disabled={markBusy}
                        title="Delete this chat from your Messages"
                        data-chat-delete
                      >
                        <Trash2 className="h-[15px] w-[15px]" aria-hidden />
                        <span className="max-sm:sr-only">Delete</span>
                      </button>
                    </>
                  )}
                  {activeCandidate && (
                    <button
                      className="ck-btn ck-btn-outline shrink-0 !px-3 !py-1.5 !text-[12px]"
                      onClick={() => navigate(`/applicants/${activeCandidate.id}`)}
                    >
                      View application
                    </button>
                  )}
                  {!activeCandidate && activeEmployer && (
                    <button
                      className="ck-btn ck-btn-outline shrink-0 !px-3 !py-1.5 !text-[12px]"
                      onClick={() => navigate(`/applications/${activeEmployer.application_id}`)}
                    >
                      Your application
                    </button>
                  )}
                </div>
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
                        Pulling up your messages with {partnerShort}…
                      </p>
                    </div>
                  ) : thread.length === 0 && isError ? (
                    // Same rule as the page-level empty state: a failed fetch is not
                    // "no one has written" — say so, and offer the one way back in.
                    <CockpitErrorCard
                      compact
                      message={`We couldn't load your messages with ${partnerShort}.`}
                      onRetry={refetch}
                    />
                  ) : thread.length === 0 ? (
                    <p className="text-center text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                      No messages with {partnerShort} yet — write the first one.
                    </p>
                  ) : (
                    thread.map((m) => (
                      <Bubble
                        key={m.id}
                        mine={m.from === "me"}
                        who={m.from === "me" ? account.name : partnerShort}
                        time={m.time}
                        text={m.text}
                        file={resolvedFilesById.get(m.id)}
                      />
                    ))
                  )}
                </div>
              </div>

              <div className="px-4 pb-3 pt-3 min-[1120px]:px-[18px]" style={{ borderTop: "1px solid var(--line-soft)" }}>
                {/* Ready-made replies: offered while the box is empty, gone
                    once there are words in it (his own, or one of these). */}
                {quickReplies.length > 0 && !draft.trim() && (
                  <div className="mb-2 flex flex-wrap items-center gap-1.5" data-quick-replies>
                    <span className="mr-0.5 text-[11px]" style={{ color: "var(--ink-3)" }}>
                      Ready-made replies
                    </span>
                    {quickReplies.map((reply) => (
                      <button
                        key={reply.id}
                        type="button"
                        onClick={() => fillReply(reply.text)}
                        title={reply.text}
                        className="rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors hover:border-[var(--jade)] hover:bg-[var(--jade-soft)] hover:text-[var(--jade-soft-fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--jade)]"
                        style={{ borderColor: "var(--line)", color: "var(--ink-2)" }}
                        data-quick-reply={reply.id}
                      >
                        {reply.label}
                      </button>
                    ))}
                  </div>
                )}
                {/* One rounded box: the words on top, and under them what Enter
                    does and the Send button. Clicking anywhere in it writes. */}
                <div
                  className="ck-composer rounded-[18px] px-3.5 pb-2.5 pt-3"
                  onClick={(e) => {
                    if (e.target === e.currentTarget) composerRef.current?.focus();
                  }}
                  data-composer
                >
                  <textarea
                    ref={composerRef}
                    rows={1}
                    value={draft}
                    aria-label={`Write to ${partnerShort}`}
                    placeholder={`Write to ${partnerShort}…`}
                    // The browser's own spell-check (the red underline) and a
                    // phone keyboard's autocorrect: free, and already there.
                    spellCheck
                    autoCorrect="on"
                    autoCapitalize="sentences"
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                    // 16px on a phone, like components/ui/textarea.tsx: an iPhone
                    // zooms the whole page in when a field's text is smaller.
                    className="ck-scroll block w-full resize-none bg-transparent px-0.5 text-[16px] leading-[1.55] outline-none md:text-[14.5px]"
                    style={{ color: "var(--ink)", minHeight: COMPOSER_MIN_PX }}
                    data-composer-box
                  />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <p className="min-w-0 flex-1 text-[11.5px] leading-[1.4]" style={{ color: "var(--ink-3)" }} data-composer-hint>
                      <span className="max-md:hidden">Enter sends · Shift+Enter for a new line. </span>
                      {partnerShort} gets an email too, unless they turned those off.
                      {!isCandidate && <span data-composer-tidy> Capital letters and full stops are tidied when you send.</span>}
                    </p>
                    <button
                      type="button"
                      className="ck-btn ck-btn-primary shrink-0 !rounded-full !px-5 !py-2 !text-[13.5px]"
                      onClick={() => void handleSend()}
                      disabled={isSending || !draft.trim()}
                      style={isSending || !draft.trim() ? { opacity: 0.55 } : undefined}
                      data-composer-send
                    >
                      {isSending ? "Sending…" : "Send"}
                    </button>
                  </div>
                </div>
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

      <ActionDialog
        open={confirmDelete && canMark}
        title={deleteWords.title}
        description={deleteWords.body}
        note={deleteWords.note}
        confirmLabel={deleteWords.confirm}
        tone="danger"
        busy={markBusy}
        busyLabel="Deleting…"
        onConfirm={() => void handleDelete()}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
