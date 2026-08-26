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
const DESC = "逆向工程与移动安全的技术笔记 —— Android 逆向、漏洞分析、Python 自动化与前端。";

const data = JSON.parse(fs.readFileSync(path.join(ROOT, "posts/index.json"), "utf8"));

/* Validate before generating anything. A malformed date used to sail through
   and land in feed.xml as <pubDate>Invalid Date</pubDate>; better to refuse to
   write and leave the previous, valid feed in place.
   The round trip catches dates that parse but aren't real — "2026-02-30"
   silently rolls over to March 2nd, which a regex + isNaN check would miss. */
const validDate = (d) => {
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const dt = new Date(d + "T00:00:00Z");
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === d;
};

const problems = [];
if (!Array.isArray(data.posts)) {
  problems.push('posts/index.json: 顶层 "posts" 必须是数组');
} else {
  const ids = new Set();
  for (const [i, p] of data.posts.entries()) {
    const where = `posts[${i}]${p && p.id ? ` (id="${p.id}")` : ""}`;
    if (!p || typeof p.id !== "string" || !p.id.trim()) {
      problems.push(`${where}: id 缺失或不是非空字符串`);
      continue;
    }
    if (ids.has(p.id)) problems.push(`${where}: id 重复`);
    ids.add(p.id);
    if (typeof p.title !== "string" || !p.title.trim()) {
      problems.push(`${where}: title 缺失或不是非空字符串`);
    }
    if (!validDate(p.date)) {
      problems.push(
        `${where}: date=${JSON.stringify(p.date)} 不是合法的 YYYY-MM-DD` +
        "（date 同时用于 RSS 的 pubDate 与 sitemap 的 lastmod，格式不能放宽）");
    }
    if (!fs.existsSync(path.join(ROOT, "posts", `${p.id}.md`))) {
      problems.push(`${where}: 找不到正文 posts/${p.id}.md`);
    }
  }
}
if (problems.length) {
  console.error(`posts/index.json 有 ${problems.length} 处问题，未生成任何文件：`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}

const posts = data.posts.slice().sort((a, b) => (a.date < b.date ? 1 : -1));

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
