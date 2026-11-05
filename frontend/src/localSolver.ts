import {
  BenchmarkAlgorithmMetrics,
  BenchmarkRequestPayload,
  BenchmarkResponse,
  BenchmarkRow,
  Dataset,
  DPResult,
  Item,
  Mode,
  Run,
  SearchFrame,
  SensitivityInsight,
  SensitivityPoint,
  SensitivityRequestPayload,
  SensitivityResponse,
  Snapshot,
  SolverResult,
  TraceNode,
} from './types';
import { hundredths } from './manualSelection';

export const SHOPPING_ROWS: [string, number, number][] = [
  ['Everyday backpack', 2800, 82],
  ['Wireless headphones', 3500, 90],
  ['Mechanical keyboard', 2200, 78],
  ['Everyday sneakers', 4200, 88],
  ['Fitness smartwatch', 3800, 85],
  ['Insulated water bottle', 800, 55],
  ['LED desk lamp', 1400, 65],
  ['The reading collection', 1200, 72],
];

export const INVESTMENT_ROWS: [string, number, number][] = [
  ['Atlas index fund', 4000, 12.5],
  ['Cedar green energy', 2500, 16],
  ['Meridian technology', 3500, 18],
  ['Harbor bond fund', 2000, 7.5],
  ['Orion healthcare', 3000, 14],
  ['Maple consumer fund', 1500, 9],
  ['Summit infrastructure', 4500, 17],
  ['Willow small-cap fund', 2200, 15.5],
];

const SHOPPING_BENCHMARK_POOL: [string, number, number][] = [
  ...SHOPPING_ROWS,
  ['Noise-cancelling earbuds', 2400, 80],
  ['Ergonomic mouse', 1800, 74],
  ['Portable SSD 1TB', 5200, 92],
  ['USB-C docking station', 3100, 81],
  ['Smart desk mat', 950, 58],
  ['Webcam 1080p', 2600, 76],
  ['Monitor light bar', 1900, 71],
  ['Laptop stand aluminum', 1350, 69],
  ['Blue-light glasses', 1100, 60],
  ['Travel power bank', 2100, 79],
  ['Acoustic foam pack', 1600, 62],
  ['Mechanical numpad', 1450, 64],
  ['Cable organizer kit', 650, 52],
  ['Smart plug duo', 1250, 63],
  ['Document scanner', 4600, 87],
  ['Microfiber desk pad', 750, 54],
];

const INVESTMENT_BENCHMARK_POOL: [string, number, number][] = [
  ...INVESTMENT_ROWS,
  ['Quantum semiconductor ETF', 3800, 19.5],
  ['Sovereign gilt trust', 1800, 6.8],
  ['Renewable grid REIT', 3200, 15.2],
  ['Global logistics fund', 2900, 13.4],
  ['Biotech innovation basket', 4200, 20.0],
  ['Agri-tech value fund', 1700, 8.6],
  ['Clean water municipal bond', 1400, 6.2],
  ['Emerging fintec equity', 3600, 17.8],
  ['High-dividend utilities', 2600, 11.9],
  ['Aerospace defense index', 4400, 18.4],
  ['Legacy retail turnaround', 1600, -2.5],
  ['Robotics automation ETF', 3900, 18.9],
  ['Digital payments trust', 2400, 13.8],
  ['Battery materials fund', 3100, 14.6],
  ['Speculative commodity note', 1900, -4.0],
  ['Mid-cap industrial growth', 2750, 14.2],
];

export function getDefaultDatasets(): Record<Mode, Dataset> {
  const build = (mode: Mode, rows: [string, number, number][]): Dataset => ({
    mode,
    budget: '10000',
    items: rows.map(([name, cost, score], i) => ({
      id: `${mode}-${i + 1}`,
      name,
      cost: String(cost),
      score: String(score),
    })),
  });
  return {
    shopping: build('shopping', SHOPPING_ROWS),
    investment: build('investment', INVESTMENT_ROWS),
  };
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a || 1;
}

