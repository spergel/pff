import fs from "fs";
import path from "path";
import Papa from "papaparse";
import type { DailySummary, FlowRow, Holding, TickerInfo } from "@/src/types/pff";

const DATA_ROOT = path.join(process.cwd(), "data");

function readCsv<T>(filePath: string): T[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const result = Papa.parse<T>(content, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false, // we parse numbers ourselves to handle "-" placeholders
  });
  return result.data;
}

function num(v: string | undefined): number | null {
  if (!v || v === "-" || v === "") return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function loadTickerCache(): Map<string, TickerInfo> {
  const cachePath = path.join(DATA_ROOT, "ticker_cache.json");
  if (!fs.existsSync(cachePath)) return new Map();
  const raw = JSON.parse(fs.readFileSync(cachePath, "utf-8")) as Record<
    string,
    TickerInfo
  >;
  return new Map(Object.entries(raw));
}

export function listHoldingDates(): string[] {
  const dir = path.join(DATA_ROOT, "holdings");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".csv"))
    .map((f) => f.replace(".csv", ""))
    .sort()
    .reverse();
}

export function listFlowDates(): string[] {
  const dir = path.join(DATA_ROOT, "flows");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".csv"))
    .map((f) => f.replace(".csv", ""))
    .sort()
    .reverse();
}

export function loadHoldings(date: string): Holding[] {
  const filePath = path.join(DATA_ROOT, "holdings", `${date}.csv`);
  if (!fs.existsSync(filePath)) return [];

  const cache = loadTickerCache();

  return readCsv<Record<string, string>>(filePath).map((row) => {
    const isin = row.isin ?? "";
    const cached = cache.get(isin);
    const resolvedTicker =
      cached?.resolved && cached.ticker ? cached.ticker : null;

    return {
      date: row.date ?? date,
      isin,
      cusip: row.cusip ?? "",
      ticker_raw: row.ticker_raw ?? "",
      ticker: resolvedTicker ?? row.ticker_raw ?? "",
      name: row.name ?? "",
      sector: row.sector ?? "",
      asset_class: row.asset_class ?? "",
      mkt_val: num(row.mkt_val),
      weight: num(row.weight),
      shares: num(row.shares),
      price: num(row.price),
      currency: row.currency ?? "",
      exchange: row.exchange ?? "",
      country: row.country ?? "",
    };
  });
}

export function loadFlows(date: string): FlowRow[] {
  const filePath = path.join(DATA_ROOT, "flows", `${date}.csv`);
  if (!fs.existsSync(filePath)) return [];

  return readCsv<Record<string, string>>(filePath).map((row) => ({
    date: row.date ?? date,
    isin: row.isin ?? "",
    ticker: row.ticker ?? row.ticker_raw ?? "",
    ticker_raw: row.ticker_raw ?? "",
    name: row.name ?? "",
    sector: row.sector ?? "",
    prior_shares: num(row.prior_shares),
    today_shares: num(row.today_shares),
    shares_delta: num(row.shares_delta),
    prior_weight: num(row.prior_weight),
    today_weight: num(row.today_weight),
    weight_delta: num(row.weight_delta),
    price: num(row.price),
    dollar_flow: num(row.dollar_flow),
    flow_type: (row.flow_type as FlowRow["flow_type"]) ?? "UNCHANGED",
    gap_days: parseInt(row.gap_days ?? "1", 10),
    yahoo_ticker: row.yahoo_ticker || null,
    adv_30d: num(row.adv_30d),
    overhang_days: num(row.overhang_days),
    par_value: num(row.par_value),
    price_vs_par_pct: num(row.price_vs_par_pct),
    signal_score: num(row.signal_score),
  }));
}

export function loadLatestHoldings(): { date: string; holdings: Holding[] } | null {
  const dates = listHoldingDates();
  if (!dates.length) return null;
  return { date: dates[0], holdings: loadHoldings(dates[0]) };
}

export function loadLatestFlows(): { date: string; flows: FlowRow[] } | null {
  const dates = listFlowDates();
  if (!dates.length) return null;
  return { date: dates[0], flows: loadFlows(dates[0]) };
}

export function buildFlowHistory(limit = 30): DailySummary[] {
  const dates = listFlowDates().slice(0, limit).reverse();
  return dates.map((date) => {
    const flows = loadFlows(date);
    let buys = 0,
      sells = 0,
      added = 0,
      removed = 0,
      suspect = 0;
    let total_buy_dollars = 0,
      total_sell_dollars = 0;

    for (const f of flows) {
      const d = f.dollar_flow ?? 0;
      switch (f.flow_type) {
        case "BUY":
          buys++;
          total_buy_dollars += d;
          break;
        case "SELL":
          sells++;
          total_sell_dollars += Math.abs(d);
          break;
        case "ADDED":
          added++;
          total_buy_dollars += d;
          break;
        case "REMOVED":
          removed++;
          total_sell_dollars += Math.abs(d);
          break;
        case "SUSPECT":
          suspect++;
          break;
      }
    }

    return {
      date,
      buys,
      sells,
      added,
      removed,
      suspect,
      total_buy_dollars,
      total_sell_dollars,
      num_changes: flows.filter((f) => f.flow_type !== "UNCHANGED").length,
    };
  });
}
