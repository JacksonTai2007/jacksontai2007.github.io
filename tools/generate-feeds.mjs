#!/usr/bin/env node
/* Generate feed.xml (RSS 2.0) and sitemap.xml from posts/index.json.
 * Run from repo root:  node tools/generate-feeds.mjs
 * Re-run whenever you add or edit a post.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://jacksontai2007.github.io";
const TITLE = "JacksonTai 的博客";
const DESC = "记录逆向、安全、Python 与前端的折腾。";

const data = JSON.parse(fs.readFileSync(path.join(ROOT, "posts/index.json"), "utf8"));
const posts = (data.posts || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));

const xmlEsc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
const rfc822 = (iso) => new Date(iso + "T08:00:00+08:00").toUTCString();
const postUrl = (id) => `${SITE}/post.html?id=${encodeURIComponent(id)}`;

/* ---- RSS ---- */
const items = posts.map((p) => `    <item>
      <title>${xmlEsc(p.title)}</title>
      <link>${postUrl(p.id)}</link>
      <guid isPermaLink="true">${postUrl(p.id)}</guid>
      <pubDate>${rfc822(p.date)}</pubDate>
      ${p.category ? `<category>${xmlEsc(p.category)}</category>` : ""}
      <description>${xmlEsc(p.excerpt || "")}</description>
    </item>`).join("\n");

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEsc(TITLE)}</title>
    <link>${SITE}/</link>
    <description>${xmlEsc(DESC)}</description>
    <language>zh-CN</language>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
    ${posts[0] ? `<lastBuildDate>${rfc822(posts[0].date)}</lastBuildDate>` : ""}
${items}
  </channel>
</rss>
`;
fs.writeFileSync(path.join(ROOT, "feed.xml"), rss);

/* ---- Sitemap ---- */
const staticPages = ["index.html", "blog.html", "archive.html", "about.html"];
const urls = [
  ...staticPages.map((p) => ({ loc: `${SITE}/${p === "index.html" ? "" : p}`, lastmod: posts[0]?.date })),
  ...posts.map((p) => ({ loc: postUrl(p.id), lastmod: p.date })),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${xmlEsc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`).join("\n")}
</urlset>
`;
fs.writeFileSync(path.join(ROOT, "sitemap.xml"), sitemap);

console.log(`Generated feed.xml (${posts.length} items) and sitemap.xml (${urls.length} urls).`);
