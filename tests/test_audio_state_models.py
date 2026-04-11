from app.models.audio_state import (
    PublishBlocker,
    PublishBlockerCode,
    PublishBlockerSeverity,
    PublishRepairAction,
    PublishRequirement,
    PublishRequirementStatus,
    PublishScope,
    SnapshotPublishReadiness,
    SnapshotPublishStatus,
)


def test_snapshot_publish_readiness_serializes_typed_publish_contract() -> None:
    readiness = SnapshotPublishReadiness(
        snapshot_id=42,
        draft_revision_id=9,
        requested_revision_id=8,
        confirmed_revision_id=7,
        status=SnapshotPublishStatus.WAITING_FOR_CONFIRMATION,
        requirements=[
            PublishRequirement(
                id="output_device",
                label="Output device",
                status=PublishRequirementStatus.NEEDS_ATTENTION,
                scope=PublishScope.NODE,
                operator_message="Assign an output device before publishing.",
                technical_detail="Requested output device 'Main Out' is not available on Rack-2.",
                repair_actions=[
                    PublishRepairAction(
                        id="rebind_output_device",
                        label="Assign output device",
                        operator_message="Choose a valid output device for Rack-2.",
                        scope=PublishScope.NODE,
                        related_node_ids=["rack-2"],
                    )
                ],
            )
        ],
        blockers=[
            PublishBlocker(
                id="audio_output_missing:rack-2",
                code=PublishBlockerCode.AUDIO_OUTPUT_MISSING,
                severity=PublishBlockerSeverity.BLOCKING,
                scope=PublishScope.NODE,
                title="Output device needs attention",
                operator_message="Rack-2 does not have the requested output device.",
                technical_detail="Requested output device 'Main Out' is unavailable.",
                recommended_action="Assign output device",
                repair_action_id="rebind_output_device",
                related_node_ids=["rack-2"],
            )
        ],
        warnings=[
            PublishBlocker(
                id="node_sync_pending:rack-2",
                code=PublishBlockerCode.NODE_SYNC_PENDING,
                severity=PublishBlockerSeverity.WARNING,
                scope=PublishScope.NODE,
                title="Waiting for confirmation",
                operator_message="Rack-2 has not confirmed this revision yet.",
                technical_detail=None,
                recommended_action="Wait for confirmation",
                repair_action_id=None,
                related_node_ids=["rack-2"],
            )
        ],
        available_repairs=[
            PublishRepairAction(
                id="retry_publish",
                label="Retry publish",
                operator_message="Retry the publish request for this snapshot.",
                scope=PublishScope.INTENT,
            )
        ],
        applicable_steps=["draft_saved", "output_device", "publish_requested"],
    )

    payload = readiness.model_dump(mode="json")

    assert payload["status"] == "waiting_for_confirmation"
    assert payload["requirements"][0]["status"] == "needs_attention"
    assert payload["requirements"][0]["repair_actions"][0]["id"] == "rebind_output_device"
    assert payload["blockers"][0]["code"] == "audio_output_missing"
    assert payload["blockers"][0]["severity"] == "blocking"
    assert payload["warnings"][0]["code"] == "node_sync_pending"
    assert payload["available_repairs"][0]["id"] == "retry_publish"
    assert payload["applicable_steps"] == ["draft_saved", "output_device", "publish_requested"]


def test_publish_contract_models_default_optional_lists_to_empty() -> None:
    blocker = PublishBlocker(
        id="authority_diverged",
        code=PublishBlockerCode.AUTHORITY_DIVERGED,
        severity=PublishBlockerSeverity.BLOCKING,
        scope=PublishScope.CLUSTER,
        title="Requested and confirmed live state differ",
        operator_message="The runtime confirmed a different revision than the requested live state.",
        recommended_action="Review diagnostics",
    )
    requirement = PublishRequirement(
        id="network_routing",
        label="Network routing",
        status=PublishRequirementStatus.NOT_APPLICABLE,
        scope=PublishScope.CLUSTER,
        operator_message="This snapshot does not target any remote nodes.",
    )
    readiness = SnapshotPublishReadiness(snapshot_id=5, status=SnapshotPublishStatus.READY)

    assert blocker.prerequisite_of == []
    assert blocker.related_path_ids == []
    assert blocker.related_node_ids == []
    assert requirement.repair_actions == []
    assert readiness.requirements == []
    assert readiness.blockers == []
    assert readiness.warnings == []
    assert readiness.available_repairs == []
    assert readiness.applicable_steps == []
