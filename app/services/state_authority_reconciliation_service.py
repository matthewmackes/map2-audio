"""
State Authority reconciliation helpers.

This service compares the current live snapshot authority payload against the
running JUCE engine, classifies local drift, and optionally applies targeted
runtime corrections when the drift is safe to heal without a full reactivation.
"""

from __future__ import annotations

import copy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.services.juce_engine_service import get_audio_engine
from app.services.snapshot_runtime_service import snapshot_plugin_position


RECONCILIATION_TOLERANCE = 0.01


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class StateAuthorityReconciliationService:
    """Reconcile desired snapshot authority against the live JUCE runtime."""

    def __init__(self, *, get_engine=get_audio_engine) -> None:
        self._get_engine = get_engine

    async def reconcile_live_snapshot_payload(
        self,
        live_snapshot_payload: dict[str, Any] | None,
        *,
        tolerance: float = RECONCILIATION_TOLERANCE,
        apply_corrections: bool = False,
    ) -> dict[str, Any]:
        tolerance = max(0.0, float(tolerance))
        payload = copy.deepcopy(live_snapshot_payload) if isinstance(live_snapshot_payload, dict) else {}
        desired_plugins = self._flatten_desired_plugins(payload)

        report = {
            "checked_at": _utcnow_iso(),
            "tolerance": tolerance,
            "status": "idle",
            "desired_plugin_count": len(desired_plugins),
            "observed_plugin_count": 0,
            "topology_drift": False,
            "parameter_drift_count": 0,
            "bypass_drift_count": 0,
            "missing_asset_count": 0,
            "correction_count": 0,
            "reactivation_required": False,
            "asset_redeploy_required": False,
            "applied_corrections": bool(apply_corrections),
            "drift_items": [],
        }
        if not desired_plugins:
            report["status"] = "no_live_snapshot"
            return report

        engine = self._get_engine()
        if engine is None or not getattr(engine, "is_available", True) or not getattr(engine, "is_running", True):
            report["status"] = "engine_unavailable"
            return report

        observed_plugins = await self._capture_observed_plugins(engine)
        report["observed_plugin_count"] = len(observed_plugins)

        desired_topology = [(item["uri"], item["position"]) for item in desired_plugins]
        observed_topology = [(item["uri"], item["position"]) for item in observed_plugins]
        if desired_topology != observed_topology:
            report["topology_drift"] = True
            report["reactivation_required"] = True
            report["drift_items"].append(
                {
                    "kind": "topology",
                    "reason": "plugin_order_mismatch",
                    "desired": desired_topology,
                    "observed": observed_topology,
                    "recommended_action": "reactivate_snapshot",
                }
            )

        observed_by_key = {
            (item["uri"], item["position"]): item
            for item in observed_plugins
        }

        from app.routes.plugins import _discovered_plugins

        corrections = 0
        for desired in desired_plugins:
            plugin_key = (desired["uri"], desired["position"])
            observed = observed_by_key.get(plugin_key)
            if observed is None:
                continue

            missing_assets = self._missing_assets_for_plugin(desired)
            for asset_path in missing_assets:
                report["missing_asset_count"] += 1
                report["asset_redeploy_required"] = True
                report["drift_items"].append(
                    {
                        "kind": "asset",
                        "plugin_uri": desired["uri"],
                        "plugin_position": desired["position"],
                        "asset_path": asset_path,
                        "recommended_action": "redeploy_asset",
                    }
                )

            if bool(desired["bypass"]) != bool(observed["bypass"]):
                report["bypass_drift_count"] += 1
                drift_item = {
                    "kind": "bypass",
                    "plugin_uri": desired["uri"],
                    "plugin_position": desired["position"],
                    "desired": bool(desired["bypass"]),
                    "observed": bool(observed["bypass"]),
                    "recommended_action": "set_bypass",
                }
                if apply_corrections:
                    instance_id = engine._get_instance_id_for_uri(desired["uri"], desired["position"])
                    if isinstance(instance_id, int) and instance_id > 0 and await engine.set_bypass(instance_id, bool(desired["bypass"])):
                        drift_item["corrected"] = True
                        corrections += 1
                report["drift_items"].append(drift_item)

            plugin_info = next(
                (item for item in _discovered_plugins if item.get("uri") == desired["uri"]),
                None,
            )
            if not isinstance(plugin_info, dict):
                continue
            parameters = plugin_info.get("parameters") if isinstance(plugin_info.get("parameters"), list) else []
            for index_key, desired_value in desired["parameters"].items():
                try:
                    param_index = int(index_key)
                    desired_float = float(desired_value)
                except (TypeError, ValueError):
                    continue
                if param_index < 0 or param_index >= len(parameters):
                    continue
                symbol = str(parameters[param_index].get("symbol") or "").strip()
                if not symbol:
                    continue
                observed_value = await engine.get_parameter(
                    desired["uri"],
                    symbol,
                    plugin_position=desired["position"],
                )
                drift_value = abs(float(observed_value) - desired_float)
                if drift_value <= tolerance:
                    continue
                report["parameter_drift_count"] += 1
                drift_item = {
                    "kind": "parameter",
                    "plugin_uri": desired["uri"],
                    "plugin_position": desired["position"],
                    "param_index": param_index,
                    "param_name": symbol,
                    "desired": desired_float,
                    "observed": float(observed_value),
                    "drift": drift_value,
                    "recommended_action": "set_parameter",
                }
                if apply_corrections and await engine.set_parameter(
                    desired["uri"],
                    symbol,
                    desired_float,
                    plugin_position=desired["position"],
                ):
                    drift_item["corrected"] = True
                    corrections += 1
                report["drift_items"].append(drift_item)

        report["correction_count"] = corrections
        if report["reactivation_required"]:
            report["status"] = "reactivation_required"
        elif report["parameter_drift_count"] or report["bypass_drift_count"] or report["missing_asset_count"]:
            report["status"] = "self_healed" if corrections else "drift_detected"
        else:
            report["status"] = "healthy"
        return report

    @staticmethod
    def _flatten_desired_plugins(live_snapshot_payload: dict[str, Any]) -> list[dict[str, Any]]:
        chains = live_snapshot_payload.get("chains") if isinstance(live_snapshot_payload.get("chains"), list) else []
        flattened: list[dict[str, Any]] = []
        for chain in chains:
            if not isinstance(chain, dict):
                continue
            chain_plugins = chain.get("plugins") if isinstance(chain.get("plugins"), list) else []
            for plugin in chain_plugins:
                if not isinstance(plugin, dict):
                    continue
                position = snapshot_plugin_position(plugin)
                flattened.append(
                    {
                        "uri": str(plugin.get("uri") or ""),
                        "position": position if position is not None else len(flattened),
                        "bypass": bool(plugin.get("bypass", False)),
                        "parameters": dict(plugin.get("parameters") or {}),
                        "loader_state": dict(plugin.get("loader_state") or {}),
                    }
                )
        return flattened

    @staticmethod
    async def _capture_observed_plugins(engine: Any) -> list[dict[str, Any]]:
        if not hasattr(engine, "save_graph_document"):
            return []
        document = await engine.save_graph_document(
            {
                "version": "2026.04",
                "meta": {"name": "Reconciliation Probe", "type": "snapshot"},
                "graph": {"nodes": [], "edges": []},
            }
        )
        graph = document.get("graph") if isinstance(document, dict) else {}
        chains = graph.get("chains") if isinstance(graph, dict) and isinstance(graph.get("chains"), list) else []
        flattened: list[dict[str, Any]] = []
        for chain in chains:
            if not isinstance(chain, dict):
                continue
            for plugin in chain.get("plugins", []):
                if not isinstance(plugin, dict):
                    continue
                position = snapshot_plugin_position(plugin)
                flattened.append(
                    {
                        "uri": str(plugin.get("uri") or ""),
                        "position": position if position is not None else len(flattened),
                        "bypass": bool(plugin.get("bypass", False)),
                    }
                )
        return flattened

    @staticmethod
    def _missing_assets_for_plugin(plugin: dict[str, Any]) -> list[str]:
        loader_state = plugin.get("loader_state") if isinstance(plugin.get("loader_state"), dict) else {}
        missing: list[str] = []
        for key, value in loader_state.items():
            if not isinstance(value, str):
                continue
            if not key.endswith(("_path", "_file", "_asset")):
                continue
            if value.startswith("sha256:"):
                continue
            path = Path(value).expanduser()
            if not path.exists():
                missing.append(str(path))
        return missing
