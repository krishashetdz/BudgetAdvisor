"""Automated test suite for Feature 1 (Performance Benchmarking), Feature 2 (What-If Budget Sensitivity),
and Feature 3 (PDF & CSV Report Generation).

Covers all audit requirements across:
A. Performance Benchmarking (identical datasets, dataset sizes, warm-up, repeated runs, median calculation,
   generated/explored/pruned node counts, DP optimality agreement, timeout & node-limit handling).
B. Budget Sensitivity (min/max budget, multiple intervals, independent evaluation, expenditure <= budget,
   remaining budget accuracy, solver score parity, Shopping & Investment modes, verification status).
C. PDF Export (successful PDF 1.4 generation, actual optimization/benchmark/sensitivity values, missing optional
   data handling, incomplete search warnings, 24-item large dataset handling, Investment mode disclaimer).
D. CSV Export (successful generation, 24 required columns including Dataset Name/Source/Seed, exact value parity,
   no duplicate rows, graceful handling of empty/missing or capped data).
"""
from __future__ import annotations

import csv
from decimal import Decimal
import io
import os
from pathlib import Path
import statistics
import sys
from unittest.mock import patch

import pypdf
import pytest
import requests
from dotenv import load_dotenv

sys.path.append(str(Path(__file__).resolve().parents[1]))

from benchmark import _measure_strategy, generate_benchmark_dataset, run_benchmark_suite  # noqa: E402
from computation import compute_run  # noqa: E402
from dp_solver import solve_dp  # noqa: E402
from models import (  # noqa: E402
    BenchmarkRequest,
    BenchmarkResponse,
    ReportExportRequest,
    SensitivityRequest,
    SolveRequest,
)
from report_generator import generate_benchmark_csv, generate_optimization_pdf_report  # noqa: E402
from samples import SAMPLES  # noqa: E402
from sensitivity import run_sensitivity_analysis  # noqa: E402
from solver import solve  # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or "http://127.0.0.1:8000"


@pytest.fixture(scope="session")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture
def shopping_sample():
    return next(s for s in SAMPLES if s["mode"] == "shopping")


@pytest.fixture
def investment_sample():
    return next(s for s in SAMPLES if s["mode"] == "investment")


# ============================================================================
# A. PERFORMANCE BENCHMARKING TESTS
# ============================================================================

def test_benchmark_different_dataset_sizes_and_identical_inputs():
    """Verify FIFO and LC use identical datasets across sizes [5, 10, 15, 20, 24] and match direct solver runs."""
    sizes = [5, 10, 15, 20, 24]
    req = BenchmarkRequest(
        mode="shopping",
        dataset_source="generated",
        sizes=sizes,
        repetitions=2,
        seed=42,
        max_nodes=50_000,
        time_limit_ms=1500,
    )
    res = run_benchmark_suite(req)
    assert res.mode == "shopping"
    assert res.dataset_source == "generated"
    assert res.seed == 42
    assert "Seed 42" in res.dataset_name
    assert res.warmup_performed is True
    assert len(res.rows) == len(sizes)

    for row, expected_size in zip(res.rows, sizes):
        assert row.dataset_size == expected_size
        assert row.budget > 0
        items, budget = generate_benchmark_dataset("shopping", expected_size, seed=42)
        single_req = SolveRequest(mode="shopping", items=items, budget=budget, max_nodes=50_000, time_limit_ms=1500)
        expected_fifo = solve(single_req, "fifo")
        expected_lc = solve(single_req, "lc")
        expected_dp = solve_dp(single_req)

        # Verify FIFO counts and values
        assert row.fifo.nodes_generated == expected_fifo.generated
        assert row.fifo.nodes_explored == expected_fifo.visited
        assert row.fifo.nodes_pruned == expected_fifo.pruned
        assert row.fifo.bound_pruned == expected_fifo.bound_pruned
        assert row.fifo.infeasible_pruned == expected_fifo.infeasible_pruned
        assert row.fifo.max_queue_size == expected_fifo.max_queue_size
        assert row.fifo.optimal_value == expected_fifo.total_score
        assert row.fifo.selected_cost == expected_fifo.total_cost
        assert row.fifo.remaining_budget == expected_fifo.remaining_budget
        assert row.fifo.selected_ids == expected_fifo.selected_ids

        # Verify LC counts and values
        assert row.lc.nodes_generated == expected_lc.generated
        assert row.lc.nodes_explored == expected_lc.visited
        assert row.lc.nodes_pruned == expected_lc.pruned
        assert row.lc.bound_pruned == expected_lc.bound_pruned
        assert row.lc.infeasible_pruned == expected_lc.infeasible_pruned
        assert row.lc.max_queue_size == expected_lc.max_queue_size
        assert row.lc.optimal_value == expected_lc.total_score
        assert row.lc.selected_cost == expected_lc.total_cost
        assert row.lc.remaining_budget == expected_lc.remaining_budget
        assert row.lc.selected_ids == expected_lc.selected_ids

        # Verify node invariants
        assert row.fifo.nodes_generated >= row.fifo.nodes_explored
        assert row.lc.nodes_generated >= row.lc.nodes_explored
        assert row.fifo.nodes_pruned == row.fifo.bound_pruned + row.fifo.infeasible_pruned
        assert row.lc.nodes_pruned == row.lc.bound_pruned + row.lc.infeasible_pruned

        # DP verification check
        assert row.verification.dp_optimal_value == expected_dp.total_score
        if row.fifo.proven_optimal and row.lc.proven_optimal and row.verification.dp_proven_optimal:
            assert row.verification.fifo_matches_dp is True
            assert row.verification.lc_matches_dp is True
            assert row.verification.fifo_matches_lc is True
            assert row.verification.all_agree is True


