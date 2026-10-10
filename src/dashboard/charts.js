// Tiny canvas charting helpers (no dependencies). Palette: validated dark-surface categorical set.
export const C = {
  surface: '#1a1a19', page: '#0d0d0d', ink: '#f0efec', ink2: '#c3c2b7', muted: '#898781', grid: '#2c2c2a', axis: '#383835',
  blue: '#3987e5', orange: '#d95926', aqua: '#199e70', yellow: '#c98500', magenta: '#d55181', green: '#008300', violet: '#9085e9', red: '#e66767',
  good: '#0ca30c', warn: '#fab219', serious: '#ec835a', crit: '#d03b3b',
};

// Canvas sizes come from a ResizeObserver, so redrawing a chart doesn't
// force a synchronous layout of the page on every live update.
const SIZES = new WeakMap();
const sizer = typeof ResizeObserver === 'function'
  ? new ResizeObserver((entries) => { for (const e of entries) { const b = e.borderBoxSize?.[0]; SIZES.set(e.target, b ? { width: b.inlineSize, height: b.blockSize } : e.target.getBoundingClientRect()); } })
  : null;
function sizeOf(canvas) {
  let r = SIZES.get(canvas);
  if (!r) { r = canvas.getBoundingClientRect(); if (sizer) { SIZES.set(canvas, r); sizer.observe(canvas); } }
  return r;
}

export function fit(canvas) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = sizeOf(canvas);
  const w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h); ctx.font = '11px system-ui, sans-serif';
  return { ctx, w, h };
}

export const hhmm = (s) => { const m = Math.floor((((s % 86400) + 86400) % 86400) / 60); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
export const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
export const niceMax = (v) => { if (v <= 0) return 4; const q = v / 4; const p = 10 ** Math.floor(Math.log10(q)); const m = q / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p * 4; };

/** Multi-series line chart. series: [{name,color,points:[[x,y]],fill?}], returns hit-test data for hover. */
export function lineChart(canvas, series, o = {}) {
  const { ctx, w, h } = fit(canvas);
  const pad = { l: 34, r: 8, t: 8, b: 18 };
  const xs = series.flatMap((s) => s.points.map((p) => p[0])); const ys = series.flatMap((s) => s.points.map((p) => p[1]));
  const x0 = o.xmin ?? Math.min(...xs, Infinity), x1 = o.xmax ?? Math.max(...xs, -Infinity);
  const ymax = o.ymax ?? niceMax(Math.max(...ys, 1));
  const X = (x) => pad.l + ((x - x0) / Math.max(1, x1 - x0)) * (w - pad.l - pad.r);
  const Y = (y) => h - pad.b - (y / ymax) * (h - pad.t - pad.b);
  ctx.strokeStyle = C.grid; ctx.fillStyle = C.muted; ctx.lineWidth = 1; ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) { const v = (ymax * i) / 4; const y = Math.round(Y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke(); ctx.fillText(o.yfmt ? o.yfmt(v) : Math.round(v), pad.l - 4, y + 3); }
  ctx.textAlign = 'center';
  if (o.xticks) { for (const t of o.xticks) { const x = X(t); ctx.fillText(o.xfmt ? o.xfmt(t) : t, x, h - 5); } }
  else {
    const span = x1 - x0; const step = span > 4 * 3600 ? 3600 : span > 1.5 * 3600 ? 1800 : 600;
    for (let t = Math.ceil(x0 / step) * step; t <= x1; t += step) { const x = X(t); ctx.fillText(hhmm(t), x, h - 5); ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(x + 0.5, h - pad.b); ctx.lineTo(x + 0.5, h - pad.b + 3); ctx.stroke(); }
  }
  for (const s of series) {
    if (!s.points.length) continue;
    ctx.beginPath(); s.points.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
    if (s.fill) { const last = s.points[s.points.length - 1]; ctx.lineTo(X(last[0]), Y(0)); ctx.lineTo(X(s.points[0][0]), Y(0)); ctx.closePath(); ctx.globalAlpha = 0.16; ctx.fillStyle = s.color; ctx.fill(); ctx.globalAlpha = 1;
      ctx.beginPath(); s.points.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); }
    ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
  }
  if (o.now != null && o.now >= x0 && o.now <= x1) { ctx.strokeStyle = C.ink2; ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(o.now) + 0.5, pad.t); ctx.lineTo(X(o.now) + 0.5, h - pad.b); ctx.stroke(); ctx.setLineDash([]); }
  if (o.marks) for (const m of o.marks) { const x = X(m.x); ctx.strokeStyle = m.color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 0.5, pad.t); ctx.lineTo(x + 0.5, h - pad.b); ctx.stroke(); ctx.fillStyle = m.color; ctx.textAlign = 'left'; ctx.fillText(m.label, x + 3, pad.t + 9); }
  return { X, Y, pad, x0, x1, w, h, series };
}

/** nearest-point lookup for a hover x-position */
export function nearest(hit, px) {
  const x = hit.x0 + ((px - hit.pad.l) / (hit.w - hit.pad.l - hit.pad.r)) * (hit.x1 - hit.x0);
  let best = null;
  for (const s of hit.series) { let lo = 0, hi = s.points.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (s.points[m][0] < x) lo = m + 1; else hi = m; } const p = s.points[lo]; if (p && (!best || Math.abs(p[0] - x) < Math.abs(best - x))) best = p[0]; }
  return best == null ? null : { t: best, rows: hit.series.map((s) => { const p = s.points.find((q) => q[0] === best) || s.points[s.points.length - 1]; return { name: s.name, color: s.color, v: p ? p[1] : null }; }) };
}

/** Grouped horizontal bars: rows [{label, values:[v1,v2], n}] */
export function barRows(canvas, rows, o = {}) {
  const { ctx, w, h } = fit(canvas);
  const left = o.left ?? 118, right = 44; const max = o.max ?? niceMax(Math.max(1, ...rows.flatMap((r) => r.values)));
  const rh = (h - 14) / Math.max(1, rows.length);
  ctx.textBaseline = 'middle';
  rows.forEach((r, i) => {
    const y = 4 + i * rh; ctx.fillStyle = C.ink2; ctx.textAlign = 'right'; ctx.fillText(r.label, left - 8, y + rh / 2);
    const bh = Math.min(9, (rh - 5) / r.values.length);
    r.values.forEach((v, k) => {
      const bw = (v / max) * (w - left - right); const by = y + (rh - bh * r.values.length - (r.values.length - 1) * 2) / 2 + k * (bh + 2);
      ctx.fillStyle = o.colors[k]; ctx.beginPath(); ctx.roundRect?.(left, by, Math.max(2, bw), bh, [0, 3, 3, 0]); if (!ctx.roundRect) ctx.rect(left, by, Math.max(2, bw), bh); ctx.fill();
    });
    ctx.fillStyle = C.muted; ctx.textAlign = 'left'; ctx.fillText(o.fmt ? o.fmt(r.values[r.values.length - 1], r) : Math.round(r.values[r.values.length - 1]), w - right + 6, y + rh / 2);
  });
  if (o.band) { const x = left + (o.band / max) * (w - left - right); ctx.strokeStyle = C.warn; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h - 14); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = C.warn; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(o.bandLabel || '', x, h - 2); }
  return { rowH: rh };
}
