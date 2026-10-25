/**
 * Phase 6 of docs/LAUNCH-PLAN.md, locked (2026-10-25): the blog
 * (docs/BLOG.md).
 *
 *   - blog-slug-reserved: "blog" and its sitemap are names the site uses, so
 *     no job can take them as a short link (src/lib/jobSlug.ts and the
 *     crawler copy in api/job-prerender.mjs), and /blog and /blog/<post> go
 *     to their own pages before the crawler-only job rewrite in vercel.json.
 *   - blog-pages-have-cta-and-tags: every page the build writes carries its
 *     title, description, canonical, Open Graph and Article data, the page
 *     counter, and the "Post your first job free" button tagged with the
 *     post; the build runs in `npm run build`; search engines are told where
 *     the blog's sitemap is; the front page links Guides.
 */

export default [
  {
    id: "blog-slug-reserved",
    why:
      "A job named \"blog\" would take hireflownow.com/blog, and crawlers asking for /blog would be shown that job " +
      "instead of the guides. The name and its sitemap are reserved in both copies of the list, and vercel.json sends " +
      "/blog and /blog/<post> to the built pages before the crawler-only /:slug rule.",
    run: async ({ read }) => {
      const detail = [];
      const slug = (await read("src/lib/jobSlug.ts")) ?? "";
      const sitePaths = /export const SITE_PATHS[\s\S]*?\];/.exec(slug)?.[0] ?? slug;
      for (const name of ["blog", "blog-sitemap.xml"]) {
        if (!sitePaths.includes(`"${name}"`)) detail.push(`src/lib/jobSlug.ts: "${name}" is not reserved`);
      }
      const prerender = (await read("api/job-prerender.mjs")) ?? "";
      const reserved = /const RESERVED_SLUGS = new Set\(\[([\s\S]*?)\]\);/.exec(prerender)?.[1] ?? "";
      for (const name of ["blog", "blog-sitemap.xml"]) {
        if (!reserved.includes(`"${name}"`)) detail.push(`api/job-prerender.mjs: "${name}" is not in RESERVED_SLUGS`);
      }
      let rewrites = [];
      try {
        rewrites = JSON.parse((await read("vercel.json")) ?? "{}").rewrites ?? [];
      } catch {
        detail.push("vercel.json does not parse");
      }
      const at = (source) => rewrites.findIndex((r) => r.source === source);
      const crawler = at("/:slug");
      if (at("/blog") < 0 || rewrites[at("/blog")].destination !== "/blog/index.html") detail.push("vercel.json: /blog does not go to /blog/index.html");
      if (at("/blog/:slug") < 0 || rewrites[at("/blog/:slug")].destination !== "/blog/:slug/index.html") detail.push("vercel.json: /blog/:slug does not go to its own page");
      if (at("/blog/:path*") < 0 || rewrites[at("/blog/:path*")].destination !== "/blog/not-found.html" || at("/blog/:path*") < at("/blog/:slug")) detail.push("vercel.json: an address under /blog that is no guide must get /blog/not-found.html (after /blog/:slug), not the app's page shell");
      if (crawler >= 0 && (at("/blog") > crawler || at("/blog/:slug") > crawler)) detail.push("vercel.json: the blog rules must come before the crawler-only /:slug rule");
      if (rewrites.some((r) => r.source === "/:path+" && at("/blog") > rewrites.indexOf(r))) detail.push("vercel.json: the blog rules must come before the app's catch-all");
      const config = (await read("vercel.json")) ?? "";
      if (/"cleanUrls"\s*:\s*true/.test(config)) detail.push("vercel.json: cleanUrls breaks the prerender functions that fetch /index.html");
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "blog-pages-have-cta-and-tags",
    why:
      "The blog exists to bring searches for hiring customer service agents to the sign-up button. A page without " +
      "its title, description, canonical, Open Graph or Article data reads badly in search and shares; one without " +
      "the page counter is not counted; one without the tagged button cannot say which post brought an account.",
    run: async ({ read }) => {
      const detail = [];
      const build = (await read("scripts/build-blog.mjs")) ?? "";
      const must = [
        [/<title>\$\{escapeHtml\(title\)\}<\/title>/, "a <title>"],
        [/<meta name="description" content="\$\{escapeHtml\(description\)\}">/, "the description"],
        [/<link rel="canonical" href="\$\{canonical\}">/, "the canonical link"],
        [/<meta property="og:title"/, "Open Graph tags"],
        [/<meta name="twitter:card" content="summary_large_image">/, "the Twitter card"],
        [/"@type": "BlogPosting"/, "Article (BlogPosting) data"],
        [/<script src="\/beacon\.js" defer><\/script>/, "the page counter (beacon.js)"],
        [/<script src="\/carry-source\.js" defer><\/script>/, "the source carrier (carry-source.js)"],
        [/utm_source=blog&utm_medium=article&utm_campaign=\$\{encodeURIComponent\(campaign\)\}/, "the sign-up button's tags"],
        [/>Post your first job free</, "the \"Post your first job free\" button"],
        [/\$\{endBlock\(post\.slug\)\}/, "the closing button on every post, tagged with its slug"],
        [/throw new Error\(`\$\{file\}: raw HTML is not allowed/, "the refusal of raw HTML in a post"],
      ];
      for (const [re, what] of must) if (!re.test(build)) detail.push(`scripts/build-blog.mjs: ${what} is gone`);
      const pkg = JSON.parse((await read("package.json")) ?? "{}");
      if (!/^node scripts\/build-blog\.mjs && vite build$/.test(pkg.scripts?.build ?? "")) detail.push("package.json: `npm run build` no longer builds the blog first");
      if (!/^\d+\.\d+\.\d+$/.test(pkg.devDependencies?.marked ?? "")) detail.push("package.json: marked is not pinned to an exact version");
      const robots = (await read("public/robots.txt")) ?? "";
      if (!/^Sitemap: https:\/\/hireflownow\.com\/blog-sitemap\.xml$/m.test(robots)) detail.push("public/robots.txt: the blog's sitemap is not listed");
      const landing = (await read("public/landing.html")) ?? "";
      if (!/<a class="plain guides" href="\/blog">Guides<\/a>/.test(landing)) detail.push("public/landing.html: the top bar no longer links Guides");
      if (!/<nav class="foot"[^>]*>[\s\S]*?<a href="\/blog">Guides<\/a>/.test(landing)) detail.push("public/landing.html: the footer no longer links Guides");
      const ignore = (await read(".gitignore")) ?? "";
      if (!/^\/public\/blog\/$/m.test(ignore)) detail.push(".gitignore: the built blog pages would be committed (the Markdown is the source)");
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
];
