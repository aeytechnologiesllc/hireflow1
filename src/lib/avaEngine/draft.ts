import type { JobBrief, JobFlow, Rigor } from "./types";

const DRAFT_KEY = "ava-create-job-draft-v1";

export interface AvaCreateDraft {
  briefFields: {
    role: string;
    location: string;
    type: string;
    pay: string;
    start: string;
    work: string;
    openings: number;
  };
  chipAnswers: Record<string, number>;
  rigor: Rigor;
  rigorTouched: boolean;
  flow: JobFlow | null;
}

export function loadDraft(): AvaCreateDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AvaCreateDraft;
  } catch {
    return null;
  }
}

export function saveDraft(draft: AvaCreateDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* quota / private mode */
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function draftFromBrief(brief: JobBrief, partial?: Partial<AvaCreateDraft>): AvaCreateDraft {
  return {
    briefFields: {
      role: brief.roleTitle,
      location: brief.location,
      type: brief.employmentType.replace("_", " "),
      pay: brief.pay,
      start: brief.startUrgency.replace("_", " "),
      work: brief.whatTheyDo,
      openings: brief.openings,
    },
    chipAnswers: {},
    rigor: "standard",
    rigorTouched: false,
    flow: null,
    ...partial,
  };
}
