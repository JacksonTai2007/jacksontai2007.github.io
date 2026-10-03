// metrics.js — defensible performance stats from an equity curve + trade log.
// Everything is coerced to safe finite values so scoring never breaks.

const safe = (x, d = 0) => (Number.isFinite(x) ? x : d);

export function computeMetrics(equity, trades, startCash) {
  const n = equity.length;
  if (n === 0) return blank(startCash);

  const final = equity[n - 1];
  const totalReturn = startCash > 0 ? final / startCash - 1 : 0;
  const cagr = startCash > 0 && final > 0 && n > 1
    ? Math.pow(final / startCash, 252 / n) - 1
    : 0;

  // daily simple returns
  let mean = 0, cnt = 0;
  const rets = new Float64Array(n - 1);
  for (let i = 1; i < n; i++) {
    const prev = equity[i - 1];
    const r = prev !== 0 ? equity[i] / prev - 1 : 0;
    rets[i - 1] = r; mean += r; cnt++;
  }
  mean = cnt ? mean / cnt : 0;
  let varSum = 0;
  for (let i = 0; i < rets.length; i++) { const d = rets[i] - mean; varSum += d * d; }
  const std = rets.length > 1 ? Math.sqrt(varSum / (rets.length - 1)) : 0;
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 0;

  // max drawdown (positive fraction)
  let peak = equity[0], maxDD = 0;
  for (let i = 0; i < n; i++) {
    if (equity[i] > peak) peak = equity[i];
    if (peak > 0) { const dd = (peak - equity[i]) / peak; if (dd > maxDD) maxDD = dd; }
  }

  // trade stats
  let wins = 0, grossWin = 0, grossLoss = 0;
  for (const t of trades) {
    if (t.pnl > 0) { wins++; grossWin += t.pnl; }
    else { grossLoss += -t.pnl; }
  }
  const tradeCount = trades.length;
  const winRate = tradeCount ? wins / tradeCount : 0;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? 99 : 0);

  return {
    totalReturn: safe(totalReturn),
    cagr: safe(cagr),
    sharpe: safe(sharpe),
    maxDrawdown: safe(maxDD),
    winRate: safe(winRate),
    tradeCount,
    exposure: 0, // filled by backtest (needs bars-in-market)
    profitFactor: safe(profitFactor),
    finalEquity: safe(final, startCash),
  };
}

function blank(startCash) {
  return {
    totalReturn: 0, cagr: 0, sharpe: 0, maxDrawdown: 0, winRate: 0,
    tradeCount: 0, exposure: 0, profitFactor: 0, finalEquity: startCash,
  };
}
