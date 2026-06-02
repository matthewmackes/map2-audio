"""
State Authority snapshot activation service.

Owns activation intent orchestration, runtime-chain reuse/materialization, and
post-activation publication so SnapshotService can delegate the live-state path
instead of embedding it inline.
"""

from __future__ import annotations

import asyncio
import copy
import json
import logging
import weakref
from typing import Any, Callable, Literal, Optional
from uuid import uuid4

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Chain, ChainPlugin, EffectsLoopInsertion, Snapshot
from app.services.audio.pipewire_quantum_enforcer import (
    QuantumDriftError,
    QuantumEnforcementResult,
    QuantumPolicy,
    enforce_expected_quantum,
)
from app.services.snapshot_system_blocks import extract_chain_system_blocks

logger = logging.getLogger(__name__)


def _extract_quantum_policy(detail: Any) -> QuantumPolicy:
    """Read ``document.meta.quantum_policy`` from the snapshot detail, default reforce."""
    if not isinstance(detail, dict):
        return "reforce"
    document = detail.get("document") or {}
    meta = document.get("meta") if isinstance(document, dict) else None
    policy = (meta or {}).get("quantum_policy") if isinstance(meta, dict) else None
    if policy in ("reforce", "fail"):
        return policy
    return "reforce"


async def _enforce_quantum_for_activation(
    *, policy: QuantumPolicy
) -> QuantumEnforcementResult:
    """Wrapper so call sites stay readable; re-raises QuantumDriftError unchanged."""
    return await enforce_expected_quantum(policy=policy)


# T2452: VERIFY phase strictness.
#
# Pre-T2452, every sub-sync in VERIFYING (routing, loop insertions, channel
# state, morph, MIDI map, expression mappings, automation lanes) was wrapped in
# a try/except that logged at DEBUG and continued. That meant a failed
# sub-sync produced a "LIVE" badge in the UI but a partial apply on the
# engine — the worst possible operator outcome.
#
# Default mode is now "strict": any sub-sync error fails the activation with a
# ``SnapshotVerificationError`` carrying every error observed during the phase
# (so a single failure pass surfaces all of them, not just the first). The
# route layer translates this into a 422 with code ``activation_verify_failed``.
#
# Operators who need the old behaviour can opt into ``"lenient"`` per snapshot
# by setting ``document.meta.verify_mode = "lenient"`` — failures still get
# logged, but at WARNING (so they're visible in logs) and activation completes.
VerifyMode = Literal["strict", "lenient"]


class SnapshotVerificationError(ValueError):
    """Raised when one or more VERIFYING sub-syncs fail in strict mode.

    Carries the full list of (step, reason) pairs so the route can build a
    structured error envelope.
    """

    def __init__(self, errors: list[dict[str, str]]):
        self.errors = errors
        joined = "; ".join(f"{e['step']}: {e['reason']}" for e in errors) or "no detail"
        super().__init__(f"Snapshot verification failed: {joined}")


def _extract_verify_mode(detail: Any) -> VerifyMode:
    """Read ``document.meta.verify_mode`` from the snapshot detail, default strict."""
    if not isinstance(detail, dict):
        return "strict"
    document = detail.get("document") or {}
    meta = document.get("meta") if isinstance(document, dict) else None
    mode = (meta or {}).get("verify_mode") if isinstance(meta, dict) else None
    if mode in ("strict", "lenient"):
        return mode
    return "strict"


async def _run_verify_step(
    *,
    step: str,
    coro: Any,
    fallback: dict[str, Any],
    errors: list[dict[str, str]],
    snapshot_id: Any,
) -> dict[str, Any]:
    """Await a verify sub-sync coroutine; capture any exception into ``errors``.

    Returns ``fallback`` (the same shape callers used pre-T2452) on failure so
    downstream metric assembly stays unchanged. The lenient/strict decision is
    made *after* every step has had a chance to run, so a single activation
    surfaces every failing sub-sync at once.
    """
    try:
        return await coro
    except Exception as exc:  # noqa: BLE001 — every failure mode surfaces
        reason = str(exc) or exc.__class__.__name__
        errors.append({"step": step, "reason": reason})
        logger.warning(
            "Snapshot verify step %s failed for snapshot %s: %s",
            step,
            snapshot_id,
            reason,
        )
        result = dict(fallback)
        result["reason"] = f"verify_failed:{reason}"
        return result


