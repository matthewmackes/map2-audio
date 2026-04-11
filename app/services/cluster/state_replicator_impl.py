"""
State Replicator - Consensus Implementation

Implements Raft-like consensus for cluster state replication.
Uses a simplified approach suitable for small to medium clusters (1-100 nodes).
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set
from dataclasses import dataclass, field, asdict
from enum import Enum
import hashlib

from app.utils.time import utc_now

logger = logging.getLogger(__name__)


class NodeRole(Enum):
    """Node role in cluster consensus."""
    LEADER = "leader"
    FOLLOWER = "follower"
    CANDIDATE = "candidate"


@dataclass
class LogEntry:
    """Replicated log entry."""
    term: int
    index: int
    command: str  # e.g., "register_node", "update_node", "delete_node"
    data: Dict
    timestamp: str = field(default_factory=lambda: utc_now().isoformat())


@dataclass
class ClusterState:
    """Current cluster state."""
    current_term: int = 1
    voted_for: Optional[str] = None
    log: List[LogEntry] = field(default_factory=list)
    commit_index: int = 0
    last_applied: int = 0
    leader_id: Optional[str] = None
    nodes: Dict[str, Dict] = field(default_factory=dict)  # Cluster membership
    state_hash: str = ""


class StateReplicator:
    """
    Implements consensus replication for cluster state.
    
    Uses a simplified Raft algorithm for leader election and state replication.
    """
    
    def __init__(self, node_id: str, registry):
        self.node_id = node_id
        self.registry = registry
        
        self.state = ClusterState()
        self.role = NodeRole.FOLLOWER
        
        # Heartbeat configuration
        self.heartbeat_interval = 1.0  # seconds
        self.election_timeout_min = 2.0
        self.election_timeout_max = 4.0
        self.last_heartbeat = utc_now()
        
        # Replication state
        self.next_index: Dict[str, int] = {}  # For each follower
        self.match_index: Dict[str, int] = {}  # For each follower
        
        # Cluster peer nodes
        self.peers: Set[str] = set()
    
    async def initialize_cluster(self, peer_nodes: List[str]):
        """Initialize cluster with peer node IDs."""
        self.peers = set(peer_nodes)
        self.state.nodes = {node_id: {} for node_id in peer_nodes}
        
        # Initialize replication indices
        for peer in self.peers:
            self.next_index[peer] = len(self.state.log)
            self.match_index[peer] = 0
        
        logger.info(f"Cluster initialized with {len(self.peers)} peers")
    
    async def start(self):
        """Start replication server (election + heartbeat)."""
        tasks = [
            self._run_election(),
            self._send_heartbeats(),
            self._apply_committed_entries()
        ]
        
        try:
            await asyncio.gather(*tasks)
        except Exception as e:
            logger.error(f"Replication error: {e}")
    
    async def _run_election(self):
        """Run leader election."""
        while True:
            try:
                # Check if we should start election
                time_since_heartbeat = (utc_now() - self.last_heartbeat).total_seconds()
                election_timeout = __import__('random').uniform(
                    self.election_timeout_min,
                    self.election_timeout_max
                )
                
                if time_since_heartbeat > election_timeout and self.role != NodeRole.LEADER:
                    await self._start_election()
                
                await asyncio.sleep(0.5)
                
            except Exception as e:
                logger.error(f"Election error: {e}")
                await asyncio.sleep(1)
    
    async def _start_election(self):
        """Start leader election."""
        logger.info(f"Starting election (term {self.state.current_term + 1})")
        
        self.state.current_term += 1
        self.role = NodeRole.CANDIDATE
        self.state.voted_for = self.node_id
        
        # Request votes from all peers
        votes_received = 1  # Vote for self
        
        for peer in self.peers:
            try:
                # In production, this would be an RPC call
                granted = await self._request_vote(peer)
                if granted:
                    votes_received += 1
            except Exception as e:
                logger.debug(f"Vote request failed for {peer}: {e}")
        
        # Check if elected
        if votes_received > len(self.peers) / 2:
            logger.info(f"Elected as leader (term {self.state.current_term})")
            self.role = NodeRole.LEADER
            self.state.leader_id = self.node_id
            self.last_heartbeat = utc_now()
            
            # Initialize replication indices
            for peer in self.peers:
                self.next_index[peer] = len(self.state.log)
                self.match_index[peer] = 0
        else:
            logger.info(f"Election failed, remaining follower")
            self.role = NodeRole.FOLLOWER
    
    async def _request_vote(self, peer_id: str) -> bool:
        """Request vote from peer."""
        # In production, this would be an actual RPC
        # For now, simulate voting
        logger.debug(f"Requesting vote from {peer_id}")
        await asyncio.sleep(0.1)  # Simulate network latency
        return True  # Simplified - always grant
    
    async def _send_heartbeats(self):
        """Send periodic heartbeats to followers."""
        while True:
            try:
                if self.role == NodeRole.LEADER:
                    for peer in self.peers:
                        asyncio.create_task(self._replicate_to_peer(peer))
                    
                    await asyncio.sleep(self.heartbeat_interval)
                else:
                    await asyncio.sleep(1)
                    
            except Exception as e:
                logger.error(f"Heartbeat error: {e}")
                await asyncio.sleep(1)
    
    async def _replicate_to_peer(self, peer_id: str):
        """Replicate log entries to peer."""
        try:
            if self.role != NodeRole.LEADER:
                return
            
            prev_log_index = self.next_index[peer_id] - 1
            prev_log_term = 0
            if prev_log_index >= 0 and prev_log_index < len(self.state.log):
                prev_log_term = self.state.log[prev_log_index].term
            
            # Get entries to send
            entries = self.state.log[self.next_index[peer_id]:]
            
            # Send append entries RPC (simplified)
            # In production, this would be an actual RPC call
            success = await self._append_entries_rpc(
                peer_id,
                self.state.current_term,
                self.node_id,
                prev_log_index,
                prev_log_term,
                entries,
                self.state.commit_index
            )
            
            if success:
                self.match_index[peer_id] = len(self.state.log) - 1
                self.next_index[peer_id] = len(self.state.log)
            else:
                # Decrement next_index and retry
                self.next_index[peer_id] = max(0, self.next_index[peer_id] - 1)
                
        except Exception as e:
            logger.debug(f"Replication to {peer_id} failed: {e}")
    
    async def _append_entries_rpc(
        self,
        peer_id: str,
        term: int,
        leader_id: str,
        prev_log_index: int,
        prev_log_term: int,
        entries: List[LogEntry],
        leader_commit: int
    ) -> bool:
        """Append entries RPC (simplified)."""
        # In production, this would be an actual network RPC
        # For MVP, simulate success
        await asyncio.sleep(0.05)  # Simulate network latency
        return True
    
    async def _apply_committed_entries(self):
        """Apply committed entries to state machine."""
        while True:
            try:
                while self.state.last_applied < self.state.commit_index:
                    self.state.last_applied += 1
                    
                    if self.state.last_applied < len(self.state.log):
                        entry = self.state.log[self.state.last_applied]
                        await self._apply_entry(entry)
                
                # Update commit index if leader
                if self.role == NodeRole.LEADER:
                    # Count replicated entries
                    replicated_count = 1  # Count self
                    for peer in self.peers:
                        if self.match_index.get(peer, 0) >= len(self.state.log) - 1:
                            replicated_count += 1
                    
                    # Update commit index if majority replicated
                    if replicated_count > len(self.peers) / 2:
                        self.state.commit_index = len(self.state.log) - 1
                
                await asyncio.sleep(0.1)
                
            except Exception as e:
                logger.error(f"Apply error: {e}")
                await asyncio.sleep(1)
    
    async def _apply_entry(self, entry: LogEntry):
        """Apply log entry to state machine."""
        try:
            command = entry.command
            data = entry.data
            
            if command == "register_node":
                self.registry.register_node(**data)
            elif command == "update_node":
                node_id = data.pop("node_id")
                self.registry.update_node(node_id, data)
            elif command == "delete_node":
                self.registry.delete_node(data["node_id"])
            elif command == "update_status":
                self.registry.update_node_status(
                    data["node_id"],
                    data["status"]
                )
            
            logger.debug(f"Applied entry: {command}")
            
        except Exception as e:
            logger.error(f"Apply entry failed: {e}")
    
    def submit_command(self, command: str, data: Dict) -> bool:
        """Submit command to be replicated."""
        if self.role != NodeRole.LEADER:
            logger.warning(f"Not leader, cannot submit command")
            return False
        
        try:
            entry = LogEntry(
                term=self.state.current_term,
                index=len(self.state.log),
                command=command,
                data=data
            )
            
            self.state.log.append(entry)
            self._update_state_hash()
            
            logger.debug(f"Submitted command: {command}")
            return True
            
        except Exception as e:
            logger.error(f"Submit command failed: {e}")
            return False
    
    def _update_state_hash(self):
        """Update hash of current state."""
        state_str = json.dumps(asdict(self.state), default=str)
        self.state.state_hash = hashlib.sha256(state_str.encode()).hexdigest()
    
    def get_state(self) -> Dict:
        """Get current replication state."""
        return {
            "node_id": self.node_id,
            "role": self.role.value,
            "term": self.state.current_term,
            "leader_id": self.state.leader_id,
            "log_length": len(self.state.log),
            "commit_index": self.state.commit_index,
            "last_applied": self.state.last_applied,
            "state_hash": self.state.state_hash
        }
    
    def detect_leader_failure(self) -> bool:
        """Detect if current leader has failed."""
        if self.role == NodeRole.LEADER:
            return False
        
        # If no heartbeat for longer than election timeout, leader might be down
        time_since_heartbeat = (utc_now() - self.last_heartbeat).total_seconds()
        return time_since_heartbeat > (self.election_timeout_max * 2)
    
    async def handle_leader_failure(self):
        """Handle detected leader failure."""
        logger.warning("Leader failure detected, triggering new election")
        self.role = NodeRole.FOLLOWER
        self.state.leader_id = None
        await self._start_election()
