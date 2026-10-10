/**
 * headTags.ts: set one tag in the page's <head> and get back a function that
 * puts it back as it was. Shared by the job page (JobPageHead) and every other
 * public page (usePageHead), so leaving a page never leaves its title,
 * canonical or robots rule behind on the next one.
 */

/** Where search engines are told every public page lives. */
export const SITE_ORIGIN = "https://hireflownow.com";

export function setMeta(attribute: "name" | "property", key: string, content: string): () => void {
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

export function setCanonical(href: string): () => void {
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
