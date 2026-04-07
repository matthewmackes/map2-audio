"""
Raft Consensus Implementation for Cluster State Replication

Provides distributed consensus for management node cluster state.
Ensures consistent state across all management nodes via Raft algorithm.

Implements:
- Leader election
- Log replication
- State machine
- Persistent storage of state
"""

import asyncio
import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from pathlib import Path
import random
import time
from typing import Any, Callable, Dict, List, Optional

import httpx

from app.utils.time import utc_now

logger = logging.getLogger(__name__)


def _coerce_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=utc_now().tzinfo)


class RaftRole(Enum):
    """Node role in Raft cluster."""
    FOLLOWER = "follower"
    CANDIDATE = "candidate"
    LEADER = "leader"


class RaftState(Enum):
    """State of a Raft node."""
    INITIALIZING = "initializing"
    READY = "ready"
    ELECTING = "electing"
    LEADING = "leading"


@dataclass
class LogEntry:
    """Entry in Raft log."""
    term: int
    command: str
    data: Dict[str, Any]
    timestamp: float = field(default_factory=time.time)
    index: int = 0


@dataclass
class RaftNodeInfo:
    """Information about a Raft node."""
    node_id: str
    url: str
    last_heartbeat: datetime = field(default_factory=utc_now)
    next_index: int = 0
    match_index: int = 0


class RaftStateMachine:
    """
    State machine that applies log entries to cluster state.
    Manages the actual cluster state based on committed log entries.
    """

    def __init__(self):
        self.state: Dict[str, Any] = {}
        self.applied_index = 0
        self.logger = logging.getLogger("RaftStateMachine")

    def apply_entry(self, entry: LogEntry) -> bool:
        """Apply log entry to state machine."""
        try:
            if entry.command == "set_node_status":
                node_id = entry.data.get("node_id")
                status = entry.data.get("status")
                self.state[f"node:{node_id}"] = status
                self.logger.info(f"Applied: set node {node_id} status to {status}")
                return True

            elif entry.command == "create_flow_assignment":
                flow_id = entry.data.get("flow_id")
                node_id = entry.data.get("node_id")
                self.state[f"flow:{flow_id}"] = node_id
                self.logger.info(f"Applied: assigned flow {flow_id} to node {node_id}")
                return True

            elif entry.command == "remove_node":
                node_id = entry.data.get("node_id")
                keys_to_remove = [k for k in self.state if k.startswith(f"node:{node_id}")]
                for k in keys_to_remove:
                    del self.state[k]
                self.logger.info(f"Applied: removed node {node_id} from state")
                return True

            elif entry.command == "update_special_settings":
                # Special settings replication
                self.state["special_settings"] = entry.data
                self.logger.info(
                    f"Applied: special settings updated (enabled={entry.data.get('enabled')}, "
                    f"hidden={len(entry.data.get('hidden_plugins', []))}, "
                    f"location={entry.data.get('menu_location')})"
                )
                return True

            else:
                self.logger.warning(f"Unknown command: {entry.command}")
                return False

        except Exception as e:
            self.logger.error(f"Failed to apply entry: {e}")
            return False

    def get_state(self, key: Optional[str] = None) -> Any:
        """Get state value(s)."""
        if key:
            return self.state.get(key)
        return self.state.copy()


