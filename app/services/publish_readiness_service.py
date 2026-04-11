from __future__ import annotations

import copy
from datetime import datetime
from datetime import timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import SnapshotRevision
from app.models.audio_state import (
    AudioStateObservationEnvelope,
    AudioStatePathRecord,
    AudioStatePathStatus,
    PublishBlocker,
    PublishBlockerCode,
    PublishBlockerSeverity,
    PublishConfirmationStatus,
    PublishRepairAction,
    PublishRequirement,
    PublishRequirementStatus,
    PublishScope,
    SnapshotPublishReadiness,
    SnapshotPublishStatus,
)
from app.services.audio_state_authority import AudioStateAuthorityError, AudioStateAuthorityService
from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService
from app.services.snapshot_service import SnapshotActivationPreflightError, SnapshotService
from app.utils.time import utc_now


CONFIRMATION_STALE_AFTER_SECONDS = 3.0


class PublishReadinessService:
    """Derive typed publish readiness for a snapshot from draft, authority, and runtime truth."""

    def __init__(
        self,
        session: AsyncSession,
        *,
        snapshot_service: SnapshotService | None = None,
        authority_service: AudioStateAuthorityService | None = None,
        runtime_state_service: SnapshotRuntimeStateService | None = None,
        stale_after_seconds: float = CONFIRMATION_STALE_AFTER_SECONDS,
    ) -> None:
        self.session = session
        self.snapshot_service = snapshot_service or SnapshotService(session)
        self.authority_service = authority_service or AudioStateAuthorityService()
        self.runtime_state_service = runtime_state_service or SnapshotRuntimeStateService(session)
        self.stale_after_seconds = float(stale_after_seconds)

    async def get_publish_readiness(self, snapshot_id: int) -> SnapshotPublishReadiness:
        detail = await self.snapshot_service.get_snapshot(snapshot_id)
        if detail is None:
            raise ValueError(f"Snapshot {snapshot_id} not found")

        draft_revision_id = await self._latest_revision_id(snapshot_id)
        blockers: list[PublishBlocker] = []
        warnings: list[PublishBlocker] = []
        repairs: dict[str, PublishRepairAction] = {}

        if draft_revision_id is None:
            blockers.append(
                PublishBlocker(
                    id="unsaved_draft",
                    code=PublishBlockerCode.UNSAVED_DRAFT,
                    severity=PublishBlockerSeverity.BLOCKING,
                    scope=PublishScope.DRAFT,
                    title="Save the draft before publishing",
                    operator_message="This snapshot has not been saved as a revision yet.",
                    technical_detail="No snapshot_revisions row exists for this snapshot.",
                    recommended_action="Save draft",
                )
            )

        preflight = await self._collect_preflight(detail)
        blockers.extend(preflight["blockers"])
        for repair in preflight["repairs"]:
            repairs.setdefault(repair.id, repair)

        committed = None
        observations: list[AudioStateObservationEnvelope] = []
        try:
            committed = await self.authority_service.get_committed_state()
            observations = (
                await self.authority_service.list_observations(state_version=committed.value.state_version)
            ).observations
        except AudioStateAuthorityError:
            committed = None
            observations = []

        requested_revision_id: Optional[int] = None
        confirmed_revision_id: Optional[int] = None
        applicable_steps: list[str] = []

        runtime_live_state = await self.runtime_state_service.get_live_state()
        activation_events = await self.runtime_state_service.list_activation_events(limit=8)

        if committed is not None and committed.value.source_snapshot is not None:
            source_snapshot = committed.value.source_snapshot
            if int(source_snapshot.snapshot_id) == int(snapshot_id):
                requested_revision_id = source_snapshot.snapshot_revision_id
                authority_findings = self._collect_authority_findings(
                    detail=detail,
                    committed_state=committed.value,
                    observations=observations,
                    runtime_live_state=runtime_live_state,
                    activation_events=activation_events,
                )
                blockers.extend(authority_findings["blockers"])
                warnings.extend(authority_findings["warnings"])
                for repair in authority_findings["repairs"]:
                    repairs.setdefault(repair.id, repair)
                applicable_steps = authority_findings["applicable_steps"]
                if authority_findings["confirmed"]:
                    confirmed_revision_id = requested_revision_id

        blockers = self._sort_blockers(blockers)
        warnings = self._sort_blockers(warnings)
        requirements = self._build_requirements(
            detail=detail,
            draft_revision_id=draft_revision_id,
            blockers=blockers,
            warnings=warnings,
            requested_revision_id=requested_revision_id,
            confirmed_revision_id=confirmed_revision_id,
        )
        if not applicable_steps:
            applicable_steps = [
                requirement.id
                for requirement in requirements
                if requirement.status != PublishRequirementStatus.NOT_APPLICABLE
            ]

        status = self._resolve_status(
            blockers=blockers,
            warnings=warnings,
            requested_revision_id=requested_revision_id,
            confirmed_revision_id=confirmed_revision_id,
        )

        return SnapshotPublishReadiness(
            snapshot_id=int(snapshot_id),
            draft_revision_id=draft_revision_id,
            requested_revision_id=requested_revision_id,
            confirmed_revision_id=confirmed_revision_id,
            status=status,
            requirements=requirements,
            blockers=blockers,
            warnings=warnings,
            available_repairs=list(repairs.values()),
            applicable_steps=applicable_steps,
        )

    async def _latest_revision_id(self, snapshot_id: int) -> Optional[int]:
        result = await self.session.execute(
            select(SnapshotRevision.id)
            .where(SnapshotRevision.snapshot_id == int(snapshot_id))
            .order_by(SnapshotRevision.revision_number.desc(), SnapshotRevision.id.desc())
            .limit(1)
        )
        revision_id = result.scalar_one_or_none()
        return int(revision_id) if revision_id is not None else None

    async def _collect_preflight(self, detail: dict[str, Any]) -> dict[str, list[Any]]:
        try:
            await self.snapshot_service._validate_snapshot_activation_preflight(detail)
        except SnapshotActivationPreflightError as exc:
            blockers: list[PublishBlocker] = []
            repairs = [self._repair_from_preflight_action(action) for action in exc.repair_actions]
            repairs = [repair for repair in repairs if repair is not None]
            for issue in exc.issues:
                blocker = self._blocker_from_preflight_issue(issue)
                if blocker is not None:
                    blockers.append(blocker)
            if not blockers:
                blockers.append(
                    PublishBlocker(
                        id="snapshot_invalid",
                        code=PublishBlockerCode.SNAPSHOT_INVALID,
                        severity=PublishBlockerSeverity.BLOCKING,
                        scope=PublishScope.DRAFT,
                        title="Snapshot needs attention",
                        operator_message=str(exc.failures[0] if exc.failures else "Snapshot validation failed."),
                        technical_detail=str(exc),
                        recommended_action="Review snapshot issues",
                    )
                )
            return {"blockers": blockers, "repairs": repairs}
        return {"blockers": [], "repairs": []}

    def _blocker_from_preflight_issue(self, issue: dict[str, Any]) -> Optional[PublishBlocker]:
        code = str(issue.get("code") or "").strip().lower()
        channel_label = str(issue.get("channel_label") or "").strip()
        plugin_name = str(issue.get("plugin_name") or "").strip()
        requested_device = str(issue.get("requested_device") or "").strip()
        asset_name = str(issue.get("asset_name") or "").strip()
        message = str(issue.get("message") or "Snapshot preflight validation failed.").strip()

        if code == "missing_plugin":
            return PublishBlocker(
                id=f"plugin_missing:{plugin_name or issue.get('plugin_uri') or 'plugin'}",
                code=PublishBlockerCode.PLUGIN_MISSING,
                severity=PublishBlockerSeverity.BLOCKING,
                scope=PublishScope.CHANNEL if channel_label else PublishScope.DRAFT,
                title="Required plugin is missing",
                operator_message=message,
                technical_detail=str(issue.get("plugin_uri") or "") or None,
                recommended_action="Install missing plugin",
                repair_action_id="install_plugin",
                related_path_ids=[channel_label] if channel_label else [],
            )
        if code == "missing_asset":
            return PublishBlocker(
                id=f"asset_missing:{asset_name or issue.get('asset_path') or 'asset'}",
                code=PublishBlockerCode.ASSET_MISSING,
                severity=PublishBlockerSeverity.BLOCKING,
                scope=PublishScope.CHANNEL if channel_label else PublishScope.DRAFT,
                title="Required asset is missing",
                operator_message=message,
                technical_detail=str(issue.get("asset_path") or "") or None,
                recommended_action="Restore missing asset",
                repair_action_id="restore_asset",
                related_path_ids=[channel_label] if channel_label else [],
            )
        if code == "missing_input_device":
            return PublishBlocker(
                id=f"audio_input_missing:{requested_device or 'input'}",
                code=PublishBlockerCode.AUDIO_INPUT_MISSING,
                severity=PublishBlockerSeverity.BLOCKING,
                scope=PublishScope.NODE,
                title="Input device needs attention",
                operator_message=message,
                technical_detail=requested_device or None,
                recommended_action="Assign input device",
                repair_action_id="select_available_device",
            )
        if code == "missing_output_device":
            return PublishBlocker(
                id=f"audio_output_missing:{requested_device or 'output'}",
                code=PublishBlockerCode.AUDIO_OUTPUT_MISSING,
                severity=PublishBlockerSeverity.BLOCKING,
                scope=PublishScope.NODE,
                title="Output device needs attention",
                operator_message=message,
                technical_detail=requested_device or None,
                recommended_action="Assign output device",
                repair_action_id="select_available_device",
            )
        return None

    def _repair_from_preflight_action(self, action: dict[str, Any]) -> Optional[PublishRepairAction]:
        action_id = str(action.get("action") or "").strip()
        if not action_id:
            return None
        path_ref = str(action.get("channel_label") or "").strip()
        node_ref = str(action.get("node_id") or "").strip()
        return PublishRepairAction(
            id=action_id,
            label=str(action.get("message") or action_id.replace("_", " ").title()).strip(),
            operator_message=str(action.get("message") or "").strip() or None,
            technical_detail=None,
            scope=PublishScope.CHANNEL if path_ref else PublishScope.NODE,
            related_path_ids=[path_ref] if path_ref else [],
            related_node_ids=[node_ref] if node_ref else [],
        )

    def _collect_authority_findings(
        self,
        *,
        detail: dict[str, Any],
        committed_state: Any,
        observations: list[AudioStateObservationEnvelope],
        runtime_live_state: dict[str, Any],
        activation_events: list[dict[str, Any]],
    ) -> dict[str, Any]:
        blockers: list[PublishBlocker] = []
        warnings: list[PublishBlocker] = []
        repairs: list[PublishRepairAction] = []
        applicable_steps = [
            "engine_accepted_publish",
            "target_node_reachable",
            "channels_confirmed_live",
        ]

        expected_nodes = list(committed_state.desired.deployment.preferred_nodes or [committed_state.origin_node_id])
        observed_by_node = {
            envelope.value.node_id: envelope.value
            for envelope in observations
        }

        latest_event = next(
            (event for event in activation_events if int(event.get("snapshot_id") or 0) == int(detail["id"])),
            None,
        )
        stale_nodes = self._stale_nodes(expected_nodes=expected_nodes, observations=observed_by_node, event=latest_event)

        for node_id in expected_nodes:
            if node_id in stale_nodes:
                blockers.append(
                    PublishBlocker(
                        id=f"observation_stale:{node_id}",
                        code=PublishBlockerCode.OBSERVATION_STALE,
                        severity=PublishBlockerSeverity.BLOCKING,
                        scope=PublishScope.NODE,
                        title="Waiting for confirmation took too long",
                        operator_message=f"{node_id} has not confirmed this snapshot revision yet.",
                        technical_detail="No matching node observation arrived within the confirmation window.",
                        recommended_action="Retry publish",
                        repair_action_id="retry_publish",
                        related_node_ids=[node_id],
                    )
                )
                repairs.append(
                    PublishRepairAction(
                        id="retry_publish",
                        label="Retry publish",
                        operator_message="Retry the publish request for this snapshot.",
                        scope=PublishScope.INTENT,
                        related_node_ids=[node_id],
                    )
                )
            elif node_id not in observed_by_node:
                warnings.append(
                    PublishBlocker(
                        id=f"node_sync_pending:{node_id}",
                        code=PublishBlockerCode.NODE_SYNC_PENDING,
                        severity=PublishBlockerSeverity.WARNING,
                        scope=PublishScope.NODE,
                        title="Waiting for confirmation",
                        operator_message=f"{node_id} has not confirmed this snapshot yet.",
                        technical_detail=None,
                        recommended_action="Wait for confirmation",
                        related_node_ids=[node_id],
                    )
                )

        if runtime_live_state.get("state") == "live":
            runtime_snapshot_id = int(runtime_live_state.get("snapshot_id") or 0)
            if runtime_snapshot_id and runtime_snapshot_id != int(detail["id"]):
                blockers.append(
                    PublishBlocker(
                        id="authority_diverged",
                        code=PublishBlockerCode.AUTHORITY_DIVERGED,
                        severity=PublishBlockerSeverity.BLOCKING,
                        scope=PublishScope.CLUSTER,
                        title="Requested and confirmed live state differ",
                        operator_message="The runtime is reporting a different snapshot than the requested live state.",
                        technical_detail=(
                            f"Committed snapshot {detail['id']} differs from runtime snapshot {runtime_snapshot_id}."
                        ),
                        recommended_action="Review diagnostics",
                    )
                )

        engine_state = self._enum_value(committed_state.engine.display_state)
        if engine_state in {"stopped", "offline"}:
            blockers.append(
                PublishBlocker(
                    id="engine_unavailable",
                    code=PublishBlockerCode.ENGINE_UNAVAILABLE,
                    severity=PublishBlockerSeverity.BLOCKING,
                    scope=PublishScope.NODE,
                    title="Runtime is not ready",
                    operator_message="The runtime has not confirmed that it can run this snapshot yet.",
                    technical_detail=f"Engine display state is {committed_state.engine.display_state}.",
                    recommended_action="Retry publish",
                    repair_action_id="retry_publish",
                    related_node_ids=expected_nodes,
                )
            )

        for path in committed_state.paths:
            path_blocker = self._blocker_from_path(path, origin_node_id=committed_state.origin_node_id)
            if path_blocker is not None:
                blockers.append(path_blocker)

        confirmed = (
            not blockers
            and not warnings
            and committed_state.cluster.sync_status == "synced"
            and committed_state.derived.active_channel_count == committed_state.derived.total_channel_count
            and engine_state == "live"
        )
        return {
            "blockers": blockers,
            "warnings": warnings,
            "repairs": repairs,
            "confirmed": confirmed,
            "applicable_steps": applicable_steps,
        }

    def _stale_nodes(
        self,
        *,
        expected_nodes: list[str],
        observations: dict[str, Any],
        event: Optional[dict[str, Any]],
    ) -> set[str]:
        if not event:
            return set()
        runtime_metrics = event.get("runtime_metrics") if isinstance(event.get("runtime_metrics"), dict) else {}
        progress = runtime_metrics.get("activation_progress") if isinstance(runtime_metrics.get("activation_progress"), dict) else {}
        current_phase = str(progress.get("current_phase") or "").upper()
        if current_phase not in {"APPLYING", "VERIFYING"}:
            return set()
        requested_at_raw = event.get("requested_at")
        if not isinstance(requested_at_raw, str) or not requested_at_raw.strip():
            return set()
        try:
            requested_at = datetime.fromisoformat(requested_at_raw.replace("Z", "+00:00"))
        except Exception:
            return set()
        if requested_at.tzinfo is None:
            requested_at = requested_at.replace(tzinfo=timezone.utc)
        age_seconds = max(0.0, (utc_now() - requested_at.astimezone(timezone.utc)).total_seconds())
        if age_seconds < self.stale_after_seconds:
            return set()
        return {node_id for node_id in expected_nodes if node_id not in observations}

    def _blocker_from_path(self, path: AudioStatePathRecord, *, origin_node_id: str) -> Optional[PublishBlocker]:
        if path.status == AudioStatePathStatus.ACTIVE:
            return None
        if path.status == AudioStatePathStatus.PENDING:
            return PublishBlocker(
                id=f"channel_unconfirmed:{path.path_id}",
                code=PublishBlockerCode.CHANNEL_UNCONFIRMED,
                severity=PublishBlockerSeverity.WARNING,
                scope=PublishScope.CHANNEL,
                title="Channel is waiting for confirmation",
                operator_message=path.status_reason or f"Channel {path.label} is not confirmed live yet.",
                technical_detail=path.status_reason,
                recommended_action="Wait for confirmation",
                related_path_ids=[path.path_id],
                related_node_ids=[path.owner_node_id] if path.owner_node_id else [],
            )
        routing_code = (
            PublishBlockerCode.LOCAL_ROUTING_INVALID
            if str(path.owner_node_id or origin_node_id) == str(origin_node_id)
            else PublishBlockerCode.NETWORK_ROUTING_INVALID
        )
        return PublishBlocker(
            id=f"{routing_code.value}:{path.path_id}",
            code=routing_code,
            severity=PublishBlockerSeverity.BLOCKING,
            scope=PublishScope.CHANNEL,
            title="Routing needs attention",
            operator_message=path.status_reason or f"Channel {path.label} is not ready to publish.",
            technical_detail=path.status_reason,
            recommended_action="Fix routing",
            related_path_ids=[path.path_id],
            related_node_ids=[path.owner_node_id] if path.owner_node_id else [],
            prerequisite_of=[PublishBlockerCode.CHANNEL_UNCONFIRMED],
        )

    def _sort_blockers(self, blockers: list[PublishBlocker]) -> list[PublishBlocker]:
        severity_rank = {
            PublishBlockerSeverity.BLOCKING: 0,
            PublishBlockerSeverity.WARNING: 1,
            PublishBlockerSeverity.INFO: 2,
        }
        return sorted(
            blockers,
            key=lambda blocker: (
                severity_rank.get(blocker.severity, 99),
                0 if blocker.prerequisite_of else 1,
                blocker.id,
            ),
        )

    def _build_requirements(
        self,
        *,
        detail: dict[str, Any],
        draft_revision_id: Optional[int],
        blockers: list[PublishBlocker],
        warnings: list[PublishBlocker],
        requested_revision_id: Optional[int],
        confirmed_revision_id: Optional[int],
    ) -> list[PublishRequirement]:
        affected_codes = {blocker.code for blocker in blockers}
        waiting_codes = {warning.code for warning in warnings}

        def _status_for(
            *,
            blocker_codes: set[PublishBlockerCode],
            waiting_only: bool = False,
        ) -> PublishRequirementStatus:
            if affected_codes & blocker_codes:
                return PublishRequirementStatus.NEEDS_ATTENTION
            if waiting_codes & blocker_codes or waiting_only:
                return PublishRequirementStatus.WAITING_FOR_CONFIRMATION
            return PublishRequirementStatus.READY

        monitoring_output_index = ((detail.get("controls") or {}).get("monitoring_output_index") if isinstance(detail.get("controls"), dict) else None)
        remote_paths_present = any(
            str(path.get("owner_node_id") or "").strip()
            for path in detail.get("paths", [])
            if isinstance(path, dict)
        )

        return [
            PublishRequirement(
                id="draft_saved",
                label="Draft is saved",
                status=PublishRequirementStatus.READY if draft_revision_id is not None else PublishRequirementStatus.NEEDS_ATTENTION,
                scope=PublishScope.DRAFT,
                operator_message=(
                    "This draft is saved."
                    if draft_revision_id is not None
                    else "Save the draft before publishing."
                ),
            ),
            PublishRequirement(
                id="plugins_installed",
                label="Required plugins are installed",
                status=_status_for(blocker_codes={PublishBlockerCode.PLUGIN_MISSING}),
                scope=PublishScope.DRAFT,
                operator_message="All required plugins are available." if PublishBlockerCode.PLUGIN_MISSING not in affected_codes else "Install the missing plugins before publishing.",
            ),
            PublishRequirement(
                id="assets_available",
                label="Required models and IR files exist",
                status=_status_for(blocker_codes={PublishBlockerCode.ASSET_MISSING}),
                scope=PublishScope.DRAFT,
                operator_message="All required assets are available." if PublishBlockerCode.ASSET_MISSING not in affected_codes else "Restore missing assets before publishing.",
            ),
            PublishRequirement(
                id="input_device_available",
                label="Audio input device is available",
                status=_status_for(blocker_codes={PublishBlockerCode.AUDIO_INPUT_MISSING}),
                scope=PublishScope.NODE,
                operator_message="The input device is available." if PublishBlockerCode.AUDIO_INPUT_MISSING not in affected_codes else "Assign an available input device.",
            ),
            PublishRequirement(
                id="output_device_available",
                label="Audio output device is available",
                status=_status_for(blocker_codes={PublishBlockerCode.AUDIO_OUTPUT_MISSING}),
                scope=PublishScope.NODE,
                operator_message="The output device is available." if PublishBlockerCode.AUDIO_OUTPUT_MISSING not in affected_codes else "Assign an available output device.",
            ),
            PublishRequirement(
                id="monitoring_output",
                label="Monitoring output is valid",
                status=(
                    PublishRequirementStatus.NOT_APPLICABLE
                    if monitoring_output_index is None
                    else _status_for(blocker_codes={PublishBlockerCode.MONITORING_OUTPUT_INVALID})
                ),
                scope=PublishScope.NODE,
                operator_message=(
                    "No monitoring output is configured."
                    if monitoring_output_index is None
                    else "Monitoring output is ready."
                ),
            ),
            PublishRequirement(
                id="local_routing",
                label="Local routing is valid",
                status=_status_for(blocker_codes={PublishBlockerCode.LOCAL_ROUTING_INVALID}),
                scope=PublishScope.CHANNEL,
                operator_message="Local routing is ready." if PublishBlockerCode.LOCAL_ROUTING_INVALID not in affected_codes else "Fix local routing before publishing.",
            ),
            PublishRequirement(
                id="network_routing",
                label="Network node routing is valid",
                status=(
                    PublishRequirementStatus.NOT_APPLICABLE
                    if not remote_paths_present and requested_revision_id is None
                    else _status_for(blocker_codes={PublishBlockerCode.NETWORK_ROUTING_INVALID})
                ),
                scope=PublishScope.CLUSTER,
                operator_message=(
                    "No remote-node routing is required."
                    if not remote_paths_present and requested_revision_id is None
                    else "Network routing is ready."
                ),
            ),
            PublishRequirement(
                id="target_node_reachable",
                label="Target node is reachable",
                status=_status_for(
                    blocker_codes={
                        PublishBlockerCode.NODE_OFFLINE,
                        PublishBlockerCode.NODE_ASSIGNMENT_MISSING,
                        PublishBlockerCode.OBSERVATION_STALE,
                    },
                    waiting_only=PublishBlockerCode.NODE_SYNC_PENDING in waiting_codes,
                ),
                scope=PublishScope.NODE,
                operator_message=(
                    "Target nodes are reachable."
                    if PublishBlockerCode.OBSERVATION_STALE not in affected_codes and PublishBlockerCode.NODE_SYNC_PENDING not in waiting_codes
                    else "Waiting for target nodes to confirm this snapshot."
                ),
            ),
            PublishRequirement(
                id="engine_accepted_publish",
                label="Engine accepted the publish request",
                status=(
                    PublishRequirementStatus.NEEDS_ATTENTION
                    if affected_codes & {
                        PublishBlockerCode.ENGINE_UNAVAILABLE,
                        PublishBlockerCode.ENGINE_APPLY_FAILED,
                        PublishBlockerCode.AUTHORITY_DIVERGED,
                    }
                    else (
                        PublishRequirementStatus.WAITING_FOR_CONFIRMATION
                        if requested_revision_id is not None and confirmed_revision_id is None
                        else PublishRequirementStatus.READY
                    )
                ),
                scope=PublishScope.INTENT,
                operator_message=(
                    "The engine accepted the publish request."
                    if requested_revision_id is not None and confirmed_revision_id is not None
                    else (
                        "Waiting for the runtime to confirm the publish request."
                        if requested_revision_id is not None
                        else "Publish has not been requested yet."
                    )
                ),
            ),
            PublishRequirement(
                id="channels_confirmed_live",
                label="Every required channel is confirmed live",
                status=(
                    PublishRequirementStatus.READY
                    if confirmed_revision_id is not None
                    else _status_for(
                        blocker_codes={
                            PublishBlockerCode.CHANNEL_UNCONFIRMED,
                            PublishBlockerCode.OBSERVATION_STALE,
                            PublishBlockerCode.LOCAL_ROUTING_INVALID,
                            PublishBlockerCode.NETWORK_ROUTING_INVALID,
                        },
                        waiting_only=PublishBlockerCode.NODE_SYNC_PENDING in waiting_codes,
                    )
                ),
                scope=PublishScope.CHANNEL,
                operator_message=(
                    "All required channels are confirmed live."
                    if confirmed_revision_id is not None
                    else "Waiting for channel confirmation."
                ),
            ),
        ]

    def _resolve_status(
        self,
        *,
        blockers: list[PublishBlocker],
        warnings: list[PublishBlocker],
        requested_revision_id: Optional[int],
        confirmed_revision_id: Optional[int],
    ) -> SnapshotPublishStatus:
        if any(blocker.code == PublishBlockerCode.AUTHORITY_DIVERGED for blocker in blockers):
            return SnapshotPublishStatus.DIVERGED
        if blockers:
            return SnapshotPublishStatus.BLOCKED
        if confirmed_revision_id is not None:
            return SnapshotPublishStatus.LIVE_CONFIRMED
        if requested_revision_id is not None and warnings:
            return SnapshotPublishStatus.WAITING_FOR_CONFIRMATION
        return SnapshotPublishStatus.READY

    @staticmethod
    def _enum_value(value: Any) -> str:
        return str(getattr(value, "value", value) or "")
