/* ============================================================================
 * Anthos · store.js  —  local-first persistence (あなたのデータは端末の中だけ)
 * Entries + settings live in localStorage. A flower is derived from its text,
 * so we store only the words, the moment, and a little metadata.
 * ========================================================================== */
(function (root) {
  'use strict';
  const U = root.Anthos.util;
  const KEY = 'anthos.entries.v1';
  const SKEY = 'anthos.settings.v1';
  const DAY = 86400000;

  function read(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }

  let entries = read(KEY, []);
  if (!Array.isArray(entries)) entries = [];

  const defaultSettings = { theme: 'paper', sound: true, reduceMotion: false, onboarded: false };
  let settings = Object.assign({}, defaultSettings, read(SKEY, {}));

  function persist() { write(KEY, entries); }
  function persistSettings() { write(SKEY, settings); }

  function uid() {
    return 'e' + (entries.reduce(function (m, e) { return Math.max(m, e.n || 0); }, 0) + 1)
      + '-' + (U.cyrb53(String(entries.length) + ':' + (entries[0] && entries[0].ts || 0)) % 100000);
  }

  const Store = {
    all: function () { return entries.slice(); },
    count: function () { return entries.length; },
    get: function (id) { for (let i = 0; i < entries.length; i++) if (entries[i].id === id) return entries[i]; return null; },

    add: function (text, ts) {
      const t = (text || '').trim();
      const f = U.analyze(t);
      const seed = U.cyrb53(t || '·') >>> 0;
      const flower = new root.Anthos.Flower(t);
      const entry = {
        id: uid(),
        n: entries.reduce(function (m, e) { return Math.max(m, e.n || 0); }, 0) + 1,
        text: t,
        ts: ts || Date.now(),
        seed: seed,
        color: flower.color(),
        shape: flower.dna.shape,
        chars: f.chars,
        words: f.words,
        fav: false
      };
      entries.unshift(entry);
      persist();
      return entry;
    },

    update: function (id, patch) {
      const e = this.get(id);
      if (!e) return null;
      Object.assign(e, patch);
      persist();
      return e;
    },

    remove: function (id) {
      const before = entries.length;
      entries = entries.filter(function (e) { return e.id !== id; });
      if (entries.length !== before) persist();
      return entries.length !== before;
    },

    toggleFav: function (id) {
      const e = this.get(id);
      if (e) { e.fav = !e.fav; persist(); }
      return e;
    },

    /* ---- statistics ---- */
    stats: function () {
      const n = entries.length;
      const totalChars = entries.reduce(function (s, e) { return s + (e.chars || 0); }, 0);
      const totalWords = entries.reduce(function (s, e) { return s + (e.words || 0); }, 0);
      // unique calendar days
      const dayset = {};
      let first = Infinity;
      entries.forEach(function (e) {
        const d = new Date(e.ts);
        dayset[new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()] = 1;
        if (e.ts < first) first = e.ts;
      });
      const days = Object.keys(dayset).map(Number).sort(function (a, b) { return b - a; });
      // streak ending today or yesterday
      let streak = 0;
      if (days.length) {
        const today = new Date(); const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
        if (days[0] === t0 || days[0] === t0 - DAY) {
          streak = 1;
          for (let i = 1; i < days.length; i++) {
            if (days[i] === days[i - 1] - DAY) streak++;
            else break;
          }
        }
      }
      return {
        count: n,
        totalChars: totalChars,
        totalWords: totalWords,
        days: days.length,
        streak: streak,
        firstTs: isFinite(first) ? first : null,
        favs: entries.filter(function (e) { return e.fav; }).length
      };
    },

    /* ---- settings ---- */
    settings: function () { return settings; },
    setSetting: function (k, v) { settings[k] = v; persistSettings(); return settings; },

    /* ---- backup ---- */
    exportData: function () {
      return JSON.stringify({ app: 'anthos', version: 1, exportedAt: Date.now(), settings: settings, entries: entries }, null, 2);
    },
    importData: function (json, mode) {
      let data;
      try { data = JSON.parse(json); } catch (e) { return { ok: false, error: '読み込めるデータではありませんでした' }; }
      if (!data || !Array.isArray(data.entries)) return { ok: false, error: '形式が正しくありません' };
      const incoming = data.entries.filter(function (e) { return e && typeof e.text === 'string'; });
      if (mode === 'replace') entries = incoming.slice();
      else {
        const seen = {};
        entries.forEach(function (e) { seen[e.id] = 1; });
        incoming.forEach(function (e) { if (!seen[e.id]) entries.push(e); });
      }
      entries.sort(function (a, b) { return b.ts - a.ts; });
      if (data.settings) settings = Object.assign({}, defaultSettings, data.settings);
      persist(); persistSettings();
      return { ok: true, count: incoming.length };
    },

    clearAll: function () { entries = []; persist(); }
  };

  root.Anthos.store = Store;
})(window);
