"""Independent sparse-cost 0/1 DP, exact to hundredths; no budget-sized array.

One state evaluation is an include transition from a prior-layer cost state,
including rejected over-budget transitions; the initial empty state counts once.
Limits avoid exponential sparse-state growth without ever claiming a partial proof.
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