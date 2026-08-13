/* ============================================================
   Article-page progressive enhancements.
   Everything here is optional — the article renders fine without it.

   - syntax highlighting (highlight.js)
   - each code block gets a little window chrome: language label + copy
   - reading progress bar, back-to-top
   - TOC scroll-spy
   - image lightbox
   ============================================================ */
(function () {
  "use strict";

  var ICONS = (window.Blog && window.Blog.icons) || {};

  /* ---------- Code blocks ---------- */
  function langOf(code) {
    var m = /language-([\w+#-]+)/.exec(code.className || "");
    if (m) return m[1].toLowerCase();
    // highlight.js records what it auto-detected
    var d = code.getAttribute("data-highlighted-language");
    return d ? d.toLowerCase() : "text";
  }

  function decorateCode(article) {
    article.querySelectorAll("pre").forEach(function (pre) {
      if (pre.parentNode && pre.parentNode.classList.contains("code-win")) return;
      var code = pre.querySelector("code");
      if (window.hljs && code) {
        try {
          window.hljs.highlightElement(code);
          if (window.hljs.highlightAuto && !/language-/.test(code.className)) {
            // highlightElement already set the detected language class
          }
        } catch (e) {}
      }

      var win = document.createElement("div");
      win.className = "code-win";
      pre.parentNode.insertBefore(win, pre);

      var bar = document.createElement("div");
      bar.className = "code-win-bar";
      bar.innerHTML = '<span class="lang">' + (code ? langOf(code) : "text") + "</span>";

      var btn = document.createElement("button");
      btn.className = "copy-btn";
      btn.type = "button";
      btn.textContent = "复制";
      btn.setAttribute("aria-label", "复制代码");
      btn.addEventListener("click", function () {
        var text = code ? code.innerText : pre.innerText;
        var done = function () {
          btn.textContent = "已复制";
          btn.classList.add("copied");
          setTimeout(function () {
            btn.textContent = "复制";
            btn.classList.remove("copied");
          }, 1500);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, fallback);
        } else {
          fallback();
        }
        function fallback() {
          var ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand("copy"); done(); } catch (e) {}
          document.body.removeChild(ta);
        }
      });
      bar.appendChild(btn);

      win.appendChild(bar);
      win.appendChild(pre);
    });
  }

  /* ---------- Reading progress ---------- */
  function progressBar() {
    var bar = document.createElement("div");
    bar.className = "read-progress";
    document.body.appendChild(bar);
    onScroll(function () {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";
    });
  }

  /* ---------- Back to top ---------- */
  function backToTop() {
    var btn = document.createElement("button");
    btn.className = "to-top";
    btn.type = "button";
    btn.setAttribute("aria-label", "回到顶部");
    btn.innerHTML = ICONS.up || "↑";
    btn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    document.body.appendChild(btn);
    onScroll(function () { btn.classList.toggle("show", window.scrollY > 560); });
  }

  /* rAF-throttled scroll listener shared by the progress bar and to-top button */
  function onScroll(fn) {
    var ticking = false;
    function tick() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { fn(); ticking = false; });
    }
    window.addEventListener("scroll", tick, { passive: true });
    window.addEventListener("resize", tick, { passive: true });
    fn();
  }

  /* ---------- TOC scroll-spy ---------- */
  function scrollSpy(toc) {
    if (!toc || toc.length < 3) return;
    var links = {};
    document.querySelectorAll("#toc a[data-id]").forEach(function (a) {
      links[a.getAttribute("data-id")] = a;
    });
    var headings = toc.map(function (t) { return document.getElementById(t.id); }).filter(Boolean);
    if (!headings.length) return;

    var current = null;
    function update() {
      var best = headings[0].id;
      for (var i = 0; i < headings.length; i++) {
        if (headings[i].getBoundingClientRect().top <= 110) best = headings[i].id;
      }
      if (best === current) return;
      current = best;
      Object.keys(links).forEach(function (k) { links[k].classList.toggle("active", k === best); });
    }
    onScroll(update);
  }

  /* ---------- Image lightbox ---------- */
  function lightbox(article) {
    var imgs = article.querySelectorAll("img");
    if (!imgs.length) return;
    var overlay = null;

    function close() {
      if (!overlay) return;
      var o = overlay;
      overlay = null;
      o.classList.remove("open");
      setTimeout(function () { if (o.parentNode) o.parentNode.removeChild(o); }, 200);
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) { if (e.key === "Escape") close(); }

    imgs.forEach(function (img) {
      img.classList.add("zoomable");
      img.setAttribute("loading", "lazy");
      img.setAttribute("decoding", "async");
      // zooming is an interaction, so it must be reachable by keyboard too
      img.setAttribute("tabindex", "0");
      img.setAttribute("role", "button");
      img.setAttribute("aria-label", (img.alt ? img.alt + " — " : "") + "放大图片");
      function open() {
        overlay = document.createElement("div");
        overlay.className = "lightbox";
        var big = document.createElement("img");
        big.src = img.currentSrc || img.src;
        big.alt = img.alt || "";
        overlay.appendChild(big);
        overlay.addEventListener("click", close);
        document.body.appendChild(overlay);
        document.addEventListener("keydown", onKey);
        requestAnimationFrame(function () { if (overlay) overlay.classList.add("open"); });
      }
      img.addEventListener("click", open);
      img.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
      });
    });
  }

  window.Enhance = {
    /* Each step is isolated: this file promises to be optional, so one broken
       enhancement must not take the other four down with it. */
    article: function (article, toc) {
      if (!article) return;
      var steps = [
        function () { decorateCode(article); },
        function () { lightbox(article); },
        progressBar,
        backToTop,
        function () { scrollSpy(toc); }
      ];
      steps.forEach(function (step, i) {
        try { step(); } catch (e) { console.warn("enhance step " + i + " failed", e); }
      });
    }
  };
})();
