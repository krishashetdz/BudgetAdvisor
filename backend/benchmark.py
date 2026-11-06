"""Advanced Algorithm Performance Benchmarking for FIFO B&B, LC B&B, and DP.

Custom-Derived Benchmark Dataset Disclosure:
Datasets exceeding the original custom item count are expanded using reproducible variations
derived from the original dataset. These additional entries are generated for algorithm
scalability testing and are not independently entered real-world products.
"""
from datetime import datetime, timezone
from decimal import Decimal
import random
import statistics
from typing import Literal

from models import (
    BenchmarkAlgorithmMetrics,
    BenchmarkRequest,
    BenchmarkResponse,
    BenchmarkRow,
    BenchmarkVerification,
    CUSTOM_VARIATION_DISCLOSURE,
    Item,
    SolveRequest,
)
from samples import SHOPPING, INVESTMENT
from solver import solve
from dp_solver import solve_dp

SHOPPING_BENCHMARK_POOL = list(SHOPPING) + [
    ('Noise-cancelling earbuds', 2400, 80),
    ('Ergonomic mouse', 1800, 74),
    ('Portable SSD 1TB', 5200, 92),
    ('USB-C docking station', 3100, 81),
    ('Smart desk mat', 950, 58),
    ('Webcam 1080p', 2600, 76),
    ('Monitor light bar', 1900, 71),
    ('Laptop stand aluminum', 1350, 69),
    ('Blue-light glasses', 1100, 60),
    ('Travel power bank', 2100, 79),
    ('Acoustic foam pack', 1600, 62),
    ('Mechanical numpad', 1450, 64),
    ('Cable organizer kit', 650, 52),
    ('Smart plug duo', 1250, 63),
    ('Document scanner', 4600, 87),
    ('Microfiber desk pad', 750, 54),
]

INVESTMENT_BENCHMARK_POOL = list(INVESTMENT) + [
    ('Quantum semiconductor ETF', 3800, 19.5),
    ('Sovereign gilt trust', 1800, 6.8),
    ('Renewable grid REIT', 3200, 15.2),
    ('Global logistics fund', 2900, 13.4),
    ('Biotech innovation basket', 4200, 20.0),
    ('Agri-tech value fund', 1700, 8.6),
    ('Clean water municipal bond', 1400, 6.2),
    ('Emerging fintec equity', 3600, 17.8),
    ('High-dividend utilities', 2600, 11.9),
    ('Aerospace defense index', 4400, 18.4),
    ('Legacy retail turnaround', 1600, -2.5),
    ('Robotics automation ETF', 3900, 18.9),
    ('Digital payments trust', 2400, 13.8),
    ('Battery materials fund', 3100, 14.6),
    ('Speculative commodity note', 1900, -4.0),
    ('Mid-cap industrial growth', 2750, 14.2),
]


