/* Graphiques canvas ANPER SE — miroir des fonctions de dessin de dashboard.py.
   Tout est dessiné à la main (aucune dépendance) pour fonctionner hors-ligne. */

const Charts = (() => {
  const TXT = '#374151', MUT = '#9CA3AF', BG = '#FFFFFF';

  // Prépare un canvas HiDPI ; renvoie {ctx, w, h}
  function setup(cv) {
    const rect = cv.getBoundingClientRect();
    const w = rect.width || cv.width || 300;
    const h = parseInt(cv.dataset.h || cv.height || 200, 10);
    const dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr; cv.height = h * dpr;
    cv.style.height = h + 'px';
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.textBaseline = 'alphabetic';
    return { ctx, w, h };
  }
  const fmtNum = v => (+v || 0).toLocaleString('fr-FR');

  function title(ctx, w, text) {
    ctx.fillStyle = TXT; ctx.font = '700 11px Segoe UI, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.fillText(text, w / 2, 15);
  }
  function noData(cv, text = 'Aucune donnée') {
    const { ctx, w, h } = setup(cv);
    ctx.fillStyle = MUT; ctx.font = '10px Segoe UI, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.fillText(text, w / 2, h / 2);
  }

  // data = [[label, value, color], …]
  function donut(cv, data, ttl = '') {
    const { ctx, w, h } = setup(cv);
    const tot = data.reduce((s, d) => s + d[1], 0);
    if (ttl) title(ctx, w, ttl);
    if (!tot) { ctx.fillStyle = MUT; ctx.font = '10px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText('Aucune donnée', w / 2, h / 2); return; }
    const legendH = data.length * 18 + 4;
    const cx = w / 2, cy = (h - legendH) / 2 + 14, r = Math.min(w / 2 - 14, (h - legendH) / 2 - 6, 72);
    let a = -Math.PI / 2;
    for (const [, val, color] of data) {
      const sweep = 2 * Math.PI * val / tot;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a, a + sweep); ctx.closePath();
      ctx.fillStyle = color; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = BG; ctx.stroke();
      a += sweep;
    }
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.52, 0, 2 * Math.PI); ctx.fillStyle = BG; ctx.fill();
    ctx.fillStyle = TXT; ctx.font = '700 13px Segoe UI'; ctx.textAlign = 'center';
    ctx.fillText(String(tot), cx, cy - 2);
    ctx.fillStyle = MUT; ctx.font = '8px Segoe UI'; ctx.fillText('total', cx, cy + 11);
    // légende
    let ly = h - legendH; const lx = 8;
    ctx.textAlign = 'left';
    for (const [label, val, color] of data) {
      const pct = Math.round(100 * val / tot);
      ctx.fillStyle = color; ctx.fillRect(lx, ly + 3, 10, 9);
      ctx.fillStyle = TXT; ctx.font = '9px Segoe UI';
      ctx.fillText(`${label}  ${val} (${pct}%)`, lx + 15, ly + 11);
      ly += 18;
    }
  }

  // data = [[label, value], …]
  function hbars(cv, data, colors = null, ttl = '', showPct = false) {
    const { ctx, w, h } = setup(cv);
    if (!data.length) { ctx.fillStyle = MUT; ctx.font = '10px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText('Aucune donnée', w / 2, h / 2); return; }
    if (ttl) title(ctx, w, ttl);
    const pt = 30, pb = 8, pl = 100, pr = 52;
    const n = data.length, rh = (h - pt - pb) / n, bh = Math.max(9, Math.min(rh * 0.62, 20));
    const mx = Math.max(...data.map(d => d[1]), 1), tw = w - pl - pr;
    const tot = data.reduce((s, d) => s + d[1], 0) || 1;
    data.forEach(([lbl, val], i) => {
      const col = colors ? colors[i] : PAL[i % PAL.length];
      const ym = pt + i * rh + rh / 2, y0 = ym - bh / 2;
      ctx.fillStyle = '#F3F4F6'; ctx.fillRect(pl, y0, tw, bh);
      const bw = Math.max(tw * val / mx, 2);
      ctx.fillStyle = col; ctx.fillRect(pl, y0, bw, bh);
      ctx.fillStyle = TXT; ctx.font = '9px Segoe UI'; ctx.textAlign = 'right';
      ctx.fillText(lbl, pl - 5, ym + 3);
      ctx.textAlign = 'left'; ctx.font = '700 9px Segoe UI';
      const suffix = showPct ? `  ${Math.round(100 * val / tot)}%` : '';
      ctx.fillText(`${fmtNum(val)}${suffix}`, pl + bw + 4, ym + 3);
    });
  }

  function grouped(cv, labels, s1, s2, ttl, c1, c2, l1, l2) {
    const { ctx, w, h } = setup(cv);
    const n = labels.length;
    if (!n) { ctx.fillStyle = MUT; ctx.font = '10px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText('Aucune donnée', w / 2, h / 2); return; }
    const TITLE_H = 18, LEGEND_H = 18, LABEL_H = 22;
    const pt = TITLE_H + LEGEND_H + 4, pb = LABEL_H, pl = 10, pr = 10;
    if (ttl) { ctx.fillStyle = TXT; ctx.font = '700 10px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText(ttl, w / 2, 13); }
    // légende
    const ly = TITLE_H + LEGEND_H / 2; let x = pl;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = c1; ctx.fillRect(x, ly - 5, 9, 9);
    ctx.fillStyle = TXT; ctx.font = '9px Segoe UI'; ctx.fillText(l1, x + 13, ly);
    x += 13 + ctx.measureText(l1).width + 16;
    ctx.fillStyle = c2; ctx.fillRect(x, ly - 5, 9, 9);
    ctx.fillStyle = TXT; ctx.fillText(l2, x + 13, ly);
    ctx.textBaseline = 'alphabetic';
    const cw = w - pl - pr, ch = h - pt - pb, base = pt + ch;
    ctx.strokeStyle = '#D1D5DB'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pl, base); ctx.lineTo(w - pr, base); ctx.stroke();
    const mx = Math.max(...s1, ...s2, 1), colw = cw / n, bw = Math.max(5, Math.min(colw * 0.32, 28));
    ctx.strokeStyle = '#F3F4F6';
    for (const step of [0.25, 0.5, 0.75]) { const y = base - ch * step; ctx.beginPath(); ctx.moveTo(pl, y); ctx.lineTo(w - pr, y); ctx.stroke(); }
    for (let i = 0; i < n; i++) {
      const cx = pl + (i + 0.5) * colw;
      const h1 = ch * s1[i] / mx; ctx.fillStyle = c1; ctx.fillRect(cx - bw - 1, base - h1, bw, h1);
      const h2 = ch * s2[i] / mx; ctx.fillStyle = c2; ctx.fillRect(cx + 1, base - h2, bw, h2);
      ctx.fillStyle = TXT; ctx.font = '8px Segoe UI'; ctx.textAlign = 'center';
      ctx.fillText(labels[i], cx, base + 12);
    }
  }

  function gauge(cv, pct, color, label, sub) {
    const { ctx, w, h } = setup(cv);
    pct = Math.max(0, Math.min(pct, 100));
    const cx = w / 2, cy = h - 34, r = Math.min(w / 2 - 16, h - 56);
    ctx.lineWidth = 14; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI); ctx.strokeStyle = '#E5E7EB'; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI + Math.PI * pct / 100); ctx.strokeStyle = color; ctx.stroke();
    ctx.fillStyle = color; ctx.font = '700 20px Segoe UI'; ctx.textAlign = 'center';
    ctx.fillText(pct.toFixed(1) + '%', cx, cy - 4);
    ctx.fillStyle = TXT; ctx.font = '700 10px Segoe UI'; ctx.fillText(label, cx, cy + 16);
    if (sub) { ctx.fillStyle = MUT; ctx.font = '9px Segoe UI'; ctx.fillText(sub, cx, cy + 29); }
  }

  return { setup, donut, hbars, grouped, gauge, noData, fmtNum };
})();
