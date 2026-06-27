// app.js — controller. Loads data, owns the worker, routes views, orchestrates
// Compete -> worker -> score/ELO -> ladder (FLIP) -> race (auto-play) -> duel.

import { loadUniverse, getUniverse, getMeta, isSeed } from './data.js';
import { store } from './store.js';
import { eloUpdate, tierFor } from './scoring.js';
import { PRESETS, BASELINE, DEFAULT_STRATEGY_SOURCE, presetById } from './presets.js';
import { renderLadder, renderSheet } from './ladder.js';
import { Race, drawDuel } from './race.js';
import { fetchQuotes } from './live.js';

const $ = id => document.getElementById(id);
const COLORS = ['#f5b942', '#4c8dff', '#21c08a', '#f0506e', '#b56cff', '#39d0d8', '#ff924c', '#9aa7bd'];

const state = {
  worker: null, runId: 0, running: false, watchdog: 0,
  results: null, baselineScores: {}, baselineEquity: {},
  rows: [], filter: 'all', activePreset: 'sma-cross',
  settings: store.getSettings(), race: null,
};

// ---------- boot ----------
init();

async function init() {
  registerSW();
  setupTabs();
  setupControls();
  renderPresets();
  // editor source: saved or default
  $('editor').value = store.getSource(DEFAULT_STRATEGY_SOURCE);
  applySettingsToInputs();

  state.race = new Race($('raceCanvas'), $('raceStandings'), $('raceBanner'));
  window.addEventListener('resize', () => state.race && state.race.resize());

  try {
    await loadUniverse();
  } catch (e) {
    toast('Failed to load universe: ' + e.message); return;
  }
  showSeedBanner();
  renderDataInfo();
  spawnWorker();
}

function spawnWorker() {
  if (state.worker) state.worker.terminate();
  state.worker = new Worker(new URL('./backtest.worker.js', import.meta.url), { type: 'module' });
  state.worker.onmessage = onWorkerMessage;
  state.worker.onerror = (e) => { toast('Worker error: ' + (e.message || 'crashed')); endRun(); };
  state.worker.postMessage({ type: 'init', universe: getUniverse() });
}

function onWorkerMessage(ev) {
  const msg = ev.data || {};
  if (msg.type === 'ready') {
    // auto-run the default preset on first load (time-to-wow)
    runStrategy(store.getSource(DEFAULT_STRATEGY_SOURCE), true);
    return;
  }
  if (msg.type === 'progress') {
    setProgress(msg.done / msg.total, `Scoring ${msg.done}/${msg.total}…`);
    return;
  }
  if (msg.type === 'error') {
    clearTimeout(state.watchdog);
    setEditorStatus(msg.message, 'err');
    toast(msg.message);
    endRun();
    return;
  }
  if (msg.type === 'result' && msg.runId === state.runId) {
    clearTimeout(state.watchdog);
    handleResult(msg);
  }
}

// ---------- run ----------
function runStrategy(source, isAuto) {
  if (state.running) return;
  state.running = true;
  state.runId++;
  $('runBtn').disabled = true; $('runBtn2') && ($('runBtn2').disabled = true);
  setProgress(0.02, 'Running backtests…');
  $('progress').hidden = false;
  if (!isAuto) setEditorStatus('Running…', '');

  // quick client-side compile check for nicer errors
  try { new Function('candles', 'ctx', '"use strict";' + source + ';if(typeof strategy!=="function")throw new Error("define function strategy(candles, ctx)")'); }
  catch (e) { setEditorStatus('Syntax error: ' + e.message, 'err'); endRun(); return; }

  const cfg = readConfig();
  state.worker.postMessage({ type: 'run', runId: state.runId, strategySource: source, config: cfg });

  // watchdog: terminate + respawn if the worker hangs
  clearTimeout(state.watchdog);
  state.watchdog = setTimeout(() => {
    toast('Strategy timed out — worker restarted.');
    setEditorStatus('Timed out (possible infinite loop).', 'err');
    spawnWorker(); endRun();
  }, 9000);
}

function handleResult(msg) {
  state.results = msg.results;
  state.baselineScores = msg.baselineScores || {};
  state.baselineEquity = msg.baselineEquity || {};

  // ELO
  const eloMap = store.getElo();
  eloUpdate(eloMap, state.results.map(r => ({ symbol: r.symbol, score: r.score })), state.baselineScores);
  store.setElo(eloMap);

  // rank + deltas
  const prevRanks = store.getRanks();
  const sorted = [...state.results].sort((a, b) =>
    b.score - a.score || ((eloMap[b.symbol]?.elo || 0) - (eloMap[a.symbol]?.elo || 0)));
  const newRanks = {};
  state.rows = sorted.map((r, i) => {
    newRanks[r.symbol] = i + 1;
    const prev = prevRanks[r.symbol];
    return {
      ...r, elo: eloMap[r.symbol]?.elo ?? 1200,
      tier: r.scoreDetail?.tier ?? tierFor(r.score),
      delta: prev != null ? prev - (i + 1) : null,
    };
  });
  store.setRanks(newRanks);

  renderLadderView();
  loadRace();
  renderDuel();
  updateLadderMeta();

  const dnf = state.results.filter(r => r.dnf).length;
  setEditorStatus(`✓ Scored ${state.results.length} stocks${dnf ? ` · ${dnf} DNF (errors)` : ''}. Top: ${state.rows[0].symbol} (${state.rows[0].score}).`, dnf ? '' : 'ok');
  endRun();
}

