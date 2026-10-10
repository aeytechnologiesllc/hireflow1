// welcomeTodo: what the hire (status_hired) and "please send your documents"
// (document_requested) emails list, built from what is really waiting for the
// applicant, never from the request (docs/DOCUMENT-REQUESTS.md, "Hiring").
//
// The owner, 2026-10-10: when he presses Hire, "she will actually get a nice
// congratulations email and it will say things like documents requested,
// please log in to your HireFlow to submit those documentation and sign
// stuff". The function reads the application's open document requests and its
// offer letter, and this turns them into the list the email shows.
//
// The lines are the same as todoLine() in src/lib/documentRequests.ts, so the
// Hire dialog's preview is the email word for word;
// scripts/document_requests.test.mjs fails if they drift apart.

export interface WaitingRequest {
  document_type: string;
  custom_document_name?: string | null;
  due_date?: string | null;
}

export interface WelcomeTodo {
  /** One line per thing to do, in order: the offer first, then each document. */
  items: string[];
  /** Whole days until the earliest due date still ahead, or null. */
  dueInDays: number | null;
  /** True when an identity paper is asked for (deleted 24 hours after the team first opens it). */
  deletesIds: boolean;
  /** True when at least one document is asked for (not only a signature). */
  asksForDocuments: boolean;
}

export const SIGN_OFFER_LINE = "Sign your offer letter";

const LINES: Record<string, string> = {
  government_id: "Send a photo of your government ID",
  nbi_clearance: "Send your NBI clearance",
  proof_of_address: "Send a proof of address",
  tin: "Type your TIN",
  payment_email: "Type the email you use on Wise or PayPal",
};

/** The same kinds as ID_PAPER_KINDS in src/lib/documentRequests.ts. */
const DELETED_KINDS = ["government_id", "nbi_clearance", "proof_of_address"];

const OLDER: Record<string, string> = {
  drivers_license: "driver's license",
  ssn_card: "Social Security card",
  passport: "passport",
  work_authorization: "work authorization",
  tax_form: "tax form",
  id_card: "government ID",
  bank_details: "bank details",
};

function plain(value: unknown, max = 80): string {
  if (typeof value !== "string") return "";
  // deno-lint-ignore no-control-regex
  return value.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();
}

/** One request as a line of the email. */
export function todoLine(kind: string, customName?: string | null): string {
  const named = plain(customName);
  if (named) return `Send: ${named}`;
  return LINES[kind] ?? `Send your ${OLDER[kind] ?? "document"}`;
}

export function welcomeTodo(input: { offerUnsigned: boolean; requests: readonly WaitingRequest[]; now?: Date }): WelcomeTodo {
  const now = (input.now ?? new Date()).getTime();
  const items: string[] = [];
  if (input.offerUnsigned) items.push(SIGN_OFFER_LINE);
  const seen = new Set<string>();
  let earliest: number | null = null;
  for (const request of input.requests) {
    const line = todoLine(request.document_type, request.custom_document_name);
    if (!seen.has(line)) {
      seen.add(line);
      items.push(line);
    }
    const due = request.due_date ? new Date(request.due_date).getTime() : NaN;
    if (!Number.isNaN(due) && due > now && (earliest === null || due < earliest)) earliest = due;
  }
  return {
    items: items.slice(0, 12),
    // The due date is the end of the day chosen ("5 days" ends late on the
    // fifth day), so whole days, rounded down: "within 5 days".
    dueInDays: earliest === null ? null : Math.max(1, Math.floor((earliest - now) / 86_400_000)),
    deletesIds: input.requests.some((r) => DELETED_KINDS.includes(r.document_type)),
    asksForDocuments: input.requests.length > 0,
  };
}
