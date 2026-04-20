"""Runtime and activation responsibilities for SnapshotService."""

from .common import *


class SnapshotRuntimeMixin:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.chain_service = ChainService(session)
        self.state_authority_documents = StateAuthorityDocumentService(
            session,
            normalize_controls_payload=self._normalize_controls_payload,
            normalize_detail_payload=self._normalize_detail_payload,
            safe_float=_safe_float,
            safe_int=_safe_int,
            default_snapshot_tempo_bpm=DEFAULT_SNAPSHOT_TEMPO_BPM,
        )
        self.state_authority_revisions = StateAuthorityRevisionService(
            session,
            document_service=self.state_authority_documents,
            get_snapshot_model=self._get_snapshot_model,
            update_snapshot=self.update_snapshot,
            normalize_detail_payload=self._normalize_detail_payload,
            safe_float=_safe_float,
            default_snapshot_tempo_bpm=DEFAULT_SNAPSHOT_TEMPO_BPM,
            utcnow=_utcnow,
            max_snapshot_revisions=MAX_SNAPSHOT_REVISIONS,
            unset=UNSET,
        )
        self.state_authority_activation = StateAuthorityActivationService(
            session,
            owner=self,
            chain_service=self.chain_service,
            runtime_service_module=snapshot_runtime_service,
            midi_service=midi_service,
            get_audio_engine=get_audio_engine,
            push_snapshot_footswitch_labels=push_snapshot_footswitch_labels,
            push_snapshot_maschine_assignments=push_snapshot_maschine_assignments,
            push_snapshot_push_surface_state=push_snapshot_push_surface_state,
            push_snapshot_ground_control_pro_assignments=push_snapshot_ground_control_pro_assignments,
            push_snapshot_mcu_surface_state=push_snapshot_mcu_surface_state,
            push_snapshot_launch_control_assignments=push_snapshot_launch_control_assignments,
            push_snapshot_midi_commander_assignments=push_snapshot_midi_commander_assignments,
            push_snapshot_controller_display_preview=push_snapshot_controller_display_preview,
            schedule_snapshot_preload_for_live_snapshot=schedule_snapshot_preload_for_live_snapshot,
            get_activation_hook_plan=self.get_activation_hook_plan,
            build_snapshot_controller_display_preview=build_snapshot_controller_display_preview,
            utcnow=_utcnow,
            safe_int=_safe_int,
            safe_float=_safe_float,
            normalize_topology_mutation_stats=_normalize_topology_mutation_stats,
            build_activation_topology_metrics=_build_activation_topology_metrics,
            snapshot_spillover_native_uris=_SNAPSHOT_SPILLOVER_NATIVE_URIS,
            canonical_transient_keys=_CANONICAL_TRANSIENT_KEYS,
            canonical_effects_loop_keys=_CANONICAL_EFFECTS_LOOP_KEYS,
        )

    async def list_snapshots(
        self,
        *,
        include_shared_only: bool = False,
        tags: Optional[Iterable[str]] = None,
        document_type: str = "snapshot",
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        index_stmt = (
            select(Snapshot.id, Snapshot.tags, Snapshot.document)
            .order_by(Snapshot.is_favorite.desc(), Snapshot.display_order.asc(), Snapshot.created_at.asc())
        )
        if include_shared_only:
            index_stmt = index_stmt.where(Snapshot.community_shared.is_(True))

        index_rows = (await self.session.execute(index_stmt)).all()
        live_snapshot_id: int | None = None
        live_activated_at: str | None = None
        try:
            from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

            runtime_state = await SnapshotRuntimeStateService(self.session).get_live_state()
            runtime_payload = runtime_state.get("live_snapshot_payload")
            if (
                runtime_state.get("state") == "live"
                and runtime_state.get("snapshot_id") is not None
                and isinstance(runtime_payload, dict)
            ):
                live_snapshot_id = int(runtime_state["snapshot_id"])
                live_state_payload = runtime_payload.get("live_state")
                if isinstance(live_state_payload, dict):
                    live_activated_at = str(
                        live_state_payload.get("activated_at") or runtime_state.get("emitted_at") or ""
                    ).strip() or None
                else:
                    live_activated_at = str(runtime_state.get("emitted_at") or "").strip() or None
        except Exception as exc:
            logger.debug("Snapshot list runtime-state lookup skipped: %s", exc)

        normalized_document_type = str(document_type or "snapshot").strip().lower()
        tag_set = {str(tag).strip().lower() for tag in (tags or []) if str(tag).strip()}
        filtered_snapshot_ids: list[int] = []
        for snapshot_id, snapshot_tags, snapshot_document in index_rows:
            snapshot_type = self._snapshot_document_type_from_document(snapshot_document)
            if normalized_document_type == "template" and snapshot_type != "template":
                continue
            if normalized_document_type not in {"all", "template"} and snapshot_type == "template":
                continue
            normalized_tags = {str(tag).strip().lower() for tag in (snapshot_tags or []) if str(tag).strip()}
            if tag_set and not tag_set.issubset(normalized_tags):
                continue
            filtered_snapshot_ids.append(int(snapshot_id))

        bounded_offset = max(0, int(offset or 0))
        paged_snapshot_ids = filtered_snapshot_ids[bounded_offset:]
        if limit is not None:
            paged_snapshot_ids = paged_snapshot_ids[: max(0, int(limit))]
        if not paged_snapshot_ids:
            return []

        snapshot_stmt = (
            select(Snapshot)
            .options(selectinload(Snapshot.channels), selectinload(Snapshot.chains))
            .where(Snapshot.id.in_(paged_snapshot_ids))
        )
        snapshots = (await self.session.execute(snapshot_stmt)).scalars().all()
        snapshots_by_id = {int(snapshot.id): snapshot for snapshot in snapshots}
        ordered_snapshots = [snapshots_by_id[snapshot_id] for snapshot_id in paged_snapshot_ids if snapshot_id in snapshots_by_id]
        return [
            self._serialize_snapshot_summary(
                snapshot,
                live_snapshot_id=live_snapshot_id,
                live_activated_at=live_activated_at,
            )
            for snapshot in ordered_snapshots
        ]

    async def list_templates(
        self,
        *,
        include_shared_only: bool = False,
        tags: Optional[Iterable[str]] = None,
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        return await self.list_snapshots(
            include_shared_only=include_shared_only,
            tags=tags,
            document_type="template",
            limit=limit,
            offset=offset,
        )

    async def list_snapshot_tags(
        self,
        *,
        include_shared_only: bool = False,
        document_type: str = "snapshot",
    ) -> list[str]:
        stmt = select(Snapshot.tags, Snapshot.document)
        if include_shared_only:
            stmt = stmt.where(Snapshot.community_shared.is_(True))
        rows = (await self.session.execute(stmt)).all()
        normalized_document_type = str(document_type or "snapshot").strip().lower()
        available_tags: set[str] = set()
        for snapshot_tags, snapshot_document in rows:
            snapshot_type = self._snapshot_document_type_from_document(snapshot_document)
            if normalized_document_type == "template" and snapshot_type != "template":
                continue
            if normalized_document_type not in {"all", "template"} and snapshot_type == "template":
                continue
            for tag in snapshot_tags or []:
                normalized_tag = str(tag).strip()
                if normalized_tag:
                    available_tags.add(normalized_tag)
        return sorted(available_tags)

    @staticmethod
    def _extract_preload_state(runtime_metrics: Any) -> dict[str, Any]:
        if not isinstance(runtime_metrics, dict):
            return {}
        preload = runtime_metrics.get("preload")
        return dict(preload) if isinstance(preload, dict) else {}

    async def _sync_live_snapshot_preload_state(
        self,
        *,
        runtime_state_service: Any,
        live_state: dict[str, Any],
        preload_state: dict[str, Any],
    ) -> Optional[dict[str, Any]]:
        live_payload = live_state.get("live_snapshot_payload")
        snapshot_id = _safe_int(live_state.get("snapshot_id"))
        if snapshot_id is None or not isinstance(live_payload, dict):
            return None

        runtime_metrics = (
            copy.deepcopy(live_state.get("runtime_metrics"))
            if isinstance(live_state.get("runtime_metrics"), dict)
            else {}
        )
        runtime_metrics["preload"] = copy.deepcopy(preload_state)
        return await runtime_state_service.sync_live_snapshot_payload(
            snapshot_id=snapshot_id,
            live_snapshot_payload=copy.deepcopy(live_payload),
            snapshot_revision=live_state.get("snapshot_revision"),
            runtime_metrics=runtime_metrics,
        )

    async def _record_retained_live_runtime_edit(
        self,
        *,
        runtime_state_service: Any,
        snapshot_id: int,
        snapshot_revision: Any,
        mutation_kind: str,
        metadata: Optional[dict[str, Any]] = None,
    ) -> Optional[dict[str, Any]]:
        revision = str(snapshot_revision).strip() if isinstance(snapshot_revision, str) and snapshot_revision.strip() else None
        return await runtime_state_service.record_retained_runtime_edit(
            snapshot_id=snapshot_id,
            snapshot_revision=revision,
            mutation_kind=mutation_kind,
            triggered_by=f"snapshot_service.{mutation_kind}",
            metadata=metadata,
        )

    async def _load_current_audio_state_extensions(self) -> dict[str, Any]:
        try:
            from app.services.audio_state_authority import AudioStateAuthorityError, AudioStateAuthorityService
            from app.services.audio_state_snapshot_compiler import merge_audio_state_extensions

            authority = AudioStateAuthorityService()
            preserved_extensions: dict[str, Any] = {}
            try:
                committed = await authority.get_committed_state()
                preserved_extensions = merge_audio_state_extensions(
                    preserved_extensions,
                    committed.value.desired.extensions,
                    committed.value.extensions,
                )
            except AudioStateAuthorityError as exc:
                if "No committed authoritative audio state exists" not in str(exc):
                    raise
            try:
                desired = await authority.get_desired_state()
                preserved_extensions = merge_audio_state_extensions(
                    preserved_extensions,
                    desired.value.extensions,
                )
            except AudioStateAuthorityError as exc:
                if "No desired audio state exists" not in str(exc):
                    raise
            return preserved_extensions
        except Exception as exc:
            logger.debug("Snapshot authority extension load skipped: %s", exc)
            return {}

    async def _resolve_snapshot_persisted_extensions(
        self,
        detail_payload: dict[str, Any] | None,
        *,
        capture_current_authority_extensions: bool,
    ) -> dict[str, Any]:
        from app.services.audio_state_snapshot_compiler import merge_audio_state_extensions

        explicit_extensions = detail_payload.get("extensions") if isinstance(detail_payload, dict) else None
        if isinstance(explicit_extensions, dict):
            return merge_audio_state_extensions(explicit_extensions)
        if not capture_current_authority_extensions:
            return {}
        return await self._load_current_audio_state_extensions()

    async def _publish_snapshot_desired_state(self, detail: dict[str, Any]) -> None:
        if not isinstance(detail.get("revision_number"), int):
            logger.debug(
                "Snapshot desired-state publish skipped for %s: missing saved revision",
                detail.get("id"),
            )
            return
        try:
            from app.services.audio_state_authority import AudioStateAuthorityService
            from app.services.audio_state_snapshot_compiler import (
                compile_snapshot_detail_to_intent,
                overlay_audio_state_extensions,
            )

            authority = AudioStateAuthorityService()
            preserved_extensions = await self._load_current_audio_state_extensions()

            await authority.put_desired_state(
                compile_snapshot_detail_to_intent(
                    detail,
                    extensions=overlay_audio_state_extensions(
                        preserved_extensions,
                        detail.get("extensions") if isinstance(detail.get("extensions"), dict) else None,
                    ),
                )
            )
        except Exception as exc:
            logger.debug(
                "Snapshot desired-state publish skipped for %s: %s",
                detail.get("id"),
                exc,
            )

    async def _publish_confirmed_live_state_to_audio_authority(
        self,
        detail: dict[str, Any],
        *,
        runtime_live_state: dict[str, Any] | None = None,
        leader_epoch: int = 1,
    ) -> dict[str, Any]:
        checked_at = _utcnow().isoformat()
        desired_published = False
        committed_published = False
        observation_published = False
        reconciled = False
        state_version: int | None = None
        authority_node_id = str((runtime_live_state or {}).get("node_id") or "").strip() or None
        runtime_live_confirmed_at = str((runtime_live_state or {}).get("emitted_at") or checked_at)
        publication_steps = [
            {"step": "runtime_live_confirmed", "status": "completed", "at": runtime_live_confirmed_at},
            {"step": "publish_desired", "status": "pending", "at": None},
            {"step": "publish_committed", "status": "pending", "at": None},
            {"step": "publish_observation", "status": "pending", "at": None},
            {"step": "reconcile_committed", "status": "pending", "at": None},
        ]
        publication_steps_by_name = {entry["step"]: entry for entry in publication_steps}
        current_step = "publish_desired"

        def _mark_publication_step(step: str, status: str, *, at: str | None = None, detail: str | None = None) -> None:
            entry = publication_steps_by_name[step]
            entry["status"] = status
            entry["at"] = at if at is not None else (str(_utcnow().isoformat()) if status != "pending" else None)
            if detail:
                entry["detail"] = detail
            else:
                entry.pop("detail", None)

        def _mark_remaining_publication_steps(status: str, *, detail: str | None = None) -> None:
            for entry in publication_steps:
                if entry["status"] == "pending":
                    _mark_publication_step(str(entry["step"]), status, at=None, detail=detail)

        if not isinstance(detail.get("revision_number"), int):
            missing_detail = "Snapshot has no saved revision number; authority confirmation requires a saved draft."
            _mark_publication_step("publish_desired", "failed", detail=missing_detail)
            _mark_remaining_publication_steps("not_run", detail=missing_detail)
            logger.debug(
                "Snapshot live-state authority confirm skipped for %s: %s",
                detail.get("id"),
                missing_detail,
            )
            return {
                "status": "failed",
                "reason": "missing_snapshot_revision",
                "checked_at": checked_at,
                "node_id": authority_node_id,
                "published_desired": desired_published,
                "published_committed": committed_published,
                "published_observation": observation_published,
                "reconciled": reconciled,
                "state_version": state_version,
                "publication_steps": publication_steps,
                "operator_message": (
                    "The audio engine applied this snapshot, but MAP2 could not confirm it until the snapshot was saved as a revision."
                ),
                "technical_detail": missing_detail,
            }

        try:
            from app.models.audio_state import (
                AudioStateEngineSummary,
                AudioStateObservation,
                AudioStatePathStatus,
            )
            from app.services.audio_state_authority import AudioStateAuthorityService
            from app.services.audio_state_snapshot_compiler import (
                build_initial_authoritative_audio_state,
                compile_snapshot_detail_to_intent,
                overlay_audio_state_extensions,
            )
            from app.services.snapshot_runtime_state_service import resolve_local_node_id

            authority = AudioStateAuthorityService()
            preserved_extensions = await self._load_current_audio_state_extensions()
            snapshot_extensions = detail.get("extensions") if isinstance(detail.get("extensions"), dict) else None
            merged_extensions = overlay_audio_state_extensions(
                preserved_extensions,
                snapshot_extensions,
            )

            desired_state = compile_snapshot_detail_to_intent(
                detail,
                extensions=merged_extensions,
            )
            await authority.put_desired_state(desired_state)
            desired_published = True
            _mark_publication_step("publish_desired", "completed")
            result = {
                "status": "confirmed",
                "reason": "confirmed",
                "checked_at": checked_at,
                "node_id": authority_node_id,
                "published_desired": desired_published,
                "published_committed": committed_published,
                "published_observation": observation_published,
                "reconciled": reconciled,
                "state_version": state_version,
                "publication_steps": publication_steps,
                "operator_message": "Runtime live state and control-plane authority are aligned.",
                "technical_detail": None,
            }

            required_methods = (
                "next_state_version",
                "put_committed_state",
                "put_observation",
                "reconcile_committed_state",
            )
            missing_methods = [method_name for method_name in required_methods if not hasattr(authority, method_name)]
            if missing_methods:
                missing_detail = f"Authority backend missing methods: {', '.join(missing_methods)}"
                _mark_publication_step("publish_committed", "unavailable", detail=missing_detail)
                _mark_publication_step("publish_observation", "unavailable", detail=missing_detail)
                _mark_publication_step("reconcile_committed", "unavailable", detail=missing_detail)
                result["status"] = "failed"
                result["reason"] = "authority_confirmation_unavailable"
                result["operator_message"] = (
                    "Desired state was refreshed, but committed and observed authority confirmation is unavailable."
                )
                result["technical_detail"] = missing_detail
                return result

            node_id = str(
                (runtime_live_state or {}).get("node_id")
                or resolve_local_node_id()
            ).strip() or resolve_local_node_id()
            authority_node_id = node_id
            result["node_id"] = authority_node_id
            current_step = "publish_committed"
            state_version = await authority.next_state_version()
            committed_state = build_initial_authoritative_audio_state(
                detail,
                origin_node_id=node_id,
                state_version=state_version,
                leader_epoch=leader_epoch,
                extensions=merged_extensions,
            )
            committed_envelope = await authority.put_committed_state(committed_state)
            committed_published = True
            state_version = committed_envelope.value.state_version
            _mark_publication_step("publish_committed", "completed")
            result["published_committed"] = committed_published
            result["state_version"] = state_version

            runtime_payload = (
                runtime_live_state.get("live_snapshot_payload")
                if isinstance(runtime_live_state, dict) and isinstance(runtime_live_state.get("live_snapshot_payload"), dict)
                else detail
            )
            runtime_live_state_paths = (
                runtime_payload.get("live_state", {}).get("paths")
                if isinstance(runtime_payload, dict)
                and isinstance(runtime_payload.get("live_state"), dict)
                and isinstance(runtime_payload.get("live_state", {}).get("paths"), list)
                else []
            )
            runtime_path_chain_ids = {
                str(path.get("path_id") or "").strip(): path
                for path in runtime_live_state_paths
                if isinstance(path, dict) and str(path.get("path_id") or "").strip()
            }
            runtime_metrics = (
                copy.deepcopy(runtime_live_state.get("runtime_metrics"))
                if isinstance(runtime_live_state, dict) and isinstance(runtime_live_state.get("runtime_metrics"), dict)
                else {}
            )
            io_bindings = detail.get("io_bindings") if isinstance(detail.get("io_bindings"), dict) else {}
            observed_at = str(
                (runtime_live_state or {}).get("emitted_at")
                or _utcnow().isoformat()
            )
            observation = AudioStateObservation(
                node_id=node_id,
                observed_state_version=committed_envelope.value.state_version,
                applied=True,
                effective_input_device=(
                    io_bindings.get("input_device")
                    if isinstance(io_bindings.get("input_device"), str)
                    else None
                ),
                effective_output_device=(
                    io_bindings.get("output_device")
                    if isinstance(io_bindings.get("output_device"), str)
                    else None
                ),
                runtime_paths=[
                    path.model_copy(
                        update={
                            "status": AudioStatePathStatus.ACTIVE,
                            "status_reason": None,
                            "owner_node_id": node_id,
                            "runtime_chain_id": (
                                runtime_path_chain_ids.get(path.path_id, {}).get("runtime_chain_id")
                                if isinstance(runtime_path_chain_ids.get(path.path_id), dict)
                                else path.runtime_chain_id
                            ) or path.runtime_chain_id,
                        }
                    )
                    for path in committed_envelope.value.paths
                ],
                engine=AudioStateEngineSummary(
                    display_state="live",
                    is_warning=False,
                    is_offline=False,
                ),
                runtime_metrics=runtime_metrics,
                observed_at=observed_at,
                extensions=copy.deepcopy(merged_extensions),
            )
            current_step = "publish_observation"
            await authority.put_observation(observation)
            observation_published = True
            _mark_publication_step("publish_observation", "completed", at=observed_at)
            result["published_observation"] = observation_published
            current_step = "reconcile_committed"
            await authority.reconcile_committed_state()
            reconciled = True
            _mark_publication_step("reconcile_committed", "completed")
            result["reconciled"] = reconciled
            return result
        except Exception as exc:
            if current_step in publication_steps_by_name and publication_steps_by_name[current_step]["status"] == "pending":
                _mark_publication_step(current_step, "failed", detail=str(exc))
            _mark_remaining_publication_steps("not_run")
            logger.debug(
                "Snapshot live-state authority confirm skipped for %s: %s",
                detail.get("id"),
                exc,
            )
            return {
                "status": "failed",
                "reason": "authority_confirmation_failed",
                "checked_at": checked_at,
                "node_id": authority_node_id,
                "published_desired": desired_published,
                "published_committed": committed_published,
                "published_observation": observation_published,
                "reconciled": reconciled,
                "state_version": state_version,
                "publication_steps": publication_steps,
                "operator_message": (
                    "The audio engine applied this snapshot, but control-plane authority confirmation did not complete."
                ),
                "technical_detail": str(exc),
            }

    async def _reconcile_snapshot_brain_runtime_extensions(
        self,
        *,
        current_extensions: dict[str, Any] | None,
        snapshot_extensions: dict[str, Any] | None,
    ) -> dict[str, Any]:
        try:
            from app.services.performance_brain_authority_sync import PerformanceBrainAuthoritySyncService

            reconcile_result = PerformanceBrainAuthoritySyncService().reconcile_runtime_with_extensions(
                current_extensions=current_extensions,
                next_extensions=snapshot_extensions,
            )
            return {
                "reconciled": bool(reconcile_result.get("reconciled", False)),
                "reason": reconcile_result.get("reason") or "snapshot_brain_namespace_applied",
                "restored": [dict(item) for item in reconcile_result.get("restored", []) if isinstance(item, dict)],
                "reset": [dict(item) for item in reconcile_result.get("reset", []) if isinstance(item, dict)],
                "broadcast_count": 0,
            }
        except Exception as exc:
            logger.debug("Snapshot Brain runtime reconcile skipped: %s", exc)
            return {
                "reconciled": False,
                "reason": f"reconcile_failed:{exc}",
                "restored": [],
                "reset": [],
                "broadcast_count": 0,
            }

    async def _broadcast_snapshot_brain_runtime_updates(self, reconcile_result: dict[str, Any]) -> int:
        if not bool(reconcile_result.get("reconciled", False)):
            return 0

        try:
            from app.services.performance_brain_service import BRAIN_RUNTIME_TOPIC, get_performance_brain_service
            from app.services.websocket_manager import ws_manager

            brain_service = get_performance_brain_service()
            timestamp = _utcnow().isoformat()
            broadcast_count = 0
            for entry in [
                *[item for item in reconcile_result.get("restored", []) if isinstance(item, dict)],
                *[item for item in reconcile_result.get("reset", []) if isinstance(item, dict)],
            ]:
                payload = brain_service.get_runtime_event(
                    "state",
                    instance_id=entry.get("instance_id"),
                    plugin_position=entry.get("plugin_position"),
                )
                await ws_manager.broadcast_json(
                    {
                        "type": "brain_runtime_update",
                        "topic": BRAIN_RUNTIME_TOPIC,
                        "data": payload,
                        "timestamp": timestamp,
                    },
                    topic=BRAIN_RUNTIME_TOPIC,
                )
                broadcast_count += 1
            return broadcast_count
        except Exception as exc:
            logger.debug("Snapshot Brain runtime broadcast skipped: %s", exc)
            return 0

    async def _resolve_next_preload_snapshot(
        self,
        current_snapshot: Snapshot,
    ) -> tuple[Optional[Snapshot], Optional[str]]:
        candidates, reason = await self._resolve_preload_candidate_snapshots(current_snapshot, limit=1)
        return (candidates[0], reason) if candidates else (None, None)

    async def _resolve_preload_candidate_snapshots(
        self,
        current_snapshot: Snapshot,
        *,
        limit: int = 3,
    ) -> tuple[list[Snapshot], Optional[str]]:
        bounded_limit = max(1, int(limit))
        current_program_number = (
            int(current_snapshot.program_number)
            if current_snapshot.program_number is not None
            else None
        )
        if current_program_number is not None:
            result = await self.session.execute(
                select(Snapshot)
                .where(
                    Snapshot.id != current_snapshot.id,
                    Snapshot.program_number.is_not(None),
                )
                .order_by(Snapshot.program_number.asc(), Snapshot.created_at.asc(), Snapshot.id.asc())
            )
            candidates = result.scalars().all()
            if candidates:
                ordered: list[Snapshot] = []
                for candidate in candidates:
                    if candidate.program_number is not None and int(candidate.program_number) > current_program_number:
                        ordered.append(candidate)
                ordered.extend(candidate for candidate in candidates if candidate not in ordered)
                return ordered[:bounded_limit], "program_number"

        current_display_order = int(current_snapshot.display_order or 0)
        result = await self.session.execute(
            select(Snapshot)
            .where(Snapshot.id != current_snapshot.id)
            .order_by(Snapshot.display_order.asc(), Snapshot.created_at.asc(), Snapshot.id.asc())
        )
        candidates = result.scalars().all()
        if not candidates:
            return [], None
        ordered = [
            candidate
            for candidate in candidates
            if int(candidate.display_order or 0) > current_display_order
        ]
        ordered.extend(candidate for candidate in candidates if candidate not in ordered)
        return ordered[:bounded_limit], "display_order"

    async def plan_preload_candidates_for_snapshot(
        self,
        snapshot_id: int,
        *,
        limit: int = 3,
    ) -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None
        candidates, reason = await self._resolve_preload_candidate_snapshots(snapshot, limit=limit)
        return {
            "source_snapshot_id": int(snapshot.id),
            "source_snapshot_name": str(snapshot.name or f"Snapshot {snapshot.id}"),
            "candidate_reason": reason,
            "candidates": [
                {
                    "snapshot_id": int(candidate.id),
                    "snapshot_name": str(candidate.name or f"Snapshot {candidate.id}"),
                    "program_number": int(candidate.program_number) if candidate.program_number is not None else None,
                    "display_order": int(candidate.display_order or 0),
                }
                for candidate in candidates
            ],
        }

    async def get_activation_hook_plan(self) -> list[str]:
        default_hooks = [
            "push_footswitch_labels",
            "push_maschine_assignments",
            "push_push_surface_state",
            "push_ground_control_pro_assignments",
            "push_mcu_surface_state",
            "push_launch_control_assignments",
            "push_midi_commander_assignments",
            "push_controller_display_preview",
            "schedule_preload",
        ]
        raw_value = await get_or_create_system_config(
            self.session,
            "state_authority.activation_hooks",
            default_value=json.dumps(default_hooks),
        )
        try:
            parsed = json.loads(raw_value or "[]")
        except Exception:
            parsed = default_hooks
        hooks = [
            str(item).strip()
            for item in parsed
            if isinstance(item, str) and str(item).strip()
        ]
        hooks = hooks or list(default_hooks)
        def _ensure_hook_after(hook_name: str, anchor_name: str | None) -> None:
            if hook_name in hooks:
                return
            if anchor_name and anchor_name in hooks:
                hooks.insert(hooks.index(anchor_name) + 1, hook_name)
                return
            hooks.insert(0, hook_name)

        _ensure_hook_after("push_maschine_assignments", "push_footswitch_labels")
        _ensure_hook_after("push_push_surface_state", "push_maschine_assignments")
        _ensure_hook_after("push_ground_control_pro_assignments", "push_push_surface_state")
        _ensure_hook_after("push_mcu_surface_state", "push_ground_control_pro_assignments")
        _ensure_hook_after("push_launch_control_assignments", "push_mcu_surface_state")
        _ensure_hook_after("push_midi_commander_assignments", "push_launch_control_assignments")
        return hooks

    def _snapshot_preload_stage_plugins(self, snapshot: Snapshot) -> list[Any]:
        chain_by_id = {chain.id: chain for chain in snapshot.chains}
        stage_plugins: list[Any] = []
        for channel in sorted(snapshot.channels, key=lambda item: int(item.order_index)):
            source_chain = chain_by_id.get(channel.chain_id) if channel.chain_id is not None else None
            if source_chain is None:
                continue
            for plugin in sorted(source_chain.plugins, key=lambda item: int(item.position)):
                loader_state = dict(plugin.loader_state or {}) if isinstance(plugin.loader_state, dict) else {}
                stage_plugins.append(
                    ChainService.build_detached_stage_plugin(
                        plugin_uri=str(plugin.plugin_uri or ""),
                        position=int(plugin.position or 0),
                        bypass=bool(plugin.bypass),
                        loader_state=loader_state,
                    )
                )
        return stage_plugins

    async def preload_next_snapshot_for_live_snapshot(self, live_snapshot_id: int) -> Optional[dict[str, Any]]:
        from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

        runtime_state_service = SnapshotRuntimeStateService(self.session)
        live_state = await runtime_state_service.get_live_state()
        if str(live_state.get("state") or "").lower() != "live":
            return None
        if _safe_int(live_state.get("snapshot_id")) != int(live_snapshot_id):
            return None

        current_snapshot = await self._get_snapshot_model(live_snapshot_id)
        if current_snapshot is None:
            return None

        existing_preload = self._extract_preload_state(live_state.get("runtime_metrics"))
        existing_target_snapshot_id = _safe_int(existing_preload.get("target_snapshot_id"))
        existing_instance_ids = [
            int(instance_id)
            for instance_id in existing_preload.get("staged_instance_ids", [])
            if _safe_int(instance_id) is not None
        ]

        next_snapshot, reason = await self._resolve_next_preload_snapshot(current_snapshot)
        if next_snapshot is None:
            if existing_instance_ids:
                await self.chain_service.release_detached_instance_ids(existing_instance_ids)
            preload_state = {
                "status": "idle",
                "source_snapshot_id": int(live_snapshot_id),
                "target_snapshot_id": None,
                "target_snapshot_name": None,
                "candidate_reason": None,
                "staged_instance_ids": [],
                "warnings": [],
                "prepared_at": None,
            }
            await self._sync_live_snapshot_preload_state(
                runtime_state_service=runtime_state_service,
                live_state=live_state,
                preload_state=preload_state,
            )
            return preload_state

        if existing_target_snapshot_id == int(next_snapshot.id) and existing_instance_ids:
            return existing_preload

        if existing_instance_ids:
            await self.chain_service.release_detached_instance_ids(existing_instance_ids)

        warming_state = {
            "status": "warming",
            "source_snapshot_id": int(live_snapshot_id),
            "target_snapshot_id": int(next_snapshot.id),
            "target_snapshot_name": str(next_snapshot.name or f"Snapshot {next_snapshot.id}"),
            "candidate_reason": reason,
            "staged_instance_ids": [],
            "warnings": [],
            "prepared_at": None,
        }
        await self._sync_live_snapshot_preload_state(
            runtime_state_service=runtime_state_service,
            live_state=live_state,
            preload_state=warming_state,
        )

        next_snapshot = await self._get_snapshot_model(next_snapshot.id)
        if next_snapshot is None:
            return None

        stage_plugins = self._snapshot_preload_stage_plugins(next_snapshot)
        staged = await self.chain_service.stage_detached_chain_plugins(stage_plugins)
        staged_instance_ids = [
            int(instance_id)
            for instance_id in staged.get("staged_instance_ids", [])
            if _safe_int(instance_id) is not None
        ]

        refreshed_live_state = await runtime_state_service.get_live_state()
        if (
            str(refreshed_live_state.get("state") or "").lower() != "live"
            or _safe_int(refreshed_live_state.get("snapshot_id")) != int(live_snapshot_id)
        ):
            if staged_instance_ids:
                await self.chain_service.release_detached_instance_ids(staged_instance_ids)
            return None

        ready_state = {
            "status": staged.get("status", "ready"),
            "source_snapshot_id": int(live_snapshot_id),
            "target_snapshot_id": int(next_snapshot.id),
            "target_snapshot_name": str(next_snapshot.name or f"Snapshot {next_snapshot.id}"),
            "candidate_reason": reason,
            "staged_instance_ids": staged_instance_ids,
            "warnings": list(staged.get("warnings") or []),
            "prepared_at": _utcnow().isoformat(),
        }
        await self._sync_live_snapshot_preload_state(
            runtime_state_service=runtime_state_service,
            live_state=refreshed_live_state,
            preload_state=ready_state,
        )
        return ready_state

    def _derive_snapshot_tags_from_plugins(self, plugins: Iterable[dict[str, Any]]) -> list[str]:
        haystacks = [
            _plugin_tag_haystack(
                plugin.get("uri"),
                plugin.get("name"),
                plugin.get("loader_state") if isinstance(plugin.get("loader_state"), dict) else {},
            )
            for plugin in plugins
        ]
        return [
            tag
            for tag, patterns in SNAPSHOT_AUTO_TAG_RULES
            if any(haystack and any(pattern in haystack for pattern in patterns) for haystack in haystacks)
        ]

    def _derive_snapshot_tags_from_normalized(self, normalized: dict[str, Any]) -> list[str]:
        plugins: list[dict[str, Any]] = []
        for chain in normalized.get("chains", []):
            if isinstance(chain, dict):
                plugins.extend(
                    plugin for plugin in chain.get("plugins", []) or []
                    if isinstance(plugin, dict)
                )
        return self._derive_snapshot_tags_from_plugins(plugins)

    def _derive_snapshot_tags_from_snapshot(self, snapshot: Snapshot) -> list[str]:
        plugins = [
            {
                "uri": plugin.plugin_uri,
                "name": plugin.plugin_name,
                "loader_state": dict(plugin.loader_state or {}),
            }
            for chain in snapshot.chains
            for plugin in sorted(chain.plugins, key=lambda item: int(item.position))
        ]
        return self._derive_snapshot_tags_from_plugins(plugins)

    async def _sync_snapshot_tags(self, snapshot_id: int) -> None:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return
        snapshot.tags = self._derive_snapshot_tags_from_snapshot(snapshot)
        await self.session.flush()

    @staticmethod
    def _snapshot_chain_plugin_is_system_noise_gate(plugin: SnapshotChainPlugin) -> bool:
        return is_system_noise_gate_loader_state(plugin.loader_state)

    def _apply_default_system_blocks_to_normalized(
        self,
        normalized: dict[str, Any],
        *,
        apply_defaults: bool,
    ) -> dict[str, Any]:
        next_normalized = copy.deepcopy(normalized)
        next_chains: list[dict[str, Any]] = []
        for chain in next_normalized.get("chains", []):
            if not isinstance(chain, dict):
                continue
            next_chain = dict(chain)
            next_chain["plugins"] = ensure_system_noise_gate_at_chain_head(
                [
                    dict(plugin)
                    for plugin in (chain.get("plugins") or [])
                    if isinstance(plugin, dict)
                ],
                apply_defaults=apply_defaults,
            )
            next_chains.append(next_chain)
        next_normalized["chains"] = next_chains
        return next_normalized

    @staticmethod
    def _collect_device_name_candidates(value: Any) -> set[str]:
        names: set[str] = set()
        if isinstance(value, str):
            trimmed = value.strip()
            if trimmed:
                names.add(trimmed)
            return names
        if isinstance(value, dict):
            for key in (
                "name",
                "device",
                "device_name",
                "audio_device",
                "alsa_device",
                "input_device",
                "output_device",
            ):
                names.update(SnapshotRuntimeMixin._collect_device_name_candidates(value.get(key)))
            return names
        if isinstance(value, (list, tuple, set)):
            for item in value:
                names.update(SnapshotRuntimeMixin._collect_device_name_candidates(item))
        return names

    def _get_audio_device_inventory(self) -> dict[str, Any]:
        try:
            from app.services.engine_runtime_facade import get_engine_service

            service = get_engine_service()
        except Exception:
            return {
                "current_aliases": set(),
                "input_names": set(),
                "output_names": set(),
                "has_explicit_input_inventory": False,
                "has_explicit_output_inventory": False,
            }

        if service is None or not getattr(service, "is_available", False):
            return {
                "current_aliases": set(),
                "input_names": set(),
                "output_names": set(),
                "has_explicit_input_inventory": False,
                "has_explicit_output_inventory": False,
            }

        try:
            info = dict(service.get_system_info() or {})
        except Exception:
            info = {}

        current_aliases: set[str] = set()
        for key in ("audio_device", "alsa_device", "input_device", "output_device", "device"):
            current_aliases.update(self._collect_device_name_candidates(info.get(key)))

        explicit_input_names: set[str] = set()
        for key in (
            "available_input_devices",
            "input_devices",
            "input_device_names",
            "inputs",
            "input_ports",
            "audio_inputs",
        ):
            explicit_input_names.update(self._collect_device_name_candidates(info.get(key)))

        explicit_output_names: set[str] = set()
        for key in (
            "available_output_devices",
            "output_devices",
            "output_device_names",
            "outputs",
            "output_ports",
            "audio_outputs",
        ):
            explicit_output_names.update(self._collect_device_name_candidates(info.get(key)))

        generic_inventory: set[str] = set()
        for key in ("available_devices", "devices", "audio_interfaces"):
            generic_inventory.update(self._collect_device_name_candidates(info.get(key)))

        if not explicit_input_names and generic_inventory:
            explicit_input_names = set(generic_inventory)
        if not explicit_output_names and generic_inventory:
            explicit_output_names = set(generic_inventory)

        return {
            "current_aliases": current_aliases,
            "input_names": explicit_input_names,
            "output_names": explicit_output_names,
            "has_explicit_input_inventory": bool(explicit_input_names),
            "has_explicit_output_inventory": bool(explicit_output_names),
        }

    def _get_snapshot_io_defaults(self) -> dict[str, Any]:
        manager = get_config()
        return {
            "input_device": _normalize_device_name(manager.get(SNAPSHOT_DEFAULT_INPUT_DEVICE_CONFIG_KEY)),
            "output_device": _normalize_device_name(manager.get(SNAPSHOT_DEFAULT_OUTPUT_DEVICE_CONFIG_KEY)),
            "monitoring_output_index": _normalize_monitoring_output_index(
                manager.get(SNAPSHOT_DEFAULT_MONITORING_OUTPUT_INDEX_CONFIG_KEY)
            ),
        }

    def _resolve_snapshot_io_bindings(
        self,
        *,
        input_device: Any,
        output_device: Any,
        use_defaults: bool = True,
    ) -> tuple[Optional[str], Optional[str]]:
        resolved_input = _normalize_device_name(input_device)
        resolved_output = _normalize_device_name(output_device)
        if not use_defaults:
            return resolved_input, resolved_output

        defaults = self._get_snapshot_io_defaults()
        return (
            resolved_input or defaults["input_device"],
            resolved_output or defaults["output_device"],
        )

    async def _apply_snapshot_audio_device_bindings(self, detail: dict[str, Any]) -> dict[str, Any]:
        resolved_input, resolved_output = self._resolve_snapshot_io_bindings(
            input_device=detail.get("input_device"),
            output_device=detail.get("output_device"),
        )
        requested_device = resolved_output or resolved_input
        if not requested_device:
            return {
                "requested_input_device": resolved_input,
                "requested_output_device": resolved_output,
                "applied_audio_device": None,
                "applied": False,
                "reason": "not_configured",
            }

        service = get_audio_engine()
        if service is None:
            return {
                "requested_input_device": resolved_input,
                "requested_output_device": resolved_output,
                "applied_audio_device": None,
                "applied": False,
                "reason": "engine_unavailable",
            }

        if resolved_input and resolved_output and resolved_input != resolved_output:
            logger.info(
                "Snapshot requested distinct input/output devices (%s, %s); applying shared engine device %s",
                resolved_input,
                resolved_output,
                requested_device,
            )

        applied = await service.set_audio_device(requested_device)
        return {
            "requested_input_device": resolved_input,
            "requested_output_device": resolved_output,
            "applied_audio_device": requested_device if applied else None,
            "applied": bool(applied),
            "reason": "applied" if applied else "set_audio_device_failed",
        }

    async def _apply_snapshot_monitoring_output_binding(self, detail: dict[str, Any]) -> dict[str, Any]:
        controls = detail.get("controls") if isinstance(detail.get("controls"), dict) else {}
        monitoring_output_index = _normalize_monitoring_output_index(
            controls.get("monitoring_output_index")
        )
        result = {
            "monitoring_output_index": monitoring_output_index,
            "applied": False,
            "reason": "not_configured",
        }

        if monitoring_output_index is None:
            return result

        service = get_audio_engine()
        if service is None:
            result["reason"] = "engine_unavailable"
            return result

        set_monitoring_output_index = getattr(service, "set_monitoring_output_index", None)
        if not callable(set_monitoring_output_index):
            result["reason"] = "monitoring_output_unsupported"
            return result

        applied = await set_monitoring_output_index(int(monitoring_output_index))
        result["applied"] = bool(applied)
        result["reason"] = "applied" if applied else "set_monitoring_output_index_failed"
        return result

    async def _apply_snapshot_output_safety_settings(self, detail: dict[str, Any]) -> dict[str, Any]:
        reference_dbfs = detail.get("output_level_reference_dbfs")
        warning_threshold_db = detail.get("output_level_warning_threshold_db")
        result = {
            "output_level_reference_dbfs": None if reference_dbfs is None else float(reference_dbfs),
            "output_warning_threshold_db": None if warning_threshold_db is None else float(warning_threshold_db),
            "reference_applied": False,
            "warning_threshold_applied": False,
            "reason": "not_configured",
        }

        service = get_audio_engine()
        if reference_dbfs is not None:
            if service is None:
                result["reason"] = "engine_unavailable"
            else:
                await service.set_limiter_threshold(float(reference_dbfs))
                result["reference_applied"] = True
                result["reason"] = "applied"

        if reference_dbfs is None and warning_threshold_db is None:
            return result

        if warning_threshold_db is not None:
            try:
                from app.services.performance_metrics import get_metrics_collector

                collector = await get_metrics_collector()
                collector.set_output_safety_settings(
                    output_level_reference_dbfs=(
                        None if reference_dbfs is None else float(reference_dbfs)
                    ),
                    output_warning_threshold_db=float(warning_threshold_db),
                )
                result["warning_threshold_applied"] = True
                if result["reason"] == "not_configured":
                    result["reason"] = "applied"
            except Exception as exc:
                logger.debug(
                    "Snapshot output warning threshold update skipped for %s: %s",
                    detail.get("id"),
                    exc,
                )
                if not result["reference_applied"]:
                    result["reason"] = "warning_threshold_update_failed"

        return result

    @staticmethod
    def _snapshot_midi_command_id(snapshot_id: int, index: int) -> int:
        return 1_000_000_000 + (int(snapshot_id) * 1000) + int(index)

    @staticmethod
    def _snapshot_midi_entry_to_command(
        snapshot_id: int,
        index: int,
        entry: dict[str, Any],
    ) -> Optional[dict[str, Any]]:
        action = str(entry.get("action") or "").strip()
        if not action or action == "footswitch_label_map":
            return None

        command_type: str
        data1: int
        data2: int | None = None
        if entry.get("program_number") is not None:
            program_number = _safe_int(entry.get("program_number"))
            if program_number is None or program_number < 0:
                return None
            command_type = "program_change"
            data1 = program_number
        else:
            note_number = _safe_int(
                entry.get("start_note", entry.get("startNote", entry.get("note", entry.get("note_number"))))
            )
            if note_number is not None and note_number >= 0:
                command_type = "note_on"
                data1 = note_number
            else:
                cc_number = _safe_int(
                    entry.get("cc", entry.get("cc_number", entry.get("ccNumber", entry.get("control_number"))))
                )
                if cc_number is None or cc_number < 0:
                    return None
                command_type = "cc_toggle"
                data1 = cc_number
                data2 = _safe_int(entry.get("data2", entry.get("value_threshold")))

        channel = _safe_int(entry.get("midi_channel", entry.get("midiChannel", entry.get("channel"))))
        normalized_entry = dict(entry)
        normalized_entry.setdefault("snapshot_id", int(snapshot_id))
        return {
            "id": SnapshotRuntimeMixin._snapshot_midi_command_id(snapshot_id, index),
            "command_type": command_type,
            "channel": channel if channel is not None and channel > 0 else 0,
            "data1": data1,
            "data2": data2,
            "action_type": action,
            "target_chain_id": _safe_int(entry.get("target_chain_id", entry.get("targetChainId"))),
            "target_plugin_uri": str(entry.get("target_plugin_uri", entry.get("targetPluginUri")) or ""),
            "target_plugin_position": _safe_int(entry.get("target_plugin_position", entry.get("targetPluginPosition"))),
            "action_data": normalized_entry,
            "is_enabled": _normalize_bool(entry.get("is_enabled", entry.get("enabled")), True),
        }

    async def _sync_snapshot_midi_map_to_engine(
        self,
        snapshot_id: int,
        entries: list[dict[str, Any]] | None,
    ) -> dict[str, Any]:
        engine = get_audio_engine()
        if engine is None:
            return {
                "synced": False,
                "reason": "engine_unavailable",
                "global_command_count": 0,
                "snapshot_command_count": 0,
            }

        global_commands = await midi_service.get_all_commands(self.session)
        snapshot_commands = [
            command
            for index, raw_entry in enumerate(entries or [])
            if isinstance(raw_entry, dict)
            for command in [self._snapshot_midi_entry_to_command(snapshot_id, index, raw_entry)]
            if command is not None
        ]
        synced = await engine.set_all_midi_commands([*global_commands, *snapshot_commands])
        return {
            "synced": bool(synced),
            "reason": "applied" if synced else "set_all_midi_commands_failed",
            "global_command_count": len(global_commands),
            "snapshot_command_count": len(snapshot_commands),
        }

    async def _sync_snapshot_expression_mappings_to_runtime(
        self,
        entries: list[dict[str, Any]] | None,
    ) -> dict[str, Any]:
        engine = get_audio_engine()
        normalized_entries = _normalize_expression_mappings_payload(entries)
        flattened_entries = _flatten_snapshot_expression_mappings(normalized_entries)
        replace_snapshot_expression_mappings = getattr(engine, "replace_snapshot_expression_mappings", None) if engine else None
        if callable(replace_snapshot_expression_mappings):
            synced = await replace_snapshot_expression_mappings(flattened_entries)
            if synced:
                return {
                    "synced": True,
                    "reason": "engine_applied",
                    "mapping_count": len(normalized_entries),
                    "target_count": len(flattened_entries),
                    "cleared_count": len(flattened_entries),
                    "applied_count": len(flattened_entries),
                    "active_snapshot_count": len(flattened_entries),
                }
        try:
            service = get_expression_service()
        except Exception as exc:
            return {
                "synced": False,
                "reason": f"expression_service_unavailable:{exc}",
                "mapping_count": len(normalized_entries),
                "target_count": len(flattened_entries),
                "cleared_count": 0,
                "applied_count": 0,
                "active_snapshot_count": 0,
            }

        result = service.replace_snapshot_assignments(flattened_entries)
        return {
            "synced": True,
            "reason": "applied",
            "mapping_count": len(normalized_entries),
            "target_count": len(flattened_entries),
            **result,
        }

    async def _sync_snapshot_automation_lanes_to_runtime(
        self,
        entries: list[dict[str, Any]] | None,
    ) -> dict[str, Any]:
        if automation_engine is None:
            return {
                "synced": False,
                "reason": "automation_engine_unavailable",
                "cleared_count": 0,
                "applied_count": 0,
                "invalid_count": 0,
                "active_snapshot_count": 0,
            }

        result = automation_engine.replace_snapshot_lanes(
            [dict(entry) for entry in entries or [] if isinstance(entry, dict)]
        )
        return {
            "synced": True,
            "reason": "applied",
            **result,
        }

    async def _sync_snapshot_loop_insertions_to_runtime(
        self,
        detail: dict[str, Any],
    ) -> dict[str, Any]:
        engine = get_audio_engine()
        if engine is None or not hasattr(engine, "set_chain_loop_insertions"):
            return {
                "synced": False,
                "reason": "engine_missing_loop_api",
                "chain_count": 0,
                "applied_count": 0,
            }

        live_state = detail.get("live_state") if isinstance(detail.get("live_state"), dict) else {}
        runtime_chain_id_by_snapshot_chain_id = {
            int(path.get("snapshot_chain_id")): int(path.get("runtime_chain_id"))
            for path in live_state.get("paths", [])
            if isinstance(path, dict)
            and isinstance(path.get("snapshot_chain_id"), int)
            and isinstance(path.get("runtime_chain_id"), int)
        }
        source_chains = {
            int(chain.get("id")): dict(chain)
            for chain in detail.get("chains", [])
            if isinstance(chain, dict) and isinstance(chain.get("id"), int)
        }

        chain_count = 0
        applied_count = 0
        for snapshot_chain_id, chain_id in runtime_chain_id_by_snapshot_chain_id.items():
            source_chain = source_chains.get(snapshot_chain_id, {})
            payload = [
                {
                    "insertion_id": str(entry.get("insertion_id") or ""),
                    "loop_id": str(entry.get("loop_id") or ""),
                    "slot_index": int(entry.get("slot_index", 0)),
                    "enabled": bool(entry.get("enabled", True)),
                    "mode": str(entry.get("mode") or "serial_insert"),
                    "blend_pct": _safe_float(entry.get("blend_pct"), 100.0),
                    "send_gain_db": _safe_float(entry.get("send_gain_db"), 0.0),
                    "return_gain_db": _safe_float(entry.get("return_gain_db"), 0.0),
                    "crossfade_ms": int(_safe_int(entry.get("crossfade_ms")) or 12),
                    "band_split_hz": list(entry.get("band_split_hz") or []),
                }
                for entry in source_chain.get("loop_insertions", [])
                if isinstance(entry, dict)
            ]
            applied = await engine.set_chain_loop_insertions(chain_id, payload)
            chain_count += 1
            if applied:
                applied_count += len(payload)

        return {
            "synced": True,
            "reason": "applied",
            "chain_count": chain_count,
            "applied_count": applied_count,
        }

    async def _sync_snapshot_channel_state_to_runtime(
        self,
        detail: dict[str, Any],
    ) -> dict[str, Any]:
        engine = get_audio_engine()
        if engine is None:
            return {
                "synced": False,
                "reason": "engine_unavailable",
                "channel_count": 0,
                "applied_count": 0,
            }

        live_state = detail.get("live_state") if isinstance(detail.get("live_state"), dict) else {}
        runtime_chain_id_by_snapshot_chain_id = {
            int(path.get("snapshot_chain_id")): int(path.get("runtime_chain_id"))
            for path in live_state.get("paths", [])
            if isinstance(path, dict)
            and isinstance(path.get("snapshot_chain_id"), int)
            and isinstance(path.get("runtime_chain_id"), int)
        }
        channels = [
            dict(channel)
            for channel in detail.get("channels", [])
            if isinstance(channel, dict) and isinstance(channel.get("chain_id"), int)
        ]
        if not channels:
            return {
                "synced": True,
                "reason": "no_channels",
                "channel_count": 0,
                "applied_count": 0,
            }

        method_names = ("set_chain_mute", "set_chain_solo", "set_chain_dry_wet_mix")
        if not all(hasattr(engine, method_name) for method_name in method_names):
            return {
                "synced": False,
                "reason": "engine_missing_channel_state_api",
                "channel_count": len(channels),
                "applied_count": 0,
            }

        applied_count = 0
        for channel in channels:
            runtime_chain_id = runtime_chain_id_by_snapshot_chain_id.get(int(channel["chain_id"]))
            if runtime_chain_id is None:
                continue
            await engine.set_chain_mute(runtime_chain_id, _normalize_bool(channel.get("muted"), False))
            await engine.set_chain_solo(runtime_chain_id, _normalize_bool(channel.get("solo"), False))
            await engine.set_chain_dry_wet_mix(
                runtime_chain_id,
                _safe_float(channel.get("dry_wet_mix", channel.get("dryWetMix")), DEFAULT_DRY_WET_MIX),
            )
            applied_count += 1

        return {
            "synced": True,
            "reason": "applied",
            "channel_count": len(channels),
            "applied_count": applied_count,
        }

    @staticmethod
    def _preflight_asset_label(
        loader_state: dict[str, Any],
        asset_path: str,
        *,
        fallback: str,
    ) -> str:
        return str(
            loader_state.get("selected_asset_name")
            or loader_state.get("selected_model")
            or loader_state.get("selected_ir")
            or os.path.basename(asset_path)
            or fallback
        ).strip() or fallback

    @staticmethod
    def _preflight_repair_action(
        *,
        action: str,
        message: str,
        **metadata: Any,
    ) -> dict[str, Any]:
        payload = {
            "action": action,
            "message": message,
        }
        for key, value in metadata.items():
            if value is not None:
                payload[key] = value
        return payload

    async def _validate_snapshot_activation_preflight(self, detail: dict[str, Any]) -> None:
        chain_by_id = {
            chain.get("id"): chain
            for chain in detail.get("chains", [])
            if isinstance(chain, dict) and chain.get("id") is not None
        }
        failures: list[str] = []
        issues: list[dict[str, Any]] = []
        repair_actions: list[dict[str, Any]] = []

        for channel_index, channel in enumerate(detail.get("channels", [])):
            if not isinstance(channel, dict):
                continue

            channel_label = str(
                channel.get("label")
                or channel.get("channel_key")
                or _stable_channel_label(channel_index)
            ).strip() or _stable_channel_label(channel_index)
            chain_id = channel.get("chain_id")
            source_chain = chain_by_id.get(chain_id) if chain_id is not None else None
            if not isinstance(source_chain, dict):
                continue

            for plugin in source_chain.get("plugins", []):
                if not isinstance(plugin, dict):
                    continue

                plugin_uri = str(plugin.get("uri") or "").strip()
                if not plugin_uri:
                    continue

                plugin_name = str(plugin.get("name") or plugin_uri).strip() or plugin_uri
                plugin_missing = bool(plugin.get("is_placeholder", False)) or not _plugin_available(plugin_uri)
                if plugin_missing:
                    message = (
                        f"Cannot go live: Channel {channel_label} - plugin {plugin_name} is not installed on this node."
                    )
                    failures.append(message)
                    issues.append(
                        {
                            "code": "missing_plugin",
                            "category": "plugin",
                            "channel_label": channel_label,
                            "plugin_uri": plugin_uri,
                            "plugin_name": plugin_name,
                            "message": message,
                            "auto_repair": False,
                        }
                    )
                    repair_actions.append(
                        self._preflight_repair_action(
                            action="install_plugin",
                            message=f"Install or redeploy plugin {plugin_name} on this node.",
                            channel_label=channel_label,
                            plugin_uri=plugin_uri,
                            plugin_name=plugin_name,
                        )
                    )
                    continue

                loader_state = plugin.get("loader_state") if isinstance(plugin.get("loader_state"), dict) else {}
                asset_path = str(loader_state.get("selected_asset_path") or "").strip()
                if not asset_path:
                    continue
                if os.path.isfile(asset_path):
                    continue

                if plugin_uri in _NAM_PLUGIN_URIS:
                    asset_name = self._preflight_asset_label(loader_state, asset_path, fallback="NAM model")
                    message = f"Cannot go live: Channel {channel_label} - NAM model {asset_name} not found on this node."
                    failures.append(message)
                    issues.append(
                        {
                            "code": "missing_asset",
                            "category": "asset",
                            "asset_type": "nam_model",
                            "channel_label": channel_label,
                            "plugin_uri": plugin_uri,
                            "asset_name": asset_name,
                            "asset_path": asset_path,
                            "message": message,
                            "auto_repair": True,
                        }
                    )
                    repair_actions.append(
                        self._preflight_repair_action(
                            action="restore_asset",
                            message=f"Restore or redeploy NAM model {asset_name} on this node.",
                            asset_type="nam_model",
                            asset_name=asset_name,
                            asset_path=asset_path,
                            channel_label=channel_label,
                        )
                    )
                    continue

                if plugin_uri in _CABINET_IR_PLUGIN_URIS:
                    asset_name = self._preflight_asset_label(loader_state, asset_path, fallback="cabinet IR")
                    message = f"Cannot go live: Channel {channel_label} - cabinet IR {asset_name} not found on this node."
                    failures.append(message)
                    issues.append(
                        {
                            "code": "missing_asset",
                            "category": "asset",
                            "asset_type": "cabinet_ir",
                            "channel_label": channel_label,
                            "plugin_uri": plugin_uri,
                            "asset_name": asset_name,
                            "asset_path": asset_path,
                            "message": message,
                            "auto_repair": True,
                        }
                    )
                    repair_actions.append(
                        self._preflight_repair_action(
                            action="restore_asset",
                            message=f"Restore or redeploy cabinet IR {asset_name} on this node.",
                            asset_type="cabinet_ir",
                            asset_name=asset_name,
                            asset_path=asset_path,
                            channel_label=channel_label,
                        )
                    )
                    continue

                if plugin_uri in _REVERB_IR_PLUGIN_URIS:
                    asset_name = self._preflight_asset_label(loader_state, asset_path, fallback="reverb IR")
                    message = f"Cannot go live: Channel {channel_label} - reverb IR {asset_name} not found on this node."
                    failures.append(message)
                    issues.append(
                        {
                            "code": "missing_asset",
                            "category": "asset",
                            "asset_type": "reverb_ir",
                            "channel_label": channel_label,
                            "plugin_uri": plugin_uri,
                            "asset_name": asset_name,
                            "asset_path": asset_path,
                            "message": message,
                            "auto_repair": True,
                        }
                    )
                    repair_actions.append(
                        self._preflight_repair_action(
                            action="restore_asset",
                            message=f"Restore or redeploy reverb IR {asset_name} on this node.",
                            asset_type="reverb_ir",
                            asset_name=asset_name,
                            asset_path=asset_path,
                            channel_label=channel_label,
                        )
                    )
                    continue

                asset_name = self._preflight_asset_label(loader_state, asset_path, fallback="plugin asset")
                message = f"Cannot go live: Channel {channel_label} - plugin asset {asset_name} not found on this node."
                failures.append(message)
                issues.append(
                    {
                        "code": "missing_asset",
                        "category": "asset",
                        "asset_type": "plugin_asset",
                        "channel_label": channel_label,
                        "plugin_uri": plugin_uri,
                        "asset_name": asset_name,
                        "asset_path": asset_path,
                        "message": message,
                        "auto_repair": True,
                    }
                )
                repair_actions.append(
                    self._preflight_repair_action(
                        action="restore_asset",
                        message=f"Restore or redeploy plugin asset {asset_name} on this node.",
                        asset_type="plugin_asset",
                        asset_name=asset_name,
                        asset_path=asset_path,
                        channel_label=channel_label,
                    )
                )

        inventory = self._get_audio_device_inventory()
        input_device, output_device = self._resolve_snapshot_io_bindings(
            input_device=detail.get("input_device"),
            output_device=detail.get("output_device"),
        )

        if (
            input_device
            and inventory["has_explicit_input_inventory"]
            and input_device not in inventory["input_names"]
        ):
            message = f"Cannot go live: Input device {input_device} is not available on this node."
            failures.append(message)
            issues.append(
                {
                    "code": "missing_input_device",
                    "category": "device",
                    "device_role": "input",
                    "requested_device": input_device,
                    "message": message,
                    "auto_repair": False,
                }
            )
            repair_actions.append(
                self._preflight_repair_action(
                    action="select_available_device",
                    message=f"Select an available input device instead of {input_device}.",
                    device_role="input",
                    requested_device=input_device,
                )
            )

        if (
            output_device
            and inventory["has_explicit_output_inventory"]
            and output_device not in inventory["output_names"]
        ):
            message = f"Cannot go live: Output device {output_device} is not available on this node."
            failures.append(message)
            issues.append(
                {
                    "code": "missing_output_device",
                    "category": "device",
                    "device_role": "output",
                    "requested_device": output_device,
                    "message": message,
                    "auto_repair": False,
                }
            )
            repair_actions.append(
                self._preflight_repair_action(
                    action="select_available_device",
                    message=f"Select an available output device instead of {output_device}.",
                    device_role="output",
                    requested_device=output_device,
                )
            )

        if failures:
            raise SnapshotActivationPreflightError(
                failures,
                issues=issues,
                repair_actions=repair_actions,
            )

    @staticmethod
    def _snapshot_spillover_candidate_counts(detail: dict[str, Any] | None) -> dict[str, int]:
        counts = {uri: 0 for uri in _SNAPSHOT_SPILLOVER_NATIVE_URIS}
        if not isinstance(detail, dict):
            return counts
        for chain in detail.get("chains", []):
            if not isinstance(chain, dict):
                continue
            for plugin in chain.get("plugins", []):
                if not isinstance(plugin, dict):
                    continue
                if bool(plugin.get("bypass", False)):
                    continue
                uri = str(plugin.get("uri") or "")
                if uri in counts:
                    counts[uri] += 1
        return counts

    @staticmethod
    def _snapshot_spillover_candidate_signatures(detail: dict[str, Any] | None) -> dict[str, list[str]]:
        signatures = {uri: [] for uri in _SNAPSHOT_SPILLOVER_NATIVE_URIS}
        if not isinstance(detail, dict):
            return signatures
        for chain in detail.get("chains", []):
            if not isinstance(chain, dict):
                continue
            for plugin in chain.get("plugins", []):
                if not isinstance(plugin, dict):
                    continue
                if bool(plugin.get("bypass", False)):
                    continue
                uri = str(plugin.get("uri") or "")
                if uri not in signatures:
                    continue
                signature = {
                    "parameters": plugin.get("parameters", {}),
                    "loader_state": plugin.get("loader_state", {}),
                    "mix": plugin.get("mix"),
                    "plugin_position": plugin.get("plugin_position", plugin.get("position")),
                }
                signatures[uri].append(json.dumps(signature, sort_keys=True, default=str))
        for uri in signatures:
            signatures[uri].sort()
        return signatures

    async def _arm_live_spillover_processors(
        self,
        *,
        current_live_detail: dict[str, Any] | None,
        target_detail: dict[str, Any],
    ) -> None:
        await self.state_authority_activation.arm_live_spillover_processors(
            current_live_detail=current_live_detail,
            target_detail=target_detail,
        )

    async def activate_snapshot(
        self,
        snapshot_id: int,
        *,
        triggered_by: str = "ui",
    ) -> Optional[dict[str, Any]]:
        return await self.state_authority_activation.activate_snapshot(
            snapshot_id,
            triggered_by=triggered_by,
        )

    async def preview_snapshot(self, detail_payload: dict[str, Any]) -> dict[str, Any]:
        normalized = self._normalize_detail_payload(detail_payload)
        normalized = await self._enrich_normalized_payload(normalized)
        detail = self._normalized_to_detail(normalized, snapshot_row=None)

        params_applied = 0
        bypass_applied = 0
        try:
            params_applied, bypass_applied = await snapshot_runtime_service.apply_snapshot_to_engine(
                copy.deepcopy(detail)
            )
        except Exception as exc:
            logger.debug("Snapshot preview skipped runtime apply: %s", exc)

        return {
            "status": "success",
            "snapshot_data": detail,
            "chains_created": 0,
            "params_applied": params_applied,
            "bypass_applied": bypass_applied,
        }

    async def _build_live_state(
        self,
        snapshot: Snapshot,
        *,
        runtime_state: dict[str, Any] | None = None,
        compatibility_live_state_payload: dict[str, Any] | None = None,
        compatibility_is_live: bool = False,
        compatibility_activated_at: datetime | None = None,
    ) -> dict[str, Any]:
        if runtime_state is None:
            from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

            runtime_state = await SnapshotRuntimeStateService(self.session).get_live_state()
        runtime_payload = runtime_state.get("live_snapshot_payload")
        if (
            runtime_state.get("state") == "live"
            and int(runtime_state.get("snapshot_id") or 0) == int(snapshot.id)
            and isinstance(runtime_payload, dict)
        ):
            live_state_payload = runtime_payload.get("live_state")
            if isinstance(live_state_payload, dict):
                return {
                    "is_live": not bool(runtime_state.get("is_offline", False)),
                    "activated_at": live_state_payload.get("activated_at") or runtime_state.get("emitted_at"),
                    "paths": [dict(item) for item in live_state_payload.get("paths", []) if isinstance(item, dict)],
                    "runtime_chains": [dict(item) for item in live_state_payload.get("runtime_chains", []) if isinstance(item, dict)],
                    "display_state": runtime_state.get("display_state"),
                    "display_label": runtime_state.get("display_label"),
                    "is_warning": bool(runtime_state.get("is_warning", False)),
                    "is_offline": bool(runtime_state.get("is_offline", False)),
                    "last_runtime_event_at": runtime_state.get("emitted_at"),
                    "node_id": runtime_state.get("node_id"),
                }
        if compatibility_is_live and isinstance(compatibility_live_state_payload, dict):
            runtime_paths = [
                dict(item)
                for item in compatibility_live_state_payload.get("paths", [])
                if isinstance(item, dict)
            ]
            runtime_chain_ids = [
                int(item["runtime_chain_id"])
                for item in runtime_paths
                if item.get("runtime_chain_id") is not None
            ]
            runtime_chains: list[dict[str, Any]] = []
            for runtime_chain_id in runtime_chain_ids:
                chain = await self.chain_service.get_chain(runtime_chain_id)
                if chain is not None:
                    runtime_chains.append(chain)
            return {
                "is_live": True,
                "activated_at": compatibility_activated_at.isoformat() if compatibility_activated_at else None,
                "paths": runtime_paths,
                "runtime_chains": runtime_chains,
                "display_state": "live",
                "display_label": "Live",
                "is_warning": False,
                "is_offline": False,
                "last_runtime_event_at": compatibility_activated_at.isoformat() if compatibility_activated_at else None,
            }
        return {
            "is_live": False,
            "activated_at": None,
            "paths": [],
            "runtime_chains": [],
            "display_state": "stopped",
            "display_label": "Stopped",
            "is_warning": False,
            "is_offline": False,
            "last_runtime_event_at": None,
        }

    async def _clear_compatibility_live_projections(self) -> None:
        await self.session.execute(
            update(Snapshot).values(
                activated_at=None,
            )
        )
        await self.session.flush()

    def _ordered_detail_channels(self, detail: dict[str, Any]) -> list[dict[str, Any]]:
        channels = [channel for channel in detail.get("channels", []) if isinstance(channel, dict)]
        return sorted(
            channels,
            key=lambda item: (
                int(item.get("order_index", 0)),
                str(item.get("channel_key") or ""),
            ),
        )

    def _runtime_chain_name_for_channel(
        self,
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

    def _snapshot_runtime_topology_signature(self, detail: dict[str, Any]) -> dict[str, Any]:
        chain_index_by_id: dict[int, int] = {}
        canonical_chains: list[dict[str, Any]] = []
        ordered_chains = [chain for chain in detail.get("chains", []) if isinstance(chain, dict)]

        for chain_index, chain in enumerate(ordered_chains):
            chain_id = _safe_int(chain.get("id"))
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
                    key: _canonicalize_json_value(value)
                    for key, value in sorted(loop.items())
                    if key not in (_CANONICAL_TRANSIENT_KEYS | {"insertion_id"})
                }
                for loop in chain.get("loop_insertions", [])
                if isinstance(loop, dict)
            ]

            effects_loops = [
                {
                    key: _canonicalize_json_value(loop.get(key))
                    for key in sorted(_CANONICAL_EFFECTS_LOOP_KEYS)
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
                "chain_index": chain_index_by_id.get(_safe_int(channel.get("chain_id")) or -1),
            }
            for channel in self._ordered_detail_channels(detail)
        ]

        return {
            "channels": canonical_channels,
            "chains": canonical_chains,
        }

    async def _reuse_live_runtime_chains(
        self,
        snapshot: Snapshot,
        detail: dict[str, Any],
        *,
        current_live_detail: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        return await self.state_authority_activation.reuse_live_runtime_chains(
            snapshot,
            detail,
            current_live_detail=current_live_detail,
        )

    async def _clear_materialized_runtime_chains(self) -> None:
        await self.state_authority_activation.clear_materialized_runtime_chains()

    async def _materialize_live_state(
        self,
        snapshot: Snapshot,
        detail: dict[str, Any],
        *,
        preloaded_instance_ids: Optional[list[int]] = None,
    ) -> dict[str, Any]:
        return await self.state_authority_activation.materialize_live_state(
            snapshot,
            detail,
            preloaded_instance_ids=preloaded_instance_ids,
        )


__all__ = [name for name in globals() if not name.startswith("__")]