class RaftConsensus:
    """
    Raft consensus engine for cluster state replication.
    
    Features:
    - Leader election with randomized timeouts
    - Log replication with majority acknowledgment
    - Automatic leader failover
    - State machine application
    """

    def __init__(self, node_id: str, cluster_nodes: Dict[str, str], *, state_path: Optional[Path] = None):
        """
        Initialize Raft consensus.
        
        Args:
            node_id: This node's identifier
            cluster_nodes: Dict of {node_id: url} for all cluster nodes
        """
        self.node_id = node_id
        self.cluster_nodes = {n: u for n, u in cluster_nodes.items() if n != node_id}
        self._state_path = Path(state_path) if state_path is not None else self._default_state_path(node_id)
        
        # Persistent state
        self.current_term = 0
        self.voted_for: Optional[str] = None
        self.log: List[LogEntry] = []

        # Volatile state
        self.commit_index = -1
        self.last_applied = -1
        self.role = RaftRole.FOLLOWER
        self.state_machine = RaftStateMachine()

        # Leader state
        self.next_index: Dict[str, int] = {n: len(self.log) for n in self.cluster_nodes}
        self.match_index: Dict[str, int] = {n: -1 for n in self.cluster_nodes}
        
        # Timing
        self.last_heartbeat = utc_now()
        self.election_timeout = self._random_timeout(150, 300)  # ms
        self.heartbeat_interval = 50  # ms
        
        # Task management
        self.is_running = False
        self._tasks: List[asyncio.Task] = []
        
        self.logger = logging.getLogger("RaftConsensus")
        self._load_persistent_state()

    @staticmethod
    def _default_state_path(node_id: str) -> Path:
        configured = os.getenv("MAP2_RAFT_STATE_DIR", "").strip()
        root = Path(configured).expanduser() if configured else Path.home() / ".map2" / "cluster" / "raft"
        return root / f"{node_id}.json"

    def _serialize_log_entry(self, entry: LogEntry) -> Dict[str, Any]:
        return {
            "term": int(entry.term),
            "command": str(entry.command),
            "data": dict(entry.data),
            "timestamp": float(entry.timestamp),
            "index": int(entry.index),
        }

    def _persist_stable_state(self) -> None:
        payload = {
            "current_term": int(self.current_term),
            "voted_for": self.voted_for,
            "log": [self._serialize_log_entry(entry) for entry in self.log],
        }
        self._state_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = self._state_path.with_suffix(".tmp")
        temp_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        temp_path.replace(self._state_path)

    def _load_persistent_state(self) -> None:
        if not self._state_path.exists():
            return
        try:
            payload = json.loads(self._state_path.read_text(encoding="utf-8"))
        except Exception as exc:
            self.logger.warning("Failed to load Raft stable state from %s: %s", self._state_path, exc)
            return

        self.current_term = int(payload.get("current_term", 0) or 0)
        raw_voted_for = payload.get("voted_for")
        self.voted_for = str(raw_voted_for) if raw_voted_for is not None else None
        self.log = []
        for index, raw_entry in enumerate(payload.get("log", [])):
            if not isinstance(raw_entry, dict):
                continue
            self.log.append(
                LogEntry(
                    term=int(raw_entry.get("term", 0) or 0),
                    command=str(raw_entry.get("command", "")),
                    data=dict(raw_entry.get("data", {}) or {}),
                    timestamp=float(raw_entry.get("timestamp", time.time()) or time.time()),
                    index=int(raw_entry.get("index", index) or index),
                )
            )

    def _cluster_size(self) -> int:
        return len(self.cluster_nodes) + 1

    def _majority_count(self) -> int:
        return (self._cluster_size() // 2) + 1

    def _last_log_index(self) -> int:
        return len(self.log) - 1

    def _last_log_term(self) -> int:
        return self.log[-1].term if self.log else 0

    def _become_follower(self, term: int, *, voted_for: Optional[str] = None) -> None:
        if term > self.current_term:
            self.current_term = term
        self.role = RaftRole.FOLLOWER
        self.voted_for = voted_for
        self.last_heartbeat = utc_now()
        self._persist_stable_state()

    def set_current_term(self, term: int) -> None:
        self.current_term = int(term)
        self.voted_for = None
        self._persist_stable_state()

    def record_vote(self, candidate_id: Optional[str]) -> None:
        self.voted_for = candidate_id
        self._persist_stable_state()

    def replace_log(self, entries: List[LogEntry]) -> None:
        self.log = entries
        self._persist_stable_state()

    def append_log_entry(self, entry: LogEntry) -> None:
        self.log.append(entry)
        self._persist_stable_state()

    def _random_timeout(self, min_ms: int, max_ms: int) -> float:
        """Get random election timeout in seconds."""
        return random.randint(min_ms, max_ms) / 1000.0

    async def _apply_special_settings_to_db(self, entry: LogEntry) -> None:
        """Apply special settings log entry to database."""
        try:
            # Lazy import to avoid circular dependencies
            from app.database import get_session
            from app.services.special_settings_raft import SpecialSettingsStateManager
            
            state_manager = SpecialSettingsStateManager(get_session)
            await state_manager.apply_entry(entry.data)
            
            self.logger.info(f"Special settings applied to database (version={entry.data.get('version')})")
        
        except ImportError:
            self.logger.debug("Database session not available for special settings sync")
        except Exception as e:
            self.logger.error(f"Failed to apply special settings to database: {e}")

    async def start(self):
        """Start Raft consensus engine."""
        if self.is_running:
            return
        
        self.logger.info(f"Starting Raft consensus (node_id={self.node_id})")
        self.is_running = True
        
        # Start election timer
        self._tasks.append(asyncio.create_task(self._election_timer()))
        
        # Start heartbeat timer (only if leader)
        self._tasks.append(asyncio.create_task(self._heartbeat_timer()))
        
        # Start state machine applier
        self._tasks.append(asyncio.create_task(self._apply_log_entries()))

    async def stop(self):
        """Stop Raft consensus engine."""
        if not self.is_running:
            return
        
        self.logger.info("Stopping Raft consensus")
        self.is_running = False
        
        for task in self._tasks:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    async def _election_timer(self):
        """Election timeout logic - triggers leader election."""
        while self.is_running:
            try:
                timeout = self.election_timeout
                await asyncio.sleep(timeout)
                
                # Check if we've received a heartbeat
                time_since_heartbeat = (utc_now() - _coerce_utc(self.last_heartbeat)).total_seconds()
                
                if self.role == RaftRole.LEADER:
                    # Leader doesn't time out
                    continue
                
                if time_since_heartbeat > timeout:
                    # Timeout - start election
                    await self._start_election()
                
            except Exception as e:
                self.logger.error(f"Error in election timer: {e}")
                await asyncio.sleep(0.1)

    async def _heartbeat_timer(self):
        """Heartbeat logic - leader sends heartbeats."""
        while self.is_running:
            try:
                if self.role == RaftRole.LEADER:
                    await self._send_heartbeats()
                
                await asyncio.sleep(self.heartbeat_interval / 1000.0)
                
            except Exception as e:
                self.logger.error(f"Error in heartbeat timer: {e}")
                await asyncio.sleep(0.1)

    async def _start_election(self):
        """Start leader election."""
        self.logger.warning(f"Election timeout - starting election (term={self.current_term})")
        
        self.role = RaftRole.CANDIDATE
        self.current_term += 1
        self.voted_for = self.node_id
        self._persist_stable_state()
        self.last_heartbeat = utc_now()
        self.election_timeout = self._random_timeout(150, 300)
        
        # Request votes from all other nodes
        vote_tasks = []
        for node_id, node_url in self.cluster_nodes.items():
            task = self._request_vote(node_id, node_url)
            vote_tasks.append(task)
        
        votes_received = await asyncio.gather(*vote_tasks, return_exceptions=True)
        votes = 1 + sum(1 for v in votes_received if v is True)

        # Check if we won the election
        majority = self._majority_count()
        if self.role == RaftRole.CANDIDATE and votes >= majority:
            self.logger.info(f"Won election with {votes}/{self._cluster_size()} votes (term={self.current_term})")
            self.role = RaftRole.LEADER

            # Initialize leader state
            self.next_index = {n: len(self.log) for n in self.cluster_nodes}
            self.match_index = {n: -1 for n in self.cluster_nodes}
            
            # Send initial heartbeat
            await self._send_heartbeats()
        else:
            self.logger.warning(f"Lost election with {votes}/{self._cluster_size()} votes (term={self.current_term})")
            if self.role == RaftRole.CANDIDATE:
                self.role = RaftRole.FOLLOWER

    async def _request_vote(self, node_id: str, node_url: str) -> bool:
        """Request vote from a node."""
        try:
            payload = {
                "term": self.current_term,
                "candidate_id": self.node_id,
                "last_log_index": self._last_log_index(),
                "last_log_term": self._last_log_term(),
            }
            
            async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
                resp = await client.post(f"{node_url}/api/raft/vote", json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    response_term = int(data.get("term", self.current_term))
                    if response_term > self.current_term:
                        self._become_follower(response_term)
                        return False
                    return data.get("vote_granted", False)
        except Exception as e:
            self.logger.debug(f"Failed to request vote from {node_id}: {e}")
        
        return False

    async def _send_heartbeats(self):
        """Send heartbeats to all follower nodes."""
        if self.role != RaftRole.LEADER:
            return
        
        for node_id, node_url in self.cluster_nodes.items():
            asyncio.create_task(self._send_append_entries(node_id, node_url))

    async def _send_append_entries(self, node_id: str, node_url: str):
        """Send AppendEntries RPC to a node."""
        try:
            prev_index = self.next_index.get(node_id, 0) - 1
            prev_term = self.log[prev_index].term if 0 <= prev_index < len(self.log) else 0
            
            # Entries to send
            entries = []
            for i in range(self.next_index.get(node_id, 0), len(self.log)):
                entries.append({
                    "term": self.log[i].term,
                    "command": self.log[i].command,
                    "data": self.log[i].data,
                })
            
            payload = {
                "term": self.current_term,
                "leader_id": self.node_id,
                "prev_log_index": prev_index,
                "prev_log_term": prev_term,
                "entries": entries,
                "leader_commit": self.commit_index,
            }
            
            async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
                resp = await client.post(f"{node_url}/api/raft/append-entries", json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    response_term = int(data.get("term", self.current_term))
                    if response_term > self.current_term:
                        self._become_follower(response_term)
                        return
                    if data.get("success"):
                        self.match_index[node_id] = prev_index + len(entries)
                        self.next_index[node_id] = self.match_index[node_id] + 1
                        
                        # Update commit index if we have majority
                        await self._update_commit_index()
        
        except Exception as e:
            self.logger.debug(f"Failed to send append entries to {node_id}: {e}")

    async def _update_commit_index(self):
        """Update commit index based on replication progress."""
        if self.role != RaftRole.LEADER:
            return

        # Find highest index replicated to majority
        match_indices = sorted([self._last_log_index(), *self.match_index.values()], reverse=True)
        majority_index = match_indices[self._majority_count() - 1]

        if majority_index > self.commit_index and majority_index < len(self.log):
            if self.log[majority_index].term == self.current_term:
                self.commit_index = majority_index
                self.logger.debug(f"Updated commit_index to {self.commit_index}")

    async def _apply_log_entries(self):
        """Apply committed log entries to state machine."""
        while self.is_running:
            try:
                while self.last_applied < self.commit_index:
                    next_index = self.last_applied + 1
                    if next_index >= len(self.log):
                        break

                    entry = self.log[next_index]

                    # Advance only after a successful apply so committed entries are
                    # neither skipped nor marked applied early.
                    applied = await asyncio.to_thread(self.state_machine.apply_entry, entry)
                    if not applied:
                        break

                    if entry.command == "update_special_settings":
                        try:
                            await self._apply_special_settings_to_db(entry)
                        except Exception as e:
                            logger.error(f"Failed to apply special settings to DB: {e}")
                            break

                    self.last_applied = next_index

                await asyncio.sleep(0.01)
            
            except Exception as e:
                self.logger.error(f"Error applying log entries: {e}")
                await asyncio.sleep(0.1)

    async def replicate_command(self, command: str, data: Dict[str, Any]) -> bool:
        """
        Replicate a command across the cluster.
        Only the leader can accept commands.
        """
        if self.role != RaftRole.LEADER:
            self.logger.warning(f"Cannot replicate on {self.role.value} node")
            return False
        
        # Add to log
        entry = LogEntry(term=self.current_term, command=command, data=data)
        entry.index = len(self.log)
        self.append_log_entry(entry)
        
        self.logger.info(f"Appended log entry: {command} (index={entry.index})")
        
        # Send to followers
        await self._send_heartbeats()
        
        # Wait for commit
        timeout = time.time() + 5.0
        while time.time() < timeout:
            if self.last_applied >= entry.index:
                self.logger.info(f"Command committed: {command}")
                return True
            await asyncio.sleep(0.01)
        
        self.logger.error(f"Command commit timeout: {command}")
        return False

    def get_leader(self) -> Optional[str]:
        """Get current leader node ID."""
        if self.role == RaftRole.LEADER:
            return self.node_id
        return None

    def is_leader(self) -> bool:
        """Check if this node is the leader."""
        return self.role == RaftRole.LEADER

    def get_state(self) -> Dict[str, Any]:
        """Get cluster state."""
        return {
            "node_id": self.node_id,
            "role": self.role.value,
            "term": self.current_term,
            "commit_index": self.commit_index,
            "last_applied": self.last_applied,
            "log_length": len(self.log),
            "state": self.state_machine.get_state(),
        }


# Singleton instance per node
_raft_consensus: Optional[RaftConsensus] = None


def get_raft_consensus() -> RaftConsensus:
    """Get or create Raft consensus instance."""
    global _raft_consensus
    if _raft_consensus is None:
        raise RuntimeError("Raft consensus not initialized")
    return _raft_consensus


def initialize_raft_consensus(node_id: str, cluster_nodes: Dict[str, str]) -> RaftConsensus:
    """Initialize Raft consensus."""
    global _raft_consensus
    _raft_consensus = RaftConsensus(node_id, cluster_nodes)
    return _raft_consensus
