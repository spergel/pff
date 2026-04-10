"""
Fetches PFFA (Virtus InfraCap U.S. Preferred Stock ETF) holdings from the
Virtus positions Excel file and writes data/PFFA/holdings/YYYY-MM-DD.csv.

Source URL: https://www.virtus.com/assets/files/1xx/positions_pffa.xls

File structure (OLE2 .xls):
  Row 0: "Positions as of M/D/YYYY"
  Row 1: Partial header (Accrued Int / Market Value / Cost sub-labels)
  Row 2: Column headers:
    Account Name | Security Id | Name | Ticker | Security Type |
    Quantity | Price | Accrued Int (Local) | Accrued Int (Base) |
    Market Value (Local) | Market Value (Base) | Cost (Base) |
    Unrealized G/L | Weight
  Row 3+: One holding per row

Notes:
  - No CUSIP or ISIN provided; uses Virtus internal Security Id (e.g. PFEP0604199)
    stored in the 'cusip' field as the primary flow-matching key.
  - PFFA is leveraged; the Cash row carries a large negative weight — skip it.
  - Weight is stored as a percent string ("2.64%"); stored as decimal (0.0264).
  - Security types: mostly "Preferred Stock"; also small Corporate Bond / Foreign
    Stock / Common Stock positions and one Cash row.
  - Date is parsed from the "Positions as of M/D/YYYY" header in row 0.
"""

import csv
import os
import re
import sys
import tempfile
from datetime import datetime, timezone

import requests
import xlrd

URL = "https://www.virtus.com/assets/files/1xx/positions_pffa.xls"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": "https://www.virtus.com/",
    "Accept": "application/vnd.ms-excel,*/*",
}
HOLDINGS_DIR = "data/PFFA/holdings"
FIELDNAMES = [
    "date", "isin", "cusip", "ticker_raw", "name", "sector", "asset_class",
    "mkt_val", "weight", "shares", "price", "currency", "exchange", "country",
]

# Skip these rows — leveraged-fund cash line and empty rows
SKIP_ASSET_CLASSES = {"Cash"}


def parse_date(cell_value: str) -> str:
    """Parse 'Positions as of M/D/YYYY' → 'YYYY-MM-DD'."""
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", cell_value)
    if not m:
        raise ValueError(f"Cannot parse date from: {cell_value!r}")
    month, day, year = m.group(1), m.group(2), m.group(3)
    return f"{year}-{int(month):02d}-{int(day):02d}"


def parse_weight(raw) -> float | str:
    """'2.64%' → 0.0264; empty → ''."""
    s = str(raw).strip()
    if not s or s in ("0.00%", "0.0"):
        return ""
    s = s.rstrip("%")
    try:
        return round(float(s) / 100, 6)
    except ValueError:
        return ""


def fetch_workbook() -> xlrd.Book:
    resp = requests.get(URL, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return xlrd.open_workbook(file_contents=resp.content)


def parse(wb: xlrd.Book, today: str) -> tuple[str, list[dict]]:
    """Return (date_str, records)."""
    sheet = wb.sheets()[0]

    # Row 0: "Positions as of M/D/YYYY"
    date_cell = str(sheet.cell(0, 0).value).strip()
    try:
        date_str = parse_date(date_cell)
    except ValueError:
        print(f"PFFA: could not parse date from {date_cell!r}, falling back to today ({today})")
        date_str = today

    records = []
    # Data starts at row 3 (rows 0-2 are headers)
    for r in range(3, sheet.nrows):
        security_id = str(sheet.cell(r, 1).value).strip()
        name = str(sheet.cell(r, 2).value).strip()
        ticker = str(sheet.cell(r, 3).value).strip()
        asset_class = str(sheet.cell(r, 4).value).strip()

        # Skip empty rows
        if not security_id or not name:
            continue
        # Skip cash (leveraged fund balance) and uninvestible rows
        if asset_class in SKIP_ASSET_CLASSES:
            continue

        try:
            shares = float(sheet.cell(r, 5).value or 0)
        except (ValueError, TypeError):
            shares = 0.0

        try:
            price = float(sheet.cell(r, 6).value or 0)
        except (ValueError, TypeError):
            price = 0.0

        try:
            mkt_val = float(sheet.cell(r, 10).value or 0)  # Market Value (Base)
        except (ValueError, TypeError):
            mkt_val = 0.0

        weight = parse_weight(sheet.cell(r, 13).value)

        records.append({
            "date": date_str,
            "isin": "",
            "cusip": security_id,   # Virtus internal ID — stable across days
            "ticker_raw": ticker,
            "name": name,
            "sector": asset_class,  # No sector data; use asset class as proxy
            "asset_class": asset_class,
            "mkt_val": round(mkt_val, 2) if mkt_val else "",
            "weight": weight,
            "shares": shares if shares else "",
            "price": round(price, 4) if price else "",
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
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    print("Fetching PFFA holdings from Virtus...")
    try:
        wb = fetch_workbook()
    except Exception as e:
        print(f"PFFA: Fetch failed — {e}")
        return False

    file_date, rows = parse(wb, today)

    if not rows:
        print("PFFA: No holdings returned.")
        return False

    dest = os.path.join(HOLDINGS_DIR, f"{file_date}.csv")
    if os.path.exists(dest):
        print(f"PFFA: Already have {dest}, skipping.")
        return True

    path = save(rows, file_date)
    print(f"PFFA: Saved {len(rows)} holdings for {file_date} -> {path}")
    return True


if __name__ == "__main__":
    date_arg = sys.argv[1] if len(sys.argv) > 1 else None
    ok = main(date_arg)
    sys.exit(0 if ok else 1)
