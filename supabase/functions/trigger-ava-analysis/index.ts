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
  // Priority 1: Use canonical resume_url field if it exists (ALWAYS prefer this)
  if (resumeUrlField && typeof resumeUrlField === 'string' && resumeUrlField.trim()) {
    console.log('[detectResumeUrl] Using canonical resume_url field:', resumeUrlField);
    return resumeUrlField.trim();
  }

  // Priority 2: Look for resume in applicationAnswers (ONLY if question is resume-related)
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

  // Second pass: Look for any answer that is a URL containing /resumes/ bucket
  // This is safe because the /resumes/ bucket is specifically for resumes
  for (const answer of answers) {
    if (answer.answer && typeof answer.answer === 'string' && 
        answer.answer.toLowerCase().includes('/resumes/')) {
      console.log('[detectResumeUrl] Found file in resumes bucket:', answer.answer);
      return answer.answer;
    }
  }

  // REMOVED: The fallback that treats any single file as a resume
  // This was causing internet speed screenshots to be treated as resumes
  console.log('[detectResumeUrl] No resume URL found (strict mode - ignoring non-resume file uploads)');
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
        jobs(title, description, requirements, skills_required, experience_level, job_type, workflow_steps, passing_score, processing_mode, quiz_questions, employer_id)
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

    // ========== AI ANALYSES LIMIT CHECK ==========
    const employerId = (application.jobs as any)?.employer_id;
    if (employerId) {
      // Get employer's subscription
      const { data: subscription } = await supabaseAdmin
        .from("subscriptions")
        .select("plan_type, status")
        .eq("user_id", employerId)
        .maybeSingle();

      // Get plan limits
      const planType = subscription?.plan_type || 'trial';
      const aiAnalysesLimits: Record<string, number> = {
        trial: 15,
        growth: 100,
        business: -1, // unlimited
        enterprise: -1, // unlimited
      };
      const aiLimit = aiAnalysesLimits[planType] ?? 15;

      // Only check if there's a limit (not unlimited)
      if (aiLimit !== -1) {
        // Count existing AI analyses for this employer's applications
        const { data: employerJobs } = await supabaseAdmin
          .from("jobs")
          .select("id")
          .eq("employer_id", employerId);

        const jobIds = (employerJobs || []).map((j: any) => j.id);

        if (jobIds.length > 0) {
          const { count: analysisCount } = await supabaseAdmin
            .from("applications")
            .select("*", { count: "exact", head: true })
            .in("job_id", jobIds)
            .not("ai_score", "is", null);

          const currentCount = analysisCount || 0;

          if (currentCount >= aiLimit) {
            console.log(`[trigger-ava-analysis] AI analysis limit reached for employer ${employerId}: ${currentCount}/${aiLimit}`);
            return new Response(
              JSON.stringify({ 
                error: "AI analysis limit reached", 
                message: `You've reached your AI analysis limit (${currentCount}/${aiLimit}). Upgrade your plan for more analyses.`,
                limitReached: true 
              }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          console.log(`[trigger-ava-analysis] AI analysis count: ${currentCount}/${aiLimit}`);
        }
      }
    }
    // ========== END LIMIT CHECK ==========

    // RACE CONDITION FIX: Skip if application was already rejected (unless force=true for reconsider)
    if (application.status === "rejected" && !force) {
      console.log("[trigger-ava-analysis] Application already rejected, skipping duplicate analysis");
      return new Response(
        JSON.stringify({ success: true, message: "Application already rejected", skipped: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // RACE CONDITION FIX: Skip if analysis was just completed recently (within 10 seconds)
    // BUT: Allow re-analysis if NEW phase data exists that wasn't previously analyzed
    if (!force && application.ai_analysis && application.ai_score !== null) {
      const lastUpdated = new Date(application.updated_at).getTime();
      const now = Date.now();
      
      // Parse notes to detect what phases have data BEFORE the general parsing below
      let tempNotes: Record<string, any> = {};
      try {
        tempNotes = application.notes ? JSON.parse(application.notes) : {};
      } catch { tempNotes = {}; }
      
      // Check if there's NEW phase data that might not be in the current analysis
      const hasQuizData = !!(tempNotes.quizResult || tempNotes.quiz);
      const hasVoiceData = !!application.voice_interview_result;
      const hasSalesData = !!tempNotes.salesSimulationResult;
      const hasChatSimData = !!tempNotes.chatSimulationResult;
      const hasChatIntData = !!tempNotes.chatInterviewResult;
      const hasTypingData = !!tempNotes.typingTestResult;
      const hasPortfolioData = !!tempNotes.portfolioResult;
      
      // Check what the existing analysis already covers
      const analysisText = application.ai_analysis || "";
      const analysisIncludesQuiz = analysisText.includes("Quiz Performance") || analysisText.includes("quiz score");
      const analysisIncludesVoice = analysisText.includes("Voice Interview") || analysisText.includes("voice interview");
      const analysisIncludesSales = analysisText.includes("Sales Simulation");
      const analysisIncludesChatSim = analysisText.includes("Chat Simulation");
      const analysisIncludesChatInt = analysisText.includes("Chat Interview");
      const analysisIncludesTyping = analysisText.includes("Typing Test");
      const analysisIncludesPortfolio = analysisText.includes("Portfolio");
      
      const hasNewData = (hasQuizData && !analysisIncludesQuiz) || 
                         (hasVoiceData && !analysisIncludesVoice) ||
                         (hasSalesData && !analysisIncludesSales) ||
                         (hasChatSimData && !analysisIncludesChatSim) ||
                         (hasChatIntData && !analysisIncludesChatInt) ||
                         (hasTypingData && !analysisIncludesTyping) ||
                         (hasPortfolioData && !analysisIncludesPortfolio);
      
      if (now - lastUpdated < 10000 && !hasNewData) {
        console.log("[trigger-ava-analysis] Analysis was just completed, no new phase data, skipping");
        return new Response(
          JSON.stringify({ success: true, message: "Analysis already present", skipped: true, score: application.ai_score }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (hasNewData) {
        console.log("[trigger-ava-analysis] New phase data detected, re-analyzing:", { 
          hasQuizData, analysisIncludesQuiz, 
          hasVoiceData, analysisIncludesVoice,
          hasSalesData, analysisIncludesSales,
          hasChatSimData, analysisIncludesChatSim,
          hasChatIntData, analysisIncludesChatInt,
          hasTypingData, analysisIncludesTyping,
          hasPortfolioData, analysisIncludesPortfolio
        });
      }
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
    const applicationAnswers = parsedNotes.applicationAnswers || [];
    
    // CRITICAL FIX: Separate resume answers from custom file uploads
    // This prevents AVA from confusing internet speed screenshots with resumes
    const resumeAnswers: any[] = [];
    const customFileAnswers: any[] = [];
    const textAnswers: any[] = [];
    
    for (const a of applicationAnswers) {
      if (isFileUrl(a.answer)) {
        if (isResumeQuestion(a.question)) {
          resumeAnswers.push(a);
        } else {
          customFileAnswers.push(a);
        }
      } else {
        textAnswers.push(a);
      }
    }
    
    // Format text answers normally
    const textAnswersText = textAnswers.length > 0
      ? textAnswers.map((a: any) => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n")
      : "Not provided";
    
    // Format custom file uploads with clear context so AVA doesn't analyze them as resumes
    const customFilesText = customFileAnswers.length > 0
      ? `\n\n=== CUSTOM FILE UPLOADS (NOT RESUMES - DO NOT ANALYZE AS RESUMES) ===
These are supplementary files uploaded for specific questions. Evaluate them based on their stated purpose only.
${customFileAnswers.map((a: any) => 
  `Question: "${a.question}"
File URL: ${a.answer}
Purpose: This is a supplementary document for the above question. It is NOT a resume.`
).join("\n\n")}`
      : "";

    const job = application.jobs as any;
    
    // Extract workflow phases from job to inform AI what phases exist for this job
    const workflowSteps = (job?.workflow_steps as any[]) || [];
    const workflowPhaseTypes = workflowSteps.map((step: any) => step.type).filter(Boolean);

    // CRITICAL FIX: Extract candidate info from APPLICATION ANSWERS, not profile
    // Profile email is the LOGIN email, which may differ from the application email
    // We should cross-reference resume against what the candidate PROVIDED in their application
    const extractFromApplicationAnswers = (keywords: string[]): string | null => {
      for (const answer of applicationAnswers) {
        const q = (answer.question || "").toLowerCase();
        if (keywords.some(kw => q.includes(kw))) {
          return answer.answer || null;
        }
      }
      return null;
    };

    // Extract candidate-provided info from application (this is what should match the resume)
    const applicationEmail = extractFromApplicationAnswers(["email", "e-mail"]);
    const applicationName = extractFromApplicationAnswers(["full name", "your name", "name"]);
    const applicationPhone = extractFromApplicationAnswers(["phone", "mobile", "contact number"]);

    console.log("[trigger-ava-analysis] Candidate info sources:", {
      applicationEmail,
      applicationName,
      applicationPhone,
      profileEmail: profile?.email,
      profileName: profile?.full_name,
    });

    // Use application-provided name/email for cross-reference (the candidate's stated identity)
    // Fall back to profile only if not provided in application
    const candidateName = applicationName || profile?.full_name || "Unknown";
    const candidateEmail = applicationEmail || "Not provided in application";

    let content = `
Job Title: ${job?.title || "Unknown"}
Job Description: ${job?.description || "Not provided"}
Requirements: ${job?.requirements || "Not specified"}
Skills Required: ${job?.skills_required?.join(", ") || "Not specified"}
Experience Level: ${job?.experience_level || "Not specified"}

=== JOB WORKFLOW PHASES (ONLY analyze these phases) ===
${workflowPhaseTypes.length > 0 ? workflowPhaseTypes.map((p: string) => `- ${p}`).join("\n") : "- application_form (standard application only)"}

CRITICAL INSTRUCTION: In your PHASE PERFORMANCE SUMMARY, you must ONLY include phases that are listed above. Do NOT mention phases that were NOT part of this job's workflow. For example, if there is no "typing_test" in the workflow above, do NOT say "Typing Test: Not Completed" - simply omit it entirely.

=== CANDIDATE INFORMATION (from Application Form) ===
Candidate Name (as provided in application): ${candidateName}
Candidate Email (as provided in application): ${candidateEmail}
${applicationPhone ? `Candidate Phone (as provided in application): ${applicationPhone}` : ""}

IMPORTANT FOR CROSS-REFERENCE: Compare resume contact info against the ABOVE application-provided values.
The account login email (${profile?.email || "unknown"}) may differ from the application email - this is NORMAL and should NOT be flagged as a mismatch.
Only flag as a "name mismatch" if the resume name differs from "${candidateName}" above.
Only flag as an "email mismatch" if the resume email differs from "${candidateEmail}" above.

=== PROFILE METADATA (for context only, NOT for cross-reference) ===
Account Email: ${profile?.email || "Not provided"} (NOTE: This is the login email, may differ from application email - do NOT use for mismatch detection)
Skills: ${profile?.skills?.join(", ") || "Not specified"}
Experience Years: ${profile?.experience_years || "Not specified"}
Bio: ${profile?.bio || "Not provided"}
Location: ${profile?.location || "Not specified"}

Application Answers (Text Responses Only):
${textAnswersText}
${customFilesText}

Cover Letter:
${application.cover_letter || "Not provided"}

=== RESUME (ONLY THIS IS THE CANDIDATE'S RESUME) ===
Resume URL: ${detectedResumeUrl || "Not provided"}
NOTE: Only the file above is the resume. Any files in "CUSTOM FILE UPLOADS" section are NOT resumes.
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

    // PDF-to-Image Conversion: Use pre-converted resume images (PRIMARY method)
    // The frontend converts PDFs to PNGs at upload time and stores URLs in notes.resumeImageUrls
    let resumeImageBase64: string | null = null;
    let resumeImageMimeType = "image/png";
    
    // PRIORITY 1: Use pre-converted resume images from frontend (these are real PNGs)
    if (parsedNotes.resumeImageUrls && Array.isArray(parsedNotes.resumeImageUrls) && parsedNotes.resumeImageUrls.length > 0) {
      console.log("[trigger-ava-analysis] Using pre-converted resume images from frontend:", parsedNotes.resumeImageUrls.length, "pages");
      
      try {
        // Fetch the first image (already a real PNG from client-side conversion)
        const firstImageUrl = parsedNotes.resumeImageUrls[0];
        const imageResponse = await fetch(firstImageUrl);
        
        if (imageResponse.ok) {
          const contentType = imageResponse.headers.get("content-type") || "image/png";
          const arrayBuffer = await imageResponse.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          
          let binaryString = "";
          for (let i = 0; i < uint8Array.length; i++) {
            binaryString += String.fromCharCode(uint8Array[i]);
          }
          resumeImageBase64 = btoa(binaryString);
          resumeImageMimeType = contentType.includes("image") ? contentType : "image/png";
          
          console.log("[trigger-ava-analysis] Loaded pre-converted resume image, size:", resumeImageBase64.length, "mime:", resumeImageMimeType);
        } else {
          console.error("[trigger-ava-analysis] Failed to fetch pre-converted resume image:", imageResponse.status);
        }
      } catch (fetchError) {
        console.error("[trigger-ava-analysis] Error fetching pre-converted resume image:", fetchError);
      }
    }
    
    // PRIORITY 2: Check for fileUploads (ONLY resume-related question uploads)
    // CRITICAL FIX: Only use fileUploads if the question is resume-related
    if (!resumeImageBase64 && parsedNotes.fileUploads) {
      const answers = parsedNotes.applicationAnswers || [];
      
      for (const questionId of Object.keys(parsedNotes.fileUploads)) {
        // Find the corresponding question to check if it's resume-related
        const matchingAnswer = answers.find((a: any) => 
          a.questionId === questionId || a.id === questionId
        );
        
        // Only use this file if the question is resume-related
        const questionText = matchingAnswer?.question || "";
        if (!isResumeQuestion(questionText)) {
          console.log("[trigger-ava-analysis] Skipping non-resume fileUpload for question:", questionId, "question:", questionText);
          continue;
        }
        
        const upload = parsedNotes.fileUploads[questionId];
        if (upload.imageUrls && Array.isArray(upload.imageUrls) && upload.imageUrls.length > 0) {
          console.log("[trigger-ava-analysis] Found resume image in fileUploads for resume question:", questionId);
          
          try {
            const imageResponse = await fetch(upload.imageUrls[0]);
            
            if (imageResponse.ok) {
              const arrayBuffer = await imageResponse.arrayBuffer();
              const uint8Array = new Uint8Array(arrayBuffer);
              
              let binaryString = "";
              for (let i = 0; i < uint8Array.length; i++) {
                binaryString += String.fromCharCode(uint8Array[i]);
              }
              resumeImageBase64 = btoa(binaryString);
              console.log("[trigger-ava-analysis] Loaded resume image from fileUploads, size:", resumeImageBase64.length);
              break; // Use first found
            }
          } catch (fetchError) {
            console.error("[trigger-ava-analysis] Error fetching fileUpload image:", fetchError);
          }
        }
      }
    }
    
    // If no pre-converted images available, log it - we do NOT fall back to sending PDF bytes as PNG
    if (!resumeImageBase64) {
      console.log("[trigger-ava-analysis] No pre-converted resume images available. Proceeding without resume vision analysis.");
    }

    // Call the AI analysis edge function using the admin client
    // CRITICAL: Pass resumeImage so Ava can actually SEE the resume
    const { data: analysisData, error: analysisError } = await supabaseAdmin.functions.invoke("ai-analyze", {
      body: {
        type: "resume",
        content,
        resumeUrl: detectedResumeUrl,
        resumeImage: resumeImageBase64, // PRIMARY: Vision-based resume analysis
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

    // Improved score extraction with multiple patterns - supports decimal scores
    const analysisText = analysisData?.analysis || "";
    let newScore: number | null = null;
    
    // Pattern 1: FINAL CALCULATED SCORE (preferred) - supports decimals
    const finalScoreMatch = analysisText.match(/FINAL CALCULATED SCORE[:\s]+(\d+(?:\.\d+)?)/i);
    if (finalScoreMatch) {
      newScore = parseFloat(finalScoreMatch[1]);
      console.log("[trigger-ava-analysis] Score extracted via FINAL CALCULATED SCORE:", newScore);
    }
    
    // Pattern 2: Overall Score - supports decimals
    if (newScore === null) {
      const overallMatch = analysisText.match(/Overall Score[:\s]+(\d+(?:\.\d+)?)/i);
      if (overallMatch) {
        newScore = parseFloat(overallMatch[1]);
        console.log("[trigger-ava-analysis] Score extracted via Overall Score:", newScore);
      }
    }
    
    // Pattern 3: Generic "Score: XX" at end of line - supports decimals
    if (newScore === null) {
      const genericMatch = analysisText.match(/Score[:\s]+(\d+(?:\.\d+)?)(?:\s*\/\s*100|\s*$)/im);
      if (genericMatch) {
        newScore = parseFloat(genericMatch[1]);
        console.log("[trigger-ava-analysis] Score extracted via generic pattern:", newScore);
      }
    }
    
    // Validate score range
    if (newScore !== null && (newScore < 0 || newScore > 100)) {
      console.log("[trigger-ava-analysis] Invalid score range, discarding:", newScore);
      newScore = null;
    }

    // Check if AI reported resume as unavailable - don't set resume_score in that case
    const resumeUnavailable = analysisText.includes("RESUME_UNAVAILABLE") || 
      analysisText.includes("Resume file could not be") ||
      analysisText.includes("couldn't analyze the resume") ||
      analysisText.includes("No resume was provided") ||
      analysisText.includes("resume could not be processed");
    
    if (resumeUnavailable) {
      console.log("[trigger-ava-analysis] Resume was unavailable/couldn't be processed - setting resume_score to null");
    }

    // WEIGHTED SCORE CALCULATION: Combine resume score with phase performance
    // This ensures quiz/assessment performance compensates for resume weaknesses
    // Reuse quizData from line 243 (already defined above)
    const quizScore = quizData?.score || quizData?.percentage || null;
    const typingTest = parsedNotes.typingTestResult;
    const voiceResult = application.voice_interview_result as any;
    const portfolioResult = parsedNotes.portfolioResult;
    
    let finalScore: number | null = newScore;
    
    // If we have phase performance data, calculate a weighted score
    if (newScore !== null) {
      let weightedTotal = newScore * 0.4; // Resume counts for 40%
      let weightSum = 0.4;
      
      // Quiz performance (30% weight if available)
      if (quizScore !== null && typeof quizScore === 'number') {
        weightedTotal += quizScore * 0.3;
        weightSum += 0.3;
        console.log("[trigger-ava-analysis] Including quiz score in weighted calculation:", quizScore);
      }
      
      // Voice interview (20% weight if available)
      if (voiceResult?.overall_score) {
        weightedTotal += voiceResult.overall_score * 0.2;
        weightSum += 0.2;
        console.log("[trigger-ava-analysis] Including voice interview score:", voiceResult.overall_score);
      }
      
      // Portfolio (10% weight if available)
      const portfolioScore = portfolioResult?.aiAnalysis?.score || portfolioResult?.score;
      if (portfolioScore) {
        weightedTotal += portfolioScore * 0.1;
        weightSum += 0.1;
        console.log("[trigger-ava-analysis] Including portfolio score:", portfolioScore);
      }
      
      // Normalize by actual weights used
      if (weightSum > 0.4) {
        finalScore = Math.round(weightedTotal / weightSum * 100) / 100;
        console.log("[trigger-ava-analysis] Weighted score calculated:", finalScore, "from components (resume:", newScore, ", quiz:", quizScore, ")");
      }
      
      // MINIMUM SCORE FLOORS based on quiz performance
      // A candidate who aced the quiz should NOT get a failing overall score
      if (quizScore !== null && typeof quizScore === 'number') {
        if (quizScore === 100 && finalScore !== null && finalScore < 60) {
          console.log("[trigger-ava-analysis] Applying floor: 100% quiz -> minimum 60 score");
          finalScore = 60;
        } else if (quizScore >= 80 && finalScore !== null && finalScore < 50) {
          console.log("[trigger-ava-analysis] Applying floor: 80%+ quiz -> minimum 50 score");
          finalScore = 50;
        }
      }
      
      // Typing test bonus (if excellent performance)
      if (typingTest && typingTest.wpm >= 60 && typingTest.accuracy >= 95) {
        if (finalScore !== null && finalScore < 55) {
          console.log("[trigger-ava-analysis] Applying floor: excellent typing -> minimum 55 score");
          finalScore = 55;
        }
      }
    }
    
    console.log("[trigger-ava-analysis] Final score after weighting and floors:", finalScore, "(AI raw score was:", newScore, ")");

    // Update the application with AI analysis using admin client (bypasses RLS)
    // Save both the raw resume score (newScore) and the weighted overall score (finalScore)
    const { error: updateError } = await supabaseAdmin
      .from("applications")
      .update({
        ai_analysis: analysisData?.analysis || null,
        ai_score: finalScore && finalScore >= 0 && finalScore <= 100 ? finalScore : null,
        // Only set resume_score if the resume was actually analyzed (not RESUME_UNAVAILABLE)
        resume_score: resumeUnavailable ? null : (newScore && newScore >= 0 && newScore <= 100 ? newScore : null),
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
        
        // SAFETY GATE: Filter out voice_interview from auto-advance targets
        // voice_interview requires employer to configure duration, language, etc.
        const nonVoiceSteps = workflowSteps.filter((s: any) => s.type !== 'voice_interview');
        
        if (currentPhaseId === "application") {
          if (hasQuizQuestions) {
            nextPhaseId = "quiz";
            nextPhaseTitle = "Quiz";
          } else if (nonVoiceSteps.length > 0) {
            nextPhaseId = nonVoiceSteps[0].id;
            nextPhaseTitle = nonVoiceSteps[0].title || nonVoiceSteps[0].type;
          } else {
            // Only voice_interview steps exist - cannot auto-advance, needs employer config
            console.log("[trigger-ava-analysis] Autopilot: Only voice_interview steps available - requires employer configuration");
            
            // Notify employer that candidate is ready for AIVA interview
            try {
              const candidateName = profile?.full_name || profile?.email || "A candidate";
              const jobTitle = job?.title || "your job posting";
              
              // Create in-app notification for employer
              await supabaseAdmin.from("notifications").insert({
                user_id: job.employer_id,
                type: "interview",
                title: "Candidate Ready for AIVA Interview",
                message: `${candidateName} scored ${finalScore}% and is ready for the AIVA voice interview for ${jobTitle}`,
                link: `/applicants/${applicationId}`,
                is_read: false,
              });
              
              // Send email notification
              await supabaseAdmin.functions.invoke("send-notification-email", {
                body: {
                  type: "interview_ready",
                  recipient_user_id: job.employer_id,
                  data: {
                    candidate_name: candidateName,
                    job_title: jobTitle,
                    score: finalScore?.toString(),
                  },
                },
              });
              
              console.log("[trigger-ava-analysis] Notified employer that candidate is ready for AIVA interview");
            } catch (notifyError) {
              console.error("[trigger-ava-analysis] Failed to notify employer:", notifyError);
            }
            
            return new Response(
              JSON.stringify({ 
                success: true, 
                message: "Analysis completed, awaiting employer configuration for Ava interview",
                score: finalScore,
                decision: "needs_employer_approval",
                reason: "Next phase is Ava Interview which requires employer configuration",
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } else if (currentPhaseId === "quiz") {
          if (nonVoiceSteps.length > 0) {
            nextPhaseId = nonVoiceSteps[0].id;
            nextPhaseTitle = nonVoiceSteps[0].title || nonVoiceSteps[0].type;
          } else {
            // Only voice_interview steps exist - cannot auto-advance, needs employer config
            console.log("[trigger-ava-analysis] Autopilot: Only voice_interview steps available - requires employer configuration");
            
            // Notify employer that candidate is ready for AIVA interview
            try {
              const candidateName = profile?.full_name || profile?.email || "A candidate";
              const jobTitle = job?.title || "your job posting";
              
              // Create in-app notification for employer
              await supabaseAdmin.from("notifications").insert({
                user_id: job.employer_id,
                type: "interview",
                title: "Candidate Ready for AIVA Interview",
                message: `${candidateName} scored ${finalScore}% and is ready for the AIVA voice interview for ${jobTitle}`,
                link: `/applicants/${applicationId}`,
                is_read: false,
              });
              
              // Send email notification
              await supabaseAdmin.functions.invoke("send-notification-email", {
                body: {
                  type: "interview_ready",
                  recipient_user_id: job.employer_id,
                  data: {
                    candidate_name: candidateName,
                    job_title: jobTitle,
                    score: finalScore?.toString(),
                  },
                },
              });
              
              console.log("[trigger-ava-analysis] Notified employer that candidate is ready for AIVA interview");
            } catch (notifyError) {
              console.error("[trigger-ava-analysis] Failed to notify employer:", notifyError);
            }
            
            return new Response(
              JSON.stringify({ 
                success: true, 
                message: "Analysis completed, awaiting employer configuration for Ava interview",
                score: finalScore,
                decision: "needs_employer_approval",
                reason: "Next phase is Ava Interview which requires employer configuration",
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
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
        // Extract key reasons from the AI analysis for a more informative rejection reason
        const analysisText = analysisData?.analysis || '';
        
        // Try to find specific concerns from the AI response
        const areasOfConcernMatch = analysisText.match(/Areas of Concern[:\s]*[\n-]*((?:[-•]\s*[^\n]+\n?)+)/i);
        const penaltiesMatch = analysisText.match(/Penalties Applied[:\s]*[\n-]*((?:[-•]?\s*[^\n]+\n?)+)/i);
        const summaryMatch = analysisText.match(/Summary[:\s]*([^\n*]+)/i);
        const redFlagsMatch = analysisText.match(/Red Flags[:\s]*([^\n]+)/i);
        const missingSkillsMatch = analysisText.match(/Missing Skills[:\s]*([^\n]+)/i);
        
        const concerns: string[] = [];
        
        // Extract areas of concern
        if (areasOfConcernMatch) {
          const concernItems = areasOfConcernMatch[1].split(/\n/).filter(Boolean);
          concernItems.forEach((item: string) => {
            const cleaned = item.replace(/^[-•]\s*/, '').trim();
            if (cleaned && !cleaned.toLowerCase().includes('none')) {
              concerns.push(cleaned);
            }
          });
        }
        
        // Extract red flags
        if (redFlagsMatch && !redFlagsMatch[1].toLowerCase().includes('none detected')) {
          concerns.push(redFlagsMatch[1].trim());
        }
        
        // Extract missing skills
        if (missingSkillsMatch && !missingSkillsMatch[1].toLowerCase().includes('none')) {
          concerns.push(`Missing skills: ${missingSkillsMatch[1].trim()}`);
        }
        
        // Use summary if we don't have specific concerns
        let rejectReason: string;
        if (concerns.length > 0) {
          const topConcerns = concerns.slice(0, 2).join('. ');
          rejectReason = `Score of ${finalScore || 0}% is below the passing threshold of ${passingScore}%. Key issues: ${topConcerns}`;
        } else if (summaryMatch) {
          rejectReason = `Score of ${finalScore || 0}% is below the passing threshold of ${passingScore}%. ${summaryMatch[1].trim()}`;
        } else {
          rejectReason = `Overall Ava score of ${finalScore || 0}% is below the passing threshold of ${passingScore}%.`;
        }
        
        console.log("[trigger-ava-analysis] Autopilot FAILED: rejecting application, score=", finalScore, "reason=", rejectReason);
        
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
        
        // Send rejection notification email to candidate
        try {
          const jobTitle = job?.title || "this position";
          
          // Fetch employer profile for company name
          const { data: employerProfile } = await supabaseAdmin
            .from("profiles")
            .select("company_name")
            .eq("user_id", job?.employer_id)
            .single();
          
          const companyName = employerProfile?.company_name || undefined;
          
          await supabaseAdmin.functions.invoke("send-notification-email", {
            body: {
              type: "status_rejected",
              recipientUserId: application.candidate_id,
              data: {
                job_title: jobTitle,
                company_name: companyName,
              },
            },
          });
          console.log("[trigger-ava-analysis] Rejection notification email sent to candidate");
        } catch (emailError) {
          console.error("[trigger-ava-analysis] Failed to send rejection email:", emailError);
          // Don't fail the whole operation if email fails
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
