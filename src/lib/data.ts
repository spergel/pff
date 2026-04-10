import fs from "fs";
import path from "path";
import Papa from "papaparse";
import type { DailySummary, FlowRow, Holding, PredictedFlow, TickerInfo, DayAggregate, TickerAggregate, OverlapEntry, ConsensusRow } from "@/src/types/pff";

const DATA_ROOT = path.join(process.cwd(), "data");

export const SUPPORTED_ETFS = ["PFF", "PGX", "FPE", "PFFA"] as const;
export type EtfTicker = typeof SUPPORTED_ETFS[number];

function readCsv<T>(filePath: string): T[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const result = Papa.parse<T>(content, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
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
  const raw = JSON.parse(fs.readFileSync(cachePath, "utf-8")) as Record<string, TickerInfo>;
  return new Map(Object.entries(raw));
}

export function listHoldingDates(etf: EtfTicker = "PFF"): string[] {
  const dir = path.join(DATA_ROOT, etf, "holdings");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".csv"))
    .map((f) => f.replace(".csv", ""))
    .sort()
    .reverse();
}

export function listFlowDates(etf: EtfTicker = "PFF"): string[] {
  const dir = path.join(DATA_ROOT, etf, "flows");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".csv"))
    .map((f) => f.replace(".csv", ""))
    .sort()
    .reverse();
}

