"""T2431-I — LocalAudioStateBackend contract tests + backend selection."""
from __future__ import annotations

import time
from pathlib import Path

import pytest

from app.models.audio_state import (
    AudioStateClusterStatus,
    AudioStateDeployment,
    AudioStateDerivedStatus,
    AudioStateDesiredIO,
    AudioStateEngineSummary,
    AudioStateObservation,
    AudioStateObservedIOSummary,
    AudioStatePathRecord,
    AudioStateRouting,
    AudioStateSnapshotRef,
    AuthoritativeAudioState,
    CompiledSnapshotIntent,
)
from app.services.audio_state_authority import (
    AudioStateAuthorityError,
    AudioStateAuthorityService,
)
from app.services.local_audio_state_backend import LocalAudioStateBackend


# ---------------------------------------------------------------------------
# fixtures — minimal-but-legal state payloads
# ---------------------------------------------------------------------------

def _build_state(state_version: int = 1) -> AuthoritativeAudioState:
    return AuthoritativeAudioState(
        state_version=state_version,
        leader_epoch=1,
        committed_at="2026-04-23T12:00:00",
        origin_node_id="local-node",
        source_snapshot=AudioStateSnapshotRef(
            snapshot_id=1,
            snapshot_revision_id=1,
            name="test-snapshot",
        ),
        desired=CompiledSnapshotIntent(
            snapshot_id=1,
            snapshot_revision_id=1,
            compiled_at="2026-04-23T11:59:59",
            intent_version=1,
            io=AudioStateDesiredIO(),
            routing=AudioStateRouting(mode="series", active_path_ids=[], path_order=[]),
            deployment=AudioStateDeployment(placement_mode="local_only", preferred_nodes=[]),
            chains=[],
        ),
        observed_summary=AudioStateObservedIOSummary(),
        cluster=AudioStateClusterStatus(
            sync_status="pending_apply", applied_node_ids=[], degraded_node_ids=[]
        ),
        engine=AudioStateEngineSummary(display_state="stopped", is_warning=False, is_offline=False),
        paths=[],
        derived=AudioStateDerivedStatus(
            active_channel_count=0, total_channel_count=0, inactive_messages=[]
        ),
    )


def _build_desired() -> CompiledSnapshotIntent:
    return CompiledSnapshotIntent(
        snapshot_id=1,
        snapshot_revision_id=1,
        compiled_at="2026-04-23T11:59:59",
        intent_version=1,
        io=AudioStateDesiredIO(),
        routing=AudioStateRouting(mode="series", active_path_ids=[], path_order=[]),
        deployment=AudioStateDeployment(placement_mode="local_only", preferred_nodes=[]),
        chains=[],
    )


def _build_observation(node_id: str = "local-node", *, version: int = 1) -> AudioStateObservation:
    return AudioStateObservation(
        node_id=node_id,
        observed_state_version=version,
        applied=True,
        effective_input_device="dev-in",
        effective_output_device="dev-out",
        runtime_paths=[],
        engine=AudioStateEngineSummary(display_state="live", is_warning=False, is_offline=False),
        runtime_metrics={},
        observed_at="2026-04-23T12:00:05",
    )


# ---------------------------------------------------------------------------
# committed / desired round-trips
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_committed_raises_until_put(tmp_path: Path) -> None:
    backend = LocalAudioStateBackend(storage_path=tmp_path / "local.json")
    with pytest.raises(AudioStateAuthorityError):
        await backend.get_committed_state()


@pytest.mark.asyncio
async def test_put_then_get_committed_round_trips(tmp_path: Path) -> None:
    backend = LocalAudioStateBackend(storage_path=tmp_path / "local.json")
    state = _build_state()
    envelope = await backend.put_committed_state(state)
    assert envelope.value.state_version == 1
    fetched = await backend.get_committed_state()
    assert fetched.value.state_version == 1
    assert fetched.value.origin_node_id == "local-node"


@pytest.mark.asyncio
async def test_next_state_version_starts_at_one_and_increments(tmp_path: Path) -> None:
    backend = LocalAudioStateBackend(storage_path=tmp_path / "local.json")
    assert await backend.next_state_version() == 1
    await backend.put_committed_state(_build_state(state_version=3))
    assert await backend.next_state_version() == 4


@pytest.mark.asyncio
async def test_desired_round_trip(tmp_path: Path) -> None:
    backend = LocalAudioStateBackend(storage_path=tmp_path / "local.json")
    desired = _build_desired()
    envelope = await backend.put_desired_state(desired)
    assert envelope.value.snapshot_id == 1
    fetched = await backend.get_desired_state()
    assert fetched.value.snapshot_id == 1


