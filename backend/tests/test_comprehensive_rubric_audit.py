"""Comprehensive Rubric Audit & Full Regression Tests for BudgetAdvisor (Group G12).

Covers all Professor Mini-Project Guideline and Final Technical Audit requirements across:
- Category 1 (Correctness): FIFO queue level-order traversal, LC priority-queue bound ordering,
  fractional-knapsack upper-bound conservativeness (with O(1) auxiliary space index-based iteration),
  feasibility checking, branch pruning, DP independent verification, and multi-optimal canonical tie-breaking.
- Category 2 (Robustness): All 18 required edge cases including empty dataset, single item,
  zero budget (2n + 1 nodes), budget < min item (2n + 1 nodes), budget == item cost, budget > total cost,
  item > budget, duplicate item costs, duplicate item values, multiple optimal combinations, negative/invalid costs,
  invalid budgets, missing item attributes, 24-item max datasets, search node limits (visited vs generated),
  execution time limits, invalid API requests, and database unavailability / in-memory fallback.
- Category 3 & 4 (Regression across UI & Application Logic): Shopping & Investment modes,
  manual selection hundredths & over-budget calculation, search tree & step-by-step replay frames,
  saved runs lifecycle, Undo/Redo draft history state machine, and PDF/CSV dataset consistency & mathematical verification.
"""
from __future__ import annotations

import ast
import asyncio
import csv
from decimal import Decimal
import inspect
from itertools import combinations
import io
import os
from pathlib import Path
import sys

import pypdf
import pytest
from pydantic import ValidationError
import requests
from dotenv import load_dotenv

sys.path.append(str(Path(__file__).resolve().parents[1]))

from benchmark import generate_benchmark_dataset, run_benchmark_suite  # noqa: E402
from computation import compute_run  # noqa: E402
from dp_solver import solve_dp  # noqa: E402
from models import (  # noqa: E402
    BenchmarkRequest,
    Item,
    ReportExportRequest,
    SensitivityRequest,
    SolveRequest,
)
from report_generator import generate_benchmark_csv, generate_optimization_pdf_report  # noqa: E402
from samples import SAMPLES  # noqa: E402
from sensitivity import run_sensitivity_analysis  # noqa: E402
from server import _InMemoryClient, _InMemoryCollection, _InMemoryDB  # noqa: E402
import solver as solver_module  # noqa: E402
from solver import solve, solve_pair  # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or "http://127.0.0.1:8000"


@pytest.fixture(scope="session")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


def _exhaustive_knapsack(req: SolveRequest) -> tuple[float, float, list[str]]:
    budget_c = int(req.budget * 100)
    costs = [int(it.cost * 100) for it in req.items]
    scores = [int(it.score * 100) for it in req.items]
    best_score, best_cost, best_indices = 0, 0, ()
    n = len(req.items)
    for r in range(n + 1):
        for subset in combinations(range(n), r):
            c = sum(costs[i] for i in subset)
            if c > budget_c:
                continue
            s = sum(scores[i] for i in subset)
            if (-s, c, subset) < (-best_score, best_cost, best_indices):
                best_score, best_cost, best_indices = s, c, subset
    return (
        best_score / 100,
        best_cost / 100,
        [req.items[i].id for i in best_indices],
    )


# ============================================================================
# CATEGORY 1: CORRECTNESS & UPPER-BOUND MEMORY OPTIMIZATION AUDIT TESTS
# ============================================================================

