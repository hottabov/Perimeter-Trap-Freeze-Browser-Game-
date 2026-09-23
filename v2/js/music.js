// Procedural background music: every world gets its own song, generated from the world's seed.
// Each family has a style (tempo, drum kit, bass, lead instrument, pad); the seed picks the chord
// progression and writes the melody. The song reacts to the game: drums drop out on the title,
// the mix opens up while you draw a line, and it muffles when paused.
import { rng } from './themegen.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const fold = (m, lo, hi) => { while (m < lo) m += 12; while (m > hi) m -= 12; return m; };
const hit = (pat, s) => pat && pat[s % pat.length] === 'x';

/* ---------- styles ---------- */
// Patterns are 16 steps (one bar of sixteenth notes). prog: chord roots as scale indexes, one per bar.
const STYLES = {
  fire: {
    bpm: [84, 94], swing: 0.08, kit: 'soft', progs: [[0, 3, 2, 4], [0, 2, 3, 1], [0, 4, 3, 2]],
    kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
    bass: { wave: 'triangle', pat: 'x.....x...x.....', cutoff: 600, len: 3 },
    lead: { inst: 'bell', density: 0.34, oct: 2 }, pad: { wave: 'triangle', gain: 0.05 },
  },
  neon: {
    bpm: [104, 116], swing: 0, kit: 'synth', progs: [[0, 5, 3, 4], [0, 3, 5, 4], [0, 4, 5, 3]],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', open: '......x.......x.',
    bass: { wave: 'sawtooth', pat: 'x.x.x.x.x.x.x.x.', cutoff: 900, len: 1, env: true },
    lead: { inst: 'arp', density: 1, oct: 2, wave: 'sawtooth' }, pad: { wave: 'sawtooth', gain: 0.025 },
  },
  cryo: {
    bpm: [66, 76], swing: 0, kit: 'tick', progs: [[0, 2, 4, 3], [0, 3, 1, 4]],
    hat: '....x.......x..x',
    bass: { wave: 'sine', pat: 'x...............', cutoff: 400, len: 14 },
    lead: { inst: 'glass', density: 0.22, oct: 3 }, pad: { wave: 'sine', gain: 0.06 },
  },
  desert: {
    bpm: [92, 104], swing: 0.05, kit: 'darbuka', progs: [[0, 0, 6, 0], [0, 1, 0, 6], [0, 3, 1, 0]],
    doum: 'x.......x.......', tek: '..x...x.....x.xx',
    bass: { wave: 'triangle', pat: 'x.......x.......', cutoff: 500, len: 6 },
    lead: { inst: 'oud', density: 0.5, oct: 2 }, pad: { wave: 'sawtooth', gain: 0.018, drone: true },
  },
  cave: {
    bpm: [76, 86], swing: 0.06, kit: 'toms', progs: [[0, 3, 4, 2], [0, 1, 3, 2]],
    tom: 'x.........x.....', rim: '....x.......x...',
    bass: { wave: 'sine', pat: 'x.......x.......', cutoff: 500, len: 6 },
    lead: { inst: 'marimba', density: 0.42, oct: 2 }, pad: { wave: 'triangle', gain: 0.04 },
  },
  abyss: {
    bpm: [56, 62], swing: 0, kit: 'heart', progs: [[0, 1, 0, 3], [0, 3, 1, 0]],
    kick: 'x.x.............',
    bass: { wave: 'sawtooth', pat: 'x...............', cutoff: 220, len: 15 },
    lead: { inst: 'bell', density: 0.12, oct: 2 }, pad: { wave: 'sawtooth', gain: 0.03, cluster: true },
  },
  hell: {
    bpm: [126, 138], swing: 0, kit: 'metal', progs: [[0, 0, 1, 0], [0, 3, 1, 2], [0, 1, 0, 5]],
    kick: 'x.x...x.x.x...x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
    bass: { wave: 'sawtooth', pat: 'x.xxx.x.x.xxx.x.', cutoff: 1400, len: 1, dist: true },
    lead: { inst: 'power', pat: 'x..x..x.....x.x.', oct: 1 }, pad: null,
  },
  sky: {
    bpm: [96, 106], swing: 0.1, kit: 'light', progs: [[0, 3, 4, 2], [0, 4, 3, 1], [0, 2, 3, 4]],
    kick: 'x.......x.......', snare: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx',
    bass: { wave: 'triangle', pat: 'x...x...x...x...', cutoff: 700, len: 3 },
    lead: { inst: 'flute', density: 0.42, oct: 2 }, pad: { wave: 'triangle', gain: 0.04 },
  },
  heaven: {
    bpm: [64, 72], swing: 0, kit: 'timpani', progs: [[0, 4, 5, 3], [0, 3, 4, 5], [0, 5, 3, 4]],
    bass: { wave: 'sine', pat: 'x.......x.......', cutoff: 500, len: 7 },
    lead: { inst: 'harp', density: 1, oct: 2 }, pad: { wave: 'sawtooth', gain: 0.05, choir: true },
  },
};

