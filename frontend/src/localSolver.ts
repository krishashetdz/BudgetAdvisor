import { Dataset, Item, Mode, Run, Snapshot, SolverResult, TraceNode, SearchFrame, DPResult } from './types';
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
