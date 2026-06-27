/* ============================================================================
 * Anthos · audio.js  —  optional generative ambience (やわらかな音の庭)
 * A warm, consonant pad (major pentatonic, sine voices) with sparse, soft bell
 * shimmers, and a gentle chime when a bloom is pressed into the garden.
 * Designed to soothe, never to unsettle. All synthesised live; no files.
 * ========================================================================== */
(function (root) {
  'use strict';

  // C major pentatonic — no semitone clashes, no tritones: calm and stable (Hz).
  // C3  D3   E3    G3   A3   C4    D4    E4    G4   A4    C5
  const SCALE = [130.81, 146.83, 164.81, 196.00, 220.00,
                 261.63, 293.66, 329.63, 392.00, 440.00, 523.25];

  function Audio() {
    this.ctx = null;
    this.enabled = true;
    this.started = false;
    this.master = null;
    this.wet = null;
    this.padGain = null;
    this.padFilter = null;
    this.reverb = null;
    this._timer = null;
    this._padOsc = [];
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

      // Soft procedural reverb (gentle, short tail).
      const conv = ctx.createConvolver();
      conv.buffer = this._impulse(2.4, 3.0);
      const wet = ctx.createGain(); wet.gain.value = 0.26;
      conv.connect(wet); wet.connect(master);
      this.reverb = conv; this.wet = wet;

      // Pad bus — warm, dark, rounded.
      const padGain = ctx.createGain(); padGain.gain.value = 0.0;
      const padFilter = ctx.createBiquadFilter();
      padFilter.type = 'lowpass'; padFilter.frequency.value = 480; padFilter.Q.value = 0.4;
      padGain.connect(padFilter);
      padFilter.connect(master); padFilter.connect(conv);
      this.padGain = padGain; this.padFilter = padFilter;

      // Very slow, shallow filter breathing — life without anxiety.
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.035;
      const lfoGain = ctx.createGain(); lfoGain.gain.value = 120;
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
        const r = Math.sin(i * (12.9898 + ch)) * 43758.5453;
        const n = (r - Math.floor(r)) * 2 - 1;
        data[i] = n * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  };

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
    this.master.gain.linearRampToValueAtTime(0.34, now + 5);   // gentle, low

    // A warm open major chord: root, fifth, major-third-up-an-octave. Sine only.
    const chord = [0, 3, 7];   // C3, G3, E4
    const self = this;
    chord.forEach(function (deg, i) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = SCALE[deg];
      o.detune.value = (i - 1) * 3;                 // micro-detune for warmth
      const g = ctx.createGain(); g.gain.value = 0.0;
      o.connect(g); g.connect(self.padGain);
      o.start();
      g.gain.linearRampToValueAtTime(i === 0 ? 0.18 : 0.11, now + 6);
      self._padOsc.push({ o: o, g: g, deg: deg });
    });
    this.padGain.gain.setValueAtTime(0.0001, now);
    this.padGain.gain.linearRampToValueAtTime(0.5, now + 6);

    // Sparse, soft shimmers — gentle and infrequent.
    this._timer = setInterval(function () { self._shimmer(); }, 9000);
  };

  Audio.prototype.stopAmbience = function () {
    if (!this.ctx || !this.started) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.0, now + 2.2);
    clearInterval(this._timer); this._timer = null;
    const oscs = this._padOsc; this._padOsc = [];
    setTimeout(function () { oscs.forEach(function (v) { try { v.o.stop(); } catch (e) {} }); }, 2400);
    this.started = false;
  };

  Audio.prototype._shimmer = function () {
    if (!this.started) return;
    const ctx = this.ctx, now = ctx.currentTime;
    if (Math.sin(now * 1.3) < 0.15) return;          // skip many — keep it rare
    const note = SCALE[5 + Math.floor((now * 2.7) % 4)]; // C4..G4, mid register
    this._bell(note, now, 0.05, 3.4, Math.sin(now * 0.7) * 0.6);
  };

  // A soft sine bell: fundamental + a quiet octave for warmth (no metallic detune).
  Audio.prototype._bell = function (freq, when, peak, dur, pan) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2;
    const g = ctx.createGain(); g.gain.value = 0;
    const g2 = ctx.createGain(); g2.gain.value = 0;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) {
      p.pan.value = Math.max(-1, Math.min(1, pan || 0));
      o.connect(g); g.connect(p); o2.connect(g2); g2.connect(p);
      p.connect(this.master); p.connect(this.reverb);
    } else {
      o.connect(g); g.connect(this.master); g.connect(this.reverb);
      o2.connect(g2); g2.connect(this.master);
    }
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + 0.06);          // soft attack
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    g2.gain.setValueAtTime(0, when);
    g2.gain.linearRampToValueAtTime(peak * 0.18, when + 0.06);  // quiet octave
    g2.gain.exponentialRampToValueAtTime(0.0001, when + dur * 0.55);
    o.start(when); o2.start(when);
    o.stop(when + dur + 0.1); o2.stop(when + dur + 0.1);
  };

  // A warm, gentle rising chime when a bloom is saved (major pentatonic).
  Audio.prototype.bloom = function () {
    if (!this.enabled || !this._ensure()) return;
    this.resume();
    const ctx = this.ctx, now = ctx.currentTime;
    const notes = [SCALE[5], SCALE[6], SCALE[7], SCALE[9]]; // C4 D4 E4 A4
    const self = this;
    if (!this.started) { this.master.gain.cancelScheduledValues(now); this.master.gain.setValueAtTime(0.4, now); }
    notes.forEach(function (f, i) { self._bell(f, now + i * 0.2, 0.085, 3.6, (i / notes.length) * 1.2 - 0.6); });
    if (!this.started) { this.master.gain.setValueAtTime(0.4, now); this.master.gain.linearRampToValueAtTime(0.0, now + 5.0); }
  };

  Audio.prototype.seedTone = function () {
    if (!this.enabled || !this._ensure()) return;
    this.resume();
    const now = this.ctx.currentTime;
    if (!this.started) { this.master.gain.setValueAtTime(0.34, now); this.master.gain.linearRampToValueAtTime(0, now + 1.6); }
    this._bell(SCALE[5], now, 0.045, 1.6, 0);
  };

  Audio.prototype.setEnabled = function (on) {
    this.enabled = !!on;
    if (!on) this.stopAmbience();
  };

  root.Anthos.audio = new Audio();
})(window);
