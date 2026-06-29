/**
 * JobPostingJsonLd — injects schema.org/JobPosting structured data (JSON-LD) into <head> for a
 * public job page so the role is eligible for Google for Jobs + Indeed organic ingestion.
 * Renders nothing visually. Googlebot renders client JS, so client injection is sufficient.
 */
import { useEffect } from "react";

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
  created_at: string;
  application_deadline?: string | null;
  job_code?: string | null;
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
    const isRemote = /remote/i.test(loc) || /remote/i.test(job.job_type ?? "");

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
      data.applicantLocationRequirements = { "@type": "Country", name: "USA" };
    } else if (loc) {
      data.jobLocation = { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: loc, addressCountry: "US" } };
    }

    if (job.salary_min != null || job.salary_max != null) {
      const big = (job.salary_max ?? job.salary_min ?? 0) > 2000;
      data.baseSalary = {
        "@type": "MonetaryAmount",
        currency: job.salary_currency || "USD",
        value: {
          "@type": "QuantitativeValue",
          ...(job.salary_min != null ? { minValue: job.salary_min } : {}),
          ...(job.salary_max != null ? { maxValue: job.salary_max } : {}),
          unitText: big ? "YEAR" : "HOUR",
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
