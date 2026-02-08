"""
Raft Consensus API Endpoints

Handles RPC calls for:
- RequestVote (leader election)
- AppendEntries (log replication)
- State queries
"""

from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from app.services.cluster.raft_consensus import get_raft_consensus, LogEntry

router = APIRouter(prefix="/api/raft", tags=["raft"])


class VoteRequest(BaseModel):
    """RequestVote RPC request."""
    term: int
    candidate_id: str
    last_log_index: int
    last_log_term: int


class VoteResponse(BaseModel):
    """RequestVote RPC response."""
    term: int
    vote_granted: bool


class AppendEntriesRequest(BaseModel):
    """AppendEntries RPC request."""
    term: int
    leader_id: str
    prev_log_index: int
    prev_log_term: int
    entries: List[Dict[str, Any]]
    leader_commit: int


class AppendEntriesResponse(BaseModel):
    """AppendEntries RPC response."""
    term: int
    success: bool


@router.post("/vote", response_model=VoteResponse)
async def request_vote(request: VoteRequest):
    """
    RequestVote RPC - Handle vote requests during leader election.
    
    A candidate requests votes from other nodes to become leader.
    """
    try:
        raft = get_raft_consensus()
        
        # If request term is greater, update our term
        if request.term > raft.current_term:
            raft.current_term = request.term
            raft.voted_for = None
            from app.services.cluster.raft_consensus import RaftRole
            raft.role = RaftRole.FOLLOWER
        
        # Grant vote if:
        # 1. Term matches and we haven't voted yet
        # 2. Candidate's log is at least as complete as ours
        vote_granted = False
        if request.term == raft.current_term and raft.voted_for is None:
            our_log_complete = (
                request.last_log_term > (raft.log[-1].term if raft.log else 0) or
                (request.last_log_term == (raft.log[-1].term if raft.log else 0) and 
                 request.last_log_index >= len(raft.log) - 1)
            )
            
            if our_log_complete:
                vote_granted = True
                raft.voted_for = request.candidate_id
        
        return VoteResponse(term=raft.current_term, vote_granted=vote_granted)
    
    except Exception as e:
        raise HTTPException(500, f"Vote request failed: {e}")


@router.post("/append-entries", response_model=AppendEntriesResponse)
async def append_entries(request: AppendEntriesRequest):
    """
    AppendEntries RPC - Handle log replication from leader.
    
    Leader sends its log entries to followers to replicate state.
    """
    try:
        raft = get_raft_consensus()
        
        # If request term is greater, update our term
        if request.term > raft.current_term:
            raft.current_term = request.term
            raft.voted_for = None
            raft.role = raft.RaftRole.FOLLOWER
        
        # Reset election timeout since we heard from leader
        if request.term == raft.current_term:
            raft.last_heartbeat = datetime.utcnow()
        
        success = False
        
        # Check if we have the previous log entry
        if request.prev_log_index == -1 or (
            request.prev_log_index < len(raft.log) and
            raft.log[request.prev_log_index].term == request.prev_log_term
        ):
            success = True
            
            # Append new entries
            for i, entry_data in enumerate(request.entries):
                index = request.prev_log_index + 1 + i
                
                if index < len(raft.log):
                    # Delete conflicting entries
                    if raft.log[index].term != entry_data["term"]:
                        raft.log = raft.log[:index]
                
                if index >= len(raft.log):
                    # Add new entry
                    from app.services.cluster.raft_consensus import LogEntry
                    entry = LogEntry(
                        term=entry_data["term"],
                        command=entry_data["command"],
                        data=entry_data["data"],
                        index=index
                    )
                    raft.log.append(entry)
            
            # Update commit index
            old_commit = raft.commit_index
            raft.commit_index = min(request.leader_commit, len(raft.log) - 1)
            
            if raft.commit_index > old_commit:
                # Entries were committed, apply them
                pass  # Will be handled by apply_log_entries task
        
        return AppendEntriesResponse(term=raft.current_term, success=success)
    
    except Exception as e:
        raise HTTPException(500, f"AppendEntries failed: {e}")


@router.get("/state")
async def get_raft_state():
    """Get Raft consensus state."""
    try:
        raft = get_raft_consensus()
        return {
            "status": "ok",
            "state": raft.get_state(),
            "is_leader": raft.is_leader(),
            "leader": raft.get_leader(),
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to get Raft state: {e}")


@router.get("/leader")
async def get_leader():
    """Get current leader node ID."""
    try:
        raft = get_raft_consensus()
        leader = raft.get_leader()
        return {
            "status": "ok",
            "leader": leader,
            "is_leader": raft.is_leader(),
            "term": raft.current_term,
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to get leader: {e}")
