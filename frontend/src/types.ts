export type Mode = 'shopping' | 'investment';
export interface Item { id: string; name: string; cost: string; score: string }
export interface Dataset { mode: Mode; items: Item[]; budget: string }
export interface Snapshot extends Dataset { max_nodes: number; time_limit_ms: number }
export interface TraceNode {
  id: number; parent: number | null; depth: number; decision: string;
  item_name: string | null; cost: number; score: number; bound: number | null;
  status: string; visit_order: number | null; hidden_children: number; on_solution: boolean;
}
export interface SolverResult {
  strategy: string; selected_ids: string[]; total_cost: number; total_score: number;
  remaining_budget: number; visited: number; generated: number; pruned: number;
  bound_pruned: number; infeasible_pruned: number; expanded: number; frontier_remaining: number;
  max_queue_size?: number;
  elapsed_ms: number; proven_optimal: boolean; stop_reason: string | null;
  trace: TraceNode[]; trace_omitted: number;
  progress?: SearchFrame[];
}
export interface SearchFrame { visited: number; pruned: number; best_score: number; frontier: number; generated: number }
export interface DPResult { total_score: number; total_cost: number; selected_ids: string[]; states_explored: number; retained_states: number; items_completed: number; elapsed_ms: number; proven_optimal: boolean; stop_reason: string | null }
export interface LiveSearch extends SearchFrame { trace: TraceNode[] }
export interface LiveProgress { fifo?: LiveSearch; lc?: LiveSearch; dp?: { states_explored: number; items_completed: number; total_items: number } }
export interface Run {
  id: string; title: string; created_at: string; saved: boolean; snapshot: Snapshot;
  fifo: SolverResult; lc: SolverResult; recommended_strategy: 'fifo' | 'lc'; comparison_complete: boolean;
  dp?: DPResult | null;
}

export const SHARED_BENCHMARK_SIZES = [5, 10, 15, 20, 24];
export const SHARED_BENCHMARK_REPETITIONS = 3;
export const CUSTOM_VARIATION_DISCLOSURE =
  'Datasets exceeding the original custom item count are expanded using reproducible variations derived from the original dataset. These additional entries are generated for algorithm scalability testing and are not independently entered real-world products.';

// Feature 1: Performance Benchmarking types
export interface BenchmarkRequestPayload {
  dataset_name?: string;
  mode: Mode;
  dataset_source: 'generated' | 'custom';
  sizes: number[];
  repetitions: number;
  seed?: number;
  budget?: string;
  custom_items?: Item[];
  max_nodes: number;
  time_limit_ms: number;
}

export interface BenchmarkAlgorithmMetrics {
  strategy: 'fifo' | 'lc';
  execution_time_ms: number;
  min_time_ms: number;
  max_time_ms: number;
  nodes_generated: number;
  nodes_explored: number;
  nodes_pruned: number;
  bound_pruned: number;
  infeasible_pruned: number;
  max_queue_size: number;
  optimal_value: number;
  selected_cost: number;
  remaining_budget: number;
  selected_ids: string[];
  proven_optimal: boolean;
  stop_reason: string | null;
}

export interface BenchmarkVerification {
  dp_optimal_value: number;
  dp_selected_cost: number;
  dp_selected_ids: string[];
  dp_states_explored: number;
  dp_execution_time_ms: number;
  dp_proven_optimal: boolean;
  dp_stop_reason: string | null;
  fifo_matches_dp: boolean;
  lc_matches_dp: boolean;
  fifo_matches_lc: boolean;
  all_agree: boolean;
  status_label: string;
}

export interface BenchmarkRow {
  dataset_size: number;
  original_dataset_size?: number;
  expanded_dataset_size?: number;
  uses_generated_variations?: boolean;
  budget: number;
  fifo: BenchmarkAlgorithmMetrics;
  lc: BenchmarkAlgorithmMetrics;
  verification: BenchmarkVerification;
}

export interface BenchmarkResponse {
  dataset_name?: string;
  mode: Mode;
  dataset_source: 'generated' | 'custom';
  original_dataset_size?: number;
  max_expanded_dataset_size?: number;
  uses_generated_variations?: boolean;
  expansion_note?: string;
  seed?: number;
  repetitions: number;
  warmup_performed: boolean;
  generated_at: string;
  hardware_note: string;
  rows: BenchmarkRow[];
}

// Feature 2: What-If Budget Sensitivity Analysis types
export interface SensitivityRequestPayload {
  mode: Mode;
  items: Item[];
  min_budget: string;
  max_budget: string;
  intervals: number;
  include_fifo_comparison: boolean;
  max_nodes: number;
  time_limit_ms: number;
}

export interface SensitivityPoint {
  step_index: number;
  budget: number;
  recommended_strategy: string;
  optimal_score: number;
  total_expenditure: number;
  remaining_budget: number;
  selected_item_count: number;
  selected_ids: string[];
  selected_names: string[];
  lc_score: number;
  lc_cost: number;
  lc_time_ms: number;
  lc_visited: number;
  lc_pruned: number;
  lc_proven_optimal: boolean;
  lc_stop_reason: string | null;
  fifo_score: number | null;
  fifo_cost: number | null;
  fifo_time_ms: number | null;
  fifo_visited: number | null;
  fifo_pruned: number | null;
  fifo_proven_optimal: boolean | null;
  fifo_stop_reason: string | null;
  dp_score: number;
  dp_proven_optimal: boolean;
  verified_optimal: boolean;
  verification_status: string;
}

export interface SensitivityInsight {
  category: 'improvement' | 'plateau' | 'threshold' | 'diminishing_returns' | 'efficiency';
  title: string;
  description: string;
}

export interface SensitivityResponse {
  mode: Mode;
  min_budget: number;
  max_budget: number;
  intervals: number;
  generated_at: string;
  points: SensitivityPoint[];
  insights: SensitivityInsight[];
}

// Feature 3: Report Export types
export interface ReportExportRequestPayload {
  dataset_name: string;
  run_id?: string;
  dataset_source?: 'custom' | 'generated';
  mode: Mode;
  items: Item[];
  budget: string;
  max_nodes: number;
  time_limit_ms: number;
  include_sensitivity: boolean;
  sensitivity_min_budget?: string;
  sensitivity_max_budget?: string;
  sensitivity_intervals?: number;
  include_benchmark?: boolean;
  benchmark_dataset_source?: 'custom' | 'generated';
  benchmark_sizes?: number[];
  benchmark_repetitions?: number;
  benchmark_seed?: number;
}

export const money = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const number = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });