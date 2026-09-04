/**
 * /adzuna.xml — Adzuna's organic feed shape (root <jobs>, one <location>
 * string, contract_time/contract_type, salary_frequency). Same gated job set
 * as /jobs.xml; see loadFeedJobs. Spec: adzuna.co.uk/jobs/xml-specification.html
 */
import { loadFeedJobs, cdata, sendXml, ORIGIN } from "./job-feed.mjs";

const FREQUENCY = { HOUR: "hour", DAY: "day", WEEK: "week", MONTH: "month", YEAR: "year" };

function contractTime(jobType) {
  return /part/i.test(jobType) ? "part_time" : "full_time";
}
function contractType(jobType) {
  return /contract|temporary|intern/i.test(jobType) ? "contract" : "permanent";
}

export default async function handler(req, res) {
  try {
    const entries = await loadFeedJobs();
    const items = entries.map((e) => {
      const { job } = e;
      const location = [e.city, e.state].filter(Boolean).join(", ");
      const frequency = FREQUENCY[String(e.period || "").toUpperCase()] || null;
      return [
        "  <job>",
        `    <title>${cdata(job.title)}</title>`,
        `    <id>${cdata(e.reference)}</id>`,
        `    <description>${cdata(e.html)}</description>`,
        `    <url>${cdata(e.urlFor("adzuna"))}</url>`,
        `    <location>${cdata(location)}</location>`,
        `    <country>${cdata(e.country)}</country>`,
        `    <company>${cdata(e.company)}</company>`,
        `    <date>${cdata(e.posted.toISOString())}</date>`,
        e.salary ? `    <salary>${cdata(e.salary)}</salary>` : null,
        job.salary_min != null ? `    <salary_min>${cdata(job.salary_min)}</salary_min>` : null,
        job.salary_max != null ? `    <salary_max>${cdata(job.salary_max)}</salary_max>` : null,
        e.hasStructuredSalary && frequency ? `    <salary_frequency>${cdata(frequency)}</salary_frequency>` : null,
        e.hasStructuredSalary ? `    <salary_currency>${cdata(job.salary_currency || "USD")}</salary_currency>` : null,
        `    <contract_time>${cdata(contractTime(e.jobType))}</contract_time>`,
        `    <contract_type>${cdata(contractType(e.jobType))}</contract_type>`,
        "  </job>",
      ]
        .filter(Boolean)
        .join("\n");
    });
    sendXml(res, [`<?xml version="1.0" encoding="UTF-8"?>`, "<jobs>", ...items, "</jobs>", ""].join("\n"));
  } catch (e) {
    sendXml(res, `<?xml version="1.0" encoding="UTF-8"?>\n<jobs></jobs>\n`);
  }
}