def generate_benchmark_dataset(
    mode: Literal['shopping', 'investment'],
    size: int,
    seed: int = 42,
    custom_items: list[Item] | None = None,
    explicit_budget: Decimal | None = None,
) -> tuple[list[Item], Decimal]:
    """Generate a reproducible dataset of exact `size` items and a balanced budget.

    Note on Custom Datasets:
    Datasets exceeding the original custom item count are expanded using reproducible variations
    derived from the original dataset. These additional entries are generated for algorithm
    scalability testing and are not independently entered real-world products.
    """
    rng = random.Random(seed * 1000 + size)

    if custom_items and len(custom_items) > 0:
        selected_items: list[Item] = []
        base_len = len(custom_items)
        for idx in range(size):
            if idx < base_len:
                src = custom_items[idx]
                selected_items.append(
                    Item(
                        id=f'bench-{size}-{idx + 1}',
                        name=src.name,
                        cost=src.cost,
                        score=src.score,
                    )
                )
            else:
                src = custom_items[idx % base_len]
                # Deterministic controlled variation when scaling beyond custom list length
                cost_factor = Decimal(str(round(0.85 + 0.35 * ((idx * 7 + seed) % 11) / 10, 2)))
                new_cost = max(Decimal('1.00'), (src.cost * cost_factor).quantize(Decimal('0.01')))
                new_cost = min(Decimal('10000000.00'), new_cost)
                score_delta = Decimal(str(round(((idx * 5 + seed) % 9 - 4) * 1.25, 2)))
                new_score = (src.score + score_delta).quantize(Decimal('0.01'))
                if mode == 'shopping':
                    new_score = max(Decimal('0.00'), min(Decimal('100.00'), new_score))
                selected_items.append(
                    Item(
                        id=f'bench-{size}-{idx + 1}',
                        name=f'{src.name} #{idx + 1}',
                        cost=new_cost,
                        score=new_score,
                    )
                )
    else:
        pool = SHOPPING_BENCHMARK_POOL if mode == 'shopping' else INVESTMENT_BENCHMARK_POOL
        selected_items = []
        for idx in range(size):
            base_name, base_cost, base_score = pool[idx % len(pool)]
            jitter_c = rng.randint(-150, 250)
            cost_val = max(100, base_cost + jitter_c)
            if mode == 'shopping':
                jitter_s = rng.randint(-5, 6)
                score_val = max(5, min(100, int(base_score + jitter_s)))
                score_dec = Decimal(f'{score_val}.00')
            else:
                jitter_s = round(rng.uniform(-1.5, 2.0), 2)
                score_dec = Decimal(str(round(base_score + jitter_s, 2))).quantize(Decimal('0.01'))
            selected_items.append(
                Item(
                    id=f'{mode}-b{size}-{idx + 1}',
                    name=base_name if idx < len(pool) else f'{base_name} {idx + 1}',
                    cost=Decimal(f'{cost_val}.00'),
                    score=score_dec,
                )
            )

    if explicit_budget is not None:
        budget = explicit_budget.quantize(Decimal('0.01'))
    else:
        # Set budget to ~45% of total positive-score item cost to induce non-trivial branching & pruning
        positive_costs = sum(i.cost for i in selected_items if i.score > 0)
        if positive_costs <= 0:
            positive_costs = sum(i.cost for i in selected_items)
        budget = (positive_costs * Decimal('0.45')).quantize(Decimal('1.00'))

    return selected_items, budget


def _measure_strategy(request: SolveRequest, strategy: Literal['fifo', 'lc'], repetitions: int) -> BenchmarkAlgorithmMetrics:
    times: list[float] = []
    last_result = None
    for _ in range(repetitions):
        res = solve(request, strategy)
        times.append(res.elapsed_ms)
        last_result = res

    assert last_result is not None
    median_ms = round(float(statistics.median(times)), 3)
    return BenchmarkAlgorithmMetrics(
        strategy=strategy,
        execution_time_ms=median_ms,
        min_time_ms=round(min(times), 3),
        max_time_ms=round(max(times), 3),
        nodes_generated=last_result.generated,
        nodes_explored=last_result.visited,
        nodes_pruned=last_result.pruned,
        bound_pruned=last_result.bound_pruned,
        infeasible_pruned=last_result.infeasible_pruned,
        max_queue_size=last_result.max_queue_size,
        optimal_value=last_result.total_score,
        selected_cost=last_result.total_cost,
        remaining_budget=last_result.remaining_budget,
        selected_ids=last_result.selected_ids,
        proven_optimal=last_result.proven_optimal,
        stop_reason=last_result.stop_reason,
    )


