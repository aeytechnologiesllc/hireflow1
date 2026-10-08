/**
 * chatMarks.ts: a person's own marks on a chat in Messages: archived, and
 * deleted from their side (docs/MESSAGES.md, "Declined, archive and delete";
 * supabase/migrations/*_chat_archive_and_delete.sql).
 *
 * The owner, 2026-10-08, looking at a chat with someone he had just declined:
 * "at least on the messages should show ... it doesn't show that he has been
 * declined here ... there's no button for me to archive the chat, there's no
 * filters of that either, and delete as well, permanently delete the chat."
 *
 * Three rules live here, so the page and its tests read the same ones:
 *  - a chat says where the applicant stands once that is decided (Interview,
 *    Offer, Hired, Declined), the same chip as the applicants list;
 *  - an archived chat is out of the inbox until the other person writes
 *    again, then it is back by itself;
 *  - a deleted chat is gone from this person's side for good. The other
 *    person keeps their copy. The database does the hiding (the page never
 *    receives those messages); this file only holds the words.
 *
 * Pure: no React, no Supabase.
 */
// "@/": this file is also loaded as it is by scripts/chat_marks.test.mjs.
import { applicantChip, type ApplicantChip } from "@/cockpit/lib/applicantProfile";

/** One row of public.message_thread_state: this reader's marks on one chat. */
export interface ChatMark {
  /** The person on the other side of the chat. */
  contact_id: string;
  archived_at: string | null;
  /** Everything up to this moment was deleted from this reader's side. */
  cleared_at: string | null;
}

export const CHAT_MARK_COLUMNS = "contact_id, archived_at, cleared_at";

export type ChatFilter = "all" | "needs" | "quiet" | "archived";

/** What the page knows about a chat when it sorts the list. */
export interface ChatLike {
  id: string;
  unread?: number;
  /** When the newest message in the chat was written, either way. */
  lastAt?: string | null;
  /** When the other person last wrote, or null when only this side has. */
  lastIncomingAt?: string | null;
}

export function marksByContact(rows: readonly ChatMark[] | null | undefined): Map<string, ChatMark> {
  const map = new Map<string, ChatMark>();
  for (const row of rows ?? []) {
    if (row && typeof row.contact_id === "string") map.set(row.contact_id, row);
  }
  return map;
}

function moment(value: string | null | undefined): number {
  if (!value) return NaN;
  return Date.parse(value);
}

/**
 * Archived, and still archived: nothing has come in since. A message from
 * the other person after the mark puts the chat back in the inbox by itself,
 * so an archived applicant who writes again is never missed. What this side
 * sends does not bring it back.
 */
export function isArchivedChat(mark: ChatMark | null | undefined, lastIncomingAt: string | null | undefined): boolean {
  const archived = moment(mark?.archived_at);
  if (Number.isNaN(archived)) return false;
  const incoming = moment(lastIncomingAt);
  return Number.isNaN(incoming) || incoming <= archived;
}

/**
 * Deleted from this side, with nothing written since. The database already
 * stops sending such a chat; this is for the moment between pressing Delete
 * and the list being read again, so the row leaves at once.
 */
export function isDeletedChat(mark: ChatMark | null | undefined, lastAt: string | null | undefined): boolean {
  const cleared = moment(mark?.cleared_at);
  if (Number.isNaN(cleared)) return false;
  const last = moment(lastAt);
  return !Number.isNaN(last) && last <= cleared;
}

/** The chats, split into the inbox and the archive, each in the order given. A deleted one is in neither. */
export function splitChats<T extends ChatLike>(chats: readonly T[], marks: ReadonlyMap<string, ChatMark>): { inbox: T[]; archived: T[] } {
  const inbox: T[] = [];
  const archived: T[] = [];
  for (const chat of chats) {
    const mark = marks.get(chat.id);
    if (isDeletedChat(mark, chat.lastAt)) continue;
    (isArchivedChat(mark, chat.lastIncomingAt) ? archived : inbox).push(chat);
  }
  return { inbox, archived };
}

/** The rows one filter shows. "All" is the inbox: an archived chat is only under Archived. */
export function chatsFor<T extends ChatLike>(filter: ChatFilter, split: { inbox: T[]; archived: T[] }): T[] {
  switch (filter) {
    case "archived":
      return split.archived;
    case "needs":
      return split.inbox.filter((c) => (c.unread ?? 0) > 0);
    case "quiet":
      return split.inbox.filter((c) => !(c.unread ?? 0));
    default:
      return split.inbox;
  }
}

/**
 * Which chat to open when the open one leaves the list (archived, moved
 * back, deleted): the one after it, else the one before it, else none.
 * `list` is the list as it was, with the leaving chat still in it.
 */
export function nextChatAfter<T extends { id: string }>(list: readonly T[], leavingId: string): string | null {
  const at = list.findIndex((c) => c.id === leavingId);
  if (at < 0) return list[0]?.id ?? null;
  return list[at + 1]?.id ?? list[at - 1]?.id ?? null;
}

/**
 * Where the applicant stands, on their chat: only once it is decided. "Needs
 * review" is the applicants list's business, not a conversation's.
 */
export function chatStatusChip(status: string | null | undefined): ApplicantChip | null {
  return applicantChip(status, false);
}

/** The line under the list when a filter has nothing to show. */
export function emptyListWords(filter: ChatFilter, archivedCount: number): string {
  if (filter === "needs") return "Nothing is waiting on you.";
  if (filter === "archived") return "Nothing archived. Archive a chat to move it out of your inbox.";
  if (filter === "all" && archivedCount > 0) {
    return `Your inbox is empty. ${archivedCount} ${archivedCount === 1 ? "chat is" : "chats are"} under Archived.`;
  }
  return "Nothing here.";
}

/** What is said once a chat is archived or moved back. */
export function archivedWords(name: string): { title: string; body: string } {
  return { title: "Chat archived", body: `It comes back to your inbox if ${name || "they"} write${name ? "s" : ""} again.` };
}
export const MOVED_BACK_WORDS = "Moved back to your inbox";

/** The confirm before a chat is deleted: what goes, what stays, and that it cannot be undone. */
export function deleteChatWords(name: string): { title: string; body: string; confirm: string; note: string; done: string } {
  const who = name || "this person";
  return {
    title: `Delete your chat with ${who}?`,
    body: `Every message in it is removed from your Messages for good. This can't be undone.`,
    note: `${name || "They"} keep${name ? "s" : ""} their own copy of what was said, and their application stays exactly as it is. If they write again, a new chat starts.`,
    confirm: "Delete chat",
    done: "Chat deleted",
  };
}

type RpcError = { code?: string | null; message?: string | null } | null | undefined;

/** Why archiving or deleting did not happen, in words for the person who pressed it. */
export function chatMarkFailureWords(error: RpcError, notDeployed: boolean): string {
  if (notDeployed) return "Archive and delete aren't switched on yet.";
  if (error?.code === "42501") return "You can't change this chat.";
  return "That didn't go through. Try again.";
}
