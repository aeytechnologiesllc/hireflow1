import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  callOpenAIChat,
  callOpenAIJson,
  requireJsonKeys,
} from "../_shared/openai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_MODEL = Deno.env.get("OPENAI_JOB_MODEL") || "gpt-5.4";

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
  guided_setup?: {
    job_family?: string;
    urgency?: string;
    must_haves?: string;
    deal_breakers?: string;
    certifications?: string;
    schedule_details?: string;
    language_requirements?: string;
    work_authorization?: string;
    travel_requirement?: string;
    compensation_guidance?: string;
    portfolio_preference?: string;
    customer_facing?: boolean;
  };
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

function buildGuidedSetupBlock(guidedSetup?: JobContentRequest["guided_setup"]) {
  if (!guidedSetup) {
    return "";
  }

  const parts = [
    guidedSetup.job_family ? `Job family: ${guidedSetup.job_family}` : null,
    guidedSetup.urgency ? `Hiring pace: ${guidedSetup.urgency}` : null,
    guidedSetup.must_haves ? `Must-haves: ${guidedSetup.must_haves}` : null,
    guidedSetup.deal_breakers ? `Deal-breakers: ${guidedSetup.deal_breakers}` : null,
    guidedSetup.certifications ? `Certifications/licenses: ${guidedSetup.certifications}` : null,
    guidedSetup.schedule_details ? `Schedule/shift details: ${guidedSetup.schedule_details}` : null,
    guidedSetup.language_requirements ? `Language requirements: ${guidedSetup.language_requirements}` : null,
    guidedSetup.work_authorization ? `Work authorization: ${guidedSetup.work_authorization}` : null,
    guidedSetup.travel_requirement ? `Travel requirement: ${guidedSetup.travel_requirement}` : null,
    guidedSetup.compensation_guidance ? `Compensation guidance: ${guidedSetup.compensation_guidance}` : null,
    guidedSetup.portfolio_preference ? `Portfolio preference: ${guidedSetup.portfolio_preference}` : null,
    typeof guidedSetup.customer_facing === "boolean" ? `Customer-facing role: ${guidedSetup.customer_facing ? "yes" : "no"}` : null,
  ].filter(Boolean);

  if (parts.length === 0) {
    return "";
  }

  return `\n\nUse the employer's guided setup answers as hard context when writing the job post:\n${parts.map((part) => `- ${part}`).join("\n")}\n`;
}

function buildConstraintReminder(guidedSetup?: JobContentRequest["guided_setup"]) {
  if (!guidedSetup) {
    return "";
  }

  const reminders: string[] = [];

  if (guidedSetup.must_haves) {
    reminders.push("Make the employer's must-haves unmistakably clear in the requirements and the overall positioning of the role.");
  }
  if (guidedSetup.deal_breakers) {
    reminders.push("Surface the deal-breakers cleanly so unqualified candidates can self-select out early.");
  }
  if (guidedSetup.certifications || guidedSetup.work_authorization || guidedSetup.language_requirements) {
    reminders.push("If licenses, work authorization, or language requirements are provided, state them explicitly as role requirements.");
  }
  if (guidedSetup.schedule_details || guidedSetup.travel_requirement) {
    reminders.push("If schedule or travel expectations are provided, mention them plainly so candidates know the operating reality of the job.");
  }
  if (guidedSetup.customer_facing) {
    reminders.push("Because this is customer-facing, emphasize communication, professionalism, and responsiveness.");
  }

  if (reminders.length === 0) {
    return "";
  }

  return `\n\nCritical job-post rules:\n${reminders.map((item) => `- ${item}`).join("\n")}\n`;
}

