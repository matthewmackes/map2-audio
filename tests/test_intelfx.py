"""
Tests for IntelFX service + route contract behavior.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, Dict, List

import pytest
from fastapi import HTTPException

from app.routes import intelfx as intelfx_routes
from app.services.intelfx_service import IntelFXService


def _registry_path() -> Path:
    return Path(__file__).resolve().parents[1] / "app" / "data" / "intelfx_params.json"


def _build_intelfx_frame(name: str, program_number: int) -> bytes:
    """Create a valid IntelFX SysEx frame for parser/import tests."""
    program = max(0, min(255, int(program_number)))
    prog_hi = (program >> 7) & 0x7F
    prog_lo = program & 0x7F
    name_bytes = name.encode("ascii", errors="replace")[:16].ljust(16, b" ")
    body = bytes([0xF0, 0x00, 0x01, 0x56, 0x00, 0x03, prog_hi, prog_lo]) + name_bytes + b"\x00\x01\x02\x03"
    checksum = 0
    for byte in body[1:]:
        checksum ^= byte
    checksum &= 0x7F
    return body + bytes([checksum, 0xF7])


def _make_service(tmp_path: Path) -> IntelFXService:
    return IntelFXService(
        registry_path=_registry_path(),
        shadow_path=tmp_path / "intelfx_shadow.json",
        library_path=tmp_path / "intelfx_library.json",
        midi_maps_path=tmp_path / "intelfx_midi_maps.json",
        coalesce_window_sec=0.01,
    )


def test_sysex_codec_round_trip(tmp_path: Path) -> None:
    service = _make_service(tmp_path)
    param_id = "hush.threshold"
    encoded = service.encode_param_sysex(param_id, 45)
    # Decoder expects hardware-style frames with device_id/command bytes.
    hardware_style = [*encoded[:4], 0x00, 0x10, *encoded[4:]]
    decoded = service.decode_param_sysex(hardware_style)
    assert decoded is not None
    assert decoded["param_id"] == param_id
    assert decoded["value"] == pytest.approx(45.0, abs=0.1)


def test_set_program_clamps_to_255(tmp_path: Path) -> None:
    service = _make_service(tmp_path)
    result = asyncio.run(service.set_program(999))
    assert result["program"] == 255
    assert service.current_program == 255


def test_get_programs_returns_256_and_active_slot(tmp_path: Path) -> None:
    service = _make_service(tmp_path)

    async def _run() -> List[Dict[str, Any]]:
        await service.set_program(12)
        return await service.get_programs()

    programs = asyncio.run(_run())
    assert len(programs) == 256
    active = [entry for entry in programs if entry["active"]]
    assert len(active) == 1
    assert active[0]["program"] == 12


def test_realtime_param_coalescing_keeps_latest_value(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    service = _make_service(tmp_path)
    dispatched: List[tuple[str, float, str]] = []

    async def _fake_dispatch(param_id: str, value: float, source: str) -> None:
        dispatched.append((param_id, value, source))

    monkeypatch.setattr(service, "_dispatch_param_update", _fake_dispatch)

    async def _run() -> None:
        await service.set_param("hush.threshold", 10)
        await service.set_param("hush.threshold", 85)
        await asyncio.sleep(0.05)

    asyncio.run(_run())
    assert len(dispatched) == 1
    assert dispatched[0][0] == "hush.threshold"
    assert dispatched[0][1] == pytest.approx(85.0)
    assert dispatched[0][2] == "coalesced"


def test_import_syx_skips_duplicates_across_existing_library(tmp_path: Path) -> None:
    service = _make_service(tmp_path)
    frame = _build_intelfx_frame("Import Me", 14)

    async def _run() -> tuple[Dict[str, Any], Dict[str, Any]]:
        first = await service.import_syx_bytes(frame, source_name="first.syx", skip_duplicates=True)
        second = await service.import_syx_bytes(frame, source_name="second.syx", skip_duplicates=True)
        return first, second

    first_result, second_result = asyncio.run(_run())
    assert first_result["imported"] == 1
    assert second_result["imported"] == 0
    assert second_result["skipped"] >= 1


class _FakeRouteService:
    async def get_state(self) -> Dict[str, Any]:
        return {"connected": True, "current_program": 2}

    async def set_param(self, param_id: str, value: float) -> Dict[str, Any]:
        if param_id == "missing":
            raise KeyError("Unknown IntelFX param id: missing")
        return {"queued": True, "param_id": param_id, "value": value}

    async def connect_midi(self, **_: Any) -> Dict[str, Any]:
        return {"connected": False, "detail": "No IntelFX MIDI ports"}

    async def get_programs(self) -> List[Dict[str, Any]]:
        return [{"program": 0, "name": "P0", "tags": [], "active": True}]

    async def activate_midi_map(self, map_id: str) -> Dict[str, Any]:
        raise ValueError(f"Map not found: {map_id}")


def test_route_set_param_unknown_maps_to_404(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakeRouteService()
    monkeypatch.setattr(intelfx_routes, "get_intelfx_service", lambda: fake)
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            intelfx_routes.set_param(
                param_id="missing",
                request=intelfx_routes.ParamUpdateRequest(value=10),
            )
        )
    assert exc_info.value.status_code == 404


def test_route_connect_midi_failure_maps_to_503(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakeRouteService()
    monkeypatch.setattr(intelfx_routes, "get_intelfx_service", lambda: fake)
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            intelfx_routes.connect_midi(
                request=intelfx_routes.MidiConnectRequest(name_hint="intelfx")
            )
        )
    assert exc_info.value.status_code == 503


def test_route_activate_midi_map_missing_maps_to_404(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakeRouteService()
    monkeypatch.setattr(intelfx_routes, "get_intelfx_service", lambda: fake)
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(intelfx_routes.activate_midi_map("missing-map"))
    assert exc_info.value.status_code == 404


def test_route_list_programs_includes_count(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakeRouteService()
    monkeypatch.setattr(intelfx_routes, "get_intelfx_service", lambda: fake)
    payload = asyncio.run(intelfx_routes.list_programs())
    assert payload["count"] == 1
    assert payload["programs"][0]["active"] is True


@pytest.mark.parametrize(
    ("requested", "expected"),
    [
        (-100, 0),
        (-1, 0),
        (0, 0),
        (1, 1),
        (64, 64),
        (127, 127),
        (128, 128),
        (200, 200),
        (254, 254),
        (255, 255),
        (256, 255),
        (999, 255),
    ],
)
def test_set_program_clamp_matrix(tmp_path: Path, requested: int, expected: int) -> None:
    service = _make_service(tmp_path)
    result = asyncio.run(service.set_program(requested))
    assert result["program"] == expected


@pytest.mark.parametrize(
    ("param_id", "value"),
    [
        ("hush.threshold", 0),
        ("hush.threshold", 32),
        ("hush.threshold", 64),
        ("hush.threshold", 96),
        ("hush.threshold", 127),
        ("delay.time", 48),
        ("delay.time", 96),
        ("delay.time", 127),
    ],
)
def test_service_set_param_matrix(tmp_path: Path, param_id: str, value: float) -> None:
    service = _make_service(tmp_path)
    result = asyncio.run(service.set_param(param_id, value))
    assert result["param_id"] == param_id
    assert "value" in result
