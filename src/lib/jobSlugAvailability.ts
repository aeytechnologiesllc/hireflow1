/**
 * Is a job name free? (docs/SHORT-JOB-LINKS.md §4)
 *
 * Within one business since 2026-10-10: links are /c/<business>/<job>, so two
 * businesses may both have "team-lead" and only the business's own jobs can
 * hold a name. Asked against what the signed-in person can read of that
 * business: its published jobs (the public view) and the jobs they can see.
 * A team member may not see every draft, so the database's unique index
 * (jobs_slug_per_business) still has the last word at save, and the editor
 * turns that refusal into the same words (slugSaveProblem in jobSlug.ts).
 */
import { supabase } from "@/integrations/supabase/client";
import { slugCandidates, slugSaveProblem, suggestJobSlug } from "@/lib/jobSlug";

/** The names in `names` another job of the business already holds.
 *  `exceptJobId` is the job being edited: its own name is not "taken". */
export async function takenSlugs(names: string[], exceptJobId: string | null | undefined, employerId: string): Promise<Set<string>> {
  const wanted = names.filter(Boolean);
  if (wanted.length === 0) return new Set();
  const [published, own] = await Promise.all([
    supabase.from("published_jobs_public").select("id, slug").eq("employer_id", employerId).in("slug", wanted),
    supabase.from("jobs").select("id, slug").eq("employer_id", employerId).in("slug", wanted),
  ]);
  if (published.error) throw published.error;
  const taken = new Set<string>();
  for (const row of [...(published.data ?? []), ...(own.data ?? [])]) {
    if (row.slug && row.id !== exceptJobId) taken.add(row.slug);
  }
  return taken;
}

/** The first free name among base, base-2, base-3 …, or null. */
export async function firstFreeSlug(base: string, exceptJobId: string | null | undefined, employerId: string): Promise<string | null> {
  const names = slugCandidates(base);
  const taken = await takenSlugs(names, exceptJobId, employerId);
  return names.find((name) => !taken.has(name)) ?? null;
}

/**
 * Gives a just-published job the free short link nearest its title
 * (team-lead, else team-lead-2 …), for the create flow that has no Short link
 * field of its own. Best effort and never in the way of publishing: null means
 * the job keeps its old link, and the owner can name it in the job editor.
 */
export async function claimSuggestedSlug(jobId: string, title: string): Promise<string | null> {
  const base = suggestJobSlug(title);
  if (!base) return null;
  const candidates = slugCandidates(base);
  let names = candidates;
  try {
    // The job's own business: names are unique within it.
    const { data: job } = await supabase.from("jobs").select("employer_id").eq("id", jobId).maybeSingle();
    if (!job?.employer_id) throw new Error("no employer");
    const taken = await takenSlugs(candidates, jobId, job.employer_id);
    names = candidates.filter((name) => !taken.has(name));
  } catch {
    // Try them in order; the database refuses a taken one.
  }
  for (const name of names) {
    const { data, error } = await supabase.from("jobs").update({ slug: name }).eq("id", jobId).select("slug").maybeSingle();
    if (!error) return data?.slug === name ? name : null;
    if (slugSaveProblem(error) !== "taken") return null;
  }
  return null;
}
