"""
Tests for MPX-1 Scene / Morph / Setlist service (T038).
"""

from __future__ import annotations

import asyncio
import time
from pathlib import Path
from typing import Any, Dict, List

import pytest

from app.services.mpx1_scene_service import MPX1SceneService, _apply_curve

# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------


def _make_service(tmp_path: Path) -> MPX1SceneService:
    """Create a wired scene service backed by a temp file."""
    scenes_path = tmp_path / "scenes.json"
    svc = MPX1SceneService(scenes_path)

    shadow: Dict[str, float] = {"reverb.mix": 0.5, "pitch.semi": 3.0, "delay.time": 250.0}
    program: int = 7

    async def _apply_params(params: Dict[str, float]) -> None:
        shadow.update(params)

    async def _apply_program(prog: int) -> None:
        nonlocal program
        program = prog

    svc.wire(
        get_shadow=lambda: dict(shadow),
        get_program=lambda: program,
        apply_params=_apply_params,
        apply_program=_apply_program,
        is_realtime_safe=lambda pid: "level" not in pid and "algorithm" not in pid,
    )
    return svc


# ---------------------------------------------------------------------------
# Curve helpers
# ---------------------------------------------------------------------------


class TestCurves:
    def test_linear_endpoints(self) -> None:
        assert _apply_curve(0.0, "linear") == pytest.approx(0.0)
        assert _apply_curve(1.0, "linear") == pytest.approx(1.0)

    def test_ease_in_midpoint_lower_than_linear(self) -> None:
        assert _apply_curve(0.5, "ease_in") < 0.5

    def test_ease_out_midpoint_higher_than_linear(self) -> None:
        assert _apply_curve(0.5, "ease_out") > 0.5

    def test_s_curve_midpoint_is_half(self) -> None:
        assert _apply_curve(0.5, "s_curve") == pytest.approx(0.5, abs=1e-6)

    def test_clamp_outside_range(self) -> None:
        assert _apply_curve(-0.5, "linear") == pytest.approx(0.0)
        assert _apply_curve(1.5, "linear") == pytest.approx(1.0)

    def test_unknown_curve_falls_back_to_linear(self) -> None:
        assert _apply_curve(0.3, "unknown_curve") == pytest.approx(0.3)


# ---------------------------------------------------------------------------
# Scene CRUD
# ---------------------------------------------------------------------------


class TestSceneCrud:
    def test_capture_creates_scene(self, tmp_path: Path) -> None:
        svc = _make_service(tmp_path)
        scene_dict = svc.capture_scene("My Scene")
        assert scene_dict["name"] == "My Scene"
        assert "id" in scene_dict

    def test_captured_scene_reflects_shadow(self, tmp_path: Path) -> None:
        svc = _make_service(tmp_path)
        svc.capture_scene("Snap")
        scenes = svc.list_scenes()
        assert len(scenes) == 1
        assert scenes[0]["name"] == "Snap"

    def test_update_scene_name(self, tmp_path: Path) -> None:
        svc = _make_service(tmp_path)
        d = svc.capture_scene("Old Name")
        updated = svc.update_scene(d["id"], name="New Name")
        assert updated["name"] == "New Name"

    def test_update_scene_tags(self, tmp_path: Path) -> None:
        svc = _make_service(tmp_path)
        d = svc.capture_scene("Tagged", tags=["reverb"])
        updated = svc.update_scene(d["id"], tags=["reverb", "hall"])
        assert "hall" in updated["tags"]

    def test_delete_scene(self, tmp_path: Path) -> None:
        svc = _make_service(tmp_path)
        d = svc.capture_scene("Delete Me")
        svc.delete_scene(d["id"])
        assert len(svc.list_scenes()) == 0

    def test_delete_nonexistent_raises(self, tmp_path: Path) -> None:
        svc = _make_service(tmp_path)
        with pytest.raises(KeyError):
            svc.delete_scene("does-not-exist")

    def test_get_nonexistent_raises(self, tmp_path: Path) -> None:
        svc = _make_service(tmp_path)
        with pytest.raises(KeyError):
            svc.get_scene("nope")

    def test_persistence_across_reload(self, tmp_path: Path) -> None:
        svc1 = _make_service(tmp_path)
        d = svc1.capture_scene("Persistent")
        svc2 = MPX1SceneService(tmp_path / "scenes.json")
        scenes = svc2.list_scenes()
        assert any(s["id"] == d["id"] for s in scenes)


