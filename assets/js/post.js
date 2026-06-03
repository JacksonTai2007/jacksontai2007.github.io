/* ============================================================
   Post page: load markdown by ?id=, render with marked,
   build heading anchors + table of contents + prev/next nav.
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
    if (c) c.innerHTML = '<p class="empty">' + B.esc(msg) + ' <a href="blog.html">返回文章列表</a></p>';
    document.title = "未找到文章 · JacksonTai";
  }

  window.addEventListener("DOMContentLoaded", function () {
    var id = getId();
    if (!id) return fail("缺少文章 ID。");

    // configure marked
    if (window.marked && window.marked.setOptions) {
      window.marked.setOptions({ gfm: true, breaks: false });
    }

    B.loadPosts().then(function (posts) {
      var idx = posts.findIndex(function (p) { return p.id === id; });
      if (idx === -1) return fail("没有找到这篇文章。");
      var meta = posts[idx];

      document.title = meta.title + " · JacksonTai";
      var head = document.getElementById("article-head");
      head.innerHTML =
        '<a class="back-link" href="blog.html">← 返回列表</a>' +
        '<h1>' + B.esc(meta.title) + "</h1>" +
        '<div class="post-meta">' +
          "<span>" + B.fmtDate(meta.date) + "</span>" +
          (meta.category ? '<span class="sep">/</span><span>' + B.esc(meta.category) + "</span>" : "") +
        "</div>" +
        '<div class="tags">' + B.tagChips(meta.tags, true) + "</div>";

      // fetch markdown
      return fetch("posts/" + encodeURIComponent(id) + ".md", { cache: "no-cache" })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
        .then(function (md) {
          // strip an optional leading H1 that duplicates the title
          md = md.replace(/^\s*#\s+.*\n+/, "");
          var html = window.marked ? window.marked.parse(md) : "<pre>" + B.esc(md) + "</pre>";
          var article = document.getElementById("article");
          article.innerHTML = html;

          // add anchors + collect TOC entries
          var toc = [];
          article.querySelectorAll("h2, h3").forEach(function (h) {
            var slug = slugify(h.textContent);
            // ensure unique
            if (document.getElementById(slug)) slug += "-" + toc.length;
            h.id = slug;
            toc.push({ level: h.tagName === "H2" ? 2 : 3, text: h.textContent, id: slug });
          });

          var tocWrap = document.getElementById("toc");
          if (toc.length >= 3 && tocWrap) {
            tocWrap.innerHTML =
              '<div class="toc-title">目录</div><ul>' +
              toc.map(function (t) {
                return '<li><a class="lvl-' + t.level + '" href="#" data-id="' + t.id + '">' + B.esc(t.text) + "</a></li>";
              }).join("") + "</ul>";
            tocWrap.querySelectorAll("a").forEach(function (a) {
              a.addEventListener("click", function (e) {
                e.preventDefault();
                var el = document.getElementById(a.getAttribute("data-id"));
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
              });
            });
            document.querySelector(".article-layout").classList.add("has-toc");
          }

          // open external links in new tab
          article.querySelectorAll('a[href^="http"]').forEach(function (a) {
            a.target = "_blank"; a.rel = "noopener";
          });

          // prev / next (posts sorted newest-first)
          var newer = posts[idx - 1]; // newer
          var older = posts[idx + 1]; // older
          var nav = document.getElementById("post-nav");
          if (nav && (newer || older)) {
            nav.innerHTML =
              (older ? '<a href="' + B.postHref(older.id) + '"><span class="dir">← 上一篇</span>' + B.esc(older.title) + "</a>" : "<span></span>") +
              (newer ? '<a class="nx" href="' + B.postHref(newer.id) + '"><span class="dir">下一篇 →</span>' + B.esc(newer.title) + "</a>" : "");
          }
        });
    }).catch(function (e) {
      fail("加载文章失败：" + e.message);
    });
  });
})();
