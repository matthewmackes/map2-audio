"""Opt-in live API tests for CPU core interface."""

import os

import pytest
import requests


pytestmark = pytest.mark.skipif(
    os.getenv("MAP2_RUN_INTEGRATION_TESTS", "").lower() != "true",
    reason="Integration test disabled (set MAP2_RUN_INTEGRATION_TESTS=true to run)",
)

BASE_URL = os.getenv("MAP2_E2E_BASE_URL", "http://localhost:8080")


def _get(path: str):
    return requests.get(f"{BASE_URL}{path}", timeout=5)


def _post(path: str, payload: dict):
    return requests.post(f"{BASE_URL}{path}", json=payload, timeout=5)


def test_get_core_config():
    response = _get("/api/system/core-config")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data.get("cores"), list)
    assert isinstance(data.get("available_activities"), list)
    assert isinstance(data.get("cpu_count"), int)


def test_get_cpu_info():
    response = _get("/api/system/cpu-info")
    assert response.status_code == 200
    data = response.json()
    assert "logical_cores" in data
    assert "realtime_capable" in data


def test_get_realtime_capabilities():
    response = _get("/api/system/realtime-capabilities")
    assert response.status_code == 200
    data = response.json()
    assert "overall_score" in data
    assert "checks" in data


def test_post_core_config_valid_payload():
    payload = {
        "core_id": 0,
        "services": ["UI / API Server", "Background Tasks"],
        "priority": "normal",
        "isolated": False,
    }
    response = _post("/api/system/core-config", payload)
    assert response.status_code == 200
    data = response.json()
    assert data.get("success") is True


def test_post_core_config_invalid_priority():
    payload = {
        "core_id": 0,
        "services": ["UI / API Server"],
        "priority": "INVALID",
        "isolated": False,
    }
    response = _post("/api/system/core-config", payload)
    assert response.status_code == 400


def test_post_core_assignments_bulk_update():
    payload = {
        "cores": [
            {
                "core_id": 1,
                "services": ["JUCE DSP Graph"],
                "priority": "SCHED_FIFO",
                "isolated": True,
            }
        ]
    }
    response = _post("/api/system/core-assignments", payload)
    assert response.status_code == 200
    data = response.json()
    assert data.get("success") is True
