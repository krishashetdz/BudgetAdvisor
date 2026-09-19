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
  elapsed_ms: number; proven_optimal: boolean; stop_reason: string | null;
  trace: TraceNode[]; trace_omitted: number;
}
export interface Run {
  id: string; title: string; created_at: string; saved: boolean; snapshot: Snapshot;
  fifo: SolverResult; lc: SolverResult; recommended_strategy: 'fifo' | 'lc'; comparison_complete: boolean;
}
export const money = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const number = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });