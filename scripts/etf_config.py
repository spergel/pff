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
    "FPE": {
        "name": "First Trust Preferred Securities and Income ETF",
        "provider": "firsttrust",
        "key_field": "cusip",
        "predict": False,
        "resolve_tickers": False,
    },
}
