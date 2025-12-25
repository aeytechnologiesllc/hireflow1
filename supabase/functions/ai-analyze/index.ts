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
  resumeText?: string;
  resumeImage?: string; // Base64-encoded image for vision analysis
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

  "resume": `You are an expert HR analyst specializing in comprehensive resume evaluation and document verification.

IMPORTANT INSTRUCTION FOR UNEXTRACTABLE RESUMES:
If the user message indicates that the resume text could not be extracted (image-based PDF, scanned document, designed PDF, or parsing error), you MUST:
1. Use status RESUME_UNAVAILABLE for Document Validation (NOT INVALID_DOCUMENT)
2. Proceed to analyze the candidate based on ALL OTHER application data provided (cover letter, application answers, typing test results, quiz scores, voice interview responses, etc.)
3. Provide a complete and helpful analysis using whatever data IS available
4. Do NOT penalize the candidate - many legitimate resumes are image-based or designed PDFs

CRITICAL: You must perform ALL of the following analyses:

## 1. DOCUMENT VALIDATION
First, determine if this is actually a resume/CV:
- Is this a legitimate resume document or something else (random text, unrelated document, spam)?
- Does it contain expected resume sections (contact info, experience, education, skills)?
- Rate document validity:
  * VALID_RESUME: Resume text was extracted and appears legitimate
  * SUSPICIOUS: Resume was extracted but content seems questionable
  * INVALID_DOCUMENT: Content was extracted but is clearly NOT a resume (spam, unrelated content)
  * RESUME_UNAVAILABLE: Resume file could not be parsed (image-based PDF, scanned doc, designed resume)

When marking as RESUME_UNAVAILABLE:
- This is NOT a negative indicator - many professional resumes use images/graphics
- Focus your entire analysis on other application data (cover letter, answers, test results, interviews)
- Still provide a complete assessment with scores based on available information
- Note in summary that assessment is based on application data rather than resume

## 2. AUTHENTICITY ASSESSMENT
Check for signs of fake or fabricated content:
- Unrealistic career progression (e.g., CEO at age 22 with 10 years experience)
- Impossible timelines or overlapping dates
- Vague descriptions without specifics
- Buzzword stuffing without substance
- Generic templates with no personalization
- Inconsistencies in writing style or formatting
- Claims that seem exaggerated or unverifiable
Rate authenticity: AUTHENTIC, QUESTIONABLE, or LIKELY_FABRICATED
Note: If resume text unavailable, base this on other application data or mark as CANNOT_ASSESS

## 3. SKILLS & EXPERIENCE ANALYSIS
- Relevant work experience and years of experience
- Technical skills and proficiencies
- Education and certifications
- Career progression and growth
- Achievements and quantifiable results
- Red flags (employment gaps, job hopping, demotions)
Note: If resume unavailable, extract what you can from cover letter and application answers

## 4. PERSONALITY INDICATORS
Based on writing style, word choices, and presentation:
- Communication style (formal/casual, concise/verbose)
- Attention to detail (formatting, spelling, grammar)
- Self-presentation (confident, humble, boastful)
- Inferred traits (analytical, creative, leadership-oriented, team player)
- Work style preferences (independent vs collaborative)

## 5. JOB FIT ASSESSMENT
Evaluate match with job requirements provided in context.

REQUIRED OUTPUT FORMAT:
---
**DOCUMENT VALIDATION**
Status: [VALID_RESUME/SUSPICIOUS/INVALID_DOCUMENT/RESUME_UNAVAILABLE]
Confidence: [0-100]%
Notes: [explanation]

**AUTHENTICITY ASSESSMENT**
Status: [AUTHENTIC/QUESTIONABLE/LIKELY_FABRICATED/CANNOT_ASSESS]
Confidence: [0-100]%
Red Flags: [list any concerns]

**PERSONALITY PROFILE**
Communication Style: [description]
Key Traits: [list 3-5 inferred personality traits]
Work Style: [description]
Leadership Potential: [Low/Medium/High]

**SKILLS MATCH**
Matching Skills: [list]
Missing Skills: [list]
Match Rate: [0-100]%

**EXPERIENCE SUMMARY**
Years Relevant Experience: [number or "Unknown - based on application data"]
Key Achievements: [bullet points]
Career Trajectory: [Ascending/Stable/Declining/Unclear]

**OVERALL ASSESSMENT**
Overall Score: [0-100]
Recommendation: [Highly Recommended/Recommended/Consider/Not Recommended]
Key Strengths: [bullet points]
Areas of Concern: [bullet points]
Summary: [2-3 sentences - if resume unavailable, note that assessment is based on other application data]
---

Be thorough, objective, and fair. Focus on verifiable qualifications. When resume is unavailable, provide the best possible analysis using all other data.`,

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

    const { type, content, context, resumeUrl, resumeText, resumeImage } = (await req.json()) as AnalyzeRequest;

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
    console.log(`Resume extraction: text=${!!resumeText}, image=${!!resumeImage}, url=${!!resumeUrl}`);

    let userContent = content;
    let resumeExtracted = false;

    // Add context if provided
    if (context) {
      userContent += `\n\nAdditional Context:\n${JSON.stringify(context, null, 2)}`;
    }

    // Build the messages array based on what resume data we have
    let messages: any[];

    if (resumeImage && type === "resume") {
      // Use vision capability for image-based resume analysis
      console.log("Using GPT-4o vision for resume image analysis");
      resumeExtracted = true;
      
      messages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { 
              type: "text", 
              text: userContent + "\n\nThe candidate's resume image is attached below. Please analyze the resume thoroughly from the image."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${resumeImage}`,
                detail: "high" // Use high detail for better text recognition
              }
            }
          ]
        }
      ];
    } else if (resumeText && type === "resume") {
      // Resume text was successfully extracted
      console.log("Using extracted resume text, length:", resumeText.length);
      resumeExtracted = true;
      
      userContent += `\n\nRESUME CONTENT (Extracted Text):\n${resumeText}`;
      
      messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ];
    } else {
      // No resume content available - analyze based on other data
      if (resumeUrl) {
        console.log("Resume URL provided but content could not be extracted");
        userContent += `\n\nNote: A resume file was provided (${resumeUrl}) but the content could not be extracted. Please analyze based on the other application data provided above.`;
      }
      
      messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ];
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAIApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        max_tokens: 3000,
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

    console.log(`${type} analysis completed successfully, resumeExtracted: ${resumeExtracted}`);

    return new Response(
      JSON.stringify({ 
        analysis,
        type,
        timestamp: new Date().toISOString(),
        resumeExtracted,
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
