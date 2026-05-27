"""
Fetches PFF holdings from the BlackRock fund-document CSV endpoint and writes
to data/PFF/holdings/YYYY-MM-DD.csv.

iShares retired the old `.ajax?fileType=json&asOfDate=...` endpoint in May 2026
with the v3 product-page migration. The replacement download returns CSV but
strips ISIN/CUSIP. We recover ISIN by bucket-matching new rows against the
most recent prior holdings file: rows sharing the same `ticker_raw` are
disambiguated by share-count proximity. Bucketing on ticker alone (not on name)
is intentional — the new endpoint sometimes rewords name fields (e.g. "BANK OF
AMERICA CORP" → "BANK AMER DS REPRESENTING NON CU") while leaving the count of
holdings per ticker stable day-over-day.

The new endpoint ignores asOfDate — it always returns the latest snapshot.
We trust the "Fund Holdings as of" header in the file for the file date.
"""

import csv
import glob
import os
import sys
import tempfile
from datetime import datetime
from io import StringIO

import requests

URL = (
    "https://www.blackrock.com/varnish-api/blk-one01-product-data/product-data/"
    "api/v1/get-fund-document"
    "?appType=PRODUCT_PAGE&appSubType=ISHARES&targetSite=us-ishares"
    "&locale=en_US&portfolioId=239826&component=holdings&userType=individual"
)

HEADERS = {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.9",
    "referer": "https://www.ishares.com/us/products/239826/ishares-us-preferred-stock-etf",
    "user-agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
}

HOLDINGS_DIR = "data/PFF/holdings"

FIELDNAMES = [
    "date", "isin", "cusip", "ticker_raw", "name", "sector", "asset_class",
    "mkt_val", "weight", "shares", "price", "currency", "exchange", "country",
]


def _num(s: str) -> float | None:
    """Parse a numeric cell that may contain commas; return None on failure."""
    if not s or s == "-":
        return None
    try:
        return float(s.replace(",", ""))
    except ValueError:
        return None


def fetch_csv() -> str:
    resp = requests.get(URL, headers=HEADERS, timeout=60)
    resp.raise_for_status()
    return resp.content.decode("utf-8-sig")


def parse(text: str) -> tuple[str, list[dict]]:
    """Parse the iShares holdings CSV. Returns (as_of_date_iso, rows)."""
    reader = csv.reader(StringIO(text))

    as_of_iso = ""
    rows: list[dict] = []
    in_holdings = False

    for raw in reader:
        # Header row that introduces the holdings table
        if not in_holdings:
            if raw and raw[0].startswith("Fund Holdings as of") and len(raw) > 1:
                # e.g. "May 26, 2026" -> "2026-05-26"
                as_of_iso = datetime.strptime(raw[1].strip(), "%b %d, %Y").strftime("%Y-%m-%d")
            elif raw and raw[0] == "Ticker" and "Name" in raw:
                in_holdings = True
            continue

        # In holdings section
        if not raw or not raw[0] or raw[0].startswith('"The'):
            # blank line or disclaimer footer => end of holdings
            if not raw or not raw[0]:
                # could just be a blank line mid-section; only stop on disclaimer text
                continue
            break

        # New CSV columns:
        #   0 Ticker  1 Name  2 Sector  3 Asset Class  4 Market Value
        #   5 Weight (%)  6 Notional Value  7 Quantity  8 Price
        #   9 Location  10 Exchange  11 Currency  12 FX Rate  13 Market Currency
        #  14 Accrual Date
        if len(raw) < 14:
            continue

        ticker_raw = raw[0]
        name = raw[1]
        sector = raw[2]
        asset_class = raw[3]
        mkt_val = _num(raw[4])
        weight = _num(raw[5])  # comes as percentage, normalize to fraction below
        shares = _num(raw[7])
        price = _num(raw[8])
        country = raw[9]
        exchange = raw[10]
        currency = raw[11]

        if not ticker_raw and not name:
            continue

        rows.append({
            "date": as_of_iso,
            "isin": "",          # filled in by reconcile_isins()
            "cusip": "",
            "ticker_raw": ticker_raw,
            "name": name,
            "sector": sector,
            "asset_class": asset_class,
            "mkt_val": mkt_val if mkt_val is not None else "",
            "weight": round(weight / 100, 6) if weight is not None else "",
            "shares": shares if shares is not None else "",
            "price": price if price is not None else "",
            "currency": currency,
            "exchange": exchange,
            "country": country,
        })

    return as_of_iso, rows


