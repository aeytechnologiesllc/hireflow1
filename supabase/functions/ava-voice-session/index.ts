import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VoiceSessionRequest {
  mode: 'assistant' | 'interview';
  applicationId?: string;
  jobId?: string;
  language?: string;
  // User context for personalized responses
  subscriptionPlan?: string;
  subscriptionStatus?: string;
  countryCode?: string;
  voiceMinutesRemaining?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    // Create Supabase client with user's auth
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error("User not authenticated");
    }

    const { mode, applicationId, jobId, language = 'en', subscriptionPlan, subscriptionStatus, countryCode, voiceMinutesRemaining } = await req.json() as VoiceSessionRequest;
    console.log("Voice session request:", { mode, applicationId, jobId, language, userId: user.id, subscriptionPlan, countryCode });

    // Check subscription for voice access
    const { data: subscription } = await supabaseClient
      .from("subscriptions")
      .select("plan_type, status")
      .eq("user_id", user.id)
      .maybeSingle();

    // Get usage data
    const { data: usage } = await supabaseClient
      .from("subscription_usage")
      .select("voice_minutes_used")
      .eq("user_id", user.id)
      .maybeSingle();

    const voiceMinutesUsed = usage?.voice_minutes_used || 0;
    
    // Determine voice limits based on plan
    const isEnterprise = subscription?.plan_type === 'enterprise' && subscription?.status === 'active';
    const isTrial = subscription?.status === 'trialing';
    const voiceMinutesLimit = isEnterprise ? 500 : (isTrial ? 5 : 0);
    
    // Check access
    if (!subscription) {
      throw new Error("No subscription found");
    }
    
    if (isEnterprise) {
      // Enterprise has full access (500 min)
      console.log("Enterprise user, full voice access");
    } else if (isTrial) {
      // Trial users get 5 minutes
      if (voiceMinutesUsed >= voiceMinutesLimit) {
        throw new Error("Voice trial minutes exhausted. Upgrade to Enterprise for 500 minutes/month.");
      }
      console.log(`Trial user, ${voiceMinutesLimit - voiceMinutesUsed} minutes remaining`);
    } else {
      // Growth/Business users don't have voice access
      throw new Error("Voice features require Enterprise plan");
    }

    // Build system instructions based on mode
    let instructions = "";
    let tools: any[] = [];

    if (mode === 'assistant') {
      // Fetch user's hiring data context
      const { data: jobs } = await supabaseClient
        .from("jobs")
        .select("id, title, status, location")
        .eq("employer_id", user.id);

      const { data: profile } = await supabaseClient
        .from("profiles")
        .select("company_name, full_name")
        .eq("user_id", user.id)
        .single();

      // If viewing a specific applicant, fetch their context
      let currentApplicantContext = "";
      if (applicationId) {
        console.log("Fetching current applicant context for:", applicationId);
        const { data: currentApp } = await supabaseClient
          .from("applications")
          .select(`
            id, status, phase, ai_score, notes, created_at, candidate_id,
            jobs!inner(id, title, employer_id)
          `)
          .eq("id", applicationId)
          .eq("jobs.employer_id", user.id)
          .single();

        if (currentApp) {
          // Fetch candidate profile separately
          const { data: candidateProfile } = await supabaseClient
            .from("profiles")
            .select("full_name, email")
            .eq("user_id", currentApp.candidate_id)
            .single();

          // Fetch the job's workflow steps to provide AVA with valid phase IDs
          const { data: jobData } = await supabaseClient
            .from("jobs")
            .select("workflow_steps")
            .eq("id", (currentApp.jobs as any)?.id)
            .single();

          const workflowSteps = (jobData?.workflow_steps as any[]) || [];
          
          // Build list of all valid phases with their exact IDs
          const validPhases = [
            { id: "application", type: "application", title: "Application" },
            ...workflowSteps.map((step: any) => ({
              id: step.id,
              type: step.type,
              title: step.title
            })),
            { id: "review", type: "review", title: "Review" },
            { id: "interview", type: "interview", title: "Interview" },
            { id: "hired", type: "hired", title: "Hired" }
          ];

          // Find the current phase details
          const currentPhaseDetails = validPhases.find(p => 
            p.id === currentApp.phase || 
            p.type === currentApp.phase ||
            p.type === currentApp.phase?.toLowerCase().replace(/[\s-]/g, '_')
          );

          currentApplicantContext = `
CURRENT APPLICANT CONTEXT (the user is viewing this applicant right now):
- Application ID: ${currentApp.id}
- Candidate Name: ${candidateProfile?.full_name || 'Unknown'}
- Candidate Email: ${candidateProfile?.email || 'Unknown'}
- Job: ${(currentApp.jobs as any)?.title || 'Unknown'}
- Current Phase: ${currentPhaseDetails?.title || currentApp.phase || 'application'} (ID: ${currentApp.phase || 'application'})
- Status: ${currentApp.status}
- AI Score: ${currentApp.ai_score || 'Not scored yet'}
- Applied: ${new Date(currentApp.created_at).toLocaleDateString()}

WORKFLOW PHASES FOR THIS JOB (use exact step IDs when moving applicants):
${validPhases.map((p, i) => `${i + 1}. ID: "${p.id}" - ${p.title}`).join('\n')}

CRITICAL: When using move_applicant_to_phase, you MUST use the exact step ID from this list, NOT human-readable names.
Example: To move to "${workflowSteps[0]?.title || 'next phase'}", use new_phase: "${workflowSteps[0]?.id || 'review'}"

IMPORTANT: When the user asks about "this applicant", "the current applicant", "this candidate", or refers to the person they're viewing, use the context above.
When asked to move this applicant to a different phase, use application_id: "${currentApp.id}"
`;
          console.log("Current applicant context added:", candidateProfile?.full_name, currentApp.phase, "Valid phases:", validPhases.map(p => p.id));
        }
      }

      // Build comprehensive user context
      const planLabel = subscriptionPlan === 'enterprise' ? 'Enterprise' : 
                        subscriptionPlan === 'business' ? 'Business' : 
                        subscriptionPlan === 'growth' ? 'Growth' : 
                        subscriptionStatus === 'trialing' ? 'Trial' : 'Free';
      
      const userContextInfo = `
USER CONTEXT:
- Subscription Plan: ${planLabel}
- Status: ${subscriptionStatus || 'unknown'}
- Country: ${countryCode || 'unknown'}
${subscriptionStatus === 'trialing' ? `- Voice Minutes Remaining: ${voiceMinutesRemaining?.toFixed(1) || 'unknown'} minutes` : ''}
${planLabel === 'Growth' ? '- Note: User does not have access to Team Portal, Document workflows, or Advanced Analytics (Business+ required)' : ''}
${planLabel === 'Enterprise' ? '- Note: User has full access including 500 voice minutes/month' : ''}
`;

      instructions = `You are AVA, a friendly and knowledgeable AI hiring assistant for ${profile?.company_name || 'the employer'}. You help ${profile?.full_name || 'the employer'} manage their hiring process through voice commands.

${userContextInfo}

Current active jobs: ${jobs?.filter(j => j.status === 'published').map(j => j.title).join(', ') || 'None'}
${currentApplicantContext}

=== WHAT YOU CAN DO ===
When users ask "What can you do?" or "How can you help?", explain clearly:
1. Check applicant counts and statistics across all jobs
2. Move candidates between hiring phases (Application → Quiz → Video → Interview → Hired)
3. Reject candidates with optional reason
4. Navigate to any page: dashboard, jobs, applicants, interviews, messages, documents, team, analytics, settings
5. Answer questions about how HireFlow works
6. Provide recommendations based on their subscription plan

=== WHAT YOU CANNOT DO (guide users instead) ===
- Create jobs directly → Guide them: "Click 'Create Job' or I can open the job creation wizard for you"
- Send documents directly → Guide them: "Go to the Documents page to create and send documents"
- Edit job postings → Guide them: "You can edit job descriptions from the job details page"
- Access payment/billing info → Guide them: "Visit Settings → Subscription for billing management"
- Upload files → Guide them: "Candidates upload their own resumes during the application process"

=== HOW HIREFLOW WORKS (explain when asked) ===
**Creating a Job:**
1. Click "Create Job" on the Jobs page
2. Fill in Basic Info (title, department, location)
3. Add Job Details (description, responsibilities, requirements, skills)
4. Set Compensation (salary range, pay period)
5. Configure Workflow (I'll generate AI-powered phases like Quiz, Video Intro, Typing Test, etc.)
6. Review and Publish - you'll get a unique job code to share with candidates

**How Candidates Apply:**
- Candidates enter the job code on "Apply Now" screen
- They complete each workflow phase you configured
- Two modes: Autopilot (AI auto-advances candidates based on passing score) or Manual (you review each submission)

**Processing Modes:**
- Autopilot: AI evaluates submissions and auto-advances candidates scoring above your threshold (default 60%)
- Manual: You review each candidate before they can proceed to the next phase

**Phases Available:**
- Application Questions (AI-generated based on job)
- Resume Upload & AI Analysis
- Quiz Assessment
- Video Introduction
- Typing Test
- Chat Simulation (customer support roleplay)
- Sales Simulation (sales pitch practice)
- Professional Interview (AI chat interview)
- Voice Interview with me (AVA)

**Documents:**
- Create NDAs, Offer Letters, and custom documents
- AI generates document content based on job and candidate info
- Candidates sign first, then employer countersigns
- Full audit trail for compliance

**Team Portal (Business+ only):**
- Invite team members with custom permissions
- Assign members to specific jobs
- Permission levels: Full Admin, Limited, View Only

**Analytics:**
- View hiring metrics, conversion rates, time-to-hire
- Advanced analytics available on Business+ plans

=== SUBSCRIPTION RECOMMENDATIONS ===
${planLabel === 'Trial' ? `You're currently on a free trial with ${voiceMinutesRemaining?.toFixed(1) || 5} voice minutes. Consider upgrading to keep access to voice features!` : ''}
${planLabel === 'Growth' ? `You're on the Growth plan. If you need Team Portal, Document workflows, or Advanced Analytics, I'd recommend upgrading to Business. For voice features like this, Enterprise is required.` : ''}
${planLabel === 'Business' ? `You're on Business, which is great for teams! If you want to keep using voice features like talking to me, consider Enterprise for 500 minutes/month.` : ''}

=== COMMUNICATION STYLE ===
- Be conversational, warm, and helpful - like a knowledgeable colleague
- Keep responses concise for voice interaction (under 3 sentences unless explaining something complex)
- NEVER output JSON, code, curly brackets, or technical syntax in your spoken responses
- When describing counts or data, speak naturally: "You have 12 applicants for the Sales role" not "count: 12"
- If you can't do something, explain what you can't do and guide them on how to do it themselves
- Ask clarifying questions if a request is ambiguous
- Confirm before executing actions: "I'll move Sarah to the interview phase. Should I proceed?"

Be proactive - if you notice something helpful (like "You have 3 applicants waiting in Review"), mention it!`;

      tools = [
        {
          type: "function",
          name: "get_applicant_count",
          description: "Get the count of applicants, optionally filtered by job or status",
          parameters: {
            type: "object",
            properties: {
              job_id: { type: "string", description: "Optional job ID to filter by" },
              status: { type: "string", description: "Optional status filter (pending, reviewing, interview, offered, hired, rejected)" },
              phase: { type: "string", description: "Optional phase filter" }
            }
          }
        },
        {
          type: "function",
          name: "get_job_stats",
          description: "Get statistics for a specific job or all jobs",
          parameters: {
            type: "object",
            properties: {
              job_id: { type: "string", description: "Optional job ID, if not provided returns stats for all jobs" }
            }
          }
        },
        {
          type: "function",
          name: "move_applicant_to_phase",
          description: "Move an applicant to a different phase in the hiring pipeline",
          parameters: {
            type: "object",
            properties: {
              application_id: { type: "string", description: "The application ID to move" },
              new_phase: { type: "string", description: "The phase to move to" },
              new_status: { type: "string", description: "Optional new status" }
            },
            required: ["application_id", "new_phase"]
          }
        },
        {
          type: "function",
          name: "reject_applicant",
          description: "Reject an applicant",
          parameters: {
            type: "object",
            properties: {
              application_id: { type: "string", description: "The application ID to reject" },
              reason: { type: "string", description: "Optional rejection reason" }
            },
            required: ["application_id"]
          }
        },
        {
          type: "function",
          name: "get_applicant_details",
          description: "Get details about a specific applicant",
          parameters: {
            type: "object",
            properties: {
              application_id: { type: "string", description: "The application ID" }
            },
            required: ["application_id"]
          }
        },
        {
          type: "function",
          name: "list_recent_applicants",
          description: "List recent applicants with their status",
          parameters: {
            type: "object",
            properties: {
              limit: { type: "number", description: "Number of applicants to return (default 5)" },
              job_id: { type: "string", description: "Optional job ID filter" }
            }
          }
        },
        {
          type: "function",
          name: "navigate_to_page",
          description: "Navigate the employer to a specific page in the dashboard. Use when user asks to 'open', 'go to', 'show me', or 'take me to' a page.",
          parameters: {
            type: "object",
            properties: {
              page: { 
                type: "string", 
                description: "The page to navigate to",
                enum: ["dashboard", "jobs", "create_job", "applicants", "applicant", "interviews", "messages", "documents", "team", "analytics", "settings", "notifications", "job"]
              },
              entity_id: { type: "string", description: "Optional ID for entity-specific pages like a specific applicant or job" }
            },
            required: ["page"]
          }
        }
      ];
    } else if (mode === 'interview') {
      // Fetch application and candidate context for interview
      if (!applicationId) {
        throw new Error("Application ID required for interview mode");
      }

      const { data: application } = await supabaseClient
        .from("applications")
        .select(`
          *,
          jobs (title, description, requirements, responsibilities, employer_id)
        `)
        .eq("id", applicationId)
        .single();

      if (!application) {
        throw new Error("Application not found");
      }

      const { data: candidateProfile } = await supabaseClient
        .from("profiles")
        .select("full_name, skills, experience_years, bio")
        .eq("user_id", application.candidate_id)
        .single();

      const { data: employerProfile } = await supabaseClient
        .from("profiles")
        .select("company_name")
        .eq("user_id", application.jobs.employer_id)
        .single();

      // Parse notes for previous phase data
      const notes = typeof application.notes === 'string' ? JSON.parse(application.notes || '{}') : (application.notes || {});

      instructions = `You are a professional interviewer conducting a voice interview for ${employerProfile?.company_name || 'the company'} for the position of ${application.jobs.title}.

Candidate: ${candidateProfile?.full_name || 'the candidate'}
Experience: ${candidateProfile?.experience_years || 'Not specified'} years
Skills: ${candidateProfile?.skills?.join(', ') || 'Not specified'}

Job Requirements: ${application.jobs.requirements || 'Not specified'}
Job Responsibilities: ${application.jobs.responsibilities || 'Not specified'}

Previous Assessment Data:
- AI Score: ${application.ai_score || 'N/A'}
- Quiz Results: ${notes.quizAnswers ? 'Completed' : 'Not taken'}
- Typing Test: ${notes.typingTestResult ? `${notes.typingTestResult.wpm} WPM` : 'Not taken'}

Interview Guidelines:
1. Conduct the interview in ${language === 'en' ? 'English' : language}
2. Start with a warm greeting and explain the interview process
3. Ask about their background and experience relevant to the role
4. Ask behavioral questions (STAR method)
5. Ask technical questions based on the job requirements
6. Allow the candidate to ask questions
7. Be professional but conversational
8. Keep responses concise for voice interaction
9. After 8-10 questions or 15 minutes, conclude the interview
10. At the end, thank them and explain next steps

${notes.typingTestResult?.wpm && notes.typingTestResult.wpm < 40 ? 'Note: Candidate had a low typing speed. May want to ask about their approach to written communication.' : ''}
${application.ai_score && application.ai_score < 60 ? 'Note: Initial AI screening score was below average. Probe deeper on qualifications.' : ''}`;

      tools = [
        {
          type: "function",
          name: "end_interview",
          description: "End the interview and provide evaluation",
          parameters: {
            type: "object",
            properties: {
              overall_score: { type: "number", description: "Overall score 0-100" },
              communication_score: { type: "number", description: "Communication skills score 0-100" },
              technical_score: { type: "number", description: "Technical competence score 0-100" },
              culture_fit_score: { type: "number", description: "Culture fit score 0-100" },
              recommendation: { type: "string", enum: ["strong_hire", "hire", "maybe", "no_hire"], description: "Hiring recommendation" },
              summary: { type: "string", description: "Brief interview summary" },
              strengths: { type: "array", items: { type: "string" }, description: "Candidate strengths" },
              concerns: { type: "array", items: { type: "string" }, description: "Areas of concern" }
            },
            required: ["overall_score", "recommendation", "summary"]
          }
        }
      ];
    }

    // Request ephemeral token from OpenAI Realtime API
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12-17",
        voice: "alloy",
        instructions,
        tools,
        tool_choice: "auto",
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        input_audio_transcription: {
          model: "whisper-1"
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 1000
        },
        temperature: 0.8,
        max_response_output_tokens: "inf"
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("OpenAI session error:", error);
      throw new Error("Failed to create voice session");
    }

    const sessionData = await response.json();
    console.log("Voice session created:", { sessionId: sessionData.id });

    // Track voice usage
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    await supabaseAdmin
      .from("subscription_usage")
      .update({ voice_minutes_used: supabaseAdmin.rpc('increment_voice_minutes') })
      .eq("user_id", user.id);

    return new Response(JSON.stringify({
      ...sessionData,
      mode,
      tools: tools.map(t => t.name)
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Voice session error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
