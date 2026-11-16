/* Laringe Studio — análisis de voz
 * Detección de tono (YIN), formantes (LPC), vocal, tipo de voz y huella vocal (LTAS).
 */
const Analysis = (() => {
  const NOTE_NAMES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
  const freqToMidi = f => 69 + 12 * Math.log2(f / 440);
  const midiToFreq = m => 440 * Math.pow(2, (m - 69) / 12);
  const noteName = m => {
    const r = Math.round(m);
    return NOTE_NAMES[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1);
  };
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

  function rms(b) {
    let s = 0;
    for (let i = 0; i < b.length; i++) s += b[i] * b[i];
    return Math.sqrt(s / b.length);
  }

  function decimate(buf, factor) {
    if (factor <= 1) return buf;
    const n = Math.floor(buf.length / factor);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < factor; k++) s += buf[i * factor + k];
      out[i] = s / factor;
    }
    return out;
  }

  // YIN: frecuencia fundamental = vibración de los pliegues vocales
  function yin(buf, sr, minF = 65, maxF = 1000) {
    let x = buf, rate = sr;
    if (sr > 30000) { x = decimate(buf, 2); rate = sr / 2; }
    const maxTau = Math.min(Math.floor(rate / minF), Math.floor(x.length / 2));
    const minTau = Math.max(2, Math.floor(rate / maxF));
    const W = x.length - maxTau;
    const d = new Float32Array(maxTau + 1);
    for (let tau = 1; tau <= maxTau; tau++) {
      let s = 0;
      for (let j = 0; j < W; j++) { const df = x[j] - x[j + tau]; s += df * df; }
      d[tau] = s;
    }
    const c = new Float32Array(maxTau + 1);
    c[0] = 1;
    let run = 0;
    for (let tau = 1; tau <= maxTau; tau++) { run += d[tau]; c[tau] = run > 0 ? d[tau] * tau / run : 1; }
    let tau = -1;
    for (let t = minTau; t <= maxTau; t++) {
      if (c[t] < 0.15) { while (t + 1 <= maxTau && c[t + 1] < c[t]) t++; tau = t; break; }
    }
    if (tau < 0) {
      let mi = minTau;
      for (let t = minTau; t <= maxTau; t++) if (c[t] < c[mi]) mi = t;
      if (c[mi] > 0.35) return { f0: 0, clarity: 1 - c[mi] };
      tau = mi;
    }
    let bt = tau;
    if (tau > 1 && tau < maxTau) {
      const a = c[tau - 1], b = c[tau], cc = c[tau + 1];
      const den = a - 2 * b + cc;
      if (den !== 0) bt = tau + 0.5 * (a - cc) / den;
    }
    return { f0: rate / bt, clarity: 1 - c[tau] };
  }

  // LPC: forma del tracto vocal -> formantes F1, F2, F3
  function lpcFormants(buf, sr) {
    const factor = Math.max(1, Math.round(sr / 11025));
    const x = decimate(buf, factor);
    const rate = sr / factor;
    const n = x.length;
    const w = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const pe = x[i] - 0.94 * (i > 0 ? x[i - 1] : 0);
      w[i] = pe * (0.54 - 0.46 * Math.cos(2 * Math.PI * i / (n - 1)));
    }
    const p = 12;
    const r = new Float64Array(p + 1);
    for (let k = 0; k <= p; k++) { let s = 0; for (let i = k; i < n; i++) s += w[i] * w[i - k]; r[k] = s; }
    if (r[0] <= 1e-9) return null;
    r[0] *= 1.0001;
    const a = new Float64Array(p + 1);
    a[0] = 1;
    let e = r[0];
    for (let i = 1; i <= p; i++) {
      let acc = r[i];
      for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
      const k = -acc / e;
      const tmp = a.slice();
      for (let j = 1; j < i; j++) a[j] = tmp[j] + k * tmp[i - j];
      a[i] = k;
      e *= (1 - k * k);
      if (e <= 0) return null;
    }
    const N = 300, fmax = Math.min(5000, rate / 2 - 50);
    const env = new Float32Array(N);
    for (let b = 0; b < N; b++) {
      const om = 2 * Math.PI * (b / (N - 1) * fmax) / rate;
      let re = 0, im = 0;
      for (let k = 0; k <= p; k++) { re += a[k] * Math.cos(om * k); im -= a[k] * Math.sin(om * k); }
      env[b] = -10 * Math.log10(re * re + im * im + 1e-12);
    }
    const peaks = [];
    for (let b = 1; b < N - 1; b++) {
      if (env[b] > env[b - 1] && env[b] >= env[b + 1]) {
        const f = b / (N - 1) * fmax;
        if (f > 180) peaks.push(f);
      }
    }
    return { F1: peaks[0] || 0, F2: peaks[1] || 0, F3: peaks[2] || 0, env, fmax };
  }

  // Vocales del español (valores medios de F1/F2 en Hz)
  const VOWELS = { a: [750, 1300], e: [480, 1850], i: [300, 2250], o: [500, 950], u: [330, 800] };
  function vowel(F1, F2) {
    if (!F1 || !F2) return null;
    let best = null, bd = 1e9;
    for (const v in VOWELS) {
      const [a, b] = VOWELS[v];
      const d = Math.log(F1 / a) ** 2 + 0.7 * Math.log(F2 / b) ** 2;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  const VOICE_TYPES = [
    { id: 'bajo', name: 'Bajo', center: 50, range: [40, 64] },
    { id: 'baritono', name: 'Barítono', center: 55, range: [45, 69] },
    { id: 'tenor', name: 'Tenor', center: 59, range: [48, 72] },
    { id: 'contralto', name: 'Contralto', center: 63, range: [53, 77] },
    { id: 'mezzo', name: 'Mezzosoprano', center: 67, range: [57, 81] },
    { id: 'soprano', name: 'Soprano', center: 71, range: [60, 84] },
  ];
  function classifyVoice(lo, hi, med) {
    let best = VOICE_TYPES[0], bs = -1e9;
    for (const vt of VOICE_TYPES) {
      const ov = Math.max(0, Math.min(hi, vt.range[1]) - Math.max(lo, vt.range[0]));
      const s = ov / Math.max(1, hi - lo) * 3 - Math.abs(med - vt.center) / 3;
      if (s > bs) { bs = s; best = vt; }
    }
    return best;
  }

  function fftPow(input) {
    const n = input.length;
    const r = Float64Array.from(input), im = new Float64Array(n);
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { const t = r[i]; r[i] = r[j]; r[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let j = 0; j < h; j++) {
          const p = i + j, q = p + h;
          const br = r[q] * cr - im[q] * ci, bi = r[q] * ci + im[q] * cr;
          r[q] = r[p] - br; im[q] = im[p] - bi;
          r[p] += br; im[p] += bi;
          const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
    const m = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) m[i] = r[i] * r[i] + im[i] * im[i];
    return m;
  }

  const median = arr => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const pct = (arr, p) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(s.length * p))];
  };

  // Analiza una grabación completa: devuelve la "huella" de la voz
  function analyzeBuffer(data, sr) {
    const N = 2048, hop = 1024, NB = 24;
    const win = new Float64Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    const frames = [];
    const ltasP = new Float64Array(N / 2);
    let ltasCount = 0;
    const tmp = new Float64Array(N);
    for (let s = 0; s + N <= data.length; s += hop) {
      const fr = data.subarray(s, s + N);
      const a = rms(fr);
      const f = { t: s / sr, f0: 0, a };
      if (a >= 0.008) {
        const p = yin(fr, sr);
        if (p.f0 > 0 && p.clarity > 0.7) {
          f.f0 = p.f0;
          const fm = lpcFormants(fr, sr);
          if (fm) { f.F1 = fm.F1; f.F2 = fm.F2; f.F3 = fm.F3; }
          for (let i = 0; i < N; i++) tmp[i] = fr[i] * win[i];
          const m = fftPow(tmp);
          for (let i = 0; i < N / 2; i++) ltasP[i] += m[i];
          ltasCount++;
        }
      }
      frames.push(f);
    }
    const voiced = frames.filter(f => f.f0 > 0);
    const midis = voiced.map(f => freqToMidi(f.f0));
    const ltas = new Array(NB).fill(0);
    if (ltasCount) {
      const lo = Math.log(100), hi = Math.log(8000);
      for (let b = 0; b < NB; b++) {
        const f0 = Math.exp(lo + (hi - lo) * b / NB), f1 = Math.exp(lo + (hi - lo) * (b + 1) / NB);
        const i0 = Math.max(1, Math.floor(f0 * N / sr)), i1 = Math.max(i0 + 1, Math.ceil(f1 * N / sr));
        let s = 0;
        for (let i = i0; i < i1 && i < N / 2; i++) s += ltasP[i];
        ltas[b] = 10 * Math.log10(s / (i1 - i0) / ltasCount + 1e-12);
      }
      const mean = ltas.reduce((x, y) => x + y, 0) / NB;
      for (let b = 0; b < NB; b++) ltas[b] -= mean;
    }
    const F1 = median(voiced.map(f => f.F1).filter(Boolean));
    const F2 = median(voiced.map(f => f.F2).filter(Boolean));
    const F3 = median(voiced.map(f => f.F3).filter(Boolean));
    const vc = {};
    voiced.forEach(f => { const v = vowel(f.F1, f.F2); if (v) vc[v] = (vc[v] || 0) + 1; });
    const vw = Object.keys(vc).sort((a, b) => vc[b] - vc[a])[0] || null;
    const medMidi = median(midis);
    const lo = pct(midis, 0.05), hi = pct(midis, 0.95);
    return {
      frames,
      voicedRatio: frames.length ? voiced.length / frames.length : 0,
      f0Median: medMidi ? midiToFreq(medMidi) : 0,
      lo, hi, F1, F2, F3, ltas,
      vowel: vw,
      voiceType: medMidi ? classifyVoice(lo, hi, medMidi) : null,
    };
  }

  // Similitud entre dos huellas vocales (0..1)
  function similarity(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.ltas.length; i++) { dot += a.ltas[i] * b.ltas[i]; na += a.ltas[i] ** 2; nb += b.ltas[i] ** 2; }
    const sL = Math.max(0, dot / Math.sqrt(na * nb + 1e-9));
    const lr = (x, y, d) => Math.abs(Math.log((x || d) / (y || d)));
    const fd = lr(a.F1, b.F1, 500) + lr(a.F2, b.F2, 1500) + lr(a.F3, b.F3, 2500);
    const sF = Math.exp(-fd * 3);
    const pd = (a.f0Median && b.f0Median) ? Math.abs(freqToMidi(a.f0Median) - freqToMidi(b.f0Median)) : 12;
    const sP = Math.exp(-pd / 4);
    return 0.5 * sL + 0.25 * sF + 0.25 * sP;
  }

  return {
    NOTE_NAMES, VOICE_TYPES, VOWELS, freqToMidi, midiToFreq, noteName, clamp,
    rms, yin, lpcFormants, vowel, classifyVoice, analyzeBuffer, similarity, median, fftPow, decimate,
  };
})();
