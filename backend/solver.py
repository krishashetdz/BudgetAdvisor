"""Deterministic 0/1 Knapsack Branch and Bound Solver (FIFO & Least Cost).

Project Group ID: G12
Assigned Topic: 0/1 Knapsack using FIFO Branch and Bound and Least Cost (LC) Branch and Bound.

All monetary costs, budgets, and utility/return scores use exact integer hundredths
to eliminate IEEE-754 binary floating-point rounding drift.

Node-Counting & Search-Limit Terminology
----------------------------------------
Let:
  - n = number of available input items (0 <= n <= 24).
  - k_gen (`generated`) = total search-tree nodes created and pushed into the frontier
        (root + 2 children per expanded node, so k_gen = 1 + 2 * expanded).
  - k_exp (`visited`) = total search-tree nodes popped (explored) from the frontier.
  - `pruned` = total explored nodes discarded without expansion
        (`infeasible_pruned + bound_pruned`).
  - m (`frontier_remaining` at termination, peak `max_queue_size` during search) =
        number of live nodes currently held in the search frontier (FIFO deque or LC heap),
        satisfying `generated = visited + frontier_remaining` at all times.
  - `request.max_nodes` (default 50,000) = configured search node limit applied strictly to
        explored (`visited`) nodes (`visited <= request.max_nodes`). Because each expanded
        node generates two children (`include` and `exclude`), `generated` can exceed
        `request.max_nodes` (up to `2 * visited + 1 <= 100,001` nodes).
  - k = asymptotic search-tree node count (since k_exp <= k_gen <= 2 * k_exp + 1,
        k_gen = Theta(k_exp) = Theta(k), with 1 <= k <= 2^(n+1) - 1 in an uncapped tree).

Algorithmic & Implementation-Accurate Complexity Summary
--------------------------------------------------------
1. Preprocessing & Rational Density Sorting:
   Items are converted to integer hundredths in O(n) and sorted once in descending order of
   exact rational value-to-cost density (v_i / c_i) via `Fraction(score_hundredths, cost_hundredths)`,
   breaking ties by original item index:
     - Time Complexity: O(n log n)
     - Auxiliary Space: O(n)

2. Fractional-Knapsack Upper-Bound Calculation (`upper(depth, cost, score)`):
   Computes the continuous relaxation upper bound by greedily filling remaining budget
   capacity `room = budget - cost` from `items[depth:]` and rounding the final fractional
   slice UP to the nearest integer hundredth:
     `bound += (value * room + price - 1) // price`
   Stops immediately if `value <= 0` because remaining items have non-positive density.
     - Time Complexity per Call: O(n - depth) = O(n) worst case
     - Auxiliary Space: O(1)

3. Child-Node Generation (`include` then `exclude`):
   Each expanded internal node at `depth < n` generates two children (`take=True`, `take=False`).
   The `include` child copies and extends the immutable tuple `node.chosen + (original,)` of
   length <= depth <= n in O(n) time, while `exclude` reuses `node.chosen` in O(1) time;
   both invoke `upper(depth + 1, ...)` in O(n) time:
     - Time Complexity per Expanded Node: O(n)

4. Feasibility Checking, Selected-Index Sorting & Pruning per Explored Node:
   - Budget feasibility check (`node.cost > budget`): O(1) integer comparison per explored node.
     Infeasible nodes are immediately pruned (`infeasible_pruned += 1`, `status = 'pruned_budget'`).
   - Selected-index sorting (`indices = tuple(sorted(node.chosen))`): Executed for every
     budget-feasible explored node (`node.cost <= budget`) because `node.chosen` accumulates
     original item indices in profit-density order rather than ascending index order. Sorting
     up to `depth <= n` indices takes O(n log n) time in the worst case, followed by O(n)
     tuple comparison for canonical tie-breaking `(-score, cost, indices)`.
   - Upper-bound pruning check (`node.bound < best_score`): O(1) integer comparison.
     Uses strict inequality (`<`) so equal-bound nodes (`node.bound == best_score`) remain
     searchable to guarantee canonical tie-breaking (lowest cost, then lexicographically
     first original indices).

5. Frontier Operations & Overall Time Complexity (FIFO vs. LC):
   - FIFO Branch and Bound (`collections.deque`):
       * Queue Enqueue (`append`) and Dequeue (`popleft`): O(1) amortized per node.
       * Per-Node Processing Cost: O(n log n) worst case (dominated by `tuple(sorted(node.chosen))`
         plus O(n) upper-bound calculation and tuple copying).
       * Parameterized Search Time (for k nodes): O(k n log n).
       * Combined Time Complexity: O(n log n + k n log n) = O(k n log n).
       * Best-Case Time: O(n log n) when search prunes immediately at the root (k = Theta(1)),
         or O(n^2 log n) when strong pruning explores only a single principal root-to-leaf path
         of k = Theta(n) nodes.
       * Average-Case Time (input-dependent expected nodes E[k_FIFO]):
         O(n log n + E[k_FIFO] * n log n).
       * Worst-Case Time (ineffective pruning, k = Theta(2^n)):
         O(2^n * n log n).
   - Least Cost (LC) Branch and Bound (`heapq` binary min-heap on `(-node.bound, node.id, node)`):
       * Priority Queue Insert (`heappush`) and Extract-Min (`heappop`): O(log m) <= O(log k)
         per node, where m <= k is the live heap size. Priority ties on `-node.bound` are broken
         in O(1) by monotonic creation order `node.id`.
       * Per-Node Processing Cost: O(n log n + log m) <= O(n log n + log k).
       * Combined Parameterized Time Complexity:
         O(n log n + k(n log n + log k))  [or O(n log n + k(n log n + log m))].
       * Best-Case Time: O(n log n) for immediate root resolution (k = Theta(1)), or
         O(n log n + n(n log n + log n)) = O(n^2 log n) when strong pruning dives directly
         along k = Theta(n) nodes.
       * Average-Case Time (input-dependent expected nodes E[k_LC]):
         O(n log n + E[k_LC] * (n log n + log E[k_LC])).
       * Worst-Case Time (k = Theta(2^n), where log_2(k) = Theta(n) <= n log n):
         O(2^n * (n log n + n)) = O(2^n * n log n).

6. Space Complexity Analysis:
   - 1. Number of Stored Search Nodes: At most m_max (`max_queue_size`) live nodes in the
        frontier (O(m_max) <= O(k), worst-case O(2^n) nodes in an uncapped tree).
   - 2. Memory per Search Node: Each `Node` instance stores scalar attributes in O(1) plus
        `chosen: tuple[int, ...]` of length <= depth <= n, requiring O(n) space per node
        in the worst case.
   - 3. Maximum Search-Frontier Space: O(n * m_max) <= O(n * k) memory (worst-case O(n * 2^n)
        for O(2^n) frontier nodes each holding up to O(n) chosen indices).
   - 4. Total Algorithm Space: O(n + n * m_max + k_exp) <= O(n * k) (worst-case O(n * 2^n)),
        comprising the O(n) sorted item array, O(n) incumbent index tuple, O(n * m_max) live
        frontier, O(min(k_gen, 30)) = O(1) visualization `trace` dictionary, and O(k_exp)
        sampled `SearchFrame` progress snapshots.
"""
from collections import deque
from dataclasses import dataclass
from fractions import Fraction
import heapq
import sys
from time import perf_counter
from typing import Optional
from models import SolveRequest, SolverResult, TraceNode, SearchFrame


