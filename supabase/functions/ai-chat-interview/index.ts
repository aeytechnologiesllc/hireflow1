import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface CandidateContext {
  applicationAnswers?: Array<{ question: string; answer: string }>;
  resumeAnalysis?: string;
  quizScore?: number;
  quizSummary?: string;
  typingTestResult?: { wpm: number; accuracy: number };
  chatSimulationResult?: { score: number; summary: string };
  salesSimulationResult?: { score: number; summary: string };
  videoIntroUrl?: string;
  completedPhases?: string[];
}

interface ChatInterviewRequest {
  mode: "start" | "respond" | "evaluate";
  jobTitle: string;
  jobDescription: string;
  jobDetails?: {
    requirements?: string;
    responsibilities?: string;
    benefits?: string[];
    skills?: string[];
    location?: string;
    jobType?: string;
  };
  candidateName?: string;
  candidateContext?: CandidateContext;
  messages?: ChatMessage[];
  userMessage?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: ChatInterviewRequest = await req.json();
    const { mode, jobTitle, jobDescription, jobDetails, candidateName, candidateContext, messages = [], userMessage } = request;

    console.log("Chat interview request:", { mode, jobTitle, candidateName, messageCount: messages.length, hasContext: !!candidateContext });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build candidate context section
    let candidateContextSection = "";
    if (candidateContext) {
      candidateContextSection = `
=== CANDIDATE PROFILE (Use this to personalize your questions) ===
`;
      if (candidateContext.applicationAnswers?.length) {
        candidateContextSection += `
Application Responses:
${candidateContext.applicationAnswers.map(qa => `Q: ${qa.question}\nA: ${qa.answer}`).join('\n\n')}
`;
      }
      if (candidateContext.resumeAnalysis) {
        candidateContextSection += `
Resume Analysis: ${candidateContext.resumeAnalysis}
`;
      }
      if (candidateContext.quizScore !== undefined) {
        candidateContextSection += `
Quiz Performance: ${candidateContext.quizScore}%${candidateContext.quizSummary ? ` - ${candidateContext.quizSummary}` : ''}
`;
      }
      if (candidateContext.typingTestResult) {
        candidateContextSection += `
Typing Test: ${candidateContext.typingTestResult.wpm} WPM, ${candidateContext.typingTestResult.accuracy}% accuracy
`;
      }
      if (candidateContext.chatSimulationResult) {
        candidateContextSection += `
Chat Simulation Score: ${candidateContext.chatSimulationResult.score}% - ${candidateContext.chatSimulationResult.summary}
`;
      }
      if (candidateContext.salesSimulationResult) {
        candidateContextSection += `
Sales Simulation Score: ${candidateContext.salesSimulationResult.score}% - ${candidateContext.salesSimulationResult.summary}
`;
      }
      if (candidateContext.completedPhases?.length) {
        candidateContextSection += `
Completed Phases: ${candidateContext.completedPhases.join(', ')}
`;
      }
    }

    // Build job details section
    let jobDetailsSection = "";
    if (jobDetails) {
      if (jobDetails.requirements) jobDetailsSection += `\nJob Requirements: ${jobDetails.requirements}`;
      if (jobDetails.responsibilities) jobDetailsSection += `\nJob Responsibilities: ${jobDetails.responsibilities}`;
      if (jobDetails.benefits?.length) jobDetailsSection += `\nBenefits: ${jobDetails.benefits.join(', ')}`;
      if (jobDetails.skills?.length) jobDetailsSection += `\nRequired Skills: ${jobDetails.skills.join(', ')}`;
      if (jobDetails.location) jobDetailsSection += `\nLocation: ${jobDetails.location}`;
      if (jobDetails.jobType) jobDetailsSection += `\nJob Type: ${jobDetails.jobType}`;
    }

