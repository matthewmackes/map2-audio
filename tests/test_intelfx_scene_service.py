"""
Tests for IntelFX scene/morph/setlist service.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List

import pytest

from app.services.intelfx_scene_service import IntelFXSceneService, _apply_curve


@dataclass
class _Harness:
    shadow: Dict[str, float] = field(
        default_factory=lambda: {"hush.threshold": 32.0, "delay.time": 240.0, "fx.algorithm": 1.0}
    )
    program: int = 7
    chain_state: Dict[str, Any] = field(
        default_factory=lambda: {
            "chain_position": 2,
            "send_gain_db": -3.0,
            "return_gain_db": 1.5,
            "dry_wet_mix": 0.8,
        }
    )
    applied_params: List[Dict[str, float]] = field(default_factory=list)
    applied_programs: List[int] = field(default_factory=list)
    applied_chain_states: List[Dict[str, Any]] = field(default_factory=list)


def _make_service(tmp_path: Path) -> tuple[IntelFXSceneService, _Harness]:
    harness = _Harness()
    service = IntelFXSceneService(tmp_path / "intelfx_scenes.json")

    async def _apply_params(params: Dict[str, float]) -> None:
        harness.shadow.update(params)
        harness.applied_params.append(dict(params))

    async def _apply_program(program: int) -> None:
        harness.program = int(program)
        harness.applied_programs.append(int(program))

    async def _apply_chain_state(state: Dict[str, Any]) -> None:
        harness.chain_state = dict(state)
        harness.applied_chain_states.append(dict(state))

    service.wire(
        get_shadow=lambda: dict(harness.shadow),
        get_program=lambda: harness.program,
        apply_params=_apply_params,
        apply_program=_apply_program,
        is_realtime_safe=lambda param_id: "algorithm" not in param_id,
        get_chain_state=lambda: dict(harness.chain_state),
        apply_chain_state=_apply_chain_state,
    )
    return service, harness


def test_apply_curve_behavior() -> None:
    assert _apply_curve(0.0, "linear") == pytest.approx(0.0)
    assert _apply_curve(1.0, "linear") == pytest.approx(1.0)
    assert _apply_curve(0.5, "ease_in") < 0.5
    assert _apply_curve(0.5, "ease_out") > 0.5
    assert _apply_curve(0.5, "s_curve") == pytest.approx(0.5, abs=1e-6)


def test_capture_scene_includes_chain_state(tmp_path: Path) -> None:
    service, harness = _make_service(tmp_path)
    captured = service.capture_scene("Snapshot A", tags=["lead"])
    assert captured["name"] == "Snapshot A"
    assert captured["tags"] == ["lead"]
    assert captured["program"] == harness.program
    assert captured["chain_position"] == harness.chain_state["chain_position"]
    assert captured["param_count"] == len(harness.shadow)


def test_update_and_delete_scene(tmp_path: Path) -> None:
    service, _ = _make_service(tmp_path)
    captured = service.capture_scene("Old Name")
    updated = service.update_scene(captured["id"], name="New Name", tags=["updated"])
    assert updated["name"] == "New Name"
    assert updated["tags"] == ["updated"]
    removed = service.delete_scene(captured["id"])
    assert removed["deleted"] == captured["id"]


def test_recall_scene_applies_program_params_and_chain(tmp_path: Path) -> None:
    service, harness = _make_service(tmp_path)
    captured = service.capture_scene("Recall Me")
    result = asyncio.run(service.recall_scene(captured["id"]))
    assert result["recalled"] == captured["id"]
    assert harness.applied_programs[-1] == captured["program"]
    assert harness.applied_params, "recall_scene should apply captured params"
    assert harness.applied_chain_states, "recall_scene should restore chain integration state"


def test_diff_scenes_reports_changes(tmp_path: Path) -> None:
    service, _ = _make_service(tmp_path)
    a_id = service.capture_scene("A")["id"]
    service._scenes[a_id].param_overrides["delay.time"] = 200.0
    b_id = service.capture_scene("B")["id"]
    diffs = service.diff_scenes(a_id, b_id)
    assert any(item["param_id"] == "delay.time" for item in diffs)


def test_morph_applies_realtime_values_and_risky_at_end(tmp_path: Path) -> None:
    service, harness = _make_service(tmp_path)
    a_id = service.capture_scene("A")["id"]
    b_id = service.capture_scene("B")["id"]
    service._scenes[a_id].param_overrides = {"delay.time": 100.0, "fx.algorithm": 1.0}
    service._scenes[b_id].param_overrides = {"delay.time": 300.0, "fx.algorithm": 4.0}

    async def _run() -> None:
        await service.start_morph(a_id, b_id, duration_sec=0.1, curve="linear")
        await asyncio.sleep(0.25)

    asyncio.run(_run())

    assert harness.applied_params
    # Risky "algorithm" param should appear in final apply stage.
    assert any("fx.algorithm" in batch for batch in harness.applied_params)


def test_cancel_morph_returns_cancelled_for_active_job(tmp_path: Path) -> None:
    service, _ = _make_service(tmp_path)
    a_id = service.capture_scene("A")["id"]
    b_id = service.capture_scene("B")["id"]

    async def _run() -> Dict[str, Any]:
        job_id = await service.start_morph(a_id, b_id, duration_sec=5.0)
        return await service.cancel_morph(job_id)

    result = asyncio.run(_run())
    assert result["cancelled"] is True


def test_beat_sync_snaps_duration_to_beats(tmp_path: Path) -> None:
    service, _ = _make_service(tmp_path)
    a_id = service.capture_scene("A")["id"]
    b_id = service.capture_scene("B")["id"]

    captured_duration: List[float] = []
    original_loop = service._morph_loop

    async def _capture_loop(*args: Any, **kwargs: Any) -> None:
        # args: a, b, duration_sec, curve, job_id, progress_cb
        captured_duration.append(float(args[2]))
        await original_loop(*args, **kwargs)

    service._morph_loop = _capture_loop  # type: ignore[assignment]

    async def _run() -> None:
        await service.start_morph(
            a_id,
            b_id,
            duration_sec=1.7,
            curve="linear",
            beat_sync=True,
            bpm=120.0,
        )
        await asyncio.sleep(0.05)
        if service._morph_job_id:
            await service.cancel_morph(service._morph_job_id)

    asyncio.run(_run())
    assert captured_duration, "expected captured duration from wrapped morph loop"
    # 120 BPM => 0.5s beat; 1.7 rounds to 1.5s
    assert captured_duration[0] == pytest.approx(1.5, abs=0.01)


def test_momentary_press_and_release_restores_previous_state(tmp_path: Path) -> None:
    service, harness = _make_service(tmp_path)
    original_program = harness.program
    scene_id = service.capture_scene("Momentary")["id"]
    # make scene visibly different
    service._scenes[scene_id].program = 99
    service._scenes[scene_id].param_overrides = {"hush.threshold": 10.0}

    async def _run() -> None:
        await service.momentary_press(scene_id)
        await service.momentary_release(scene_id)

    asyncio.run(_run())
    assert harness.program == original_program
    assert harness.shadow["hush.threshold"] == 32.0


def test_setlist_crud_and_reload(tmp_path: Path) -> None:
    service, _ = _make_service(tmp_path)
    created = service.create_setlist("Set A")
    updated = service.update_setlist(
        created["id"],
        songs=[{"name": "Song 1", "scenes": [], "footswitch_bindings": {"80": 0}}],
    )
    assert updated["songs"][0]["name"] == "Song 1"

    reloaded = IntelFXSceneService(tmp_path / "intelfx_scenes.json")
    setlists = reloaded.list_setlists()
    assert any(item["id"] == created["id"] for item in setlists)


@pytest.mark.parametrize(
    ("t", "curve", "expected"),
    [
        (0.0, "linear", 0.0),
        (1.0, "linear", 1.0),
        (0.5, "linear", 0.5),
        (0.5, "ease_in", 0.25),
        (0.5, "ease_out", 0.75),
        (0.25, "ease_in", 0.0625),
        (0.75, "ease_out", 0.9375),
        (0.0, "s_curve", 0.0),
        (1.0, "s_curve", 1.0),
        (0.25, "s_curve", 0.15625),
        (0.75, "s_curve", 0.84375),
        (0.3, "unknown", 0.3),
    ],
)
def test_apply_curve_sample_matrix(t: float, curve: str, expected: float) -> None:
    assert _apply_curve(t, curve) == pytest.approx(expected, abs=1e-6)


@pytest.mark.parametrize("program", [0, 1, 2, 7, 15, 31, 63, 127, 200, 255])
def test_capture_scene_program_matrix(tmp_path: Path, program: int) -> None:
    service, harness = _make_service(tmp_path)
    harness.program = program
    captured = service.capture_scene(f"Program {program}")
    assert captured["program"] == program


@pytest.mark.parametrize(
    "setlist_name",
    [
        "Set A",
        "Set B",
        "Set C",
        "Acoustic Night",
        "Metal Night",
        "Festival Main",
        "Club Backup",
        "Tour Rehearsal",
    ],
)
def test_setlist_name_matrix(tmp_path: Path, setlist_name: str) -> None:
    service, _ = _make_service(tmp_path)
    created = service.create_setlist(setlist_name)
    assert created["name"] == setlist_name