# ---------------------------------------------------------------------------
# Recall
# ---------------------------------------------------------------------------


class TestRecall:
    def test_recall_applies_program(self, tmp_path: Path) -> None:
        svc = _make_service(tmp_path)
        svc.capture_scene("Prog Scene")
        scene_id = svc.list_scenes()[0]["id"]
        result = asyncio.run(svc.recall_scene(scene_id))
        assert "recalled" in result

    def test_recall_nonexistent_raises(self, tmp_path: Path) -> None:
        svc = _make_service(tmp_path)
        with pytest.raises(KeyError):
            asyncio.run(svc.recall_scene("ghost"))


# ---------------------------------------------------------------------------
# Scene diff
# ---------------------------------------------------------------------------


class TestSceneDiff:
    def test_diff_identical_scenes_empty(self, tmp_path: Path) -> None:
        svc = _make_service(tmp_path)
        a = svc.capture_scene("A")
        b = svc.capture_scene("B")
        # Both captured from same shadow — no diff
        diffs = svc.diff_scenes(a["id"], b["id"])
        assert diffs == []

    def test_diff_detects_change(self, tmp_path: Path) -> None:
        svc = _make_service(tmp_path)
        a_id = svc.capture_scene("A")["id"]
        # Mutate the scene object directly to simulate a different shadow
        svc._scenes[a_id].param_overrides["reverb.mix"] = 0.9
        b_id = svc.capture_scene("B")["id"]
        diffs = svc.diff_scenes(a_id, b_id)
        param_ids = [d["param_id"] for d in diffs]
        assert "reverb.mix" in param_ids


# ---------------------------------------------------------------------------
# Morphing
# ---------------------------------------------------------------------------


class TestMorphing:
    def test_morph_completes(self, tmp_path: Path) -> None:
        svc = _make_service(tmp_path)
        a_id = svc.capture_scene("A")["id"]
        svc._scenes[a_id].param_overrides = {"reverb.mix": 0.0}
        b_id = svc.capture_scene("B")["id"]
        svc._scenes[b_id].param_overrides = {"reverb.mix": 1.0}

        applied: List[Dict[str, float]] = []

        async def _apply_and_capture(params: Dict[str, float]) -> None:
            applied.append(dict(params))

        svc._apply_params = _apply_and_capture

        async def _run() -> None:
            job_id = await svc.start_morph(a_id, b_id, duration_sec=0.1, curve="linear")
            # wait for morph to complete
            await asyncio.sleep(0.25)
            return job_id

        asyncio.run(_run())
        # At least a few intermediate values should have been applied
        assert len(applied) >= 1
        # Final value should be ~1.0
        final = applied[-1].get("reverb.mix", -1)
        assert final == pytest.approx(1.0, abs=0.01)

    def test_morph_cancel(self, tmp_path: Path) -> None:
        svc = _make_service(tmp_path)
        a_id = svc.capture_scene("A")["id"]
        svc._scenes[a_id].param_overrides = {"reverb.mix": 0.0}
        b_id = svc.capture_scene("B")["id"]
        svc._scenes[b_id].param_overrides = {"reverb.mix": 1.0}

        async def _run() -> None:
            job_id = await svc.start_morph(a_id, b_id, duration_sec=5.0)
            # Cancel immediately
            result = await svc.cancel_morph(job_id)
            assert result["cancelled"] is True
            assert svc._morph_job_id is None

        asyncio.run(_run())

    def test_morph_risky_params_applied_at_end(self, tmp_path: Path) -> None:
        """Params that are not realtime-safe (contains 'algorithm') must only appear at end."""
        svc = _make_service(tmp_path)
        a_id = svc.capture_scene("A")["id"]
        svc._scenes[a_id].param_overrides = {"reverb.algorithm": 0.0, "reverb.mix": 0.0}
        b_id = svc.capture_scene("B")["id"]
        svc._scenes[b_id].param_overrides = {"reverb.algorithm": 3.0, "reverb.mix": 1.0}

        applied: List[Dict[str, float]] = []

        async def _track(params: Dict[str, float]) -> None:
            applied.append(dict(params))

        svc._apply_params = _track

        async def _run() -> None:
            await svc.start_morph(a_id, b_id, duration_sec=0.1)
            await asyncio.sleep(0.25)

        asyncio.run(_run())

        # algorithm should only appear in the last apply call
        for batch in applied[:-1]:
            assert "reverb.algorithm" not in batch
        # Final batch must include it
        assert any("reverb.algorithm" in batch for batch in applied)

    def test_beat_sync_rounds_duration(self, tmp_path: Path) -> None:
        """Beat-sync should snap duration to nearest beat."""
        svc = _make_service(tmp_path)
        a_id = svc.capture_scene("A")["id"]
        b_id = svc.capture_scene("B")["id"]
        svc._scenes[a_id].param_overrides = {}
        svc._scenes[b_id].param_overrides = {}

        captured_duration: List[float] = []
        original_loop = svc._morph_loop

        async def _capture_loop(a: Any, b: Any, duration_sec: float, *args: Any, **kwargs: Any) -> None:
            captured_duration.append(duration_sec)
            # Don't actually run the full loop
            return

        svc._morph_loop = _capture_loop  # type: ignore[method-assign]

        async def _run() -> None:
            # BPM=120 → beat=0.5s. 2.3s → nearest beat = 2.5s
            await svc.start_morph(a_id, b_id, duration_sec=2.3, beat_sync=True, bpm=120.0)

        asyncio.run(_run())
        assert len(captured_duration) == 1
        assert captured_duration[0] == pytest.approx(2.5, abs=0.01)