/* ---------- song generation ---------- */
function makeSong(T) {
  const fam = STYLES[T.family] ? T.family : 'fire';
  const S = STYLES[fam];
  const seed = T.seed || [...fam].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
  const r = rng(seed * 13 + 5);
  const scale = T.audio.scale, n = scale.length;
  const prog = r.pick(S.progs).map(d => d % n);
  const bpm = Math.round(r.range(S.bpm[0], S.bpm[1]));
  // melody: an 8-bar phrase A A' B A made from a two-bar motif
  const melody = [];
  if (S.lead.density < 1 && S.lead.inst !== 'power') {
    const motif = (len) => {
      const ev = [];
      let deg = r.pick([0, 2, 4]);
      for (let s = 0; s < 16 * len; s++) {
        const strong = s % 4 === 0;
        if (r() > S.lead.density * (strong ? 1.5 : 0.7)) continue;
        deg += r.pick([-2, -1, -1, 1, 1, 2, 0, 3, -3]);
        deg = Math.max(-2, Math.min(n + 4, deg));
        ev.push({ s, deg, len: r.pick([1, 2, 2, 3, 4]) });
      }
      return ev;
    };
    const A = motif(2), B = motif(2);
    const Av = A.map(e => (e.s >= 24 && r() < 0.5 ? { ...e, deg: e.deg + r.pick([-1, 1, 2]) } : e));
    [A, Av, B, A].forEach((m, k) => m.forEach(e => melody.push({ ...e, s: e.s + k * 32 })));
  }
  return { fam, S, prog, bpm, melody, scale, root: T.audio.root };
}

/* ---------- engine ---------- */
export class Music {
  constructor(sfx) {
    this.sfx = sfx; this.song = null; this.mode = 'title'; this.carving = false;
    this.timer = null; this.step = 0; this.nextT = 0;
  }

