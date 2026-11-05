"""Iteration 3 regression tests: DP baseline correctness and NDJSON streaming behavior."""

# Module coverage: /api/solve DP parity, bounded-status honesty, and /api/solve/stream progress semantics.

from __future__ import annotations

from decimal import Decimal
from itertools import combinations
import os
import random
import time

import pytest
import requests
from dotenv import load_dotenv


from pathlib import Path
load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8000"

if not BASE_URL:
    raise RuntimeError("REACT_APP_BACKEND_URL is required for public endpoint testing")


@pytest.fixture(scope="session")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture
def datasets(api_client):
    response = api_client.get(f"{BASE_URL}/api/datasets", timeout=30)
    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload, list)
    return {entry["mode"]: entry for entry in payload}


def _to_cents(value: str | float | int | Decimal) -> int:
    return int(Decimal(str(value)) * 100)


def _rank(score_cents: int, cost_cents: int, indices: tuple[int, ...]) -> tuple[int, int, tuple[int, ...]]:
    return (-score_cents, cost_cents, indices)


def exhaustive_best(items: list[dict], budget: str | float | int) -> dict:
    budget_cents = _to_cents(budget)
    best_score, best_cost, best_indices = 0, 0, ()
    n = len(items)
    costs = [_to_cents(i["cost"]) for i in items]
    scores = [_to_cents(i["score"]) for i in items]
    for size in range(n + 1):
        for subset in combinations(range(n), size):
            cost = sum(costs[i] for i in subset)
            if cost > budget_cents:
                continue
            score = sum(scores[i] for i in subset)
            if _rank(score, cost, subset) < _rank(best_score, best_cost, best_indices):
                best_score, best_cost, best_indices = score, cost, subset
    return {
        "selected_ids": [items[i]["id"] for i in best_indices],
        "total_cost": best_cost / 100,
        "total_score": best_score / 100,
        "remaining_budget": (budget_cents - best_cost) / 100,
    }


def post_solve(api_client, payload: dict, timeout: int = 60) -> dict:
    response = api_client.post(f"{BASE_URL}/api/solve", json=payload, timeout=timeout)
    assert response.status_code == 200
    return response.json()


def test_public_health_and_datasets_contract_preserved(api_client, datasets):
    health = api_client.get(f"{BASE_URL}/api/", timeout=20)
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    assert set(datasets.keys()) == {"shopping", "investment"}
    assert len(datasets["shopping"]["items"]) == 8
    assert len(datasets["investment"]["items"]) == 8


def test_seeded_shopping_returns_dp_and_honest_triplet_metrics(api_client, datasets):
    snapshot = datasets["shopping"]
    payload = {
        "mode": "shopping",
        "items": snapshot["items"],
        "budget": snapshot["budget"],
        "max_nodes": 50000,
        "time_limit_ms": 1500,
    }
    run = post_solve(api_client, payload)
    assert run["dp"] is not None
    assert run["dp"]["proven_optimal"] is True
    assert run["comparison_complete"] is True
    assert run["fifo"]["total_score"] == run["lc"]["total_score"] == run["dp"]["total_score"]
    assert run["dp"]["states_explored"] >= 1
    assert run["fifo"]["visited"] >= 1
    assert run["lc"]["visited"] >= 1


def test_dp_fractional_tie_case_matches_exhaustive_and_canonical_ids(api_client):
    items = [
        {"id": "a", "name": "A", "cost": "1.25", "score": "2.50"},
        {"id": "b", "name": "B", "cost": "1.25", "score": "2.50"},
        {"id": "c", "name": "C", "cost": "2.50", "score": "5.00"},
        {"id": "d", "name": "D", "cost": "0.75", "score": "1.00"},
    ]
    payload = {
        "mode": "shopping",
        "items": items,
        "budget": "2.50",
        "max_nodes": 50000,
        "time_limit_ms": 1500,
    }
    expected = exhaustive_best(items, payload["budget"])
    run = post_solve(api_client, payload)

    assert run["fifo"]["selected_ids"] == expected["selected_ids"]
    assert run["lc"]["selected_ids"] == expected["selected_ids"]
    assert run["dp"]["selected_ids"] == expected["selected_ids"]
    assert run["dp"]["total_cost"] == expected["total_cost"]
    assert run["dp"]["total_score"] == expected["total_score"]
    assert len(run["dp"]["selected_ids"]) == len(set(run["dp"]["selected_ids"]))


