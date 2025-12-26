import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Resume detection utilities (inline since we can't import from src)
const RESUME_KEYWORDS = ['resume', 'cv', 'curriculum vitae', 'curriculum', 'résumé'];

function isFileUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const filePatterns = ['/storage/v1/object/', '/resumes/', '/documents/', '.pdf', '.doc', '.docx'];
  const lowerUrl = url.toLowerCase();
  return filePatterns.some(pattern => lowerUrl.includes(pattern));
}

function isResumeQuestion(questionText: string): boolean {
  if (!questionText || typeof questionText !== 'string') return false;
  const lowerQuestion = questionText.toLowerCase();
  return RESUME_KEYWORDS.some(keyword => lowerQuestion.includes(keyword));
}

function detectResumeUrl(
  resumeUrlField: string | null | undefined,
  parsedNotes: Record<string, any> | null | undefined
): string | null {
  // Priority 1: Use canonical resume_url field if it exists
  if (resumeUrlField && typeof resumeUrlField === 'string' && resumeUrlField.trim()) {
    console.log('[detectResumeUrl] Using canonical resume_url field:', resumeUrlField);
    return resumeUrlField.trim();
  }

  // Priority 2: Look for resume in applicationAnswers
  const answers = parsedNotes?.applicationAnswers;
  if (!answers || !Array.isArray(answers)) {
    console.log('[detectResumeUrl] No applicationAnswers found');
    return null;
  }

  // First pass: Look for answers that are file URLs AND have resume-related question text
  for (const answer of answers) {
    if (isFileUrl(answer.answer) && isResumeQuestion(answer.question)) {
      console.log('[detectResumeUrl] Found resume in applicationAnswers (resume question):', answer.answer);
      return answer.answer;
    }
  }

  // Second pass: If only one file URL exists, treat it as the resume
  const fileUrlAnswers = answers.filter((a: any) => isFileUrl(a.answer));
  if (fileUrlAnswers.length === 1) {
    console.log('[detectResumeUrl] Found single file upload, treating as resume:', fileUrlAnswers[0].answer);
    return fileUrlAnswers[0].answer;
  }

  // Third pass: Look for any answer that is a URL containing /resumes/ bucket
  for (const answer of answers) {
    if (answer.answer && typeof answer.answer === 'string' && 
        answer.answer.toLowerCase().includes('/resumes/')) {
      console.log('[detectResumeUrl] Found file in resumes bucket:', answer.answer);
      return answer.answer;
    }
  }

  console.log('[detectResumeUrl] No resume URL found');
  return null;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { applicationId, force = false, autopilotDecision = false, currentPhaseId = null } = await req.json();
    
    if (!applicationId) {
      return new Response(
        JSON.stringify({ error: "applicationId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[trigger-ava-analysis] Starting analysis for application:", applicationId, "force:", force, "autopilotDecision:", autopilotDecision, "currentPhaseId:", currentPhaseId);

    // Create admin client to bypass RLS
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch application data with all job fields needed for autopilot decision
    const { data: application, error: fetchError } = await supabaseAdmin
      .from("applications")
      .select(`
        *,
        jobs(title, description, requirements, skills_required, experience_level, job_type, workflow_steps, passing_score, processing_mode, quiz_questions)
      `)
      .eq("id", applicationId)
      .single();

    if (fetchError || !application) {
      console.error("[trigger-ava-analysis] Failed to fetch application:", fetchError);
      return new Response(
        JSON.stringify({ error: "Application not found", details: fetchError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch profile separately using candidate_id
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email, skills, experience_years, bio, location")
      .eq("user_id", application.candidate_id)
      .single();

    if (profileError) {
      console.log("[trigger-ava-analysis] Could not fetch profile (non-fatal):", profileError.message);
    }

    // Parse notes to get all phase data
    let parsedNotes: Record<string, any> = {};
    try {
      parsedNotes = application.notes ? JSON.parse(application.notes) : {};
    } catch {
      parsedNotes = {};
    }

    // Log what data we have for debugging
    console.log("[trigger-ava-analysis] Data inventory:", {
      hasResumeUrl: !!application.resume_url,
      hasApplicationAnswers: !!parsedNotes.applicationAnswers?.length,
      hasCoverLetter: !!application.cover_letter,
      hasTypingTest: !!parsedNotes.typingTestResult,
      hasQuiz: !!(parsedNotes.quizResult || parsedNotes.quiz),
      hasChatSimulation: !!parsedNotes.chatSimulationResult,
      hasChatInterview: !!parsedNotes.chatInterviewResult,
      hasSalesSimulation: !!parsedNotes.salesSimulationResult,
      hasVideoIntro: !!parsedNotes.videoIntroUrl,
      hasPortfolio: !!parsedNotes.portfolioResult,
      hasVoiceInterview: !!application.voice_interview_result,
      existingAiAnalysis: !!application.ai_analysis,
      existingAiScore: application.ai_score,
    });

    // Detect resume URL from canonical field OR application answers
    const detectedResumeUrl = detectResumeUrl(application.resume_url, parsedNotes);
    console.log("[trigger-ava-analysis] Detected resume URL:", detectedResumeUrl);

    // Build content string from all available phase data
    const applicationAnswersText = parsedNotes.applicationAnswers?.length > 0
      ? parsedNotes.applicationAnswers.map((a: any) => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n")
      : "Not provided";

    const job = application.jobs as any;
    
    // Extract workflow phases from job to inform AI what phases exist for this job
    const workflowSteps = (job?.workflow_steps as any[]) || [];
    const workflowPhaseTypes = workflowSteps.map((step: any) => step.type).filter(Boolean);

    let content = `
Job Title: ${job?.title || "Unknown"}
Job Description: ${job?.description || "Not provided"}
Requirements: ${job?.requirements || "Not specified"}
Skills Required: ${job?.skills_required?.join(", ") || "Not specified"}
Experience Level: ${job?.experience_level || "Not specified"}

=== JOB WORKFLOW PHASES (ONLY analyze these phases) ===
${workflowPhaseTypes.length > 0 ? workflowPhaseTypes.map((p: string) => `- ${p}`).join("\n") : "- application_form (standard application only)"}

CRITICAL INSTRUCTION: In your PHASE PERFORMANCE SUMMARY, you must ONLY include phases that are listed above. Do NOT mention phases that were NOT part of this job's workflow. For example, if there is no "typing_test" in the workflow above, do NOT say "Typing Test: Not Completed" - simply omit it entirely.

Candidate Information:
Name: ${profile?.full_name || "Unknown"}
Email: ${profile?.email || "Not provided"}
Skills: ${profile?.skills?.join(", ") || "Not specified"}
Experience Years: ${profile?.experience_years || "Not specified"}
Bio: ${profile?.bio || "Not provided"}
Location: ${profile?.location || "Not specified"}

Application Answers:
${applicationAnswersText}

Cover Letter:
${application.cover_letter || "Not provided"}

Resume URL: ${detectedResumeUrl || "Not provided"}
`;

    // Add Typing Test results if available
    if (parsedNotes.typingTestResult) {
      content += `
Typing Test Results:
- Speed: ${parsedNotes.typingTestResult.wpm} WPM
- Accuracy: ${parsedNotes.typingTestResult.accuracy}%
- Score: ${parsedNotes.typingTestResult.score || 'N/A'}
`;
    }

    // Add Quiz answers if available
    const quizData = parsedNotes.quizResult || parsedNotes.quiz;
    if (quizData) {
      content += `
Quiz Performance:
- Score: ${quizData.score || quizData.percentage || 'N/A'}%
- Correct: ${quizData.correct || 'N/A'}/${quizData.total || 'N/A'}
- Passed: ${quizData.passed ? 'Yes' : 'No'}
`;
    }

    // Add Chat Simulation results if available
    if (parsedNotes.chatSimulationResult) {
      content += `
Chat Simulation (Customer Support) Results:
- Score: ${parsedNotes.chatSimulationResult.score || 'N/A'}/100
- Empathy: ${parsedNotes.chatSimulationResult.empathy || 'N/A'}%
- Problem Solving: ${parsedNotes.chatSimulationResult.problemSolving || 'N/A'}%
`;
    }

    // Add Chat Interview results if available  
    if (parsedNotes.chatInterviewResult) {
      content += `
Interview Results:
- Overall Score: ${parsedNotes.chatInterviewResult.score || 'N/A'}/100
- Recommendation: ${parsedNotes.chatInterviewResult.recommendation || 'N/A'}
`;
    }

    // Add Sales Simulation results if available
    if (parsedNotes.salesSimulationResult) {
      content += `
Sales Simulation Results:
- Score: ${parsedNotes.salesSimulationResult.score || 'N/A'}/100
- Discovery: ${parsedNotes.salesSimulationResult.discovery || 'N/A'}%
- Objection Handling: ${parsedNotes.salesSimulationResult.objectionHandling || 'N/A'}%
- Would Buy: ${parsedNotes.salesSimulationResult.wouldBuy || 'N/A'}
`;
    }

    // Add Video Intro if available
    if (parsedNotes.videoIntroUrl) {
      content += `
Video Introduction: Submitted (demonstrates candidate effort and initiative)
`;
    }

    // Add Portfolio results if available
    if (parsedNotes.portfolioResult) {
      const analysis = parsedNotes.portfolioResult.aiAnalysis || parsedNotes.portfolioResult.analysis;
      content += `
Portfolio Upload:
- Files: ${parsedNotes.portfolioResult.files?.length || parsedNotes.portfolioResult.fileCount || 'N/A'} files submitted
- Score: ${analysis?.score || parsedNotes.portfolioResult.score || 'N/A'}/100
- Relevance: ${analysis?.relevance?.score || 'N/A'}%
- Quality: ${analysis?.quality?.score || 'N/A'}%
- Summary: ${analysis?.summary || 'Not analyzed'}
- Strengths: ${analysis?.strengths?.join(', ') || 'None identified'}
- Areas for Improvement: ${analysis?.areasForImprovement?.join(', ') || 'None identified'}
`;
    }

    // Add Voice Interview results if available
    if (application.voice_interview_result) {
      const vr = application.voice_interview_result as any;
      const interviewType = application.voice_interview_video_enabled !== false ? 'Video' : 'Voice';
      content += `
${interviewType} Interview with AVA Results:
- Overall Score: ${vr.overall_score || 'N/A'}/100
- Recommendation: ${vr.recommendation || 'N/A'}
- Technical Score: ${vr.technical_score || 'N/A'}/100
- Communication Score: ${vr.communication_score || 'N/A'}/100
- Culture Fit Score: ${vr.culture_fit_score || 'N/A'}/100
- Credibility Rating: ${vr.credibility_rating || 'N/A'}
- Summary: ${vr.summary || 'Not provided'}
- Concerns: ${vr.concerns?.join(', ') || 'None noted'}
`;
    }

    console.log("[trigger-ava-analysis] Calling ai-analyze edge function");

    // Call the AI analysis edge function using the admin client
    const { data: analysisData, error: analysisError } = await supabaseAdmin.functions.invoke("ai-analyze", {
      body: {
        type: "resume",
        content,
        resumeUrl: detectedResumeUrl,
        context: {
          skills_required: job?.skills_required,
          experience_level: job?.experience_level,
          job_title: job?.title,
          job_type: job?.job_type,
        },
      },
    });

    if (analysisError) {
      console.error("[trigger-ava-analysis] AI analysis error:", analysisError);
      return new Response(
        JSON.stringify({ error: "AI analysis failed", details: analysisError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[trigger-ava-analysis] AI analysis completed, extracting score...");

    // Improved score extraction with multiple patterns
    const analysisText = analysisData?.analysis || "";
    let newScore: number | null = null;
    
    // Pattern 1: FINAL CALCULATED SCORE (preferred)
    const finalScoreMatch = analysisText.match(/FINAL CALCULATED SCORE[:\s]+(\d+)/i);
    if (finalScoreMatch) {
      newScore = parseInt(finalScoreMatch[1], 10);
      console.log("[trigger-ava-analysis] Score extracted via FINAL CALCULATED SCORE:", newScore);
    }
    
    // Pattern 2: Overall Score
    if (newScore === null) {
      const overallMatch = analysisText.match(/Overall Score[:\s]+(\d+)/i);
      if (overallMatch) {
        newScore = parseInt(overallMatch[1], 10);
        console.log("[trigger-ava-analysis] Score extracted via Overall Score:", newScore);
      }
    }
    
    // Pattern 3: Generic "Score: XX" at end of line
    if (newScore === null) {
      const genericMatch = analysisText.match(/Score[:\s]+(\d+)(?:\s*\/\s*100|\s*$)/im);
      if (genericMatch) {
        newScore = parseInt(genericMatch[1], 10);
        console.log("[trigger-ava-analysis] Score extracted via generic pattern:", newScore);
      }
    }
    
    // Validate score range
    if (newScore !== null && (newScore < 0 || newScore > 100)) {
      console.log("[trigger-ava-analysis] Invalid score range, discarding:", newScore);
      newScore = null;
    }

    // Determine final score based on force flag
    const existingScore = application.ai_score;
    let finalScore: number | null;
    
    if (force) {
      // Force mode: always use the new score (even if null)
      finalScore = newScore;
      console.log("[trigger-ava-analysis] Force mode: using new score:", finalScore);
    } else {
      // Normal mode: preserve existing score if present
      finalScore = existingScore ?? newScore;
      console.log("[trigger-ava-analysis] Normal mode: existing:", existingScore, "new:", newScore, "final:", finalScore);
    }

    // Update the application with AI analysis using admin client (bypasses RLS)
    const { error: updateError } = await supabaseAdmin
      .from("applications")
      .update({
        ai_analysis: analysisData?.analysis || null,
        ai_score: finalScore && finalScore >= 0 && finalScore <= 100 ? finalScore : null,
      })
      .eq("id", applicationId);

    if (updateError) {
      console.error("[trigger-ava-analysis] Failed to update application:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to save analysis", details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[trigger-ava-analysis] Analysis completed successfully for application:", applicationId, "score:", finalScore);

    // Handle autopilot decision if requested
    if (autopilotDecision) {
      const passingScore = (job?.passing_score as number) || 60;
      const quizQuestions = job?.quiz_questions as any[] | undefined;
      const hasQuizQuestions = Array.isArray(quizQuestions) && quizQuestions.length > 0;
      const workflowSteps = (job?.workflow_steps as any[]) || [];
      
      console.log("[trigger-ava-analysis] Autopilot decision: score=", finalScore, "passingScore=", passingScore, "hasQuizQuestions=", hasQuizQuestions);
      
      if (finalScore !== null && finalScore >= passingScore) {
        // PASSED - determine next phase and advance
        let nextPhaseId = "application";
        let nextPhaseTitle = "Application";
        
        if (currentPhaseId === "application") {
          if (hasQuizQuestions) {
            nextPhaseId = "quiz";
            nextPhaseTitle = "Quiz";
          } else if (workflowSteps.length > 0) {
            // Skip voice_interview step, it goes after review
            const nonVoiceSteps = workflowSteps.filter((s: any) => s.type !== 'voice_interview');
            if (nonVoiceSteps.length > 0) {
              nextPhaseId = nonVoiceSteps[0].id;
              nextPhaseTitle = nonVoiceSteps[0].title || nonVoiceSteps[0].type;
            }
          }
        }
        
        console.log("[trigger-ava-analysis] Autopilot PASSED: advancing to phase:", nextPhaseId);
        
        const { error: advanceError } = await supabaseAdmin
          .from("applications")
          .update({
            phase: nextPhaseId,
            status: "reviewing",
          })
          .eq("id", applicationId);
        
        if (advanceError) {
          console.error("[trigger-ava-analysis] Failed to advance phase:", advanceError);
        }
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Analysis completed, candidate advanced",
            score: finalScore,
            decision: "advanced",
            nextPhaseId,
            nextPhaseTitle,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        // FAILED - reject the application
        const rejectReason = `Overall Ava score of ${finalScore || 0}% is below the passing threshold of ${passingScore}%.`;
        
        console.log("[trigger-ava-analysis] Autopilot FAILED: rejecting application, score=", finalScore);
        
        const { error: rejectError } = await supabaseAdmin
          .from("applications")
          .update({
            status: "rejected",
            rejected_by_type: "ava",
            phase_ai_analysis: rejectReason,
          })
          .eq("id", applicationId);
        
        if (rejectError) {
          console.error("[trigger-ava-analysis] Failed to reject application:", rejectError);
        }
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Analysis completed, candidate rejected",
            score: finalScore,
            decision: "rejected",
            reason: rejectReason,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Analysis completed and saved",
        score: finalScore,
        forced: force,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[trigger-ava-analysis] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Unexpected error", details: error instanceof Error ? error.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
