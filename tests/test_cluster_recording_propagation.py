"""T2510-2 — Raft recording arm/disarm propagation tests.

Covers the follower-side consumption of replicated ``recording.armed``
mutations: ownership filtering, leader-session-id reuse, the
disarm flip, idempotency, and the RaftStateMachine command branch.

A fake RecorderService (capturing arm/disarm calls) is injected via the
``get_recorder_service`` seam, so no JUCE engine is needed — mirrors the
capturing-transport style in ``tests/test_recorder_service.py``.
"""

from __future__ import annotations

from typing import Any

import app.services.recorder_service as recorder_service
from app.services.cluster.raft_consensus import LogEntry, RaftStateMachine
from app.services.recording_raft import (
    RecordingStateManager,
    replicate_recording_to_raft,
)


# ---------------------------------------------------------------------------
# Fake RecorderService — captures arm / disarm calls
# ---------------------------------------------------------------------------


class _FakeRecorderService:
    """Records arm_session / disarm_session calls instead of touching
    a real engine. Mirrors the capturing fakes in test_recorder_service."""

    def __init__(self) -> None:
        self.arm_calls: list[dict[str, Any]] = []
        self.disarm_calls: list[str] = []

    async def arm_session(
        self,
        *,
        snapshot_id: int,
        tap_matrix: dict[str, Any],
        session_id: str | None = None,
    ) -> None:
        self.arm_calls.append(
            {
                "snapshot_id": snapshot_id,
                "tap_matrix": tap_matrix,
                "session_id": session_id,
            }
        )

    async def disarm_session(self, *, session_id: str) -> None:
        self.disarm_calls.append(session_id)


def _install_fake(monkeypatch) -> _FakeRecorderService:
    # recording_raft imports get_recorder_service lazily *inside* its
    # methods (`from app.services.recorder_service import ...`), so patch the
    # source module the lazy import resolves against.
    fake = _FakeRecorderService()
    monkeypatch.setattr(recorder_service, "get_recorder_service", lambda: fake)
    return fake


# ---------------------------------------------------------------------------
# Fixtures / entry builders
# ---------------------------------------------------------------------------


LEADER_SESSION = "sess-leader-abc123"


def _entry(*, armed: bool, owner_map: dict[str, str], session_id: str = LEADER_SESSION) -> dict:
    """Build a replicated recording mutation entry."""
    return {
        "snapshot_id": 42,
        "recording": {
            "session_id": session_id,
            "armed": armed,
            "rolling": False,
            "started_at": "2026-06-02T12:00:00+00:00" if armed else None,
            "participating_nodes": ["node-a", "node-b"],
            "tap_matrix": {
                "A": {"pre_fx": True, "post_fx": False},
                "B": {"pre_fx": False, "post_fx": True},
            },
        },
        "owner_map": owner_map,
    }


# ---------------------------------------------------------------------------
# RecordingStateManager.apply_entry — ownership + lifecycle
# ---------------------------------------------------------------------------


async def test_arm_flip_arms_only_owned_chains(monkeypatch):
    """False→True flip where THIS node owns chain A → arm_session called
    once with the leader session id + tap_matrix filtered to chain A."""
    fake = _install_fake(monkeypatch)
    mgr = RecordingStateManager()

    # node-a owns A; node-b owns B. We are node-a.
    entry = _entry(armed=True, owner_map={"A": "node-a", "B": "node-b"})

    ok = await mgr.apply_entry(entry, local_node_id="node-a")

    assert ok is True
    assert len(fake.arm_calls) == 1
    call = fake.arm_calls[0]
    assert call["snapshot_id"] == 42
    # Only the owned chain is passed through.
    assert set(call["tap_matrix"].keys()) == {"A"}
    assert call["tap_matrix"]["A"] == {"pre_fx": True, "post_fx": False}
    assert not fake.disarm_calls


async def test_arm_flip_with_zero_owned_chains_does_not_arm(monkeypatch):
    """Node owns ZERO chains in tap_matrix → arm_session NOT called."""
    fake = _install_fake(monkeypatch)
    mgr = RecordingStateManager()

    # node-c owns nothing in this matrix.
    entry = _entry(armed=True, owner_map={"A": "node-a", "B": "node-b"})

    ok = await mgr.apply_entry(entry, local_node_id="node-c")

    assert ok is True
    assert fake.arm_calls == []
    assert fake.disarm_calls == []


async def test_disarm_flip_disarms_same_session(monkeypatch):
    """True→False flip → disarm_session called with the same session id we
    armed on the prior arm flip."""
    fake = _install_fake(monkeypatch)
    mgr = RecordingStateManager()

    await mgr.apply_entry(
        _entry(armed=True, owner_map={"A": "node-a"}), local_node_id="node-a"
    )
    assert len(fake.arm_calls) == 1

    ok = await mgr.apply_entry(
        _entry(armed=False, owner_map={"A": "node-a"}), local_node_id="node-a"
    )

    assert ok is True
    assert fake.disarm_calls == [LEADER_SESSION]


