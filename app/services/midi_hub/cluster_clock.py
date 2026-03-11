"""Distributed MIDI clock election and follower synchronization."""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from app.config import config_get
from app.services.cluster.distributed_event_bus import (
    ClusterEvent,
    DistributedEventBus,
    EventSeverity,
    EventType,
    get_event_bus as get_distributed_event_bus,
)
from app.services.midi_hub.clock_engine import MidiClockEngine, PPQN, get_midi_clock_engine
from app.services.midi_hub.cluster_router import MidiClusterRouter, get_midi_cluster_router
from app.services.midi_hub.hub import MidiHub, get_midi_hub
from app.services.midi_hub.midi_discovery import MidiDiscoveryService, MidiNode, get_midi_discovery_service
from app.services.midi_hub.ports import MidiMessage
from app.services.midi_hub.rtp_transport import MidiRtpTransport, get_rtp_transport

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _resolve_local_node_id() -> str:
    try:
        from app.services.cluster.enhanced_node_identity import get_enhanced_node_identity

        return get_enhanced_node_identity().get_node_id()
    except Exception:
        return "local"


class ClockMasterStrategy(str, Enum):
    LEADER_NODE = "leader-node"
    LOWEST_LATENCY = "lowest-latency"
    MANUAL = "manual"
    EXTERNAL = "external"

    @classmethod
    def from_value(cls, value: Any) -> "ClockMasterStrategy":
        normalized = str(value or "").strip().lower().replace("_", "-")
        for item in cls:
            if item.value == normalized:
                return item
        return cls.LEADER_NODE


@dataclass
class ClusterClockState:
    master_node_id: Optional[str] = None
    master_bpm: float = 120.0
    strategy: ClockMasterStrategy = ClockMasterStrategy.LEADER_NODE
    is_master: bool = False
    sync_offset_ms: float = 0.0
    drift_ms: float = 0.0
    last_sync: datetime = field(default_factory=_utcnow)
    followers: List[str] = field(default_factory=list)


