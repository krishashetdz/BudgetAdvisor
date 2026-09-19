from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import uuid
from models import Run
from solver import solve
from dp_solver import solve_dp


def compute_run(snapshot, on_progress=None):
    # Concurrent computation; UI's visit-synchronized race is explicitly NOT a
    # wall-clock benchmark. Report measured compute milliseconds separately.
    with ThreadPoolExecutor(max_workers=3) as pool:
        first = pool.submit(solve, snapshot, 'fifo', on_progress)
        second = pool.submit(solve, snapshot, 'lc', on_progress)
        baseline = pool.submit(solve_dp, snapshot, on_progress)
        fifo, lc, dp = first.result(), second.result(), baseline.result()
    def rank(result):
        indices = tuple(i for i, item in enumerate(snapshot.items) if item.id in result.selected_ids)
        return (-result.total_score, result.total_cost, indices)
    return Run(id=str(uuid.uuid4()), title=f'{snapshot.mode.title()} · ₹{snapshot.budget:,.2f}',
               created_at=datetime.now(timezone.utc).isoformat(), snapshot=snapshot,
               fifo=fifo, lc=lc, dp=dp, recommended_strategy='fifo' if rank(fifo) <= rank(lc) else 'lc',
               comparison_complete=fifo.proven_optimal and lc.proven_optimal)