def test_benchmark_dataset_sizes_sorted_and_deduplicated():
    """Verify unsorted or duplicate dataset sizes are deduplicated and evaluated in ascending order."""
    req = BenchmarkRequest(
        mode="shopping",
        dataset_source="generated",
        sizes=[15, 5, 10, 5, 15],
        repetitions=1,
        seed=99,
    )
    res = run_benchmark_suite(req)
    assert [r.dataset_size for r in res.rows] == [5, 10, 15]
    assert res.seed == 99


def test_benchmark_warmup_and_repeated_runs_median_calculation(shopping_sample):
    """Verify warm-up runs execute and median execution time is calculated accurately across repetitions."""
    req = BenchmarkRequest(
        mode="shopping",
        dataset_source="custom",
        sizes=[5, 8],
        repetitions=5,
        budget=Decimal(shopping_sample["budget"]),
        custom_items=shopping_sample["items"],
    )
    res = run_benchmark_suite(req)
    assert res.warmup_performed is True
    assert res.repetitions == 5
    for row in res.rows:
        assert row.fifo.min_time_ms <= row.fifo.execution_time_ms <= row.fifo.max_time_ms
        assert row.lc.min_time_ms <= row.lc.execution_time_ms <= row.lc.max_time_ms

    # Directly verify median calculation on controlled synthetic elapsed_ms sequence
    solve_req = SolveRequest(
        mode="shopping",
        items=shopping_sample["items"][:5],
        budget=Decimal("5000.00"),
    )
    real_res = solve(solve_req, "lc")
    synthetic_times = [1.200, 0.450, 0.820, 3.100, 0.610]
    call_idx = 0

    def _fake_solve(r, strat):
        nonlocal call_idx
        copy_res = real_res.model_copy(update={"elapsed_ms": synthetic_times[call_idx]}) if hasattr(real_res, "model_copy") else real_res.copy(update={"elapsed_ms": synthetic_times[call_idx]})
        call_idx += 1
        return copy_res

    with patch("benchmark.solve", side_effect=_fake_solve):
        metrics = _measure_strategy(solve_req, "lc", repetitions=5)
    assert metrics.execution_time_ms == round(float(statistics.median(synthetic_times)), 3) == 0.820
    assert metrics.min_time_ms == 0.450
    assert metrics.max_time_ms == 3.100