function endRun() {
  state.running = false;
  $('runBtn').disabled = false; $('runBtn2') && ($('runBtn2').disabled = false);
  $('progress').hidden = true; setProgress(0, '');
}

// ---------- ladder ----------
function visibleRows() {
  if (state.filter === 'beat') return state.rows.filter(r => r.score > (state.baselineScores[r.symbol] ?? 0));
  if (state.filter === 'top25') return state.rows.slice(0, 25);
  return state.rows;
}
function renderLadderView() {
  renderLadder($('ladder'), visibleRows(), openSheet);
}
function updateLadderMeta() {
  const meta = getMeta();
  const beat = state.rows.filter(r => r.score > (state.baselineScores[r.symbol] ?? 0)).length;
  $('ladderMeta').innerHTML = `${state.rows.length} stocks · ${beat} beat baseline<br><span class="muted">${meta?.asOf || ''} · ${isSeed() ? 'seed' : 'real'} data</span>`;
}

// ---------- race ----------
function loadRace() {
  const n = clampInt(readConfig().topN ?? state.settings.topN, 2, 8);
  const top = state.rows.filter(r => !r.dnf).slice(0, n);
  const curves = top.map((r, i) => ({ symbol: r.symbol, equity: r.equity, color: COLORS[i % COLORS.length], tier: r.tier }));
  state.race.onTick = (frac) => { const s = $('scrub'); if (s) s.value = String(Math.round(frac * 1000)); };
  state.race.load(curves);
  if (isViewActive('race')) state.race.play();
}

// ---------- duel ----------
function renderDuel() {
  if (!state.results || !state.results.length) return;
  const len = state.results[0].equity.length;
  const stratAvg = new Array(len).fill(0), baseAvg = new Array(len).fill(0);
  let sc = 0, bc = 0;
  for (const r of state.results) {
    if (r.equity && r.equity.length === len) { for (let i = 0; i < len; i++) stratAvg[i] += r.equity[i]; sc++; }
    const be = state.baselineEquity[r.symbol];
    if (be && be.length === len) { for (let i = 0; i < len; i++) baseAvg[i] += be[i]; bc++; }
  }
  for (let i = 0; i < len; i++) { stratAvg[i] /= (sc || 1); baseAvg[i] /= (bc || 1); }
  drawDuel($('duelCanvas'), stratAvg, baseAvg);
  const sr = stratAvg[len - 1] / stratAvg[0] - 1, br = baseAvg[len - 1] / baseAvg[0] - 1;
  const diff = (sr - br) * 100;
  $('duelReadout').innerHTML = `Strategy <b style="color:#4c8dff">${(sr * 100 >= 0 ? '+' : '') + (sr * 100).toFixed(1)}%</b> vs Buy &amp; Hold <b style="color:#8a97ad">${(br * 100 >= 0 ? '+' : '') + (br * 100).toFixed(1)}%</b> · edge <b style="color:${diff >= 0 ? '#21c08a' : '#f0506e'}">${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%</b>`;
}

// ---------- sheet ----------
function openSheet(r) {
  const sheet = $('sheet');
  renderSheet($('sheetBody'), r);
  sheet.hidden = false;
  const close = () => { sheet.hidden = true; };
  sheet.querySelector('.sheet-backdrop').onclick = close;
  $('sheetBody').querySelector('.close').onclick = close;
}

// ---------- presets ----------
function renderPresets() {
  const all = [...PRESETS, BASELINE];
  $('presets').innerHTML = all.map(p =>
    `<button class="preset${p.id === state.activePreset ? ' on' : ''}" data-id="${p.id}"><b>${p.name}</b><span>${p.blurb}</span></button>`
  ).join('');
  $('presets').querySelectorAll('.preset').forEach(btn => {
    btn.onclick = () => {
      const p = presetById(btn.dataset.id);
      state.activePreset = p.id;
      $('editor').value = p.source;
      store.setSource(p.source);
      $('presets').querySelectorAll('.preset').forEach(b => b.classList.toggle('on', b === btn));
      setEditorStatus(`Loaded preset: ${p.name}. Hit Compete.`, '');
    };
  });
}

