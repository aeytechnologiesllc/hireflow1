import type { FixtureAuthUser, FixtureRow, FixtureTables } from "./fixtureClient";

/**
 * "Request documents", offline (docs/DOCUMENT-REQUESTS.md).
 *
 * `?__previewRequests=sent` puts a few requests in each state on the page:
 * for the hiring side, on the offered and hired applicants (an ID and a
 * payment email received, an NBI clearance waiting, a TIN approved; an ID
 * approved two days ago on the hired one); for an applicant, on their own
 * application (an ID and a payment email to send, a TIN asked for again).
 * Without the flag nothing is seeded, and a request SENT in the preview is
 * stored like any other row.
 *
 * The requested-document-url function answers here with a stand-in picture,
 * so "Open" can be pressed. Nothing leaves the machine; the request's email is
 * kept on the window like every other preview email.
 */

const DAY = 86_400_000;

/** A stand-in for the applicant's photo of an ID: no network, ever. */
function previewIdPicture(title: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="350" viewBox="0 0 560 350">` +
    `<rect width="560" height="350" rx="18" fill="#f3efe6"/>` +
    `<rect x="28" y="28" width="150" height="190" rx="10" fill="#d9d2c3"/>` +
    `<text x="206" y="70" font-family="sans-serif" font-size="15" fill="#6b6457">PREVIEW - not a real document</text>` +
    `<text x="206" y="118" font-family="sans-serif" font-size="30" font-weight="700" fill="#1f2a24">${title.replace(/[<&>]/g, "")}</text>` +
    `<text x="206" y="160" font-family="sans-serif" font-size="17" fill="#3f4a44">Ana Maria Reyes</text>` +
    `<text x="28" y="300" font-family="monospace" font-size="13" fill="#8a8274">The applicant's real file opens here, for five minutes.</text>` +
    `</svg>`;
  // A blob: link, not data:, because a browser will not open a data: link in a new tab.
  return URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
}

function request(application: FixtureRow, fields: Partial<FixtureRow> & { id: string; document_type: string; status: string }): FixtureRow {
  const created = new Date(Date.now() - 2 * DAY).toISOString();
  return {
    application_id: application.id,
    employer_id: null,
    candidate_id: application.candidate_id,
    custom_document_name: null,
    description: null,
    is_required: true,
    due_date: new Date(Date.now() + 3 * DAY).toISOString(),
    file_url: null,
    file_name: null,
    answer_text: null,
    submitted_at: null,
    reviewed_at: null,
    reviewed_by: null,
    rejection_reason: null,
    candidate_viewed_at: null,
    file_deleted_at: null,
    team_opened_at: null,
    package_id: null,
    created_at: created,
    updated_at: created,
    ...fields,
  };
}

const ID_ASK = "A clear photo of your passport, PhilSys national ID, UMID or driver's license. Both sides if it has two.";
const PAY_ASK = "The email you use on Wise or PayPal, so we can pay you there.";

