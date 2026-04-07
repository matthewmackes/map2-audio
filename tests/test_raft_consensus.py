from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest

from app.routes import raft_api
from app.services.cluster.raft_consensus import LogEntry, RaftConsensus, RaftRole


@pytest.mark.asyncio
async def test_start_election_counts_self_vote_toward_majority(monkeypatch):
    raft = RaftConsensus(
        node_id="node-a",
        cluster_nodes={
            "node-a": "http://node-a",
            "node-b": "http://node-b",
            "node-c": "http://node-c",
        },
    )

    async def _vote(node_id: str, node_url: str) -> bool:
        return node_id == "node-b"

    monkeypatch.setattr(raft, "_request_vote", _vote)
    monkeypatch.setattr(raft, "_send_heartbeats", AsyncMock())

    await raft._start_election()

    assert raft.role == RaftRole.LEADER


@pytest.mark.asyncio
async def test_request_vote_steps_down_when_peer_reports_higher_term(monkeypatch):
    raft = RaftConsensus(
        node_id="node-a",
        cluster_nodes={
            "node-a": "http://node-a",
            "node-b": "http://node-b",
        },
    )
    raft.role = RaftRole.CANDIDATE
    raft.current_term = 3

    class _Response:
        status_code = 200

        @staticmethod
        def json():
            return {"term": 4, "vote_granted": False}

    class _Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url: str, json: dict[str, object]):
            return _Response()

    monkeypatch.setattr("app.services.cluster.raft_consensus.httpx.AsyncClient", lambda timeout: _Client())

    vote_granted = await raft._request_vote("node-b", "http://node-b")

    assert vote_granted is False
    assert raft.current_term == 4
    assert raft.role == RaftRole.FOLLOWER
    assert raft.voted_for is None


@pytest.mark.asyncio
async def test_apply_log_entries_applies_first_committed_entry_once():
    raft = RaftConsensus(node_id="node-a", cluster_nodes={"node-a": "http://node-a"})
    raft.log = [LogEntry(term=1, command="set_node_status", data={"node_id": "n1", "status": "online"}, index=0)]
    raft.commit_index = 0
    raft.is_running = True

    task = asyncio.create_task(raft._apply_log_entries())
    try:
        await asyncio.wait_for(_wait_until(lambda: raft.last_applied == 0), timeout=1.0)
    finally:
        raft.is_running = False
        await asyncio.wait_for(task, timeout=1.0)

    assert raft.state_machine.get_state("node:n1") == "online"
    assert raft.last_applied == 0


@pytest.mark.asyncio
async def test_append_entries_steps_down_on_same_term_leader(monkeypatch):
    raft = RaftConsensus(node_id="node-a", cluster_nodes={"node-a": "http://node-a"})
    raft.current_term = 5
    raft.role = RaftRole.CANDIDATE
    monkeypatch.setattr(raft_api, "get_raft_consensus", lambda: raft)

    response = await raft_api.append_entries(
        raft_api.AppendEntriesRequest(
            term=5,
            leader_id="node-b",
            prev_log_index=-1,
            prev_log_term=0,
            entries=[],
            leader_commit=-1,
        )
    )

    assert response.success is True
    assert raft.role == RaftRole.FOLLOWER


def test_persistent_state_round_trips_across_restart(tmp_path):
    state_path = tmp_path / "raft-state.json"
    raft = RaftConsensus(
        node_id="node-a",
        cluster_nodes={"node-a": "http://node-a", "node-b": "http://node-b"},
        state_path=state_path,
    )
    raft.set_current_term(7)
    raft.record_vote("node-a")
    raft.append_log_entry(LogEntry(term=7, command="set_node_status", data={"node_id": "n1", "status": "up"}, index=0))

    reloaded = RaftConsensus(
        node_id="node-a",
        cluster_nodes={"node-a": "http://node-a", "node-b": "http://node-b"},
        state_path=state_path,
    )

    assert reloaded.current_term == 7
    assert reloaded.voted_for == "node-a"
    assert len(reloaded.log) == 1
    assert reloaded.log[0].command == "set_node_status"
    assert reloaded.log[0].data == {"node_id": "n1", "status": "up"}


@pytest.mark.asyncio
async def test_request_vote_persists_granted_vote_before_response(monkeypatch, tmp_path):
    raft = RaftConsensus(
        node_id="node-a",
        cluster_nodes={"node-a": "http://node-a"},
        state_path=tmp_path / "raft-state.json",
    )
    monkeypatch.setattr(raft_api, "get_raft_consensus", lambda: raft)

    response = await raft_api.request_vote(
        raft_api.VoteRequest(term=3, candidate_id="node-b", last_log_index=-1, last_log_term=0)
    )

    reloaded = RaftConsensus(
        node_id="node-a",
        cluster_nodes={"node-a": "http://node-a"},
        state_path=tmp_path / "raft-state.json",
    )

    assert response.vote_granted is True
    assert reloaded.current_term == 3
    assert reloaded.voted_for == "node-b"


@pytest.mark.asyncio
async def test_append_entries_persists_log_replacement_before_response(monkeypatch, tmp_path):
    raft = RaftConsensus(
        node_id="node-a",
        cluster_nodes={"node-a": "http://node-a"},
        state_path=tmp_path / "raft-state.json",
    )
    raft.append_log_entry(LogEntry(term=1, command="set_node_status", data={"node_id": "old", "status": "old"}, index=0))
    monkeypatch.setattr(raft_api, "get_raft_consensus", lambda: raft)

    response = await raft_api.append_entries(
        raft_api.AppendEntriesRequest(
            term=2,
            leader_id="node-b",
            prev_log_index=-1,
            prev_log_term=0,
            entries=[{"term": 2, "command": "set_node_status", "data": {"node_id": "new", "status": "ok"}}],
            leader_commit=0,
        )
    )

    reloaded = RaftConsensus(
        node_id="node-a",
        cluster_nodes={"node-a": "http://node-a"},
        state_path=tmp_path / "raft-state.json",
    )

    assert response.success is True
    assert reloaded.current_term == 2
    assert len(reloaded.log) == 1
    assert reloaded.log[0].term == 2
    assert reloaded.log[0].data == {"node_id": "new", "status": "ok"}


async def _wait_until(predicate, *, interval: float = 0.01) -> None:
    while not predicate():
        await asyncio.sleep(interval)