# ---------------------------------------------------------------------------
# observations
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_observations_ttl_expires_stale_entries(tmp_path: Path) -> None:
    backend = LocalAudioStateBackend(
        storage_path=tmp_path / "local.json",
        observation_ttl_s=1,
    )
    await backend.put_observation(_build_observation(version=1))
    listing = await backend.list_observations(state_version=1)
    assert listing.count == 1
    # Fast-forward by patching the clock used inside the backend module.
    import app.services.local_audio_state_backend as mod
    original = mod._now
    mod._now = lambda: original() + 10
    try:
        listing_after = await backend.list_observations(state_version=1)
    finally:
        mod._now = original
    assert listing_after.count == 0


@pytest.mark.asyncio
async def test_list_observations_filters_by_state_version(tmp_path: Path) -> None:
    backend = LocalAudioStateBackend(storage_path=tmp_path / "local.json")
    await backend.put_observation(_build_observation(node_id="n1", version=1))
    await backend.put_observation(_build_observation(node_id="n2", version=2))
    listing = await backend.list_observations(state_version=2)
    assert listing.count == 1
    assert listing.observations[0].value.node_id == "n2"


@pytest.mark.asyncio
async def test_observation_key_blank_node_id_raises(tmp_path: Path) -> None:
    backend = LocalAudioStateBackend(storage_path=tmp_path / "local.json")
    with pytest.raises(AudioStateAuthorityError):
        backend.observation_key("")


# ---------------------------------------------------------------------------
# persistence
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_state_persists_across_reloads(tmp_path: Path) -> None:
    storage = tmp_path / "local.json"
    b1 = LocalAudioStateBackend(storage_path=storage)
    await b1.put_committed_state(_build_state(state_version=2))
    # New instance reads from disk.
    b2 = LocalAudioStateBackend(storage_path=storage)
    fetched = await b2.get_committed_state()
    assert fetched.value.state_version == 2


@pytest.mark.asyncio
async def test_expired_observations_are_dropped_on_reload(tmp_path: Path) -> None:
    storage = tmp_path / "local.json"
    b1 = LocalAudioStateBackend(storage_path=storage, observation_ttl_s=1)
    await b1.put_observation(_build_observation(version=1))

    import app.services.local_audio_state_backend as mod
    original = mod._now
    mod._now = lambda: original() + 10
    try:
        # Re-open — expired entries should be filtered at load-time.
        b2 = LocalAudioStateBackend(storage_path=storage, observation_ttl_s=1)
        listing = await b2.list_observations(state_version=1)
    finally:
        mod._now = original
    assert listing.count == 0


# ---------------------------------------------------------------------------
# AudioStateAuthorityService backend selection
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_authority_service_routes_to_local_backend_when_configured(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("MAP2_AUDIO_STATE_AUTHORITY_BACKEND", "local")
    monkeypatch.setenv("MAP2_SERVICE_STATE_DIR", str(tmp_path))
    # Force the config manager to re-read the env var.
    from app.config import ConfigManager
    fresh_manager = ConfigManager(config_path=tmp_path / "usercfg.json")
    monkeypatch.setattr(ConfigManager, "_instance", fresh_manager, raising=False)

    service = AudioStateAuthorityService()
    assert service.backend_id == "local"

    state = _build_state(state_version=5)
    envelope = await service.put_committed_state(state)
    assert envelope.value.state_version == 5

    fetched = await service.get_committed_state()
    assert fetched.value.state_version == 5


@pytest.mark.asyncio
async def test_authority_service_defaults_to_etcd_backend(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("MAP2_AUDIO_STATE_AUTHORITY_BACKEND", raising=False)
    from app.config import ConfigManager
    fresh_manager = ConfigManager(config_path=tmp_path / "usercfg.json")
    monkeypatch.setattr(ConfigManager, "_instance", fresh_manager, raising=False)

    service = AudioStateAuthorityService()
    assert service.backend_id == "etcd"


@pytest.mark.asyncio
async def test_explicit_backend_override_bypasses_config(tmp_path: Path) -> None:
    backend = LocalAudioStateBackend(storage_path=tmp_path / "local.json")
    service = AudioStateAuthorityService(backend=backend)
    assert service.backend_id == "custom"
    await service.put_committed_state(_build_state(state_version=7))
    env = await service.get_committed_state()
    assert env.value.state_version == 7
