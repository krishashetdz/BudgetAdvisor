"""Independent Sparse-Cost 0/1 Dynamic Programming Verification Solver.

Project Group ID: G12
Purpose: Independently computes and verifies the exact 0/1 Knapsack optimal value
and canonical item combination without using fractional upper bounds or search trees.

Implementation-Accurate Complexity Analysis
-------------------------------------------
Let:
  - n = number of available items (0 <= n <= 24).
  - W = integer budget capacity in hundredths (W = int(budget * 100)).
  - S_i = number of retained reachable cost states in `states` before processing item i
          (0 <= i < n), with S_0 = 1.
  - S = max_{0 <= i <= n} S_i <= min(W + 1, 2^n, MAX_STATES) = peak number of retained
        distinct cost states (capped at MAX_STATES = 50,000).
  - S_total = sum_{i=0}^{n-1} S_i <= n * S = total state transitions evaluated across all
        items (capped at MAX_EVALUATIONS = 200,000).

1. Standard Dense DP vs. Sparse-Cost DP:
   - A textbook dense 0/1 Knapsack DP allocates a table of size (n + 1) x (W + 1),
     requiring O(nW) pseudo-polynomial time and O(nW) (or O(W)) memory. Because budgets
     in BudgetAdvisor can reach Rs. 10,00,00,000 (W = 10^10 hundredths), a dense array of
     size W is memory-prohibitive.
   - Instead, `solve_dp` maintains a sparse hash map `states: dict[int, tuple[int, tuple[int, ...]]]`
     mapping each reachable exact cost `c <= W` to its best `(score, chosen_indices)`.

2. Per-Transition Tuple Copy & Time Complexity:
   - In iteration i (item `index = i`), `previous = list(states.items())` snapshots the S_i
     retained states in O(S_i) time.
   - For each feasible transition `next_cost = cost + price <= budget`, constructing
     `candidate = (score + value, chosen + (index,))` concatenates an immutable Python tuple
     `chosen` of length <= i <= n, which copies up to i + 1 elements in O(i + 1) = O(n)
     worst-case time. If `next_cost` already exists with an equal score, comparing
     `(-candidate[0], candidate[1]) < (-old[0], old[1])` also compares two tuples of length
     <= i + 1 in O(n) worst-case time.
   - Therefore:
       * State Transitions Evaluated: S_total = sum_{i=0}^{n-1} S_i = O(n * S) <= O(nW).
       * Actual Time Complexity (accounting for O(n) immutable tuple copy `chosen + (index,)`
         and lexicographic tie-breaking per transition):
         O(sum_{i=0}^{n-1} (i + 1) * S_i) = O(n * S_total) = O(n^2 * S) <= O(n^2 * min(W + 1, 2^n, MAX_STATES)).
   - Design Rationale for Retaining Immutable Tuples:
     Storing `chosen: tuple[int, ...]` directly in each state enables exact, thread-safe
     lexicographic index tie-breaking at identical `(cost, score)` without reconstructing paths
     through parent back-pointers on every tie, and for n <= 24 copying <= 24 tuple pointers
     is negligible in practice.

3. Space Complexity:
   - Retained State Count: O(S) dictionary entries in `states` (capped at MAX_STATES = 50,000),
     plus O(S) shallow tuple references in the per-item snapshot `previous`.
   - Memory per State: O(n) worst case for the `chosen` index tuple of length <= n.
   - Total DP Space Complexity: O(n * S) <= O(n * min(W + 1, 2^n, MAX_STATES)).

4. Canonical Tie-Breaking & Honest Safeguards:
   - At identical cost `next_cost`, a transition replaces the incumbent only if
     `(-candidate_score, candidate_indices) < (-old_score, old_indices)`.
   - Across all reachable costs at completion, the solver selects `min(states.items())`
     by `(-score, cost, chosen_indices)` in O(n * S) time, matching FIFO and LC Branch and Bound.
   - If `MAX_STATES`, `MAX_EVALUATIONS`, or `time_limit_ms` is reached, `proven_optimal`
     is set to `False` with an explicit `stop_reason`.
"""
from time import perf_counter
from models import SolveRequest, DPResult

MAX_STATES = 50_000
MAX_EVALUATIONS = 200_000


def solve_dp(request: SolveRequest, on_progress=None) -> DPResult:
    start = perf_counter()
    budget = int(request.budget * 100)
    states = {0: (0, ())}
    evaluated, completed, reason = 1, 0, None
    for index, item in enumerate(request.items):
        price, value = int(item.cost * 100), int(item.score * 100)
        previous = list(states.items())
        for cost, (score, chosen) in previous:
            if evaluated >= MAX_EVALUATIONS:
                reason = 'state_evaluation_limit'
                break
            if (perf_counter() - start) * 1000 >= request.time_limit_ms:
                reason = 'time_limit'
                break
            evaluated += 1
            next_cost = cost + price
            if next_cost <= budget:
                # O(i + 1) <= O(n) immutable tuple concatenation for selected item indices
                candidate = (score + value, chosen + (index,))
                old = states.get(next_cost)
                if old is None and len(states) >= MAX_STATES:
                    reason = 'retained_state_limit'
                    break
                if old is None or (-candidate[0], candidate[1]) < (-old[0], old[1]):
                    states[next_cost] = candidate
        if reason:
            break
        completed += 1
        if on_progress:
            on_progress({'type': 'progress', 'strategy': 'dp', 'states_explored': evaluated,
                         'items_completed': completed, 'total_items': len(request.items)})
    cost, (score, chosen) = min(states.items(), key=lambda entry: (-entry[1][0], entry[0], entry[1][1]))
    return DPResult(total_score=score / 100, total_cost=cost / 100,
                    selected_ids=[request.items[i].id for i in chosen], states_explored=evaluated,
                    retained_states=len(states), items_completed=completed,
                    elapsed_ms=round((perf_counter() - start) * 1000, 3),
                    proven_optimal=reason is None, stop_reason=reason)