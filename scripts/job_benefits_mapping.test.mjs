#!/usr/bin/env node
/**
 * Proves the benefits WRITE-SIDE pipeline end to end, at the pure-logic seams
 * (no network, no Supabase) — the same seams the fix touched:
 *
 *   TalkToAva's set_brief_fields tool calls
 *     -> mergeBriefFromTool            (src/lib/avaEngine/jobBrief.ts)
 *     -> mapJobBriefToFormPayload      (src/lib/avaEngine/jobBrief.ts)
 *     -> AvaCreateJob's briefFields merge (plain object spread, mirrored here)
 *     -> briefFromForm                 (src/lib/avaEngine/playbook.ts)
 *     -> normalizeBenefits             (src/lib/jobBenefits.ts)
 *     -> the `benefits` column jobFromFlow.ts writes to `jobs`
 *
 * Before this fix, mapJobBriefToFormPayload's BriefFormPayload (role/location/
 * type/pay/start/work) had no `benefits` key at all, so a benefit Ava heard
 * ("we throw in free shift drinks") was captured into JobBrief.benefits by
 * mergeBriefFromTool and then silently dropped at that exact handoff — never
 * reaching briefFields, never reaching the `jobs` row. This file proves each
 * link now carries the value, and that normalizeBenefits (the last stop
 * before the DB) trims, dedupes case-insensitively, drops empties, and caps
 * a malformed/runaway list.
 *
 * Run with: node scripts/job_benefits_mapping.test.mjs
 */
import assert from "node:assert/strict";
import { normalizeBenefits, MAX_BENEFITS } from "../src/lib/jobBenefits.ts";
import { emptyJobBrief, mergeBriefFromTool, mapJobBriefToFormPayload } from "../src/lib/avaEngine/jobBrief.ts";
import { briefFromForm } from "../src/lib/avaEngine/playbook.ts";

let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}

console.log("-- normalizeBenefits: pure normalization --");
{
  check(
    "trims whitespace",
    JSON.stringify(normalizeBenefits(["  Health insurance  ", "401k "])) === JSON.stringify(["Health insurance", "401k"]),
  );
  check(
    "drops empty / whitespace-only entries",
    JSON.stringify(normalizeBenefits(["Free lunch", "", "   ", "PTO"])) === JSON.stringify(["Free lunch", "PTO"]),
  );
  check(
    "dedupes case-insensitively, first occurrence's casing wins",
    JSON.stringify(normalizeBenefits(["Health Insurance", "health insurance", "HEALTH INSURANCE"])) ===
      JSON.stringify(["Health Insurance"]),
  );
  check(
    "drops non-string entries instead of throwing",
    JSON.stringify(normalizeBenefits(["PTO", 42, null, { not: "a string" }, "Gym membership"])) ===
      JSON.stringify(["PTO", "Gym membership"]),
  );
  check("non-array input returns []", JSON.stringify(normalizeBenefits(undefined)) === "[]" && JSON.stringify(normalizeBenefits(null)) === "[]" && JSON.stringify(normalizeBenefits("Health insurance")) === "[]");
  check("empty array returns []", JSON.stringify(normalizeBenefits([])) === "[]");
  {
    const runaway = Array.from({ length: MAX_BENEFITS + 15 }, (_, i) => `Benefit ${i}`);
    const out = normalizeBenefits(runaway);
    check(`caps at MAX_BENEFITS (${MAX_BENEFITS})`, out.length === MAX_BENEFITS);
    check("cap keeps the first N, not a random subset", out[0] === "Benefit 0" && out[out.length - 1] === `Benefit ${MAX_BENEFITS - 1}`);
  }
}

console.log("\n-- mergeBriefFromTool: voice/typed tool-call args accumulate into JobBrief.benefits --");
{
  let brief = emptyJobBrief();
  check("starts empty", brief.benefits.length === 0);
  brief = mergeBriefFromTool(brief, { benefits: ["Free shift drinks"] });
  check("first tool call adds a benefit", JSON.stringify(brief.benefits) === JSON.stringify(["Free shift drinks"]));
  brief = mergeBriefFromTool(brief, { benefits: ["Flexible schedule", "free shift drinks"] });
  check(
    "a later tool call adds a new one and does not duplicate a case-variant repeat",
    JSON.stringify(brief.benefits) === JSON.stringify(["Free shift drinks", "Flexible schedule"]),
    JSON.stringify(brief.benefits),
  );
}

