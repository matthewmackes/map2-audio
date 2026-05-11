"""T2459-H8b-1 — `POST /api/midi/bindings/{binding_id}/test` endpoint.

The Snapshot Editor Selected-block panel relies on this endpoint to
re-enable the Heel/Live/Toe test-ride buttons after the cutover to the
canonical MidiBinding authority. Pre-H8b-1 the panel had no canonical
equivalent for the legacy integer-id `midiApiV2.testMappingFeedback` and
the buttons were force-disabled with a "pending canonical authority"
toast (see SnapshotEditorSelectedBlockMidiPanel.tsx).

Covered here:
  1. Heel mode → normalized_value=0 → cc_value=0.
  2. Toe mode → normalized_value=1 → cc_value=127.
  3. Live mode → use_current_value=True → engine current-value path.
  4. 404 for unknown binding_id.
  5. 400 for non-midi_cc bindings (no feedback path defined yet).
  6. 503 when the engine refuses (no engine attached).
  7. fallback to send_cc when send_parameter_feedback is absent.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pytest
from fastapi import HTTPException

from app import database as database_module
from app.services.midi import MidiBindingAuthority, MidiBindingCreate
from app.services.midi.routes import (
    BindingFeedbackTestRequest,
    send_binding_feedback_test,
)
from app.services import midi_service as midi_service_module


def _init_temp_db(tmp_path: Path) -> None:
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(
        f"sqlite+aiosqlite:///{tmp_path / 't2459-h8b-1-feedback-test.db'}"
    )


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


def _make_fake_engine(
    *,
    support_parameter_feedback: bool = True,
    support_send_cc: bool = True,
    current_value: Optional[float] = None,
):
    """Build a stand-in engine.

    `_call_engine_method` probes attributes by name and skips when the
    attribute isn't a callable, so we omit a method entirely instead of
    raising AttributeError mid-call (that path would surface as a real
    test failure rather than the documented fallback).
    """
    calls: List[Tuple[str, tuple, dict]] = []

    class _Engine:
        pass

    engine = _Engine()
    engine.calls = calls  # type: ignore[attr-defined]

    if support_parameter_feedback:
        def send_parameter_feedback(channel: int, cc: int, normalized: float) -> bool:
            calls.append(("send_parameter_feedback", (channel, cc, normalized), {}))
            return True
        engine.send_parameter_feedback = send_parameter_feedback  # type: ignore[attr-defined]

    if support_send_cc:
        def send_cc(channel: int, cc: int, value: int) -> bool:
            calls.append(("send_cc", (channel, cc, value), {}))
            return True
        engine.send_cc = send_cc  # type: ignore[attr-defined]

    def get_plugin_parameter(plugin_uri: str, param_index: int, plugin_position=None):
        calls.append(
            ("get_plugin_parameter", (plugin_uri, param_index), {"plugin_position": plugin_position}),
        )
        return current_value
    engine.get_plugin_parameter = get_plugin_parameter  # type: ignore[attr-defined]

    return engine


@pytest.fixture(autouse=True)
def _isolate_midi_service_engine():
    """Each test gets a clean midi_service._engine slate."""
    prior = midi_service_module.midi_service._engine
    yield
    midi_service_module.midi_service._engine = prior


def _seed_plugin_param_binding(
    *,
    source_descriptor: Optional[Dict[str, Any]] = None,
    target_descriptor: Optional[Dict[str, Any]] = None,
    source_type: str = "midi_cc",
    consumer_type: str = "plugin_param",
    target_type: str = "engine_param",
) -> str:
    """Persist one binding and return its assigned binding_id."""
    binding_id_holder: Dict[str, str] = {}

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            created = await authority.create(
                MidiBindingCreate(
                    consumer_type=consumer_type,
                    consumer_id="40:urn:lv2:plugin:neural-amp-modeler:0",
                    consumer_label="NAM - gain",
                    source_type=source_type,
                    source_descriptor=source_descriptor or {
                        "channel": 1,
                        "cc": 7,
                        "min": 0.0,
                        "max": 1.0,
                        "feedback_enabled": True,
                        "feedback_cc": 9,
                    },
                    target_type=target_type,
                    target_descriptor=target_descriptor or {
                        "chain_id": 1,
                        "plugin_uri": "urn:lv2:plugin:neural-amp-modeler:0",
                        "param_index": 4,
                        "parameter_symbol": "gain",
                    },
                    scope="snapshot",
                    scope_id="13",
                    enabled=True,
                    created_by="t2459h8b1-test",
                    source="t2459h8b1-test",
                )
            )
            await session.commit()
            binding_id_holder["id"] = created.binding_id

    asyncio.run(_run())
    return binding_id_holder["id"]


def test_heel_sends_normalized_zero(tmp_path):
    _init_temp_db(tmp_path)
    binding_id = _seed_plugin_param_binding()
    engine = _make_fake_engine()
    midi_service_module.midi_service.set_engine(engine)

    response = asyncio.run(
        send_binding_feedback_test(binding_id, BindingFeedbackTestRequest(normalized_value=0))
    )

    assert response.binding_id == binding_id
    assert response.channel == 1
    assert response.cc == 9  # feedback_cc, not source cc
    assert response.normalized_value == 0.0
    assert response.cc_value == 0
    assert response.source == "manual"
    assert engine.calls == [("send_parameter_feedback", (1, 9, 0.0), {})]


def test_toe_sends_normalized_one(tmp_path):
    _init_temp_db(tmp_path)
    binding_id = _seed_plugin_param_binding()
    engine = _make_fake_engine()
    midi_service_module.midi_service.set_engine(engine)

    response = asyncio.run(
        send_binding_feedback_test(binding_id, BindingFeedbackTestRequest(normalized_value=1))
    )

    assert response.normalized_value == 1.0
    assert response.cc_value == 127
    assert engine.calls == [("send_parameter_feedback", (1, 9, 1.0), {})]


def test_live_uses_current_engine_value(tmp_path):
    _init_temp_db(tmp_path)
    binding_id = _seed_plugin_param_binding(
        source_descriptor={
            "channel": 1,
            "cc": 7,
            "min": 0.0,
            "max": 10.0,
            "feedback_enabled": True,
            "feedback_cc": 9,
        },
    )
    # Current engine value 5.0 in a 0..10 range → normalized 0.5 → cc 64.
    engine = _make_fake_engine(current_value=5.0)
    midi_service_module.midi_service.set_engine(engine)

    response = asyncio.run(
        send_binding_feedback_test(binding_id, BindingFeedbackTestRequest(use_current_value=True))
    )

    assert response.source == "current"
    assert response.normalized_value == 0.5
    assert response.cc_value == 64
    # First call is the parameter read, second the feedback send.
    assert engine.calls[0][0] == "get_plugin_parameter"
    assert engine.calls[0][1] == ("urn:lv2:plugin:neural-amp-modeler:0", 4)
    assert engine.calls[1] == ("send_parameter_feedback", (1, 9, 0.5), {})


def test_404_when_binding_id_unknown(tmp_path):
    _init_temp_db(tmp_path)
    # Ensure tables exist even though we don't seed any row.
    asyncio.run(database_module._ensure_tables_created())
    midi_service_module.midi_service.set_engine(_make_fake_engine())

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            send_binding_feedback_test("00000000-0000-0000-0000-000000000000", BindingFeedbackTestRequest())
        )

    assert exc_info.value.status_code == 404


def test_400_when_source_type_is_not_midi_cc(tmp_path):
    _init_temp_db(tmp_path)
    binding_id = _seed_plugin_param_binding(
        source_type="midi_note",
        source_descriptor={"channel": 1, "note": 60, "velocity": 100},
    )
    midi_service_module.midi_service.set_engine(_make_fake_engine())

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(send_binding_feedback_test(binding_id, BindingFeedbackTestRequest(normalized_value=1)))

    assert exc_info.value.status_code == 400
    assert "midi_cc" in exc_info.value.detail


def test_503_when_engine_unavailable(tmp_path):
    _init_temp_db(tmp_path)
    binding_id = _seed_plugin_param_binding()
    midi_service_module.midi_service.set_engine(None)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(send_binding_feedback_test(binding_id, BindingFeedbackTestRequest(normalized_value=0)))

    assert exc_info.value.status_code == 503


def test_falls_back_to_send_cc_when_parameter_feedback_missing(tmp_path):
    """Older engines may not have send_parameter_feedback; the service
    must fall back to send_cc with the quantized cc_value (rounded from
    normalized * 127)."""
    _init_temp_db(tmp_path)
    binding_id = _seed_plugin_param_binding()
    engine = _make_fake_engine(support_parameter_feedback=False)
    midi_service_module.midi_service.set_engine(engine)

    response = asyncio.run(
        send_binding_feedback_test(binding_id, BindingFeedbackTestRequest(normalized_value=0.5))
    )

    assert response.cc_value == 64
    # Only send_cc was called; send_parameter_feedback isn't present on the fake.
    assert engine.calls == [("send_cc", (1, 9, 64), {})]
