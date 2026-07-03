/**
 * JobPostingJsonLd — injects schema.org/JobPosting structured data (JSON-LD) into <head> for a
 * public job page so the role is eligible for Google for Jobs discovery.
 * Renders nothing visually. Google can render client-generated structured data, and the sitemap
 * points crawlers at these leaf job pages.
 */
import { useEffect } from "react";
import { inferCountryCode, isFullyRemoteText } from "@/lib/jobLocation";

export interface JobLocationStruct {
  city?: string | null;
  region?: string | null;
  country?: string | null;
  countryCode?: string | null;
  lat?: number | null;
  lon?: number | null;
}

export interface JobPostingJob {
  id: string;
  title: string;
  description?: string | null;
  responsibilities?: string | null;
  requirements?: string | null;
  location?: string | null;
  job_type?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  salary_period?: string | null;
  created_at: string;
  application_deadline?: string | null;
  job_code?: string | null;
  // Structured location (resolved by the geocode fn at create time).
  location_city?: string | null;
  location_region?: string | null;
  location_country?: string | null;
  location_country_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_remote?: boolean | null;
  /** Extra structured locations for multi-city / multi-country postings. */
  locations?: JobLocationStruct[] | null;
}

/** schema.org Place from a structured location (real country code + coords → precise geo-targeting). */
function placeOf(p: JobLocationStruct) {
  const address: Record<string, unknown> = { "@type": "PostalAddress" };
  if (p.city) address.addressLocality = p.city;
  if (p.region) address.addressRegion = p.region;
  if (p.countryCode) address.addressCountry = p.countryCode;
  else if (p.country) address.addressCountry = p.country;
  const place: Record<string, unknown> = { "@type": "Place", address };
  if (p.lat != null && p.lon != null) {
    place.geo = { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lon };
  }
  return place;
}

const EMP_TYPE: Record<string, string> = {
  "full-time": "FULL_TIME",
  full_time: "FULL_TIME",
  "part-time": "PART_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACTOR",
  contractor: "CONTRACTOR",
  temporary: "TEMPORARY",
  temp: "TEMPORARY",
  internship: "INTERN",
};

const CANONICAL_ORIGIN = "https://hireflownow.com";

