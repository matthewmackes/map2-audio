"""Editor, mutation, and template-overlay responsibilities for SnapshotService."""

from .common import *

from app.services.midi.authority import MidiBindingAuthority
from app.services.midi.projections.snapshot_program import (
    delete_program_number_binding as _delete_snapshot_program_binding,
    sync_program_number as _sync_snapshot_program_binding,
)


class SnapshotEditorMixin:
    def _normalize_controls_payload(
        self,
        controls_payload: Optional[dict[str, Any]],
        detail_payload: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        payload = dict(controls_payload or {})
        midi_map = payload.get("midi_map")
        if not isinstance(midi_map, list):
            source = detail_payload or {}
            midi_map = source.get("midi_map", source.get("midiMap", [])) or []
        payload["midi_map"] = [dict(entry) for entry in midi_map if isinstance(entry, dict)]
        payload["automation_lanes"] = [dict(entry) for entry in payload.get("automation_lanes", []) if isinstance(entry, dict)]
        payload["expression_mappings"] = _normalize_expression_mappings_payload(payload.get("expression_mappings", []))
        monitoring_output_index = payload.get("monitoring_output_index")
        if monitoring_output_index is None and isinstance(detail_payload, dict):
            controls_source = detail_payload.get("controls")
            if isinstance(controls_source, dict):
                monitoring_output_index = controls_source.get("monitoring_output_index")
            else:
                io_source = detail_payload.get("io_bindings")
                if isinstance(io_source, dict):
                    monitoring_output_index = io_source.get("monitoring_output_index")
        payload["monitoring_output_index"] = _normalize_monitoring_output_index(monitoring_output_index)
        payload["maschine_encoder_map"] = normalize_maschine_encoder_map(payload.get("maschine_encoder_map"))
        payload["controller_mappings"] = _normalize_controller_mappings_payload(
            payload.get("controller_mappings"),
            fallback_midi_map=payload["midi_map"],
            fallback_maschine_encoder_map=payload["maschine_encoder_map"],
        )
        controller_mappings = payload["controller_mappings"]
        if isinstance(controller_mappings, dict):
            maschine_payload = controller_mappings.get("maschine") if isinstance(controller_mappings.get("maschine"), dict) else {}
            footswitch_payload = controller_mappings.get("footswitches") if isinstance(controller_mappings.get("footswitches"), dict) else {}
            payload["maschine_encoder_map"] = normalize_maschine_encoder_map(maschine_payload.get("encoder_map"))
            payload["midi_map"] = replace_snapshot_footswitch_label_map(
                payload["midi_map"],
                footswitch_payload.get("label_map") if isinstance(footswitch_payload.get("label_map"), dict) else {},
            )
        return payload

    async def get_snapshot(self, snapshot_id: int) -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None
        return await self._serialize_snapshot_detail(snapshot)

    async def get_template(self, template_id: int) -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(template_id)
        if snapshot is None or self._snapshot_document_type(snapshot) != "template":
            return None
        return await self._serialize_snapshot_detail(snapshot)

    async def get_control_plane_snapshot_id(self) -> Optional[int]:
        from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

        runtime_state = await SnapshotRuntimeStateService(self.session).get_live_state()
        runtime_payload = runtime_state.get("live_snapshot_payload")
        if runtime_state.get("state") == "live":
            snapshot_id = _safe_int(runtime_state.get("snapshot_id"))
            if snapshot_id is None and isinstance(runtime_payload, dict):
                snapshot_id = _safe_int(runtime_payload.get("id"))
            if snapshot_id is not None:
                return snapshot_id

        try:
            from app.services.audio_state_authority import AudioStateAuthorityError, AudioStateAuthorityService

            committed = await AudioStateAuthorityService().get_committed_state()
            snapshot_id = committed.value.source_snapshot.snapshot_id if committed.value.source_snapshot else None
            if snapshot_id is not None:
                return int(snapshot_id)
        except Exception as exc:
            if exc.__class__.__name__ != "AudioStateAuthorityError":
                logger.debug("Control-plane snapshot lookup fell back to runtime compatibility path: %s", exc)
        return None

    async def get_control_plane_snapshot(self) -> Optional[dict[str, Any]]:
        snapshot_id = await self.get_control_plane_snapshot_id()
        if snapshot_id is None:
            return None
        return await self.get_snapshot(snapshot_id)

    async def get_live_snapshot(self) -> Optional[dict[str, Any]]:
        live_detail = await self.get_control_plane_snapshot()
        if live_detail is None:
            return None

        from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

        runtime_state = await SnapshotRuntimeStateService(self.session).get_live_state()
        runtime_payload = runtime_state.get("live_snapshot_payload")
        if runtime_state.get("state") == "live" and isinstance(runtime_payload, dict):
            snapshot_id = _safe_int(runtime_payload.get("id"))
            if snapshot_id == live_detail.get("id"):
                live_detail["snapshot_revision"] = (
                    runtime_state.get("snapshot_revision")
                    or runtime_payload.get("snapshot_revision")
                    or live_detail.get("snapshot_revision")
                )
                controller_display_preview = runtime_payload.get("controller_display_preview")
                if isinstance(controller_display_preview, dict):
                    live_detail["controller_display_preview"] = copy.deepcopy(controller_display_preview)
        return live_detail

    async def create_snapshot(
        self,
        *,
        name: str,
        description: str = "",
        tags: Optional[list[str]] = None,
        program_number: Optional[int] = None,
        tempo_bpm: float = DEFAULT_SNAPSHOT_TEMPO_BPM,
        derived_from_snapshot_id: Optional[int] = None,
        output_level_reference_dbfs: Optional[float] = None,
        output_level_warning_threshold_db: Optional[float] = 3.0,
        input_device: Optional[str] = None,
        output_device: Optional[str] = None,
        controls_payload: Optional[dict[str, Any]] = None,
        detail_payload: Optional[dict[str, Any]] = None,
        is_favorite: bool = False,
        is_locked: bool = False,
        apply_default_system_blocks: bool = True,
        capture_current_authority_extensions: bool = True,
        document_type: str = "snapshot",
    ) -> dict[str, Any]:
        normalized_name = validate_snapshot_name(name)
        await self._validate_program_number(program_number)
        max_order = await self._get_max_display_order()
        resolved_input_device, resolved_output_device = self._resolve_snapshot_io_bindings(
            input_device=input_device,
            output_device=output_device,
        )
        resolved_controls_payload = self._normalize_controls_payload(controls_payload, detail_payload)
        if resolved_controls_payload.get("monitoring_output_index") is None:
            resolved_controls_payload["monitoring_output_index"] = self._get_snapshot_io_defaults().get("monitoring_output_index")
        resolved_controls_payload = self._normalize_controls_payload(resolved_controls_payload, detail_payload)

        snapshot = Snapshot(
            name=normalized_name,
            description=description,
            tags=[],
            program_number=program_number,
            is_favorite=is_favorite,
            is_locked=bool(is_locked),
            display_order=max_order + 1,
            tempo_bpm=_safe_float(tempo_bpm, DEFAULT_SNAPSHOT_TEMPO_BPM),
            derived_from_snapshot_id=derived_from_snapshot_id,
            output_level_reference_dbfs=output_level_reference_dbfs,
            output_level_warning_threshold_db=(
                float(output_level_warning_threshold_db)
                if output_level_warning_threshold_db is not None
                else 3.0
            ),
            input_device=resolved_input_device,
            output_device=resolved_output_device,
            controls_payload=resolved_controls_payload,
        )
        self.session.add(snapshot)
        await self.session.flush()

        if program_number is not None:
            await _sync_snapshot_program_binding(
                MidiBindingAuthority(self.session),
                snapshot.id,
                int(program_number),
                snapshot_name=snapshot.name,
                modified_by="snapshot-editor",
            )

        normalized = self._normalize_detail_payload(detail_payload or {})
        normalized["extensions"] = await self._resolve_snapshot_persisted_extensions(
            detail_payload,
            capture_current_authority_extensions=capture_current_authority_extensions,
        )
        normalized = await self._resolve_template_linked_normalized(normalized)
        normalized = self._apply_default_system_blocks_to_normalized(
            normalized,
            apply_defaults=apply_default_system_blocks,
        )
        normalized = await self._enrich_normalized_payload(normalized)
        await self._replace_snapshot_state(snapshot, normalized)
        snapshot.tags = self._derive_snapshot_tags_from_normalized(normalized)
        await self._persist_snapshot_document(snapshot, normalized, document_type=document_type)
        await self.session.flush()

        detail = await self.get_snapshot(snapshot.id)
        assert detail is not None
        return detail

    async def update_snapshot(
        self,
        snapshot_id: int,
        *,
        name: Any = UNSET,
        description: Any = UNSET,
        tags: Any = UNSET,
        program_number: Any = UNSET,
        tempo_bpm: Any = UNSET,
        derived_from_snapshot_id: Any = UNSET,
        output_level_reference_dbfs: Any = UNSET,
        output_level_warning_threshold_db: Any = UNSET,
        input_device: Any = UNSET,
        output_device: Any = UNSET,
        controls_payload: Any = UNSET,
        is_favorite: Any = UNSET,
        is_locked: Any = UNSET,
        display_order: Any = UNSET,
        detail_payload: Any = UNSET,
        create_revision: bool = False,
        capture_current_authority_extensions: bool = True,
        document_type: str = "snapshot",
        if_match_version: Optional[int] = None,
    ) -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None
        # T2449: optimistic-concurrency check. If the caller provided an
        # `If-Match` version, verify it matches the row's current version
        # inside the same session. A mismatch means another writer landed in
        # parallel — raise PreconditionFailedError so the route can map it to
        # a 412 envelope and the UI can refresh + retry.
        if if_match_version is not None:
            current_version = int(snapshot.version or 1)
            if current_version != int(if_match_version):
                from app.services.snapshot.common import PreconditionFailedError
                raise PreconditionFailedError(
                    snapshot_id=snapshot_id,
                    current_version=current_version,
                    expected_version=int(if_match_version),
                )
        revision_source = await self.get_snapshot(snapshot_id) if create_revision else None
        previous_input_device = snapshot.input_device
        previous_output_device = snapshot.output_device
        previous_controls_payload = self._normalize_controls_payload(
            snapshot.controls_payload if isinstance(snapshot.controls_payload, dict) else None,
            None,
        )
        previous_monitoring_output_index = previous_controls_payload.get("monitoring_output_index")

        if program_number is not UNSET and program_number != snapshot.program_number:
            await self._validate_program_number(program_number, exclude_snapshot_id=snapshot_id)

        program_number_changed = (
            program_number is not UNSET and program_number != snapshot.program_number
        )

        if name is not UNSET:
            snapshot.name = validate_snapshot_name(name)
        if description is not UNSET:
            snapshot.description = description
        if program_number is not UNSET:
            snapshot.program_number = program_number
        if tempo_bpm is not UNSET:
            snapshot.tempo_bpm = _safe_float(tempo_bpm, DEFAULT_SNAPSHOT_TEMPO_BPM)
        if derived_from_snapshot_id is not UNSET:
            snapshot.derived_from_snapshot_id = derived_from_snapshot_id
        if output_level_reference_dbfs is not UNSET:
            snapshot.output_level_reference_dbfs = (
                None if output_level_reference_dbfs is None else float(output_level_reference_dbfs)
            )
        if output_level_warning_threshold_db is not UNSET:
            snapshot.output_level_warning_threshold_db = (
                float(output_level_warning_threshold_db)
                if output_level_warning_threshold_db is not None
                else 3.0
            )
        if input_device is not UNSET:
            snapshot.input_device = input_device
        if output_device is not UNSET:
            snapshot.output_device = output_device
        if controls_payload is not UNSET:
            incoming_controls_payload = dict(controls_payload or {})
            merged_controls_payload = self._deep_merge_mapping(
                dict(snapshot.controls_payload or {}),
                incoming_controls_payload,
            )
            if "maschine_encoder_map" in incoming_controls_payload:
                controller_mappings = merged_controls_payload.get("controller_mappings")
                if isinstance(controller_mappings, dict):
                    controller_mappings = copy.deepcopy(controller_mappings)
                    controller_mappings.pop("maschine", None)
                    merged_controls_payload["controller_mappings"] = controller_mappings
            incoming_controller_mappings = (
                incoming_controls_payload.get("controller_mappings")
                if isinstance(incoming_controls_payload.get("controller_mappings"), dict)
                else None
            )
            if incoming_controller_mappings is not None:
                merged_controller_mappings = merged_controls_payload.get("controller_mappings")
                if isinstance(merged_controller_mappings, dict):
                    merged_controller_mappings = copy.deepcopy(merged_controller_mappings)
                    if "footswitches" in incoming_controller_mappings:
                        merged_controller_mappings["footswitches"] = copy.deepcopy(
                            incoming_controller_mappings.get("footswitches")
                        )
                    merged_controls_payload["controller_mappings"] = merged_controller_mappings
            snapshot.controls_payload = self._normalize_controls_payload(
                merged_controls_payload,
                detail_payload if detail_payload is not UNSET else None,
            )
        if is_favorite is not UNSET:
            snapshot.is_favorite = bool(is_favorite)
        if is_locked is not UNSET:
            snapshot.is_locked = bool(is_locked)
        if display_order is not UNSET:
            snapshot.display_order = int(display_order)
        # T2449: bump the optimistic-concurrency version atomically with the
        # rest of this write. The session commits all of these in one tx.
        snapshot.version = int(snapshot.version or 1) + 1
        snapshot.updated_at = _utcnow()

        if detail_payload is not UNSET:
            normalized = self._normalize_detail_payload(detail_payload)
            normalized["extensions"] = await self._resolve_snapshot_persisted_extensions(
                detail_payload if isinstance(detail_payload, dict) else None,
                capture_current_authority_extensions=capture_current_authority_extensions,
            )
            normalized = await self._resolve_template_linked_normalized(
                normalized,
                existing_snapshot=snapshot,
            )
            normalized = await self._enrich_normalized_payload(normalized)
            await self._replace_snapshot_state(snapshot, normalized)
            snapshot.tags = self._derive_snapshot_tags_from_normalized(normalized)
        else:
            snapshot.tags = self._derive_snapshot_tags_from_snapshot(snapshot)
            normalized = await self._snapshot_to_normalized(snapshot)

        await self._persist_snapshot_document(snapshot, normalized, document_type=document_type)

        await self.session.flush()
        if program_number_changed:
            await _sync_snapshot_program_binding(
                MidiBindingAuthority(self.session),
                snapshot_id,
                None if program_number is None else int(program_number),
                snapshot_name=snapshot.name,
                modified_by="snapshot-editor",
            )
        elif name is not UNSET:
            current_pn = snapshot.program_number
            if current_pn is not None:
                await _sync_snapshot_program_binding(
                    MidiBindingAuthority(self.session),
                    snapshot_id,
                    int(current_pn),
                    snapshot_name=snapshot.name,
                    modified_by="snapshot-editor",
                )
        if create_revision and revision_source is not None:
            await self._append_snapshot_revision(snapshot_id, revision_source)

        detail = await self.get_snapshot(snapshot.id)
        if detail is None:
            return None

        changed_fields = [
            field_name
            for field_name, field_value in (
                ("name", name),
                ("description", description),
                ("tags", tags),
                ("program_number", program_number),
                ("tempo_bpm", tempo_bpm),
                ("derived_from_snapshot_id", derived_from_snapshot_id),
                ("output_level_reference_dbfs", output_level_reference_dbfs),
                ("output_level_warning_threshold_db", output_level_warning_threshold_db),
                ("input_device", input_device),
                ("output_device", output_device),
                ("controls_payload", controls_payload),
                ("is_favorite", is_favorite),
                ("is_locked", is_locked),
                ("display_order", display_order),
                ("detail_payload", detail_payload),
            )
            if field_value is not UNSET
        ]
        current_runtime_payload: dict[str, Any] | None = None
        is_current_live_snapshot = False
        device_binding_changed = (
            (input_device is not UNSET and _normalize_device_name(previous_input_device) != _normalize_device_name(snapshot.input_device))
            or (output_device is not UNSET and _normalize_device_name(previous_output_device) != _normalize_device_name(snapshot.output_device))
        )
        monitoring_output_changed = (
            previous_monitoring_output_index
            != _normalize_monitoring_output_index(
                (detail.get("controls") or {}).get("monitoring_output_index")
            )
        )
        current_controls_payload = self._normalize_controls_payload(
            detail.get("controls") if isinstance(detail.get("controls"), dict) else None,
            detail,
        )
        expression_mappings_changed = (
            previous_controls_payload.get("expression_mappings", [])
            != current_controls_payload.get("expression_mappings", [])
        )
        automation_lanes_changed = (
            previous_controls_payload.get("automation_lanes", [])
            != current_controls_payload.get("automation_lanes", [])
        )
        try:
            from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

            current_runtime_payload = await SnapshotRuntimeStateService(self.session).get_live_snapshot_payload()
            is_current_live_snapshot = (
                isinstance(current_runtime_payload, dict)
                and int(current_runtime_payload.get("id") or 0) == int(snapshot.id)
            )
        except Exception as exc:
            logger.debug("Snapshot runtime live-state lookup skipped for %s: %s", snapshot.id, exc)

        if is_current_live_snapshot:
            try:
                runtime_state_service = SnapshotRuntimeStateService(self.session)
                await runtime_state_service.sync_live_snapshot_payload(
                    snapshot_id=snapshot.id,
                    live_snapshot_payload=detail,
                    snapshot_revision=detail.get("snapshot_revision"),
                )
                device_binding_result = None
                if device_binding_changed:
                    device_binding_result = await self._apply_snapshot_audio_device_bindings(detail)
                monitoring_output_result = None
                if monitoring_output_changed:
                    monitoring_output_result = await self._apply_snapshot_monitoring_output_binding(detail)
                expression_mappings_result = None
                if expression_mappings_changed:
                    expression_mappings_result = await self._sync_snapshot_expression_mappings_to_runtime(
                        [
                            dict(entry)
                            for entry in current_controls_payload.get("expression_mappings", [])
                            if isinstance(entry, dict)
                        ]
                    )
                automation_lanes_result = None
                if automation_lanes_changed:
                    automation_lanes_result = await self._sync_snapshot_automation_lanes_to_runtime(
                        [
                            dict(entry)
                            for entry in current_controls_payload.get("automation_lanes", [])
                            if isinstance(entry, dict)
                        ]
                    )
                await self._record_retained_live_runtime_edit(
                    runtime_state_service=runtime_state_service,
                    snapshot_id=snapshot.id,
                    snapshot_revision=detail.get("snapshot_revision"),
                    mutation_kind="update_snapshot",
                    metadata={
                        "changed_fields": changed_fields,
                        "device_binding_changed": device_binding_changed,
                        "device_binding_result": device_binding_result,
                        "monitoring_output_changed": monitoring_output_changed,
                        "monitoring_output_result": monitoring_output_result,
                        "expression_mappings_changed": expression_mappings_changed,
                        "expression_mappings_result": expression_mappings_result,
                        "automation_lanes_changed": automation_lanes_changed,
                        "automation_lanes_result": automation_lanes_result,
                    },
                )
            except Exception as exc:
                logger.debug("Snapshot runtime live-state sync skipped for %s: %s", snapshot.id, exc)

        if tempo_bpm is not UNSET:
            try:
                from app.services.snapshot_tempo_service import get_snapshot_tempo_service

                snapshot_payload = None
                if is_current_live_snapshot:
                    snapshot_payload = copy.deepcopy(detail)
                await get_snapshot_tempo_service().update_stored_tempo(
                    snapshot.id,
                    snapshot.tempo_bpm,
                    snapshot_data=snapshot_payload,
                )
            except Exception as exc:
                logger.debug("Snapshot tempo runtime update skipped for %s: %s", snapshot.id, exc)
        return detail

    async def create_template(
        self,
        *,
        name: str,
        description: str = "",
        tags: Optional[list[str]] = None,
        input_device: Optional[str] = None,
        output_device: Optional[str] = None,
        controls_payload: Optional[dict[str, Any]] = None,
        detail_payload: Optional[dict[str, Any]] = None,
        is_favorite: bool = False,
        is_locked: bool = False,
    ) -> dict[str, Any]:
        return await self.create_snapshot(
            name=name,
            description=description,
            tags=tags,
            input_device=input_device,
            output_device=output_device,
            controls_payload=controls_payload,
            detail_payload=detail_payload,
            is_favorite=is_favorite,
            is_locked=is_locked,
            capture_current_authority_extensions=False,
            document_type="template",
        )

    async def update_template(
        self,
        template_id: int,
        **kwargs: Any,
    ) -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(template_id)
        if snapshot is None or self._snapshot_document_type(snapshot) != "template":
            return None
        kwargs["document_type"] = "template"
        kwargs.setdefault("capture_current_authority_extensions", False)
        updated = await self.update_snapshot(template_id, **kwargs)
        if updated is None:
            return None
        await self._cascade_live_linked_snapshots(template_id)
        return updated

    async def delete_snapshot(self, snapshot_id: int) -> bool:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return False

        control_plane_snapshot_id = await self.get_control_plane_snapshot_id()
        if control_plane_snapshot_id == snapshot_id:
            raise ValueError("Cannot delete a live snapshot.")

        await _delete_snapshot_program_binding(
            MidiBindingAuthority(self.session),
            snapshot_id,
        )
        await self.session.delete(snapshot)
        await self.session.flush()
        return True

    async def list_revisions(self, snapshot_id: int) -> Optional[list[dict[str, Any]]]:
        return await self.state_authority_revisions.list_revisions(snapshot_id)

    async def restore_revision(
        self,
        snapshot_id: int,
        revision_number: int,
    ) -> Optional[dict[str, Any]]:
        return await self.state_authority_revisions.restore_revision(snapshot_id, revision_number)

    async def duplicate_snapshot(self, snapshot_id: int) -> Optional[dict[str, Any]]:
        snapshot = await self.get_snapshot(snapshot_id)
        if snapshot is None:
            return None
        duplicate_name = await self._build_duplicate_snapshot_name(snapshot.get("name"))
        duplicate_controls_payload = _clear_snapshot_program_assignments(copy.deepcopy(snapshot.get("controls") or {}))
        duplicate_detail_payload = _clear_snapshot_program_assignments(copy.deepcopy(snapshot))
        return await self.create_snapshot(
            name=duplicate_name,
            description=snapshot.get("description", ""),
            tags=list(snapshot.get("tags", [])),
            program_number=None,
            tempo_bpm=_safe_float(snapshot.get("tempo_bpm"), DEFAULT_SNAPSHOT_TEMPO_BPM),
            derived_from_snapshot_id=snapshot_id,
            input_device=snapshot.get("input_device"),
            output_device=snapshot.get("output_device"),
            controls_payload=duplicate_controls_payload,
            detail_payload=duplicate_detail_payload,
            is_favorite=bool(snapshot.get("is_favorite", False)),
            is_locked=False,
            apply_default_system_blocks=False,
            capture_current_authority_extensions=False,
        )

    async def save_snapshot_as_new(
        self,
        snapshot_id: int,
        *,
        name: Optional[str] = None,
        description: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        snapshot = await self.get_snapshot(snapshot_id)
        if snapshot is None:
            return None
        next_name = name if name is not None else sanitize_snapshot_name_seed(snapshot.get("name"))
        return await self.create_snapshot(
            name=next_name,
            description=snapshot.get("description", "") if description is None else description,
            tags=list(snapshot.get("tags", [])),
            program_number=None,
            tempo_bpm=_safe_float(snapshot.get("tempo_bpm"), DEFAULT_SNAPSHOT_TEMPO_BPM),
            derived_from_snapshot_id=snapshot_id,
            input_device=snapshot.get("input_device"),
            output_device=snapshot.get("output_device"),
            controls_payload=snapshot.get("controls"),
            detail_payload=snapshot,
            is_favorite=bool(snapshot.get("is_favorite", False)),
            is_locked=False,
            apply_default_system_blocks=False,
            capture_current_authority_extensions=False,
        )

    async def add_channel(self, snapshot_id: int, payload: Optional[dict[str, Any]] = None) -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None

        next_index = len(snapshot.channels)
        payload = payload or {}
        solo_enabled = _normalize_bool(payload.get("solo"), False)
        if solo_enabled:
            await self._clear_snapshot_solo_flags(snapshot_id)
        channel = SnapshotChannel(
            snapshot_id=snapshot.id,
            chain_id=_safe_int(payload.get("chain_id", payload.get("chainId"))),
            channel_key=str(payload.get("channel_key") or payload.get("id") or f"channel-{next_index}"),
            label=str(payload.get("label") or _stable_channel_label(next_index)),
            color=str(payload.get("color") or DEFAULT_CHANNEL_COLOR),
            muted=_normalize_bool(payload.get("muted"), False),
            solo=solo_enabled,
            dry_wet_mix=_safe_float(payload.get("dry_wet_mix", payload.get("dryWetMix")), DEFAULT_DRY_WET_MIX),
            order_index=next_index,
        )
        self.session.add(channel)
        await self.session.flush()
        await self._sync_snapshot_document_from_relational_projection(snapshot_id)
        return await self._reload_snapshot_detail(snapshot_id)

    async def update_channel(
        self,
        snapshot_id: int,
        channel_id: int,
        payload: dict[str, Any],
    ) -> Optional[dict[str, Any]]:
        channel = await self._get_channel(snapshot_id, channel_id)
        if channel is None:
            return None

        if "chain_id" in payload or "chainId" in payload:
            channel.chain_id = _safe_int(payload.get("chain_id", payload.get("chainId")))
        if "channel_key" in payload or "id" in payload:
            channel.channel_key = str(payload.get("channel_key") or payload.get("id") or channel.channel_key)
        if "label" in payload:
            channel.label = str(payload.get("label") or channel.label)
        if "color" in payload:
            channel.color = str(payload.get("color") or channel.color)
        if "muted" in payload:
            channel.muted = _normalize_bool(payload.get("muted"), channel.muted)
        if "solo" in payload:
            channel.solo = _normalize_bool(payload.get("solo"), channel.solo)
            if channel.solo:
                await self._clear_snapshot_solo_flags(snapshot_id, keep_channel_id=channel.id)
        if "dry_wet_mix" in payload or "dryWetMix" in payload:
            channel.dry_wet_mix = _safe_float(payload.get("dry_wet_mix", payload.get("dryWetMix")), channel.dry_wet_mix)
        if "order_index" in payload or "order" in payload:
            channel.order_index = _safe_int(payload.get("order_index", payload.get("order"))) or channel.order_index

        channel.updated_at = _utcnow()
        await self.session.flush()
        await self._sync_snapshot_document_from_relational_projection(snapshot_id)
        detail = await self._reload_snapshot_detail(snapshot_id)
        if detail is None:
            return None

        try:
            from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

            runtime_state_service = SnapshotRuntimeStateService(self.session)
            current_runtime_payload = await runtime_state_service.get_live_snapshot_payload()
            is_current_live_snapshot = (
                isinstance(current_runtime_payload, dict)
                and int(current_runtime_payload.get("id") or 0) == int(snapshot_id)
            )
            if is_current_live_snapshot:
                await runtime_state_service.sync_live_snapshot_payload(
                    snapshot_id=snapshot_id,
                    live_snapshot_payload=detail,
                    snapshot_revision=detail.get("snapshot_revision"),
                )
                detail["channel_state_apply"] = await self._sync_snapshot_channel_state_to_runtime(detail)
                await self._record_retained_live_runtime_edit(
                    runtime_state_service=runtime_state_service,
                    snapshot_id=snapshot_id,
                    snapshot_revision=detail.get("snapshot_revision"),
                    mutation_kind="update_channel",
                    metadata={
                        "channel_id": int(channel.id),
                        "channel_key": str(channel.channel_key or ""),
                        "channel_label": str(channel.label or channel.channel_key or f"Channel {channel.id}"),
                        "changed_fields": sorted(
                            {
                                {
                                    "chainId": "chain_id",
                                    "id": "channel_key",
                                    "dryWetMix": "dry_wet_mix",
                                    "order": "order_index",
                                }.get(str(field_name), str(field_name))
                                for field_name in payload.keys()
                                if str(field_name)
                            }
                        ),
                        "channel_state_apply": detail.get("channel_state_apply"),
                    },
                )
        except Exception as exc:
            logger.debug("Snapshot channel live-state/authority sync skipped for %s: %s", snapshot_id, exc)

        return detail

    async def _clear_snapshot_solo_flags(
        self,
        snapshot_id: int,
        *,
        keep_channel_id: Optional[int] = None,
    ) -> None:
        statement = (
            update(SnapshotChannel)
            .where(
                SnapshotChannel.snapshot_id == snapshot_id,
                SnapshotChannel.solo.is_(True),
            )
            .values(solo=False, updated_at=_utcnow())
        )
        if keep_channel_id is not None:
            statement = statement.where(SnapshotChannel.id != keep_channel_id)
        await self.session.execute(statement)

    async def remove_channel(self, snapshot_id: int, channel_id: int) -> Optional[dict[str, Any]]:
        channel = await self._get_channel(snapshot_id, channel_id)
        if channel is None:
            return None
        await self.session.delete(channel)
        await self.session.flush()
        await self._resequence_channels(snapshot_id)
        await self._sync_snapshot_document_from_relational_projection(snapshot_id)
        return await self._reload_snapshot_detail(snapshot_id)

    async def create_chain(self, snapshot_id: int, name: str) -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None
        next_index = len(snapshot.chains)
        chain = SnapshotChain(snapshot_id=snapshot.id, name=name.strip() or f"Chain {next_index + 1}", order_index=next_index)
        self.session.add(chain)
        await self.session.flush()
        system_gate = build_system_noise_gate_plugin(position=0)
        self.session.add(
            SnapshotChainPlugin(
                snapshot_chain_id=chain.id,
                plugin_uri=system_gate["uri"],
                plugin_name=system_gate["name"],
                position=0,
                bypass=bool(system_gate.get("bypass", False)),
                parameters=dict(system_gate.get("parameters") or {}),
                loader_state=dict(system_gate.get("loader_state") or {}),
                is_placeholder=bool(system_gate.get("is_placeholder", False)),
            )
        )
        await self.session.flush()
        await self._sync_snapshot_tags(snapshot_id)
        await self._sync_snapshot_document_from_relational_projection(snapshot_id)
        return await self._reload_snapshot_detail(snapshot_id)

    async def rename_chain(self, snapshot_id: int, chain_id: int, name: str) -> Optional[dict[str, Any]]:
        chain = await self._get_chain(snapshot_id, chain_id)
        if chain is None:
            return None
        chain.name = name.strip() or chain.name
        chain.updated_at = _utcnow()
        await self.session.flush()
        await self._sync_snapshot_document_from_relational_projection(snapshot_id)
        return await self._reload_snapshot_detail(snapshot_id)

    async def _sync_live_payload_after_plugin_mutation(
        self,
        snapshot_id: int,
        *,
        mutation_kind: str,
        metadata: dict[str, Any],
    ) -> Optional[dict[str, Any]]:
        """Reload the snapshot detail and re-sync `live_snapshot_payload` if this
        snapshot is currently the live one. Without this sync, plugin
        adds/removes/reorders/bypasses on the live snapshot are invisible to
        every consumer of `live_snapshot_payload` (home chyron card, GCP, MIDI
        commander, launch control surface, etc.) because the row-stored
        payload is only refreshed by other mutation paths.
        """
        detail = await self._reload_snapshot_detail(snapshot_id)
        if detail is None:
            return None

        try:
            from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

            runtime_state_service = SnapshotRuntimeStateService(self.session)
            current_runtime_payload = await runtime_state_service.get_live_snapshot_payload()
            is_current_live_snapshot = (
                isinstance(current_runtime_payload, dict)
                and int(current_runtime_payload.get("id") or 0) == int(snapshot_id)
            )
            if is_current_live_snapshot:
                await runtime_state_service.sync_live_snapshot_payload(
                    snapshot_id=snapshot_id,
                    live_snapshot_payload=detail,
                    snapshot_revision=detail.get("snapshot_revision"),
                )
                await self._record_retained_live_runtime_edit(
                    runtime_state_service=runtime_state_service,
                    snapshot_id=snapshot_id,
                    snapshot_revision=detail.get("snapshot_revision"),
                    mutation_kind=mutation_kind,
                    metadata=metadata,
                )
        except Exception as exc:
            logger.debug("Snapshot plugin live-state sync skipped for %s: %s", snapshot_id, exc)

        return detail

    async def add_plugin(
        self,
        snapshot_id: int,
        chain_id: int,
        plugin_uri: str,
        *,
        plugin_name: Optional[str] = None,
        loader_state: Optional[dict[str, Any]] = None,
    ) -> Optional[dict[str, Any]]:
        chain = await self._get_chain(snapshot_id, chain_id)
        if chain is None:
            return None
        next_position = len(chain.plugins)
        loader_state = loader_state or {}
        plugin = SnapshotChainPlugin(
            snapshot_chain_id=chain.id,
            plugin_uri=plugin_uri,
            plugin_name=plugin_name,
            position=next_position,
            bypass=False,
            parameters={},
            loader_state=loader_state,
            is_placeholder=not _plugin_available(plugin_uri),
        )
        self.session.add(plugin)
        await self.session.flush()
        await self._sync_snapshot_tags(snapshot_id)
        await self._sync_snapshot_document_from_relational_projection(snapshot_id)
        return await self._sync_live_payload_after_plugin_mutation(
            snapshot_id,
            mutation_kind="add_plugin",
            metadata={
                "chain_id": int(chain_id),
                "plugin_uri": str(plugin_uri),
                "plugin_name": plugin_name,
                "position": int(next_position),
            },
        )

    async def remove_plugin(
        self,
        snapshot_id: int,
        chain_id: int,
        plugin_id: int,
    ) -> Optional[dict[str, Any]]:
        plugin = await self._get_plugin(snapshot_id, chain_id, plugin_id)
        if plugin is None:
            return None
        if self._snapshot_chain_plugin_is_system_noise_gate(plugin):
            raise ValueError("The system noise gate cannot be removed from a snapshot chain.")
        plugin_uri = str(plugin.plugin_uri)
        await self.session.delete(plugin)
        await self.session.flush()
        await self._resequence_plugins(chain_id)
        await self._sync_snapshot_tags(snapshot_id)
        await self._sync_snapshot_document_from_relational_projection(snapshot_id)
        return await self._sync_live_payload_after_plugin_mutation(
            snapshot_id,
            mutation_kind="remove_plugin",
            metadata={
                "chain_id": int(chain_id),
                "plugin_id": int(plugin_id),
                "plugin_uri": plugin_uri,
            },
        )

    async def reorder_plugins(
        self,
        snapshot_id: int,
        chain_id: int,
        plugin_ids: list[int],
    ) -> Optional[dict[str, Any]]:
        chain = await self._get_chain(snapshot_id, chain_id)
        if chain is None:
            return None
        plugin_map = {plugin.id: plugin for plugin in chain.plugins}
        system_gate_plugin = next(
            (plugin for plugin in chain.plugins if self._snapshot_chain_plugin_is_system_noise_gate(plugin)),
            None,
        )
        if system_gate_plugin is not None:
            if not plugin_ids or plugin_ids[0] != system_gate_plugin.id:
                raise ValueError("The system noise gate must stay in the first position.")
        for index, plugin_id in enumerate(plugin_ids):
            plugin = plugin_map.get(plugin_id)
            if plugin is not None:
                plugin.position = index
        await self.session.flush()
        await self._resequence_plugins(chain_id)
        await self._sync_snapshot_document_from_relational_projection(snapshot_id)
        return await self._sync_live_payload_after_plugin_mutation(
            snapshot_id,
            mutation_kind="reorder_plugins",
            metadata={
                "chain_id": int(chain_id),
                "plugin_ids": [int(p) for p in plugin_ids],
            },
        )

    async def set_plugin_bypass(
        self,
        snapshot_id: int,
        chain_id: int,
        plugin_id: int,
        bypass: bool,
    ) -> Optional[dict[str, Any]]:
        plugin = await self._get_plugin(snapshot_id, chain_id, plugin_id)
        if plugin is None:
            return None
        plugin.bypass = bool(bypass)
        plugin.updated_at = _utcnow()
        await self.session.flush()
        await self._sync_snapshot_document_from_relational_projection(snapshot_id)
        return await self._sync_live_payload_after_plugin_mutation(
            snapshot_id,
            mutation_kind="set_plugin_bypass",
            metadata={
                "chain_id": int(chain_id),
                "plugin_id": int(plugin_id),
                "bypass": bool(bypass),
            },
        )

    async def set_plugin_parameters(
        self,
        snapshot_id: int,
        chain_id: int,
        plugin_id: int,
        parameters: dict[str, Any],
    ) -> Optional[dict[str, Any]]:
        plugin = await self._get_plugin(snapshot_id, chain_id, plugin_id)
        if plugin is None:
            return None
        next_parameters: dict[str, float] = {}
        for key, value in dict(parameters).items():
            try:
                next_parameters[str(key)] = float(value)
            except (TypeError, ValueError):
                continue
        plugin.parameters = next_parameters
        plugin.updated_at = _utcnow()
        await self.session.flush()
        await self._sync_snapshot_document_from_relational_projection(snapshot_id)
        return await self._sync_live_payload_after_plugin_mutation(
            snapshot_id,
            mutation_kind="set_plugin_parameters",
            metadata={
                "chain_id": int(chain_id),
                "plugin_id": int(plugin_id),
                "parameter_keys": sorted(next_parameters.keys()),
            },
        )

    async def update_plugin_parameter_by_position(
        self,
        snapshot_id: int,
        chain_id: int,
        plugin_position: int,
        parameter_key: str,
        value: float,
    ) -> Optional[dict[str, Any]]:
        chain = await self._get_chain(snapshot_id, chain_id)
        if chain is None:
            return None
        plugin = next(
            (
                item
                for item in chain.plugins
                if int(getattr(item, "position", -1)) == int(plugin_position)
            ),
            None,
        )
        if plugin is None:
            return None
        parameters = dict(plugin.parameters or {})
        parameters[str(parameter_key)] = float(value)
        plugin.parameters = parameters
        plugin.updated_at = _utcnow()
        await self.session.flush()
        await self._sync_snapshot_document_from_relational_projection(snapshot_id)
        detail = await self._reload_snapshot_detail(snapshot_id)
        if detail is None:
            return None

        try:
            from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

            runtime_state_service = SnapshotRuntimeStateService(self.session)
            current_runtime_payload = await runtime_state_service.get_live_snapshot_payload()
            is_current_live_snapshot = (
                isinstance(current_runtime_payload, dict)
                and int(current_runtime_payload.get("id") or 0) == int(snapshot_id)
            )
            if is_current_live_snapshot:
                await runtime_state_service.sync_live_snapshot_payload(
                    snapshot_id=snapshot_id,
                    live_snapshot_payload=detail,
                    snapshot_revision=detail.get("snapshot_revision"),
                )
                await self._record_retained_live_runtime_edit(
                    runtime_state_service=runtime_state_service,
                    snapshot_id=snapshot_id,
                    snapshot_revision=detail.get("snapshot_revision"),
                    mutation_kind="update_plugin_parameter_by_position",
                    metadata={
                        "chain_id": int(chain_id),
                        "plugin_position": int(plugin_position),
                        "parameter_key": str(parameter_key),
                        "parameter_value": float(value),
                    },
                )
        except Exception as exc:
            logger.debug("Snapshot parameter live sync skipped for %s: %s", snapshot_id, exc)
        return detail

    async def update_routing(self, snapshot_id: int, payload: dict[str, Any]) -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None

        routing = snapshot.routing
        if routing is None:
            routing = SnapshotRouting(snapshot_id=snapshot.id)
            self.session.add(routing)
            await self.session.flush()
        previous_mode = _normalize_mode(routing.mode)

        if "mode" in payload:
            routing.mode = _normalize_mode(payload.get("mode"))
        if "active_channel_key" in payload or "activeChannelId" in payload or "activeSlotId" in payload:
            routing.active_channel_key = str(
                payload.get("active_channel_key")
                or payload.get("activeChannelId")
                or payload.get("activeSlotId")
                or ""
            ) or None
        if "blend_positions" in payload or "blendPositions" in payload:
            blend_positions = payload.get("blend_positions", payload.get("blendPositions")) or {}
            routing.blend_positions = dict(blend_positions) if isinstance(blend_positions, dict) else {}
        if "morph_position" in payload or "morphProgress" in payload:
            routing.morph_position = _safe_float(payload.get("morph_position", payload.get("morphProgress")), routing.morph_position)
        if "morph_source_channel_key" in payload or "morphSourceChannelId" in payload or "morphSourceSlotId" in payload:
            routing.morph_source_channel_key = str(
                payload.get("morph_source_channel_key")
                or payload.get("morphSourceChannelId")
                or payload.get("morphSourceSlotId")
                or ""
            ) or None
        if "morph_target_channel_key" in payload or "morphTargetChannelId" in payload or "morphTargetSlotId" in payload:
            routing.morph_target_channel_key = str(
                payload.get("morph_target_channel_key")
                or payload.get("morphTargetChannelId")
                or payload.get("morphTargetSlotId")
                or ""
            ) or None
        if "series_order" in payload or "seriesOrder" in payload:
            series_order = payload.get("series_order", payload.get("seriesOrder")) or []
            routing.series_order = list(series_order) if isinstance(series_order, list) else []
        routing.updated_at = _utcnow()
        await self.session.flush()
        await self._sync_snapshot_document_from_relational_projection(snapshot_id)
        detail = await self._reload_snapshot_detail(snapshot_id)
        if detail is None:
            return None

        try:
            from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

            runtime_state_service = SnapshotRuntimeStateService(self.session)
            current_runtime_payload = await runtime_state_service.get_live_snapshot_payload()
            is_current_live_snapshot = (
                isinstance(current_runtime_payload, dict)
                and int(current_runtime_payload.get("id") or 0) == int(snapshot.id)
            )
            if is_current_live_snapshot:
                await runtime_state_service.sync_live_snapshot_payload(
                    snapshot_id=snapshot.id,
                    live_snapshot_payload=detail,
                    snapshot_revision=detail.get("snapshot_revision"),
                )
                requested_mode = _normalize_mode(detail.get("routing", {}).get("mode"))
                routing_requires_reactivation = False
                detail["routing_requires_reactivation"] = routing_requires_reactivation
                detail["routing_mode_changed_live"] = requested_mode != previous_mode
                detail["routing_apply"] = await snapshot_runtime_service.apply_snapshot_routing_to_engine(detail)
                detail["morph_apply"] = await snapshot_runtime_service.apply_snapshot_morph_to_engine(detail)
                await self._record_retained_live_runtime_edit(
                    runtime_state_service=runtime_state_service,
                    snapshot_id=snapshot.id,
                    snapshot_revision=detail.get("snapshot_revision"),
                    mutation_kind="update_routing",
                    metadata={
                        "changed_fields": sorted(
                            {
                                str(field_name)
                                for field_name in payload.keys()
                                if str(field_name)
                            }
                        ),
                        "previous_mode": previous_mode,
                        "requested_mode": requested_mode,
                        "routing_mode_changed_live": bool(detail.get("routing_mode_changed_live")),
                        "routing_apply": detail.get("routing_apply"),
                        "morph_apply": detail.get("morph_apply"),
                    },
                )
        except Exception as exc:
            logger.debug("Snapshot routing live-state/authority sync skipped for %s: %s", snapshot.id, exc)

        return detail

    async def set_morph_position(self, snapshot_id: int, morph_position: float) -> Optional[dict[str, Any]]:
        return await self.update_routing(snapshot_id, {"morph_position": morph_position})

    async def replace_midi_map(self, snapshot_id: int, entries: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None

        midi_map = snapshot.midi_map
        if midi_map is None:
            midi_map = SnapshotMidiMap(snapshot_id=snapshot.id, entries=[])
            self.session.add(midi_map)
            await self.session.flush()

        normalized_entries = [dict(entry) for entry in entries]
        midi_map.entries = normalized_entries
        midi_map.updated_at = _utcnow()
        merged_controls_payload = dict(snapshot.controls_payload or {})
        merged_controls_payload["midi_map"] = normalized_entries
        snapshot.controls_payload = self._normalize_controls_payload(
            merged_controls_payload,
            {"midi_map": normalized_entries},
        )
        snapshot.updated_at = _utcnow()
        await self.session.flush()
        await self._sync_snapshot_document_from_relational_projection(snapshot_id)
        detail = await self._reload_snapshot_detail(snapshot_id)
        if detail is None:
            return None

        try:
            from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

            runtime_state_service = SnapshotRuntimeStateService(self.session)
            current_runtime_payload = await runtime_state_service.get_live_snapshot_payload()
            is_current_live_snapshot = (
                isinstance(current_runtime_payload, dict)
                and int(current_runtime_payload.get("id") or 0) == int(snapshot.id)
            )
            if is_current_live_snapshot:
                await runtime_state_service.sync_live_snapshot_payload(
                    snapshot_id=snapshot.id,
                    live_snapshot_payload=detail,
                    snapshot_revision=detail.get("snapshot_revision"),
                )
                midi_map_sync_result = await self._sync_snapshot_midi_map_to_engine(snapshot.id, normalized_entries)
                await self._record_retained_live_runtime_edit(
                    runtime_state_service=runtime_state_service,
                    snapshot_id=snapshot.id,
                    snapshot_revision=detail.get("snapshot_revision"),
                    mutation_kind="replace_midi_map",
                    metadata={
                        "entry_count": len(normalized_entries),
                        "midi_map_sync_result": midi_map_sync_result,
                    },
                )
        except Exception as exc:
            logger.debug("Snapshot MIDI-map live sync skipped for %s: %s", snapshot.id, exc)

        return detail

    async def _resolve_template_linked_normalized(
        self,
        normalized: dict[str, Any],
        *,
        existing_snapshot: Snapshot | None = None,
    ) -> dict[str, Any]:
        extensions = copy.deepcopy(normalized.get("extensions") or {})
        template_link = self._extract_template_link_metadata(extensions)
        if template_link is None and existing_snapshot is not None:
            existing_extensions = (
                copy.deepcopy(existing_snapshot.extensions_payload)
                if isinstance(existing_snapshot.extensions_payload, dict)
                else {}
            )
            existing_link = self._extract_template_link_metadata(existing_extensions)
            if existing_link is not None:
                extensions = self._set_template_link_metadata(extensions, existing_link)
                normalized = copy.deepcopy(normalized)
                normalized["extensions"] = extensions
                template_link = existing_link
        if template_link is None:
            return normalized

        template_id = _safe_int(template_link.get("template_id"))
        if template_id is None:
            raise ValueError("Template live-link metadata requires a valid template_id.")

        template_snapshot = await self._get_snapshot_model(template_id)
        if template_snapshot is None or self._snapshot_document_type(template_snapshot) != "template":
            raise ValueError(f"Template {template_id} not found.")

        base_normalized = await self._snapshot_to_normalized(template_snapshot)
        base_for_overlay = self._strip_template_link_namespace(base_normalized)
        current_for_overlay = self._strip_template_link_namespace(normalized)
        overlay = template_link.get("overlay")
        if not isinstance(overlay, dict):
            overlay = self._build_template_overlay(base_for_overlay, current_for_overlay)

        merged = self._merge_template_overlay(base_for_overlay, overlay)
        merged_extensions = copy.deepcopy(merged.get("extensions") or {})
        merged_extensions = self._set_template_link_metadata(
            merged_extensions,
            {
                "template_id": int(template_id),
                "live_link": bool(template_link.get("live_link", True)),
                "overlay": overlay,
            },
        )
        merged["extensions"] = merged_extensions
        return merged

    async def _cascade_live_linked_snapshots(self, template_id: int) -> None:
        result = await self.session.execute(select(Snapshot.id))
        snapshot_ids = [int(snapshot_id) for snapshot_id in result.scalars().all()]
        for snapshot_id in snapshot_ids:
            snapshot = await self._get_snapshot_model(snapshot_id)
            if snapshot is None:
                continue
            if self._snapshot_document_type(snapshot) == "template":
                continue
            template_link = self._extract_template_link_metadata(snapshot.extensions_payload or {})
            if not isinstance(template_link, dict):
                continue
            if not bool(template_link.get("live_link", True)):
                continue
            if _safe_int(template_link.get("template_id")) != int(template_id):
                continue

            linked_normalized = await self._snapshot_to_normalized(snapshot)
            resolved = await self._resolve_template_linked_normalized(
                linked_normalized,
                existing_snapshot=snapshot,
            )
            resolved = await self._enrich_normalized_payload(resolved)
            await self._replace_snapshot_state(snapshot, resolved)
            snapshot.tags = self._derive_snapshot_tags_from_normalized(resolved)
            await self._persist_snapshot_document(snapshot, resolved, document_type="snapshot")
        await self.session.flush()

    @staticmethod
    def _template_link_path(extensions: dict[str, Any]) -> dict[str, Any] | None:
        namespace = extensions.get(_TEMPLATE_LINK_NAMESPACE)
        if not isinstance(namespace, dict):
            return None
        template_link = namespace.get(_TEMPLATE_LINK_KEY)
        return template_link if isinstance(template_link, dict) else None

    @classmethod
    def _extract_template_link_metadata(cls, extensions: dict[str, Any]) -> dict[str, Any] | None:
        if not isinstance(extensions, dict):
            return None
        template_link = cls._template_link_path(extensions)
        if not isinstance(template_link, dict):
            return None
        template_id = _safe_int(template_link.get("template_id"))
        if template_id is None:
            return None
        return {
            "template_id": int(template_id),
            "live_link": bool(template_link.get("live_link", True)),
            "overlay": (
                copy.deepcopy(template_link.get("overlay"))
                if isinstance(template_link.get("overlay"), dict)
                else None
            ),
        }

    @staticmethod
    def _set_template_link_metadata(extensions: dict[str, Any], metadata: dict[str, Any]) -> dict[str, Any]:
        next_extensions = copy.deepcopy(extensions or {})
        namespace = next_extensions.get(_TEMPLATE_LINK_NAMESPACE)
        if not isinstance(namespace, dict):
            namespace = {}
        namespace[_TEMPLATE_LINK_KEY] = {
            "template_id": int(metadata["template_id"]),
            "live_link": bool(metadata.get("live_link", True)),
            "overlay": copy.deepcopy(metadata.get("overlay") or {}),
        }
        next_extensions[_TEMPLATE_LINK_NAMESPACE] = namespace
        return next_extensions

    @classmethod
    def _strip_template_link_namespace(cls, normalized: dict[str, Any]) -> dict[str, Any]:
        cleaned = copy.deepcopy(normalized)
        extensions = cleaned.get("extensions")
        if not isinstance(extensions, dict):
            cleaned["extensions"] = {}
            return cleaned
        namespace = extensions.get(_TEMPLATE_LINK_NAMESPACE)
        if isinstance(namespace, dict):
            namespace = dict(namespace)
            namespace.pop(_TEMPLATE_LINK_KEY, None)
            if namespace:
                extensions[_TEMPLATE_LINK_NAMESPACE] = namespace
            else:
                extensions.pop(_TEMPLATE_LINK_NAMESPACE, None)
        cleaned["extensions"] = extensions
        return cleaned

    def _build_template_overlay(
        self,
        base: dict[str, Any],
        current: dict[str, Any],
    ) -> dict[str, Any]:
        overlay: dict[str, Any] = {}

        channel_overlay = self._build_template_channel_overlay(
            base.get("channels") or [],
            current.get("channels") or [],
        )
        if channel_overlay:
            overlay["channels"] = channel_overlay

        chain_overlay = self._build_template_chain_overlay(
            base.get("chains") or [],
            current.get("chains") or [],
        )
        if chain_overlay:
            overlay["chains"] = chain_overlay

        routing_overlay = self._deep_diff_mapping(
            base.get("routing") or {},
            current.get("routing") or {},
        )
        if routing_overlay:
            overlay["routing"] = routing_overlay

        if self._canonicalize_json_value_for_templates(base.get("midi_map") or []) != self._canonicalize_json_value_for_templates(current.get("midi_map") or []):
            overlay["midi_map"] = copy.deepcopy(current.get("midi_map") or [])

        extensions_overlay = self._deep_diff_mapping(
            base.get("extensions") or {},
            current.get("extensions") or {},
        )
        if extensions_overlay:
            overlay["extensions"] = extensions_overlay

        return overlay

    def _merge_template_overlay(
        self,
        base: dict[str, Any],
        overlay: dict[str, Any],
    ) -> dict[str, Any]:
        merged = copy.deepcopy(base)
        merged["channels"] = self._merge_template_channels(
            base.get("channels") or [],
            overlay.get("channels") or [],
        )
        merged["chains"] = self._merge_template_chains(
            base.get("chains") or [],
            overlay.get("chains") or [],
        )
        if "routing" in overlay:
            merged["routing"] = self._deep_merge_mapping(
                base.get("routing") or {},
                overlay.get("routing") or {},
            )
        if "midi_map" in overlay:
            merged["midi_map"] = copy.deepcopy(overlay.get("midi_map") or [])
        if "extensions" in overlay:
            merged["extensions"] = self._deep_merge_mapping(
                base.get("extensions") or {},
                overlay.get("extensions") or {},
            )
        return merged

    @staticmethod
    def _canonicalize_json_value_for_templates(value: Any) -> Any:
        return _canonicalize_json_value(value)

    def _build_template_channel_overlay(
        self,
        base_channels: list[dict[str, Any]],
        current_channels: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        base_by_key = {
            str(channel.get("channel_key")): channel
            for channel in base_channels
            if isinstance(channel, dict) and channel.get("channel_key") is not None
        }
        overlay: list[dict[str, Any]] = []
        for channel in current_channels:
            if not isinstance(channel, dict) or channel.get("channel_key") is None:
                continue
            channel_key = str(channel.get("channel_key"))
            base_channel = base_by_key.get(channel_key)
            if base_channel is None:
                overlay.append(copy.deepcopy(channel))
                continue
            diff = self._deep_diff_mapping(base_channel, channel)
            if diff:
                diff["channel_key"] = channel_key
                overlay.append(diff)
        return overlay

    def _merge_template_channels(
        self,
        base_channels: list[dict[str, Any]],
        overlay_channels: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        merged_by_key = {
            str(channel.get("channel_key")): copy.deepcopy(channel)
            for channel in base_channels
            if isinstance(channel, dict) and channel.get("channel_key") is not None
        }
        ordered_keys = [str(channel.get("channel_key")) for channel in base_channels if isinstance(channel, dict) and channel.get("channel_key") is not None]
        for channel in overlay_channels:
            if not isinstance(channel, dict) or channel.get("channel_key") is None:
                continue
            channel_key = str(channel.get("channel_key"))
            if channel_key in merged_by_key:
                merged_by_key[channel_key] = self._deep_merge_mapping(merged_by_key[channel_key], channel)
            else:
                merged_by_key[channel_key] = copy.deepcopy(channel)
                ordered_keys.append(channel_key)
        return [merged_by_key[key] for key in ordered_keys if key in merged_by_key]

    def _build_template_chain_overlay(
        self,
        base_chains: list[dict[str, Any]],
        current_chains: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        base_by_key = {
            self._template_chain_overlay_key(chain, index): chain
            for index, chain in enumerate(base_chains)
            if isinstance(chain, dict)
        }
        overlay: list[dict[str, Any]] = []
        for index, chain in enumerate(current_chains):
            if not isinstance(chain, dict):
                continue
            chain_key = self._template_chain_overlay_key(chain, index)
            base_chain = base_by_key.get(chain_key)
            if base_chain is None:
                overlay.append(copy.deepcopy(chain))
                continue
            chain_diff: dict[str, Any] = {
                "source_key": str(chain.get("source_key") or ""),
                "template_chain_name": str(chain.get("name") or ""),
            }
            if chain.get("name") != base_chain.get("name"):
                chain_diff["name"] = chain.get("name")
            plugin_overlay = self._build_template_plugin_overlay(
                base_chain.get("plugins") or [],
                chain.get("plugins") or [],
            )
            if plugin_overlay:
                chain_diff["plugins"] = plugin_overlay
            if self._canonicalize_json_value_for_templates(base_chain.get("loop_insertions") or []) != self._canonicalize_json_value_for_templates(chain.get("loop_insertions") or []):
                chain_diff["loop_insertions"] = copy.deepcopy(chain.get("loop_insertions") or [])
            if self._canonicalize_json_value_for_templates(base_chain.get("effects_loops") or []) != self._canonicalize_json_value_for_templates(chain.get("effects_loops") or []):
                chain_diff["effects_loops"] = copy.deepcopy(chain.get("effects_loops") or [])
            if len(chain_diff) > 1:
                overlay.append(chain_diff)
        return overlay

    def _merge_template_chains(
        self,
        base_chains: list[dict[str, Any]],
        overlay_chains: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        merged_by_key = {
            self._template_chain_overlay_key(chain, index): copy.deepcopy(chain)
            for index, chain in enumerate(base_chains)
            if isinstance(chain, dict)
        }
        ordered_keys = [
            self._template_chain_overlay_key(chain, index)
            for index, chain in enumerate(base_chains)
            if isinstance(chain, dict)
        ]
        for index, chain in enumerate(overlay_chains):
            if not isinstance(chain, dict):
                continue
            chain_key = self._template_chain_overlay_key(chain, index)
            if chain_key not in merged_by_key:
                merged_by_key[chain_key] = copy.deepcopy(chain)
                ordered_keys.append(chain_key)
                continue
            merged_chain = merged_by_key[chain_key]
            if "name" in chain:
                merged_chain["name"] = chain.get("name")
            if "plugins" in chain:
                merged_chain["plugins"] = self._merge_template_plugins(
                    merged_chain.get("plugins") or [],
                    chain.get("plugins") or [],
                )
            if "loop_insertions" in chain:
                merged_chain["loop_insertions"] = copy.deepcopy(chain.get("loop_insertions") or [])
            if "effects_loops" in chain:
                merged_chain["effects_loops"] = copy.deepcopy(chain.get("effects_loops") or [])
            merged_by_key[chain_key] = merged_chain
        return [merged_by_key[key] for key in ordered_keys if key in merged_by_key]

    @staticmethod
    def _template_chain_overlay_key(chain: dict[str, Any], index: int) -> str:
        template_name = str(chain.get("template_chain_name") or "").strip()
        if template_name:
            return f"name:{template_name}"
        name = str(chain.get("name") or "").strip()
        if name:
            return f"name:{name}"
        source_key = str(chain.get("source_key") or "").strip()
        if source_key:
            return f"source:{source_key}"
        return f"index:{index}"

    def _build_template_plugin_overlay(
        self,
        base_plugins: list[dict[str, Any]],
        current_plugins: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        overlay: list[dict[str, Any]] = []
        max_length = max(len(base_plugins), len(current_plugins))
        for index in range(max_length):
            current_plugin = current_plugins[index] if index < len(current_plugins) and isinstance(current_plugins[index], dict) else None
            base_plugin = base_plugins[index] if index < len(base_plugins) and isinstance(base_plugins[index], dict) else None
            if current_plugin is None:
                continue
            if base_plugin is None:
                overlay.append(copy.deepcopy(current_plugin))
                continue
            diff = self._deep_diff_mapping(base_plugin, current_plugin)
            if diff:
                diff["position"] = int(current_plugin.get("position", index))
                overlay.append(diff)
        return overlay

    def _merge_template_plugins(
        self,
        base_plugins: list[dict[str, Any]],
        overlay_plugins: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        merged_plugins = [copy.deepcopy(plugin) for plugin in base_plugins if isinstance(plugin, dict)]
        for index, plugin in enumerate(overlay_plugins):
            if not isinstance(plugin, dict):
                continue
            position = _safe_int(plugin.get("position"))
            if position is None:
                position = index
            while len(merged_plugins) <= position:
                merged_plugins.append({})
            if merged_plugins[position]:
                merged_plugins[position] = self._deep_merge_mapping(merged_plugins[position], plugin)
            else:
                merged_plugins[position] = copy.deepcopy(plugin)
        return merged_plugins

    def _deep_diff_mapping(self, base: dict[str, Any], current: dict[str, Any]) -> dict[str, Any]:
        diff: dict[str, Any] = {}
        for key, current_value in current.items():
            base_value = base.get(key)
            if isinstance(current_value, dict) and isinstance(base_value, dict):
                nested = self._deep_diff_mapping(base_value, current_value)
                if nested:
                    diff[key] = nested
                continue
            if self._canonicalize_json_value_for_templates(base_value) != self._canonicalize_json_value_for_templates(current_value):
                diff[key] = copy.deepcopy(current_value)
        return diff

    def _deep_merge_mapping(self, base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
        merged = copy.deepcopy(base)
        for key, value in override.items():
            if isinstance(value, dict) and isinstance(merged.get(key), dict):
                merged[key] = self._deep_merge_mapping(merged[key], value)
            else:
                merged[key] = copy.deepcopy(value)
        return merged


__all__ = [name for name in globals() if not name.startswith("__")]
