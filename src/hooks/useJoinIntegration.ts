import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface JoinIntegrationStatus {
  provider: "join";
  connected: boolean;
  status: "not_connected" | "connected" | "disconnected" | "error";
  tokenPreview: string | null;
  connectedAt: string | null;
  lastValidatedAt: string | null;
  lastError: string | null;
  updatedAt: string | null;
}

const disconnectedStatus: JoinIntegrationStatus = {
  provider: "join",
  connected: false,
  status: "not_connected",
  tokenPreview: null,
  connectedAt: null,
  lastValidatedAt: null,
  lastError: null,
  updatedAt: null,
};

async function invokeJoinIntegration<TData>(
  action: "get" | "connect" | "disconnect",
  body: Record<string, unknown> = {},
): Promise<TData> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error("Your session expired. Please sign in again.");
  }

  const { data, error } = await supabase.functions.invoke("join-integration", {
    body: { action, ...body },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) throw error;
  return data as TData;
}

export function useJoinIntegration() {
  const { user, role } = useAuth();

  return useQuery({
    queryKey: ["integrations", "join", user?.id],
    queryFn: async () => invokeJoinIntegration<JoinIntegrationStatus>("get"),
    enabled: !!user && role === "employer",
    staleTime: 30000,
    retry: 1,
    placeholderData: disconnectedStatus,
  });
}

export function useSaveJoinIntegration() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (apiToken: string) => invokeJoinIntegration<JoinIntegrationStatus>("connect", { apiToken }),
    onSuccess: (data) => {
      queryClient.setQueryData(["integrations", "join", user?.id], data);
    },
  });
}

export function useDisconnectJoinIntegration() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async () => invokeJoinIntegration<JoinIntegrationStatus>("disconnect"),
    onSuccess: (data) => {
      queryClient.setQueryData(["integrations", "join", user?.id], data);
    },
  });
}
