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

DAILY_OUT = "data/daily_summary.json"
TICKER_OUT = "data/ticker_summary.json"
OVERLAP_OUT = "data/overlap_summary.json"

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


def build(flow_files: list[str], etf: str = "PFF") -> tuple[list[dict], dict]:
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

                cusip_val = row.get("cusip", "")
                t["history"].append({
                    "date": date_str,
                    "flow_type": ft,
                    "dollar_flow": round(df, 2),
                    "shares_delta": round(shares_delta, 0),
                    "today_shares": round(today_shares, 0) if today_shares is not None else None,
                    "signal_score": round(signal, 2) if signal is not None else None,
                })
                # Update cusip if we now have it (new flow files include it)
                if cusip_val and not t.get("cusip"):
                    t["cusip"] = cusip_val
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


def load_industry_cache() -> dict:
    path = "data/industry_cache.json"
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return {}


def main():
    from etf_config import ETFS
    import datetime

    today = datetime.date.today().isoformat()
    ind_cache = load_industry_cache()

    # Collect daily rows and ticker maps across all ETFs
    all_daily: dict[str, dict] = {}  # date -> merged day dict
    all_tickers: dict[str, dict] = {}  # symbol -> ticker aggregate

    for etf in ETFS:
        flows_dir = f"data/{etf}/flows"
        files = sorted(glob.glob(os.path.join(flows_dir, "*.csv")))
        if not files:
            print(f"{etf}: No flow files found, skipping.")
            continue

        print(f"{etf}: Building history from {len(files)} flow files...")
        daily_rows, ticker_map = build(files, etf)

        for day in daily_rows:
            date_key = day["date"]
            if date_key not in all_daily:
                all_daily[date_key] = {
                    "date": date_key,
                    "etfs": {},
                }
            all_daily[date_key]["etfs"][etf] = {
                k: v for k, v in day.items() if k != "date"
            }

        for symbol, t in ticker_map.items():
            # Namespace by ETF to avoid CUSIP/ISIN collisions across ETFs
            key = f"{etf}:{symbol}"
            t["etf"] = etf
            # Merge industry classification from industry_cache (keyed by ISIN or CUSIP)
            ind = ind_cache.get(symbol, {})
            t["sector_yf"]   = ind.get("sector", "")
            t["industry_yf"] = ind.get("industry", "")
            all_tickers[key] = t

        active = sum(1 for t in ticker_map.values() if t["buy_days"] + t["sell_days"] > 0)
        print(f"  {len(ticker_map)} symbols, {active} ever active")

    # Sort daily rows by date
    daily_list = sorted(all_daily.values(), key=lambda d: d["date"])

    daily_out = {"generated_at": today, "days": daily_list}
    save_json(daily_out, DAILY_OUT)
    print(f"Wrote {DAILY_OUT} ({len(daily_list)} days across {len(ETFS)} ETFs)")

    ticker_out = {"generated_at": today, "tickers": all_tickers}
    save_json(ticker_out, TICKER_OUT)
    print(f"Wrote {TICKER_OUT} ({len(all_tickers)} symbols)")

    # Build overlap_summary: cross-ETF view keyed by CUSIP
    _build_overlap(all_tickers, today)


def _build_overlap(all_tickers: dict, today: str):
    """
    Groups ticker_map entries by CUSIP across ETFs.
    For PFF entries (keyed by ISIN), derives CUSIP from the most recent PFF holdings file.
    """
    # Build ISIN→CUSIP map from most recent PFF holdings
    isin_to_cusip: dict[str, str] = {}
    pff_holdings_files = sorted(glob.glob("data/PFF/holdings/*.csv"))
    if pff_holdings_files:
        with open(pff_holdings_files[-1], encoding="utf-8") as f:
            for row in csv.DictReader(f):
                isin = row.get("isin", "").strip()
                cusip = row.get("cusip", "").strip()
                if isin and cusip:
                    isin_to_cusip[isin] = cusip

    by_cusip: dict[str, dict] = {}

    for key, t in all_tickers.items():
        etf, symbol = key.split(":", 1)

        if etf == "PFF":
            # Symbol is an ISIN; look up CUSIP
            cusip = t.get("cusip") or isin_to_cusip.get(symbol, "")
            if not cusip:
                continue  # can't match without CUSIP
        else:
            # Symbol is already a CUSIP
            cusip = symbol

        if cusip not in by_cusip:
            by_cusip[cusip] = {
                "cusip": cusip,
                "name": t["name"],
                "etfs": {},
            }
        # Use the most populated name
        if t["name"] and len(t["name"]) > len(by_cusip[cusip]["name"]):
            by_cusip[cusip]["name"] = t["name"]

        # Store per-ETF stats — keep last 30 history entries to limit size
        by_cusip[cusip]["etfs"][etf] = {
            "isin": t.get("isin", symbol if etf == "PFF" else ""),
            "ticker": t.get("ticker", ""),
            "sector": t.get("sector", ""),
            "buy_days": t["buy_days"],
            "sell_days": t["sell_days"],
            "added_days": t["added_days"],
            "removed_days": t["removed_days"],
            "current_streak": t["current_streak"],
            "net_dollar_flow": round(t["net_dollar_flow"], 2),
            "last_flow_type": t["last_flow_type"],
            "last_date": t["last_date"],
            "history": t["history"][-30:],  # last 30 active days
        }

    # Annotate with derived fields
    for entry in by_cusip.values():
        entry["num_etfs"] = len(entry["etfs"])
        entry["combined_net_flow"] = round(
            sum(e["net_dollar_flow"] for e in entry["etfs"].values()), 2
        )

    overlap_out = {
        "generated_at": today,
        "isin_to_cusip": isin_to_cusip,
        "by_cusip": by_cusip,
    }
    save_json(overlap_out, OVERLAP_OUT)
    multi = sum(1 for e in by_cusip.values() if e["num_etfs"] >= 2)
    print(f"Wrote {OVERLAP_OUT} ({len(by_cusip)} CUSIPs, {multi} in 2+ ETFs)")


if __name__ == "__main__":
    main()
