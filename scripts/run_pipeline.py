"""
Orchestrator: runs the full data pipeline for each configured ETF.
Accepts an optional date argument (YYYYMMDD) for manual backfill.

Per-ETF steps:
  1. Fetch holdings
  2. Resolve tickers (passive/index ETFs only)
  3. Compute flows
  4. Enrich flows (ADV + signal metrics)
  5. Predict flows (passive/index ETFs only)

Cross-ETF step:
  6. Build history summaries (daily_summary.json, ticker_summary.json)
"""

import os
import sys

# Anchor all data/ paths to the repo root regardless of launch directory.
# scripts/ is kept on sys.path so sibling-module imports continue to work.
_SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.dirname(_SCRIPTS_DIR)
os.chdir(_REPO_ROOT)
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)
import fetch_holdings
import fetch_pgx
import fetch_fpe
import fetch_pffa
import resolve_tickers
import compute_flows
import enrich_flows
import predict_flows
import build_history
from etf_config import ETFS

# Maps provider -> fetch function
FETCHERS = {
    "ishares": fetch_holdings.main,
    "invesco": fetch_pgx.main,
    "firsttrust": fetch_fpe.main,
    "virtus": fetch_pffa.main,
}


def run_etf(etf: str, cfg: dict, date_arg: str | None):
    print(f"\n{'='*50}")
    print(f"  ETF: {etf} — {cfg['name']}")
    print(f"{'='*50}")

    fetcher = FETCHERS.get(cfg["provider"])
    if not fetcher:
        print(f"  No fetcher for provider '{cfg['provider']}', skipping.")
        return False

    print(f"\n--- Step 1: Fetch holdings ---")
    wrote = fetcher(date_arg)
    if not wrote:
        print(f"  No new holdings for {etf} — skipping remaining steps.")
        return False

    if cfg.get("resolve_tickers"):
        print(f"\n--- Step 2: Resolve tickers ---")
        resolve_tickers.main()

    print(f"\n--- Step 3: Compute flows ---")
    compute_flows.main(etf, cfg.get("key_field", "isin"))

    print(f"\n--- Step 4: Enrich flows ---")
    enrich_flows.main(etf)

    if cfg.get("predict"):
        print(f"\n--- Step 5: Predict flows ---")
        predict_flows.main()

    return True


def main():
    date_arg = sys.argv[1] if len(sys.argv) > 1 else None

    any_wrote = False
    for etf, cfg in ETFS.items():
        wrote = run_etf(etf, cfg, date_arg)
        any_wrote = any_wrote or wrote

    if not any_wrote:
        print("\nNo new holdings for any ETF — stopping.")
        sys.exit(0)

    print(f"\n{'='*50}")
    print("  Step 6: Build history summaries")
    print(f"{'='*50}")
    build_history.main()

    print("\nPipeline complete.")


if __name__ == "__main__":
    main()
