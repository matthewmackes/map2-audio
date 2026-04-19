import asyncio
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import app.services.midi_hub.cluster_clock as cluster_clock_module
from app.services.midi_hub.cluster_clock import ClockMasterStrategy, MidiClusterClock
from app.services.midi_hub.ports import MidiMessage


def _utcnow():
    return datetime.now(timezone.utc)


@dataclass
class _FakeDiscoveryNode:
    node_id: str
    address: str
    online: bool = True

    @property
    def hostname(self) -> str:
        return self.node_id

    @property
    def addresses(self) -> list[str]:
        return [self.address]

    @property
    def port(self) -> int:
        return 8080

    @property
    def last_seen(self):
        return _utcnow()


class _FakeDiscoveryService:
    def __init__(self, nodes):
        self.nodes = list(nodes)

    def get_discovered_nodes(self, online_only: bool = True):
        if online_only:
            return [node for node in self.nodes if node.online]
        return list(self.nodes)


class _FakeEventBus:
    def __init__(self):
        self.events = []

    async def emit(self, event):
        self.events.append(event)
        return event.event_id


class _FakeClockEngine:
    def __init__(self, *, bpm: float = 120.0, running: bool = False, source_mode: str = "internal"):
        self._status = {
            "bpm": float(bpm),
            "running": bool(running),
            "source_mode": str(source_mode),
            "detected_bpm": None,
            "offset_ms": 0.0,
        }
        self.tick_timestamp_ns = 0
        self.sync_calls = []
        self.configure_calls = []

    def status(self):
        return dict(self._status)

    def configure(self, **updates):
        self.configure_calls.append(dict(updates))
        self._status.update(updates)
        return self.status()

    def set_external_sync(self, bpm: float, offset_ms: float = 0.0):
        self.sync_calls.append({"bpm": float(bpm), "offset_ms": float(offset_ms)})
        self._status["source_mode"] = "external"
        self._status["detected_bpm"] = float(bpm)
        self._status["offset_ms"] = float(offset_ms)
        return self.status()

    def get_tick_timestamp_ns(self):
        return int(self.tick_timestamp_ns)


class _FakeTransport:
    def __init__(self):
        self.started = 0
        self.invites = []
        self.sent = []
        self.closed = []
        self._sessions = {}

    async def start(self):
        self.started += 1

    async def invite(self, host, port, **kwargs):
        session_id = f"clock-session-{len(self.invites) + 1}"
        session = SimpleNamespace(
            session_id=session_id,
            remote_node_id=str(kwargs.get("remote_node_id") or ""),
            state="connected",
            latency_ms=0.5,
        )
        self.invites.append({"host": host, "port": int(port), **kwargs, "session_id": session_id})
        self._sessions[session_id] = session
        return session

    async def send_midi(self, session_id, midi_bytes, timestamp_ns, *, metadata=None):
        self.sent.append(
            {
                "session_id": session_id,
                "midi_bytes": bytes(midi_bytes),
                "timestamp_ns": int(timestamp_ns),
                "metadata": dict(metadata or {}),
            }
        )
        return session_id in self._sessions

    async def close_session(self, session_id):
        self.closed.append(session_id)
        self._sessions.pop(session_id, None)
        return True

    def get_sessions(self):
        return list(self._sessions.values())


class _FakeHub:
    def __init__(self):
        self.subscribers = {}

    def subscribe(self, subscriber_id, callback):
        self.subscribers[subscriber_id] = callback

    def unsubscribe(self, subscriber_id):
        return self.subscribers.pop(subscriber_id, None) is not None


class _FakeRouter:
    def __init__(self, connections=None):
        self._connections = list(connections or [])

    def get_connections(self):
        return list(self._connections)


def _config_values(**overrides):
    values = {
        "midi.cluster.clock_strategy": "leader-node",
        "midi.cluster.clock_master_node_id": "",
        "midi.cluster.clock_drift_threshold_ms": 2.0,
        "midi.cluster.clock_failover_timeout_s": 3.0,
        "midi.cluster.clock_local_latency_ms": 1.0,
        "midi.cluster.rtp_midi_port": 5004,
    }
    values.update(overrides)
    return values


