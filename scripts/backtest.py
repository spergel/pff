"""
Backtests PFF rebalancing signals using historical holdings price data.

The forced buy/sell pressure from PFF rebalancing happens intraday. By the
time iShares publishes the EOD holdings file, the price has already been
pushed. The signal is therefore a mean-reversion fade, entered at T+1:

  REMOVED / SELL → price already depressed by forced selling → go LONG
  ADDED / BUY    → price already elevated by forced buying   → go SHORT

Entry = T+1 holdings price (first day you can act on the signal).
Exit  = T+1+N holdings price for N in [1, 3, 5, 10, 21] trading days.

strategy_return = fwd_return for LONG trades, -fwd_return for SHORT trades.
Positive strategy_return = trade worked.

Usage:
    python scripts/backtest.py
    python scripts/backtest.py --flow-types ADDED,REMOVED
    python scripts/backtest.py --min-dollar-flow 500000
    python scripts/backtest.py --out data/backtest_2025.csv
"""

import argparse
import csv
import glob
import os
import statistics
from datetime import date

HOLDINGS_DIR = "data/holdings"
FLOWS_DIR = "data/flows"
HORIZONS = [1, 3, 5, 10, 21]
# Post-event fade: buy what was force-sold, short what was force-bought
LONG_TYPES = {"REMOVED", "SELL"}
SHORT_TYPES = {"ADDED", "BUY"}


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def load_all_prices() -> tuple[dict[str, dict[str, float]], list[str]]:
    """Returns (prices[isin][date_str] = price, sorted_dates)."""
    prices: dict[str, dict[str, float]] = {}
    dates = set()

    for path in sorted(glob.glob(os.path.join(HOLDINGS_DIR, "*.csv"))):
        date_str = os.path.basename(path).replace(".csv", "")
        dates.add(date_str)
        with open(path, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                isin = row.get("isin", "").strip()
                price_raw = row.get("price", "")
                if not isin or price_raw in ("", "-"):
                    continue
                try:
                    price = float(price_raw)
                except ValueError:
                    continue
                prices.setdefault(isin, {})[date_str] = price

    return prices, sorted(dates)


def load_all_flows(flow_types: set[str], min_dollar: float) -> list[dict]:
    signals = []
    for path in sorted(glob.glob(os.path.join(FLOWS_DIR, "*.csv"))):
        with open(path, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if row.get("flow_type") not in flow_types:
                    continue
                try:
                    dollar_flow = abs(float(row.get("dollar_flow", 0) or 0))
                except ValueError:
                    dollar_flow = 0.0
                if dollar_flow < min_dollar:
                    continue
                signals.append(row)
    return signals


# ---------------------------------------------------------------------------
# Core analysis
# ---------------------------------------------------------------------------

def price_at_offset(isin: str, signal_date: str, offset: int,
                    prices: dict, sorted_dates: list[str]) -> float | None:
    """Price `offset` trading days after signal_date, or None if not available."""
    try:
        idx = sorted_dates.index(signal_date)
    except ValueError:
        return None
    target_idx = idx + offset
    if target_idx >= len(sorted_dates):
        return None
    return prices.get(isin, {}).get(sorted_dates[target_idx])


def run(flow_types: set[str], min_dollar: float, out_path: str):
    print("Loading holdings prices...")
    prices, sorted_dates = load_all_prices()
    print(f"  {len(sorted_dates)} trading days, {len(prices)} unique ISINs\n")

    print("Loading flow signals...")
    signals = load_all_flows(flow_types, min_dollar)
    print(f"  {len(signals)} signals matching filters\n")

    if not signals:
        print("No signals found. Run backfill.py + compute_flows.py first.")
        return

    results = []
    skipped = 0

    for sig in signals:
        isin = sig["isin"]
        signal_date = sig["date"]
        flow_type = sig["flow_type"]

        # Entry is T+1: first price available after seeing the signal
        entry_price = price_at_offset(isin, signal_date, 1, prices, sorted_dates)
        signal_price = prices.get(isin, {}).get(signal_date)  # for reference only

        if not entry_price or entry_price == 0:
            skipped += 1
            continue

        is_long = flow_type in LONG_TYPES

        row = {
            "date": signal_date,
            "isin": isin,
            "ticker": sig.get("ticker", sig.get("ticker_raw", "")),
            "name": sig.get("name", ""),
            "sector": sig.get("sector", ""),
            "flow_type": flow_type,
            "trade_direction": "LONG" if is_long else "SHORT",
            "dollar_flow": sig.get("dollar_flow", ""),
            "shares_delta": sig.get("shares_delta", ""),
            "signal_price": round(signal_price, 4) if signal_price else "",
            "entry_price": round(entry_price, 4),
            # Overnight move from signal day to entry day (the intraday impact unwinding)
            "overnight_ret": round((entry_price / signal_price) - 1, 6) if signal_price else "",
        }

        for n in HORIZONS:
            # Exit is T+1+N from entry (entry is already T+1)
            exit_price = price_at_offset(isin, signal_date, 1 + n, prices, sorted_dates)
            if exit_price and exit_price != 0:
                raw_ret = (exit_price / entry_price) - 1
                strat_ret = raw_ret if is_long else -raw_ret
                row[f"fwd_ret_{n}d"] = round(raw_ret, 6)
                row[f"strat_ret_{n}d"] = round(strat_ret, 6)
            else:
                row[f"fwd_ret_{n}d"] = ""
                row[f"strat_ret_{n}d"] = ""

        results.append(row)

    print(f"Computed returns for {len(results)} signals ({skipped} skipped, no price)\n")

    # Write per-signal CSV
    fieldnames = [
        "date", "isin", "ticker", "name", "sector", "flow_type", "trade_direction",
        "dollar_flow", "shares_delta", "signal_price", "entry_price", "overnight_ret",
        *[f"fwd_ret_{n}d" for n in HORIZONS],
        *[f"strat_ret_{n}d" for n in HORIZONS],
    ]
    os.makedirs(os.path.dirname(out_path) if os.path.dirname(out_path) else ".", exist_ok=True)
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_NONNUMERIC)
        writer.writeheader()
        writer.writerows(results)
    print(f"Per-signal results -> {out_path}\n")

    # Summary table
    print_summary(results, flow_types)


def print_summary(results: list[dict], flow_types: set[str]):
    print("=" * 72)
    print(f"{'SUMMARY':^72}")
    print("=" * 72)

    for ft in sorted(flow_types):
        subset = [r for r in results if r["flow_type"] == ft]
        if not subset:
            continue

        direction = "LONG (fade forced sell)" if ft in LONG_TYPES else "SHORT (fade forced buy)"
        print(f"\n{ft}  ->  {direction}  (n={len(subset)} signals)")
        print(f"  {'Horizon':>10}  {'N':>5}  {'Mean':>8}  {'Median':>8}  {'Win%':>6}  {'Sharpe':>7}")
        print(f"  {'-'*10}  {'-'*5}  {'-'*8}  {'-'*8}  {'-'*6}  {'-'*7}")

        # Overnight: strategy return from signal close to T+1 close
        overnight_rets_raw = [r["overnight_ret"] for r in subset if r["overnight_ret"] != ""]
        if overnight_rets_raw:
            is_long = ft in LONG_TYPES
            rets = [r if is_long else -r for r in overnight_rets_raw]
            mean = statistics.mean(rets)
            med = statistics.median(rets)
            win_pct = sum(1 for r in rets if r > 0) / len(rets) * 100
            std = statistics.stdev(rets) if len(rets) > 1 else 0
            sharpe = (mean / std) if std else 0
            print(
                f"  {'overnight':>10}  {len(rets):>5}  "
                f"{mean*100:>7.2f}%  {med*100:>7.2f}%  "
                f"{win_pct:>5.1f}%  {sharpe:>7.2f}"
            )

        for n in HORIZONS:
            key = f"strat_ret_{n}d"
            rets = [r[key] for r in subset if r[key] != ""]
            if not rets:
                continue
            mean = statistics.mean(rets)
            med = statistics.median(rets)
            win_pct = sum(1 for r in rets if r > 0) / len(rets) * 100
            std = statistics.stdev(rets) if len(rets) > 1 else 0
            sharpe = (mean / std) if std else 0

            print(
                f"  {f'+{n}d':>10}  {len(rets):>5}  "
                f"{mean*100:>7.2f}%  {med*100:>7.2f}%  "
                f"{win_pct:>5.1f}%  {sharpe:>7.2f}"
            )

    print()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--flow-types",
        default="ADDED,REMOVED,BUY,SELL",
        help="Comma-separated flow types to include (default: ADDED,REMOVED,BUY,SELL)",
    )
    parser.add_argument(
        "--min-dollar-flow",
        type=float,
        default=0,
        help="Minimum absolute dollar flow to include a signal (default: 0)",
    )
    parser.add_argument(
        "--out",
        default="data/backtest_results.csv",
        help="Output CSV path (default: data/backtest_results.csv)",
    )
    args = parser.parse_args()

    selected_types = {t.strip().upper() for t in args.flow_types.split(",")}
    run(selected_types, args.min_dollar_flow, args.out)
