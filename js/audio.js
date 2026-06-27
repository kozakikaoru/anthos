/* ============================================================================
 * Anthos · audio.js  —  optional generative ambience (静かな音の庭)
 * A soft evolving pad + sparse bell shimmers while you write, and a warm
 * chime when a bloom is pressed into the garden. All synthesised live; no files.
 * ========================================================================== */
(function (root) {
  'use strict';

  // A minor pentatonic, spanning a few octaves (Hz).
  const SCALE = [220.00, 261.63, 293.66, 329.63, 392.00,
                 440.00, 523.25, 587.33, 659.25, 783.99, 880.00];

  function Audio() {
    this.ctx = null;
    this.enabled = true;
    this.started = false;
    this.master = null;
    this.wet = null;
    this.padGain = null;
    this._timer = null;
    this._padOsc = [];
    this._root = 0;
  }

  Audio.prototype._ensure = function () {
    if (this.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      const ctx = new AC();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = 0.0;
      master.connect(ctx.destination);
      this.master = master;

      // Procedural reverb (a short, soft impulse response).
      const conv = ctx.createConvolver();
      conv.buffer = this._impulse(2.6, 2.4);
      const wet = ctx.createGain(); wet.gain.value = 0.32;
      conv.connect(wet); wet.connect(master);
      this.reverb = conv; this.wet = wet;

      // Pad bus.
      const padGain = ctx.createGain(); padGain.gain.value = 0.0;
      const padFilter = ctx.createBiquadFilter();
      padFilter.type = 'lowpass'; padFilter.frequency.value = 700; padFilter.Q.value = 0.6;
      padGain.connect(padFilter);
      padFilter.connect(master); padFilter.connect(conv);
      this.padGain = padGain; this.padFilter = padFilter;

      // Slow filter LFO for movement.
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
      const lfoGain = ctx.createGain(); lfoGain.gain.value = 260;
      lfo.connect(lfoGain); lfoGain.connect(padFilter.frequency); lfo.start();

      return true;
    } catch (e) { this.ctx = null; return false; }
  };

  Audio.prototype._impulse = function (dur, decay) {
    const ctx = this.ctx, rate = ctx.sampleRate, len = Math.floor(rate * dur);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        // deterministic-ish noise (no Math.random dependency for reproducibility)
        const r = Math.sin(i * (12.9898 + ch) ) * 43758.5453;
        const n = (r - Math.floor(r)) * 2 - 1;
        data[i] = n * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  };

  // Resume on a user gesture and (optionally) begin the pad.
  Audio.prototype.resume = function () {
    if (!this._ensure()) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
  };

  Audio.prototype.startAmbience = function () {
    if (!this.enabled || !this._ensure()) return;
    this.resume();
    if (this.started) return;
    this.started = true;
    const ctx = this.ctx, now = ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.5, now + 3);

    // Three detuned pad voices: root, fifth, octave.
    const base = [0, 4, 7];
    const self = this;
    base.forEach(function (deg, i) {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = SCALE[deg];
      o.detune.value = (i - 1) * 4;
      const g = ctx.createGain(); g.gain.value = 0.0;
      o.connect(g); g.connect(self.padGain);
      o.start();
      g.gain.linearRampToValueAtTime(i === 0 ? 0.16 : 0.09, now + 4);
      self._padOsc.push({ o: o, g: g, deg: deg });
    });
    this.padGain.gain.setValueAtTime(0.0001, now);
    this.padGain.gain.linearRampToValueAtTime(0.5, now + 4);

    // Sparse shimmer scheduler.
    this._timer = setInterval(function () { self._shimmer(); self._drift(); }, 4200);
  };

  Audio.prototype.stopAmbience = function () {
    if (!this.ctx || !this.started) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.0, now + 1.6);
    clearInterval(this._timer); this._timer = null;
    const oscs = this._padOsc; this._padOsc = [];
    setTimeout(function () { oscs.forEach(function (v) { try { v.o.stop(); } catch (e) {} }); }, 1800);
    this.started = false;
  };

  // Gently move the pad to a neighbouring chord now and then.
  Audio.prototype._drift = function () {
    if (!this._padOsc.length || Math.sin(this.ctx.currentTime * 0.13) < 0.4) return;
    const shift = [-2, 0, 2, 3][Math.floor((this.ctx.currentTime * 0.7) % 4)];
    const now = this.ctx.currentTime;
    this._padOsc.forEach(function (v) {
      const deg = Math.max(0, Math.min(SCALE.length - 1, v.deg + shift));
      v.o.frequency.linearRampToValueAtTime(SCALE[deg], now + 2.4);
    });
  };

  Audio.prototype._shimmer = function () {
    if (!this.started) return;
    const ctx = this.ctx, now = ctx.currentTime;
    if (Math.sin(now * 1.7) < 0.1) return; // skip some, keep it sparse
    const note = SCALE[4 + Math.floor((now * 3.3) % (SCALE.length - 4))];
    this._bell(note, now, 0.06, 2.6, (Math.sin(now) ));
  };

  Audio.prototype._bell = function (freq, when, peak, dur, pan) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2.01;
    const g = ctx.createGain(); g.gain.value = 0;
    const g2 = ctx.createGain(); g2.gain.value = 0;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { p.pan.value = Math.max(-1, Math.min(1, pan || 0)); o.connect(g); g.connect(p); o2.connect(g2); g2.connect(p); p.connect(this.master); p.connect(this.reverb); }
    else { o.connect(g); g.connect(this.master); g.connect(this.reverb); o2.connect(g2); g2.connect(this.master); }
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    g2.gain.setValueAtTime(0, when);
    g2.gain.linearRampToValueAtTime(peak * 0.4, when + 0.02);
    g2.gain.exponentialRampToValueAtTime(0.0001, when + dur * 0.6);
    o.start(when); o2.start(when);
    o.stop(when + dur + 0.1); o2.stop(when + dur + 0.1);
  };

  // A warm rising chime when a bloom is saved.
  Audio.prototype.bloom = function () {
    if (!this.enabled || !this._ensure()) return;
    this.resume();
    const ctx = this.ctx, now = ctx.currentTime;
    const notes = [SCALE[2], SCALE[4], SCALE[5], SCALE[7], SCALE[9]];
    const self = this;
    // ensure we can hear it even if ambience is off
    if (!this.started) { this.master.gain.cancelScheduledValues(now); this.master.gain.setValueAtTime(0.6, now); }
    notes.forEach(function (f, i) { self._bell(f, now + i * 0.14, 0.10, 2.8, (i / notes.length) * 2 - 1); });
    if (!this.started) { this.master.gain.setValueAtTime(0.6, now); this.master.gain.linearRampToValueAtTime(0.0, now + 4.2); }
  };

  // Tiny soft tick as the first stroke of a new entry (used very sparingly).
  Audio.prototype.seedTone = function () {
    if (!this.enabled || !this._ensure()) return;
    this.resume();
    const now = this.ctx.currentTime;
    if (!this.started) { this.master.gain.setValueAtTime(0.5, now); this.master.gain.linearRampToValueAtTime(0, now + 1.4); }
    this._bell(SCALE[3], now, 0.05, 1.2, 0);
  };

  Audio.prototype.setEnabled = function (on) {
    this.enabled = !!on;
    if (!on) this.stopAmbience();
  };

  root.Anthos.audio = new Audio();
})(window);
