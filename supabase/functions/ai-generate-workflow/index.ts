import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callOpenAIJson, requireJsonKeys } from "../_shared/openai.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_MODEL = Deno.env.get("OPENAI_WORKFLOW_MODEL") || "gpt-5.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GuidedSetup {
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
}

interface WorkflowRequest {
  title: string;
  description: string;
  company?: string;
  employment_type?: string;
  location?: string;
  difficulty: "easy" | "medium" | "hard" | "intense";
  require_resume?: boolean;
  guided_setup?: GuidedSetup;
}

interface WorkflowQuestion {
  id: string;
  type: string;
  question: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  correct_answer?: string | null;
  correct_answers?: string[];
  fit_context?: string;
  time_limit_seconds?: number;
  category?: string;
}

interface WorkflowStep {
  id: string;
  type: string;
  title: string;
  description: string;
  required: boolean;
  config: Record<string, unknown>;
}

interface WorkflowResponse {
  application_questions: WorkflowQuestion[];
  quiz_questions: WorkflowQuestion[];
  workflow_steps: WorkflowStep[];
  screening_plan_summary?: string;
}

const FAMILY_GUIDANCE: Record<string, { profile: string; preferredSteps: string[]; avoid?: string }> = {
  operations_admin: {
    profile: "Prioritize organization, process discipline, follow-through, and calm communication.",
    preferredSteps: ["typing_test", "chat_interview"],
  },
  support: {
    profile: "Prioritize empathy, response quality, and handling pressure in customer interactions.",
    preferredSteps: ["chat_simulation", "video_message", "chat_interview"],
  },
  sales: {
    profile: "Prioritize persuasion, discovery, objection handling, and energy.",
    preferredSteps: ["sales_simulation", "video_message", "chat_interview"],
  },
  creative: {
    profile: "Prioritize portfolio evidence, taste, originality, and communication of craft.",
    preferredSteps: ["portfolio_upload", "video_message", "chat_interview"],
  },
  technical: {
    profile: "Prioritize problem-solving, role competency, signal quality, and clarity of thinking.",
    preferredSteps: ["chat_interview"],
    avoid: "Do not force portfolio_upload unless guided setup or job wording clearly asks for design/creative samples.",
  },
  field_service: {
    profile: "Prioritize reliability, schedule fit, certifications, and practical judgment.",
    preferredSteps: ["video_message", "chat_interview"],
  },
  retail_hospitality: {
    profile: "Prioritize customer-facing communication, energy, scheduling fit, and consistency.",
    preferredSteps: ["video_message", "chat_interview"],
  },
  healthcare: {
    profile: "Prioritize licensure, credibility, communication, and safety-minded judgment.",
    preferredSteps: ["video_message", "chat_interview"],
  },
  executive: {
    profile: "Prioritize strategic communication, leadership judgment, and evidence quality.",
    preferredSteps: ["video_message", "chat_interview"],
  },
  general: {
    profile: "Keep the process balanced, concise, and aligned to the role evidence available.",
    preferredSteps: ["chat_interview"],
  },
};

function inferJobFamily(title: string, description: string, guidedSetup?: GuidedSetup) {
  if (guidedSetup?.job_family && FAMILY_GUIDANCE[guidedSetup.job_family]) {
    return guidedSetup.job_family;
  }

  const haystack = `${title} ${description}`.toLowerCase();
  if (haystack.match(/support|customer service|customer success|help desk/)) return "support";
  if (haystack.match(/sales|account executive|business development|closer/)) return "sales";
  if (haystack.match(/designer|creative|illustrator|animator|photographer|videographer/)) return "creative";
  if (haystack.match(/engineer|developer|software|data|technical|devops|product/)) return "technical";
  if (haystack.match(/admin|operations|coordinator|assistant|scheduler/)) return "operations_admin";
  if (haystack.match(/retail|hospitality|restaurant|server|barista|store/)) return "retail_hospitality";
  if (haystack.match(/nurse|healthcare|medical|clinic|therapist/)) return "healthcare";
  if (haystack.match(/field|installer|technician|maintenance|route/)) return "field_service";
  if (haystack.match(/chief|vp|vice president|director|head of|executive/)) return "executive";
  return "general";
}

