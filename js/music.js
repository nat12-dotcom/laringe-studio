/* Laringe Studio — generador musical
 * Compone una pieza por estilo (armonía, melodía, batería, capas) y la renderiza
 * con el coro hecho de tu voz. El resultado es un loop perfecto para videojuegos.
 */
const Music = (() => {
  const A = Analysis;
  const MODES = {
    ionian: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11], aeolian: [0, 2, 3, 5, 7, 8, 10], harmonic: [0, 2, 3, 5, 7, 8, 11],
  };
  const MODE_NAMES = { ionian: 'mayor', dorian: 'dórico', phrygian: 'frigio', lydian: 'lidio', aeolian: 'menor', harmonic: 'menor armónica' };

  const STYLES = {
    epico: {
      name: 'Épico orquestal', blurb: 'Taikos, cuerdas en ostinato y coro solemne. Para menús y momentos heroicos.',
      bpm: 84, mode: 'aeolian', roots: [50, 48, 45, 52], progs: [[0, 5, 2, 6], [0, 3, 5, 4], [0, 6, 5, 6], [0, 5, 3, 4]],
      choir: 'grand', kit: 'taiko', drums: { k: 'x.......x.......', t: 'x.....x.x...x...', s: '', h: '' },
      layers: ['strings8', 'pad', 'brass', 'bass'], reverb: 3.2, mel: [[4], [2, 2], [3, 1], [2, 1, 1]],
    },
    batalla: {
      name: 'Batalla / jefe final', blurb: 'Rápido y agresivo: golpes de coro “¡ha!” y cuerdas a semicorcheas.',
      bpm: 148, mode: 'harmonic', roots: [50, 52, 45], progs: [[0, 0, 5, 4], [0, 5, 3, 4], [0, 1, 0, 4]],
      choir: 'hits', kit: 'rock', drums: { k: 'x..xx...x..x..x.', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', t: '' },
      layers: ['strings16', 'bass8', 'brass'], reverb: 2.2, mel: [[1, 1, 1, 1], [2, 1, 1], [1.5, 1.5, 1]],
    },
    terror: {
      name: 'Terror', blurb: 'Coro disonante en clúster, drones graves y campanas lejanas.',
      bpm: 60, mode: 'phrygian', roots: [45, 46, 43], progs: [[0, 1, 0, 4], [0, 1, 3, 1], [0, 6, 1, 0]],
      choir: 'cluster', kit: 'taiko', drums: { k: 'x...............', t: '..........x.....' },
      layers: ['drone', 'bells'], reverb: 5, mel: [[4], [4], [2, 2]],
    },
    medieval: {
      name: 'Fantasía medieval', blurb: 'Arpa, bordón y un canto en quintas paralelas, como monjes en una abadía.',
      bpm: 104, mode: 'dorian', roots: [50, 52, 48], progs: [[0, 6, 0, 4], [0, 3, 6, 0], [0, 4, 6, 3]],
      choir: 'chant', kit: 'frame', drums: { t: 'x..x..x.x..x..x.', h: '..x...x...x...x.' },
      layers: ['harp', 'drone5'], reverb: 3, mel: [[1, 1, 2], [1, 1, 1, 1], [2, 1, 1], [1.5, 0.5, 2]],
    },
    chiptune: {
      name: 'Chiptune 8-bit', blurb: 'Ondas cuadradas, arpegios rápidos y tu voz pasada por un filtro de 8 bits.',
      bpm: 144, mode: 'ionian', roots: [48, 50, 53], progs: [[0, 5, 3, 4], [0, 4, 5, 3], [3, 4, 0, 0]],
      choir: 'lead', kit: 'chip', drums: { k: 'x...x...x...x...', s: '....x.......x..x', h: '..x...x...x...x.' },
      layers: ['chipArp', 'chipBass'], reverb: 0.6, crush: true,
      mel: [[0.5, 0.5, 1, 0.5, 0.5, 1], [1, 1, 1, 1], [0.5, 0.5, 0.5, 0.5, 2]],
    },
    lofi: {
      name: 'Lo-fi tranquilo', blurb: 'Acordes con séptima, batería con swing y coro suave filtrado.',
      bpm: 76, mode: 'ionian', roots: [50, 53, 48], progs: [[3, 2, 1, 0], [0, 5, 1, 4], [3, 4, 2, 5]], seventh: true,
      choir: 'soft', kit: 'lofi', swing: 0.18, drums: { k: 'x......x..x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
      layers: ['piano', 'bassSoft', 'crackle'], reverb: 1.8, choirLP: 1700, mel: [[2, 2], [1.5, 2.5], [4]],
    },
    ambiental: {
      name: 'Exploración ambiental', blurb: 'Sin batería: pads amplios, campanas y oleadas de coro.',
      bpm: 70, mode: 'lydian', roots: [48, 50, 52], progs: [[0, 1, 5, 0], [0, 4, 1, 5], [0, 2, 1, 4]], seventh: true,
      choir: 'swell', kit: null, drums: {}, layers: ['padWide', 'bellArp'], reverb: 5.5, mel: [[4], [2, 2], [4]],
    },
  };

  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const pc = m => ((m % 12) + 12) % 12;
  function deg2midi(root, mode, deg) {
    const sc = MODES[mode];
    const o = Math.floor(deg / 7);
    return root + sc[((deg % 7) + 7) % 7] + 12 * o;
  }
  function clampOct(m, [lo, hi]) {
    while (m < lo) m += 12;
    while (m > hi) m -= 12;
    return m;
  }
  function nearestPc(prev, pcs, [lo, hi], minM) {
    let best = null, bd = 1e9;
    for (let m = lo; m <= hi; m++) {
      if (minM != null && m < minM) continue;
      if (!pcs.includes(pc(m))) continue;
      const d = Math.abs(m - prev);
      if (d < bd) { bd = d; best = m; }
    }
    return best == null ? Math.round((lo + hi) / 2) : best;
  }

  // ---------- Composición ----------
  function compose(styleId, o = {}) {
    const st = STYLES[styleId];
    const r = Voice.mulberry(o.seed || 1);
    const P = Voice.PARTS;
    const bpm = o.bpm || st.bpm;
    const mode = st.mode;
    let root = o.root != null ? o.root : pick(r, st.roots);
    root = clampOct(root, [43, 54]);
    const prog = pick(r, st.progs);
    const bars = o.bars || 16;
    const beat = 60 / bpm, barDur = beat * 4;
    const chords = [];
    let prev = { S: 70, A: 64, T: 57, B: 48 };
    for (let b = 0; b < bars; b++) {
      const deg = prog[b % prog.length];
      const tones = [0, 2, 4].concat(st.seventh ? [6] : []).map(k => deg2midi(root, mode, deg + k));
      const pcs = tones.map(pc);
      const v = {};
      v.B = nearestPc(prev.B, [pcs[0]], P.B.range);
      v.T = nearestPc(prev.T, pcs, P.T.range, v.B + 3);
      v.A = nearestPc(prev.A, pcs.filter(x => x !== pc(v.T)).concat(pcs.length > 3 ? [] : [pc(v.T)]), P.A.range, v.T + 1);
      const rest = pcs.filter(x => x !== pc(v.A) && x !== pc(v.T));
      v.S = nearestPc(prev.S, rest.length ? rest : pcs, P.S.range, v.A + 1);
      prev = v;
      chords.push({ deg, tones, pcs, satb: v });
    }
    const scale = MODES[mode].map(x => (x + root) % 12);
    const melody = [];
    let last = chords[0].satb.S;
    for (let b = 0; b < bars; b++) {
      const rh = pick(r, st.mel);
      let t = 0;
      const ch = chords[b];
      for (const len of rh) {
        const strong = Math.abs(t % 2) < 1e-6;
        const cands = [];
        for (let m = P.S.range[0]; m <= P.S.range[1] - 2; m++) {
          if (!scale.includes(pc(m))) continue;
          const isChord = ch.pcs.includes(pc(m));
          if (strong && !isChord) continue;
          const dist = Math.abs(m - last);
          if (dist > 7) continue;
          cands.push({ m, w: (isChord ? 2 : 1) * Math.exp(-dist / 2.5) * (m === last ? 0.45 : 1) });
        }
        let m = last;
        if (cands.length) {
          let tot = cands.reduce((s, c) => s + c.w, 0), x = r() * tot;
          for (const c of cands) { x -= c.w; if (x <= 0) { m = c.m; break; } }
        }
        // última nota del loop: vuelve a la tónica del acorde para cerrar
        if (b === bars - 1 && t + len >= 4) m = nearestPc(m, [ch.pcs[0]], P.S.range);
        melody.push({ t: b * barDur + t * beat, dur: len * beat, midi: m });
        last = m;
        t += len;
      }
    }
    return { styleId, st, bpm, root, mode, bars, beat, barDur, chords, melody, duration: bars * barDur, seed: o.seed };
  }

  // ---------- Instrumentos ----------
  function makeKit(ctx, out, noise, r) {
    const mtof = A.midiToFreq;
    function adsr(param, t, dur, a, d, s, rel, peak) {
      const end = t + Math.max(dur, a + 0.005);
      param.setValueAtTime(0.0001, t);
      param.linearRampToValueAtTime(peak, t + a);
      const sl = Math.max(peak * s, 0.0001);
      if (a + d < dur) { param.exponentialRampToValueAtTime(sl, t + a + d); param.setValueAtTime(sl, end); }
      else param.setValueAtTime(peak, end);
      param.exponentialRampToValueAtTime(0.0001, end + rel);
      return end + rel;
    }
    function voice({ type = 'sawtooth', midi, t, dur, vel, a = 0.01, d = 0.2, s = 0.6, rel = 0.2, cutoff = 2000, q = 0.7, detune = [0], fenv = 0 }) {
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = q;
      if (fenv) {
        f.frequency.setValueAtTime(cutoff * (1 + fenv), t);
        f.frequency.exponentialRampToValueAtTime(cutoff, t + Math.min(0.4, Math.max(0.05, dur)));
      }
      f.connect(g); g.connect(out);
      const end = adsr(g.gain, t, dur, a, d, s, rel, vel / Math.sqrt(detune.length));
      for (const dt of detune) {
        const o = ctx.createOscillator();
        o.type = type; o.frequency.value = mtof(midi); o.detune.value = dt;
        o.connect(f); o.start(t); o.stop(end + 0.05);
      }
    }
    const I = {
      pad: (m, t, dur, v) => voice({ midi: m, t, dur, vel: v, a: 0.5, d: 0.5, s: 0.8, rel: 0.8, cutoff: 1400, detune: [-7, 7] }),
      padWide: (m, t, dur, v) => voice({ midi: m, t, dur, vel: v, a: 1.4, d: 1, s: 0.8, rel: 1.8, cutoff: 1000, detune: [-10, 0, 10] }),
      strings: (m, t, dur, v) => voice({ midi: m, t, dur, vel: v, a: 0.008, d: 0.12, s: 0.35, rel: 0.12, cutoff: 2600, detune: [-5, 5] }),
      brass: (m, t, dur, v) => voice({ midi: m, t, dur, vel: v, a: 0.06, d: 0.3, s: 0.7, rel: 0.3, cutoff: 900, fenv: 1.5, detune: [-4, 4] }),
      bass: (m, t, dur, v) => voice({ midi: m, t, dur, vel: v, a: 0.01, d: 0.3, s: 0.7, rel: 0.15, cutoff: 520 }),
      bassSoft: (m, t, dur, v) => voice({ type: 'triangle', midi: m, t, dur, vel: v, a: 0.01, d: 0.4, s: 0.5, rel: 0.2, cutoff: 900 }),
      drone: (m, t, dur, v) => voice({ midi: m, t, dur, vel: v, a: 1.2, d: 1, s: 0.9, rel: 1.5, cutoff: 380, detune: [-12, 12] }),
      droneT: (m, t, dur, v) => voice({ type: 'triangle', midi: m, t, dur, vel: v, a: 0.6, d: 0.5, s: 0.9, rel: 0.8, cutoff: 1200 }),
      pluck: (m, t, v) => voice({ type: 'triangle', midi: m, t, dur: 0.01, vel: v, a: 0.004, d: 0.004, s: 1, rel: 1.1, cutoff: 3200 }),
      square: (m, t, dur, v) => voice({ type: 'square', midi: m, t, dur, vel: v, a: 0.002, d: 0.05, s: 0.6, rel: 0.03, cutoff: 8000 }),
      tri: (m, t, dur, v) => voice({ type: 'triangle', midi: m, t, dur, vel: v, a: 0.002, d: 0.05, s: 0.9, rel: 0.03, cutoff: 8000 }),
      piano: (m, t, v) => {
        voice({ type: 'triangle', midi: m, t, dur: 0.02, vel: v, a: 0.003, d: 0.01, s: 1, rel: 1.3, cutoff: 1800 });
        voice({ type: 'sine', midi: m + 12, t, dur: 0.02, vel: v * 0.3, a: 0.003, d: 0.01, s: 1, rel: 0.6, cutoff: 4000 });
      },
      bell: (m, t, v) => {
        for (const [ratio, amp, dec] of [[1, 1, 2.6], [2.76, 0.4, 1.2], [5.4, 0.15, 0.6]]) {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine'; o.frequency.value = mtof(m) * ratio;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(v * amp, t + 0.005);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
          o.connect(g).connect(out); o.start(t); o.stop(t + dec + 0.05);
        }
      },
    };
    function noiseHit(t, { dur = 0.2, type = 'highpass', f = 1000, q = 0.7, vel = 0.3, a = 0.001 }) {
      const s = ctx.createBufferSource(); s.buffer = noise;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vel, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(fl).connect(g).connect(out);
      s.start(t, r() * 1.5); s.stop(t + dur + 0.05);
    }
    function tone(t, { f0 = 150, f1 = 45, dur = 0.4, vel = 0.8, type = 'sine' }) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
      g.gain.setValueAtTime(vel, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
    }
    const D = {
      kick: (t, v) => tone(t, { f0: 150, f1: 42, dur: 0.45, vel: 0.9 * v }),
      snare: (t, v) => { noiseHit(t, { dur: 0.18, type: 'bandpass', f: 1800, q: 0.6, vel: 0.5 * v }); tone(t, { f0: 220, f1: 160, dur: 0.12, vel: 0.25 * v, type: 'triangle' }); },
      hat: (t, v) => noiseHit(t, { dur: 0.05, type: 'highpass', f: 7000, vel: 0.13 * v }),
      tom: (t, v) => tone(t, { f0: 180, f1: 90, dur: 0.35, vel: 0.5 * v }),
      taiko: (t, v) => { tone(t, { f0: 110, f1: 48, dur: 0.9, vel: 1.0 * v }); noiseHit(t, { dur: 0.12, type: 'lowpass', f: 900, vel: 0.35 * v }); },
      frame: (t, v) => { tone(t, { f0: 160, f1: 110, dur: 0.3, vel: 0.45 * v }); noiseHit(t, { dur: 0.06, type: 'bandpass', f: 2500, vel: 0.12 * v }); },
      chipK: (t, v) => tone(t, { f0: 200, f1: 40, dur: 0.14, vel: 0.35 * v, type: 'square' }),
      chipS: (t, v) => noiseHit(t, { dur: 0.1, type: 'highpass', f: 1500, vel: 0.25 * v }),
      chipH: (t, v) => noiseHit(t, { dur: 0.03, type: 'highpass', f: 9000, vel: 0.1 * v }),
      lofiK: (t, v) => tone(t, { f0: 110, f1: 45, dur: 0.35, vel: 0.7 * v }),
      lofiS: (t, v) => noiseHit(t, { dur: 0.15, type: 'bandpass', f: 1400, q: 0.8, vel: 0.28 * v }),
      lofiH: (t, v) => noiseHit(t, { dur: 0.04, type: 'bandpass', f: 6000, vel: 0.07 * v }),
      crash: (t, v) => noiseHit(t, { dur: 1.8, type: 'highpass', f: 4000, vel: 0.18 * v }),
      click: (t, v) => noiseHit(t, { dur: 0.01, type: 'highpass', f: 2000, vel: 0.06 * v }),
    };
    return { I, D, noiseHit };
  }
  const KITS = {
    rock: { k: 'kick', s: 'snare', h: 'hat', t: 'tom' },
    taiko: { k: 'taiko', t: 'tom', s: 'snare', h: 'hat' },
    frame: { t: 'frame', h: 'hat', k: 'kick' },
    chip: { k: 'chipK', s: 'chipS', h: 'chipH', t: 'chipK' },
    lofi: { k: 'lofiK', s: 'lofiS', h: 'lofiH', t: 'tom' },
  };

  function impulse(ctx, secs) {
    const len = Math.round(ctx.sampleRate * secs);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    const r = Voice.mulberry(99);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  // Lista de notas de coro que necesita la partitura (para precalcularlas)
  function choirPlan(score, parts) {
    const { st, chords, melody, barDur, bars } = score;
    const P = Voice.PARTS;
    const notes = []; // {part, midi, t, dur, kind}
    const lead = [];
    const intro = bars >= 8 ? (st.choir === 'hits' || st.choir === 'lead' ? 1 : 2) : 0;
    const add = (part, midi, t, dur, kind = 'sus', extra = {}) => {
      if (!parts[part]) return;
      notes.push({ part, midi: clampOct(midi, P[part].range), t, dur, kind, ...extra });
    };
    const melIn = (b0, b1) => melody.filter(n => n.t >= b0 * barDur - 1e-6 && n.t < b1 * barDur - 1e-6);
    for (let b = 0; b < bars; b++) {
      const t0 = b * barDur, c = chords[b], v = c.satb, main = b >= intro;
      const mel = melIn(b, b + 1);
      switch (st.choir) {
        case 'grand':
          add('B', v.B, t0, barDur); add('T', v.T, t0, barDur); add('A', v.A, t0, barDur, main ? 'sus' : 'soft');
          if (main) mel.forEach(n => add('S', n.midi, n.t, n.dur, 'mel'));
          else add('S', v.S, t0, barDur, 'soft');
          break;
        case 'hits': {
          if (!main || b % 4 === 3) { ['B', 'T', 'A', 'S'].forEach(p => add(p, v[p], t0, barDur, 'sus')); break; }
          const pat = 'x..x..x...x.x...';
          for (let i = 0; i < 16; i++) if (pat[i] === 'x') ['B', 'T', 'A', 'S'].forEach(p => add(p, v[p], t0 + i * barDur / 16, 0.16, 'hit'));
          break;
        }
        case 'cluster':
          ['B', 'T', 'A', 'S'].forEach(p => add(p, v[p], t0, barDur, 'dark'));
          add('A', v.A + 1, t0, barDur, 'dark', { bend: true });
          if (b % 2 === 1) add('S', v.S + 1, t0 + barDur / 2, barDur / 2, 'dark', { bend: true });
          break;
        case 'chant':
          mel.forEach(n => { add('T', n.midi - 12, n.t, n.dur, 'mel'); add('B', n.midi - 19, n.t, n.dur, 'mel'); });
          if (main && b % 2 === 0) { add('A', score.root + 12, t0, barDur * 2, 'soft'); add('S', score.root + 19, t0, barDur * 2, 'soft'); }
          break;
        case 'lead':
          if (main) mel.forEach(n => add('S', n.midi, n.t, n.dur * 0.92, 'mel'));
          add('A', v.A, t0, barDur, 'soft'); add('T', v.T, t0, barDur, 'soft');
          break;
        case 'soft':
          add('A', v.A, t0, barDur, 'soft'); add('T', v.T, t0, barDur, 'soft');
          if (main && Math.floor(b / 2) % 2 === 1) mel.forEach(n => add('S', n.midi, n.t, n.dur, 'mel'));
          break;
        case 'swell':
          ['B', 'T', 'A', 'S'].forEach(p => add(p, v[p], t0, barDur, 'swell'));
          break;
      }
    }
    // línea principal para animar la cabeza
    const order = st.choir === 'chant' ? ['T', 'B', 'S', 'A'] : ['S', 'A', 'T', 'B'];
    for (const p of order) {
      const ln = notes.filter(n => n.part === p);
      if (ln.length) { ln.forEach(n => lead.push({ t: n.t, dur: n.dur, midi: n.midi })); break; }
    }
    lead.sort((a, b) => a.t - b.t);
    return { notes, lead };
  }

  async function prepareBank(bank, plan, onProgress) {
    const need = [];
    const seen = new Set();
    for (const n of plan.notes) {
      const k = n.midi + '_' + n.part;
      if (!seen.has(k) && !bank.has(n.midi, n.part)) { seen.add(k); need.push(n); }
    }
    for (let i = 0; i < need.length; i++) {
      bank.get(need[i].midi, need[i].part);
      if (i % 2 === 0) { onProgress && onProgress(i / need.length * 0.5, `Modulando tu voz: nota ${i + 1} de ${need.length}`); await new Promise(r => setTimeout(r, 0)); }
    }
  }

  // ---------- Renderizado ----------
  async function render(score, bank, f, onProgress) {
    const flags = Object.assign({ choir: true, music: true, choirGain: 1, musicGain: 1, ensemble: 3, parts: { S: 1, A: 1, T: 1, B: 1 } }, f);
    const sr = 44100, st = score.st;
    const r = Voice.mulberry((score.seed || 1) * 13 + 5);
    const plan = choirPlan(score, flags.parts);
    if (flags.choir && bank) await prepareBank(bank, plan, onProgress);
    onProgress && onProgress(0.55, 'Mezclando orquesta y coro…');
    await new Promise(r => setTimeout(r, 0));

    const tail = Math.ceil(st.reverb + 1.5);
    const ctx = new OfflineAudioContext(2, Math.ceil((score.duration + tail) * sr), sr);
    const master = ctx.createDynamicsCompressor();
    master.threshold.value = -14; master.ratio.value = 3; master.attack.value = 0.01; master.release.value = 0.25;
    master.connect(ctx.destination);
    const reverb = ctx.createConvolver(); reverb.buffer = impulse(ctx, st.reverb);
    const rv = ctx.createGain(); rv.gain.value = 0.32;
    reverb.connect(rv).connect(master);

    const musicBus = ctx.createGain(); musicBus.gain.value = flags.musicGain;
    musicBus.connect(master);
    const ms = ctx.createGain(); ms.gain.value = 0.22; musicBus.connect(ms).connect(reverb);

    const choirBus = ctx.createGain(); choirBus.gain.value = flags.choirGain;
    let choirOut = choirBus;
    if (st.crush) {
      const sh = ctx.createWaveShaper(), n = 4096, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.round(x * 7) / 7; }
      sh.curve = curve;
      choirOut.connect(sh); choirOut = sh;
    }
    if (st.choirLP) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = st.choirLP;
      choirOut.connect(lp); choirOut = lp;
    }
    choirOut.connect(master);
    const cs = ctx.createGain(); cs.gain.value = 0.5; choirOut.connect(cs).connect(reverb);

    const noise = ctx.createBuffer(1, sr * 2, sr);
    { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1; }
    const { I, D } = makeKit(ctx, musicBus, noise, r);
    const { chords, barDur, beat, bars, root } = score;
    const intro = bars >= 8 ? (score.styleId === 'batalla' || score.styleId === 'chiptune' ? 1 : 2) : 0;

    if (flags.music) {
      for (let b = 0; b < bars; b++) {
        const t0 = b * barDur, c = chords[b], tones = c.tones, main = b >= intro;
        const rootLow = clampOct(tones[0], [36, 47]);
        for (const layer of st.layers) {
          switch (layer) {
            case 'pad': tones.forEach(m => I.pad(clampOct(m, [55, 67]), t0, barDur, 0.06)); break;
            case 'padWide': tones.forEach(m => { I.padWide(clampOct(m, [55, 67]), t0, barDur, 0.05); I.padWide(clampOct(m, [67, 79]), t0, barDur, 0.03); }); break;
            case 'strings8': if (main) {
              const arr = [clampOct(tones[0], [50, 61]), clampOct(tones[2], [55, 66]), clampOct(tones[0], [50, 61]) + 12, clampOct(tones[1], [55, 66])];
              for (let i = 0; i < 8; i++) I.strings(arr[i % 4], t0 + i * beat / 2, beat / 2 * 0.9, 0.1);
            } break;
            case 'strings16': {
              const base = clampOct(tones[0], [50, 61]);
              for (let i = 0; i < 16; i++) I.strings(base + (i % 2 ? 12 : 0), t0 + i * beat / 4, beat / 4 * 0.8, main ? 0.08 : 0.05);
            } break;
            case 'brass': if (main) [0, 2].forEach(bt => tones.forEach(m => I.brass(clampOct(m, [52, 64]), t0 + bt * beat, beat * 1.8, 0.06))); break;
            case 'bass': I.bass(rootLow, t0, barDur * 0.98, 0.22); break;
            case 'bass8': for (let i = 0; i < 8; i++) I.bass(rootLow + (i % 4 === 3 ? 12 : 0), t0 + i * beat / 2, beat / 2 * 0.85, main ? 0.2 : 0.12); break;
            case 'bassSoft': I.bassSoft(rootLow, t0, beat * 1.6, 0.3); I.bassSoft(clampOct(tones[2], [36, 50]), t0 + 2.5 * beat, beat, 0.24); break;
            case 'drone': {
              const d = clampOct(root, [33, 44]);
              I.drone(d, t0, barDur, 0.14);
              if (b % 4 === 3) I.drone(d + 1, t0, barDur, 0.08);
            } break;
            case 'drone5': { const d = clampOct(root, [38, 49]); I.droneT(d, t0, barDur, 0.09); I.droneT(d + 7, t0, barDur, 0.06); } break;
            case 'bells': if (r() < 0.75) I.bell(clampOct(deg2midi(root, score.mode, Math.floor(r() * 7)), [74, 88]), t0 + Math.floor(r() * 8) * beat / 2, 0.07); break;
            case 'harp': if (main || b % 2 === 0) {
              const a0 = clampOct(tones[0], [50, 61]);
              const up = [a0, clampOct(tones[1], [a0, a0 + 11]), clampOct(tones[2], [a0, a0 + 11])].sort((x, y) => x - y);
              const arr = [up[0], up[1], up[2], up[0] + 12, up[1] + 12, up[2] + 12, up[0] + 12, up[2]];
              arr.forEach((m, i) => I.pluck(m, t0 + i * beat / 2, 0.12));
            } break;
            case 'chipArp': for (let i = 0; i < 16; i++) I.square(clampOct(tones[i % tones.length], [64, 76]), t0 + i * beat / 4, beat / 4 * 0.8, main ? 0.035 : 0.025); break;
            case 'chipBass': for (let i = 0; i < 8; i++) I.tri(rootLow + 12 + (i % 2 ? 12 : 0), t0 + i * beat / 2, beat / 2 * 0.7, 0.16); break;
            case 'piano': {
              const sw = (st.swing || 0) * beat / 2;
              const vs = tones.map(m => clampOct(m, [57, 70]));
              vs.forEach(m => I.piano(m, t0, 0.07));
              vs.forEach(m => I.piano(m, t0 + 2.5 * beat + sw, 0.05));
              I.piano(clampOct(tones[0], [45, 56]), t0, 0.08);
            } break;
            case 'crackle': for (let k = 0; k < 10; k++) D.click(t0 + r() * barDur, 0.5 + r()); break;
            case 'bellArp': for (let i = 0; i < 8; i++) if (r() < 0.35) I.bell(clampOct(tones[Math.floor(r() * tones.length)], [72, 86]), t0 + i * beat / 2, 0.05); break;
          }
        }
        // batería
        const kit = st.kit && KITS[st.kit];
        if (kit) {
          const step = beat / 4;
          for (const lane of Object.keys(st.drums)) {
            const pat = st.drums[lane] || '';
            const inst = D[kit[lane]];
            if (!inst) continue;
            for (let i = 0; i < 16; i++) {
              if (pat[i] !== 'x') continue;
              if (!main && !(i === 0 && (lane === 'k' || lane === 't'))) continue;
              const tt = t0 + i * step + (i % 2 ? (st.swing || 0) * step : 0);
              inst(tt, i % 4 === 0 ? 1 : 0.78);
            }
          }
          if (main && b % 4 === 3 && kit.t && st.kit !== 'chip') for (let i = 12; i < 16; i++) D[kit.t](t0 + i * step, 0.6 + (i - 12) * 0.12);
          if (b === intro && intro > 0 && (st.kit === 'rock' || st.kit === 'taiko')) D.crash(t0, 1);
        }
      }
    }

    // coro con tu voz
    if (flags.choir && bank) {
      const ens = Math.max(1, Math.min(4, flags.ensemble | 0));
      const P = Voice.PARTS;
      for (const n of plan.notes) {
        const buf = bank.get(n.midi, n.part);
        const kindA = { sus: 0.3, soft: 0.6, mel: 0.06, hit: 0.004, dark: 1.0, swell: barDur * 0.55 }[n.kind];
        const kindR = { sus: 0.5, soft: 0.8, mel: 0.12, hit: 0.07, dark: 1.2, swell: 1.4 }[n.kind];
        const kindG = { sus: 0.5, soft: 0.3, mel: 0.6, hit: 0.75, dark: 0.32, swell: 0.45 }[n.kind];
        const gain = kindG / Math.sqrt(ens) * (n.part === 'B' ? 1.1 : 1);
        for (let e = 0; e < ens; e++) {
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.detune.value = (r() - 0.5) * (ens > 1 ? 18 : 4);
          const g = ctx.createGain();
          const pan = ctx.createStereoPanner();
          pan.pan.value = Math.max(-1, Math.min(1, P[n.part].pan + (r() - 0.5) * 0.5));
          src.connect(g).connect(pan).connect(choirBus);
          const t = Math.max(0, n.t + (e ? r() * 0.03 : 0));
          const dur = Math.min(n.dur, buf.duration - 1.6);
          const off = n.kind === 'hit' ? 0 : r() * Math.max(0, Math.min(0.8, buf.duration - dur - kindR - 0.2));
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(gain, t + kindA);
          g.gain.setValueAtTime(gain, t + Math.max(kindA, dur));
          g.gain.linearRampToValueAtTime(0, t + Math.max(kindA, dur) + kindR);
          if (n.bend) {
            src.detune.setValueAtTime(src.detune.value, t);
            src.detune.linearRampToValueAtTime(src.detune.value - 40, t + dur);
          }
          src.start(t, off);
          src.stop(t + Math.max(kindA, dur) + kindR + 0.05);
        }
      }
    }

    onProgress && onProgress(0.7, 'Renderizando audio…');
    const rendered = await ctx.startRendering();
    // loop perfecto: la cola de reverberación se suma al principio
    const L = Math.round(score.duration * sr);
    const out = new AudioBuffer({ length: L, numberOfChannels: 2, sampleRate: sr });
    let peak = 0;
    const chans = [0, 1].map(ch => {
      const s = rendered.getChannelData(ch), d = new Float32Array(L);
      d.set(s.subarray(0, L));
      for (let i = 0; i < s.length - L && i < L; i++) d[i] += s[L + i];
      for (let i = 0; i < L; i++) peak = Math.max(peak, Math.abs(d[i]));
      return d;
    });
    const g = peak > 0 ? Math.min(4, 0.92 / peak) : 1;
    chans.forEach((d, ch) => { for (let i = 0; i < L; i++) d[i] *= g; out.copyToChannel(d, ch); });
    onProgress && onProgress(1, 'Listo');
    return { buffer: out, lead: plan.lead, notes: plan.notes };
  }

  function keyName(score) {
    return Analysis.NOTE_NAMES[pc(score.root)] + ' ' + MODE_NAMES[score.mode];
  }

  // WAV 16 bits estéreo
  function toWav(buffer) {
    const nch = buffer.numberOfChannels, len = buffer.length, sr = buffer.sampleRate;
    const ab = new ArrayBuffer(44 + len * nch * 2);
    const v = new DataView(ab);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); v.setUint32(4, 36 + len * nch * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nch, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * nch * 2, true); v.setUint16(32, nch * 2, true);
    v.setUint16(34, 16, true); ws(36, 'data'); v.setUint32(40, len * nch * 2, true);
    const ch = [...Array(nch)].map((_, i) => buffer.getChannelData(i));
    let o = 44;
    for (let i = 0; i < len; i++) for (let c = 0; c < nch; c++) {
      const s = Math.max(-1, Math.min(1, ch[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7FFF, true); o += 2;
    }
    return new Blob([ab], { type: 'audio/wav' });
  }

  return { STYLES, MODES, compose, render, keyName, toWav };
})();
