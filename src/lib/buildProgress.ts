/**
 * "Building your hiring plan", told as it really happens (the owner's live
 * run of 2026-11-01: "when it was creating the job, it felt like it almost got
 * stuck because it was there for a very long time and the last process").
 *
 * The build screen walked six timed lines in four seconds and then held the
 * last one, "Building the scorecard", until the writer's whole plan came back
 * (any time up to the 40 s limit); at 25 s it gave up with "That took longer
 * than it should have" while the plan was still coming, and stayed there even
 * once it came. Now each line is a real part of the plan:
 *  - the skills check, the practice and the computer check come from the
 *    business's scenario pack on the page (applyCustomerServicePack), so they
 *    are ready at once and say so;
 *  - the job post, the form questions, the interview and the scorecard are
 *    the writer's, and each is ready when generate-flow says it is written
 *    (its streamed parts, src/lib/avaEngine/flowGenerator.ts);
 *  - past the time limit, or with the writer down, those four are the
 *    built-in plan's ready-made first draft, and the screen says so.
 *
 * Pure: no React, no Supabase (scripts/build_progress.test.mjs).
 */
import { channelForBrief, packForBrief } from "@/lib/avaEngine/customerService";
import type { JobBrief } from "@/lib/avaEngine/types";
import { PACK_SITUATIONS } from "@/lib/businessKind";

export type BuildPartId = "skills" | "practice" | "connection" | "post" | "form" | "interview" | "scorecard";
export type BuildPartState = "ready" | "writing" | "waiting" | "draft";

export interface BuildPart {
  id: BuildPartId;
  label: string;
  /** What it is made of, in a few words. */
  detail: string;
  /** The scenario pack's (ready at once) or the writer's. */
  from: "pack" | "writer";
}

/** The plan's parts for this brief, in the order the screen lists them. */
export function buildPartsFor(brief: Pick<JobBrief, "followUps" | "roleTitle" | "whatTheyDo" | "workMode">): BuildPart[] {
  const pack = packForBrief(brief);
  const email = channelForBrief(brief) === "email";
  const situations = PACK_SITUATIONS[pack.id].toLowerCase();
  const parts: BuildPart[] = [
    { id: "skills", label: "Skills check", detail: `${pack.skills.length} questions from ${situations}`, from: "pack" },
    { id: "practice", label: email ? "Email practice" : "Chat practice", detail: `${pack.cases.length} ${pack.counterpart} ${email ? "emails" : "chats"} to pick from`, from: "pack" },
  ];
  if (brief.workMode === "remote") parts.push({ id: "connection", label: "Computer and connection check", detail: "Our own speed test, with your bars", from: "pack" });
  parts.push(
    { id: "post", label: "Job post", detail: "Written for your business", from: "writer" },
    { id: "form", label: "Form questions", detail: "Written for this job", from: "writer" },
    { id: "interview", label: "Written interview", detail: "Written for this job", from: "writer" },
    { id: "scorecard", label: "Scorecard", detail: "How Ava ranks who finishes", from: "writer" },
  );
  return parts;
}

/** Which of the writer's parts each of generate-flow's streamed keys finishes (its quiz and practice are the pack's). */
export const WRITER_PART_OF: Readonly<Record<string, BuildPartId>> = {
  jobPost: "post",
  application: "form",
  voiceQuestions: "interview",
  voiceDimensions: "interview",
  shortlistWeights: "scorecard",
  phaseRationales: "scorecard",
};

/** The keys a writer's part waits for: all of them (the interview's questions and its dimensions). */
const NEEDS: Readonly<Record<string, readonly string[]>> = {
  post: ["jobPost"],
  form: ["application"],
  interview: ["voiceQuestions", "voiceDimensions"],
  scorecard: ["shortlistWeights", "phaseRationales"],
};

/**
 * Each part's state now: the pack's are ready; the writer's are ready as their
 * keys arrive, the first one not ready is being written and the rest wait;
 * once the plan is back, all are ready (the writer's) or the built-in plan's
 * first draft (`finished: "template"`).
 */
export function buildPartStates(parts: readonly BuildPart[], progress: { arrived: ReadonlySet<string>; finished: "openai" | "template" | null }): Record<BuildPartId, BuildPartState> {
  const out = {} as Record<BuildPartId, BuildPartState>;
  let writingShown = false;
  for (const p of parts) {
    if (p.from === "pack" || progress.finished === "openai") {
      out[p.id] = "ready";
    } else if (progress.finished === "template") {
      out[p.id] = "draft";
    } else if ((NEEDS[p.id] ?? []).every((k) => progress.arrived.has(k))) {
      out[p.id] = "ready";
    } else if (!writingShown) {
      out[p.id] = "writing";
      writingShown = true;
    } else {
      out[p.id] = "waiting";
    }
  }
  return out;
}

/** "12 s". */
export function secondsWords(ms: number): string {
  return `${Math.max(0, Math.floor(ms / 1000))} s`;
}

/** The line under the parts while the writer works: what it is doing, and what happens at the time limit. */
export function writerWaitLine(elapsedMs: number, limitMs: number): string | null {
  if (elapsedMs < 6000) return null;
  return `Ava is still writing (${secondsWords(elapsedMs)}). If it takes more than ${Math.round(limitMs / 1000)} seconds, I'll use a ready-made first draft for these, which you can edit.`;
}

/** The line when the built-in plan stood in for the writer. */
export function draftLine(reason: "timeout" | "unavailable" | null | undefined, limitMs: number): string {
  return reason === "timeout"
    ? `Ava took more than ${Math.round(limitMs / 1000)} seconds, so the job post, form and interview are a ready-made first draft you can edit.`
    : "Ava's writer isn't available right now, so the job post, form and interview are a ready-made first draft you can edit.";
}
