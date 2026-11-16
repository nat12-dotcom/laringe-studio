/* Laringe Studio — modulación de voz
 * TD-PSOLA: cambia la nota de tu muestra conservando tus formantes (tu timbre),
 * y opcionalmente desplaza los formantes para crear voces nuevas (soprano, bajo...).
 */
const Voice = (() => {
  const A = Analysis;

  // Voces del coro: rango (MIDI) y desplazamiento de formantes respecto a tu voz
  const PARTS = {
    S: { id: 'S', name: 'Soprano', range: [60, 79], formant: 1.12, pan: 0.32 },
    A: { id: 'A', name: 'Contralto', range: [55, 72], formant: 1.05, pan: -0.32 },
    T: { id: 'T', name: 'Tenor', range: [48, 67], formant: 0.96, pan: 0.14 },
    B: { id: 'B', name: 'Bajo', range: [40, 60], formant: 0.88, pan: -0.14 },
  };

  function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normalize(data, peak = 0.9) {
    let m = 0;
    for (let i = 0; i < data.length; i++) m = Math.max(m, Math.abs(data[i]));
    if (m > 0) { const g = peak / m; for (let i = 0; i < data.length; i++) data[i] *= g; }
    return data;
  }

  // Busca el tramo más largo con nota estable
  function findStable(data, sr) {
    const an = A.analyzeBuffer(data, sr);
    const fr = an.frames;
    const voicedM = fr.filter(f => f.f0 > 0).map(f => A.freqToMidi(f.f0));
    if (voicedM.length < 4) return { analysis: an, f0: 0 };
    const med = A.median(voicedM);
    let best = [0, -1], cur = -1;
    for (let i = 0; i < fr.length; i++) {
      const ok = fr[i].f0 > 0 && Math.abs(A.freqToMidi(fr[i].f0) - med) < 1;
      if (ok) { if (cur < 0) cur = i; if (i - cur > best[1] - best[0]) best = [cur, i]; }
      else cur = -1;
    }
    const run = fr.slice(best[0], best[1] + 1);
    const f0 = A.midiToFreq(A.median(run.map(f => A.freqToMidi(f.f0))));
    const start = Math.round(fr[best[0]].t * sr) + 1024;
    const end = Math.round(fr[best[1]].t * sr) + 1024;
    return { analysis: an, f0, start, end, stableSec: (end - start) / sr };
  }

  function pitchMarks(data, start, end, T0) {
    const marks = [];
    let best = start;
    for (let i = start; i < start + T0 && i < data.length; i++) if (data[i] > data[best]) best = i;
    let m = best;
    while (m < end - T0) {
      marks.push(m);
      const lo = Math.round(m + 0.85 * T0), hi = Math.round(m + 1.15 * T0);
      let b = lo;
      for (let i = lo; i <= hi && i < data.length; i++) if (data[i] > data[b]) b = i;
      m = b;
    }
    return marks;
  }

  // Crea una muestra lista para el coro a partir de una grabación
  function makeSample(raw, sr, label = 'Tu voz') {
    const data = normalize(Float32Array.from(raw));
    const st = findStable(data, sr);
    if (!st.f0) throw new Error('sin-nota');
    if (st.stableSec < 0.25) throw new Error('inestable');
    const T0 = sr / st.f0;
    // Guardamos solo el tramo estable (con margen) para que la muestra pese poco
    const pad = Math.round(T0 * 3);
    const s0 = Math.max(0, st.start - pad), s1 = Math.min(data.length, st.end + pad);
    const trimmed = data.slice(s0, s1);
    const marks = pitchMarks(trimmed, st.start - s0, st.end - s0, T0);
    if (marks.length < 6) throw new Error('inestable');
    const an = st.analysis;
    return {
      data: trimmed, sr, f0: st.f0, T0, marks, label,
      vowel: an.vowel || 'a', analysis: an, stableSec: st.stableSec,
    };
  }

  function nearestMark(marks, pos) {
    let lo = 0, hi = marks.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (marks[mid] < pos) lo = mid; else hi = mid; }
    return Math.abs(marks[lo] - pos) < Math.abs(marks[hi] - pos) ? lo : hi;
  }

  // TD-PSOLA con desplazamiento de formantes
  function renderNote(sample, freq, dur, opts = {}) {
    const { formant = 1, vibratoRate = 5.1, vibratoDepth = 0.011, seed = 1, attack = 0.035, release = 0.08 } = opts;
    const sr = sample.sr, src = sample.data, marks = sample.marks;
    const out = new Float32Array(Math.ceil(dur * sr));
    const L = Math.round(sample.T0);
    const gl = Math.max(4, Math.round(L / formant));
    const span = marks[marks.length - 2] - marks[1];
    const rnd = mulberry(seed);
    const vibPhase = rnd() * Math.PI * 2;
    const offset = rnd() * span;
    let t = 0, drift = 0;
    while (t < out.length) {
      const time = t / sr;
      const vd = vibratoDepth * Math.min(1, time / 0.7);
      drift += (rnd() - 0.5) * 0.0015;
      drift *= 0.98;
      const f = freq * (1 + vd * Math.sin(2 * Math.PI * vibratoRate * time + vibPhase) + drift);
      let sp = (t + offset) % (2 * span);
      if (sp > span) sp = 2 * span - sp;
      const c = marks[nearestMark(marks, marks[1] + sp)];
      for (let i = -gl; i < gl; i++) {
        const o = t + i;
        if (o < 0 || o >= out.length) continue;
        const si = c + i * formant;
        const s0 = Math.floor(si);
        if (s0 < 0 || s0 + 1 >= src.length) continue;
        const fr = si - s0;
        const w = 0.5 + 0.5 * Math.cos(Math.PI * i / gl);
        out[o] += (src[s0] * (1 - fr) + src[s0 + 1] * fr) * w;
      }
      t += Math.max(8, Math.round(sr / f));
    }
    // compensa la ganancia de la superposición
    const g = (sr / freq) / gl;
    const na = Math.round(attack * sr), nr = Math.round(release * sr);
    for (let i = 0; i < out.length; i++) {
      let e = g * 0.55;
      if (i < na) e *= i / na;
      if (i > out.length - nr) e *= (out.length - i) / nr;
      out[i] *= e;
    }
    return out;
  }

  // Banco de notas: cachea cada nota/voz ya calculada
  class Bank {
    constructor(sample, opts = {}) {
      this.sample = sample;
      this.keepTimbre = !!opts.keepTimbre;
      this.cache = new Map();
      this.noteSec = 7;
    }
    key(midi, part) { return midi + '_' + part; }
    has(midi, part) { return this.cache.has(this.key(midi, part)); }
    get(midi, part) {
      const k = this.key(midi, part);
      if (this.cache.has(k)) return this.cache.get(k);
      const fm = this.keepTimbre ? 1 : PARTS[part].formant;
      const data = renderNote(this.sample, A.midiToFreq(midi), this.noteSec, {
        formant: fm, seed: midi * 31 + part.charCodeAt(0) * 7,
        vibratoDepth: part === 'B' ? 0.008 : 0.012,
      });
      const ab = new AudioBuffer({ length: data.length, sampleRate: this.sample.sr, numberOfChannels: 1 });
      ab.copyToChannel(data, 0);
      this.cache.set(k, ab);
      return ab;
    }
  }

  // Voz de ejemplo sintética ("aaa" en Sol3) para probar sin micrófono
  function synthExample(sr = 44100, f0 = 196, dur = 2.4) {
    const n = Math.round(sr * dur);
    const g = new Float32Array(n);
    const rnd = mulberry(7);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const vib = 1 + 0.006 * Math.sin(2 * Math.PI * 5 * i / sr);
      ph += f0 * vib * (1 + (rnd() - 0.5) * 0.01) / sr;
      ph -= Math.floor(ph);
      g[i] = ph < 0.4 ? 0.5 * (1 - Math.cos(Math.PI * ph / 0.4)) : ph < 0.6 ? Math.cos(Math.PI * (ph - 0.4) / 0.4) : 0;
    }
    const src = new Float32Array(n);
    for (let i = 1; i < n; i++) src[i] = g[i] - g[i - 1] + (rnd() - 0.5) * 0.004;
    const out = new Float32Array(n);
    const F = [[730, 90, 1], [1090, 110, 0.5], [2440, 170, 0.22], [3400, 250, 0.1]];
    for (const [f, bw, amp] of F) {
      const w0 = 2 * Math.PI * f / sr, Q = f / bw, al = Math.sin(w0) / (2 * Q);
      const a0 = 1 + al, b0 = al / a0, b2 = -al / a0, a1 = -2 * Math.cos(w0) / a0, a2 = (1 - al) / a0;
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < n; i++) {
        const x = src[i];
        const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        out[i] += y * amp;
      }
    }
    for (let i = 0; i < n; i++) {
      const e = Math.min(1, i / (0.08 * sr), (n - i) / (0.1 * sr));
      out[i] *= e;
    }
    return makeSample(out, sr, 'Voz de ejemplo');
  }


  // ---------- Frase con letra ----------
  // Analiza una frase cantada: tono por cuadro, sílabas/notas y marcas de periodo.
  function analyzePhrase(raw, sr, label = 'Tu frase') {
    const data = normalize(Float32Array.from(raw));
    const N = 2048, hop = 512;
    const nF = Math.max(0, Math.floor((data.length - N) / hop) + 1);
    const amp = new Float32Array(nF);
    let peakA = 0;
    for (let i = 0; i < nF; i++) { amp[i] = A.rms(data.subarray(i * hop, i * hop + N)); peakA = Math.max(peakA, amp[i]); }
    // umbral robusto: un golpe de aire o una "s" fuerte no debe tapar el canto
    const sortedA = Array.from(amp).sort((a, b) => a - b);
    const loud = sortedA[Math.floor(sortedA.length * 0.8)] || peakA;
    const thr = Math.max(0.004, Math.min(peakA * 0.08, loud * 0.12));
    const midi = new Float32Array(nF);
    for (let i = 0; i < nF; i++) {
      if (amp[i] < thr) continue;
      const p = A.yin(data.subarray(i * hop, i * hop + N), sr, 70, 1000);
      if (p.f0 > 0 && p.clarity > 0.6) midi[i] = A.freqToMidi(p.f0);
    }
    // limpia saltos de octava y huecos sueltos
    const raw0 = Float32Array.from(midi);
    for (let i = 0; i < nF; i++) {
      if (!raw0[i]) continue;
      const nb = [];
      for (let k = -3; k <= 3; k++) { const j = i + k; if (j >= 0 && j < nF && raw0[j]) nb.push(raw0[j]); }
      const med = A.median(nb);
      if (Math.abs(raw0[i] - med) > 5) midi[i] = med;
    }
    for (let i = 1; i < nF - 1; i++) if (!midi[i] && midi[i - 1] && midi[i + 1] && amp[i] >= thr) midi[i] = (midi[i - 1] + midi[i + 1]) / 2;

    let first = 0; while (first < nF && amp[first] < thr) first++;
    let last = nF - 1; while (last > first && amp[last] < thr) last--;
    if (last - first < 8) throw new Error('corta');
    let voiced = 0;
    for (let i = first; i <= last; i++) if (midi[i]) voiced++;
    if (voiced < 6) throw new Error('sin-nota');
    const start = Math.max(0, first * hop - Math.round(0.03 * sr));
    const end = Math.min(data.length, last * hop + N + Math.round(0.05 * sr));
    const center = i => i * hop + N / 2;

    // segmentos: cada nota/sílaba sonora
    const segs = [];
    let cur = null;
    for (let i = first; i <= last; i++) {
      const m = midi[i];
      if (!m) { if (cur) { segs.push(cur); cur = null; } continue; }
      if (cur && cur.n >= 3) {
        const mean = cur.sum / cur.n;
        if (Math.abs(m - mean) > 1.8 && i + 1 <= last && midi[i + 1] && Math.abs(midi[i + 1] - mean) > 1.8) { segs.push(cur); cur = null; }
      }
      if (!cur) cur = { f0: i, f1: i, sum: 0, n: 0, ms: [] };
      cur.f1 = i; cur.sum += m; cur.n++; cur.ms.push(m);
    }
    if (cur) segs.push(cur);
    const segments = segs.filter(x => x.n >= 2).map(x => ({ a: center(x.f0) - hop / 2, b: center(x.f1) + hop / 2, midi: A.median(x.ms), f0i: x.f0, f1i: x.f1 }));
    if (!segments.length) throw new Error('sin-nota');
    // corrige errores de octava por sílaba (comparando con la mediana de la frase)
    const pm = A.median(segments.map(x => x.midi));
    for (const sg of segments) {
      for (const sh of [-12, 12]) {
        if (Math.abs(sg.midi - pm) > 9 && Math.abs(sg.midi + sh - pm) < Math.abs(sg.midi - pm)) {
          sg.midi += sh;
          for (let i = sg.f0i; i <= sg.f1i; i++) if (midi[i]) midi[i] += sh;
        }
      }
    }
    const segOf = new Int16Array(nF).fill(-1);
    segments.forEach((sg, k) => { for (let i = sg.f0i; i <= sg.f1i; i++) segOf[i] = k; });
    const frameAt = pos => Math.max(0, Math.min(nF - 1, Math.round((pos - N / 2) / hop)));

    // marcas de periodo (una por ciclo de los pliegues vocales)
    const marks = [], markF = [];
    let i = first;
    while (i <= last) {
      if (!midi[i]) { i++; continue; }
      let j = i;
      while (j + 1 <= last && midi[j + 1]) j++;
      const s0 = Math.round(center(i) - hop / 2), s1 = center(j) + hop / 2;
      let T = sr / A.midiToFreq(midi[i]);
      let best = s0;
      for (let q = s0; q < s0 + T && q < data.length; q++) if (data[q] > data[best]) best = q;
      let m = best;
      while (m < s1) {
        const fm = midi[frameAt(m)] || midi[i];
        T = sr / A.midiToFreq(fm);
        marks.push(m); markF.push(A.midiToFreq(fm));
        const lo = Math.round(m + 0.85 * T), hi = Math.round(m + 1.15 * T);
        let b = lo;
        for (let q = lo; q <= hi && q < data.length; q++) if (data[q] > data[b]) b = q;
        if (b <= m) break;
        m = b;
      }
      i = j + 1;
    }
    const mids = segments.map(x => x.midi);
    return {
      data, sr, label, start, end, duration: (end - start) / sr, midi, segments, segOf, marks, markF, frameAt,
      lo: Math.min(...mids), hi: Math.max(...mids),
    };
  }

  // Re-afina y estira la frase: cada sílaba va a su nota objetivo, conservando consonantes y letra.
  function renderPhrase(ph, opts) {
    const { stretch = 1, targets, formant = 1, natural = 0.35, vibrato = 0.006, unvoicedGain = 1 } = opts;
    const sr = ph.sr, src = ph.data, marks = ph.marks;
    const outLen = Math.ceil((ph.end - ph.start) * stretch) + 1;
    const out = new Float32Array(outLen);
    const ug = Math.round(0.006 * sr);
    let t = 0;
    while (t < outLen) {
      const sp = ph.start + t / stretch;
      const fi = ph.frameAt(sp);
      const sm = ph.midi[fi], sk = ph.segOf[fi];
      let step, gl, center, fm = 1, g = 1;
      if (sm && sk >= 0 && marks.length) {
        const seg = ph.segments[sk];
        const f = A.midiToFreq(targets[sk] + (sm - seg.midi) * natural) * (1 + vibrato * Math.sin(2 * Math.PI * 5.3 * t / sr));
        let lo = 0, hi = marks.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (marks[mid] < sp) lo = mid; else hi = mid; }
        const k = Math.abs(marks[lo] - sp) < Math.abs(marks[hi] - sp) ? lo : hi;
        const T0 = sr / ph.markF[k];
        center = Math.abs(marks[k] - sp) > T0 * 2 ? Math.round(sp) : marks[k];
        gl = Math.max(8, Math.round(T0 / formant));
        fm = formant;
        step = Math.max(8, Math.round(sr / f));
      } else {
        center = Math.round(sp); gl = ug; step = ug; g = unvoicedGain;
      }
      const w0 = step / gl * g;
      for (let i = -gl; i < gl; i++) {
        const o = t + i;
        if (o < 0 || o >= outLen) continue;
        const si = center + i * fm, s0 = Math.floor(si);
        if (s0 < 0 || s0 + 1 >= src.length) continue;
        const fr = si - s0;
        out[o] += (src[s0] * (1 - fr) + src[s0 + 1] * fr) * (0.5 + 0.5 * Math.cos(Math.PI * i / gl)) * w0;
      }
      t += step;
    }
    return out;
  }

  // Serialización compacta para guardar perfiles en el navegador (22 kHz, 16 bits)
  function encodeSample(sample) {
    const target = 22050, ratio = sample.sr / target;
    const n = Math.floor(sample.data.length / ratio);
    const i16 = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      const v = sample.data[Math.floor(i * ratio)];
      i16[i] = Math.max(-32767, Math.min(32767, Math.round(v * 32767)));
    }
    const bytes = new Uint8Array(i16.buffer);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return { sr: target, b64: btoa(s), label: sample.label };
  }
  function decodeRaw(enc) {
    const bin = atob(enc.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const i16 = new Int16Array(bytes.buffer);
    const f = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) f[i] = i16[i] / 32767;
    return f;
  }
  const decodeSample = enc => makeSample(decodeRaw(enc), enc.sr, enc.label);
  const decodePhrase = enc => analyzePhrase(decodeRaw(enc), enc.sr, enc.label);

  return { PARTS, Bank, makeSample, renderNote, synthExample, encodeSample, decodeSample, analyzePhrase, renderPhrase, decodePhrase, mulberry };
})();
