/**
 * /jooble.xml — Jooble's own feed shape (root <jobs>, dates as DD.MM.YYYY,
 * a single <region>). Same gated job set as /jobs.xml; see loadFeedJobs.
 * Spec: https://jooble.org/files/xml_feed_specifications.pdf
 */
import { loadFeedJobs, cdata, sendXml, ORIGIN } from "./job-feed.mjs";

function dmy(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

export default async function handler(req, res) {
  try {
    const entries = await loadFeedJobs();
    const items = entries.map((e) => {
      const region = [e.city, e.state, e.country].filter(Boolean).join(", ");
      return [
        `  <job id="${String(e.reference).replace(/"/g, "")}">`,
        `    <link>${cdata(e.urlFor("jooble"))}</link>`,
        `    <name>${cdata(e.job.title)}</name>`,
        `    <region>${cdata(region)}</region>`,
        `    <description>${cdata(e.html)}</description>`,
        `    <pubdate>${cdata(dmy(e.posted))}</pubdate>`,
        `    <updated>${cdata(dmy(e.posted))}</updated>`,
        e.salary ? `    <salary>${cdata(e.salary)}</salary>` : null,
        `    <company>${cdata(e.company)}</company>`,
        e.expires ? `    <expire>${cdata(dmy(new Date(e.expires)))}</expire>` : null,
        `    <jobtype>${cdata(e.jobType)}</jobtype>`,
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
