/**
 * Pure schema.org/JobPosting builder — no DOM, no React, no browser globals — so
 * it can be shared by BOTH the client component (src/components/seo/JobPostingJsonLd.tsx)
 * and the server-side prerender function (api/job-prerender.ts). Single source of truth
 * for what Google for Jobs / Indeed ingest.
 */

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
  location_city?: string | null;
  location_region?: string | null;
  location_country?: string | null;
  location_country_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_remote?: boolean | null;
  locations?: JobLocationStruct[] | null;
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

export function buildJobPostingSchema(
  job: JobPostingJob,
  opts: { company?: string | null; logo?: string | null; origin?: string } = {},
): Record<string, unknown> {
  const origin = opts.origin || "https://hireflownow.com";
  const company = opts.company;
  const logo = opts.logo;
  const url = `${origin}/candidate/job/${job.id}`;
  const loc = (job.location ?? "").trim();
  const isRemote = job.is_remote ?? (/remote/i.test(loc) || /remote/i.test(job.job_type ?? ""));

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
  const validThrough = job.application_deadline
    ? new Date(job.application_deadline)
    : new Date(new Date(job.created_at).getTime() + 60 * 86400000);

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
    const reqName = primary.country || primary.countryCode;
    if (reqName) data.applicantLocationRequirements = { "@type": "Country", name: reqName };
    if (hasStructured) data.jobLocation = placeOf(primary);
  } else if (allPlaces.length > 0) {
    data.jobLocation = allPlaces.length === 1 ? placeOf(allPlaces[0]) : allPlaces.map(placeOf);
  } else if (loc) {
    data.jobLocation = { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: loc } };
  }

  if (job.salary_min != null || job.salary_max != null) {
    const period = (job.salary_period || "").toUpperCase();
    const unitText = ["HOUR", "DAY", "WEEK", "MONTH", "YEAR"].includes(period)
      ? period
      : (job.salary_max ?? job.salary_min ?? 0) > 2000
        ? "YEAR"
        : "HOUR";
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

  return data;
}

/** A clean <title> for the job page (bots + browser tab + social). */
export function jobPageTitle(job: Pick<JobPostingJob, "title">, company?: string | null): string {
  const base = job.title?.trim() || "Job opening";
  return company ? `${base} — ${company}` : `${base} — HireFlow`;
}

/** A plain-text meta description (~155 chars) from the job's own copy. */
export function jobMetaDescription(job: JobPostingJob): string {
  const raw = (job.description || job.responsibilities || job.requirements || job.title || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (raw.length <= 155) return raw;
  return raw.slice(0, 152).trimEnd() + "…";
}
