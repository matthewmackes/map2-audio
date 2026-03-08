"""
MPX-1 Scene, Setlist, and Morph service (T038).

Provides:
  - Scene capture / recall (snapshot of shadow state)
  - A↔B morphing with configurable curve and beat-sync
  - Momentary scenes (press/release)
  - Setlist management (ordered songs with per-song scene slots and footswitch CC bindings)

Data persisted atomically at ~/.map2/mpx1_scenes.json
"""

from __future__ import annotations

import asyncio
import json
import math
import os
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

_DEFAULT_SCENES_PATH = Path.home() / ".map2" / "mpx1_scenes.json"
_MORPH_UPDATE_HZ = 25  # max interpolation rate (frames/sec)
_MORPH_INTERVAL = 1.0 / _MORPH_UPDATE_HZ


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------


@dataclass
class MPX1Scene:
    id: str
    name: str
    program: int
    param_overrides: Dict[str, float]
    created_at: str
    tags: List[str] = field(default_factory=list)
    # Chain integration (T043): position in effects chain and audio routing params
    chain_position: Optional[int] = None
    send_gain_db: float = 0.0
    return_gain_db: float = 0.0
    dry_wet_mix: float = 1.0


@dataclass
class MPX1Song:
    name: str
    scenes: List[str]  # scene IDs in order
    footswitch_bindings: Dict[str, int] = field(default_factory=dict)  # {str(cc): scene_index}


@dataclass
class MPX1Setlist:
    id: str
    name: str
    songs: List[MPX1Song] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Curve helpers
# ---------------------------------------------------------------------------


def _apply_curve(t: float, curve: str) -> float:
    """Map t ∈ [0,1] through a named easing curve."""
    t = max(0.0, min(1.0, t))
    if curve == "ease_in":
        return t * t
    if curve == "ease_out":
        return 1.0 - (1.0 - t) ** 2
    if curve == "s_curve":
        return t * t * (3.0 - 2.0 * t)  # smoothstep
    # linear (default)
    return t


# ---------------------------------------------------------------------------
# Scene service
# ---------------------------------------------------------------------------