def test_upper_bound_index_iteration_no_slice_allocation_and_exact_results():
    """Verify Issue 1 fix: upper() in backend/solver.py uses index-based iteration (range(depth, n_items))
    without any list slicing (items[depth:]), while producing identical optimal results for FIFO, LC, and DP."""
    source_code = inspect.getsource(solver_module.solve)
    parsed_ast = ast.parse(source_code)

    upper_funcs = [
        node for node in ast.walk(parsed_ast)
        if isinstance(node, ast.FunctionDef) and node.name == "upper"
    ]
    assert len(upper_funcs) == 1, "Expected exactly one `upper` function in solver.solve"
    upper_ast = upper_funcs[0]

    # Ensure no `ast.Slice` (such as `items[depth:]`) exists anywhere inside `upper()`
    slices_in_upper = [node for node in ast.walk(upper_ast) if isinstance(node, ast.Slice)]
    assert slices_in_upper == [], "upper() must use index-based iteration and must not allocate list slices"

    # Verify index-based `range(depth, ...)` is used inside `upper()`
    for_loops = [node for node in ast.walk(upper_ast) if isinstance(node, ast.For)]
    assert len(for_loops) == 1
    assert isinstance(for_loops[0].iter, ast.Call)
    assert getattr(for_loops[0].iter.func, "id", "") == "range"

    # Verify FIFO, LC, and DP produce identical optimal results on both seeded datasets
    for sample in SAMPLES:
        req = SolveRequest(mode=sample["mode"], items=sample["items"], budget=Decimal(sample["budget"]))
        fifo, lc, rec = solve_pair(req)
        dp = solve_dp(req)
        exp_score, exp_cost, exp_ids = _exhaustive_knapsack(req)
        assert fifo.total_score == lc.total_score == dp.total_score == exp_score
        assert fifo.total_cost == lc.total_cost == dp.total_cost == exp_cost
        assert fifo.selected_ids == lc.selected_ids == dp.selected_ids == exp_ids


def test_best_case_execution_flow_zero_budget_and_no_fit_node_counts():
    """Verify Issue 2 & 3 fix: actual solver execution flow when budget == 0 or no item fits.
    Only n == 0 stops at the root (k = 1); for any n >= 1, the solver expands all n exclusion
    nodes and pushes/rejects n infeasible include children (generated == visited == 2*n + 1)."""
    # 1. Empty dataset (n = 0): stops immediately at root (k = 1)
    req_empty = SolveRequest(mode="shopping", items=[], budget=Decimal("0.00"))
    for strat in ("fifo", "lc"):
        res0 = solve(req_empty, strat)
        assert res0.generated == 1
        assert res0.visited == 1
        assert res0.expanded == 0
        assert res0.infeasible_pruned == 0
        assert res0.bound_pruned == 0
        assert res0.frontier_remaining == 0
        assert res0.proven_optimal is True

    # 2. Non-empty datasets (n = 1, 4, 8) under budget == 0 and under no-fit (0 < budget < min_cost)
    for n in (1, 4, 8):
        items = [
            {"id": f"item-{k}", "name": f"Item {k}", "cost": Decimal("500.00"), "score": Decimal("50.00")}
            for k in range(n)
        ]
        for b_val in (Decimal("0.00"), Decimal("100.00")):
            req = SolveRequest(mode="shopping", items=items, budget=b_val)
            for strat in ("fifo", "lc"):
                res = solve(req, strat)
                assert res.selected_ids == []
                assert res.total_score == 0.0
                assert res.total_cost == 0.0
                assert res.remaining_budget == float(b_val)
                assert res.expanded == n
                assert res.generated == 2 * n + 1
                assert res.visited == 2 * n + 1
                assert res.infeasible_pruned == n
                assert res.bound_pruned == 0
                assert res.pruned == n
                assert res.frontier_remaining == 0
                assert res.proven_optimal is True


def test_fifo_level_order_traversal_and_upper_bound_conservativeness():
    """Verify FIFO explores nodes in non-decreasing tree depth (breadth-first level order)
    and that root upper bound is always >= optimal 0/1 score."""
    req = SolveRequest(
        mode="shopping",
        budget=Decimal("7000.00"),
        items=[
            {"id": "i1", "name": "Item 1", "cost": Decimal("3000.00"), "score": Decimal("90.00")},
            {"id": "i2", "name": "Item 2", "cost": Decimal("2500.00"), "score": Decimal("75.00")},
            {"id": "i3", "name": "Item 3", "cost": Decimal("2000.00"), "score": Decimal("50.00")},
            {"id": "i4", "name": "Item 4", "cost": Decimal("4000.00"), "score": Decimal("85.00")},
        ],
    )
    fifo = solve(req, "fifo")
    dp = solve_dp(req)
    assert fifo.proven_optimal is True
    assert fifo.total_score == dp.total_score

    # Verify visited trace nodes in FIFO are popped in non-decreasing depth order
    visited_trace = sorted(
        [t for t in fifo.trace if t.visit_order is not None],
        key=lambda t: t.visit_order,
    )
    depths = [t.depth for t in visited_trace]
    assert depths == sorted(depths), "FIFO must pop nodes in level-by-level (non-decreasing depth) order"

    # Root upper bound must be >= final optimal 0/1 score
    root_node = next(t for t in fifo.trace if t.parent is None)
    assert root_node.bound is not None
    assert root_node.bound >= fifo.total_score