console.log("\n-- mapJobBriefToFormPayload: the handoff that used to drop benefits --");
{
  const brief = mergeBriefFromTool(emptyJobBrief(), {
    roleTitle: "Barista",
    location: "Springfield, IL",
    pay: "$16/hr",
    responsibilities: ["Pull shots"],
    benefits: ["Free shift drinks", "Flexible schedule"],
  });
  const payload = mapJobBriefToFormPayload(brief);
  check("BriefFormPayload carries the benefits array through", JSON.stringify(payload.benefits) === JSON.stringify(["Free shift drinks", "Flexible schedule"]));
  check("BriefFormPayload still carries the other fields (regression check)", payload.role === "Barista" && payload.pay === "$16/hr");

  const emptyPayload = mapJobBriefToFormPayload(emptyJobBrief());
  check("an empty brief maps to an empty (not missing) benefits array", Array.isArray(emptyPayload.benefits) && emptyPayload.benefits.length === 0);
}

console.log("\n-- briefFromForm: briefFields -> the JobBrief createJobFromFlow reads --");
{
  const formFields = {
    role: "Barista",
    location: "Springfield, IL",
    type: "Full-time · On-site",
    pay: "$16/hr",
    start: "Within a few weeks",
    work: "Make coffee",
    benefits: ["Free shift drinks", "Flexible schedule"],
  };
  const brief = briefFromForm(formFields);
  check("benefits reach the JobBrief briefFromForm returns", JSON.stringify(brief.benefits) === JSON.stringify(["Free shift drinks", "Flexible schedule"]));

  const withoutBenefits = briefFromForm({ ...formFields, benefits: undefined });
  check("omitting benefits defaults to [] rather than undefined (jobFromFlow.ts must never see undefined)", Array.isArray(withoutBenefits.benefits) && withoutBenefits.benefits.length === 0);
}

console.log("\n-- end to end: a spoken benefit survives every hop to what jobFromFlow.ts writes --");
{
  // Mirrors TalkToAva's onToolCall("set_brief_fields", ...) -> onComplete(mapJobBriefToFormPayload(...))
  // -> AvaCreateJob's `{ ...briefFields, ...payload }` merge -> briefFromForm(merged) -> the
  // normalizeBenefits() call jobFromFlow.ts's createJobFromFlow makes on brief.benefits.
  let voiceBrief = emptyJobBrief();
  voiceBrief = mergeBriefFromTool(voiceBrief, { roleTitle: "Barista", location: "Springfield, IL", pay: "$16/hr" });
  voiceBrief = mergeBriefFromTool(voiceBrief, { responsibilities: ["Pull shots", "Steam milk"] });
  voiceBrief = mergeBriefFromTool(voiceBrief, { benefits: ["free shift drinks"] });
  voiceBrief = mergeBriefFromTool(voiceBrief, { benefits: ["  Flexible schedule  ", "Free Shift Drinks"] }); // trailing-space + case-variant repeat, as a second conversational turn would send

  const initialBriefFields = { role: "", location: "", type: "Full-time · On-site", pay: "", start: "Within a few weeks", work: "", openings: 1, benefits: [] };
  const payload = mapJobBriefToFormPayload(voiceBrief);
  const merged = { ...initialBriefFields, ...payload }; // AvaCreateJob.tsx's onComplete merge

  const jobBrief = briefFromForm(merged); // the JobBrief createJobFromFlow(flow, brief, opts) receives
  const written = normalizeBenefits(jobBrief.benefits); // what createJobFromFlow puts in the `jobs` row

  check(
    "the spoken benefit reaches the row, deduped case-insensitively, first casing kept",
    JSON.stringify(written) === JSON.stringify(["free shift drinks", "Flexible schedule"]),
    JSON.stringify(written),
  );
  check("role/location/pay still make the trip unharmed (regression check)", merged.role === "Barista" && merged.location === "Springfield, IL" && merged.pay === "$16/hr");
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
