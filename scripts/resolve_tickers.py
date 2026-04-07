"""
Resolves display tickers for PFF holdings.

Strategy (in priority order):
  1. Parse the iShares `name` field for SERIES/PREFERRED indicators
     e.g. "WELLS FARGO & COMPANY SERIES L" -> WFC-L
          "GLADSTONE INV CORP PREFERRED Z"  -> GAIN-Z
  2. Fall back to OpenFIGI for any ISIN we couldn't parse locally
     (stores the descriptive name OpenFIGI returns, e.g. "WFC 7.5 PERP L")

Results are persisted in data/ticker_cache.json so each ISIN is only queried once.
"""

import csv
import glob
import json
import os
import re
import sys
import tempfile
import time

import requests

OPENFIGI_URL = "https://api.openfigi.com/v3/mapping"
CACHE_FILE = "data/ticker_cache.json"
OVERRIDES_FILE = "data/ticker_overrides.json"

# Preferred US exchange codes in priority order
US_EXCH = {"US", "UN", "UA", "UW", "UP", "UR"}

# Patterns indicating a preferred share series in the iShares name field
# Captures: "SERIES L", "SERIES C-1", "PREFERRED A", "SR PFD Z", "PERP A", etc.
_SERIES_RE = re.compile(
    r"\b(?:SER(?:IES)?|SR\.?|PFD|PREFERRED|PREF|PERP(?:ETUAL)?)\s+([A-Z0-9](?:-[0-9])?)\b",
    re.IGNORECASE,
)

# Base equity tickers are typically 1-4 uppercase letters (no digits)
_PLAIN_EQUITY_RE = re.compile(r"^[A-Z]{1,4}$")


def parse_series_ticker(ticker_raw: str, name: str) -> str | None:
    """Try to derive 'TICKER-X' from the holding name or ticker itself.

    Cases:
      - ticker_raw already encodes series: HBANZ, FITBM, AGNCM -> use as-is
      - name has "SERIES X" / "PFD X" / "PERP X"  -> TICKER-X
    """
    if not ticker_raw:
        return None

    # If ticker_raw already looks like a preferred ticker (has digits or >4 chars),
    # return it directly
    if not _PLAIN_EQUITY_RE.match(ticker_raw):
        return ticker_raw.upper()

    if not name:
        return None

    m = _SERIES_RE.search(name)
    if m:
        series = m.group(1).upper()
        return f"{ticker_raw.upper()}-{series}"

    return None


# ---------- OpenFIGI helpers ----------

def load_overrides() -> dict[str, str]:
    """Load manual ISIN → ticker overrides. These beat everything else."""
    if os.path.exists(OVERRIDES_FILE):
        with open(OVERRIDES_FILE, encoding="utf-8") as f:
            data = json.load(f)
        return {k: v for k, v in data.items() if not k.startswith("_")}
    return {}


def load_cache() -> dict:
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_cache(cache: dict):
    os.makedirs("data", exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir="data", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=2, sort_keys=True)
        os.replace(tmp, CACHE_FILE)
    except Exception:
        os.unlink(tmp)
        raise


def best_figi(results: list[dict]) -> dict:
    def score(r):
        exch = r.get("exchCode", "")
        stype = r.get("securityType", "")
        return (
            0 if exch in US_EXCH else 1,
            0 if "Preferred" in stype else (1 if "Common" in stype else 2),
        )
    results.sort(key=score)
    r = results[0]
    return {
        "figi_ticker": r.get("ticker"),
        "figi_name": r.get("name"),
        "exchCode": r.get("exchCode"),
        "securityType": r.get("securityType"),
        "figi": r.get("figi"),
    }


def resolve_via_figi(isins: list[str], api_key: str | None = None) -> dict:
    """POST a batch of <=10 ISINs to OpenFIGI. Returns {isin: figi_info}."""
    payload = [{"idType": "ID_ISIN", "idValue": i} for i in isins]
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["X-OPENFIGI-APIKEY"] = api_key

    resp = requests.post(OPENFIGI_URL, json=payload, headers=headers, timeout=30)
    if resp.status_code == 429:
        wait = int(resp.headers.get("Retry-After", 62))
        print(f"  Rate limited -- sleeping {wait}s...")
        time.sleep(wait)
        resp = requests.post(OPENFIGI_URL, json=payload, headers=headers, timeout=30)
    resp.raise_for_status()

    results = {}
    for isin, item in zip(isins, resp.json()):
        if "data" in item and item["data"]:
            results[isin] = best_figi(item["data"])
        else:
            results[isin] = None
    return results


# ---------- main logic ----------

