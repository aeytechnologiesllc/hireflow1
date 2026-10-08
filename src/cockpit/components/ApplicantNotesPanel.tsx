import { useId, useState } from "react";
import { Loader2, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { PanelLabel } from "./ProfileSection";
import { useApplicantNoteActions, useApplicantNotes } from "../hooks/useApplicantNotes";
import { NOTES_PRIVATE_LINE, NOTE_MAX, noteAuthorWords, noteWhen } from "../lib/applicantNotes";

/**
 * "Notes" on an applicant's page: the hiring team's own, private notes
 * (lib/applicantNotes.ts; hooks/useApplicantNotes.ts).
 *
 * The owner, 2026-10-08: "is there a way you can cleanly allow me to add
 * some notes ... I like him or he did something really good. That's why I
 * picked him ... just a simple note that I can also access."
 *
 * One box to write in, and the notes under it, newest first. A note is kept
 * as written; taking one away is one click with an Undo. Nothing here tells
 * the applicant anything.
 */
export function ApplicantNotesPanel({ applicationId, firstName, className = "" }: { applicationId: string; firstName: string; className?: string }) {
  const id = useId();
  const { user, role, isTeamMember } = useAuth();
  const notes = useApplicantNotes();
  const { addNote, removeNote, saving } = useApplicantNoteActions();
  const [draft, setDraft] = useState("");
  const list = notes.byApplication.get(applicationId) ?? [];
  const now = new Date();
  // The job's owner may remove any note; a team member, their own.
  const isOwner = role === "employer" && !isTeamMember;
  const ready = draft.trim().length > 0 && !saving;

  const save = async () => {
    if (!ready) return;
    const kept = await addNote(applicationId, draft);
    if (kept) setDraft("");
  };

  return (
    <section aria-labelledby={id} className={className} data-applicant-notes={list.length}>
      <PanelLabel id={id}>Notes</PanelLabel>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // Ctrl or Cmd + Enter saves; Enter alone is a new line.
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void save();
          }
        }}
        maxLength={NOTE_MAX}
        rows={2}
        placeholder={`Add a note about ${firstName || "this applicant"}: why you like them, what to ask.`}
        aria-label={`A note about ${firstName || "this applicant"}`}
        className="ck-input w-full resize-y px-3 py-2 !text-[13.5px] leading-[1.45]"
        style={{ minHeight: 62 }}
        data-applicant-note-box
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="min-w-0 flex-1 text-[11.5px] leading-[1.4]" style={{ color: "var(--ink-3)" }}>
          {NOTES_PRIVATE_LINE}
        </p>
        <button
          type="button"
          className={`ck-btn min-h-[36px] !px-4 !text-[13px] ${ready ? "ck-btn-primary" : "ckp-btn-soft"}`}
          onClick={() => void save()}
          disabled={!ready}
          data-applicant-note-save
        >
          {saving && <Loader2 aria-hidden className="mr-1.5 inline h-3.5 w-3.5 animate-spin" />}
          Save note
        </button>
      </div>

      {list.length > 0 && (
        <ul className="mt-3.5 flex flex-col gap-2.5" data-applicant-note-list>
          {list.map((note) => {
            const mine = note.author_id === user?.id;
            return (
              <li key={note.id} className="group relative rounded-xl px-3 py-2.5" style={{ background: "color-mix(in srgb, var(--ink) 5%, transparent)" }} data-applicant-note>
                <p className="whitespace-pre-wrap break-words pr-6 text-[13.5px] leading-[1.5] [overflow-wrap:anywhere]" style={{ color: "var(--ink)" }}>
                  {note.body}
                </p>
                <p className="mt-1 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                  {noteAuthorWords(note.author_id, user?.id)} · {noteWhen(note.created_at, now)}
                </p>
                {(mine || isOwner) && (
                  <button
                    type="button"
                    onClick={() => void removeNote(note)}
                    aria-label="Remove this note"
                    title="Remove this note"
                    className="absolute right-1.5 top-1.5 rounded-md p-1 opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100"
                    // The phone stylesheet's 44px button floor would swallow the note's corner.
                    style={{ color: "var(--ink-3)", minHeight: 0 }}
                    data-applicant-note-remove
                  >
                    <X aria-hidden style={{ width: 14, height: 14 }} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default ApplicantNotesPanel;
