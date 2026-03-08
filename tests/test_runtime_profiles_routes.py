import pytest
from fastapi import HTTPException

from app.routes import runtime_profiles


@pytest.mark.asyncio
async def test_switch_runtime_profile_blocks_on_failed_preflight(monkeypatch):
    async def _preflight(_target):
        return {"checks": [{"name": "native_inventory_gate", "ok": False}], "blocking": True}

    monkeypatch.setattr(
        runtime_profiles,
        "_collect_preflight",
        _preflight,
    )

    request = runtime_profiles.RuntimeProfileSwitchRequest(profile="Performance", dry_run=False, force=False)
    with pytest.raises(HTTPException) as exc:
        await runtime_profiles.switch_runtime_profile(request)

    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_switch_runtime_profile_dry_run_with_force(monkeypatch):
    async def _preflight(_target):
        return {"checks": [{"name": "rt_hardening", "ok": False}], "blocking": True}

    monkeypatch.setattr(
        runtime_profiles,
        "_collect_preflight",
        _preflight,
    )
    monkeypatch.setattr(
        runtime_profiles,
        "get_runtime_profile_status",
        lambda: {
            "node_type": "AUDIO-NODE",
            "audio_capable": True,
            "supported_profiles": ["Edit", "Performance"],
            "default_profile": "Performance",
            "current_profile": "Edit",
            "profile_policy": {"graph_mutation_policy": "guarded", "effect_residency_default": False},
        },
    )

    request = runtime_profiles.RuntimeProfileSwitchRequest(profile="Performance", dry_run=True, force=True)
    payload = await runtime_profiles.switch_runtime_profile(request)

    assert payload["status"] == "dry_run"
    assert payload["target_profile"] == "Performance"
    assert payload["preflight"]["blocking"] is True


@pytest.mark.asyncio
async def test_native_inventory_route_passthrough(monkeypatch):
    async def _evaluate(probe_load=False):
        return {"gate_pass": True, "probe_load": probe_load}

    monkeypatch.setattr(
        runtime_profiles,
        "evaluate_inventory_gate",
        _evaluate,
    )
    payload = await runtime_profiles.native_inventory_status(probe_load=True)
    assert payload["gate_pass"] is True
    assert payload["probe_load"] is True
