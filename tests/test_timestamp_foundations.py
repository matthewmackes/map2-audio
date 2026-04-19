from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from app.response_models import APIResponse, StatusEnum
from app.services.audio_state_snapshot_compiler import _utcnow_iso
from app.services.cluster.raft_consensus import RaftConsensus
from app.services.platform_event.bus import PlatformEventBus
from app.services.platform_event.factories import make_node_online
from app.services.platform_event.replay import PlatformEventReplayBuffer
from app.services.platform_event.store import PlatformEventStore
from app.services.websocket_manager import WebSocketManager
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
    assert strategy.should_attempt_recovery(datetime.now(timezone.utc)) is False


def test_platform_event_store_replay_uses_timezone_aware_utc_timestamps(tmp_path):
    PlatformEventStore.reset_instance()
    store = PlatformEventStore(
        db_path=tmp_path / "platform-events.db",
        legacy_db_path=tmp_path / "cluster-events.db",
    )
    bus = PlatformEventBus(
        store=store,
        websocket_manager=WebSocketManager(enable_compression=False),
        replay_buffer=PlatformEventReplayBuffer(session_limit=5),
        enabled=True,
    )

    asyncio.run(
        bus.emit(
            make_node_online(
                node_id="node-a",
                source_service="timestamp_test",
                first_seen=True,
            )
        )
    )

    replayed = asyncio.run(bus.replay(limit=1))
    assert replayed[0].occurred_at.tzinfo == timezone.utc


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