def collect_isin_rows() -> dict[str, dict]:
    """Return {isin: {ticker_raw, name}} from all holdings CSVs."""
    rows: dict[str, dict] = {}
    for path in sorted(glob.glob("data/PFF/holdings/*.csv")):
        with open(path, encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                isin = row.get("isin", "").strip()
                if isin and isin not in rows:
                    rows[isin] = {
                        "ticker_raw": row.get("ticker_raw", ""),
                        "name": row.get("name", ""),
                    }
    return rows


_FIGI_PERP_RE = re.compile(r"\bPERP\s+([A-Z0-9](?:-[0-9])?)[.\s]*", re.IGNORECASE)


def parse_series_from_figi(ticker_raw: str, figi_ticker: str | None) -> str | None:
    """Extract 'TICKER-X' from OpenFIGI description like 'AGNC V0 PERP C'."""
    if not figi_ticker or not _PLAIN_EQUITY_RE.match(ticker_raw):
        return None
    m = _FIGI_PERP_RE.search(figi_ticker)
    if m:
        return f"{ticker_raw.upper()}-{m.group(1).upper()}"
    return None


def build_entry(isin: str, ticker_raw: str, name: str, figi: dict | None) -> dict:
    figi_ticker = figi["figi_ticker"] if figi else None

    # Priority 1: parse from iShares name ("SERIES L" etc.)
    parsed = parse_series_ticker(ticker_raw, name)

    # Priority 2: parse from OpenFIGI description ("PERP C" etc.)
    if not parsed and figi_ticker:
        parsed = parse_series_from_figi(ticker_raw, figi_ticker)

    # Priority 3: if figi_ticker looks like a clean symbol (not a bond description),
    # use it — but only if it starts with the ticker_raw prefix (avoids "BA 6 10/15/27")
    if not parsed and figi_ticker:
        figi_clean = figi_ticker.strip().split()[0]  # first word
        if figi_clean.isalpha() and len(figi_clean) <= 6:
            parsed = figi_clean  # e.g., "WFC" for a case figi returned just the ticker

    return {
        "ticker": parsed,                            # best display ticker (may be None)
        "ticker_raw": ticker_raw,
        "parsed_from_name": parse_series_ticker(ticker_raw, name) is not None,
        "figi_ticker": figi_ticker,
        "figi_name": figi["figi_name"] if figi else None,
        "securityType": figi["securityType"] if figi else None,
        "figi": figi["figi"] if figi else None,
        "resolved": True,
    }


def main(api_key: str | None = None):
    cache = load_cache()
    overrides = load_overrides()
    isin_rows = collect_isin_rows()

    # Apply overrides at highest priority — always overwrite cache for these ISINs
    for isin, ticker in overrides.items():
        meta = isin_rows.get(isin, {})
        entry = cache.get(isin, {})
        cache[isin] = {
            **entry,
            "ticker": ticker,
            "ticker_raw": meta.get("ticker_raw", entry.get("ticker_raw", "")),
            "resolved": True,
            "override": True,
        }
        print(f"  Override: {isin} -> {ticker}")
    if overrides:
        save_cache(cache)

    uncached = {
        isin: meta
        for isin, meta in isin_rows.items()
        if isin not in cache
    }
    print(f"Total ISINs: {len(isin_rows)} | Cached: {len(cache)} | To resolve: {len(uncached)}")

    if not uncached:
        print("Nothing to resolve.")
        return

    # Step 1: parse from name (free, instant)
    need_figi: list[str] = []
    for isin, meta in uncached.items():
        parsed = parse_series_ticker(meta["ticker_raw"], meta["name"])
        if parsed:
            cache[isin] = build_entry(isin, meta["ticker_raw"], meta["name"], None)
            print(f"  Parsed: {isin} -> {parsed}  ({meta['name']})")
        else:
            need_figi.append(isin)

    save_cache(cache)
    print(f"Parsed {len(uncached) - len(need_figi)} from name; {len(need_figi)} need OpenFIGI.")

    # Step 2: fall back to OpenFIGI for the rest
    if not need_figi:
        return

    batch_size = 10
    total_batches = (len(need_figi) + batch_size - 1) // batch_size

    for i, start in enumerate(range(0, len(need_figi), batch_size)):
        batch = need_figi[start : start + batch_size]
        print(f"  OpenFIGI batch {i+1}/{total_batches}: {batch}")

        figi_results = resolve_via_figi(batch, api_key)
        for isin in batch:
            meta = isin_rows[isin]
            figi = figi_results.get(isin)
            entry = build_entry(isin, meta["ticker_raw"], meta["name"], figi)
            # If OpenFIGI has a cleaner ticker, use it
            if figi and figi.get("figi_ticker") and not entry["ticker"]:
                entry["ticker"] = figi["figi_ticker"]
            cache[isin] = entry

        save_cache(cache)
        if i < total_batches - 1:
            time.sleep(2.5)

    print(f"Cache now has {len(cache)} entries.")


if __name__ == "__main__":
    key = os.environ.get("OPENFIGI_API_KEY") or (sys.argv[1] if len(sys.argv) > 1 else None)
    main(key)
