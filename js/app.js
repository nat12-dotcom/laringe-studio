/* Laringe Studio — interfaz y flujo */
(() => {
  const $ = s => document.querySelector(s);
  const A = Analysis;
  const PROFILE_KEY = 'laringe.profiles.v1';

  const S = {
    ctx: null, mic: null, micSrc: null, analyser: null, proc: null, recBufs: null,
    sample: null, bank: null, profile: null, profiles: [], phrases: [], phraseRaw: null, stopRec: false,
    style: 'epico', score: null, track: null, player: null, outAnalyser: null,
    pitchHist: new Array(240).fill(null),
    head: { open: 0.05, front: 0.5, high: 0.5, round: 0, amp: 0, f0: 0, phase: 0 },
    busy: false,
  };

  // ---------- audio base ----------
  function ensureCtx() {
    if (!S.ctx) {
      S.ctx = new (window.AudioContext || window.webkitAudioContext)();
      S.outAnalyser = S.ctx.createAnalyser();
      S.outAnalyser.fftSize = 2048;
      S.outAnalyser.connect(S.ctx.destination);
    }
    if (S.ctx.state === 'suspended') S.ctx.resume();
    return S.ctx;
  }

  function status(el, msg, kind = '') {
    el.textContent = msg;
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  function setBadge(kind, text) {
    const b = $('#modeBadge');
    b.className = 'badge' + (kind ? ' is-' + kind : '');
    b.querySelector('span').textContent = text;
  }

  async function startMic() {
    const ctx = ensureCtx();
    if (S.mic) return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      status($('#micStatus'), 'Este navegador no permite usar el micrófono aquí. Abre la app desde https o localhost, o sube un audio.', 'err');
      return false;
    }
    try {
      // sin procesado del navegador (cancelación de eco, supresión de ruido, ganancia automática):
      // deforman la voz cantada. La limpieza la hace la app después, con más cuidado.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1, sampleRate: { ideal: 48000 } } });
      S.mic = stream;
      S.micSrc = ctx.createMediaStreamSource(stream);
      S.analyser = ctx.createAnalyser();
      S.analyser.fftSize = 2048;
      S.micSrc.connect(S.analyser);
      await setupRecorder(ctx);
      $('#btnMic').textContent = 'Apagar micrófono';
      status($('#micStatus'), 'Micrófono activo: canta o habla y mira la cabeza.', 'ok');
      setBadge('live', 'Micrófono en vivo');
      return true;
    } catch (err) {
      status($('#micStatus'), 'No se pudo usar el micrófono (permiso denegado o no hay dispositivo). Puedes subir un audio en su lugar.', 'err');
      return false;
    }
  }

  // Grabador en un hilo de audio propio (AudioWorklet): no se corta aunque la pantalla
  // esté ocupada. Si el navegador no lo admite, se usa el método clásico.
  const WORKLET_SRC = `class LaringeRec extends AudioWorkletProcessor {
    constructor() { super(); this.on = false; this.buf = new Float32Array(2048); this.n = 0; this.pk = 0;
      this.port.onmessage = e => { this.on = e.data; this.n = 0; }; }
    process(inputs) {
      const ch = inputs[0] && inputs[0][0];
      if (ch) for (let i = 0; i < ch.length; i++) {
        const v = ch[i], a = v < 0 ? -v : v; if (a > this.pk) this.pk = a;
        if (this.on) { this.buf[this.n++] = v; if (this.n === 2048) { this.port.postMessage({ d: this.buf.slice(0), pk: this.pk }); this.n = 0; this.pk = 0; } }
      }
      if (!this.on && this.pk > 0) { this.port.postMessage({ pk: this.pk }); this.pk = 0; }
      return true;
    }
  }
  registerProcessor('laringe-rec', LaringeRec);`;

  async function setupRecorder(ctx) {
    S.recPeak = 0;
    const onChunk = (d, pk) => {
      if (pk > S.recPeak) S.recPeak = pk;
      if (pk >= 0.985) S.clipAt = performance.now();
      if (d && S.recBufs) S.recBufs.push(d);
    };
    if (ctx.audioWorklet && window.AudioWorkletNode) {
      try {
        if (!S.workletReady) {
          const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
          await ctx.audioWorklet.addModule(url);
          S.workletReady = true;
        }
        const node = new AudioWorkletNode(ctx, 'laringe-rec', { numberOfInputs: 1, numberOfOutputs: 0 });
        node.port.onmessage = e => onChunk(e.data.d, e.data.pk);
        S.micSrc.connect(node);
        S.proc = node;
        S.recNode = node;
        return;
      } catch (e) { /* se usa el método clásico */ }
    }
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    S.micSrc.connect(proc);
    const z = ctx.createGain(); z.gain.value = 0;
    proc.connect(z).connect(ctx.destination);
    proc.onaudioprocess = e => {
      const d = e.inputBuffer.getChannelData(0);
      let pk = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; }
      onChunk(S.recBufs ? new Float32Array(d) : null, pk);
    };
    S.proc = proc;
    S.recNode = null;
  }

  function stopMic() {
    if (!S.mic) return;
    S.mic.getTracks().forEach(t => t.stop());
    try { S.micSrc.disconnect(); if (S.proc) S.proc.disconnect(); } catch (e) { /* ya desconectado */ }
    S.mic = S.micSrc = S.analyser = S.proc = null;
    $('#btnMic').textContent = 'Activar micrófono';
    status($('#micStatus'), 'Micrófono apagado.');
    setBadge(S.player ? 'play' : '', S.player ? 'Coro sonando' : 'En reposo');
  }

  function record(sec, progEl, label) {
    progEl.hidden = false;
    const bar = progEl.querySelector('div'), txt = progEl.querySelector('span');
    return new Promise(res => {
      S.recBufs = [];
      S.recPeak = 0; S.clipAt = 0;
      if (S.recNode) S.recNode.port.postMessage(true);
      const t0 = performance.now();
      const iv = setInterval(() => {
        const el = (performance.now() - t0) / 1000;
        bar.style.width = Math.min(100, el / sec * 100) + '%';
        const warn = performance.now() - (S.clipAt || 0) < 1500 ? ' · ¡muy fuerte! aléjate un poco del micrófono' : '';
        txt.textContent = (sec > 30
          ? `${label} · ${fmtTime(el)} de ${fmtTime(sec)} máx. — pulsa “Terminar” al acabar`
          : `${label} · ${Math.max(0, sec - el).toFixed(1)} s`) + warn;
        if (el >= sec || (S.stopRec && el > 1)) {
          clearInterval(iv);
          S.stopRec = false;
          if (S.recNode) S.recNode.port.postMessage(false);
          const bufs = S.recBufs; S.recBufs = null;
          const out = new Float32Array(bufs.reduce((n, b) => n + b.length, 0));
          let o = 0; bufs.forEach(b => { out.set(b, o); o += b.length; });
          progEl.hidden = true;
          res(out);
        }
      }, 50);
    });
  }

  async function countdown(progEl, label) {
    progEl.hidden = false;
    const bar = progEl.querySelector('div'), txt = progEl.querySelector('span');
    bar.style.width = '0%';
    for (let i = 3; i > 0; i--) { txt.textContent = `${label} en ${i}…`; await new Promise(r => setTimeout(r, 650)); }
  }

  // ---------- muestra ----------
  function setSample(sample) {
    S.sample = sample;
    S.bank = new Voice.Bank(sample, { keepTimbre: $('#keepTimbre').checked });
    $('#srcName').textContent = sample.label;
    renderSampleFacts();
    S.track = null;
  }

  function renderSampleFacts() {
    const sm = S.sample;
    if (!sm) { $('#sampleFacts').innerHTML = ''; return; }
    const an = sm.analysis;
    const m = A.freqToMidi(sm.f0);
    const rows = [
      ['Origen', sm.label],
      ['Nota', `${A.noteName(m)} · ${sm.f0.toFixed(0)} Hz`],
      ['Vocal', (sm.vowel || '—').toUpperCase()],
      ['Tramo estable', `${sm.stableSec.toFixed(2)} s`],
      ['Formantes', an.F1 ? `${an.F1.toFixed(0)} / ${an.F2.toFixed(0)} Hz` : '—'],
    ];
    $('#sampleFacts').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function sampleError(e) {
    return e.message === 'inestable'
      ? 'La nota no fue estable. Canta una “aaa” continua, sin cambiar de altura.'
      : 'No detecté una nota cantada. Acércate al micrófono y canta una “aaa” sostenida más fuerte.';
  }

  async function recordSample() {
    if (S.busy) return;
    if (!(await startMic())) return;
    S.busy = true;
    const prog = $('#recProg');
    await countdown(prog, 'Grabando');
    const data = await record(3, prog, 'Canta “aaa”');
    try {
      const clean = (await Voice.prepareRecording(data, S.ctx.sampleRate)).data;
      const sm = Voice.makeSample(clean, S.ctx.sampleRate, 'Tu voz (nota sostenida)');
      sm.mine = true;
      setSample(sm);
      renderPhraseFacts();
      S.profile = sm.analysis;
      status($('#micStatus'), `Muestra lista: ${A.noteName(A.freqToMidi(sm.f0))}. Ya puedes generar música con tu voz.`, 'ok');
      drawRange();
    } catch (e) {
      status($('#micStatus'), sampleError(e), 'err');
    }
    S.busy = false;
  }


  // ---------- reconocimiento ----------
  function recognizeHtml(an) {
    if (!S.profiles.length) return '<p>Guarda tu perfil (paso 3) para que la app te reconozca la próxima vez.</p>';
    if (an.voicedRatio < 0.08) return '<p>No se escuchó voz suficiente para reconocer a nadie.</p>';
    const ranked = S.profiles.map(p => ({ p, s: A.similarity(an, p.f) })).sort((a, b) => b.s - a.s);
    const best = ranked[0];
    const verdict = best.s > 0.72 ? `Reconocí tu voz: <b>${escapeHtml(best.p.name)}</b>.`
      : best.s > 0.55 ? `Se parece a <b>${escapeHtml(best.p.name)}</b>, pero no es seguro.`
      : 'No coincide con ningún perfil guardado.';
    return `<p>${verdict}</p>` + ranked.slice(0, 4).map((x, i) => `<div class="bar${i === 0 ? ' top' : ''}"><span>${escapeHtml(x.p.name)}</span><div class="track"><i style="width:${(x.s * 100).toFixed(0)}%"></i></div><span class="pc">${(x.s * 100).toFixed(0)}%</span></div>`).join('');
  }

  // ---------- frase ----------
  function phraseError(e) {
    return e.message === 'corta' ? 'La frase fue muy corta. Canta al menos un par de segundos.'
      : 'No detecté canto en la frase. Canta más cerca del micrófono, con voz clara.';
  }

  const progUI = el => {
    el.hidden = false;
    const bar = el.querySelector('div'), txt = el.querySelector('span');
    return (p, msg) => { bar.style.width = (p * 100).toFixed(0) + '%'; txt.textContent = msg; };
  };

  // Tu grabación (larga o corta) se separa en frases y se prepara para la canción
  async function setVoiceRecording(raw, sr, label, onP) {
    const prep = await Voice.prepareRecording(raw, sr, onP);
    S.recQuality = recordingAdvice(prep);
    const res = await Voice.splitPhrases(prep.data, sr, onP);
    if (!res.phrases.length) throw new Error('sin-nota');
    S.phrases = res.phrases;
    // audio limpio para escuchar: de la primera a la última frase
    const first = res.phrases[0], last = res.phrases[res.phrases.length - 1];
    const a = Math.round(first.t0 * sr), b = Math.min(res.data.length, Math.round(last.t0 * sr) + (last.end));
    S.phraseRaw = { data: res.data.slice(a, b), sr, label };
    $('#usePhrase').disabled = false;
    $('#usePhrase').checked = true;
    // huella para reconocerte: hasta 30 s de canto
    const parts = [];
    let tot = 0;
    for (const ph of res.phrases) { if (tot > 30 * sr) break; const d = ph.data.subarray(ph.start, ph.end); parts.push(d); tot += d.length; }
    const cat = new Float32Array(tot);
    let o = 0; parts.forEach(d => { cat.set(d, o); o += d.length; });
    S.profile = A.analyzeBuffer(cat, sr);
    // si no hay nota sostenida tuya, el coro sale de la frase más larga
    if (!S.sample || !S.sample.mine || S.sample.fromPhrase) {
      const longest = [...res.phrases].sort((x, y) => y.duration - x.duration);
      for (const ph of longest.slice(0, 4)) {
        try {
          const sm = Voice.makeSample(ph.data.subarray(ph.start, ph.end), sr, 'Tu voz (de tu grabación)');
          sm.mine = true; sm.fromPhrase = true;
          setSample(sm);
          break;
        } catch (e) { /* esa frase no tiene un tramo estable; se prueba otra */ }
      }
    }
    renderPhraseFacts();
  }

  // Consejos según cómo quedó la grabación
  function recordingAdvice(prep) {
    if (prep.clipped > 0.0005) return { kind: 'err', text: 'La grabación saturó (sonó demasiado fuerte para el micrófono). Para mejor calidad, aléjate un palmo o baja el volumen de entrada del micrófono y vuelve a grabar.' };
    if (prep.peak < 0.08) return { kind: 'err', text: 'La grabación quedó muy baja. Acércate al micrófono o sube su volumen de entrada para que tu voz se oiga más clara.' };
    if (prep.noiseFound) return { kind: 'ok', text: 'Se redujo el ruido de fondo de la grabación.' };
    return { kind: 'ok', text: 'Grabación limpia.' };
  }

  function renderPhraseFacts() {
    const ps = S.phrases;
    if (!ps.length) { $('#phraseFacts').innerHTML = ''; return; }
    const sung = ps.reduce((t, p) => t + p.duration, 0);
    const lo = Math.min(...ps.map(p => p.lo)), hi = Math.max(...ps.map(p => p.hi));
    const rows = [
      ['Frases', String(ps.length)],
      ['Canto grabado', fmtTime(sung)],
      ['Tu rango', `${A.noteName(lo)} – ${A.noteName(hi)}`],
      ['Coro de fondo', S.sample ? S.sample.label : '—'],
      ['Calidad', S.recQuality ? (S.recQuality.kind === 'ok' ? (S.recQuality.text.startsWith('Se redujo') ? 'Ruido reducido' : 'Limpia') : 'Revisa el aviso') : '—'],
    ];
    $('#phraseFacts').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join('');
  }

  async function recordPhrase() {
    if (S.busy) return;
    if (!(await startMic())) return;
    S.busy = true;
    const prog = $('#recProg');
    await countdown(prog, 'Grabando');
    $('#btnStopRec').hidden = false;
    const data = await record(240, prog, 'Canta tu canción');
    $('#btnStopRec').hidden = true;
    try {
      await setVoiceRecording(data, S.ctx.sampleRate, 'Tu grabación', progUI(prog));
      $('#recogOut').hidden = false;
      $('#recogOut').innerHTML = recognizeHtml(S.profile);
      drawRange();
      const q = S.recQuality;
      status($('#micStatus'), q && q.kind === 'err' ? q.text : `Listo: ${S.phrases.length} frase${S.phrases.length === 1 ? '' : 's'}. ${q ? q.text + ' ' : ''}Elige un estilo en el paso 5 o haz un remix en el paso 6.`, q && q.kind === 'err' ? 'err' : 'ok');
    } catch (e) {
      status($('#micStatus'), phraseError(e), 'err');
    }
    prog.hidden = true;
    S.busy = false;
  }

  function playRaw(data, sr) {
    const ctx = ensureCtx();
    const ab = ctx.createBuffer(1, data.length, sr);
    ab.copyToChannel(data, 0);
    playBuffer(ab, 0, 1, 0.8);
  }

  function playBuffer(buf, when = 0, rate = 1, gain = 0.8, detune = 0, dest) {
    const ctx = ensureCtx();
    const src = ctx.createBufferSource();
    src.buffer = buf; src.playbackRate.value = rate; src.detune.value = detune;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(g).connect(dest || S.outAnalyser);
    src.start(ctx.currentTime + when);
    return { src, g };
  }

  function playSample() {
    if (!S.sample) return;
    const ctx = ensureCtx();
    const ab = ctx.createBuffer(1, S.sample.data.length, S.sample.sr);
    ab.copyToChannel(S.sample.data, 0);
    playBuffer(ab, 0, 1, 0.8);
  }

  async function handleFile(file) {
    if (!file) return;
    const ctx = ensureCtx();
    status($('#micStatus'), 'Analizando el audio…');
    try {
      const ab = await ctx.decodeAudioData(await file.arrayBuffer());
      const n = Math.min(ab.length, ab.sampleRate * 240);
      const mono = new Float32Array(n);
      for (let c = 0; c < ab.numberOfChannels; c++) {
        const d = ab.getChannelData(c);
        for (let i = 0; i < n; i++) mono[i] += d[i] / ab.numberOfChannels;
      }
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 28) || 'Audio subido';
      const prog = $('#recProg');
      try {
        await setVoiceRecording(mono, ab.sampleRate, name, progUI(prog));
      } finally { prog.hidden = true; }
      $('#recogOut').hidden = false;
      $('#recogOut').innerHTML = recognizeHtml(S.profile);
      drawRange();
      status($('#micStatus'), `Audio cargado: ${S.phrases.length} frase${S.phrases.length === 1 ? '' : 's'}.`, 'ok');
    } catch (e) {
      status($('#micStatus'), e.message === 'sin-nota' || e.message === 'inestable' ? sampleError(e) : 'No pude leer ese archivo. Prueba con WAV, MP3 u OGG.', 'err');
    }
  }

  // ---------- rango y perfiles ----------
  async function rangeTest() {
    if (S.busy) return;
    if (!(await startMic())) return;
    S.busy = true;
    const prog = $('#recProg');
    await countdown(prog, 'Test de rango');
    const data = await record(8, prog, 'Del grave al agudo');
    const an = A.analyzeBuffer(data, S.ctx.sampleRate);
    if (an.voicedRatio < 0.1) {
      $('#rangeTxt').textContent = 'No se escuchó suficiente voz cantada. Repite el test más cerca del micrófono.';
    } else {
      S.profile = an;
      drawRange();
    }
    S.busy = false;
  }

  function drawRange() {
    const cv = $('#rangeCv');
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    const lo = 36, hi = 88;
    const x = m => 4 + (m - lo) / (hi - lo) * (w - 8);
    // teclado
    for (let m = lo; m <= hi; m++) {
      const black = [1, 3, 6, 8, 10].includes(m % 12);
      c.fillStyle = black ? '#262c4c' : '#323a63';
      c.fillRect(x(m), 0, Math.max(1, x(m + 1) - x(m) - 1), 18);
      if (m % 12 === 0) {
        c.fillStyle = '#9aa0c4';
        c.font = '10px "IBM Plex Mono", monospace';
        c.fillText(A.noteName(m), x(m) + 2, 30);
      }
    }
    const vts = A.VOICE_TYPES;
    const p = S.profile;
    vts.forEach((vt, i) => {
      const y = 38 + i * 13;
      const isMe = p && p.voiceType && p.voiceType.id === vt.id;
      c.fillStyle = isMe ? 'rgba(255,179,71,0.85)' : 'rgba(111,214,255,0.25)';
      c.fillRect(x(vt.range[0]), y, x(vt.range[1]) - x(vt.range[0]), 9);
      c.fillStyle = isMe ? '#2a1800' : '#cfd3ee';
      c.font = '9px "IBM Plex Sans", sans-serif';
      c.fillText(vt.name, x(vt.range[0]) + 3, y + 8);
    });
    if (p && p.lo) {
      c.fillStyle = 'rgba(255,111,138,0.9)';
      c.fillRect(x(p.lo), 0, Math.max(3, x(p.hi) - x(p.lo)), 18);
      c.globalAlpha = 0.2;
      c.fillRect(x(p.lo), 0, Math.max(3, x(p.hi) - x(p.lo)), h);
      c.globalAlpha = 1;
      const span = Math.round(p.hi - p.lo);
      $('#rangeTxt').innerHTML = `Tu rango: <b>${A.noteName(p.lo)} – ${A.noteName(p.hi)}</b> (${span} semitonos) · nota media ${A.noteName(A.freqToMidi(p.f0Median))} · tipo de voz más probable: <b>${p.voiceType ? p.voiceType.name : '—'}</b>${span < 6 ? '. Para un rango más fiable haz el test de 8 s deslizando la voz.' : '.'}`;
    }
  }

  function loadProfiles() {
    try { S.profiles = JSON.parse(localStorage.getItem(PROFILE_KEY) || '[]'); } catch (e) { S.profiles = []; }
    renderProfiles();
  }
  function persistProfiles() {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(S.profiles)); return true; }
    catch (e) { return false; }
  }
  function saveProfile() {
    const name = $('#profName').value.trim();
    const p = S.profile || (S.sample && S.sample.mine ? S.sample.analysis : null);
    if (!name) { status($('#micStatus'), 'Escribe un nombre para el perfil.', 'err'); $('#profName').focus(); return; }
    if (!p || !p.ltas || !p.f0Median) { status($('#micStatus'), 'Primero graba tu frase o haz el test de rango.', 'err'); return; }
    const entry = {
      id: Date.now().toString(36), name, date: new Date().toISOString().slice(0, 10),
      f: { ltas: p.ltas, f0Median: p.f0Median, F1: p.F1, F2: p.F2, F3: p.F3, lo: p.lo, hi: p.hi, voiceType: p.voiceType },
      sample: S.sample && S.sample.mine ? Voice.encodeSample(Object.assign({}, S.sample, { label: name })) : null,
      phrase: S.phraseRaw ? Voice.encodeSample({ data: S.phraseRaw.data.subarray(0, Math.min(S.phraseRaw.data.length, S.phraseRaw.sr * 25)), sr: S.phraseRaw.sr, label: 'Voz de ' + name }) : null,
    };
    S.profiles = S.profiles.filter(x => x.name !== name).concat(entry);
    if (!persistProfiles()) {
      entry.phrase = null;
      if (persistProfiles()) { status($('#micStatus'), `Perfil “${name}” guardado sin la frase (no había espacio en el navegador).`, 'ok'); $('#profName').value = ''; renderProfiles(); return; }
      entry.sample = null;
      if (!persistProfiles()) { status($('#micStatus'), 'El navegador no permite guardar datos aquí.', 'err'); return; }
      status($('#micStatus'), `Perfil “${name}” guardado sin la muestra de audio (no había espacio).`, 'ok');
    } else status($('#micStatus'), `Perfil “${name}” guardado.`, 'ok');
    $('#profName').value = '';
    renderProfiles();
  }
  function renderProfiles() {
    const ul = $('#profList');
    if (!S.profiles.length) { ul.innerHTML = '<li><span class="pmeta">Sin perfiles guardados todavía.</span></li>'; return; }
    ul.innerHTML = S.profiles.map(p => {
      const vt = p.f.voiceType ? p.f.voiceType.name : '—';
      return `<li><div><b>${escapeHtml(p.name)}</b><div class="pmeta">${vt} · ${A.noteName(p.f.lo || 60)}–${A.noteName(p.f.hi || 60)} · ${p.date}</div></div>
        <div class="pbtns">${p.sample || p.phrase ? `<button data-use="${p.id}">Usar su voz</button>` : ''}<button data-del="${p.id}" aria-label="Borrar perfil ${escapeHtml(p.name)}">Borrar</button></div></li>`;
    }).join('');
  }

  async function whoSings() {
    if (S.busy) return;
    if (!S.profiles.length) { status($('#micStatus'), 'Guarda al menos un perfil antes de reconocer voces.', 'err'); return; }
    if (!(await startMic())) return;
    S.busy = true;
    const prog = $('#recProg');
    await countdown(prog, 'Escuchando');
    const data = await record(3, prog, 'Canta o habla');
    const an = A.analyzeBuffer(data, S.ctx.sampleRate);
    const out = $('#whoOut');
    out.hidden = false;
    out.innerHTML = recognizeHtml(an);
    S.busy = false;
  }

  // ---------- voces ----------
  function renderParts() {
    $('#parts').innerHTML = Object.values(Voice.PARTS).map(p => `
      <label class="part"><input type="checkbox" data-part="${p.id}" checked>
        <strong>${p.name}</strong>
        <small>${A.noteName(p.range[0])}–${A.noteName(p.range[1])}</small>
        <small>formantes ×${p.formant.toFixed(2)}</small>
      </label>`).join('');
  }
  const activeParts = () => {
    const o = {};
    document.querySelectorAll('[data-part]').forEach(i => { o[i.dataset.part] = i.checked ? 1 : 0; });
    return o;
  };

  function previewChord() {
    if (!S.bank) return;
    ensureCtx();
    const chord = { B: 45, T: 52, A: 60, S: 64 };
    const parts = activeParts();
    const ens = +$('#ens').value;
    const ctx = S.ctx;
    Object.entries(chord).forEach(([p, m], i) => {
      if (!parts[p]) return;
      const buf = S.bank.get(m, p);
      for (let e = 0; e < ens; e++) {
        const { g, src } = playBuffer(buf, i * 0.35 + e * 0.02, 1, 0, (Math.random() - 0.5) * (ens > 1 ? 16 : 0));
        const t = ctx.currentTime + i * 0.35;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.45 / Math.sqrt(ens), t + 0.25);
        g.gain.setValueAtTime(0.45 / Math.sqrt(ens), t + 3.2 - i * 0.35);
        g.gain.linearRampToValueAtTime(0, t + 4 - i * 0.35);
        src.stop(t + 4.2);
      }
    });
    S.preview = { start: ctx.currentTime, until: ctx.currentTime + 4, midi: chord.S };
  }

  // ---------- música ----------
  function renderStyles() {
    $('#styles').innerHTML = Object.entries(Music.STYLES).map(([id, st]) => `
      <button class="style" role="radio" aria-checked="${id === S.style}" data-style="${id}">
        <strong>${st.name}</strong><span>${st.blurb}</span><em>${st.bpm} bpm · ${modeLabel(st.mode)}</em>
      </button>`).join('');
  }
  function modeLabel(m) {
    return { ionian: 'mayor', dorian: 'dórico', phrygian: 'frigio', lydian: 'lidio', aeolian: 'menor', harmonic: 'menor armónica' }[m];
  }
  function renderKeys() {
    const opts = ['<option value="">Automática</option>'];
    for (let i = 0; i < 12; i++) opts.push(`<option value="${48 + i}">${A.NOTE_NAMES[i]}</option>`);
    $('#keySel').innerHTML = opts.join('');
  }

  function genOptions() {
    return {
      seed: Math.max(1, +$('#seed').value || 1),
      bars: $('#barsSel').value.startsWith('loop:') ? +$('#barsSel').value.slice(5) : 16,
      song: $('#barsSel').value.startsWith('song:') ? +$('#barsSel').value.slice(5) : null,
      root: $('#keySel').value === '' ? null : +$('#keySel').value,
      bpm: +$('#bpm').value || null,
    };
  }
  function mixFlags(extra) {
    return Object.assign({
      choirGain: +$('#mixChoir').value / 100,
      musicGain: +$('#mixMusic').value / 100,
      ensemble: +$('#ens').value,
      parts: activeParts(),
      phrases: S.phrases.length && $('#usePhrase').checked ? S.phrases : null,
      phraseHarm: $('#phraseHarm').checked,
    }, extra);
  }

  async function generate() {
    if (S.busy) return;
    ensureCtx();
    if (!S.bank) setSample(Voice.synthExample(44100));
    stopPlayback();
    S.busy = true;
    const btn = $('#btnGen');
    btn.disabled = true;
    const prog = $('#genProg');
    prog.hidden = false;
    const bar = prog.querySelector('div'), txt = prog.querySelector('span');
    const onP = (p, msg) => { bar.style.width = (p * 100).toFixed(0) + '%'; txt.textContent = msg; };
    try {
      const score = Music.compose(S.style, genOptions());
      const bank = S.bank;
      S.renderFn = (flags, cb) => Music.render(score, bank, flags, cb);
      const res = await S.renderFn(mixFlags({ choir: true, music: true }), onP);
      showResult(score, res, score.st.name);
    } catch (e) {
      console.error(e);
      txt.textContent = 'Algo falló al generar. Prueba con otra variación o menos compases.';
      S.busy = false; btn.disabled = false;
      return;
    }
    prog.hidden = true;
    S.busy = false;
    btn.disabled = false;
  }


  // Muestra el resultado (canción o remix) en el reproductor
  function showResult(score, res, title) {
    S.score = score;
    S.track = res;
    S.stems = {};
    $('#resultStep').hidden = false;
    const nv = res.vocals ? res.vocals.placements.length : 0;
    const form = score.song ? score.sections.map(x => x.name).join(' → ') : `loop de ${score.bars} compases`;
    $('#trackInfo').innerHTML = `<b>${escapeHtml(title)}</b><br>${Music.keyName(score)} · ${score.bpm} bpm · ${fmtTime(res.buffer.duration)} · ${escapeHtml(form)}<br>${nv ? `Tu voz canta en ${nv} momento${nv === 1 ? '' : 's'}` : 'Sin voz principal'}${S.sample ? ' · coro: ' + escapeHtml(S.sample.label) : ''}`;
    $('#btnDlMusic').textContent = score.remix ? 'Descargar WAV · instrumental' : 'Descargar WAV · sin coro';
    drawWave();
    startPlayback();
    $('#resultStep').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ---------- remix ----------
  function rxScore() {
    const v = $('#rxKey').value;
    const o = { bpmMul: S.rx.mul, shiftBeats: S.rx.shift };
    if (v) { const [pcS, mode] = v.split(':'); o.keyPc = +pcS; o.mode = mode; }
    return Remix.buildScore(S.instr.an, o);
  }

  function renderRemixFacts() {
    if (!S.instr) return;
    let sc;
    try { sc = rxScore(); } catch (e) { $('#instrFacts').innerHTML = '<div><dt>Aviso</dt><dd>La instrumental es demasiado corta</dd></div>'; return; }
    S.rxPreview = sc;
    $('#rxBpm').textContent = `${sc.bpm} bpm`;
    $('#rxShift').textContent = S.rx.shift ? `${S.rx.shift > 0 ? '+' : ''}${S.rx.shift} tiempo${Math.abs(S.rx.shift) === 1 ? '' : 's'}` : 'auto';
    const an = S.instr.an;
    const rows = [
      ['Instrumental', S.instr.name],
      ['Duración', fmtTime(an.duration)],
      ['Tonalidad', Music.keyName(sc) + ($('#rxKey').value ? '' : ' (detectada)')],
      ['Compases', String(sc.bars)],
      ['Partes', sc.sections.map(x => x.name.replace(/ \d+$/, '')).join(' · ')],
    ];
    $('#instrFacts').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join('');
  }

  async function loadInstrumental(file) {
    if (!file || S.busy) return;
    const ctx = ensureCtx();
    const prog = $('#remixProg');
    const onP = progUI(prog);
    S.busy = true;
    try {
      onP(0, 'Abriendo la instrumental…');
      const ab = await ctx.decodeAudioData(await file.arrayBuffer());
      const an = await Remix.analyze(ab, onP);
      S.instr = { buffer: ab, an, name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Instrumental' };
      S.rx = { mul: 1, shift: 0 };
      $('#rxKey').value = '';
      renderRemixFacts();
      $('#rxControls').hidden = false;
      $('#btnRemix').disabled = false;
      status($('#rxStatus'), S.phrases.length ? 'Instrumental lista. Pulsa “Crear remix”.' : 'Instrumental lista. Ahora graba tu voz en el paso 2 y luego pulsa “Crear remix”.', 'ok');
    } catch (e) {
      console.error(e);
      status($('#rxStatus'), e.message === 'corta' ? 'La instrumental es demasiado corta (mínimo unos 10 segundos).' : 'No pude leer ese archivo. Prueba con MP3, WAV u OGG.', 'err');
    }
    prog.hidden = true;
    S.busy = false;
  }

  async function makeRemix() {
    if (S.busy || !S.instr) return;
    if (!S.phrases.length) { status($('#rxStatus'), 'Primero graba tu voz en el paso 2 (o sube una grabación tuya).', 'err'); return; }
    ensureCtx();
    stopPlayback();
    S.busy = true;
    const btn = $('#btnRemix');
    btn.disabled = true;
    const prog = $('#remixProg');
    const onP = progUI(prog);
    try {
      const score = rxScore();
      const instr = S.instr.buffer, bank = S.bank;
      S.renderFn = (flags, cb) => Music.renderRemix(score, instr, bank, flags, cb);
      const res = await S.renderFn(mixFlags({ choir: true, music: true, backing: $('#rxBacking').checked }), onP);
      showResult(score, res, 'Remix · ' + S.instr.name);
      status($('#rxStatus'), 'Remix listo. Escúchalo abajo o ajusta tempo, compás o tonalidad y vuelve a crearlo.', 'ok');
    } catch (e) {
      console.error(e);
      status($('#rxStatus'), 'Algo falló al crear el remix. Prueba de nuevo o ajusta el tempo.', 'err');
    }
    prog.hidden = true;
    btn.disabled = false;
    S.busy = false;
  }

  function renderRxKeys() {
    const opts = ['<option value="">Detectada automáticamente</option>'];
    for (let i = 0; i < 12; i++) {
      opts.push(`<option value="${i}:ionian">${A.NOTE_NAMES[i]} mayor</option>`);
      opts.push(`<option value="${i}:aeolian">${A.NOTE_NAMES[i]} menor</option>`);
    }
    $('#rxKey').innerHTML = opts.join('');
  }


  // ---------- efectos de sonido ----------
  const SFX_EXAMPLES = {
    'Jefes y criaturas': ['rugido de dragón gigante', 'gruñido de orco furioso', 'chillido de araña gigante', 'risa malvada del hechicero', 'aparición del jefe final', 'derrota del jefe', 'pisotón de gólem gigante', 'ladrido de cerbero'],
    'Escenarios (loop)': ['cueva oscura con goteo', 'bosque con pájaros', 'lluvia suave', 'tormenta de viento', 'hoguera', 'río tranquilo', 'volcán de lava', 'trueno lejano'],
    'Juego': ['espada', 'explosión', 'choque de escudo metálico', 'puñetazo', 'flecha rápida', 'hechizo mágico', 'curación', 'moneda 8-bit', 'salto 8-bit', 'disparo láser', 'pistola', 'subir de nivel', 'recibir daño', 'game over', 'victoria', 'puerta que cruje', 'pasos', 'click de menú', 'portal', 'electricidad', 'alarma', 'latido de corazón', 'fantasma', 'robot', 'campana'],
  };
  let sfxCount = 0;

  function renderSfxCats() {
    $('#sfxCats').innerHTML = Object.entries(SFX_EXAMPLES).map(([cat, list]) =>
      `<div class="sfx-cat"><span>${cat}</span>${list.map(t => `<button type="button" class="chip" data-sfx="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}</div>`).join('');
  }

  function stopSfx() {
    if (S.sfxSrc) { try { S.sfxSrc.stop(); } catch (e) { /* ya parado */ } }
    if (S.sfxBtn) { S.sfxBtn.textContent = '▶'; S.sfxBtn.setAttribute('aria-label', 'Escuchar'); }
    S.sfxSrc = S.sfxBtn = null;
  }

  function drawMini(cv, buf) {
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 300, h = cv.clientHeight || 34;
    cv.width = w * dpr; cv.height = h * dpr;
    const c = cv.getContext('2d'); c.scale(dpr, dpr);
    const d = buf.getChannelData(0), step = Math.ceil(d.length / w);
    c.fillStyle = '#6fd6ff';
    for (let x = 0; x < w; x++) {
      let mx = 0;
      for (let i = x * step; i < (x + 1) * step && i < d.length; i += 8) mx = Math.max(mx, Math.abs(d[i]));
      c.fillRect(x, h / 2 - mx * h / 2, 1, Math.max(1, mx * h));
    }
  }

  async function createSfx(text) {
    text = (text || '').trim();
    if (!text || S.sfxBusy) return;
    ensureCtx();
    const p = SFX.parse(text);
    if (!p.recipe) {
      status($('#sfxStatus'), `No reconocí “${text}”. Prueba con palabras como: rugido, gruñido, explosión, espada, magia, moneda, salto, láser, cueva, bosque, lluvia, fuego, viento, puerta, pasos o alarma.`, 'err');
      return;
    }
    S.sfxBusy = true;
    $('#btnSfx').disabled = true;
    const onP = progUI($('#sfxProg'));
    const useVoice = $('#sfxVoice').checked && S.phrases.length ? S.phrases : null;
    const base = 1 + Math.floor(Math.random() * 90000);
    const made = [];
    try {
      for (let v = 0; v < 3; v++) {
        onP(v / 3, `Creando variación ${v + 1} de 3…`);
        const r = await SFX.generate(text, { seed: base + v, voice: useVoice });
        made.push(r);
      }
      const list = $('#sfxList');
      made.reverse().forEach((r, i) => {
        const n = ++sfxCount, vnum = 3 - i;
        const li = document.createElement('li');
        li.className = 'sfx-item';
        li.innerHTML = `<button class="play" aria-label="Escuchar">▶</button>
          <div class="meta"><b>${escapeHtml(text)} · v${vnum}</b><small>${escapeHtml(r.desc)} · ${r.buffer.duration.toFixed(1)} s${r.loop ? ' · loop' : ''}${r.usedVoice ? ' · con tu voz' : ''}</small><canvas></canvas></div>
          <button class="dl">WAV</button>`;
        list.prepend(li);
        drawMini(li.querySelector('canvas'), r.buffer);
        const play = li.querySelector('.play');
        play.addEventListener('click', () => {
          if (S.sfxBtn === play) { stopSfx(); return; }
          stopSfx(); stopPlayback();
          const src = S.ctx.createBufferSource();
          src.buffer = r.buffer; src.loop = r.loop;
          src.connect(S.outAnalyser); src.start();
          src.onended = () => { if (S.sfxSrc === src) stopSfx(); };
          S.sfxSrc = src; S.sfxBtn = play;
          play.textContent = '■'; play.setAttribute('aria-label', 'Detener');
        });
        li.querySelector('.dl').addEventListener('click', () => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(Music.toWav(r.buffer));
          const slug = SFX.parse(text).recipe.id.normalize('NFD').replace(/[^a-z0-9]/gi, '');
          a.download = `sfx-${slug}-${n}${r.loop ? '-loop' : ''}.wav`;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        });
      });
      while (list.children.length > 30) list.lastElementChild.remove();
      const first = made[made.length - 1];
      status($('#sfxStatus'), `Listo: ${first.desc}. Tres variaciones abajo${first.loop ? ' (en loop)' : ''}${first.usedVoice ? ', hechas con tu voz' : ''}.`, 'ok');
      list.firstElementChild.querySelector('.play').click();
    } catch (e) {
      console.error(e);
      status($('#sfxStatus'), 'Algo falló al crear el sonido. Prueba con otra descripción.', 'err');
    }
    $('#sfxProg').hidden = true;
    $('#btnSfx').disabled = false;
    S.sfxBusy = false;
  }

  function fmtTime(s) { return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`; }

  function startPlayback(offset = 0) {
    if (!S.track) return;
    if (typeof stopSfx === 'function') stopSfx();
    const ctx = ensureCtx();
    stopPlayback();
    const src = ctx.createBufferSource();
    src.buffer = S.track.buffer;
    src.loop = !(S.score && S.score.song);
    src.onended = () => { if (S.player && S.player.src === src) stopPlayback(); };
    src.connect(S.outAnalyser);
    src.start(0, offset);
    S.player = { src, startAt: ctx.currentTime - offset };
    $('#btnPlay').textContent = '❚❚';
    $('#btnPlay').setAttribute('aria-label', 'Pausar');
    if (!S.mic) setBadge('play', 'Coro sonando');
  }
  function stopPlayback() {
    if (S.player) { try { S.player.src.stop(); } catch (e) { /* ya parado */ } }
    S.player = null;
    $('#btnPlay').textContent = '▶';
    $('#btnPlay').setAttribute('aria-label', 'Reproducir');
    if (!S.mic) setBadge('', 'En reposo');
  }

  function drawWave() {
    const cv = $('#wave');
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w) return;
    cv.width = w * dpr; cv.height = h * dpr;
    const c = cv.getContext('2d', { willReadFrequently: true });
    c.scale(dpr, dpr);
    c.clearRect(0, 0, w, h);
    if (!S.track) return;
    const d = S.track.buffer.getChannelData(0);
    const step = Math.ceil(d.length / w);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ffb347'); g.addColorStop(1, '#6fd6ff');
    c.fillStyle = g;
    for (let x = 0; x < w; x++) {
      let mn = 0, mx = 0;
      for (let i = x * step; i < (x + 1) * step && i < d.length; i += 4) { const v = d[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
      c.fillRect(x, h / 2 + mn * h / 2, 1, Math.max(1, (mx - mn) * h / 2));
    }
    // marcas de compás
    const sc = S.score;
    c.fillStyle = 'rgba(154,160,196,0.35)';
    const total = S.track.buffer.duration;
    const off = sc.offset || 0;
    for (let b = 0; b <= sc.bars; b++) c.fillRect((off + b * sc.barDur) / total * w, 0, 1, b % 4 === 0 ? h * 0.25 : 6);
    if (sc.song) {
      c.font = '600 11px "IBM Plex Mono", monospace';
      sc.sections.forEach((x, i) => {
        const xx = (off + x.start * sc.barDur) / total * w;
        c.fillStyle = 'rgba(255,255,255,0.75)';
        c.fillRect(xx, 0, 1.5, h);
        c.fillStyle = 'rgba(13,16,32,0.75)';
        const label = x.name.replace('Estribillo final', 'Estribillo');
        const tw = c.measureText(label).width;
        if ((sc.sections[i + 1] ? (off + sc.sections[i + 1].start * sc.barDur) / total * w : w) - xx > tw + 8) {
          c.fillRect(xx + 2, 2, tw + 6, 15);
          c.fillStyle = '#e8e6f2';
          c.fillText(label, xx + 5, 13);
        }
      });
    }
    S.waveImg = c.getImageData(0, 0, cv.width, cv.height);
  }
  function drawPlayhead() {
    if (!S.track || !S.waveImg) return;
    const cv = $('#wave'), c = cv.getContext('2d', { willReadFrequently: true });
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.putImageData(S.waveImg, 0, 0);
    if (!S.player) return;
    const pos = ((S.ctx.currentTime - S.player.startAt) % S.track.buffer.duration) / S.track.buffer.duration;
    c.fillStyle = '#fff';
    c.fillRect(pos * cv.width, 0, 2 * (window.devicePixelRatio || 1), cv.height);
  }

  async function download(kind) {
    if (!S.score || S.busy) return;
    let buf;
    if (kind === 'mix') buf = S.track.buffer;
    else {
      if (!S.stems[kind]) {
        S.busy = true;
        const prog = $('#dlProg');
        const extra = kind === 'choir' ? { music: false } : { choir: false };
        if (S.score.remix) extra.backing = $('#rxBacking').checked;
        try {
          const res = await S.renderFn(mixFlags(extra), progUI(prog));
          S.stems[kind] = res.buffer;
        } finally { prog.hidden = true; }
        S.busy = false;
      }
      buf = S.stems[kind];
    }
    const blob = Music.toWav(buf);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const sname = S.score.styleId + '-' + S.score.seed;
    a.download = `laringe-${sname}-${{ mix: 'mezcla', choir: 'voces', music: S.score.remix ? 'instrumental' : 'orquesta' }[kind]}.wav`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---------- animación ----------
  const VOW = {
    a: { open: 0.9, front: 0.45, high: 0.1, round: 0 }, e: { open: 0.45, front: 0.8, high: 0.6, round: 0 },
    i: { open: 0.22, front: 1, high: 1, round: 0 }, o: { open: 0.55, front: 0.15, high: 0.45, round: 0.8 },
    u: { open: 0.25, front: 0.05, high: 0.85, round: 1 },
  };
  let lastTs = 0, frameN = 0;
  const tdBuf = new Float32Array(2048);

  function sizeCanvas(cv) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  }

  function leadAt(t) {
    const lead = S.track && S.track.lead;
    if (!lead) return null;
    let lo = 0, hi = lead.length - 1, f = null;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (lead[m].t <= t) { f = m; lo = m + 1; } else hi = m - 1; }
    if (f == null) return null;
    const ev = lead[f];
    return t < ev.t + ev.dur + 0.1 ? ev : null;
  }

  function loop(ts) {
    const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
    lastTs = ts;
    frameN++;
    const tgt = { amp: 0, f0: 0, F1: 0, F2: 0, vowel: null, src: null };

    if (S.analyser) {
      S.analyser.getFloatTimeDomainData(tdBuf);
      const a = A.rms(tdBuf);
      tgt.amp = Math.min(1, a * 7);
      if (a > 0.008) {
        const p = A.yin(tdBuf, S.ctx.sampleRate);
        if (p.f0 > 0 && p.clarity > 0.75) {
          tgt.f0 = p.f0; tgt.src = 'mic';
          const fm = A.lpcFormants(tdBuf, S.ctx.sampleRate);
          if (fm && fm.F1) { tgt.F1 = fm.F1; tgt.F2 = fm.F2; tgt.vowel = A.vowel(fm.F1, fm.F2); }
        }
      }
    }
    if (!tgt.f0 && S.ctx && (S.player || (S.preview && S.ctx.currentTime < S.preview.until))) {
      S.outAnalyser.getFloatTimeDomainData(tdBuf);
      const a = Math.min(1, A.rms(tdBuf) * 4);
      let midi = null;
      if (S.player) {
        const t = (S.ctx.currentTime - S.player.startAt) % S.track.buffer.duration;
        const ev = leadAt(t);
        if (ev) midi = ev.midi;
      } else midi = S.preview.midi;
      if (midi != null && a > 0.02) {
        tgt.f0 = A.midiToFreq(midi); tgt.amp = Math.max(tgt.amp, a); tgt.vowel = (S.sample && S.sample.vowel) || 'a'; tgt.src = 'play';
      } else tgt.amp = Math.max(tgt.amp, a * 0.5);
    }

    // de formantes / vocal a la postura articulatoria
    const h = S.head;
    let post;
    if (tgt.f0 && tgt.F1 && tgt.F2) {
      const v = VOW[tgt.vowel] || VOW.a;
      post = {
        high: A.clamp(1 - (tgt.F1 - 280) / 520), front: A.clamp((tgt.F2 - 750) / 1500),
        open: A.clamp(0.12 + (tgt.F1 - 280) / 560), round: v.round,
      };
    } else if (tgt.f0) post = Object.assign({}, VOW[tgt.vowel] || VOW.a);
    else post = { open: 0.04 + 0.03 * Math.sin(ts / 900), front: 0.5, high: 0.55, round: 0 };
    if (tgt.f0) post.open *= 0.35 + 0.65 * Math.min(1, tgt.amp * 1.5);
    const k = Math.min(1, dt * 12);
    for (const key of ['open', 'front', 'high', 'round']) h[key] += (post[key] - h[key]) * k;
    h.amp += (tgt.amp - h.amp) * Math.min(1, dt * 18);
    h.f0 = tgt.f0;
    h.phase += dt * 2 * Math.PI * (tgt.f0 ? Math.min(tgt.f0 / 30, 10) : 0.4);

    const headCv = $('#head');
    sizeCanvas(headCv);
    Head.draw(headCv, h, ts / 1000);
    Head.drawGlottis($('#glottis'), h);

    // historial de tono
    S.pitchHist.push(tgt.f0 ? A.freqToMidi(tgt.f0) : null);
    S.pitchHist.shift();
    drawPitch();

    if (frameN % 4 === 0) {
      $('#roHz').textContent = tgt.f0 ? `${tgt.f0.toFixed(0)} Hz` : '—';
      $('#roNote').textContent = tgt.f0 ? A.noteName(A.freqToMidi(tgt.f0)) : '—';
      $('#roVowel').textContent = tgt.vowel ? tgt.vowel.toUpperCase() : '—';
      $('#roF').textContent = tgt.F1 ? `${tgt.F1.toFixed(0)} · ${tgt.F2.toFixed(0)}` : '—';
    }
    $('#meterFill').style.width = (h.amp * 100).toFixed(0) + '%';
    drawPlayhead();
    requestAnimationFrame(loop);
  }

  function drawPitch() {
    const cv = $('#pitch');
    sizeCanvas(cv);
    const c = cv.getContext('2d');
    const w = cv.width, hh = cv.height;
    c.clearRect(0, 0, w, hh);
    const lo = 36, hi = 84;
    const y = m => hh - (m - lo) / (hi - lo) * hh;
    c.font = `${Math.round(10 * w / cv.clientWidth)}px "IBM Plex Mono", monospace`;
    for (let m = lo; m <= hi; m += 12) {
      c.fillStyle = 'rgba(154,160,196,0.25)';
      c.fillRect(0, y(m), w, 1);
      c.fillStyle = 'rgba(154,160,196,0.8)';
      c.fillText(A.noteName(m), 4, y(m) - 3);
    }
    const n = S.pitchHist.length;
    c.fillStyle = '#ffb347';
    const r = Math.max(1.5, w / n * 0.6);
    S.pitchHist.forEach((m, i) => {
      if (m == null) return;
      c.globalAlpha = 0.25 + 0.75 * (i / n);
      c.beginPath(); c.arc(i / n * w, y(Math.max(lo, Math.min(hi, m))), r, 0, Math.PI * 2); c.fill();
    });
    c.globalAlpha = 1;
  }

  // ---------- eventos ----------
  function bind() {
    $('#btnMic').addEventListener('click', () => (S.mic ? stopMic() : startMic()));
    $('#fileIn').addEventListener('change', e => handleFile(e.target.files[0]));
    document.querySelector('label[for=fileIn]').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#fileIn').click(); } });
    $('#btnExample').addEventListener('click', () => { setSample(Voice.synthExample(44100)); S.phrases = []; S.phraseRaw = null; $('#usePhrase').checked = false; $('#usePhrase').disabled = true; renderPhraseFacts(); status($('#micStatus'), 'Usando la voz de ejemplo sintética.'); });
    $('#btnRecSample').addEventListener('click', recordSample);
    $('#btnRecPhrase').addEventListener('click', recordPhrase);
    $('#btnStopRec').addEventListener('click', () => { S.stopRec = true; });
    $('#btnPlayPhrase').addEventListener('click', () => { if (S.phraseRaw) playRaw(S.phraseRaw.data, S.phraseRaw.sr); });
    $('#btnPlaySample').addEventListener('click', playSample);
    $('#btnRange').addEventListener('click', rangeTest);
    $('#btnWho').addEventListener('click', whoSings);
    $('#btnSave').addEventListener('click', saveProfile);
    $('#profList').addEventListener('click', e => {
      const del = e.target.closest('[data-del]'), use = e.target.closest('[data-use]');
      if (del) { S.profiles = S.profiles.filter(p => p.id !== del.dataset.del); persistProfiles(); renderProfiles(); }
      if (use) {
        const p = S.profiles.find(x => x.id === use.dataset.use);
        (async () => {
          try {
            if (p.sample) { const sm = Voice.decodeSample(p.sample); sm.mine = true; setSample(sm); }
            if (p.phrase) await setVoiceRecording(Voice.decodeRaw(p.phrase), p.phrase.sr, 'Voz de ' + p.name);
            renderPhraseFacts();
            status($('#micStatus'), `Usando la voz de ${p.name}.`, 'ok');
          } catch (err) { status($('#micStatus'), 'No pude cargar la voz de ese perfil.', 'err'); }
        })();
      }
    });
    $('#ens').addEventListener('input', e => { $('#ensOut').textContent = e.target.value; });
    $('#keepTimbre').addEventListener('change', () => { if (S.sample) setSample(S.sample); renderPhraseFacts(); });
    $('#btnChord').addEventListener('click', previewChord);
    $('#styles').addEventListener('click', e => {
      const b = e.target.closest('[data-style]');
      if (!b) return;
      S.style = b.dataset.style;
      document.querySelectorAll('[data-style]').forEach(x => x.setAttribute('aria-checked', x === b));
    });
    $('#bpm').addEventListener('input', e => { $('#bpmOut').textContent = +e.target.value ? e.target.value + ' bpm' : 'auto'; });
    $('#btnDice').addEventListener('click', () => { $('#seed').value = 1 + Math.floor(Math.random() * 99998); });
    $('#mixChoir').addEventListener('input', e => { $('#mixChoirOut').textContent = e.target.value + '%'; });
    $('#mixMusic').addEventListener('input', e => { $('#mixMusicOut').textContent = e.target.value + '%'; });
    $('#btnGen').addEventListener('click', generate);
    $('#instrIn').addEventListener('change', e => loadInstrumental(e.target.files[0]));
    document.querySelector('label[for=instrIn]').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#instrIn').click(); } });
    $('#btnPlayInstr').addEventListener('click', () => { if (S.instr) { stopPlayback(); playBuffer(S.instr.buffer, 0, 1, 0.8); } });
    $('#btnRemix').addEventListener('click', makeRemix);
    $('#sfxForm').addEventListener('submit', e => { e.preventDefault(); createSfx($('#sfxText').value); });
    $('#sfxCats').addEventListener('click', e => { const b = e.target.closest('[data-sfx]'); if (b) { $('#sfxText').value = b.dataset.sfx; createSfx(b.dataset.sfx); } });
    $('#rxKey').addEventListener('change', renderRemixFacts);
    $('#rxHalf').addEventListener('click', () => { S.rx.mul = Math.max(0.25, S.rx.mul / 2); renderRemixFacts(); });
    $('#rxDouble').addEventListener('click', () => { S.rx.mul = Math.min(4, S.rx.mul * 2); renderRemixFacts(); });
    $('#rxPrev').addEventListener('click', () => { S.rx.shift = (S.rx.shift - 1) % 4; renderRemixFacts(); });
    $('#rxNext').addEventListener('click', () => { S.rx.shift = (S.rx.shift + 1) % 4; renderRemixFacts(); });
    $('#btnPlay').addEventListener('click', () => (S.player ? stopPlayback() : startPlayback()));
    $('#wave').addEventListener('click', e => {
      if (!S.track) return;
      const rect = e.target.getBoundingClientRect();
      startPlayback((e.clientX - rect.left) / rect.width * S.track.buffer.duration);
    });
    $('#btnDlMix').addEventListener('click', () => download('mix'));
    $('#btnDlChoir').addEventListener('click', () => download('choir'));
    $('#btnDlMusic').addEventListener('click', () => download('music'));
    window.addEventListener('resize', () => { drawRange(); drawWave(); });
  }

  // ---------- app instalable ----------
  function setupInstall() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => { /* sin modo offline */ });
    }
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (standalone) return;
    let deferred = null;
    const btn = $('#btnInstall');
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      deferred = e;
      btn.hidden = false;
    });
    btn.addEventListener('click', async () => {
      if (!deferred) return;
      deferred.prompt();
      await deferred.userChoice.catch(() => null);
      deferred = null;
      btn.hidden = true;
    });
    window.addEventListener('appinstalled', () => { btn.hidden = true; $('#installHint').hidden = true; });
    // iPhone/iPad no muestran el botón: se explica cómo hacerlo
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (ios) {
      const hint = $('#installHint');
      hint.textContent = 'Para instalarla en tu iPhone o iPad: pulsa Compartir y luego “Añadir a pantalla de inicio”.';
      hint.hidden = false;
    }
  }

  function init() {
    setupInstall();
    renderParts();
    renderStyles();
    renderKeys();
    renderRxKeys();
    renderSfxCats();
    bind();
    loadProfiles();
    try { setSample(Voice.synthExample(44100)); } catch (e) { console.error(e); }
    drawRange();
    requestAnimationFrame(loop);
  }
  init();
})();
