/* **********************************************************
 * Catalogue network: a floating, springy graph
 *
 * - every experiment drifts slowly around its home position
 * - lines are springs: drag one experiment and the ones it
 *   connects to get pulled along, then everything settles back
 * - thumbnails push each other apart instead of overlapping
 * - hover an experiment: its links light up and the reasons
 *   are listed under the network
 * - a drag isn't a click, so you can play without opening pages
 * - "reduce motion" on: no drifting, dragging still works
 * ********************************************************** */

(function () {
  var svg = document.querySelector(".net__svg");
  if (!svg) return;
  var data = window.CATALOGUE || { info: {}, links: [], order: [] };

  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- tuning ----------------------------------------------------------
  var DRIFT = still ? 0 : 22;   // how far each experiment wanders from home (svg units)
  var DRIFT_SPEED = 0.0005;     // how fast it wanders
  var HOME = 0.02;              // pull back towards home
  var SPRING = 0.008;           // how strongly lines pull connected experiments
  var GAP = 26;                 // space kept between thumbnails
  var DAMP = 0.86;              // friction, lower = calmer
  var CLICK_SLOP = 5;           // px of movement before a press counts as a drag

  // ---- nodes -----------------------------------------------------------
  var nodes = {};
  var list = [];
  svg.querySelectorAll(".node").forEach(function (el, i) {
    var box = el.querySelector(".node__bg");
    var x = parseFloat(el.dataset.x), y = parseFloat(el.dataset.y);
    var n = {
      id: el.dataset.id, el: el, move: el.querySelector(".node__move"),
      w: parseFloat(box.getAttribute("width")), h: parseFloat(box.getAttribute("height")) + 18,
      hx: x, hy: y, x: x, y: y, vx: 0, vy: 0,
      p1: i * 1.7, p2: i * 2.3, w1: 0.8 + (i % 5) * 0.11, w2: 0.7 + (i % 3) * 0.17,
      drag: false
    };
    nodes[n.id] = n;
    list.push(n);
  });

  // ---- edges (springs) and their labels -------------------------------
  var edges = [];
  svg.querySelectorAll(".edge").forEach(function (el) {
    var a = nodes[el.dataset.a], b = nodes[el.dataset.b];
    if (!a || !b) return;
    edges.push({ el: el, a: a, b: b, rest: Math.hypot(a.hx - b.hx, a.hy - b.hy) });
  });
  var labels = [];
  svg.querySelectorAll(".edge-label").forEach(function (el) {
    labels.push({ el: el, a: nodes[el.dataset.a], b: nodes[el.dataset.b] });
  });

  // ---- hover: highlight and explain ------------------------------------
  var net = document.querySelector(".net");
  var out = document.getElementById("net-info");
  var idle = out ? out.textContent : "";

  function describe(id) {
    var i = data.order.indexOf(id), parts = [];
    var head = data.info[id].no + " " + data.info[id].title;
    if (i > -1 && i < data.order.length - 1) parts.push("led to " + data.info[data.order[i + 1]].no);
    data.links.forEach(function (l) {
      if (l.a === id || l.b === id) {
        var o = l.a === id ? l.b : l.a;
        parts.push(data.info[o].no + ": " + l.why);
      }
    });
    return head + " — " + parts.join(" · ");
  }

  function focus(id) {
    net.classList.add("is-focus");
    var linked = {};
    linked[id] = true;
    svg.querySelectorAll(".edge, .edge-label").forEach(function (e) {
      var on = e.dataset.a === id || e.dataset.b === id;
      e.classList.toggle("is-on", on);
      if (on) { linked[e.dataset.a] = true; linked[e.dataset.b] = true; }
    });
    list.forEach(function (n) { n.el.classList.toggle("is-on", !!linked[n.id]); });
    if (out) out.textContent = describe(id);
  }

  function clear() {
    if (active) return; // keep the highlight while dragging
    net.classList.remove("is-focus");
    svg.querySelectorAll(".is-on").forEach(function (e) { e.classList.remove("is-on"); });
    if (out) out.textContent = idle;
  }

  // ---- dragging --------------------------------------------------------
  var active = null, pressX = 0, pressY = 0, moved = false;

  function toSvg(evt) {
    var pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  list.forEach(function (n) {
    n.el.addEventListener("mouseenter", function () { focus(n.id); });
    n.el.addEventListener("focus", function () { focus(n.id); });
    n.el.addEventListener("mouseleave", clear);
    n.el.addEventListener("blur", clear);

    n.el.addEventListener("pointerdown", function (evt) {
      active = n;
      n.drag = true;
      pressX = evt.clientX;
      pressY = evt.clientY;
      moved = false;
      var p = toSvg(evt);
      n.ox = n.x - p.x;
      n.oy = n.y - p.y;
      n.el.setPointerCapture(evt.pointerId);
      svg.classList.add("is-dragging");
      focus(n.id);
    });

    n.el.addEventListener("pointermove", function (evt) {
      if (active !== n) return;
      if (Math.hypot(evt.clientX - pressX, evt.clientY - pressY) > CLICK_SLOP) moved = true;
      var p = toSvg(evt);
      n.x = p.x + n.ox;
      n.y = p.y + n.oy;
      n.vx = n.vy = 0;
    });

    function release(evt) {
      if (active !== n) return;
      n.drag = false;
      active = null;
      svg.classList.remove("is-dragging");
      if (n.el.hasPointerCapture && n.el.hasPointerCapture(evt.pointerId)) {
        n.el.releasePointerCapture(evt.pointerId);
      }
      clear();
    }
    n.el.addEventListener("pointerup", release);
    n.el.addEventListener("pointercancel", release);

    n.el.addEventListener("click", function (evt) {
      if (moved) { evt.preventDefault(); moved = false; }
    });
    n.el.addEventListener("dragstart", function (evt) { evt.preventDefault(); });
  });

  // how far along a line (0..1) it leaves a node's box
  function exitT(n, dx, dy) {
    var hw = n.w / 2 + 6, hh = n.h / 2 + 6;
    var tx = dx ? hw / Math.abs(dx) : Infinity;
    var ty = dy ? hh / Math.abs(dy) : Infinity;
    return Math.min(tx, ty, 0.5);
  }

  // ---- simulation ------------------------------------------------------
  function step(t) {
    list.forEach(function (n) {
      if (n.drag) return;
      var tx = n.hx + DRIFT * Math.sin(t * DRIFT_SPEED * n.w1 + n.p1);
      var ty = n.hy + DRIFT * Math.cos(t * DRIFT_SPEED * n.w2 + n.p2);
      n.vx += (tx - n.x) * HOME;
      n.vy += (ty - n.y) * HOME;
    });

    edges.forEach(function (e) {
      var dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
      var d = Math.hypot(dx, dy) || 1;
      var f = (d - e.rest) * SPRING / d;
      if (!e.a.drag) { e.a.vx += dx * f; e.a.vy += dy * f; }
      if (!e.b.drag) { e.b.vx -= dx * f; e.b.vy -= dy * f; }
    });

    // thumbnails are boxes: if two overlap, push them apart along the shorter side
    for (var i = 0; i < list.length; i++) {
      for (var j = i + 1; j < list.length; j++) {
        var a = list[i], b = list[j];
        var dx = b.x - a.x, dy = b.y - a.y;
        var ox = (a.w + b.w) / 2 + GAP - Math.abs(dx);
        var oy = (a.h + b.h) / 2 + GAP - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          var k = 0.06;
          if (ox < oy) {
            var sx = (dx < 0 ? -1 : 1) * ox * k;
            if (!a.drag) a.vx -= sx;
            if (!b.drag) b.vx += sx;
          } else {
            var sy = (dy < 0 ? -1 : 1) * oy * k;
            if (!a.drag) a.vy -= sy;
            if (!b.drag) b.vy += sy;
          }
        }
      }
    }

    list.forEach(function (n) {
      if (!n.drag) {
        n.vx *= DAMP;
        n.vy *= DAMP;
        n.x += n.vx;
        n.y += n.vy;
      }
      n.move.setAttribute("transform", "translate(" + (n.x - n.hx).toFixed(2) + " " + (n.y - n.hy).toFixed(2) + ")");
    });

    edges.forEach(function (e) {
      e.el.setAttribute("x1", e.a.x.toFixed(2));
      e.el.setAttribute("y1", e.a.y.toFixed(2));
      e.el.setAttribute("x2", e.b.x.toFixed(2));
      e.el.setAttribute("y2", e.b.y.toFixed(2));
    });
    // put each reason in the middle of the part of the line you can actually see
    labels.forEach(function (l) {
      var dx = l.b.x - l.a.x, dy = l.b.y - l.a.y;
      var tA = exitT(l.a, dx, dy), tB = exitT(l.b, dx, dy);
      var t = tA + 1 - tB < 1 ? (tA + 1 - tB) / 2 : 0.5;
      l.el.setAttribute("x", (l.a.x + dx * t).toFixed(2));
      l.el.setAttribute("y", (l.a.y + dy * t).toFixed(2));
    });

    requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
})();
