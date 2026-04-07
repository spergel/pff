"""
Orchestrator: fetch_holdings -> resolve_tickers -> compute_flows.
Accepts an optional date argument (YYYYMMDD) for manual backfill.
"""

import sys
import fetch_holdings
import resolve_tickers
import compute_flows
import enrich_flows
import predict_flows
import build_history


def main():
    date_arg = sys.argv[1] if len(sys.argv) > 1 else None

    print("=== Step 1: Fetch holdings ===")
    wrote = fetch_holdings.main(date_arg)

    if not wrote:
        print("No new holdings file written -- stopping pipeline.")
        sys.exit(0)

    print("\n=== Step 2: Resolve tickers ===")
    resolve_tickers.main()

    print("\n=== Step 3: Compute flows ===")
    compute_flows.main()

    print("\n=== Step 4: Enrich flows (ADV + signal metrics) ===")
    enrich_flows.main()

    print("\n=== Step 5: Predict next rebalancing flows ===")
    predict_flows.main()

    print("\n=== Step 6: Build history summaries ===")
    build_history.main()

    print("\nPipeline complete.")


if __name__ == "__main__":
    main()
