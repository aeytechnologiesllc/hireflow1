import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get("OPENAI_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AnalyzeRequest {
  type: "application" | "job-bias" | "interview" | "phase" | "resume";
  content: string;
  context?: Record<string, unknown>;
  resumeUrl?: string;
}

const systemPrompts: Record<string, string> = {
  "application": `You are an expert HR analyst. Analyze the provided job application and resume.
Evaluate the candidate based on:
1. Skills match with job requirements
2. Experience relevance
3. Education and certifications
4. Overall fit for the role

Provide a structured analysis with:
- Overall Score (0-100)
- Key Strengths (bullet points)
- Areas of Concern (bullet points)
- Recommendation (Highly Recommended, Recommended, Consider, Not Recommended)
- Brief Summary (2-3 sentences)

Be objective, fair, and focus on qualifications rather than personal characteristics.`,

  "resume": `You are an expert HR analyst specializing in resume evaluation.
Analyze the provided resume content against the job requirements.

Evaluate:
1. Relevant work experience and years of experience
2. Technical skills and proficiencies
3. Education and certifications
4. Career progression and growth
5. Achievements and quantifiable results
6. Potential red flags (gaps, job hopping, etc.)

Provide a structured analysis with:
- Overall Score (0-100) - based on match with job requirements
- Experience Summary (brief overview of relevant experience)
- Key Strengths (3-5 bullet points)
- Areas of Concern (bullet points, if any)
- Skills Match (list of matching skills vs required skills)
- Recommendation (Highly Recommended, Recommended, Consider, Not Recommended)
- Brief Summary (2-3 sentences)

Be objective and fair, focusing only on professional qualifications.`,

  "job-bias": `You are an expert in inclusive hiring practices and bias detection.
Analyze the provided job posting for potential bias or exclusionary language.

Check for:
1. Gender-coded language (e.g., "rockstar", "ninja", "aggressive")
2. Age-related bias (e.g., "digital native", "energetic")
3. Unnecessary requirements that may exclude qualified candidates
4. Inclusive language usage
5. Accessibility considerations

Provide:
- Bias Score (0-100, where 100 is completely unbiased)
- Issues Found (bullet points with specific examples)
- Suggested Improvements (bullet points)
- Rewritten sections if needed

Be constructive and provide actionable feedback.`,

  "interview": `You are an expert interviewer and hiring consultant.
Based on the job description and candidate profile provided, generate relevant interview questions.

Generate:
1. 3 Technical/Skills-based questions
2. 2 Behavioral questions (STAR format prompts)
3. 2 Culture fit questions
4. 1 Problem-solving scenario

For each question, provide:
- The question itself
- What it assesses
- What to look for in a good answer

Make questions specific to the role and candidate background.`,

  "phase": `You are an expert at evaluating candidate progress through hiring phases.
Analyze the candidate's current status and performance in the hiring process.

Evaluate:
1. Performance in current phase
2. Readiness for next phase
3. Red flags or concerns
4. Positive indicators

Provide:
- Phase Score (0-100)
- Key Observations
- Recommended Next Steps
- Risk Assessment (Low, Medium, High)

Be thorough but concise in your analysis.`,
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!openAIApiKey) {
      console.error("OpenAI API key is not configured");
      return new Response(
        JSON.stringify({ error: "OpenAI API key is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { type, content, context } = (await req.json()) as AnalyzeRequest;

    if (!type || !content) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: type and content" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = systemPrompts[type];
    if (!systemPrompt) {
      return new Response(
        JSON.stringify({ error: `Invalid analysis type: ${type}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${type} analysis request`);

    const userContent = context 
      ? `${content}\n\nAdditional Context:\n${JSON.stringify(context, null, 2)}`
      : content;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAIApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Failed to process AI analysis" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const analysis = data.choices[0].message.content;

    console.log(`${type} analysis completed successfully`);

    return new Response(
      JSON.stringify({ 
        analysis,
        type,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in ai-analyze function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
