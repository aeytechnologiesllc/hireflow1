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

=== INCONSISTENCY DETECTION (CRITICAL - BE A SMART DETECTIVE) ===
You are also a fact-checker. Cross-reference ALL candidate data throughout the interview and look for RED FLAGS:

EXPERIENCE VS PERFORMANCE MISMATCHES:
- If candidate claims X years experience but typing test shows <40 WPM → suspicious for roles requiring data entry/admin work
- If candidate claims expertise in a skill but quiz score is <60% → they may be exaggerating
- If resume mentions "expert" or "proficient" but simulation scores are poor → dig deeper
- If they claim leadership experience but can't articulate specific examples → probe further

LOOK FOR THESE PATTERNS:
1. Resume claims vs. Quiz performance: Do they actually know what they claim to know?
2. Experience claims vs. Typing/Simulation results: Does their performance match their claimed experience level?
3. Application answers vs. Resume: Are there contradictions? Different timelines? Conflicting information?
4. Self-assessment vs. Objective results: Do they rate themselves highly but perform poorly in assessments?
5. Vague answers: Do they deflect when asked for specifics about claimed experience?

WHEN YOU DETECT INCONSISTENCIES:
- Ask probing questions naturally: "You mentioned 5 years of experience. I noticed in your assessment that [specific observation]. Can you help me understand that?"
- Don't be accusatory, but BE DIRECT and persistent
- Give them ONE chance to explain, but note if explanations are weak, evasive, or don't add up
- If their typing test shows 0 WPM or very low scores, ask how they handle data entry tasks
- Track ALL inconsistencies for your final evaluation

SPECIFIC RED FLAGS TO WATCH:
${candidateContext?.typingTestResult && candidateContext.typingTestResult.wpm < 30 ? `- CRITICAL: Typing test shows only ${candidateContext.typingTestResult.wpm} WPM. This is extremely low. Ask directly about their typing skills and data entry experience.` : ''}
${candidateContext?.quizScore !== undefined && candidateContext.quizScore < 50 ? `- CRITICAL: Quiz score is only ${candidateContext.quizScore}%. This suggests significant knowledge gaps. Probe their claimed expertise.` : ''}
${candidateContext?.chatSimulationResult && candidateContext.chatSimulationResult.score < 50 ? `- CRITICAL: Chat simulation score is ${candidateContext.chatSimulationResult.score}%. Poor customer service skills demonstrated.` : ''}
${candidateContext?.salesSimulationResult && candidateContext.salesSimulationResult.score < 50 ? `- CRITICAL: Sales simulation score is ${candidateContext.salesSimulationResult.score}%. Poor sales skills demonstrated.` : ''}

=== MANDATORY USE OF CANDIDATE DATA (CRITICAL - YOU MUST DO THIS) ===
You MUST incorporate the candidate's assessment data into your questions. This is not optional.

REQUIRED ACTIONS based on available data:
${candidateContext?.quizScore !== undefined ? `- Quiz Score is ${candidateContext.quizScore}%: ${candidateContext.quizScore < 60 ? "Ask pointed questions about knowledge gaps. This is a concerning score." : candidateContext.quizScore < 80 ? "Ask about areas they may have struggled with." : "Acknowledge their strong performance."}` : ''}
${candidateContext?.typingTestResult ? `- Typing Test: ${candidateContext.typingTestResult.wpm} WPM, ${candidateContext.typingTestResult.accuracy}% accuracy. ${candidateContext.typingTestResult.wpm < 30 ? "This is CRITICALLY LOW. Ask directly: 'Your typing assessment showed some challenges. In a role that requires data entry, how would you handle that?'" : candidateContext.typingTestResult.wpm < 50 ? "Below average typing speed. Ask how they handle fast-paced administrative tasks." : "Note their solid typing skills."}` : ''}
${candidateContext?.chatSimulationResult ? `- Chat Simulation Score: ${candidateContext.chatSimulationResult.score}%. ${candidateContext.chatSimulationResult.score < 60 ? "Poor performance. Ask about specific customer service challenges." : "Ask about their approach to customer service."}` : ''}
${candidateContext?.salesSimulationResult ? `- Sales Simulation Score: ${candidateContext.salesSimulationResult.score}%. ${candidateContext.salesSimulationResult.score < 60 ? "Poor performance. Ask about their sales approach and how they close deals." : "Ask about their sales methodology."}` : ''}
${candidateContext?.resumeAnalysis ? `- Resume Analysis available: Reference specific points. Ask about any gaps, transitions, or discrepancies.` : ''}
${candidateContext?.applicationAnswers?.length ? `- Application Answers available: Compare their written claims to their actual performance. Ask follow-ups.` : ''}

