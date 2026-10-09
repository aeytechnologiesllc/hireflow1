/**
 * quickReplies.ts: ready-made replies in Messages (docs/MESSAGES.md,
 * "Ready-made replies").
 *
 * The owner, 2026-10-09, looking at a declined applicant asking when they
 * would hear back: "without using AI so we don't burn credits, is it
 * possible to allow employers to draft a message to answer basic questions
 * like that ... she's already been declined maybe."
 *
 * So: no AI, no request, no cost. A few replies written once, by hand, chosen
 * by where the applicant stands (declined, still being reviewed, tests still
 * to do, invited to interview). A tap puts one in the message box, where it
 * can be changed before it is sent. Nothing is ever sent by itself.
 *
 * The decision's own words are the decline note's (src/lib/declineNote.ts),
 * so someone who is told twice is told the same thing. No reply promises a
 * date: what is true for everyone is "everyone who finishes every step gets a
 * yes or no by email", which is what the sign-in page already says.
 *
 * Pure: no React, no Supabase.
 */
// "@/": this file is also loaded as it is by scripts/quick_replies.test.mjs.
import { declineNoteLines } from "@/lib/declineNote";

/** Where the applicant on the other side of the chat stands. */
export type ReplySituation = "declined" | "interview" | "offered" | "hired" | "testing" | "reviewing";

export interface QuickReply {
  id: string;
  /** On the button. */
  label: string;
  /** What goes into the message box. */
  text: string;
}

export interface ReplyContext {
  /** The application's status as stored ("rejected", "interview", "reviewing", "in_progress", …). */
  status: string | null | undefined;
  /** The cockpit's own stage for them, when the chat has no status ("Rejected", "Hired", …). */
  stage?: string | null;
  /** They still have tests to take. */
  stillTesting?: boolean;
  /** The applicant's name as shown. */
  name: string;
  /** The job they applied for. */
  jobTitle?: string | null;
}

export function replySituation(context: Pick<ReplyContext, "status" | "stage" | "stillTesting">): ReplySituation {
  const status = String(context.status ?? "").toLowerCase();
  const stage = String(context.stage ?? "").toLowerCase();
  if (status === "rejected" || stage === "rejected") return "declined";
  if (status === "hired" || stage === "hired") return "hired";
  if (status === "offered") return "offered";
  if (status === "interview") return "interview";
  if (status === "in_progress" || context.stillTesting === true) return "testing";
  return "reviewing";
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/**
 * The replies offered for this applicant, the one that fits where they stand
 * first. Every one opens by thanking them for writing.
 */
export function quickRepliesFor(context: ReplyContext): QuickReply[] {
  const first = firstName(context.name);
  const hello = first ? `Hi ${first}, thank you for your message` : "Hi, thank you for your message";
  const title = typeof context.jobTitle === "string" ? context.jobTitle.trim() : "";
  const role = title ? `the ${title} role` : "the role";
  const situation = replySituation(context);
  const replies: QuickReply[] = [];

  if (situation === "declined") {
    const [, notThisTime, doorOpen] = declineNoteLines(title);
    replies.push({
      id: "decision",
      label: "Tell them the decision",
      text: `${hello}, and for the time and effort you put into every step. We have finished reviewing your application for ${role}. ${notThisTime} ${doorOpen}`,
    });
  } else if (situation === "interview") {
    replies.push({
      id: "interview",
      label: "About the interview",
      text: `${hello}. The next step is a video call with our team: about 30 minutes, a conversation and not another test. The time is on your Applications page and in your email. If you cannot make it, tell us there which times work for you and we will set a new one.`,
    });
  } else if (situation === "testing") {
    replies.push({
      id: "testing",
      label: "Steps still to do",
      text: `${hello}. Your application for ${role} is not finished yet: there are still steps to complete. You can pick up where you left off on your Applications page. Once every step is done, we review it and email you a yes or no.`,
    });
  } else if (situation === "reviewing") {
    replies.push({
      id: "reviewing",
      label: "Still reviewing",
      text: `${hello}. Your application for ${role} is complete, and we are reviewing it now. Everyone who finishes every step gets a yes or no from us by email, so you will hear from us either way.`,
    });
  }

  replies.push({
    id: "received",
    label: "Got your message",
    text: `${hello}. We have it, and we will get back to you as soon as we can.`,
  });
  return replies;
}