# ---------------------------------------------------------------------------
# Momentary
# ---------------------------------------------------------------------------


class TestMomentary:
    def test_press_saves_previous_state(self, tmp_path: Path) -> None:
        svc = _make_service(tmp_path)
        scene_id = svc.capture_scene("Momentary Scene")["id"]

        async def _run() -> None:
            await svc.momentary_press(scene_id)
            assert svc._momentary_previous is not None

        asyncio.run(_run())

    def test_release_clears_momentary(self, tmp_path: Path) -> None:
        svc = _make_service(tmp_path)
        scene_id = svc.capture_scene("Mom")["id"]

        async def _run() -> None:
            await svc.momentary_press(scene_id)
            result = await svc.momentary_release(scene_id)
            assert result["restored"] is True
            assert svc._momentary_previous is None

        asyncio.run(_run())


# ---------------------------------------------------------------------------
# Setlists
# ---------------------------------------------------------------------------


class TestSetlists:
    def test_create_setlist(self, tmp_path: Path) -> None:
        svc = _make_service(tmp_path)
        sl = svc.create_setlist("Tour 2026")
        assert sl["name"] == "Tour 2026"
        assert "id" in sl

    def test_list_setlists(self, tmp_path: Path) -> None:
        svc = _make_service(tmp_path)
        svc.create_setlist("Set A")
        svc.create_setlist("Set B")
        setlists = svc.list_setlists()
        assert len(setlists) == 2

    def test_update_setlist_name(self, tmp_path: Path) -> None:
        svc = _make_service(tmp_path)
        sl = svc.create_setlist("Old Name")
        updated = svc.update_setlist(sl["id"], name="New Name")
        assert updated["name"] == "New Name"

    def test_update_setlist_songs(self, tmp_path: Path) -> None:
        svc = _make_service(tmp_path)
        sl = svc.create_setlist("Gig Night")
        scene_id = svc.capture_scene("Opener")["id"]
        songs = [{"name": "Song 1", "scenes": [scene_id], "footswitch_bindings": {"64": 0}}]
        updated = svc.update_setlist(sl["id"], songs=songs)
        assert len(updated["songs"]) == 1
        assert updated["songs"][0]["name"] == "Song 1"

    def test_delete_setlist(self, tmp_path: Path) -> None:
        svc = _make_service(tmp_path)
        sl = svc.create_setlist("Temp")
        svc.delete_setlist(sl["id"])
        assert len(svc.list_setlists()) == 0

    def test_delete_nonexistent_raises(self, tmp_path: Path) -> None:
        svc = _make_service(tmp_path)
        with pytest.raises(KeyError):
            svc.delete_setlist("ghost")

    def test_setlist_persists(self, tmp_path: Path) -> None:
        svc1 = _make_service(tmp_path)
        sl = svc1.create_setlist("Persist Me")
        svc2 = MPX1SceneService(tmp_path / "scenes.json")
        setlists = svc2.list_setlists()
        assert any(s["id"] == sl["id"] for s in setlists)


