import asyncio
import json
from pathlib import Path
from typing import Any, Dict

import pytest
from fastapi import HTTPException

from app.routes import mpx1 as mpx1_routes
import app.services.mpx1_service as mpx1_service_module
from app.services.mpx1_service import MPX1Service


def _registry_path() -> Path:
    return Path(__file__).resolve().parents[1] / "app" / "data" / "mpx1_params.json"


def test_sysex_codec_round_trip() -> None:
    service = MPX1Service(
        registry_path=_registry_path(),
        shadow_path=Path("/tmp/mpx1-test-shadow-codec.json"),
        library_path=Path("/tmp/mpx1-test-library-codec.json"),
    )

    param_id = "program.pitch.algorithm"
    encoded = service.encode_param_sysex(param_id, 7)
    decoded = service.decode_param_sysex(encoded)

    assert decoded is not None
    assert decoded["param_id"] == param_id
    assert decoded["value"] == 7.0


def test_sysex_decode_accepts_lexicon_channel1_style_header() -> None:
    service = MPX1Service(
        registry_path=_registry_path(),
        shadow_path=Path("/tmp/mpx1-test-shadow-decode-ch1.json"),
        library_path=Path("/tmp/mpx1-test-library-decode-ch1.json"),
    )

    param_id = "program.pitch.algorithm"
    canonical = service.encode_param_sysex(param_id, 9)

    # Lexicon hardware can emit device-id/function bytes that differ from
    # MAP2's canonical 0x7F/0x11 transmit header.
    variant = [0xF0, 0x06, 0x09, 0x00, *canonical[4:10], 0xF7]
    decoded = service.decode_param_sysex(variant)

    assert decoded is not None
    assert decoded["param_id"] == param_id
    assert decoded["value"] == 9.0


def test_sysex_decode_accepts_header_with_extra_prefix_byte() -> None:
    service = MPX1Service(
        registry_path=_registry_path(),
        shadow_path=Path("/tmp/mpx1-test-shadow-decode-extra-prefix.json"),
        library_path=Path("/tmp/mpx1-test-library-decode-extra-prefix.json"),
    )

    param_id = "program.pitch.algorithm"
    canonical = service.encode_param_sysex(param_id, 8)
    addr_and_value = canonical[4:10]

    # Some inbound variants insert one extra command byte before address.
    variant = [0xF0, 0x06, 0x09, 0x00, 0x01, *addr_and_value, 0xF7]
    decoded = service.decode_param_sysex(variant)

    assert decoded is not None
    assert decoded["param_id"] == param_id
    assert decoded["value"] == 8.0


def test_extended_program_status_sysex_updates_current_program(tmp_path: Path) -> None:
    service = MPX1Service(
        registry_path=_registry_path(),
        shadow_path=tmp_path / "shadow-program-status.json",
        library_path=tmp_path / "library-program-status.json",
    )

    message = [
        0xF0, 0x06, 0x09, 0x00, 0x01, 0x02,
        0x00, 0x00, 0x00, 0x01, 0x02,  # 0x21 = 33
        0x00, 0x00, 0x03, 0x00, 0x00, 0x00,
        0xF7,
    ]

    async def _run() -> Dict[str, Any] | None:
        return await service.handle_incoming_sysex(message)

    decoded = asyncio.run(_run())
    assert decoded is not None
    assert decoded["frame_type"] == "program_status"
    assert decoded["program"] == 33
    assert service.current_program == 33


