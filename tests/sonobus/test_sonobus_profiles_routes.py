"""T2521-5d: SonoBus profile preset route tests.

Verifies the built-in profile presets cover the locked Q7/Q8/Q9
posture and that the GET-by-id endpoint returns 404 for unknown IDs.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.services.sonobus.binding_routes import router as sonobus_router


def _build_app() -> FastAPI:
    app = FastAPI()
    app.include_router(sonobus_router)
    return app


def test_list_profiles_returns_built_in_presets():
    client = TestClient(_build_app())
    r = client.get("/api/sonobus/profiles")
    assert r.status_code == 200
    profiles = r.json()
    ids = [p["profile_id"] for p in profiles]
    assert "pcm_lowest_latency" in ids
    assert "pcm_resilient" in ids
    assert "pcm_studio" in ids
    assert len(profiles) >= 3


def test_default_preset_matches_locked_q7_q8_q9_decisions():
    client = TestClient(_build_app())
    r = client.get("/api/sonobus/profiles/pcm_lowest_latency")
    assert r.status_code == 200
    preset = r.json()
    # Q7/Q8 PCM 24-bit/48 kHz
    assert preset["codec_profile"] == "pcm"
    assert preset["stream_format"] == "pcm_s24_48000"
    # Q9 lowest practical
    assert preset["jitter_buffer_ms"] == 4
    assert preset["resend_policy"] == "burst_loss_only"
    assert preset["latency_target_ms"] == 8


def test_resilient_preset_uses_full_resends():
    client = TestClient(_build_app())
    r = client.get("/api/sonobus/profiles/pcm_resilient")
    assert r.status_code == 200
    preset = r.json()
    assert preset["resend_policy"] == "full"
    assert preset["jitter_buffer_ms"] > 4


def test_get_profile_unknown_returns_404():
    client = TestClient(_build_app())
    r = client.get("/api/sonobus/profiles/not_a_real_profile")
    assert r.status_code == 404
