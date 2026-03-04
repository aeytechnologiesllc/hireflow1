import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface JobContentRequest {
  field: string;
  title: string;
  department?: string;
  experience_level?: string;
  job_type?: string;
  location?: string;
  existingContent?: string;
  description?: string;
  responsibilities?: string;
  requirements?: string;
  skills_required?: string | string[];
}

function buildContextBlock(fields: Record<string, string | undefined>): string {
  const parts: string[] = [];
  if (fields.description) parts.push(`Job Description:\n${fields.description}`);
  if (fields.responsibilities) parts.push(`Responsibilities:\n${fields.responsibilities}`);
  if (fields.requirements) parts.push(`Requirements:\n${fields.requirements}`);
  if (fields.skills_required) parts.push(`Required Skills:\n${fields.skills_required}`);
  if (parts.length === 0) return "";
  return `\n\nHere is context from the job posting so far. Use this to generate content that is specifically aligned and cohesive with what has already been written:\n\n${parts.join("\n\n")}\n`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: JobContentRequest = await req.json();
    const { field, title, department, experience_level, job_type, location, existingContent, description, responsibilities, requirements, skills_required } = body;
    const skillsStr = Array.isArray(skills_required) ? skills_required.join(", ") : skills_required;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    let prompt = "";
    let systemPrompt = "You are an expert HR professional and copywriter specializing in creating compelling, inclusive job postings. Write content that is professional, engaging, and free from bias. Use clear, action-oriented language. CRITICAL: Never use markdown formatting - no asterisks (*), no bold (**), no headers (#). Write in clean, plain text only.";

    if (field === "full") {
      prompt = `Generate a complete job posting for the following position:

Title: ${title}
${department ? `Department: ${department}` : ""}
${experience_level ? `Experience Level: ${experience_level}` : ""}
${job_type ? `Job Type: ${job_type}` : ""}
${location ? `Location: ${location}` : ""}

Return a JSON object with these fields:
- description: A compelling 2-3 paragraph description of the role and opportunity (plain text, no markdown)
- responsibilities: 5-7 bullet points of key responsibilities. Each line starting with "• " and an action verb. NO markdown (no **, no *, no bold).
- requirements: 5-7 bullet points of required qualifications. Each line starting with "• ". NO markdown (no **, no *, no bold). NO category labels.
- skills: Comma-separated list of 6-10 relevant technical and soft skills
- benefits: Comma-separated list of 5-8 common benefits

CRITICAL: All text must be clean plain text. NO markdown formatting whatsoever.
Return ONLY valid JSON, no markdown code blocks.`;
    } else if (field === "description") {
      prompt = `Write a compelling 2-3 paragraph job description for a ${title} position${department ? ` in ${department}` : ""}${experience_level ? ` at ${experience_level} level` : ""}.

Focus on:
- What makes this role exciting
- The team and culture
- Impact the person will have
- Growth opportunities

${existingContent ? `Improve upon this existing content: ${existingContent}` : ""}

Return only the description text, no headers or formatting.`;
    } else if (field === "responsibilities") {
      prompt = `Write 5-7 key responsibilities for a ${title} position${department ? ` in ${department}` : ""}.

Each responsibility should:
- Start with an action verb
- Be specific and measurable
- Focus on outcomes and impact

${existingContent ? `Improve upon these existing responsibilities: ${existingContent}` : ""}
${buildContextBlock({ description })}
FORMATTING RULES (MUST FOLLOW):
- Each responsibility on its own line starting with "• "
- NO markdown formatting whatsoever (no **, no *, no #, no bold)
- NO category labels or headers
- Clean plain text only

Example of CORRECT format:
• Lead a team of designers to deliver projects on time
• Collaborate with stakeholders to define requirements
• Oversee quality assurance processes`;
    } else if (field === "requirements") {
      prompt = `Write 5-7 requirements for a ${title} position${experience_level ? ` at ${experience_level} level` : ""}.

Include:
- Required education/experience
- Technical skills
- Soft skills
- Any certifications

${existingContent ? `Improve upon these existing requirements: ${existingContent}` : ""}
${buildContextBlock({ description, responsibilities })}
FORMATTING RULES (MUST FOLLOW):
- Each requirement on its own line starting with "• "
- NO markdown formatting whatsoever (no **, no *, no #, no bold)
- NO category labels like "Education:" or "Skills:"
- Clean plain text only

Example of CORRECT format:
• Bachelor's degree in Computer Science or related field
• 5+ years of experience in software development
• Strong communication and leadership skills`;
    } else if (field === "skills_required") {
      prompt = `List 6-10 relevant skills for a ${title} position${department ? ` in ${department}` : ""}.

Include both technical and soft skills appropriate for ${experience_level || "mid-level"} candidates.

${existingContent ? `Build upon these existing skills: ${existingContent}` : ""}
${buildContextBlock({ description, responsibilities, requirements })}
Return as a comma-separated list only.`;
    } else if (field === "benefits") {
      prompt = `List 5-8 attractive benefits for a ${title} position.

Include a mix of:
- Health and wellness
- Financial benefits
- Work-life balance
- Professional development
- Unique perks

${existingContent ? `Build upon these existing benefits: ${existingContent}` : ""}
${buildContextBlock({ description })}
Return as a comma-separated list only.`;
    }

    console.log("Generating job content for field:", field);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content generated");
    }

    console.log("Content generated successfully for field:", field);

    // Parse response based on field type
    if (field === "full") {
      try {
        // Try to parse as JSON
        const cleanedContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(cleanedContent);
        return new Response(
          JSON.stringify(parsed),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (e) {
        // If parsing fails, return the raw content
        return new Response(
          JSON.stringify({ description: content }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ content }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating job content:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