class MidiClusterClock:
    """Elect a cluster clock master and synchronize follower timing."""

    def __init__(
        self,
        discovery: Optional[MidiDiscoveryService] = None,
        cluster_router: Optional[MidiClusterRouter] = None,
        event_bus: Optional[DistributedEventBus] = None,
        clock_engine: Optional[MidiClockEngine] = None,
        *,
        transport: Optional[MidiRtpTransport] = None,
        hub: Optional[MidiHub] = None,
        local_node_id: Optional[str] = None,
    ) -> None:
        self._discovery = discovery or get_midi_discovery_service()
        self._cluster_router = cluster_router or get_midi_cluster_router()
        self._event_bus = event_bus or get_distributed_event_bus()
        self._clock_engine = clock_engine or get_midi_clock_engine()
        self._transport = transport or get_rtp_transport()
        self._hub = hub or get_midi_hub()
        self._local_node_id = str(local_node_id or _resolve_local_node_id())

        self._state = ClusterClockState(
            master_bpm=float(self._clock_engine.status().get("bpm", 120.0)),
            strategy=ClockMasterStrategy.from_value(config_get("midi.cluster.clock_strategy", "leader-node")),
        )
        self._manual_master_node_id = self._read_manual_master()
        self._running = False
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._sync_task: Optional[asyncio.Task[None]] = None
        self._drift_task: Optional[asyncio.Task[None]] = None
        self._subscriber_id = f"midi_cluster_clock_{id(self)}"
        self._clock_sessions: Dict[str, str] = {}
        self._offset_samples: List[float] = []
        self._last_master_tick_monotonic = 0.0
        self._last_sent_tick_ns = 0
        self._last_local_clock_tick_ns = 0
        self._last_drift_alert_monotonic = 0.0
        self._reelect_requested = True

    async def start(self) -> None:
        if self._running:
            return

        self._loop = asyncio.get_running_loop()
        self._running = True
        await self._transport.start()
        self._hub.subscribe(self._subscriber_id, self._on_hub_message)
        await self._rebalance_master(reason="startup")
        self._sync_task = asyncio.create_task(self._sync_loop(), name="midi_cluster_clock_sync")
        self._drift_task = asyncio.create_task(self._detect_drift(), name="midi_cluster_clock_drift")

    async def stop(self) -> None:
        if not self._running:
            return

        self._running = False
        self._hub.unsubscribe(self._subscriber_id)

        if self._sync_task is not None:
            self._sync_task.cancel()
            try:
                await self._sync_task
            except asyncio.CancelledError:
                pass
        self._sync_task = None

        if self._drift_task is not None:
            self._drift_task.cancel()
            try:
                await self._drift_task
            except asyncio.CancelledError:
                pass
        self._drift_task = None

        await self._close_clock_sessions()
        self._state.is_master = False

    def elect_master(self) -> Optional[str]:
        strategy = self._state.strategy
        candidate_node_ids = self._candidate_node_ids()

        if strategy == ClockMasterStrategy.EXTERNAL:
            return None
        if not candidate_node_ids:
            return self._local_node_id

        if strategy == ClockMasterStrategy.MANUAL:
            manual_master = self._manual_master_node_id
            if manual_master and manual_master in candidate_node_ids:
                return manual_master
            return sorted(candidate_node_ids)[0]

        if strategy == ClockMasterStrategy.LEADER_NODE:
            leader_node_id = self._raft_leader_node_id()
            if leader_node_id and leader_node_id in candidate_node_ids:
                return leader_node_id
            current_master = self._state.master_node_id
            if current_master and current_master in candidate_node_ids:
                return current_master
            return sorted(candidate_node_ids)[0]

        if strategy == ClockMasterStrategy.LOWEST_LATENCY:
            best_node_id: Optional[str] = None
            best_latency = float("inf")
            for node_id in sorted(candidate_node_ids):
                latency_ms = self._candidate_latency_ms(node_id)
                if latency_ms < best_latency:
                    best_latency = latency_ms
                    best_node_id = node_id
            return best_node_id or sorted(candidate_node_ids)[0]

        return self._local_node_id

    def get_state(self) -> ClusterClockState:
        return ClusterClockState(
            master_node_id=self._state.master_node_id,
            master_bpm=float(self._state.master_bpm),
            strategy=self._state.strategy,
            is_master=bool(self._state.is_master),
            sync_offset_ms=float(self._state.sync_offset_ms),
            drift_ms=float(self._state.drift_ms),
            last_sync=self._state.last_sync,
            followers=list(self._state.followers),
        )

    def set_strategy(self, strategy: Any) -> None:
        self._state.strategy = ClockMasterStrategy.from_value(strategy)
        self._reelect_requested = True
        if self._running:
            self._schedule_coroutine(self._rebalance_master(reason="strategy_changed"))

    def set_manual_master(self, node_id: str) -> None:
        normalized = str(node_id or "").strip() or None
        self._manual_master_node_id = normalized
        self._reelect_requested = True
        if self._state.strategy == ClockMasterStrategy.MANUAL and self._running:
            self._schedule_coroutine(self._rebalance_master(reason="manual_master_changed"))

    async def force_resync(self) -> Dict[str, Any]:
        self._reelect_requested = True
        await self._rebalance_master(reason="manual_resync")
        if self._state.is_master:
            await self._broadcast_master_tick()
        return self.get_drift_report()

    def get_drift_report(self) -> Dict[str, Any]:
        measurements: List[Dict[str, Any]] = []
        last_sync = self._state.last_sync.isoformat().replace("+00:00", "Z")

        if self._state.is_master:
            for follower_node_id in self._state.followers:
                measurements.append(
                    {
                        "node_id": follower_node_id,
                        "role": "follower",
                        "drift_ms": None,
                        "sync_offset_ms": None,
                        "last_sync": last_sync,
                        "available": True,
                    }
                )
        else:
            measurements.append(
                {
                    "node_id": self._local_node_id,
                    "role": "follower",
                    "drift_ms": float(self._state.drift_ms),
                    "sync_offset_ms": float(self._state.sync_offset_ms),
                    "last_sync": last_sync,
                    "available": bool(self._state.master_node_id),
                }
            )

        return {
            "master_node_id": self._state.master_node_id,
            "strategy": self._state.strategy.value,
            "generated_at": _utcnow().isoformat().replace("+00:00", "Z"),
            "measurements": measurements,
        }

    async def _sync_loop(self) -> None:
        while self._running:
            if self._reelect_requested or self._master_requires_reselection():
                await self._rebalance_master(reason="periodic_check")

            if self._state.is_master:
                await self._broadcast_master_tick()
            else:
                await self._close_clock_sessions()
                if self._master_timed_out():
                    await self._handle_master_lost()

            await asyncio.sleep(self._sync_sleep_seconds())

    async def _detect_drift(self) -> None:
        threshold_ms = max(0.5, float(config_get("midi.cluster.clock_drift_threshold_ms", 2.0)))
        while self._running:
            await asyncio.sleep(1.0)

            if self._state.is_master or not self._offset_samples:
                self._state.drift_ms = 0.0
                continue

            window = self._offset_samples[-24:]
            baseline = sum(window) / len(window)
            drift_ms = abs(window[-1] - baseline)
            self._state.drift_ms = drift_ms

            if drift_ms <= threshold_ms:
                continue

            now = time.monotonic()
            if now - self._last_drift_alert_monotonic < 1.0:
                continue

            self._last_drift_alert_monotonic = now
            await self._event_bus.publish_event(
                ClusterEvent(
                    event_type=EventType.MIDI_CLOCK_DRIFT_DETECTED,
                    severity=EventSeverity.WARNING,
                    source_node_id=self._local_node_id,
                    affected_nodes=self._affected_nodes(),
                    message=f"MIDI clock drift exceeded {threshold_ms:.2f}ms",
                    details=self._event_details(),
                )
            )

    async def _handle_master_lost(self) -> None:
        self._last_master_tick_monotonic = 0.0
        self._offset_samples.clear()
        await self._rebalance_master(reason="master_lost")

    async def _rebalance_master(self, *, reason: str) -> None:
        self._reelect_requested = False
        previous_master = self._state.master_node_id
        next_master = self.elect_master()

        self._state.master_node_id = next_master
        self._state.is_master = next_master == self._local_node_id and next_master is not None
        self._state.followers = self._follower_node_ids(next_master)
        self._state.last_sync = _utcnow()

        if self._state.is_master:
            self._offset_samples.clear()
            self._state.sync_offset_ms = 0.0
            self._state.drift_ms = 0.0
        elif next_master is None:
            self._clock_engine.configure(source_mode="external")
            self._state.sync_offset_ms = 0.0
        else:
            self._clock_engine.configure(source_mode="external")

        if not self._state.is_master:
            await self._close_clock_sessions()

        changed = previous_master != next_master
        if changed or reason in {"startup", "master_lost", "strategy_changed", "manual_master_changed"}:
            await self._event_bus.publish_event(
                ClusterEvent(
                    event_type=EventType.MIDI_CLOCK_MASTER_ELECTED,
                    severity=EventSeverity.INFO,
                    source_node_id=self._local_node_id,
                    affected_nodes=self._affected_nodes(),
                    message=f"MIDI clock master set to {next_master or 'external'}",
                    details={**self._event_details(), "reason": reason},
                )
            )

    async def _broadcast_master_tick(self) -> None:
        bpm = self._effective_master_bpm()
        self._state.master_bpm = bpm

        followers = self._follower_nodes()
        self._state.followers = [node.node_id for node in followers]
        if not followers:
            return

        await self._ensure_follower_sessions(followers)
        if not self._clock_sessions:
            return

        tick_timestamp_ns = self._next_tick_timestamp_ns(bpm)
        if tick_timestamp_ns <= 0:
            return

        metadata = {
            "cluster_clock_master": True,
            "clock_master_node_id": self._local_node_id,
            "clock_bpm": bpm,
            "clock_tick_timestamp_ns": tick_timestamp_ns,
        }
        stale_nodes: List[str] = []
        for follower_node_id, session_id in list(self._clock_sessions.items()):
            ok = await self._transport.send_midi(
                session_id,
                bytes([0xF8]),
                tick_timestamp_ns,
                metadata=metadata,
            )
            if not ok:
                stale_nodes.append(follower_node_id)

        for follower_node_id in stale_nodes:
            await self._close_clock_session(follower_node_id)

        self._state.last_sync = _utcnow()
        self._last_sent_tick_ns = tick_timestamp_ns

    async def _ensure_follower_sessions(self, followers: List[MidiNode]) -> None:
        active_followers = {node.node_id for node in followers}
        for node_id in list(self._clock_sessions):
            if node_id not in active_followers:
                await self._close_clock_session(node_id)

        rtp_port = int(config_get("midi.cluster.rtp_midi_port", 5004))
        existing_sessions = {session.session_id: session for session in self._transport.get_sessions()}
        for node in followers:
            session_id = self._clock_sessions.get(node.node_id)
            if session_id and existing_sessions.get(session_id) is not None:
                continue

            target_host = node.addresses[0] if node.addresses else node.hostname
            try:
                session = await self._transport.invite(
                    target_host,
                    rtp_port,
                    remote_node_id=node.node_id,
                    source_port="midi_cluster_clock",
                    destination_port="midi_clock",
                    source_node_id=self._local_node_id,
                )
            except Exception as exc:
                logger.debug("Cluster clock invite to %s failed: %s", node.node_id, exc)
                continue

            self._clock_sessions[node.node_id] = session.session_id

    async def _close_clock_sessions(self) -> None:
        for node_id in list(self._clock_sessions):
            await self._close_clock_session(node_id)

    async def _close_clock_session(self, node_id: str) -> None:
        session_id = self._clock_sessions.pop(str(node_id), None)
        if session_id:
            await self._transport.close_session(session_id)

    def _on_hub_message(self, message: MidiMessage) -> None:
        if not self._running or not message.data:
            return
        if (int(message.data[0]) & 0xFF) != 0xF8:
            return

        metadata = dict(message.metadata or {})
        if not metadata.get("cluster_clock_master"):
            return

        master_node_id = str(metadata.get("clock_master_node_id") or metadata.get("cluster_remote_node_id") or "").strip()
        if not master_node_id or master_node_id == self._local_node_id:
            return

        current_master = self._state.master_node_id
        if current_master and current_master != master_node_id and not self._master_timed_out():
            return

        remote_tick_timestamp_ns = self._to_int(metadata.get("clock_tick_timestamp_ns"))
        local_tick_timestamp_ns = int(message.timestamp_ns or time.time_ns())
        offset_ms = 0.0
        if remote_tick_timestamp_ns > 0:
            offset_ms = (local_tick_timestamp_ns - remote_tick_timestamp_ns) / 1_000_000.0
        bpm = self._to_float(metadata.get("clock_bpm"), self._effective_master_bpm())

        self._last_master_tick_monotonic = time.monotonic()
        self._offset_samples.append(offset_ms)
        if len(self._offset_samples) > 64:
            self._offset_samples = self._offset_samples[-64:]

        self._state.master_node_id = master_node_id
        self._state.master_bpm = bpm
        self._state.is_master = False
        self._state.sync_offset_ms = offset_ms
        self._state.last_sync = _utcnow()
        self._state.followers = self._follower_node_ids(master_node_id)
        self._clock_engine.set_external_sync(bpm, offset_ms)

    def _candidate_node_ids(self) -> List[str]:
        node_ids = {self._local_node_id}
        for node in self._discovery.get_discovered_nodes(online_only=True):
            node_ids.add(node.node_id)
        return sorted(node_ids)

    def _follower_nodes(self) -> List[MidiNode]:
        followers: List[MidiNode] = []
        for node in self._discovery.get_discovered_nodes(online_only=True):
            if node.node_id == self._local_node_id:
                continue
            followers.append(node)
        return sorted(followers, key=lambda row: row.node_id)

    def _follower_node_ids(self, master_node_id: Optional[str]) -> List[str]:
        return [
            node.node_id
            for node in self._discovery.get_discovered_nodes(online_only=True)
            if node.node_id != (master_node_id or "")
        ]

    def _effective_master_bpm(self) -> float:
        status = self._clock_engine.status()
        detected_bpm = status.get("detected_bpm")
        if str(status.get("source_mode", "internal")).lower() == "external" and detected_bpm is not None:
            return max(1.0, min(500.0, float(detected_bpm)))
        return max(20.0, min(300.0, float(status.get("bpm", 120.0))))

    def _next_tick_timestamp_ns(self, bpm: float) -> int:
        current_tick_ns = int(self._clock_engine.get_tick_timestamp_ns() or 0)
        if current_tick_ns > self._last_local_clock_tick_ns:
            self._last_local_clock_tick_ns = current_tick_ns
            return current_tick_ns

        interval_ns = max(500_000, int((60.0 / (max(1.0, float(bpm)) * PPQN)) * 1_000_000_000.0))
        now_ns = time.time_ns()
        if self._last_sent_tick_ns <= 0 or (now_ns - self._last_sent_tick_ns) >= interval_ns:
            return now_ns
        return 0

    def _master_requires_reselection(self) -> bool:
        if self._state.strategy == ClockMasterStrategy.EXTERNAL:
            return self._state.master_node_id is not None
        current_master = self._state.master_node_id
        if not current_master:
            return True
        return current_master not in set(self._candidate_node_ids())

    def _master_timed_out(self) -> bool:
        if self._state.is_master:
            return False
        if self._state.strategy == ClockMasterStrategy.EXTERNAL:
            return False
        if not self._state.master_node_id or self._state.master_node_id == self._local_node_id:
            return False
        timeout_s = max(0.5, float(config_get("midi.cluster.clock_failover_timeout_s", 3.0)))
        if self._last_master_tick_monotonic <= 0.0:
            return (_utcnow() - self._state.last_sync).total_seconds() >= timeout_s
        return (time.monotonic() - self._last_master_tick_monotonic) >= timeout_s

    def _sync_sleep_seconds(self) -> float:
        bpm = self._effective_master_bpm()
        return max(0.002, min(0.05, 60.0 / (max(1.0, bpm) * PPQN * 2.0)))

    def _candidate_latency_ms(self, node_id: str) -> float:
        latencies: List[float] = []
        try:
            for connection in self._cluster_router.get_connections():
                if getattr(connection, "state", "") != "connected":
                    continue
                if node_id not in {connection.source.node_id, connection.destination.node_id}:
                    continue
                if connection.latency_ms is not None:
                    latencies.append(float(connection.latency_ms))
        except Exception:
            pass

        try:
            for session in self._transport.get_sessions():
                if session.remote_node_id == node_id and session.state == "connected" and session.latency_ms > 0:
                    latencies.append(float(session.latency_ms))
        except Exception:
            pass

        if latencies:
            return sum(latencies) / len(latencies)

        if node_id == self._local_node_id:
            return float(config_get("midi.cluster.clock_local_latency_ms", 1.0))

        try:
            from app.services.cluster.heartbeat_monitor import get_heartbeat_monitor

            health = get_heartbeat_monitor().get_node_health(node_id)
            if health and health.response_time_ms is not None:
                return float(health.response_time_ms)
        except Exception:
            pass

        return float("inf")

    def _raft_leader_node_id(self) -> Optional[str]:
        try:
            from app.services.cluster.raft_consensus import get_raft_consensus

            return get_raft_consensus().get_leader()
        except Exception:
            return None

    def _read_manual_master(self) -> Optional[str]:
        configured = str(config_get("midi.cluster.clock_master_node_id", "") or "").strip()
        return configured or None

    def _affected_nodes(self) -> List[str]:
        nodes = [self._local_node_id]
        if self._state.master_node_id and self._state.master_node_id not in nodes:
            nodes.append(self._state.master_node_id)
        for follower in self._state.followers:
            if follower not in nodes:
                nodes.append(follower)
        return nodes

    def _event_details(self) -> Dict[str, Any]:
        return {
            "master_node_id": self._state.master_node_id,
            "master_bpm": float(self._state.master_bpm),
            "strategy": self._state.strategy.value,
            "is_master": bool(self._state.is_master),
            "sync_offset_ms": float(self._state.sync_offset_ms),
            "drift_ms": float(self._state.drift_ms),
            "followers": list(self._state.followers),
        }

    def _schedule_coroutine(self, coroutine: "asyncio.Future[Any]") -> None:
        if self._loop is not None and self._loop.is_running():
            self._loop.call_soon_threadsafe(lambda: self._loop.create_task(coroutine))
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            asyncio.run(coroutine)
        else:
            loop.create_task(coroutine)

    @staticmethod
    def _to_float(value: Any, default: float) -> float:
        try:
            return float(value)
        except Exception:
            return float(default)

    @staticmethod
    def _to_int(value: Any) -> int:
        try:
            return int(value)
        except Exception:
            return 0


_midi_cluster_clock_singleton: Optional[MidiClusterClock] = None


def get_midi_cluster_clock() -> MidiClusterClock:
    global _midi_cluster_clock_singleton
    if _midi_cluster_clock_singleton is None:
        _midi_cluster_clock_singleton = MidiClusterClock()
    return _midi_cluster_clock_singleton
