"""
Enriches flow files with ADV, overhang, and par-value dislocation metrics.

For each SELL/REMOVED/ADDED flow row, fetches 30-day average daily volume via
yfinance and computes:
  - adv_30d          : 30-day average daily volume (shares)
  - overhang_days    : |shares_delta| / adv_30d  (how many days of volume PFF moved)
  - par_value        : inferred from price ($25 or $1000)
  - price_vs_par_pct : (price/par - 1) * 100  (negative = trading at discount)
  - signal_score     : overhang_days * max(0, -price_vs_par_pct)
                       Higher = larger dislocation = better buy-the-dip opportunity

ADV data is cached in data/adv_cache.json (keyed by ISIN, TTL 7 days).
"""

import csv
import glob
import json
import os
import re
import tempfile
import time
import warnings
from datetime import date, datetime

warnings.filterwarnings("ignore")

import contextlib
import io

import yfinance as yf

FLOWS_DIR = "data/PFF/flows"  # default; overridden in main(etf=...)
CACHE_FILE = "data/adv_cache.json"
ADV_CACHE_TTL_DAYS = 7

FIELDNAMES_BASE = [
    "date", "isin", "cusip", "ticker", "ticker_raw", "name", "sector",
    "prior_shares", "today_shares", "shares_delta",
    "prior_weight", "today_weight", "weight_delta",
    "price", "dollar_flow", "flow_type", "gap_days",
]
FIELDNAMES_ENRICHED = FIELDNAMES_BASE + [
    "yahoo_ticker", "adv_30d", "overhang_days",
    "par_value", "price_vs_par_pct", "signal_score",
]

# Flow types worth enriching (skip UNCHANGED)
ENRICH_TYPES = {"SELL", "REMOVED", "ADDED", "BUY", "SUSPECT"}

_PLAIN_EQUITY_RE = re.compile(r"^[A-Z]{1,4}$")


# ---------- ticker helpers ----------

def yahoo_candidates(ticker: str) -> list[str]:
    """Return candidate Yahoo Finance symbols to try for a given display ticker."""
    if not ticker:
        return []

    # Already an exchange-listed preferred (e.g. AGNCM, HBANZ, FITBM)
    if "-" not in ticker and len(ticker) > 4:
        return [ticker]

    # TICKER-X format (e.g. WFC-L, NLY-F) → try Yahoo's TICKER-PX format first
    m = re.match(r"^([A-Z.]+)-([A-Z0-9]{1,2})$", ticker.upper())
    if m:
        base, series = m.group(1), m.group(2)
        return [
            f"{base}-P{series}",   # Yahoo NYSE preferred format (most common)
            f"{base}P{series}",    # No separator variant
            ticker,                # As-is fallback
        ]

    return [ticker]


# ---------- ADV fetch + cache ----------

def load_adv_cache() -> dict:
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_adv_cache(cache: dict):
    os.makedirs("data", exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir="data", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=2, sort_keys=True)
        os.replace(tmp, CACHE_FILE)
    except Exception:
        os.unlink(tmp)
        raise


def is_stale(entry: dict) -> bool:
    try:
        fetched = date.fromisoformat(entry["fetched_date"])
        return (date.today() - fetched).days > ADV_CACHE_TTL_DAYS
    except Exception:
        return True


def fetch_adv(isin: str, ticker: str, cache: dict) -> dict:
    """Fetch ADV for a ticker, using cache. Returns enriched dict."""
    entry = cache.get(isin)
    if entry and not is_stale(entry):
        return entry

    candidates = yahoo_candidates(ticker)
    for sym in candidates:
        try:
            with contextlib.redirect_stderr(io.StringIO()):
                hist = yf.Ticker(sym).history(period="30d")
            if not hist.empty and len(hist) >= 5:
                adv = float(hist["Volume"].mean())
                if adv > 0:
                    result = {
                        "yahoo_ticker": sym,
                        "adv_30d": round(adv),
                        "fetched_date": date.today().isoformat(),
                    }
                    cache[isin] = result
                    return result
        except Exception:
            continue
        time.sleep(0.2)

    # Nothing found
    result = {"yahoo_ticker": None, "adv_30d": None, "fetched_date": date.today().isoformat()}
    cache[isin] = result
    return result


# ---------- signal metrics ----------

def infer_par(price: float) -> float:
    """Infer par value: $1000 for high-priced capital securities, $25 otherwise."""
    if price > 100:
        return 1000.0
    return 25.0


def signal_metrics(row: dict, adv_entry: dict) -> dict:
    price = float(row.get("price") or 0)
    shares_delta = abs(float(row.get("shares_delta") or 0))
    adv = adv_entry.get("adv_30d")

    par = infer_par(price) if price else 25.0
    price_vs_par_pct = round((price / par - 1) * 100, 2) if price and par else None

    overhang_days = None
    if adv and adv > 0 and shares_delta > 0:
        overhang_days = round(shares_delta / adv, 1)

    # signal_score: rewards large overhang AND trading at a discount to par
    # Only meaningful for SELL/REMOVED (buy-the-dip signal)
    signal_score = None
    if overhang_days is not None and price_vs_par_pct is not None:
        discount = max(0.0, -price_vs_par_pct)  # 0 if at/above par
        signal_score = round(overhang_days * discount, 2)

    return {
        "yahoo_ticker": adv_entry.get("yahoo_ticker") or "",
        "adv_30d": adv_entry.get("adv_30d") or "",
        "overhang_days": overhang_days if overhang_days is not None else "",
        "par_value": par,
        "price_vs_par_pct": price_vs_par_pct if price_vs_par_pct is not None else "",
        "signal_score": signal_score if signal_score is not None else "",
    }


# ---------- main ----------

def enrich_file(flows_path: str, cache: dict) -> int:
    """Enrich one flows CSV in-place. Returns number of rows enriched."""
    rows = []
    with open(flows_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    if not rows:
        return 0

    # Check if already enriched
    if "signal_score" in rows[0]:
        return 0

    enriched = 0
    for row in rows:
        flow_type = row.get("flow_type", "UNCHANGED")
        if flow_type in ENRICH_TYPES:
            isin = row.get("isin", "")
            ticker = row.get("ticker") or row.get("ticker_raw", "")
            adv_entry = fetch_adv(isin, ticker, cache)
            metrics = signal_metrics(row, adv_entry)
            enriched += 1
        else:
            metrics = {k: "" for k in ["yahoo_ticker", "adv_30d", "overhang_days",
                                        "par_value", "price_vs_par_pct", "signal_score"]}
        row.update(metrics)

    flows_dir = os.path.dirname(flows_path)
    fd, tmp = tempfile.mkstemp(dir=flows_dir, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=FIELDNAMES_ENRICHED, quoting=csv.QUOTE_NONNUMERIC)
            writer.writeheader()
            writer.writerows(rows)
        os.replace(tmp, flows_path)
    except Exception:
        os.unlink(tmp)
        raise

    return enriched


def main(etf: str = "PFF"):
    flows_dir = f"data/{etf}/flows"
    cache = load_adv_cache()
    files = sorted(glob.glob(os.path.join(flows_dir, "*.csv")))

    if not files:
        print(f"{etf}: No flow files to enrich.")
        return

    for path in files:
        date_str = os.path.basename(path).replace(".csv", "")
        print(f"{etf}: Enriching {date_str}...")
        n = enrich_file(path, cache)
        save_adv_cache(cache)
        if n:
            print(f"  {n} rows enriched, cache has {len(cache)} ADV entries.")


if __name__ == "__main__":
    import sys
    main(sys.argv[1] if len(sys.argv) > 1 else "PFF")