function makeFallbackText(title: string, department?: string, experienceLevel?: string, jobType?: string, location?: string) {
  const role = title || "this role";
  const dept = department ? ` in the ${department} team` : "";
  const level = experienceLevel ? ` at the ${experienceLevel} level` : "";
  const type = jobType ? ` (${jobType})` : "";
  const locationText = location ? ` based in ${location}` : "";

  return {
    description: `We are looking for a motivated ${role}${dept}${level}${type}${locationText}. This position is designed for someone who wants to make a meaningful impact, collaborate with a focused team, and contribute to a hiring process that values clarity, speed, and quality. The ideal candidate brings curiosity, accountability, and a willingness to learn while helping the team deliver strong results.`,
    responsibilities:
      `• Deliver consistent, high-quality work aligned with team goals\n` +
      `• Communicate clearly with teammates and stakeholders\n` +
      `• Solve problems thoughtfully and follow through on tasks\n` +
      `• Collaborate on day-to-day operations and improvements\n` +
      `• Help maintain a positive, organized, and efficient workflow`,
    requirements:
      `• Relevant experience or demonstrated ability to succeed in the role\n` +
      `• Strong communication, organization, and follow-through\n` +
      `• Ability to work independently and as part of a team\n` +
      `• Willingness to learn, adapt, and take feedback\n` +
      `• Dependable attention to detail and professionalism`,
    skills: "communication, teamwork, problem-solving, organization, adaptability, accountability",
    benefits: "competitive pay, growth opportunities, collaborative team, flexible environment, meaningful work",
  };
}

function buildFieldPrompt(params: JobContentRequest) {
  const {
    field,
    title,
    department,
    experience_level,
    job_type,
    location,
    existingContent,
    description,
    responsibilities,
    requirements,
  } = params;
  const guidedSetupBlock = buildGuidedSetupBlock(params.guided_setup);
  const constraintReminder = buildConstraintReminder(params.guided_setup);

  if (field === "full") {
    return `Generate a complete job posting for the following position:

Title: ${title}
${department ? `Department: ${department}` : ""}
${experience_level ? `Experience Level: ${experience_level}` : ""}
${job_type ? `Job Type: ${job_type}` : ""}
${location ? `Location: ${location}` : ""}

Return a JSON object with these fields:
- description: A compelling 2-3 paragraph description of the role and opportunity. Separate paragraphs with blank lines. Plain text only, no markdown.
- responsibilities: 5-7 bullet points of key responsibilities. Each bullet must be on its own new line, starting with "• " and an action verb. NO markdown (no **, no *, no bold).
- requirements: 5-7 bullet points of required qualifications. Each bullet must be on its own new line, starting with "• ". NO markdown (no **, no *, no bold). NO category labels.
- skills: Comma-separated list of 6-10 relevant technical and soft skills
- benefits: Comma-separated list of 5-8 common benefits

CRITICAL: All text must be clean plain text. NO markdown formatting whatsoever.
${guidedSetupBlock}
${constraintReminder}

Return ONLY valid JSON, no markdown code blocks.`;
  }

  if (field === "description") {
    return `Write a compelling 2-3 paragraph job description for a ${title} position${department ? ` in ${department}` : ""}${experience_level ? ` at ${experience_level} level` : ""}.

Focus on:
- What makes this role exciting
- The team and culture
- Impact the person will have
- Growth opportunities

${existingContent ? `Improve upon this existing content: ${existingContent}` : ""}
${guidedSetupBlock}
${constraintReminder}

Formatting rules:
- Return plain text only
- Use 2-3 short paragraphs
- Separate each paragraph with a blank line
- No headers, labels, or markdown
`;
  }

  if (field === "responsibilities") {
    return `Write 5-7 key responsibilities for a ${title} position${department ? ` in ${department}` : ""}.

Each responsibility should:
- Start with an action verb
- Be specific and measurable
- Focus on outcomes and impact

${existingContent ? `Improve upon these existing responsibilities: ${existingContent}` : ""}
${buildContextBlock({ description })}
${guidedSetupBlock}
${constraintReminder}
FORMATTING RULES (MUST FOLLOW):
- Each responsibility on its own line starting with "• "
- Do not place multiple bullets on the same line
- NO markdown formatting whatsoever (no **, no *, no #, no bold)
- NO category labels or headers
- Clean plain text only`;
  }

  if (field === "requirements") {
    return `Write 5-7 requirements for a ${title} position${experience_level ? ` at ${experience_level} level` : ""}.

Include:
- Required education/experience
- Technical skills
- Soft skills
- Any certifications

${existingContent ? `Improve upon these existing requirements: ${existingContent}` : ""}
${buildContextBlock({ description, responsibilities })}
${guidedSetupBlock}
${constraintReminder}
FORMATTING RULES (MUST FOLLOW):
- Each requirement on its own line starting with "• "
- Do not place multiple bullets on the same line
- NO markdown formatting whatsoever (no **, no *, no #, no bold)
- NO category labels like "Education:" or "Skills:"
- Clean plain text only`;
  }

  if (field === "skills_required") {
    return `List 6-10 relevant skills for a ${title} position${department ? ` in ${department}` : ""}.

Include both technical and soft skills appropriate for ${experience_level || "mid-level"} candidates.

${existingContent ? `Build upon these existing skills: ${existingContent}` : ""}
${buildContextBlock({ description, responsibilities, requirements })}
${guidedSetupBlock}
Return as a comma-separated list only.`;
  }

  if (field === "benefits") {
    return `List 5-8 attractive benefits for a ${title} position.

Include a mix of:
- Health and wellness
- Financial benefits
- Work-life balance
- Professional development
- Unique perks

${existingContent ? `Build upon these existing benefits: ${existingContent}` : ""}
${buildContextBlock({ description })}
${guidedSetupBlock}
Return as a comma-separated list only.`;
  }

  throw new Error(`Unsupported field: ${field}`);
}

