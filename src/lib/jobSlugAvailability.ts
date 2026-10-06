/**
 * Is a short link name free? (docs/SHORT-JOB-LINKS.md §4)
 *
 * Asked against what the signed-in person can read: every published job (the
 * public view) and every job of their own account. Another company's draft is
 * invisible here, so the database's unique index (jobs_slug_unique) still has
 * the last word at save, and the editor turns that refusal into the same words
 * (slugSaveProblem in jobSlug.ts).
 */
import { supabase } from "@/integrations/supabase/client";
import { slugCandidates, slugSaveProblem, suggestJobSlug } from "@/lib/jobSlug";

/** The names in `names` another job already holds. `exceptJobId` is the job
 *  being edited: its own name is not "taken". */
export async function takenSlugs(names: string[], exceptJobId?: string | null): Promise<Set<string>> {
  const wanted = names.filter(Boolean);
  if (wanted.length === 0) return new Set();
  const [published, own] = await Promise.all([
    supabase.from("published_jobs_public").select("id, slug").in("slug", wanted),
    supabase.from("jobs").select("id, slug").in("slug", wanted),
  ]);
  if (published.error) throw published.error;
  const taken = new Set<string>();
  for (const row of [...(published.data ?? []), ...(own.data ?? [])]) {
    if (row.slug && row.id !== exceptJobId) taken.add(row.slug);
  }
  return taken;
}

/** The first free name among base, base-2, base-3 …, or null. */
export async function firstFreeSlug(base: string, exceptJobId?: string | null): Promise<string | null> {
  const names = slugCandidates(base);
  const taken = await takenSlugs(names, exceptJobId);
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
    const taken = await takenSlugs(candidates, jobId);
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
