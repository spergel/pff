"""
Fetches PFXF (VanEck Preferred Securities ex Financials ETF) holdings from the
VanEck FundDatasetBlock JSON API and writes data/PFXF/holdings/YYYY-MM-DD.csv.

Source URL:
  https://www.vaneck.com/Main/FundDatasetBlock/Get/?blockId=351363&pageId=233131&ticker=PFXF

Response structure:
  {
    "HoldingsList": [
      {
        "AsOfDate": "2026-04-09T00:00:00",
        "Holdings": [
          {
            "Label":        "097023204",     <- CUSIP (used when CUSIP field is blank)
            "HoldingName":  "Boeing Co/The",
            "HoldingTicker": "",             <- often blank; use as ticker_raw
            "Weight":       "10.04",         <- percent string; stored as decimal
            "Shares":       "3,084,609",     <- comma-formatted
            "MV":           "215860937.82",
            "ISIN":         "US0970232049",  <- primary key
            "CUSIP":        "",              <- sometimes blank; Label has it
            "AssetClass":   "Stock",
            "CurrencyCode": "USD",
            "Country":      "United States",
            ...
          }
        ]
      }
    ]
  }

Notes:
  - ISIN is the primary flow-matching key; rows without an ISIN (cash/totals) are skipped.
  - CUSIP comes from the 'CUSIP' field if set, otherwise from 'Label'.
  - Weight is a percent string ("10.04") stored as decimal (0.1004).
  - Shares has commas — strip before parsing.
  - Price is derived as MV / Shares.
  - Cash rows have AssetClass "Cash Bal" or "Cash" — skipped.
"""

import csv
import os
import sys
import tempfile
from datetime import datetime, timezone

import requests

URL = (
    "https://www.vaneck.com/Main/FundDatasetBlock/Get/"
    "?blockId=351363&pageId=233131&ticker=PFXF"
)
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": (
        "https://www.vaneck.com/us/en/investments/"
        "preferred-securities-ex-financials-etf-pfxf/"
    ),
    "Accept": "application/json",
    "X-Requested-With": "XMLHttpRequest",
}
HOLDINGS_DIR = "data/PFXF/holdings"
FIELDNAMES = [
    "date", "isin", "cusip", "ticker_raw", "name", "sector", "asset_class",
    "mkt_val", "weight", "shares", "price", "currency", "exchange", "country",
]

SKIP_ASSET_CLASSES = {"Cash Bal", "Cash"}


def parse(data: dict) -> tuple[str | None, list[dict]]:
    """Return (date_str, records)."""
    holdings_list = data.get("HoldingsList", [])
    if not holdings_list:
        return None, []

    bucket = holdings_list[0]
    raw_date = bucket.get("AsOfDate", "")
    date_str = raw_date[:10] if raw_date else None  # "2026-04-09T00:00:00" → "2026-04-09"

    records = []
    for h in bucket.get("Holdings", []):
        isin = (h.get("ISIN") or "").strip()
        asset_class = (h.get("AssetClass") or "").strip()

        if not isin or asset_class in SKIP_ASSET_CLASSES:
            continue

        # CUSIP field is sometimes blank; fall back to Label (which has the CUSIP)
        cusip = (h.get("CUSIP") or h.get("Label") or "").strip()
        ticker = (h.get("HoldingTicker") or "").strip()
        name = (h.get("HoldingName") or "").strip()
        currency = (h.get("CurrencyCode") or "USD").strip()
        country = (h.get("Country") or "").strip()

        weight_raw = (h.get("Weight") or "").strip()
        shares_raw = (h.get("Shares") or "").replace(",", "").strip()
        mkt_val_raw = (h.get("MV") or "").strip()

        try:
            weight = round(float(weight_raw) / 100, 6) if weight_raw else ""
        except ValueError:
            weight = ""

        try:
            shares = float(shares_raw) if shares_raw else ""
        except ValueError:
            shares = ""

        try:
            mkt_val = round(float(mkt_val_raw), 2) if mkt_val_raw else ""
        except ValueError:
            mkt_val = ""

        price = ""
        if isinstance(shares, float) and shares > 0 and isinstance(mkt_val, float) and mkt_val:
            price = round(mkt_val / shares, 4)

        records.append({
            "date": date_str or "",
            "isin": isin,
            "cusip": cusip,
            "ticker_raw": ticker,
            "name": name,
            "sector": "",
            "asset_class": asset_class,
            "mkt_val": mkt_val,
            "weight": weight,
            "shares": shares,
            "price": price,
            "currency": currency,
            "exchange": "",
            "country": country,
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
    print("Fetching PFXF holdings from VanEck API...")
    try:
        resp = requests.get(URL, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"PFXF: Fetch failed — {e}")
        return False

    file_date, rows = parse(data)
    if not rows:
        print("PFXF: No holdings returned.")
        return False

    if not file_date:
        file_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        print(f"PFXF: No date in response, using today ({file_date}).")

    dest = os.path.join(HOLDINGS_DIR, f"{file_date}.csv")
    if os.path.exists(dest):
        print(f"PFXF: Already have {dest}, skipping.")
        return True

    path = save(rows, file_date)
    print(f"PFXF: Saved {len(rows)} holdings for {file_date} -> {path}")
    return True


if __name__ == "__main__":
    date_arg = sys.argv[1] if len(sys.argv) > 1 else None
    ok = main(date_arg)
    sys.exit(0 if ok else 1)