_dataclass_kwargs = {'slots': True} if sys.version_info >= (3, 10) else {}


@dataclass(**_dataclass_kwargs)
class Node:
    id: int
    parent: Optional[int]
    depth: int
    cost: int
    score: int
    chosen: tuple[int, ...]
    bound: int
    decision: str


def solve(request: SolveRequest, strategy: str, on_progress=None) -> SolverResult:
    """Execute 0/1 Knapsack using FIFO ('fifo') or Least Cost ('lc') Branch and Bound."""
    if strategy not in ('fifo', 'lc'):
        raise ValueError('Unknown strategy')
    start = perf_counter()
    budget = int(request.budget * 100)
    items = [(idx, int(i.cost * 100), int(i.score * 100)) for idx, i in enumerate(request.items)]
    # Step 1: O(n log n) exact rational sort by descending score/cost ratio, tie-broken by original index
    items.sort(key=lambda i: (-Fraction(i[2], i[1]), i[0]))

    def upper(depth, cost, score):
        """O(n - depth) fractional-knapsack continuous relaxation upper bound."""
        if cost > budget:
            return -(10 ** 30)
        room, bound = budget - cost, score
        for _, price, value in items[depth:]:
            if value <= 0:
                break
            if price <= room:
                bound += value
                room -= price
            else:
                # Ceiling in score hundredths is a conservative upper (never lower) bound.
                bound += (value * room + price - 1) // price
                break
        return bound

    root = Node(0, None, 0, 0, 0, (), upper(0, 0, 0), 'root')
    queue, heap = deque(), []
    trace: dict[int, TraceNode] = {}
    best_score, best_cost, best_indices = 0, 0, ()
    generated, visited, bound_pruned, infeasible_pruned, expanded = 0, 0, 0, 0, 0
    max_queue_size = 0
    progress = []

    def record():
        frame = SearchFrame(visited=visited, pruned=bound_pruned + infeasible_pruned,
                            best_score=best_score / 100, frontier=len(queue) if strategy == 'fifo' else len(heap),
                            generated=generated)
        if not progress or progress[-1].visited != visited:
            progress.append(frame)
        if on_progress:
            on_progress({'type': 'progress', 'strategy': strategy, **frame.model_dump(),
                         'trace': [t.model_dump() for t in trace.values()]})

    def push(node):
        nonlocal generated, max_queue_size
        generated += 1
        if strategy == 'fifo':
            # O(1) FIFO queue enqueue
            queue.append(node)
            current_q = len(queue)
        else:
            # O(log m) LC min-heap push keyed by (-node.bound, node.id)
            heapq.heappush(heap, (-node.bound, node.id, node))
            current_q = len(heap)
        if current_q > max_queue_size:
            max_queue_size = current_q
        if len(trace) < 30:
            trace[node.id] = TraceNode(
                id=node.id, parent=node.parent, depth=node.depth, decision=node.decision,
                item_name=request.items[items[node.depth - 1][0]].name if node.depth else None,
                cost=node.cost / 100, score=node.score / 100,
                bound=node.bound / 100 if node.cost <= budget else None, status='frontier')
        elif node.parent in trace:
            trace[node.parent].hidden_children += 1

    push(root)
    stop_reason = None
    while queue if strategy == 'fifo' else heap:
        if visited >= request.max_nodes:
            stop_reason = 'node_limit'
            break
        if (perf_counter() - start) * 1000 >= request.time_limit_ms:
            stop_reason = 'time_limit'
            break
        node = queue.popleft() if strategy == 'fifo' else heapq.heappop(heap)[2]
        visited += 1
        status = 'expanded'
        if node.cost > budget:
            # O(1) feasibility pruning: node exceeds budget
            infeasible_pruned += 1
            status = 'pruned_budget'
        else:
            # O(n log n) worst-case sort of chosen original indices for canonical tie-breaking
            indices = tuple(sorted(node.chosen))
            # Canonical tie-breaking: max score -> min cost -> lexicographically first original indices
            if (-node.score, node.cost, indices) < (-best_score, best_cost, best_indices):
                best_score, best_cost, best_indices = node.score, node.cost, indices
            if node.bound < best_score:
                # O(1) upper-bound pruning: optimistic bound cannot reach incumbent best_score
                bound_pruned += 1
                status = 'pruned_bound'
            elif node.depth == len(items):
                status = 'leaf'
            else:
                expanded += 1
                original, price, value = items[node.depth]
                for take in (True, False):
                    cost = node.cost + (price if take else 0)
                    score = node.score + (value if take else 0)
                    push(Node(generated, node.id, node.depth + 1, cost, score,
                              node.chosen + (original,) if take else node.chosen,
                              upper(node.depth + 1, cost, score), 'include' if take else 'exclude'))
        if node.id in trace:
            trace[node.id].status = status
            trace[node.id].visit_order = visited
        # Every initial visit is retained; long searches are bounded/sampled.
        # Every visible-node visit is preserved even beyond the sampling limit.
        if visited <= 100 or visited % 250 == 0 or node.id in trace:
            record()

    # Mark only rendered nodes whose decisions agree with the chosen solution.
    selected = set(best_indices)
    for t in trace.values():
        if t.parent is None:
            t.on_solution = True
        elif t.parent in trace:
            expected_take = items[t.depth - 1][0] in selected
            t.on_solution = trace[t.parent].on_solution and (t.decision == 'include') == expected_take
    remaining = len(queue) if strategy == 'fifo' else len(heap)
    record()
    return SolverResult(
        strategy=strategy, selected_ids=[request.items[i].id for i in best_indices],
        total_cost=best_cost / 100, total_score=best_score / 100,
        remaining_budget=(budget - best_cost) / 100, visited=visited, generated=generated,
        pruned=bound_pruned + infeasible_pruned, bound_pruned=bound_pruned,
        infeasible_pruned=infeasible_pruned, expanded=expanded, frontier_remaining=remaining,
        max_queue_size=max_queue_size,
        elapsed_ms=round((perf_counter() - start) * 1000, 3), proven_optimal=remaining == 0,
        stop_reason=stop_reason, trace=list(trace.values()), trace_omitted=generated - len(trace), progress=progress)


def solve_pair(request: SolveRequest):
    fifo, lc = solve(request, 'fifo'), solve(request, 'lc')
    def rank(result):
        indices = tuple(i for i, item in enumerate(request.items) if item.id in result.selected_ids)
        return (-result.total_score, result.total_cost, indices)
    return fifo, lc, 'fifo' if rank(fifo) <= rank(lc) else 'lc'