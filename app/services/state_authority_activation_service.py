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
from typing import Any, Callable, Optional
from uuid import uuid4

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Chain, ChainPlugin, EffectsLoopInsertion, Snapshot
from app.services.snapshot_system_blocks import extract_chain_system_blocks

logger = logging.getLogger(__name__)


class StateAuthorityActivationService:
    """Owns snapshot activation orchestration for the State Authority cutover."""

    _activation_locks: dict[str, asyncio.Lock] = {}

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
        normalized = str(node_id or "").strip() or "LOCAL-NODE"
        lock = cls._activation_locks.get(normalized)
        if lock is None:
            lock = asyncio.Lock()
            cls._activation_locks[normalized] = lock
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

        try:
            applied = await engine.load_graph_document(
                copy.deepcopy(document),
                use_independent_crossfade=True,
                max_crossfade_ms=500,
            )
        except Exception as exc:
            logger.debug("Graph-document engine activation skipped for %s: %s", snapshot.id, exc)
            return None

        if not applied:
            return None

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
            }
        return {
            "status": "success",
            "result_code": "live_confirmed",
            "operator_message": "The audio engine applied this snapshot and authority confirmation completed.",
            "technical_detail": None,
        }

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

            loop_insertions = [
                {
                    key: self._canonicalize_json_value(value)
                    for key, value in sorted(loop.items())
                    if key not in (self._canonical_transient_keys | {"insertion_id"})
                }
                for loop in chain.get("loop_insertions", [])
                if isinstance(loop, dict)
            ]

            effects_loops = [
                {
                    key: self._canonicalize_json_value(loop.get(key))
                    for key in sorted(self._canonical_effects_loop_keys)
                    if key in loop
                }
                for loop in chain.get("effects_loops", [])
                if isinstance(loop, dict)
            ]

            canonical_chains.append(
                {
                    "plugins": plugins,
                    "loop_insertions": loop_insertions,
                    "effects_loops": effects_loops,
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
        intent = await runtime_state_service.mark_intent_phase(
            intent=intent,
            phase="VALIDATING",
            status="in_progress",
            note="Running activation preflight checks.",
        )

        detail = await self.owner.get_snapshot(snapshot_id)
        if detail is None:
            return None

        params_applied = 0
        bypass_applied = 0
        topology_reused = False
        graph_document_apply_result: dict[str, Any] | None = None
        audio_device_binding_result: dict[str, Any] | None = None
        monitoring_output_result: dict[str, Any] | None = None
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
            audio_device_binding_result = await self.owner._apply_snapshot_audio_device_bindings(detail)
            monitoring_output_result = await self.owner._apply_snapshot_monitoring_output_binding(detail)
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

            legacy_payload = self.owner.to_legacy_snapshot_data(refreshed_detail)
            intent = await runtime_state_service.mark_intent_phase(
                intent=intent,
                phase="APPLYING",
                status="in_progress",
                note="Applying snapshot runtime state to the engine.",
            )
            graph_document_apply_result = await self.apply_graph_document_to_engine(
                snapshot=snapshot,
                normalized=normalized,
            )
            if graph_document_apply_result is not None:
                params_applied = int(graph_document_apply_result.get("plugin_count") or 0)
                bypass_applied = int(graph_document_apply_result.get("bypass_count") or 0)
            else:
                params_applied, bypass_applied = await self.runtime_service_module.apply_snapshot_to_engine(
                    copy.deepcopy(legacy_payload)
                )
            activation_topology_metrics = self._build_activation_topology_metrics(
                activation_topology_metrics["before"],
                await self.get_audio_engine().get_topology_mutation_stats(),
            )
            intent = await runtime_state_service.mark_intent_phase(
                intent=intent,
                phase="APPLYING",
                status="completed",
                note="Engine apply finished.",
                extra={
                    "params_applied": params_applied,
                    "bypass_applied": bypass_applied,
                },
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
                    snapshot_data=copy.deepcopy(legacy_payload),
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
            try:
                routing_apply_result = await self.runtime_service_module.apply_snapshot_routing_to_engine(
                    refreshed_detail
                )
            except Exception as exc:
                logger.debug("Snapshot routing apply skipped for %s: %s", snapshot.id, exc)
                routing_apply_result = {
                    "applied": False,
                    "reason": f"apply_failed:{exc}",
                    "removed_group_count": 0,
                    "created_group_id": None,
                    "branch_count": 0,
                }
            try:
                loop_insertion_sync_result = await self.owner._sync_snapshot_loop_insertions_to_runtime(
                    refreshed_detail
                )
            except Exception as exc:
                logger.debug("Snapshot loop insertion sync skipped for %s: %s", snapshot.id, exc)
                loop_insertion_sync_result = {
                    "synced": False,
                    "reason": f"sync_failed:{exc}",
                    "chain_count": 0,
                    "applied_count": 0,
                }
            try:
                channel_state_sync_result = await self.owner._sync_snapshot_channel_state_to_runtime(
                    refreshed_detail
                )
            except Exception as exc:
                logger.debug("Snapshot channel-state sync skipped for %s: %s", snapshot.id, exc)
                channel_state_sync_result = {
                    "synced": False,
                    "reason": f"sync_failed:{exc}",
                    "channel_count": 0,
                    "applied_count": 0,
                }
            try:
                morph_apply_result = await self.runtime_service_module.apply_snapshot_morph_to_engine(
                    refreshed_detail
                )
            except Exception as exc:
                logger.debug("Snapshot morph apply skipped for %s: %s", snapshot.id, exc)
                morph_apply_result = {
                    "applied": False,
                    "reason": f"apply_failed:{exc}",
                    "plugin_count": 0,
                    "applied_count": 0,
                }
            try:
                midi_map_sync_result = await self.owner._sync_snapshot_midi_map_to_engine(
                    snapshot.id,
                    [
                        dict(entry)
                        for entry in refreshed_detail.get("controls", {}).get("midi_map", [])
                        if isinstance(entry, dict)
                    ],
                )
            except Exception as exc:
                logger.debug("Snapshot MIDI map sync skipped for %s: %s", snapshot.id, exc)
                midi_map_sync_result = {
                    "synced": False,
                    "reason": f"sync_failed:{exc}",
                    "global_command_count": 0,
                    "snapshot_command_count": 0,
                }
            try:
                expression_mapping_sync_result = await self.owner._sync_snapshot_expression_mappings_to_runtime(
                    [
                        dict(entry)
                        for entry in refreshed_detail.get("controls", {}).get("expression_mappings", [])
                        if isinstance(entry, dict)
                    ],
                )
            except Exception as exc:
                logger.debug("Snapshot expression mapping sync skipped for %s: %s", snapshot.id, exc)
                expression_mapping_sync_result = {
                    "synced": False,
                    "reason": f"sync_failed:{exc}",
                    "cleared_count": 0,
                    "applied_count": 0,
                    "active_snapshot_count": 0,
                }
            try:
                automation_lane_sync_result = await self.owner._sync_snapshot_automation_lanes_to_runtime(
                    [
                        dict(entry)
                        for entry in refreshed_detail.get("controls", {}).get("automation_lanes", [])
                        if isinstance(entry, dict)
                    ],
                )
            except Exception as exc:
                logger.debug("Snapshot automation lane sync skipped for %s: %s", snapshot.id, exc)
                automation_lane_sync_result = {
                    "synced": False,
                    "reason": f"sync_failed:{exc}",
                    "cleared_count": 0,
                    "applied_count": 0,
                    "invalid_count": 0,
                    "active_snapshot_count": 0,
                }
            brain_runtime_reconcile_result = await self.owner._reconcile_snapshot_brain_runtime_extensions(
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
                "output_safety": output_safety_result or {},
                "routing_apply": routing_apply_result or {},
                "loop_insertions": loop_insertion_sync_result or {},
                "channel_state": channel_state_sync_result or {},
                "morph_apply": morph_apply_result or {},
                "graph_document_apply": graph_document_apply_result or {},
                "snapshot_midi_map": midi_map_sync_result or {},
                "expression_mappings": expression_mapping_sync_result or {},
                "automation_lanes": automation_lane_sync_result or {},
                "performance_brain_runtime": brain_runtime_reconcile_result or {},
                "topology_mutation": activation_topology_metrics,
            }
            preload_plan = await self.owner.plan_preload_candidates_for_snapshot(snapshot.id, limit=3)
            runtime_metrics["preload_plan"] = preload_plan or {
                "source_snapshot_id": int(snapshot.id),
                "source_snapshot_name": str(snapshot.name or f"Snapshot {snapshot.id}"),
                "candidate_reason": None,
                "candidates": [],
            }
            intent = await runtime_state_service.mark_intent_phase(
                intent=intent,
                phase="VERIFYING",
                status="completed",
                note="Verification and sync steps completed.",
                extra={
                    "channel_activity": runtime_metrics["channel_activity"],
                    "graph_document_apply": runtime_metrics["graph_document_apply"],
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
            brain_runtime_reconcile_result["broadcast_count"] = await self.owner._broadcast_snapshot_brain_runtime_updates(
                brain_runtime_reconcile_result
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
            await ws_manager.broadcast_json(
                {
                    "type": "snapshot_loaded",
                    "topic": "snapshots",
                    "data": {
                        "snapshot_id": snapshot.id,
                        "snapshot_name": snapshot.name,
                        "snapshot_data": refreshed_detail,
                        "triggered_by": triggered_by,
                        "program_number": snapshot.program_number,
                    },
                    "timestamp": timestamp,
                },
                topic="snapshots",
            )
            await ws_manager.broadcast_json(
                {
                    "type": "flow_snapshot_loaded",
                    "topic": "flow_snapshots",
                    "data": {
                        "snapshot_id": snapshot.id,
                        "snapshot_name": snapshot.name,
                        "snapshot_data": self.owner.to_legacy_snapshot_data(refreshed_detail),
                        "triggered_by": triggered_by,
                        "program_number": snapshot.program_number,
                    },
                    "timestamp": timestamp,
                },
                topic="flow_snapshots",
            )
        except Exception as exc:
            logger.debug("Snapshot activation websocket broadcast failed: %s", exc)

        activation_result = self._activation_result_contract(live_runtime_state)

        return {
            "status": activation_result["status"],
            "result_code": activation_result["result_code"],
            "operator_message": activation_result["operator_message"],
            "technical_detail": activation_result["technical_detail"],
            "snapshot_id": snapshot.id,
            "name": snapshot.name,
            "snapshot_data": refreshed_detail,
            "snapshot_revision": snapshot_revision,
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
