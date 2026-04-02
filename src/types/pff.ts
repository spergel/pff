export interface Holding {
  date: string;
  isin: string;
  cusip: string;
  ticker_raw: string;
  ticker: string; // resolved preferred ticker, falls back to ticker_raw
  name: string;
  sector: string;
  asset_class: string;
  mkt_val: number | null;
  weight: number | null;
  shares: number | null;
  price: number | null;
  currency: string;
  exchange: string;
  country: string;
}

export type FlowType =
  | "ADDED"
  | "REMOVED"
  | "BUY"
  | "SELL"
  | "UNCHANGED"
  | "SUSPECT";

export interface FlowRow {
  date: string;
  isin: string;
  ticker: string;
  ticker_raw: string;
  name: string;
  sector: string;
  prior_shares: number | null;
  today_shares: number | null;
  shares_delta: number | null;
  prior_weight: number | null;
  today_weight: number | null;
  weight_delta: number | null;
  price: number | null;
  dollar_flow: number | null;
  flow_type: FlowType;
  gap_days: number;
  // enriched fields (present after enrich_flows.py runs)
  yahoo_ticker: string | null;
  adv_30d: number | null;
  overhang_days: number | null;
  par_value: number | null;
  price_vs_par_pct: number | null;
  signal_score: number | null;
}

export interface TickerInfo {
  ticker: string | null;
  name: string | null;
  exchCode: string | null;
  securityType: string | null;
  figi: string | null;
  resolved: boolean;
}

export interface DailySummary {
  date: string;
  buys: number;
  sells: number;
  added: number;
  removed: number;
  suspect: number;
  total_buy_dollars: number;
  total_sell_dollars: number;
  num_changes: number;
}