def _load_prior_by_ticker(prior_path: str) -> dict[str, list[dict]]:
    """Group prior holdings by ticker_raw."""
    buckets: dict[str, list[dict]] = {}
    with open(prior_path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            buckets.setdefault(r.get("ticker_raw", ""), []).append({
                "isin": r.get("isin", ""),
                "cusip": r.get("cusip", ""),
                "shares": _num(r.get("shares", "")) or 0.0,
                "price": _num(r.get("price", "")) or 0.0,
            })
    return buckets


def reconcile_isins(rows: list[dict]) -> tuple[int, int]:
    """Fill in ISIN/CUSIP on `rows` by matching against the most recent prior file.

    Returns (matched_count, unmatched_count).
    """
    prior_files = sorted(glob.glob(os.path.join(HOLDINGS_DIR, "*.csv")))
    if not prior_files:
        print("  No prior holdings file — leaving ISIN blank.")
        return 0, len(rows)

    prior_path = prior_files[-1]
    print(f"  Reconciling ISINs against {prior_path}")
    buckets = _load_prior_by_ticker(prior_path)

    new_buckets: dict[str, list[dict]] = {}
    for r in rows:
        new_buckets.setdefault(r["ticker_raw"], []).append(r)

    matched = unmatched = 0
    for ticker, news in new_buckets.items():
        candidates = list(buckets.get(ticker, []))
        for new in news:
            if not candidates:
                unmatched += 1
                continue
            new_shares = _num(str(new.get("shares", ""))) or 0.0
            new_price = _num(str(new.get("price", ""))) or 0.0
            # Both shares and price help disambiguate within a ticker (different
            # preferred series have different coupons => different prices, and
            # share counts are stable across short windows).
            def dist(c):
                s = c["shares"] or 1.0
                p = c["price"] or 1.0
                return abs(c["shares"] - new_shares) / s + abs(c["price"] - new_price) / p
            best = min(candidates, key=dist)
            new["isin"] = best["isin"]
            new["cusip"] = best["cusip"]
            candidates.remove(best)
            matched += 1

    return matched, unmatched


def save(rows: list[dict], date_iso: str) -> str:
    os.makedirs(HOLDINGS_DIR, exist_ok=True)
    dest = os.path.join(HOLDINGS_DIR, f"{date_iso}.csv")
    fd, tmp = tempfile.mkstemp(dir=HOLDINGS_DIR, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=FIELDNAMES, quoting=csv.QUOTE_NONNUMERIC)
            writer.writeheader()
            for row in rows:
                row["date"] = date_iso
                writer.writerow(row)
        os.replace(tmp, dest)
    except Exception:
        os.unlink(tmp)
        raise
    return dest


def main(date_str: str | None = None) -> bool:
    # `date_str` is accepted for orchestrator compatibility but ignored:
    # the new endpoint always returns the latest snapshot.
    if date_str:
        print(f"Note: PFF date arg '{date_str}' ignored — endpoint always returns latest.")

    print("Fetching PFF holdings from BlackRock fund-document API...")
    text = fetch_csv()
    as_of_iso, rows = parse(text)
    if not as_of_iso or not rows:
        print("  Could not parse holdings response (no as-of date or no rows).")
        return False

    dest = os.path.join(HOLDINGS_DIR, f"{as_of_iso}.csv")
    if os.path.exists(dest):
        print(f"  Already have {dest}, skipping.")
        return False

    matched, unmatched = reconcile_isins(rows)
    path = save(rows, as_of_iso)
    print(f"  Saved {len(rows)} holdings for {as_of_iso} ({matched} ISIN-matched, "
          f"{unmatched} unmatched) -> {path}")
    return True


if __name__ == "__main__":
    date_arg = sys.argv[1] if len(sys.argv) > 1 else None
    main(date_arg)
