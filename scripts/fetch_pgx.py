"""
Fetches PGX (Invesco Preferred ETF) holdings from the Invesco DNG API
and writes data/PGX/holdings/YYYY-MM-DD.csv.

The Invesco website is a JS SPA whose data comes from:
  https://dng-api.invesco.com/cache/v1/accounts/en_US/shareclasses/{cusip}/holdings/fund
    ?idType=cusip&productType=ETF

Invesco blocks Python's ssl fingerprint (returns 406), so we shell out to
curl which uses the system TLS stack and succeeds.

Holdings schema notes:
  - Primary key: CUSIP (no ISIN provided)
  - ticker: base equity ticker (e.g. "JPM"), not preferred-series ticker
  - sector: mapped from securityTypeName ("Preferred Stock", "Corporate Bond", etc.)
  - price: derived as marketValueBase / units
  - effectiveDate: the data as-of date (usually T-1), used as the file date
"""

import csv
import html
import json
import os
import sys
import tempfile
from datetime import datetime, timezone

from curl_cffi import requests as cffi_requests

# PGX share-class CUSIP — used as the API identifier for this fund
FUND_CUSIP = "46138E511"
API_URL = (
    f"https://dng-api.invesco.com/cache/v1/accounts/en_US/shareclasses/"
    f"{FUND_CUSIP}/holdings/fund?idType=cusip&productType=ETF"
)
HOLDINGS_DIR = "data/PGX/holdings"
FIELDNAMES = [
    "date", "isin", "cusip", "ticker_raw", "name", "sector", "asset_class",
    "mkt_val", "weight", "shares", "price", "currency", "exchange", "country",
]

# Skip these uninvestible / internal positions
SKIP_TYPES = {"UCURR", "CASH"}
SKIP_CUSIPS = {"BNYMLEND"}


def fetch_json() -> dict:
    """Fetch holdings JSON, impersonating Chrome to bypass Invesco's TLS fingerprint block."""
    resp = cffi_requests.get(
        API_URL,
        headers={
            "Accept": "application/json",
            "Referer": "https://www.invesco.com/",
            "Origin": "https://www.invesco.com",
        },
        impersonate="chrome",
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def parse(data: dict) -> tuple[str, list[dict]]:
    """Return (date_str, records)."""
    date_str = data.get("effectiveDate") or data.get("effectiveBusinessDate", "")
    records = []

    for h in data.get("holdings", []):
        cusip = h.get("cusip", "")
        if not cusip or cusip in SKIP_CUSIPS:
            continue
        sec_type = h.get("securityTypeCode", "")
        if sec_type in SKIP_TYPES:
            continue

        units = h.get("units") or 0
        mkt_val = h.get("marketValueBase") or 0.0
        weight_pct = h.get("percentageOfTotalNetAssets") or 0.0
        ticker = h.get("ticker") or ""
        name = html.unescape(h.get("issuerName") or "")
        sector = h.get("securityTypeName") or ""
        currency = h.get("currency") or "USD"

        price = round(mkt_val / units, 4) if units > 0 else 0.0

        records.append({
            "date": date_str,
            "isin": "",
            "cusip": cusip,
            "ticker_raw": ticker,
            "name": name,
            "sector": sector,
            "asset_class": sec_type,
            "mkt_val": round(mkt_val, 2) if mkt_val else "",
            "weight": round(weight_pct / 100, 6) if weight_pct else "",
            "shares": units if units else "",
            "price": price if price else "",
            "currency": currency,
            "exchange": "",
            "country": "",
        })

    return date_str, records


def save(rows: list[dict], date_str: str) -> str:
    os.makedirs(HOLDINGS_DIR, exist_ok=True)
    dest = os.path.join(HOLDINGS_DIR, f"{date_str}.csv")
    fd, tmp = tempfile.mkstemp(dir=HOLDINGS_DIR, suffix=".tmp")
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


def main(date_str: str | None = None) -> bool:
    print("Fetching PGX holdings from Invesco API...")
    try:
        data = fetch_json()
    except Exception as e:
        print(f"PGX: Fetch failed — {e}")
        return False

    api_date, rows = parse(data)
    if not rows:
        print("PGX: No holdings returned.")
        return False

    # Use the API's effectiveDate (T-1), ignoring any passed date_str
    # (Invesco always returns the most recent available date)
    file_date = api_date
    dest = os.path.join(HOLDINGS_DIR, f"{file_date}.csv")
    if os.path.exists(dest):
        print(f"PGX: Already have {dest}, skipping.")
        return True

    path = save(rows, file_date)
    print(f"PGX: Saved {len(rows)} holdings for {file_date} -> {path}")
    return True


if __name__ == "__main__":
    ok = main()
    sys.exit(0 if ok else 1)