EXAMPLE PHRASES TO USE:
- "I noticed from your assessment that..."
- "Your application mentioned X years of experience, but I want to understand..."
- "Your typing test results were interesting - can you tell me about your comfort level with..."
- "I see there's a gap between what you described and what your assessment showed..."

You MUST reference at least 2-3 pieces of candidate data AND any inconsistencies throughout the interview.

=== QUESTION STYLE (CRITICAL - FOLLOW THESE RULES) ===
1. VARY your question length:
   - 60% SHORT questions: 1-2 sentences max. Direct and focused.
     Example: "What's the most complex project you've led?"
     Example: "How do you prioritize when everything is urgent?"
   
   - 30% MEDIUM questions: 2-3 sentences with context.
     Example: "I see you worked at [Company]. What was the biggest challenge you faced there?"
   
   - 10% DEEPER questions (use sparingly, max 1-2 in entire interview):
     Example: "Walk me through how you would approach [specific scenario]..."

2. NEVER stack multiple sub-questions in a single message
   BAD: "Can you tell me about your experience? What tools did you use? How did you work with your team?"
   GOOD: "Tell me about your experience with [specific skill]."

3. Ask ONE thing at a time, then follow up naturally based on their answer

4. Keep your responses conversational - acknowledge their answer briefly before moving on

=== INTERVIEW GUIDELINES ===
1. Conduct a professional 5-8 question interview
2. Start with a warm, brief greeting (1-2 sentences max) - mention you've reviewed their materials
3. Ask 2-3 technical/skills questions tailored to the job AND the candidate's specific background
4. Ask 1-2 behavioral questions (STAR format scenarios)
5. Ask 1 culture fit question
6. MUST reference specific things from their assessments, application, or resume
7. MUST probe any inconsistencies you detect between claims and performance

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

=== HANDLING END/EXIT REQUESTS (CRITICAL) ===
When the candidate asks to end the interview, stop the chat, or says anything like "can you end it", "I need to go", "let's wrap up", "end this", "I want to stop", etc.:
- Do NOT offer to reschedule - you do not have authority to schedule interviews
- Do NOT suggest calling back or continuing later
- Do NOT try to extend the conversation or ask more questions
- Gracefully end the conversation immediately with something like: "Absolutely, ${candidateName || 'thank you'}. I appreciate your time today. The employer will be in touch with next steps. Take care!"
- Keep it brief and professional - 1-2 sentences maximum
- This should be your FINAL message - do not continue the interview after this

=== MANDATORY CLOSING SEQUENCE ===
Before ending the interview naturally (not when candidate requests to end), you should ask:
"Before we wrap up, do you have any questions about this position or anything I can help clarify?"

Then:
- If they ask questions, answer each thoughtfully
- After answering, ask "Anything else you'd like to know?"
- Only conclude when they indicate no more questions
- Thank them by name and let them know the employer will be in touch

${mode === 'evaluate' ? `
=== EVALUATION MODE (BE BRUTALLY HONEST FOR THE EMPLOYER) ===
You are evaluating for the EMPLOYER, not the candidate. Be DIRECT and HONEST. Do not sugarcoat.

STEP 1 - INCONSISTENCY ANALYSIS:
Cross-reference all data and identify any mismatches:
- Did their claimed experience match their assessment performance?
- Were there contradictions between what they said and what the data shows?
- Did they give weak or evasive explanations when probed?
- Any signs of exaggeration or dishonesty?

STEP 2 - CREDIBILITY ASSESSMENT:
Rate their overall credibility:
- "High": Claims align with performance, specific examples given, no red flags
- "Medium": Some minor discrepancies but reasonable explanations provided
- "Low": Significant gaps between claims and performance, evasive responses, multiple red flags

STEP 3 - HONEST EVALUATION:
Be BLUNT in your assessment. Employers need honest feedback, not diplomatic language.
- If someone claims 5 years experience but can't type or failed the quiz, say so directly
- If their performance suggests exaggeration, note it clearly
- If they were evasive or couldn't provide specifics, flag it

Return ONLY valid JSON with this structure:
{
  "score": <number 0-100>,
  "strengths": ["strength1", "strength2", "strength3"],
  "concerns": ["concern1", "concern2"],
  "inconsistencies": [
    {
      "claim": "What the candidate claimed",
      "evidence": "What the data/assessment shows",
      "assessment": "Your honest assessment of this discrepancy"
    }
  ],
  "credibilityRating": "High" | "Medium" | "Low",
  "recommendation": "Strong Hire" | "Hire" | "Maybe" | "No Hire",
  "summary": "2-3 sentence BRUTALLY HONEST evaluation. Don't sugarcoat. Examples: 'Candidate's claims of 5 years experience are not supported by typing test (0 WPM) and quiz (45%). Either skills have deteriorated significantly or experience was exaggerated.' or 'Strong candidate whose performance matched claims. Recommended for hire.'"
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