def test_benchmark_custom_dataset_and_investment_mode(investment_sample):
    """Verify custom dataset benchmarking in Investment mode including scaling beyond 8 items."""
    req = BenchmarkRequest(
        mode="investment",
        dataset_source="custom",
        sizes=[5, 8, 12],
        repetitions=2,
        budget=Decimal(investment_sample["budget"]),
        custom_items=investment_sample["items"],
        max_nodes=50_000,
        time_limit_ms=1500,
    )
    res = run_benchmark_suite(req)
    assert res.mode == "investment"
    assert res.dataset_source == "custom"
    assert [r.dataset_size for r in res.rows] == [5, 8, 12]
    for r in res.rows:
        assert r.budget == 10000.0
        assert r.verification.all_agree is True


def test_benchmark_timeout_and_node_limit_handling():
    """Verify node_limit and time_limit handling: incomplete results are never reported as proven optimal,
    and generated nodes can exceed the explored-node limit (max_nodes)."""
    # 1. Node limit cap (max_nodes = 5 explored nodes)
    req_node = BenchmarkRequest(
        mode="shopping",
        dataset_source="generated",
        sizes=[10, 15],
        repetitions=1,
        max_nodes=5,
        time_limit_ms=1500,
    )
    res_node = run_benchmark_suite(req_node)
    for row in res_node.rows:
        assert row.fifo.nodes_explored == 5
        assert row.fifo.nodes_generated > row.fifo.nodes_explored
        assert row.fifo.proven_optimal is False
        assert row.fifo.stop_reason == "node_limit"
        assert row.lc.nodes_explored == 5
        assert row.lc.nodes_generated > row.lc.nodes_explored
        assert row.lc.proven_optimal is False
        assert row.lc.stop_reason == "node_limit"
        assert row.verification.all_agree is False
        assert "capped" in row.verification.status_label.lower() or "limit" in row.verification.status_label.lower()

    # 2. Time limit cap (24 items with 1 ms limit)
    req_time = BenchmarkRequest(
        mode="shopping",
        dataset_source="generated",
        sizes=[24],
        repetitions=1,
        max_nodes=50_000,
        time_limit_ms=1,
    )
    res_time = run_benchmark_suite(req_time)
    row24 = res_time.rows[0]
    if not row24.fifo.proven_optimal:
        assert row24.fifo.stop_reason in ("time_limit", "node_limit")
        assert row24.verification.all_agree is False


def test_api_benchmark_endpoint(api_client):
    payload = {
        "mode": "shopping",
        "dataset_source": "generated",
        "sizes": [5, 10, 15],
        "repetitions": 2,
        "seed": 42,
        "max_nodes": 50000,
        "time_limit_ms": 1500,
    }
    resp = api_client.post(f"{BASE_URL}/api/benchmark", json=payload, timeout=30)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["rows"]) == 3
    assert body["rows"][0]["dataset_size"] == 5
    assert body["rows"][0]["fifo"]["max_queue_size"] >= 1
    assert body["rows"][0]["lc"]["max_queue_size"] >= 1


def test_api_benchmark_validation_rejects_invalid_size(api_client):
    payload = {
        "mode": "shopping",
        "dataset_source": "generated",
        "sizes": [0, 25],
        "repetitions": 2,
    }
    resp = api_client.post(f"{BASE_URL}/api/benchmark", json=payload, timeout=20)
    assert resp.status_code == 422


# ============================================================================
# B. BUDGET SENSITIVITY / WHAT-IF ANALYSIS TESTS
# ============================================================================

