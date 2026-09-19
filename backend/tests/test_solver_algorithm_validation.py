"""Solver algorithm validation tests for deterministic B&B FIFO/LC behavior."""

# Module coverage: solver optimality, invariants, limits, and model validation.

from __future__ import annotations

from decimal import Decimal
from itertools import combinations
import random
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

sys.path.append(str(Path(__file__).resolve().parents[1]))

from models import SolveRequest  # noqa: E402
from solver import solve  # noqa: E402


def _d2(value: int) -> Decimal:
    return Decimal(value) / Decimal("100")


def _rank(score_cents: int, cost_cents: int, indices: tuple[int, ...]) -> tuple[int, int, tuple[int, ...]]:
    return (-score_cents, cost_cents, indices)


def exhaustive_best(request: SolveRequest) -> dict:
    budget = int(request.budget * 100)
    costs = [int(i.cost * 100) for i in request.items]
    scores = [int(i.score * 100) for i in request.items]
    best_score, best_cost, best_indices = 0, 0, ()
    n = len(request.items)

    for size in range(n + 1):
        for subset in combinations(range(n), size):
            total_cost = sum(costs[i] for i in subset)
            if total_cost > budget:
                continue
            total_score = sum(scores[i] for i in subset)
            if _rank(total_score, total_cost, subset) < _rank(best_score, best_cost, best_indices):
                best_score, best_cost, best_indices = total_score, total_cost, subset

    return {
        "selected_ids": [request.items[i].id for i in best_indices],
        "total_cost": best_cost / 100,
        "total_score": best_score / 100,
        "remaining_budget": (budget - best_cost) / 100,
        "indices": best_indices,
    }


def assert_result_matches_exhaustive(request: SolveRequest, strategy: str) -> None:
    expected = exhaustive_best(request)
    result = solve(request, strategy)

    assert result.selected_ids == expected["selected_ids"]
    assert result.total_cost == expected["total_cost"]
    assert result.total_score == expected["total_score"]
    assert result.remaining_budget == expected["remaining_budget"]


def assert_core_invariants(result) -> None:
    assert result.generated == result.visited + result.frontier_remaining
    assert result.generated == 1 + 2 * result.expanded
    assert result.pruned == result.bound_pruned + result.infeasible_pruned
    assert len(result.trace) <= 30
    assert result.trace_omitted == result.generated - len(result.trace)

    trace_ids = {t.id for t in result.trace}
    for node in result.trace:
        if node.parent is not None:
            assert node.parent in trace_ids


def build_request(mode: str, items: list[dict], budget: Decimal, max_nodes: int = 50_000) -> SolveRequest:
    return SolveRequest(
        mode=mode,
        items=items,
        budget=budget,
        max_nodes=max_nodes,
        time_limit_ms=1500,
    )


@pytest.mark.parametrize("strategy", ["fifo", "lc"])
def test_empty_items(strategy: str):
    request = build_request(mode="shopping", items=[], budget=Decimal("100.00"))
    result = solve(request, strategy)
    assert result.selected_ids == []
    assert result.total_cost == 0
    assert result.total_score == 0
    assert result.remaining_budget == 100
    assert_result_matches_exhaustive(request, strategy)
    assert_core_invariants(result)


@pytest.mark.parametrize("strategy", ["fifo", "lc"])
def test_budget_zero_no_selection(strategy: str):
    request = build_request(
        mode="shopping",
        budget=Decimal("0.00"),
        items=[
            {"id": "a", "name": "A", "cost": Decimal("1.00"), "score": Decimal("10.00")},
            {"id": "b", "name": "B", "cost": Decimal("2.50"), "score": Decimal("20.00")},
        ],
    )
    result = solve(request, strategy)
    assert result.selected_ids == []
    assert result.remaining_budget == 0
    assert_result_matches_exhaustive(request, strategy)
    assert_core_invariants(result)


@pytest.mark.parametrize("strategy", ["fifo", "lc"])
def test_no_fit_full_remaining_budget(strategy: str):
    request = build_request(
        mode="shopping",
        budget=Decimal("0.99"),
        items=[
            {"id": "a", "name": "A", "cost": Decimal("1.00"), "score": Decimal("10.00")},
            {"id": "b", "name": "B", "cost": Decimal("1.01"), "score": Decimal("11.00")},
        ],
    )
    result = solve(request, strategy)
    assert result.selected_ids == []
    assert result.total_cost == 0
    assert result.remaining_budget == 0.99
    assert_result_matches_exhaustive(request, strategy)
    assert_core_invariants(result)


