import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSchemaMode } from "@/hooks/useSchemaMode";
import { isRecordNotDeployed } from "./useAssessmentSessions";
import {
  NOTE_COLUMNS,
  VIEW_COLUMNS,
  cleanNoteBody,
  notesByApplication,
  viewsIndex,
  type ApplicantNote,
  type ApplicantView,
} from "../lib/applicantNotes";

/**
 * The hiring team's notes on applicants, and this person's own "viewed"
 * marks, the staff side (lib/applicantNotes.ts;
 * supabase/migrations/*_applicant_notes_and_views.sql).
 *
 * Both lists are read under RLS: a note by the job's owner and its active
 * team members only (the applicant least of all), a mark only by the person
 * whose mark it is. They are small and are not part of the shell's live
 * sync: neither writes anything to the application, so no realtime event
 * comes for them. A teammate's note reaches an open page within a minute, on
 * refocus, and whenever the page is opened.
 *
 * A change goes through the three database functions and nothing else. It
 * is deliberately nowhere near useUpdateApplication: that hook's status
 * write is what emails the candidate, and a note tells the candidate nothing.
 *
 * Until the migration is applied the tables and functions do not exist: the
 * lists read that as "no notes, nothing viewed", and writing a note says it
 * is not switched on yet, never an error card on a page that worked
 * yesterday.
 */

export const applicantNoteKeys = {
  notes: (uid: string | null | undefined) => ["applicant-notes", uid ?? null] as const,
  views: (uid: string | null | undefined) => ["applicant-views", uid ?? null] as const,
};

interface NoteList {
  rows: ApplicantNote[];
  /** False when the table is not there yet (the migration is not applied). */
  deployed: boolean;
}
const NO_NOTES: NoteList = { rows: [], deployed: true };

/** Every note this person's team has written, by application (newest first). */
export function useApplicantNotes() {
  const { user } = useAuth();
  const { data: mode } = useSchemaMode();
  const query = useQuery({
    queryKey: applicantNoteKeys.notes(user?.id),
    queryFn: async (): Promise<NoteList> => {
      const { data, error } = await supabase.from("applicant_notes").select(NOTE_COLUMNS).order("created_at", { ascending: false }).limit(10_000);
      if (error) {
        if (isRecordNotDeployed(error)) return { rows: [], deployed: false };
        throw error;
      }
      return { rows: (data ?? []) as ApplicantNote[], deployed: true };
    },
    enabled: !!user && mode === "hireflow1",
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const data = query.data ?? NO_NOTES;
  const byApplication = useMemo(() => notesByApplication(data.rows), [data.rows]);
  return { byApplication, deployed: data.deployed, isLoading: query.isLoading && !query.isError };
}

type RpcError = { code?: string | null; message?: string | null } | null | undefined;

function noteFailureWords(error: RpcError): string {
  if (isRecordNotDeployed(error)) return "Notes aren't switched on yet.";
  if (error?.code === "42501") return "You can't add notes for this applicant.";
  if (error?.code === "22023") return "That note is too long, or there are too many on this applicant.";
  return "Couldn't save your note. Try again.";
}

/** Write a note on an applicant, or take one away. Nothing is sent to the applicant. */
export function useApplicantNoteActions() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const key = applicantNoteKeys.notes(user?.id);

  const add = useMutation({
    mutationFn: async ({ applicationId, body }: { applicationId: string; body: string }) => {
      const { data, error } = await supabase.rpc("add_applicant_note", { p_application_id: applicationId, p_body: body });
      if (error) throw error;
      return data as unknown as ApplicantNote;
    },
    onSuccess: (note) => {
      if (!note?.id) return;
      queryClient.setQueryData<NoteList>(key, (was) => {
        const before = was ?? NO_NOTES;
        return before.rows.some((r) => r.id === note.id) ? before : { ...before, rows: [note, ...before.rows] };
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key, exact: true });
    },
  });

  const remove = useMutation({
    mutationFn: async (noteId: string) => {
      const { data, error } = await supabase.rpc("delete_applicant_note", { p_note_id: noteId });
      if (error) throw error;
      return data === true;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key, exact: true });
    },
  });

  const { mutateAsync: addAsync } = add;
  const { mutateAsync: removeAsync } = remove;

  /** Saves the note; resolves true when it was kept. */
  const addNote = useCallback(
    async (applicationId: string, raw: string): Promise<boolean> => {
      const body = cleanNoteBody(raw);
      if (!body) {
        toast.error(raw.trim() ? "That note is too long." : "Write something first.");
        return false;
      }
      try {
        await addAsync({ applicationId, body });
        return true;
      } catch (error) {
        console.error("[add_applicant_note]", error);
        toast.error(noteFailureWords(error as RpcError));
        return false;
      }
    },
    [addAsync],
  );

  /** Takes a note away, and offers to put it back. */
  const removeNote = useCallback(
    async (note: ApplicantNote): Promise<boolean> => {
      // Off the page on the click; put back if the database says no.
      const before = queryClient.getQueryData<NoteList>(key);
      queryClient.setQueryData<NoteList>(key, (was) => (was ? { ...was, rows: was.rows.filter((r) => r.id !== note.id) } : was));
      try {
        const gone = await removeAsync(note.id);
        if (!gone) {
          if (before) queryClient.setQueryData(key, before);
          toast.error("You can't remove that note.");
          return false;
        }
        toast.success("Note removed", { action: { label: "Undo", onClick: () => void addNote(note.application_id, note.body) } });
        return true;
      } catch (error) {
        console.error("[delete_applicant_note]", error);
        if (before) queryClient.setQueryData(key, before);
        toast.error("Couldn't remove that note. Try again.");
        return false;
      }
    },
    [queryClient, key, removeAsync, addNote],
  );

  return { addNote, removeNote, saving: add.isPending };
}

interface ViewList {
  rows: ApplicantView[];
  deployed: boolean;
}
const NO_VIEWS: ViewList = { rows: [], deployed: true };

/** Which applicants this person has opened, and when (their own marks only). */
export function useApplicantViews() {
  const { user } = useAuth();
  const { data: mode } = useSchemaMode();
  const queryClient = useQueryClient();
  const key = applicantNoteKeys.views(user?.id);
  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<ViewList> => {
      const { data, error } = await supabase.from("applicant_views").select(VIEW_COLUMNS).limit(10_000);
      if (error) {
        if (isRecordNotDeployed(error)) return { rows: [], deployed: false };
        throw error;
      }
      return { rows: (data ?? []) as ApplicantView[], deployed: true };
    },
    enabled: !!user && mode === "hireflow1",
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  const data = query.data ?? NO_VIEWS;
  const viewedAt = useMemo(() => viewsIndex(data.rows), [data.rows]);

  /**
   * This person has just opened that applicant's page. Shown at once; a
   * failure is silent (a mark that is not kept only means the list says
   * "Needs review" again), and before the migration it does nothing.
   */
  const markViewed = useCallback(
    async (applicationId: string | null | undefined) => {
      if (!applicationId || !user || !data.deployed) return;
      const now = new Date().toISOString();
      queryClient.setQueryData<ViewList>(key, (was) => {
        const before = was ?? NO_VIEWS;
        return { ...before, rows: [...before.rows.filter((r) => r.application_id !== applicationId), { application_id: applicationId, viewed_at: now }] };
      });
      const { error } = await supabase.rpc("mark_applicant_viewed", { p_application_id: applicationId });
      if (error && !isRecordNotDeployed(error)) console.error("[mark_applicant_viewed]", error);
    },
    [queryClient, key, user, data.deployed],
  );

  return { viewedAt, markViewed, deployed: data.deployed };
}
