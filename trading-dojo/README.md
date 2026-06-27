# Penny Stock Arena 🏟️

Write a trading **strategy**, watch it score and rank a universe of **$0.50–$5 US stocks** on a
CodeCombat-style **ladder**, and replay the top movers as an animated **equity race**. Offline-capable,
installable PWA. Deploys under `https://<user>.github.io/trading-dojo/`.

> **Not investment advice.** Backtests on a survivorship-biased, currently-listed universe with idealized
> fills. Real penny-stock liquidity, spreads, and halts make live results far worse. Education only.

## The loop
1. **Write a strategy** (`function strategy(candles, ctx)`) in the in-app editor, or pick a preset
   (SMA Crossover, RSI Mean-Reversion, Donchian Breakout, ATR Trend, Volume-Surge). Runs **sandboxed**
   in a Web Worker with indicator helpers (`ctx.sma/ema/rsi/atr/highest/lowest/roc/stdev/crossover`).
2. It's **backtested on every stock** in the $0.50–$5 universe (signal on bar *t* → fill at *t+1* open,
   with fees + slippage; no lookahead).
3. Each stock earns a transparent **0–100 score** (return/Sharpe/drawdown/win-rate/exposure + anti-gaming
   penalties) and a season-long **ELO**.
4. The **ladder** ranks the stocks (tiers Bronze→Diamond, Champion crown, rank-delta arrows). Tap a row
   for the full score breakdown, metrics, equity chart, and trades.
5. The **race** animates the top stocks' equity curves from a common start — leader highlight, live
   standings, scrub/speed, finish flourish. Plus a **strategy vs Buy & Hold** duel.

## Data (three tiers — "both" baked + live)
- **Baked `data/universe.json`** — ships in the repo so the arena works fully **offline**. Seeded by
  `tools/gen-seed.mjs` (deterministic synthetic data, clearly labeled `SEED`).
- **Live (in-browser)** — paste a free [Finnhub](https://finnhub.io) key in the Data tab to pull
  real-time quotes for the candidate penny stocks. Key stays on your device.
- **Real (CI)** — `tools/update-universe.mjs` + `.github/workflows/update-universe.yml` refresh the baked
  data with **real** $0.50–$5 OHLCV from FMP on a schedule. First successful run flips `dataKind`
  seed→real and the banner self-clears. Add repo secret `FMP_API_KEY` to enable.

See [`data/README.md`](data/README.md) for the schema, scoring formula, and honest data caveats.

## Files
```
trading-dojo/
├─ index.html            app shell (tabs: Arena / Race / Strategy / Data)
├─ css/app.css           dark mobile-first styles
├─ js/
│  ├─ app.js             controller (data → worker → ladder/race/duel)
│  ├─ indicators.js      pure lookahead-safe SMA/EMA/RSI/ATR/…
│  ├─ backtest.js        event-driven backtester (t+1-open fills, fees/slippage)
│  ├─ metrics.js         return/Sharpe/drawdown/win-rate/…
│  ├─ scoring.js         0–100 composite + tiers + ELO
│  ├─ presets.js         built-in strategies (source strings)
│  ├─ backtest.worker.js sandboxed Web Worker runner
│  ├─ ladder.js          ranked ladder + FLIP re-rank + detail sheet
│  ├─ race.js            canvas equity-race + duel chart
│  ├─ data.js / store.js universe loader / localStorage
│  └─ live.js            Finnhub live screen
├─ data/                 universe.json · meta.json · candidates.json
├─ tools/                gen-seed.mjs (offline) · update-universe.mjs (CI)
└─ sw.js, manifest.json  PWA
```

## Local preview
PWAs need HTTP (not `file://`) to register the service worker and module worker:
```bash
python3 -m http.server 8099          # from the repo root
# open http://localhost:8099/trading-dojo/
```
Regenerate the seed universe: `node trading-dojo/tools/gen-seed.mjs`

## Deploy (GitHub Pages)
**Settings → Pages → Source: `main` / `(root)`** → open `https://<user>.github.io/trading-dojo/` →
on Android Chrome, menu → **Add to Home screen**. All paths are relative, so it installs and runs
offline under the subpath.