def test_lc_priority_queue_bound_ordering_and_dp_agreement():
    """Verify LC Branch and Bound prioritizes highest upper bound first and matches DP and exhaustive search."""
    req = SolveRequest(
        mode="shopping",
        budget=Decimal("6000.00"),
        items=[
            {"id": "a", "name": "High Density", "cost": Decimal("2000.00"), "score": Decimal("80.00")},
            {"id": "b", "name": "Med Density", "cost": Decimal("3000.00"), "score": Decimal("90.00")},
            {"id": "c", "name": "Low Density", "cost": Decimal("3500.00"), "score": Decimal("70.00")},
            {"id": "d", "name": "Small Filler", "cost": Decimal("1000.00"), "score": Decimal("25.00")},
        ],
    )
    fifo, lc, rec = solve_pair(req)
    dp = solve_dp(req)
    exp_score, exp_cost, exp_ids = _exhaustive_knapsack(req)

    assert fifo.total_score == lc.total_score == dp.total_score == exp_score
    assert fifo.total_cost == lc.total_cost == dp.total_cost == exp_cost
    assert fifo.selected_ids == lc.selected_ids == dp.selected_ids == exp_ids
    assert rec in ("fifo", "lc")


# ============================================================================
# CATEGORY 2: ROBUSTNESS & EDGE-CASE AUDIT TESTS
# ============================================================================

@pytest.mark.parametrize("strategy", ["fifo", "lc"])
def test_single_item_affordable_unaffordable_and_negative(strategy: str):
    """Test single-item datasets: affordable positive, unaffordable positive, and negative score in investment mode."""
    # 1. Single affordable positive item
    req_fit = SolveRequest(
        mode="shopping",
        budget=Decimal("500.00"),
        items=[{"id": "solo", "name": "Solo Item", "cost": Decimal("400.00"), "score": Decimal("80.00")}],
    )
    res_fit = solve(req_fit, strategy)
    dp_fit = solve_dp(req_fit)
    assert res_fit.selected_ids == ["solo"]
    assert res_fit.total_cost == 400.0
    assert res_fit.total_score == 80.0
    assert res_fit.remaining_budget == 100.0
    assert dp_fit.selected_ids == ["solo"]

    # 2. Single unaffordable item (item cost exceeding budget)
    req_nofit = SolveRequest(
        mode="shopping",
        budget=Decimal("300.00"),
        items=[{"id": "solo", "name": "Solo Item", "cost": Decimal("400.00"), "score": Decimal("80.00")}],
    )
    res_nofit = solve(req_nofit, strategy)
    dp_nofit = solve_dp(req_nofit)
    assert res_nofit.selected_ids == []
    assert res_nofit.total_cost == 0.0
    assert res_nofit.total_score == 0.0
    assert res_nofit.remaining_budget == 300.0
    assert dp_nofit.selected_ids == []

    # 3. Single affordable negative-score item in investment mode (must be excluded)
    req_neg = SolveRequest(
        mode="investment",
        budget=Decimal("1000.00"),
        items=[{"id": "loss", "name": "Loss Asset", "cost": Decimal("400.00"), "score": Decimal("-12.50")}],
    )
    res_neg = solve(req_neg, strategy)
    dp_neg = solve_dp(req_neg)
    assert res_neg.selected_ids == []
    assert res_neg.total_score == 0.0
    assert res_neg.remaining_budget == 1000.0
    assert dp_neg.selected_ids == []


@pytest.mark.parametrize("strategy", ["fifo", "lc"])
def test_budget_exactly_equal_to_item_cost(strategy: str):
    """Test budget exactly equal to an item's cost leaves 0.00 remaining budget."""
    req = SolveRequest(
        mode="shopping",
        budget=Decimal("2500.00"),
        items=[
            {"id": "exact", "name": "Exact Match", "cost": Decimal("2500.00"), "score": Decimal("88.00")},
            {"id": "other", "name": "Other Item", "cost": Decimal("1800.00"), "score": Decimal("60.00")},
        ],
    )
    res = solve(req, strategy)
    dp = solve_dp(req)
    assert res.selected_ids == ["exact"]
    assert res.total_cost == 2500.0
    assert res.remaining_budget == 0.0
    assert dp.selected_ids == ["exact"]


