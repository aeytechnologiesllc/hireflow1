import { supabase } from "@/integrations/supabase/client";

/**
 * Triggers AVA comprehensive analysis for an application in the background.
 * This function fetches all available phase data and runs ai-analyze to update ai_analysis and ai_score.
 * It's designed to be called as fire-and-forget after each phase submission.
 */
export async function triggerAvaAnalysis(applicationId: string): Promise<void> {
  try {
    console.log("[triggerAvaAnalysis] Starting analysis for application:", applicationId);
    
    // Fetch the latest application data with job and profile info
    const { data: application, error: fetchError } = await supabase
      .from("applications")
      .select(`
        *,
        jobs(title, description, requirements, skills_required, experience_level, job_type),
        profiles:candidate_id(full_name, email, skills, experience_years, bio, location)
      `)
      .eq("id", applicationId)
      .single();

    if (fetchError || !application) {
      console.error("[triggerAvaAnalysis] Failed to fetch application:", fetchError);
      return;
    }

    // Parse notes to get all phase data
    let parsedNotes: Record<string, any> = {};
    try {
      parsedNotes = application.notes ? JSON.parse(application.notes) : {};
    } catch {
      parsedNotes = {};
    }

    // Build content string from all available phase data (same logic as handleReanalyze)
    const applicationAnswersText = parsedNotes.applicationAnswers?.length > 0
      ? parsedNotes.applicationAnswers.map((a: any) => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n")
      : "Not provided";

    const profile = application.profiles as any;
    const job = application.jobs as any;

    let content = `
Job Title: ${job?.title || "Unknown"}
Job Description: ${job?.description || "Not provided"}
Requirements: ${job?.requirements || "Not specified"}
Skills Required: ${job?.skills_required?.join(", ") || "Not specified"}
Experience Level: ${job?.experience_level || "Not specified"}

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

Resume URL: ${application.resume_url || "Not provided"}
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
    if (parsedNotes.quizResult) {
      content += `
Quiz Performance:
- Score: ${parsedNotes.quizResult.score || 'N/A'}%
- Correct: ${parsedNotes.quizResult.correct || 'N/A'}/${parsedNotes.quizResult.total || 'N/A'}
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

    // Add Video Intro URL if available
    if (parsedNotes.videoIntroUrl) {
      content += `
Video Introduction: Submitted (URL: ${parsedNotes.videoIntroUrl})
`;
    }

    // Add Portfolio results if available
    if (parsedNotes.portfolioResult) {
      content += `
Portfolio Upload:
- Files: ${parsedNotes.portfolioResult.fileCount || 'N/A'} files submitted
- Score: ${parsedNotes.portfolioResult.analysis?.score || 'N/A'}
`;
    }

    console.log("[triggerAvaAnalysis] Calling ai-analyze edge function");

    // Call the AI analysis edge function
    const { data, error } = await supabase.functions.invoke("ai-analyze", {
      body: {
        type: "resume",
        content,
        resumeUrl: application.resume_url || null,
        context: {
          skills_required: job?.skills_required,
          experience_level: job?.experience_level,
          job_title: job?.title,
          job_type: job?.job_type,
        },
      },
    });

    if (error) {
      console.error("[triggerAvaAnalysis] AI analysis error:", error);
      return;
    }

    // Extract score from analysis
    const scoreMatch = data.analysis?.match(/Score[:\s]+(\d+)/i);
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;

    // Update the application with AI analysis
    const { error: updateError } = await supabase
      .from("applications")
      .update({
        ai_analysis: data.analysis,
        ai_score: score && score >= 0 && score <= 100 ? score : null,
      })
      .eq("id", applicationId);

    if (updateError) {
      console.error("[triggerAvaAnalysis] Failed to update application:", updateError);
      return;
    }

    console.log("[triggerAvaAnalysis] Analysis completed successfully for application:", applicationId);
  } catch (error) {
    console.error("[triggerAvaAnalysis] Unexpected error:", error);
  }
}
