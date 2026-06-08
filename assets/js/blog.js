/* ============================================================
   Shared blog logic: theme, nav, data loading, list rendering,
   search & tag filtering. Vanilla JS, no build step.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Shared chrome (header + footer) ---------- */
  var NAV = [
    { href: "index.html", label: "首页" },
    { href: "blog.html", label: "文章" },
    { href: "archive.html", label: "归档" },
    { href: "about.html", label: "关于" }
  ];
  function headerHTML() {
    return (
      '<div class="wrap nav">' +
        '<a class="brand" href="index.html"><span class="dot"></span>JacksonTai</a>' +
        '<nav class="nav-links">' +
          NAV.map(function (n) { return '<a class="nav-link" href="' + n.href + '">' + n.label + "</a>"; }).join("") +
        "</nav>" +
        '<button class="theme-toggle" aria-label="切换主题">' +
          '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>' +
          '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>' +
        "</button>" +
        '<button class="nav-toggle" aria-label="菜单">' +
          '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>' +
        "</button>" +
      "</div>"
    );
  }
  function footerHTML() {
    return (
      '<div class="wrap">' +
        "<span>© " + new Date().getFullYear() + " JacksonTai</span>" +
        '<span class="footer-links">' +
          '<a href="feed.xml" title="RSS 订阅">RSS</a>' +
          '<span class="sep">·</span>' +
          "Built with ☕ &amp; vanilla JS" +
        "</span>" +
      "</div>"
    );
  }

  /* ---------- Theme ---------- */
  var root = document.documentElement;
  function applyTheme(t) {
    root.setAttribute("data-theme", t);
    try { localStorage.setItem("theme", t); } catch (e) {}
  }
  // initial theme is set inline in <head> to avoid flash; just wire the toggle here
  window.addEventListener("DOMContentLoaded", function () {
    // inject shared chrome if placeholders exist
    var hdr = document.querySelector(".site-header");
    if (hdr && !hdr.children.length) hdr.innerHTML = headerHTML();
    var ftr = document.querySelector(".site-footer");
    if (ftr && !ftr.children.length) ftr.innerHTML = footerHTML();

    var btn = document.querySelector(".theme-toggle");
    if (btn) {
      btn.addEventListener("click", function () {
        var cur = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        applyTheme(cur);
      });
    }
    var navToggle = document.querySelector(".nav-toggle");
    var navLinks = document.querySelector(".nav-links");
    if (navToggle && navLinks) {
      navToggle.addEventListener("click", function () {
        navLinks.classList.toggle("open");
      });
    }
    // mark active nav link
    var path = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav-link").forEach(function (a) {
      var href = a.getAttribute("href");
      if (href === path || (path === "" && href === "index.html")) a.classList.add("active");
    });
  });

  /* ---------- Data ---------- */
  var DATA_URL = "posts/index.json";
  var _cache = null;
  function loadPosts() {
    if (_cache) return Promise.resolve(_cache);
    return fetch(DATA_URL, { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        var posts = (data.posts || []).slice();
        // newest first
        posts.sort(function (a, b) { return (a.date < b.date ? 1 : a.date > b.date ? -1 : 0); });
        _cache = posts;
        return posts;
      });
  }

  /* ---------- Helpers ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDate(iso) {
    // iso = YYYY-MM-DD
    if (!iso) return "";
    var p = iso.split("-");
    if (p.length < 3) return iso;
    return p[0] + "." + p[1] + "." + p[2];
  }
  function postHref(id) { return "post.html?id=" + encodeURIComponent(id); }

  function tagChips(tags, asLinks) {
    if (!tags || !tags.length) return "";
    return tags.map(function (t) {
      if (asLinks) return '<a class="chip" href="blog.html?tag=' + encodeURIComponent(t) + '">' + esc(t) + "</a>";
      return '<span class="chip">' + esc(t) + "</span>";
    }).join("");
  }

  function postItemHTML(p) {
    return (
      '<li class="post-item">' +
      '<div class="post-meta">' +
        "<span>" + fmtDate(p.date) + "</span>" +
        (p.category ? '<span class="sep">/</span><span>' + esc(p.category) + "</span>" : "") +
      "</div>" +
      '<a class="post-title" href="' + postHref(p.id) + '">' + esc(p.title) + "</a>" +
      (p.excerpt ? '<p class="post-excerpt">' + esc(p.excerpt) + "</p>" : "") +
      '<div class="tags">' + tagChips(p.tags, true) + "</div>" +
      "</li>"
    );
  }

  /* ---------- Renderers (called per-page) ---------- */
  function renderRecent(selector, limit) {
    var el = document.querySelector(selector);
    if (!el) return;
    loadPosts().then(function (posts) {
      var list = posts.slice(0, limit || 5);
      el.innerHTML = list.length ? list.map(postItemHTML).join("") :
        '<li class="empty">还没有文章，敬请期待。</li>';
    }).catch(function (e) {
      el.innerHTML = '<li class="empty">加载文章失败：' + esc(e.message) + "</li>";
    });
  }

  function renderBlog(listSel, opts) {
    var listEl = document.querySelector(listSel);
    if (!listEl) return;
    var searchEl = document.querySelector(opts.search);
    var filterEl = document.querySelector(opts.filter);
    var params = new URLSearchParams(location.search);
    var activeTag = params.get("tag") || "";
    var query = "";

    loadPosts().then(function (posts) {
      // build tag filter chips
      if (filterEl) {
        var tagCount = {};
        posts.forEach(function (p) { (p.tags || []).forEach(function (t) { tagCount[t] = (tagCount[t] || 0) + 1; }); });
        var tags = Object.keys(tagCount).sort();
        filterEl.innerHTML =
          '<a class="chip' + (activeTag ? "" : " active") + '" data-tag="">全部</a>' +
          tags.map(function (t) {
            return '<a class="chip' + (t === activeTag ? " active" : "") + '" data-tag="' + esc(t) + '">' + esc(t) + "</a>";
          }).join("");
        filterEl.querySelectorAll(".chip").forEach(function (c) {
          c.addEventListener("click", function (e) {
            e.preventDefault();
            activeTag = c.getAttribute("data-tag");
            filterEl.querySelectorAll(".chip").forEach(function (x) { x.classList.remove("active"); });
            c.classList.add("active");
            var u = new URL(location.href);
            if (activeTag) u.searchParams.set("tag", activeTag); else u.searchParams.delete("tag");
            history.replaceState(null, "", u);
            draw();
          });
        });
      }

      function draw() {
        var q = query.trim().toLowerCase();
        var filtered = posts.filter(function (p) {
          if (activeTag && (p.tags || []).indexOf(activeTag) === -1) return false;
          if (q) {
            var hay = (p.title + " " + (p.excerpt || "") + " " + (p.tags || []).join(" ") + " " + (p.category || "")).toLowerCase();
            if (hay.indexOf(q) === -1) return false;
          }
          return true;
        });
        listEl.innerHTML = filtered.length ? filtered.map(postItemHTML).join("") :
          '<li class="empty">没有匹配的文章。</li>';
      }

      if (searchEl) {
        searchEl.addEventListener("input", function () { query = searchEl.value; draw(); });
      }
      draw();
    }).catch(function (e) {
      listEl.innerHTML = '<li class="empty">加载文章失败：' + esc(e.message) + "</li>";
    });
  }

  function renderArchive(selector) {
    var el = document.querySelector(selector);
    if (!el) return;
    loadPosts().then(function (posts) {
      if (!posts.length) { el.innerHTML = '<p class="empty">还没有文章。</p>'; return; }
      var byYear = {};
      posts.forEach(function (p) {
        var y = (p.date || "----").slice(0, 4);
        (byYear[y] = byYear[y] || []).push(p);
      });
      var years = Object.keys(byYear).sort().reverse();
      el.innerHTML = years.map(function (y) {
        var rows = byYear[y].map(function (p) {
          return '<li class="archive-row"><span class="d">' + esc(p.date.slice(5).replace("-", "/")) +
            '</span><a href="' + postHref(p.id) + '">' + esc(p.title) + "</a></li>";
        }).join("");
        return '<div class="archive-year">' + y + ' · ' + byYear[y].length + ' 篇</div><ul class="archive-list">' + rows + "</ul>";
      }).join("");
    }).catch(function (e) {
      el.innerHTML = '<p class="empty">加载失败：' + esc(e.message) + "</p>";
    });
  }

  // expose
  window.Blog = {
    loadPosts: loadPosts,
    renderRecent: renderRecent,
    renderBlog: renderBlog,
    renderArchive: renderArchive,
    esc: esc,
    fmtDate: fmtDate,
    postHref: postHref,
    tagChips: tagChips
  };
})();
