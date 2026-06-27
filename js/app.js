/* ============================================================================
 * Anthos · app.js  —  the application (言葉 → 花 → 庭)
 * View routing, the live "type-to-bloom" stage, the garden, the detail plate,
 * PNG export, settings, and all the wiring between them.
 * ========================================================================== */
(function (root) {
  'use strict';
  const A = root.Anthos;
  const U = A.util, Flower = A.Flower, store = A.store, audio = A.audio;
  const $ = U.$, el = U.el;
  const now = function () { return (root.performance && performance.now) ? performance.now() : Date.now(); };

  /* ---- poetic naming ------------------------------------------------------ */
  const NAME_PRE = ['しずか', 'あけぼの', 'ゆうぐれ', 'ほしあかり', 'あまやどり', 'こもれび', 'まよなか',
    'はつなつ', 'ゆきげ', 'かぜまち', 'とおあさ', 'みなも', 'よあけ', 'つきしろ', 'あさつゆ', 'とおいひ',
    'こころ', 'しののめ', 'たそがれ', 'なごり', 'はるさめ', 'よいやみ', 'はるかぜ', 'なつぐも', 'あきあかね',
    'ふゆめき', 'よなが', 'やまびこ', 'つゆあけ', 'こはる', 'ゆうなぎ', 'あさぼらけ', 'つきよ', 'とこなつ',
    'みかづき', 'しじま', 'あおぞら', 'きりさめ', 'ゆきあかり', 'しおさい'];
  const NAME_CORE = ['ともしび', 'うた', 'ためいき', 'まなざし', 'こだま', 'さざなみ', 'ねむり', 'きおく',
    'よろこび', 'しらべ', 'ひかり', 'あゆみ', 'むすび', 'とばり', 'はなびら', 'しるべ', 'つぶやき',
    'まどろみ', 'せせらぎ', 'ひだまり', 'なみだ', 'こもりうた', 'おもかげ', 'ことのは', 'いのり', 'めぐり',
    'ぬくもり', 'しずく', 'ひととき', 'かけら', 'つどい', 'はぐくみ', 'やすらぎ', 'あこがれ', 'まぼろし',
    'ひびき', 'いとなみ', 'たより', 'なぐさめ', 'はじまり'];
  const FLOWER_WORDS = ['しずかに、ここにいる', '遠くの灯をおもう', 'よく咲きました', 'ほどけてゆく',
    '明日へ、つづく', '名もなき日のために', 'そっと、つよく', 'うつろいを愛でる', 'ことばは枯れない',
    'またここで会いましょう', 'いまを、のこす', 'まだ見ぬ朝へ'];
  const LAT_GENUS = ['Anthos', 'Verba', 'Lumina', 'Florula', 'Memora', 'Silenta', 'Caelia', 'Animae'];
  const LAT_SYL = ['ver', 'lu', 'mi', 'na', 'co', 're', 'si', 'le', 'to', 'ra', 'an', 'os', 'ia', 'en', 'sol', 'mu', 'ne', 'va'];

  function nameFor(flower) {
    const r = U.Rng(flower.seed ^ 0x9e3779b9);
    return r.pick(NAME_PRE) + 'の' + r.pick(NAME_CORE);
  }
  function latinFor(flower) {
    const r = U.Rng((flower.seed >>> 3) ^ 0x51ed270b);
    let sp = '';
    const n = r.int(2, 3);
    for (let i = 0; i < n; i++) sp += r.pick(LAT_SYL);
    sp += r.pick(['a', 'um', 'is', 'ae']);
    return r.pick(LAT_GENUS) + ' ' + sp;
  }
  function flowerWordFor(flower) {
    return U.Rng(flower.seed ^ 0x2545f491).pick(FLOWER_WORDS);
  }

  /* ---- prompts ------------------------------------------------------------ */
  // 短く、答えやすい日記の問い。
  const PROMPTS = [
    'きょうのこと',
    'いま、思っていること',
    '心に残ったこと',
    'すきだと感じたもの',
    '小さな発見',
    '今日の気分は？',
    'ありがとうを、ひとつ',
    'そっと手放したいこと',
    '明日への、ひとこと',
    '今日を色にすると？'
  ];
  let promptIdx = (new Date()).getDate() % PROMPTS.length;

  /* ---- canvas helpers ----------------------------------------------------- */
  function fit(canvas) {
    const dpr = Math.min(root.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h, ctx: ctx };
  }

  /* ---- BloomStage: an animated, living flower on a canvas ----------------- */
  function BloomStage(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.idle = opts.idle !== false;       // sway after growth
    this.flower = new Flower('');
    this.prev = null; this.fade = 1; this.fadeDur = 0.7;
    this.growth = opts.growth == null ? 0 : opts.growth;
    this.growthTarget = this.growth;
    this.last = now(); this.t0 = now();
    this.raf = null; this.running = false;
    this.dims = fit(canvas);
  }
  BloomStage.prototype.resize = function () { this.dims = fit(this.canvas); if (!this.running) this.render(now()); };
  BloomStage.prototype.setFlower = function (flower, opts) {
    opts = opts || {};
    if (this.flower && this.flower.text === flower.text && !opts.force) return;
    if (!app.reduceMotion && this.flower) { this.prev = this.flower; this.fade = 0; }
    this.flower = flower;
    if (opts.growth != null) this.growthTarget = opts.growth;
    if (!this.running) this.render(now());
  };
  BloomStage.prototype.setGrowth = function (g, instant) {
    this.growthTarget = U.clamp(g, 0, 1);
    if (instant || app.reduceMotion) { this.growth = this.growthTarget; if (!this.running) this.render(now()); }
  };
  BloomStage.prototype.play = function () {
    if (this.running) return;
    this.running = true; this.last = now();
    const self = this;
    const loop = function (ts) { if (!self.running) return; self.frame(ts); self.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  };
  BloomStage.prototype.stop = function () { this.running = false; if (this.raf) cancelAnimationFrame(this.raf); this.raf = null; };
  BloomStage.prototype.frame = function (ts) {
    const dt = Math.min(0.06, (ts - this.last) / 1000); this.last = ts;
    const k = 1 - Math.exp(-dt / 0.55);
    this.growth += (this.growthTarget - this.growth) * k;
    if (this.fade < 1) this.fade = Math.min(1, this.fade + dt / this.fadeDur);
    else this.prev = null;
    this.render(ts);
  };
  BloomStage.prototype.render = function (ts) {
    const d = this.dims, ctx = d.ctx;
    ctx.clearRect(0, 0, d.w, d.h);
    const t = this.idle ? (ts - this.t0) : 0;
    const o = { w: d.w, h: d.h, t: t, growth: this.growth, sway: app.reduceMotion ? 0 : 1 };
    if (this.prev && this.fade < 1) {
      ctx.save(); ctx.globalAlpha = 1 - this.fade; this.prev.draw(ctx, o); ctx.restore();
      ctx.save(); ctx.globalAlpha = this.fade; this.flower.draw(ctx, o); ctx.restore();
    } else {
      this.flower.draw(ctx, o);
    }
  };

  /* ========================================================================
   * App
   * ===================================================================== */
  const app = {
    view: 'compose',
    reduceMotion: false,
    stages: {},
    scene: null,
    _focusNew: false,
    composeFlower: null,
    detailId: null
  };

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._id); toast._id = setTimeout(function () { t.hidden = true; }, 2600);
  }

  /* ---- view routing ------------------------------------------------------- */
  function show(view) {
    app.view = view;
    ['compose', 'garden', 'detail'].forEach(function (v) {
      const sec = $('#view-' + v);
      if (v === view) {
        sec.hidden = false;
        sec.classList.remove('is-entering'); void sec.offsetWidth; sec.classList.add('is-entering');
      } else sec.hidden = true;
    });
    U.$all('.nav__item').forEach(function (n) { n.classList.toggle('is-active', n.dataset.nav === view); });

    // run only the active stage / scene
    if (app.stages.compose) (view === 'compose' ? app.stages.compose.play() : app.stages.compose.stop());
    if (app.stages.detail) (view === 'detail' ? app.stages.detail.play() : app.stages.detail.stop());
    if (app.scene && view !== 'garden') app.scene.stop();

    if (view === 'garden') enterGarden();
    else $('#gardenList').hidden = true;
    if (view === 'compose') { app.stages.compose.resize(); $('#entry').focus({ preventScroll: true }); }
    if (view !== 'garden') root.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---- COMPOSE ------------------------------------------------------------ */
  function growthForText(text) {
    const n = text.trim().length;
    if (n === 0) return 0.12;
    return U.clamp(U.map(Math.sqrt(n), 0, 9, 0.28, 1), 0.22, 1);
  }
  function growthLabel(text) {
    const n = text.trim().length;
    if (n === 0) return 'まだ、つぼみ';
    if (n < 12) return 'めばえ';
    if (n < 40) return 'ほころぶ';
    if (n < 90) return 'ひらく';
    return '満開';
  }

  const refreshBloom = U.debounce(function () {
    const text = $('#entry').value;
    const f = new Flower(text);
    app.composeFlower = f;
    app.stages.compose.setFlower(f, { growth: growthForText(text) });
    const nameEl = $('#composeName');
    if (text.trim().length >= 2) {
      nameEl.innerHTML = nameFor(f) + '<small>' + latinFor(f) + '</small>';
      nameEl.classList.add('show');
    } else { nameEl.classList.remove('show'); }
  }, 280);

  function onInput() {
    const text = $('#entry').value;
    $('#charcount').textContent = text.trim().length + ' 字';
    $('#growthHint').textContent = growthLabel(text);
    $('#saveBtn').disabled = text.trim().length < 2;
    app.stages.compose.setGrowth(growthForText(text));
    refreshBloom();
  }

  function setPrompt(i) {
    promptIdx = (i + PROMPTS.length) % PROMPTS.length;
    const p = $('#prompt');
    p.style.opacity = 0;
    setTimeout(function () { p.textContent = PROMPTS[promptIdx]; p.style.opacity = 1; }, 220);
  }

  function saveEntry() {
    const text = $('#entry').value.trim();
    if (text.length < 2) return;
    const flower = new Flower(text);
    store.add(text);
    if (app.scene) app.scene.setEntries(store.all());
    audio.bloom();
    ceremony(flower);
    // reset compose
    $('#entry').value = '';
    onInput();
  }

  /* ---- CEREMONY (保存演出) ------------------------------------------------- */
  let ceremonyStage = null;
  function ceremony(flower) {
    const ov = $('#ceremony'); ov.hidden = false;
    $('#ceremonyName').textContent = nameFor(flower);
    const cv = $('#ceremonyCanvas');
    if (!ceremonyStage) ceremonyStage = new BloomStage(cv, { idle: true, growth: 0.45 });
    ceremonyStage.resize();
    ceremonyStage.flower = flower; ceremonyStage.prev = null; ceremonyStage.fade = 1;
    ceremonyStage.growth = 0.4; ceremonyStage.setGrowth(1);
    ceremonyStage.play();
  }
  function closeCeremony() { $('#ceremony').hidden = true; if (ceremonyStage) ceremonyStage.stop(); }

  /* ---- GARDEN ------------------------------------------------------------- */
  function renderStats() {
    const s = store.stats();
    const wrap = $('#stats');
    const items = [
      [s.count, '咲いた花'],
      [s.streak, '連続日数'],
      [s.days, '綴った日'],
      [s.totalChars.toLocaleString(), '紡いだ字']
    ];
    wrap.innerHTML = '';
    items.forEach(function (it) {
      wrap.appendChild(el('div', { class: 'stat' }, [
        el('div', { class: 'stat__num', text: String(it[0]) }),
        el('div', { class: 'stat__label', text: it[1] })
      ]));
    });
  }

  function ensureScene() {
    if (app.scene) return app.scene;
    const sc = new A.GardenScene($('#gardenCanvas'));
    sc.reduce = app.reduceMotion;
    sc.onPick = function (id) { openDetail(id); };
    app.scene = sc;
    return sc;
  }

  // Enter the spatial garden: (re)build the scene, fit the view, optionally
  // animate-plant the newest bloom.
  function enterGarden() {
    renderStats();
    const all = store.all();
    const sc = ensureScene();
    sc.reduce = app.reduceMotion;
    $('#gardenEmpty').hidden = all.length > 0;
    $('#gardenList').hidden = true;
    const focusNew = app._focusNew; app._focusNew = false;
    sc.resize();
    sc.setEntries(all);
    sc.fit(true);
    if (focusNew && all.length) sc.plantNewest();
    sc.start();
    // Re-measure once the section's layout has fully settled (un-hide can report
    // a transitional size). setTimeout fires regardless of paint timing.
    const refit = function () { sc.resize(); if (!focusNew) sc.fit(true); };
    requestAnimationFrame(refit);
    setTimeout(refit, 90);
    const hint = $('#gardenHint');
    if (hint && all.length) {
      hint.classList.remove('hide');
      clearTimeout(enterGarden._h); enterGarden._h = setTimeout(function () { hint.classList.add('hide'); }, 4600);
    } else if (hint) hint.classList.add('hide');
  }

  // The "図鑑" mode — the herbarium grid of every bloom.
  function renderGardenList() {
    const grid = $('#gardenGrid');
    const all = store.all();
    grid.innerHTML = '';
    all.forEach(function (entry, i) {
      const canvas = el('canvas', { class: 'specimen__canvas' });
      const card = el('div', { class: 'specimen' + (entry.fav ? ' is-fav' : '') }, [
        el('span', { class: 'specimen__no', text: 'No.' + String(all.length - i).padStart(3, '0') }),
        el('span', { class: 'specimen__fav', html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 21s-7.5-4.6-10-9.2C.2 8.3 1.9 5 5.2 5c2 0 3.3 1.1 4 2.2C9.8 6.1 11.2 5 13.2 5c3.3 0 5 3.3 3.2 6.8C16 16.4 12 21 12 21z"/></svg>' }),
        canvas,
        el('div', { class: 'specimen__label' }, [
          el('div', { class: 'specimen__name', text: nameFor(new Flower(entry.text)) }),
          el('div', { class: 'specimen__date', text: U.relativeDay(entry.ts) })
        ])
      ]);
      card.style.animationDelay = Math.min(i * 40, 500) + 'ms';
      card.addEventListener('click', function () { openDetail(entry.id); });
      grid.appendChild(card);
      requestAnimationFrame(function () {
        const d = fit(canvas);
        const f = new Flower(entry.text);
        f.draw(d.ctx, { w: d.w, h: d.h, t: (entry.seed % 700) / 100, growth: 1, sway: 0, glow: !app.reduceMotion });
      });
    });
  }

  /* ---- DETAIL ------------------------------------------------------------- */
  function openDetail(id) {
    const entry = store.get(id);
    if (!entry) return;
    app.detailId = id;
    const flower = new Flower(entry.text);
    const host = $('#detail');
    host.innerHTML = '';

    const stage = el('div', { class: 'detail__stage' }, [el('canvas', { id: 'detailCanvas' })]);
    const panel = el('div', { class: 'detail__panel' }, [
      el('button', { class: 'detail__back', html: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 5l-7 7 7 7" stroke-linecap="round" stroke-linejoin="round"/></svg> 庭へもどる', onclick: function () { show('garden'); } }),
      el('p', { class: 'overline', text: U.formatDate(entry.ts) }),
      el('h1', { class: 'detail__name', text: nameFor(flower) }),
      el('p', { class: 'detail__latin', text: latinFor(flower) + ' · 「' + flowerWordFor(flower) + '」' }),
      el('p', { class: 'detail__text', text: entry.text }),
      el('div', { class: 'detail__meta' }, [
        el('div', { html: '<b>' + entry.chars + '</b>字' }),
        el('div', { html: '<b>' + (entry.words || '–') + '</b>のことば' }),
        el('div', { html: '<b>' + U.relativeDay(entry.ts) + '</b>の記録' })
      ]),
      el('div', { class: 'detail__actions' }, [
        el('button', { class: 'ghost', id: 'favBtn', text: entry.fav ? '★ お気に入り' : '☆ お気に入り', onclick: function () {
          const e = store.toggleFav(id); $('#favBtn').textContent = e.fav ? '★ お気に入り' : '☆ お気に入り'; toast(e.fav ? 'お気に入りに加えました' : 'お気に入りを外しました');
        } }),
        el('button', { class: 'ghost', text: '画像として保存', onclick: function () { exportPNG(entry); } }),
        el('button', { class: 'ghost danger', text: '摘む（削除）', onclick: function () {
          if (confirm('この一輪を庭から摘みますか？（取り消せません）')) { store.remove(id); toast('庭から摘みました'); show('garden'); }
        } })
      ])
    ]);
    host.appendChild(stage); host.appendChild(panel);

    if (app.stages.detail) app.stages.detail.stop();
    const canvas = $('#detailCanvas');
    const st = new BloomStage(canvas, { idle: true, growth: 0.0 });
    st.flower = flower;
    app.stages.detail = st;
    show('detail');
    st.resize(); st.setGrowth(1); st.play();
  }

  /* ---- PNG export --------------------------------------------------------- */
  function exportPNG(entry) {
    const W = 1200, H = 1500;
    const canvas = $('#exportCanvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const flower = new Flower(entry.text);

    function paint() {
      const dark = document.body.dataset.theme === 'nocturne';
      const bg = dark ? '#16171c' : '#f4eee2';
      const ink = dark ? '#ece6d8' : '#2b2620';
      const soft = dark ? '#a39c8c' : '#6f665a';
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      // grain-free soft wash
      const g = ctx.createRadialGradient(W * 0.2, -100, 100, W * 0.5, H * 0.4, H);
      g.addColorStop(0, (dark ? 'rgba(143,174,120,.12)' : 'rgba(94,122,79,.10)'));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // frame
      ctx.strokeStyle = dark ? 'rgba(236,230,216,.18)' : 'rgba(43,38,32,.22)';
      ctx.lineWidth = 2; ctx.strokeRect(60, 60, W - 120, H - 120);
      ctx.strokeStyle = dark ? 'rgba(236,230,216,.10)' : 'rgba(43,38,32,.10)';
      ctx.strokeRect(74, 74, W - 148, H - 148);
      // flower
      flower.draw(ctx, { w: W, h: H * 0.86, t: (entry.seed % 700) / 100, growth: 1, sway: 0, glow: !dark });
      // caption
      ctx.textAlign = 'center';
      ctx.fillStyle = ink;
      ctx.font = '500 58px "Zen Old Mincho", serif';
      ctx.fillText(nameFor(flower), W / 2, H - 230);
      ctx.fillStyle = soft;
      ctx.font = 'italic 30px "Fraunces", serif';
      ctx.fillText(latinFor(flower), W / 2, H - 184);
      ctx.font = '400 28px "Zen Kaku Gothic New", sans-serif';
      ctx.fillText(U.formatDate(entry.ts) + '　·　' + entry.chars + ' 字', W / 2, H - 138);
      // mark
      ctx.fillStyle = soft; ctx.font = 'italic 26px "Fraunces", serif';
      ctx.fillText('Anthos', W / 2, H - 96);

      canvas.toBlob(function (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'anthos-' + nameFor(flower).replace(/[^\wぁ-んァ-ヶ一-龠]/g, '') + '.png';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        toast('画像を書き出しました');
      }, 'image/png');
    }
    if (root.document.fonts && document.fonts.ready) document.fonts.ready.then(paint).catch(paint);
    else paint();
  }

  /* ---- settings ----------------------------------------------------------- */
  function applyTheme(theme) {
    document.body.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'nocturne' ? '#15161b' : '#f4eee2');
    U.$all('#themeSeg .seg__btn').forEach(function (b) { b.classList.toggle('is-active', b.dataset.theme === theme); });
  }
  function applyMotion(reduce) {
    app.reduceMotion = !!reduce;
    document.body.classList.toggle('reduce-motion', app.reduceMotion);
    $('#motionToggle').setAttribute('aria-checked', reduce ? 'true' : 'false');
    if (app.scene) app.scene.reduce = app.reduceMotion;
  }
  function setHeaderH() {
    const tb = $('#topbar');
    if (tb) document.documentElement.style.setProperty('--header-h', tb.offsetHeight + 'px');
  }
  function openSettings() { $('#settings').hidden = false; }
  function closeSettings() { $('#settings').hidden = true; }

  /* ---- boot --------------------------------------------------------------- */
  function boot() {
    const s = store.settings();
    applyTheme(s.theme || 'paper');
    applyMotion(s.reduceMotion);
    audio.setEnabled(s.sound !== false);
    $('#soundToggle').setAttribute('aria-checked', s.sound !== false ? 'true' : 'false');

    // today + prompt
    try { $('#todayLabel').textContent = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }); } catch (e) {}
    $('#prompt').textContent = PROMPTS[promptIdx];
    $('#prompt').style.transition = 'opacity .3s ease';

    // compose stage
    app.stages.compose = new BloomStage($('#composeCanvas'), { idle: true, growth: 0.12 });
    app.composeFlower = app.stages.compose.flower;

    // events: compose
    $('#entry').addEventListener('input', onInput);
    $('#saveBtn').addEventListener('click', saveEntry);
    $('#newPrompt').addEventListener('click', function () { setPrompt(promptIdx + 1); });
    $('#entry').addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); saveEntry(); }
    });

    // nav
    U.$all('[data-nav]').forEach(function (b) {
      b.addEventListener('click', function () { audio.resume(); show(b.dataset.nav); });
    });

    // garden controls
    $('#fitBtn').addEventListener('click', function () { app.scene && app.scene.fit(); });
    $('#zoomInBtn').addEventListener('click', function () { app.scene && app.scene.zoomBy(1.45); });
    $('#zoomOutBtn').addEventListener('click', function () { app.scene && app.scene.zoomBy(1 / 1.45); });
    $('#listToggle').addEventListener('click', function () { renderGardenList(); $('#gardenList').hidden = false; });
    $('#listClose').addEventListener('click', function () { $('#gardenList').hidden = true; });
    setHeaderH();

    // settings wiring
    $('#menuBtn').addEventListener('click', openSettings);
    $('#closeSettings').addEventListener('click', closeSettings);
    U.$all('#themeSeg .seg__btn').forEach(function (b) {
      b.addEventListener('click', function () { applyTheme(b.dataset.theme); store.setSetting('theme', b.dataset.theme); });
    });
    $('#soundToggle').addEventListener('click', function () {
      const on = this.getAttribute('aria-checked') !== 'true';
      this.setAttribute('aria-checked', on ? 'true' : 'false');
      store.setSetting('sound', on); audio.setEnabled(on);
      if (on) { audio.resume(); audio.startAmbience(); }
    });
    $('#motionToggle').addEventListener('click', function () {
      const on = this.getAttribute('aria-checked') !== 'true';
      applyMotion(on); store.setSetting('reduceMotion', on);
      if (!on) { Object.keys(app.stages).forEach(function (k) { if (app.stages[k]) app.stages[k].play && (app.view === k && app.stages[k].play()); }); }
    });

    // export / import / clear
    $('#exportBtn').addEventListener('click', function () {
      const blob = new Blob([store.exportData()], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = 'anthos-garden-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      toast('庭を書き出しました');
    });
    $('#importBtn').addEventListener('click', function () { $('#importFile').click(); });
    $('#importFile').addEventListener('change', function (e) {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        const res = store.importData(reader.result, 'merge');
        if (res.ok) { toast(res.count + ' 件を読み込みました'); if (app.view === 'garden') renderGarden(); }
        else toast(res.error || '読み込みに失敗しました');
      };
      reader.readAsText(file); e.target.value = '';
    });
    $('#clearBtn').addEventListener('click', function () {
      if (confirm('庭のすべての花を消しますか？この操作は取り消せません。')) {
        store.clearAll(); toast('庭を更地にしました'); closeSettings(); if (app.view === 'garden') renderGarden();
      }
    });

    // ceremony buttons
    $('#ceremonyContinue').addEventListener('click', function () { closeCeremony(); show('compose'); });
    $('#ceremonyGarden').addEventListener('click', function () { closeCeremony(); app._focusNew = true; show('garden'); });

    // global keys
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!$('#settings').hidden) closeSettings();
        else if (!$('#ceremony').hidden) closeCeremony();
        else if (!$('#onboarding').hidden) startApp();
        else if (app.view === 'detail') show('garden');
      }
    });
    // click-outside to close overlays
    [['#settings', closeSettings], ['#ceremony', closeCeremony]].forEach(function (p) {
      $(p[0]).addEventListener('click', function (e) { if (e.target === this) p[1](); });
    });

    // resize / visibility
    let rT; root.addEventListener('resize', function () {
      setHeaderH();
      clearTimeout(rT); rT = setTimeout(function () {
        if (app.stages.compose) app.stages.compose.resize();
        if (app.stages.detail && app.view === 'detail') app.stages.detail.resize();
        if (app.scene && app.view === 'garden') app.scene.resize();
      }, 160);
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        Object.keys(app.stages).forEach(function (k) { app.stages[k] && app.stages[k].stop(); });
        if (app.scene) app.scene.stop();
        audio.stopAmbience();
      } else {
        if (app.view === 'garden' && app.scene) app.scene.start();
        else if (app.stages[app.view] && app.stages[app.view].play && !app.reduceMotion) app.stages[app.view].play();
        if (store.settings().sound !== false) audio.startAmbience();
      }
    });

    onInput();
    app.stages.compose.play();

    // onboarding or straight in
    if (!s.onboarded) showOnboarding();
    else show('compose');
  }

  /* ---- onboarding --------------------------------------------------------- */
  let onboardStage = null;
  function showOnboarding() {
    const ov = $('#onboarding'); ov.hidden = false;
    const f = new Flower('あたらしい朝、ひかりが窓にとどいて、今日がはじまる。');
    const cv = $('#onboardCanvas');
    onboardStage = new BloomStage(cv, { idle: true, growth: 0.0 });
    onboardStage.flower = f; onboardStage.resize(); onboardStage.setGrowth(1); onboardStage.play();
  }
  function startApp() {
    $('#onboarding').hidden = true;
    if (onboardStage) onboardStage.stop();
    store.setSetting('onboarded', true);
    audio.resume();
    if (store.settings().sound !== false) audio.startAmbience();
    show('compose');
  }

  /* ---- go ----------------------------------------------------------------- */
  function init() {
    boot();
    $('#startBtn').addEventListener('click', startApp);
    // resume audio + ambience on first meaningful interaction
    const once = function () {
      audio.resume();
      if (store.settings().sound !== false && $('#onboarding').hidden) audio.startAmbience();
      document.removeEventListener('pointerdown', once);
    };
    document.addEventListener('pointerdown', once);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  root.Anthos.app = app;
})(window);