def test_sensitivity_analysis_monotonic_and_matches_solver(shopping_sample):
    """Verify min budget, max budget, multiple intervals, independent evaluation, expenditure <= budget,
    remaining budget accuracy, and exact match with direct solver outputs in Shopping mode."""
    req = SensitivityRequest(
        mode="shopping",
        items=shopping_sample["items"],
        min_budget=Decimal("2000.00"),
        max_budget=Decimal("16000.00"),
        intervals=8,
        include_fifo_comparison=True,
    )
    res = run_sensitivity_analysis(req)
    assert res.mode == "shopping"
    assert res.min_budget == 2000.0
    assert res.max_budget == 16000.0
    assert len(res.points) == 8
    assert res.points[0].budget == 2000.0
    assert res.points[-1].budget == 16000.0
    assert len(res.insights) >= 1

    prev_score = -1.0
    for pt in res.points:
        assert 2000.0 <= pt.budget <= 16000.0
        assert pt.total_expenditure <= pt.budget
        assert round(pt.total_expenditure + pt.remaining_budget, 2) == round(pt.budget, 2)
        assert pt.selected_item_count == len(pt.selected_ids) == len(pt.selected_names)
        assert pt.optimal_score >= prev_score
        prev_score = pt.optimal_score

        # Verify each budget point is independently evaluated and matches direct solver & DP
        direct_req = SolveRequest(
            mode="shopping",
            items=shopping_sample["items"],
            budget=Decimal(f"{pt.budget:.2f}"),
        )
        direct_lc = solve(direct_req, "lc")
        direct_fifo = solve(direct_req, "fifo")
        direct_dp = solve_dp(direct_req)
        assert pt.optimal_score == direct_lc.total_score == direct_dp.total_score
        assert pt.total_expenditure == direct_lc.total_cost
        assert pt.remaining_budget == direct_lc.remaining_budget
        assert pt.selected_ids == direct_lc.selected_ids
        assert pt.lc_visited == direct_lc.visited
        assert pt.fifo_visited == direct_fifo.visited
        assert pt.verified_optimal is True
        assert pt.verification_status == "Verified Optimal (Matches DP)"


def test_sensitivity_investment_mode_and_capped_verification_status(investment_sample):
    """Verify Investment mode sensitivity analysis and honest verification_status when search is capped."""
    req_full = SensitivityRequest(
        mode="investment",
        items=investment_sample["items"],
        min_budget=Decimal("1500.00"),
        max_budget=Decimal("12000.00"),
        intervals=6,
        include_fifo_comparison=True,
    )
    res_full = run_sensitivity_analysis(req_full)
    assert res_full.mode == "investment"
    assert len(res_full.points) == 6
    assert res_full.points[0].budget == 1500.0
    assert res_full.points[-1].budget == 12000.0
    for pt in res_full.points:
        assert pt.total_expenditure <= pt.budget
        assert round(pt.total_expenditure + pt.remaining_budget, 2) == round(pt.budget, 2)
        assert pt.verified_optimal is True
        assert pt.verification_status == "Verified Optimal (Matches DP)"

    # Capped search (max_nodes = 1) must report verified_optimal = False
    req_capped = SensitivityRequest(
        mode="investment",
        items=investment_sample["items"],
        min_budget=Decimal("3000.00"),
        max_budget=Decimal("9000.00"),
        intervals=3,
        max_nodes=1,
    )
    res_capped = run_sensitivity_analysis(req_capped)
    for pt in res_capped.points:
        assert pt.verified_optimal is False
        assert "Capped" in pt.verification_status


def test_sensitivity_boundary_zero_and_equal_budgets(investment_sample):
    req = SensitivityRequest(
        mode="investment",
        items=investment_sample["items"],
        min_budget=Decimal("0.00"),
        max_budget=Decimal("0.00"),
        intervals=4,
    )
    res = run_sensitivity_analysis(req)
    assert len(res.points) == 1
    assert res.points[0].budget == 0.0
    assert res.points[0].optimal_score == 0.0
    assert res.points[0].selected_item_count == 0
    assert res.points[0].remaining_budget == 0.0


def test_api_sensitivity_endpoint_and_validation(api_client, shopping_sample):
    payload = {
        "mode": "shopping",
        "items": shopping_sample["items"],
        "min_budget": "2000.00",
        "max_budget": "14000.00",
        "intervals": 7,
        "include_fifo_comparison": True,
    }
    resp = api_client.post(f"{BASE_URL}/api/sensitivity", json=payload, timeout=30)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["points"]) == 7
    assert data["points"][0]["budget"] == 2000.0
    assert data["points"][-1]["budget"] == 14000.0
    assert len(data["insights"]) >= 1

    # Invalid min > max should return 422
    bad_payload = {**payload, "min_budget": "20000.00", "max_budget": "5000.00"}
    bad_resp = api_client.post(f"{BASE_URL}/api/sensitivity", json=bad_payload, timeout=20)
    assert bad_resp.status_code == 422


# ============================================================================
# C. PDF EXPORT TESTS
# ============================================================================

