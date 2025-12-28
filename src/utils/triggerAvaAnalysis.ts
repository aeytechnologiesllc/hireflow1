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
 * This ensures consistent scoring across all entry points (manual reanalyze, autopilot, phase completion).
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
 * Evaluates a phase submission and returns the result.
 * Used for Autopilot mode to show evaluation screen to candidates.
 * Returns the score and whether the candidate passed based on the passing score.
 */
export async function evaluatePhaseSubmission(
  applicationId: string,
  phaseScore: number,
  passingScore: number = 60
): Promise<EvaluationResult> {
  try {
    console.log("[evaluatePhaseSubmission] Evaluating application:", applicationId, "Score:", phaseScore, "Passing:", passingScore);
    
    // Run the full analysis
    await triggerAvaAnalysis(applicationId);
    
    // Fetch the updated analysis
    const { data: application, error } = await supabase
      .from("applications")
      .select("ai_analysis, ai_score")
      .eq("id", applicationId)
      .single();
    
    if (error) {
      console.error("[evaluatePhaseSubmission] Error fetching analysis:", error);
    }
    
    const passed = phaseScore >= passingScore;
    
    return {
      score: phaseScore,
      passed,
      analysis: application?.ai_analysis || null,
    };
  } catch (error) {
    console.error("[evaluatePhaseSubmission] Error:", error);
    // Return based on provided score even if analysis fails
    return {
      score: phaseScore,
      passed: phaseScore >= passingScore,
      analysis: null,
    };
  }
}
