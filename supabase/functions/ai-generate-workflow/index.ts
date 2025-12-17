import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WorkflowRequest {
  title: string;
  description: string;
  company?: string;
  employment_type?: string;
  location?: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'intense';
  require_resume?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: WorkflowRequest = await req.json();
    const { title, description, company, employment_type, location, difficulty, require_resume } = request;

    if (!title || !description) {
      return new Response(
        JSON.stringify({ error: 'Title and description are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const difficultyConfig = {
      easy: {
        questionCount: "5-6",
        quizRange: "8-10",
        quizMin: 8,
        quizMax: 10,
        stepCount: "1-2",
        description: "Quick screening with essential checks"
      },
      medium: {
        questionCount: "5-7",
        quizRange: "12-15",
        quizMin: 12,
        quizMax: 15,
        stepCount: "2-3",
        description: "Balanced screening with thorough evaluation"
      },
      hard: {
        questionCount: "7-10",
        quizRange: "18-25",
        quizMin: 18,
        quizMax: 25,
        stepCount: "3-5",
        description: "Intensive screening with deep assessments"
      },
      intense: {
        questionCount: "10-15",
        quizRange: "25-30",
        quizMin: 25,
        quizMax: 30,
        stepCount: "4-6",
        description: "Maximum rigor for critical & executive roles"
      }
    };

    const config = difficultyConfig[difficulty];
    const randomSeed = Date.now() + Math.random().toString(36).substring(7);

    // Detect creative/technical roles that require portfolio
    const creativeKeywords = [
      'designer', 'design', 'creative', 'artist', 'illustrator', 
      'ui', 'ux', 'graphic', 'visual', 'animator', 'motion',
      'photographer', 'videographer', 'content creator', 'editor',
      'developer', 'engineer', 'programmer', 'architect', 'frontend',
      'backend', 'fullstack', 'full-stack', 'software', 'web developer',
      'portfolio', 'creative director', '3d', 'cad', 'drafter',
      'art director', 'brand', 'marketing designer', 'product designer',
      'game designer', 'level designer', 'character artist', 'concept artist'
    ];

    const titleLower = title.toLowerCase();
    const descLower = description.toLowerCase();
    const isCreativeRole = creativeKeywords.some(kw => 
      titleLower.includes(kw) || descLower.includes(kw)
    );

    console.log(`Role detection - Title: "${title}", isCreativeRole: ${isCreativeRole}`);

    const portfolioInstruction = isCreativeRole 
      ? `\n\n⚠️⚠️⚠️ MANDATORY PORTFOLIO REQUIREMENT ⚠️⚠️⚠️
This is a CREATIVE/TECHNICAL role (detected from job title/description).
You MUST include "portfolio_upload" as one of the workflow_steps.
This is NON-NEGOTIABLE for this type of position.`
      : '';

    const prompt = `You are AVA, an expert AI hiring assistant. Generate a comprehensive hiring workflow for this job.${portfolioInstruction}

⚠️⚠️⚠️ CRITICAL - QUESTION COUNT RANGE ENFORCEMENT ⚠️⚠️⚠️
The user selected ${difficulty.toUpperCase()} difficulty.
You MUST generate a number of quiz questions strictly BETWEEN ${config.quizMin} and ${config.quizMax} (inclusive).

Job Title: ${title}
Description: ${description}
Company: ${company || 'Not provided - DO NOT include company name in any questions'}
Employment Type: ${employment_type || 'Full-time'}
Location: ${location || 'Not specified'}
Screening Difficulty: ${difficulty.toUpperCase()} (${config.description})

**PHASE 1: Application Questions**
Generate ${config.questionCount} essential application questions including:
- Full Name (id: "q1", type: "text", required: true)
- Email Address (id: "q2", type: "email", required: true)
- Phone Number (id: "q3", type: "phone", required: true)
- Current/Most Recent Job Title (id: "q4", type: "text", required: true)
- Years of Experience (id: "q5", type: "text", required: true)
- Upload Resume (id: "qResume", type: "file", required: ${require_resume !== false})

${difficulty === 'medium' || difficulty === 'hard' || difficulty === 'intense' ? `
Add motivation questions like:
- "Why are you interested in this ${title} position${company ? ` at ${company}` : ''}?" (type: "textarea")
- "What makes you the ideal candidate?" (type: "textarea")

⚠️ CRITICAL: If company name is "Not provided" or not specified above, do NOT use placeholder text like "[Company Name]", "Placeholder", or brackets in questions. Simply omit the company name entirely from questions.
` : ''}

**PHASE 2: Timed Quiz (${config.quizMin}-${config.quizMax} questions)**
Generate a MIX of question types:
- multiple_choice: 4 options, 1 correct (15-30 seconds)
- true_false: True/False options (10-15 seconds)
- short_answer: Brief text response (30-45 seconds)
- personality: Behavioral/work style (20-30 seconds)
- situational: Job scenario choices (25-35 seconds)

Each quiz question must have: id, type, question, options (if applicable), correct_answer, time_limit_seconds, category

**PHASE 3: Workflow Steps (${config.stepCount} steps)**
Choose appropriate steps based on the job role:
- typing_test: For customer service/data entry roles (config: {"min_wpm": 40})
- video_message: For communication-focused roles (config: {"min_duration_seconds": 30, "max_duration_seconds": 60})
- portfolio_upload: For creative/technical roles (config: {"portfolio_type": "general"})
- chat_simulation: For customer support roles (config: {"scenario": "Handle a customer complaint"})
- sales_simulation: For sales, business development, and account management roles - tests pitching and objection handling (config: {"product": "enterprise solution"})

⚠️ CRITICAL: ALWAYS include EXACTLY ONE final interview step ⚠️

**The FINAL step MUST be:**
- chat_interview: Text-based interview with Ava (config: {"focus": "behavioral"})

NOTE: "Ava Interview" (voice_interview) is a PREMIUM post-review feature that employers can optionally add. 
It is NOT included in the generated workflow_steps - employers manually add it if they want it.
Ava Interview appears AFTER the Review phase, allowing employers to selectively interview candidates who pass review.

The chat_interview is the culminating assessment where Ava has access to ALL candidate data from previous phases.
Place chat_interview AFTER all other workflow steps.

Random Seed: ${randomSeed}

Return ONLY valid JSON:
{
  "application_questions": [
    {"id": "q1", "type": "text", "question": "Full Name", "required": true, "placeholder": "Enter your full name"}
  ],
  "quiz_questions": [
    {"id": "quiz1", "type": "multiple_choice", "question": "...", "options": ["A", "B", "C", "D"], "correct_answer": "A", "time_limit_seconds": 20, "category": "technical"}
  ],
  "workflow_steps": [
    {"id": "step1", "type": "typing_test", "title": "Typing Speed Test", "description": "...", "required": true, "config": {"min_wpm": 40}},
    {"id": "stepFinal", "type": "chat_interview", "title": "Interview with Ava", "description": "Final interview with Ava", "required": true, "config": {"focus": "behavioral"}}
  ]
}

IMPORTANT: 
- The workflow_steps array MUST end with chat_interview. This is mandatory.
- Do NOT include voice_interview in workflow_steps - it's a premium post-review feature added manually by employers.`;

    console.log("Generating workflow for:", title, "with difficulty:", difficulty);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are AVA, an expert AI hiring assistant. Generate comprehensive hiring workflows. Always respond with valid JSON only." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
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

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error("No content in AI response");
    }

    let workflowData;
    try {
      workflowData = JSON.parse(content);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      throw new Error("Failed to parse workflow data");
    }

    console.log("Generated workflow:", {
      application_questions: workflowData.application_questions?.length || 0,
      quiz_questions: workflowData.quiz_questions?.length || 0,
      workflow_steps: workflowData.workflow_steps?.length || 0
    });

    return new Response(
      JSON.stringify(workflowData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("Error in ai-generate-workflow:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