function detectCreativeRole(title: string, description: string, guidedSetup?: GuidedSetup) {
  if (guidedSetup?.portfolio_preference === "required") return true;
  if (guidedSetup?.portfolio_preference === "not_needed") return false;

  const haystack = `${title} ${description}`.toLowerCase();
  return /designer|creative|illustrator|animator|photographer|videographer|portfolio|art director|brand/.test(haystack);
}

function buildGuidedSetupBlock(guidedSetup: GuidedSetup | undefined, family: string) {
  const parts = [
    `Job family: ${family}`,
    guidedSetup?.urgency ? `Hiring pace: ${guidedSetup.urgency}` : null,
    guidedSetup?.must_haves ? `Must-haves: ${guidedSetup.must_haves}` : null,
    guidedSetup?.deal_breakers ? `Deal-breakers: ${guidedSetup.deal_breakers}` : null,
    guidedSetup?.certifications ? `Certifications/licenses: ${guidedSetup.certifications}` : null,
    guidedSetup?.schedule_details ? `Schedule or shift details: ${guidedSetup.schedule_details}` : null,
    guidedSetup?.language_requirements ? `Language requirements: ${guidedSetup.language_requirements}` : null,
    guidedSetup?.work_authorization ? `Work authorization: ${guidedSetup.work_authorization}` : null,
    guidedSetup?.travel_requirement ? `Travel requirement: ${guidedSetup.travel_requirement}` : null,
    guidedSetup?.compensation_guidance ? `Compensation guidance: ${guidedSetup.compensation_guidance}` : null,
    guidedSetup?.portfolio_preference ? `Portfolio preference: ${guidedSetup.portfolio_preference}` : null,
    typeof guidedSetup?.customer_facing === "boolean" ? `Customer-facing role: ${guidedSetup.customer_facing ? "yes" : "no"}` : null,
  ].filter(Boolean);

  return parts.map((part) => `- ${part}`).join("\n");
}

function questionMatchesKeywords(question: WorkflowQuestion, keywords: string[]) {
  const haystack = `${question.question} ${question.placeholder || ""}`.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}

function insertBeforeFinalInterview(workflowSteps: WorkflowStep[], step: WorkflowStep) {
  const existingIndex = workflowSteps.findIndex((item) => item.type === step.type);
  if (existingIndex >= 0) {
    return;
  }

  const finalInterviewIndex = workflowSteps.findIndex((item) => item.type === "chat_interview");
  if (finalInterviewIndex >= 0) {
    workflowSteps.splice(finalInterviewIndex, 0, step);
    return;
  }

  workflowSteps.push(step);
}

function buildGuidedSetupQuestions(guidedSetup: GuidedSetup | undefined, title: string) {
  if (!guidedSetup) {
    return [];
  }

  const prompts: Array<{ question: WorkflowQuestion; keywords: string[] }> = [];

  if (guidedSetup.deal_breakers) {
    prompts.push({
      question: {
        id: "qDealBreakers",
        type: "textarea",
        question: `Before we continue, confirm there is nothing that conflicts with these non-negotiables for the ${title} role`,
        required: true,
        placeholder: guidedSetup.deal_breakers,
      },
      keywords: ["non-negotiable", "deal-breaker", "conflict"],
    });
  }

  if (guidedSetup.must_haves) {
    prompts.push({
      question: {
        id: "qMustHaves",
        type: "textarea",
        question: "Which of the employer's must-have requirements do you already have direct experience with?",
        required: true,
        placeholder: guidedSetup.must_haves,
      },
      keywords: ["must-have", "direct experience", "requirements do you already have"],
    });
  }

  if (guidedSetup.certifications) {
    prompts.push({
      question: {
        id: "qCertifications",
        type: "textarea",
        question: "List the certifications or licenses you currently hold that are relevant to this role",
        required: true,
        placeholder: guidedSetup.certifications,
      },
      keywords: ["certification", "license", "licenses"],
    });
  }

  if (guidedSetup.work_authorization) {
    prompts.push({
      question: {
        id: "qWorkAuthorization",
        type: "select",
        question: "Are you able to meet the work authorization expectation for this role?",
        required: true,
        options: ["Yes", "No", "Need sponsorship or clarification"],
      },
      keywords: ["work authorization", "sponsorship"],
    });
  }

  if (guidedSetup.schedule_details) {
    prompts.push({
      question: {
        id: "qScheduleFit",
        type: "select",
        question: "Can you reliably work the required schedule or shift pattern for this role?",
        required: true,
        options: ["Yes", "Partially", "No"],
      },
      keywords: ["schedule", "shift", "availability"],
    });
  }

  if (guidedSetup.language_requirements) {
    prompts.push({
      question: {
        id: "qLanguageRequirements",
        type: "textarea",
        question: "Describe your language proficiency for the languages required in this role",
        required: true,
        placeholder: guidedSetup.language_requirements,
      },
      keywords: ["language", "proficiency", "bilingual"],
    });
  }

  if (guidedSetup.travel_requirement) {
    prompts.push({
      question: {
        id: "qTravelRequirement",
        type: "select",
        question: "Can you meet the travel expectations for this role?",
        required: true,
        options: ["Yes", "No", "Need more detail"],
      },
      keywords: ["travel", "onsite", "commute"],
    });
  }

  return prompts;
}