interface InternalNode {
  id: number;
  parent: number | null;
  depth: number;
  cost: number;
  score: number;
  chosen: number[];
  bound: number;
  decision: string;
}

function tupleCompare(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

function isBetterCandidate(
  candScore: number,
  candCost: number,
  candIndices: number[],
  bestScore: number,
  bestCost: number,
  bestIndices: number[]
): boolean {
  if (candScore !== bestScore) return candScore > bestScore;
  if (candCost !== bestCost) return candCost < bestCost;
  return tupleCompare(candIndices, bestIndices) < 0;
}

class MinHeap {
  private data: { negBound: number; id: number; node: InternalNode }[] = [];

  get length(): number {
    return this.data.length;
  }

  private less(i: number, j: number): boolean {
    const a = this.data[i];
    const b = this.data[j];
    if (a.negBound !== b.negBound) return a.negBound < b.negBound;
    return a.id < b.id;
  }

  push(item: { negBound: number; id: number; node: InternalNode }): void {
    this.data.push(item);
    let idx = this.data.length - 1;
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this.less(idx, parent)) {
        const tmp = this.data[idx];
        this.data[idx] = this.data[parent];
        this.data[parent] = tmp;
        idx = parent;
      } else {
        break;
      }
    }
  }

  pop(): InternalNode {
    const top = this.data[0].node;
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      let idx = 0;
      const n = this.data.length;
      while (true) {
        let smallest = idx;
        const left = 2 * idx + 1;
        const right = 2 * idx + 2;
        if (left < n && this.less(left, smallest)) smallest = left;
        if (right < n && this.less(right, smallest)) smallest = right;
        if (smallest !== idx) {
          const tmp = this.data[idx];
          this.data[idx] = this.data[smallest];
          this.data[smallest] = tmp;
          idx = smallest;
        } else {
          break;
        }
      }
    }
    return top;
  }
}

export function solveStrategy(
  snapshot: Snapshot,
  strategy: 'fifo' | 'lc',
  onProgress?: (event: any) => void
): SolverResult {
  const start = performance.now();
  const budget = hundredths(snapshot.budget) ?? Math.round(Number(snapshot.budget) * 100);
  const items = snapshot.items.map((item, idx) => ({
    idx,
    cost: hundredths(item.cost) ?? Math.round(Number(item.cost) * 100),
    score: hundredths(item.score) ?? Math.round(Number(item.score) * 100),
  }));

  items.sort((a, b) => {
    const gA = gcd(a.score, a.cost);
    const numA = BigInt(Math.trunc(a.score / gA));
    const denA = BigInt(Math.trunc(a.cost / gA));
    const gB = gcd(b.score, b.cost);
    const numB = BigInt(Math.trunc(b.score / gB));
    const denB = BigInt(Math.trunc(b.cost / gB));
    const lhs = numA * denB;
    const rhs = numB * denA;
    if (lhs > rhs) return -1;
    if (lhs < rhs) return 1;
    return a.idx - b.idx;
  });

  function upper(depth: number, cost: number, score: number): number {
    if (cost > budget) return -1e30;
    let room = budget - cost;
    let bound = score;
    for (let i = depth; i < items.length; i++) {
      const price = items[i].cost;
      const value = items[i].score;
      if (value <= 0) break;
      if (price <= room) {
        bound += value;
        room -= price;
      } else {
        bound += Math.floor((value * room + price - 1) / price);
        break;
      }
    }
    return bound;
  }

  const root: InternalNode = {
    id: 0,
    parent: null,
    depth: 0,
    cost: 0,
    score: 0,
    chosen: [],
    bound: upper(0, 0, 0),
    decision: 'root',
  };

  const queue: InternalNode[] = [];
  let qHead = 0;
  const heap = new MinHeap();
  const traceMap = new Map<number, TraceNode>();
  const traceOrder: TraceNode[] = [];

  let bestScore = 0;
  let bestCost = 0;
  let bestIndices: number[] = [];
  let generated = 0;
  let visited = 0;
  let boundPruned = 0;
  let infeasiblePruned = 0;
  let expanded = 0;
  let maxQueueSize = 0;
  const progress: SearchFrame[] = [];

  const frontierLen = () => (strategy === 'fifo' ? queue.length - qHead : heap.length);

  function record() {
    const frame: SearchFrame = {
      visited,
      pruned: boundPruned + infeasiblePruned,
      best_score: bestScore / 100,
      frontier: frontierLen(),
      generated,
    };
    if (!progress.length || progress[progress.length - 1].visited !== visited) {
      progress.push(frame);
    }
    if (onProgress) {
      onProgress({
        type: 'progress',
        strategy,
        ...frame,
        trace: traceOrder.map(t => ({ ...t })),
      });
    }
  }

  function push(node: InternalNode) {
    generated += 1;
    if (strategy === 'fifo') {
      queue.push(node);
    } else {
      heap.push({ negBound: -node.bound, id: node.id, node });
    }
    const curQ = frontierLen();
    if (curQ > maxQueueSize) maxQueueSize = curQ;
    if (traceMap.size < 30) {
      const tNode: TraceNode = {
        id: node.id,
        parent: node.parent,
        depth: node.depth,
        decision: node.decision,
        item_name: node.depth ? snapshot.items[items[node.depth - 1].idx].name : null,
        cost: node.cost / 100,
        score: node.score / 100,
        bound: node.cost <= budget ? node.bound / 100 : null,
        status: 'frontier',
        visit_order: null,
        hidden_children: 0,
        on_solution: false,
      };
      traceMap.set(node.id, tNode);
      traceOrder.push(tNode);
    } else if (node.parent !== null && traceMap.has(node.parent)) {
      traceMap.get(node.parent)!.hidden_children += 1;
    }
  }

  push(root);
  let stopReason: string | null = null;

  while (frontierLen() > 0) {
    if (visited >= snapshot.max_nodes) {
      stopReason = 'node_limit';
      break;
    }
    if (performance.now() - start >= snapshot.time_limit_ms) {
      stopReason = 'time_limit';
      break;
    }
    const node = strategy === 'fifo' ? queue[qHead++] : heap.pop();
    visited += 1;
    let status = 'expanded';
    if (node.cost > budget) {
      infeasiblePruned += 1;
      status = 'pruned_budget';
    } else {
      const indices = [...node.chosen].sort((a, b) => a - b);
      if (isBetterCandidate(node.score, node.cost, indices, bestScore, bestCost, bestIndices)) {
        bestScore = node.score;
        bestCost = node.cost;
        bestIndices = indices;
      }
      if (node.bound < bestScore) {
        boundPruned += 1;
        status = 'pruned_bound';
      } else if (node.depth === items.length) {
        status = 'leaf';
      } else {
        expanded += 1;
        const currentItem = items[node.depth];
        for (const take of [true, false]) {
          const nextCost = node.cost + (take ? currentItem.cost : 0);
          const nextScore = node.score + (take ? currentItem.score : 0);
          push({
            id: generated,
            parent: node.id,
            depth: node.depth + 1,
            cost: nextCost,
            score: nextScore,
            chosen: take ? [...node.chosen, currentItem.idx] : node.chosen,
            bound: upper(node.depth + 1, nextCost, nextScore),
            decision: take ? 'include' : 'exclude',
          });
        }
      }
    }
    const traced = traceMap.get(node.id);
    if (traced) {
      traced.status = status;
      traced.visit_order = visited;
    }
    if (visited <= 100 || visited % 250 === 0 || traced) {
      record();
    }
  }

  const selectedSet = new Set(bestIndices);
  for (const t of traceOrder) {
    if (t.parent === null) {
      t.on_solution = true;
    } else if (traceMap.has(t.parent)) {
      const expectedTake = selectedSet.has(items[t.depth - 1].idx);
      t.on_solution = traceMap.get(t.parent)!.on_solution && (t.decision === 'include') === expectedTake;
    }
  }

  const remaining = frontierLen();
  record();
  return {
    strategy,
    selected_ids: bestIndices.map(i => snapshot.items[i].id),
    total_cost: bestCost / 100,
    total_score: bestScore / 100,
    remaining_budget: (budget - bestCost) / 100,
    visited,
    generated,
    pruned: boundPruned + infeasiblePruned,
    bound_pruned: boundPruned,
    infeasible_pruned: infeasiblePruned,
    expanded,
    frontier_remaining: remaining,
    max_queue_size: maxQueueSize,
    elapsed_ms: Math.max(0.01, Number((performance.now() - start).toFixed(3))),
    proven_optimal: remaining === 0,
    stop_reason: stopReason,
    trace: traceOrder,
    trace_omitted: generated - traceOrder.length,
    progress,
  };
}