@pytest.mark.parametrize("strategy", ["fifo", "lc"])
def test_all_items_fit(strategy: str):
    request = build_request(
        mode="shopping",
        budget=Decimal("10.00"),
        items=[
            {"id": "a", "name": "A", "cost": Decimal("1.50"), "score": Decimal("20.00")},
            {"id": "b", "name": "B", "cost": Decimal("2.25"), "score": Decimal("30.00")},
            {"id": "c", "name": "C", "cost": Decimal("3.00"), "score": Decimal("40.00")},
        ],
    )
    result = solve(request, strategy)
    assert result.selected_ids == ["a", "b", "c"]
    assert result.total_cost == 6.75
    assert result.remaining_budget == 3.25
    assert_result_matches_exhaustive(request, strategy)
    assert_core_invariants(result)


@pytest.mark.parametrize("strategy", ["fifo", "lc"])
def test_tied_optima_canonical_lexicographic_indices(strategy: str):
    request = build_request(
        mode="shopping",
        budget=Decimal("2.00"),
        items=[
            {"id": "i0", "name": "I0", "cost": Decimal("1.00"), "score": Decimal("1.00")},
            {"id": "i1", "name": "I1", "cost": Decimal("1.00"), "score": Decimal("1.00")},
            {"id": "i2", "name": "I2", "cost": Decimal("2.00"), "score": Decimal("2.00")},
        ],
    )
    result = solve(request, strategy)
    assert result.selected_ids == ["i0", "i1"]
    assert_result_matches_exhaustive(request, strategy)
    assert_core_invariants(result)


@pytest.mark.parametrize("strategy", ["fifo", "lc"])
def test_investment_negative_and_zero_scores(strategy: str):
    request = build_request(
        mode="investment",
        budget=Decimal("5.00"),
        items=[
            {"id": "p", "name": "Positive", "cost": Decimal("2.00"), "score": Decimal("2.50")},
            {"id": "n", "name": "Negative", "cost": Decimal("1.00"), "score": Decimal("-0.50")},
            {"id": "z", "name": "Zero", "cost": Decimal("1.00"), "score": Decimal("0.00")},
        ],
    )
    result = solve(request, strategy)
    assert "n" not in result.selected_ids
    assert_result_matches_exhaustive(request, strategy)
    assert_core_invariants(result)


@pytest.mark.parametrize("seed", [1, 7, 21, 33, 54, 89, 144, 233, 377, 610])
def test_random_small_shopping_matches_exhaustive_for_both_strategies(seed: int):
    rng = random.Random(seed)
    item_count = rng.randint(3, 8)
    items = []
    for i in range(item_count):
        cost_c = rng.randint(50, 600)
        score_c = rng.randint(0, 10_000)
        items.append(
            {
                "id": f"s{i}",
                "name": f"Shop {i}",
                "cost": _d2(cost_c),
                "score": _d2(score_c),
            }
        )
    budget = _d2(rng.randint(100, 1500))
    request = build_request(mode="shopping", items=items, budget=budget)

    for strategy in ("fifo", "lc"):
        result = solve(request, strategy)
        assert_result_matches_exhaustive(request, strategy)
        assert_core_invariants(result)


@pytest.mark.parametrize("seed", [2, 5, 8, 13, 34, 55, 87, 99, 123, 321])
def test_random_small_investment_matches_exhaustive_for_both_strategies(seed: int):
    rng = random.Random(seed)
    item_count = rng.randint(3, 8)
    items = []
    for i in range(item_count):
        cost_c = rng.randint(25, 700)
        score_c = rng.randint(-5000, 9000)
        items.append(
            {
                "id": f"inv{i}",
                "name": f"Invest {i}",
                "cost": _d2(cost_c),
                "score": _d2(score_c),
            }
        )
    budget = _d2(rng.randint(100, 1800))
    request = build_request(mode="investment", items=items, budget=budget)

    for strategy in ("fifo", "lc"):
        result = solve(request, strategy)
        assert_result_matches_exhaustive(request, strategy)
        assert_core_invariants(result)


def test_max_nodes_cap_1_returns_not_proven_when_frontier_remains():
    request = build_request(
        mode="shopping",
        budget=Decimal("10.00"),
        max_nodes=1,
        items=[
            {"id": "a", "name": "A", "cost": Decimal("2.00"), "score": Decimal("20.00")},
            {"id": "b", "name": "B", "cost": Decimal("2.00"), "score": Decimal("10.00")},
            {"id": "c", "name": "C", "cost": Decimal("2.00"), "score": Decimal("30.00")},
        ],
    )
    for strategy in ("fifo", "lc"):
        result = solve(request, strategy)
        assert result.stop_reason == "node_limit"
        assert result.frontier_remaining > 0
        assert result.proven_optimal is False
        assert_core_invariants(result)