def test_dp_investment_negative_zero_scores_matches_exhaustive(api_client):
    items = [
        {"id": "p1", "name": "P1", "cost": "2.00", "score": "3.20"},
        {"id": "n1", "name": "N1", "cost": "1.00", "score": "-1.50"},
        {"id": "z1", "name": "Z1", "cost": "0.50", "score": "0.00"},
        {"id": "p2", "name": "P2", "cost": "1.25", "score": "1.25"},
    ]
    payload = {
        "mode": "investment",
        "items": items,
        "budget": "3.00",
        "max_nodes": 50000,
        "time_limit_ms": 1500,
    }
    expected = exhaustive_best(items, payload["budget"])
    run = post_solve(api_client, payload)

    assert run["dp"]["selected_ids"] == expected["selected_ids"]
    assert run["dp"]["total_score"] == expected["total_score"]
    assert run["dp"]["total_cost"] == expected["total_cost"]


def test_zero_budget_and_empty_items_preserve_full_remaining_and_zero_selection(api_client):
    payload_zero = {
        "mode": "shopping",
        "items": [
            {"id": "x", "name": "X", "cost": "1.00", "score": "10.00"},
            {"id": "y", "name": "Y", "cost": "2.00", "score": "15.00"},
        ],
        "budget": "0.00",
        "max_nodes": 50000,
        "time_limit_ms": 1500,
    }
    run_zero = post_solve(api_client, payload_zero)
    assert run_zero["fifo"]["selected_ids"] == []
    assert run_zero["lc"]["selected_ids"] == []
    assert run_zero["dp"]["selected_ids"] == []
    assert run_zero["fifo"]["remaining_budget"] == 0

    payload_empty = {
        "mode": "shopping",
        "items": [],
        "budget": "1234.56",
        "max_nodes": 50000,
        "time_limit_ms": 1500,
    }
    run_empty = post_solve(api_client, payload_empty)
    assert run_empty["fifo"]["total_cost"] == 0
    assert run_empty["lc"]["total_cost"] == 0
    assert run_empty["dp"]["total_cost"] == 0
    assert run_empty["fifo"]["remaining_budget"] == 1234.56


def test_all_fit_case_selects_every_item_consistently(api_client):
    items = [
        {"id": "a1", "name": "A1", "cost": "1.00", "score": "10.00"},
        {"id": "a2", "name": "A2", "cost": "1.10", "score": "11.00"},
        {"id": "a3", "name": "A3", "cost": "1.20", "score": "12.00"},
    ]
    payload = {
        "mode": "shopping",
        "items": items,
        "budget": "10.00",
        "max_nodes": 50000,
        "time_limit_ms": 1500,
    }
    run = post_solve(api_client, payload)
    expected_ids = [item["id"] for item in items]
    assert run["fifo"]["selected_ids"] == expected_ids
    assert run["lc"]["selected_ids"] == expected_ids
    assert run["dp"]["selected_ids"] == expected_ids


@pytest.mark.parametrize("seed", [3, 9, 12, 27, 71, 104])
def test_random_small_fractional_cases_dp_matches_exhaustive_and_no_reuse(api_client, seed):
    rng = random.Random(seed)
    mode = "investment" if seed % 2 else "shopping"
    n = rng.randint(4, 9)
    items: list[dict] = []
    for i in range(n):
        cost_cents = rng.randint(35, 900)
        if mode == "shopping":
            score_cents = rng.randint(0, 10_000)
        else:
            score_cents = rng.randint(-5_000, 12_000)
        items.append(
            {
                "id": f"s{seed}_{i}",
                "name": f"Seed {seed} Item {i}",
                "cost": str((Decimal(cost_cents) / Decimal("100")).quantize(Decimal("0.01"))),
                "score": str((Decimal(score_cents) / Decimal("100")).quantize(Decimal("0.01"))),
            }
        )
    budget_cents = rng.randint(100, 2500)
    budget = str((Decimal(budget_cents) / Decimal("100")).quantize(Decimal("0.01")))
    payload = {"mode": mode, "items": items, "budget": budget, "max_nodes": 50000, "time_limit_ms": 1500}
    expected = exhaustive_best(items, budget)
    run = post_solve(api_client, payload)

    assert run["dp"]["selected_ids"] == expected["selected_ids"]
    assert run["dp"]["total_score"] == expected["total_score"]
    assert run["dp"]["total_cost"] == expected["total_cost"]
    assert len(run["dp"]["selected_ids"]) == len(set(run["dp"]["selected_ids"]))