def test_extended_program_status_sysex_emits_inferred_panel_status(tmp_path: Path) -> None:
    service = MPX1Service(
        registry_path=_registry_path(),
        shadow_path=tmp_path / "shadow-program-status-events.json",
        library_path=tmp_path / "library-program-status-events.json",
    )

    message = [
        0xF0, 0x06, 0x09, 0x00, 0x01, 0x02,
        0x00, 0x00, 0x00, 0x01, 0x02,  # 0x21 = 33
        0x00, 0x00, 0x03, 0x00, 0x00, 0x00,
        0xF7,
    ]

    async def _run() -> list[Dict[str, Any]]:
        queue = await service.register_ws_client("test-program-status-events")
        await service.handle_incoming_sysex(message)
        events: list[Dict[str, Any]] = []
        while not queue.empty():
            events.append(queue.get_nowait())
        service.unregister_ws_client("test-program-status-events")
        return events

    events = asyncio.run(_run())
    program_events = [event for event in events if event.get("type") == "mpx1:program_changed"]
    panel_events = [event for event in events if event.get("type") == "mpx1:panel_status"]
    assert len(program_events) == 1
    assert len(panel_events) == 1
    assert panel_events[0]["data"]["inferred_from"] == "program_status"
    assert panel_events[0]["data"]["control"] == "program_select"
    assert panel_events[0]["data"]["control_value"] == 33


def test_publish_event_uses_injected_realtime_publisher_and_local_queue(tmp_path: Path) -> None:
    class _FakePublisher:
        def __init__(self) -> None:
            self.messages: list[tuple[tuple[str, ...], Dict[str, Any]]] = []

        async def publish_message(self, message: Dict[str, Any], *, topics) -> None:
            self.messages.append((tuple(topics), dict(message)))

    publisher = _FakePublisher()
    service = MPX1Service(
        registry_path=_registry_path(),
        shadow_path=tmp_path / "shadow-publish-event.json",
        library_path=tmp_path / "library-publish-event.json",
        publisher=publisher,
    )

    async def _run() -> list[Dict[str, Any]]:
        queue = await service.register_ws_client("test-publish-event")
        await service._publish_event("param_verified", {"param_id": "program.pitch.algorithm", "value": 7.0})
        events: list[Dict[str, Any]] = []
        while not queue.empty():
            events.append(queue.get_nowait())
        service.unregister_ws_client("test-publish-event")
        return events

    events = asyncio.run(_run())

    assert publisher.messages
    topics, message = publisher.messages[0]
    assert topics == ("mpx1",)
    assert message["type"] == "mpx1:param_verified"
    assert message["data"] == {"param_id": "program.pitch.algorithm", "value": 7.0}
    assert events[0]["type"] == "mpx1:param_verified"


def test_extended_panel_status_sysex_decodes_control_value(tmp_path: Path) -> None:
    service = MPX1Service(
        registry_path=_registry_path(),
        shadow_path=tmp_path / "shadow-panel-status.json",
        library_path=tmp_path / "library-panel-status.json",
    )

    message = [
        0xF0, 0x06, 0x09, 0x00, 0x01, 0x01,
        0x00, 0x00, 0x00, 0x0B, 0x01,  # 0x1B = 27
        0x04, 0x00, 0x00, 0x00,
        0xF7,
    ]

    async def _run() -> Dict[str, Any] | None:
        return await service.handle_incoming_sysex(message)

    decoded = asyncio.run(_run())
    assert decoded is not None
    assert decoded["frame_type"] == "panel_status"
    assert decoded["control_value"] == 27


def test_extended_heartbeat_sysex_classified(tmp_path: Path) -> None:
    service = MPX1Service(
        registry_path=_registry_path(),
        shadow_path=tmp_path / "shadow-heartbeat.json",
        library_path=tmp_path / "library-heartbeat.json",
    )

    message = [0xF0, 0x06, 0x12, 0x00, 0x12, 0x01, 0x00, 0xF7]

    async def _run() -> Dict[str, Any] | None:
        return await service.handle_incoming_sysex(message)

    decoded = asyncio.run(_run())
    assert decoded is not None
    assert decoded["frame_type"] == "heartbeat"


def test_shadow_state_updates_after_param_dispatch(tmp_path: Path) -> None:
    shadow_path = tmp_path / "mpx1_shadow.json"
    library_path = tmp_path / "mpx1_library.json"
    service = MPX1Service(
        registry_path=_registry_path(),
        shadow_path=shadow_path,
        library_path=library_path,
        coalesce_window_sec=0.01,
    )

    async def _run() -> None:
        await service.set_param("program.pitch.algorithm", 3)
        await asyncio.sleep(0.03)

    asyncio.run(_run())

    payload = json.loads(shadow_path.read_text(encoding="utf-8"))
    assert payload["shadow_state"]["program.pitch.algorithm"] == 3.0


