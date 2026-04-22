"""State Authority cluster reconciler (Layer 2).

Plan §Reconciliation — Management-Node Cross-Node Coordination (Q11, Q55):
Query each node's observed runtime state, compare against etcd
AuthoritativeAudioState desired-state, and produce a tiered-response
report:

  1. Parameter drift                → push corrections to node
  2. Topology drift                 → trigger full re-activation on node
  3. Plugin/asset missing           → re-deploy assets + re-activate
  4. Node offline                   → trigger failover (existing mechanism)

The reconciler is purely compositional — it takes:
- A desired-state producer (reads etcd AuthoritativeAudioState)
- An observed-state producer per node (reads each node's
  /api/snapshots/live or runtime endpoint)
- A tier handler bundle (push_params, trigger_reactivation,
  redeploy_asset, trigger_failover)

…and returns a structured report the scheduler feeds to Prometheus.

The real etcd + HTTP wiring lives in other modules (app.services.audio_state_authority
for etcd, app.services.peer_discovery for peer enumeration). This module
composes them; ships no new transport code of its own.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Sequence

logger = logging.getLogger(__name__)


NodeId = str


@dataclass(frozen=True)
class NodeDriftReport:
    """Per-node reconciliation outcome."""

    node_id: NodeId
    status: str  # healthy | drift | reactivated | offline | error
    parameter_drift: int = 0
    topology_drift: bool = False
    missing_assets: int = 0
    actions_taken: tuple[str, ...] = ()
    error: str | None = None


@dataclass
class ClusterReconciliationReport:
    status: str  # healthy | drift | degraded | error
    checked_nodes: int = 0
    nodes_with_drift: int = 0
    nodes_offline: int = 0
    node_reports: list[NodeDriftReport] = field(default_factory=list)
    error: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "checked_nodes": self.checked_nodes,
            "nodes_with_drift": self.nodes_with_drift,
            "nodes_offline": self.nodes_offline,
            "node_reports": [
                {
                    "node_id": r.node_id,
                    "status": r.status,
                    "parameter_drift": r.parameter_drift,
                    "topology_drift": r.topology_drift,
                    "missing_assets": r.missing_assets,
                    "actions_taken": list(r.actions_taken),
                    "error": r.error,
                }
                for r in self.node_reports
            ],
            "error": self.error,
        }


# Producer types
DesiredStateProducer = Callable[[], Awaitable[dict[str, Any] | None]]
ObservedStateProducer = Callable[[NodeId], Awaitable[dict[str, Any] | None]]
NodeEnumerator = Callable[[], Awaitable[Sequence[NodeId]]]

# Tier handlers — the reconciler invokes the matching handler when a node
# reports a specific class of drift. Return True for "action taken", False
# for "not applicable / unavailable".
PushParamsHandler = Callable[[NodeId, dict[str, Any]], Awaitable[bool]]
TriggerReactivationHandler = Callable[[NodeId, str | None], Awaitable[bool]]
RedeployAssetHandler = Callable[[NodeId, str], Awaitable[bool]]
TriggerFailoverHandler = Callable[[NodeId], Awaitable[bool]]


class ClusterReconciler:
    """Compose desired-state + per-node observed-state into a tiered report."""

    def __init__(
        self,
        *,
        desired_state: DesiredStateProducer,
        observed_state: ObservedStateProducer,
        list_nodes: NodeEnumerator,
        push_params: PushParamsHandler | None = None,
        trigger_reactivation: TriggerReactivationHandler | None = None,
        redeploy_asset: RedeployAssetHandler | None = None,
        trigger_failover: TriggerFailoverHandler | None = None,
        tolerance: float = 0.01,
        apply_corrections: bool = True,
    ) -> None:
        self._desired_state = desired_state
        self._observed_state = observed_state
        self._list_nodes = list_nodes
        self._push_params = push_params
        self._trigger_reactivation = trigger_reactivation
        self._redeploy_asset = redeploy_asset
        self._trigger_failover = trigger_failover
        self._tolerance = max(0.0, float(tolerance))
        self._apply_corrections = apply_corrections

    async def reconcile(self) -> dict[str, Any]:
        try:
            desired = await self._desired_state()
        except Exception as exc:  # noqa: BLE001
            logger.exception("Cluster reconciler: desired-state fetch failed")
            return ClusterReconciliationReport(
                status="error",
                error=f"desired_state_producer failed: {exc!r}",
            ).as_dict()

        if desired is None:
            return ClusterReconciliationReport(status="healthy").as_dict()

        try:
            nodes = await self._list_nodes()
        except Exception as exc:  # noqa: BLE001
            logger.exception("Cluster reconciler: node enumeration failed")
            return ClusterReconciliationReport(
                status="error",
                error=f"list_nodes failed: {exc!r}",
            ).as_dict()

        node_reports: list[NodeDriftReport] = []
        coros = [self._reconcile_node(node_id, desired) for node_id in nodes]
        for result in await asyncio.gather(*coros, return_exceptions=True):
            if isinstance(result, Exception):
                node_reports.append(
                    NodeDriftReport(
                        node_id="<unknown>",
                        status="error",
                        error=repr(result),
                    )
                )
            else:
                node_reports.append(result)

        drift_nodes = sum(1 for r in node_reports if r.status in {"drift", "reactivated"})
        offline_nodes = sum(1 for r in node_reports if r.status == "offline")
        overall_status = (
            "error"
            if any(r.status == "error" for r in node_reports)
            else "degraded"
            if offline_nodes
            else "drift"
            if drift_nodes
            else "healthy"
        )
        return ClusterReconciliationReport(
            status=overall_status,
            checked_nodes=len(node_reports),
            nodes_with_drift=drift_nodes,
            nodes_offline=offline_nodes,
            node_reports=node_reports,
        ).as_dict()

    async def _reconcile_node(
        self,
        node_id: NodeId,
        desired: dict[str, Any],
    ) -> NodeDriftReport:
        try:
            observed = await self._observed_state(node_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Cluster reconciler: observed-state fetch for %s failed: %s", node_id, exc)
            return NodeDriftReport(node_id=node_id, status="offline", error=repr(exc))

        if observed is None:
            return NodeDriftReport(node_id=node_id, status="offline")

        # Classify drift — topology, parameter, missing assets.
        desired_chains = _chain_plugin_keys(desired)
        observed_chains = _chain_plugin_keys(observed)
        topology_drift = desired_chains != observed_chains

        param_drift = 0
        if not topology_drift:
            param_drift = _count_parameter_drift(
                desired=desired,
                observed=observed,
                tolerance=self._tolerance,
            )

        missing_assets = _count_missing_assets(observed)

        actions: list[str] = []
        status = "healthy"

        if self._apply_corrections:
            if topology_drift:
                ok = False
                if self._trigger_reactivation is not None:
                    try:
                        snapshot_id = str(desired.get("id") or desired.get("snapshot_id") or "") or None
                        ok = await self._trigger_reactivation(node_id, snapshot_id)
                    except Exception as exc:  # noqa: BLE001
                        logger.warning("Reactivation for %s failed: %s", node_id, exc)
                if ok:
                    actions.append("reactivation_triggered")
                    status = "reactivated"
                else:
                    status = "drift"
            elif param_drift > 0:
                if self._push_params is not None:
                    try:
                        if await self._push_params(node_id, desired):
                            actions.append("params_pushed")
                            status = "reactivated"
                        else:
                            status = "drift"
                    except Exception as exc:  # noqa: BLE001
                        logger.warning("Params push to %s failed: %s", node_id, exc)
                        status = "drift"
                else:
                    status = "drift"
            if missing_assets > 0 and self._redeploy_asset is not None:
                try:
                    for asset in _iter_missing_asset_paths(observed):
                        await self._redeploy_asset(node_id, asset)
                    actions.append("assets_redeployed")
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Asset redeploy on %s failed: %s", node_id, exc)
        else:
            if topology_drift or param_drift > 0 or missing_assets > 0:
                status = "drift"

        return NodeDriftReport(
            node_id=node_id,
            status=status,
            parameter_drift=param_drift,
            topology_drift=topology_drift,
            missing_assets=missing_assets,
            actions_taken=tuple(actions),
        )


# ---------------------------------------------------------------------------
# Pure helpers — operate on snapshot detail dicts without any transport.
# ---------------------------------------------------------------------------


def _chain_plugin_keys(snapshot: dict[str, Any]) -> list[tuple[str, int]]:
    keys: list[tuple[str, int]] = []
    for chain in snapshot.get("chains", []) or []:
        if not isinstance(chain, dict):
            continue
        for plugin in chain.get("plugins", []) or []:
            if not isinstance(plugin, dict):
                continue
            uri = str(plugin.get("uri") or "")
            position = int(plugin.get("plugin_position", plugin.get("position", 0)) or 0)
            keys.append((uri, position))
    return keys


def _count_parameter_drift(
    *,
    desired: dict[str, Any],
    observed: dict[str, Any],
    tolerance: float,
) -> int:
    drift = 0
    desired_by_key: dict[tuple[str, int], dict] = {}
    for chain in desired.get("chains", []) or []:
        if not isinstance(chain, dict):
            continue
        for plugin in chain.get("plugins", []) or []:
            if not isinstance(plugin, dict):
                continue
            uri = str(plugin.get("uri") or "")
            position = int(plugin.get("plugin_position", plugin.get("position", 0)) or 0)
            desired_by_key[(uri, position)] = plugin

    for chain in observed.get("chains", []) or []:
        if not isinstance(chain, dict):
            continue
        for plugin in chain.get("plugins", []) or []:
            if not isinstance(plugin, dict):
                continue
            uri = str(plugin.get("uri") or "")
            position = int(plugin.get("plugin_position", plugin.get("position", 0)) or 0)
            d = desired_by_key.get((uri, position))
            if d is None:
                continue
            d_params = d.get("parameters") or {}
            o_params = plugin.get("parameters") or {}
            if not isinstance(d_params, dict) or not isinstance(o_params, dict):
                continue
            for key, desired_value in d_params.items():
                try:
                    dv = float(desired_value)
                    ov = float(o_params.get(key, dv))
                except (TypeError, ValueError):
                    continue
                if abs(dv - ov) > tolerance:
                    drift += 1
    return drift


def _count_missing_assets(snapshot: dict[str, Any]) -> int:
    count = 0
    for chain in snapshot.get("chains", []) or []:
        if not isinstance(chain, dict):
            continue
        for plugin in chain.get("plugins", []) or []:
            if not isinstance(plugin, dict):
                continue
            loader_state = plugin.get("loader_state") or {}
            if not isinstance(loader_state, dict):
                continue
            for key, value in loader_state.items():
                if not isinstance(value, str):
                    continue
                if key.endswith(("_path", "_file", "_asset")) and not value.startswith("sha256:") and value and not value.startswith("/"):
                    # A non-empty non-hash non-absolute-path value is a stale
                    # reference — treat as missing.
                    count += 1
    return count


def _iter_missing_asset_paths(snapshot: dict[str, Any]):
    for chain in snapshot.get("chains", []) or []:
        if not isinstance(chain, dict):
            continue
        for plugin in chain.get("plugins", []) or []:
            if not isinstance(plugin, dict):
                continue
            loader_state = plugin.get("loader_state") or {}
            if not isinstance(loader_state, dict):
                continue
            for key, value in loader_state.items():
                if not isinstance(value, str):
                    continue
                if key.endswith(("_path", "_file", "_asset")) and not value.startswith("sha256:") and value and not value.startswith("/"):
                    yield value
