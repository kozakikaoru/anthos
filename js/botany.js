/* ============================================================================
 * Anthos · botany.js  —  the generative flower engine (心臓部)
 *
 * A piece of writing is analysed into "DNA", seeded into a PRNG, and grown into
 * one unique flower: stem, leaves, layered petals, a stamen center, drifting
 * pollen. The same text always grows the same bloom. Render is animatable —
 * a growth sweep, then a gentle, living sway.
 * ========================================================================== */
(function (root) {
  'use strict';
  const U = root.Anthos.util;
  const TAU = U.TAU, clamp = U.clamp, lerp = U.lerp, map = U.map, smooth = U.smooth, ease = U.ease, hsl = U.hsl;

  const PETAL_SHAPES = ['round', 'teardrop', 'heart', 'fan', 'spoon', 'lance'];

  // Sub-progress within an overall growth value [0..1] mapped onto [a..b].
  function phase(g, a, b) { return smooth(clamp((g - a) / (b - a), 0, 1)); }

  function cubic(p0, p1, p2, p3, t) {
    const u = 1 - t, u2 = u * u, t2 = t * t;
    return {
      x: u2 * u * p0.x + 3 * u2 * t * p1.x + 3 * u * t2 * p2.x + t2 * t * p3.x,
      y: u2 * u * p0.y + 3 * u2 * t * p1.y + 3 * u * t2 * p2.y + t2 * t * p3.y
    };
  }
  function cubicTan(p0, p1, p2, p3, t) {
    const u = 1 - t;
    const x = 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x);
    const y = 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y);
    const m = Math.hypot(x, y) || 1;
    return { x: x / m, y: y / m };
  }

  /* ---- DNA: text + seed → flower parameters ------------------------------- */
  function deriveDNA(features, seed) {
    const rng = U.Rng(seed);
    const f = features;

    // ---- Palette -----------------------------------------------------------
    // A base hue from the seed, then nudged by emotional warmth.
    let hue = rng.float(0, 360);
    const warm = f.warmth;                         // [-1,1]
    if (warm > 0.05) {                             // 温かい → 桃・橙・黄・赤
      const target = rng.pick([12, 28, 42, 340, 355]);
      hue = lerp(hue, target, 0.45 + 0.4 * warm);
    } else if (warm < -0.05) {                     // 冷たい → 青・藍・菫
      const target = rng.pick([212, 230, 255, 280, 195]);
      hue = lerp(hue, target, 0.45 + 0.4 * -warm);
    }
    hue = ((hue % 360) + 360) % 360;

    const sat = clamp(rng.float(50, 78) + warm * 8, 34, 88);
    const light = clamp(rng.float(59, 74) + f.vowelRatio * 8, 48, 82);
    const hueDrift = rng.float(-26, 26);           // inner→outer hue travel

    // Center: classic gold/amber most of the time, occasionally a deep contrast.
    const goldCenter = rng.bool(0.72);
    const centerHue = goldCenter ? rng.float(40, 52) : (hue + 180 + rng.float(-18, 18));
    const centerSat = goldCenter ? rng.float(62, 82) : rng.float(40, 60);
    const centerLight = goldCenter ? rng.float(52, 64) : rng.float(34, 46);

    // Foliage: a believable green, gently pulled toward the bloom's temperature.
    const greenHue = clamp(lerp(118, warm > 0 ? 96 : 150, Math.abs(warm)) + rng.float(-12, 12), 80, 165);
    const greenSat = rng.float(26, 46);
    const greenLight = rng.float(30, 45);

    // ---- Form --------------------------------------------------------------
    // Petal count leans toward botanically pleasing numbers, scaled by richness.
    const richness = clamp(map(f.words || 1, 1, 60, 0, 1) * 0.6 + f.uniqueRatio * 0.4, 0, 1);
    const petalBank = [5, 5, 6, 8, 8, 13, 21];
    let petalCount = petalBank[clamp(Math.round(richness * (petalBank.length - 1)) + rng.int(-1, 1), 0, petalBank.length - 1)];
    petalCount = clamp(petalCount, 5, 21);

    let layers = clamp(1 + Math.round(map(f.sentences, 0, 6, 0, 2)) + (f.chars > 140 ? 1 : 0), 1, 3);
    let shape = PETAL_SHAPES[clamp(Math.floor(map(f.avgWordLen + f.kanjiRatio * 4, 0, 8, 0, PETAL_SHAPES.length)) + rng.int(0, 1), 0, PETAL_SHAPES.length - 1)];

    let bloomScale = clamp(map(Math.sqrt(f.chars), 0, 18, 0.62, 1.18), 0.6, 1.25);
    let petalLen = (0.16 + 0.06 * richness) * (0.9 + rng.float(0, 0.2));
    let petalWid = petalLen * (shape === 'fan' ? 0.95 : shape === 'lance' ? 0.34 : 0.52) * rng.float(0.85, 1.15);
    let petalCurl = rng.float(-0.18, 0.22);        // how petals cup forward/back
    let centerR = petalLen * (0.34 + 0.16 * rng.next());

    // ---- Bloom form: the overall silhouette. This is what makes one entry's
    // flower read as a *rose* and another's as an *aster* — real variety.
    let form = rng.pick(['daisy', 'daisy', 'daisy', 'aster', 'aster', 'rose', 'rose', 'star']);
    if (f.exclaims >= 2) form = 'star';                         // 高揚は星形に
    else if (f.kanjiRatio > 0.44 && rng.bool(0.5)) form = 'rose'; // 漢字が濃いと密な薔薇に
    else if (f.chars > 150 && rng.bool(0.4)) form = 'aster';     // 長い綴りは菊咲きに
    let layerFalloff = 0.16;                        // per-layer shrink
    let layerRot = Math.PI / petalCount;            // per-layer twist
    if (form === 'rose') {                          // densely nested, cupped
      layers = clamp(layers + 2, 4, 6);
      petalCount = clamp(petalCount, 6, 13);
      shape = rng.pick(['round', 'spoon', 'heart']);
      petalWid = petalLen * 0.62 * rng.float(0.9, 1.1);
      petalCurl = rng.float(0.2, 0.42);
      centerR *= 0.42; bloomScale *= 0.96; layerFalloff = 0.24; layerRot = 0.95;
    } else if (form === 'aster') {                  // many fine rays
      layers = clamp(layers + 1, 2, 3);
      petalCount = clamp(petalCount + rng.int(5, 10), 15, 26);
      shape = 'lance'; petalWid = petalLen * 0.2 * rng.float(0.85, 1.2);
      petalLen *= 1.05; centerR *= 0.66; layerFalloff = 0.1; layerRot = Math.PI / petalCount * 0.5;
    } else if (form === 'star') {                   // few bold points
      layers = 1; petalCount = clamp(petalCount, 5, 8);
      shape = 'lance'; petalLen *= 1.12; petalWid = petalLen * 0.34 * rng.float(0.85, 1.1);
      centerR *= 0.95;
    }

    // Stem & posture.
    const stemH = clamp(map(f.chars, 0, 240, 0.42, 0.72) + rng.float(-0.03, 0.03), 0.36, 0.74);
    const lean = rng.float(-0.10, 0.10) + warm * 0.04;   // overall tilt
    const bend = rng.float(-0.14, 0.14);                 // S-curve amount
    const stemW = clamp(0.010 + 0.006 * bloomScale, 0.008, 0.02);

    // Leaves along the stem.
    const leafCount = clamp(Math.round(map(f.commas + f.words * 0.25, 0, 10, 1, 5)) + rng.int(0, 1), 1, 6);
    const leaves = [];
    for (let i = 0; i < leafCount; i++) {
      leaves.push({
        at: rng.float(0.22, 0.74),
        side: rng.sign(),
        size: rng.float(0.7, 1.15),
        angle: rng.float(0.5, 1.05)
      });
    }
    leaves.sort(function (a, b) { return a.at - b.at; });

    // Buds (unopened promise) — more questions, more buds.
    const budCount = clamp(Math.round(map(f.questions, 0, 4, 0, 2)), 0, 2);
    const buds = [];
    for (let i = 0; i < budCount; i++) buds.push({ at: rng.float(0.55, 0.86), side: rng.sign(), size: rng.float(0.5, 0.8) });

    // Stamen / pollen.
    const stamenCount = clamp(Math.round(map(f.exclaims, 0, 5, 14, 40)) + rng.int(-4, 6), 10, 60);
    const moteCount = clamp(Math.round(map(f.chars, 0, 200, 3, 12)), 3, 14);
    const motes = [];
    for (let i = 0; i < moteCount; i++) motes.push({ a: rng.float(0, TAU), r: rng.float(0.05, 0.32), sp: rng.float(0.2, 0.8), ph: rng.float(0, TAU), s: rng.float(0.4, 1) });

    return {
      hue: hue, sat: sat, light: light, hueDrift: hueDrift,
      centerHue: centerHue, centerSat: centerSat, centerLight: centerLight,
      greenHue: greenHue, greenSat: greenSat, greenLight: greenLight,
      petalCount: petalCount, layers: layers, shape: shape, form: form,
      layerFalloff: layerFalloff, layerRot: layerRot,
      bloomScale: bloomScale, petalLen: petalLen, petalWid: petalWid, petalCurl: petalCurl, centerR: centerR,
      stemH: stemH, lean: lean, bend: bend, stemW: stemW,
      leaves: leaves, buds: buds, stamenCount: stamenCount, motes: motes,
      seedAngle: rng.float(0, TAU)
    };
  }

  /* ---- Petal geometry ----------------------------------------------------- */
  // Builds a petal path pointing "up" (−y) from the origin, length L, width W.
  function petalPath(ctx, L, W, type) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    switch (type) {
      case 'teardrop':
        ctx.bezierCurveTo(W * 0.95, -L * 0.18, W * 0.28, -L * 0.96, 0, -L);
        ctx.bezierCurveTo(-W * 0.28, -L * 0.96, -W * 0.95, -L * 0.18, 0, 0);
        break;
      case 'lance':
        ctx.bezierCurveTo(W * 0.9, -L * 0.3, W * 0.5, -L * 0.88, 0, -L);
        ctx.bezierCurveTo(-W * 0.5, -L * 0.88, -W * 0.9, -L * 0.3, 0, 0);
        break;
      case 'fan':
        ctx.bezierCurveTo(W * 1.15, -L * 0.05, W * 0.92, -L * 0.95, 0, -L);
        ctx.bezierCurveTo(-W * 0.92, -L * 0.95, -W * 1.15, -L * 0.05, 0, 0);
        break;
      case 'spoon':
        ctx.bezierCurveTo(W * 0.35, -L * 0.1, W * 1.02, -L * 0.55, W * 0.62, -L * 0.92);
        ctx.bezierCurveTo(W * 0.3, -L * 1.05, -W * 0.3, -L * 1.05, -W * 0.62, -L * 0.92);
        ctx.bezierCurveTo(-W * 1.02, -L * 0.55, -W * 0.35, -L * 0.1, 0, 0);
        break;
      case 'heart':
        ctx.bezierCurveTo(W * 0.95, -L * 0.12, W * 1.0, -L * 0.82, W * 0.42, -L * 0.96);
        ctx.bezierCurveTo(W * 0.2, -L * 1.02, W * 0.06, -L * 0.9, 0, -L * 0.8);
        ctx.bezierCurveTo(-W * 0.06, -L * 0.9, -W * 0.2, -L * 1.02, -W * 0.42, -L * 0.96);
        ctx.bezierCurveTo(-W * 1.0, -L * 0.82, -W * 0.95, -L * 0.12, 0, 0);
        break;
      default: // round
        ctx.bezierCurveTo(W, -L * 0.12, W * 0.86, -L * 0.84, 0, -L);
        ctx.bezierCurveTo(-W * 0.86, -L * 0.84, -W, -L * 0.12, 0, 0);
    }
    ctx.closePath();
  }

  /* ---- The Flower --------------------------------------------------------- */
  function Flower(text, opts) {
    opts = opts || {};
    this.text = text || '';
    this.features = U.analyze(this.text);
    this.seed = (U.cyrb53(this.text || '·', opts.salt || 0)) >>> 0;
    this.dna = deriveDNA(this.features, this.seed);
  }

  Flower.prototype.color = function () {
    return U.hslToHex(this.dna.hue, this.dna.sat, this.dna.light);
  };

  // Draw into ctx. o = { w, h, t(ms), growth(0..1), sway(0..1), shadow(bool) }
  Flower.prototype.draw = function (ctx, o) {
    const d = this.dna;
    const w = o.w, h = o.h;
    const t = (o.t || 0) / 1000;
    const growth = clamp(o.growth == null ? 1 : o.growth, 0, 1);
    const swayAmt = o.sway == null ? 1 : o.sway;
    const unit = Math.min(w, h);                 // intrinsic scale

    const gStem = phase(growth, 0.0, 0.46);
    const gLeaf = phase(growth, 0.28, 0.72);
    const gBloom = phase(growth, 0.52, 1.0);

    // Living sway: gentle bend that grows with height. Calmer when small.
    const sway = swayAmt * (0.5 + 0.5 * gBloom) * (0.5 * Math.sin(t * 0.7 + d.seedAngle) + 0.5 * Math.sin(t * 0.31 + 1.7));

    const baseX = w * 0.5 + d.lean * unit * 0.2;
    const baseY = h * 0.95;
    const tipY = baseY - d.stemH * h * gStem;
    const span = baseY - tipY;

    // Stem spine as a cubic bezier (base → tip) with an S-curve + sway lean.
    const p0 = { x: baseX, y: baseY };
    const p3 = { x: baseX + (d.lean + sway * 0.05) * unit * 0.5, y: tipY };
    const p1 = { x: baseX + d.bend * unit * 0.5, y: lerp(baseY, tipY, 0.4) };
    const p2 = { x: baseX - d.bend * unit * 0.35 + sway * unit * 0.05, y: lerp(baseY, tipY, 0.74) };

    // ---- ground shadow ----
    if (o.shadow !== false && gStem > 0.05) {
      ctx.save();
      ctx.globalAlpha = 0.16 * gStem;
      ctx.fillStyle = 'rgba(40,30,25,1)';
      ctx.beginPath();
      ctx.ellipse(baseX, baseY + unit * 0.012, unit * 0.16 * (0.6 + gBloom * 0.6), unit * 0.025, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // ---- stem (tapered) ----
    const SAMP = 26;
    const spine = [];
    for (let i = 0; i <= SAMP; i++) {
      const tt = i / SAMP;
      const pt = cubic(p0, p1, p2, p3, tt);
      const tan = cubicTan(p0, p1, p2, p3, tt);
      spine.push({ p: pt, n: { x: -tan.y, y: tan.x }, t: tt });
    }
    const stemBaseW = d.stemW * unit;
    ctx.beginPath();
    for (let i = 0; i <= SAMP; i++) {
      const s = spine[i], wd = stemBaseW * (1 - 0.7 * s.t);
      const x = s.p.x + s.n.x * wd, y = s.p.y + s.n.y * wd;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    for (let i = SAMP; i >= 0; i--) {
      const s = spine[i], wd = stemBaseW * (1 - 0.7 * s.t);
      ctx.lineTo(s.p.x - s.n.x * wd, s.p.y - s.n.y * wd);
    }
    ctx.closePath();
    const stemGrad = ctx.createLinearGradient(baseX, baseY, p3.x, tipY);
    stemGrad.addColorStop(0, hsl(d.greenHue, d.greenSat, d.greenLight - 6));
    stemGrad.addColorStop(1, hsl(d.greenHue + 6, d.greenSat + 6, d.greenLight + 10));
    ctx.fillStyle = stemGrad;
    ctx.fill();

    // ---- leaves ----
    for (let i = 0; i < d.leaves.length; i++) {
      const lf = d.leaves[i];
      const idx = clamp(Math.round(lf.at * SAMP), 1, SAMP - 1);
      const s = spine[idx];
      const lg = clamp((gLeaf - i * 0.08) / 0.6, 0, 1);
      if (lg <= 0) continue;
      const eg = ease.outBack(lg);
      const tan = { x: s.n.y, y: -s.n.x };
      const ang = Math.atan2(tan.y, tan.x) - lf.side * lf.angle;
      const Ll = unit * 0.13 * lf.size * eg, Wl = Ll * 0.42;
      ctx.save();
      ctx.translate(s.p.x, s.p.y);
      ctx.rotate(ang + sway * 0.04 * lf.side);
      const lg2 = ctx.createLinearGradient(0, 0, 0, -Ll);
      lg2.addColorStop(0, hsl(d.greenHue, d.greenSat + 4, d.greenLight - 4));
      lg2.addColorStop(1, hsl(d.greenHue + 8, d.greenSat + 10, d.greenLight + 14));
      ctx.fillStyle = lg2;
      petalPath(ctx, Ll, Wl, 'lance');
      ctx.fill();
      ctx.strokeStyle = hsl(d.greenHue, d.greenSat, d.greenLight - 12, 0.5);
      ctx.lineWidth = Math.max(0.6, unit * 0.0016);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -Ll * 0.92); ctx.stroke();
      ctx.restore();
    }

    // ---- buds ----
    for (let i = 0; i < d.buds.length; i++) {
      const bd = d.buds[i];
      const idx = clamp(Math.round(bd.at * SAMP), 1, SAMP - 1);
      const s = spine[idx];
      const bg = clamp((gBloom - 0.1) / 0.8, 0, 1);
      if (bg <= 0) continue;
      const r = unit * 0.022 * bd.size * ease.outCubic(bg);
      const bx = s.p.x + bd.side * unit * 0.04 * bg, by = s.p.y - unit * 0.03 * bg;
      ctx.save();
      ctx.translate(bx, by);
      ctx.fillStyle = hsl(d.greenHue, d.greenSat, d.greenLight + 4);
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.7, r * 1.4, bd.side * 0.3, 0, TAU); ctx.fill();
      ctx.fillStyle = hsl(d.hue, d.sat, d.light + 6, 0.85);
      ctx.beginPath(); ctx.ellipse(0, -r * 0.5, r * 0.5, r * 0.9, bd.side * 0.3, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // ---- flower head ----
    const headX = p3.x, headY = p3.y - d.centerR * unit * 0.2;
    this._drawHead(ctx, headX, headY, unit, gBloom, t, sway, o.glow !== false);

    // ---- pollen / light motes ----
    if (gBloom > 0.4) {
      ctx.save();
      for (let i = 0; i < d.motes.length; i++) {
        const m = d.motes[i];
        const a = m.a + t * m.sp * 0.3;
        const rad = unit * (m.r + 0.02 * Math.sin(t * m.sp + m.ph));
        const mx = headX + Math.cos(a) * rad;
        const my = headY + Math.sin(a) * rad * 0.7 - t * 2 % 1 * 0; // subtle
        const fl = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.3 + m.ph));
        ctx.globalAlpha = fl * 0.6 * gBloom * m.s;
        ctx.fillStyle = hsl(d.centerHue, d.centerSat, 78);
        ctx.beginPath(); ctx.arc(mx, my, unit * 0.004 * m.s, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  };

  Flower.prototype._drawHead = function (ctx, cx, cy, unit, g, t, sway, glow) {
    if (g <= 0) return;
    const d = this.dna;
    const L = d.petalLen * unit * d.bloomScale;
    const W = d.petalWid * unit * d.bloomScale;
    const cR = d.centerR * unit * d.bloomScale;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(sway * 0.06);

    if (glow) { ctx.shadowColor = hsl(d.hue, d.sat, d.light, 0.5); ctx.shadowBlur = unit * 0.05; }

    // Layers back→front; each layer a touch smaller/darker and offset-rotated.
    for (let layer = d.layers - 1; layer >= 0; layer--) {
      const lg = clamp((g - layer * 0.14) / (1 - layer * 0.1), 0, 1);
      if (lg <= 0) continue;
      const eo = ease.outBack(lg);
      const lScale = Math.pow(1 - d.layerFalloff, layer) * eo;
      const lLight = d.light - Math.min(layer, 3) * 6;
      const lSat = d.sat - layer * 3;
      const rot = d.seedAngle + layer * d.layerRot + (1 - eo) * 0.5;
      const breathe = 1 + 0.012 * Math.sin(t * 0.9 + layer);

      for (let i = 0; i < d.petalCount; i++) {
        const ang = rot + (i / d.petalCount) * TAU;
        ctx.save();
        ctx.rotate(ang);
        // cup the petals forward/back a little for depth
        const pl = L * lScale * breathe, pw = W * lScale;
        ctx.translate(0, -cR * 0.35 * lScale);
        ctx.transform(1, 0, d.petalCurl * 0.4, 1, 0, 0);

        const grad = ctx.createLinearGradient(0, 0, 0, -pl);
        grad.addColorStop(0, hsl(d.hue - d.hueDrift * 0.3, lSat + 6, lLight + 10));
        grad.addColorStop(0.55, hsl(d.hue, lSat, lLight));
        grad.addColorStop(1, hsl(d.hue + d.hueDrift, lSat - 6, lLight - 8));
        ctx.fillStyle = grad;
        petalPath(ctx, pl, pw, d.shape);
        ctx.fill();

        // soft edge + central vein
        ctx.strokeStyle = hsl(d.hue + d.hueDrift, lSat - 8, lLight - 14, 0.35);
        ctx.lineWidth = Math.max(0.5, unit * 0.0012);
        ctx.stroke();
        ctx.strokeStyle = hsl(d.hue, lSat + 10, lLight + 16, 0.4);
        ctx.beginPath(); ctx.moveTo(0, -pl * 0.08); ctx.lineTo(0, -pl * 0.86); ctx.stroke();
        ctx.restore();
      }
    }

    ctx.shadowBlur = 0;

    // ---- center disk ----
    const cg = ease.outCubic(clamp((g - 0.5) / 0.5, 0, 1));
    if (cg > 0) {
      const r = cR * cg;
      const cgrad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r * 1.05);
      cgrad.addColorStop(0, hsl(d.centerHue + 8, d.centerSat, d.centerLight + 18));
      cgrad.addColorStop(0.7, hsl(d.centerHue, d.centerSat, d.centerLight));
      cgrad.addColorStop(1, hsl(d.centerHue - 6, d.centerSat + 6, d.centerLight - 14));
      ctx.fillStyle = cgrad;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();

      // stamen dots in a phyllotactic spiral (golden angle) — alive & organic.
      const golden = 2.39996323;
      const n = d.stamenCount;
      for (let i = 0; i < n; i++) {
        const rr = r * 0.9 * Math.sqrt(i / n);
        const a = i * golden + t * 0.05;
        const sx = Math.cos(a) * rr, sy = Math.sin(a) * rr;
        const dotR = Math.max(0.4, r * 0.07 * (1 - 0.4 * (rr / r)));
        ctx.fillStyle = hsl(d.centerHue + 10, d.centerSat + 8, d.centerLight + 22, 0.95);
        ctx.beginPath(); ctx.arc(sx, sy, dotR, 0, TAU); ctx.fill();
      }
      // tiny rim highlight
      ctx.strokeStyle = hsl(d.centerHue, d.centerSat, d.centerLight + 26, 0.5);
      ctx.lineWidth = Math.max(0.5, r * 0.05);
      ctx.beginPath(); ctx.arc(-r * 0.1, -r * 0.1, r * 0.86, Math.PI * 0.9, Math.PI * 1.9); ctx.stroke();
    }

    ctx.restore();
  };

  root.Anthos.Flower = Flower;
  root.Anthos.botany = { deriveDNA: deriveDNA, PETAL_SHAPES: PETAL_SHAPES };
})(window);
