import { supabase } from "@/integrations/supabase/client";

export type AutopilotImpactAction = "reject" | "advance" | "defer" | "review" | "failed";

export interface AutopilotImpactApplicant {
  applicationId: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  currentPhaseId: string;
  score: number | null;
  action: AutopilotImpactAction;
  decision?: string | null;
  decisionState?: string | null;
  nextPhaseId?: string | null;
  nextPhaseTitle?: string | null;
  rationale?: string | null;
  pendingHighSignalPhases?: string[];
  hardRejectReason?: string | null;
  error?: string;
}

export interface AutopilotImpactPreview {
  jobId: string;
  previewOnly: boolean;
  passingScore: number;
  totals: {
    processed: number;
    reject: number;
    advance: number;
    defer: number;
    review: number;
    failed: number;
  };
  applicants: AutopilotImpactApplicant[];
}

async function runAutopilotBatch(jobId: string, previewOnly: boolean): Promise<AutopilotImpactPreview> {
  const { data, error } = await supabase.functions.invoke("autopilot-batch", {
    body: {
      jobId,
      previewOnly,
    },
  });

  if (error) {
    throw error;
  }

  return data as AutopilotImpactPreview;
}

export function getAutopilotImpactPreview(jobId: string) {
  return runAutopilotBatch(jobId, true);
}

export function applyAutopilotCatchUp(jobId: string) {
  return runAutopilotBatch(jobId, false);
}
