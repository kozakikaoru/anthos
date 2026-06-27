/* ============================================================================
 * Anthos · util.js
 * Foundations: deterministic hashing + PRNG, color science, easing, text DNA.
 * Everything here is pure so a given piece of writing always grows the same
 * flower — your words have one true form.
 * ========================================================================== */
(function (root) {
  'use strict';

  /* ---- Hashing ------------------------------------------------------------ */
  // cyrb53 — a fast, well-distributed 53-bit string hash.
  function cyrb53(str, seed) {
    seed = seed >>> 0 || 0;
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }

  /* ---- Seeded PRNG -------------------------------------------------------- */
  // mulberry32 — tiny, high-quality 32-bit generator.
  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // A small wrapper giving expressive helpers over a seeded stream.
  function Rng(seed) {
    const next = mulberry32(seed >>> 0);
    return {
      next,
      float: function (min, max) { return min + (max - min) * next(); },
      int: function (min, max) { return Math.floor(min + (max - min + 1) * next()); },
      bool: function (p) { return next() < (p == null ? 0.5 : p); },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },
      // Gaussian-ish via central limit, clamped to [-1,1]·spread around center.
      gauss: function (center, spread) {
        const s = (next() + next() + next()) / 3 - 0.5; // ~[-0.5,0.5]
        return (center || 0) + s * 2 * (spread == null ? 1 : spread);
      },
      sign: function () { return next() < 0.5 ? -1 : 1; }
    };
  }

  /* ---- Math / easing ------------------------------------------------------ */
  const clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  const lerp = function (a, b, t) { return a + (b - a) * t; };
  const map = function (v, a, b, c, d) { return c + (d - c) * ((v - a) / (b - a)); };
  const smooth = function (t) { return t * t * (3 - 2 * t); };

  const ease = {
    inOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    outQuint: function (t) { return 1 - Math.pow(1 - t, 5); },
    outBack: function (t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    outElastic: function (t) {
      const c4 = (2 * Math.PI) / 3;
      return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },
    inOutSine: function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; }
  };

  /* ---- Color science ------------------------------------------------------ */
  // We compose in HSL (intuitive for harmonious palettes) and emit CSS strings.
  function hsl(h, s, l, a) {
    h = ((h % 360) + 360) % 360;
    return 'hsla(' + h.toFixed(1) + ',' + clamp(s, 0, 100).toFixed(1) + '%,' +
      clamp(l, 0, 100).toFixed(1) + '%,' + (a == null ? 1 : clamp(a, 0, 1)).toFixed(3) + ')';
  }

  // Convert HSL → hex (for storage/share where alpha not needed).
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    const to = function (v) { return ('0' + Math.round((v + m) * 255).toString(16)).slice(-2); };
    return '#' + to(r) + to(g) + to(b);
  }

  /* ---- Text → DNA --------------------------------------------------------- */
  // Extract expressive, stable features from a piece of writing. Script-agnostic:
  // works for Japanese (ひらがな・カタカナ・漢字) and Latin alike, so the flower
  // genuinely reflects the texture of the words — その文章だけの一輪。
  const VOWELS = 'aeiouyàáâäãåæèéêëìíîïòóôöõøùúûüāēīōう'
    + 'あいうえおぁぃぅぇぉゔアイウエオァィゥェォ';
  // 温かい言葉 / 冷たい言葉。日本語は語の区切りが無いので部分一致で数える。
  const WARM_WORDS = ('love joy warm happy hope light dream calm peace smile thank grateful gentle bloom dawn '
    + '愛 恋 好き すき 嬉 うれし 楽し たのし 幸 しあわせ 笑 わら 光 ひかり 希望 夢 ゆめ 優 やさ 感謝 ありがと '
    + '温 あたた 春 朝 空 花 晴 安心 元気 大好 嬉しい 楽しい 穏 おだやか ぬくも きらきら ふわ 微笑').split(' ');
  const COOL_WORDS = ('cold rain dark night storm lost fear alone grief quiet shadow tired heavy doubt fade '
    + '悲 かなし 寂 さび さみし 闇 雨 夜 不安 ふあん 怖 こわ 孤独 疲 つかれ 冷 つめた 冬 影 涙 なみだ 痛 いた '
    + '苦 くるし 辛 つら 後悔 こうかい 失 むなし 虚 沈 しず くら 嫌 いや ため息 もやもや ざわ').split(' ');

  function scriptOf(code) {
    if (code >= 0x3040 && code <= 0x309f) return 1;      // hiragana
    if (code >= 0x30a0 && code <= 0x30ff) return 2;      // katakana
    if ((code >= 0x4e00 && code <= 0x9fff) ||
        (code >= 0x3400 && code <= 0x4dbf)) return 3;     // kanji
    if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) return 4; // latin
    if (code >= 0x30 && code <= 0x39) return 5;           // digit
    return 0;
  }

  function analyze(text) {
    const t = (text || '').replace(/\s+$/,'').replace(/^\s+/,'');
    const lower = t.toLowerCase();
    const chars = t.length;

    // Script composition + "runs" (texture: how often the writing changes register).
    const counts = [0, 0, 0, 0, 0, 0];
    const charSet = {};
    let runs = 0, prev = -1, letters = 0, vowels = 0;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      const code = t.charCodeAt(i);
      const s = scriptOf(code);
      counts[s]++;
      if (!/\s/.test(c)) charSet[c] = 1;
      if (s !== 0 && s !== prev) { runs++; prev = s; }
      else if (s === 0) prev = -1;
      if (s >= 1 && s <= 4) { letters++; if (VOWELS.indexOf(lower[i]) >= 0) vowels++; }
    }

    // Segments: clauses/words separated by whitespace or punctuation. For spaced
    // languages this is a word count; for Japanese it is a clause count.
    const segments = t.split(/[\s　。！？!?、，,.；;：:・…\n]+/).filter(Boolean).length;

    // Warmth via substring counting (handles word-boundary-free Japanese).
    let warm = 0, cool = 0;
    for (let i = 0; i < WARM_WORDS.length; i++) if (lower.indexOf(WARM_WORDS[i]) >= 0) warm++;
    for (let i = 0; i < COOL_WORDS.length; i++) if (lower.indexOf(COOL_WORDS[i]) >= 0) cool++;

    const sentences = (t.match(/[.!?。！？]+/g) || []).length;
    const commas = (t.match(/[,;、，；・]/g) || []).length;
    const questions = (t.match(/[?？]/g) || []).length;
    const exclaims = (t.match(/[!！]/g) || []).length;
    const uniqueChars = Object.keys(charSet).length;

    return {
      text: t,
      chars: chars,
      words: segments,                                   // 語/節の数（言語非依存）
      segments: segments,
      runs: runs,                                        // 文字種の切り替わり回数＝質感
      uniqueChars: uniqueChars,
      uniqueRatio: chars ? uniqueChars / chars : 0,      // 多様性
      avgWordLen: segments ? letters / segments : 0,
      vowelRatio: letters ? vowels / letters : 0.42,
      kanjiRatio: chars ? counts[3] / chars : 0,
      kanaRatio: chars ? (counts[1] + counts[2]) / chars : 0,
      sentences: sentences,
      commas: commas,
      questions: questions,
      exclaims: exclaims,
      // 感情の傾き [-1,1]。配色や花の開き方をそっと左右する。
      warmth: clamp((warm - cool) / Math.max(warm + cool, 3), -1, 1),
      hasText: chars > 0
    };
  }

  /* ---- DOM / misc helpers ------------------------------------------------- */
  function debounce(fn, ms) {
    let id; return function () {
      const args = arguments, ctx = this;
      clearTimeout(id); id = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    if (children) (Array.isArray(children) ? children : [children]).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  // Format a date nicely for the herbarium labels (Japanese).
  function formatDate(ts) {
    try {
      return new Date(ts).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch (e) { return ''; }
  }
  function relativeDay(ts) {
    const d = new Date(ts); const now = new Date();
    const day = 24 * 3600 * 1000;
    const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const diff = Math.round((b - a) / day);
    if (diff <= 0) return '今日';
    if (diff === 1) return '昨日';
    if (diff < 7) return diff + '日前';
    if (diff < 30) return Math.round(diff / 7) + '週間前';
    if (diff < 365) return Math.round(diff / 30) + 'か月前';
    return formatDate(ts);
  }

  root.Anthos = root.Anthos || {};
  root.Anthos.util = {
    cyrb53: cyrb53, mulberry32: mulberry32, Rng: Rng,
    clamp: clamp, lerp: lerp, map: map, smooth: smooth, ease: ease,
    hsl: hsl, hslToHex: hslToHex,
    analyze: analyze, debounce: debounce,
    $: $, $all: $all, el: el, formatDate: formatDate, relativeDay: relativeDay,
    TAU: Math.PI * 2
  };
})(window);
