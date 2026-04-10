"""
Fetches PFFD (Global X U.S. Preferred ETF) holdings from the Global X asset CDN
and writes data/PFFD/holdings/YYYY-MM-DD.csv.

URL pattern:
  https://assets.globalxetfs.com/funds/holdings/pffd_full-holdings_{YYYYMMDD}.csv

File structure:
  Row 0: "Global X U.S. Preferred ETF"  (fund name — skip)
  Row 1: "Fund Holdings Data as of MM/DD/YYYY"  (as-of date)
  Row 2: % of Net Assets,Ticker,Name,SEDOL,Market Price ($),Shares Held,Market Value ($)
  Row 3+: one holding per row
  Last row: legal disclaimer with no commas — skipped by field-count check

Notes:
  - No CUSIP or ISIN is provided; SEDOL is the only security identifier.
    SEDOL is stored in the 'cusip' field as the primary flow-matching key.
  - Shares Held and Market Value are formatted with commas inside quotes —
    strip commas before parsing.
  - Weight ("% of Net Assets") is a plain float percent ("0.16") —
    stored as decimal (0.0016).
  - Global X publishes T-1; today's URL returns 404 until the next business day.
    The fetcher tries up to 5 trailing calendar days to find the latest file.
"""

import csv
import os
import re
import sys
import tempfile
from datetime import datetime, timedelta, timezone

import requests

BASE_URL = (
    "https://assets.globalxetfs.com/funds/holdings/"
    "pffd_full-holdings_{date}.csv"
)
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
}
HOLDINGS_DIR = "data/PFFD/holdings"
FIELDNAMES = [
    "date", "isin", "cusip", "ticker_raw", "name", "sector", "asset_class",
    "mkt_val", "weight", "shares", "price", "currency", "exchange", "country",
]


def parse_date_from_header(line: str) -> str | None:
    """'Fund Holdings Data as of 04/09/2026' → '2026-04-09'."""
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", line)
    if not m:
        return None
    month, day, year = m.group(1), m.group(2), m.group(3)
    return f"{year}-{int(month):02d}-{int(day):02d}"


def fetch_csv(date_yyyymmdd: str) -> requests.Response | None:
    """Return response for the given date, or None on 404."""
    url = BASE_URL.format(date=date_yyyymmdd)
    resp = requests.get(url, headers=HEADERS, timeout=20)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp


def parse(text: str) -> tuple[str | None, list[dict]]:
    """Return (date_str, records)."""
    lines = text.splitlines()
    if len(lines) < 4:
        return None, []

    date_str = parse_date_from_header(lines[1]) if len(lines) > 1 else None

    records = []
    for line in lines[3:]:
        if not line.strip() or "," not in line:
            continue  # skip empty lines and the footer disclaimer

        row = next(csv.reader([line]))
        if len(row) < 7:
            continue

        weight_raw = row[0].strip()
        ticker = row[1].strip()
        name = row[2].strip()
        sedol = row[3].strip()
        price_raw = row[4].strip()
        shares_raw = row[5].replace(",", "").strip()
        mkt_val_raw = row[6].replace(",", "").strip()

        if not sedol and not ticker:
            continue

        try:
            weight = round(float(weight_raw) / 100, 6) if weight_raw else ""
        except ValueError:
            weight = ""

        try:
            price = round(float(price_raw), 4) if price_raw else ""
        except ValueError:
            price = ""

        try:
            shares = float(shares_raw) if shares_raw else ""
        except ValueError:
            shares = ""

        try:
            mkt_val = round(float(mkt_val_raw), 2) if mkt_val_raw else ""
        except ValueError:
            mkt_val = ""

        records.append({
            "date": date_str or "",
            "isin": "",
            "cusip": sedol,          # SEDOL is stored here as the flow-matching key
            "ticker_raw": ticker,
            "name": name,
            "sector": "",
            "asset_class": "",
            "mkt_val": mkt_val,
            "weight": weight,
            "shares": shares,
            "price": price,
            "currency": "USD",
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
    today = datetime.now(timezone.utc).date()

    if date_str is not None:
        candidates = [date_str.replace("-", "")]
    else:
        # Global X publishes T-1; try today and 4 prior days
        candidates = [
            (today - timedelta(days=i)).strftime("%Y%m%d") for i in range(5)
        ]

    for ds in candidates:
        date_display = f"{ds[:4]}-{ds[4:6]}-{ds[6:]}"
        dest = os.path.join(HOLDINGS_DIR, f"{date_display}.csv")
        if os.path.exists(dest):
            print(f"PFFD: Already have {dest}, skipping.")
            return True

        print(f"Fetching PFFD holdings for {date_display}...")
        try:
            resp = fetch_csv(ds)
        except Exception as e:
            print(f"PFFD: Fetch error for {date_display} — {e}")
            continue

        if resp is None:
            continue  # 404 — try an earlier date

        file_date, rows = parse(resp.text)
        if not rows:
            print(f"PFFD: No holdings parsed for {date_display}.")
            continue

        file_date = file_date or date_display
        dest = os.path.join(HOLDINGS_DIR, f"{file_date}.csv")
        if os.path.exists(dest):
            print(f"PFFD: Already have {dest}, skipping.")
            return True

        path = save(rows, file_date)
        print(f"PFFD: Saved {len(rows)} holdings for {file_date} -> {path}")
        return True

    print("PFFD: No new data found.")
    return False


if __name__ == "__main__":
    date_arg = sys.argv[1] if len(sys.argv) > 1 else None
    ok = main(date_arg)
    sys.exit(0 if ok else 1)
