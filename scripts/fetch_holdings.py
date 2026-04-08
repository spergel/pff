"""
Fetches PFF holdings from iShares JSON API and writes to data/holdings/YYYY-MM-DD.csv.
Skips gracefully on weekends / market holidays when no data is published.
"""

import csv
import os
import sys
import tempfile
import requests
from datetime import datetime, timezone

URL = (
    "https://www.ishares.com/us/products/239826/"
    "ishares-us-preferred-stock-etf/"
    "1467271812596.ajax?tab=all&fileType=json&asOfDate={date}"
)

HEADERS = {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.9",
    "referer": "https://www.ishares.com/us/products/239826/ishares-us-preferred-stock-etf",
    "x-requested-with": "XMLHttpRequest",
    "user-agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
}

# Column indices in each aaData row
IDX = dict(
    ticker_raw=0,
    name=1,
    sector=2,
    asset_class=3,
    mkt_val=4,
    weight=5,
    notional=6,
    shares=7,
    cusip=8,
    isin=9,
    bloomberg_id=10,
    price=11,
    country=12,
    exchange=13,
    currency=14,
    fx_rate=15,
    accrual_date=16,
)

FIELDNAMES = [
    "date", "isin", "cusip", "ticker_raw", "name", "sector", "asset_class",
    "mkt_val", "weight", "shares", "price", "currency", "exchange", "country",
]


def extract(row, key):
    idx = IDX[key]
    if idx >= len(row):
        return ""
    v = row[idx]
    if isinstance(v, dict):
        return v.get("raw", "")
    return v if v is not None else ""


def fetch(date_str: str) -> list[dict]:
    url = URL.format(date=date_str)
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    # iShares response has a UTF-8 BOM; decode manually
    data = __import__("json").loads(resp.content.decode("utf-8-sig"))

    aa = data.get("aaData")
    if not aa:
        print(f"No aaData in response for {date_str} — likely a holiday/weekend.")
        return []

    rows = []
    for row in aa:
        isin = extract(row, "isin")
        if not isin:
            continue  # skip cash, derivatives, totals rows

        rows.append({
            "date": date_str.replace("", "-")[:10],  # normalised below
            "isin": isin,
            "cusip": extract(row, "cusip"),
            "ticker_raw": extract(row, "ticker_raw"),
            "name": extract(row, "name"),
            "sector": extract(row, "sector"),
            "asset_class": extract(row, "asset_class"),
            "mkt_val": extract(row, "mkt_val"),
            "weight": extract(row, "weight"),
            "shares": extract(row, "shares"),
            "price": extract(row, "price"),
            "currency": extract(row, "currency"),
            "exchange": extract(row, "exchange"),
            "country": extract(row, "country"),
        })

    return rows


def save(rows: list[dict], date_display: str, out_dir: str = "data/PFF/holdings") -> str:
    os.makedirs(out_dir, exist_ok=True)
    dest = os.path.join(out_dir, f"{date_display}.csv")

    # Write atomically via tmp file
    fd, tmp = tempfile.mkstemp(dir=out_dir, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(
                f, fieldnames=FIELDNAMES, quoting=csv.QUOTE_NONNUMERIC
            )
            writer.writeheader()
            for row in rows:
                row["date"] = date_display
                writer.writerow(row)
        os.replace(tmp, dest)
    except Exception:
        os.unlink(tmp)
        raise

    return dest


def main(date_str: str | None = None):
    from datetime import timedelta

    if date_str is None:
        # Try today and the 4 most recent calendar days to catch late-published data.
        # iShares sometimes doesn't publish until after our 6pm ET scheduled run.
        today = datetime.now(timezone.utc).date()
        candidates = [
            (today - timedelta(days=i)).strftime("%Y%m%d") for i in range(5)
        ]
    else:
        candidates = [date_str]

    wrote_any = False
    for ds in candidates:
        date_display = f"{ds[:4]}-{ds[4:6]}-{ds[6:]}"
        dest = os.path.join("data/PFF/holdings", f"{date_display}.csv")

        if os.path.exists(dest):
            continue  # already have it

        print(f"Fetching PFF holdings for {date_display}...")
        rows = fetch(ds)

        if not rows:
            continue  # weekend / holiday / not yet published

        path = save(rows, date_display)
        print(f"Saved {len(rows)} holdings -> {path}")
        wrote_any = True

    return wrote_any


if __name__ == "__main__":
    date_arg = sys.argv[1] if len(sys.argv) > 1 else None
    ok = main(date_arg)
    sys.exit(0 if ok else 0)  # never fail the workflow, even on holidays
