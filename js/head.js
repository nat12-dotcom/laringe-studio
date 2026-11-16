/* Laringe Studio — simulador de cabeza (corte sagital)
 * Dibuja el tracto vocal: pliegues vocales, faringe, lengua, mandíbula y labios,
 * animados por el tono, el volumen y los formantes de la voz.
 */
const Head = (() => {
  const W = 660, H = 540, OX = 72; // espacio virtual (la cabeza se desplaza OX para dejar sitio a las etiquetas)
  const PIVOT = [300, 280];
  const C = {
    skin1: '#e7b394', skin2: '#c98a6c', skinEdge: '#8a5442',
    tract: '#1a0f1f', tissue: '#d9737e', tissueDark: '#a84b5a', tongue1: '#f08a92', tongue2: '#c05463',
    bone: '#efe4d2', cart: '#9fc3d8', energy: '255,179,71', cyan: '111,214,255', nasal: '#3a1b2c',
  };

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

  function draw(cv, s, time) {
    const ctx = cv.getContext('2d');
    const dpr = cv.width / cv.clientWidth || 1;
    const scale = Math.min(cv.width / W, cv.height / H);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(scale, 0, 0, scale, (cv.width - W * scale) / 2 + OX * scale, (cv.height - H * scale) / 2);

    const ang = s.open * 0.21;
    const R = p => rot(p, ang);
    const amp = s.amp;

    // halo de energía
    if (amp > 0.02) {
      const g = ctx.createRadialGradient(280, 330, 20, 280, 330, 300);
      g.addColorStop(0, `rgba(${C.energy},${0.12 * amp})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-OX, 0, W, H);
    }

    // piel
    skinPath(ctx, ang);
    const sg = ctx.createLinearGradient(100, 80, 450, 500);
    sg.addColorStop(0, C.skin1);
    sg.addColorStop(1, C.skin2);
    ctx.fillStyle = sg;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = C.skinEdge;
    ctx.stroke();

    ctx.save();
    skinPath(ctx, ang);
    ctx.clip();

    // cráneo y cerebro (tenue)
    ctx.beginPath();
    ctx.moveTo(140, 300);
    ctx.bezierCurveTo(118, 200, 196, 92, 318, 100);
    ctx.bezierCurveTo(368, 108, 388, 160, 384, 218);
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(239,228,210,0.55)';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(150, 290);
    ctx.bezierCurveTo(135, 205, 205, 112, 312, 118);
    ctx.bezierCurveTo(355, 124, 372, 165, 368, 215);
    ctx.bezierCurveTo(330, 240, 230, 250, 150, 290);
    ctx.fillStyle = 'rgba(214,160,170,0.35)';
    ctx.fill();

    // columna
    for (let y = 300; y < 540; y += 30) {
      ctx.fillStyle = 'rgba(239,228,210,0.6)';
      ctx.beginPath();
      ctx.roundRect(182, y, 40, 24, 6);
      ctx.fill();
    }

    // cavidad nasal
    ctx.beginPath();
    ctx.moveTo(394, 258);
    ctx.bezierCurveTo(360, 250, 300, 250, 262, 270);
    ctx.bezierCurveTo(250, 282, 256, 298, 272, 300);
    ctx.lineTo(388, 306);
    ctx.bezierCurveTo(398, 300, 402, 280, 394, 258);
    ctx.fillStyle = C.nasal;
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(330, 266 + i * 12, 46 - i * 6, 4, -0.04, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(217,115,126,0.55)';
      ctx.fill();
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
    ctx.fillStyle = C.tract;
    ctx.fill();

    // pared faríngea
    ctx.beginPath();
    ctx.moveTo(246, 300);
    ctx.lineTo(244, 540);
    ctx.lineWidth = 8;
    ctx.strokeStyle = C.tissueDark;
    ctx.stroke();

    // onda sonora recorriendo el tracto
    const path = [[276, 486], [262, 462], [254, 420], [252, 372], [262, 334], [300, 322], [350, 326], [392, 338], [430, 352]];
    if (amp > 0.02) {
      for (let k = 0; k < 14; k++) {
        const u = ((time * (0.9 + s.f0 / 600) + k / 14) % 1);
        const fi = u * (path.length - 1), i0 = Math.floor(fi), fr = fi - i0;
        const a = path[i0], b = path[Math.min(path.length - 1, i0 + 1)];
        const x = a[0] + (b[0] - a[0]) * fr, y = a[1] + (b[1] - a[1]) * fr;
        ctx.beginPath();
        ctx.arc(x, y, 3 + amp * 4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${C.energy},${0.25 + 0.6 * amp * (1 - u * 0.4)})`;
        ctx.fill();
      }
    }

    // lengua
    const hx = 285 + s.front * 62;
    const hy = 350 - s.high * 30 + s.open * 16;
    const tip = R([394 - (1 - s.front) * 18, 352 + (1 - s.high) * 6]);
    const tg = ctx.createLinearGradient(260, hy - 20, 330, 460);
    tg.addColorStop(0, C.tongue1);
    tg.addColorStop(1, C.tongue2);
    ctx.beginPath();
    ctx.moveTo(286, 468);
    ctx.bezierCurveTo(264, 446, 258, hy + 36, hx - 42, hy + 10);
    ctx.quadraticCurveTo(hx, hy - 16, hx + 36, hy + 4);
    ctx.quadraticCurveTo(tip[0] - 22, tip[1] - 8, tip[0], tip[1]);
    const t2 = R([396, 372]), t3 = R([372, 400]), t4 = R([320, 432]);
    ctx.quadraticCurveTo(t2[0], t2[1], t3[0], t3[1]);
    ctx.quadraticCurveTo(t4[0], t4[1], 292, 452);
    ctx.closePath();
    ctx.fillStyle = tg;
    ctx.fill();

    // paladar duro y velo
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(390, 311);
    ctx.bezierCurveTo(350, 306, 310, 305, 282, 309);
    ctx.lineWidth = 6;
    ctx.strokeStyle = C.bone;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(284, 310);
    ctx.quadraticCurveTo(262, 318, 260, 342);
    ctx.lineWidth = 9;
    ctx.strokeStyle = C.tissue;
    ctx.stroke();

    // dientes
    ctx.fillStyle = C.bone;
    ctx.beginPath();
    ctx.moveTo(400, 318); ctx.lineTo(412, 320); ctx.lineTo(410, 344); ctx.lineTo(403, 344);
    ctx.closePath(); ctx.fill();
    const lt = [[401, 372], [411, 372], [412, 354], [404, 356]].map(R);
    ctx.beginPath();
    ctx.moveTo(...lt[0]); lt.slice(1).forEach(p => ctx.lineTo(...p));
    ctx.closePath(); ctx.fill();

    // labios (redondeo para o / u)
    const lipW = 7 + s.round * 5;
    ctx.lineWidth = lipW;
    ctx.strokeStyle = '#c4566a';
    ctx.beginPath();
    ctx.moveTo(420 + s.round * 6, 336);
    ctx.quadraticCurveTo(430 + s.round * 8, 343, 418, 348);
    ctx.stroke();
    const ll = [[418, 356], [432 + s.round * 8, 364], [420 + s.round * 6, 374]].map(R);
    ctx.beginPath();
    ctx.moveTo(...ll[0]);
    ctx.quadraticCurveTo(...ll[1], ...ll[2]);
    ctx.stroke();

    // epiglotis
    ctx.beginPath();
    ctx.moveTo(290, 470);
    ctx.quadraticCurveTo(296, 448, 286, 436);
    ctx.lineWidth = 6;
    ctx.strokeStyle = C.tissue;
    ctx.stroke();

    // laringe: cartílago tiroides
    ctx.beginPath();
    ctx.ellipse(282, 494, 30, 20, 0, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = C.cart;
    ctx.globalAlpha = 0.8;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // pliegues vocales (vibran con el tono)
    const vib = s.f0 > 0 ? Math.sin(s.phase) * amp * 3 : 0;
    const glow = 4 + amp * 18;
    ctx.save();
    ctx.shadowColor = `rgba(${C.energy},0.9)`;
    ctx.shadowBlur = glow;
    ctx.beginPath();
    ctx.moveTo(258, 488 + vib);
    ctx.quadraticCurveTo(276, 484 - vib, 300, 487 + vib);
    ctx.lineWidth = 5;
    ctx.strokeStyle = amp > 0.03 ? `rgb(${C.energy})` : '#f3d2c6';
    ctx.stroke();
    ctx.restore();

    // tráquea
    ctx.strokeStyle = C.cart;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(262, 504); ctx.lineTo(266, 540); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(302, 504); ctx.lineTo(304, 540); ctx.stroke();
    for (let y = 512; y < 540; y += 9) {
      ctx.beginPath(); ctx.moveTo(264, y); ctx.lineTo(303, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore(); // fin clip

    // ojo y oreja (fuera del corte, sobre la piel)
    ctx.fillStyle = 'rgba(90,50,40,0.35)';
    ctx.beginPath(); ctx.ellipse(372, 214, 14, 6, 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(138,84,66,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(352, 198); ctx.quadraticCurveTo(372, 190, 392, 200); ctx.stroke();

    // ondas que salen de la boca
    if (amp > 0.03) {
      const mouth = R([432, 352]);
      const mx = mouth[0] + 6, my = (348 + mouth[1]) / 2;
      for (let k = 0; k < 4; k++) {
        const rr = 14 + ((time * 70 + k * 22) % 88);
        ctx.beginPath();
        ctx.arc(mx, my, rr, -0.55, 0.55);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = `rgba(${C.energy},${Math.max(0, (1 - rr / 102)) * amp})`;
        ctx.stroke();
      }
    }

    // etiquetas
    ctx.font = '600 12px "IBM Plex Mono", ui-monospace, monospace';
    const label = (txt, x, y, lx, ly) => {
      const tw = ctx.measureText(txt).width;
      const right = lx > x;
      const tx = right ? lx + 4 : lx;
      const ex = right ? lx : lx + tw + 6;
      ctx.strokeStyle = 'rgba(111,214,255,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ly); ctx.stroke();
      ctx.fillStyle = 'rgba(111,214,255,0.95)';
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(12,14,28,0.72)';
      ctx.fillRect(tx - 3, ly - 9, tw + 6, 17);
      ctx.fillStyle = 'rgba(111,214,255,0.95)';
      ctx.fillText(txt, tx, ly + 4);
    };
    label('Cavidad nasal', 330, 262, 470, 236);
    label('Lengua', hx, hy + 6, 470, 410);
    label('Velo del paladar', 262, 334, -64, 300);
    label('Faringe', 249, 410, -64, 420);
    label('Pliegues vocales', 268, 488, -64, 470);
  }

  // Vista superior de la glotis
  function drawGlottis(cv, s) {
    const ctx = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, rr = Math.min(w, h) * 0.44;
    const bg = ctx.createRadialGradient(cx, cy, 4, cx, cy, rr);
    bg.addColorStop(0, '#5a2232');
    bg.addColorStop(1, '#2a1220');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill();
    const voiced = s.f0 > 0 && s.amp > 0.03;
    const gap = voiced ? s.amp * rr * 0.22 * (0.5 + 0.5 * Math.sin(s.phase)) : rr * 0.2;
    const top = cy - rr * 0.72, bot = cy + rr * 0.72;
    // aire
    ctx.fillStyle = '#0c0610';
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.quadraticCurveTo(cx - gap * 2, cy, cx, bot);
    ctx.quadraticCurveTo(cx + gap * 2, cy, cx, top);
    ctx.fill();
    // pliegues
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx, top);
      ctx.quadraticCurveTo(cx + dir * gap * 2, cy, cx, bot);
      ctx.quadraticCurveTo(cx + dir * rr * 0.75, cy, cx, top);
      const fg = ctx.createLinearGradient(cx, 0, cx + dir * rr * 0.6, 0);
      fg.addColorStop(0, voiced ? '#ffe0c2' : '#f6e8e1');
      fg.addColorStop(1, '#d58d95');
      ctx.fillStyle = fg;
      ctx.fill();
    }
    // aritenoides
    ctx.fillStyle = '#c5707f';
    ctx.beginPath(); ctx.ellipse(cx - rr * 0.22, bot + 2, rr * 0.16, rr * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + rr * 0.22, bot + 2, rr * 0.16, rr * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    if (voiced) {
      ctx.strokeStyle = `rgba(255,179,71,${0.4 + s.amp * 0.6})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, rr + 2, 0, Math.PI * 2); ctx.stroke();
    }
  }

  return { draw, drawGlottis, W, H };
})();
