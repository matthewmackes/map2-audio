from __future__ import annotations

import asyncio
from copy import deepcopy
from pathlib import Path

import pytest

from app.services.ground_control_pro.model import GroundControlTransportOptions
from app.services.ground_control_pro.service import GroundControlProService


FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures" / "ground_control_pro"


class _FakeTransport:
    def __init__(self, captures: list[bytes] | None = None) -> None:
        self.captures = list(captures or [])
        self.sent_messages: list[bytes] = []

    def list_ports(self):
        return {
            "rtmidi_available": True,
            "inputs": [{"index": 0, "name": "Test Input", "connected": False}],
            "outputs": [{"index": 0, "name": "Test Output", "connected": False}],
            "recommended_input_index": 0,
            "recommended_output_index": 0,
        }

    async def receive_sysex(self, options: GroundControlTransportOptions):
        if not self.captures:
            raise TimeoutError("No capture queued")
        data = self.captures.pop(0)
        return {
            "bytes": data,
            "traffic": [{"direction": "in", "hex": data[:16].hex()}],
            "port_index": options.input_port_index or 0,
            "port_name": "Test Input",
        }

    async def send_sysex(self, data: bytes, options: GroundControlTransportOptions):
        self.sent_messages.append(bytes(data))
        return {
            "dry_run": False,
            "bytes_sent": len(data),
            "segments": 1,
            "traffic": [{"direction": "out", "hex": data[:16].hex()}],
            "port_index": options.output_port_index or 0,
            "port_name": "Test Output",
        }


def _read_fixture(name: str) -> bytes:
    return (FIXTURE_DIR / name).read_bytes()


def test_ground_control_pro_service_backup_compile_push_and_verify(tmp_path: Path) -> None:
    base_fixture = _read_fixture("factory_default_v113.syx")
    transport = _FakeTransport([base_fixture])
    service = GroundControlProService(base_dir=tmp_path, transport=transport)

    backup_job = asyncio.run(service.backup(GroundControlTransportOptions(input_port_index=0), create_session=True))

    assert backup_job["status"] == "completed"
    session = backup_job["result"]["session"]
    session_id = session["session_id"]

    draft = deepcopy(session["model"])
    draft["presets"][0]["name"] = "LEAD A"
    compile_result = asyncio.run(service.compile_session(session_id, draft))

    assert compile_result["validation"]["errors"] == []
    assert compile_result["validation"]["round_trip_identity"] is True

    compiled_bytes = Path(compile_result["artifact"]["path"]).read_bytes()
    push_job = asyncio.run(
        service.push(
            compiled_artifact_id=compile_result["artifact"]["artifact_id"],
            session_id=session_id,
            model_payload=draft,
            options=GroundControlTransportOptions(output_port_index=0),
            force=False,
        )
    )

    assert push_job["status"] == "completed"
    assert transport.sent_messages == [compiled_bytes]

    transport.captures.append(compiled_bytes)
    verify_job = asyncio.run(
        service.redump_verify(
            compile_result["artifact"]["artifact_id"],
            GroundControlTransportOptions(input_port_index=0),
        )
    )

    assert verify_job["status"] == "completed"
    assert verify_job["result"]["match"] is True

    updated_session = asyncio.run(service.get_session(session_id))
    artifact_kinds = [artifact["kind"] for artifact in updated_session["artifacts"]]
    assert "backup_syx" in artifact_kinds
    assert "compiled_syx" in artifact_kinds
    assert "transmit_syx" in artifact_kinds
    assert "verify_redump_syx" in artifact_kinds


def test_ground_control_pro_service_requires_backup_before_push(tmp_path: Path) -> None:
    transport = _FakeTransport()
    service = GroundControlProService(base_dir=tmp_path, transport=transport)
    imported = asyncio.run(service.import_syx_bytes(_read_fixture("factory_default_v113.syx"), source_name="factory_default_v113.syx"))

    with pytest.raises(ValueError, match="fresh backup is required"):
        asyncio.run(
            service.push(
                compiled_artifact_id=None,
                session_id=imported["session_id"],
                model_payload=imported["model"],
                options=GroundControlTransportOptions(output_port_index=0),
                force=False,
            )
        )


def test_ground_control_pro_service_diff_labels_fixture_delta(tmp_path: Path) -> None:
    service = GroundControlProService(base_dir=tmp_path, transport=_FakeTransport())

    diff = asyncio.run(
        service.diff(
            left_fixture="factory_default_v113.syx",
            right_fixture="single_name_change_v113.syx",
        )
    )

    assert diff["changed_count"] > 0
    assert any("presets[0].name" in label for change in diff["changes"] for label in change["labels"])
