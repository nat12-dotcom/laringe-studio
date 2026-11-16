/* Laringe Studio — simulador de cabeza holográfico (corte sagital)
 * Dibuja el tracto vocal como un holograma: pliegues vocales, faringe, lengua,
 * mandíbula y labios, animados por el tono, el volumen y los formantes de la voz.
 */
const Head = (() => {
  const W = 660, H = 540, OX = 72; // espacio virtual (la cabeza se desplaza OX para dejar sitio a las etiquetas)
  const PIVOT = [300, 280];
  const HOLO = '111,214,255';   // cian del holograma
  const DEEP = '40,120,255';    // azul profundo
  const ENERGY = '255,179,71';  // energía de la voz (ámbar)

  const rgba = (c, a) => `rgba(${c},${a})`;

  function rot(p, a) {
    const c = Math.cos(a), s = Math.sin(a), dx = p[0] - PIVOT[0], dy = p[1] - PIVOT[1];
    return [PIVOT[0] + dx * c - dy * s, PIVOT[1] + dx * s + dy * c];
  }

  function skinPath(ctx, ang) {
    const R = p => rot(p, ang);
    const r2 = p => rot(p, ang * 0.55);
    ctx.beginPath();
    ctx.moveTo(185, 540);
    ctx.bezierCurveTo(180, 480, 150, 440, 128, 400);
    ctx.bezierCurveTo(95, 340, 88, 250, 120, 180);
    ctx.bezierCurveTo(160, 90, 260, 55, 330, 80);
    ctx.bezierCurveTo(380, 98, 400, 150, 398, 205);
    ctx.bezierCurveTo(398, 222, 392, 232, 395, 245);
    ctx.bezierCurveTo(410, 265, 440, 285, 452, 300);
    ctx.bezierCurveTo(458, 310, 440, 318, 420, 318);
    ctx.bezierCurveTo(428, 326, 434, 334, 430, 343);
    ctx.lineTo(416, 348);
    const p = [[416, 352], [432, 356], [432, 370], [420, 376], [410, 382], [408, 388], [412, 398], [420, 415], [418, 438], [398, 448]].map(R);
    ctx.lineTo(...p[0]);
    ctx.bezierCurveTo(...p[1], ...p[2], ...p[3]);
    ctx.bezierCurveTo(...p[4], ...p[5], ...p[6]);
    ctx.bezierCurveTo(...p[7], ...p[8], ...p[9]);
    const q = [[370, 458], [340, 456], [322, 462]].map(r2);
    ctx.bezierCurveTo(...q[0], ...q[1], ...q[2]);
    ctx.bezierCurveTo(316, 480, 318, 510, 322, 540);
    ctx.closePath();
  }

  // Trazo holográfico: halo ancho + línea fina brillante
  function glowStroke(ctx, color, alpha, width, blur = 12) {
    ctx.save();
    ctx.shadowColor = rgba(color, Math.min(1, alpha + 0.2));
    ctx.shadowBlur = blur;
    ctx.strokeStyle = rgba(color, alpha * 0.35);
    ctx.lineWidth = width * 3;
    ctx.stroke();
    ctx.shadowBlur = blur * 0.5;
    ctx.strokeStyle = rgba(color, alpha);
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.restore();
  }
  function holoFill(ctx, alpha, color = HOLO) {
    ctx.fillStyle = rgba(color, alpha);
    ctx.fill();
  }

  // Ruido determinista para el parpadeo
  const hash = n => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

  function draw(cv, s, time) {
    const ctx = cv.getContext('2d');
    const scale = Math.min(cv.width / W, cv.height / H);
    const ox = (cv.width - W * scale) / 2 + OX * scale, oy = (cv.height - H * scale) / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);

    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tick = Math.floor(time * 24);
    const flicker = reduce ? 1 : 0.86 + 0.14 * hash(tick) - (hash(tick * 3.7) > 0.985 ? 0.35 : 0);
    const jitterX = !reduce && hash(tick * 1.3) > 0.97 ? (hash(tick) - 0.5) * 10 : 0;

    ctx.setTransform(scale, 0, 0, scale, ox + jitterX * scale, oy);

    const ang = s.open * 0.21;
    const R = p => rot(p, ang);
    const amp = s.amp;

    // haz del proyector y base
    const beam = ctx.createLinearGradient(0, 540, 0, 60);
    beam.addColorStop(0, rgba(HOLO, 0.16));
    beam.addColorStop(1, rgba(HOLO, 0));
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(250, 540); ctx.lineTo(70, 40); ctx.lineTo(500, 40); ctx.lineTo(330, 540);
    ctx.closePath(); ctx.fill();
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(290, 534, 70 + i * 34, 9 + i * 3, 0, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(HOLO, 0.45 - i * 0.12);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.globalAlpha = flicker;

    // halo de energía de la voz
    if (amp > 0.02) {
      const g = ctx.createRadialGradient(280, 360, 20, 280, 360, 280);
      g.addColorStop(0, rgba(ENERGY, 0.14 * amp));
      g.addColorStop(1, rgba(ENERGY, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-OX, 0, W, H);
    }

    // silueta
    skinPath(ctx, ang);
    const sg = ctx.createLinearGradient(100, 80, 450, 520);
    sg.addColorStop(0, rgba(HOLO, 0.16));
    sg.addColorStop(1, rgba(DEEP, 0.08));
    ctx.fillStyle = sg;
    ctx.fill();

    ctx.save();
    skinPath(ctx, ang);
    ctx.clip();

    // cortes de escáner (curvas de nivel) dentro de la cabeza
    ctx.lineWidth = 1;
    for (let y = 70; y < 540; y += 11) {
      ctx.beginPath();
      ctx.moveTo(60, y);
      for (let x = 60; x <= 470; x += 30) ctx.lineTo(x, y + Math.sin(x / 55 + y / 40) * 3);
      ctx.strokeStyle = rgba(HOLO, 0.09);
      ctx.stroke();
    }
    // banda de barrido
    const sweepY = 60 + ((time * 90) % 520);
    const sw = ctx.createLinearGradient(0, sweepY - 40, 0, sweepY + 6);
    sw.addColorStop(0, rgba(HOLO, 0));
    sw.addColorStop(0.85, rgba(HOLO, 0.22));
    sw.addColorStop(1, rgba(HOLO, 0.55));
    ctx.fillStyle = sw;
    ctx.fillRect(60, sweepY - 40, 420, 46);

    // cráneo y cerebro
    ctx.beginPath();
    ctx.moveTo(140, 300);
    ctx.bezierCurveTo(118, 200, 196, 92, 318, 100);
    ctx.bezierCurveTo(368, 108, 388, 160, 384, 218);
    glowStroke(ctx, HOLO, 0.5, 2, 8);
    ctx.beginPath();
    ctx.moveTo(150, 290);
    ctx.bezierCurveTo(135, 205, 205, 112, 312, 118);
    ctx.bezierCurveTo(355, 124, 372, 165, 368, 215);
    ctx.bezierCurveTo(330, 240, 230, 250, 150, 290);
    holoFill(ctx, 0.07, DEEP);
    ctx.save();
    ctx.clip();
    for (let i = 0; i < 9; i++) { // circunvoluciones
      ctx.beginPath();
      const cx = 170 + i * 22, cy = 170 + Math.sin(i * 1.7) * 30;
      ctx.arc(cx, cy, 18 + (i % 3) * 6, Math.PI * (0.1 + 0.2 * (i % 2)), Math.PI * (1.2 + 0.3 * (i % 3)));
      ctx.strokeStyle = rgba(HOLO, 0.22);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.restore();

    // columna (alámbrica)
    for (let y = 300; y < 540; y += 30) {
      ctx.beginPath();
      ctx.roundRect(182, y, 40, 24, 6);
      holoFill(ctx, 0.08);
      ctx.strokeStyle = rgba(HOLO, 0.45);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // cavidad nasal
    ctx.beginPath();
    ctx.moveTo(394, 258);
    ctx.bezierCurveTo(360, 250, 300, 250, 262, 270);
    ctx.bezierCurveTo(250, 282, 256, 298, 272, 300);
    ctx.lineTo(388, 306);
    ctx.bezierCurveTo(398, 300, 402, 280, 394, 258);
    holoFill(ctx, 0.1, DEEP);
    glowStroke(ctx, HOLO, 0.55, 1.2, 6);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(330, 266 + i * 12, 46 - i * 6, 4, -0.04, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(HOLO, 0.4);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // tracto vocal (aire): boca + faringe + laringe
    const fl = [[408, 360], [386, 396], [330, 426]].map(R);
    ctx.beginPath();
    ctx.moveTo(416, 342);
    ctx.bezierCurveTo(405, 322, 395, 318, 382, 316);
    ctx.bezierCurveTo(340, 310, 300, 309, 280, 312);
    ctx.bezierCurveTo(262, 316, 250, 330, 248, 345);
    ctx.lineTo(246, 470);
    ctx.lineTo(262, 486);
    ctx.lineTo(292, 482);
    ctx.lineTo(292, 450);
    ctx.bezierCurveTo(...fl[2], ...fl[1], ...fl[0]);
    ctx.lineTo(...R([416, 354]));
    ctx.closePath();
    ctx.fillStyle = 'rgba(4,10,30,0.55)';
    ctx.fill();
    glowStroke(ctx, HOLO, 0.35, 1, 6);

    // pared faríngea
    ctx.beginPath();
    ctx.moveTo(246, 300);
    ctx.lineTo(244, 540);
    glowStroke(ctx, HOLO, 0.6, 2, 8);

    // onda sonora recorriendo el tracto
    const path = [[276, 486], [262, 462], [254, 420], [252, 372], [262, 334], [300, 322], [350, 326], [392, 338], [430, 352]];
    if (amp > 0.02) {
      ctx.save();
      ctx.shadowColor = rgba(ENERGY, 0.9);
      ctx.shadowBlur = 10;
      for (let k = 0; k < 14; k++) {
        const u = ((time * (0.9 + s.f0 / 600) + k / 14) % 1);
        const fi = u * (path.length - 1), i0 = Math.floor(fi), fr = fi - i0;
        const a = path[i0], b = path[Math.min(path.length - 1, i0 + 1)];
        const x = a[0] + (b[0] - a[0]) * fr, y = a[1] + (b[1] - a[1]) * fr;
        ctx.beginPath();
        ctx.arc(x, y, 2.5 + amp * 3.5, 0, Math.PI * 2);
        ctx.fillStyle = rgba(ENERGY, 0.3 + 0.6 * amp * (1 - u * 0.4));
        ctx.fill();
      }
      ctx.restore();
    }

    // lengua
    const hx = 285 + s.front * 62;
    const hy = 350 - s.high * 30 + s.open * 16;
    const tip = R([394 - (1 - s.front) * 18, 352 + (1 - s.high) * 6]);
    ctx.beginPath();
    ctx.moveTo(286, 468);
    ctx.bezierCurveTo(264, 446, 258, hy + 36, hx - 42, hy + 10);
    ctx.quadraticCurveTo(hx, hy - 16, hx + 36, hy + 4);
    ctx.quadraticCurveTo(tip[0] - 22, tip[1] - 8, tip[0], tip[1]);
    const t2 = R([396, 372]), t3 = R([372, 400]), t4 = R([320, 432]);
    ctx.quadraticCurveTo(t2[0], t2[1], t3[0], t3[1]);
    ctx.quadraticCurveTo(t4[0], t4[1], 292, 452);
    ctx.closePath();
    const tg = ctx.createLinearGradient(260, hy - 20, 330, 460);
    tg.addColorStop(0, rgba(HOLO, 0.32));
    tg.addColorStop(1, rgba(DEEP, 0.12));
    ctx.fillStyle = tg;
    ctx.fill();
    glowStroke(ctx, HOLO, 0.85, 1.6, 10);
    // malla de la lengua
    ctx.save();
    ctx.clip();
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(250 + i * 20, 320);
      ctx.lineTo(240 + i * 20, 480);
      ctx.strokeStyle = rgba(HOLO, 0.18);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();

    // paladar duro y velo
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(390, 311);
    ctx.bezierCurveTo(350, 306, 310, 305, 282, 309);
    glowStroke(ctx, HOLO, 0.95, 2.5, 10);
    ctx.beginPath();
    ctx.moveTo(284, 310);
    ctx.quadraticCurveTo(262, 318, 260, 342);
    glowStroke(ctx, HOLO, 0.7, 3, 8);

    // dientes
    ctx.beginPath();
    ctx.moveTo(400, 318); ctx.lineTo(412, 320); ctx.lineTo(410, 344); ctx.lineTo(403, 344);
    ctx.closePath();
    holoFill(ctx, 0.35);
    glowStroke(ctx, HOLO, 0.9, 1, 6);
    const lt = [[401, 372], [411, 372], [412, 354], [404, 356]].map(R);
    ctx.beginPath();
    ctx.moveTo(...lt[0]); lt.slice(1).forEach(p => ctx.lineTo(...p));
    ctx.closePath();
    holoFill(ctx, 0.35);
    glowStroke(ctx, HOLO, 0.9, 1, 6);

    // labios (redondeo para o / u)
    const lipW = 2 + s.round * 2;
    ctx.beginPath();
    ctx.moveTo(420 + s.round * 6, 336);
    ctx.quadraticCurveTo(430 + s.round * 8, 343, 418, 348);
    glowStroke(ctx, HOLO, 1, lipW, 10);
    const ll = [[418, 356], [432 + s.round * 8, 364], [420 + s.round * 6, 374]].map(R);
    ctx.beginPath();
    ctx.moveTo(...ll[0]);
    ctx.quadraticCurveTo(...ll[1], ...ll[2]);
    glowStroke(ctx, HOLO, 1, lipW, 10);

    // epiglotis
    ctx.beginPath();
    ctx.moveTo(290, 470);
    ctx.quadraticCurveTo(296, 448, 286, 436);
    glowStroke(ctx, HOLO, 0.75, 2, 6);

    // laringe: cartílago tiroides
    ctx.beginPath();
    ctx.ellipse(282, 494, 30, 20, 0, 0, Math.PI * 2);
    ctx.setLineDash([4, 4]);
    glowStroke(ctx, HOLO, 0.6, 1.2, 6);
    ctx.setLineDash([]);

    // pliegues vocales (vibran con el tono)
    const vib = s.f0 > 0 ? Math.sin(s.phase) * amp * 3 : 0;
    ctx.beginPath();
    ctx.moveTo(258, 488 + vib);
    ctx.quadraticCurveTo(276, 484 - vib, 300, 487 + vib);
    if (amp > 0.03) glowStroke(ctx, ENERGY, 1, 3, 6 + amp * 22);
    else glowStroke(ctx, HOLO, 0.9, 2.5, 8);

    // tráquea
    ctx.beginPath(); ctx.moveTo(262, 504); ctx.lineTo(266, 540);
    ctx.moveTo(302, 504); ctx.lineTo(304, 540);
    glowStroke(ctx, HOLO, 0.55, 1.2, 5);
    for (let y = 512; y < 540; y += 9) {
      ctx.beginPath(); ctx.moveTo(264, y); ctx.lineTo(303, y);
      ctx.strokeStyle = rgba(HOLO, 0.4); ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore(); // fin clip

    // contorno de la silueta (doble línea con brillo)
    skinPath(ctx, ang);
    glowStroke(ctx, HOLO, 0.95, 1.8, 18);
    ctx.save();
    ctx.translate(4, 0);
    skinPath(ctx, ang);
    ctx.strokeStyle = rgba(DEEP, 0.35);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // ojo y ceja
    ctx.beginPath(); ctx.ellipse(372, 214, 14, 6, 0.1, 0, Math.PI * 2);
    glowStroke(ctx, HOLO, 0.8, 1.2, 8);
    ctx.beginPath(); ctx.arc(376, 214, 3, 0, Math.PI * 2);
    holoFill(ctx, 0.9);
    ctx.beginPath(); ctx.moveTo(352, 198); ctx.quadraticCurveTo(372, 190, 392, 200);
    glowStroke(ctx, HOLO, 0.7, 1.5, 6);
    // oreja
    ctx.beginPath(); ctx.ellipse(205, 258, 16, 28, -0.15, 0, Math.PI * 2);
    glowStroke(ctx, HOLO, 0.5, 1.2, 6);
    ctx.beginPath(); ctx.ellipse(207, 258, 8, 17, -0.15, 0.6, Math.PI * 1.6);
    glowStroke(ctx, HOLO, 0.4, 1, 4);

    // ondas que salen de la boca
    if (amp > 0.03) {
      const mouth = R([432, 352]);
      const mx = mouth[0] + 6, my = (348 + mouth[1]) / 2;
      for (let k = 0; k < 4; k++) {
        const rr = 14 + ((time * 70 + k * 22) % 88);
        ctx.beginPath();
        ctx.arc(mx, my, rr, -0.55, 0.55);
        glowStroke(ctx, ENERGY, Math.max(0, (1 - rr / 102)) * amp, 1.6, 8);
      }
    }

    // etiquetas
    ctx.globalAlpha = 1;
    ctx.font = '600 12px "IBM Plex Mono", ui-monospace, monospace';
    const label = (txt, x, y, lx, ly) => {
      const tw = ctx.measureText(txt).width;
      const right = lx > x;
      const tx = right ? lx + 4 : lx;
      const ex = right ? lx : lx + tw + 6;
      ctx.strokeStyle = rgba(HOLO, 0.55);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ly); ctx.stroke();
      ctx.fillStyle = rgba(HOLO, 0.95);
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(6,12,30,0.78)';
      ctx.fillRect(tx - 3, ly - 9, tw + 6, 17);
      ctx.strokeStyle = rgba(HOLO, 0.4);
      ctx.strokeRect(tx - 3, ly - 9, tw + 6, 17);
      ctx.fillStyle = rgba(HOLO, 0.95);
      ctx.fillText(txt, tx, ly + 4);
    };
    label('Cavidad nasal', 330, 262, 470, 236);
    label('Lengua', hx, hy + 6, 470, 410);
    label('Velo del paladar', 262, 334, -64, 300);
    label('Faringe', 249, 410, -64, 420);
    label('Pliegues vocales', 268, 488, -64, 470);

    // líneas de barrido de pantalla (scanlines) en píxeles reales
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const step = Math.max(3, Math.round(cv.height / 180));
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = (tick % step); y < cv.height; y += step) ctx.fillRect(0, y, cv.width, 1);

    // glitch ocasional: desplaza una franja horizontal
    if (!reduce && hash(tick * 5.1) > 0.96) {
      const gy = Math.floor(hash(tick * 2.3) * cv.height * 0.9);
      const gh = Math.max(4, Math.floor(cv.height * 0.03));
      const dx = Math.round((hash(tick * 9.7) - 0.5) * 24);
      ctx.drawImage(cv, 0, gy, cv.width, gh, dx, gy, cv.width, gh);
    }
  }

  // Vista superior de la glotis, también holográfica
  function drawGlottis(cv, s) {
    const ctx = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, rr = Math.min(w, h) * 0.42;
    const bg = ctx.createRadialGradient(cx, cy, 4, cx, cy, rr);
    bg.addColorStop(0, rgba(DEEP, 0.25));
    bg.addColorStop(1, rgba(HOLO, 0.04));
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = w / 160;
    glowStroke(ctx, HOLO, 0.7, w / 160, 10);
    // retícula
    ctx.strokeStyle = rgba(HOLO, 0.15);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - rr, cy); ctx.lineTo(cx + rr, cy); ctx.moveTo(cx, cy - rr); ctx.lineTo(cx, cy + rr); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, rr * 0.6, 0, Math.PI * 2); ctx.stroke();

    const voiced = s.f0 > 0 && s.amp > 0.03;
    const gap = voiced ? s.amp * rr * 0.22 * (0.5 + 0.5 * Math.sin(s.phase)) : rr * 0.2;
    const top = cy - rr * 0.72, bot = cy + rr * 0.72;
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx, top);
      ctx.quadraticCurveTo(cx + dir * gap * 2, cy, cx, bot);
      ctx.quadraticCurveTo(cx + dir * rr * 0.75, cy, cx, top);
      ctx.fillStyle = rgba(voiced ? ENERGY : HOLO, voiced ? 0.25 : 0.18);
      ctx.fill();
      glowStroke(ctx, voiced ? ENERGY : HOLO, 0.95, w / 120, 10);
    }
    for (const dir of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(cx + dir * rr * 0.22, bot + 2, rr * 0.16, rr * 0.1, 0, 0, Math.PI * 2);
      glowStroke(ctx, HOLO, 0.6, w / 200, 6);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  }

  return { draw, drawGlottis, W, H };
})();