class MPX1SceneService:
    """Manages MPX-1 scene snapshots, morphing, and setlists."""

    def __init__(self, scenes_path: Optional[Path] = None) -> None:
        self._path: Path = scenes_path or _DEFAULT_SCENES_PATH
        self._scenes: Dict[str, MPX1Scene] = {}
        self._setlists: Dict[str, MPX1Setlist] = {}
        # Current morph job
        self._morph_task: Optional[asyncio.Task[None]] = None
        self._morph_job_id: Optional[str] = None
        # Momentary scene state
        self._momentary_previous: Optional[Dict[str, float]] = None
        self._momentary_previous_program: Optional[int] = None
        # Callback hooks – injected by service wiring
        self._get_shadow: Any = None        # () -> Dict[str, float]
        self._get_program: Any = None       # () -> int
        self._apply_params: Any = None      # async (Dict[str, float]) -> None
        self._apply_program: Any = None     # async (int) -> None
        self._is_realtime_safe: Any = None  # (param_id: str) -> bool
        # Chain integration hooks (T043)
        self._get_chain_state: Any = None   # () -> Dict[str, Any] | None
        self._apply_chain_state: Any = None # async (Dict[str, Any]) -> None
        self._load()

    # -----------------------------------------------------------------------
    # Hook wiring
    # -----------------------------------------------------------------------

    def wire(
        self,
        *,
        get_shadow: Any,
        get_program: Any,
        apply_params: Any,
        apply_program: Any,
        is_realtime_safe: Any,
        get_chain_state: Any = None,
        apply_chain_state: Any = None,
    ) -> None:
        self._get_shadow = get_shadow
        self._get_program = get_program
        self._apply_params = apply_params
        self._apply_program = apply_program
        self._is_realtime_safe = is_realtime_safe
        self._get_chain_state = get_chain_state
        self._apply_chain_state = apply_chain_state

    # -----------------------------------------------------------------------
    # Persistence
    # -----------------------------------------------------------------------

    def _load(self) -> None:
        if not self._path.exists():
            return
        try:
            data = json.loads(self._path.read_text())
            for raw in data.get("scenes", []):
                s = MPX1Scene(**raw)
                self._scenes[s.id] = s
            for raw in data.get("setlists", []):
                songs = [MPX1Song(**sg) for sg in raw.get("songs", [])]
                sl = MPX1Setlist(id=raw["id"], name=raw["name"], songs=songs)
                self._setlists[sl.id] = sl
        except Exception:
            pass  # corrupt file — start fresh

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._path.with_suffix(".tmp")
        payload = {
            "scenes": [asdict(s) for s in self._scenes.values()],
            "setlists": [
                {
                    "id": sl.id,
                    "name": sl.name,
                    "songs": [asdict(sg) for sg in sl.songs],
                }
                for sl in self._setlists.values()
            ],
        }
        tmp.write_text(json.dumps(payload, indent=2))
        tmp.replace(self._path)

    # -----------------------------------------------------------------------
    # Scene CRUD
    # -----------------------------------------------------------------------

    def capture_scene(self, name: str, tags: Optional[List[str]] = None) -> Dict[str, Any]:
        """Snapshot the current shadow state into a new scene."""
        shadow: Dict[str, float] = self._get_shadow() if self._get_shadow else {}
        program: int = self._get_program() if self._get_program else 0
        # Capture chain integration state (T043)
        chain_state = self._get_chain_state() if self._get_chain_state else {}
        scene = MPX1Scene(
            id=str(uuid.uuid4()),
            name=name,
            program=program,
            param_overrides=dict(shadow),
            created_at=_iso_now(),
            tags=list(tags or []),
            chain_position=chain_state.get("chain_position"),
            send_gain_db=chain_state.get("send_gain_db", 0.0),
            return_gain_db=chain_state.get("return_gain_db", 0.0),
            dry_wet_mix=chain_state.get("dry_wet_mix", 1.0),
        )
        self._scenes[scene.id] = scene
        self._save()
        return _scene_to_dict(scene)

    def list_scenes(self) -> List[Dict[str, Any]]:
        return [_scene_to_dict(s) for s in self._scenes.values()]

    def get_scene(self, scene_id: str) -> MPX1Scene:
        try:
            return self._scenes[scene_id]
        except KeyError:
            raise KeyError(f"Scene not found: {scene_id}")

    def update_scene(self, scene_id: str, *, name: Optional[str] = None, tags: Optional[List[str]] = None) -> Dict[str, Any]:
        scene = self.get_scene(scene_id)
        if name is not None:
            scene.name = name
        if tags is not None:
            scene.tags = list(tags)
        self._save()
        return _scene_to_dict(scene)

    def delete_scene(self, scene_id: str) -> Dict[str, Any]:
        scene = self._scenes.pop(scene_id, None)
        if scene is None:
            raise KeyError(f"Scene not found: {scene_id}")
        self._save()
        return {"deleted": scene_id}

    async def recall_scene(self, scene_id: str) -> Dict[str, Any]:
        """Apply a scene's program and param_overrides to the hardware."""
        scene = self.get_scene(scene_id)
        if self._apply_program and scene.program is not None:
            await self._apply_program(scene.program)
        if self._apply_params and scene.param_overrides:
            await self._apply_params(scene.param_overrides)
        # Restore chain integration state (T043)
        if self._apply_chain_state:
            chain_state = {
                "chain_position": scene.chain_position,
                "send_gain_db": scene.send_gain_db,
                "return_gain_db": scene.return_gain_db,
                "dry_wet_mix": scene.dry_wet_mix,
            }
            await self._apply_chain_state(chain_state)
        return {"recalled": scene_id, "program": scene.program}

    def diff_scenes(self, scene_id_a: str, scene_id_b: str) -> List[Dict[str, Any]]:
        """Return params that differ between two scenes."""
        a = self.get_scene(scene_id_a)
        b = self.get_scene(scene_id_b)
        keys = set(a.param_overrides) | set(b.param_overrides)
        diffs = []
        for k in sorted(keys):
            va = a.param_overrides.get(k)
            vb = b.param_overrides.get(k)
            if va != vb:
                diffs.append({"param_id": k, "scene_a": va, "scene_b": vb})
        return diffs

    # -----------------------------------------------------------------------
    # Morphing
    # -----------------------------------------------------------------------

    async def start_morph(
        self,
        scene_id_a: str,
        scene_id_b: str,
        duration_sec: float,
        curve: str = "linear",
        beat_sync: bool = False,
        bpm: float = 120.0,
        progress_cb: Any = None,
    ) -> str:
        """Start an async morph from scene A → scene B. Returns job_id."""
        # Cancel existing morph
        if self._morph_task and not self._morph_task.done():
            self._morph_task.cancel()
            try:
                await self._morph_task
            except asyncio.CancelledError:
                pass

        a = self.get_scene(scene_id_a)
        b = self.get_scene(scene_id_b)

        # Beat-sync: snap duration to nearest beat
        if beat_sync and bpm > 0:
            beat_sec = 60.0 / bpm
            duration_sec = max(beat_sec, round(duration_sec / beat_sec) * beat_sec)

        job_id = str(uuid.uuid4())
        self._morph_job_id = job_id

        self._morph_task = asyncio.create_task(
            self._morph_loop(a, b, duration_sec, curve, job_id, progress_cb)
        )
        return job_id

    async def cancel_morph(self, job_id: str) -> Dict[str, Any]:
        if self._morph_job_id != job_id:
            return {"cancelled": False, "reason": "job_not_found"}
        if self._morph_task and not self._morph_task.done():
            self._morph_task.cancel()
            try:
                await self._morph_task
            except asyncio.CancelledError:
                pass
        self._morph_job_id = None
        return {"cancelled": True, "job_id": job_id}

    async def _morph_loop(
        self,
        a: MPX1Scene,
        b: MPX1Scene,
        duration_sec: float,
        curve: str,
        job_id: str,
        progress_cb: Any,
    ) -> None:
        """Interpolate realtime-safe params from A → B over duration_sec."""
        start = time.monotonic()
        # Collect params common to both scenes that are realtime-safe
        rt_params: List[str] = []
        risky_params: List[str] = []
        all_keys = set(a.param_overrides) | set(b.param_overrides)
        for k in all_keys:
            is_rt = (self._is_realtime_safe(k) if self._is_realtime_safe else True)
            if is_rt:
                rt_params.append(k)
            else:
                risky_params.append(k)

        val_a = {k: a.param_overrides.get(k, 0.0) for k in rt_params}
        val_b = {k: b.param_overrides.get(k, 0.0) for k in rt_params}

        try:
            while True:
                elapsed = time.monotonic() - start
                t_raw = min(1.0, elapsed / max(0.001, duration_sec))
                t = _apply_curve(t_raw, curve)

                # Interpolate and apply realtime-safe params
                interp: Dict[str, float] = {
                    k: val_a[k] + (val_b[k] - val_a[k]) * t for k in rt_params
                }
                if interp and self._apply_params:
                    await self._apply_params(interp)

                if progress_cb:
                    progress_cb({"job_id": job_id, "progress": t_raw})

                if t_raw >= 1.0:
                    break

                await asyncio.sleep(_MORPH_INTERVAL)

            # Apply risky params at end
            if risky_params:
                risky_vals = {k: b.param_overrides[k] for k in risky_params if k in b.param_overrides}
                if risky_vals and self._apply_params:
                    await self._apply_params(risky_vals)

        except asyncio.CancelledError:
            pass
        finally:
            if self._morph_job_id == job_id:
                self._morph_job_id = None

    # -----------------------------------------------------------------------
    # Momentary scenes
    # -----------------------------------------------------------------------

    async def momentary_press(self, scene_id: str) -> Dict[str, Any]:
        """Save current state and apply scene (hold-to-audition)."""
        self._momentary_previous = self._get_shadow() if self._get_shadow else {}
        self._momentary_previous_program = self._get_program() if self._get_program else None
        result = await self.recall_scene(scene_id)
        return {"pressed": scene_id, **result}

    async def momentary_release(self, scene_id: str) -> Dict[str, Any]:
        """Restore the state that was active before the press."""
        if self._momentary_previous is not None and self._apply_params:
            await self._apply_params(self._momentary_previous)
        if self._momentary_previous_program is not None and self._apply_program:
            await self._apply_program(self._momentary_previous_program)
        self._momentary_previous = None
        self._momentary_previous_program = None
        return {"released": scene_id, "restored": True}

    # -----------------------------------------------------------------------
    # Setlists
    # -----------------------------------------------------------------------

    def create_setlist(self, name: str) -> Dict[str, Any]:
        sl = MPX1Setlist(id=str(uuid.uuid4()), name=name)
        self._setlists[sl.id] = sl
        self._save()
        return _setlist_to_dict(sl)

    def list_setlists(self) -> List[Dict[str, Any]]:
        return [_setlist_to_dict(sl) for sl in self._setlists.values()]

    def get_setlist(self, setlist_id: str) -> MPX1Setlist:
        try:
            return self._setlists[setlist_id]
        except KeyError:
            raise KeyError(f"Setlist not found: {setlist_id}")

    def update_setlist(self, setlist_id: str, name: Optional[str] = None, songs: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        sl = self.get_setlist(setlist_id)
        if name is not None:
            sl.name = name
        if songs is not None:
            sl.songs = [MPX1Song(**sg) for sg in songs]
        self._save()
        return _setlist_to_dict(sl)

    def delete_setlist(self, setlist_id: str) -> Dict[str, Any]:
        sl = self._setlists.pop(setlist_id, None)
        if sl is None:
            raise KeyError(f"Setlist not found: {setlist_id}")
        self._save()
        return {"deleted": setlist_id}

    # -----------------------------------------------------------------------
    # Shutdown
    # -----------------------------------------------------------------------

    async def shutdown(self) -> None:
        if self._morph_task and not self._morph_task.done():
            self._morph_task.cancel()
            try:
                await self._morph_task
            except asyncio.CancelledError:
                pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _iso_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _scene_to_dict(s: MPX1Scene) -> Dict[str, Any]:
    return {
        "id": s.id,
        "name": s.name,
        "program": s.program,
        "param_count": len(s.param_overrides),
        "created_at": s.created_at,
        "tags": s.tags,
        "chain_position": s.chain_position,
        "send_gain_db": s.send_gain_db,
        "return_gain_db": s.return_gain_db,
        "dry_wet_mix": s.dry_wet_mix,
    }


def _setlist_to_dict(sl: MPX1Setlist) -> Dict[str, Any]:
    return {
        "id": sl.id,
        "name": sl.name,
        "songs": [asdict(sg) for sg in sl.songs],
    }


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_scene_service: Optional[MPX1SceneService] = None


def get_scene_service(scenes_path: Optional[Path] = None) -> MPX1SceneService:
    global _scene_service
    if _scene_service is None:
        _scene_service = MPX1SceneService(scenes_path)
    return _scene_service
