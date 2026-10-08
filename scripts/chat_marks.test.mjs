#!/usr/bin/env node
/**
 * Messages: where the applicant stands, archive, and delete from your own
 * side (docs/MESSAGES.md, "Declined, archive and delete";
 * src/cockpit/lib/chatMarks.ts, src/cockpit/pages/Messages.tsx).
 *
 * The owner, 2026-10-08, looking at a chat with someone he had just
 * declined: "it doesn't show that he has been declined here ... there's no
 * button for me to archive the chat, there's no filters of that either, and
 * delete as well, permanently delete the chat." These checks pin:
 *  - the chip: only a decided status, the applicants list's own chip;
 *  - archive: out of the inbox until the other person writes again;
 *  - the filters: All is the inbox, an archived chat is only under Archived,
 *    a deleted one is nowhere;
 *  - what opens when the open chat leaves the list;
 *  - the words of the confirm: for good, cannot be undone, the other person
 *    keeps their copy;
 *  - the wiring: one database function and nothing else, never a row
 *    removed from messages by the page, and none of it on an applicant's
 *    side;
 *  - nobody removes the other person's copy: the old "either side may
 *    delete any row" policy is replaced, and the hook that used it is gone
 *    ("Make sure that applicant cannot delete any messages").
 *
 * The database half (who may, and that a deleted chat really stops coming
 * back) is scripts/chat_archive_delete.pglite.test.mjs.
 *
 * Run with: node scripts/chat_marks.test.mjs
 */
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

