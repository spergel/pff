"""
Fetches FPE (First Trust Preferred Securities and Income ETF) holdings
from the First Trust portfolio page and writes data/FPE/holdings/YYYY-MM-DD.csv.

The page renders holdings as an HTML table with columns:
  Security Name | Identifier | CUSIP | Shares/Quantity | Market Value | Weighting

Since First Trust does not publish ISINs, CUSIP is used as the primary key.
Price is derived as Market Value / Shares.
"""

import csv
import os
import re
import sys
import tempfile
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

URL = "https://www.ftportfolios.com/Retail/Etf/EtfHoldings.aspx?Ticker=FPE"
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


def clean_number(s: str) -> str:
    """Strip $ signs, commas, % signs from a formatted number string."""
    return re.sub(r"[$,%]", "", s).strip()


def find_holdings_table(soup: BeautifulSoup):
    """Find the table whose first row is the holdings header."""
    for table in soup.find_all("table"):
        headers = [th.get_text(strip=True) for th in table.find_all("tr")[0].find_all(["th", "td"])]
        if "Security Name" in headers and "CUSIP" in headers:
            return table
    return None


def fetch(date_str: str) -> list[dict]:
    resp = requests.get(URL, headers=HEADERS, timeout=30)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    table = find_holdings_table(soup)
    if not table:
        print("FPE: Could not find holdings table in page.")
        return []

    rows = table.find_all("tr")
    records = []

    for row in rows[1:]:  # skip header
        cells = [td.get_text(strip=True) for td in row.find_all(["th", "td"])]
        if len(cells) < 6:
            continue

        name = cells[0]
        identifier = cells[1]  # ticker if available, else blank
        cusip = cells[2]
        shares_raw = clean_number(cells[3])
        mkt_val_raw = clean_number(cells[4])
        weight_raw = clean_number(cells[5])

        if not cusip and not name:
            continue  # completely empty row

        # Skip USD cash and totals rows
        if identifier == "$USD" or name.lower().startswith("total"):
            continue

        try:
            shares = float(shares_raw) if shares_raw else 0.0
        except ValueError:
            shares = 0.0

        try:
            mkt_val = float(mkt_val_raw) if mkt_val_raw else 0.0
        except ValueError:
            mkt_val = 0.0

        try:
            weight = float(weight_raw) if weight_raw else 0.0
        except ValueError:
            weight = 0.0

        # Derive price from market value / shares
        price = round(mkt_val / shares, 4) if shares > 0 else 0.0

        records.append({
            "date": date_str,
            "isin": "",          # FPE does not provide ISINs
            "cusip": cusip,
            "ticker_raw": identifier,
            "name": name,
            "sector": "",        # FPE does not categorise by sector
            "asset_class": "",
            "mkt_val": round(mkt_val, 2) if mkt_val else "",
            "weight": round(weight / 100, 6) if weight else "",  # store as decimal like PFF
            "shares": shares if shares else "",
            "price": price if price else "",
            "currency": "USD",
            "exchange": "",
            "country": "",
        })

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
        print("FPE: No holdings returned — skipping write.")
        return False

    path = save(rows, date_display)
    print(f"FPE: Saved {len(rows)} holdings -> {path}")
    return True


if __name__ == "__main__":
    date_arg = sys.argv[1] if len(sys.argv) > 1 else None
    main(date_arg)
