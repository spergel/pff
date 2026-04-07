"""
Diffs consecutive holdings files to compute daily ETF flows per symbol.
Writes data/{ETF}/flows/YYYY-MM-DD.csv for each new day.

Flow types:
  ADDED    — symbol entered the fund (prior_shares == 0)
  REMOVED  — symbol exited the fund (today_shares == 0)
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

CACHE_FILE = "data/ticker_cache.json"
SUSPECT_THRESHOLD = 0.50

FIELDNAMES = [
    "date", "isin", "cusip", "ticker", "ticker_raw", "name", "sector",
    "prior_shares", "today_shares", "shares_delta",
    "prior_weight", "today_weight", "weight_delta",
    "price", "dollar_flow", "flow_type", "gap_days",
]


def load_cache() -> dict:
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def load_holdings(path: str, key_field: str = "isin") -> dict[str, dict]:
    """
    Load a holdings CSV keyed by key_field (isin or cusip).
    Falls back to the other field if the primary is blank.
    """
    holdings = {}
    with open(path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            key = row.get(key_field, "").strip()
            if not key:
                # fallback: try the other identifier
                alt = "cusip" if key_field == "isin" else "isin"
                key = row.get(alt, "").strip()
            if not key:
                continue
            try:
                shares = float(row["shares"]) if row.get("shares") not in ("", "-") else 0.0
            except (ValueError, KeyError):
                shares = 0.0
            try:
                weight = float(row["weight"]) if row.get("weight") not in ("", "-") else 0.0
            except (ValueError, KeyError):
                weight = 0.0
            try:
                price = float(row["price"]) if row.get("price") not in ("", "-") else 0.0
            except (ValueError, KeyError):
                price = 0.0
            holdings[key] = {
                "isin": row.get("isin", ""),
                "cusip": row.get("cusip", ""),
                "ticker_raw": row.get("ticker_raw", ""),
                "name": row.get("name", ""),
                "sector": row.get("sector", ""),
                "shares": shares,
                "weight": weight,
                "price": price,
            }
    return holdings


def classify(prior_shares, today_shares, prior_weight, today_weight) -> str:
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


def compute(prev_path: str, curr_path: str, ticker_cache: dict, key_field: str) -> list[dict]:
    prev = load_holdings(prev_path, key_field)
    curr = load_holdings(curr_path, key_field)

    curr_date_str = os.path.basename(curr_path).replace(".csv", "")
    prev_date_str = os.path.basename(prev_path).replace(".csv", "")
    gap_days = (date.fromisoformat(curr_date_str) - date.fromisoformat(prev_date_str)).days

    rows = []
    for symbol in set(prev) | set(curr):
        p = prev.get(symbol)
        c = curr.get(symbol)

        today_shares = c["shares"] if c else 0.0
        prior_shares = p["shares"] if p else 0.0
        today_weight = c["weight"] if c else 0.0
        prior_weight = p["weight"] if p else 0.0
        price = (c or p)["price"]
        ticker_raw = (c or p)["ticker_raw"]
        name = (c or p)["name"]
        sector = (c or p)["sector"]
        isin_val = (c or p)["isin"]
        cusip_val = (c or p)["cusip"]

        # Try to resolve a display ticker from cache (keyed by isin when available)
        cache_key = isin_val or symbol
        cache_entry = ticker_cache.get(cache_key, {})
        ticker = cache_entry.get("ticker") or ticker_raw

        # Cash and derivatives positions are fund plumbing, not rebalancing signals.
        # Negative share counts (e.g. USD CASH receivables) also produce nonsense dollar flows.
        if sector == "Cash and/or Derivatives":
            flow_type = "UNCHANGED"
        else:
            flow_type = classify(prior_shares, today_shares, prior_weight, today_weight)
        shares_delta = today_shares - prior_shares
        dollar_flow = shares_delta * price

        rows.append({
            "date": curr_date_str,
            "isin": isin_val or symbol,
            "cusip": cusip_val or (symbol if key_field == "cusip" else ""),
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


def save_flows(rows: list[dict], date_str: str, flows_dir: str) -> str:
    os.makedirs(flows_dir, exist_ok=True)
    dest = os.path.join(flows_dir, f"{date_str}.csv")
    fd, tmp = tempfile.mkstemp(dir=flows_dir, suffix=".tmp")
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


def main(etf: str = "PFF", key_field: str = "isin"):
    holdings_dir = f"data/{etf}/holdings"
    flows_dir = f"data/{etf}/flows"

    ticker_cache = load_cache()
    files = sorted(glob.glob(os.path.join(holdings_dir, "*.csv")))

    if len(files) < 2:
        print(f"{etf}: Need at least 2 days of holdings to compute flows.")
        return

    for i in range(1, len(files)):
        date_str = os.path.basename(files[i]).replace(".csv", "")
        out = os.path.join(flows_dir, f"{date_str}.csv")
        if os.path.exists(out):
            continue
        print(f"{etf}: Computing flows for {date_str}...")
        rows = compute(files[i - 1], files[i], ticker_cache, key_field)
        path = save_flows(rows, date_str, flows_dir)
        changes = sum(1 for r in rows if r["flow_type"] != "UNCHANGED")
        print(f"  Saved {len(rows)} rows ({changes} with share changes) -> {path}")


if __name__ == "__main__":
    import sys
    etf_arg = sys.argv[1] if len(sys.argv) > 1 else "PFF"
    from etf_config import ETFS
    cfg = ETFS.get(etf_arg, {})
    main(etf_arg, cfg.get("key_field", "isin"))
