from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from app.response_models import APIResponse, StatusEnum
from app.services.audio_state_snapshot_compiler import _utcnow_iso
from app.services.cluster.raft_consensus import RaftConsensus
from app.services.event_bus import EventBus, EventType
from app.services.graceful_degradation import DegradationStrategy, Feature, FeatureLevel
from app.services.snapshot_runtime_state_service import _parse_iso_datetime, _utcnow as snapshot_runtime_utcnow
from app.services.snapshot_service import _utcnow as snapshot_service_utcnow


def test_api_response_timestamp_defaults_to_timezone_aware_utc():
    response = APIResponse(status=StatusEnum.SUCCESS, message="ok")

    assert response.timestamp.tzinfo == timezone.utc


def test_feature_defaults_and_recovery_accept_timezone_aware_utc():
    feature = Feature(name="feature", level=FeatureLevel.STANDARD)
    strategy = DegradationStrategy(recovery_timeout_seconds=60)

    assert feature.created_at.tzinfo == timezone.utc
    assert strategy.should_attempt_recovery(datetime.now()) is False


def test_event_bus_history_uses_timezone_aware_utc_timestamps():
    bus = EventBus()

    asyncio.run(bus.publish(EventType.NODE_ONLINE, {"node_id": "node-a"}))

    history = bus.get_history(limit=1)
    parsed = datetime.fromisoformat(history[0]["timestamp"])
    assert parsed.tzinfo == timezone.utc


def test_snapshot_helpers_emit_timezone_aware_utc():
    assert snapshot_service_utcnow().tzinfo == timezone.utc
    assert snapshot_runtime_utcnow().tzinfo == timezone.utc
    assert datetime.fromisoformat(_utcnow_iso()).tzinfo == timezone.utc


def test_snapshot_runtime_parser_normalizes_naive_inputs_to_utc():
    parsed = _parse_iso_datetime("2026-04-06T12:00:00")

    assert parsed is not None
    assert parsed.tzinfo == timezone.utc


def test_raft_consensus_heartbeat_defaults_to_timezone_aware_utc():
    raft = RaftConsensus(node_id="node-a", cluster_nodes={"node-a": "http://node-a"})

    assert raft.last_heartbeat.tzinfo == timezone.utc