def test_manual_strategy_elects_configured_master(monkeypatch):
    values = _config_values(
        **{
            "midi.cluster.clock_strategy": "manual",
            "midi.cluster.clock_master_node_id": "node-b",
        }
    )
    monkeypatch.setattr(cluster_clock_module, "config_get", lambda key, default=None: values.get(key, default))

    event_bus = _FakeEventBus()
    clock_engine = _FakeClockEngine()
    clock = MidiClusterClock(
        discovery=_FakeDiscoveryService([_FakeDiscoveryNode("node-b", "10.0.0.2")]),
        cluster_router=_FakeRouter(),
        event_bus=event_bus,
        clock_engine=clock_engine,
        transport=_FakeTransport(),
        hub=_FakeHub(),
        local_node_id="node-a",
    )

    async def _run():
        await clock.start()
        state = clock.get_state()
        await clock.stop()
        return state

    state = asyncio.run(_run())
    assert state.strategy == ClockMasterStrategy.MANUAL
    assert state.master_node_id == "node-b"
    assert state.is_master is False
    assert clock_engine.configure_calls[-1]["source_mode"] == "external"
    assert any(event.kind == "midi.clock.master.elected" for event in event_bus.events)


def test_leader_strategy_uses_raft_leader(monkeypatch):
    values = _config_values()
    monkeypatch.setattr(cluster_clock_module, "config_get", lambda key, default=None: values.get(key, default))
    monkeypatch.setattr(MidiClusterClock, "_raft_leader_node_id", lambda self: "node-c")

    clock = MidiClusterClock(
        discovery=_FakeDiscoveryService(
            [
                _FakeDiscoveryNode("node-b", "10.0.0.2"),
                _FakeDiscoveryNode("node-c", "10.0.0.3"),
            ]
        ),
        cluster_router=_FakeRouter(),
        event_bus=_FakeEventBus(),
        clock_engine=_FakeClockEngine(),
        transport=_FakeTransport(),
        hub=_FakeHub(),
        local_node_id="node-a",
    )

    assert clock.elect_master() == "node-c"


def test_lowest_latency_strategy_prefers_lowest_average_node(monkeypatch):
    values = _config_values(**{"midi.cluster.clock_strategy": "lowest-latency"})
    monkeypatch.setattr(cluster_clock_module, "config_get", lambda key, default=None: values.get(key, default))

    connections = [
        SimpleNamespace(
            state="connected",
            source=SimpleNamespace(node_id="node-a"),
            destination=SimpleNamespace(node_id="node-b"),
            latency_ms=0.8,
        ),
        SimpleNamespace(
            state="connected",
            source=SimpleNamespace(node_id="node-a"),
            destination=SimpleNamespace(node_id="node-c"),
            latency_ms=2.4,
        ),
    ]
    clock = MidiClusterClock(
        discovery=_FakeDiscoveryService(
            [
                _FakeDiscoveryNode("node-b", "10.0.0.2"),
                _FakeDiscoveryNode("node-c", "10.0.0.3"),
            ]
        ),
        cluster_router=_FakeRouter(connections),
        event_bus=_FakeEventBus(),
        clock_engine=_FakeClockEngine(),
        transport=_FakeTransport(),
        hub=_FakeHub(),
        local_node_id="node-a",
    )

    assert clock.elect_master() == "node-b"


def test_master_broadcasts_ticks_to_followers(monkeypatch):
    values = _config_values(
        **{
            "midi.cluster.clock_strategy": "manual",
            "midi.cluster.clock_master_node_id": "node-a",
        }
    )
    monkeypatch.setattr(cluster_clock_module, "config_get", lambda key, default=None: values.get(key, default))

    event_bus = _FakeEventBus()
    clock_engine = _FakeClockEngine(bpm=128.0, running=True)
    clock_engine.tick_timestamp_ns = 987_654_321
    transport = _FakeTransport()
    clock = MidiClusterClock(
        discovery=_FakeDiscoveryService(
            [
                _FakeDiscoveryNode("node-b", "10.0.0.2"),
                _FakeDiscoveryNode("node-c", "10.0.0.3"),
            ]
        ),
        cluster_router=_FakeRouter(),
        event_bus=event_bus,
        clock_engine=clock_engine,
        transport=transport,
        hub=_FakeHub(),
        local_node_id="node-a",
    )

    async def _run():
        await clock.start()
        await clock._broadcast_master_tick()
        state = clock.get_state()
        await clock.stop()
        return state

    state = asyncio.run(_run())
    assert state.is_master is True
    assert state.followers == ["node-b", "node-c"]
    assert len(transport.invites) == 2
    assert len(transport.sent) == 2
    assert all(call["midi_bytes"] == bytes([0xF8]) for call in transport.sent)
    assert all(call["metadata"]["clock_master_node_id"] == "node-a" for call in transport.sent)


