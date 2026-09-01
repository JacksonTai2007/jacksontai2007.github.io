// store.js — tiny versioned localStorage wrapper. All keys under 'psa.*'.

const K = {
  source: 'psa.source',
  elo: 'psa.elo',
  ranks: 'psa.ranks',
  settings: 'psa.settings',
  finnhubKey: 'psa.finnhubKey',
};

function read(key, fallback) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
  catch { return fallback; }
}
function write(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

export const DEFAULT_SETTINGS = { startCash: 10000, feeBps: 10, slipBps: 15, allowShort: false, topN: 6 };

export const store = {
  getSource(fallback) { return read(K.source, fallback); },
  setSource(src) { write(K.source, src); },

  getElo() { return read(K.elo, {}); },
  setElo(map) { write(K.elo, map); },

  getRanks() { return read(K.ranks, {}); },        // { symbol: rankNumber }
  setRanks(map) { write(K.ranks, map); },

  getSettings() { return { ...DEFAULT_SETTINGS, ...read(K.settings, {}) }; },
  setSettings(s) { write(K.settings, s); },

  getFinnhubKey() { return read(K.finnhubKey, ''); },
  setFinnhubKey(k) { write(K.finnhubKey, k); },

  reset() { for (const k of Object.values(K)) { try { localStorage.removeItem(k); } catch {} } },
};