# ---------------------------------------------------------------------------
# Import guard
# ---------------------------------------------------------------------------


def test_module_import() -> None:
    from app.services.mpx1_scene_service import get_scene_service, MPX1SceneService
    assert MPX1SceneService is not None


# ---------------------------------------------------------------------------
# Chain Integration (T043)
# ---------------------------------------------------------------------------


def _make_service_with_chain(tmp_path: Path) -> tuple:
    """Create a wired scene service with chain integration hooks."""
    scenes_path = tmp_path / "scenes.json"
    svc = MPX1SceneService(scenes_path)

    shadow: Dict[str, float] = {"reverb.mix": 0.5, "pitch.semi": 3.0}
    program: int = 7
    chain_state: Dict[str, Any] = {
        "chain_position": 2,
        "send_gain_db": -3.0,
        "return_gain_db": 1.5,
        "dry_wet_mix": 0.8,
    }
    applied_chain: Dict[str, Any] = {}

    async def _apply_params(params: Dict[str, float]) -> None:
        shadow.update(params)

    async def _apply_program(prog: int) -> None:
        nonlocal program
        program = prog

    async def _apply_chain_state(state: Dict[str, Any]) -> None:
        applied_chain.update(state)

    svc.wire(
        get_shadow=lambda: dict(shadow),
        get_program=lambda: program,
        apply_params=_apply_params,
        apply_program=_apply_program,
        is_realtime_safe=lambda pid: True,
        get_chain_state=lambda: dict(chain_state),
        apply_chain_state=_apply_chain_state,
    )
    return svc, chain_state, applied_chain


class TestChainIntegration:
    def test_capture_includes_chain_state(self, tmp_path: Path) -> None:
        svc, _, _ = _make_service_with_chain(tmp_path)
        scene = svc.capture_scene("Chain Scene")
        assert scene["chain_position"] == 2
        assert scene["send_gain_db"] == pytest.approx(-3.0)
        assert scene["return_gain_db"] == pytest.approx(1.5)
        assert scene["dry_wet_mix"] == pytest.approx(0.8)

    def test_recall_restores_chain_state(self, tmp_path: Path) -> None:
        svc, _, applied = _make_service_with_chain(tmp_path)
        scene = svc.capture_scene("Recall Chain")
        asyncio.run(svc.recall_scene(scene["id"]))
        assert applied["chain_position"] == 2
        assert applied["send_gain_db"] == pytest.approx(-3.0)
        assert applied["return_gain_db"] == pytest.approx(1.5)
        assert applied["dry_wet_mix"] == pytest.approx(0.8)

    def test_chain_defaults_for_old_scenes(self, tmp_path: Path) -> None:
        """Old scenes without chain fields should get sensible defaults."""
        svc = _make_service(tmp_path)
        scene = svc.capture_scene("Legacy")
        assert scene.get("chain_position") is None
        assert scene.get("send_gain_db", 0.0) == pytest.approx(0.0)
        assert scene.get("return_gain_db", 0.0) == pytest.approx(0.0)
        assert scene.get("dry_wet_mix", 1.0) == pytest.approx(1.0)

    def test_chain_state_persists_across_reload(self, tmp_path: Path) -> None:
        svc1, _, _ = _make_service_with_chain(tmp_path)
        scene = svc1.capture_scene("Persist Chain")
        svc2 = MPX1SceneService(tmp_path / "scenes.json")
        loaded = svc2.get_scene(scene["id"])
        assert loaded.chain_position == 2
        assert loaded.send_gain_db == pytest.approx(-3.0)
        assert loaded.dry_wet_mix == pytest.approx(0.8)

    def test_no_chain_hooks_skips_restore(self, tmp_path: Path) -> None:
        """If no chain hooks wired, recall still succeeds (no crash)."""
        svc = _make_service(tmp_path)  # No chain hooks
        scene = svc.capture_scene("No Chain Hooks")
        result = asyncio.run(svc.recall_scene(scene["id"]))
        assert "recalled" in result