    const systemPrompt = `You are a professional interviewer conducting a job interview for ${jobTitle}. You are warm, professional, thorough, and engaging. Never reveal that you are an AI.

=== JOB INFORMATION ===
Job Position: ${jobTitle}
Job Description: ${jobDescription}
${jobDetailsSection}

Candidate Name: ${candidateName || "Candidate"}
${candidateContextSection}

=== QUESTION STYLE (CRITICAL - FOLLOW THESE RULES) ===
1. VARY your question length:
   - 60% SHORT questions: 1-2 sentences max. Direct and focused.
     Example: "What's the most complex project you've led?"
     Example: "How do you prioritize when everything is urgent?"
     Example: "Tell me about a time you failed."
   
   - 30% MEDIUM questions: 2-3 sentences with context.
     Example: "I see you worked at [Company]. What was the biggest challenge you faced there, and how did you handle it?"
   
   - 10% DEEPER questions (use sparingly, max 1-2 in entire interview):
     Example: "Walk me through how you would approach [specific scenario relevant to the role]..."

2. NEVER stack multiple sub-questions in a single message
   BAD: "Can you tell me about your experience? What tools did you use? How did you work with your team? What challenges did you face?"
   GOOD: "Tell me about your experience with [specific skill]."

3. Ask ONE thing at a time, then follow up naturally based on their answer

4. Keep your responses conversational - acknowledge their answer briefly before moving on

=== INTERVIEW GUIDELINES ===
1. Conduct a professional 5-8 question interview
2. Start with a warm, brief greeting (1-2 sentences max)
3. Ask 2-3 technical/skills questions tailored to the job AND the candidate's background
4. Ask 1-2 behavioral questions (STAR format scenarios)
5. Ask 1 culture fit question
6. Reference specific things from their application or resume when relevant

=== CONVERSATION STYLE ===
- This is a back-and-forth conversation - allow natural dialogue flow
- If the candidate asks a question at ANY point, answer it naturally before continuing
- Acknowledge their answers briefly (1 sentence max) before moving to the next question
- Ask relevant follow-up questions when their answers warrant deeper exploration
- If a candidate seems unsure, offer clarification
- Use the candidate's name occasionally
- Keep your responses concise - interviewers don't give speeches

=== HANDLING CANDIDATE QUESTIONS ===
When the candidate asks questions, you CAN answer about:
- Job responsibilities and day-to-day tasks (from the job description)
- Required skills and qualifications
- Team structure and work environment (general terms)
- Growth opportunities and career path
- The hiring process
- General company culture based on the job posting

For questions you CANNOT answer (politely defer):
- Specific salary or compensation: "The employer will discuss compensation details with successful candidates."
- Exact start dates: "The employer will confirm timing during final discussions."
- Specific benefits details: "HR will provide comprehensive benefits information."
- Anything not in the job description: "I'd recommend asking that to the hiring manager directly."

After answering their question, smoothly transition back to the interview.

=== MANDATORY CLOSING SEQUENCE ===
Before ending the interview, you MUST ask:
"Before we wrap up, do you have any questions about this position or anything I can help clarify?"

Then:
- If they ask questions, answer each thoughtfully
- After answering, ask "Anything else you'd like to know?"
- Only conclude when they indicate no more questions
- Thank them by name and let them know the employer will be in touch

${mode === 'evaluate' ? `
=== EVALUATION MODE ===
Review ALL the candidate's responses and provide a comprehensive evaluation.
Consider their application materials, assessment results, and interview responses.
Return ONLY valid JSON with this structure:
{
  "score": <number 0-100>,
  "strengths": ["strength1", "strength2", "strength3"],
  "concerns": ["concern1", "concern2"],
  "recommendation": "Strong Hire" | "Hire" | "Maybe" | "No Hire",
  "summary": "2-3 sentence evaluation summary"
}
` : ''}`;

    let userContent = "";
    
    if (mode === "start") {
      userContent = "Start the interview with a brief, warm greeting and your first question. Keep the greeting to 1-2 sentences, then ask a short, focused opening question.";
    } else if (mode === "respond") {
      userContent = userMessage || "";
    } else if (mode === "evaluate") {
      userContent = `Please evaluate all the candidate's responses from this interview and provide a comprehensive assessment. The interview conversation is in the message history.`;
    }

    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: userContent }
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: apiMessages,
        stream: mode !== "evaluate",
        ...(mode === "evaluate" && { response_format: { type: "json_object" } })
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add more credits." }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    // For evaluation mode, return JSON directly
    if (mode === "evaluate") {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      console.log("Evaluation response:", content);
      
      try {
        const evaluation = JSON.parse(content);
        return new Response(
          JSON.stringify(evaluation),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch {
        return new Response(
          JSON.stringify({ 
            score: 70, 
            strengths: ["Completed interview"], 
            concerns: ["Unable to parse detailed evaluation"],
            recommendation: "Maybe",
            summary: content 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // For start/respond modes, stream the response
    console.log("Streaming interview response");
    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });

  } catch (error) {
    console.error("Error in ai-chat-interview:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