def test_pdf_report_generation_and_content_accuracy(shopping_sample):
    """Verify PDF generates successfully and matches actual solver expenditure, remaining budget, score,
    selected items, FIFO/LC node metrics, DP verification, and sensitivity data."""
    req = ReportExportRequest(
        dataset_name="Academic Evaluation Set",
        run_id="run-g12-test",
        dataset_source="custom",
        mode="shopping",
        items=shopping_sample["items"],
        budget=Decimal("10000.00"),
        include_sensitivity=True,
        sensitivity_intervals=6,
    )
    solve_req = SolveRequest(mode="shopping", items=shopping_sample["items"], budget=Decimal("10000.00"))
    expected_run = compute_run(solve_req)

    pdf_bytes = generate_optimization_pdf_report(req)
    assert pdf_bytes.startswith(b"%PDF-1.4")
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    assert len(reader.pages) == 2
    full_text = "\n".join(page.extract_text() or "" for page in reader.pages)

    # Verify all 7 sections and exact solver figures appear in PDF text
    assert "GROUP ID: G12" in full_text
    assert "Academic Evaluation Set" in full_text
    assert "run-g12-te" in full_text
    assert "Project and Optimization Details" in full_text
    assert "Input Dataset" in full_text
    assert "Optimal Recommendation" in full_text
    assert f"{expected_run.lc.total_score:,.2f}" in full_text  # 364.00
    assert f"{expected_run.lc.total_cost:,.2f}" in full_text   # 9,700.00
    assert f"{expected_run.lc.remaining_budget:,.2f}" in full_text  # 300.00
    assert str(expected_run.fifo.visited) in full_text  # 89
    assert str(expected_run.lc.visited) in full_text    # 41
    assert "Algorithm Performance" in full_text
    assert "Independent Dynamic Programming Verification" in full_text
    assert "Budget Sensitivity" in full_text
    assert "Conclusion" in full_text
    assert "Page 1 of 2" in full_text
    assert "Page 2 of 2" in full_text


def test_pdf_report_handles_missing_sensitivity_and_capped_search(investment_sample):
    """Verify PDF handles missing optional sensitivity/benchmark data, Investment disclaimer, and incomplete searches."""
    req = ReportExportRequest(
        dataset_name="Capped Investment Set",
        mode="investment",
        items=investment_sample["items"],
        budget=Decimal("10000.00"),
        max_nodes=2,
        include_sensitivity=False,
        include_benchmark=False,
    )
    pdf_bytes = generate_optimization_pdf_report(req)
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    full_text = "\n".join(page.extract_text() or "" for page in reader.pages)
    assert "Capped Investment Set" in full_text
    assert "Disclaimer: Investment mode uses an educational additive score model" in full_text
    assert "Execution-Limit Warning" in full_text
    assert "not requested" in full_text


def test_pdf_report_large_24_item_dataset_does_not_break():
    """Verify PDF export succeeds cleanly on the maximum supported 24-item dataset with benchmark and sensitivity enabled."""
    items, budget = generate_benchmark_dataset("shopping", size=24, seed=42)
    req = ReportExportRequest(
        dataset_name="Max 24-Item Stress Dataset",
        mode="shopping",
        items=items,
        budget=budget,
        include_sensitivity=True,
        sensitivity_intervals=6,
        include_benchmark=True,
        benchmark_sizes=[5, 10, 15, 20, 24],
    )
    pdf_bytes = generate_optimization_pdf_report(req)
    assert pdf_bytes.startswith(b"%PDF-1.4")
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    assert len(reader.pages) >= 2
    full_text = "\n".join(page.extract_text() or "" for page in reader.pages)
    assert "Max 24-Item Stress Dataset" in full_text
    assert "Input Dataset (24 Items" in full_text
    assert "Multi-Size Scaling Benchmark Summary" in full_text


# ============================================================================
# D. CSV EXPORT TESTS
# ============================================================================

