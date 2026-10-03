# Arena data

## Files
- **`universe.json`** — the universe the arena scores. Shared `dates[]` time axis + per-stock
  parallel candle arrays.
- **`meta.json`** — small provenance/freshness mirror that drives the in-app banner.
- **`candidates.json`** — real low-priced US tickers for the in-browser live (Finnhub) screen.

## `universe.json` schema (schemaVersion 3)
```jsonc
{
  "schemaVersion": 3,
  "meta": { "dataKind": "seed|real", "asOf": "YYYY-MM-DD", "source": "...",
            "universeSize": 120, "barsPerStock": 252, "priceBand": [0.5, 5.0], "interval": "1d" },
  "dates": ["2025-07-10", "..."],          // length T, SHARED by all stocks
  "stocks": [
    {
      "symbol": "ABCD",
      "name": "Abcd Holdings (DEMO)",       // "(DEMO)" suffix only on seed data
      "meta": { "exchange": "NASDAQ", "sector": "Biotech", "lastClose": 2.34, "synthetic": true },
      "o": [2.10, null, ...],               // parallel arrays keyed to dates[]
      "h": [...], "l": [...], "c": [...], "v": [...]
                                            // null = not listed that day -> backtester holds flat
    }
  ]
}
```

## `dataKind`
- **`seed`** — synthetic prices from `tools/gen-seed.mjs` (deterministic, offline). The app shows a
  persistent SEED banner and the app renders identically to real data — only the flag differs.
- **`real`** — produced by `tools/update-universe.mjs` in CI from FMP. The banner self-clears.

## Scoring & execution (so the numbers are reproducible)
- Score is a transparent 0–100 composite of return (30%), Sharpe (30%), drawdown (20%),
  win-rate (10%), exposure (10%), times multiplicative anti-gaming penalties (low-trade, barely-traded,
  blowup). See `js/scoring.js`. Tiers: Bronze/Silver/Gold/Platinum/Diamond. ELO is a season-long
  reputation from per-run pairwise duels (baseline + score-neighbours).
- Backtest fill rule: a signal on bar *t* fills at bar *t+1*'s **open** with fees + slippage
  (no lookahead; the last bar never opens a trade). See `js/backtest.js`.

## ⚠️ Honest data caveats
- **Survivorship bias** — the FMP screener returns *currently-listed* $0.50–$5 names, so historical
  backtests are biased upward (delisted losers are missing). The `null`-bar handling avoids fake
  early returns but cannot fix membership bias.
- **Penny-stock fills are far worse in reality** — wide spreads, halts, and thin liquidity make
  real results much worse than any basis-points slippage model. Fees + slippage default ON; crank
  slippage to stress-test.
- **Adjusted-close / reverse-split distortion** — the CI validation gate rejects any series with a
  single-day move > ±90% as a suspected split/adjustment artifact and aborts rather than commit it.

For education and practice only. Not investment advice.
