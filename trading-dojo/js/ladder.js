// ladder.js — the ranked stock ladder (DOM) with FLIP re-rank animation, tier badges,
// score/ELO pills, equity sparklines, and the tap-through detail sheet.

import { tierColor, WEIGHTS } from './scoring.js';

const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function lerp(a, b, t) { return a + (b - a) * t; }
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function rgb(c) { return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; }
// red -> amber -> green by score 0..100
function gradeColor(score) {
  const red = hexToRgb('#f0506e'), amber = hexToRgb('#f5b942'), green = hexToRgb('#21c08a');
  if (score <= 50) { const t = score / 50; return rgb([lerp(red[0], amber[0], t), lerp(red[1], amber[1], t), lerp(red[2], amber[2], t)]); }
  const t = (score - 50) / 50; return rgb([lerp(amber[0], green[0], t), lerp(amber[1], green[1], t), lerp(amber[2], green[2], t)]);
}

function deltaHTML(delta) {
  if (delta == null) return '<div class="delta flat">·</div>';
  if (delta > 0) return `<div class="delta up">▲${delta}</div>`;
  if (delta < 0) return `<div class="delta down">▼${-delta}</div>`;
  return '<div class="delta flat">–</div>';
}

function rowHTML(r, i) {
  const champ = i === 0 ? ' champion' : '';
  const dnf = r.dnf ? ' dnf' : '';
  const tc = tierColor(r.tier);
  return `<div class="row${champ}${dnf}" data-sym="${r.symbol}">
    <div class="rank">${i + 1}</div>
    ${deltaHTML(r.delta)}
    <div class="main">
      <div class="sym"><span class="ticker">${r.symbol}</span>
        <span class="badge" style="color:${tc};border-color:${tc}55">${r.tier}</span></div>
      <div class="name">${escapeHtml(r.name || '')}</div>
    </div>
    <div class="right">
      <canvas class="spark" width="108" height="44"></canvas>
      <div style="text-align:right">
        <div class="score-pill" style="background:${gradeColor(r.score)}">${r.score}</div>
        <div class="elo-pill">⚔ ${r.elo}</div>
      </div>
    </div>
  </div>`;
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

export function renderLadder(container, rows, onTap) {
  const oldRects = new Map();
  container.querySelectorAll('.row').forEach(el => oldRects.set(el.dataset.sym, el.getBoundingClientRect().top));

  container.innerHTML = rows.map(rowHTML).join('');

  container.querySelectorAll('.row').forEach(el => {
    const sym = el.dataset.sym;
    const r = rows.find(x => x.symbol === sym);
    drawSpark(el.querySelector('canvas'), r.equity);
    el.onclick = () => onTap(r);
    if (!REDUCED) {
      const oldTop = oldRects.get(sym);
      if (oldTop != null) {
        const dy = oldTop - el.getBoundingClientRect().top;
        if (Math.abs(dy) > 1) {
          el.style.transition = 'none'; el.style.transform = `translateY(${dy}px)`;
          requestAnimationFrame(() => { el.style.transition = 'transform .45s cubic-bezier(.2,.8,.2,1)'; el.style.transform = ''; });
        }
      }
    }
  });
}

function drawSpark(canvas, equity) {
  if (!canvas || !equity || equity.length < 2) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, pad = 3;
  let lo = Infinity, hi = -Infinity;
  for (const v of equity) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (lo === hi) { hi = lo + 1; }
  const up = equity[equity.length - 1] >= equity[0];
  ctx.clearRect(0, 0, W, H);
  ctx.beginPath();
  for (let i = 0; i < equity.length; i++) {
    const x = pad + (i / (equity.length - 1)) * (W - pad * 2);
    const y = pad + (1 - (equity[i] - lo) / (hi - lo)) * (H - pad * 2);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.strokeStyle = up ? '#21c08a' : '#f0506e';
  ctx.lineWidth = 1.6; ctx.stroke();
}

// ---- detail sheet ----
export function renderSheet(body, r) {
  const m = r.metrics || {};
  const d = r.scoreDetail || {};
  const sub = d.sub || {};
  const pen = d.penalties || {};
  const pct = v => (v == null ? '—' : (v * 100).toFixed(1) + '%');
  const sign = v => (v >= 0 ? 'up' : 'down');

  const subRows = [
    ['Return', sub.sReturn, WEIGHTS.return],
    ['Sharpe', sub.sSharpe, WEIGHTS.sharpe],
    ['Drawdown', sub.sDrawdown, WEIGHTS.drawdown],
    ['Win rate', sub.sWinRate, WEIGHTS.winRate],
    ['Exposure', sub.sExposure, WEIGHTS.exposure],
  ].map(([label, val, w]) => {
    const v = Number.isFinite(val) ? val : 0;
    return `<div class="bd-row"><span>${label} <span class="muted">·${(w * 100) | 0}%</span></span>
      <div class="bd-track"><div class="bar" style="width:${Math.round(v * 90)}px"></div></div>
      <b>${(v * 100).toFixed(0)}</b></div>`;
  }).join('');

  const penText = [];
  if (pen.trade != null && pen.trade < 1) penText.push(`low-trade ×${pen.trade}`);
  if (pen.flat != null && pen.flat < 1) penText.push(`barely-traded ×${pen.flat}`);
  if (pen.blowup != null && pen.blowup < 1) penText.push(`blowup ×${pen.blowup}`);

  const metric = (label, val, cls) => `<div class="metric"><div class="v ${cls || ''}">${val}</div><div class="l">${label}</div></div>`;

  const trades = (r.trades || []).slice(0, 8).map(t =>
    `<div class="bd-row"><span>#${(t.entryIdx)}→${t.exitIdx}${t.open ? ' (open)' : ''}</span>
     <span class="muted">${t.entryPx?.toFixed(3)}→${t.exitPx?.toFixed(3)}</span>
     <b class="${t.pnl >= 0 ? '' : ''}" style="color:${t.pnl >= 0 ? '#21c08a' : '#f0506e'}">${t.pnl >= 0 ? '+' : ''}${t.pnl?.toFixed(0)}</b></div>`
  ).join('') || '<div class="muted small">No closed trades.</div>';

  body.innerHTML = `
    <button class="close" aria-label="Close">✕</button>
    <h2>${r.symbol} <span class="muted" style="font-size:14px">${r.score} · ${r.tier}</span></h2>
    <div class="muted small">${escapeHtml(r.name || '')} · ${r.meta?.sector || ''} · ⚔ ELO ${r.elo}</div>
    <canvas id="sheetChart"></canvas>
    <div class="metric-grid">
      ${metric('Total return', pct(m.totalReturn), sign(m.totalReturn || 0))}
      ${metric('Sharpe', (m.sharpe ?? 0).toFixed(2), sign(m.sharpe || 0))}
      ${metric('Max drawdown', pct(m.maxDrawdown), 'down')}
      ${metric('Win rate', pct(m.winRate))}
      ${metric('Trades', m.tradeCount ?? 0)}
      ${metric('Exposure', pct(m.exposure))}
    </div>
    <div class="breakdown">
      <div class="muted small" style="margin-bottom:6px">Score breakdown (base ${Math.round(d.base || 0)} → ${r.score})</div>
      ${subRows}
      ${penText.length ? `<div class="penalty">Penalties: ${penText.join(' · ')}</div>` : ''}
    </div>
    <div class="breakdown">
      <div class="muted small" style="margin:10px 0 4px">Trades</div>
      ${trades}
    </div>`;

  drawSheetChart(body.querySelector('#sheetChart'), r.equity);
}

function drawSheetChart(canvas, equity) {
  if (!canvas || !equity) return;
  const ctx = canvas.getContext('2d');
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const w = canvas.clientWidth || 320, h = 140;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const W = canvas.width, H = canvas.height, pad = 8 * dpr;
  let lo = Infinity, hi = -Infinity;
  for (const v of equity) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (lo === hi) hi = lo + 1;
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,.06)';
  for (let g = 0; g <= 3; g++) { const y = pad + (H - pad * 2) * g / 3; ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke(); }
  ctx.beginPath();
  for (let i = 0; i < equity.length; i++) {
    const x = pad + (i / (equity.length - 1)) * (W - pad * 2);
    const y = pad + (1 - (equity[i] - lo) / (hi - lo)) * (H - pad * 2);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.strokeStyle = equity[equity.length - 1] >= equity[0] ? '#21c08a' : '#f0506e';
  ctx.lineWidth = 2 * dpr; ctx.stroke();
}
