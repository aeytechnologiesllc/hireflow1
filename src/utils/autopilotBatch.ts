import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";

export type AutopilotImpactAction = "reject" | "advance" | "defer" | "review" | "failed";

export interface AutopilotImpactApplicant {
  applicationId: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  currentPhaseId: string;
  score: number | null;
  action: AutopilotImpactAction;
  decision?: string | null;
  decisionState?: string | null;
  nextPhaseId?: string | null;
  nextPhaseTitle?: string | null;
  rationale?: string | null;
  pendingHighSignalPhases?: string[];
  hardRejectReason?: string | null;
  error?: string;
}

export interface AutopilotImpactPreview {
  jobId: string;
  previewOnly: boolean;
  passingScore: number;
  totals: {
    processed: number;
    reject: number;
    advance: number;
    defer: number;
    review: number;
    failed: number;
  };
  applicants: AutopilotImpactApplicant[];
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isAuthInvokeError = (error: unknown) => {
  if (!error) return false;

  const maybeError = error as {
    message?: string;
    context?: { status?: number };
  };

  const message = maybeError.message?.toLowerCase() ?? "";
  const status = maybeError.context?.status;

  return (
    status === 401 ||
    message.includes("401") ||
    message.includes("unauthorized") ||
    message.includes("jwt") ||
    message.includes("auth")
  );
};

async function getAccessTokenWithRetry() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.access_token) {
      return session.access_token;
    }

    await wait(250);
  }

  const { data, error } = await supabase.auth.refreshSession();

  if (error) {
    console.warn("[autopilotBatch] Session refresh failed:", error.message);
  }

  return data.session?.access_token ?? null;
}

async function invokeAutopilotBatch(jobId: string, previewOnly: boolean, accessToken: string | null) {
  try {
    const { data, error } = await supabase.functions.invoke("autopilot-batch", {
      body: JSON.stringify({
        jobId,
        previewOnly,
      }),
      headers: {
        apikey: SUPABASE_ANON_KEY,
        ...(accessToken
          ? {
              Authorization: `Bearer ${accessToken}`,
            }
          : {}),
      },
    });

    if (error) {
      return {
        data: null,
        error: {
          message: error.message || "autopilot-batch failed",
          context: {
            status: error.context?.status ?? null,
            body: error.context?.body ?? null,
          },
        },
      };
    }

    return {
      data: (data as AutopilotImpactPreview | null) ?? null,
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : "Failed to reach autopilot-batch",
        context: {
          status: null,
          body: null,
        },
      },
    };
  }
}

async function runAutopilotBatch(jobId: string, previewOnly: boolean): Promise<AutopilotImpactPreview> {
  const initialToken = await getAccessTokenWithRetry();
  let result = await invokeAutopilotBatch(jobId, previewOnly, initialToken);

  if (result.error && isAuthInvokeError(result.error)) {
    const refreshedToken = await getAccessTokenWithRetry();
    if (refreshedToken && refreshedToken !== initialToken) {
      result = await invokeAutopilotBatch(jobId, previewOnly, refreshedToken);
    }
  }

  if (result.error) {
    throw result.error;
  }

  return result.data as AutopilotImpactPreview;
}

function safeParseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function getAutopilotImpactPreview(jobId: string) {
  return runAutopilotBatch(jobId, true);
}

export function applyAutopilotCatchUp(jobId: string) {
  return runAutopilotBatch(jobId, false);
}