  ensure() {
    const ctx = this.sfx.ctx;
    if (!ctx) return false;
    if (this.ctx === ctx) return true;
    this.ctx = ctx;
    this.bus = ctx.createGain(); this.bus.gain.value = 0.0001;
    this.tone = ctx.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 18000; this.tone.Q.value = 0.5;
    this.bus.connect(this.tone); this.tone.connect(this.sfx.master);
    this.send = ctx.createGain(); this.send.gain.value = 0.35; this.bus.connect(this.send); this.send.connect(this.sfx.verbSend);
    // distortion for the hell riff
    this.dist = ctx.createWaveShaper();
    const c = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; c[i] = Math.tanh(x * 6) * 0.8; }
    this.dist.curve = c; this.dist.oversample = '2x';
    const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2600;
    const dg = ctx.createGain(); dg.gain.value = 0.26;
    this.dist.connect(dl); dl.connect(dg); dg.connect(this.bus);
    // formant filter for the heavenly choir ("aah")
    this.choir = ctx.createGain(); this.choir.gain.value = 1;
    [[750, 6, 1], [1150, 7, 0.6], [2600, 9, 0.25]].forEach(([f, q, g]) => {
      const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q;
      const gg = ctx.createGain(); gg.gain.value = g * 2.2;
      this.choir.connect(b); b.connect(gg); gg.connect(this.bus);
    });
    return true;
  }

  setTheme(T) {
    this.song = makeSong(T);
    if (this.timer) { this.step = 0; this.nextT = this.ctx.currentTime + 0.15; }
    else this.start();
  }

  start() {
    if (!this.song || !this.ensure()) return;
    if (this.timer) return;
    this.step = 0; this.nextT = this.ctx.currentTime + 0.15;
    this.timer = setInterval(() => this.tick(), 25);
    this.applyMode(1.5);
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  setMode(mode) { if (this.mode === mode) return; this.mode = mode; if (this.ensure()) { if (!this.timer) this.start(); this.applyMode(); } }
  setCarving(on) { if (this.carving === on) return; this.carving = on; if (this.ensure()) this.applyMode(0.25); }

  applyMode(tc = 0.6) {
    const t = this.ctx.currentTime, M = this.mode;
    const vol = M === 'over' ? 0.0001 : M === 'clear' ? 0.12 : M === 'pause' ? 0.2 : M === 'title' ? 0.32 : 0.42;
    this.bus.gain.setTargetAtTime(vol, t, tc / 3);
    const cut = M === 'pause' ? 600 : M === 'clear' ? 1400 : M === 'play' && !this.carving ? 9000 : 18000;
    this.tone.frequency.setTargetAtTime(cut, t, tc / 3);
  }

  tick() {
    const ctx = this.ctx, song = this.song;
    if (!ctx || !song) return;
    if (this.nextT < ctx.currentTime - 0.25) this.nextT = ctx.currentTime + 0.05; // tab was asleep
    const sixteenth = 60 / song.bpm / 4;
    while (this.nextT < ctx.currentTime + 0.14) {
      if (!this.sfx.muted) this.playStep(this.step, this.nextT, sixteenth);
      const sw = song.S.swing * sixteenth;
      this.nextT += this.step % 2 === 0 ? sixteenth + sw : sixteenth - sw;
      this.step = (this.step + 1) % 128;
    }
  }

  /* ---------- note helpers ---------- */
  midi(idx, lo, hi) {
    const sc = this.song.scale, n = sc.length;
    const o = Math.floor(idx / n), d = ((idx % n) + n) % n;
    return fold(this.song.root + sc[d] + 12 * o, lo, hi);
  }
  voice(t, f, dur, { wave = 'sine', gain = 0.1, attack = 0.005, cutoff = 0, q = 0.7, to = null, dest = null, detune = 0, env = false, vib = 0 }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = wave; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + Math.min(dur, 0.12));
    if (vib) {
      const l = ctx.createOscillator(); l.frequency.value = 5.2; const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * vib, t + 0.25);
      l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.1);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (cutoff) {
      const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = q;
      if (env) { fl.frequency.setValueAtTime(cutoff * 3, t); fl.frequency.exponentialRampToValueAtTime(cutoff * 0.6, t + dur); } else fl.frequency.value = cutoff;
      o.connect(fl); node = fl;
    }
    node.connect(g); g.connect(dest || this.bus);
    o.start(t); o.stop(t + dur + 0.05);
  }
  noise(t, dur, { gain = 0.1, type = 'highpass', f = 6000, q = 0.7, dest = null }) {
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.sfx.noiseBuf;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(dest || this.bus); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  kick(t, gain = 0.5, f0 = 130, f1 = 42, dur = 0.32) { this.voice(t, f0, dur, { gain, to: f1, attack: 0.002 }); }
  snare(t, gain = 0.18) { this.noise(t, 0.16, { gain, type: 'bandpass', f: 1900, q: 0.8 }); this.voice(t, 190, 0.09, { gain: gain * 0.6, to: 140 }); }
  hat(t, gain = 0.05, open = false) { this.noise(t, open ? 0.22 : 0.04, { gain, f: 7500 }); }

  /* ---------- one sixteenth ---------- */
  playStep(step, t, sx) {
    const song = this.song, S = song.S, s16 = step % 16, bar = (step / 16) | 0;
    const chord = song.prog[bar % song.prog.length];
    const drums = this.mode === 'play' || this.mode === 'clear' || S.kit === 'heart';
    const drive = this.carving ? 1.35 : 1;

    // drums
    if (drums) {
      switch (S.kit) {
        case 'soft':
          if (hit(S.kick, s16)) this.kick(t, 0.32, 110, 45, 0.28);
          if (hit(S.snare, s16)) this.noise(t, 0.05, { gain: 0.08, type: 'bandpass', f: 3000, q: 2 });
          if (hit(S.hat, s16)) this.hat(t, 0.018 * drive);
          break;
        case 'synth':
          if (hit(S.kick, s16)) this.kick(t, 0.5, 140, 40, 0.3);
          if (hit(S.snare, s16)) this.snare(t, 0.16);
          if (hit(S.hat, s16)) this.hat(t, 0.035 * drive);
          if (hit(S.open, s16)) this.hat(t, 0.03, true);
          if (this.carving && s16 % 2 === 1) this.hat(t, 0.02);
          break;
        case 'tick':
          if (hit(S.hat, s16)) this.noise(t, 0.03, { gain: 0.025 * drive, type: 'bandpass', f: 5200, q: 6 });
          break;
        case 'darbuka':
          if (hit(S.doum, s16)) this.voice(t, 95, 0.3, { gain: 0.35, to: 70 });
          if (hit(S.tek, s16)) { this.noise(t, 0.05, { gain: 0.09 * drive, type: 'bandpass', f: 3200, q: 3 }); this.voice(t, 620, 0.06, { gain: 0.05 }); }
          if (this.carving && s16 % 4 === 3) this.noise(t, 0.04, { gain: 0.05, type: 'bandpass', f: 4200, q: 4 });
          break;
        case 'toms':
          if (hit(S.tom, s16)) this.voice(t, 110, 0.35, { gain: 0.3, to: 80 });
          if (s16 === 7 && bar % 2) this.voice(t, 150, 0.25, { gain: 0.18, to: 110 });
          if (hit(S.rim, s16)) this.noise(t, 0.03, { gain: 0.07, type: 'bandpass', f: 2400, q: 5 });
          break;
        case 'heart':
          if (hit(S.kick, s16) && bar % 2 === 0) this.kick(t, s16 ? 0.28 : 0.4, 70, 34, 0.26);
          break;
        case 'metal':
          if (hit(S.kick, s16) || (this.carving && s16 % 2 === 0)) this.kick(t, 0.42, 120, 45, 0.18);
          if (hit(S.snare, s16)) this.snare(t, 0.22);
          if (hit(S.hat, s16)) this.hat(t, 0.03);
          if (s16 === 0 && bar % 4 === 0) this.noise(t, 1.2, { gain: 0.06, f: 5000 });
          break;
        case 'light':
          if (hit(S.kick, s16)) this.kick(t, 0.3, 110, 50, 0.25);
          if (hit(S.snare, s16)) this.noise(t, 0.12, { gain: 0.07, type: 'bandpass', f: 1500, q: 1 });
          if (hit(S.hat, s16)) this.noise(t, 0.03, { gain: (s16 % 4 === 2 ? 0.03 : 0.012) * drive, type: 'highpass', f: 9000 });
          break;
        case 'timpani':
          if (s16 === 0 && bar % 4 === 0) this.voice(t, mtof(this.midi(0, 36, 47)), 1.6, { gain: 0.3, to: mtof(this.midi(0, 36, 47)) * 0.97 });
          if (this.carving && s16 % 4 === 0) this.voice(t, mtof(this.midi(chord, 36, 47)), 0.5, { gain: 0.12 });
          break;
      }
    }

    // bass
    const B = S.bass;
    if (hit(B.pat, s16)) {
      const f = mtof(this.midi(chord, 28, 45));
      const dur = B.len * sx * 1.1;
      if (B.dist) this.voice(t, f, dur, { wave: 'sawtooth', gain: 0.5, dest: this.dist, cutoff: 900 });
      else this.voice(t, f, dur, { wave: B.wave, gain: B.wave === 'sawtooth' ? 0.1 : 0.2, cutoff: B.cutoff, env: B.env, q: B.env ? 4 : 0.7 });
    }

    // pad: one long chord per bar
    const P = S.pad;
    if (P && s16 === 0) {
      const dur = 16 * sx * 1.05;
      const notes = P.cluster ? [chord, chord + 1] : P.drone ? [0] : [chord, chord + 2, chord + 4];
      for (const d of notes) for (const det of [-7, 7]) {
        const f = mtof(this.midi(d, 50, 69));
        this.voice(t, f, dur, { wave: P.wave, gain: P.gain, attack: P.choir ? 1.2 : 0.6, cutoff: P.choir ? 0 : 1600, detune: det, dest: P.choir ? this.choir : null });
      }
    }

    // lead
    const L = S.lead;
    if (L.inst === 'arp') {
      if (s16 % 2 === 0 || this.carving) {
        const k = (s16 >> 1) % 4, d = chord + [0, 2, 4, 7][k];
        this.voice(t, mtof(this.midi(d, 60, 84)), sx * 1.6, { wave: L.wave, gain: 0.035, cutoff: 2600, env: true, q: 3 });
      }
    } else if (L.inst === 'harp') {
      const k = s16 % 8, d = chord + [0, 2, 4, 7, 9, 11, 14, 11][k];
      if (s16 % 2 === 0 || this.carving) this.voice(t, mtof(this.midi(d, 60, 88)), 1.2, { wave: 'triangle', gain: 0.03, cutoff: 3200 });
    } else if (L.inst === 'power') {
      if (hit(L.pat, s16)) {
        const m = this.midi(chord, 40, 52);
        [0, 7, 12].forEach(iv => this.voice(t, mtof(m + iv), sx * 2.2, { wave: 'sawtooth', gain: 0.22, dest: this.dist }));
      }
      // a screaming lead line on the last bar of every four
      if (bar % 4 === 3 && s16 % 2 === 0) this.voice(t, mtof(this.midi(chord + [4, 3, 2, 1, 2, 3, 4, 6][s16 >> 1], 64, 84)), sx * 2, { wave: 'sawtooth', gain: 0.1, dest: this.dist, vib: 0.015 });
    } else {
      for (const e of song.melody) {
        if (e.s !== step % 128) continue;
        const f = mtof(this.midi(chord + e.deg, 60, 86));
        const dur = e.len * sx;
        switch (L.inst) {
          case 'bell':
            this.voice(t, f, 1.4, { gain: 0.05 }); this.voice(t, f * 2.76, 0.35, { gain: 0.012 }); break;
          case 'glass':
            this.voice(t, f, 2.2, { gain: 0.035 }); this.voice(t + sx * 3, f, 1.6, { gain: 0.015 }); break;
          case 'oud':
            this.voice(t, f * 0.94, Math.max(0.25, dur * 1.4), { wave: 'triangle', gain: 0.07, to: f, cutoff: 2600, env: true, q: 2 });
            this.voice(t, f * 0.97, 0.05, { wave: 'sawtooth', gain: 0.02, to: f, cutoff: 3000 });
            break;
          case 'marimba':
            this.voice(t, f, 0.45, { gain: 0.07 }); this.voice(t, f * 4, 0.08, { gain: 0.015 }); break;
          case 'flute':
            this.voice(t, f, Math.max(0.2, dur * 1.1), { wave: 'sine', gain: 0.055, attack: 0.04, vib: 0.006 });
            this.noise(t, 0.08, { gain: 0.008, type: 'bandpass', f: f * 2, q: 3 });
            break;
        }
      }
    }
  }
}
