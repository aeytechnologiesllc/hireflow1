// The Improvement Blueprint's report shape and structural validator.
//
// Kept separate from ai-generate-performance-report/index.ts (which has
// Deno-only imports) so it can be unit-tested with plain node -- see
// scripts/blueprint_report_schema.test.mjs -- and shared with
// generate-blueprint-pdf/index.ts and the frontend type in
// src/hooks/useImprovementBlueprint.ts without duplicating the shape three
// times.
//
// Design, per the owner's 2026-09-16 decision to keep this report ("fix
// that and make that better") and brief research into what genuinely useful
// post-rejection feedback looks like: lead with real strengths, name the
// specific gap against THIS job's actual requirements and screening steps
// (never a generic "improve your skills"), give a concrete way to practice
// each gap with a worked example, help them present their real experience
// better next time, and suggest role types their demonstrated strengths fit
// -- honest, kind, specific, never inventing a fact about the candidate,
// never promising an outcome, never naming AI or Ava (candidates never see
// those words -- see CandidateStatusScreen.tsx and the rest of the
// candidate-facing surface).

export interface BlueprintStrength {
  strength: string;
  evidence: string;
  howToUseItNextTime: string;
}

export interface BlueprintPracticeStep {
  action: string;
  example: string;
}

export interface BlueprintGap {
  area: string;
  requirement: string;
  whatWeObserved: string;
  whyItMatters: string;
  practiceSteps: BlueprintPracticeStep[];
}

export interface BlueprintRoleSuggestion {
  roleType: string;
  why: string;
}

export interface ImprovementBlueprintData {
  summary: {
    whatHappened: string;
    keyTakeaway: string;
  };
  whatWentWell: BlueprintStrength[];
  gapsForThisRole: BlueprintGap[];
  presentingYourExperience: {
    observation: string;
    suggestion: string;
    example: string;
  };
  practicePlan: {
    thisWeek: string[];
    nextTwoWeeks: string[];
  };
  rolesToConsiderNext: BlueprintRoleSuggestion[];
  closing: {
    note: string;
    disclaimer: string;
  };
  metadata: {
    candidateName: string;
    jobTitle: string;
    overallScore: number;
    passingScore: number;
    generatedAt: string;
    applicationId: string;
    completedPhases: string[];
    dataDepth: "minimal" | "moderate" | "comprehensive";
    dataDepthMessage?: string;
  };
}

// Required, exact sentence -- see closing.disclaimer. Keeping this as a
// literal (not a paraphrase check) means a validator failure is unambiguous
// and the model can't drift its wording over repeated generations.
export const REQUIRED_DEVELOPMENTAL_DISCLAIMER =
  "This report is intended as developmental feedback to support improvement and does not represent a judgment of personal character or future potential.";

// Phrases that would break "candidates never see the words AI or Ava" if
// they leaked into model output. Checked case-insensitively against every
// string field.
const FORBIDDEN_TERMS = [/\bai\b/i, /\bava\b/i, /artificial intelligence/i, /chatgpt/i, /language model/i];

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) collectStrings(v, out);
  }
}

function findForbiddenTerm(value: unknown): string | null {
  const strings: string[] = [];
  collectStrings(value, strings);
  for (const s of strings) {
    for (const pattern of FORBIDDEN_TERMS) {
      if (pattern.test(s)) return `"${pattern}" matched in: ${s.slice(0, 120)}`;
    }
  }
  return null;
}

/**
 * Structural + content validator for callOpenAIJson's `validator` option.
 * Returns null when the shape is acceptable, or a short message describing
 * what's missing/wrong (triggers a retry, then the caller's fallback).
 */
export function validateBlueprintReport(value: unknown): string | null {
  if (!value || typeof value !== "object") return "Expected a JSON object";
  const v = value as Partial<ImprovementBlueprintData>;

  if (!v.summary?.whatHappened) return "Missing summary.whatHappened";
  if (!v.summary?.keyTakeaway) return "Missing summary.keyTakeaway";

  if (!Array.isArray(v.whatWentWell) || v.whatWentWell.length === 0) {
    return "whatWentWell must be a non-empty array";
  }
  for (const s of v.whatWentWell) {
    if (!s?.strength || !s?.evidence || !s?.howToUseItNextTime) {
      return "Each whatWentWell entry needs strength, evidence, and howToUseItNextTime";
    }
  }

  if (!Array.isArray(v.gapsForThisRole) || v.gapsForThisRole.length === 0) {
    return "gapsForThisRole must be a non-empty array";
  }
  for (const g of v.gapsForThisRole) {
    if (!g?.area || !g?.requirement || !g?.whatWeObserved || !g?.whyItMatters) {
      return "Each gapsForThisRole entry needs area, requirement, whatWeObserved, and whyItMatters";
    }
    if (!Array.isArray(g.practiceSteps) || g.practiceSteps.length === 0) {
      return `gapsForThisRole "${g.area}" needs at least one practiceStep`;
    }
    for (const step of g.practiceSteps) {
      if (!step?.action || !step?.example) {
        return `gapsForThisRole "${g.area}" has a practiceStep missing action or example`;
      }
    }
  }

  if (!v.presentingYourExperience?.observation || !v.presentingYourExperience?.suggestion || !v.presentingYourExperience?.example) {
    return "Missing presentingYourExperience.observation/suggestion/example";
  }

  if (!Array.isArray(v.practicePlan?.thisWeek) || v.practicePlan.thisWeek.length === 0) {
    return "practicePlan.thisWeek must be a non-empty array";
  }
  if (!Array.isArray(v.practicePlan?.nextTwoWeeks) || v.practicePlan.nextTwoWeeks.length === 0) {
    return "practicePlan.nextTwoWeeks must be a non-empty array";
  }

  if (!Array.isArray(v.rolesToConsiderNext) || v.rolesToConsiderNext.length === 0) {
    return "rolesToConsiderNext must be a non-empty array";
  }
  for (const r of v.rolesToConsiderNext) {
    if (!r?.roleType || !r?.why) return "Each rolesToConsiderNext entry needs roleType and why";
  }

  if (!v.closing?.note) return "Missing closing.note";
  if (v.closing?.disclaimer !== REQUIRED_DEVELOPMENTAL_DISCLAIMER) {
    return "closing.disclaimer must be exactly the required developmental disclaimer sentence";
  }

  const forbidden = findForbiddenTerm(value);
  if (forbidden) return `Candidate-facing report must never name AI or Ava (${forbidden})`;

  return null;
}