// Decoded, so a checkout whose path has a space in it works too.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = pathToFileURL(path.join(ROOT, "src", specifier.slice(2))).href;
      for (const suffix of [".ts", ".tsx", "/index.ts"]) {
        try {
          return nextResolve(base + suffix, context);
        } catch {
          // try the next spelling
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const C = await import(pathToFileURL(path.join(ROOT, "src/cockpit/lib/chatMarks.ts")).href);

let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}
const show = (v) => JSON.stringify(v);
const read = (rel) => readFile(path.join(ROOT, rel), "utf8");
/** Source with its comments taken out: a pin must not pass on a comment. */
const code = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const T = (h, m = 0) => new Date(Date.UTC(2026, 9, 8, h, m)).toISOString();
const mark = (over = {}) => ({ contact_id: "ana", archived_at: null, cleared_at: null, ...over });

console.log("\nWhere the applicant stands, on their chat");
{
  check("declined says Declined, in the list's own red", show(C.chatStatusChip("rejected")) === show({ label: "Declined", tone: "crit" }));
  check("interview, offer and hired say so", C.chatStatusChip("interview")?.label === "Interview" && C.chatStatusChip("offered")?.label === "Offer" && C.chatStatusChip("hired")?.label === "Hired");
  check("someone not yet decided has no chip: 'Needs review' is the list's business", C.chatStatusChip("reviewing") === null && C.chatStatusChip("in_progress") === null && C.chatStatusChip("pending") === null);
  check("no status at all (a chat with nobody's application) has none", C.chatStatusChip(null) === null && C.chatStatusChip(undefined) === null);
}

console.log("\nArchived, until they write again");
{
  check("no mark: not archived", C.isArchivedChat(null, T(10)) === false && C.isArchivedChat(mark(), T(10)) === false);
  check("archived after their last message: archived", C.isArchivedChat(mark({ archived_at: T(12) }), T(10)) === true);
  check("they wrote after it was archived: back in the inbox by itself", C.isArchivedChat(mark({ archived_at: T(12) }), T(12, 1)) === false);
  check("only this side ever wrote: it stays archived", C.isArchivedChat(mark({ archived_at: T(12) }), null) === true);
  check("a mark that is not a time is not a mark", C.isArchivedChat(mark({ archived_at: "soon" }), T(10)) === false);
}

console.log("\nDeleted: in no list");
{
  check("deleted, nothing since: gone", C.isDeletedChat(mark({ cleared_at: T(12) }), T(11)) === true && C.isDeletedChat(mark({ cleared_at: T(12) }), T(12)) === true);
  check("something written since: a new chat", C.isDeletedChat(mark({ cleared_at: T(12) }), T(12, 1)) === false);
  check("never deleted: not gone", C.isDeletedChat(mark(), T(11)) === false && C.isDeletedChat(null, T(11)) === false);
}

const chats = [
  { id: "ana", unread: 2, lastAt: T(13), lastIncomingAt: T(13) },
  { id: "ben", unread: 0, lastAt: T(12), lastIncomingAt: T(9) },
  { id: "cat", unread: undefined, lastAt: T(11), lastIncomingAt: T(11) },
  { id: "dee", unread: 0, lastAt: T(10), lastIncomingAt: T(10) },
  { id: "eli", unread: 1, lastAt: T(8), lastIncomingAt: T(8) },
];
const marks = C.marksByContact([
  { contact_id: "ben", archived_at: T(12, 30), cleared_at: null },
  { contact_id: "cat", archived_at: T(10), cleared_at: null }, // wrote again at 11:00
  { contact_id: "dee", archived_at: null, cleared_at: T(10, 30) }, // deleted, nothing since
  { contact_id: "eli", archived_at: T(9), cleared_at: T(7) }, // deleted earlier, wrote since, then archived
]);
const ids = (list) => list.map((c) => c.id).join(",");

console.log("\nThe filters");
{
  const split = C.splitChats(chats, marks);
  check("the inbox: everything not archived and not deleted, in the order given", ids(split.inbox) === "ana,cat", ids(split.inbox));
  check("the archive: what was put away and has had nothing come in since", ids(split.archived) === "ben,eli", ids(split.archived));
  check("All is the inbox", ids(C.chatsFor("all", split)) === "ana,cat");
  check("Needs you is the inbox's unread", ids(C.chatsFor("needs", split)) === "ana");
  check("Caught up is the rest of the inbox", ids(C.chatsFor("quiet", split)) === "cat");
  check("Archived is only the archive, unread or not", ids(C.chatsFor("archived", split)) === "ben,eli");
  check("an applicant's side has no marks: everything is the inbox", ids(C.splitChats(chats, new Map()).inbox) === "ana,ben,cat,dee,eli" && C.splitChats(chats, new Map()).archived.length === 0);
  check("marks for nobody, or none at all, are no marks", C.marksByContact(null).size === 0 && C.marksByContact([null, {}]).size === 0);
}

console.log("\nWhat opens when the open chat leaves the list");
{
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
  check("the one after it", C.nextChatAfter(list, "a") === "b" && C.nextChatAfter(list, "b") === "c");
  check("the last one: the one before it", C.nextChatAfter(list, "c") === "b");
  check("the only one: nothing", C.nextChatAfter([{ id: "a" }], "a") === null);
  check("one that was not in the list: the first", C.nextChatAfter(list, "z") === "a" && C.nextChatAfter([], "z") === null);
}

console.log("\nThe words");
{
  const del = C.deleteChatWords("Ana");
  check("the confirm names the person", del.title === "Delete your chat with Ana?");
  check("it says for good, and that it cannot be undone", /removed from your Messages for good\. This can't be undone\./.test(del.body));
  check("it says they keep their copy, their application is untouched, and what happens if they write", del.note === "Ana keeps their own copy of what was said, and their application stays exactly as it is. If they write again, a new chat starts.");
  check("the button says what it does", del.confirm === "Delete chat" && del.done === "Chat deleted");
  check("with no name it still reads", C.deleteChatWords("").title === "Delete your chat with this person?" && /^They keep their own copy/.test(C.deleteChatWords("").note));
  check("archiving says how it comes back", show(C.archivedWords("Ana")) === show({ title: "Chat archived", body: "It comes back to your inbox if Ana writes again." }) && C.archivedWords("").body === "It comes back to your inbox if they write again.");
  check("an empty inbox with archived chats points at them", C.emptyListWords("all", 2) === "Your inbox is empty. 2 chats are under Archived." && C.emptyListWords("all", 1) === "Your inbox is empty. 1 chat is under Archived.");
  check("an empty Archived says what it is for", C.emptyListWords("archived", 0) === "Nothing archived. Archive a chat to move it out of your inbox.");
  check("the other empty lists read as before", C.emptyListWords("needs", 3) === "Nothing is waiting on you." && C.emptyListWords("all", 0) === "Nothing here." && C.emptyListWords("quiet", 3) === "Nothing here.");
  check("a refusal reads as one, and 'not there yet' as that", C.chatMarkFailureWords({ code: "42501" }, false) === "You can't change this chat." && C.chatMarkFailureWords(null, true) === "Archive and delete aren't switched on yet." && C.chatMarkFailureWords({ code: "XX000" }, false) === "That didn't go through. Try again.");
  const every = [del.title, del.body, del.note, C.archivedWords("Ana").body, C.emptyListWords("all", 2), C.emptyListWords("archived", 0)].join(" ");
  check("no dash and no jargon in any of it", !/[–—]/.test(every) && !/thread|row|RLS|database/i.test(every));
}

console.log("\nThe wiring");
{
  const page = code(await read("src/cockpit/pages/Messages.tsx"));
  const hook = code(await read("src/cockpit/hooks/useChatMarks.ts"));
  const messagesHook = code(await read("src/hooks/useMessages.ts"));
  const mappers = code(await read("src/cockpit/lib/mappers.ts"));
  const css = await read("src/cockpit/cockpit.css");

  check("a change goes through the one database function", /supabase\.rpc\("set_chat_state", \{ p_contact_id: contactId, p_action: action \}\)/.test(hook) && (hook.match(/\.rpc\(/g) ?? []).length === 1);
  check("the marks are only read from their table, never written to it", /\.from\("message_thread_state"\)\.select\(CHAT_MARK_COLUMNS\)/.test(hook) && !/\.(insert|update|upsert|delete)\(/.test(hook));
  check("the page never removes a message itself", !/useDeleteConversation/.test(page) && !/\.delete\(/.test(page) && !/from\("messages"\)/.test(page));
  check("the hook that removed a whole chat for both sides is gone", !/useDeleteConversation/.test(messagesHook) && !/\.delete\(\)/.test(messagesHook));
  check("after a delete, every list that reads messages is asked again", /if \(action === "delete"\) \{\s*void queryClient\.invalidateQueries\(\{ queryKey: \["conversations"\] \}\);\s*void queryClient\.invalidateQueries\(\{ queryKey: \["messages"\] \}\);\s*void queryClient\.invalidateQueries\(\{ queryKey: \["unread-messages-count"\] \}\);/.test(hook));
  check("before the migration is applied the marks read as none, and nothing is offered", /if \(isRecordNotDeployed\(error\)\) return \{ rows: \[\], deployed: false \};/.test(hook) && /const canMark = !isCandidate && marksDeployed && !!activeConv && !!contactId;/.test(page));

  check("each chat carries when they last wrote, when anything was last written, and the applicant's status", /last_incoming_at: conv\.lastIncomingAt,/.test(messagesHook) && /if \(!conv\.lastIncomingAt && msg\.receiver_id === effectiveUserId\) \{\s*conv\.lastIncomingAt = msg\.created_at;/.test(messagesHook) && /lastAt: conv\.last_message\?\.created_at \?\? null,\s*lastIncomingAt: conv\.last_incoming_at \?\? null,\s*status: app\?\.status \?\? null,/.test(mappers));

  check("an applicant's side reads no marks and has none of the three", /useChatMarks\(\{\s*enabled: !isCandidate,\s*\}\)/.test(page) && /const marks = isCandidate \? NO_MARKS : teamMarks;/.test(page) && /chip=\{isCandidate \? null : chatStatusChip\(c\.status\)\}/.test(page) && /const partnerChip = isCandidate\s*\? null/.test(page) && /\{!isCandidate && marksDeployed && \(\s*<FilterPill\s*label="Archived"/.test(page));
  check("the list and its counts come from the split, so an archived chat is in neither inbox count", /const split = useMemo\(\(\) => splitChats<ThreadItem>\(conversations, marks\), \[conversations, marks\]\);/.test(page) && /const needsYou = split\.inbox\.filter\(\(c\) => \(c\.unread \?\? 0\) > 0\)\.length;\s*const quiet = split\.inbox\.length - needsYou;\s*const archivedCount = split\.archived\.length;/.test(page) && /const list = chatsFor\(filter, split\);/.test(page));
  check("the page opens the newest inbox chat by itself, never an archived one", /if \(!activeId && split\.inbox\[0\]\) setActiveId\(split\.inbox\[0\]\.id\);/.test(page) && !/setActiveId\(conversations\[0\]\.id\)/.test(page));
  check("a chat that exists is never shown as 'No messages yet' because it is under another filter", /if \(partner && filter !== "archived" && !all\.some\(\(c\) => c\.id === partner\.id\) && !conversations\.some\(\(c\) => c\.id === partner\.id\)\) \{/.test(page));
  check("a link to an archived chat shows the Archived list, once, so the pills still work", /if \(!activeId \|\| !marksReady \|\| !openChat \|\| listShownFor\.current === activeId\) return;\s*listShownFor\.current = activeId;\s*if \(openChatArchived\) setFilter\("archived"\);/.test(page));

  check("Archive becomes 'Move to inbox' on an archived chat", /onClick=\{\(\) => void handleArchive\(!openChatArchived\)\}/.test(page) && /\{openChatArchived \? "Move to inbox" : "Archive"\}/.test(page));
  check("archiving offers Undo; moving back says so", /toast\.success\(words\.title, \{\s*description: words\.body,\s*action: \{\s*label: "Undo",/.test(page) && /toast\.success\(MOVED_BACK_WORDS\);/.test(page));
  check("Delete only opens the confirm; the confirm is what deletes", /onClick=\{\(\) => setConfirmDelete\(true\)\}/.test(page) && /<ActionDialog\s*open=\{confirmDelete && canMark\}\s*title=\{deleteWords\.title\}\s*description=\{deleteWords\.body\}\s*note=\{deleteWords\.note\}\s*confirmLabel=\{deleteWords\.confirm\}\s*tone="danger"/.test(page) && /onConfirm=\{\(\) => void handleDelete\(\)\}/.test(page) && (page.match(/setChat\(id, "delete"\)/g) ?? []).length === 1);
  check("the confirm never outlives the chat it was about", /useEffect\(\(\) => \{\s*setDraft\(""\);\s*setConfirmDelete\(false\);\s*\}, \[contactId\]\);/.test(page));
  check("a deleted chat has no Undo", !/deleteWords\.done, \{/.test(page) && /toast\.success\(deleteWords\.done\);/.test(page));
  check("when the open chat leaves the list, the one beside it opens", /const beside = nextChatAfter\(rows, id\);/.test(page) && /if \(leaves\) setActiveId\(beside\);/.test(page) && /setConfirmDelete\(false\);\s*setActiveId\(beside\);/.test(page));
  check("an inbox emptied by deleting does not claim nobody ever wrote", /\{everDeleted \? "No chats in your Messages\." : "Nobody has written to you yet\."\}/.test(page));
  check("the chat stays open to read and write: nothing about the box depends on the status", !/partnerChip[\s\S]{0,80}disabled/.test(page) && /data-composer-box/.test(page));
  check("on a phone the name keeps its room and the two actions are thumb-sized icons", /className="min-w-\[min\(100%,170px\)\] flex-1"/.test(page) && (page.match(/max-sm:!h-9 max-sm:!w-9 max-sm:!p-0/g) ?? []).length === 2 && (page.match(/<span className="max-sm:sr-only">/g) ?? []).length === 2);
  check("delete only turns red under the pointer", /\.ck-chat-action--danger:not\(:disabled\):hover \{ color: var\(--crit\); background: var\(--crit-bg\); border-color: transparent; \}/.test(css));
}

console.log("\nThe database half, as written");
{
  const names = (await readdir(path.join(ROOT, "supabase/migrations"))).filter((n) => /^\d+_chat_archive_and_delete\.sql$/.test(n));
  check("there is one migration for it", names.length === 1, show(names));
  const sql = names.length === 1 ? await read(`supabase/migrations/${names[0]}`) : "";
  const statements = sql.replace(/^\s*--.*$/gm, "");
  check("it never deletes from, alters or adds a trigger to messages", !/DELETE\s+FROM\s+public\.messages/i.test(statements) && !/ALTER\s+TABLE\s+public\.messages/i.test(statements) && !/CREATE\s+TRIGGER/i.test(statements));
  check("the policy that hides a deleted chat can only take rows away, for signed-in people", /CREATE POLICY "A chat someone deleted stays deleted for them"\s+ON public\.messages AS RESTRICTIVE FOR SELECT TO authenticated/.test(statements));
  check("who may remove a message is narrowed to a job's owner, on their own application's messages", /CREATE POLICY "Job owners can delete the messages of their own applications"\s+ON public\.messages FOR DELETE TO authenticated\s+USING \(\s*application_id IS NOT NULL\s+AND \(\(SELECT auth\.uid\(\)\) = sender_id OR \(SELECT auth\.uid\(\)\) = receiver_id\)\s+AND EXISTS \(\s*SELECT 1 FROM public\.applications a\s+WHERE a\.id = messages\.application_id\s+AND public\.is_job_owner\(a\.job_id, \(SELECT auth\.uid\(\)\)\)/.test(statements));
  check("those are the only two policies it puts on messages", (statements.match(/CREATE POLICY "[^"]+"\s+ON public\.messages\b/g) ?? []).length === 2);
  const dropped = (statements.match(/DROP POLICY IF EXISTS "([^"]+)"/g) ?? []).map((d) => d.replace(/^DROP POLICY IF EXISTS /, ""));
  check("the only existing policy it drops is the one that let either side remove any row", dropped.filter((d) => !/stays deleted for them|reads their own chat marks|Job owners can delete/.test(d)).join() === '"Users can delete their own messages"', show(dropped));
  check("nothing sets a delete back", /cleared_at\s+= CASE WHEN p_action = 'delete' THEN v_now ELSE s\.cleared_at END/.test(statements) && !/cleared_at\s*=\s*NULL/i.test(statements));
  check("the marks cannot be written directly, and anon cannot call the function", /REVOKE ALL ON public\.message_thread_state FROM PUBLIC, anon, authenticated;\s*GRANT SELECT ON public\.message_thread_state TO authenticated;/.test(statements) && /REVOKE ALL ON FUNCTION public\.set_chat_state\(uuid, text\) FROM PUBLIC, anon;/.test(statements));
  const types = await read("src/integrations/supabase/types.ts");
  check("the table and the function are in the typed schema", /message_thread_state: \{\s*Row: \{\s*archived_at: string \| null\s*cleared_at: string \| null\s*contact_id: string/.test(types) && /set_chat_state: \{\s*Args: \{ p_action: string; p_contact_id: string \}/.test(types));
  const doc = await read("docs/MESSAGES.md");
  check("docs/MESSAGES.md explains it and names both tests", /## Declined, archive and delete/.test(doc) && /scripts\/chat_marks\.test\.mjs/.test(doc) && /scripts\/chat_archive_delete\.pglite\.test\.mjs/.test(doc));
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
