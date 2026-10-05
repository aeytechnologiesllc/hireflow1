/**
 * The public job page's <head>: title, description, canonical and the share
 * tags. Renders nothing.
 *
 * This is what was left of JobPostingJsonLd when Google Jobs was removed
 * (owner, 2026-10-05: "remove google jobs"). The JobPosting structured data
 * went with it; the title and the link-preview tags stay, because a person
 * sharing the role's link still needs the job's name on it. The first load is
 * prerendered with the same tags by api/job-prerender.mjs; this keeps them
 * right on in-app navigation.
 */
import { useEffect } from "react";

const CANONICAL_ORIGIN = "https://hireflownow.com";

export interface JobPageHeadJob {
  id: string;
  title: string;
  description?: string | null;
  responsibilities?: string | null;
  requirements?: string | null;
}

function textSummary(job: JobPageHeadJob, company?: string | null): string {
  const pieces = [job.description, job.responsibilities, job.requirements]
    .map((part) => (part ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const summary = pieces.join(" ").slice(0, 155);
  if (summary) return summary;
  return `Apply for ${job.title}${company ? ` at ${company}` : ""}.`;
}

function setMeta(attribute: "name" | "property", key: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }
  const previous = tag.getAttribute("content");
  tag.setAttribute("content", content);
  return () => {
    if (previous == null) tag.remove();
    else tag.setAttribute("content", previous);
  };
}

function setCanonical(href: string) {
  let tag = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!tag) {
    tag = document.createElement("link");
    tag.setAttribute("rel", "canonical");
    document.head.appendChild(tag);
  }
  const previous = tag.getAttribute("href");
  tag.setAttribute("href", href);
  return () => {
    if (previous == null) tag.remove();
    else tag.setAttribute("href", previous);
  };
}

export function JobPageHead({ job, company }: { job: JobPageHeadJob; company?: string | null }) {
  useEffect(() => {
    const url = `${CANONICAL_ORIGIN}/candidate/job/${job.id}`;
    const title = company ? `${job.title} at ${company}` : `${job.title} | Zulu Support Team`;
    const description = textSummary(job, company);
    const previousTitle = document.title;
    document.title = title;
    const cleanups = [
      setCanonical(url),
      setMeta("name", "description", description),
      setMeta("property", "og:type", "article"),
      setMeta("property", "og:title", title),
      setMeta("property", "og:description", description),
      setMeta("property", "og:url", url),
      setMeta("name", "twitter:title", title),
      setMeta("name", "twitter:description", description),
    ];
    return () => {
      document.title = previousTitle;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [job, company]);

  return null;
}

export default JobPageHead;
