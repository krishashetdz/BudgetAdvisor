"""Automated test suite for Feature 1 (Benchmarking), Feature 2 (What-If Budget Sensitivity),
and Feature 3 (PDF & CSV Report Generation).
"""
from __future__ import annotations

import csv
from decimal import Decimal
import io
import os
from pathlib import Path
import sys

import pypdf
import pytest
import requests
from dotenv import load_dotenv

sys.path.append(str(Path(__file__).resolve().parents[1]))

from benchmark import generate_benchmark_dataset, run_benchmark_suite  # noqa: E402
from dp_solver import solve_dp  # noqa: E402
from models import (  # noqa: E402
    BenchmarkRequest,
    ReportExportRequest,
    SensitivityRequest,
    SolveRequest,
)
from report_generator import generate_benchmark_csv, generate_optimization_pdf_report  # noqa: E402
from samples import SAMPLES  # noqa: E402
from sensitivity import run_sensitivity_analysis  # noqa: E402
from solver import solve  # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8000"


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


# --- FEATURE 1 TESTS: PERFORMANCE BENCHMARKING ---

def test_benchmark_different_dataset_sizes_and_identical_inputs():
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
    assert res.warmup_performed is True
    assert len(res.rows) == len(sizes)

    for row, expected_size in zip(res.rows, sizes):
        assert row.dataset_size == expected_size
        assert row.budget > 0
        # Verify both FIFO and LC ran on the exact same generated dataset and match single-run solver
        items, budget = generate_benchmark_dataset("shopping", expected_size, seed=42)
        single_req = SolveRequest(mode="shopping", items=items, budget=budget, max_nodes=50_000, time_limit_ms=1500)
        expected_fifo = solve(single_req, "fifo")
        expected_lc = solve(single_req, "lc")
        expected_dp = solve_dp(single_req)

        assert row.fifo.nodes_generated == expected_fifo.generated
        assert row.fifo.nodes_explored == expected_fifo.visited
        assert row.fifo.nodes_pruned == expected_fifo.pruned
        assert row.fifo.max_queue_size == expected_fifo.max_queue_size
        assert row.fifo.optimal_value == expected_fifo.total_score
        assert row.fifo.selected_cost == expected_fifo.total_cost
        assert row.fifo.remaining_budget == expected_fifo.remaining_budget

        assert row.lc.nodes_generated == expected_lc.generated
        assert row.lc.nodes_explored == expected_lc.visited
        assert row.lc.nodes_pruned == expected_lc.pruned
        assert row.lc.max_queue_size == expected_lc.max_queue_size
        assert row.lc.optimal_value == expected_lc.total_score
        assert row.lc.selected_cost == expected_lc.total_cost
        assert row.lc.remaining_budget == expected_lc.remaining_budget

        # DP verification check
        assert row.verification.dp_optimal_value == expected_dp.total_score
        if row.fifo.proven_optimal and row.lc.proven_optimal and row.verification.dp_proven_optimal:
            assert row.verification.fifo_matches_dp is True
            assert row.verification.lc_matches_dp is True
            assert row.verification.fifo_matches_lc is True
            assert row.verification.all_agree is True


def test_benchmark_custom_dataset_and_investment_mode(investment_sample):
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
    req = BenchmarkRequest(
        mode="shopping",
        dataset_source="generated",
        sizes=[10, 15],
        repetitions=1,
        max_nodes=5,
        time_limit_ms=1500,
    )
    res = run_benchmark_suite(req)
    for row in res.rows:
        assert row.fifo.proven_optimal is False
        assert row.fifo.stop_reason == "node_limit"
        assert row.lc.proven_optimal is False
        assert row.lc.stop_reason == "node_limit"
        assert row.verification.all_agree is False
        assert "capped" in row.verification.status_label.lower() or "limit" in row.verification.status_label.lower()


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


# --- FEATURE 2 TESTS: BUDGET SENSITIVITY / WHAT-IF ANALYSIS ---

def test_sensitivity_analysis_monotonic_and_matches_solver(shopping_sample):
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
    assert len(res.points) == 8
    assert len(res.insights) >= 1

    prev_score = -1.0
    for pt in res.points:
        assert 2000.0 <= pt.budget <= 16000.0
        # All selected items must remain within tested budget
        assert pt.total_expenditure <= pt.budget
        assert round(pt.total_expenditure + pt.remaining_budget, 2) == round(pt.budget, 2)
        # Non-decreasing optimal score as budget increases in 0/1 Knapsack
        assert pt.optimal_score >= prev_score
        prev_score = pt.optimal_score

        # Verify output matches underlying solver directly
        direct_req = SolveRequest(
            mode="shopping",
            items=shopping_sample["items"],
            budget=Decimal(f"{pt.budget:.2f}"),
        )
        direct_lc = solve(direct_req, "lc")
        assert pt.optimal_score == direct_lc.total_score
        assert pt.total_expenditure == direct_lc.total_cost
        assert pt.selected_ids == direct_lc.selected_ids


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


# --- FEATURE 3 TESTS: REPORT GENERATION (PDF & CSV) ---

def test_pdf_report_generation_and_content_accuracy(shopping_sample):
    req = ReportExportRequest(
        dataset_name="Academic Evaluation Set",
        mode="shopping",
        items=shopping_sample["items"],
        budget=Decimal("10000.00"),
        include_sensitivity=True,
        sensitivity_intervals=6,
    )
    pdf_bytes = generate_optimization_pdf_report(req)
    assert pdf_bytes.startswith(b"%PDF-1.4")
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    assert len(reader.pages) >= 1
    full_text = "\n".join(page.extract_text() or "" for page in reader.pages)

    # Verify all 7 sections and accurate solver figures appear in PDF text
    assert "Academic Evaluation Set" in full_text
    assert "Project and Optimization Details" in full_text
    assert "Input Dataset" in full_text
    assert "Optimal Recommendation" in full_text
    assert "364.00" in full_text  # Proven optimal score for shopping sample at 10,000
    assert "9,700.00" in full_text  # Proven expenditure
    assert "Algorithm Performance" in full_text
    assert "Independent Dynamic Programming Verification" in full_text
    assert "Budget Sensitivity" in full_text
    assert "Conclusion" in full_text
    assert "Page 1 of" in full_text


def test_pdf_report_handles_missing_sensitivity_and_capped_search(investment_sample):
    req = ReportExportRequest(
        dataset_name="Capped Investment Set",
        mode="investment",
        items=investment_sample["items"],
        budget=Decimal("10000.00"),
        max_nodes=2,
        include_sensitivity=False,
    )
    pdf_bytes = generate_optimization_pdf_report(req)
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    full_text = "\n".join(page.extract_text() or "" for page in reader.pages)
    assert "Capped Investment Set" in full_text
    assert "Execution-Limit Warning" in full_text
    assert "not requested" in full_text


def test_csv_report_generation_matches_benchmark():
    bench_req = BenchmarkRequest(
        mode="shopping",
        dataset_source="generated",
        sizes=[5, 10],
        repetitions=1,
    )
    bench_res = run_benchmark_suite(bench_req)
    csv_text = generate_benchmark_csv(bench_res)
    rows = list(csv.reader(io.StringIO(csv_text)))
    assert len(rows) == 1 + 2 * 2  # Header + 2 sizes * 2 algorithms
    header = rows[0]
    assert "Dataset Size" in header
    assert "Algorithm" in header
    assert "Max Queue Size" in header
    assert "Optimal Value" in header
    assert rows[1][0] == "5"
    assert rows[1][3] == "FIFO"
    assert rows[2][0] == "5"
    assert rows[2][3] == "LC"


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
