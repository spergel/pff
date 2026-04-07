"""
Backfills historical PFF holdings for the past year (weekdays only).

Usage:
    python scripts/backfill.py                          # past 365 days
    python scripts/backfill.py --start 2025-01-01       # custom start
    python scripts/backfill.py --start 2025-01-01 --end 2025-06-01

After this completes, run:
    python scripts/resolve_tickers.py
    python scripts/compute_flows.py
"""

import argparse
import sys
import time
from datetime import date, timedelta

sys.path.insert(0, "scripts")
from fetch_holdings import fetch, save  # noqa: E402


def iter_weekdays(start: date, end: date):
    d = start
    while d <= end:
        if d.weekday() < 5:  # Mon–Fri
            yield d
        d += timedelta(days=1)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", default=None, help="Start date YYYY-MM-DD (default: 1 year ago)")
    parser.add_argument("--end", default=None, help="End date YYYY-MM-DD (default: yesterday)")
    args = parser.parse_args()

    today = date.today()
    end = date.fromisoformat(args.end) if args.end else today - timedelta(days=1)
    start = date.fromisoformat(args.start) if args.start else today - timedelta(days=365)

    days = [d for d in iter_weekdays(start, end)]
    print(f"Backfilling {len(days)} weekdays from {start} to {end}\n")

    fetched = skipped = failed = 0

    for i, d in enumerate(days):
        date_str = d.strftime("%Y%m%d")
        date_display = d.isoformat()

        import os
        dest = os.path.join("data/holdings", f"{date_display}.csv")
        if os.path.exists(dest):
            skipped += 1
            continue

        rows = fetch(date_str)
        if rows:
            save(rows, date_display)
            print(f"[{i+1}/{len(days)}] {date_display} — {len(rows)} holdings saved")
            fetched += 1
        else:
            print(f"[{i+1}/{len(days)}] {date_display} — no data (holiday/weekend)")
            failed += 1

        # Polite delay — iShares doesn't publish rate limits but ~1 req/sec is safe
        time.sleep(1.0)

    print(f"\nDone. fetched={fetched}  skipped={skipped}  no-data={failed}")
    print("\nNext steps:")
    print("  python scripts/resolve_tickers.py")
    print("  python scripts/compute_flows.py")


if __name__ == "__main__":
    main()
