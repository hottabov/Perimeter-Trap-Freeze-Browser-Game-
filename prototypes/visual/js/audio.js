// Procedural sound: every effect is synthesized with Web Audio, tuned per theme.
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Sfx {
  constructor() {
    this.ctx = null; this.muted = false; this.A = null; this.ambient = [];
  }

  unlock() {
    if (!this.ctx) {
      try {
        const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.8;
        const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
        this.master.connect(comp); comp.connect(ctx.destination);
        this.verb = ctx.createConvolver(); this.verb.buffer = this.impulse(2.8, 2.2);
        this.verbSend = ctx.createGain(); this.verbSend.gain.value = 0.55;
        this.verbSend.connect(this.verb); this.verb.connect(this.master);
        this.noiseBuf = this.makeNoise();
      } catch (e) { this.ctx = null; return; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.A && !this.ambient.length) this.startAmbient();
  }

  setTheme(T) {
    this.A = T.audio;
    if (this.ctx) { this.stopAmbient(); this.startAmbient(); }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  impulse(sec, decay) {
    const ctx = this.ctx, len = ctx.sampleRate * sec, b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }
  makeNoise() {
    const ctx = this.ctx, b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  tone({ f, type = 'sine', dur = 0.2, gain = 0.2, at = 0, attack = 0.005, glideTo, cutoff, send = 0.3, detune = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + at;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (cutoff) { const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = cutoff; o.connect(flt); node = flt; }
    node.connect(g); g.connect(this.master);
    if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(this.verbSend); }
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise({ dur = 0.3, gain = 0.2, at = 0, type = 'bandpass', f = 1000, to, q = 1, send = 0.2, attack = 0.005 }) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + at;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const flt = ctx.createBiquadFilter(); flt.type = type; flt.Q.value = q; flt.frequency.setValueAtTime(f, t);
    if (to) flt.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(flt); flt.connect(g); g.connect(this.master);
    if (send) { const sg = ctx.createGain(); sg.gain.value = send; g.connect(sg); sg.connect(this.verbSend); }
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  note(deg, oct = 0) {
    const sc = this.A.scale, n = sc.length;
    const o = Math.floor(deg / n);
    return mtof(this.A.root + sc[((deg % n) + n) % n] + 12 * (o + oct));
  }

  /* ---------- game sounds ---------- */
  carve() {
    if (!this.A) return;
    this.tone({ f: this.note(0, 3), type: this.A.wave, dur: 0.09, gain: 0.08, cutoff: 3000, send: 0.1 });
  }
  capture(pct, kills) {
    if (!this.A) return;
    const A = this.A;
    this.noise({ dur: 0.55, gain: 0.12 + Math.min(0.12, pct / 100), type: 'bandpass', f: 300, to: 5000, q: 0.8, send: 0.4, attack: 0.05 });
    const n = 3 + Math.min(5, Math.floor(pct / 4));
    for (let k = 0; k < n; k++) {
      this.tone({ f: this.note(k * 2 + (Math.random() * 2 | 0), 3), type: A.shimmer > 1 ? 'sine' : 'triangle', dur: 0.6, gain: 0.05 * A.shimmer, at: k * 0.05, send: 0.7 });
    }
  }
  shatter(boss) {
    if (!this.A) return;
    this.noise({ dur: boss ? 0.6 : 0.3, gain: boss ? 0.5 : 0.35, type: 'highpass', f: 1800, q: 0.7, send: 0.3 });
    this.tone({ f: boss ? 120 : 160, glideTo: 38, type: 'sine', dur: boss ? 0.6 : 0.35, gain: boss ? 0.7 : 0.45, send: 0.05 });
    for (let k = 0; k < (boss ? 10 : 6); k++) this.tone({ f: 2200 + Math.random() * 4200, type: 'sine', dur: 0.12 + Math.random() * 0.2, gain: 0.04, at: Math.random() * 0.15, send: 0.8 });
    if (this.A.steam) this.noise({ dur: 1.2, gain: 0.12, type: 'highpass', f: 3500, q: 0.4, at: 0.05, attack: 0.08, send: 0.3 });
    if (this.A.arp) this.tone({ f: this.note(4, 2), glideTo: this.note(4, 4), type: 'sawtooth', dur: 0.25, gain: 0.08, cutoff: 2500 });
  }
  death() {
    if (!this.A) return;
    this.tone({ f: 330, glideTo: 40, type: this.A.wave === 'sine' ? 'triangle' : this.A.wave, dur: 0.8, gain: 0.3, cutoff: 1800, send: 0.3 });
    this.noise({ dur: 0.7, gain: 0.35, type: 'lowpass', f: 1400, to: 120, q: 0.5, send: 0.2 });
  }
  clear() {
    if (!this.A) return;
    for (let k = 0; k < 8; k++) this.tone({ f: this.note(k, 2), type: this.A.wave, dur: 0.5, gain: 0.07, at: k * 0.075, cutoff: 3500, send: 0.6 });
    [0, 2, 4].forEach(d => this.tone({ f: this.note(d, 1), type: 'sine', dur: 2.4, gain: 0.06, at: 0.6, attack: 0.3, send: 0.8 }));
  }
  respawn() { if (this.A) this.tone({ f: this.note(0, 2), glideTo: this.note(0, 3), type: 'sine', dur: 0.3, gain: 0.08, send: 0.5 }); }
  ui() { if (this.A) this.tone({ f: this.note(2, 3), type: 'sine', dur: 0.08, gain: 0.05, send: 0.2 }); }

  /* ---------- ambient bed ---------- */
  startAmbient() {
    if (!this.ctx || !this.A) return;
    const ctx = this.ctx, A = this.A, t = ctx.currentTime;
    const bus = ctx.createGain(); bus.gain.setValueAtTime(0.0001, t); bus.gain.exponentialRampToValueAtTime(0.09, t + 2.5);
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = A.cutoff; flt.Q.value = 2;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = A.cutoff * 0.45;
    lfo.connect(lg); lg.connect(flt.frequency); lfo.start();
    flt.connect(bus); bus.connect(this.master);
    const vs = ctx.createGain(); vs.gain.value = 0.5; bus.connect(vs); vs.connect(this.verbSend);
    const oscs = [lfo];
    [[0, -5], [7, 4], [12, -8]].forEach(([iv, det]) => {
      const o = ctx.createOscillator(); o.type = A.drone; o.frequency.value = mtof(A.root - 12 + iv); o.detune.value = det;
      const g = ctx.createGain(); g.gain.value = 0.33; o.connect(g); g.connect(flt); o.start(); oscs.push(o);
    });
    this.ambient = [bus, ...oscs];
    let step = 0;
    this.seq = setInterval(() => {
      if (!this.ctx || this.muted) return;
      step++;
      if (A.arp) { // synthwave bass pulse
        const pat = [0, 0, 3, 0, 5, 0, 3, 2];
        this.tone({ f: this.note(pat[step % 8], -1), type: 'sawtooth', dur: 0.2, gain: 0.05, cutoff: 700, send: 0.05 });
      } else if (A.sonar) {
        if (step % 24 === 0) this.tone({ f: this.note(4, 3), type: 'sine', dur: 1.6, gain: 0.05, attack: 0.01, send: 0.9 });
      } else if (A.steam) { // crackling embers
        if (Math.random() < 0.3) this.noise({ dur: 0.03, gain: 0.03 + Math.random() * 0.04, type: 'bandpass', f: 2000 + Math.random() * 3000, q: 4, send: 0.2 });
      }
    }, 140);
  }
  stopAmbient() {
    if (this.seq) clearInterval(this.seq);
    const t = this.ctx ? this.ctx.currentTime : 0;
    this.ambient.forEach((n, k) => {
      try {
        if (k === 0) n.gain.setTargetAtTime(0.0001, t, 0.3);
        else n.stop(t + 1.2);
      } catch (e) { /* already stopped */ }
    });
    this.ambient = [];
  }
}
