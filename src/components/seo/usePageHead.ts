/**
 * usePageHead: a public page's own title, canonical address and robots rule.
 *
 * The app is one HTML shell, and that shell named the careers page as the
 * title and canonical of EVERY address: Privacy, Terms, sign-in and any
 * mistyped address all told Google "I am the homepage", so Google folded
 * them into it and dropped them (SEO check, 2026-10-09). A page that should
 * be found under its own address calls this with its path; a page that should
 * not be in search at all (an address that does not exist, a sign-in screen)
 * passes noindex. Everything is put back when the page is left. The job page
 * has its own (JobPageHead), with the job's description and share tags.
 */
import { useEffect } from "react";
import { SITE_ORIGIN, setCanonical, setMeta } from "@/lib/headTags";

export interface PageHead {
  title: string;
  /** The address search engines should list it under ("/privacy"). Leave out with noindex. */
  path?: string;
  description?: string;
  /** Keep it out of search (and do not follow its links as its own). */
  noindex?: boolean;
}

export function usePageHead({ title, path, description, noindex }: PageHead): void {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;
    const cleanups: Array<() => void> = [setMeta("name", "robots", noindex ? "noindex, follow" : "index, follow")];
    if (path && !noindex) {
      const url = `${SITE_ORIGIN}${path}`;
      cleanups.push(setCanonical(url), setMeta("property", "og:url", url));
    }
    cleanups.push(setMeta("property", "og:title", title), setMeta("name", "twitter:title", title));
    if (description) {
      cleanups.push(setMeta("name", "description", description), setMeta("property", "og:description", description), setMeta("name", "twitter:description", description));
    }
    return () => {
      document.title = previousTitle;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [title, path, description, noindex]);
}

/** usePageHead as a component, for a branch of a page that returns early (hooks cannot be called there). */
export function PageHeadTags(props: PageHead): null {
  usePageHead(props);
  return null;
}
