// race.js — animated equity-curve "race" on a single canvas. Top-N strategy-equity curves,
// rebased to a common start, animate forward like runners. DPR-aware, scrub + speed,
// running smoothed y-axis (the leader visibly pulls the field), leader highlight,
// live standings, finish flourish, reduced-motion aware.

const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Race {
  constructor(canvas, standingsEl, bannerEl) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.standingsEl = standingsEl;
    this.bannerEl = bannerEl;
    this.curves = [];
    this.n = 0;
    this.playhead = 0;
    this.speed = 1;
    this.playing = false;
    this.raf = 0;
    this.lastTs = 0;
    this.dpr = 1;
    this.xs = null;
    this.curMin = 0.95; this.curMax = 1.05;
    this.particles = [];
    this.onTick = null;
    this._boundLoop = this._loop.bind(this);
    this._onVis = () => { if (document.hidden) this.pause(); };
    document.addEventListener('visibilitychange', this._onVis);
  }

  load(curves) {
    this.curves = curves.map(c => {
      const e = c.equity || [];
      const base = e.find(v => Number.isFinite(v) && v > 0) || 1;
      return { ...c, reb: e.map(v => (Number.isFinite(v) ? v / base : 1)) };
    });
    this.n = Math.max(2, ...this.curves.map(c => c.reb.length));
    this.playhead = 0;
    this.particles = [];
    const [lo, hi] = this._range(1);
    this.curMin = lo; this.curMax = hi;
    this.hideBanner();
    this.resize();
    if (REDUCED) { this.playhead = this.n - 1; this._render(this.n - 1, 0); this._finish(); }
  }

  resize() {
    const c = this.canvas;
    const w = c.clientWidth || 320, h = c.clientHeight || 300;
    this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    c.width = Math.round(w * this.dpr); c.height = Math.round(h * this.dpr);
    this.W = c.width; this.H = c.height;
    this.padL = 8 * this.dpr; this.padR = 64 * this.dpr; this.padT = 14 * this.dpr; this.padB = 14 * this.dpr;
    this.plotW = this.W - this.padL - this.padR; this.plotH = this.H - this.padT - this.padB;
    this.xs = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) this.xs[i] = this.padL + (this.n > 1 ? (i / (this.n - 1)) * this.plotW : 0);
    this._render(Math.floor(this.playhead), this.playhead - Math.floor(this.playhead));
  }

  // visible value range over bars [0..upTo]
  _range(upTo) {
    let lo = Infinity, hi = -Infinity;
    const top = Math.max(1, Math.min(this.n, upTo));
    for (const c of this.curves) {
      for (let i = 0; i <= top && i < c.reb.length; i++) { const v = c.reb[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    }
    if (!Number.isFinite(lo)) { lo = 0.95; hi = 1.05; }
    const pad = (hi - lo) * 0.1 || 0.05;
    return [lo - pad, hi + pad];
  }

  _y(value) { return this.padT + (1 - (value - this.curMin) / (this.curMax - this.curMin)) * this.plotH; }

  play() { if (this.playing || this.n < 2) return; if (this.playhead >= this.n - 1) { this.playhead = 0; const [lo, hi] = this._range(1); this.curMin = lo; this.curMax = hi; }
    this.playing = true; this.lastTs = 0; this.hideBanner(); this.raf = requestAnimationFrame(this._boundLoop); }
  pause() { this.playing = false; if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }
  toggle() { this.playing ? this.pause() : this.play(); }
  setSpeed(s) { this.speed = s; }
  seek(frac) {
    this.pause();
    this.playhead = Math.max(0, Math.min(this.n - 1, frac * (this.n - 1)));
    const [lo, hi] = this._range(Math.ceil(this.playhead) + 1); this.curMin = lo; this.curMax = hi; // snap on scrub
    this._render(Math.floor(this.playhead), this.playhead - Math.floor(this.playhead));
  }

  _loop(ts) {
    if (!this.playing) return;
    if (!this.lastTs) this.lastTs = ts;
    const dt = Math.min(0.05, (ts - this.lastTs) / 1000); this.lastTs = ts;
    this.playhead += (this.n / 6) * this.speed * dt;     // full race ~6s at 1x
    if (this.playhead >= this.n - 1) { this.playhead = this.n - 1; this._render(this.n - 1, 0); this._finish(); return; }
    const idx = Math.floor(this.playhead);
    this._render(idx, this.playhead - idx);
    if (this.onTick) this.onTick(this.playhead / (this.n - 1));
    this.raf = requestAnimationFrame(this._boundLoop);
  }

  _valAt(ci, idx, frac) {
    const reb = this.curves[ci].reb;
    const a = reb[Math.min(idx, reb.length - 1)];
    const b = reb[Math.min(idx + 1, reb.length - 1)];
    return a + (b - a) * frac;
  }

  _render(idx, frac) {
    const ctx = this.ctx, W = this.W, H = this.H;

    // smooth the running axis toward the visible range
    const [tLo, tHi] = this._range(idx + 1);
    this.curMin += (tLo - this.curMin) * 0.12;
    this.curMax += (tHi - this.curMax) * 0.12;

    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = this.dpr;
    for (let g = 0; g <= 4; g++) { const y = this.padT + this.plotH * g / 4; ctx.beginPath(); ctx.moveTo(this.padL, y); ctx.lineTo(W - this.padR, y); ctx.stroke(); }
    // baseline (rebased 1.0) reference
    if (this.curMin < 1 && this.curMax > 1) { const y1 = this._y(1); ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.setLineDash([2 * this.dpr, 3 * this.dpr]); ctx.beginPath(); ctx.moveTo(this.padL, y1); ctx.lineTo(W - this.padR, y1); ctx.stroke(); ctx.setLineDash([]); }
    // finish line
    const finishX = this.xs[this.n - 1];
    ctx.strokeStyle = 'rgba(245,185,66,.4)'; ctx.setLineDash([4 * this.dpr, 4 * this.dpr]);
    ctx.beginPath(); ctx.moveTo(finishX, this.padT); ctx.lineTo(finishX, H - this.padB); ctx.stroke(); ctx.setLineDash([]);

    let leader = 0, leaderVal = -Infinity;
    for (let c = 0; c < this.curves.length; c++) { const v = this._valAt(c, idx, frac); if (v > leaderVal) { leaderVal = v; leader = c; } }
    const headX = this.xs[idx] + (this.xs[Math.min(idx + 1, this.n - 1)] - this.xs[idx]) * frac;

    // order labels by value to reduce overlap (draw on the right gutter)
    const heads = [];
    for (let c = 0; c < this.curves.length; c++) {
      const reb = this.curves[c].reb, isLeader = c === leader;
      ctx.beginPath();
      ctx.moveTo(this.xs[0], this._y(reb[0]));
      for (let i = 1; i <= idx && i < reb.length; i++) ctx.lineTo(this.xs[i], this._y(reb[i]));
      const hv = this._valAt(c, idx, frac), hy = this._y(hv);
      ctx.lineTo(headX, hy);
      ctx.strokeStyle = this.curves[c].color;
      ctx.lineWidth = (isLeader ? 3 : 1.6) * this.dpr;
      ctx.globalAlpha = isLeader ? 1 : 0.8;
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (isLeader) { ctx.beginPath(); ctx.arc(headX, hy, 7 * this.dpr, 0, 7); ctx.fillStyle = 'rgba(245,185,66,.18)'; ctx.fill(); }
      ctx.beginPath(); ctx.arc(headX, hy, (isLeader ? 4 : 3) * this.dpr, 0, 7); ctx.fillStyle = this.curves[c].color; ctx.fill();
      heads.push({ c, hy, isLeader });
    }
    // staggered labels in the right gutter
    heads.sort((a, b) => a.hy - b.hy);
    let lastY = -1e9; const lh = 13 * this.dpr;
    for (const hd of heads) {
      let y = hd.hy; if (y - lastY < lh) y = lastY + lh; lastY = y;
      ctx.font = `${(hd.isLeader ? 12 : 10.5) * this.dpr}px -apple-system, sans-serif`;
      ctx.fillStyle = hd.isLeader ? '#fff' : this.curves[hd.c].color;
      ctx.textBaseline = 'middle';
      ctx.fillText(this.curves[hd.c].symbol, W - this.padR + 6 * this.dpr, y);
    }

    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.moveTo(headX, this.padT); ctx.lineTo(headX, H - this.padB); ctx.stroke();
    if (this.particles.length) this._drawParticles();
    this._standings(idx, frac);
  }

  _standings(idx, frac) {
    if (!this.standingsEl) return;
    const ranked = this.curves.map((c, i) => ({ sym: c.symbol, color: c.color, val: this._valAt(i, idx, frac) })).sort((a, b) => b.val - a.val);
    this.standingsEl.innerHTML = ranked.map(r =>
      `<div class="st"><span class="dot" style="background:${r.color}"></span>${r.sym} <b>${((r.val - 1) * 100 >= 0 ? '+' : '') + ((r.val - 1) * 100).toFixed(1)}%</b></div>`).join('');
  }

  _finish() {
    this.playing = false;
    const ranked = this.curves.map((c, i) => ({ c, i, val: this._valAt(i, this.n - 1, 0) })).sort((a, b) => b.val - a.val);
    const win = ranked[0];
    if (this.bannerEl) {
      this.bannerEl.hidden = false;
      const pct = (win.val - 1) * 100;
      this.bannerEl.innerHTML = `<div><div class="win" style="color:${win.c.color}">🏁 ${win.c.symbol} wins</div>
        <div class="pct">${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% equity</div>
        <button class="ctrl" id="replayBtn">↻ Replay</button></div>`;
      const rb = this.bannerEl.querySelector('#replayBtn');
      if (rb) rb.onclick = () => { this.playhead = 0; this.play(); };
    }
    if (!REDUCED) this._spawnParticles(win);
    if (this.onTick) this.onTick(1);
  }

  _spawnParticles(win) {
    const hy = this._y(this._valAt(win.i, this.n - 1, 0));
    const hx = this.xs[this.n - 1];
    this.particles = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      this.particles.push({ x: hx, y: hy, vx: Math.cos(a) * (2 + Math.random() * 3) * this.dpr, vy: Math.sin(a) * (2 + Math.random() * 3) * this.dpr, life: 1, color: win.c.color });
    }
    const start = performance.now();
    const anim = (ts) => {
      const t = (ts - start) / 600;
      if (t >= 1) { this.particles = []; this._render(this.n - 1, 0); return; }
      for (const p of this.particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.15 * this.dpr; p.life = 1 - t; }
      this._render(this.n - 1, 0);
      requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);
  }
  _drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 2.5 * this.dpr, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  hideBanner() { if (this.bannerEl) this.bannerEl.hidden = true; }
  destroy() { this.pause(); document.removeEventListener('visibilitychange', this._onVis); }
}

export function drawDuel(canvas, stratEq, baseEq) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const w = canvas.clientWidth || 320, h = canvas.clientHeight || 150;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const W = canvas.width, H = canvas.height, pad = 8 * dpr;
  ctx.clearRect(0, 0, W, H);
  const series = [{ e: stratEq, color: '#4c8dff' }, { e: baseEq, color: '#8a97ad' }];
  const reb = series.map(s => { const b = s.e.find(v => v > 0) || 1; return { v: s.e.map(x => x / b), color: s.color }; });
  let lo = Infinity, hi = -Infinity;
  for (const s of reb) for (const v of s.v) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const yp = (hi - lo) * 0.1 || 0.05; lo -= yp; hi += yp;
  const n = Math.max(...reb.map(s => s.v.length));
  for (const s of reb) {
    ctx.beginPath();
    for (let i = 0; i < s.v.length; i++) {
      const x = pad + (i / (n - 1)) * (W - pad * 2);
      const y = pad + (1 - (s.v[i] - lo) / (hi - lo)) * (H - pad * 2);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.strokeStyle = s.color; ctx.lineWidth = 2 * dpr; ctx.stroke();
  }
}
