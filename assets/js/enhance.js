/* ============================================================
   Progressive enhancements for the article page:
   - syntax highlighting (highlight.js) + per-block copy button
   - reading progress bar + back-to-top button
   - TOC scroll-spy (active section highlight)
   - image lightbox (click to zoom)
   All optional & defensive: nothing here is required for content to render.
   ============================================================ */
(function () {
  "use strict";

  function highlight(article) {
    if (!window.hljs) return;
    article.querySelectorAll("pre code").forEach(function (block) {
      try { window.hljs.highlightElement(block); } catch (e) {}
    });
  }

  function addCopyButtons(article) {
    article.querySelectorAll("pre").forEach(function (pre) {
      if (pre.querySelector(".copy-btn")) return;
      var btn = document.createElement("button");
      btn.className = "copy-btn";
      btn.type = "button";
      btn.setAttribute("aria-label", "复制代码");
      btn.textContent = "复制";
      btn.addEventListener("click", function () {
        var code = pre.querySelector("code");
        var text = code ? code.innerText : pre.innerText;
        var done = function () {
          btn.textContent = "已复制";
          btn.classList.add("copied");
          setTimeout(function () { btn.textContent = "复制"; btn.classList.remove("copied"); }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(fallback);
        } else { fallback(); }
        function fallback() {
          var ta = document.createElement("textarea");
          ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
          document.body.appendChild(ta); ta.select();
          try { document.execCommand("copy"); done(); } catch (e) {}
          document.body.removeChild(ta);
        }
      });
      pre.appendChild(btn);
    });
  }

  function progressBar() {
    var bar = document.createElement("div");
    bar.className = "read-progress";
    document.body.appendChild(bar);
    var ticking = false;
    function update() {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      var pct = max > 0 ? (h.scrollTop / max) * 100 : 0;
      bar.style.width = pct + "%";
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  function backToTop() {
    var btn = document.createElement("button");
    btn.className = "to-top";
    btn.type = "button";
    btn.setAttribute("aria-label", "回到顶部");
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';
    btn.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
    document.body.appendChild(btn);
    var ticking = false;
    function update() {
      btn.classList.toggle("show", window.scrollY > 600);
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  function scrollSpy(toc) {
    if (!toc || toc.length < 3) return;
    var links = {};
    document.querySelectorAll("#toc a[data-id]").forEach(function (a) {
      links[a.getAttribute("data-id")] = a;
    });
    var ids = toc.map(function (t) { return t.id; });
    var headings = ids.map(function (id) { return document.getElementById(id); }).filter(Boolean);
    if (!headings.length) return;

    var current = null;
    function setActive(id) {
      if (id === current) return;
      current = id;
      Object.keys(links).forEach(function (k) { links[k].classList.toggle("active", k === id); });
    }
    if ("IntersectionObserver" in window) {
      var visible = {};
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { visible[en.target.id] = en.isIntersecting ? en.intersectionRatio : 0; });
        // pick the topmost heading that's intersecting, else the last passed one
        var best = null;
        for (var i = 0; i < headings.length; i++) {
          var h = headings[i];
          if (h.getBoundingClientRect().top <= 120) best = h.id;
        }
        if (!best) best = headings[0].id;
        setActive(best);
      }, { rootMargin: "-80px 0px -70% 0px", threshold: [0, 1] });
      headings.forEach(function (h) { io.observe(h); });
    } else {
      // fallback: scroll handler
      var ticking = false;
      window.addEventListener("scroll", function () {
        if (ticking) return; ticking = true;
        window.requestAnimationFrame(function () {
          var best = headings[0].id;
          for (var i = 0; i < headings.length; i++) {
            if (headings[i].getBoundingClientRect().top <= 120) best = headings[i].id;
          }
          setActive(best); ticking = false;
        });
      }, { passive: true });
    }
  }

  function lightbox(article) {
    var imgs = article.querySelectorAll("img");
    if (!imgs.length) return;
    var overlay = null;
    function close() {
      if (!overlay) return;
      overlay.classList.remove("open");
      var o = overlay;
      setTimeout(function () { if (o && o.parentNode) o.parentNode.removeChild(o); }, 200);
      overlay = null;
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    imgs.forEach(function (img) {
      img.classList.add("zoomable");
      img.addEventListener("click", function () {
        overlay = document.createElement("div");
        overlay.className = "lightbox";
        var big = document.createElement("img");
        big.src = img.currentSrc || img.src;
        big.alt = img.alt || "";
        overlay.appendChild(big);
        overlay.addEventListener("click", close);
        document.body.appendChild(overlay);
        document.addEventListener("keydown", onKey);
        // force reflow then animate in
        requestAnimationFrame(function () { overlay.classList.add("open"); });
      });
    });
  }

  window.Enhance = {
    article: function (article, toc) {
      if (!article) return;
      highlight(article);
      addCopyButtons(article);
      lightbox(article);
      progressBar();
      backToTop();
      scrollSpy(toc);
    }
  };
})();
