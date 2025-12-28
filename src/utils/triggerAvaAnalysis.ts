import { supabase } from "@/integrations/supabase/client";

export interface EvaluationResult {
  score: number | null;
  passed: boolean;
  analysis: string | null;
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
    console.log("[triggerAvaAnalysis] Calling backend trigger-ava-analysis for application:", applicationId);
    
    const { data, error } = await supabase.functions.invoke("trigger-ava-analysis", {
      body: {
        applicationId,
        force: true, // Force re-analysis
      },
    });

    if (error) {
      console.error("[triggerAvaAnalysis] Backend function error:", error);
      return;
    }

    console.log("[triggerAvaAnalysis] Backend analysis completed successfully:", data);
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
    console.log("[evaluatePhaseSubmission] Triggering backend analysis for:", applicationId);
    
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
    
    console.log("[evaluatePhaseSubmission] Backend result:", { 
      backendScore, 
      passingScore, 
      passed,
      status: application?.status 
    });
    
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
