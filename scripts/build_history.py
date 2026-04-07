"""
Aggregates all flow CSVs into two summary files for fast UI consumption.

Outputs:
  data/daily_summary.json  — one entry per trading day with aggregate stats
                              and sector-level net dollar flows
  data/ticker_summary.json — per-ISIN aggregate stats (buy_days, sell_days,
                              current streak, net flow) plus a compact
                              non-UNCHANGED activity history for charts
"""

import csv
import glob
import json
import os
import tempfile
from collections import defaultdict

FLOWS_DIR = "data/flows"
DAILY_OUT = "data/daily_summary.json"
TICKER_OUT = "data/ticker_summary.json"

ACTIVE_TYPES = {"BUY", "SELL", "ADDED", "REMOVED", "SUSPECT"}


def load_flow_file(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _num(v) -> float | None:
    if v is None or v == "" or v == "-":
        return None
    try:
        return float(v)
    except ValueError:
        return None


def build(flow_files: list[str]) -> tuple[list[dict], dict]:
    """
    Returns (daily_rows, ticker_map).

    daily_rows: sorted list of per-day aggregate dicts
    ticker_map: dict keyed by ISIN with aggregate + history
    """
    daily_rows = []

    # ticker_map[isin] = {meta, counters, history: [...]}
    ticker_map: dict[str, dict] = {}

    for path in sorted(flow_files):
        date_str = os.path.basename(path).replace(".csv", "")
        rows = load_flow_file(path)

        # --- daily aggregates ---
        day = {
            "date": date_str,
            "buys": 0,
            "sells": 0,
            "added": 0,
            "removed": 0,
            "suspect": 0,
            "total_buy_dollars": 0.0,
            "total_sell_dollars": 0.0,
            "num_changes": 0,
            "sector_net": defaultdict(float),
        }

        for row in rows:
            ft = row.get("flow_type", "UNCHANGED")
            df = _num(row.get("dollar_flow")) or 0.0
            sector = row.get("sector") or "Unknown"

            if ft == "BUY":
                day["buys"] += 1
                day["total_buy_dollars"] += df
                day["sector_net"][sector] += df
            elif ft == "SELL":
                day["sells"] += 1
                day["total_sell_dollars"] += abs(df)
                day["sector_net"][sector] += df  # negative
            elif ft == "ADDED":
                day["added"] += 1
                day["total_buy_dollars"] += df
                day["sector_net"][sector] += df
            elif ft == "REMOVED":
                day["removed"] += 1
                day["total_sell_dollars"] += abs(df)
                day["sector_net"][sector] += df
            elif ft == "SUSPECT":
                day["suspect"] += 1

            if ft != "UNCHANGED":
                day["num_changes"] += 1

            # --- per-ticker accumulation ---
            isin = row.get("isin", "")
            if not isin:
                continue

            ticker = row.get("ticker") or row.get("ticker_raw") or ""
            name = row.get("name") or ""
            row_sector = row.get("sector") or ""

            if isin not in ticker_map:
                ticker_map[isin] = {
                    "isin": isin,
                    "ticker": ticker,
                    "name": name,
                    "sector": row_sector,
                    "buy_days": 0,
                    "sell_days": 0,
                    "added_days": 0,
                    "removed_days": 0,
                    "suspect_days": 0,
                    "total_buy_dollars": 0.0,
                    "total_sell_dollars": 0.0,
                    "net_dollar_flow": 0.0,
                    "net_shares_delta": 0.0,
                    # running streak: positive = buy streak, negative = sell streak
                    "_streak": 0,
                    "current_streak": 0,
                    "last_flow_type": "UNCHANGED",
                    "last_date": date_str,
                    "history": [],  # non-UNCHANGED days only
                }

            t = ticker_map[isin]
            t["last_date"] = date_str

            if ft in ACTIVE_TYPES:
                shares_delta = _num(row.get("shares_delta")) or 0.0
                signal = _num(row.get("signal_score"))
                today_shares = _num(row.get("today_shares"))

                t["last_flow_type"] = ft
                t["net_dollar_flow"] += df
                t["net_shares_delta"] += shares_delta

                if ft == "BUY":
                    t["buy_days"] += 1
                    t["total_buy_dollars"] += df
                    t["_streak"] = max(0, t["_streak"]) + 1
                elif ft == "ADDED":
                    t["added_days"] += 1
                    t["total_buy_dollars"] += df
                    t["_streak"] = max(0, t["_streak"]) + 1
                elif ft == "SELL":
                    t["sell_days"] += 1
                    t["total_sell_dollars"] += abs(df)
                    t["_streak"] = min(0, t["_streak"]) - 1
                elif ft == "REMOVED":
                    t["removed_days"] += 1
                    t["total_sell_dollars"] += abs(df)
                    t["_streak"] = min(0, t["_streak"]) - 1
                elif ft == "SUSPECT":
                    t["suspect_days"] += 1
                    t["_streak"] = 0

                t["current_streak"] = t["_streak"]

                t["history"].append({
                    "date": date_str,
                    "flow_type": ft,
                    "dollar_flow": round(df, 2),
                    "shares_delta": round(shares_delta, 0),
                    "today_shares": round(today_shares, 0) if today_shares is not None else None,
                    "signal_score": round(signal, 2) if signal is not None else None,
                })
            else:
                # UNCHANGED resets the streak
                t["_streak"] = 0
                t["last_flow_type"] = "UNCHANGED"

        day["sector_net"] = dict(day["sector_net"])
        daily_rows.append(day)

    # clean up internal state before serialising
    for t in ticker_map.values():
        del t["_streak"]

    return daily_rows, ticker_map


def save_json(obj, path: str):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path) or ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, separators=(",", ":"))
        os.replace(tmp, path)
    except Exception:
        os.unlink(tmp)
        raise


def main():
    files = sorted(glob.glob(os.path.join(FLOWS_DIR, "*.csv")))
    if not files:
        print("No flow files found.")
        return

    print(f"Building history from {len(files)} flow files...")
    daily_rows, ticker_map = build(files)

    daily_out = {
        "generated_at": os.popen("date -u +%Y-%m-%d").read().strip(),
        "days": daily_rows,
    }
    save_json(daily_out, DAILY_OUT)
    print(f"  Wrote {DAILY_OUT} ({len(daily_rows)} days)")

    ticker_out = {
        "generated_at": daily_out["generated_at"],
        "tickers": ticker_map,
    }
    save_json(ticker_out, TICKER_OUT)

    active = sum(1 for t in ticker_map.values() if t["buy_days"] + t["sell_days"] > 0)
    print(f"  Wrote {TICKER_OUT} ({len(ticker_map)} ISINs, {active} ever active)")


if __name__ == "__main__":
    main()
