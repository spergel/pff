"""
Registry of supported ETFs.

key_field: the column used as the primary row identifier in holdings/flow CSVs.
  - iShares products provide ISINs  -> key_field = "isin"
  - First Trust products use CUSIPs -> key_field = "cusip"

predict: whether to run the passive drift-prediction step (only valid for
  index/passive ETFs; skip for actively managed funds like FPE).

resolve_tickers: whether to run the OpenFIGI ticker resolution step.
  FPE already provides usable tickers in its holdings page.
"""

ETFS: dict[str, dict] = {
    "PFF": {
        "name": "iShares Preferred & Income Securities ETF",
        "provider": "ishares",
        "key_field": "isin",
        "predict": True,
        "resolve_tickers": True,
    },
    "PGX": {
        "name": "Invesco Preferred ETF",
        "provider": "invesco",
        "key_field": "cusip",
        "predict": False,
        "resolve_tickers": False,
    },
    "FPE": {
        "name": "First Trust Preferred Securities and Income ETF",
        "provider": "firsttrust",
        "key_field": "cusip",
        "predict": False,
        "resolve_tickers": False,
    },
    "PFFA": {
        "name": "Virtus InfraCap U.S. Preferred Stock ETF",
        "provider": "virtus",
        "key_field": "cusip",   # Virtus internal Security Id stored in cusip field
        "predict": False,       # Actively managed leveraged fund
        "resolve_tickers": False,
    },
    "PFFD": {
        "name": "Global X U.S. Preferred ETF",
        "provider": "globalx",
        "key_field": "cusip",   # SEDOL stored in cusip field (no CUSIP/ISIN provided)
        "predict": False,
        "resolve_tickers": False,
    },
    "PFXF": {
        "name": "VanEck Preferred Securities ex Financials ETF",
        "provider": "vaneck",
        "key_field": "isin",
        "predict": False,
        "resolve_tickers": False,
    },
}