function isAbsoluteUrl(value?: string | null): value is string {
  return !!value && /^https?:\/\//i.test(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toParagraphs(value?: string | null): string {
  const text = (value ?? "").trim();
  if (!text) return "";
  return text
    .split(/\n{2,}/)
    .map((part) => `<p>${escapeHtml(part.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function textSummary(job: JobPostingJob, company?: string | null): string {
  const pieces = [job.description, job.responsibilities, job.requirements]
    .map((part) => (part ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const summary = pieces.join(" ").slice(0, 155);
  if (summary) return summary;
  return `Apply for ${job.title}${company ? ` at ${company}` : ""} on HireFlow.`;
}

function setNamedMeta(name: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("name", name);
    document.head.appendChild(tag);
  }
  const previous = tag.getAttribute("content");
  tag.setAttribute("content", content);
  return () => {
    if (previous == null) tag.remove();
    else tag.setAttribute("content", previous);
  };
}

function setPropertyMeta(property: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("property", property);
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

export function JobPostingJsonLd({ job, company, logo }: { job: JobPostingJob; company?: string | null; logo?: string | null }) {
  useEffect(() => {
    if (!job) return;
    const url = `${CANONICAL_ORIGIN}/candidate/job/${job.id}`;
    const loc = (job.location ?? "").trim();
    const isRemote = job.is_remote === true || isFullyRemoteText(loc, job.job_type, job.description);

    // Structured primary location (from the geocoder) + any extra multi-city locations.
    const primary: JobLocationStruct = {
      city: job.location_city,
      region: job.location_region,
      country: job.location_country,
      countryCode: job.location_country_code,
      lat: job.latitude,
      lon: job.longitude,
    };
    const hasStructured = !!(primary.countryCode || primary.country);
    const allPlaces = [primary, ...((job.locations as JobLocationStruct[] | null) ?? [])].filter(
      (p) => p && (p.countryCode || p.country),
    );
    const fallbackCountryCode = inferCountryCode(loc);

    const descHtml =
      [
        toParagraphs(job.description),
        job.responsibilities ? `<p>Responsibilities:</p>${toParagraphs(job.responsibilities)}` : "",
        job.requirements ? `<p>Requirements:</p>${toParagraphs(job.requirements)}` : "",
      ]
        .filter(Boolean)
        .join("") || `<p>${escapeHtml(job.title)}</p>`;

    const empType = EMP_TYPE[(job.job_type ?? "").toLowerCase()] ?? "FULL_TIME";

    const data: Record<string, unknown> = {
      "@context": "https://schema.org/",
      "@type": "JobPosting",
      title: job.title,
      description: descHtml,
      datePosted: new Date(job.created_at).toISOString(),
      employmentType: empType,
      directApply: true,
      url,
      identifier: { "@type": "PropertyValue", name: company || "HireFlow", value: job.job_code || job.id },
      hiringOrganization: {
        "@type": "Organization",
        name: company || "confidential",
        ...(isAbsoluteUrl(logo) ? { logo } : {}),
      },
    };

    if (job.application_deadline) {
      data.validThrough = new Date(job.application_deadline).toISOString();
    }

    if (isRemote) {
      data.jobLocationType = "TELECOMMUTE";
      // Where applicants may be located — the job's real country (never hard-coded US).
      // Google requires applicantLocationRequirements for remote roles; omit only if truly unknown.
      const reqName = primary.country || primary.countryCode || fallbackCountryCode;
      if (reqName) {
        data.applicantLocationRequirements = { "@type": "Country", name: reqName };
      }
      // A remote role can still carry its home base for context.
      if (hasStructured) data.jobLocation = placeOf(primary);
    } else if (allPlaces.length > 0) {
      // Precise structured geo (one or many cities) — correct country, region, coords.
      data.jobLocation = allPlaces.length === 1 ? placeOf(allPlaces[0]) : allPlaces.map(placeOf);
    } else if (loc && fallbackCountryCode) {
      data.jobLocation = {
        "@type": "Place",
        address: { "@type": "PostalAddress", addressLocality: loc, addressCountry: fallbackCountryCode },
      };
    }

    if (job.salary_min != null || job.salary_max != null) {
      const period = (job.salary_period || "").toUpperCase();
      const unitText = ["HOUR", "DAY", "WEEK", "MONTH", "YEAR"].includes(period)
        ? period
        : (job.salary_max ?? job.salary_min ?? 0) > 2000 ? "YEAR" : "HOUR";
      const salaryValue =
        job.salary_min != null && job.salary_max != null && job.salary_min !== job.salary_max
          ? { minValue: job.salary_min, maxValue: job.salary_max }
          : { value: job.salary_min ?? job.salary_max };
      data.baseSalary = {
        "@type": "MonetaryAmount",
        currency: job.salary_currency || "USD",
        value: {
          "@type": "QuantitativeValue",
          ...salaryValue,
          unitText,
        },
      };
    }

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-jobposting", job.id);
    script.text = JSON.stringify(data);
    document.head.appendChild(script);

    const title = `${job.title}${company ? ` at ${company}` : ""} | HireFlow`;
    const description = textSummary(job, company);
    const previousTitle = document.title;
    document.title = title;
    const cleanups = [
      setCanonical(url),
      setNamedMeta("description", description),
      setNamedMeta("robots", "index, follow"),
      setPropertyMeta("og:type", "article"),
      setPropertyMeta("og:title", title),
      setPropertyMeta("og:description", description),
      setPropertyMeta("og:url", url),
      setPropertyMeta("og:site_name", "HireFlow"),
      setNamedMeta("twitter:title", title),
      setNamedMeta("twitter:description", description),
    ];

    return () => {
      script.remove();
      document.title = previousTitle;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [job, company, logo]);

  return null;
}

export default JobPostingJsonLd;