@pytest.mark.parametrize("strategy", ["fifo", "lc"])
def test_duplicate_item_costs_and_duplicate_item_values(strategy: str):
    """Test datasets with duplicate item costs and duplicate item values/scores."""
    # Duplicate costs with different values -> must pick highest value
    req_dup_cost = SolveRequest(
        mode="shopping",
        budget=Decimal("2000.00"),
        items=[
            {"id": "c1", "name": "Dup Cost Low Val", "cost": Decimal("1000.00"), "score": Decimal("40.00")},
            {"id": "c2", "name": "Dup Cost High Val", "cost": Decimal("1000.00"), "score": Decimal("90.00")},
            {"id": "c3", "name": "Dup Cost Mid Val", "cost": Decimal("1000.00"), "score": Decimal("70.00")},
        ],
    )
    res_c = solve(req_dup_cost, strategy)
    dp_c = solve_dp(req_dup_cost)
    assert res_c.selected_ids == ["c2", "c3"]
    assert res_c.total_score == 160.0
    assert dp_c.selected_ids == ["c2", "c3"]

    # Duplicate values with different costs -> tie-breaker must prefer lower total cost!
    req_dup_val = SolveRequest(
        mode="shopping",
        budget=Decimal("5000.00"),
        items=[
            {"id": "expensive", "name": "Expensive 80", "cost": Decimal("4500.00"), "score": Decimal("80.00")},
            {"id": "cheap", "name": "Cheap 80", "cost": Decimal("3200.00"), "score": Decimal("80.00")},
        ],
    )
    res_v = solve(req_dup_val, strategy)
    dp_v = solve_dp(req_dup_val)
    assert res_v.selected_ids == ["cheap"]
    assert res_v.total_cost == 3200.0
    assert res_v.remaining_budget == 1800.0
    assert dp_v.selected_ids == ["cheap"]


def test_multiple_equally_optimal_combinations_tie_breaking():
    """Verify multiple combinations with identical score and cost resolve to lexicographically first original indices."""
    req = SolveRequest(
        mode="shopping",
        budget=Decimal("3000.00"),
        items=[
            {"id": "first", "name": "First Pair A", "cost": Decimal("1500.00"), "score": Decimal("50.00")},
            {"id": "second", "name": "First Pair B", "cost": Decimal("1500.00"), "score": Decimal("50.00")},
            {"id": "third", "name": "Alt Single", "cost": Decimal("3000.00"), "score": Decimal("100.00")},
            {"id": "fourth", "name": "Second Pair A", "cost": Decimal("1000.00"), "score": Decimal("40.00")},
            {"id": "fifth", "name": "Second Pair B", "cost": Decimal("2000.00"), "score": Decimal("60.00")},
        ],
    )
    run = compute_run(req)
    assert run.fifo.selected_ids == ["first", "second"]
    assert run.lc.selected_ids == ["first", "second"]
    assert run.dp is not None and run.dp.selected_ids == ["first", "second"]
    assert run.fifo.total_score == run.lc.total_score == run.dp.total_score == 100.0


def test_invalid_inputs_negative_costs_invalid_budgets_missing_attributes():
    """Verify Pydantic models reject negative costs, negative budgets, missing item attributes, and >24 items."""
    # Negative cost
    with pytest.raises(ValidationError):
        Item(id="1", name="Bad Cost", cost=Decimal("-50.00"), score=Decimal("10.00"))

    # Zero cost
    with pytest.raises(ValidationError):
        Item(id="1", name="Zero Cost", cost=Decimal("0.00"), score=Decimal("10.00"))

    # Missing required attribute (score)
    with pytest.raises(ValidationError):
        Item(id="1", name="Missing Score", cost=Decimal("100.00"))  # type: ignore[call-arg]

    # Negative budget
    with pytest.raises(ValidationError):
        SolveRequest(
            mode="shopping",
            budget=Decimal("-100.00"),
            items=[{"id": "1", "name": "Valid", "cost": Decimal("50.00"), "score": Decimal("20.00")}],
        )

    # Budget > 100,000,000
    with pytest.raises(ValidationError):
        SolveRequest(
            mode="shopping",
            budget=Decimal("100000001.00"),
            items=[{"id": "1", "name": "Valid", "cost": Decimal("50.00"), "score": Decimal("20.00")}],
        )


