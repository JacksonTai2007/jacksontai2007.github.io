/* ============================================================
   Post page: load markdown by ?id=, render with marked, build heading
   anchors + table of contents + prev/next nav, and fill in the
   per-article SEO metadata (canonical, Open Graph, JSON-LD).
   ============================================================ */
(function () {
  "use strict";
  var B = window.Blog;

  function slugify(s) {
    return String(s).toLowerCase().trim()
      .replace(/[^\w一-龥\- ]+/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-") || "section";
  }

  function getId() {
    return new URLSearchParams(location.search).get("id");
  }

  function fail(msg) {
    var c = document.getElementById("article");
    if (c) {
      c.innerHTML = '<p class="empty">' + B.esc(msg) + ' <a href="blog.html">返回文章列表</a></p>';
    }
    var head = document.getElementById("article-head");
    if (head) head.innerHTML = "";
    document.title = "未找到文章 · JacksonTai";
  }

  function readingTime(text) {
    var cjk = (text.match(/[一-鿿]/g) || []).length;
    var words = (text.replace(/[一-鿿]/g, " ").match(/[A-Za-z0-9]+/g) || []).length;
    return Math.max(1, Math.round(cjk / 400 + words / 200));
  }

  window.addEventListener("DOMContentLoaded", function () {
    var id = getId();
    if (!id) return fail("缺少文章 ID。");

    if (window.marked && window.marked.setOptions) {
      window.marked.setOptions({ gfm: true, breaks: false });
    }

    B.loadPosts().then(function (posts) {
      var idx = posts.findIndex(function (p) { return p.id === id; });
      if (idx === -1) return fail("没有找到这篇文章。");
      var meta = posts[idx];
      var url = B.SITE + "/post.html?id=" + encodeURIComponent(meta.id);

      /* ---- head / meta ---- */
      B.meta({
        title: meta.title + " · JacksonTai",
        description: meta.excerpt || "",
        url: url,
        type: "article"
      });
      B.jsonld({
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: meta.title,
        description: meta.excerpt || "",
        datePublished: meta.date,
        dateModified: meta.date,
        keywords: (meta.tags || []).join(", "),
        articleSection: meta.category || undefined,
        inLanguage: "zh-CN",
        author: { "@type": "Person", name: B.AUTHOR, url: "https://github.com/JacksonTai2007" },
        publisher: { "@type": "Person", name: B.AUTHOR },
        mainEntityOfPage: { "@type": "WebPage", "@id": url }
      });

      var head = document.getElementById("article-head");
      head.innerHTML =
        '<a class="back-link" href="blog.html">← 返回文章列表</a>' +
        "<h1>" + B.esc(meta.title) + "</h1>" +
        '<div class="post-meta">' +
          '<span class="date">' + B.fmtDate(meta.date) + "</span>" +
          (meta.category ? '<span class="sep">/</span><span class="cat">' + B.esc(meta.category) + "</span>" : "") +
          '<span class="sep">/</span><span id="read-time">…</span>' +
        "</div>" +
        '<div class="tags">' + B.tagChips(meta.tags) + "</div>";

      /* ---- body ---- */
      return fetch("posts/" + encodeURIComponent(id) + ".md", { cache: "no-cache" })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
        .then(function (md) {
          // drop a leading H1 that would just repeat the title
          md = md.replace(/^\s*#\s+.*\n+/, "");
          var article = document.getElementById("article");
          article.innerHTML = window.marked
            ? window.marked.parse(md)
            : "<pre>" + B.esc(md) + "</pre>";

          // heading anchors + TOC entries
          var toc = [];
          var seen = {};
          article.querySelectorAll("h2, h3").forEach(function (h) {
            var slug = slugify(h.textContent);
            if (seen[slug]) slug += "-" + seen[slug]++;
            else seen[slug] = 1;
            h.id = slug;
            toc.push({ level: h.tagName === "H2" ? 2 : 3, text: h.textContent, id: slug });
          });

          var tocWrap = document.getElementById("toc");
          if (toc.length >= 3 && tocWrap) {
            tocWrap.innerHTML =
              '<div class="toc-title">目录</div><ul>' +
              toc.map(function (t) {
                return '<li><a class="lvl-' + t.level + '" href="#' + t.id +
                  '" data-id="' + t.id + '">' + B.esc(t.text) + "</a></li>";
              }).join("") +
              "</ul>";
            document.querySelector(".article-layout").classList.add("has-toc");
          }

          article.querySelectorAll('a[href^="http"]').forEach(function (a) {
            a.target = "_blank";
            a.rel = "noopener";
          });

          var rt = document.getElementById("read-time");
          if (rt) rt.textContent = "约 " + readingTime(article.textContent || "") + " 分钟";

          if (window.Enhance) window.Enhance.article(article, toc);

          /* ---- prev / next (posts are newest-first) ---- */
          var newer = posts[idx - 1];
          var older = posts[idx + 1];
          var nav = document.getElementById("post-nav");
          if (nav && (newer || older)) {
            nav.innerHTML =
              (older ? '<a href="' + B.postHref(older.id) + '"><span class="dir">← 上一篇</span>' +
                B.esc(older.title) + "</a>" : "<span></span>") +
              (newer ? '<a class="nx" href="' + B.postHref(newer.id) + '"><span class="dir">下一篇 →</span>' +
                B.esc(newer.title) + "</a>" : "");
          }
        });
    }).catch(function (e) {
      fail("加载文章失败：" + e.message);
    });
  });
})();