function enrichApplicationQuestions(
  applicationQuestions: WorkflowQuestion[],
  guidedSetup: GuidedSetup | undefined,
  title: string,
) {
  if (!Array.isArray(applicationQuestions)) {
    return [];
  }

  const essentials: WorkflowQuestion[] = [];
  const remaining: WorkflowQuestion[] = [];

  for (const question of applicationQuestions) {
    if (
      questionMatchesKeywords(question, ["full name"]) ||
      questionMatchesKeywords(question, ["email"]) ||
      questionMatchesKeywords(question, ["phone"]) ||
      questionMatchesKeywords(question, ["most recent job title", "current or most recent"]) ||
      questionMatchesKeywords(question, ["years of experience", "experience"])
    ) {
      essentials.push(question);
    } else {
      remaining.push(question);
    }
  }

  const prioritizedQuestions = buildGuidedSetupQuestions(guidedSetup, title);
  const guidedQuestions = prioritizedQuestions
    .filter(({ keywords }) => !applicationQuestions.some((question) => questionMatchesKeywords(question, keywords)))
    .slice(0, 4)
    .map(({ question }) => question);

  return [...essentials, ...guidedQuestions, ...remaining];
}

function ensureFamilyWorkflowSteps(
  workflowSteps: WorkflowStep[],
  family: string,
  guidedSetup: GuidedSetup | undefined,
  requirePortfolio: boolean,
) {
  const hasStepType = (type: string) => workflowSteps.some((step) => step.type === type);

  if (family === "support" && !hasStepType("chat_simulation")) {
    insertBeforeFinalInterview(workflowSteps, {
      id: "step_support",
      type: "chat_simulation",
      title: "Support Scenario",
      description: "Respond to a realistic customer issue with empathy, clarity, and ownership.",
      required: true,
      config: { scenario: "customer_support" },
    });
  }

  if (family === "sales" && !hasStepType("sales_simulation")) {
    insertBeforeFinalInterview(workflowSteps, {
      id: "step_sales",
      type: "sales_simulation",
      title: "Sales Conversation",
      description: "Handle discovery, objections, and closing pressure in a realistic sales scenario.",
      required: true,
      config: { scenario: "sales_call" },
    });
  }

  if (family === "operations_admin" && !hasStepType("typing_test")) {
    insertBeforeFinalInterview(workflowSteps, {
      id: "step_typing",
      type: "typing_test",
      title: "Typing and Accuracy Check",
      description: "Demonstrate reliable execution for administrative or process-heavy work.",
      required: true,
      config: { min_wpm: 40 },
    });
  }

  if ((guidedSetup?.customer_facing || family === "retail_hospitality" || family === "executive") && !hasStepType("video_message")) {
    insertBeforeFinalInterview(workflowSteps, {
      id: "step_video_message",
      type: "video_message",
      title: "Communication Snapshot",
      description: "Record a short response so Ava can assess clarity, presence, and professionalism.",
      required: true,
      config: { max_duration_seconds: 90 },
    });
  }

  if (requirePortfolio && !hasStepType("portfolio_upload")) {
    insertBeforeFinalInterview(workflowSteps, {
      id: "step_portfolio",
      type: "portfolio_upload",
      title: "Portfolio Review",
      description: "Share work samples relevant to the role.",
      required: true,
      config: { portfolio_type: "general" },
    });
  }
}