def test_csv_report_generation_matches_benchmark_and_no_duplicates():
    """Verify CSV export includes all 24 columns (including Dataset Name, Dataset Source, Seed),
    matches backend benchmark calculations exactly, and does not duplicate rows."""
    bench_req = BenchmarkRequest(
        dataset_name="Reproducible Shopping Pool",
        mode="shopping",
        dataset_source="generated",
        sizes=[5, 10, 5, 10],
        repetitions=1,
        seed=42,
    )
    bench_res = run_benchmark_suite(bench_req)
    csv_text = generate_benchmark_csv(bench_res)
    rows = list(csv.reader(io.StringIO(csv_text)))
    assert len(rows) == 1 + 2 * 2  # Header + 2 unique sizes * 2 algorithms
    header = rows[0]
    expected_columns = [
        "Dataset Size",
        "Mode",
        "Budget (INR)",
        "Algorithm",
        "Execution Time Median (ms)",
        "Execution Time Min (ms)",
        "Execution Time Max (ms)",
        "Nodes Generated",
        "Nodes Explored",
        "Nodes Pruned",
        "Bound Pruned",
        "Infeasible Pruned",
        "Max Queue Size",
        "Optimal Value",
        "Selected Cost (INR)",
        "Remaining Budget (INR)",
        "Proven Optimal",
        "Stop Reason",
        "DP Optimal Value",
        "Matches DP",
        "Verification Status",
        "Dataset Name",
        "Dataset Source",
        "Seed",
    ]
    assert header == expected_columns

    # Verify row values match bench_res.rows[0] (size 5, FIFO and LC)
    r0 = bench_res.rows[0]
    fifo_row = rows[1]
    lc_row = rows[2]
    assert fifo_row[0] == "5"
    assert fifo_row[3] == "FIFO"
    assert int(fifo_row[7]) == r0.fifo.nodes_generated
    assert int(fifo_row[8]) == r0.fifo.nodes_explored
    assert int(fifo_row[9]) == r0.fifo.nodes_pruned
    assert int(fifo_row[12]) == r0.fifo.max_queue_size
    assert float(fifo_row[13]) == r0.fifo.optimal_value
    assert float(fifo_row[14]) == r0.fifo.selected_cost
    assert float(fifo_row[15]) == r0.fifo.remaining_budget
    assert fifo_row[21] == "Reproducible Shopping Pool"
    assert fifo_row[22] == "generated"
    assert fifo_row[23] == "42"

    assert lc_row[0] == "5"
    assert lc_row[3] == "LC"
    assert int(lc_row[7]) == r0.lc.nodes_generated
    assert int(lc_row[8]) == r0.lc.nodes_explored
    assert float(lc_row[13]) == r0.lc.optimal_value
    assert lc_row[21] == "Reproducible Shopping Pool"
    assert lc_row[22] == "generated"
    assert lc_row[23] == "42"


def test_csv_export_handles_empty_rows_gracefully():
    """Verify generate_benchmark_csv handles an empty BenchmarkResponse.rows list gracefully."""
    empty_bench = BenchmarkResponse(
        dataset_name="Empty Test Pool",
        mode="shopping",
        dataset_source="generated",
        seed=42,
        repetitions=1,
        warmup_performed=True,
        generated_at="2026-11-05T00:00:00Z",
        hardware_note="Empty test",
        rows=[],
    )
    csv_text = generate_benchmark_csv(empty_bench)
    parsed = list(csv.reader(io.StringIO(csv_text)))
    assert len(parsed) == 1
    assert parsed[0][0] == "Dataset Size"
    assert parsed[0][-3:] == ["Dataset Name", "Dataset Source", "Seed"]


def test_api_pdf_and_csv_export_endpoints(api_client, shopping_sample):
    pdf_payload = {
        "dataset_name": "E2E API PDF Test",
        "mode": "shopping",
        "items": shopping_sample["items"],
        "budget": "10000.00",
        "include_sensitivity": True,
        "sensitivity_intervals": 5,
    }
    pdf_resp = api_client.post(f"{BASE_URL}/api/report/pdf", json=pdf_payload, timeout=30)
    assert pdf_resp.status_code == 200
    assert "application/pdf" in pdf_resp.headers.get("content-type", "")
    assert pdf_resp.content.startswith(b"%PDF-1.4")

    csv_payload = {
        "mode": "shopping",
        "dataset_source": "generated",
        "sizes": [5, 10],
        "repetitions": 1,
    }
    csv_resp = api_client.post(f"{BASE_URL}/api/report/csv", json=csv_payload, timeout=30)
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers.get("content-type", "")
    lines = csv_resp.text.strip().splitlines()
    assert len(lines) == 5
