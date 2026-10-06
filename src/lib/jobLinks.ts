/**
 * The job links the app hands out, on the candidates' site whichever host
 * built them (docs/SHORT-JOB-LINKS.md §3). The rules are in jobSlug.ts; this
 * file only adds the origin, which needs the browser.
 */
import { candidateOrigin } from "@/lib/hosts";
import { jobPagePath, jobShareLink, type LinkableJob } from "@/lib/jobSlug";

/** The link to share for a job: hireflownow.com/<slug> when it has one. */
export function jobShareUrl(job: LinkableJob): string {
  return jobShareLink(candidateOrigin(), job);
}

/** The job's page as a candidate opens it (for "see it the way a candidate does"). */
export function jobPageUrl(job: LinkableJob): string {
  return `${candidateOrigin()}${jobPagePath(job)}`;
}