function buildScreeningPlanSummary(
  family: string,
  guidedSetup: GuidedSetup | undefined,
  workflowSteps: WorkflowStep[],
  quizQuestions: WorkflowQuestion[],
) {
  const focus: string[] = [];

  if (guidedSetup?.must_haves) {
    focus.push("front-loads the employer's must-haves");
  }
  if (guidedSetup?.deal_breakers) {
    focus.push("checks deal-breakers early");
  }
  if (guidedSetup?.certifications || guidedSetup?.work_authorization || guidedSetup?.language_requirements) {
    focus.push("verifies critical eligibility requirements");
  }
  if (workflowSteps.some((step) => step.type === "chat_simulation")) {
    focus.push("tests real customer communication");
  }
  if (workflowSteps.some((step) => step.type === "sales_simulation")) {
    focus.push("tests live selling ability");
  }
  if (workflowSteps.some((step) => step.type === "typing_test")) {
    focus.push("validates execution speed and accuracy");
  }
  if (workflowSteps.some((step) => step.type === "portfolio_upload")) {
    focus.push("requires work-sample proof");
  }

  const familyLabel = family.replace(/_/g, " ");
  const focusText =
    focus.length > 0
      ? focus.slice(0, 3).join(", ")
      : "keeps the screening concise while still collecting evidence that matters";

  return `Ava built a ${familyLabel} screening plan that ${focusText}, uses ${quizQuestions.length} targeted assessment questions, and ends with an Ava interview for final judgment.`;
}

function makeFallbackWorkflow(request: WorkflowRequest, family: string, requirePortfolio: boolean): WorkflowResponse {
  const applicationQuestions: WorkflowQuestion[] = [
    { id: "q1", type: "text", question: "Full Name", required: true, placeholder: "Enter your full name" },
    { id: "q2", type: "email", question: "Email Address", required: true, placeholder: "Enter your best email" },
    { id: "q3", type: "phone", question: "Phone Number", required: true, placeholder: "Enter your phone number" },
    { id: "q4", type: "text", question: "Current or most recent job title", required: true, placeholder: "Share your most recent role" },
    { id: "q5", type: "textarea", question: `Why are you interested in this ${request.title} opportunity?`, required: true, placeholder: "Tell us what drew you to the role" },
  ];

  if (request.require_resume !== false) {
    applicationQuestions.push({ id: "qResume", type: "file", question: "Upload your resume", required: true });
  }

  if (requirePortfolio) {
    applicationQuestions.push({ id: "qPortfolioLink", type: "text", question: "Share your portfolio link if you have one", required: false, placeholder: "Portfolio URL" });
  }

  const quizQuestions: WorkflowQuestion[] = [
    {
      id: "quiz1",
      type: "situational",
      question: "When priorities shift unexpectedly, how do you respond?",
      options: ["Pause everything", "Reprioritize and communicate", "Wait for direction", "Focus only on one task"],
      correct_answer: null,
      fit_context: "Strong candidates show calm reprioritization and communication.",
      time_limit_seconds: 30,
      category: "work_style",
    },
    {
      id: "quiz2",
      type: "personality",
      question: "I stay organized even when I am handling several tasks at once.",
      options: ["Strongly Agree", "Agree", "Neutral", "Disagree"],
      correct_answer: null,
      fit_context: "The role values organized, dependable execution.",
      time_limit_seconds: 25,
      category: "reliability",
    },
    {
      id: "quiz3",
      type: "short_answer",
      question: "What is one result from your recent work that you are proud of?",
      correct_answer: null,
      time_limit_seconds: 45,
      category: "achievement",
    },
  ];

  const workflowSteps: WorkflowStep[] = [];

  if (family === "support") {
    workflowSteps.push({
      id: "step_support",
      type: "chat_simulation",
      title: "Support Simulation",
      description: "Respond to a realistic customer support scenario.",
      required: true,
      config: { scenario: "Handle a customer complaint with empathy and clarity" },
    });
  } else if (family === "sales") {
    workflowSteps.push({
      id: "step_sales",
      type: "sales_simulation",
      title: "Sales Conversation",
      description: "Handle a short pitch and objection-handling exercise.",
      required: true,
      config: { product: "enterprise solution" },
    });
  } else if (family === "operations_admin") {
    workflowSteps.push({
      id: "step_typing",
      type: "typing_test",
      title: "Typing Speed Test",
      description: "Demonstrate typing speed and accuracy for daily execution work.",
      required: true,
      config: { min_wpm: 40 },
    });
  }

  if (requirePortfolio) {
    workflowSteps.push({
      id: "step_portfolio",
      type: "portfolio_upload",
      title: "Portfolio Review",
      description: "Share work samples relevant to the role.",
      required: true,
      config: { portfolio_type: "general" },
    });
  }

  workflowSteps.push({
    id: "step_final",
    type: "chat_interview",
    title: "Interview with Ava",
    description: "Complete a final interview with Ava based on your earlier responses.",
    required: true,
    config: { focus: "behavioral" },
  });

  return {
    application_questions: applicationQuestions,
    quiz_questions: quizQuestions,
    workflow_steps: workflowSteps,
    screening_plan_summary: "Ava generated a balanced screening plan with application questions, a short assessment, and a final Ava interview.",
  };
}