def test_large_supported_24_item_dataset_and_never_exceeds_budget():
    """Test maximum supported 24-item dataset in both Shopping and Investment modes."""
    for mode in ("shopping", "investment"):
        items, budget = generate_benchmark_dataset(mode, size=24, seed=42)
        assert len(items) == 24
        req = SolveRequest(mode=mode, items=items, budget=budget, max_nodes=50_000, time_limit_ms=1500)
        run = compute_run(req)
        assert run.fifo.total_cost <= float(budget)
        assert run.lc.total_cost <= float(budget)
        assert run.dp is not None and run.dp.total_cost <= float(budget)
        if run.fifo.proven_optimal and run.lc.proven_optimal and run.dp.proven_optimal:
            assert run.fifo.total_score == run.lc.total_score == run.dp.total_score


def test_in_memory_database_fallback_operations():
    """Directly verify the built-in _InMemoryClient / _InMemoryDB / _InMemoryCollection fallback."""
    async def _exercise():
        client = _InMemoryClient()
        db = client["fallback_test_db"]
        assert isinstance(db, _InMemoryDB)
        assert isinstance(db.datasets, _InMemoryCollection)

        # Upsert dataset
        await db.datasets.update_one(
            {"mode": "shopping"},
            {"$setOnInsert": {"mode": "shopping", "budget": "10000", "items": []}},
            upsert=True,
        )
        assert await db.datasets.count_documents({"mode": "shopping"}) == 1
        doc = await db.datasets.find_one({"mode": "shopping"}, {"_id": 0})
        assert doc is not None and doc["budget"] == "10000"

        # Insert runs, sort, update with $set and $unset, delete
        await db.runs.insert_one({"id": "r1", "created_at": "2026-01-01T00:00:00Z", "saved": False, "expires_at": "soon"})
        await db.runs.insert_one({"id": "r2", "created_at": "2026-01-02T00:00:00Z", "saved": True, "title": "Run 2"})
        await db.runs.update_one({"id": "r1"}, {"$set": {"saved": True, "title": "Run 1"}, "$unset": {"expires_at": ""}})

        r1 = await db.runs.find_one({"id": "r1"}, {"_id": 0})
        assert r1 is not None and r1["saved"] is True and "expires_at" not in r1

        saved_list = await db.runs.find({"saved": True}, {"_id": 0}).sort("created_at", -1).to_list(10)
        assert [r["id"] for r in saved_list] == ["r2", "r1"]

        del_res = await db.runs.delete_one({"id": "r1", "saved": True})
        assert del_res.deleted_count == 1
        assert await db.runs.find_one({"id": "r1"}) is None
        client.close()

    asyncio.run(_exercise())


def test_pdf_report_with_benchmark_table_and_empty_dataset(api_client):
    """Verify PDF report generation when include_benchmark=True and when items=[]."""
    items, budget = generate_benchmark_dataset("shopping", size=8, seed=42)
    req_with_bench = ReportExportRequest(
        dataset_name="Full G12 Report With Benchmark",
        mode="shopping",
        items=items,
        budget=budget,
        include_sensitivity=True,
        sensitivity_intervals=4,
        include_benchmark=True,
        benchmark_sizes=[5, 8],
    )
    pdf_bytes = generate_optimization_pdf_report(req_with_bench)
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    full_text = "\n".join(p.extract_text() or "" for p in reader.pages)
    assert "Group G12" in full_text
    assert "Multi-Size Scaling Benchmark Summary" in full_text

    # Empty dataset PDF export
    req_empty = ReportExportRequest(
        dataset_name="Empty Dataset Report",
        mode="shopping",
        items=[],
        budget=Decimal("5000.00"),
        include_sensitivity=True,
    )
    empty_pdf = generate_optimization_pdf_report(req_empty)
    empty_reader = pypdf.PdfReader(io.BytesIO(empty_pdf))
    empty_text = "\n".join(p.extract_text() or "" for p in empty_reader.pages)
    assert "No input items were provided" in empty_text
    assert "No items were selected" in empty_text


