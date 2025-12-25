import { supabase } from "@/integrations/supabase/client";
import { detectResumeUrl, parseApplicationNotes } from "./detectResumeUrl";
import { extractPdfTextFromUrl } from "./pdfText";
import { convertPdfToImage } from "./pdfToImage";

export interface EvaluationResult {
  score: number | null;
  passed: boolean;
  analysis: string | null;
}

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
    const parsedNotes = parseApplicationNotes(application.notes);
    
    // Detect resume URL from canonical field OR application answers
    const detectedResumeUrl = detectResumeUrl(application.resume_url, parsedNotes);
    console.log("[triggerAvaAnalysis] Detected resume URL:", detectedResumeUrl);

    // Extract resume content (text or image)
    let resumeText: string | null = null;
    let resumeImage: string | null = null;
    
    if (detectedResumeUrl) {
      console.log("[triggerAvaAnalysis] Attempting to extract resume content...");
      
      // First, try text extraction
      const textResult = await extractPdfTextFromUrl(detectedResumeUrl);
      
      if (textResult.extracted && textResult.text.length >= 100) {
        console.log("[triggerAvaAnalysis] Text extraction successful, length:", textResult.text.length);
        resumeText = textResult.text;
      } else {
        console.log("[triggerAvaAnalysis] Text extraction insufficient, trying image conversion...");
        // Fall back to image conversion for designed/scanned PDFs
        resumeImage = await convertPdfToImage(detectedResumeUrl);
        
        if (resumeImage) {
          console.log("[triggerAvaAnalysis] Image conversion successful");
        } else {
          console.log("[triggerAvaAnalysis] Both text and image extraction failed");
        }
      }
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
`;

    // Add resume text if extracted
    if (resumeText) {
      content += `
RESUME CONTENT (Extracted Text):
${resumeText}
`;
    } else if (resumeImage) {
      content += `
RESUME: An image of the resume is attached for visual analysis. Please analyze the resume from the provided image.
`;
    } else if (detectedResumeUrl) {
      content += `
Resume URL: ${detectedResumeUrl}
Note: Resume text could not be extracted (may be image-based PDF, scanned document, or designed resume). Please analyze based on other application data.
`;
    } else {
      content += `
Resume: Not provided
`;
    }

    // Add Typing Test results if available
    if (parsedNotes.typingTestResult) {
      content += `
Typing Test Results:
- Speed: ${parsedNotes.typingTestResult.wpm} WPM
- Accuracy: ${parsedNotes.typingTestResult.accuracy}%
- Score: ${parsedNotes.typingTestResult.score || 'N/A'}
`;
    }

    // Add Quiz answers if available (check multiple formats)
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

    // Add Video Intro if available (acknowledge submission only, don't analyze content)
    if (parsedNotes.videoIntroUrl) {
      content += `
Video Introduction: Submitted (demonstrates candidate effort and initiative - do NOT attempt to analyze video content)
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

    // Add Voice Interview results if available (stored as separate column)
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
- Inconsistencies Found: ${vr.inconsistencies?.length > 0 ? vr.inconsistencies.map((i: any) => `${i.claim} vs ${i.evidence}`).join('; ') : 'None'}
`;
    }

    console.log("[triggerAvaAnalysis] Calling ai-analyze edge function");
    console.log("[triggerAvaAnalysis] Resume extraction method:", resumeText ? "text" : resumeImage ? "image" : "none");

    // Call the AI analysis edge function
    const { data, error } = await supabase.functions.invoke("ai-analyze", {
      body: {
        type: "resume",
        content,
        resumeUrl: detectedResumeUrl,
        resumeText: resumeText || undefined,
        resumeImage: resumeImage || undefined,
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

    const analysisText = data.analysis || "";
    
    // Extract the FINAL CALCULATED SCORE from the scoring breakdown
    let newScore: number | null = null;
    const finalScoreMatch = analysisText.match(/FINAL CALCULATED SCORE[:\s]+(\d+)/i);
    if (finalScoreMatch) {
      newScore = parseInt(finalScoreMatch[1], 10);
    } else {
      // Fallback to old pattern
      const scoreMatch = analysisText.match(/Overall Score[:\s]+(\d+)/i);
      newScore = scoreMatch ? parseInt(scoreMatch[1], 10) : null;
    }
    
    // POST-PROCESSING SCORE VALIDATION
    // Check for critical red flags that require score caps
    if (newScore !== null && newScore > 60) {
      // Check if NO company names were detected
      const noCompanyMatch = analysisText.match(/Company names present in work experience\?\s*\[?(NO|no)\]?/i) ||
                             analysisText.match(/NO COMPANY.*NAMES/i) ||
                             analysisText.match(/No company\/employer names/i);
      
      if (noCompanyMatch) {
        console.log("[triggerAvaAnalysis] POST-PROCESSING: No company names detected, capping score from", newScore, "to 60");
        newScore = Math.min(newScore, 60);
      }
    }
    
    if (newScore !== null && newScore > 55) {
      // Check if AI-generated content was detected
      const aiGeneratedMatch = analysisText.match(/LIKELY_AI_GENERATED/i) ||
                               analysisText.match(/AI-generated content detected\?\s*\[?LIKELY/i);
      
      if (aiGeneratedMatch) {
        console.log("[triggerAvaAnalysis] POST-PROCESSING: AI-generated content detected, capping score from", newScore, "to 55");
        newScore = Math.min(newScore, 55);
      }
    }
    
    if (newScore !== null && newScore > 45) {
      // Check for both no company names AND no achievements
      const noAchievements = analysisText.match(/Specific quantifiable achievements present\?\s*\[?(NO|no)\]?/i) ||
                             analysisText.match(/NO quantifiable achievements/i);
      const noCompany = analysisText.match(/Company names present.*\[?(NO|no)\]?/i) ||
                        analysisText.match(/NO COMPANY.*NAMES/i);
      
      if (noAchievements && noCompany) {
        console.log("[triggerAvaAnalysis] POST-PROCESSING: No achievements AND no company names, capping score from", newScore, "to 45");
        newScore = Math.min(newScore, 45);
      }
    }
    
    // Preserve existing score - AVA stands by her original assessment
    const existingScore = application.ai_score;

    // Update the application with AI analysis
    const { error: updateError } = await supabase
      .from("applications")
      .update({
        ai_analysis: data.analysis,
        ai_score: existingScore ?? (newScore && newScore >= 0 && newScore <= 100 ? newScore : null),
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
