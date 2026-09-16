import { buildOwnedPortfolioPathPattern } from "./ownedPortfolioPath.ts";

// Realistic fixtures — real-shaped uuids, exactly the way
// PortfolioUploadPhase.tsx's uploadFiles() builds a path:
//   `${user.id}/${id}-${stepId}-${Date.now()}-${i}.${ext}`
const UID = "b3f1c2a4-9e21-4c3a-8d10-2f7e6a5c9b11";
const APPLICATION_ID = "7a2d4e6f-1b3c-4d5e-9f80-abc123def456";
const STEP_ID = "wf-portfolio-1";

function realisticPath(uid: string, applicationId: string, stepId: string, index: number, ext = "png") {
  return `${uid}/${applicationId}-${stepId}-${Date.now()}-${index}.${ext}`;
}

Deno.test("matches the exact path PortfolioUploadPhase.tsx's uploadFiles() produces", () => {
  const pattern = buildOwnedPortfolioPathPattern(UID, APPLICATION_ID, STEP_ID);
  const path = realisticPath(UID, APPLICATION_ID, STEP_ID, 0, "png");
  if (!pattern.test(path)) throw new Error(`expected match for ${path}`);
});

Deno.test("matches every file extension the page accepts", () => {
  const pattern = buildOwnedPortfolioPathPattern(UID, APPLICATION_ID, STEP_ID);
  for (const ext of ["jpg", "jpeg", "png", "webp", "gif", "pdf"]) {
    const path = realisticPath(UID, APPLICATION_ID, STEP_ID, 3, ext);
    if (!pattern.test(path)) throw new Error(`expected match for extension ${ext}: ${path}`);
  }
});

Deno.test("matches any file index in a multi-file submission", () => {
  const pattern = buildOwnedPortfolioPathPattern(UID, APPLICATION_ID, STEP_ID);
  for (let i = 0; i < 10; i++) {
    const path = realisticPath(UID, APPLICATION_ID, STEP_ID, i);
    if (!pattern.test(path)) throw new Error(`expected match for index ${i}: ${path}`);
  }
});

Deno.test("rejects a different candidate's uid (a stranger's file)", () => {
  const pattern = buildOwnedPortfolioPathPattern(UID, APPLICATION_ID, STEP_ID);
  const strangerUid = "ffffffff-ffff-ffff-ffff-ffffffffffff";
  const path = realisticPath(strangerUid, APPLICATION_ID, STEP_ID, 0);
  if (pattern.test(path)) throw new Error("a stranger's own path must never match this candidate's pattern");
});

Deno.test("rejects a path from a DIFFERENT application", () => {
  const pattern = buildOwnedPortfolioPathPattern(UID, APPLICATION_ID, STEP_ID);
  const otherApplicationId = "00000000-0000-0000-0000-000000000000";
  const path = realisticPath(UID, otherApplicationId, STEP_ID, 0);
  if (pattern.test(path)) throw new Error("a path naming a different application must not match");
});

Deno.test("rejects a path from a DIFFERENT step of the same application", () => {
  const pattern = buildOwnedPortfolioPathPattern(UID, APPLICATION_ID, STEP_ID);
  const path = realisticPath(UID, APPLICATION_ID, "wf-portfolio-2", 0);
  if (pattern.test(path)) throw new Error("a path naming a different step must not match");
});

Deno.test("rejects a path missing the timestamp/index suffix entirely", () => {
  const pattern = buildOwnedPortfolioPathPattern(UID, APPLICATION_ID, STEP_ID);
  const path = `${UID}/${APPLICATION_ID}-${STEP_ID}.png`;
  if (pattern.test(path)) throw new Error("a bare, un-timestamped path must not match");
});

Deno.test("rejects an extra path segment (folder traversal / nesting attempt)", () => {
  const pattern = buildOwnedPortfolioPathPattern(UID, APPLICATION_ID, STEP_ID);
  const path = `${UID}/extra/${APPLICATION_ID}-${STEP_ID}-1700000000000-0.png`;
  if (pattern.test(path)) throw new Error("an extra path segment must not match");
});

Deno.test("regex-special characters in applicationId/stepId cannot widen the match (injection)", () => {
  // If these were interpolated into the pattern unescaped, ".*" would turn
  // into "match anything", letting a crafted applicationId/stepId claim an
  // unrelated file. escapeRegExp must neutralize that.
  const trickyAppId = "app.*";
  const trickyStepId = "step)(.*";
  const pattern = buildOwnedPortfolioPathPattern(UID, trickyAppId, trickyStepId);

  // The tricky pattern should still match ITS OWN realistic path literally...
  const ownPath = `${UID}/${trickyAppId}-${trickyStepId}-1700000000000-0.png`;
  if (!pattern.test(ownPath)) throw new Error("escaped pattern should still match its own literal path");

  // ...but must NOT match a real, unrelated application/step's path just
  // because the tricky characters would have behaved as wildcards.
  const unrelatedPath = `${UID}/${APPLICATION_ID}-${STEP_ID}-1700000000000-0.png`;
  if (pattern.test(unrelatedPath)) {
    throw new Error("regex metacharacters in applicationId/stepId must not widen the match to unrelated files");
  }
});

Deno.test("rejects an unsupported extension shape (no extension at all)", () => {
  const pattern = buildOwnedPortfolioPathPattern(UID, APPLICATION_ID, STEP_ID);
  const path = `${UID}/${APPLICATION_ID}-${STEP_ID}-1700000000000-0`;
  if (pattern.test(path)) throw new Error("a path with no extension must not match");
});