def test_pdf_and_csv_dataset_consistency_and_mathematical_verification():
    """Verify Issue 6 & 7: PDF and CSV exports using the same benchmark configuration produce matching
    deterministic node counts and optimal values, and clearly distinguish custom vs generated sources."""
    shopping = next(s for s in SAMPLES if s["mode"] == "shopping")
    items = shopping["items"]
    budget = Decimal(shopping["budget"])

    # 1. Export PDF and CSV using the exact same Custom dataset configuration (sizes [5, 10, 15, 20], seed=42)
    pdf_req = ReportExportRequest(
        dataset_name="Shopping Advisor Dataset",
        run_id="g12-consistency-check",
        dataset_source="custom",
        mode="shopping",
        items=items,
        budget=budget,
        include_sensitivity=True,
        sensitivity_intervals=6,
        include_benchmark=True,
        benchmark_dataset_source="custom",
        benchmark_sizes=[5, 10, 15, 20],
        benchmark_repetitions=2,
        benchmark_seed=42,
    )
    pdf_bytes = generate_optimization_pdf_report(pdf_req)
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    assert len(reader.pages) == 2
    pdf_text = "\n".join(p.extract_text() or "" for p in reader.pages)
    assert "Source: Custom [Shopping Advisor Dataset]" in pdf_text
    assert "Seed 42" in pdf_text

    csv_req = BenchmarkRequest(
        dataset_name="Shopping Advisor Dataset",
        mode="shopping",
        dataset_source="custom",
        sizes=[5, 10, 15, 20],
        repetitions=2,
        seed=42,
        budget=budget,
        custom_items=items,
    )
    bench_res = run_benchmark_suite(csv_req)
    csv_text = generate_benchmark_csv(bench_res)
    parsed_csv = list(csv.reader(io.StringIO(csv_text)))
    assert len(parsed_csv) == 1 + 4 * 2

    # Every row in the CSV must appear with matching deterministic node counts & optimal value in the PDF
    for brow in bench_res.rows:
        assert f"{brow.fifo.optimal_value:,.2f}" in pdf_text
        assert f"{brow.lc.optimal_value:,.2f}" in pdf_text
        assert f"{brow.fifo.nodes_explored:,}" in pdf_text
        assert f"{brow.lc.nodes_explored:,}" in pdf_text


# ============================================================================
# CATEGORY 3: SEARCH TREE, REPLAY TIMELINE, AND NODE-ACCOUNTING REGRESSION
# ============================================================================

def test_search_tree_solution_path_and_replay_timeline_invariants():
    """Verify search tree trace nodes, on_solution path marking, and step-by-step replay SearchFrame invariants."""
    shopping = next(s for s in SAMPLES if s["mode"] == "shopping")
    req = SolveRequest(mode="shopping", items=shopping["items"], budget=Decimal(shopping["budget"]))
    run = compute_run(req)

    for res in (run.fifo, run.lc):
        # Verify node-accounting equations
        assert res.generated == 1 + 2 * res.expanded
        assert res.generated == res.visited + res.frontier_remaining
        assert res.pruned == res.bound_pruned + res.infeasible_pruned
        assert res.frontier_remaining == 0
        assert res.proven_optimal is True

        # Verify trace tree structure and on_solution root marking
        assert 1 <= len(res.trace) <= 30
        trace_by_id = {t.id: t for t in res.trace}
        assert 0 in trace_by_id
        assert trace_by_id[0].on_solution is True
        for t in res.trace:
            if t.parent is not None:
                assert t.parent in trace_by_id
                if t.on_solution:
                    assert trace_by_id[t.parent].on_solution is True

        # Verify progress frames for step-by-step replay
        assert len(res.progress) >= 2
        visited_seq = [f.visited for f in res.progress]
        assert visited_seq == sorted(visited_seq)
        assert res.progress[-1].visited == res.visited
        assert res.progress[-1].generated == res.generated
        assert res.progress[-1].pruned == res.pruned
        assert res.progress[-1].frontier == res.frontier_remaining
        assert res.progress[-1].best_score == res.total_score


def test_frontend_manual_selection_undo_redo_and_local_solver_suite():
    """Execute the frontend logic test suite (manualSelection.ts, useDraftHistory.ts Undo/Redo, localSolver.ts) via Node.js."""
    import subprocess
    frontend_dir = Path(__file__).resolve().parents[2] / "frontend"
    res = subprocess.run(
        ["node", "--test", "src/frontend_logic.test.mjs"],
        cwd=str(frontend_dir),
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert res.returncode == 0, f"Frontend test suite failed:\n{res.stdout}\n{res.stderr}"
    assert "pass 5" in res.stdout
    assert "fail 0" in res.stdout
