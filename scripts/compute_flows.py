"""
Diffs consecutive holdings files to compute daily ETF flows per ISIN.
Writes data/flows/YYYY-MM-DD.csv for each new day.

Flow types:
  ADDED    — ISIN entered the fund (prior_shares == 0)
  REMOVED  — ISIN exited the fund (today_shares == 0)
  BUY      — share count increased
  SELL     — share count decreased
  UNCHANGED — weight changed via price move only (shares flat)
  SUSPECT  — >50% single-day share move with no corresponding weight delta
              (likely a corporate action / lot consolidation, not rebalancing)
"""

import csv
import glob
import json
import os
import tempfile
from datetime import date, timedelta

HOLDINGS_DIR = "data/holdings"
FLOWS_DIR = "data/flows"
CACHE_FILE = "data/ticker_cache.json"

FIELDNAMES = [
    "date", "isin", "ticker", "ticker_raw", "name", "sector",
    "prior_shares", "today_shares", "shares_delta",
    "prior_weight", "today_weight", "weight_delta",
    "price", "dollar_flow", "flow_type", "gap_days",
]

SUSPECT_THRESHOLD = 0.50  # 50% share change in one day


def load_cache() -> dict:
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def load_holdings(path: str) -> dict[str, dict]:
    holdings = {}
    with open(path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            isin = row.get("isin", "").strip()
            if not isin:
                continue
            holdings[isin] = {
                "isin": isin,
                "ticker_raw": row.get("ticker_raw", ""),
                "name": row.get("name", ""),
                "sector": row.get("sector", ""),
                "shares": float(row["shares"]) if row.get("shares") not in ("", "-") else 0.0,
                "weight": float(row["weight"]) if row.get("weight") not in ("", "-") else 0.0,
                "price": float(row["price"]) if row.get("price") not in ("", "-") else 0.0,
            }
    return holdings


def classify(prior_shares: float, today_shares: float, prior_weight: float, today_weight: float) -> str:
    if prior_shares == 0:
        return "ADDED"
    if today_shares == 0:
        return "REMOVED"

    delta_shares = today_shares - prior_shares
    if delta_shares == 0:
        return "UNCHANGED"

    pct_change = abs(delta_shares) / prior_shares
    weight_delta = abs(today_weight - prior_weight)

    if pct_change > SUSPECT_THRESHOLD and weight_delta < 0.01:
        return "SUSPECT"

    return "BUY" if delta_shares > 0 else "SELL"


def compute(prev_path: str, curr_path: str, ticker_cache: dict) -> list[dict]:
    prev = load_holdings(prev_path)
    curr = load_holdings(curr_path)

    curr_date_str = os.path.basename(curr_path).replace(".csv", "")
    prev_date_str = os.path.basename(prev_path).replace(".csv", "")

    curr_date = date.fromisoformat(curr_date_str)
    prev_date = date.fromisoformat(prev_date_str)
    gap_days = (curr_date - prev_date).days

    all_isins = set(prev) | set(curr)
    rows = []

    for isin in all_isins:
        p = prev.get(isin)
        c = curr.get(isin)

        today_shares = c["shares"] if c else 0.0
        prior_shares = p["shares"] if p else 0.0
        today_weight = c["weight"] if c else 0.0
        prior_weight = p["weight"] if p else 0.0
        price = (c or p)["price"]
        ticker_raw = (c or p)["ticker_raw"]
        name = (c or p)["name"]
        sector = (c or p)["sector"]

        cache_entry = ticker_cache.get(isin, {})
        ticker = cache_entry.get("ticker") or ticker_raw

        flow_type = classify(prior_shares, today_shares, prior_weight, today_weight)
        shares_delta = today_shares - prior_shares
        dollar_flow = shares_delta * price

        rows.append({
            "date": curr_date_str,
            "isin": isin,
            "ticker": ticker,
            "ticker_raw": ticker_raw,
            "name": name,
            "sector": sector,
            "prior_shares": prior_shares,
            "today_shares": today_shares,
            "shares_delta": shares_delta,
            "prior_weight": prior_weight,
            "today_weight": today_weight,
            "weight_delta": round(today_weight - prior_weight, 6),
            "price": price,
            "dollar_flow": round(dollar_flow, 2),
            "flow_type": flow_type,
            "gap_days": gap_days,
        })

    rows.sort(key=lambda r: abs(r["dollar_flow"]), reverse=True)
    return rows


def save_flows(rows: list[dict], date_str: str):
    os.makedirs(FLOWS_DIR, exist_ok=True)
    dest = os.path.join(FLOWS_DIR, f"{date_str}.csv")
    fd, tmp = tempfile.mkstemp(dir=FLOWS_DIR, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=FIELDNAMES, quoting=csv.QUOTE_NONNUMERIC)
            writer.writeheader()
            writer.writerows(rows)
        os.replace(tmp, dest)
    except Exception:
        os.unlink(tmp)
        raise
    return dest


def main():
    ticker_cache = load_cache()
    files = sorted(glob.glob(os.path.join(HOLDINGS_DIR, "*.csv")))

    if len(files) < 2:
        print("Need at least 2 days of holdings to compute flows.")
        return

    for i in range(1, len(files)):
        date_str = os.path.basename(files[i]).replace(".csv", "")
        out = os.path.join(FLOWS_DIR, f"{date_str}.csv")

        if os.path.exists(out):
            continue

        print(f"Computing flows for {date_str}...")
        rows = compute(files[i - 1], files[i], ticker_cache)
        path = save_flows(rows, date_str)
        changes = sum(1 for r in rows if r["flow_type"] != "UNCHANGED")
        print(f"  Saved {len(rows)} rows ({changes} with share changes) -> {path}")


if __name__ == "__main__":
    main()
