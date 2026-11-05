"""Iteration 2 API regression tests for datasets, solve validation, and saved runs persistence."""

import os
import uuid

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
def seeded_shopping(api_client):
    response = api_client.get(f"{BASE_URL}/api/datasets", timeout=30)
    assert response.status_code == 200
    datasets = response.json()
    shopping = next(d for d in datasets if d["mode"] == "shopping")
    return shopping


# Datasets and solve happy-path checks
def test_get_datasets_returns_8_items_per_mode(api_client):
    response = api_client.get(f"{BASE_URL}/api/datasets", timeout=30)
    assert response.status_code == 200
    data = response.json()

    assert len(data) == 2
    by_mode = {d["mode"]: d for d in data}
    assert set(by_mode.keys()) == {"shopping", "investment"}
    assert len(by_mode["shopping"]["items"]) == 8
    assert len(by_mode["investment"]["items"]) == 8
    assert by_mode["shopping"]["budget"] == "10000"
    assert by_mode["investment"]["budget"] == "10000"


def test_post_solve_seeded_shopping_totals_and_recommendation(api_client, seeded_shopping):
    payload = {
        "mode": "shopping",
        "items": seeded_shopping["items"],
        "budget": seeded_shopping["budget"],
        "max_nodes": 50000,
        "time_limit_ms": 1500,
    }
    response = api_client.post(f"{BASE_URL}/api/solve", json=payload, timeout=60)
    assert response.status_code == 200
    run = response.json()

    assert run["recommended_strategy"] in ["fifo", "lc"]
    assert run["comparison_complete"] is True
    assert run["fifo"]["total_cost"] == 9700
    assert run["fifo"]["total_score"] == 364
    assert run["fifo"]["remaining_budget"] == 300
    assert run["lc"]["total_cost"] == 9700
    assert run["lc"]["total_score"] == 364
    assert run["lc"]["remaining_budget"] == 300


# Validation behavior checks
@pytest.mark.parametrize(
    "mutator",
    [
        lambda p: p["items"][0].update({"score": "inf"}),
        lambda p: p["items"][0].update({"cost": "nan"}),
        lambda p: p["items"][0].update({"cost": "0"}),
        lambda p: p["items"][0].update({"name": "   "}),
        lambda p: p["items"].append({**p["items"][0], "id": p["items"][1]["id"]}),
        lambda p: p.update({"budget": "-1"}),
        lambda p: p["items"][0].update({"score": "101"}),
        lambda p: p["items"].extend(
            {
                "id": f"extra-{i}",
                "name": f"Extra {i}",
                "cost": "1.00",
                "score": "1.00",
            }
            for i in range(20)
        ),
        lambda p: p.update({"max_nodes": 50001}),
        lambda p: p["items"][0].update({"cost": "1.999"}),
        lambda p: p["items"][0].update({"score": "1.999"}),
    ],
)
def test_solve_validation_rejects_invalid_payloads(api_client, seeded_shopping, mutator):
    payload = {
        "mode": "shopping",
        "items": [dict(item) for item in seeded_shopping["items"]],
        "budget": seeded_shopping["budget"],
        "max_nodes": 50000,
        "time_limit_ms": 1500,
    }
    mutator(payload)
    response = api_client.post(f"{BASE_URL}/api/solve", json=payload, timeout=30)
    assert response.status_code == 422
    detail = response.json().get("detail")
    assert detail


def test_solve_rejects_request_body_over_32kb(api_client, seeded_shopping):
    payload = {
        "mode": "shopping",
        "items": [dict(item) for item in seeded_shopping["items"]],
        "budget": seeded_shopping["budget"],
        "max_nodes": 50000,
        "time_limit_ms": 1500,
        "padding": "x" * 34000,
    }
    response = api_client.post(f"{BASE_URL}/api/solve", json=payload, timeout=30)
    assert response.status_code == 413
    assert "32 KB" in response.json().get("detail", "")


def test_solve_tie_case_is_deterministic_across_strategies(api_client):
    payload = {
        "mode": "shopping",
        "items": [
            {"id": "tie-a", "name": "Tie A", "cost": "5.00", "score": "50.00"},
            {"id": "tie-b", "name": "Tie B", "cost": "5.00", "score": "50.00"},
            {"id": "low", "name": "Low", "cost": "10.00", "score": "1.00"},
        ],
        "budget": "5.00",
        "max_nodes": 50000,
        "time_limit_ms": 1500,
    }
    response = api_client.post(f"{BASE_URL}/api/solve", json=payload, timeout=60)
    assert response.status_code == 200
    run = response.json()
    assert run["fifo"]["selected_ids"] == ["tie-a"]
    assert run["lc"]["selected_ids"] == ["tie-a"]
    assert run["fifo"]["total_score"] == 50
    assert run["lc"]["total_score"] == 50


# Saved runs persistence and semantics
def test_saved_runs_crud_and_404_semantics(api_client, seeded_shopping):
    payload = {
        "mode": "shopping",
        "items": seeded_shopping["items"],
        "budget": seeded_shopping["budget"],
        "max_nodes": 50000,
        "time_limit_ms": 1500,
    }
    solve_response = api_client.post(f"{BASE_URL}/api/solve", json=payload, timeout=60)
    assert solve_response.status_code == 200
    run = solve_response.json()
    run_id = run["id"]

    save_title = f"TEST_ITER2_{uuid.uuid4().hex[:10]}"
    save_response = api_client.put(
        f"{BASE_URL}/api/runs/{run_id}/save", json={"title": save_title}, timeout=30
    )
    assert save_response.status_code == 200
    saved = save_response.json()
    assert saved["saved"] is True
    assert saved["title"] == save_title

    list_response = api_client.get(f"{BASE_URL}/api/runs", timeout=30)
    assert list_response.status_code == 200
    runs = list_response.json()
    listed = next((r for r in runs if r["id"] == run_id), None)
    assert listed is not None
    assert listed["snapshot"]["mode"] == "shopping"
    assert listed["fifo"]["total_cost"] == 9700

    get_response = api_client.get(f"{BASE_URL}/api/runs/{run_id}", timeout=30)
    assert get_response.status_code == 200
    fetched = get_response.json()
    assert fetched["id"] == run_id
    assert fetched["snapshot"]["items"] == payload["items"]

    delete_response = api_client.delete(f"{BASE_URL}/api/runs/{run_id}", timeout=30)
    assert delete_response.status_code == 200
    assert delete_response.json()["deleted"] is True

    get_after_delete = api_client.get(f"{BASE_URL}/api/runs/{run_id}", timeout=30)
    assert get_after_delete.status_code == 404

    delete_again = api_client.delete(f"{BASE_URL}/api/runs/{run_id}", timeout=30)
    assert delete_again.status_code == 404


def test_save_nonexistent_run_returns_404(api_client):
    run_id = f"missing-{uuid.uuid4().hex}"
    response = api_client.put(
        f"{BASE_URL}/api/runs/{run_id}/save",
        json={"title": "TEST_Missing"},
        timeout=30,
    )
    assert response.status_code == 404
