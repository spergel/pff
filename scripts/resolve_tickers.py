"""
Resolves display tickers for all ETF holdings.

ISIN-based (PFF):
  1. Parse the iShares name field for SERIES/PREFERRED indicators
     e.g. "WELLS FARGO & COMPANY SERIES L" -> WFC-L
  2. Fall back to OpenFIGI ID_ISIN lookup

CUSIP-based (PGX, FPE):
  1. Normalize dot/space notation in ticker_raw (WFC.L -> WFC-L, BANC F -> BANC-F)
  2. Fall back to OpenFIGI ID_CUSIP lookup for proper series tickers

Results:
  data/ticker_cache.json      — ISIN-keyed (PFF)
  data/cusip_ticker_cache.json — CUSIP-keyed (PGX, FPE)
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
ISIN_CACHE_FILE = "data/ticker_cache.json"
CUSIP_CACHE_FILE = "data/cusip_ticker_cache.json"
OVERRIDES_FILE = "data/ticker_overrides.json"

US_EXCH = {"US", "UN", "UA", "UW", "UP", "UR"}

_SERIES_RE = re.compile(
    r"\b(?:SER(?:IES)?|SR\.?|PFD|PREFERRED|PREF|PERP(?:ETUAL)?)\s+([A-Z0-9]{1,3}(?:-[0-9])?)\b",
    re.IGNORECASE,
)
_PLAIN_EQUITY_RE = re.compile(r"^[A-Z]{1,4}$")
_FIGI_PERP_RE = re.compile(r"\bPERP\s+([A-Z0-9]{1,3}(?:-[0-9])?)[.\s]*", re.IGNORECASE)

# Real CUSIP: 9 alphanumeric chars. Virtus PFEP... IDs are not real CUSIPs.
_REAL_CUSIP_RE = re.compile(r"^[A-Z0-9]{8,9}$")
# SEDOL: exactly 7 alphanumeric chars (used by PFFD via Global X)
_SEDOL_RE = re.compile(r"^[A-Z0-9]{7}$")


def normalize_ticker(raw: str) -> str | None:
    """Normalize dot/space preferred-series notation to TICKER-SERIES."""
    if not raw:
        return None
    # "WFC.L" → "WFC-L"
    if re.match(r"^[A-Z]{1,6}\.[A-Z]{1,3}$", raw):
        return raw.replace(".", "-")
    # "BANC F" → "BANC-F", "ET I" → "ET-I"
    m = re.match(r"^([A-Z]{1,6})\s+([A-Z]{1,3})$", raw)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    # Already looks like a preferred ticker (has digits, or length > 4)
    if not _PLAIN_EQUITY_RE.match(raw):
        return raw
    return None  # plain equity ticker — need more info


# ── cache helpers ────────────────────────────────────────────────────────────

def load_json(path: str) -> dict:
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_json(data: dict, path: str):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path) or ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, sort_keys=True)
        os.replace(tmp, path)
    except Exception:
        os.unlink(tmp)
        raise


# ── OpenFIGI ─────────────────────────────────────────────────────────────────

def best_figi_ticker(results: list[dict]) -> str | None:
    def score(r):
        exch = r.get("exchCode", "")
        stype = r.get("securityType", "")
        return (
            0 if exch in US_EXCH else 1,
            0 if "Preferred" in stype else (1 if "Common" in stype else 2),
        )
    results = sorted(results, key=score)
    r = results[0]
    return r.get("ticker")


def figi_batch(items: list[dict], api_key: str | None) -> list[dict | None]:
    """POST up to 10 items to OpenFIGI. Returns list of result dicts or None."""
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["X-OPENFIGI-APIKEY"] = api_key

    resp = requests.post(OPENFIGI_URL, json=items, headers=headers, timeout=30)
    if resp.status_code == 429:
        wait = int(resp.headers.get("Retry-After", 62))
        print(f"  Rate limited — sleeping {wait}s...")
        time.sleep(wait)
        resp = requests.post(OPENFIGI_URL, json=items, headers=headers, timeout=30)
    resp.raise_for_status()

    out = []
    for item in resp.json():
        if "data" in item and item["data"]:
            out.append({"ticker": best_figi_ticker(item["data"])})
        else:
            out.append(None)
    return out


# ── ISIN resolution (PFF) ─────────────────────────────────────────────────────

def parse_series_ticker(ticker_raw: str, name: str) -> str | None:
    if not ticker_raw:
        return None
    if not _PLAIN_EQUITY_RE.match(ticker_raw):
        return ticker_raw.upper()
    if not name:
        return None
    m = _SERIES_RE.search(name)
    if m:
        return f"{ticker_raw.upper()}-{m.group(1).upper()}"
    return None


def parse_series_from_figi(ticker_raw: str, figi_ticker: str | None) -> str | None:
    if not figi_ticker or not _PLAIN_EQUITY_RE.match(ticker_raw):
        return None
    m = _FIGI_PERP_RE.search(figi_ticker)
    if m:
        return f"{ticker_raw.upper()}-{m.group(1).upper()}"
    return None


def build_isin_entry(isin: str, ticker_raw: str, name: str, figi: dict | None) -> dict:
    figi_ticker = figi["ticker"] if figi else None
    parsed = parse_series_ticker(ticker_raw, name)
    if not parsed and figi_ticker and ticker_raw and _PLAIN_EQUITY_RE.match(ticker_raw):
        # Try PERP-pattern first, then full trailing-letter logic (covers "KKR 6.875 06/01/65 T")
        parsed = parse_series_from_figi(ticker_raw, figi_ticker)
        if not parsed:
            candidate = extract_series_from_figi_desc(ticker_raw, figi_ticker)
            if candidate != ticker_raw:  # extract_series_from_figi_desc returns base when no series found
                parsed = candidate
    if not parsed and figi_ticker:
        figi_clean = figi_ticker.strip().split()[0]
        if figi_clean.isalpha() and len(figi_clean) <= 6:
            parsed = figi_clean
    return {
        "ticker": parsed,
        "ticker_raw": ticker_raw,
        "parsed_from_name": parse_series_ticker(ticker_raw, name) is not None,
        "figi_ticker": figi_ticker,
        "securityType": figi.get("securityType") if figi else None,
        "figi": figi.get("figi") if figi else None,
        "resolved": True,
    }


def resolve_isins(api_key: str | None):
    """Resolve ISIN → ticker for all ISIN-keyed ETFs (PFF, PFXF).

    Updates ticker_cache.json.
    """
    cache = load_json(ISIN_CACHE_FILE)
    overrides = load_json(OVERRIDES_FILE)

    # Collect ISINs from all ISIN-keyed ETF holdings
    isin_rows: dict[str, dict] = {}
    for path in sorted(glob.glob("data/PFF/holdings/*.csv") +
                       glob.glob("data/PFXF/holdings/*.csv")):
        with open(path, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                isin = row.get("isin", "").strip()
                if isin and isin not in isin_rows:
                    isin_rows[isin] = {
                        "ticker_raw": row.get("ticker_raw", ""),
                        "name": row.get("name", ""),
                    }

    # Apply overrides
    for isin, ticker in overrides.items():
        if isin.startswith("_"):
            continue
        meta = isin_rows.get(isin, {})
        cache[isin] = {**cache.get(isin, {}), "ticker": ticker,
                       "ticker_raw": meta.get("ticker_raw", ""), "resolved": True, "override": True}
    if overrides:
        save_json(cache, ISIN_CACHE_FILE)

    uncached = {isin: meta for isin, meta in isin_rows.items() if isin not in cache}
    print(f"ISIN: {len(isin_rows)} total | {len(cache)} cached | {len(uncached)} to resolve")
    if not uncached:
        return

    need_figi: list[str] = []
    for isin, meta in uncached.items():
        parsed = parse_series_ticker(meta["ticker_raw"], meta["name"])
        if parsed:
            cache[isin] = build_isin_entry(isin, meta["ticker_raw"], meta["name"], None)
        else:
            need_figi.append(isin)
    save_json(cache, ISIN_CACHE_FILE)
    print(f"  Parsed {len(uncached) - len(need_figi)} from name; {len(need_figi)} need OpenFIGI.")

    for i in range(0, len(need_figi), 10):
        batch_isins = need_figi[i:i+10]
        print(f"  OpenFIGI ISIN batch {i//10+1}: {batch_isins}")
        results = figi_batch([{"idType": "ID_ISIN", "idValue": x} for x in batch_isins], api_key)
        for isin, result in zip(batch_isins, results):
            meta = isin_rows[isin]
            cache[isin] = build_isin_entry(isin, meta["ticker_raw"], meta["name"], result)
        save_json(cache, ISIN_CACHE_FILE)
        if i + 10 < len(need_figi):
            time.sleep(2.5)


# ── CUSIP resolution (PGX, FPE) ──────────────────────────────────────────────

def extract_series_from_figi_desc(base: str, desc: str) -> str:
    """Parse OpenFIGI bond description into TICKER-SERIES.

    Examples:
      "JPM 6 PERP EE"         -> "JPM-EE"
      "WFC 4.75 PERP Z"       -> "WFC-Z"
      "BAC 6 PERP GG"         -> "BAC-GG"
      "NEE 6.5 06/01/85 U"    -> "NEE-U"
      "NEE 6.5 04/15/86 .Z"   -> "NEE-Z"   (period-prefixed series)
      "BAC V6.625 PERP"       -> "BAC"     (no series)
      "XEL 6.25 10/15/85"     -> "XEL"     (no series)
    """
    # After PERP: "PERP EE", "PERP Z"
    m = re.search(r"\bPERP\s+([A-Z0-9]{1,3})\b", desc, re.IGNORECASE)
    if m:
        return f"{base}-{m.group(1).upper()}"
    # Trailing uppercase word (series letter at end, not a keyword)
    _NON_SERIES = {"PERP", "SR", "PFD", "VAR", "FIX", "QIB", "REG", "LLC", "INC", "PLC", "ETF"}
    m = re.search(r"\s+([A-Z]{1,3})$", desc.strip())
    if m and m.group(1).upper() not in _NON_SERIES:
        return f"{base}-{m.group(1).upper()}"
    # Period-prefixed series at end: ".Z", ".AA" (OpenFIGI sometimes uses this notation)
    m = re.search(r"\.\s*([A-Z]{1,3})\s*$", desc.strip())
    if m and m.group(1).upper() not in _NON_SERIES:
        return f"{base}-{m.group(1).upper()}"
    # Letter before trailing asterisk(s): "K*", "L**" (asterisk = redeemable / called marker)
    m = re.search(r"\s+([A-Z]{1,3})\*+\s*$", desc.strip())
    if m and m.group(1).upper() not in _NON_SERIES:
        return f"{base}-{m.group(1).upper()}"
    return base


def resolve_cusips(api_key: str | None):
    """Resolve CUSIP → ticker for PGX and FPE. Updates cusip_ticker_cache.json."""
    cache: dict[str, str] = load_json(CUSIP_CACHE_FILE)

    # Collect CUSIPs from PGX, FPE, and PFXF holdings
    cusip_rows: dict[str, dict] = {}  # cusip → {ticker_raw, name}
    for etf in ("PGX", "FPE", "PFXF"):
        for path in sorted(glob.glob(f"data/{etf}/holdings/*.csv")):
            with open(path, encoding="utf-8") as f:
                for row in csv.DictReader(f):
                    cusip = row.get("cusip", "").strip()
                    ticker_raw = row.get("ticker_raw", "").strip()
                    name = row.get("name", "").strip()
                    if not cusip or not _REAL_CUSIP_RE.match(cusip):
                        continue  # skip non-standard CUSIPs (Virtus PFEP...) and SEDOLs
                    if cusip not in cusip_rows:
                        cusip_rows[cusip] = {"ticker_raw": ticker_raw, "name": name, "etf": etf}
                    elif _SERIES_RE.search(name) and not _SERIES_RE.search(cusip_rows[cusip]["name"]):
                        # Prefer a name that contains series info over a generic one
                        cusip_rows[cusip]["name"] = name
                        if ticker_raw and not cusip_rows[cusip]["ticker_raw"]:
                            cusip_rows[cusip]["ticker_raw"] = ticker_raw

    print(f"CUSIP: {len(cusip_rows)} unique CUSIPs from PGX+FPE | {len(cache)} cached")

    # Step 0: upgrade already-cached plain equity tickers using name-based series parsing.
    # e.g. cache["172967QJ5"] = "C" but name says "Series HH" → upgrade to "C-HH".
    upgraded = 0
    for cusip, meta in cusip_rows.items():
        cached = cache.get(cusip, "")
        if cached and _PLAIN_EQUITY_RE.match(cached):
            better = parse_series_ticker(cached, meta["name"])
            if better and better != cached:
                cache[cusip] = better
                upgraded += 1
    if upgraded:
        save_json(cache, CUSIP_CACHE_FILE)
        print(f"  Upgraded {upgraded} cached plain equity tickers using security name.")

    # Step 1: normalize dot/space notation — free, no API needed
    resolved_from_norm = 0
    need_figi: list[str] = []
    for cusip, meta in cusip_rows.items():
        if cusip in cache:
            continue
        normalized = normalize_ticker(meta["ticker_raw"])
        if normalized:
            cache[cusip] = normalized
            resolved_from_norm += 1
        else:
            need_figi.append(cusip)

    save_json(cache, CUSIP_CACHE_FILE)
    print(f"  Normalized {resolved_from_norm} from ticker_raw; {len(need_figi)} need OpenFIGI.")

    # Step 2: OpenFIGI CUSIP lookup for the rest
    if not need_figi:
        return

    for i in range(0, len(need_figi), 10):
        batch = need_figi[i:i+10]
        print(f"  OpenFIGI CUSIP batch {i//10+1}/{(len(need_figi)+9)//10}: {batch}")
        results = figi_batch([{"idType": "ID_CUSIP", "idValue": x} for x in batch], api_key)
        for cusip, result in zip(batch, results):
            meta = cusip_rows[cusip]
            base = (meta["ticker_raw"].upper() or "").strip()
            if result and result.get("ticker"):
                figi_t = result["ticker"]
                if base and _PLAIN_EQUITY_RE.match(base):
                    # Plain base ticker: extract series from figi description
                    cache[cusip] = extract_series_from_figi_desc(base, figi_t)
                elif base:
                    # ticker_raw already encodes series (dot/space notation)
                    cache[cusip] = normalize_ticker(base) or base
                else:
                    # Empty ticker_raw: derive base from first word of figi description
                    figi_base_m = re.match(r"^([A-Z]{1,6})\b", figi_t.strip())
                    if figi_base_m:
                        figi_base = figi_base_m.group(1)
                        # Prefer name-based series (e.g. "Series HH") over FIGI description
                        name_result = parse_series_ticker(figi_base, meta["name"])
                        cache[cusip] = name_result or extract_series_from_figi_desc(figi_base, figi_t)
                    else:
                        cache[cusip] = cusip  # last resort: use CUSIP as key
            else:
                cache[cusip] = normalize_ticker(base) or base or cusip
        save_json(cache, CUSIP_CACHE_FILE)
        if i + 10 < len(need_figi):
            time.sleep(2.5)

    # Post-process: strip -QIB suffix, clear unresolvable foreign IDs
    for cusip in list(cache):
        v = cache[cusip]
        if v and v.endswith("-QIB"):
            cache[cusip] = v[:-4]
        elif v and re.match(r"^[DFGNW][A-Z0-9]{8,}$", v):
            cache[cusip] = ""

    save_json(cache, CUSIP_CACHE_FILE)
    print(f"CUSIP cache now has {len(cache)} entries.")


# ── SEDOL resolution (PFFD) ──────────────────────────────────────────────────

def resolve_sedols(api_key: str | None):
    """Resolve SEDOL → preferred ticker for PFFD (Global X).

    Global X stores SEDOLs in the 'cusip' field (no CUSIP/ISIN provided).
    Uses OpenFIGI ID_SEDOL lookup. Writes results to cusip_ticker_cache.json
    (same cache as CUSIPs since the key space doesn't overlap).
    """
    cache: dict[str, str] = load_json(CUSIP_CACHE_FILE)

    sedol_rows: dict[str, dict] = {}  # sedol → {ticker_raw, name}
    for path in sorted(glob.glob("data/PFFD/holdings/*.csv")):
        with open(path, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                sedol = row.get("cusip", "").strip()   # PFFD stores SEDOL here
                ticker_raw = row.get("ticker_raw", "").strip()
                name = row.get("name", "").strip()
                if not sedol or not _SEDOL_RE.match(sedol):
                    continue
                if sedol not in sedol_rows:
                    sedol_rows[sedol] = {"ticker_raw": ticker_raw, "name": name}

    uncached = [s for s in sedol_rows if s not in cache]
    print(f"SEDOL: {len(sedol_rows)} unique SEDOLs from PFFD | {len(cache)} cached | {len(uncached)} to resolve")
    if not uncached:
        return

    # Step 1: parse series from name where possible (e.g. "BOH 8 PERP C" → "BOH-C")
    need_figi: list[str] = []
    resolved_from_norm = 0
    for sedol in uncached:
        meta = sedol_rows[sedol]
        normalized = normalize_ticker(meta["ticker_raw"])
        if normalized:
            cache[sedol] = normalized
            resolved_from_norm += 1
        else:
            need_figi.append(sedol)
    save_json(cache, CUSIP_CACHE_FILE)
    print(f"  Normalized {resolved_from_norm} from ticker_raw; {len(need_figi)} need OpenFIGI.")

    # Step 2: OpenFIGI SEDOL lookup for plain-equity base tickers
    for i in range(0, len(need_figi), 10):
        batch = need_figi[i:i+10]
        print(f"  OpenFIGI SEDOL batch {i//10+1}/{(len(need_figi)+9)//10}: {batch}")
        results = figi_batch([{"idType": "ID_SEDOL", "idValue": x} for x in batch], api_key)
        for sedol, result in zip(batch, results):
            meta = sedol_rows[sedol]
            base = meta["ticker_raw"].upper().strip()
            if result and result.get("ticker"):
                figi_t = result["ticker"]
                if base and _PLAIN_EQUITY_RE.match(base):
                    cache[sedol] = extract_series_from_figi_desc(base, figi_t)
                elif base:
                    cache[sedol] = normalize_ticker(base) or base
                else:
                    figi_base_m = re.match(r"^([A-Z]{1,6})\b", figi_t.strip())
                    if figi_base_m:
                        cache[sedol] = extract_series_from_figi_desc(figi_base_m.group(1), figi_t)
                    else:
                        cache[sedol] = base or sedol
            else:
                cache[sedol] = normalize_ticker(base) or base or ""
        save_json(cache, CUSIP_CACHE_FILE)
        if i + 10 < len(need_figi):
            time.sleep(2.5)

    print(f"SEDOL cache now has {len(cache)} entries.")


# ── entry point ───────────────────────────────────────────────────────────────

def main(api_key: str | None = None):
    resolve_isins(api_key)
    resolve_cusips(api_key)
    resolve_sedols(api_key)


if __name__ == "__main__":
    key = os.environ.get("OPENFIGI_API_KEY") or (sys.argv[1] if len(sys.argv) > 1 else None)
    main(key)
