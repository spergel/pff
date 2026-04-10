"""
Fetches sector and industry classification for every resolved ticker in the
ADV cache and writes data/industry_cache.json.

Keyed by the same identifier used in adv_cache.json (ISIN for PFF/PFXF,
CUSIP/SEDOL for others).  Each entry:
  {
    "yahoo_ticker": "WFC-PL",
    "sector":       "Financial Services",
    "industry":     "Banks—Diversified",
    "fetched_date": "2026-04-10"
  }

TTL is 30 days — sector/industry classifications rarely change.
Run via run_pipeline.py or standalone:
  python scripts/fetch_industries.py
"""

import json
import os
import sys
import tempfile
import time
import warnings
import contextlib
import io
from datetime import date

warnings.filterwarnings("ignore")
import yfinance as yf

ADV_CACHE  = "data/adv_cache.json"
IND_CACHE  = "data/industry_cache.json"
TTL_DAYS   = 30


def load_json(path: str) -> dict:
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_json(obj: dict, path: str):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path) or ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, indent=2, sort_keys=True)
        os.replace(tmp, path)
    except Exception:
        os.unlink(tmp)
        raise


def is_stale(entry: dict) -> bool:
    try:
        fetched = date.fromisoformat(entry["fetched_date"])
        return (date.today() - fetched).days > TTL_DAYS
    except Exception:
        return True


def fetch_info(yahoo_ticker: str) -> tuple[str, str]:
    """Return (sector, industry) for a Yahoo Finance ticker, or ('', '') on failure."""
    try:
        with contextlib.redirect_stderr(io.StringIO()):
            info = yf.Ticker(yahoo_ticker).info
        sector   = info.get("sector")   or ""
        industry = info.get("industry") or ""
        return sector, industry
    except Exception:
        return "", ""


def main():
    adv_cache = load_json(ADV_CACHE)
    ind_cache = load_json(IND_CACHE)

    if not adv_cache:
        print("fetch_industries: adv_cache.json is empty — run the pipeline first.")
        return

    today = date.today().isoformat()
    fetched = skipped = failed = 0

    # Deduplicate by yahoo_ticker so we only hit Yahoo once per symbol
    # Build: yahoo_ticker → list of cache keys (ISINs/CUSIPs) that share it
    by_yahoo: dict[str, list[str]] = {}
    for key, entry in adv_cache.items():
        yt = entry.get("yahoo_ticker")
        if not yt:
            continue
        by_yahoo.setdefault(yt, []).append(key)

    total = len(by_yahoo)
    print(f"fetch_industries: {total} unique Yahoo tickers to classify.")

    for i, (yahoo_ticker, keys) in enumerate(sorted(by_yahoo.items()), 1):
        # Check if any key in the cache is still fresh
        representative_key = keys[0]
        existing = ind_cache.get(representative_key, {})

        if existing and not is_stale(existing):
            skipped += 1
            continue

        sector, industry = fetch_info(yahoo_ticker)

        entry = {
            "yahoo_ticker": yahoo_ticker,
            "sector":       sector,
            "industry":     industry,
            "fetched_date": today,
        }

        for key in keys:
            ind_cache[key] = entry

        if sector or industry:
            fetched += 1
        else:
            failed += 1

        if i % 50 == 0 or i == total:
            save_json(ind_cache, IND_CACHE)
            print(f"  [{i}/{total}] fetched={fetched} skipped={skipped} no-data={failed}")

        time.sleep(0.3)  # polite to Yahoo

    save_json(ind_cache, IND_CACHE)
    print(
        f"fetch_industries: done. "
        f"fetched={fetched}  skipped={skipped}  no-data={failed}  "
        f"total_cached={len(ind_cache)}"
    )


if __name__ == "__main__":
    main()