class StateAuthorityActivationService:
    """Owns snapshot activation orchestration for the State Authority cutover."""

    _activation_locks_by_loop: weakref.WeakKeyDictionary = weakref.WeakKeyDictionary()

    def __init__(
        self,
        session: AsyncSession,
        *,
        owner: Any,
        chain_service: Any,
        runtime_service_module: Any,
        midi_service: Any,
        get_audio_engine: Callable[[], Any],
        push_snapshot_footswitch_labels: Callable[..., Any],
        push_snapshot_maschine_assignments: Callable[..., Any],
        push_snapshot_push_surface_state: Callable[..., Any],
        push_snapshot_ground_control_pro_assignments: Callable[..., Any],
        push_snapshot_mcu_surface_state: Callable[..., Any],
        push_snapshot_launch_control_assignments: Callable[..., Any],
        push_snapshot_midi_commander_assignments: Callable[..., Any],
        push_snapshot_controller_display_preview: Callable[..., Any],
        schedule_snapshot_preload_for_live_snapshot: Callable[[int], None],
        get_activation_hook_plan: Callable[[], Any],
        build_snapshot_controller_display_preview: Callable[..., Any],
        utcnow: Callable[[], Any],
        safe_int: Callable[[Any], int | None],
        safe_float: Callable[[Any, float], float],
        normalize_topology_mutation_stats: Callable[[Any], dict[str, Any]],
        build_activation_topology_metrics: Callable[[Any, Any], dict[str, Any]],
        snapshot_spillover_native_uris: tuple[str, ...],
        canonical_transient_keys: set[str],
        canonical_effects_loop_keys: set[str],
    ) -> None:
        self.session = session
        self.owner = owner
        self.chain_service = chain_service
        self.runtime_service_module = runtime_service_module
        self.midi_service = midi_service
        self.get_audio_engine = get_audio_engine
        self.push_snapshot_footswitch_labels = push_snapshot_footswitch_labels
        self.push_snapshot_maschine_assignments = push_snapshot_maschine_assignments
        self.push_snapshot_push_surface_state = push_snapshot_push_surface_state
        self.push_snapshot_ground_control_pro_assignments = push_snapshot_ground_control_pro_assignments
        self.push_snapshot_mcu_surface_state = push_snapshot_mcu_surface_state
        self.push_snapshot_launch_control_assignments = push_snapshot_launch_control_assignments
        self.push_snapshot_midi_commander_assignments = push_snapshot_midi_commander_assignments
        self.push_snapshot_controller_display_preview = push_snapshot_controller_display_preview
        self.schedule_snapshot_preload_for_live_snapshot = schedule_snapshot_preload_for_live_snapshot
        self.get_activation_hook_plan = get_activation_hook_plan
        self.build_snapshot_controller_display_preview = build_snapshot_controller_display_preview
        self._utcnow = utcnow
        self._safe_int = safe_int
        self._safe_float = safe_float
        self._normalize_topology_mutation_stats = normalize_topology_mutation_stats
        self._build_activation_topology_metrics = build_activation_topology_metrics
        self._snapshot_spillover_native_uris = snapshot_spillover_native_uris
        self._canonical_transient_keys = canonical_transient_keys
        self._canonical_effects_loop_keys = canonical_effects_loop_keys

    @classmethod
    def _activation_lock_for_node(cls, node_id: str) -> asyncio.Lock:
        loop = asyncio.get_running_loop()
        loop_locks = cls._activation_locks_by_loop.get(loop)
        if loop_locks is None:
            loop_locks = {}
            cls._activation_locks_by_loop[loop] = loop_locks
        normalized = str(node_id or "").strip() or "LOCAL-NODE"
        lock = loop_locks.get(normalized)
        if lock is None:
            lock = asyncio.Lock()
            loop_locks[normalized] = lock
        return lock

    @staticmethod
    def _plugin_signature(plugin: dict[str, Any]) -> str:
        signature = {
            "parameters": plugin.get("parameters", {}),
            "loader_state": plugin.get("loader_state", {}),
            "mix": plugin.get("mix"),
            "plugin_position": plugin.get("plugin_position", plugin.get("position")),
        }
        return json.dumps(signature, sort_keys=True, default=str)

    def snapshot_spillover_candidate_counts(self, detail: dict[str, Any] | None) -> dict[str, int]:
        counts = {uri: 0 for uri in self._snapshot_spillover_native_uris}
        if not isinstance(detail, dict):
            return counts
        for chain in detail.get("chains", []):
            if not isinstance(chain, dict):
                continue
            for plugin in chain.get("plugins", []):
                if not isinstance(plugin, dict) or bool(plugin.get("bypass", False)):
                    continue
                uri = str(plugin.get("uri") or "")
                if uri in counts:
                    counts[uri] += 1
        return counts

    def snapshot_spillover_candidate_signatures(self, detail: dict[str, Any] | None) -> dict[str, list[str]]:
        signatures = {uri: [] for uri in self._snapshot_spillover_native_uris}
        if not isinstance(detail, dict):
            return signatures
        for chain in detail.get("chains", []):
            if not isinstance(chain, dict):
                continue
            for plugin in chain.get("plugins", []):
                if not isinstance(plugin, dict) or bool(plugin.get("bypass", False)):
                    continue
                uri = str(plugin.get("uri") or "")
                if uri in signatures:
                    signatures[uri].append(self._plugin_signature(plugin))
        for uri in signatures:
            signatures[uri].sort()
        return signatures

    async def arm_live_spillover_processors(
        self,
        *,
        current_live_detail: dict[str, Any] | None,
        target_detail: dict[str, Any],
    ) -> None:
        current_counts = self.snapshot_spillover_candidate_counts(current_live_detail)
        target_counts = self.snapshot_spillover_candidate_counts(target_detail)
        current_signatures = self.snapshot_spillover_candidate_signatures(current_live_detail)
        target_signatures = self.snapshot_spillover_candidate_signatures(target_detail)
        outgoing_uris = [
            uri
            for uri, current_count in current_counts.items()
            if current_count > 0
            and (
                target_counts.get(uri, 0) == 0
                or current_signatures.get(uri, []) != target_signatures.get(uri, [])
            )
        ]
        if not outgoing_uris:
            return

        engine = self.get_audio_engine()
        if not engine.is_available or not engine.is_running:
            return

        actions = {
            "map2://juce/delay": getattr(engine, "stage_delay_spillover", None),
            "map2://juce/multieffect/shoegaze": getattr(engine, "stage_shoegaze_spillover", None),
            "map2://juce/reverb/pcm70": getattr(engine, "stage_lexilove_spillover", None),
        }
        for uri in outgoing_uris:
            stage_spillover = actions.get(uri)
            if not callable(stage_spillover):
                continue
            try:
                await stage_spillover()
            except Exception as exc:
                logger.debug("Snapshot spillover arm skipped for %s: %s", uri, exc)

    async def apply_graph_document_to_engine(
        self,
        *,
        snapshot: Snapshot,
        normalized: dict[str, Any],
    ) -> dict[str, Any] | None:
        engine = self.get_audio_engine()
        if not engine.is_available or not engine.is_running:
            return None
        if not hasattr(engine, "load_graph_document"):
            return None

        document = snapshot.document if isinstance(snapshot.document, dict) else None
        if not isinstance(document, dict):
            document = self.owner.state_authority_documents.build_validated_document(snapshot, normalized)

        # T2454-B: dynamic crossfade length scales to the longest active
        # tail-bearing processor in the target snapshot. Always-spill behavior
        # is preserved (`use_independent_crossfade=True`); only the duration
        # adapts. See `state_authority_dynamic_crossfade.py` for the locked
        # URI vocabulary (delay 1500 / shoegaze 1200 / lexilove 2000 / default
        # 500, clamped to [500, 2000]ms).
        from app.services.state_authority_dynamic_crossfade import compute_dynamic_crossfade_ms

        max_crossfade_ms = compute_dynamic_crossfade_ms(normalized)

        try:
            applied = await engine.load_graph_document(
                copy.deepcopy(document),
                use_independent_crossfade=True,
                max_crossfade_ms=max_crossfade_ms,
            )
        except Exception as exc:
            logger.debug("Graph-document engine activation skipped for %s: %s", snapshot.id, exc)
            return None

        if not applied:
            return None

        # T2454-B2: read per-call adoption stats from the engine. The C++
        # `loadGraphDocument` records `reused.size()` (instances pre-loaded
        # in the host, including pre-staged ones from the orchestrator) and
        # `newlyLoaded.size()` (slots that required a fresh `loadPlugin()`).
        # Defensive: if the engine binding doesn't yet have the method
        # (running against an older build), default to None and let the
        # FSM observability fields stay None rather than fabricating
        # numbers.
        engine_load_stats: dict[str, Any] | None = None
        get_stats = getattr(engine, "get_last_graph_load_stats", None)
        if callable(get_stats):
            try:
                stats = get_stats()
                if isinstance(stats, dict):
                    engine_load_stats = {
                        "plugins_total": int(stats.get("plugins_total") or 0),
                        "plugins_adopted": int(stats.get("plugins_adopted") or 0),
                        "plugins_freshly_loaded": int(stats.get("plugins_freshly_loaded") or 0),
                    }
            except Exception as exc:
                logger.debug(
                    "T2454-B2 engine adoption stats read failed for snapshot %s: %s",
                    snapshot.id, exc,
                )
                engine_load_stats = None

        graph = document.get("graph") if isinstance(document.get("graph"), dict) else {}
        chains = graph.get("chains") if isinstance(graph.get("chains"), list) else []
        plugin_count = 0
        bypass_count = 0
        for chain in chains:
            if not isinstance(chain, dict):
                continue
            for plugin in chain.get("plugins", []):
                if not isinstance(plugin, dict):
                    continue
                plugin_count += 1
                if bool(plugin.get("bypass", False)):
                    bypass_count += 1

        return {
            "applied": True,
            "plugin_count": plugin_count,
            "bypass_count": bypass_count,
            "used_independent_crossfade": True,
            "max_crossfade_ms": max_crossfade_ms,
            # T2454-B2: per-slot adoption observability. None if the engine
            # binding predates the get_last_graph_load_stats method.
            "engine_load_stats": engine_load_stats,
        }

    @staticmethod
    def ordered_detail_channels(detail: dict[str, Any]) -> list[dict[str, Any]]:
        channels = [channel for channel in detail.get("channels", []) if isinstance(channel, dict)]
        return sorted(
            channels,
            key=lambda item: (
                int(item.get("order_index", 0)),
                str(item.get("channel_key") or ""),
            ),
        )

    @staticmethod
    def runtime_chain_name_for_channel(
        source_chain: dict[str, Any] | None,
        channel: dict[str, Any],
    ) -> str:
        source_name = (
            source_chain.get("name")
            if isinstance(source_chain, dict) and source_chain.get("name")
            else "Path"
        )
        channel_name = channel.get("label") or channel.get("channel_key")
        return f"{source_name} ({channel_name})"

    @staticmethod
    def _activation_result_contract(runtime_live_state: dict[str, Any] | None) -> dict[str, Any]:
        authority_publication = (
            runtime_live_state.get("runtime_metrics", {}).get("authority_publication")
            if isinstance(runtime_live_state, dict)
            and isinstance(runtime_live_state.get("runtime_metrics"), dict)
            else {}
        )
        if isinstance(authority_publication, dict) and str(authority_publication.get("status") or "").strip().lower() == "failed":
            return {
                "status": "degraded",
                "result_code": str(authority_publication.get("reason") or "").strip() or "authority_confirmation_failed",
                "operator_message": str(authority_publication.get("operator_message") or "").strip()
                or "The audio engine applied this snapshot, but control-plane authority confirmation did not complete.",
                "technical_detail": str(authority_publication.get("technical_detail") or "").strip() or None,
                "recommended_action": "Retry publish",
                "repair_action_id": "retry_publish",
            }
        return {
            "status": "success",
            "result_code": "live_confirmed",
            "operator_message": "The audio engine applied this snapshot and authority confirmation completed.",
            "technical_detail": None,
            "recommended_action": None,
            "repair_action_id": None,
        }

    @staticmethod
    def _log_activation_outcome(
        *,
        snapshot_id: int,
        snapshot_revision: str | None,
        request_id: str,
        node_id: str,
        triggered_by: str,
        outcome: dict[str, Any],
    ) -> None:
        log_fn = logger.warning if str(outcome.get("status")) == "degraded" else logger.info
        log_fn(
            "Snapshot activation outcome snapshot_id=%s snapshot_revision=%s request_id=%s node_id=%s "
            "triggered_by=%s status=%s result_code=%s repair_action_id=%s related_node_ids=%s related_path_ids=%s",
            snapshot_id,
            snapshot_revision,
            request_id,
            node_id,
            triggered_by,
            outcome.get("status"),
            outcome.get("result_code"),
            outcome.get("repair_action_id"),
            outcome.get("related_node_ids"),
            outcome.get("related_path_ids"),
        )
        # Emit the outcome to the canonical PlatformEventBus so toasts,
        # webhooks, the event store, and cluster replication all receive
        # activation outcomes without bespoke wiring per consumer.
        # Plan Q10 — best-effort; swallow any bus failure at debug level so
        # activation itself is never blocked by an event-bus outage.
        _emit_activation_outcome_platform_event(
            snapshot_id=snapshot_id,
            snapshot_revision=snapshot_revision,
            request_id=request_id,
            node_id=node_id,
            triggered_by=triggered_by,
            outcome=outcome,
        )

    @staticmethod
    def _emit_activation_started_platform_event(
        *,
        snapshot_id: int,
        snapshot_name: str,
        snapshot_revision: str | None,
        request_id: str,
        node_id: str,
        triggered_by: str,
    ) -> None:
        """Fire snapshot.activation.started as soon as the activation intent
        is persisted. Callers can invoke this directly from the activation
        flow; failures are silently swallowed (plan Q10)."""
        _emit_activation_started_platform_event(
            snapshot_id=snapshot_id,
            snapshot_name=snapshot_name,
            snapshot_revision=snapshot_revision,
            request_id=request_id,
            node_id=node_id,
            triggered_by=triggered_by,
        )

    def _canonicalize_json_value(self, value: Any) -> Any:
        if isinstance(value, dict):
            return {
                str(key): self._canonicalize_json_value(subvalue)
                for key, subvalue in sorted(value.items(), key=lambda item: str(item[0]))
                if str(key) not in self._canonical_transient_keys
            }
        if isinstance(value, list):
            return [self._canonicalize_json_value(item) for item in value]
        return value

    def snapshot_runtime_topology_signature(self, detail: dict[str, Any]) -> dict[str, Any]:
        chain_index_by_id: dict[int, int] = {}
        canonical_chains: list[dict[str, Any]] = []
        ordered_chains = [chain for chain in detail.get("chains", []) if isinstance(chain, dict)]

        for chain_index, chain in enumerate(ordered_chains):
            chain_id = self._safe_int(chain.get("id"))
            if chain_id is not None:
                chain_index_by_id[chain_id] = chain_index

            plugins = [
                {
                    "uri": str(plugin.get("uri") or ""),
                    "position": int(plugin.get("position", index)),
                }
                for index, plugin in enumerate(chain.get("plugins", []))
                if isinstance(plugin, dict)
            ]
            plugins.sort(key=lambda item: (int(item["position"]), item["uri"]))

            canonical_chains.append(
                {
                    "plugins": plugins,
                }
            )

        canonical_channels = [
            {
                "chain_index": chain_index_by_id.get(self._safe_int(channel.get("chain_id")) or -1),
            }
            for channel in self.ordered_detail_channels(detail)
        ]

        return {
            "channels": canonical_channels,
            "chains": canonical_chains,
        }

    async def reuse_live_runtime_chains(
        self,
        snapshot: Snapshot,
        detail: dict[str, Any],
        *,
        current_live_detail: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        if not isinstance(current_live_detail, dict):
            return None
        if self.snapshot_runtime_topology_signature(current_live_detail) != self.snapshot_runtime_topology_signature(detail):
            return None

        current_live_state = current_live_detail.get("live_state")
        if not isinstance(current_live_state, dict):
            return None

        current_runtime_paths = [
            dict(item)
            for item in current_live_state.get("paths", [])
            if isinstance(item, dict)
        ]
        target_channels = self.ordered_detail_channels(detail)
        if len(current_runtime_paths) != len(target_channels):
            return None

        runtime_chain_ids: list[int] = []
        for path in current_runtime_paths:
            runtime_chain_id = self._safe_int(path.get("runtime_chain_id"))
            if runtime_chain_id is None:
                return None
            runtime_chain_ids.append(runtime_chain_id)

        result = await self.session.execute(select(Chain).where(Chain.id.in_(runtime_chain_ids)))
        runtime_chains = {chain.id: chain for chain in result.scalars().all()}
        if len(runtime_chains) != len(runtime_chain_ids):
            return None

        runtime_plugin_result = await self.session.execute(
            select(ChainPlugin)
            .where(ChainPlugin.chain_id.in_(runtime_chain_ids))
            .order_by(ChainPlugin.chain_id.asc(), ChainPlugin.position.asc(), ChainPlugin.id.asc())
        )
        runtime_plugins_by_chain_id: dict[int, list[ChainPlugin]] = {}
        for runtime_plugin in runtime_plugin_result.scalars().all():
            runtime_plugins_by_chain_id.setdefault(int(runtime_plugin.chain_id), []).append(runtime_plugin)

        chain_by_id = {
            self._safe_int(chain.get("id")): chain
            for chain in detail.get("chains", [])
            if isinstance(chain, dict) and self._safe_int(chain.get("id")) is not None
        }

        rebound_paths: list[dict[str, Any]] = []
        active_runtime_chain_ids: list[int] = []
        for runtime_path, channel in zip(current_runtime_paths, target_channels):
            runtime_chain_id = self._safe_int(runtime_path.get("runtime_chain_id"))
            if runtime_chain_id is None:
                return None

            runtime_chain = runtime_chains.get(runtime_chain_id)
            if runtime_chain is None:
                return None

            snapshot_chain_id = self._safe_int(channel.get("chain_id"))
            source_chain = chain_by_id.get(snapshot_chain_id)
            target_plugins = (
                [plugin for plugin in source_chain.get("plugins", []) if isinstance(plugin, dict)]
                if isinstance(source_chain, dict)
                else []
            )
            target_plugins = sorted(
                target_plugins,
                key=lambda item: (int(item.get("position", 0)), str(item.get("uri") or "")),
            )
            runtime_plugins = runtime_plugins_by_chain_id.get(runtime_chain_id, [])
            if len(runtime_plugins) != len(target_plugins):
                return None

            for runtime_plugin, target_plugin in zip(runtime_plugins, target_plugins):
                target_uri = str(target_plugin.get("uri") or "")
                target_position = int(target_plugin.get("position", 0))
                if runtime_plugin.plugin_uri != target_uri or int(runtime_plugin.position) != target_position:
                    return None

            chain_config = self.chain_service._parse_chain_config(runtime_chain.config)
            if not isinstance(chain_config, dict):
                chain_config = {}
            chain_config.update(
                {
                    "source_kind": "snapshot_path",
                    "snapshot_id": snapshot.id,
                    "snapshot_chain_id": snapshot_chain_id,
                    "path_id": channel.get("channel_key"),
                    "system_blocks": extract_chain_system_blocks(
                        source_chain.get("plugins") if isinstance(source_chain, dict) else []
                    ),
                }
            )
            runtime_chain.name = self.runtime_chain_name_for_channel(source_chain, channel)
            runtime_chain.is_active = True
            runtime_chain.config = json.dumps(chain_config)

            for runtime_plugin, target_plugin in zip(runtime_plugins, target_plugins):
                runtime_plugin.bypass = bool(target_plugin.get("bypass", False))
                loader_state = (
                    target_plugin.get("loader_state")
                    if isinstance(target_plugin.get("loader_state"), dict)
                    else None
                )
                for column, value in self.chain_service._chain_plugin_loader_columns(
                    str(target_plugin.get("uri") or ""),
                    loader_state,
                ).items():
                    setattr(runtime_plugin, column, value)

            runtime_sync = chain_config.get("runtime_sync")
            rebound_paths.append(
                {
                    "path_id": channel.get("channel_key"),
                    "label": channel.get("label"),
                    "color": channel.get("color"),
                    "snapshot_chain_id": snapshot_chain_id,
                    "runtime_chain_id": runtime_chain_id,
                    "runtime_chain_name": runtime_chain.name,
                    "activation_status": (
                        runtime_sync.get("status")
                        if isinstance(runtime_sync, dict) and runtime_sync.get("status")
                        else "active"
                    ),
                }
            )
            active_runtime_chain_ids.append(runtime_chain_id)

        await self.session.flush()
        return {
            "activated_at": self._utcnow().isoformat(),
            "paths": rebound_paths,
            "active_runtime_chain_ids": active_runtime_chain_ids,
        }

    async def clear_materialized_runtime_chains(self) -> None:
        result = await self.session.execute(select(Chain))
        for chain in result.scalars().all():
            config = self.chain_service._parse_chain_config(chain.config)
            if not isinstance(config, dict):
                continue
            if config.get("source_kind") == "snapshot_path" or (
                config.get("snapshot_id") is not None and config.get("path_id") is not None
            ):
                await self.session.delete(chain)
        await self.session.flush()

    async def materialize_live_state(
        self,
        snapshot: Snapshot,
        detail: dict[str, Any],
        *,
        preloaded_instance_ids: Optional[list[int]] = None,
    ) -> dict[str, Any]:
        await self.session.execute(update(Chain).values(is_active=False))
        await self.session.flush()

        chain_by_id = {
            chain.get("id"): chain
            for chain in detail.get("chains", [])
            if chain.get("id") is not None
        }
        runtime_paths: list[dict[str, Any]] = []
        activated_runtime_chain_ids: list[int] = []
        remaining_preloaded_instance_ids = [
            int(instance_id)
            for instance_id in preloaded_instance_ids or []
            if self._safe_int(instance_id) is not None
        ]

        for channel in detail.get("channels", []):
            snapshot_chain_id = channel.get("chain_id")
            source_chain = chain_by_id.get(snapshot_chain_id) if snapshot_chain_id is not None else None
            source_plugins = [
                plugin
                for plugin in (source_chain.get("plugins", []) if isinstance(source_chain, dict) else [])
                if isinstance(plugin, dict)
            ]
            chain_preloaded_instance_ids = remaining_preloaded_instance_ids[: len(source_plugins)]
            remaining_preloaded_instance_ids = remaining_preloaded_instance_ids[len(source_plugins) :]
            runtime_chain = Chain(
                name=self.runtime_chain_name_for_channel(source_chain, channel),
                is_active=False,
                config=json.dumps(
                    {
                        "source_kind": "snapshot_path",
                        "snapshot_id": snapshot.id,
                        "snapshot_chain_id": snapshot_chain_id,
                        "path_id": channel.get("channel_key"),
                        "system_blocks": extract_chain_system_blocks(
                            source_chain.get("plugins") if isinstance(source_chain, dict) else []
                        ),
                    }
                ),
            )
            self.session.add(runtime_chain)
            await self.session.flush()

            if isinstance(source_chain, dict):
                for plugin in source_plugins:
                    self.session.add(
                        ChainPlugin(
                            chain_id=runtime_chain.id,
                            plugin_uri=str(plugin.get("uri") or ""),
                            position=int(plugin.get("position", 0)),
                            bypass=bool(plugin.get("bypass", False)),
                            **self.chain_service._chain_plugin_loader_columns(
                                str(plugin.get("uri") or ""),
                                plugin.get("loader_state") if isinstance(plugin.get("loader_state"), dict) else None,
                            ),
                        )
                    )

                for loop in source_chain.get("loop_insertions", []):
                    if not isinstance(loop, dict):
                        continue
                    self.session.add(
                        EffectsLoopInsertion(
                            insertion_id=f"snapshot-{snapshot.id}-{uuid4().hex[:12]}",
                            chain_id=runtime_chain.id,
                            loop_id=str(loop.get("loop_id") or ""),
                            slot_index=int(loop.get("slot_index", 0)),
                            enabled=bool(loop.get("enabled", True)),
                            mode=str(loop.get("mode") or "serial_insert"),
                            blend_pct=self._safe_float(loop.get("blend_pct"), 100.0),
                            send_gain_db=self._safe_float(loop.get("send_gain_db"), 0.0),
                            return_gain_db=self._safe_float(loop.get("return_gain_db"), 0.0),
                            crossfade_ms=int(self._safe_int(loop.get("crossfade_ms")) or 12),
                            band_split_hz=list(loop.get("band_split_hz") or []),
                        )
                    )

            await self.session.flush()
            preferred_instance_ids = chain_preloaded_instance_ids if chain_preloaded_instance_ids else None
            activation_kwargs: dict[str, Any] = {
                "allow_snapshot_path_activation": True,
            }
            if preferred_instance_ids:
                activation_kwargs["preferred_detached_instance_ids"] = preferred_instance_ids
            try:
                activated = await self.chain_service.activate_chain(
                    runtime_chain.id,
                    **activation_kwargs,
                )
            except TypeError as exc:
                message = str(exc)
                if "allow_snapshot_path_activation" in message:
                    activation_kwargs.pop("allow_snapshot_path_activation", None)
                    try:
                        activated = await self.chain_service.activate_chain(
                            runtime_chain.id,
                            **activation_kwargs,
                        )
                    except TypeError as inner_exc:
                        if "preferred_detached_instance_ids" not in str(inner_exc):
                            raise
                        activated = await self.chain_service.activate_chain(runtime_chain.id)
                elif "preferred_detached_instance_ids" in message:
                    activated = await self.chain_service.activate_chain(runtime_chain.id)
                else:
                    raise
            activation_status = "active" if activated else "degraded"
            activated_runtime_chain_ids.append(runtime_chain.id)
            runtime_paths.append(
                {
                    "path_id": channel.get("channel_key"),
                    "label": channel.get("label"),
                    "color": channel.get("color"),
                    "snapshot_chain_id": snapshot_chain_id,
                    "runtime_chain_id": runtime_chain.id,
                    "runtime_chain_name": runtime_chain.name,
                    "activation_status": activation_status,
                }
            )

        return {
            "activated_at": snapshot.activated_at.isoformat() if snapshot.activated_at else self._utcnow().isoformat(),
            "paths": runtime_paths,
            "active_runtime_chain_ids": activated_runtime_chain_ids,
        }

    async def activate_snapshot(
        self,
        snapshot_id: int,
        *,
        triggered_by: str = "ui",
    ) -> dict[str, Any] | None:
        from app.services.snapshot_runtime_state_service import resolve_local_node_id

        async with self._activation_lock_for_node(resolve_local_node_id()):
            return await self._activate_snapshot_locked(snapshot_id, triggered_by=triggered_by)

    async def _activate_snapshot_locked(
        self,
        snapshot_id: int,
        *,
        triggered_by: str = "ui",
    ) -> dict[str, Any] | None:
        snapshot = await self.owner._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None

        from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

        detail = await self.owner.get_snapshot(snapshot_id)
        if detail is None:
            return None
        if not isinstance(detail.get("revision_number"), int):
            await self.owner._append_snapshot_revision(snapshot.id, detail)
            await self.session.flush()
            detail = await self.owner.get_snapshot(snapshot_id)
            if detail is None:
                return None
            if not isinstance(detail.get("revision_number"), int):
                raise ValueError("Snapshot could not be saved as a revision before publish.")

        normalized = await self.owner._snapshot_to_normalized(snapshot)
        snapshot_revision = self.owner._snapshot_revision_from_normalized(normalized)
        runtime_state_service = SnapshotRuntimeStateService(self.session)
        intent = await runtime_state_service.create_activation_intent(
            snapshot_id=snapshot.id,
            snapshot_name=snapshot.name,
            snapshot_revision=snapshot_revision,
            normalized_snapshot_payload=self.owner._canonicalize_snapshot_normalized(normalized),
            triggered_by=triggered_by,
        )
        # Emit the canonical started event before we begin phase work so
        # downstream surfaces (Stage Notification, webhooks) know an
        # activation is inflight from t=0. Use .get for node_id since
        # legacy intent payloads may not carry it; treat missing as
        # "local" (the platform-event envelope defaults source_node when
        # unknown).
        self._emit_activation_started_platform_event(
            snapshot_id=snapshot.id,
            snapshot_name=snapshot.name,
            snapshot_revision=snapshot_revision,
            request_id=str(intent.get("request_id") or ""),
            node_id=str(intent.get("node_id") or "local"),
            triggered_by=triggered_by,
        )
        intent = await runtime_state_service.mark_intent_phase(
            intent=intent,
            phase="VALIDATING",
            status="in_progress",
            note="Running activation preflight checks.",
        )

        params_applied = 0
        bypass_applied = 0
        topology_reused = False
        graph_document_apply_result: dict[str, Any] | None = None
        audio_device_binding_result: dict[str, Any] | None = None
        monitoring_output_result: dict[str, Any] | None = None
        sonobus_io_binding_result: dict[str, Any] | None = None
        output_safety_result: dict[str, Any] | None = None
        midi_map_sync_result: dict[str, Any] | None = None
        expression_mapping_sync_result: dict[str, Any] | None = None
        automation_lane_sync_result: dict[str, Any] | None = None
        routing_apply_result: dict[str, Any] | None = None
        loop_insertion_sync_result: dict[str, Any] | None = None
        channel_state_sync_result: dict[str, Any] | None = None
        morph_apply_result: dict[str, Any] | None = None
        previous_preload_state: dict[str, Any] = {}
        activation_topology_metrics = {
            "before": self._normalize_topology_mutation_stats(None),
            "after": self._normalize_topology_mutation_stats(None),
            "delta": {
                "mutation_count": 0,
                "no_op_skip_count": 0,
            },
        }
        try:
            try:
                await asyncio.wait_for(
                    self.owner._validate_snapshot_activation_preflight(detail),
                    timeout=10.0,
                )
            except TimeoutError as exc:
                raise ValueError("Snapshot activation validation timed out after 10 seconds.") from exc
            intent = await runtime_state_service.mark_intent_phase(
                intent=intent,
                phase="VALIDATING",
                status="completed",
                note="Preflight checks passed.",
            )
        except Exception as exc:
            runtime_metrics = {}
            detail_payload = getattr(exc, "detail_payload", None)
            if isinstance(detail_payload, dict):
                runtime_metrics["validation_report"] = copy.deepcopy(detail_payload)
            await runtime_state_service.fail_intent(
                intent=intent,
                failure_reason=str(exc),
                runtime_metrics=runtime_metrics,
            )
            raise

        try:
            intent = await runtime_state_service.mark_intent_phase(
                intent=intent,
                phase="STAGING",
                status="in_progress",
                note="Preparing runtime resources and preload state.",
            )
            activation_topology_metrics["before"] = self._normalize_topology_mutation_stats(
                await self.get_audio_engine().get_topology_mutation_stats()
            )
            # T2448: observe live PipeWire settings; re-force or fail per
            # snapshot policy. Default is "reforce" (silent correction).
            quantum_policy = _extract_quantum_policy(detail)
            quantum_result = await _enforce_quantum_for_activation(policy=quantum_policy)
            audio_device_binding_result = await self.owner._apply_snapshot_audio_device_bindings(detail)
            monitoring_output_result = await self.owner._apply_snapshot_monitoring_output_binding(detail)
            sonobus_io_binding_result = await self.owner._apply_snapshot_sonobus_io_binding(detail)
            output_safety_result = await self.owner._apply_snapshot_output_safety_settings(detail)
            current_runtime_state = await runtime_state_service.get_live_state()
            previous_preload_state = self.owner._extract_preload_state(current_runtime_state.get("runtime_metrics"))
            preload_instance_ids = [
                int(instance_id)
                for instance_id in previous_preload_state.get("staged_instance_ids", [])
                if self._safe_int(instance_id) is not None
            ]
            preload_hit = (
                str(previous_preload_state.get("status") or "").lower() == "ready"
                and self._safe_int(previous_preload_state.get("target_snapshot_id")) == int(snapshot.id)
            )
            if preload_instance_ids and not preload_hit:
                await self.chain_service.release_detached_instance_ids(preload_instance_ids)
            current_live_detail = await runtime_state_service.get_live_snapshot_payload()
            if not isinstance(current_live_detail, dict):
                current_live_detail = await self.owner.get_live_snapshot()
            live_state_payload = await self.owner._reuse_live_runtime_chains(
                snapshot,
                detail,
                current_live_detail=current_live_detail,
            )
            if live_state_payload is None:
                await self.owner._arm_live_spillover_processors(
                    current_live_detail=current_live_detail,
                    target_detail=detail,
                )
                await self.owner._clear_materialized_runtime_chains()
                live_state_payload = await self.owner._materialize_live_state(
                    snapshot,
                    detail,
                    preloaded_instance_ids=preload_instance_ids if preload_hit else None,
                )
            else:
                topology_reused = True
            if preload_instance_ids and preload_hit:
                await self.chain_service.release_detached_instance_ids(preload_instance_ids)
            await self.session.flush()
            intent = await runtime_state_service.mark_intent_phase(
                intent=intent,
                phase="STAGING",
                status="completed",
                note="Runtime staging complete.",
                extra={
                    "topology_reused": topology_reused,
                    "preload_hit": preload_hit,
                    "quantum_action": quantum_result.action,
                    "quantum_observed_rate": quantum_result.observed.rate,
                    "quantum_observed_quantum": quantum_result.observed.quantum,
                },
            )

            refreshed_detail = await self.owner._serialize_snapshot_detail(
                snapshot,
                compatibility_live_state_payload=live_state_payload,
                compatibility_is_live=True,
            )

            channel_health = await runtime_state_service.assert_snapshot_channels_active(
                live_snapshot_payload=refreshed_detail,
            )
            refreshed_detail = channel_health["snapshot_payload"]

            snapshot_payload = copy.deepcopy(refreshed_detail)
            # T2454-B: claim the warm-cache entry (if any) so the reconciler
            # won't release the staged plugin instances mid-adoption. Always
            # paired with mark_consumed() below — even on exception paths.
            from app.services.snapshot.preload_orchestrator import (
                get_preload_orchestrator,
            )

            warm_path_orchestrator = get_preload_orchestrator()
            warm_claim = None
            try:
                warm_claim = await warm_path_orchestrator.claim(int(snapshot.id))
            except Exception as exc:
                # claim() itself shouldn't fail, but be defensive — falling
                # through to cold path is always safe.
                logger.debug(
                    "T2454-B warm-path claim() raised for snapshot %s: %s",
                    snapshot.id, exc,
                )
                warm_claim = None
            warm_path_outcome: str = "cold"  # one of "adopted" | "fallback:<reason>" | "cold"

            intent = await runtime_state_service.mark_intent_phase(
                intent=intent,
                phase="APPLYING",
                status="in_progress",
                note="Applying snapshot runtime state to the engine.",
            )
            warm_path_succeeded = False
            try:
                graph_document_apply_result = await self.apply_graph_document_to_engine(
                    snapshot=snapshot,
                    normalized=normalized,
                )
                if graph_document_apply_result is not None:
                    params_applied = int(graph_document_apply_result.get("plugin_count") or 0)
                    bypass_applied = int(graph_document_apply_result.get("bypass_count") or 0)
                    if warm_claim is not None:
                        # The engine's load_graph_document already adopts any
                        # loaded instance (including pre-staged ones) by URI.
                        # If we held a warm claim and the apply succeeded, the
                        # staged instances were either adopted into the live
                        # graph or unloaded as redundant — either way they are
                        # not ours to hand out anymore.
                        warm_path_outcome = "adopted"
                        warm_path_succeeded = True
                else:
                    params_applied, bypass_applied = await self.runtime_service_module.apply_snapshot_to_engine(
                        copy.deepcopy(snapshot_payload)
                    )
                    if warm_claim is not None:
                        # apply_graph_document_to_engine returned None — the
                        # engine isn't running, doesn't expose the API, or
                        # the document was malformed. Self-heal per Q4=D:
                        # log WARNING + evict, no toast.
                        warm_path_outcome = "fallback:engine_apply_unavailable"
                        warm_path_succeeded = False
                        logger.warning(
                            "T2454-B warm-path fell back to cold rebuild for snapshot %s: %s",
                            snapshot.id, warm_path_outcome,
                        )
            finally:
                if warm_claim is not None:
                    try:
                        await warm_path_orchestrator.mark_consumed(
                            int(snapshot.id), success=warm_path_succeeded,
                        )
                    except Exception as exc:
                        # mark_consumed shouldn't raise either, but protect
                        # the FSM from a leaked in-flight lock.
                        logger.debug(
                            "T2454-B warm-path mark_consumed() raised for snapshot %s: %s",
                            snapshot.id, exc,
                        )
            activation_topology_metrics = self._build_activation_topology_metrics(
                activation_topology_metrics["before"],
                await self.get_audio_engine().get_topology_mutation_stats(),
            )
            # T2454-B2: thread per-slot adoption stats into the activation
            # intent extra so ops can attribute warm-vs-cold instance reuse
            # on a per-activation basis. None if the engine binding predates
            # the get_last_graph_load_stats method (graceful degrade).
            engine_load_stats = (
                graph_document_apply_result.get("engine_load_stats")
                if graph_document_apply_result is not None
                else None
            )
            applying_extra = {
                "params_applied": params_applied,
                "bypass_applied": bypass_applied,
                # T2454-B: activation observability — operator + ops
                # can attribute warm-path benefit honestly.
                "warm_path": warm_path_outcome,
                "max_crossfade_ms": int(
                    graph_document_apply_result.get("max_crossfade_ms")
                    if graph_document_apply_result is not None and graph_document_apply_result.get("max_crossfade_ms") is not None
                    else 500
                ),
            }
            if engine_load_stats is not None:
                # Surface as both nested dict (for structured consumers) and
                # flat ints (for log greppers / quick eyeballs).
                applying_extra["engine_load_stats"] = engine_load_stats
                applying_extra["plugins_total"] = int(engine_load_stats.get("plugins_total") or 0)
                applying_extra["plugins_adopted"] = int(engine_load_stats.get("plugins_adopted") or 0)
                applying_extra["plugins_freshly_loaded"] = int(
                    engine_load_stats.get("plugins_freshly_loaded") or 0
                )
            intent = await runtime_state_service.mark_intent_phase(
                intent=intent,
                phase="APPLYING",
                status="completed",
                note="Engine apply finished.",
                extra=applying_extra,
            )

            activated_at = self._utcnow()
            await self.owner._clear_compatibility_live_projections()
            snapshot.updated_at = activated_at
            snapshot.activated_at = activated_at
            await self.session.flush()

            try:
                from app.services.snapshot_tempo_service import get_snapshot_tempo_service

                await get_snapshot_tempo_service().activate_snapshot(
                    snapshot.id,
                    snapshot.tempo_bpm,
                    snapshot_data=copy.deepcopy(snapshot_payload),
                )
            except Exception as exc:
                logger.debug("Snapshot tempo activation skipped for %s: %s", snapshot.id, exc)

            refreshed_detail = await self.owner._serialize_snapshot_detail(
                snapshot,
                compatibility_live_state_payload=live_state_payload,
                compatibility_is_live=True,
                compatibility_activated_at=activated_at,
            )
            refreshed_detail["snapshot_revision"] = snapshot_revision
            try:
                refreshed_detail["controller_display_preview"] = self.build_snapshot_controller_display_preview(
                    refreshed_detail,
                    await self.midi_service.get_all_commands(self.session),
                )
            except Exception as exc:
                logger.debug("Snapshot controller-display preview skipped for %s: %s", snapshot.id, exc)
            pre_activation_extensions = await self.owner._load_current_audio_state_extensions()
            intent = await runtime_state_service.mark_intent_phase(
                intent=intent,
                phase="VERIFYING",
                status="in_progress",
                note="Running post-apply verification and synchronization.",
            )
            # T2452: collect every sub-sync error across the phase so a single
            # activation surfaces all failures at once, then enforce strictness.
            verify_mode = _extract_verify_mode(detail)
            verify_errors: list[dict[str, str]] = []

            routing_apply_result = await _run_verify_step(
                step="routing_apply",
                coro=self.runtime_service_module.apply_snapshot_routing_to_engine(refreshed_detail),
                fallback={
                    "applied": False,
                    "removed_group_count": 0,
                    "created_group_id": None,
                    "branch_count": 0,
                },
                errors=verify_errors,
                snapshot_id=snapshot.id,
            )
            loop_insertion_sync_result = await _run_verify_step(
                step="loop_insertions",
                coro=self.owner._sync_snapshot_loop_insertions_to_runtime(refreshed_detail),
                fallback={"synced": False, "chain_count": 0, "applied_count": 0},
                errors=verify_errors,
                snapshot_id=snapshot.id,
            )
            channel_state_sync_result = await _run_verify_step(
                step="channel_state",
                coro=self.owner._sync_snapshot_channel_state_to_runtime(refreshed_detail),
                fallback={"synced": False, "channel_count": 0, "applied_count": 0},
                errors=verify_errors,
                snapshot_id=snapshot.id,
            )
            morph_apply_result = await _run_verify_step(
                step="morph_apply",
                coro=self.runtime_service_module.apply_snapshot_morph_to_engine(refreshed_detail),
                fallback={"applied": False, "plugin_count": 0, "applied_count": 0},
                errors=verify_errors,
                snapshot_id=snapshot.id,
            )
            midi_map_sync_result = await _run_verify_step(
                step="midi_map",
                coro=self.owner._sync_snapshot_midi_map_to_engine(
                    snapshot.id,
                    [
                        dict(entry)
                        for entry in refreshed_detail.get("controls", {}).get("midi_map", [])
                        if isinstance(entry, dict)
                    ],
                ),
                fallback={
                    "synced": False,
                    "global_command_count": 0,
                    "snapshot_command_count": 0,
                },
                errors=verify_errors,
                snapshot_id=snapshot.id,
            )
            expression_mapping_sync_result = await _run_verify_step(
                step="expression_mappings",
                coro=self.owner._sync_snapshot_expression_mappings_to_runtime(
                    [
                        dict(entry)
                        for entry in refreshed_detail.get("controls", {}).get("expression_mappings", [])
                        if isinstance(entry, dict)
                    ],
                ),
                fallback={
                    "synced": False,
                    "cleared_count": 0,
                    "applied_count": 0,
                    "active_snapshot_count": 0,
                },
                errors=verify_errors,
                snapshot_id=snapshot.id,
            )
            automation_lane_sync_result = await _run_verify_step(
                step="automation_lanes",
                coro=self.owner._sync_snapshot_automation_lanes_to_runtime(
                    [
                        dict(entry)
                        for entry in refreshed_detail.get("controls", {}).get("automation_lanes", [])
                        if isinstance(entry, dict)
                    ],
                ),
                fallback={
                    "synced": False,
                    "cleared_count": 0,
                    "applied_count": 0,
                    "invalid_count": 0,
                    "active_snapshot_count": 0,
                },
                errors=verify_errors,
                snapshot_id=snapshot.id,
            )

            # T2452: in strict mode (default), any sub-sync failure aborts the
            # activation; in lenient mode the WARN logs above are sufficient
            # and we continue to mark VERIFYING completed.
            if verify_mode == "strict" and verify_errors:
                raise SnapshotVerificationError(verify_errors)
            sequencer_runtime_reconcile_result = await self.owner._reconcile_snapshot_brain_runtime_extensions(
                current_extensions=pre_activation_extensions,
                snapshot_extensions=(
                    refreshed_detail.get("extensions")
                    if isinstance(refreshed_detail.get("extensions"), dict)
                    else None
                ),
            )

            runtime_metrics = {
                "params_applied": params_applied,
                "bypass_applied": bypass_applied,
                "topology_reused": topology_reused,
                "runtime_chain_count": len(refreshed_detail.get("live_state", {}).get("runtime_chains", [])),
                "channel_activity": {
                    "active_count": channel_health["active_count"],
                    "total_count": channel_health["total_count"],
                    "inactive_channels": channel_health["inactive_channels"],
                },
                "preload_hit": preload_hit,
                "audio_device_binding": audio_device_binding_result or {},
                "monitoring_output": monitoring_output_result or {},
                "sonobus_io_binding": sonobus_io_binding_result or {},
                "output_safety": output_safety_result or {},
                "routing_apply": routing_apply_result or {},
                "loop_insertions": loop_insertion_sync_result or {},
                "channel_state": channel_state_sync_result or {},
                "morph_apply": morph_apply_result or {},
                "graph_document_apply": graph_document_apply_result or {},
                "snapshot_midi_map": midi_map_sync_result or {},
                "expression_mappings": expression_mapping_sync_result or {},
                "automation_lanes": automation_lane_sync_result or {},
                "sequencer_runtime": sequencer_runtime_reconcile_result or {},
                "topology_mutation": activation_topology_metrics,
            }
            preload_plan = await self.owner.plan_preload_candidates_for_snapshot(snapshot.id, limit=3)
            runtime_metrics["preload_plan"] = preload_plan or {
                "source_snapshot_id": int(snapshot.id),
                "source_snapshot_name": str(snapshot.name or f"Snapshot {snapshot.id}"),
                "candidate_reason": None,
                "candidates": [],
            }
            # T2452: include verify mode + any captured sub-errors in the
            # intent extra so reconciliation/diagnostics can surface lenient
            # partial-applies. In strict mode this is always empty (we'd have
            # raised above); in lenient mode it lists every step that failed.
            runtime_metrics["verify_mode"] = verify_mode
            runtime_metrics["verify_errors"] = verify_errors
            intent = await runtime_state_service.mark_intent_phase(
                intent=intent,
                phase="VERIFYING",
                status="completed",
                note="Verification and sync steps completed.",
                extra={
                    "channel_activity": runtime_metrics["channel_activity"],
                    "graph_document_apply": runtime_metrics["graph_document_apply"],
                    "verify_mode": verify_mode,
                    "verify_errors": verify_errors,
                },
            )
            live_runtime_state = await runtime_state_service.confirm_live_intent(
                intent=intent,
                live_snapshot_payload=refreshed_detail,
                runtime_metrics=runtime_metrics,
            )
            authority_publication_result = await self.owner._publish_confirmed_live_state_to_audio_authority(
                refreshed_detail,
                runtime_live_state=live_runtime_state,
            )
            runtime_metrics["authority_publication"] = authority_publication_result or {}
            sequencer_runtime_reconcile_result["broadcast_count"] = await self.owner._broadcast_snapshot_brain_runtime_updates(
                sequencer_runtime_reconcile_result
            )
            try:
                from app.services.snapshot_runtime_state_service import schedule_post_activation_health_check

                schedule_post_activation_health_check(
                    snapshot_id=snapshot.id,
                    request_id=str(intent["request_id"]),
                )
            except Exception as exc:
                logger.debug("Post-activation health check scheduling skipped for %s: %s", snapshot.id, exc)

        except Exception as exc:
            await self.owner._clear_compatibility_live_projections()
            await self.session.flush()
            await runtime_state_service.fail_intent(
                intent=intent,
                failure_reason=str(exc),
                runtime_metrics={},
            )
            raise

        try:
            hook_results = await self._run_activation_hooks(
                snapshot=snapshot,
                refreshed_detail=refreshed_detail,
                preload_plan=runtime_metrics.get("preload_plan"),
            )
            runtime_metrics["activation_hooks"] = hook_results
            await runtime_state_service.sync_live_snapshot_payload(
                snapshot_id=snapshot.id,
                live_snapshot_payload=refreshed_detail,
                snapshot_revision=snapshot_revision,
                runtime_metrics=runtime_metrics,
            )
            updated_runtime_state = await runtime_state_service.record_authority_publication_result(
                snapshot_id=snapshot.id,
                request_id=str(intent["request_id"]),
                authority_publication=runtime_metrics.get("authority_publication") or {},
            )
            if updated_runtime_state is not None:
                live_runtime_state = updated_runtime_state
        except Exception as exc:
            logger.debug("Snapshot activation hook update skipped for %s: %s", snapshot.id, exc)

        try:
            from app.services.websocket_manager import ws_manager

            timestamp = self._utcnow().isoformat()
            # T2453: deep-copy to isolate this broadcast from subsequent
            # mutations of refreshed_detail by a queued activation that
            # acquires the per-node lock after ours releases.
            broadcast_snapshot_data = copy.deepcopy(refreshed_detail)
            await ws_manager.broadcast_json(
                {
                    "type": "snapshot_loaded",
                    "topic": "snapshots",
                    "data": {
                        "snapshot_id": snapshot.id,
                        "snapshot_name": snapshot.name,
                        "snapshot_data": broadcast_snapshot_data,
                        "triggered_by": triggered_by,
                        "program_number": snapshot.program_number,
                    },
                    "timestamp": timestamp,
                },
                topic="snapshots",
            )
            # T2431-H: legacy flow_snapshots WS broadcast removed. The
            # canonical activation event lives on the "snapshots" topic.
        except Exception as exc:
            logger.debug("Snapshot activation websocket broadcast failed: %s", exc)

        activation_result = self._activation_result_contract(live_runtime_state)
        activation_outcome = {
            "status": activation_result["status"],
            "result_code": activation_result["result_code"],
            "operator_message": activation_result["operator_message"],
            "technical_detail": activation_result["technical_detail"],
            "recommended_action": activation_result.get("recommended_action"),
            "repair_action_id": activation_result.get("repair_action_id"),
            "related_node_ids": [str(intent["node_id"])],
            "related_path_ids": [],
        }
        self._log_activation_outcome(
            snapshot_id=snapshot.id,
            snapshot_revision=snapshot_revision,
            request_id=str(intent["request_id"]),
            node_id=str(intent["node_id"]),
            triggered_by=triggered_by,
            outcome=activation_outcome,
        )

        return {
            **activation_outcome,
            "snapshot_id": snapshot.id,
            "name": snapshot.name,
            "snapshot_data": refreshed_detail,
            "snapshot_revision": snapshot_revision,
            "request_id": str(intent["request_id"]),
            "node_id": str(intent["node_id"]),
            "activation_intent": intent,
            "runtime_live_state": live_runtime_state,
            "params_applied": params_applied,
            "bypass_applied": bypass_applied,
            "topology_reused": topology_reused,
            "topology_mutation": activation_topology_metrics,
        }

    async def _run_activation_hooks(
        self,
        *,
        snapshot: Snapshot,
        refreshed_detail: dict[str, Any],
        preload_plan: dict[str, Any] | None,
    ) -> list[dict[str, Any]]:
        configured_hooks = await self.get_activation_hook_plan()
        midi_map_entries = [
            dict(entry)
            for entry in refreshed_detail.get("controls", {}).get("midi_map", [])
            if isinstance(entry, dict)
        ]

        async def _push_footswitch_labels() -> None:
            await self.push_snapshot_footswitch_labels(
                snapshot_id=snapshot.id,
                snapshot_name=snapshot.name,
                midi_map_entries=midi_map_entries,
            )

        async def _push_maschine_assignments() -> dict[str, Any]:
            return await self.push_snapshot_maschine_assignments(
                session=self.session,
                snapshot_id=snapshot.id,
                snapshot_name=snapshot.name,
                controls_payload=refreshed_detail.get("controls"),
            )

        async def _push_push_surface_state() -> dict[str, Any]:
            return await self.push_snapshot_push_surface_state(
                snapshot_id=snapshot.id,
                snapshot_name=snapshot.name,
            )

        async def _push_controller_preview() -> None:
            await self.push_snapshot_controller_display_preview(
                snapshot_id=snapshot.id,
                snapshot_name=snapshot.name,
                preview_payload=refreshed_detail.get("controller_display_preview"),
            )

        async def _push_ground_control_pro_assignments() -> dict[str, Any]:
            return await self.push_snapshot_ground_control_pro_assignments(
                snapshot_id=snapshot.id,
                snapshot_name=snapshot.name,
                detail_payload=refreshed_detail,
            )

        async def _push_mcu_surface_state() -> dict[str, Any]:
            return await self.push_snapshot_mcu_surface_state(
                snapshot_id=snapshot.id,
                snapshot_name=snapshot.name,
            )

        async def _push_launch_control_assignments() -> dict[str, Any]:
            return await self.push_snapshot_launch_control_assignments(
                snapshot_id=snapshot.id,
                snapshot_name=snapshot.name,
                detail_payload=refreshed_detail,
            )

        async def _push_midi_commander_assignments() -> dict[str, Any]:
            return await self.push_snapshot_midi_commander_assignments(
                snapshot_id=snapshot.id,
                snapshot_name=snapshot.name,
                detail_payload=refreshed_detail,
            )

        async def _schedule_preload() -> None:
            self.schedule_snapshot_preload_for_live_snapshot(snapshot.id)

        hook_map = {
            "push_footswitch_labels": _push_footswitch_labels,
            "push_maschine_assignments": _push_maschine_assignments,
            "push_push_surface_state": _push_push_surface_state,
            "push_ground_control_pro_assignments": _push_ground_control_pro_assignments,
            "push_mcu_surface_state": _push_mcu_surface_state,
            "push_launch_control_assignments": _push_launch_control_assignments,
            "push_midi_commander_assignments": _push_midi_commander_assignments,
            "push_controller_display_preview": _push_controller_preview,
            "schedule_preload": _schedule_preload,
        }
        results: list[dict[str, Any]] = []
        for hook_name in configured_hooks:
            hook = hook_map.get(str(hook_name))
            if hook is None:
                results.append({"hook": str(hook_name), "status": "skipped", "reason": "unknown_hook"})
                continue
            try:
                hook_result = await hook()
                result_payload = dict(hook_result) if isinstance(hook_result, dict) else None
                hook_status = (
                    str(result_payload.get("status")).strip().lower()
                    if isinstance(result_payload, dict) and str(result_payload.get("status") or "").strip()
                    else "completed"
                )
                results.append(
                    {
                        "hook": str(hook_name),
                        "status": hook_status if hook_status in {"completed", "skipped"} else "completed",
                        "reason": result_payload.get("reason") if isinstance(result_payload, dict) else None,
                        "result": result_payload,
                        "preload_candidate_count": (
                            len(preload_plan.get("candidates", []))
                            if str(hook_name) == "schedule_preload" and isinstance(preload_plan, dict)
                            else None
                        ),
                    }
                )
            except Exception as exc:
                logger.debug("Snapshot activation hook %s skipped for %s: %s", hook_name, snapshot.id, exc)
                results.append(
                    {
                        "hook": str(hook_name),
                        "status": "failed",
                        "reason": str(exc),
                    }
                )
        return results


# ----------------------------------------------------------------------------
# PlatformEvent emission helpers — route activation outcomes through the
# canonical bus so every consumer (Stage Notifications, event store, webhook
# dispatchers, cluster federation) sees them without bespoke wiring.
# The helpers are module-level + synchronous-entrypoint so any call site in
# the activation service can fire them without plumbing an async emitter
# through the heavily-dependency-injected constructor.
# ----------------------------------------------------------------------------


def _emit_activation_started_platform_event(
    *,
    snapshot_id: int,
    snapshot_name: str,
    snapshot_revision: str | None,
    request_id: str,
    node_id: str,
    triggered_by: str,
) -> None:
    """Emit snapshot.activation.started through the PlatformEventBus.

    Silently swallows any bus failure (plan Q10 — best-effort).
    """
    context = {
        "snapshot_id": snapshot_id,
        "snapshot_name": snapshot_name,
        "snapshot_revision": snapshot_revision,
        "request_id": request_id,
        "node_id": node_id,
        "triggered_by": triggered_by,
    }
    title = f"Activation started: {snapshot_name}"[:40]
    message = (
        f"snapshot_id={snapshot_id} request_id={request_id} "
        f"triggered_by={triggered_by}"
    )[:200]
    _schedule_platform_event(
        kind="snapshot.activation.started",
        severity="info",
        title=title,
        message=message,
        context=context,
        source_node=node_id,
        priority=0.3,
    )


def _emit_activation_outcome_platform_event(
    *,
    snapshot_id: int,
    snapshot_revision: str | None,
    request_id: str,
    node_id: str,
    triggered_by: str,
    outcome: dict[str, Any],
) -> None:
    """Emit snapshot.activation.ok on success, snapshot.activation.failed on
    degraded. Silently swallows any bus failure (plan Q10)."""
    status = str(outcome.get("status") or "").lower()
    if status == "success":
        kind = "snapshot.activation.ok"
        severity = "info"
        priority = 0.3
    elif status == "degraded":
        kind = "snapshot.activation.failed"
        # Degraded means audio engine applied the snapshot but authority
        # confirmation did not complete — audio is live but the control
        # plane is out of sync. Surface at warning so operators notice
        # without treating as a full failure.
        severity = "warning"
        priority = 0.6
    else:
        # Unknown status — default to failed at warning so we don't lose
        # the event but don't over-alarm.
        kind = "snapshot.activation.failed"
        severity = "warning"
        priority = 0.5

    title = f"Activation {status}"[:40]
    message = str(outcome.get("operator_message") or outcome.get("result_code") or kind)[:200]
    context = {
        "snapshot_id": snapshot_id,
        "snapshot_revision": snapshot_revision,
        "request_id": request_id,
        "node_id": node_id,
        "triggered_by": triggered_by,
        "outcome": dict(outcome),
    }
    _schedule_platform_event(
        kind=kind,
        severity=severity,
        title=title,
        message=message,
        context=context,
        source_node=node_id,
        priority=priority,
    )


def _schedule_platform_event(
    *,
    kind: str,
    severity: str,
    title: str,
    message: str,
    context: dict[str, Any],
    source_node: str,
    priority: float,
) -> None:
    """Schedule a PlatformEvent emit on the running event loop.

    The activation service is async but `_log_activation_outcome` is a
    synchronous static method. We bridge by creating a background task on
    the running loop; if no loop is running (tests invoking this outside an
    async context) we fall through to a best-effort synchronous path. Any
    failure is silently swallowed at debug level (plan Q10).
    """
    try:
        from app.services.platform_event.bus import get_platform_event_bus
        from app.services.platform_event.envelope import PlatformEvent

        event = PlatformEvent(
            kind=kind,
            severity=severity,
            source_node=source_node or "local",
            source_service="state_authority_activation_service",
            title=title or kind[:40],
            message=message or kind,
            context=context,
            priority=max(0.0, min(1.0, priority)),
        )
        bus = get_platform_event_bus()
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            # No running loop — fire and forget on a new one.
            loop = None
        if loop is not None:
            loop.create_task(bus.emit(event))
    except Exception as exc:  # noqa: BLE001 — plan Q10: best-effort
        logger.debug("Activation PlatformEvent emission failed: %s", exc)
