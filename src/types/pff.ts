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
  etf?: string; // set when merging across ETFs
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

export interface PredictedFlow {
  baseline_date: string;
  current_date: string;
  isin: string;
  ticker: string;
  name: string;
  sector: string;
  baseline_price: number | null;
  current_price: number | null;
  price_return_pct: number | null;
  drift_ratio: number | null;
  baseline_weight_pct: number | null;
  implied_weight_pct: number | null;
  weight_gap_pct: number | null;
  predicted_dollar_flow: number | null;
  predicted_action: "SELL" | "BUY" | "FLAT";
}

export interface DayAggregate {
  date: string;
  buys: number;
  sells: number;
  added: number;
  removed: number;
  suspect: number;
  total_buy_dollars: number;
  total_sell_dollars: number;
  num_changes: number;
  sector_net: Record<string, number>;
}

export interface TickerActivityDay {
  date: string;
  flow_type: FlowType;
  dollar_flow: number;
  shares_delta: number;
  today_shares: number | null;
  signal_score: number | null;
}

export interface TickerAggregate {
  isin: string;
  ticker: string;
  name: string;
  sector: string;
  buy_days: number;
  sell_days: number;
  added_days: number;
  removed_days: number;
  suspect_days: number;
  total_buy_dollars: number;
  total_sell_dollars: number;
  net_dollar_flow: number;
  net_shares_delta: number;
  current_streak: number;
  last_flow_type: FlowType | "UNCHANGED";
  last_date: string;
  history: TickerActivityDay[];
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