async function generateFallbackResponse(params: JobContentRequest) {
  const fallback = makeFallbackText(
    params.title,
    params.department,
    params.experience_level,
    params.job_type,
    params.location,
  );

  if (params.field === "full") {
    return fallback;
  }

  if (params.field === "description") {
    return { content: fallback.description };
  }

  if (params.field === "responsibilities") {
    return { content: fallback.responsibilities };
  }

  if (params.field === "requirements") {
    return { content: fallback.requirements };
  }

  if (params.field === "skills_required") {
    return { content: fallback.skills };
  }

  if (params.field === "benefits") {
    return { content: fallback.benefits };
  }

  throw new Error(`Unsupported field: ${params.field}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let body: JobContentRequest | null = null;

  try {
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    body = await req.json();
    const { field, title } = body;
    const prompt = buildFieldPrompt(body);

    if (!field || !title) {
      return new Response(
        JSON.stringify({ error: "field and title are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Generating job content for field:", field, "title:", title);

    if (field === "full") {
      const { data } = await callOpenAIJson<Record<string, unknown>>({
        apiKey: OPENAI_API_KEY,
        model: OPENAI_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are an expert HR professional and copywriter specializing in creating compelling, inclusive job postings. Write content that is professional, engaging, and free from bias. Use clear, action-oriented language. CRITICAL: Never use markdown formatting - no asterisks (*), no bold (**), no headers (#). Write in clean, plain text only.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.25,
        maxCompletionTokens: 1800,
        retries: 3,
        validator: (value) =>
          requireJsonKeys(value, ["description", "responsibilities", "requirements", "skills", "benefits"]),
        fallback: () => makeFallbackText(title, body.department, body.experience_level, body.job_type, body.location),
      });

      const parsed = data as Record<string, unknown>;
      return new Response(
        JSON.stringify(parsed),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const temperatureByField: Record<string, number> = {
      description: 0.65,
      responsibilities: 0.45,
      requirements: 0.35,
      skills_required: 0.35,
      benefits: 0.4,
    };

    const { content } = await callOpenAIChat({
      apiKey: OPENAI_API_KEY,
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are an expert HR professional and copywriter specializing in creating compelling, inclusive job postings. Write content that is professional, engaging, and free from bias. Use clear, action-oriented language. CRITICAL: Never use markdown formatting - no asterisks (*), no bold (**), no headers (#). Write in clean, plain text only.",
        },
        { role: "user", content: prompt },
      ],
      temperature: temperatureByField[field] ?? 0.4,
      maxCompletionTokens: 1200,
      retries: 3,
    });

    const normalized = content.trim();
    const result = { content: normalized };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating job content:", error);
    try {
      if (body?.field && body?.title) {
        const fallback = await generateFallbackResponse(body);
        return new Response(
          JSON.stringify(fallback),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch {
      // Ignore fallback parse failures and surface the original error below.
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
