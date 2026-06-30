/**
 * JobPostingJsonLd — injects schema.org/JobPosting structured data (JSON-LD) into <head> for a
 * public job page so the role is eligible for Google for Jobs + Indeed organic ingestion.
 * Renders nothing visually. Googlebot renders client JS, so client injection is sufficient.
 */
import { useEffect } from "react";

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

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function JobPostingJsonLd({ job, company, logo }: { job: JobPostingJob; company?: string | null; logo?: string | null }) {
  useEffect(() => {
    if (!job) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "https://hireflownow.com";
    const url = `${origin}/candidate/job/${job.id}`;
    const loc = (job.location ?? "").trim();
    const isRemote = job.is_remote ?? (/remote/i.test(loc) || /remote/i.test(job.job_type ?? ""));

    // Structured primary location (from the geocoder) + any extra multi-city locations.
    const primary: JobLocationStruct = {
      city: job.location_city,
      region: job.location_region,
      country: job.location_country,
      countryCode: job.location_country_code,
      lat: job.latitude,
      lon: job.longitude,
    };
    const hasStructured = !!(primary.city || primary.countryCode || primary.country);
    const allPlaces = [primary, ...((job.locations as JobLocationStruct[] | null) ?? [])].filter(
      (p) => p && (p.city || p.countryCode || p.country),
    );

    const descHtml =
      [
        job.description ? `<p>${job.description}</p>` : "",
        job.responsibilities ? `<h3>What you'll do</h3><p>${job.responsibilities}</p>` : "",
        job.requirements ? `<h3>What we're looking for</h3><p>${job.requirements}</p>` : "",
      ]
        .filter(Boolean)
        .join("") || `<p>${job.title}</p>`;

    const empType = EMP_TYPE[(job.job_type ?? "").toLowerCase()] ?? "FULL_TIME";
    const validThrough = job.application_deadline ? new Date(job.application_deadline) : new Date(Date.now() + 60 * 86400000);

    const data: Record<string, unknown> = {
      "@context": "https://schema.org/",
      "@type": "JobPosting",
      title: job.title,
      description: descHtml,
      datePosted: isoDate(new Date(job.created_at)),
      validThrough: isoDate(validThrough),
      employmentType: empType,
      directApply: true,
      url,
      identifier: { "@type": "PropertyValue", name: company || "HireFlow", value: job.job_code || job.id },
      hiringOrganization: {
        "@type": "Organization",
        name: company || "Confidential",
        ...(logo ? { logo } : {}),
      },
    };

    if (isRemote) {
      data.jobLocationType = "TELECOMMUTE";
      // Where applicants may be located — the job's real country (never hard-coded US).
      // Google requires applicantLocationRequirements for remote roles; omit only if truly unknown.
      const reqName = primary.country || primary.countryCode;
      if (reqName) {
        data.applicantLocationRequirements = { "@type": "Country", name: reqName };
      }
      // A remote role can still carry its home base for context.
      if (hasStructured) data.jobLocation = placeOf(primary);
    } else if (allPlaces.length > 0) {
      // Precise structured geo (one or many cities) — correct country, region, coords.
      data.jobLocation = allPlaces.length === 1 ? placeOf(allPlaces[0]) : allPlaces.map(placeOf);
    } else if (loc) {
      // Fallback: free-text only, country unknown — locality without a (possibly wrong) country.
      data.jobLocation = { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: loc } };
    }

    if (job.salary_min != null || job.salary_max != null) {
      const period = (job.salary_period || "").toUpperCase();
      const unitText = ["HOUR", "DAY", "WEEK", "MONTH", "YEAR"].includes(period)
        ? period
        : (job.salary_max ?? job.salary_min ?? 0) > 2000 ? "YEAR" : "HOUR";
      data.baseSalary = {
        "@type": "MonetaryAmount",
        currency: job.salary_currency || "USD",
        value: {
          "@type": "QuantitativeValue",
          ...(job.salary_min != null ? { minValue: job.salary_min } : {}),
          ...(job.salary_max != null ? { maxValue: job.salary_max } : {}),
          unitText,
        },
      };
    }

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-jobposting", job.id);
    script.text = JSON.stringify(data);
    document.head.appendChild(script);

    return () => { script.remove(); };
  }, [job, company, logo]);

  return null;
}

export default JobPostingJsonLd;