def run_benchmark_suite(req: BenchmarkRequest) -> BenchmarkResponse:
    """Execute warm-up and multi-repetition benchmarks across requested dataset sizes."""
    unique_sizes = sorted(set(req.sizes))
    pool_len = len(SHOPPING_BENCHMARK_POOL if req.mode == 'shopping' else INVESTMENT_BENCHMARK_POOL)
    orig_size = len(req.custom_items or []) if req.dataset_source == 'custom' else pool_len
    max_expanded = max(unique_sizes) if unique_sizes else 0
    any_variations = (
        (req.dataset_source == 'custom' and any(sz > orig_size for sz in unique_sizes))
        or (req.dataset_source == 'generated')
    )

    if req.dataset_name and req.dataset_name.strip():
        resolved_dataset_name = req.dataset_name.strip()
    elif req.dataset_source == 'custom':
        resolved_dataset_name = f'Custom {req.mode.title()} Dataset ({orig_size} base items)'
    else:
        resolved_dataset_name = f'Generated {req.mode.title()} Benchmark Pool (Seed {req.seed})'

    # Perform warm-up run on a small 5-item instance to eliminate cold-start jitter
    warmup_items, warmup_budget = generate_benchmark_dataset(req.mode, min(5, unique_sizes[0]), req.seed)
    warmup_req = SolveRequest(
        mode=req.mode,
        items=warmup_items,
        budget=warmup_budget,
        max_nodes=min(500, req.max_nodes),
        time_limit_ms=min(250, req.time_limit_ms),
    )
    solve(warmup_req, 'fifo')
    solve(warmup_req, 'lc')
    solve_dp(warmup_req)

    rows: list[BenchmarkRow] = []
    for size in unique_sizes:
        items, budget = generate_benchmark_dataset(
            mode=req.mode,
            size=size,
            seed=req.seed,
            custom_items=req.custom_items if req.dataset_source == 'custom' else None,
            explicit_budget=req.budget,
        )
        solve_req = SolveRequest(
            mode=req.mode,
            items=items,
            budget=budget,
            max_nodes=req.max_nodes,
            time_limit_ms=req.time_limit_ms,
        )

        fifo_metrics = _measure_strategy(solve_req, 'fifo', req.repetitions)
        lc_metrics = _measure_strategy(solve_req, 'lc', req.repetitions)
        dp_res = solve_dp(solve_req)

        fifo_matches_dp = (fifo_metrics.optimal_value == dp_res.total_score)
        lc_matches_dp = (lc_metrics.optimal_value == dp_res.total_score)
        fifo_matches_lc = (fifo_metrics.optimal_value == lc_metrics.optimal_value)
        all_proven = fifo_metrics.proven_optimal and lc_metrics.proven_optimal and dp_res.proven_optimal
        all_agree = all_proven and fifo_matches_dp and lc_matches_dp and fifo_matches_lc

        if all_agree:
            status_label = 'Verified Optimal (FIFO = LC = DP)'
        elif fifo_matches_dp and lc_matches_dp and fifo_matches_lc:
            stopped = []
            if not fifo_metrics.proven_optimal:
                stopped.append(f'FIFO ({fifo_metrics.stop_reason or "limit"})')
            if not lc_metrics.proven_optimal:
                stopped.append(f'LC ({lc_metrics.stop_reason or "limit"})')
            if not dp_res.proven_optimal:
                stopped.append(f'DP ({dp_res.stop_reason or "limit"})')
            status_label = f'Values match, but search capped: {", ".join(stopped)}'
        else:
            stopped = []
            if not fifo_metrics.proven_optimal:
                stopped.append(f'FIFO capped ({fifo_metrics.stop_reason})')
            if not lc_metrics.proven_optimal:
                stopped.append(f'LC capped ({lc_metrics.stop_reason})')
            if not dp_res.proven_optimal:
                stopped.append(f'DP capped ({dp_res.stop_reason})')
            suffix = f' [{", ".join(stopped)}]' if stopped else ''
            status_label = f'Suboptimal / Divergent due to execution limit{suffix}'

        verification = BenchmarkVerification(
            dp_optimal_value=dp_res.total_score,
            dp_selected_cost=dp_res.total_cost,
            dp_selected_ids=dp_res.selected_ids,
            dp_states_explored=dp_res.states_explored,
            dp_execution_time_ms=dp_res.elapsed_ms,
            dp_proven_optimal=dp_res.proven_optimal,
            dp_stop_reason=dp_res.stop_reason,
            fifo_matches_dp=fifo_matches_dp,
            lc_matches_dp=lc_matches_dp,
            fifo_matches_lc=fifo_matches_lc,
            all_agree=all_agree,
            status_label=status_label,
        )

        row_uses_variations = (
            (size > orig_size) if req.dataset_source == 'custom' else True
        )

        rows.append(
            BenchmarkRow(
                dataset_size=size,
                original_dataset_size=orig_size,
                expanded_dataset_size=size,
                uses_generated_variations=row_uses_variations,
                budget=float(budget),
                fifo=fifo_metrics,
                lc=lc_metrics,
                verification=verification,
            )
        )

    return BenchmarkResponse(
        dataset_name=resolved_dataset_name,
        mode=req.mode,
        dataset_source=req.dataset_source,
        original_dataset_size=orig_size,
        max_expanded_dataset_size=max_expanded,
        uses_generated_variations=any_variations,
        expansion_note=CUSTOM_VARIATION_DISCLOSURE,
        seed=req.seed,
        repetitions=req.repetitions,
        warmup_performed=True,
        generated_at=datetime.now(timezone.utc).isoformat(),
        hardware_note=(
            'Measured in-process on the backend solver using high-resolution performance counters '
            '(median across repetitions after warm-up). Excludes network and frontend rendering latency. '
            'Actual wall-clock times depend on host CPU load and runtime environment.'
        ),
        rows=rows,
    )