const MAX_DP_STATES = 50000;
const MAX_DP_EVALUATIONS = 200000;

export function solveDP(snapshot: Snapshot, onProgress?: (event: any) => void): DPResult {
  const start = performance.now();
  const budget = hundredths(snapshot.budget) ?? Math.round(Number(snapshot.budget) * 100);
  const states = new Map<number, { score: number; chosen: number[] }>();
  states.set(0, { score: 0, chosen: [] });

  let evaluated = 1;
  let completed = 0;
  let reason: string | null = null;

  for (let index = 0; index < snapshot.items.length; index++) {
    const item = snapshot.items[index];
    const price = hundredths(item.cost) ?? Math.round(Number(item.cost) * 100);
    const value = hundredths(item.score) ?? Math.round(Number(item.score) * 100);
    const previous = Array.from(states.entries());

    for (const [cost, state] of previous) {
      if (evaluated >= MAX_DP_EVALUATIONS) {
        reason = 'state_evaluation_limit';
        break;
      }
      if (performance.now() - start >= snapshot.time_limit_ms) {
        reason = 'time_limit';
        break;
      }
      evaluated += 1;
      const nextCost = cost + price;
      if (nextCost <= budget) {
        const candScore = state.score + value;
        const candChosen = [...state.chosen, index];
        const old = states.get(nextCost);
        if (!old && states.size >= MAX_DP_STATES) {
          reason = 'retained_state_limit';
          break;
        }
        if (
          !old ||
          candScore > old.score ||
          (candScore === old.score && tupleCompare(candChosen, old.chosen) < 0)
        ) {
          states.set(nextCost, { score: candScore, chosen: candChosen });
        }
      }
    }
    if (reason) break;
    completed += 1;
    if (onProgress) {
      onProgress({
        type: 'progress',
        strategy: 'dp',
        states_explored: evaluated,
        items_completed: completed,
        total_items: snapshot.items.length,
      });
    }
  }

  let bestCost = 0;
  let bestScore = 0;
  let bestChosen: number[] = [];

  for (const [cost, state] of states.entries()) {
    if (isBetterCandidate(state.score, cost, state.chosen, bestScore, bestCost, bestChosen)) {
      bestScore = state.score;
      bestCost = cost;
      bestChosen = state.chosen;
    }
  }

  return {
    total_score: bestScore / 100,
    total_cost: bestCost / 100,
    selected_ids: bestChosen.map(i => snapshot.items[i].id),
    states_explored: evaluated,
    retained_states: states.size,
    items_completed: completed,
    elapsed_ms: Math.max(0.01, Number((performance.now() - start).toFixed(3))),
    proven_optimal: reason === null,
    stop_reason: reason,
  };
}

const STORAGE_RUNS_KEY = 'budget_advisor_saved_runs_v1';
const sessionRuns = new Map<string, Run>();