export function loadHoldings(date: string, etf: EtfTicker = "PFF"): Holding[] {
  const filePath = path.join(DATA_ROOT, etf, "holdings", `${date}.csv`);
  if (!fs.existsSync(filePath)) return [];

  const cache = loadTickerCache();

  return readCsv<Record<string, string>>(filePath).map((row) => {
    const isin = row.isin ?? "";
    const cached = cache.get(isin);
    const resolvedTicker = cached?.resolved && cached.ticker ? cached.ticker : null;

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

export function loadFlows(date: string, etf: EtfTicker = "PFF"): FlowRow[] {
  const filePath = path.join(DATA_ROOT, etf, "flows", `${date}.csv`);
  if (!fs.existsSync(filePath)) return [];

  return readCsv<Record<string, string>>(filePath).map((row) => ({
    date: row.date ?? date,
    isin: row.isin ?? "",
    cusip: row.cusip ?? "",
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

export function loadLatestHoldings(etf: EtfTicker = "PFF"): { date: string; holdings: Holding[] } | null {
  const dates = listHoldingDates(etf);
  if (!dates.length) return null;
  return { date: dates[0], holdings: loadHoldings(dates[0], etf) };
}

export function loadLatestFlows(etf: EtfTicker = "PFF"): { date: string; flows: FlowRow[] } | null {
  const dates = listFlowDates(etf);
  if (!dates.length) return null;
  return { date: dates[0], flows: loadFlows(dates[0], etf) };
}

export function loadPredictedFlows(): PredictedFlow[] {
  const filePath = path.join(DATA_ROOT, "predicted_flows.csv");
  if (!fs.existsSync(filePath)) return [];
  return readCsv<Record<string, string>>(filePath).map((row) => ({
    baseline_date: row.baseline_date ?? "",
    current_date: row.current_date ?? "",
    isin: row.isin ?? "",
    ticker: row.ticker ?? "",
    name: row.name ?? "",
    sector: row.sector ?? "",
    baseline_price: num(row.baseline_price),
    current_price: num(row.current_price),
    price_return_pct: num(row.price_return_pct),
    drift_ratio: num(row.drift_ratio),
    baseline_weight_pct: num(row.baseline_weight_pct),
    implied_weight_pct: num(row.implied_weight_pct),
    weight_gap_pct: num(row.weight_gap_pct),
    predicted_dollar_flow: num(row.predicted_dollar_flow),
    predicted_action: (row.predicted_action as PredictedFlow["predicted_action"]) ?? "FLAT",
  }));
}

export function loadDailySummary(etf?: EtfTicker): DayAggregate[] {
  const filePath = path.join(DATA_ROOT, "daily_summary.json");
  if (!fs.existsSync(filePath)) return [];
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as {
    days: Array<{ date: string; etfs: Record<string, Omit<DayAggregate, "date">> }>;
  };

  return raw.days.map((d) => {
    if (etf) {
      // Return per-ETF day or zeros
      const etfDay = d.etfs?.[etf];
      return { date: d.date, ...(etfDay ?? { buys: 0, sells: 0, added: 0, removed: 0, suspect: 0, total_buy_dollars: 0, total_sell_dollars: 0, num_changes: 0, sector_net: {} }) };
    }
    // Merge all ETFs into one aggregate
    const merged: DayAggregate = { date: d.date, buys: 0, sells: 0, added: 0, removed: 0, suspect: 0, total_buy_dollars: 0, total_sell_dollars: 0, num_changes: 0, sector_net: {} };
    for (const etfData of Object.values(d.etfs ?? {})) {
      merged.buys += etfData.buys ?? 0;
      merged.sells += etfData.sells ?? 0;
      merged.added += etfData.added ?? 0;
      merged.removed += etfData.removed ?? 0;
      merged.suspect += etfData.suspect ?? 0;
      merged.total_buy_dollars += etfData.total_buy_dollars ?? 0;
      merged.total_sell_dollars += etfData.total_sell_dollars ?? 0;
      merged.num_changes += etfData.num_changes ?? 0;
      for (const [sector, val] of Object.entries(etfData.sector_net ?? {})) {
        merged.sector_net[sector] = (merged.sector_net[sector] ?? 0) + val;
      }
    }
    return merged;
  });
}

export function loadTickerSummary(etf?: EtfTicker): Record<string, TickerAggregate> {
  const filePath = path.join(DATA_ROOT, "ticker_summary.json");
  if (!fs.existsSync(filePath)) return {};
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { tickers: Record<string, TickerAggregate & { etf?: string }> };
  if (!etf) return raw.tickers;
  // Filter to just the requested ETF (keys are namespaced as "ETF:symbol")
  return Object.fromEntries(
    Object.entries(raw.tickers).filter(([k]) => k.startsWith(`${etf}:`))
  );
}

export function buildFlowHistory(limit = 30, etf: EtfTicker = "PFF"): DailySummary[] {
  const dates = listFlowDates(etf).slice(0, limit).reverse();
  return dates.map((date) => {
    const flows = loadFlows(date, etf);
    let buys = 0, sells = 0, added = 0, removed = 0, suspect = 0;
    let total_buy_dollars = 0, total_sell_dollars = 0;

    for (const f of flows) {
      const d = f.dollar_flow ?? 0;
      switch (f.flow_type) {
        case "BUY": buys++; total_buy_dollars += d; break;
        case "SELL": sells++; total_sell_dollars += Math.abs(d); break;
        case "ADDED": added++; total_buy_dollars += d; break;
        case "REMOVED": removed++; total_sell_dollars += Math.abs(d); break;
        case "SUSPECT": suspect++; break;
      }
    }

    return { date, buys, sells, added, removed, suspect, total_buy_dollars, total_sell_dollars, num_changes: flows.filter((f) => f.flow_type !== "UNCHANGED").length };
  });
}

export interface ConsensusFrequencyRow {
  cusip: string;
  ticker: string;
  name: string;
  sector: string;
  buyDays: number;
  sellDays: number;
  recentConsensus: "BUY" | "SELL";
  etfs: string[];
  lastCombinedFlow: number;
}

export function buildConsensusHistory(limit = 14): ConsensusFrequencyRow[] {
  const overlap = loadOverlapSummary();
  const dates = listFlowDates("PFF").slice(0, limit);

  const counts: Record<string, {
    buyDays: number;
    sellDays: number;
    recentConsensus: "BUY" | "SELL" | null;
    etfs: Set<string>;
    lastFlow: number;
  }> = {};

  for (const date of dates) {
    const rows = computeConsensus(date, overlap);
    for (const row of rows) {
      if (!counts[row.cusip]) {
        counts[row.cusip] = { buyDays: 0, sellDays: 0, recentConsensus: null, etfs: new Set(), lastFlow: 0 };
      }
      if (row.consensus === "BUY") counts[row.cusip].buyDays++;
      else counts[row.cusip].sellDays++;
      if (counts[row.cusip].recentConsensus === null) {
        counts[row.cusip].recentConsensus = row.consensus;
        counts[row.cusip].lastFlow = row.combined_flow;
        for (const etf of row.etfs) counts[row.cusip].etfs.add(etf);
      }
    }
  }

  return Object.entries(counts)
    .filter(([, s]) => s.buyDays + s.sellDays >= 2)
    .map(([cusip, s]) => {
      const entry = overlap.by_cusip[cusip];
      const ticker = Object.values(entry?.etfs ?? {}).find((e) => e.ticker)?.ticker ?? "";
      const name = entry?.name ?? "";
      const sector = Object.values(entry?.etfs ?? {}).find((e) => e.sector)?.sector ?? "";
      return {
        cusip,
        ticker,
        name,
        sector,
        buyDays: s.buyDays,
        sellDays: s.sellDays,
        recentConsensus: (s.recentConsensus ?? "BUY") as "BUY" | "SELL",
        etfs: Array.from(s.etfs),
        lastCombinedFlow: s.lastFlow,
      };
    })
    .sort((a, b) => b.buyDays + b.sellDays - (a.buyDays + a.sellDays));
}

export function loadOverlapSummary(): { by_cusip: Record<string, OverlapEntry>; isin_to_cusip: Record<string, string> } {
  const filePath = path.join(DATA_ROOT, "overlap_summary.json");
  if (!fs.existsSync(filePath)) return { by_cusip: {}, isin_to_cusip: {} };
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

const BUY_TYPES = new Set(["BUY", "ADDED"]);
const SELL_TYPES = new Set(["SELL", "REMOVED"]);

export function computeConsensus(date: string, overlap: { by_cusip: Record<string, OverlapEntry> }): ConsensusRow[] {
  const rows: ConsensusRow[] = [];

  for (const entry of Object.values(overlap.by_cusip)) {
    if (entry.num_etfs < 2) continue;

    const etfMoves: { etf: string; flow_type: string; dollar_flow: number }[] = [];
    for (const [etf, data] of Object.entries(entry.etfs)) {
      const hist = data.history.find((h) => h.date === date);
      if (hist && hist.flow_type !== "UNCHANGED") {
        etfMoves.push({ etf, flow_type: hist.flow_type, dollar_flow: hist.dollar_flow });
      }
    }

    if (etfMoves.length < 2) continue;

    const buying = etfMoves.filter((m) => BUY_TYPES.has(m.flow_type));
    const selling = etfMoves.filter((m) => SELL_TYPES.has(m.flow_type));

    let consensus: "BUY" | "SELL" | null = null;
    if (buying.length >= 2 && selling.length === 0) consensus = "BUY";
    else if (selling.length >= 2 && buying.length === 0) consensus = "SELL";
    if (!consensus) continue;

    const combinedFlow = etfMoves.reduce((s, m) => s + m.dollar_flow, 0);
    const etfList = etfMoves.map((m) => m.etf);

    // Pick ticker/sector from first ETF that has one
    let ticker = "";
    let sector = "";
    for (const data of Object.values(entry.etfs)) {
      if (data.ticker) { ticker = data.ticker; }
      if (data.sector) { sector = data.sector; }
    }

    rows.push({
      cusip: entry.cusip,
      name: entry.name,
      ticker,
      sector,
      consensus,
      etfs: etfList,
      etf_count: etfList.length,
      combined_flow: combinedFlow,
    });
  }

  return rows.sort((a, b) => Math.abs(b.combined_flow) - Math.abs(a.combined_flow));
}
