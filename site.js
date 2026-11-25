/* amos-kaminski.com: small enhancements. The site works without this file. */
(function () {
  "use strict";
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 1. Upcoming tags: marked until the date passes ---------- */
  var today = new Date(); today.setHours(0, 0, 0, 0);
  document.querySelectorAll("[data-date]").forEach(function (el) {
    var d = new Date(el.getAttribute("data-date") + "T00:00:00");
    if (d >= today) {
      var t = document.createElement("span");
      t.className = "tag"; t.textContent = "Upcoming";
      (el.querySelector(".tag-slot") || el).appendChild(t);
    }
  });

  /* ---------- 2. Light / dark switch (remembered in this browser) ---------- */
  var root = document.documentElement;
  var toggle = document.querySelector(".theme-toggle");
  function effectiveTheme() {
    var t = root.getAttribute("data-theme");
    if (t) return t;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function labelToggle() {
    if (!toggle) return;
    var label = effectiveTheme() === "dark" ? "Switch to light mode" : "Switch to dark mode";
    toggle.setAttribute("aria-label", label); toggle.setAttribute("title", label);
  }
  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = effectiveTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) { /* storage unavailable */ }
      labelToggle();
    });
    labelToggle();
  }

  /* ---------- 3. Cite: show BibTeX and copy it ---------- */
  document.querySelectorAll(".cite-btn").forEach(function (btn) {
    var panel = btn.closest(".body").querySelector(".cite");
    btn.addEventListener("click", function () {
      var open = panel.hidden;
      panel.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
    });
    var copy = panel.querySelector(".copy-btn");
    copy.addEventListener("click", function () {
      var text = panel.querySelector("pre").textContent;
      function done(ok) {
        copy.textContent = ok ? "Copied" : "Select the text above to copy";
        setTimeout(function () { copy.textContent = "Copy BibTeX"; }, 1800);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      } else { done(false); }
    });
  });

  /* ---------- 4. The Cantor rule: hover a bar to light up its branch, click to zoom ---------- */
  var svg = document.querySelector("svg.cantor");
  if (!svg || !svg.getScreenCTM) return;
  var NS = "http://www.w3.org/2000/svg";
  var W = 729, ROW = 4, STEP = 7, VISIBLE = 5, MAX_LEVEL = 9, MAX_ZOOM = 5;
  var H = VISIBLE * ROW + (VISIBLE - 1) * (STEP - ROW);

  // Deeper levels (5..9), drawn below the visible rows so a zoom has detail to show.
  for (var lv = 5; lv <= MAX_LEVEL; lv++) {
    var g = document.createElementNS(NS, "g");
    g.setAttribute("class", "lv" + lv);
    var n = Math.pow(2, lv), w = W / Math.pow(3, lv);
    for (var i = 0; i < n; i++) {
      var x = 0, addr = "";
      for (var k = 0; k < lv; k++) {
        var right = (i >> (lv - 1 - k)) & 1;
        addr += right ? "2" : "0";
        if (right) x += 2 * W / Math.pow(3, k + 1);
      }
      var r = document.createElementNS(NS, "rect");
      r.setAttribute("x", x); r.setAttribute("y", lv * STEP);
      r.setAttribute("width", w); r.setAttribute("height", ROW);
      r.setAttribute("data-a", addr);
      g.appendChild(r);
    }
    svg.appendChild(g);
  }
  var rects = Array.prototype.slice.call(svg.querySelectorAll("rect"));
  var groups = Array.prototype.slice.call(svg.querySelectorAll("g"));
  svg.classList.add("interactive");

  var hint = document.createElement("p");
  hint.className = "cantor-hint"; hint.setAttribute("aria-live", "polite"); hint.hidden = true;
  svg.parentNode.insertBefore(hint, svg.nextSibling);

  var zoom = 0, box = [0, 0, W, H], lit = null;

  // Which bar (as a ternary address) sits under the pointer, if any.
  function locate(evt) {
    var pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
    var p = pt.matrixTransform(svg.getScreenCTM().inverse());
    var level = Math.floor(p.y / STEP);
    if (level < zoom || level > Math.min(zoom + VISIBLE - 1, MAX_LEVEL) || p.x < 0 || p.x > W) return null;
    var x0 = 0, len = W, a = "";
    for (var j = 0; j < level; j++) {
      len /= 3;
      if (p.x < x0 + len) a += "0";
      else if (p.x >= x0 + 2 * len) { x0 += 2 * len; a += "2"; }
      else return null; // in a removed middle third
    }
    return { a: a, level: level, x0: x0, w: len };
  }

  function light(seg) {
    var key = seg ? seg.a : null;
    if (key === lit) return;
    lit = key;
    svg.classList.toggle("dim", key !== null);
    rects.forEach(function (rc) {
      rc.classList.toggle("lit", key !== null && rc.getAttribute("data-a").indexOf(key) === 0);
    });
  }

  function shade() {
    groups.forEach(function (gr) {
      var l = parseInt(gr.getAttribute("class").replace("lv", ""), 10);
      gr.style.opacity = l < zoom ? "0" : String(Math.max(0.4, 1 - 0.12 * (l - zoom)));
    });
  }

  function setBox(b) { box = b; svg.setAttribute("viewBox", b.join(" ")); }

  function zoomTo(level, x0, w) {
    var from = box.slice(), to = [x0, level * STEP, w, H];
    zoom = level; shade(); light(null);
    hint.hidden = level === 0;
    hint.textContent = level === 0 ? "" :
      "Zoomed into one branch: it is a copy of the whole Cantor set. Click its top bar or press Esc to zoom out.";
    if (reduceMotion) { setBox(to); return; }
    var t0 = null, dur = 650;
    function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function step(ts) {
      if (t0 === null) t0 = ts;
      var t = Math.min(1, (ts - t0) / dur), e = ease(t);
      // interpolate the width geometrically so the zoom feels even at every scale
      var wNow = from[2] * Math.pow(to[2] / from[2], e);
      var frac = (from[2] === to[2]) ? e : (wNow - from[2]) / (to[2] - from[2]);
      setBox([from[0] + (to[0] - from[0]) * frac, from[1] + (to[1] - from[1]) * e, wNow, H]);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  svg.addEventListener("pointermove", function (e) { light(locate(e)); });
  svg.addEventListener("pointerleave", function () { light(null); });
  svg.addEventListener("click", function (e) {
    var seg = locate(e);
    if (!seg) return;
    if (zoom > 0 && seg.level === zoom) zoomTo(0, 0, W);
    else if (seg.level > zoom && seg.level <= MAX_ZOOM) zoomTo(seg.level, seg.x0, seg.w);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && zoom > 0) zoomTo(0, 0, W);
  });
})();
