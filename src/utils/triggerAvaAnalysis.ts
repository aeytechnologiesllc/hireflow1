import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";

export interface EvaluationResult {
  score: number | null;
  passed: boolean;
  analysis: string | null;
}

export interface TriggerAvaAnalysisPayload {
  applicationId: string;
  force?: boolean;
  autopilotDecision?: boolean;
  currentPhaseId?: string | null;
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

const isNetworkInvokeError = (error: unknown) => {
  if (!error) return false;

  const maybeError = error as {
    message?: string;
    name?: string;
    context?: { status?: number };
  };

  const message = maybeError.message?.toLowerCase() ?? "";
  const status = maybeError.context?.status;

  if (typeof status === "number" && status >= 400) {
    return false;
  }

  return (
    maybeError.name === "AbortError" ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("load failed") ||
    message.includes("err_aborted") ||
    message.includes("aborted")
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
    console.warn("[triggerAvaAnalysis] Session refresh failed:", error.message);
  }

  return data.session?.access_token ?? null;
}

export async function invokeTriggerAvaAnalysis<T = Record<string, unknown>>(
  payload: TriggerAvaAnalysisPayload,
) {
  const invokeWithToken = async (accessToken: string | null) => {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/trigger-ava-analysis`, {
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          ...(accessToken
            ? {
                Authorization: `Bearer ${accessToken}`,
              }
            : {}),
        },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      const parsedBody = responseText ? safeParseJson(responseText) : null;

      if (!response.ok) {
        return {
          data: null,
          error: {
            message:
              (parsedBody &&
              typeof parsedBody === "object" &&
              "message" in parsedBody &&
              typeof parsedBody.message === "string"
                ? parsedBody.message
                : responseText) || `trigger-ava-analysis returned ${response.status}`,
            context: {
              status: response.status,
              body: parsedBody ?? responseText,
            },
          },
        };
      }

      return {
        data: (parsedBody as T | null) ?? null,
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : "Failed to reach trigger-ava-analysis",
          context: {
            status: null,
            body: null,
          },
        },
      };
    }
  };

  const initialToken = await getAccessTokenWithRetry();
  let result = await invokeWithToken(initialToken);

  if (result.error && isAuthInvokeError(result.error)) {
    const refreshedToken = await getAccessTokenWithRetry();

    if (refreshedToken && refreshedToken !== initialToken) {
      result = await invokeWithToken(refreshedToken);
    }
  }

  if (result.error && isNetworkInvokeError(result.error)) {
    await wait(350);

    const retryToken = await getAccessTokenWithRetry();
    result = await invokeWithToken(retryToken ?? initialToken);
  }

  return result;
}

function safeParseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Triggers AVA comprehensive analysis for an application by calling the backend function.
 * The backend function (trigger-ava-analysis) computes the weighted overall score:
 * - Resume Score × 0.40
 * - Quiz Score × 0.30
 * - Voice Interview Score × 0.20
 * - Portfolio Score × 0.10
 * 
 * This is the SINGLE SOURCE OF TRUTH for all scoring.
 * No front-end scoring should ever be done - all scores come from the backend.
 */
export async function triggerAvaAnalysis(applicationId: string): Promise<void> {
  try {
    const { error } = await invokeTriggerAvaAnalysis({
      applicationId,
      force: false,
    });

    if (error) {
      console.error("[triggerAvaAnalysis] Backend function error:", error);
      return;
    }

  } catch (error) {
    console.error("[triggerAvaAnalysis] Unexpected error:", error);
  }
}

/**
 * Waits for the backend to complete analysis and returns the result.
 * This does NOT calculate any scores locally - it only triggers backend analysis
 * and waits for the backend to set ai_score on the application.
 * 
 * The backend is the SINGLE SOURCE OF TRUTH for pass/fail decisions.
 */
export async function evaluatePhaseSubmission(
  applicationId: string,
  _phaseScore: number, // Ignored - backend calculates the actual score
  passingScore: number = 60
): Promise<EvaluationResult> {
  try {
    // Trigger the backend analysis
    await triggerAvaAnalysis(applicationId);
    
    // Wait a moment for the backend to complete
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Fetch the updated analysis from the backend (SINGLE SOURCE OF TRUTH)
    const { data: application, error } = await supabase
      .from("applications")
      .select("ai_analysis, ai_score, status")
      .eq("id", applicationId)
      .single();
    
    if (error) {
      console.error("[evaluatePhaseSubmission] Error fetching analysis:", error);
      // Return unknown state - let realtime subscription handle it
      return {
        score: null,
        passed: false,
        analysis: null,
      };
    }
    
    // Use the BACKEND score for pass/fail decision, not local calculation
    const backendScore = application?.ai_score;
    const passed = backendScore !== null && backendScore >= passingScore;
    
    return {
      score: backendScore,
      passed,
      analysis: application?.ai_analysis || null,
    };
  } catch (error) {
    console.error("[evaluatePhaseSubmission] Error:", error);
    // Return unknown state on error
    return {
      score: null,
      passed: false,
      analysis: null,
    };
  }
}