function validateWorkflowResponse(value: unknown) {
  const missing = requireJsonKeys(value, ["application_questions", "quiz_questions", "workflow_steps"]);
  if (missing) return missing;
  if (!(value as any).application_questions || !Array.isArray((value as any).application_questions)) return "application_questions must be an array";
  if (!(value as any).quiz_questions || !Array.isArray((value as any).quiz_questions)) return "quiz_questions must be an array";
  if (!(value as any).workflow_steps || !Array.isArray((value as any).workflow_steps)) return "workflow_steps must be an array";
  return null;
}

function postProcessWorkflowData(
  workflowData: WorkflowResponse,
  request: WorkflowRequest,
  family: string,
  requirePortfolio: boolean,
): WorkflowResponse {
  const data = {
    application_questions: Array.isArray(workflowData.application_questions) ? workflowData.application_questions : [],
    quiz_questions: Array.isArray(workflowData.quiz_questions) ? workflowData.quiz_questions : [],
    workflow_steps: Array.isArray(workflowData.workflow_steps) ? workflowData.workflow_steps : [],
    screening_plan_summary: workflowData.screening_plan_summary,
  };

  data.quiz_questions = data.quiz_questions.map((question, index) => {
    if (question.type === "personality" || question.type === "situational" || question.type === "short_answer") {
      return { ...question, correct_answer: null };
    }

    if (question.type === "multi_select" && Array.isArray(question.correct_answers)) {
      const validAnswers = question.correct_answers.filter((answer) =>
        question.options?.some((option) => String(option).toLowerCase().trim() === String(answer).toLowerCase().trim()),
      );
      if (validAnswers.length >= 2) {
        return { ...question, correct_answers: validAnswers };
      }

      return {
        ...question,
        type: "multiple_choice",
        correct_answer: question.options?.[0] || "",
        correct_answers: undefined,
      };
    }

    if (Array.isArray(question.options) && question.options.length > 0) {
      const matchingOption = question.options.find((option) =>
        String(option).toLowerCase().trim() === String(question.correct_answer || "").toLowerCase().trim(),
      );
      if (!matchingOption) {
        return { ...question, correct_answer: question.options[0] };
      }
    }

    return question;
  });

  data.application_questions = enrichApplicationQuestions(data.application_questions, request.guided_setup, request.title);

  data.workflow_steps = data.workflow_steps.filter((step) => step.type !== "voice_interview");
  ensureFamilyWorkflowSteps(data.workflow_steps, family, request.guided_setup, requirePortfolio);

  const hasFinalInterview = data.workflow_steps.some((step) => step.type === "chat_interview");
  if (!hasFinalInterview) {
    data.workflow_steps.push({
      id: "step_final",
      type: "chat_interview",
      title: "Interview with Ava",
      description: "Complete a final interview with Ava based on your earlier responses.",
      required: true,
      config: { focus: "behavioral" },
    });
  } else {
    const nonInterviewSteps = data.workflow_steps.filter((step) => step.type !== "chat_interview");
    const finalInterview = data.workflow_steps.find((step) => step.type === "chat_interview")!;
    data.workflow_steps = [...nonInterviewSteps, finalInterview];
  }

  data.screening_plan_summary = buildScreeningPlanSummary(
    family,
    request.guided_setup,
    data.workflow_steps,
    data.quiz_questions,
  );

  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: WorkflowRequest = await req.json();
    const { title, description, company, employment_type, location, difficulty, require_resume, guided_setup } = request;

    if (!title || !description) {
      return new Response(
        JSON.stringify({ error: "Title and description are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const difficultyConfig = {
      easy: {
        questionCount: "5-6",
        quizRange: "8-10",
        quizMin: 8,
        quizMax: 10,
        stepCount: "1-2",
        description: "Quick screening with essential checks",
      },
      medium: {
        questionCount: "5-7",
        quizRange: "12-15",
        quizMin: 12,
        quizMax: 15,
        stepCount: "2-3",
        description: "Balanced screening with thorough evaluation",
      },
      hard: {
        questionCount: "7-10",
        quizRange: "18-25",
        quizMin: 18,
        quizMax: 25,
        stepCount: "2-4",
        description: "Intensive screening with deep assessment evidence",
      },
      intense: {
        questionCount: "10-15",
        quizRange: "25-30",
        quizMin: 25,
        quizMax: 30,
        stepCount: "3-4",
        description: "Maximum rigor for critical and executive roles",
      },
    } as const;

    const config = difficultyConfig[difficulty];
    const family = inferJobFamily(title, description, guided_setup);
    const familyGuidance = FAMILY_GUIDANCE[family] || FAMILY_GUIDANCE.general;
    const requirePortfolio = detectCreativeRole(title, description, guided_setup);

    const prompt = `You are Ava, an expert AI hiring assistant. Generate a complete screening plan for this role.

The employer wants Ava to do the work up front, so the output must feel intentional, concise, and easy for a non-technical employer to review.

Role:
- Title: ${title}
- Description: ${description}
- Company: ${company || "Not provided"}
- Employment type: ${employment_type || "Full-time"}
- Location: ${location || "Not specified"}
- Difficulty: ${difficulty.toUpperCase()} (${config.description})

Guided setup:
${buildGuidedSetupBlock(guided_setup, family)}

Family guidance:
- ${familyGuidance.profile}
- Preferred steps: ${familyGuidance.preferredSteps.join(", ")}
${familyGuidance.avoid ? `- ${familyGuidance.avoid}` : ""}

Portfolio rule:
- ${requirePortfolio ? "Include a portfolio_upload step because the role is creative or the employer explicitly wants one." : "Do not include portfolio_upload unless the role truly needs work samples."}

Hard rules:
- Generate ${config.questionCount} application questions.
- Generate between ${config.quizMin} and ${config.quizMax} quiz questions.
- Prefer the lower end of the workflow step range (${config.stepCount}) unless the role obviously needs more rigor.
- Always include these application questions: Full Name, Email Address, Phone Number, Current or Most Recent Job Title, Years of Experience.
- Include Upload Resume only when require_resume is not false.
- Keep the workflow concise to reduce candidate drop-off.
- If customer-facing is yes, bias toward communication and scenario questions.
- If deal-breakers are provided, reflect them in the screening focus.
- Do not include voice_interview in workflow_steps.
- The final workflow step must always be chat_interview.

Quiz question rules:
- Mix multiple_choice, true_false, short_answer, situational, and personality.
- Personality and situational questions must use correct_answer: null and include fit_context.
- multi_select questions may be used, but only when there are exactly 2 correct answers in correct_answers.

Workflow step rules:
- typing_test for execution-heavy or data-entry style work.
- video_message for communication-heavy roles.
- chat_simulation for support roles.
- sales_simulation for sales roles.
- portfolio_upload only when required.
- chat_interview must be the final step.

Return ONLY valid JSON with this shape:
{
  "screening_plan_summary": "One short plain-English summary of why Ava chose this plan.",
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
}`;

    console.log("Generating workflow for:", title, "with difficulty:", difficulty, "family:", family);

    const { data } = await callOpenAIJson<WorkflowResponse>({
      apiKey: OPENAI_API_KEY,
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: "You are Ava, an expert AI hiring assistant. Always return valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      maxCompletionTokens: 2600,
      retries: 2,
      validator: validateWorkflowResponse,
      fallback: () => makeFallbackWorkflow(request, family, requirePortfolio),
    });

    const workflowData = postProcessWorkflowData(data, request, family, requirePortfolio);

    console.log("Generated workflow:", {
      application_questions: workflowData.application_questions.length,
      quiz_questions: workflowData.quiz_questions.length,
      workflow_steps: workflowData.workflow_steps.length,
    });

    return new Response(
      JSON.stringify(workflowData),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in ai-generate-workflow:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
