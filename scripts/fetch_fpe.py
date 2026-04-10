"""
Fetches FPE (First Trust Preferred Securities and Income ETF) holdings.

Tries two sources in order:
  1. JSON API endpoint (fast, reliable when available)
  2. HTML scraping of the holdings page (fallback)

Writes data/FPE/holdings/YYYY-MM-DD.csv.
"""

import csv
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

HTML_URL = "https://www.ftportfolios.com/Retail/Etf/EtfHoldings.aspx?Ticker=FPE"
JSON_URL = "https://www.ftportfolios.com/Retail/Etf/EtfHoldings.aspx?Ticker=FPE&IsStale=false"
EXCEL_URL = "https://www.ftportfolios.com/Common/CreativeServices/Handlers/FundHoldingsHandler.ashx?Ticker=FPE&Type=Excel"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}
HOLDINGS_DIR = "data/FPE/holdings"
FIELDNAMES = [
    "date", "isin", "cusip", "ticker_raw", "name", "sector", "asset_class",
    "mkt_val", "weight", "shares", "price", "currency", "exchange", "country",
]

# Standard CUSIP: 9 alphanumeric chars (occasionally 6-8 for non-US securities)
CUSIP_RE = re.compile(r'^[A-Z0-9]{6,9}$')

CASH_NAMES = {"USD CASH", "U.S. DOLLAR", "US DOLLAR"}
CASH_IDENTIFIERS = {"$USD", "USD"}


def clean_number(s: str) -> str:
    return re.sub(r"[$,%]", "", s).strip()


def is_valid_cusip(s: str) -> bool:
    return bool(CUSIP_RE.match(s.strip().upper()))


def is_cash_row(name: str, identifier: str) -> bool:
    return (
        name.upper().strip() in CASH_NAMES
        or identifier.strip() in CASH_IDENTIFIERS
        or name.lower().startswith("us dollar")
        or name.lower().startswith("usd cash")
    )


def make_record(date_str, name, identifier, cusip, shares_raw, mkt_val_raw, weight_raw) -> dict | None:
    """Parse and validate a single row. Returns None if row should be skipped."""
    cusip = cusip.strip()
    name = name.strip()
    identifier = identifier.strip()

    if not is_valid_cusip(cusip):
        return None
    if is_cash_row(name, identifier):
        return None
    if not name or len(name) > 400:
        return None

    try:
        shares = float(clean_number(shares_raw)) if shares_raw.strip() else 0.0
    except ValueError:
        shares = 0.0
    try:
        mkt_val = float(clean_number(mkt_val_raw)) if mkt_val_raw.strip() else 0.0
    except ValueError:
        mkt_val = 0.0
    try:
        weight = float(clean_number(weight_raw)) if weight_raw.strip() else 0.0
    except ValueError:
        weight = 0.0

    price = round(mkt_val / shares, 4) if shares > 0 else 0.0

    return {
        "date": date_str,
        "isin": "",
        "cusip": cusip,
        "ticker_raw": identifier,
        "name": name,
        "sector": "",
        "asset_class": "",
        "mkt_val": round(mkt_val, 2) if mkt_val else "",
        "weight": round(weight / 100, 6) if weight else "",
        "shares": shares if shares else "",
        "price": price if price else "",
        "currency": "USD",
        "exchange": "",
        "country": "",
    }


def find_holdings_table(soup: BeautifulSoup):
    """Find the holdings table by looking for the exact Security Name/CUSIP header row."""
    for table in soup.find_all("table"):
        direct_rows = table.find_all("tr", recursive=False)
        if not direct_rows:
            continue
        cells = [
            td.get_text(strip=True)
            for td in direct_rows[0].find_all(["th", "td"], recursive=False)
        ]
        # Require exact cell matches, not substring — prevents matching giant blob rows
        if cells == ["Security Name", "Identifier", "CUSIP", "Shares / Quantity", "Market Value", "Weighting"]:
            return table
        if "Security Name" in cells and "CUSIP" in cells and len(cells) <= 8:
            return table
    return None


def fetch_html(date_str: str) -> list[dict]:
    resp = requests.get(HTML_URL, headers=HEADERS, timeout=30)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    table = find_holdings_table(soup)
    if not table:
        print("FPE HTML: Could not find holdings table in page.")
        return []

    rows = table.find_all("tr", recursive=False)
    records = []
    for row in rows[1:]:
        cells = [td.get_text(strip=True) for td in row.find_all(["th", "td"], recursive=False)]
        if len(cells) < 6:
            continue
        rec = make_record(date_str, cells[0], cells[1], cells[2], cells[3], cells[4], cells[5])
        if rec:
            records.append(rec)

    if len(records) < 20:
        print(f"FPE HTML: Only {len(records)} valid rows — page likely JS-rendered, rejecting.")
        return []

    return records


def fetch_json_api(date_str: str) -> list[dict]:
    """Attempt to fetch holdings from First Trust's JSON API."""
    try:
        resp = requests.get(
            JSON_URL,
            headers={**HEADERS, "Accept": "application/json, text/javascript, */*; q=0.01",
                     "X-Requested-With": "XMLHttpRequest"},
            timeout=20,
        )
        if resp.status_code != 200 or "application/json" not in resp.headers.get("Content-Type", ""):
            return []
        data = resp.json()
        # Shape varies — try common patterns
        items = data if isinstance(data, list) else data.get("holdings", data.get("data", []))
        if not items or not isinstance(items, list):
            return []
        records = []
        for item in items:
            cusip = str(item.get("cusip", "") or item.get("CUSIP", ""))
            name = str(item.get("securityName", "") or item.get("name", ""))
            identifier = str(item.get("ticker", "") or item.get("identifier", ""))
            shares_raw = str(item.get("shares", "") or item.get("quantity", ""))
            mkt_val_raw = str(item.get("marketValue", "") or item.get("mktVal", ""))
            weight_raw = str(item.get("weighting", "") or item.get("weight", ""))
            rec = make_record(date_str, name, identifier, cusip, shares_raw, mkt_val_raw, weight_raw)
            if rec:
                records.append(rec)
        return records if len(records) >= 20 else []
    except Exception as e:
        print(f"FPE JSON API failed: {e}")
        return []


def fetch(date_str: str) -> list[dict]:
    # Try JSON API first
    records = fetch_json_api(date_str)
    if records:
        print(f"FPE: Got {len(records)} holdings from JSON API.")
        return records

    # Fall back to HTML scraping
    print("FPE: Falling back to HTML scraping...")
    records = fetch_html(date_str)
    return records


def save(rows: list[dict], date_display: str) -> str:
    os.makedirs(HOLDINGS_DIR, exist_ok=True)
    dest = os.path.join(HOLDINGS_DIR, f"{date_display}.csv")
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
    if date_str is None:
        date_str = datetime.now(timezone.utc).strftime("%Y%m%d")

    date_display = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}"
    dest = os.path.join(HOLDINGS_DIR, f"{date_display}.csv")

    if os.path.exists(dest):
        print(f"FPE: Already have {dest}, skipping.")
        return True

    print(f"Fetching FPE holdings for {date_display}...")
    rows = fetch(date_str)

    if not rows:
        print("FPE: No valid holdings returned — skipping write.")
        return False

    path = save(rows, date_display)
    print(f"FPE: Saved {len(rows)} holdings -> {path}")
    return True


if __name__ == "__main__":
    date_arg = sys.argv[1] if len(sys.argv) > 1 else None
    main(date_arg)