def test_dp_limits_report_not_proven_when_capped(api_client):
    items = [
        {
            "id": f"cap-{i}",
            "name": f"Heavy Item {i}",
            "cost": f"{50 + i * 7}.00",
            "score": f"{100 + i * 9}.00",
        }
        for i in range(24)
    ]
    payload = {
        "mode": "investment",
        "items": items,
        "budget": "50000.00",
        "max_nodes": 50000,
        "time_limit_ms": 1,
    }
    run = post_solve(api_client, payload, timeout=90)
    dp = run["dp"]
    assert dp["proven_optimal"] is False
    assert dp["stop_reason"] in {"time_limit", "state_evaluation_limit", "retained_state_limit"}
    assert dp["items_completed"] < len(items)


def _stream_events(api_client, payload: dict, timeout: int = 120):
    response = api_client.post(f"{BASE_URL}/api/solve/stream", json=payload, stream=True, timeout=timeout)
    assert response.status_code == 200
    parsed = []
    for line in response.iter_lines(decode_unicode=True):
        if not line:
            continue
        parsed.append(requests.models.complexjson.loads(line))
        if parsed[-1].get("type") in {"complete", "error"}:
            break
    response.close()
    return parsed


def test_stream_events_monotonic_and_match_final_counts(api_client, datasets):
    shopping = datasets["shopping"]
    payload = {
        "mode": "shopping",
        "items": shopping["items"],
        "budget": shopping["budget"],
        "max_nodes": 50000,
        "time_limit_ms": 1500,
    }
    events = _stream_events(api_client, payload)
    assert events[0]["type"] == "started"

    progress_fifo, progress_lc, progress_dp = [], [], []
    complete = None
    for event in events[1:]:
        if event["type"] == "progress":
            strategy = event.get("strategy")
            if strategy == "fifo":
                progress_fifo.append(event)
            elif strategy == "lc":
                progress_lc.append(event)
            elif strategy == "dp":
                progress_dp.append(event)
        if event["type"] == "complete":
            complete = event["run"]

    assert complete is not None
    assert progress_fifo
    assert progress_lc
    assert progress_dp

    for strategy_progress in (progress_fifo, progress_lc):
        visited = [e["visited"] for e in strategy_progress]
        assert visited == sorted(visited)
        for frame in strategy_progress:
            assert frame["visited"] >= 0
            assert 0 <= frame["pruned"] <= frame["visited"]
            assert frame["generated"] >= frame["visited"]
            assert len(frame.get("trace", [])) <= 30

    states = [e["states_explored"] for e in progress_dp]
    completed_items = [e["items_completed"] for e in progress_dp]
    assert states == sorted(states)
    assert completed_items == sorted(completed_items)
    assert all(0 <= i <= progress_dp[-1]["total_items"] <= 24 for i in completed_items)

    assert complete["fifo"]["visited"] == progress_fifo[-1]["visited"]
    assert complete["lc"]["visited"] == progress_lc[-1]["visited"]
    assert complete["dp"]["states_explored"] >= progress_dp[-1]["states_explored"]


def test_stream_validation_preserved_for_invalid_payload(api_client, datasets):
    shopping = datasets["shopping"]
    payload = {
        "mode": "shopping",
        "items": [dict(i) for i in shopping["items"]],
        "budget": shopping["budget"],
        "max_nodes": 50000,
        "time_limit_ms": 1500,
    }
    payload["items"][0]["cost"] = "1.999"
    response = api_client.post(f"{BASE_URL}/api/solve/stream", json=payload, timeout=40)
    assert response.status_code == 422
    assert response.json().get("detail")


def test_stream_disconnect_does_not_leave_orphaned_slot(api_client, datasets):
    shopping = datasets["shopping"]
    heavy_items = []
    for idx in range(24):
        source = shopping["items"][idx % len(shopping["items"])]
        heavy_items.append(
            {
                "id": f"stream-cancel-{idx}",
                "name": f"{source['name']} Variant {idx}",
                "cost": f"{100 + idx * 11}.00",
                "score": f"{max(0, 100 - idx)}.00",
            }
        )
    payload = {
        "mode": "shopping",
        "items": heavy_items,
        "budget": "25000.00",
        "max_nodes": 50000,
        "time_limit_ms": 1500,
    }

    stream_response = api_client.post(
        f"{BASE_URL}/api/solve/stream", json=payload, stream=True, timeout=120
    )
    assert stream_response.status_code == 200
    first_line = next(stream_response.iter_lines(decode_unicode=True), None)
    assert first_line is not None
    stream_response.close()

    solved = False
    for _ in range(20):
        response = api_client.post(f"{BASE_URL}/api/solve", json=payload, timeout=90)
        if response.status_code == 200:
            body = response.json()
            assert body["fifo"]["visited"] >= 1
            solved = True
            break
        assert response.status_code in {429, 503}
        time.sleep(0.25)
    assert solved is True
