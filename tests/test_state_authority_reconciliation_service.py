from __future__ import annotations

import asyncio

from app.services.state_authority_reconciliation_service import StateAuthorityReconciliationService


class _FakeEngine:
    def __init__(self) -> None:
        self.is_available = True
        self.is_running = True
        self.saved_document = {
            "version": "2026.04",
            "meta": {"name": "Observed", "type": "snapshot"},
            "graph": {
                "chains": [
                    {
                        "id": 1,
                        "source_key": "main-chain",
                        "name": "Main Chain",
                        "plugins": [
                            {
                                "uri": "urn:test:drive",
                                "position": 0,
                                "bypass": False,
                            }
                        ],
                    }
                ]
            },
        }
        self.parameter_values = {("urn:test:drive", 0, "gain"): 0.5}
        self.parameter_sets: list[tuple[str, str, float, int | None]] = []
        self.bypass_sets: list[tuple[int, bool]] = []

    async def save_graph_document(self, seed_document):
        return self.saved_document

    async def get_parameter(self, plugin_uri: str, param_name: str, *, plugin_position: int | None = None):
        return self.parameter_values[(plugin_uri, plugin_position, param_name)]

    async def set_parameter(self, plugin_uri: str, param_name: str, value: float, *, plugin_position: int | None = None):
        self.parameter_sets.append((plugin_uri, param_name, float(value), plugin_position))
        return True

    def _get_instance_id_for_uri(self, plugin_uri: str, plugin_position: int | None = None):
        if plugin_uri == "urn:test:drive" and plugin_position == 0:
            return 41
        return None

    async def set_bypass(self, instance_id: int, bypass: bool):
        self.bypass_sets.append((instance_id, bool(bypass)))
        return True


def test_reconciliation_service_marks_healthy_when_runtime_matches(monkeypatch):
    fake_engine = _FakeEngine()
    monkeypatch.setattr(
        "app.routes.plugins._discovered_plugins",
        [{"uri": "urn:test:drive", "parameters": [{"symbol": "gain"}]}],
    )
    service = StateAuthorityReconciliationService(get_engine=lambda: fake_engine)

    report = asyncio.run(
        service.reconcile_live_snapshot_payload(
            {
                "chains": [
                    {
                        "plugins": [
                            {
                                "uri": "urn:test:drive",
                                "position": 0,
                                "bypass": False,
                                "parameters": {"0": 0.5},
                                "loader_state": {},
                            }
                        ]
                    }
                ]
            }
        )
    )

    assert report["status"] == "healthy"
    assert report["parameter_drift_count"] == 0
    assert report["topology_drift"] is False


def test_reconciliation_service_applies_targeted_parameter_and_bypass_corrections(monkeypatch):
    fake_engine = _FakeEngine()
    fake_engine.parameter_values[("urn:test:drive", 0, "gain")] = 0.72
    fake_engine.saved_document["graph"]["chains"][0]["plugins"][0]["bypass"] = True
    monkeypatch.setattr(
        "app.routes.plugins._discovered_plugins",
        [{"uri": "urn:test:drive", "parameters": [{"symbol": "gain"}]}],
    )
    service = StateAuthorityReconciliationService(get_engine=lambda: fake_engine)

    report = asyncio.run(
        service.reconcile_live_snapshot_payload(
            {
                "chains": [
                    {
                        "plugins": [
                            {
                                "uri": "urn:test:drive",
                                "position": 0,
                                "bypass": False,
                                "parameters": {"0": 0.5},
                                "loader_state": {},
                            }
                        ]
                    }
                ]
            },
            apply_corrections=True,
        )
    )

    assert report["status"] == "self_healed"
    assert report["parameter_drift_count"] == 1
    assert report["bypass_drift_count"] == 1
    assert report["correction_count"] == 2
    assert fake_engine.parameter_sets == [("urn:test:drive", "gain", 0.5, 0)]
    assert fake_engine.bypass_sets == [(41, False)]


def test_reconciliation_service_requires_reactivation_for_topology_drift(monkeypatch):
    fake_engine = _FakeEngine()
    fake_engine.saved_document["graph"]["chains"][0]["plugins"][0]["uri"] = "urn:test:other"
    monkeypatch.setattr(
        "app.routes.plugins._discovered_plugins",
        [{"uri": "urn:test:drive", "parameters": [{"symbol": "gain"}]}],
    )
    service = StateAuthorityReconciliationService(get_engine=lambda: fake_engine)

    report = asyncio.run(
        service.reconcile_live_snapshot_payload(
            {
                "chains": [
                    {
                        "plugins": [
                            {
                                "uri": "urn:test:drive",
                                "position": 0,
                                "bypass": False,
                                "parameters": {"0": 0.5},
                                "loader_state": {},
                            }
                        ]
                    }
                ]
            }
        )
    )

    assert report["status"] == "reactivation_required"
    assert report["topology_drift"] is True
    assert report["reactivation_required"] is True


def test_reconciliation_service_flags_missing_assets(monkeypatch, tmp_path):
    fake_engine = _FakeEngine()
    monkeypatch.setattr(
        "app.routes.plugins._discovered_plugins",
        [{"uri": "urn:test:drive", "parameters": [{"symbol": "gain"}]}],
    )
    service = StateAuthorityReconciliationService(get_engine=lambda: fake_engine)

    report = asyncio.run(
        service.reconcile_live_snapshot_payload(
            {
                "chains": [
                    {
                        "plugins": [
                            {
                                "uri": "urn:test:drive",
                                "position": 0,
                                "bypass": False,
                                "parameters": {"0": 0.5},
                                "loader_state": {"selected_asset_path": str(tmp_path / "missing.wav")},
                            }
                        ]
                    }
                ]
            }
        )
    )

    assert report["asset_redeploy_required"] is True
    assert report["missing_asset_count"] == 1