def test_receiving_master_tick_updates_external_sync(monkeypatch):
    values = _config_values(
        **{
            "midi.cluster.clock_strategy": "manual",
            "midi.cluster.clock_master_node_id": "node-b",
        }
    )
    monkeypatch.setattr(cluster_clock_module, "config_get", lambda key, default=None: values.get(key, default))

    clock_engine = _FakeClockEngine()
    clock = MidiClusterClock(
        discovery=_FakeDiscoveryService([_FakeDiscoveryNode("node-b", "10.0.0.2")]),
        cluster_router=_FakeRouter(),
        event_bus=_FakeEventBus(),
        clock_engine=clock_engine,
        transport=_FakeTransport(),
        hub=_FakeHub(),
        local_node_id="node-a",
    )

    async def _run():
        await clock.start()
        clock._on_hub_message(
            MidiMessage(
                data=bytes([0xF8]),
                timestamp_ns=1_002_000_000,
                source_port="midi_cluster_clock",
                destination_port="midi_clock",
                metadata={
                    "cluster_clock_master": True,
                    "clock_master_node_id": "node-b",
                    "clock_bpm": 110.0,
                    "clock_tick_timestamp_ns": 1_000_000_000,
                },
            )
        )
        state = clock.get_state()
        await clock.stop()
        return state

    state = asyncio.run(_run())
    assert clock_engine.sync_calls[-1] == {"bpm": 110.0, "offset_ms": 2.0}
    assert state.master_node_id == "node-b"
    assert state.sync_offset_ms == 2.0
    assert state.master_bpm == 110.0


def test_drift_detection_publishes_alert(monkeypatch):
    values = _config_values(
        **{
            "midi.cluster.clock_strategy": "manual",
            "midi.cluster.clock_master_node_id": "node-b",
            "midi.cluster.clock_drift_threshold_ms": 2.0,
        }
    )
    monkeypatch.setattr(cluster_clock_module, "config_get", lambda key, default=None: values.get(key, default))

    event_bus = _FakeEventBus()
    clock = MidiClusterClock(
        discovery=_FakeDiscoveryService([_FakeDiscoveryNode("node-b", "10.0.0.2")]),
        cluster_router=_FakeRouter(),
        event_bus=event_bus,
        clock_engine=_FakeClockEngine(),
        transport=_FakeTransport(),
        hub=_FakeHub(),
        local_node_id="node-a",
    )

    async def _run():
        await clock.start()
        clock._state.is_master = False
        clock._state.master_node_id = "node-b"
        clock._offset_samples = [0.1, 0.2, 3.6]
        await asyncio.sleep(1.1)
        await clock.stop()

    asyncio.run(_run())
    assert any(event.kind == "midi.clock.drift" for event in event_bus.events)


def test_master_timeout_triggers_failover(monkeypatch):
    values = _config_values()
    monkeypatch.setattr(cluster_clock_module, "config_get", lambda key, default=None: values.get(key, default))

    event_bus = _FakeEventBus()
    remote_master = _FakeDiscoveryNode("node-b", "10.0.0.2")
    clock = MidiClusterClock(
        discovery=_FakeDiscoveryService([remote_master]),
        cluster_router=_FakeRouter(),
        event_bus=event_bus,
        clock_engine=_FakeClockEngine(),
        transport=_FakeTransport(),
        hub=_FakeHub(),
        local_node_id="node-a",
    )
    clock._state.master_node_id = "node-b"
    clock._state.is_master = False
    clock._last_master_tick_monotonic = time.monotonic() - 4.0
    remote_master.online = False

    asyncio.run(clock._handle_master_lost())

    state = clock.get_state()
    assert state.master_node_id == "node-a"
    assert state.is_master is True
    assert any(
        event.kind == "midi.clock.master.elected" and event.context.get("reason") == "master_lost"
        for event in event_bus.events
    )


def test_master_timeout_uses_last_sync_when_no_ticks_arrive(monkeypatch):
    values = _config_values()
    monkeypatch.setattr(cluster_clock_module, "config_get", lambda key, default=None: values.get(key, default))

    clock = MidiClusterClock(
        discovery=_FakeDiscoveryService([_FakeDiscoveryNode("node-b", "10.0.0.2")]),
        cluster_router=_FakeRouter(),
        event_bus=_FakeEventBus(),
        clock_engine=_FakeClockEngine(),
        transport=_FakeTransport(),
        hub=_FakeHub(),
        local_node_id="node-a",
    )
    clock._state.master_node_id = "node-b"
    clock._state.is_master = False
    clock._state.last_sync = _utcnow() - timedelta(seconds=4)

    assert clock._master_timed_out() is True
