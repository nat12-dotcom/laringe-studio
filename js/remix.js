/* Laringe Studio — remix con una instrumental externa
 * Escucha la instrumental (tempo, compás, tonalidad, acordes y energía) y arma la
 * partitura sobre la que se coloca tu voz.
 */
const Remix = (() => {
  const A = Analysis;
  // perfiles de tonalidad de Krumhansl–Schmuckler
  const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  const tick = () => new Promise(r => setTimeout(r, 0));

  function pearson(a, b) {
    const n = a.length;
    const ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
    return num / Math.sqrt(da * db + 1e-12);
  }

  async function analyze(ab, onP) {
    // remuestreo de calidad a 11 025 Hz (y a mono) con el propio navegador
    const rate = 11025;
    const oc = new OfflineAudioContext(1, Math.ceil(ab.duration * rate), rate);
    const srcNode = oc.createBufferSource(); srcNode.buffer = ab; srcNode.connect(oc.destination); srcNode.start(0);
    onP && onP(0.02, 'Preparando la instrumental…');
    const x = (await oc.startRendering()).getChannelData(0);
    const N = 1024, hop = 256, nb = N / 2;
    const nF = Math.max(0, Math.floor((x.length - N) / hop));
    if (nF < 200) throw new Error('corta');
    const win = new Float64Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    const binPc = new Int8Array(nb).fill(-1);
    for (let i = 1; i < nb; i++) {
      const fq = i * rate / N;
      if (fq >= 100 && fq <= 2500) binPc[i] = ((Math.round(12 * Math.log2(fq / 440)) + 69) % 12 + 12) % 12;
    }
    const lowMax = Math.ceil(150 * N / rate);
    const flux = new Float32Array(nF), low = new Float32Array(nF), rmsF = new Float32Array(nF), chroma = new Float32Array(nF * 12);
    const prev = new Float32Array(nb), buf = new Float64Array(N);
    const tot = new Array(12).fill(0);
    for (let k = 0; k < nF; k++) {
      const o = k * hop;
      let s2 = 0;
      for (let i = 0; i < N; i++) { const v = x[o + i]; buf[i] = v * win[i]; s2 += v * v; }
      rmsF[k] = Math.sqrt(s2 / N);
      const p = A.fftPow(buf);
      let fl = 0, lo = 0;
      for (let i = 1; i < nb; i++) {
        const amp = Math.sqrt(p[i]);
        const mag = Math.log1p(amp * 10);
        const d = mag - prev[i];
        if (d > 0) fl += d;
        prev[i] = mag;
        if (i <= lowMax) lo += amp;
        if (binPc[i] >= 0) chroma[k * 12 + binPc[i]] += amp;
      }
      flux[k] = fl; low[k] = lo;
      // tonalidad: cada cuadro cuenta igual (normalizado), así los golpes fuertes no dominan
      let cn = 0;
      for (let j = 0; j < 12; j++) cn += chroma[k * 12 + j];
      if (cn > 1e-6 && rmsF[k] > 0.005) for (let j = 0; j < 12; j++) tot[j] += chroma[k * 12 + j] / cn;
      if (k % 500 === 0) { onP && onP(k / nF * 0.85, 'Escuchando la instrumental…'); await tick(); }
    }
    // realce de ataques: se resta la media local
    const fluxN = new Float32Array(nF);
    for (let k = 0; k < nF; k++) {
      let s = 0, c = 0;
      for (let j = Math.max(0, k - 10); j <= Math.min(nF - 1, k + 10); j++) { s += flux[j]; c++; }
      fluxN[k] = Math.max(0, flux[k] - s / c);
    }
    const fr = rate / hop;
    // tempo por autocorrelación de los ataques
    const lagMin = Math.floor(60 * fr / 190), lagMax = Math.ceil(60 * fr / 60);
    const ac = new Float64Array(2 * lagMax + 3);
    for (let l = lagMin; l <= 2 * lagMax + 2 && l < nF; l++) {
      let s = 0;
      for (let i = 0; i + l < nF; i++) s += fluxN[i] * fluxN[i + l];
      ac[l] = s / (nF - l);
    }
    let best = lagMin, bs = -1;
    for (let l = lagMin; l <= lagMax; l++) {
      const bpm = 60 * fr / l;
      const w = Math.exp(-0.5 * (Math.log2(bpm / 105) / 1.0) ** 2);
      // un pulso real suele tener también subdivisiones (mitad del periodo) y compases (doble)
      const sc = (ac[l] + 0.5 * (ac[2 * l] || 0) + 0.5 * (ac[Math.round(l / 2)] || 0)) * w;
      if (sc > bs) { bs = sc; best = l; }
    }
    let P = best;
    if (best > lagMin && best < lagMax) {
      const a = ac[best - 1], b = ac[best], c = ac[best + 1], den = a - 2 * b + c;
      if (den !== 0) P = best + 0.5 * (a - c) / den;
    }
    // fase del pulso y primer tiempo fuerte (el bombo suele caer en el 1)
    let phase = 0, ps = -1;
    for (let ph = 0; ph < P; ph += 0.5) {
      let s = 0;
      for (let t = ph; t < nF; t += P) s += fluxN[Math.round(t)] || 0;
      if (s > ps) { ps = s; phase = ph; }
    }
    // ataques de graves (bombo / bajo que entra): marcan el primer tiempo del compás
    const lowOn = new Float32Array(nF);
    for (let k = 1; k < nF; k++) lowOn[k] = Math.max(0, low[k] - low[k - 1]);
    const lowMean = lowOn.reduce((s, v) => s + v, 0) / nF || 1;
    const fluxMean = fluxN.reduce((s, v) => s + v, 0) / nF || 1;
    let down = 0, ds = -1;
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let t = phase + j * P; t < nF; t += 4 * P) {
        const i = Math.round(t);
        const lo = Math.max(lowOn[i] || 0, lowOn[i + 1] || 0, lowOn[i - 1] || 0);
        s += lo / lowMean + 0.3 * (fluxN[i] || 0) / fluxMean;
      }
      if (s > ds) { ds = s; down = j; }
    }
    const center = N / 2 / hop;
    let down0 = (phase + down * P + center) / fr;
    const barDur = 4 * P / fr;
    while (down0 - barDur >= -0.02) down0 -= barDur;
    down0 = Math.max(0, down0);
    // análisis armónico fino (ventanas de 4096): los graves se distinguen mejor
    const N2 = 4096, hop2 = 1024, nb2 = N2 / 2;
    const nF2 = Math.max(1, Math.floor((x.length - N2) / hop2));
    const win2 = new Float64Array(N2);
    for (let i = 0; i < N2; i++) win2[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N2 - 1));
    const pc2 = new Int8Array(nb2).fill(-1);
    for (let i = 1; i < nb2; i++) {
      const fq = i * rate / N2;
      if (fq >= 65 && fq <= 1100) pc2[i] = ((Math.round(12 * Math.log2(fq / 440)) + 69) % 12 + 12) % 12;
    }
    const chroma2 = new Float32Array(nF2 * 12), rms2 = new Float32Array(nF2);
    const tot2 = new Array(12).fill(0), totLog = new Array(12).fill(0);
    const buf2 = new Float64Array(N2);
    for (let k = 0; k < nF2; k++) {
      let s2 = 0;
      for (let i = 0; i < N2; i++) { const v = x[k * hop2 + i]; buf2[i] = v * win2[i]; s2 += v * v; }
      rms2[k] = Math.sqrt(s2 / N2);
      const p = A.fftPow(buf2);
      let cn = 0, cl = 0;
      const lg = new Float64Array(12);
      for (let i = 1; i < nb2; i++) if (pc2[i] >= 0) { const a = Math.sqrt(p[i]); chroma2[k * 12 + pc2[i]] += a; cn += a; const l = Math.log1p(a * 50); lg[pc2[i]] += l; cl += l; }
      if (cn > 1e-6 && rms2[k] > 0.005) for (let j = 0; j < 12; j++) { tot2[j] += chroma2[k * 12 + j] / cn; totLog[j] += lg[j] / cl; }
      if (k % 200 === 0) { onP && onP(0.85 + k / nF2 * 0.15, 'Buscando la tonalidad…'); await tick(); }
    }
    // tonalidad
    let key = { pc: 0, mode: 'ionian', score: -4 };
    for (let rt = 0; rt < 12; rt++) {
      const rot = arr => arr.map((_, i) => arr[(i - rt + 12) % 12]);
      // dos lecturas del espectro (lineal y comprimida) se suman: resuelve casos ambiguos
      const sMaj = pearson(tot2, rot(MAJ)) + pearson(totLog, rot(MAJ)), sMin = pearson(tot2, rot(MIN)) + pearson(totLog, rot(MIN));
      if (sMaj > key.score) key = { pc: rt, mode: 'ionian', score: sMaj };
      if (sMin > key.score) key = { pc: rt, mode: 'aeolian', score: sMin };
    }
    onP && onP(1, 'Instrumental analizada');
    return { duration: ab.duration, fr, nF, P, down0, rmsF, chroma, keyPc: key.pc, keyMode: key.mode, center, chroma2, rms2, nF2, fr2: rate / hop2, center2: N2 / 2 / hop2 };
  }

  // Partitura de la instrumental: compases, acordes y secciones (según su energía)
  function buildScore(an, o = {}) {
    const MODES = Music.MODES;
    const mul = o.bpmMul || 1;
    const P = an.P / mul;
    const beat = P / an.fr, bpm = 60 / beat, barDur = 4 * beat;
    let offset = an.down0 + (o.shiftBeats || 0) * beat;
    offset = ((offset % barDur) + barDur) % barDur;
    const bars = Math.floor((an.duration - offset) / barDur + 0.02);
    if (bars < 4) throw new Error('corta');
    const keyPc = o.keyPc != null ? o.keyPc : an.keyPc;
    const mode = o.mode || an.keyMode;
    let root = 48 + keyPc;
    while (root > 54) root -= 12;
    while (root < 43) root += 12;
    const deg2midi = (deg) => root + MODES[mode][((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);
    const chords = [], energy = [];
    for (let b = 0; b < bars; b++) {
      const t0 = offset + b * barDur, t1 = t0 + barDur;
      const f0 = Math.max(0, Math.round(t0 * an.fr)), f1 = Math.min(an.nF, Math.round(t1 * an.fr));
      let e = 0;
      for (let k = f0; k < f1; k++) e += an.rmsF[k];
      energy.push(e / Math.max(1, f1 - f0));
      const g0 = Math.max(0, Math.round(t0 * an.fr2 - an.center2)), g1 = Math.min(an.nF2, Math.max(g0 + 1, Math.round(t1 * an.fr2 - an.center2)));
      const ch = new Array(12).fill(0);
      for (let k = g0; k < g1; k++) for (let j = 0; j < 12; j++) ch[j] += an.chroma2[k * 12 + j];
      const norm = Math.sqrt(ch.reduce((s, v) => s + v * v, 0)) || 1;
      let bestDeg = 0, bsc = -1;
      for (let deg = 0; deg < 7; deg++) {
        const tones = [0, 2, 4].map(k => deg2midi(deg + k));
        let sc = 0;
        tones.forEach((m, i) => { sc += ch[((m % 12) + 12) % 12] * (i === 0 ? 1.2 : 1); });
        sc = sc / norm * (deg === 0 ? 1.05 : 1);
        if (sc > bsc) { bsc = sc; bestDeg = deg; }
      }
      const tones = [0, 2, 4].map(k => deg2midi(bestDeg + k));
      chords.push({ deg: bestDeg, tones, pcs: tones.map(m => ((m % 12) + 12) % 12) });
    }
    // secciones por bloques de 4 compases: los más enérgicos son estribillos
    const blocks = [];
    for (let b = 0; b < bars; b += 4) {
      const seg = energy.slice(b, Math.min(bars, b + 4));
      blocks.push({ start: b, bars: seg.length, e: seg.reduce((s, v) => s + v, 0) / seg.length });
    }
    const sorted = blocks.map(x => x.e).sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    const hi = sorted[Math.floor(sorted.length * 0.6)];
    blocks.forEach((x, i) => {
      x.type = x.e >= hi && x.e > med * 1.05 ? 'chorus' : 'verse';
      if (i === 0 && blocks.length > 3 && x.e < med * 0.8) x.type = 'intro';
      if (i === blocks.length - 1 && blocks.length > 4 && x.e < med * 0.9) x.type = 'outro';
    });
    // sin cambios claros de energía: verso y estribillo se alternan cada 8 compases
    if (!blocks.some(x => x.type === 'chorus')) {
      let j = 0;
      blocks.forEach(x => { if (x.type === 'verse') { x.type = Math.floor(j / 2) % 2 === 1 ? 'chorus' : 'verse'; j++; } });
    }
    const sections = [];
    let nv = 0;
    for (const x of blocks) {
      const lastS = sections[sections.length - 1];
      if (lastS && lastS.type === x.type) { lastS.bars += x.bars; continue; }
      const name = x.type === 'verse' ? `Verso ${++nv}` : { intro: 'Intro', outro: 'Final', chorus: 'Estribillo' }[x.type];
      sections.push({ type: x.type, name, start: x.start, bars: x.bars, lvl: { intro: 0, outro: 0, verse: 1, chorus: 2 }[x.type] });
    }
    const barSec = [];
    sections.forEach((sc, i) => { for (let b = 0; b < sc.bars; b++) barSec.push(i); });
    return {
      styleId: 'remix', st: { name: 'Remix' }, remix: true, song: true,
      bpm: Math.round(bpm), beat, barDur, bars, offset, root, mode, chords, melody: [],
      sections, barSec, barLvl: barSec.map(i => sections[i].lvl), duration: an.duration, seed: 1,
    };
  }

  return { analyze, buildScore };
})();