// ---------- controls ----------
function setupControls() {
  const run = () => { const src = $('editor').value; store.setSource(src); runStrategy(src, false); };
  $('runBtn').onclick = run;
  $('runBtn2').onclick = () => { switchView('arena'); run(); };

  $('editor').addEventListener('input', () => store.setSource($('editor').value));

  // filters
  $('filters').querySelectorAll('.chip').forEach(c => {
    c.onclick = () => { state.filter = c.dataset.filter; $('filters').querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c)); renderLadderView(); };
  });

  // race controls
  $('playBtn').onclick = () => { state.race.toggle(); $('playBtn').textContent = state.race.playing ? '⏸' : '▶'; };
  $('scrub').oninput = (e) => { state.race.seek(Number(e.target.value) / 1000); $('playBtn').textContent = '▶'; };
  $('speeds').querySelectorAll('button').forEach(b => {
    b.onclick = () => { state.race.setSpeed(Number(b.dataset.spd)); $('speeds').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
  });

  // config inputs persist
  ['cfgCash', 'cfgFee', 'cfgSlip', 'cfgTopN', 'cfgShort'].forEach(id => {
    $(id).addEventListener('change', () => { state.settings = readConfig(); store.setSettings(state.settings); });
  });

  // data tab
  $('goLiveBtn').onclick = goLive;
  $('resetBtn').onclick = () => { if (confirm('Reset saved strategy, ELO ladder and settings?')) { store.reset(); location.reload(); } };
}

function readConfig() {
  return {
    startCash: clampInt($('cfgCash').value, 1000, 1e9, 10000),
    feeBps: clampInt($('cfgFee').value, 0, 1000, 10),
    slipBps: clampInt($('cfgSlip').value, 0, 1000, 15),
    allowShort: $('cfgShort').checked,
    topN: clampInt($('cfgTopN').value, 2, 8, 6),
  };
}
function applySettingsToInputs() {
  const s = state.settings;
  $('cfgCash').value = s.startCash; $('cfgFee').value = s.feeBps; $('cfgSlip').value = s.slipBps;
  $('cfgTopN').value = s.topN; $('cfgShort').checked = !!s.allowShort;
}

// ---------- live ----------
async function goLive() {
  const key = $('finnhubKey').value.trim();
  if (!key) { toast('Paste a Finnhub API key first.'); return; }
  store.setFinnhubKey(key);
  $('liveStatus').textContent = 'Fetching real-time quotes…';
  $('goLiveBtn').disabled = true;
  let candidates = [];
  try { candidates = (await fetch('data/candidates.json').then(r => r.json())).symbols || []; } catch {}
  try {
    const quotes = await fetchQuotes(key, candidates, [0.5, 5], (d, t) => { $('liveStatus').textContent = `Quoting ${d}/${t}…`; });
    const inBand = quotes.filter(q => q.inBand);
    $('liveStatus').innerHTML = `✓ ${quotes.length} quoted · <b>${inBand.length}</b> in $0.50–$5 band (live).`;
    $('liveList').innerHTML = quotes.slice(0, 30).map(q =>
      `<div class="live-item"><span>${q.symbol} ${q.inBand ? '' : '<span class="muted">· out of band</span>'}</span>
       <span class="px" style="color:${q.change >= 0 ? '#21c08a' : '#f0506e'}">$${q.price.toFixed(2)} ${q.change >= 0 ? '+' : ''}${q.change.toFixed(1)}%</span></div>`
    ).join('');
  } catch (e) {
    $('liveStatus').innerHTML = e.message === 'auth'
      ? '⚠ Invalid API key (401/403). The arena keeps running on baked data.'
      : '⚠ Live fetch failed (CORS/rate/network). The arena keeps running on baked data.';
  } finally { $('goLiveBtn').disabled = false; }
}

// ---------- views / tabs ----------
function setupTabs() {
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => switchView(t.dataset.view));
}
function switchView(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  if (name === 'race') { state.race.resize(); if (!state.race.playing) { /* let user press play; auto-play on first land */ } state.race.play(); $('playBtn').textContent = '⏸'; }
  else state.race && state.race.pause();
}
function isViewActive(name) { return $('view-' + name)?.classList.contains('active'); }

// ---------- misc ui ----------
function showSeedBanner() {
  if (isSeed()) { $('seedBanner').hidden = false; $('seedDetail').textContent = 'synthetic demo prices. Run the CI updater (or Go Live) for real $0.50–$5 data.'; $('subtitle').textContent = '$0.50–$5 · seed data'; }
  else { $('seedBanner').hidden = true; $('subtitle').textContent = '$0.50–$5 US stocks · real data'; }
}
function renderDataInfo() {
  const m = getMeta() || {};
  $('dataInfo').innerHTML =
    `<div>Mode: <b>${isSeed() ? 'Seed (synthetic)' : 'Real'}</b></div>
     <div>Source: <b>${m.source || '—'}</b></div>
     <div>As of: <b>${m.asOf || '—'}</b></div>
     <div>Universe: <b>${getUniverse()?.stocks.length || 0}</b> stocks · ${m.barsPerStock || '?'} bars</div>
     <div>Price band: <b>$${(m.priceBand || [0.5, 5]).join('–$')}</b></div>`;
}
function setProgress(frac, label) { $('progressBar').style.width = Math.round(frac * 100) + '%'; $('progressLabel').textContent = label || ''; }
function setEditorStatus(text, cls) { const el = $('editorStatus'); el.textContent = text; el.className = 'editor-status ' + (cls || ''); }

let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3200); }

function clampInt(v, lo, hi, dflt) { let n = parseInt(v, 10); if (!Number.isFinite(n)) n = dflt ?? lo; return Math.max(lo, Math.min(hi, n)); }

function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
}
