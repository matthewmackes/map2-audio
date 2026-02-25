import asyncio
import json
from pathlib import Path
from typing import Any, Dict

import pytest
from fastapi import HTTPException

from app.routes import mpx1 as mpx1_routes
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
    assert payload["param_id"] == "program.pitch.algorithm"
