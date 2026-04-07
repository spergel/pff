"""
Predicts PFF rebalancing flows for the next month-end based on weight drift.

Since PFF is market-cap weighted, holdings drift from target between rebalancing
dates. Securities that appreciated vs the portfolio -> overweight -> will be SOLD.
Securities that underperformed -> underweight -> will be BOUGHT.

Drift ratio = (price_today / price_baseline) / portfolio_return_factor
  > 1.0 -> overweight -> predicted SELL
  < 1.0 -> underweight -> predicted BUY

Usage:
    python scripts/predict_flows.py                          # auto-detect baseline
    python scripts/predict_flows.py --baseline 2026-03-31   # explicit baseline
    python scripts/predict_flows.py --baseline 2026-03-31 --current 2026-04-02
"""

import argparse
import csv
import glob
import os

HOLDINGS_DIR = "data/holdings"
OUT_FILE = "data/predicted_flows.csv"
MIN_DRIFT = 0.002  # 0.2% weight gap threshold


def load_holdings(path: str) -> dict[str, dict]:
    holdings = {}
    with open(path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            isin = row.get("isin", "").strip()
            if not isin:
                continue
            try:
                price = float(row["price"]) if row.get("price") not in ("", "-") else None
                shares = float(row["shares"]) if row.get("shares") not in ("", "-") else None
                weight = float(row["weight"]) if row.get("weight") not in ("", "-") else None
                mkt_val = float(row["mkt_val"]) if row.get("mkt_val") not in ("", "-") else None
            except (ValueError, KeyError):
                continue
            if not price or not shares:
                continue
            holdings[isin] = {
                "isin": isin,
                "ticker": row.get("ticker_raw", ""),
                "name": row.get("name", ""),
                "sector": row.get("sector", ""),
                "price": price,
                "shares": shares,
                "weight": weight or 0.0,
                "mkt_val": mkt_val or (price * shares),
            }
    return holdings


def detect_baseline(available_dates: list[str]) -> str:
    """Most recent date that is the last trading day of its month."""
    for d in reversed(available_dates):
        idx = available_dates.index(d)
        if idx + 1 < len(available_dates):
            from datetime import date
            if date.fromisoformat(available_dates[idx + 1]).month != date.fromisoformat(d).month:
                return d
    return available_dates[0]


def available_dates() -> list[str]:
    return sorted(
        os.path.basename(f).replace(".csv", "")
        for f in glob.glob(os.path.join(HOLDINGS_DIR, "*.csv"))
    )


def run(baseline_date: str, current_date: str, min_drift: float = MIN_DRIFT) -> list[dict]:
    """Compute predicted flows and write to OUT_FILE. Returns the rows."""
    base = load_holdings(os.path.join(HOLDINGS_DIR, f"{baseline_date}.csv"))
    curr = load_holdings(os.path.join(HOLDINGS_DIR, f"{current_date}.csv"))

    curr_aum = sum(h["mkt_val"] for h in curr.values())

    common = set(base) & set(curr)
    base_val = sum(base[i]["shares"] * base[i]["price"] for i in common)
    curr_val = sum(base[i]["shares"] * curr[i]["price"] for i in common)
    portfolio_return = curr_val / base_val if base_val else 1.0

    print(f"Baseline: {baseline_date}  Current: {current_date}  "
          f"Portfolio return: {(portfolio_return-1)*100:+.3f}%  AUM: ${curr_aum/1e9:.2f}B")

    rows = []
    for isin in common:
        b = base[isin]
        c = curr[isin]

        price_return = (c["price"] / b["price"]) - 1
        drift_ratio = (c["price"] / b["price"]) / portfolio_return

        implied_weight = (b["shares"] * c["price"]) / curr_aum
        target_weight = b["weight"] / 100.0
        weight_gap = implied_weight - target_weight  # positive = overweight -> sell

        rows.append({
            "baseline_date": baseline_date,
            "current_date": current_date,
            "isin": isin,
            "ticker": c["ticker"] or b["ticker"],
            "name": c["name"] or b["name"],
            "sector": c["sector"] or b["sector"],
            "baseline_price": round(b["price"], 4),
            "current_price": round(c["price"], 4),
            "price_return_pct": round(price_return * 100, 3),
            "drift_ratio": round(drift_ratio, 5),
            "baseline_weight_pct": round(b["weight"], 4),
            "implied_weight_pct": round(implied_weight * 100, 4),
            "weight_gap_pct": round(weight_gap * 100, 5),
            "predicted_dollar_flow": round(weight_gap * curr_aum, 0),
            "predicted_action": (
                "SELL" if weight_gap > min_drift / 100 else
                "BUY"  if weight_gap < -min_drift / 100 else
                "FLAT"
            ),
        })

    rows.sort(key=lambda r: r["predicted_dollar_flow"], reverse=True)

    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()), quoting=csv.QUOTE_NONNUMERIC)
        writer.writeheader()
        writer.writerows(rows)

    sells = sum(1 for r in rows if r["predicted_action"] == "SELL")
    buys  = sum(1 for r in rows if r["predicted_action"] == "BUY")
    print(f"  {sells} predicted sells, {buys} predicted buys -> {OUT_FILE}")
    return rows


def main():
    """Pipeline entry point — auto-detects baseline and current dates."""
    dates = available_dates()
    if len(dates) < 2:
        print("Not enough holdings data to predict flows.")
        return

    current_date = dates[-1]
    baseline_date = detect_baseline(dates)

    if baseline_date == current_date:
        baseline_date = dates[-2]

    run(baseline_date, current_date)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", default=None)
    parser.add_argument("--current", default=None)
    parser.add_argument("--min-drift", type=float, default=MIN_DRIFT)
    args = parser.parse_args()

    dates = available_dates()
    baseline = args.baseline or detect_baseline(dates)
    current  = args.current  or dates[-1]
    run(baseline, current, args.min_drift)
