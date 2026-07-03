import { supabase } from "@/integrations/supabase/client";

export type GoogleIndexingNotificationType = "URL_UPDATED" | "URL_DELETED";

export interface NotifyGoogleJobIndexingOptions {
  jobId: string;
  employerId?: string | null;
  notificationType: GoogleIndexingNotificationType;
  reason: string;
}

export async function notifyGoogleJobIndexing({
  jobId,
  employerId,
  notificationType,
  reason,
}: NotifyGoogleJobIndexingOptions): Promise<void> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return;

  const { error } = await supabase.functions.invoke("google-indexing", {
    body: { jobId, employerId, notificationType, reason },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) throw error;
}

export function notifyGoogleJobIndexingInBackground(options: NotifyGoogleJobIndexingOptions) {
  notifyGoogleJobIndexing(options).catch((error) => {
    console.warn("[google-indexing] background notification failed", error);
  });
}
