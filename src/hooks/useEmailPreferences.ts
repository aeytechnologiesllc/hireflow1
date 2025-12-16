import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface EmailPreferences {
  email_notifications_enabled: boolean;
  email_new_applications: boolean;
  email_messages: boolean;
  email_interview_reminders: boolean;
  email_document_updates: boolean;
  email_phase_updates: boolean;
}

export function useEmailPreferences() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["emailPreferences", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("email_notifications_enabled, email_new_applications, email_messages, email_interview_reminders, email_document_updates, email_phase_updates")
        .eq("user_id", user!.id)
        .single();

      if (error) throw error;
      return data as EmailPreferences;
    },
    enabled: !!user,
  });
}

export function useUpdateEmailPreferences() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (updates: Partial<EmailPreferences>) => {
      const { data, error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("user_id", user!.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emailPreferences", user?.id] });
    },
  });
}

// Helper function to send notification emails
export async function sendNotificationEmail(
  type: string,
  recipientUserId: string,
  data: Record<string, string | undefined>
) {
  try {
    const { error } = await supabase.functions.invoke("send-notification-email", {
      body: {
        type,
        recipient_user_id: recipientUserId,
        data,
      },
    });

    if (error) {
      console.error("Failed to send notification email:", error);
    }
  } catch (err) {
    console.error("Error invoking send-notification-email:", err);
  }
}
