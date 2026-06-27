/* ============================================================================
 * Anthos · scene.js  —  the living garden (小屋のある庭)
 *
 * One canvas, a camera (pan / zoom), and your flowers planted in a slow spiral
 * around a small cabin — oldest near home, newest at the growing edge.
 *
 * Built to scale: frustum culling + 3-tier level-of-detail (dot / simple / full)
 * + lazy Flower construction means thousands of entries stay light. Only what is
 * on screen is drawn, and only the nearest few sway.
 * ========================================================================== */
(function (root) {
  'use strict';
  const A = root.Anthos, U = A.util, Flower = A.Flower;
  const TAU = U.TAU, clamp = U.clamp, lerp = U.lerp, ease = U.ease, hsl = U.hsl;
  const GOLDEN = 2.399963229728653;

  const R0 = 78;          // clearance from the cabin
  const STEP = 30;        // spiral spacing
  const YFLAT = 0.62;     // vertical squash → gentle bird's-eye perspective
  const WORLD_H = 60;     // a flower's world height
  const ANIM_CAP = 16;    // max flowers that sway at once

  function GardenScene(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.records = [];
    this.cam = { x: 0, y: -30, zoom: 0.5 };
    this.target = { x: 0, y: -30, zoom: 0.5 };
    this.minZoom = 0.05; this.maxZoom = 2.4;
    this.W = 0; this.H = 0; this.dpr = 1;
    this.raf = null; this.running = false; this.last = 0; this.t0 = 0;
    this.drag = null; this.moved = 0; this.pointers = {}; this.pinch = null;
    this.hover = -1; this.onPick = null; this.reduce = false;
    this._bind();
    this.resize();
  }

  /* ---- data --------------------------------------------------------------- */
  GardenScene.prototype.setEntries = function (entries) {
    // chronological (oldest first) → stable outward spiral
    const list = entries.slice().sort(function (a, b) { return a.ts - b.ts; });
    const prevById = {};
    this.records.forEach(function (r) { prevById[r.entry.id] = r; });
    const recs = list.map(function (e, i) {
      const old = prevById[e.id];
      if (old) { old.entry = e; return old; }
      const r = U.Rng((e.seed >>> 0) ^ 0x85ebca6b);
      const ang = i * GOLDEN + r.float(-0.16, 0.16);
      const rad = R0 + STEP * Math.sqrt(i) + r.float(-7, 7);
      return {
        entry: e, i: i,
        wx: Math.cos(ang) * rad,
        wy: Math.sin(ang) * rad * YFLAT,
        h: WORLD_H * r.float(0.86, 1.16),
        color: e.color || '#c98aa6',
        plantAt: 0,
        flower: null
      };
    });
    recs.sort(function (a, b) { return a.wy - b.wy; });   // painter's order (back→front)
    this.records = recs;
    this.radius = R0 + STEP * Math.sqrt(Math.max(1, list.length)) + 60;
  };

  GardenScene.prototype._flower = function (rec) {
    if (!rec.flower) rec.flower = new Flower(rec.entry.text);
    return rec.flower;
  };

  GardenScene.prototype.plantNewest = function () {
    // newest = largest ts
    let best = null;
    for (let i = 0; i < this.records.length; i++) {
      if (!best || this.records[i].entry.ts > best.entry.ts) best = this.records[i];
    }
    if (best) { best.plantAt = this._now(); this.focus(best, 1.1); }
  };

  /* ---- camera ------------------------------------------------------------- */
  GardenScene.prototype._now = function () { return (root.performance && performance.now) ? performance.now() : Date.now(); };
  GardenScene.prototype.fit = function (instant) {
    const pad = 1.18;
    const z = clamp(Math.min(this.W, this.H * 1.25) / (2 * this.radius * pad), this.minZoom, 1.1);
    this.target.zoom = z; this.target.x = 0; this.target.y = -this.radius * 0.12;
    if (instant) { this.cam.x = this.target.x; this.cam.y = this.target.y; this.cam.zoom = this.target.zoom; }
    this._wake();
  };
  GardenScene.prototype.focus = function (rec, zoom) {
    this.target.x = rec.wx; this.target.y = rec.wy - WORLD_H * 0.4;
    this.target.zoom = clamp(zoom || Math.max(this.cam.zoom, 0.9), this.minZoom, this.maxZoom);
    this._wake();
  };
  GardenScene.prototype.zoomBy = function (factor) {
    this.target.zoom = clamp(this.target.zoom * factor, this.minZoom, this.maxZoom);
    this._wake();
  };

  /* ---- projection --------------------------------------------------------- */
  GardenScene.prototype._sx = function (wx) { return (wx - this.cam.x) * this.cam.zoom + this.W / 2; };
  GardenScene.prototype._sy = function (wy) { return (wy - this.cam.y) * this.cam.zoom + this.H / 2; };
  GardenScene.prototype._wx = function (sx) { return (sx - this.W / 2) / this.cam.zoom + this.cam.x; };
  GardenScene.prototype._wy = function (sy) { return (sy - this.H / 2) / this.cam.zoom + this.cam.y; };

  /* ---- size --------------------------------------------------------------- */
  GardenScene.prototype.resize = function () {
    const dpr = Math.min(root.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height); this.dpr = dpr;
    this.canvas.width = Math.round(this.W * dpr); this.canvas.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._wake();
  };

  /* ---- loop --------------------------------------------------------------- */
  GardenScene.prototype.start = function () {
    if (this.running) return;
    this.running = true; this.last = this._now(); if (!this.t0) this.t0 = this.last;
    const self = this;
    const loop = function (ts) { if (!self.running) return; self.frame(ts); self.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  };
  GardenScene.prototype.stop = function () { this.running = false; if (this.raf) cancelAnimationFrame(this.raf); this.raf = null; };
  GardenScene.prototype._wake = function () { if (this.running) return; this.start(); this._idleStopAt = this._now() + 1400; };

  GardenScene.prototype.frame = function (ts) {
    const dt = Math.min(0.05, (ts - this.last) / 1000); this.last = ts;
    // smooth camera
    const k = 1 - Math.exp(-dt / 0.22);
    this.cam.x = lerp(this.cam.x, this.target.x, k);
    this.cam.y = lerp(this.cam.y, this.target.y, k);
    this.cam.zoom = lerp(this.cam.zoom, this.target.zoom, k);
    this.render(ts);

    // power-saver: settle to a stop when nothing is moving & nothing is animating
    const still = Math.abs(this.cam.zoom - this.target.zoom) < 1e-4 &&
      Math.abs(this.cam.x - this.target.x) < 0.05 && Math.abs(this.cam.y - this.target.y) < 0.05;
    const planting = this.records.some(function (r) { return r.plantAt && (ts - r.plantAt) < 1800; });
    if (still && !this.drag && !this.reduce && !planting && this.cam.zoom < 0.8) {
      // when zoomed out & idle there is no sway → we can stop the loop
      if (!this._idleStopAt) this._idleStopAt = ts + 600;
      if (ts > this._idleStopAt) { this.stop(); }
    } else { this._idleStopAt = 0; }
  };

  /* ---- render ------------------------------------------------------------- */
  GardenScene.prototype.render = function (ts) {
    const ctx = this.ctx, W = this.W, H = this.H, z = this.cam.zoom;
    const t = (ts - this.t0) / 1000;
    const night = document.body.dataset.theme === 'nocturne';
    this._green = night ? '#6e8e62' : '#5e7c51';
    ctx.clearRect(0, 0, W, H);

    this._drawGround(ctx, night, t);

    const recs = this.records;
    const houseSY = this._sy(0);
    let housePlaced = false;
    // animation budget: only the nearest few (by screen center) sway
    const cx = W / 2, cy = H / 2;
    let animPool = [];
    if (!this.reduce && z > 0.5) {
      for (let i = 0; i < recs.length; i++) {
        const sx = this._sx(recs[i].wx), sy = this._sy(recs[i].wy);
        if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) continue;
        animPool.push([(sx - cx) * (sx - cx) + (sy - cy) * (sy - cy), i]);
      }
      animPool.sort(function (a, b) { return a[0] - b[0]; });
      animPool = animPool.slice(0, ANIM_CAP).map(function (p) { return p[1]; });
    }
    const animSet = {}; animPool.forEach(function (i) { animSet[i] = 1; });
    // Small gardens show full-detail blooms sooner; big gardens keep them simple
    // until close, so performance never degrades with thousands of entries.
    const simpleMax = recs.length < 80 ? 22 : 44;
    const glowSmall = night && recs.length < 160;

    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i];
      // draw the cabin at its correct depth (its base sits at world y = 0)
      if (!housePlaced && rec.wy >= 0) { this._drawHouse(ctx, night, t); housePlaced = true; }

      const sx = this._sx(rec.wx), sy = this._sy(rec.wy);
      const size = rec.h * z;
      const half = size * 0.45;
      if (sx < -half - 20 || sx > W + half + 20 || sy < -size - 20 || sy > H + 40) continue;

      let growth = 1;
      if (rec.plantAt) {
        const e = (ts - rec.plantAt) / 1500;
        if (e < 1) growth = ease.outCubic(clamp(e, 0, 1)); else rec.plantAt = 0;
      }

      // 3-tier level of detail. dot/simple are Flower-free (no construction, no
      // per-frame gradient) so thousands stay cheap.
      if (size < 9) {
        this._dot(ctx, sx, sy, rec.color, size, glowSmall);
      } else if (size < simpleMax) {
        this._simple(ctx, sx, sy, rec, size, growth, glowSmall);
      } else {
        const boxH = size * 1.7, boxW = boxH * 0.66;
        ctx.save();
        ctx.translate(sx - boxW / 2, sy - boxH * 0.95);
        this._flower(rec).draw(ctx, {
          w: boxW, h: boxH, t: animSet[i] ? (ts) : 0,
          growth: growth, sway: animSet[i] ? 1 : 0, glow: night
        });
        ctx.restore();
      }

      if (i === this.hover) this._ring(ctx, sx, sy, Math.max(size * 0.5, 16));
    }
    if (!housePlaced) this._drawHouse(ctx, night, t);
  };

  GardenScene.prototype._drawGround = function (ctx, night, t) {
    const cx = this._sx(0), cy = this._sy(0);
    const rr = this.radius * this.cam.zoom * 1.25;
    const g = ctx.createRadialGradient(cx, cy, 10, cx, cy + rr * 0.1, rr);
    if (night) {
      g.addColorStop(0, '#2a3326'); g.addColorStop(0.6, '#1d241d'); g.addColorStop(1, 'rgba(18,22,18,0)');
    } else {
      g.addColorStop(0, '#cfe0b4'); g.addColorStop(0.55, '#bcd49d'); g.addColorStop(1, 'rgba(196,214,160,0)');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy + rr * 0.06, rr, rr * 0.82, 0, 0, TAU);
    ctx.fill();
  };

  GardenScene.prototype._drawHouse = function (ctx, night, t) {
    const z = this.cam.zoom;
    const s = clamp(46 * z, 8, 360);             // house pixel scale
    const x = this._sx(0), y = this._sy(0);
    ctx.save();
    ctx.translate(x, y);
    // soft shadow
    ctx.fillStyle = night ? 'rgba(0,0,0,.35)' : 'rgba(60,50,40,.18)';
    ctx.beginPath(); ctx.ellipse(0, 0, s * 1.15, s * 0.28, 0, 0, TAU); ctx.fill();

    const wall = night ? '#6a5a48' : '#e8dcc6';
    const wallDark = night ? '#574a3c' : '#d8c6a6';
    const roof = night ? '#7c4a44' : '#b96a59';
    const roofDark = night ? '#653b37' : '#a25646';
    const W = s * 1.5, Hh = s * 1.0;
    // body
    ctx.fillStyle = wall;
    ctx.fillRect(-W / 2, -Hh, W, Hh);
    ctx.fillStyle = wallDark; ctx.fillRect(W / 2 - s * 0.16, -Hh, s * 0.16, Hh); // shaded side
    // roof
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(-W / 2 - s * 0.18, -Hh);
    ctx.lineTo(0, -Hh - s * 0.78);
    ctx.lineTo(W / 2 + s * 0.18, -Hh);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = roofDark;
    ctx.beginPath();
    ctx.moveTo(0, -Hh - s * 0.78); ctx.lineTo(W / 2 + s * 0.18, -Hh); ctx.lineTo(W * 0.16, -Hh); ctx.closePath(); ctx.fill();
    // chimney
    ctx.fillStyle = roofDark; ctx.fillRect(W * 0.22, -Hh - s * 0.62, s * 0.18, s * 0.4);
    // door
    ctx.fillStyle = night ? '#3c322a' : '#9c7a54';
    ctx.fillRect(-s * 0.2, -s * 0.62, s * 0.4, s * 0.62);
    ctx.fillStyle = night ? '#caa86a' : '#6e5436';
    ctx.beginPath(); ctx.arc(s * 0.1, -s * 0.3, s * 0.035, 0, TAU); ctx.fill();
    // window (glows at night)
    const wg = s * 0.34;
    ctx.fillStyle = night ? '#ffd98a' : '#bcd6e0';
    ctx.fillRect(-W / 2 + s * 0.22, -Hh + s * 0.24, wg, wg);
    if (night) { ctx.globalAlpha = 0.5; ctx.fillStyle = '#ffe6a8'; ctx.fillRect(-W / 2 + s * 0.12, -Hh + s * 0.14, wg + s * 0.2, wg + s * 0.2); ctx.globalAlpha = 1; }
    ctx.strokeStyle = night ? '#3c322a' : '#7a6244'; ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.strokeRect(-W / 2 + s * 0.22, -Hh + s * 0.24, wg, wg);
    ctx.beginPath();
    ctx.moveTo(-W / 2 + s * 0.22 + wg / 2, -Hh + s * 0.24); ctx.lineTo(-W / 2 + s * 0.22 + wg / 2, -Hh + s * 0.24 + wg);
    ctx.moveTo(-W / 2 + s * 0.22, -Hh + s * 0.24 + wg / 2); ctx.lineTo(-W / 2 + s * 0.22 + wg, -Hh + s * 0.24 + wg / 2);
    ctx.stroke();
    ctx.restore();
  };

  GardenScene.prototype._dot = function (ctx, x, y, color, size, glow) {
    const r = clamp(size * 0.42, 1.4, 4.5);
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = r * 2.2; }
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y - r, r, 0, TAU); ctx.fill();
    if (glow) ctx.shadowBlur = 0;
  };

  // Flower-free far/medium bloom: a stem line + two filled arcs. Cheap enough
  // to draw by the thousand.
  GardenScene.prototype._simple = function (ctx, x, y, rec, size, growth, glow) {
    const top = y - size * 0.62 * growth;
    ctx.strokeStyle = this._green;
    ctx.lineWidth = Math.max(1, size * 0.05);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, top); ctx.stroke();
    const r = size * 0.3 * growth;
    if (glow) { ctx.shadowColor = rec.color; ctx.shadowBlur = r * 1.3; }
    ctx.fillStyle = rec.color;
    ctx.beginPath(); ctx.arc(x, top, r, 0, TAU); ctx.fill();
    if (glow) ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,250,236,.85)';
    ctx.beginPath(); ctx.arc(x, top, r * 0.38, 0, TAU); ctx.fill();
  };

  GardenScene.prototype._ring = function (ctx, x, y, r) {
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.4, 0, 0, TAU); ctx.stroke();
  };

  /* ---- hit-test ----------------------------------------------------------- */
  GardenScene.prototype._pick = function (sx, sy) {
    // search front→back (reverse paint order) so top flowers win
    let best = -1, bestD = Infinity;
    for (let i = this.records.length - 1; i >= 0; i--) {
      const rec = this.records[i];
      const px = this._sx(rec.wx), py = this._sy(rec.wy);
      const size = rec.h * this.cam.zoom;
      const dx = sx - px, dy = sy - (py - size * 0.5);
      const rr = Math.max(size * 0.5, 14);
      const d = dx * dx + dy * dy;
      if (d < rr * rr && d < bestD) { bestD = d; best = i; }
    }
    return best;
  };

  /* ---- interaction -------------------------------------------------------- */
  GardenScene.prototype._bind = function () {
    const c = this.canvas, self = this;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', function (e) {
      c.setPointerCapture(e.pointerId);
      self.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      const n = Object.keys(self.pointers).length;
      if (n === 1) { self.drag = { x: e.clientX, y: e.clientY }; self.moved = 0; }
      else if (n === 2) { self.pinch = self._pinchState(); self.drag = null; }
      self._wake();
    });
    c.addEventListener('pointermove', function (e) {
      const rect = c.getBoundingClientRect();
      if (self.pointers[e.pointerId]) self.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      const n = Object.keys(self.pointers).length;
      if (n === 2 && self.pinch) { self._pinchMove(); return; }
      if (self.drag) {
        const dx = e.clientX - self.drag.x, dy = e.clientY - self.drag.y;
        self.moved += Math.abs(dx) + Math.abs(dy);
        self.target.x -= dx / self.cam.zoom; self.target.y -= dy / self.cam.zoom;
        self.cam.x = self.target.x; self.cam.y = self.target.y;
        self.drag = { x: e.clientX, y: e.clientY };
        self._wake();
      } else {
        const h = self._pick(e.clientX - rect.left, e.clientY - rect.top);
        if (h !== self.hover) { self.hover = h; c.style.cursor = h >= 0 ? 'pointer' : 'grab'; self._wake(); }
      }
    });
    const up = function (e) {
      const rect = c.getBoundingClientRect();
      const wasTap = self.drag && self.moved < 6;
      delete self.pointers[e.pointerId];
      if (Object.keys(self.pointers).length < 2) self.pinch = null;
      if (wasTap) {
        const h = self._pick(e.clientX - rect.left, e.clientY - rect.top);
        if (h >= 0 && self.onPick) self.onPick(self.records[h].entry.id);
      }
      self.drag = null;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', function (e) { delete self.pointers[e.pointerId]; self.drag = null; self.pinch = null; });
    c.addEventListener('wheel', function (e) {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const wx = self._wx(mx), wy = self._wy(my);
      const factor = Math.exp(-e.deltaY * 0.0014);
      self.target.zoom = clamp(self.cam.zoom * factor, self.minZoom, self.maxZoom);
      self.cam.zoom = self.target.zoom;
      // keep cursor point stable
      self.target.x = wx - (mx - self.W / 2) / self.cam.zoom; self.cam.x = self.target.x;
      self.target.y = wy - (my - self.H / 2) / self.cam.zoom; self.cam.y = self.target.y;
      self._wake();
    }, { passive: false });
  };
  GardenScene.prototype._pinchState = function () {
    const p = Object.keys(this.pointers).map((k) => this.pointers[k]);
    const dx = p[0].x - p[1].x, dy = p[0].y - p[1].y;
    return { dist: Math.hypot(dx, dy), zoom: this.cam.zoom, cx: (p[0].x + p[1].x) / 2, cy: (p[0].y + p[1].y) / 2,
      wx: this._wx((p[0].x + p[1].x) / 2 - this.canvas.getBoundingClientRect().left),
      wy: this._wy((p[0].y + p[1].y) / 2 - this.canvas.getBoundingClientRect().top) };
  };
  GardenScene.prototype._pinchMove = function () {
    const p = Object.keys(this.pointers).map((k) => this.pointers[k]);
    if (p.length < 2) return;
    const dx = p[0].x - p[1].x, dy = p[0].y - p[1].y;
    const dist = Math.hypot(dx, dy);
    const rect = this.canvas.getBoundingClientRect();
    this.target.zoom = clamp(this.pinch.zoom * (dist / this.pinch.dist), this.minZoom, this.maxZoom);
    this.cam.zoom = this.target.zoom;
    const mx = this.pinch.cx - rect.left, my = this.pinch.cy - rect.top;
    this.target.x = this.pinch.wx - (mx - this.W / 2) / this.cam.zoom; this.cam.x = this.target.x;
    this.target.y = this.pinch.wy - (my - this.H / 2) / this.cam.zoom; this.cam.y = this.target.y;
    this._wake();
  };

  root.Anthos.GardenScene = GardenScene;
})(window);