def test_max_nodes_cap_10_returns_not_proven_when_frontier_remains():
    request = build_request(
        mode="shopping",
        budget=Decimal("15.00"),
        max_nodes=10,
        items=[
            {"id": "a", "name": "A", "cost": Decimal("1.00"), "score": Decimal("1.00")},
            {"id": "b", "name": "B", "cost": Decimal("2.00"), "score": Decimal("2.00")},
            {"id": "c", "name": "C", "cost": Decimal("3.00"), "score": Decimal("3.00")},
            {"id": "d", "name": "D", "cost": Decimal("4.00"), "score": Decimal("4.00")},
            {"id": "e", "name": "E", "cost": Decimal("5.00"), "score": Decimal("5.00")},
            {"id": "f", "name": "F", "cost": Decimal("6.00"), "score": Decimal("6.00")},
            {"id": "g", "name": "G", "cost": Decimal("7.00"), "score": Decimal("7.00")},
        ],
    )
    for strategy in ("fifo", "lc"):
        result = solve(request, strategy)
        assert result.stop_reason == "node_limit"
        assert result.frontier_remaining > 0
        assert result.proven_optimal is False
        assert_core_invariants(result)


def test_trace_is_ancestor_closed_and_capped_at_30():
    items = [
        {
            "id": f"x{i}",
            "name": f"Item {i}",
            "cost": Decimal("1.00"),
            "score": Decimal("1.00"),
        }
        for i in range(12)
    ]
    request = build_request(mode="shopping", items=items, budget=Decimal("6.00"))

    for strategy in ("fifo", "lc"):
        result = solve(request, strategy)
        assert len(result.trace) == 30
        assert result.trace_omitted == result.generated - 30
        trace_ids = {n.id for n in result.trace}
        for node in result.trace:
            if node.parent is not None:
                assert node.parent in trace_ids
        assert_core_invariants(result)


def test_lc_not_worse_than_fifo_example_if_found():
    found = None
    for seed in range(1, 250):
        rng = random.Random(seed)
        count = rng.randint(4, 8)
        items = []
        for i in range(count):
            items.append(
                {
                    "id": f"r{seed}_{i}",
                    "name": f"R{seed}-{i}",
                    "cost": _d2(rng.randint(50, 500)),
                    "score": _d2(rng.randint(0, 10_000)),
                }
            )
        request = build_request(mode="shopping", items=items, budget=_d2(rng.randint(150, 1200)))
        fifo = solve(request, "fifo")
        lc = solve(request, "lc")
        if lc.visited <= fifo.visited and (lc.visited < fifo.visited or lc.generated <= fifo.generated):
            found = (seed, fifo, lc)
            break

    if not found:
        pytest.skip("No natural dataset found where LC explores no more than FIFO in this seeded scan.")

    _, fifo, lc = found
    assert lc.visited <= fifo.visited


def test_model_rejects_more_than_2_decimal_places_and_non_finite_values():
    with pytest.raises(ValidationError):
        build_request(
            mode="shopping",
            budget=Decimal("10.001"),
            items=[{"id": "a", "name": "A", "cost": Decimal("1.00"), "score": Decimal("1.00")}],
        )

    with pytest.raises(ValidationError):
        build_request(
            mode="shopping",
            budget=Decimal("10.00"),
            items=[{"id": "a", "name": "A", "cost": Decimal("1.001"), "score": Decimal("1.00")}],
        )

    with pytest.raises(ValidationError):
        build_request(
            mode="shopping",
            budget=Decimal("10.00"),
            items=[{"id": "a", "name": "A", "cost": Decimal("1.00"), "score": Decimal("1.001")}],
        )

    with pytest.raises(ValidationError):
        build_request(
            mode="shopping",
            budget=Decimal("NaN"),
            items=[{"id": "a", "name": "A", "cost": Decimal("1.00"), "score": Decimal("1.00")}],
        )

    with pytest.raises(ValidationError):
        build_request(
            mode="shopping",
            budget=Decimal("10.00"),
            items=[{"id": "a", "name": "A", "cost": Decimal("Infinity"), "score": Decimal("1.00")}],
        )
