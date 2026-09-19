"""Deterministic 0/1 B&B. All objective/cost arithmetic uses hundredths.

Visited means popped, including infeasible and bound-pruned nodes. Both
strategies enqueue the same include-then-exclude branches and use the same
conservative fractional upper bound. LC minimizes the negative upper bound.
Equal bounds are NOT pruned: score ties use lower spend, then original indices.
"""
from collections import deque
from dataclasses import dataclass
from fractions import Fraction
import heapq
from time import perf_counter
from models import SolveRequest, SolverResult, TraceNode, SearchFrame


@dataclass(slots=True)
class Node:
    id: int
    parent: int | None
    depth: int
    cost: int
    score: int
    chosen: tuple[int, ...]
    bound: int
    decision: str


def solve(request: SolveRequest, strategy: str, on_progress=None) -> SolverResult:
    if strategy not in ('fifo', 'lc'):
        raise ValueError('Unknown strategy')
    start = perf_counter()
    budget = int(request.budget * 100)
    items = [(idx, int(i.cost * 100), int(i.score * 100)) for idx, i in enumerate(request.items)]
    items.sort(key=lambda i: (-Fraction(i[2], i[1]), i[0]))

    def upper(depth, cost, score):
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
                # Ceiling in score hundredths is an upper (never lower) bound.
                bound += (value * room + price - 1) // price
                break
        return bound

    root = Node(0, None, 0, 0, 0, (), upper(0, 0, 0), 'root')
    queue, heap = deque(), []
    trace: dict[int, TraceNode] = {}
    best_score, best_cost, best_indices = 0, 0, ()
    generated, visited, bound_pruned, infeasible_pruned, expanded = 0, 0, 0, 0, 0
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
        nonlocal generated
        generated += 1
        if strategy == 'fifo':
            queue.append(node)
        else:
            heapq.heappush(heap, (-node.bound, node.id, node))
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
            infeasible_pruned += 1
            status = 'pruned_budget'
        else:
            indices = tuple(sorted(node.chosen))
            if (-node.score, node.cost, indices) < (-best_score, best_cost, best_indices):
                best_score, best_cost, best_indices = node.score, node.cost, indices
            if node.bound < best_score:
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
        elapsed_ms=round((perf_counter() - start) * 1000, 3), proven_optimal=remaining == 0,
        stop_reason=stop_reason, trace=list(trace.values()), trace_omitted=generated - len(trace), progress=progress)


def solve_pair(request: SolveRequest):
    fifo, lc = solve(request, 'fifo'), solve(request, 'lc')
    def rank(result):
        indices = tuple(i for i, item in enumerate(request.items) if item.id in result.selected_ids)
        return (-result.total_score, result.total_cost, indices)
    return fifo, lc, 'fifo' if rank(fifo) <= rank(lc) else 'lc'