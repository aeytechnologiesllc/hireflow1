#!/usr/bin/env node
/**
 * scripts/guards/staff-evaluation-columns.mjs fails on the reads the
 * application_evaluations move replaced (2026-10-25) and passes on what
 * replaced them. Each "old" snippet is the pre-move code, word for word in
 * its query; each "new" one is what the file says now.
 *
 * Run with: node scripts/staff_evaluation_columns_guard.test.mjs
 */
import { evaluationReadProblems } from "./guards/staff-evaluation-columns.mjs";

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}
const fails = (name, code) => {
  const p = evaluationReadProblems("x.ts", code);
  check(`fails: ${name}`, p.length > 0, "no problem found");
};
const passes = (name, code) => {
  const p = evaluationReadProblems("x.ts", code);
  check(`passes: ${name}`, p.length === 0, p.join(" | "));
};

// The interview guide's scorecard (useInterviewGuide.ts).
fails("a select naming ai_scorecard", `supabase.from("applications").select("ai_scorecard, job_id, jobs(workflow_steps)").eq("id", applicationId!).maybeSingle(),`);
passes("the same through the embed", `supabase.from("applications").select("job_id, jobs(workflow_steps), application_evaluations(ai_scorecard)").eq("id", applicationId!).maybeSingle(),`);
// A multi-line select in an edge function (ava-voice-session's assistant brief).
fails("a template select naming the five", "const { data } = await supabaseClient\n  .from(\"applications\")\n  .select(`\n    id, status, phase, ai_score, ai_analysis, phase_ai_analysis, notes,\n    jobs!inner(id, title)\n  `)\n  .eq(\"id\", applicationId)\n  .single();");
passes("the same with the five embedded", "const { data } = await supabaseClient\n  .from(\"applications\")\n  .select(`\n    id, status, phase, notes,\n    jobs!inner(id, title),\n    application_evaluations(ai_score, ai_analysis, phase_ai_analysis)\n  `)\n  .eq(\"id\", applicationId)\n  .single();");
passes("an inner embed with a hint", `supabaseClient.from("applications").select("id, jobs!inner(employer_id), application_evaluations!inner(ai_score)").lte("application_evaluations.ai_score", 40);`);
// get-subscription's count, and ava-voice-tools' bulk decline.
fails("a filter on applications by ai_score", `const { count } = await admin.from("applications").select("*", { count: "exact", head: true }).in("job_id", jobIds).not("ai_score", "is", null);`);
fails("an order by ai_score", `await supabase.from("applications").select("id").order("ai_score", { ascending: false });`);
passes("the count from application_evaluations", `const { count } = await admin.from("application_evaluations").select("application_id", { count: "exact", head: true }).in("application_id", appIds).not("ai_score", "is", null);`);
// select * and then a read (ApplicationFormPhase's "reconsidered", trigger-ava-analysis's fallback).
fails("select * then reading .ai_analysis", `const { data } = await supabase.from("applications").select("*, jobs(title)").eq("id", id).single();\nconst again = data.status === "pending" && !data.ai_analysis;`);
passes("select * with the embed laid back on", "const { data: row } = await admin.from(\"applications\").select(`*, jobs(title), application_evaluations(ai_score, ai_analysis)`).eq(\"id\", id).single();\nconst application = withEvaluation(row);\nif (application.ai_analysis) {}");
passes("select * that never reads the five", `const { data } = await supabase.from("applications").select("*, jobs(title)").eq("id", id).single();\nconst open = data.status === "pending";`);
// Writes stay fine.
passes("a write of the team's notes", `await supabase.from("applications").update({ employer_notes: notes || null }).eq("id", applicationId);`);
passes("a write built on an object", `const updates: any = { status: "rejected" };\nif (reason) updates.employer_notes = reason;\nawait supabaseClient.from("applications").update(updates).eq("id", id);`);
passes("a grader's summary write", `await admin.from("applications").update({ phase_ai_analysis: analysisText }).eq("id", applicationId);`);
fails("a write that reads the five back", `const { data } = await supabase.from("applications").update({ status: "x" }).eq("id", id).select("id, ai_score").single();`);
// A column list kept in a constant is read too.
fails("a select through a constant naming ai_score", `const COLUMNS = "id, status, ai_score";\nawait supabase.from("applications").select(COLUMNS).eq("job_id", jobId);`);
passes("a constant without the five", `const COLUMNS = "id, status, notes";\nawait supabase.from("applications").select(COLUMNS).eq("job_id", jobId);`);
// Comments and other tables do not count.
passes("a comment naming the old select", `// supabase.from("applications").select("ai_score")\nawait supabase.from("applications").select("id");`);
passes("the staff view", `await supabase.from("applications_staff_list").select("id, ai_score, ai_scorecard").in("job_id", ids);`);
passes("a list inside Promise.all, next to another query", `await Promise.all([supabase.from("applications").select("id, job_id").in("id", ids), supabase.from("profiles").select("user_id, ai_score")]);`);

// The review of the move: .or(...) filters, and the scorecard copy in notes.
fails("an .or(...) filter by ai_score", `supabase.from("applications").select("id").or("ai_score.gte.60,status.eq.hired");`);
passes("an .or(...) filter on other columns", `supabase.from("applications").select("id").or("status.eq.hired,phase.eq.offer");`);
fails("notes.avaScorecard read", `const card = notes.avaScorecard;`);
fails("notes.avaScorecard written", `await admin.rpc("merge_application_notes", { p_application_id: id, p_patch: { avaScorecard: scorecard } });`);
passes("ai_scorecard from the evaluation", `const card = application.ai_scorecard;`);

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