export function getLocalSavedRuns(): Run[] {
  try {
    const raw = localStorage.getItem(STORAGE_RUNS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setLocalSavedRuns(runs: Run[]): void {
  try {
    localStorage.setItem(STORAGE_RUNS_KEY, JSON.stringify(runs.slice(0, 100)));
  } catch {
    // Ignore storage quota errors
  }
}

export function saveLocalRun(runId: string, title: string): Run {
  const savedList = getLocalSavedRuns();
  const existingIdx = savedList.findIndex(r => r.id === runId);
  const baseRun = existingIdx >= 0 ? savedList[existingIdx] : sessionRuns.get(runId);
  if (!baseRun) {
    throw new Error('This run was not found or has expired.');
  }
  if (existingIdx < 0 && savedList.length >= 100) {
    throw new Error('Saved-run limit reached (100). Remove a run first.');
  }
  const updated: Run = { ...baseRun, saved: true, title: title.trim() };
  sessionRuns.set(runId, updated);
  if (existingIdx >= 0) {
    savedList[existingIdx] = updated;
  } else {
    savedList.unshift(updated);
  }
  setLocalSavedRuns(savedList);
  return updated;
}

export function deleteLocalRun(runId: string): void {
  const savedList = getLocalSavedRuns();
  const filtered = savedList.filter(r => r.id !== runId);
  setLocalSavedRuns(filtered);
  const mem = sessionRuns.get(runId);
  if (mem) {
    sessionRuns.set(runId, { ...mem, saved: false });
  }
}

export function registerRunInMemory(run: Run): void {
  sessionRuns.set(run.id, run);
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'run-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36);
}

export function computeLocalRun(snapshot: Snapshot, onProgress?: (event: any) => void): Run {
  const fifo = solveStrategy(snapshot, 'fifo', onProgress);
  const lc = solveStrategy(snapshot, 'lc', onProgress);
  const dp = solveDP(snapshot, onProgress);

  const rankIndices = (res: SolverResult) =>
    snapshot.items
      .map((item, idx) => (res.selected_ids.includes(item.id) ? idx : -1))
      .filter(idx => idx >= 0);

  const fifoIndices = rankIndices(fifo);
  const lcIndices = rankIndices(lc);

  const fifoBetterOrEqual =
    fifo.total_score > lc.total_score ||
    (fifo.total_score === lc.total_score &&
      (fifo.total_cost < lc.total_cost ||
        (fifo.total_cost === lc.total_cost && tupleCompare(fifoIndices, lcIndices) <= 0)));

  const budgetNum = Number(snapshot.budget);
  const formattedBudget = Number.isFinite(budgetNum)
    ? budgetNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : snapshot.budget;
  const modeTitle = snapshot.mode.charAt(0).toUpperCase() + snapshot.mode.slice(1);

  const run: Run = {
    id: generateId(),
    title: `${modeTitle} · ₹${formattedBudget}`,
    created_at: new Date().toISOString(),
    saved: false,
    snapshot,
    fifo,
    lc,
    dp,
    recommended_strategy: fifoBetterOrEqual ? 'fifo' : 'lc',
    comparison_complete: fifo.proven_optimal && lc.proven_optimal,
  };
  registerRunInMemory(run);
  return run;
}

// --- Client-side fallback implementations for Benchmarking, Sensitivity, and CSV export ---

function generateLocalBenchmarkDataset(
  mode: Mode,
  size: number,
  seed = 42,
  customItems?: Item[],
  explicitBudget?: string
): { items: Item[]; budget: string } {
  const items: Item[] = [];
  if (customItems && customItems.length > 0) {
    const baseLen = customItems.length;
    for (let idx = 0; idx < size; idx++) {
      const src = customItems[idx % baseLen];
      if (idx < baseLen) {
        items.push({ id: `bench-${size}-${idx + 1}`, name: src.name, cost: src.cost, score: src.score });
      } else {
        const factor = 0.85 + (0.35 * ((idx * 7 + seed) % 11)) / 10;
        const nextCost = Math.max(1, Math.min(10000000, Number((Number(src.cost) * factor).toFixed(2))));
        const delta = ((idx * 5 + seed) % 9 - 4) * 1.25;
        let nextScore = Number((Number(src.score) + delta).toFixed(2));
        if (mode === 'shopping') nextScore = Math.max(0, Math.min(100, nextScore));
        items.push({
          id: `bench-${size}-${idx + 1}`,
          name: `${src.name} #${idx + 1}`,
          cost: nextCost.toFixed(2),
          score: nextScore.toFixed(2),
        });
      }
    }
  } else {
    const pool = mode === 'shopping' ? SHOPPING_BENCHMARK_POOL : INVESTMENT_BENCHMARK_POOL;
    for (let idx = 0; idx < size; idx++) {
      const [baseName, baseCost, baseScore] = pool[idx % pool.length];
      const pseudo = ((seed * 31 + size * 17 + idx * 13) % 29) - 12;
      const costVal = Math.max(100, baseCost + pseudo * 15);
      let scoreVal = baseScore + (((seed + idx * 7) % 9) - 4);
      if (mode === 'shopping') scoreVal = Math.max(5, Math.min(100, Math.round(scoreVal)));
      items.push({
        id: `${mode}-b${size}-${idx + 1}`,
        name: idx < pool.length ? baseName : `${baseName} ${idx + 1}`,
        cost: costVal.toFixed(2),
        score: scoreVal.toFixed(2),
      });
    }
  }

  let budgetNum = explicitBudget !== undefined ? Number(explicitBudget) : NaN;
  if (!Number.isFinite(budgetNum)) {
    const posSum = items.reduce((acc, it) => (Number(it.score) > 0 ? acc + Number(it.cost) : acc), 0);
    budgetNum = Math.round((posSum > 0 ? posSum : 10000) * 0.45);
  }
  return { items, budget: budgetNum.toFixed(2) };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(3));
}

export function runLocalBenchmarkSuite(req: BenchmarkRequestPayload): BenchmarkResponse {
  const uniqueSizes = Array.from(new Set(req.sizes)).sort((a, b) => a - b);
  // Warm-up run
  const warm = generateLocalBenchmarkDataset(req.mode, Math.min(5, uniqueSizes[0] || 5), req.seed || 42);
  solveStrategy({ mode: req.mode, items: warm.items, budget: warm.budget, max_nodes: 500, time_limit_ms: 250 }, 'fifo');
  solveStrategy({ mode: req.mode, items: warm.items, budget: warm.budget, max_nodes: 500, time_limit_ms: 250 }, 'lc');

  const rows: BenchmarkRow[] = uniqueSizes.map(size => {
    const { items, budget } = generateLocalBenchmarkDataset(
      req.mode,
      size,
      req.seed || 42,
      req.dataset_source === 'custom' ? req.custom_items : undefined,
      req.budget
    );
    const snap: Snapshot = {
      mode: req.mode,
      items,
      budget,
      max_nodes: req.max_nodes,
      time_limit_ms: req.time_limit_ms,
    };

    const measure = (strat: 'fifo' | 'lc'): BenchmarkAlgorithmMetrics => {
      const times: number[] = [];
      let last!: SolverResult;
      for (let r = 0; r < req.repetitions; r++) {
        last = solveStrategy(snap, strat);
        times.push(last.elapsed_ms);
      }
      return {
        strategy: strat,
        execution_time_ms: median(times),
        min_time_ms: Math.min(...times),
        max_time_ms: Math.max(...times),
        nodes_generated: last.generated,
        nodes_explored: last.visited,
        nodes_pruned: last.pruned,
        bound_pruned: last.bound_pruned,
        infeasible_pruned: last.infeasible_pruned,
        max_queue_size: last.max_queue_size ?? 0,
        optimal_value: last.total_score,
        selected_cost: last.total_cost,
        remaining_budget: last.remaining_budget,
        selected_ids: last.selected_ids,
        proven_optimal: last.proven_optimal,
        stop_reason: last.stop_reason,
      };
    };

    const fifo = measure('fifo');
    const lc = measure('lc');
    const dp = solveDP(snap);

    const fifoMatchesDp = fifo.optimal_value === dp.total_score;
    const lcMatchesDp = lc.optimal_value === dp.total_score;
    const fifoMatchesLc = fifo.optimal_value === lc.optimal_value;
    const allProven = fifo.proven_optimal && lc.proven_optimal && dp.proven_optimal;
    const allAgree = allProven && fifoMatchesDp && lcMatchesDp && fifoMatchesLc;

    const statusLabel = allAgree
      ? 'Verified Optimal (FIFO = LC = DP)'
      : fifoMatchesDp && lcMatchesDp
      ? 'Values match, but search capped'
      : 'Suboptimal / Divergent due to execution limit';

    return {
      dataset_size: size,
      budget: Number(budget),
      fifo,
      lc,
      verification: {
        dp_optimal_value: dp.total_score,
        dp_selected_cost: dp.total_cost,
        dp_selected_ids: dp.selected_ids,
        dp_states_explored: dp.states_explored,
        dp_execution_time_ms: dp.elapsed_ms,
        dp_proven_optimal: dp.proven_optimal,
        dp_stop_reason: dp.stop_reason,
        fifo_matches_dp: fifoMatchesDp,
        lc_matches_dp: lcMatchesDp,
        fifo_matches_lc: fifoMatchesLc,
        all_agree: allAgree,
        status_label: statusLabel,
      },
    };
  });

  return {
    mode: req.mode,
    dataset_source: req.dataset_source,
    repetitions: req.repetitions,
    warmup_performed: true,
    generated_at: new Date().toISOString(),
    hardware_note:
      'Measured using high-resolution performance timers (median across repetitions after warm-up). Actual execution time depends on hardware and runtime conditions.',
    rows,
  };
}

export function runLocalSensitivityAnalysis(req: SensitivityRequestPayload): SensitivityResponse {
  const minB = Number(req.min_budget);
  const maxB = Number(req.max_budget);
  const count = Math.max(2, req.intervals);
  const budgets: number[] = [];
  for (let i = 0; i < count; i++) {
    const val = minB === maxB ? minB : minB + ((maxB - minB) * i) / (count - 1);
    const rounded = Number(val.toFixed(2));
    if (!budgets.length || budgets[budgets.length - 1] !== rounded) budgets.push(rounded);
  }

  const nameMap = new Map(req.items.map(i => [i.id, i.name]));
  const points: SensitivityPoint[] = budgets.map((b, idx) => {
    const snap: Snapshot = {
      mode: req.mode,
      items: req.items,
      budget: b.toFixed(2),
      max_nodes: req.max_nodes,
      time_limit_ms: req.time_limit_ms,
    };
    const lc = solveStrategy(snap, 'lc');
    const dp = solveDP(snap);
    const fifo = req.include_fifo_comparison ? solveStrategy(snap, 'fifo') : null;
    const verified =
      lc.proven_optimal &&
      dp.proven_optimal &&
      lc.total_score === dp.total_score &&
      (!fifo || (fifo.proven_optimal && fifo.total_score === dp.total_score));

    return {
      step_index: idx + 1,
      budget: b,
      recommended_strategy: 'lc',
      optimal_score: lc.total_score,
      total_expenditure: lc.total_cost,
      remaining_budget: lc.remaining_budget,
      selected_item_count: lc.selected_ids.length,
      selected_ids: lc.selected_ids,
      selected_names: lc.selected_ids.map(id => nameMap.get(id) || id),
      lc_score: lc.total_score,
      lc_cost: lc.total_cost,
      lc_time_ms: lc.elapsed_ms,
      lc_visited: lc.visited,
      lc_pruned: lc.pruned,
      lc_proven_optimal: lc.proven_optimal,
      lc_stop_reason: lc.stop_reason,
      fifo_score: fifo ? fifo.total_score : null,
      fifo_cost: fifo ? fifo.total_cost : null,
      fifo_time_ms: fifo ? fifo.elapsed_ms : null,
      fifo_visited: fifo ? fifo.visited : null,
      fifo_pruned: fifo ? fifo.pruned : null,
      fifo_proven_optimal: fifo ? fifo.proven_optimal : null,
      fifo_stop_reason: fifo ? fifo.stop_reason : null,
      dp_score: dp.total_score,
      dp_proven_optimal: dp.proven_optimal,
      verified_optimal: verified,
      verification_status: verified ? 'Verified Optimal (Matches DP)' : 'Search Capped — Not Proven Optimal',
    };
  });

  const insights: SensitivityInsight[] = [];
  if (points.length > 0) {
    const first = points[0];
    const last = points[points.length - 1];
    const gain = Number((last.optimal_score - first.optimal_score).toFixed(2));
    if (gain > 0) {
      insights.push({
        category: 'improvement',
        title: 'Budget expansion increased achievable score',
        description: `Increasing the available budget from ₹${first.budget.toLocaleString('en-IN')} to ₹${last.budget.toLocaleString('en-IN')} improved the maximum achievable score from ${first.optimal_score} to ${last.optimal_score} (+${gain} points).`,
      });
    } else {
      insights.push({
        category: 'plateau',
        title: 'Selected budget range did not alter optimal score',
        description: `Across ₹${first.budget.toLocaleString('en-IN')} to ₹${last.budget.toLocaleString('en-IN')}, the optimal achievable score remained constant at ${first.optimal_score} points.`,
      });
    }
    for (let i = 1; i < points.length; i++) {
      if (points[i].selected_ids.join(',') === points[i - 1].selected_ids.join(',')) {
        insights.push({
          category: 'plateau',
          title: 'Stepwise budget plateau detected',
          description: `Increasing the budget from ₹${points[i - 1].budget.toLocaleString('en-IN')} to ₹${points[i].budget.toLocaleString('en-IN')} did not change the selected combination (score stayed ${points[i].optimal_score} points).`,
        });
        break;
      }
    }
  }

  return {
    mode: req.mode,
    min_budget: minB,
    max_budget: maxB,
    intervals: points.length,
    generated_at: new Date().toISOString(),
    points,
    insights,
  };
}

export function buildLocalBenchmarkCsv(bench: BenchmarkResponse): string {
  const headers = [
    'Dataset Size',
    'Mode',
    'Budget (INR)',
    'Algorithm',
    'Execution Time Median (ms)',
    'Execution Time Min (ms)',
    'Execution Time Max (ms)',
    'Nodes Generated',
    'Nodes Explored',
    'Nodes Pruned',
    'Bound Pruned',
    'Infeasible Pruned',
    'Max Queue Size',
    'Optimal Value',
    'Selected Cost (INR)',
    'Remaining Budget (INR)',
    'Proven Optimal',
    'Stop Reason',
    'DP Optimal Value',
    'Matches DP',
    'Verification Status',
  ];
  const lines = [headers.join(',')];
  for (const row of bench.rows) {
    for (const [m, matchDp] of [
      [row.fifo, row.verification.fifo_matches_dp],
      [row.lc, row.verification.lc_matches_dp],
    ] as const) {
      lines.push(
        [
          row.dataset_size,
          bench.mode,
          row.budget.toFixed(2),
          m.strategy.toUpperCase(),
          m.execution_time_ms.toFixed(3),
          m.min_time_ms.toFixed(3),
          m.max_time_ms.toFixed(3),
          m.nodes_generated,
          m.nodes_explored,
          m.nodes_pruned,
          m.bound_pruned,
          m.infeasible_pruned,
          m.max_queue_size,
          m.optimal_value.toFixed(2),
          m.selected_cost.toFixed(2),
          m.remaining_budget.toFixed(2),
          m.proven_optimal ? 'Yes' : 'No',
          m.stop_reason || 'completed',
          row.verification.dp_optimal_value.toFixed(2),
          matchDp ? 'Yes' : 'No',
          `"${row.verification.status_label.replace(/"/g, '""')}"`,
        ].join(',')
      );
    }
  }
  return lines.join('\n');
}
