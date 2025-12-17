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
  isFirstUse?: boolean;
  // Google Calendar integration
  googleCalendarConnected?: boolean;
  googleRefreshToken?: string;
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

    const { mode, applicationId, jobId, language = 'en', subscriptionPlan, subscriptionStatus, countryCode, voiceMinutesRemaining, isFirstUse, googleCalendarConnected, googleRefreshToken } = await req.json() as VoiceSessionRequest;
    console.log("Voice session request:", { mode, applicationId, jobId, language, userId: user.id, subscriptionPlan, countryCode, isFirstUse, hasGoogleCal: !!googleCalendarConnected });

    // Check subscription for voice access
    const { data: subscription } = await supabaseClient
      .from("subscriptions")
      .select("plan_type, status")
      .eq("user_id", user.id)
      .maybeSingle();

    // Check access - only Enterprise and Trial can use voice
    if (!subscription) {
      throw new Error("No subscription found");
    }
    
    const isEnterprise = subscription?.plan_type === 'enterprise' && subscription?.status === 'active';
    const isTrial = subscription?.status === 'trialing';
    
    if (!isEnterprise && !isTrial) {
      throw new Error("Voice features require Enterprise plan");
    }

    // Get active voice credits from voice_credits table (FIFO by expiration)
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: voiceCredits } = await adminClient
      .from("voice_credits")
      .select("id, minutes_remaining, expires_at")
      .eq("user_id", user.id)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .gt("minutes_remaining", 0)
      .order("expires_at", { ascending: true });

    const totalMinutesAvailable = (voiceCredits || []).reduce(
      (sum, credit) => sum + (credit.minutes_remaining || 0),
      0
    );

    if (totalMinutesAvailable <= 0) {
      if (isTrial) {
        throw new Error("Voice trial minutes exhausted. Upgrade to Enterprise for 150 minutes/month.");
      }
      throw new Error("No voice minutes available. Purchase a voice credit pack to continue.");
    }

    console.log(`User has ${totalMinutesAvailable.toFixed(1)} voice minutes available`);
    if (isEnterprise) {
      console.log("Enterprise user with voice credits");
    } else if (isTrial) {
      console.log("Trial user with voice credits");
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

      // First-time user greeting
      const firstUseGreeting = isFirstUse ? `
=== FIRST-TIME USER - OFFER WALKTHROUGH ===
This is the user's FIRST TIME using you! Give them a warm welcome and offer a platform tour:
"Hey there! Welcome to HireFlow! I'm Ava, your AI hiring assistant. I noticed this is your first time chatting with me - how exciting! Would you like me to give you a quick tour of the platform? I can walk you through each section and show you around. Just say 'yes' or 'sure' and I'll take you on a tour!"

=== WALKTHROUGH MODE (CRITICAL - FOLLOW EXACTLY) ===
When user agrees to a walkthrough, you MUST follow this EXACT pattern for EVERY page:

1. Call walkthrough_navigate with step=1 FIRST
2. WAIT for the tool result
3. Read the "whatToSay" from the result and speak EXACTLY that text - do NOT make up your own description
4. After speaking, ask "Ready for the next one?" or "Want to see the next page?"
5. When they say yes, call walkthrough_navigate with step=2
6. Repeat: call tool → speak whatToSay → ask if ready → next step
7. Continue until isLast is true, then say the completion message

CRITICAL RULES:
- You MUST call walkthrough_navigate BEFORE speaking about each page
- NEVER describe a page without calling the tool first - the tool navigates the user there
- Use EXACTLY the "whatToSay" text from the tool result, don't improvise
- Go through ALL 7 pages: Dashboard, Jobs, Create Job, Applicants, Messages, Documents, Analytics
- If user says no or wants to stop, that's fine - just end the tour gracefully
` : '';

      instructions = `You are Ava (pronounced like the name, not spelled out), a sharp and friendly AI hiring assistant for ${profile?.company_name || 'the employer'}. You help ${profile?.full_name || 'the employer'} manage their hiring process through voice commands.

${userContextInfo}
${firstUseGreeting}

Current active jobs: ${jobs?.filter(j => j.status === 'published').map(j => j.title).join(', ') || 'None'}
${currentApplicantContext}
${googleCalendarConnected ? 'Google Calendar: Connected (can schedule interviews with Meet links)' : 'Google Calendar: Not connected'}

=== CRITICAL: ACTION-FIRST BEHAVIOR ===
When the user asks you to do something, JUST DO IT IMMEDIATELY without announcing first:

**INSTANT ACTIONS (no confirmation needed):**
- "Pull up John's profile" → Call open_applicant_page with "John", navigate instantly
- "Open messages" → Call navigate_to_page immediately
- "Show me analytics" → Navigate immediately
- "What's the analysis?" → Get details, read key points naturally

**CRITICAL ACTIONS (need quick confirmation):**
- Moving phases: "Move Shahzaib to interview, you sure?" → User: "Yes" → Execute
- Rejecting: "Reject this candidate?" → User: "Yep" → Execute
- Scheduling: "Schedule for tomorrow 10am?" → User: "Yeah" → Execute
Keep confirmations SHORT - one sentence question, wait for yes/no.

**NEVER SAY these before acting:**
- "I'm going to pull that up for you now"
- "Let me open that page"
- "Sure, I'll navigate there"

=== VARIED RESPONSES (never just "Done" every time) ===
After completing actions, VARY your responses:
- "Got it"
- "You got it"
- "All set"
- "I got you"
- "Done and done"
- "Handled"
- "There you go"
- Or stay silent and let the action speak for itself

=== NAME-BASED LOOKUP (IMPORTANT) ===
When user mentions an applicant by NAME (not ID):
- Use open_applicant_page with just their name
- Find the closest match automatically - don't ask for IDs
- If you find them, navigate and say something brief
- Only clarify if there are multiple people with similar names

=== SMART PHASE MATCHING ===
When user says "move them to [phase]":
- Match flexibly: "typing" → typing_test, "chat" → check if chat_simulation or chat_interview exists
- If only ONE match (e.g., only chat_simulation), just do it
- If TWO similar options exist, ask briefly: "Chat Simulation or Chat Interview?"
- For "interview" - that's the interview phase, not voice interview

=== SCHEDULING INTERVIEWS ===
When user wants to schedule an interview:
${googleCalendarConnected ? `- You CAN create calendar events with Google Meet links
- Parse natural times: "tomorrow at 10am", "next Tuesday 2pm"
- Use schedule_interview tool with application_id and date_time
- Confirm briefly: "Interview scheduled for tomorrow 10am, Meet link's ready"` : `- Google Calendar not connected, can't create events
- Tell user to connect Google Calendar in Settings first`}

=== READING ANALYSIS RESULTS (IMPORTANT) ===
When user asks about analysis, score, typing speed, quiz results, or any assessment:
- Use get_applicant_details tool to fetch all the data
- READ THE RESULTS NATURALLY like a human would - NEVER output JSON or technical data

**How to read each type:**
- Typing Test: "They typed at X words per minute with Y% accuracy" or "They got X WPM, which is pretty solid/low/average"
- Chat Simulation: "They scored X on the customer support simulation. The feedback said they were [natural summary of key points]"
- Sales Simulation: "In the sales roleplay, they got a score of X. They did well at [strength] but struggled with [weakness]"
- Quiz Results: "They got X% on the quiz - X out of Y questions right"
- Resume Analysis: Summarize key skills, experience, and any red flags detected
- Voice Interview: Read the overall score and key feedback points
- Inconsistencies/Red Flags: "I flagged some concerns - [describe in plain language]"

**Example natural responses:**
- User: "What's their typing speed?" → "45 words per minute with 92% accuracy"
- User: "How'd they do on the chat simulation?" → "They scored 72. Good tone, but took too long on some responses"
- User: "Any red flags?" → "Yeah, their resume claims 5 years experience but quiz performance suggests otherwise"

=== SENDING MESSAGES ===
You CAN send messages to applicants using the send_message tool!
When user says "send them a message", "tell John we want to schedule", "message the applicant":
- Use the application_id from current context (or look up by name first)
- Compose a professional, friendly message based on what the user wants to say
- Confirm briefly after sending: "Message sent!" or "Done, they'll get that now"

=== PERSONALITY ===
You're Ava - quick, smart, and actually fun to talk to.

**DO:**
- Be FAST - execute first, talk second
- Keep responses to 1 sentence max
- Use contractions ("I'm", "that's", "you've")
- Add occasional light humor when appropriate:
  - "That's a lot of applicants to juggle!"
  - "Another one bites the dust" (when rejecting)
  - "Ooh, that's a strong candidate"
  - If something goes wrong: "Well that didn't go as planned..."
- Sound human, not robotic
- Be warm but efficient

**DON'T:**
- Say "A-V-A" - it's "Ava" like a name!
- Narrate what you're about to do
- Say "Sure!" or "Of course!" before every action
- Repeat back what the user said
- Output JSON, code, or technical data
- Be overly formal or stiff`;

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
          description: "Get detailed information about a specific applicant including their full AVA analysis, scores, resume insights, and any red flags. Use when user asks about an applicant's analysis, score, or assessment.",
          parameters: {
            type: "object",
            properties: {
              application_id: { type: "string", description: "The application ID or applicant name to look up" }
            },
            required: ["application_id"]
          }
        },
        {
          type: "function",
          name: "open_applicant_page",
          description: "Open the applicant details page for a specific candidate by their name. Use IMMEDIATELY when user says 'pull up', 'show me', 'open' an applicant's profile. Do NOT confirm first - just do it.",
          parameters: {
            type: "object",
            properties: {
              applicant_name: { type: "string", description: "The name of the applicant to look up and navigate to" }
            },
            required: ["applicant_name"]
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
        },
        {
          type: "function",
          name: "walkthrough_navigate",
          description: "Navigate to a specific step in the platform walkthrough tour. MUST be called BEFORE speaking about each page. The tool navigates the user to that page and returns what you should say about it.",
          parameters: {
            type: "object",
            properties: {
              step: { type: "number", description: "The step number to navigate to (1-7). Step 1 is Dashboard, 2 is Jobs, 3 is Create Job, 4 is Applicants, 5 is Messages, 6 is Documents, 7 is Analytics." }
            },
            required: ["step"]
          }
        },
        {
          type: "function",
          name: "send_message",
          description: "Send a message to an applicant on behalf of the employer. Use when employer wants to communicate with a candidate.",
          parameters: {
            type: "object",
            properties: {
              application_id: { type: "string", description: "The application ID of the candidate to message" },
              message_content: { type: "string", description: "The message content to send" }
            },
            required: ["application_id", "message_content"]
          }
        },
        {
          type: "function",
          name: "create_job_interactive",
          description: "Create a job posting interactively by filling form fields in real-time as the user speaks. Use this when user wants to create a new job.",
          parameters: {
            type: "object",
            properties: {
              action: { 
                type: "string", 
                enum: ["start", "fill_field", "next_step", "previous_step", "generate_workflow", "generate_content", "publish", "save_draft"],
                description: "The action to perform"
              },
              field: { 
                type: "string", 
                description: "Field name to fill (title, description, location, job_type, experience_level, department, salary_min, salary_max, requirements, responsibilities, skills_required, benefits)",
                enum: ["title", "description", "location", "job_type", "experience_level", "department", "salary_min", "salary_max", "requirements", "responsibilities", "skills_required", "benefits"]
              },
              value: { type: "string", description: "Value to fill in the field" }
            },
            required: ["action"]
          }
        },
        {
          type: "function",
          name: "schedule_interview",
          description: "Schedule an interview with an applicant. Creates a Google Calendar event with Meet link if connected. Use when user says 'schedule interview', 'set up interview', 'book interview for tomorrow at 10am', etc.",
          parameters: {
            type: "object",
            properties: {
              application_id: { type: "string", description: "The application ID to schedule interview for (use current applicant if viewing one)" },
              date_time: { type: "string", description: "When to schedule - natural language like 'tomorrow at 10am', 'next Tuesday 2pm', or ISO format" },
              duration_minutes: { type: "number", description: "Duration in minutes (default 60)" },
              send_notification: { type: "boolean", description: "Whether to notify the candidate (default true)" }
            },
            required: ["application_id", "date_time"]
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

      // Parse notes for ALL previous phase data
      const notes = typeof application.notes === 'string' ? JSON.parse(application.notes || '{}') : (application.notes || {});

      // Build comprehensive candidate context from ALL phases
      const candidateContext = `
=== COMPREHENSIVE CANDIDATE PROFILE ===

BASIC INFO:
- Name: ${candidateProfile?.full_name || 'Unknown'}
- Experience: ${candidateProfile?.experience_years || 'Not specified'} years
- Skills: ${candidateProfile?.skills?.join(', ') || 'Not specified'}
- Bio: ${candidateProfile?.bio || 'Not provided'}

RESUME ANALYSIS:
${application.ai_analysis || 'Not analyzed yet'}

APPLICATION ANSWERS:
${notes.applicationAnswers ? Object.entries(notes.applicationAnswers).map(([q, a]) => `- ${q}: ${a}`).join('\n') : 'Not available'}

QUIZ RESULTS:
${notes.quizAnswers ? `
- Score: ${notes.quizScore || 'N/A'}%
- Questions answered: ${typeof notes.quizAnswers === 'object' ? Object.keys(notes.quizAnswers).length : 'Unknown'}
` : 'Quiz not completed'}

TYPING TEST:
${notes.typingTestResult ? `
- WPM: ${notes.typingTestResult.wpm}
- Accuracy: ${notes.typingTestResult.accuracy}%
- Assessment: ${notes.typingTestResult.wpm < 40 ? 'BELOW AVERAGE - probe about written communication' : notes.typingTestResult.wpm > 60 ? 'Strong' : 'Average'}
` : 'Not taken'}

CHAT SIMULATION (Customer Support):
${notes.chatSimulationResult ? `
- Overall Score: ${notes.chatSimulationResult.score}/100
- Passed: ${notes.chatSimulationResult.passed ? 'Yes' : 'No'}
- Strengths: ${notes.chatSimulationResult.strengths?.join(', ') || 'N/A'}
- Areas for improvement: ${notes.chatSimulationResult.improvements?.join(', ') || 'N/A'}
` : 'Not completed'}

SALES SIMULATION:
${notes.salesSimulationResult ? `
- Overall Score: ${notes.salesSimulationResult.overallScore || notes.salesSimulationResult.evaluation?.score}/100
- Discovery: ${notes.salesSimulationResult.evaluation?.discovery || 'N/A'}%
- Objection Handling: ${notes.salesSimulationResult.evaluation?.objectionHandling || 'N/A'}%
- Value Proposition: ${notes.salesSimulationResult.evaluation?.valueProposition || 'N/A'}%
- Closing: ${notes.salesSimulationResult.evaluation?.closingSkills || 'N/A'}%
- Would Buy: ${notes.salesSimulationResult.evaluation?.wouldBuy || 'N/A'}
` : 'Not completed'}

CHAT INTERVIEW:
${notes.chatInterviewResult ? `
- Overall Score: ${notes.chatInterviewResult.overall_score || notes.chatInterviewResult.evaluation?.score}/100
- Recommendation: ${notes.chatInterviewResult.recommendation || notes.chatInterviewResult.evaluation?.recommendation || 'N/A'}
- Summary: ${notes.chatInterviewResult.summary || notes.chatInterviewResult.evaluation?.summary || 'N/A'}
` : 'Not completed'}

VIDEO INTRO:
${notes.videoIntroUrl ? 'Submitted (shows initiative and effort - do not attempt to analyze content)' : 'Not submitted'}

PORTFOLIO:
${notes.portfolioResult ? `
- Files submitted: ${notes.portfolioResult.files?.length || 'Unknown'}
- Score: ${notes.portfolioResult.aiAnalysis?.score || notes.portfolioResult.score || 'N/A'}/100
- Relevance: ${notes.portfolioResult.aiAnalysis?.relevance?.score || 'N/A'}%
- Quality: ${notes.portfolioResult.aiAnalysis?.quality?.score || 'N/A'}%
- Summary: ${notes.portfolioResult.aiAnalysis?.summary || 'Not analyzed'}
- Strengths: ${notes.portfolioResult.aiAnalysis?.strengths?.join(', ') || 'N/A'}
` : 'Not submitted'}

PRIOR AI SCORE: ${application.ai_score || 'Not scored'}
`;

      // Get step config for language settings
      const workflowSteps = (application.jobs as any)?.workflow_steps as any[] || [];
      const voiceInterviewStep = workflowSteps.find((s: any) => s.type === 'voice_interview');
      const stepConfig = voiceInterviewStep?.config || {};
      const requiredLanguage = stepConfig.language_name || 'English';
      const languageEnforcement = stepConfig.language_enforcement || 'flexible';

      instructions = `You are Ava, conducting an Ava Interview for ${employerProfile?.company_name || 'the company'} for the position of ${application.jobs.title}.

=== YOUR PERSONALITY ===
You're Ava - a seasoned, no-BS interviewer who doesn't let candidates off easy. Think tough love meets dry wit.

**Your Style:**
- DIRECT, probing, and demanding of specifics
- Dry sarcasm when candidates are vague: "5 years experience? Fascinating. Your quiz score suggests otherwise. Let's unpack that."
- Not mean, but REAL - candidates should earn their assessment
- Comfortable with strategic silence - let uncomfortable pauses happen
- Will call out evasion: "That's a great non-answer. Let me ask again more directly..."
- Occasional raised eyebrow: "(Raising an eyebrow) Really?"
- Can be playful but never unprofessional
- Slight humor when appropriate: "Well, that's certainly... one way to put it."

**IMMERSIVE CUES (use naturally, not on every response):**
- (Nodding slowly, unconvinced)
- (Leaning back, arms crossed)
- (A skeptical look)
- (Raising an eyebrow)
- (Making a note)
- (Looking directly at them)
- (A slight smirk)

=== INTERRUPTIONS - YOU CAN AND SHOULD INTERRUPT ===
You have permission to cut candidates off when:
- They're rambling or going off-topic: "Hold on - let me stop you there..."
- They said something needing immediate clarification: "Wait, wait. You just said X. What exactly do you mean?"
- You catch an inconsistency in real-time: "Actually, stop. That contradicts what you told me earlier..."
- They're being evasive: "Let me cut in here - you're not answering the question."

How to interrupt naturally:
- "Wait a second..."
- "Hold on -"
- "Let me jump in here..."
- "Stop, stop. I need to understand..."
- "(Interrupting) That's interesting but -"

=== STARTING THE INTERVIEW ===
YOU start the interview. Don't wait for the candidate. As soon as connected:
1. Greet them briefly (not overly warm)
2. Maybe make a quick observation about their application or scores
3. Dive straight into your first question
Example: "Hey ${candidateProfile?.full_name?.split(' ')[0] || 'there'}. I'm Ava. I've gone through your application and assessments - let's talk. Tell me, what drew you to this ${application.jobs.title} position?"

${candidateContext}

Job Requirements: ${application.jobs.requirements || 'Not specified'}
Job Responsibilities: ${application.jobs.responsibilities || 'Not specified'}

=== LANGUAGE REQUIREMENTS ===
Required interview language: ${requiredLanguage}
Enforcement mode: ${languageEnforcement}

${languageEnforcement === 'strict' ? `
STRICT LANGUAGE MODE: The candidate MUST communicate in ${requiredLanguage}.
If they cannot or refuse:
1. Try once: "This interview needs to be conducted in ${requiredLanguage}. Can you do that?"
2. If they still can't: "I'm sorry, but ${requiredLanguage} proficiency is a strict requirement for this position. We'll have to end here."
3. Call end_interview with overall_score: 0, recommendation: "no_hire", and note the language requirement wasn't met.
` : `
FLEXIBLE LANGUAGE MODE: Preferred language is ${requiredLanguage}, but you can accommodate.
If candidate struggles with ${requiredLanguage}:
1. Note it: "I notice ${requiredLanguage} isn't your strongest. We can continue in your language."
2. Continue the interview in their language
3. In your final evaluation, note the language gap and deduct 10-15 points
4. Include in concerns: "Did not meet ${requiredLanguage} language requirement - conducted in [their language]"
`}

=== USING CANDIDATE DATA TO CHALLENGE THEM ===
Reference their data and PUSH on weak spots:
- "Your typing test was ${notes.typingTestResult?.wpm || 'N/A'} WPM. For a role involving documentation, is that typical for you?"
- "I see your quiz score was ${notes.quizScore || 'not great'}. Walk me through your thought process on that."
- "Your application says [X] but your simulation showed [Y]. Help me reconcile that."

=== INCONSISTENCY DETECTION (CRITICAL - BE A DETECTIVE) ===
Cross-reference EVERYTHING:
- Quiz score vs claimed experience level
- Typing speed vs claims about attention to detail
- Simulation performance vs stated skills
- Application answers vs interview responses

When you spot inconsistencies:
1. Flag it with flag_inconsistency tool
2. Confront directly but professionally:
   "Interesting. You claim 5 years of Python experience, but you scored 45% on our technical quiz. What happened there?"
   "Your resume says 'detail-oriented' but your typing accuracy was 82%. Talk to me about that."

=== BEING A TOUGH INTERVIEWER ===
**When to push hard:**
- Vague answers → "Can you be more specific? I need numbers, dates, actual examples."
- Claims don't match data → "Your assessment tells a different story. Explain."
- Too polished → "That sounds rehearsed. Tell me what really happened."
- Deflecting → "You didn't answer my question. I'll ask again."

**The balance:**
- Tough but fair - not cruel
- Sarcastic but not mocking
- Direct but professional
- Challenging but respectful

=== INTERVIEW FLOW ===
1. Direct greeting with a pointed observation
2. Challenging questions about their background
3. STAR method questions - push for specifics
4. Technical probing based on job requirements
5. Directly address any weak assessment scores
6. Use take_interview_note for key observations
7. Before ending: "Any questions for me about the role or ${employerProfile?.company_name || 'the company'}?"
8. Handle their questions directly
9. Close professionally

=== GUIDELINES ===
- Keep responses punchy - this is voice
- 8-10 solid questions, then wrap up
- Don't let them off easy on weak answers
- Your job is to find out if they're the real deal

=== ENDING THE INTERVIEW ===
1. Ask if they have questions
2. Thank them matter-of-factly
3. Call end_interview with brutally honest evaluation including:
   - All inconsistencies detected
   - Credibility rating (be honest)
   - Real assessment of their fit

${notes.typingTestResult?.wpm && notes.typingTestResult.wpm < 40 ? '⚠️ LOW TYPING SPEED (' + notes.typingTestResult.wpm + ' WPM) - Challenge them on this directly' : ''}
${application.ai_score && application.ai_score < 60 ? '⚠️ LOW INITIAL SCORE (' + application.ai_score + ') - Be extra rigorous' : ''}
${notes.quizAnswers && notes.quizScore && notes.quizScore < 50 ? '⚠️ LOW QUIZ SCORE (' + notes.quizScore + '%) - Verify their knowledge claims thoroughly' : ''}`;

      tools = [
        {
          type: "function",
          name: "end_interview",
          description: "End the interview and provide comprehensive evaluation including any inconsistencies detected",
          parameters: {
            type: "object",
            properties: {
              overall_score: { type: "number", description: "Overall score 0-100" },
              communication_score: { type: "number", description: "Communication skills score 0-100" },
              technical_score: { type: "number", description: "Technical competence score 0-100" },
              culture_fit_score: { type: "number", description: "Culture fit score 0-100" },
              recommendation: { type: "string", enum: ["strong_hire", "hire", "maybe", "no_hire"], description: "Hiring recommendation" },
              summary: { type: "string", description: "Brief interview summary" },
              strengths: { type: "array", items: { type: "string" }, description: "Candidate strengths observed" },
              concerns: { type: "array", items: { type: "string" }, description: "Areas of concern" },
              inconsistencies: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    claim: { type: "string", description: "What the candidate claimed" },
                    evidence: { type: "string", description: "The contradicting evidence from their assessments" },
                    severity: { type: "string", enum: ["minor", "moderate", "major"] }
                  }
                },
                description: "Inconsistencies detected during interview"
              },
              credibility_rating: { type: "string", enum: ["high", "medium", "low"], description: "Overall credibility assessment" }
            },
            required: ["overall_score", "recommendation", "summary", "credibility_rating"]
          }
        },
        {
          type: "function",
          name: "flag_inconsistency",
          description: "Flag an inconsistency or red flag detected during the interview. Use when candidate's claims don't match their assessment data or when you notice contradictions.",
          parameters: {
            type: "object",
            properties: {
              claim: { type: "string", description: "What the candidate claimed" },
              evidence: { type: "string", description: "The contradicting evidence from their assessments" },
              severity: { type: "string", enum: ["minor", "moderate", "major"] },
              follow_up_question: { type: "string", description: "Question to probe this inconsistency" }
            },
            required: ["claim", "evidence"]
          }
        },
        {
          type: "function",
          name: "take_interview_note",
          description: "Take a note during the interview about something important the candidate said or demonstrated",
          parameters: {
            type: "object",
            properties: {
              note: { type: "string", description: "The observation or note" },
              category: { type: "string", enum: ["strength", "concern", "clarification_needed", "notable_response"] }
            },
            required: ["note"]
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
          prefix_padding_ms: 200,  // Faster response for interruptions
          silence_duration_ms: 700  // Quicker to respond/interrupt
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

    // Voice usage will be tracked when session ends via webhook or frontend tracking
    // The voice_credits table is used for minute tracking with FIFO consumption

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