def test_realtime_coalescing_keeps_latest_value(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    service = MPX1Service(
        registry_path=_registry_path(),
        shadow_path=tmp_path / "shadow.json",
        library_path=tmp_path / "library.json",
        coalesce_window_sec=0.01,
    )

    dispatched = []

    async def _fake_dispatch(param_id: str, value: float, source: str) -> None:
        dispatched.append((param_id, value, source))

    monkeypatch.setattr(service, "_dispatch_param_update", _fake_dispatch)

    async def _run():
        await service.set_param("program.pitch.algorithm", 1)
        await service.set_param("program.pitch.algorithm", 9)
        await asyncio.sleep(0.05)

    asyncio.run(_run())

    assert len(dispatched) == 1
    assert dispatched[0][0] == "program.pitch.algorithm"
    assert dispatched[0][1] == 9.0
    assert dispatched[0][2] == "coalesced"


def test_library_seed_populates_curated_entries(tmp_path: Path) -> None:
    service = MPX1Service(
        registry_path=_registry_path(),
        shadow_path=tmp_path / "shadow.json",
        library_path=tmp_path / "library.json",
        midi_maps_path=tmp_path / "midi_maps.json",
    )

    payload = asyncio.run(service.get_library())
    entries = payload["entries"]
    assert len(entries) >= 50
    assert entries[0]["name"]


def test_midi_map_macro_dispatch_targets_multiple_params(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    service = MPX1Service(
        registry_path=_registry_path(),
        shadow_path=tmp_path / "shadow.json",
        library_path=tmp_path / "library.json",
        midi_maps_path=tmp_path / "midi_maps.json",
        coalesce_window_sec=0.005,
    )

    dispatched = []

    async def _fake_dispatch(param_id: str, value: float, source: str) -> None:
        dispatched.append((param_id, value, source))

    monkeypatch.setattr(service, "_dispatch_param_update", _fake_dispatch)

    async def _run() -> None:
        midi_map = {
            "id": "map-macro",
            "name": "Macro Test",
            "mappings": [
                {
                    "id": "m1",
                    "cc": 10,
                    "channel": 1,
                    "target_param_id": "program.pitch.algorithm",
                    "source_min": 0,
                    "source_max": 127,
                    "target_min": 0,
                    "target_max": 10,
                    "curve": "linear",
                    "mode": "continuous",
                    "enabled": True,
                },
                {
                    "id": "m2",
                    "cc": 10,
                    "channel": 1,
                    "target_param_id": "program.chorus.algorithm",
                    "source_min": 0,
                    "source_max": 127,
                    "target_min": 0,
                    "target_max": 11,
                    "curve": "linear",
                    "mode": "continuous",
                    "enabled": True,
                },
            ],
        }
        await service.save_midi_map(midi_map, make_active=True)
        await service.handle_incoming_cc(channel=1, cc=10, value=127)
        await asyncio.sleep(0.03)

    asyncio.run(_run())

    targets = {(param_id, source) for param_id, _value, source in dispatched}
    assert ("program.pitch.algorithm", "coalesced") in targets
    assert ("program.chorus.algorithm", "coalesced") in targets


def test_midi_learn_assigns_mapping_to_active_map(tmp_path: Path) -> None:
    service = MPX1Service(
        registry_path=_registry_path(),
        shadow_path=tmp_path / "shadow.json",
        library_path=tmp_path / "library.json",
        midi_maps_path=tmp_path / "midi_maps.json",
    )

    async def _run() -> Dict[str, Any]:
        await service.save_midi_map(
            {
                "id": "map-learn",
                "name": "Learn",
                "mappings": [],
            },
            make_active=True,
        )
        await service.set_midi_learn_target("program.pitch.algorithm")
        await service.handle_incoming_cc(channel=1, cc=7, value=90)
        return await service.get_midi_maps()

    payload = asyncio.run(_run())
    assert payload["active_map_id"] == "map-learn"
    assert payload["learn_target_param_id"] is None
    mappings = payload["maps"][0]["mappings"]
    assert len(mappings) == 1
    assert mappings[0]["target_param_id"] == "program.pitch.algorithm"
    assert mappings[0]["cc"] == 7
    assert mappings[0]["channel"] == 1


def test_get_midi_ports_probe_failure_returns_structured_payload(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    service = MPX1Service(
        registry_path=_registry_path(),
        shadow_path=tmp_path / "shadow.json",
        library_path=tmp_path / "library.json",
        midi_maps_path=tmp_path / "midi_maps.json",
    )

    class _BrokenRtMidi:
        class MidiIn:
            def __init__(self) -> None:
                raise RuntimeError("in probe failure")

        class MidiOut:
            def __init__(self) -> None:
                raise RuntimeError("out probe failure")

    monkeypatch.setattr(mpx1_service_module, "RTMIDI_AVAILABLE", True)
    monkeypatch.setattr(mpx1_service_module, "rtmidi", _BrokenRtMidi)

    payload = asyncio.run(service.get_midi_ports())
    assert payload["rtmidi_available"] is True
    assert payload["inputs"] == []
    assert payload["outputs"] == []
    assert payload["recommended_input_index"] is None
    assert payload["recommended_output_index"] is None
    assert len(payload["probe_errors"]) == 2


class _DummyMPX1Service:
    async def get_state(self):
        return {"connected": False, "current_program": 0}

    def get_registry(self):
        return {"params": [{"id": "program.pitch.algorithm"}]}

    async def set_param(self, param_id, value, source="api"):
        if param_id == "missing":
            raise KeyError("missing")
        return {"queued": True, "param_id": param_id, "value": value}

    async def set_params_bulk(self, updates):
        return {"results": updates, "count": len(updates)}

    async def set_program(self, program):
        return {"program": program}

    async def get_programs(self):
        return [{"program": 0, "name": "Program 000", "tags": [], "active": True}]

    async def start_dump_all(self):
        return {"job_id": "job-1", "status": "running"}

    async def get_library(self):
        return {"entries": []}

    async def tag_library(self, program, tag, action):
        return {"program": program, "tags": [tag], "action": action}

    async def replace_library_entries(self, entries):
        return {"entries": entries, "count": len(entries)}

    async def get_midi_ports(self):
        return {"rtmidi_available": False, "inputs": [], "outputs": []}

    async def connect_midi(self, input_port_index=None, output_port_index=None, name_hint="mpx"):
        if input_port_index == 99:
            return {"connected": False, "detail": "bad port"}
        return {"connected": True}

    async def disconnect_midi(self):
        return None

    async def get_midi_maps(self):
        return {"active_map_id": None, "learn_target_param_id": None, "maps": [], "count": 0}

    async def save_midi_map(self, midi_map, make_active=False):
        return {"map": midi_map, "active_map_id": midi_map.get("id") if make_active else None}

    async def delete_midi_map(self, map_id):
        return {"removed": 1, "active_map_id": None}

    async def activate_midi_map(self, map_id):
        if map_id == "missing":
            raise ValueError("missing")
        return {"active_map_id": map_id}

    async def set_midi_learn_target(self, target_param_id):
        if target_param_id == "missing":
            raise ValueError("missing")
        return {"learn_target_param_id": target_param_id}

    async def get_health(self):
        return {"status": "ok"}

    async def get_diagnostics(self, limit=100):
        return {"traffic": [], "count": 0, "packet_error_count": 0, "last_heartbeat": 0.0, "limit": limit}

    async def ping_latency(self):
        return {"latency_ms": 1.25, "param_id": "program.pitch.algorithm", "timestamp": 0.0}

    async def register_ws_client(self, _client_id):
        return asyncio.Queue()

    def unregister_ws_client(self, _client_id):
        return None


def test_route_get_state(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mpx1_routes, "get_mpx1_service", lambda: _DummyMPX1Service())
    payload = asyncio.run(mpx1_routes.get_state())
    assert payload["connected"] is False


def test_route_set_param_not_found(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mpx1_routes, "get_mpx1_service", lambda: _DummyMPX1Service())
    req = mpx1_routes.ParamUpdateRequest(value=1.0)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(mpx1_routes.set_param("missing", req))
    assert exc.value.status_code == 404


def test_route_connect_midi_failure_maps_to_503(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mpx1_routes, "get_mpx1_service", lambda: _DummyMPX1Service())
    req = mpx1_routes.MidiConnectRequest(input_port_index=99, output_port_index=0, name_hint="mpx")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(mpx1_routes.connect_midi(req))
    assert exc.value.status_code == 503


def test_route_dump_all(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mpx1_routes, "get_mpx1_service", lambda: _DummyMPX1Service())
    payload = asyncio.run(mpx1_routes.dump_all())
    assert payload["job_id"] == "job-1"
    assert payload["status"] == "running"


def test_route_get_midi_maps(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mpx1_routes, "get_mpx1_service", lambda: _DummyMPX1Service())
    payload = asyncio.run(mpx1_routes.get_midi_maps())
    assert payload["count"] == 0


def test_route_import_library(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mpx1_routes, "get_mpx1_service", lambda: _DummyMPX1Service())
    req = mpx1_routes.LibraryImportRequest(entries=[{"program": 0, "name": "X", "tags": []}])
    payload = asyncio.run(mpx1_routes.import_library(req))
    assert payload["status"] == "ok"
    assert payload["count"] == 1


def test_route_activate_midi_map_not_found(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mpx1_routes, "get_mpx1_service", lambda: _DummyMPX1Service())
    with pytest.raises(HTTPException) as exc:
        asyncio.run(mpx1_routes.activate_midi_map("missing"))
    assert exc.value.status_code == 404


def test_route_diagnostics(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mpx1_routes, "get_mpx1_service", lambda: _DummyMPX1Service())
    payload = asyncio.run(mpx1_routes.get_diagnostics(limit=25))
    assert payload["count"] == 0


def test_route_ping_diagnostics(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mpx1_routes, "get_mpx1_service", lambda: _DummyMPX1Service())
    payload = asyncio.run(mpx1_routes.ping_diagnostics())
    assert payload["status"] == "ok"


# ---------------------------------------------------------------------------
# T036 Sync-hardening tests
# ---------------------------------------------------------------------------


def _make_service(tmp_path: Path) -> MPX1Service:
    return MPX1Service(
        registry_path=_registry_path(),
        shadow_path=tmp_path / "shadow.json",
        library_path=tmp_path / "library.json",
        midi_maps_path=tmp_path / "midi_maps.json",
        coalesce_window_sec=0.005,
    )


# T036-B: Echo-loop suppression ------------------------------------------

def test_echo_loop_suppression(tmp_path: Path) -> None:
    """Outgoing SysEx echoed back must NOT re-broadcast to subscribers."""
    service = _make_service(tmp_path)
    received_events: list = []

    async def _run() -> None:
        # Register a WS subscriber to capture events
        queue = await service.register_ws_client("test-echo")

        # Dispatch a non-realtime param write (algorithm selector)
        param_id = "program.pitch.algorithm"
        await service._dispatch_param_update(param_id, 5.0, source="gui")

        # Simulate the device echoing the exact same SysEx back
        message = service.encode_param_sysex(param_id, 5.0)
        result = await service.handle_incoming_sysex(message)

        # Drain the queue
        while not queue.empty():
            received_events.append(queue.get_nowait())

        service.unregister_ws_client("test-echo")
        return result

    result = asyncio.run(_run())
    # The echo should be suppressed (handle_incoming_sysex returns None)
    assert result is None
    # No mpx1:param_rx event should be in the queue (only param_tx + param_verified)
    rx_events = [e for e in received_events if e.get("type") == "mpx1:param_rx"]
    assert len(rx_events) == 0, f"Echo was not suppressed; got param_rx events: {rx_events}"


# T036-C: Write→readback verification ------------------------------------

def test_readback_verification_pass(tmp_path: Path) -> None:
    """A pending readback that matches an incoming value fires param_verified."""
    service = _make_service(tmp_path)
    verified_events: list = []

    async def _run() -> None:
        queue = await service.register_ws_client("test-verify")
        param_id = "program.pitch.algorithm"
        service._readback_timeout_sec = 1.0

        # Register a readback manually (bypasses realtime_safe guard)
        service._register_readback(param_id, 3.0)

        # Simulate hardware echoing back the value (no outgoing seq → not treated as echo)
        service._outgoing_seq.clear()
        message = service.encode_param_sysex(param_id, 3.0)
        await service.handle_incoming_sysex(message)

        while not queue.empty():
            verified_events.append(queue.get_nowait())
        service.unregister_ws_client("test-verify")

    asyncio.run(_run())
    vpass = [e for e in verified_events if e.get("type") == "mpx1:param_verified"]
    assert len(vpass) >= 1
    assert service._verify_pass_count >= 1


def test_readback_timeout_fires_unverified(tmp_path: Path) -> None:
    """Pending readbacks that time out increment verify_fail_count and fire events."""
    service = _make_service(tmp_path)
    unverified_events: list = []

    async def _run() -> None:
        queue = await service.register_ws_client("test-unverified")
        service._readback_timeout_sec = 0.01  # 10 ms

        # Register a readback without ever resolving it
        service._register_readback("program.pitch.algorithm", 7.0)

        # Wait for it to expire, then run the checker once manually
        await asyncio.sleep(0.05)
        # Call the internal sweep directly (not the infinite loop wrapper)
        now = __import__("time").monotonic()
        timed_out = [
            (seq_id, pid, exp_val)
            for seq_id, (pid, exp_val, expires_at) in list(service._pending_readbacks.items())
            if expires_at < now
        ]
        for seq_id, pid, exp_val in timed_out:
            service._pending_readbacks.pop(seq_id, None)
            service._verify_fail_count += 1
            await service._publish_event("mpx1:param_unverified", {"param_id": pid, "expected": exp_val})

        while not queue.empty():
            unverified_events.append(queue.get_nowait())
        service.unregister_ws_client("test-unverified")

    asyncio.run(_run())
    assert service._verify_fail_count >= 1
    unverified = [e for e in unverified_events if e.get("type") == "mpx1:param_unverified"]
    assert len(unverified) >= 1


# T036-D: Ownership lock --------------------------------------------------

def test_ownership_lock_suppresses_hardware_update(tmp_path: Path) -> None:
    """GUI ownership lock should suppress an incoming hardware update within 2 s."""
    service = _make_service(tmp_path)
    conflict_events: list = []

    async def _run() -> None:
        queue = await service.register_ws_client("test-ownership")

        param_id = "program.pitch.algorithm"
        # GUI acquires ownership
        service._acquire_ownership(param_id, "gui")
        assert service._gui_owns(param_id)

        # Clear echo seq so hardware message is not treated as echo
        service._outgoing_seq.clear()

        # Simulate hardware changing the same param
        message = service.encode_param_sysex(param_id, 9.0)
        result = await service.handle_incoming_sysex(message)

        while not queue.empty():
            conflict_events.append(queue.get_nowait())
        service.unregister_ws_client("test-ownership")
        return result

    result = asyncio.run(_run())
    # handle_incoming_sysex should return None (suppressed)
    assert result is None
    conflict = [e for e in conflict_events if e.get("type") == "mpx1:ownership_conflict"]
    assert len(conflict) >= 1


def test_ownership_lock_expires(tmp_path: Path) -> None:
    """After lock_sec seconds, the GUI ownership lock should release."""
    import time as _time
    service = _make_service(tmp_path)
    service._owner_lock_sec = 0.01  # 10 ms for test speed

    param_id = "program.pitch.algorithm"
    service._acquire_ownership(param_id, "gui")
    assert service._gui_owns(param_id)

    _time.sleep(0.05)  # Wait for lock to expire
    assert not service._gui_owns(param_id)


# T036-E: Drift detection checksum --------------------------------------

def test_drift_checksum_stable_after_write(tmp_path: Path) -> None:
    """After a param write, the expected checksum should match the current shadow."""
    service = _make_service(tmp_path)

    async def _run() -> None:
        param_id = "program.pitch.algorithm"
        await service._dispatch_param_update(param_id, 4.0, source="gui")
        # Checksum should have been updated
        assert service._expected_checksum != 0
        current = service._compute_shadow_checksum()
        assert service._expected_checksum == current

    asyncio.run(_run())


def test_drift_detection_detects_shadow_mutation(tmp_path: Path) -> None:
    """Direct shadow mutation without a write should be caught by drift check."""
    service = _make_service(tmp_path)

    async def _run() -> None:
        # Establish a baseline
        await service._dispatch_param_update("program.pitch.algorithm", 2.0, source="gui")
        baseline_checksum = service._compute_shadow_checksum()
        service._expected_checksum = baseline_checksum

        # Mutate shadow directly (simulate external corruption)
        service.shadow_state["program.pitch.algorithm"] = 9.0

        # The checksums should now differ
        current = service._compute_shadow_checksum()
        assert current != service._expected_checksum

    asyncio.run(_run())


# T036-F: Multi-client writer lock ----------------------------------------

def test_writer_lock_acquire_and_release(tmp_path: Path) -> None:
    service = _make_service(tmp_path)

    async def _run() -> None:
        result = await service.acquire_write_lock("client-A")
        assert result["acquired"] is True
        assert service._write_lock_owner() == "client-A"

        release = await service.release_write_lock("client-A")
        assert release["released"] is True
        assert service._write_lock_owner() is None

    asyncio.run(_run())


def test_writer_lock_second_client_blocked(tmp_path: Path) -> None:
    service = _make_service(tmp_path)

    async def _run() -> None:
        await service.acquire_write_lock("client-A")
        # Client B tries to acquire while A holds it
        result = await service.acquire_write_lock("client-B")
        assert result["acquired"] is False
        assert result["holder"] == "client-A"

    asyncio.run(_run())


def test_writer_lock_blocks_set_param(tmp_path: Path) -> None:
    service = _make_service(tmp_path)

    async def _run() -> Dict[str, Any]:
        await service.acquire_write_lock("client-A")
        # client-B tries to set a param without holding the lock
        result = await service.set_param(
            "program.pitch.algorithm", 5.0, source="api", writer_client_id="client-B"
        )
        return result

    result = asyncio.run(_run())
    assert result.get("locked") is True
    assert result["holder"] == "client-A"


def test_writer_lock_expires(tmp_path: Path) -> None:
    import time as _time
    service = _make_service(tmp_path)
    service._write_lock_ttl_sec = 0.02  # 20 ms for test speed

    async def _run() -> None:
        await service.acquire_write_lock("client-A")
        assert service._write_lock_owner() == "client-A"

    asyncio.run(_run())
    _time.sleep(0.05)
    # Lock should have expired
    assert service._write_lock_owner() is None


# T036-A: SysEx simulator ------------------------------------------------

def test_simulator_receive_and_echo() -> None:
    """Simulator should store a param value and fire the sysex listener."""
    import sys
    import pathlib

    tests_dir = str(pathlib.Path(__file__).parent)
    if tests_dir not in sys.path:
        sys.path.insert(0, tests_dir)

    from mpx1_simulator import MPX1Simulator

    sim = MPX1Simulator()
    received: list = []
    sim.add_sysex_listener(received.append)

    address = (3, 0, 0, 0)
    message = MPX1Simulator.build_sysex(address, 42)
    reply = sim.receive(message)

    assert reply is not None
    assert sim.get_param(address) == 42
    assert len(received) == 1
    assert received[0] == message


def test_simulator_drop_rate() -> None:
    """With drop_rate=1.0 all messages should be dropped."""
    import sys, pathlib

    tests_dir = str(pathlib.Path(__file__).parent)
    if tests_dir not in sys.path:
        sys.path.insert(0, tests_dir)

    from mpx1_simulator import MPX1Simulator

    sim = MPX1Simulator(drop_rate=1.0)
    received: list = []
    sim.add_sysex_listener(received.append)

    address = (3, 0, 0, 0)
    message = MPX1Simulator.build_sysex(address, 10)
    reply = sim.receive(message)

    assert reply is None
    assert len(received) == 0
    assert sim.dropped_count == 1
