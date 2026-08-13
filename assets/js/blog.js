/* ============================================================
   Shared blog runtime: chrome, theme, data, list rendering,
   search / tag / category filtering, keyboard shortcuts, SEO meta.
   Vanilla JS, no build step, no dependencies.
   ============================================================ */
(function () {
  "use strict";

  var SITE = "https://jacksontai2007.github.io";
  var AUTHOR = "JacksonTai";
  var OG_IMAGE = SITE + "/static/img/logo.png";

  /* ---------- Nav ---------- */
  var NAV = [
    { href: "index.html", label: "首页" },
    { href: "blog.html", label: "文章" },
    { href: "archive.html", label: "归档" },
    { href: "about.html", label: "关于" }
  ];

  var ICON = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.2M12 19.8V22M4.2 12H2M22 12h-2.2M5.6 5.6 4 4M20 20l-1.6-1.6M18.4 5.6 20 4M4 20l1.6-1.6"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="19" x2="12" y2="6"/><polyline points="5 13 12 6 19 13"/></svg>'
  };

  /* ---------- Helpers ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDate(iso) {
    if (!iso) return "";
    var p = String(iso).split("-");
    return p.length < 3 ? String(iso) : p[0] + "-" + p[1] + "-" + p[2];
  }
  function postHref(id) { return "post.html?id=" + encodeURIComponent(id); }
  function currentPage() { return location.pathname.split("/").pop() || "index.html"; }

  function tagChips(tags) {
    if (!tags || !tags.length) return "";
    return tags.map(function (t) {
      return '<a class="chip" href="blog.html?tag=' + encodeURIComponent(t) + '">' + esc(t) + "</a>";
    }).join("");
  }

  /* ---------- Chrome ---------- */
  function headerHTML() {
    var page = currentPage();
    return (
      '<div class="wrap nav">' +
        '<a class="brand" href="index.html" aria-label="JacksonTai 首页">JacksonTai</a>' +
        '<nav class="nav-links" aria-label="主导航">' +
          NAV.map(function (n) {
            var on = n.href === page || (page === "" && n.href === "index.html");
            return '<a class="nav-link' + (on ? " active" : "") + '" href="' + n.href + '"' +
              (on ? ' aria-current="page"' : "") + ">" + n.label + "</a>";
          }).join("") +
        "</nav>" +
        '<button class="icon-btn kbd-btn" type="button" aria-label="键盘快捷键" title="快捷键 (?)"' +
          ' style="font-size:14px;font-weight:700">?</button>' +
        '<button class="icon-btn theme-toggle" type="button" aria-label="切换主题" title="切换主题 (t)">' +
          '<span class="icon-sun">' + ICON.sun + "</span>" +
          '<span class="icon-moon">' + ICON.moon + "</span>" +
        "</button>" +
        '<button class="icon-btn nav-toggle" type="button" aria-label="菜单" aria-expanded="false">' + ICON.menu + "</button>" +
      "</div>"
    );
  }

  function footerHTML() {
    return (
      '<div class="wrap">' +
        "<span>© " + new Date().getFullYear() + " " + AUTHOR + "</span>" +
        '<span class="footer-links">' +
          '<a href="feed.xml" title="RSS 订阅">rss</a>' +
          '<span class="sep">·</span>' +
          '<a href="sitemap.xml">sitemap</a>' +
          '<span class="sep">·</span>' +
          '<a href="https://github.com/JacksonTai2007/jacksontai2007.github.io" target="_blank" rel="noopener">source</a>' +
        "</span>" +
      "</div>"
    );
  }

  /* ---------- Theme ---------- */
  var root = document.documentElement;
  var THEME_BG = { light: "#f3f0e7", dark: "#211e19" };
  function applyTheme(t) {
    root.setAttribute("data-theme", t);
    try { localStorage.setItem("theme", t); } catch (e) {}
    // the static theme-color metas only follow the OS scheme; a manual choice
    // must override both so mobile browser chrome matches the page canvas
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) {
      m.setAttribute("content", THEME_BG[t] || THEME_BG.light);
    });
  }
  function toggleTheme() {
    var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    applyTheme(next);
    toast(next === "dark" ? "已切换至深色" : "已切换至浅色");
  }

  /* ---------- Toast ---------- */
  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastEl.setAttribute("role", "status");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    requestAnimationFrame(function () { toastEl.classList.add("show"); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 1500);
  }

  /* ---------- Keyboard shortcuts ---------- */
  var SHORTCUTS = [
    { keys: ["/"], desc: "搜索文章" },
    { keys: ["t"], desc: "切换主题" },
    { keys: ["g", "h"], desc: "首页" },
    { keys: ["g", "p"], desc: "文章列表" },
    { keys: ["g", "a"], desc: "归档" },
    { keys: ["g", "b"], desc: "关于" },
    { keys: ["?"], desc: "显示这个面板" },
    { keys: ["Esc"], desc: "关闭 / 取消" }
  ];

  var helpEl = null, helpReturnFocus = null;
  function closeHelp() {
    if (!helpEl) return;
    helpEl.classList.remove("open");
    var el = helpEl;
    helpEl = null;
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 160);
    // aria-modal dialogs must hand focus back to whatever opened them
    if (helpReturnFocus && document.contains(helpReturnFocus)) helpReturnFocus.focus();
    helpReturnFocus = null;
  }
  function openHelp() {
    if (helpEl) return closeHelp();
    helpReturnFocus = document.activeElement;
    helpEl = document.createElement("div");
    helpEl.className = "kbd-overlay";
    helpEl.innerHTML =
      '<div class="kbd-panel" role="dialog" aria-modal="true" aria-label="键盘快捷键" tabindex="-1">' +
        '<div class="kbd-title">键盘快捷键</div>' +
        "<dl>" +
        SHORTCUTS.map(function (s) {
          return '<div class="row"><dt>' + s.keys.map(function (k) {
            return "<kbd>" + esc(k) + "</kbd>";
          }).join("") + "</dt><dd>" + esc(s.desc) + "</dd></div>";
        }).join("") +
        "</dl>" +
      "</div>";
    helpEl.addEventListener("click", function (e) {
      if (e.target === helpEl) closeHelp();
    });
    document.body.appendChild(helpEl);
    var panel = helpEl.querySelector(".kbd-panel");
    if (panel) panel.focus();
    requestAnimationFrame(function () { if (helpEl) helpEl.classList.add("open"); });
  }

  function focusSearch() {
    var input = document.getElementById("search");
    if (input) {
      input.focus();
      input.select();
    } else {
      location.href = "blog.html?focus=1";
    }
  }

  var awaitingGo = false, goTimer = null;
  function bindKeys() {
    document.addEventListener("keydown", function (e) {
      // While an IME candidate window is open, Escape means "cancel this
      // composition" — it must not reach the Escape branch below and blur the
      // search box out from under someone typing Chinese.
      if (e.isComposing || e.keyCode === 229) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var t = e.target;
      var typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

      if (e.key === "Escape") {
        if (helpEl) { closeHelp(); return; }
        if (typing) { t.blur(); return; }
        return;
      }
      if (typing) return;

      if (awaitingGo) {
        awaitingGo = false;
        clearTimeout(goTimer);
        var dest = { h: "index.html", p: "blog.html", a: "archive.html", b: "about.html" }[e.key];
        if (dest) { e.preventDefault(); location.href = dest; }
        return;
      }

      switch (e.key) {
        case "/":
          e.preventDefault();
          focusSearch();
          break;
        case "t":
          toggleTheme();
          break;
        case "?":
          e.preventDefault();
          openHelp();
          break;
        case "g":
          awaitingGo = true;
          goTimer = setTimeout(function () { awaitingGo = false; }, 1200);
          break;
      }
    });
  }

  /* ---------- SEO meta ---------- */
  function setTag(sel, attrs) {
    var el = document.head.querySelector(sel);
    if (!el) {
      el = document.createElement(attrs.rel ? "link" : "meta");
      document.head.appendChild(el);
    }
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  /* Fill in the social/canonical tags a page didn't hardcode. Called by every
     page; the post page calls it again once the article metadata is known.
     Note: OG scrapers don't run JS, so post.html's static defaults are what
     most crawlers see — the dynamic pass is for in-page correctness and for
     crawlers (Google, Bing) that do execute scripts. */
  function meta(o) {
    o = o || {};
    var url = o.url || (SITE + "/" + currentPage() + location.search);
    if (o.title) document.title = o.title;
    var title = o.title || document.title;
    var desc = o.description || "";

    if (desc) setTag('meta[name="description"]', { name: "description", content: desc });
    setTag('link[rel="canonical"]', { rel: "canonical", href: url });

    var og = {
      "og:type": o.type || "website",
      "og:site_name": AUTHOR + " 的博客",
      "og:title": title,
      "og:url": url,
      "og:image": o.image || OG_IMAGE,
      "og:locale": "zh_CN"
    };
    if (desc) og["og:description"] = desc;
    Object.keys(og).forEach(function (p) {
      setTag('meta[property="' + p + '"]', { property: p, content: og[p] });
    });

    var tw = { "twitter:card": "summary", "twitter:title": title, "twitter:image": o.image || OG_IMAGE };
    if (desc) tw["twitter:description"] = desc;
    Object.keys(tw).forEach(function (n) {
      setTag('meta[name="' + n + '"]', { name: n, content: tw[n] });
    });
  }

  function jsonld(obj) {
    var s = document.createElement("script");
    s.type = "application/ld+json";
    s.textContent = JSON.stringify(obj);
    document.head.appendChild(s);
  }

  /* ---------- Data ---------- */
  var DATA_URL = "posts/index.json";
  /* Cache the promise, not the resolved value: the home page calls loadPosts()
     four times in one tick, and a value cache would let all four race their own
     request. On failure the slot is cleared so a later call can retry.
     `no-cache` stays: index.json carries no ?v= stamp, so revalidation is what
     makes "push a file, it's live" hold for newly published posts. */
  var _inflight = null;
  function loadPosts() {
    if (!_inflight) {
      // post.html kicks this request off from an inline <head> script; reuse it
      // when present, otherwise start our own (every other page does).
      var boot = window.__boot && window.__boot.index;
      _inflight = (boot || fetch(DATA_URL, { cache: "no-cache" }))
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        })
        .then(function (data) {
          var posts = (data.posts || []).slice();
          // missing dates sort last instead of poisoning the comparator
          posts.sort(function (a, b) {
            var ad = a.date || "", bd = b.date || "";
            return ad < bd ? 1 : ad > bd ? -1 : 0;
          });
          return posts;
        })
        .catch(function (e) { _inflight = null; throw e; });
    }
    return _inflight;
  }
  function failInto(el, e, tag) {
    if (el) el.innerHTML = "<" + tag + ' class="empty">加载失败：' + esc(e.message) + "</" + tag + ">";
  }

  /* ---------- Renderers ---------- */
  function postItemHTML(p) {
    return (
      '<li class="post-item">' +
        '<div class="post-meta">' +
          '<span class="date">' + fmtDate(p.date) + "</span>" +
          (p.category ? '<span class="sep">/</span><span class="cat">' + esc(p.category) + "</span>" : "") +
        "</div>" +
        '<a class="post-title" href="' + postHref(p.id) + '">' + esc(p.title) + "</a>" +
        (p.excerpt ? '<p class="post-excerpt">' + esc(p.excerpt) + "</p>" : "") +
        '<div class="tags">' + tagChips(p.tags) + "</div>" +
      "</li>"
    );
  }

  function renderRecent(selector, limit) {
    var el = document.querySelector(selector);
    if (!el) return;
    loadPosts().then(function (posts) {
      var list = posts.slice(0, limit || 5);
      el.innerHTML = list.length
        ? list.map(postItemHTML).join("")
        : '<li class="empty">还没有文章，敬请期待。</li>';
    }).catch(function (e) { failInto(el, e, "li"); });
  }

  /* Featured posts: honours `"featured": true` in posts/index.json and falls
     back to the newest entries when nothing is flagged. */
  function renderFeatured(selector, limit) {
    var el = document.querySelector(selector);
    if (!el) return;
    limit = limit || 2;
    loadPosts().then(function (posts) {
      var picked = posts.filter(function (p) { return p.featured; }).slice(0, limit);
      if (!picked.length) picked = posts.slice(0, limit);
      el.innerHTML = picked.map(function (p) {
        return (
          '<a class="card" href="' + postHref(p.id) + '">' +
            '<span class="card-cat">' + esc(p.category || "post") + "</span>" +
            '<span class="card-title">' + esc(p.title) + "</span>" +
            (p.excerpt ? '<p class="card-ex">' + esc(p.excerpt) + "</p>" : "") +
            '<span class="card-date">' + fmtDate(p.date) + "</span>" +
          "</a>"
        );
      }).join("");
    }).catch(function (e) { failInto(el, e, "p"); });
  }

  function renderStats(selector) {
    var el = document.querySelector(selector);
    if (!el) return;
    loadPosts().then(function (posts) {
      var tags = {}, cats = {};
      posts.forEach(function (p) {
        (p.tags || []).forEach(function (t) { tags[t] = 1; });
        if (p.category) cats[p.category] = 1;
      });
      var rows = [
        { n: posts.length, k: "posts" },
        { n: Object.keys(cats).length, k: "categories" },
        { n: Object.keys(tags).length, k: "tags" },
        { n: posts[0] ? fmtDate(posts[0].date) : "—", k: "last update" }
      ];
      el.innerHTML = rows.map(function (r) {
        return '<div class="stat"><span class="n">' + esc(r.n) + '</span><span class="k">' + r.k + "</span></div>";
      }).join("");
    }).catch(function () { el.innerHTML = ""; });
  }

  function renderCategories(selector) {
    var el = document.querySelector(selector);
    if (!el) return;
    loadPosts().then(function (posts) {
      var counts = {};
      posts.forEach(function (p) {
        var c = p.category || "未分类";
        counts[c] = (counts[c] || 0) + 1;
      });
      var names = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
      el.innerHTML = names.map(function (c) {
        return (
          '<li class="cat-row">' +
            '<a href="blog.html?category=' + encodeURIComponent(c) + '">' + esc(c) + "</a>" +
            '<span class="leader" aria-hidden="true"></span>' +
            '<span class="n">' + counts[c] + " 篇</span>" +
          "</li>"
        );
      }).join("");
    }).catch(function (e) { failInto(el, e, "li"); });
  }

  /* Blog list page: free-text search + tag + category, all reflected in the URL
     so any view can be linked to or reloaded. */
  function renderBlog(listSel, opts) {
    opts = opts || {};
    var listEl = document.querySelector(listSel);
    if (!listEl) return;
    var searchEl = opts.search ? document.querySelector(opts.search) : null;
    var filterEl = opts.filter ? document.querySelector(opts.filter) : null;
    var countEl = opts.count ? document.querySelector(opts.count) : null;

    var params = new URLSearchParams(location.search);
    var activeTag = params.get("tag") || "";
    var activeCat = params.get("category") || "";
    var query = params.get("q") || "";
    if (searchEl && query) searchEl.value = query;

    loadPosts().then(function (posts) {
      if (filterEl) {
        var counts = {};
        posts.forEach(function (p) {
          (p.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
        });
        var tags = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b); });
        function chipHTML(tag, label, on) {
          return '<a class="chip' + (on ? " active" : "") + '" href="#" role="button"' +
            ' aria-pressed="' + (on ? "true" : "false") + '" data-tag="' + esc(tag) + '">' +
            esc(label) + "</a>";
        }
        filterEl.innerHTML =
          chipHTML("", "全部", !activeTag) +
          tags.map(function (t) { return chipHTML(t, t, t === activeTag); }).join("");
        filterEl.querySelectorAll(".chip").forEach(function (c) {
          c.addEventListener("click", function (e) {
            e.preventDefault();
            activeTag = c.getAttribute("data-tag");
            filterEl.querySelectorAll(".chip").forEach(function (x) {
              x.classList.remove("active");
              x.setAttribute("aria-pressed", "false");
            });
            c.classList.add("active");
            c.setAttribute("aria-pressed", "true");
            syncUrl();
            draw();
          });
        });
      }

      function syncUrl() {
        var u = new URL(location.href);
        [["tag", activeTag], ["category", activeCat], ["q", query.trim()]].forEach(function (kv) {
          if (kv[1]) u.searchParams.set(kv[0], kv[1]); else u.searchParams.delete(kv[0]);
        });
        u.searchParams.delete("focus");
        history.replaceState(null, "", u);
      }

      function draw() {
        var q = query.trim().toLowerCase();
        var filtered = posts.filter(function (p) {
          if (activeTag && (p.tags || []).indexOf(activeTag) === -1) return false;
          if (activeCat && p.category !== activeCat) return false;
          if (q) {
            var hay = (p.title + " " + (p.excerpt || "") + " " +
              (p.tags || []).join(" ") + " " + (p.category || "")).toLowerCase();
            if (hay.indexOf(q) === -1) return false;
          }
          return true;
        });
        listEl.innerHTML = filtered.length
          ? filtered.map(postItemHTML).join("")
          : '<li class="empty">没有匹配的文章，换个关键词试试。</li>';
        if (countEl) {
          var bits = [];
          if (activeCat) bits.push("分类：" + activeCat);
          if (activeTag) bits.push("标签：" + activeTag);
          if (q) bits.push("搜索：" + query.trim());
          countEl.textContent = "共 " + filtered.length + " 篇（全部 " + posts.length + " 篇）" +
            (bits.length ? " · " + bits.join(" · ") : "");
        }
      }

      if (searchEl) {
        // Filtering on every keystroke would run against half-typed pinyin while
        // an IME composition is open, so hold off until the word is committed.
        var composing = false;
        function applySearch() {
          query = searchEl.value;
          syncUrl();
          draw();
        }
        searchEl.addEventListener("compositionstart", function () { composing = true; });
        searchEl.addEventListener("compositionend", function () {
          composing = false;
          applySearch();
        });
        searchEl.addEventListener("input", function (e) {
          if (composing || e.isComposing) return;
          applySearch();
        });
        if (params.get("focus")) searchEl.focus();
      }
      draw();
    }).catch(function (e) { failInto(listEl, e, "li"); });
  }

  /* Archive: posts grouped by year, dated rows within each year. */
  function renderArchive(selector) {
    var el = document.querySelector(selector);
    if (!el) return;
    loadPosts().then(function (posts) {
      if (!posts.length) { el.innerHTML = '<p class="empty">还没有文章。</p>'; return; }
      var byYear = {};
      posts.forEach(function (p) {
        var y = String(p.date || "----").slice(0, 4);
        (byYear[y] = byYear[y] || []).push(p);
      });
      var years = Object.keys(byYear).sort().reverse();
      el.innerHTML = years.map(function (y) {
        var rows = byYear[y].map(function (p) {
          return (
            '<li class="archive-row">' +
              '<span class="d">' + esc(String(p.date || "").slice(5)) + "</span>" +
              '<a href="' + postHref(p.id) + '">' + esc(p.title) + "</a>" +
            "</li>"
          );
        }).join("");
        return '<div class="archive-year">' + esc(y) + '<span class="n">' + byYear[y].length +
          ' 篇</span></div><ul class="archive-list">' + rows + "</ul>";
      }).join("");
    }).catch(function (e) { failInto(el, e, "p"); });
  }

  /* ---------- Boot ---------- */
  window.addEventListener("DOMContentLoaded", function () {
    var hdr = document.querySelector(".site-header");
    if (hdr && !hdr.children.length) hdr.innerHTML = headerHTML();
    var ftr = document.querySelector(".site-footer");
    if (ftr && !ftr.children.length) ftr.innerHTML = footerHTML();

    var themeBtn = document.querySelector(".theme-toggle");
    if (themeBtn) themeBtn.addEventListener("click", toggleTheme);

    var kbdBtn = document.querySelector(".kbd-btn");
    if (kbdBtn) kbdBtn.addEventListener("click", openHelp);

    var navToggle = document.querySelector(".nav-toggle");
    var navLinks = document.querySelector(".nav-links");
    if (navToggle && navLinks) {
      navToggle.addEventListener("click", function () {
        var open = navLinks.classList.toggle("open");
        navToggle.setAttribute("aria-expanded", String(open));
      });
    }

    bindKeys();
  });

  window.Blog = {
    SITE: SITE,
    AUTHOR: AUTHOR,
    loadPosts: loadPosts,
    renderRecent: renderRecent,
    renderFeatured: renderFeatured,
    renderStats: renderStats,
    renderCategories: renderCategories,
    renderBlog: renderBlog,
    renderArchive: renderArchive,
    meta: meta,
    jsonld: jsonld,
    toast: toast,
    icons: ICON,
    esc: esc,
    fmtDate: fmtDate,
    postHref: postHref,
    tagChips: tagChips
  };
})();
