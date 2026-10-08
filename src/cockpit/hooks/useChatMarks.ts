import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSchemaMode } from "@/hooks/useSchemaMode";
import { isRecordNotDeployed } from "./useAssessmentSessions";
import { CHAT_MARK_COLUMNS, marksByContact, type ChatMark } from "../lib/chatMarks";

/**
 * This person's own marks on their chats: archived, and deleted from their
 * side (lib/chatMarks.ts; supabase/migrations/*_chat_archive_and_delete.sql).
 *
 * Read under RLS: only the reader's own rows come back. A change goes
 * through the one database function, set_chat_state, and nothing else: the
 * table cannot be written directly, and a delete can never be set back.
 *
 * Deleting hides the chat's messages in the database itself, so after one
 * every list that reads messages is asked again (the threads, the open chat,
 * the unread count in the side bar).
 *
 * Until the migration is applied the table and the function do not exist:
 * the list reads that as "nothing marked", and the buttons are not offered.
 */

export const chatMarkKeys = {
  marks: (uid: string | null | undefined) => ["chat-marks", uid ?? null] as const,
};

interface MarkList {
  rows: ChatMark[];
  /** False when the table is not there yet (the migration is not applied). */
  deployed: boolean;
}
const NO_MARKS: MarkList = { rows: [], deployed: true };

export type ChatAction = "archive" | "unarchive" | "delete";

export function useChatMarks(options: { enabled?: boolean } = {}) {
  const { user } = useAuth();
  const { data: mode } = useSchemaMode();
  const queryClient = useQueryClient();
  const key = chatMarkKeys.marks(user?.id);

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<MarkList> => {
      const { data, error } = await supabase.from("message_thread_state").select(CHAT_MARK_COLUMNS).limit(10_000);
      if (error) {
        if (isRecordNotDeployed(error)) return { rows: [], deployed: false };
        throw error;
      }
      return { rows: (data ?? []) as ChatMark[], deployed: true };
    },
    enabled: !!user && mode === "hireflow1" && options.enabled !== false,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const change = useMutation({
    mutationFn: async ({ contactId, action }: { contactId: string; action: ChatAction }) => {
      const { data, error } = await supabase.rpc("set_chat_state", { p_contact_id: contactId, p_action: action });
      if (error) throw error;
      return data as unknown as ChatMark | null;
    },
    onSuccess: (mark, { action }) => {
      // On the page at once; the refetch below confirms it.
      if (mark?.contact_id) {
        queryClient.setQueryData<MarkList>(key, (was) => {
          const before = was ?? NO_MARKS;
          return { ...before, rows: [...before.rows.filter((r) => r.contact_id !== mark.contact_id), mark] };
        });
      }
      if (action === "delete") {
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        void queryClient.invalidateQueries({ queryKey: ["messages"] });
        void queryClient.invalidateQueries({ queryKey: ["unread-messages-count"] });
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key, exact: true });
    },
  });

  const { mutateAsync } = change;
  /** Archive, move back or delete. Throws what the database said when it refuses. */
  const setChat = useCallback((contactId: string, action: ChatAction) => mutateAsync({ contactId, action }), [mutateAsync]);

  const data = query.data ?? NO_MARKS;
  const byContact = useMemo(() => marksByContact(data.rows), [data.rows]);
  return {
    byContact,
    /** Whether any chat was ever deleted from this side: an empty inbox is then not "nobody has written". */
    everDeleted: data.rows.some((r) => !!r.cleared_at),
    deployed: data.deployed && !query.isError,
    /** The marks have been read (or are not being asked for): the list can be trusted as sorted. */
    ready: !query.isLoading,
    setChat,
    busy: change.isPending,
  };
}