async def test_disarm_flip_without_prior_local_arm_is_noop(monkeypatch):
    """If this node never armed locally (owned 0 chains), a disarm flip
    must NOT call disarm_session."""
    fake = _install_fake(monkeypatch)
    mgr = RecordingStateManager()

    # node-c owns nothing → arm flip is a no-op.
    await mgr.apply_entry(
        _entry(armed=True, owner_map={"A": "node-a"}), local_node_id="node-c"
    )
    ok = await mgr.apply_entry(
        _entry(armed=False, owner_map={"A": "node-a"}), local_node_id="node-c"
    )

    assert ok is True
    assert fake.arm_calls == []
    assert fake.disarm_calls == []


async def test_idempotent_double_arm_arms_once(monkeypatch):
    """Applying armed=True twice → arm_session called only once (acts on a
    flip, not on every apply)."""
    fake = _install_fake(monkeypatch)
    mgr = RecordingStateManager()

    entry = _entry(armed=True, owner_map={"A": "node-a"})

    await mgr.apply_entry(entry, local_node_id="node-a")
    await mgr.apply_entry(entry, local_node_id="node-a")

    assert len(fake.arm_calls) == 1
    assert fake.disarm_calls == []


async def test_idempotent_double_disarm_disarms_once(monkeypatch):
    """Applying armed=False twice after an arm → disarm called once."""
    fake = _install_fake(monkeypatch)
    mgr = RecordingStateManager()

    await mgr.apply_entry(
        _entry(armed=True, owner_map={"A": "node-a"}), local_node_id="node-a"
    )
    await mgr.apply_entry(
        _entry(armed=False, owner_map={"A": "node-a"}), local_node_id="node-a"
    )
    await mgr.apply_entry(
        _entry(armed=False, owner_map={"A": "node-a"}), local_node_id="node-a"
    )

    assert fake.disarm_calls == [LEADER_SESSION]


async def test_reuses_leader_session_id_not_local(monkeypatch):
    """The session_id passed to arm_session equals the leader's id from the
    entry — NOT a locally-allocated one."""
    fake = _install_fake(monkeypatch)
    mgr = RecordingStateManager()

    entry = _entry(
        armed=True, owner_map={"A": "node-a"}, session_id="sess-from-the-leader"
    )

    await mgr.apply_entry(entry, local_node_id="node-a")

    assert len(fake.arm_calls) == 1
    assert fake.arm_calls[0]["session_id"] == "sess-from-the-leader"


async def test_arm_flip_without_session_id_skips(monkeypatch):
    """An arm flip carrying no session_id is skipped (followers cannot
    mint their own id) and does not raise."""
    fake = _install_fake(monkeypatch)
    mgr = RecordingStateManager()

    entry = _entry(armed=True, owner_map={"A": "node-a"}, session_id="")

    ok = await mgr.apply_entry(entry, local_node_id="node-a")

    assert ok is True
    assert fake.arm_calls == []


async def test_apply_entry_never_raises_on_bad_data(monkeypatch):
    """Malformed entry data must be caught + logged, returning False — it
    must never raise into the Raft apply loop."""
    _install_fake(monkeypatch)
    mgr = RecordingStateManager()

    assert await mgr.apply_entry("not-a-dict", local_node_id="node-a") is False
    assert await mgr.apply_entry({}, local_node_id="node-a") is False
    assert (
        await mgr.apply_entry({"snapshot_id": 1}, local_node_id="node-a") is False
    )


# ---------------------------------------------------------------------------
# RaftStateMachine command branch
# ---------------------------------------------------------------------------


def test_state_machine_stores_recording_entry_and_returns_true():
    """RaftStateMachine.apply_entry('update_snapshot_recording') stores
    state[f'recording:{snapshot_id}'] and returns True."""
    sm = RaftStateMachine()
    data = _entry(armed=True, owner_map={"A": "node-a"})
    entry = LogEntry(term=1, command="update_snapshot_recording", data=data, index=0)

    applied = sm.apply_entry(entry)

    assert applied is True
    assert sm.get_state("recording:42") == data


# ---------------------------------------------------------------------------
# replicate_recording_to_raft helper
# ---------------------------------------------------------------------------


async def test_replicate_recording_pushes_update_snapshot_recording_command():
    """The replication helper pushes command='update_snapshot_recording'
    with snapshot_id + recording block + normalized owner_map."""

    class _FakeRaft:
        def __init__(self) -> None:
            self.calls: list[tuple[str, dict]] = []

        async def replicate_command(self, command: str, data: dict) -> bool:
            self.calls.append((command, data))
            return True

    raft = _FakeRaft()
    recording_block = {
        "session_id": LEADER_SESSION,
        "armed": True,
        "rolling": False,
        "started_at": "2026-06-02T12:00:00+00:00",
        "participating_nodes": ["node-a"],
        "tap_matrix": {"A": {"pre_fx": True, "post_fx": False}},
    }

    result = await replicate_recording_to_raft(
        raft,
        snapshot_id=42,
        recording_block=recording_block,
        # Includes a blank owner that must be dropped by normalization.
        owner_map={"A": "node-a", "B": ""},
    )

    assert result is True
    assert len(raft.calls) == 1
    command, data = raft.calls[0]
    assert command == "update_snapshot_recording"
    assert data["snapshot_id"] == 42
    assert data["recording"] == recording_block
    assert data["owner_map"] == {"A": "node-a"}  # blank owner dropped
