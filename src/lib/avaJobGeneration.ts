import { supabase } from "@/integrations/supabase/client";
import type { GuidedJobSetup } from "@/lib/hiringPlan";

export interface AvaJobFormData extends GuidedJobSetup {
  title: string;
  description: string;
  requirements: string;
  responsibilities: string;
  location: string;
  job_type: string;
  experience_level: string;
  department: string;
  salary_type: string;
  salary_period: string;
  salary_min: string;
  salary_max: string;
  salary_fixed: string;
  salary_currency: string;
  skills_required: string;
  benefits: string;
  application_deadline: Date | null;
}

export interface FullJobGenerationResponse {
  description?: string;
  responsibilities?: string;
  requirements?: string;
  skills?: string;
  benefits?: string;
  screening_plan_summary?: string;
}

export interface ScreeningPlanGenerationResponse {
  application_questions?: any[];
  quiz_questions?: any[];
  workflow_steps?: any[];
  screening_plan_summary?: string;
}

function buildGenerationPayload(formData: AvaJobFormData) {
  return {
    title: formData.title,
    department: formData.department,
    experience_level: formData.experience_level,
    job_type: formData.job_type,
    location: formData.location,
    description: formData.description,
    responsibilities: formData.responsibilities,
    requirements: formData.requirements,
    skills_required: formData.skills_required,
    guided_setup: {
      job_family: formData.job_family,
      urgency: formData.urgency,
      must_haves: formData.must_haves,
      deal_breakers: formData.deal_breakers,
      certifications: formData.certifications,
      schedule_details: formData.schedule_details,
      language_requirements: formData.language_requirements,
      work_authorization: formData.work_authorization,
      travel_requirement: formData.travel_requirement,
      compensation_guidance: formData.compensation_guidance,
      portfolio_preference: formData.portfolio_preference,
      customer_facing: formData.customer_facing,
    },
  };
}

export async function generateJobField(
  formData: AvaJobFormData,
  field: string,
  existingContent?: string,
) {
  const { data, error } = await supabase.functions.invoke("ai-generate-job-content", {
    body: {
      field,
      existingContent: existingContent || (formData[field as keyof AvaJobFormData] as string | undefined),
      ...buildGenerationPayload(formData),
    },
  });

  if (error) {
    throw error;
  }

  return data as { content: string };
}

export async function generateFullJobPosting(formData: AvaJobFormData) {
  const { data, error } = await supabase.functions.invoke("ai-generate-job-content", {
    body: {
      field: "full",
      ...buildGenerationPayload(formData),
    },
  });

  if (error) {
    throw error;
  }

  return data as FullJobGenerationResponse;
}

export async function generateScreeningPlan(
  formData: AvaJobFormData,
  difficulty: string,
  company?: string | null,
) {
  const { data, error } = await supabase.functions.invoke("ai-generate-workflow", {
    body: {
      title: formData.title,
      description: formData.description,
      company: company || null,
      employment_type: formData.job_type,
      location: formData.location,
      difficulty,
      require_resume: true,
      guided_setup: {
        job_family: formData.job_family,
        urgency: formData.urgency,
        must_haves: formData.must_haves,
        deal_breakers: formData.deal_breakers,
        certifications: formData.certifications,
        schedule_details: formData.schedule_details,
        language_requirements: formData.language_requirements,
        work_authorization: formData.work_authorization,
        travel_requirement: formData.travel_requirement,
        compensation_guidance: formData.compensation_guidance,
        portfolio_preference: formData.portfolio_preference,
        customer_facing: formData.customer_facing,
      },
    },
  });

  if (error) {
    throw error;
  }

  return data as ScreeningPlanGenerationResponse;
}