export function previewRequests(tables: FixtureTables, user: FixtureAuthUser, hiringSide: boolean, spec: string | null) {
  const rows: FixtureRow[] = (tables.document_requests ??= []);
  // A request sent in the preview gets what the database would give it.
  const push = rows.push.bind(rows);
  rows.push = (...added: FixtureRow[]) =>
    push(...added.map((row) => ({ ...row, status: row.status ?? "pending", created_at: row.created_at ?? new Date().toISOString() })));
  if ((spec ?? "").split(",").map((w) => w.trim()).includes("sent")) {
    const applications = tables.applications ?? [];
    const employerOf = (application: FixtureRow) => (tables.jobs ?? []).find((j) => j.id === application.job_id)?.employer_id ?? null;
    const sentAt = new Date(Date.now() - 5 * 3600_000).toISOString();
    if (hiringSide) {
      const offered = applications.find((a) => a.status === "offered");
      const hired = applications.find((a) => a.status === "hired");
      if (offered) {
        const folder = `${offered.candidate_id}/`;
        rows.push(
          request(offered, { id: "d7000000-0000-4000-8000-000000000001", document_type: "government_id", description: ID_ASK, status: "submitted", file_url: `${folder}d7000000-0000-4000-8000-000000000001/id.jpg`, file_name: "philsys-id.jpg", submitted_at: sentAt, employer_id: employerOf(offered) }),
          request(offered, { id: "d7000000-0000-4000-8000-000000000002", document_type: "payment_email", description: PAY_ASK, status: "submitted", answer_text: "marisol.wise@example.com", submitted_at: sentAt, employer_id: employerOf(offered) }),
          request(offered, { id: "d7000000-0000-4000-8000-000000000003", document_type: "nbi_clearance", description: "A photo or PDF of your NBI clearance.", status: "pending", employer_id: employerOf(offered) }),
          request(offered, { id: "d7000000-0000-4000-8000-000000000004", document_type: "tin", description: "Your Tax Identification Number.", status: "approved", answer_text: "123-456-789-000", submitted_at: sentAt, reviewed_at: sentAt, employer_id: employerOf(offered) }),
        );
      }
      if (hired) {
        // Opened an hour ago: HireFlow deletes it in 23 hours (the owner, 2026-10-10).
        const at = new Date(Date.now() - 3 * 3600_000).toISOString();
        const opened = new Date(Date.now() - 3600_000).toISOString();
        rows.push(
          request(hired, { id: "d7000000-0000-4000-8000-000000000005", document_type: "government_id", description: ID_ASK, status: "approved", file_url: `${hired.candidate_id}/d7000000-0000-4000-8000-000000000005/id.jpg`, file_name: "passport.jpg", submitted_at: at, reviewed_at: opened, team_opened_at: opened, employer_id: employerOf(hired) }),
        );
      }
    } else {
      const mine = applications.find((a) => a.candidate_id === user.id);
      if (mine) {
        rows.push(
          request(mine, { id: "d7000000-0000-4000-8000-000000000011", document_type: "government_id", description: ID_ASK, status: "pending", employer_id: employerOf(mine) }),
          request(mine, { id: "d7000000-0000-4000-8000-000000000012", document_type: "payment_email", description: PAY_ASK, status: "pending", employer_id: employerOf(mine) }),
          request(mine, {
            id: "d7000000-0000-4000-8000-000000000013",
            document_type: "tin",
            description: "Your Tax Identification Number.",
            status: "rejected",
            answer_text: "123-456",
            rejection_reason: "That looks too short. Please check your TIN.",
            submitted_at: sentAt,
            reviewed_at: sentAt,
            employer_id: employerOf(mine),
          }),
        );
      }
    }
  }

  return (name: string, options?: { body?: unknown }) => {
    if (name !== "requested-document-url") return null;
    const id = String((options?.body as { requestId?: unknown } | undefined)?.requestId ?? "");
    const row = rows.find((r) => r.id === id);
    if (!row || !row.file_url) return { data: null, error: new Error("Nothing has been sent for this request") };
    // The hiring side's first look starts an ID's 24 hours, as the function does.
    if (hiringSide && !row.team_opened_at) row.team_opened_at = new Date().toISOString();
    const title = row.document_type === "nbi_clearance" ? "NBI clearance" : row.document_type === "proof_of_address" ? "Proof of address" : "Government ID";
    return { data: { signedUrl: previewIdPicture(title), fileName: String(row.file_name ?? ""), expiresIn: 300 }, error: null };
  };
}

/**
 * The hiring flow, offline (`?__previewHiring=done,offer`). `done`: the
 * applicant at Interview had their interview yesterday (completed), so the
 * page leads with "Send offer letter". `offer`: the applicant at Offer has an
 * offer letter waiting for their signature, so the Hire box says the welcome
 * email asks them to sign it.
 */
export function previewHiring(tables: FixtureTables, spec: string | null) {
  const flags = (spec ?? "").split(",").map((w) => w.trim()).filter(Boolean);
  if (flags.includes("done")) {
    const atInterview = (tables.applications ?? []).find((a) => a.status === "interview");
    for (const row of tables.interviews ?? []) {
      if (atInterview && row.application_id === atInterview.id) {
        row.status = "completed";
        row.scheduled_at = new Date(Date.now() - DAY).toISOString();
      }
    }
  }
  if (flags.includes("offer")) {
    const offered = (tables.applications ?? []).find((a) => a.status === "offered");
    if (offered) {
      (tables.documents ??= []).push({
        id: "d0c00000-0000-4000-8000-0000000000f1",
        application_id: offered.id,
        name: "Offer letter",
        document_type: "offer_letter",
        status: "pending",
        is_voided: false,
        candidate_signed_at: null,
        recipient_id: offered.candidate_id,
        created_at: new Date(Date.now() - 2 * DAY).toISOString(),
        updated_at: new Date(Date.now() - 2 * DAY).toISOString(),
      });
    }
  }
}
