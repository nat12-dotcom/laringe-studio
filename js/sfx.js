/* Laringe Studio — generador de efectos de sonido
 * Lee una descripción en español ("rugido de dragón gigante y lejano") y sintetiza
 * el sonido con recetas de diseño sonoro. Los ambientes salen como loop sin cortes.
 */
const SFX = (() => {
  const SR = 44100;
  const tick = () => new Promise(r => setTimeout(r, 0));
  const norm = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // ---------- Kit de síntesis sobre un OfflineAudioContext ----------
  function makeKit(ctx, out, rnd) {
    const white = ctx.createBuffer(1, SR * 3, SR);
    { const d = white.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; }
    const brown = ctx.createBuffer(1, SR * 3, SR);
    { const d = brown.getChannelData(0); let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (rnd() * 2 - 1)) / 1.02; d[i] = l * 3.5; } }
    const k = {
      ctx, out, rnd,
      r: (a, b) => a + (b - a) * rnd(),
      noise(t, dur, type = 'white') {
        t = Math.max(0, t);
        const s = ctx.createBufferSource(); s.buffer = type === 'brown' ? brown : white; s.loop = true;
        s.start(t, rnd() * 2); s.stop(t + dur + 0.05); return s;
      },
      osc(type, f, t, dur) { t = Math.max(0, t); const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(t); o.stop(t + dur + 0.05); return o; },
      filt(type, f, q = 0.7, gain = 0) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gain; return b; },
      gain(v = 1) { const g = ctx.createGain(); g.gain.value = v; return g; },
      // envolvente: ataque lineal, sostenido, caída exponencial
      env(param, t, a, hold, rel, peak) {
        t = Math.max(0, t);
        param.setValueAtTime(0.0001, t);
        param.linearRampToValueAtTime(peak, t + Math.max(0.001, a));
        param.setValueAtTime(peak, t + a + hold);
        param.exponentialRampToValueAtTime(0.0001, t + a + hold + Math.max(0.01, rel));
      },
      dist(amount) {
        const sh = ctx.createWaveShaper(), n = 2048, c = new Float32Array(n);
        for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * amount) / Math.tanh(amount); }
        sh.curve = c; sh.oversample = '2x'; return sh;
      },
      pan(v) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, v)); return p; },
      // golpe grave (bombo / impacto)
      thump(t, f0, f1, dur, vel, dest = out) {
        t = Math.max(0, t);
        const o = k.osc('sine', f0, t, dur), g = k.gain(0);
        o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur * 0.7);
        k.env(g.gain, t, 0.003, 0, dur, vel); o.connect(g).connect(dest);
      },
      // ráfaga de ruido filtrado
      burst(t, dur, type, f, q, vel, dest = out, a = 0.002, f2 = null) {
        t = Math.max(0, t);
        const n = k.noise(t, dur + 0.1), fl = k.filt(type, f, q), g = k.gain(0);
        if (f2) { fl.frequency.setValueAtTime(f, t); fl.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur); }
        k.env(g.gain, t, a, 0, dur, vel); n.connect(fl).connect(g).connect(dest);
      },
      // nota tonal con envolvente
      tone(t, type, f, dur, vel, dest = out, a = 0.005, f2 = null, rel = null) {
        t = Math.max(0, t);
        const o = k.osc(type, f, t, dur + (rel || 0.05)), g = k.gain(0);
        if (f2) { o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur); }
        k.env(g.gain, t, a, Math.max(0, dur - a - (rel || dur * 0.6)), rel || dur * 0.6, vel); o.connect(g).connect(dest);
      },
      // parciales inarmónicos (metal, campana)
      ring(t, f, ratios, dur, vel, dest = out) {
        ratios.forEach((r, i) => k.tone(t, 'sine', f * r, dur / (1 + i * 0.35), vel / (1 + i * 0.6), dest, 0.002, null, dur / (1 + i * 0.35)));
      },
    };
    return k;
  }

  // ---------- Recetas ----------
  // P: { pitch (1 = normal, <1 más grave), dur, power, rnd, mods, voice }
  const R = {};
  const def = (id, cat, name, kw, dur, build, loop = false) => { R[id] = { id, cat, name, kw, dur, build, loop }; };
  // sonidos de interfaz y arcade: casi sin reverberación
  const DRY = new Set(['click', 'moneda', 'salto', 'dano', 'laser', 'subirnivel', 'gameover', 'victoria', 'golpe']);

  // --- Jefes y criaturas ---
  function creature(k, P, t0, opt) {
    const { base, glide, rough, len, formants } = opt;
    const dur = P.dur, out = k.out;
    const d = k.dist(rough), lp = k.filt('lowpass', 2600 * P.pitch, 0.7), bus = k.gain(P.power);
    d.connect(lp).connect(bus).connect(out);
    // garganta: dientes de sierra desafinados con vibrato
    for (const det of [-14, 0, 11]) {
      const o = k.osc('sawtooth', base * P.pitch, t0, dur);
      o.detune.value = det + k.r(-6, 6);
      o.frequency.setValueAtTime(base * P.pitch * glide[0], t0);
      o.frequency.linearRampToValueAtTime(base * P.pitch * glide[1], t0 + dur * 0.35);
      o.frequency.exponentialRampToValueAtTime(base * P.pitch * glide[2], t0 + dur);
      const lfo = k.osc('sine', k.r(5, 9), t0, dur), lg = k.gain(base * P.pitch * 0.05);
      lfo.connect(lg).connect(o.frequency);
      const g = k.gain(0);
      k.env(g.gain, t0, dur * 0.12, dur * 0.45, dur * 0.43, 0.22);
      o.connect(g);
      // resonancias de la boca
      formants.forEach(([f, q, v]) => { const b = k.filt('bandpass', f * Math.sqrt(P.pitch), q); const bg = k.gain(v); g.connect(b).connect(bg).connect(d); });
    }
    // aire y rasgado
    const n = k.noise(t0, dur), nb = k.filt('bandpass', 900 * P.pitch, 0.8), ng = k.gain(0);
    k.env(ng.gain, t0, dur * 0.1, dur * 0.5, dur * 0.4, 0.35 * len);
    n.connect(nb).connect(ng).connect(d);
    // tu voz convertida en criatura
    if (P.voiceBuf) {
      const s = k.ctx.createBufferSource(); s.buffer = P.voiceBuf;
      const vg = k.gain(0), vd = k.dist(rough * 0.8), vl = k.filt('lowpass', 3200 * P.pitch, 0.7);
      k.env(vg.gain, t0, 0.04, Math.max(0.05, Math.min(dur, P.voiceBuf.duration) - 0.3), 0.3, 1.1);
      s.connect(vd).connect(vl).connect(vg).connect(bus);
      s.start(t0);
    }
  }
  def('rugido', 'jefe', 'Rugido', ['rugido', 'ruge', 'rugir', 'dragon', 'bestia', 'leon', 'tigre', 'jefe', 'boss', 'titan', 'gigante enojado'], [1.6, 3],
    (k, P) => creature(k, P, 0.02, { base: 70, glide: [0.8, 1.15, 0.6], rough: 6, len: 1, formants: [[500, 4, 1.2], [1100, 5, 0.7], [2300, 6, 0.3]] }));
  def('gruñido', 'jefe', 'Gruñido', ['gruñido', 'grunido', 'gruñe', 'grune', 'gruñir', 'orco', 'ogro', 'troll', 'zombi', 'zombie', 'monstruo', 'criatura', 'oso', 'lobo'], [0.9, 1.8],
    (k, P) => creature(k, P, 0.02, { base: 55, glide: [0.9, 1.0, 0.75], rough: 9, len: 0.8, formants: [[380, 5, 1.3], [800, 5, 0.6], [2000, 6, 0.2]] }));
  def('grito', 'jefe', 'Grito / chillido', ['grito', 'chillido', 'chilla', 'alarido', 'murcielago', 'harpia', 'banshee', 'bruja', 'arana', 'insecto', 'screech'], [0.6, 1.4],
    (k, P) => creature(k, P, 0.01, { base: 420, glide: [1.0, 1.35, 0.7], rough: 4, len: 1.2, formants: [[1300, 4, 1.2], [2600, 5, 0.8], [4200, 6, 0.4]] }));
  def('risa', 'jefe', 'Risa malvada', ['risa', 'rie', 'carcajada', 'malvado', 'malvada', 'villano', 'hechicero', 'brujo'], [1.8, 2.6], (k, P) => {
    const n = Math.round(4 + P.dur * 1.5);
    for (let i = 0; i < n; i++) {
      const t = 0.05 + i * (P.dur / n) * k.r(0.9, 1.05);
      creature(k, { ...P, dur: P.dur / n * 0.8, voiceBuf: i === 0 ? P.voiceBuf : null, power: P.power * (1 - i / n * 0.4) }, t,
        { base: 110 - i * 4, glide: [1.15, 1.05, 0.85], rough: 3, len: 1.4, formants: [[700, 4, 1.2], [1200, 5, 0.8], [2500, 6, 0.3]] });
    }
  });
  def('aparicion', 'jefe', 'Aparición del jefe', ['aparicion', 'aparece', 'entrada', 'llega', 'invocacion', 'invoca', 'despierta', 'surge'], [3, 5], (k, P) => {
    const d = P.dur;
    k.burst(0, d * 0.8, 'lowpass', 120, 0.7, 0.5 * P.power, k.out, d * 0.7, 900);
    for (const f of [41, 61.5, 82]) k.tone(0, 'sawtooth', f * P.pitch, d, 0.07 * P.power, k.out, d * 0.6, null, d * 0.3);
    k.thump(d * 0.8, 90, 30, 2.2, 1.0 * P.power);
    k.burst(d * 0.8, 2, 'lowpass', 2000, 0.7, 0.5 * P.power, k.out, 0.005, 200);
    creature(k, { ...P, dur: Math.min(2.2, d * 0.5) }, d * 0.8, { base: 65, glide: [0.8, 1.1, 0.6], rough: 6, len: 1, formants: [[480, 4, 1.2], [1000, 5, 0.6]] });
  });
  def('muerte', 'jefe', 'Derrota del jefe', ['muerte', 'muere', 'derrota', 'derrotado', 'vencido', 'cae', 'desintegra', 'agonia'], [2.5, 4], (k, P) => {
    creature(k, { ...P, dur: P.dur * 0.7 }, 0.02, { base: 80, glide: [1.1, 0.9, 0.35], rough: 7, len: 1, formants: [[500, 4, 1.2], [1100, 5, 0.6]] });
    R.explosion.build(k, { ...P, dur: P.dur * 0.6, t0: P.dur * 0.45 });
  });
  def('golpejefe', 'jefe', 'Golpe de jefe', ['pisoton', 'golpe de jefe', 'terremoto', 'temblor', 'aplasta', 'estampida', 'martillo'], [1.2, 2], (k, P) => {
    k.thump(0, 70 * P.pitch, 25, P.dur, 1.2 * P.power);
    k.burst(0, P.dur * 0.8, 'lowpass', 600 * P.pitch, 0.7, 0.8 * P.power, k.out, 0.003, 80);
    for (let i = 0; i < 18; i++) k.burst(k.r(0.05, P.dur * 0.7), 0.05, 'bandpass', k.r(1500, 4000), 2, 0.08 * P.power);
  });

  def('ladrido', 'jefe', 'Ladrido / bestia', ['ladrido', 'ladra', 'ladrando', 'perro', 'sabueso', 'cerbero', 'chacal', 'hiena'], [0.9, 1.4], (k, P) => {
    const n = 2 + Math.floor(k.rnd() * 2);
    for (let i = 0; i < n; i++) creature(k, { ...P, dur: 0.22, voiceBuf: null }, 0.02 + i * k.r(0.28, 0.4),
      { base: 170, glide: [1.2, 1.1, 0.7], rough: 5, len: 1.3, formants: [[700, 4, 1.3], [1500, 5, 0.7], [2800, 6, 0.3]] });
  });

  // --- Escenarios (loops) ---
  def('cueva', 'escenario', 'Cueva / mazmorra', ['cueva', 'mazmorra', 'caverna', 'gruta', 'subterraneo', 'catacumba', 'cripta', 'goteo', 'gotas'], [12, 12], (k, P) => {
    const d = P.dur;
    const n = k.noise(0, d, 'brown'), lp = k.filt('lowpass', 220 * P.pitch, 0.7), g = k.gain(0.5);
    n.connect(lp).connect(g).connect(k.out);
    k.tone(0, 'sine', 55 * P.pitch, d, 0.05, k.out, 2, null, 2);
    const drips = Math.round(d * 1.3);
    for (let i = 0; i < drips; i++) {
      const t = k.r(0, d - 0.3), f = k.r(900, 2200) * P.pitch;
      const pn = k.pan(k.r(-0.8, 0.8)); pn.connect(k.out);
      k.tone(t, 'sine', f, 0.09, k.r(0.08, 0.2), pn, 0.001, f * 1.9, 0.08);
    }
  }, true);
  def('bosque', 'escenario', 'Bosque', ['bosque', 'selva', 'jungla', 'pajaros', 'aves', 'naturaleza', 'pradera', 'campo', 'arboles'], [12, 12], (k, P) => {
    const d = P.dur;
    const n = k.noise(0, d), bp = k.filt('bandpass', 700, 0.4), g = k.gain(0.06);
    const lfo = k.osc('sine', 0.15, 0, d), lg = k.gain(0.04); lfo.connect(lg).connect(g.gain);
    n.connect(bp).connect(g).connect(k.out);
    const birds = Math.round(d * 0.9);
    for (let i = 0; i < birds; i++) {
      const t = k.r(0, d - 1), f = k.r(2200, 4200), pn = k.pan(k.r(-0.9, 0.9)); pn.connect(k.out);
      const notes = Math.round(k.r(2, 6));
      for (let j = 0; j < notes; j++) k.tone(t + j * k.r(0.07, 0.13), 'sine', f * k.r(0.9, 1.2), 0.06, k.r(0.03, 0.07), pn, 0.004, f * k.r(1.1, 1.5), 0.05);
    }
  }, true);
  def('lluvia', 'escenario', 'Lluvia', ['lluvia', 'llueve', 'llovizna', 'aguacero', 'chubasco'], [10, 10], (k, P) => {
    const d = P.dur;
    const n = k.noise(0, d), hp = k.filt('highpass', 900, 0.5), lp = k.filt('lowpass', 7000, 0.5), g = k.gain(0.18 * P.power);
    n.connect(hp).connect(lp).connect(g).connect(k.out);
    const drops = Math.round(d * 40 * P.power);
    for (let i = 0; i < drops; i++) k.burst(k.r(0, d), 0.012, 'bandpass', k.r(2000, 6000), 3, k.r(0.02, 0.07), k.out);
  }, true);
  def('viento', 'escenario', 'Viento / tormenta', ['viento', 'tormenta', 'ventisca', 'huracan', 'brisa', 'desierto', 'montana', 'nieve', 'tundra'], [12, 12], (k, P) => {
    const d = P.dur;
    for (const [f, v] of [[400, 0.35], [900, 0.2]]) {
      const n = k.noise(0, d, 'brown'), bp = k.filt('bandpass', f * P.pitch, 1.2), g = k.gain(v * P.power);
      const lfo = k.osc('sine', k.r(0.08, 0.2), 0, d), lg = k.gain(f * 0.5); lfo.connect(lg).connect(bp.frequency);
      const lfo2 = k.osc('sine', k.r(0.1, 0.25), 0, d), lg2 = k.gain(v * 0.6); lfo2.connect(lg2).connect(g.gain);
      n.connect(bp).connect(g).connect(k.out);
    }
  }, true);
  def('fuego', 'escenario', 'Fuego / hoguera', ['fuego', 'hoguera', 'fogata', 'llamas', 'incendio', 'antorcha', 'chimenea', 'brasas'], [10, 10], (k, P) => {
    const d = P.dur;
    const n = k.noise(0, d, 'brown'), lp = k.filt('lowpass', 500, 0.7), g = k.gain(0.5 * P.power);
    n.connect(lp).connect(g).connect(k.out);
    const crackles = Math.round(d * 14);
    for (let i = 0; i < crackles; i++) k.burst(k.r(0, d), k.r(0.004, 0.02), 'highpass', k.r(1500, 4000), 0.7, k.r(0.05, 0.25) * P.power);
  }, true);
  def('agua', 'escenario', 'Río / agua', ['rio', 'agua', 'arroyo', 'cascada', 'mar', 'olas', 'lago', 'burbujas', 'pantano', 'submarino'], [10, 10], (k, P) => {
    const d = P.dur;
    const n = k.noise(0, d), bp = k.filt('bandpass', 1200, 0.5), g = k.gain(0.12 * P.power);
    const lfo = k.osc('sine', 0.12, 0, d), lg = k.gain(0.05); lfo.connect(lg).connect(g.gain);
    n.connect(bp).connect(g).connect(k.out);
    const bubbles = Math.round(d * 12);
    for (let i = 0; i < bubbles; i++) { const f = k.r(300, 1100); k.tone(k.r(0, d), 'sine', f, k.r(0.03, 0.08), k.r(0.03, 0.09), k.out, 0.003, f * k.r(1.6, 2.4), 0.05); }
  }, true);
  def('lava', 'escenario', 'Lava / volcán', ['lava', 'volcan', 'magma', 'infierno', 'abismo'], [10, 10], (k, P) => {
    const d = P.dur;
    const n = k.noise(0, d, 'brown'), lp = k.filt('lowpass', 160, 0.7), g = k.gain(0.9);
    n.connect(lp).connect(g).connect(k.out);
    for (let i = 0; i < Math.round(d * 2.5); i++) { const f = k.r(70, 180); k.tone(k.r(0, d - 0.5), 'sine', f, k.r(0.15, 0.4), 0.18, k.out, 0.02, f * 1.8, 0.2); }
    for (let i = 0; i < Math.round(d * 5); i++) k.burst(k.r(0, d), 0.02, 'bandpass', k.r(800, 2500), 1.5, 0.08);
  }, true);
  def('trueno', 'escenario', 'Trueno', ['trueno', 'rayo cae', 'relampago', 'tronar'], [3.5, 5], (k, P) => {
    k.burst(0, 0.15, 'highpass', 1500, 0.7, 0.6 * P.power);
    k.burst(0.05, P.dur, 'lowpass', 900 * P.pitch, 0.7, 1.0 * P.power, k.out, 0.03, 60);
    for (let i = 0; i < 6; i++) k.burst(k.r(0.2, P.dur * 0.6), k.r(0.4, 1.2), 'lowpass', k.r(200, 500), 0.7, k.r(0.3, 0.6) * P.power, k.out, 0.05);
  });

  // --- Juego en general ---
  def('explosion', 'juego', 'Explosión', ['explosion', 'explota', 'bomba', 'estallido', 'detonacion', 'granada', 'boom', 'dinamita'], [1.8, 3], (k, P) => {
    const t = P.t0 || 0;
    k.thump(t, 120 * P.pitch, 28, P.dur * 0.7, 1.3 * P.power);
    k.burst(t, P.dur, 'lowpass', 5000 * P.pitch, 0.6, 0.9 * P.power, k.out, 0.002, 120);
    k.burst(t, 0.25, 'highpass', 2000, 0.7, 0.4 * P.power);
    for (let i = 0; i < 30; i++) k.burst(t + k.r(0.1, P.dur * 0.8), k.r(0.01, 0.05), 'bandpass', k.r(800, 5000), 2, k.r(0.03, 0.12) * P.power);
  });
  def('espada', 'juego', 'Espada / corte', ['espada', 'corte', 'cortar', 'tajo', 'slash', 'katana', 'cuchillo', 'daga', 'hacha', 'filo', 'ataque'], [0.4, 0.7], (k, P) => {
    k.burst(0, P.dur * 0.7, 'bandpass', 600, 1.5, 0.6 * P.power, k.out, P.dur * 0.25, 5000);
    k.ring(P.dur * 0.35, 2400 * P.pitch, [1, 2.76, 5.4, 8.9], P.dur * 1.6, 0.08 * P.power);
  });
  def('metal', 'juego', 'Choque metálico', ['metal', 'metalico choque', 'choque', 'clang', 'escudo', 'yunque', 'armadura', 'bloqueo', 'parada'], [0.8, 1.4], (k, P) => {
    k.burst(0, 0.03, 'highpass', 3000, 0.7, 0.7 * P.power);
    k.ring(0, 620 * P.pitch, [1, 1.47, 2.09, 2.56, 3.9, 5.2], P.dur, 0.18 * P.power);
  });
  def('golpe', 'juego', 'Golpe / impacto', ['golpe', 'punetazo', 'puñetazo', 'patada', 'impacto', 'pegar', 'hit', 'caida', 'cae al suelo'], [0.3, 0.5], (k, P) => {
    k.thump(0, 160 * P.pitch, 45, P.dur, 1.1 * P.power);
    k.burst(0, 0.08, 'lowpass', 2500, 0.7, 0.7 * P.power);
  });
  def('whoosh', 'juego', 'Whoosh / movimiento rápido', ['whoosh', 'esquivar', 'dash', 'rapido', 'paso rapido', 'vuelo', 'volar', 'lanzar', 'flecha', 'swing'], [0.4, 0.8], (k, P) => {
    k.burst(0, P.dur, 'bandpass', 300 * P.pitch, 2, 0.6 * P.power, k.out, P.dur * 0.5, 3000 * P.pitch);
  });
  def('magia', 'juego', 'Magia / hechizo', ['magia', 'magico', 'hechizo', 'conjuro', 'encantamiento', 'poder', 'mana', 'brillo', 'destello', 'hada', 'estrella'], [1.2, 2], (k, P) => {
    const base = 660 * P.pitch, steps = [0, 4, 7, 12, 16, 19, 24];
    steps.forEach((s, i) => { const f = base * Math.pow(2, s / 12); const pn = k.pan(k.r(-0.7, 0.7)); pn.connect(k.out); k.tone(i * P.dur / 10, 'sine', f, P.dur * 0.6, 0.09 * P.power, pn, 0.01); k.tone(i * P.dur / 10, 'triangle', f * 1.005, P.dur * 0.6, 0.04 * P.power, pn, 0.01); });
    k.burst(0, P.dur, 'bandpass', 2000, 4, 0.15 * P.power, k.out, P.dur * 0.3, 8000);
    for (let i = 0; i < 20; i++) { const f = k.r(3000, 7000); k.tone(k.r(0, P.dur), 'sine', f, 0.05, 0.03, k.out, 0.002, null, 0.05); }
  });
  def('curacion', 'juego', 'Curación', ['curacion', 'curar', 'cura', 'sanar', 'vida', 'pocion', 'regenera', 'salud'], [1.2, 1.8], (k, P) => {
    [0, 4, 7, 11, 14].forEach((s, i) => k.tone(i * 0.12, 'sine', 523 * P.pitch * Math.pow(2, s / 12), 0.9, 0.12 * P.power, k.out, 0.03));
    k.burst(0, P.dur, 'bandpass', 3000, 6, 0.08, k.out, 0.4);
  });
  def('moneda', 'juego', 'Moneda / recoger', ['moneda', 'monedas', 'oro', 'tesoro', 'recoger', 'coger', 'item', 'objeto', 'gema', 'diamante', 'premio', 'coin'], [0.35, 0.5], (k, P) => {
    k.tone(0, 'square', 988 * P.pitch, 0.07, 0.12 * P.power, k.out, 0.001, null, 0.02);
    k.tone(0.07, 'square', 1319 * P.pitch, 0.3, 0.12 * P.power, k.out, 0.001, null, 0.25);
  });
  def('salto', 'juego', 'Salto', ['salto', 'saltar', 'brinco', 'brincar', 'rebote', 'jump'], [0.25, 0.35], (k, P) => {
    k.tone(0, 'square', 220 * P.pitch, P.dur, 0.12 * P.power, k.out, 0.002, 660 * P.pitch, P.dur * 0.5);
  });
  def('laser', 'juego', 'Disparo láser', ['laser', 'disparo', 'disparar', 'pistola laser', 'rayo laser', 'blaster', 'nave', 'pew'], [0.25, 0.4], (k, P) => {
    k.tone(0, 'sawtooth', 1800 * P.pitch, P.dur, 0.14 * P.power, k.out, 0.002, 180 * P.pitch, P.dur * 0.6);
    k.tone(0, 'square', 1200 * P.pitch, P.dur * 0.7, 0.06 * P.power, k.out, 0.002, 150 * P.pitch, P.dur * 0.4);
  });
  def('disparo', 'juego', 'Disparo de arma', ['pistola', 'escopeta', 'rifle', 'bala', 'tiro', 'arma de fuego', 'balazo'], [0.5, 0.9], (k, P) => {
    k.burst(0, 0.12, 'highpass', 1200, 0.7, 1.0 * P.power);
    k.thump(0, 140, 40, 0.35, 1.0 * P.power);
    k.burst(0.02, P.dur, 'lowpass', 1500, 0.7, 0.35 * P.power, k.out, 0.01, 150);
  });
  def('subirnivel', 'juego', 'Subir de nivel / power-up', ['nivel', 'subir de nivel', 'level up', 'power up', 'powerup', 'mejora', 'logro', 'desbloquear', 'potenciador'], [1, 1.4], (k, P) => {
    [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => k.tone(i * 0.08, 'square', 392 * P.pitch * Math.pow(2, s / 12), 0.18, 0.08 * P.power, k.out, 0.002, null, 0.15));
    k.tone(0.56, 'square', 392 * P.pitch * 4, 0.6, 0.08 * P.power, k.out, 0.002, null, 0.5);
  });
  def('dano', 'juego', 'Recibir daño', ['dano', 'daño', 'herido', 'hurt', 'golpeado', 'lastimado', 'pierde vida'], [0.3, 0.45], (k, P) => {
    k.tone(0, 'square', 400 * P.pitch, P.dur, 0.13 * P.power, k.out, 0.002, 90 * P.pitch, P.dur * 0.5);
    k.burst(0, 0.12, 'bandpass', 1500, 1, 0.3 * P.power);
  });
  def('gameover', 'juego', 'Game over', ['game over', 'perder', 'perdiste', 'fin del juego', 'derrota del jugador', 'muerte del jugador', 'moriste'], [2, 2.6], (k, P) => {
    [7, 6, 5, 0].forEach((s, i) => k.tone(i * 0.4, 'square', 330 * P.pitch * Math.pow(2, (s - 7) / 12), i === 3 ? 1.1 : 0.35, 0.1 * P.power, k.out, 0.004, null, i === 3 ? 1 : 0.2));
  });
  def('victoria', 'juego', 'Victoria / fanfarria', ['victoria', 'ganar', 'ganaste', 'fanfarria', 'triunfo', 'mision cumplida', 'nivel completado', 'completado'], [1.8, 2.4], (k, P) => {
    const seq = [[0, 0.15], [4, 0.15], [7, 0.15], [12, 0.45], [9, 0.15], [12, 0.9]];
    let t = 0;
    seq.forEach(([s, d]) => { k.tone(t, 'square', 523 * P.pitch * Math.pow(2, s / 12), d, 0.09 * P.power, k.out, 0.004, null, d * 0.7); k.tone(t, 'triangle', 261 * P.pitch * Math.pow(2, s / 12), d, 0.1 * P.power, k.out, 0.004, null, d * 0.7); t += d; });
  });
  def('puerta', 'juego', 'Puerta', ['puerta', 'portazo', 'porton', 'reja', 'abrir puerta', 'cerrar puerta', 'cofre', 'baul', 'crujido', 'chirrido'], [1.4, 2], (k, P) => {
    // chirrido de bisagra + golpe al cerrar
    const o = k.osc('sawtooth', 180 * P.pitch, 0, P.dur * 0.7), bp = k.filt('bandpass', 1400, 8), g = k.gain(0);
    for (let i = 0; i < 6; i++) o.frequency.setValueAtTime(k.r(140, 260) * P.pitch, i * P.dur * 0.11);
    k.env(g.gain, 0, 0.05, P.dur * 0.5, 0.15, 0.25 * P.power); o.connect(bp).connect(g).connect(k.out);
    k.thump(P.dur * 0.72, 130 * P.pitch, 50, 0.5, 1.0 * P.power);
    k.burst(P.dur * 0.72, 0.15, 'lowpass', 1800, 0.7, 0.5 * P.power);
  });
  def('pasos', 'juego', 'Pasos', ['pasos', 'caminar', 'camina', 'correr', 'corre', 'pisadas', 'andar'], [2, 2], (k, P) => {
    const n = Math.round(P.dur * 2.2);
    for (let i = 0; i < n; i++) { const t = i * P.dur / n + k.r(-0.02, 0.02); k.thump(t, 110 * P.pitch, 60, 0.12, 0.6 * P.power); k.burst(t, 0.07, 'bandpass', k.r(900, 1600) * P.pitch, 1, 0.25 * P.power); }
  });
  def('click', 'juego', 'Click de menú', ['click', 'clic', 'menu', 'boton', 'seleccionar', 'interfaz', 'ui', 'cursor', 'confirmar'], [0.08, 0.12], (k, P) => {
    k.tone(0, 'square', 1500 * P.pitch, 0.04, 0.1 * P.power, k.out, 0.001, null, 0.03);
    k.tone(0.035, 'square', 2200 * P.pitch, 0.05, 0.07 * P.power, k.out, 0.001, null, 0.04);
  });
  def('portal', 'juego', 'Portal / teletransporte', ['portal', 'teletransporte', 'teleport', 'teletransportar', 'dimension', 'agujero', 'vortice'], [1.6, 2.4], (k, P) => {
    const n = k.noise(0, P.dur), bp = k.filt('bandpass', 300, 12), g = k.gain(0);
    bp.frequency.setValueAtTime(200 * P.pitch, 0); bp.frequency.exponentialRampToValueAtTime(4000 * P.pitch, P.dur * 0.8);
    k.env(g.gain, 0, P.dur * 0.4, P.dur * 0.3, P.dur * 0.3, 0.9 * P.power); n.connect(bp).connect(g).connect(k.out);
    k.tone(0, 'sine', 110 * P.pitch, P.dur, 0.2 * P.power, k.out, P.dur * 0.3, 880 * P.pitch, P.dur * 0.4);
  });
  def('electricidad', 'juego', 'Electricidad', ['electricidad', 'electrico', 'chispa', 'chispas', 'descarga', 'trueno electrico', 'zap', 'cortocircuito', 'tesla'], [1, 1.6], (k, P) => {
    const o = k.osc('sawtooth', 60, 0, P.dur), g = k.gain(0), d = k.dist(10);
    k.env(g.gain, 0, 0.01, P.dur * 0.7, P.dur * 0.3, 0.15 * P.power); o.connect(d).connect(g).connect(k.out);
    for (let i = 0; i < Math.round(P.dur * 30); i++) k.burst(k.r(0, P.dur), k.r(0.005, 0.03), 'highpass', k.r(2000, 6000), 0.7, k.r(0.1, 0.4) * P.power);
  });
  def('alarma', 'juego', 'Alarma / sirena', ['alarma', 'sirena', 'alerta', 'peligro', 'emergencia', 'intruso'], [2, 3], (k, P) => {
    const o = k.osc('square', 600 * P.pitch, 0, P.dur), g = k.gain(0.08 * P.power);
    const lfo = k.osc('triangle', 1.6, 0, P.dur), lg = k.gain(220 * P.pitch); lfo.connect(lg).connect(o.frequency);
    o.connect(k.filt('lowpass', 3000)).connect(g).connect(k.out);
  });
  def('latido', 'juego', 'Latido de corazón', ['latido', 'corazon', 'pulso', 'tension', 'suspenso', 'miedo'], [3, 4], (k, P) => {
    for (let t = 0; t < P.dur - 0.3; t += 0.85) { k.thump(t, 70 * P.pitch, 40, 0.18, 0.9 * P.power); k.thump(t + 0.22, 60 * P.pitch, 35, 0.22, 0.7 * P.power); }
  });
  def('fantasma', 'juego', 'Fantasma / misterio', ['fantasma', 'espiritu', 'espectro', 'embrujado', 'encantado', 'misterio', 'terror', 'susurro', 'aparicion fantasmal'], [3, 4], (k, P) => {
    const o = k.osc('sine', 440 * P.pitch, 0, P.dur), g = k.gain(0), lfo = k.osc('sine', 5.5, 0, P.dur), lg = k.gain(14 * P.pitch);
    lfo.connect(lg).connect(o.frequency);
    o.frequency.setValueAtTime(440 * P.pitch, 0); o.frequency.linearRampToValueAtTime(620 * P.pitch, P.dur * 0.5); o.frequency.linearRampToValueAtTime(380 * P.pitch, P.dur);
    k.env(g.gain, 0, P.dur * 0.3, P.dur * 0.4, P.dur * 0.3, 0.12 * P.power); o.connect(g).connect(k.out);
    k.burst(0, P.dur, 'bandpass', 1800, 3, 0.12 * P.power, k.out, P.dur * 0.4);
  });
  def('robot', 'juego', 'Robot / máquina', ['robot', 'maquina', 'mecanico', 'motor', 'engranaje', 'cyborg', 'android', 'computadora', 'tecnologia'], [1.2, 2], (k, P) => {
    const o = k.osc('square', 90 * P.pitch, 0, P.dur), m = k.osc('sine', 31, 0, P.dur), mg = k.gain(0), g = k.gain(0);
    m.connect(mg.gain); o.connect(mg);
    k.env(g.gain, 0, 0.02, P.dur * 0.8, 0.2, 0.4 * P.power); mg.connect(k.filt('lowpass', 2500)).connect(g).connect(k.out);
    for (let i = 0; i < 5; i++) k.tone(i * P.dur / 5, 'square', k.r(300, 900) * P.pitch, 0.08, 0.06 * P.power, k.out, 0.002, null, 0.05);
  });
  def('campana', 'juego', 'Campana / gong', ['campana', 'gong', 'campanada', 'templo', 'iglesia', 'reloj'], [3, 4], (k, P) => {
    k.ring(0, 220 * P.pitch, [0.5, 1, 1.19, 1.56, 2, 2.51, 3.01], P.dur, 0.25 * P.power);
  });

  // ---------- Interpretar la descripción ----------
  const MODS = [
    ['size', 0.55, ['gigante', 'enorme', 'colosal', 'titanico', 'titanica', 'inmenso', 'inmensa', 'grande', 'grave', 'profundo', 'profunda', 'pesado', 'pesada']],
    ['size', 1.6, ['pequeno', 'pequena', 'chico', 'chica', 'diminuto', 'diminuta', 'mini', 'agudo', 'aguda', 'tierno', 'bebe', 'ligero']],
    ['far', 1, ['lejano', 'lejos', 'distante', 'eco', 'a lo lejos']],
    ['loud', 1.35, ['fuerte', 'potente', 'enojado', 'enojada', 'furioso', 'furiosa', 'brutal', 'epico', 'epica', 'violento', 'violenta', 'intenso', 'intensa', 'agresivo', 'agresiva']],
    ['loud', 0.6, ['suave', 'debil', 'tranquilo', 'sutil', 'leve', 'calmado']],
    ['retro', 1, ['8 bit', '8-bit', '8bit', 'retro', 'pixel', 'arcade', 'chiptune', 'nes']],
    ['dark', 1, ['oscuro', 'oscura', 'siniestro', 'siniestra', 'demoniaco', 'demoniaca', 'infernal', 'maldito', 'maldita', 'sombrio', 'sombria', 'tenebroso', 'tenebrosa']],
    ['magic', 1, ['magico', 'magica', 'mistico', 'mistica', 'arcano', 'arcana', 'celestial', 'divino', 'divina', 'sagrado', 'sagrada', 'brillante']],
    ['electric', 1, ['electrico', 'electrica', 'chispeante', 'voltaje']],
    ['metal', 1, ['metalico', 'metalica', 'de acero', 'de hierro', 'robotico']],
    ['ice', 1, ['hielo', 'helado', 'helada', 'congelado', 'congelada', 'cristal', 'escarcha']],
    ['fire', 1, ['de fuego', 'ardiente', 'en llamas', 'llameante']],
    ['big', 1, ['cueva grande', 'catedral', 'sala grande', 'enorme sala']],
  ];

  // palabras cortas solo cuentan completas ("oro" no debe encajar en "tesoro")
  const has = (t, w) => w.length <= 4 ? new RegExp('(^|[^a-z0-9])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)').test(t) : t.includes(w);

  function parse(text) {
    const t = ' ' + norm(text) + ' ';
    let best = null, bs = 0;
    for (const r of Object.values(R)) {
      let sc = 0;
      for (const w of r.kw) { const nw = norm(w); if (has(t, nw)) sc += nw.length > 6 ? 3 : 2; }
      if (sc > bs) { bs = sc; best = r; }
    }
    const mods = { size: 1, far: 0, loud: 1, retro: 0, dark: 0, magic: 0, electric: 0, metal: 0, ice: 0, fire: 0, big: 0 };
    const found = [];
    for (const [key, val, words] of MODS) {
      for (const w of words) if (has(t, norm(w))) { mods[key] = key === 'size' || key === 'loud' ? mods[key] * val : 1; found.push(w); break; }
    }
    const dm = t.match(/(\d+(?:[.,]\d+)?)\s*(segundos|segundo|seg|s)\b/);
    const dur = dm ? Math.max(0.1, Math.min(30, parseFloat(dm[1].replace(',', '.')))) : null;
    if (/\b(loop|bucle|ambiente|de fondo)\b/.test(t)) mods.loop = 1;
    return { recipe: best, score: bs, mods, dur, found };
  }

  function impulse(ctx, secs, decay = 2.5) {
    const len = Math.round(SR * secs), b = ctx.createBuffer(2, len, SR), r = Voice.mulberry(5);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }

  // ---------- Generar ----------
  async function generate(text, o = {}) {
    const p = parse(text);
    if (!p.recipe) return { error: 'no-entiendo' };
    const rc = p.recipe, m = p.mods;
    const rnd = Voice.mulberry((o.seed || 1) * 7919 + text.length * 31);
    const loop = rc.loop || !!m.loop && rc.cat === 'escenario';
    const dur = p.dur || (rc.dur[0] + (rc.dur[1] - rc.dur[0]) * rnd());
    const tailSec = loop ? Math.min(3, dur / 3 + 0.2) : (m.far || m.big ? 2.5 : DRY.has(rc.id) ? 0.4 : 1.2);
    const ctx = new OfflineAudioContext(2, Math.ceil((dur + tailSec) * SR), SR);
    // cadena de salida: carácter -> distancia -> reverberación -> limitador
    const master = ctx.createDynamicsCompressor();
    master.threshold.value = -6; master.ratio.value = 8; master.attack.value = 0.002; master.release.value = 0.1;
    master.connect(ctx.destination);
    const dry = ctx.createGain(); dry.gain.value = m.far ? 0.45 : 1;
    let chainIn = ctx.createGain();
    let node = chainIn;
    if (m.retro) {
      const sh = ctx.createWaveShaper(), n = 4096, c = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.round(x * 8) / 8; }
      sh.curve = c; node.connect(sh); node = sh;
    }
    if (m.dark) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200; node.connect(lp); node = lp; }
    if (m.far) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600; node.connect(lp); node = lp; }
    node.connect(dry).connect(master);
    const verb = ctx.createConvolver(); verb.buffer = impulse(ctx, m.far || m.big || rc.id === 'cueva' ? 3.2 : 1.4);
    const vs = ctx.createGain(); vs.gain.value = m.far ? 0.7 : DRY.has(rc.id) ? 0.04 : (rc.cat === 'escenario' ? 0.25 : 0.18);
    node.connect(vs).connect(verb).connect(master);
    const k = makeKit(ctx, chainIn, rnd);
    const P = { pitch: m.size * (m.dark ? 0.85 : 1) * (0.94 + rnd() * 0.12), dur, power: m.loud, rnd, mods: m };
    // tu voz como criatura
    if (o.voice && o.voice.length && ['rugido', 'gruñido', 'grito', 'risa', 'aparicion', 'muerte'].includes(rc.id)) {
      const ph = [...o.voice].sort((a, b) => b.duration - a.duration)[Math.floor(rnd() * Math.min(3, o.voice.length))];
      const shift = rc.id === 'grito' ? 5 : rc.id === 'risa' ? -7 : -14;
      const sizeShift = Math.round(12 * Math.log2(m.size));
      const targets = ph.segments.map(sg => sg.midi + shift + sizeShift);
      const st = Math.max(0.6, Math.min(1.6, dur / ph.duration));
      const vd = Voice.renderPhrase(ph, { stretch: st, targets, formant: rc.id === 'grito' ? 1.15 : 0.7 * Math.sqrt(m.size), natural: 1, vibrato: 0.02 });
      let pk = 0; for (const v of vd) pk = Math.max(pk, Math.abs(v));
      for (let i = 0; i < vd.length; i++) vd[i] *= 0.9 / (pk || 1);
      const ab = new AudioBuffer({ length: vd.length, numberOfChannels: 1, sampleRate: ph.sr });
      ab.copyToChannel(vd, 0);
      P.voiceBuf = ab;
    }
    rc.build(k, P);
    // capas de carácter
    if (m.magic && rc.id !== 'magia') for (let i = 0; i < 14; i++) { const f = k.r(2500, 6500); k.tone(k.r(0, dur), 'sine', f, 0.07, 0.035, chainIn, 0.002, f * 1.3, 0.06); }
    if (m.electric && rc.id !== 'electricidad') for (let i = 0; i < Math.round(dur * 18); i++) k.burst(k.r(0, dur), k.r(0.005, 0.02), 'highpass', k.r(2500, 6000), 0.7, k.r(0.05, 0.2));
    if (m.metal && rc.id !== 'metal') k.ring(0, 900 * P.pitch, [1, 1.47, 2.09, 2.56], Math.min(dur, 1.5), 0.06);
    if (m.ice) for (let i = 0; i < 10; i++) k.tone(k.r(0, dur * 0.8), 'sine', k.r(3000, 7000), 0.25, 0.04, chainIn, 0.002, null, 0.2);
    if (m.fire && rc.id !== 'fuego') for (let i = 0; i < Math.round(dur * 10); i++) k.burst(k.r(0, dur), k.r(0.004, 0.02), 'highpass', k.r(1500, 4000), 0.7, k.r(0.04, 0.15));
    await tick();
    const rendered = await ctx.startRendering();
    // loop sin cortes: la cola se funde con el inicio
    const L = loop ? Math.round(dur * SR) : rendered.length;
    const outB = new AudioBuffer({ length: L, numberOfChannels: 2, sampleRate: SR });
    let peak = 0;
    const ch = [0, 1].map(c => {
      const s = rendered.getChannelData(c), d = new Float32Array(L);
      d.set(s.subarray(0, L));
      if (loop) {
        // fundido de potencia constante: el final continúa sin saltos en el inicio
        const xf = Math.min(s.length - L, Math.floor(L / 3));
        for (let i = 0; i < xf; i++) { const a = i / xf; d[i] = s[i] * Math.sqrt(a) + s[L + i] * Math.sqrt(1 - a); }
      }
      for (let i = 0; i < L; i++) peak = Math.max(peak, Math.abs(d[i]));
      return d;
    });
    const g = peak > 0 ? 0.9 / peak : 1;
    ch.forEach((d, c) => { for (let i = 0; i < L; i++) d[i] *= g; outB.copyToChannel(d, c); });
    // recorta silencio final (efectos sueltos)
    let buffer = outB;
    if (!loop) {
      let end = L;
      const thr = DRY.has(rc.id) ? 0.02 : 0.005;
      while (end > SR * 0.05 && Math.abs(ch[0][end - 1]) < thr && Math.abs(ch[1][end - 1]) < thr) end--;
      end = Math.min(L, end + Math.round(0.05 * SR));
      if (end < L) {
        buffer = new AudioBuffer({ length: end, numberOfChannels: 2, sampleRate: SR });
        ch.forEach((d, c) => { const e = d.slice(0, end); const f = Math.round(0.03 * SR); for (let i = 0; i < f; i++) e[end - 1 - i] *= i / f; buffer.copyToChannel(e, c); });
      }
    }
    const desc = [rc.name].concat(p.found).join(' · ');
    return { buffer, recipe: rc, loop, desc, usedVoice: !!P.voiceBuf };
  }

  const CATALOG = {
    jefe: Object.values(R).filter(r => r.cat === 'jefe'),
    escenario: Object.values(R).filter(r => r.cat === 'escenario'),
    juego: Object.values(R).filter(r => r.cat === 'juego'),
  };
  return { generate, parse, CATALOG, RECIPES: R };
})();
