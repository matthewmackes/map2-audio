"""
Drum sequencer persistence and engine sync service.

Owns pattern/song validation, filesystem persistence, and translation between
the Python API layer and the native drum sequencer bindings.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, ValidationError, model_validator

from app.services.juce_engine_service import get_audio_engine
from app.utils.singleton import Singleton


_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_DRUMS_ROOT = Path(os.environ.get("MAP2_DRUMS_ROOT", Path.home() / ".map2" / "drums"))
_PATTERNS_DIR = Path(os.environ.get("MAP2_DRUMS_PATTERNS_DIR", _DEFAULT_DRUMS_ROOT / "patterns"))
_BUNDLES_DIR = Path(os.environ.get("MAP2_DRUMS_BUNDLES_DIR", _DEFAULT_DRUMS_ROOT / "bundles"))
_AUTOSAVE_PATH = Path(os.environ.get("MAP2_DRUMS_AUTOSAVE_PATH", _DEFAULT_DRUMS_ROOT / "sequencer-autosave.json"))


class DrumSequencerStepModel(BaseModel):
    velocity: int = Field(0, ge=0, le=127)
    accent: bool = False


class DrumPatternModel(BaseModel):
    pattern_id: int = Field(0, ge=0, le=127)
    length: int = Field(16, ge=1, le=64)
    steps: List[List[DrumSequencerStepModel]]

    @model_validator(mode="after")
    def validate_grid_shape(self) -> "DrumPatternModel":
        if len(self.steps) != 16:
            raise ValueError("steps must contain exactly 16 instrument rows")
        for row in self.steps:
            if len(row) != 64:
                raise ValueError("each instrument row must contain exactly 64 steps")
        return self


class DrumSongEntryModel(BaseModel):
    pattern: int = Field(..., ge=0, le=127)
    repeat_count: int = Field(..., ge=1, le=99)


class DrumSequencerBundleModel(BaseModel):
    bundle_id: str = Field(..., min_length=1)
    kit_path: Optional[str] = None
    swing: float = Field(0.0, ge=0.0, le=100.0)
    accent_velocity: int = Field(127, ge=1, le=127)
    song_loop: bool = False
    patterns: List[DrumPatternModel] = Field(default_factory=list, min_length=128, max_length=128)
    song: List[DrumSongEntryModel] = Field(default_factory=list, max_length=256)


class DrumSequencerService(Singleton):
    def __init__(self) -> None:
        super().__init__()
        self._patterns_dir = _PATTERNS_DIR
        self._bundles_dir = _BUNDLES_DIR
        self._autosave_path = _AUTOSAVE_PATH
        self._ensure_dirs()
        self._restore_autosave()

    def _ensure_dirs(self) -> None:
        self._patterns_dir.mkdir(parents=True, exist_ok=True)
        self._bundles_dir.mkdir(parents=True, exist_ok=True)
        self._autosave_path.parent.mkdir(parents=True, exist_ok=True)

    def _pattern_path(self, pattern_id: int) -> Path:
        return self._patterns_dir / f"pattern-{pattern_id:03d}.json"

    def _bundle_path(self, bundle_id: str) -> Path:
        safe = "".join(ch if ch.isalnum() or ch in ("-", "_") else "-" for ch in bundle_id).strip("-_")
        return self._bundles_dir / f"{safe or 'bundle'}.json"

    def _engine(self) -> Any:
        try:
            return get_audio_engine().engine
        except Exception:
            return None

    def _restore_autosave(self) -> None:
        if not self._autosave_path.exists():
            return
        try:
            payload = json.loads(self._autosave_path.read_text())
        except (OSError, json.JSONDecodeError):
            return
        try:
            bundle = DrumSequencerBundleModel.model_validate(payload)
        except ValidationError:
            return
        self._apply_bundle_to_engine(bundle)

    def _read_pattern_from_engine(self, pattern_id: int) -> Optional[DrumPatternModel]:
        engine = self._engine()
        if engine is None:
            return None

        getter = getattr(engine, "get_drum_pattern_data", None)
        if not callable(getter):
            return None

        try:
            raw = getter(pattern_id)
        except Exception:
            return None

        if not raw:
            return None

        steps: List[List[Dict[str, Any]]] = []
        for instrument_row in raw.get("steps", []):
            row_payload: List[Dict[str, Any]] = []
            for step in instrument_row:
                row_payload.append(
                    {
                        "velocity": int(step.get("velocity", 0)),
                        "accent": bool(step.get("accent", False)),
                    }
                )
            steps.append(row_payload)

        try:
            return DrumPatternModel.model_validate(
                {
                    "pattern_id": pattern_id,
                    "length": int(raw.get("length", 16)),
                    "steps": steps,
                }
            )
        except ValidationError:
            return None

    def _write_pattern_to_engine(self, pattern: DrumPatternModel) -> None:
        engine = self._engine()
        if engine is None:
            return

        clear = getattr(engine, "clear_drum_pattern", None)
        set_length = getattr(engine, "set_drum_pattern_length", None)
        set_step = getattr(engine, "set_drum_step", None)
        if not callable(clear) or not callable(set_length) or not callable(set_step):
            return

        clear(pattern.pattern_id)
        set_length(pattern.pattern_id, pattern.length)
        for instrument_index, row in enumerate(pattern.steps):
            for step_index, step in enumerate(row):
                if step.velocity == 0 and not step.accent:
                    continue
                set_step(pattern.pattern_id, instrument_index, step_index, step.velocity, step.accent)

    def _read_song_from_engine(self) -> List[DrumSongEntryModel]:
        engine = self._engine()
        if engine is None:
            return []

        getter = getattr(engine, "get_drum_song", None)
        if not callable(getter):
            return []

        try:
            song = getter()
        except Exception:
            return []

        return [
            DrumSongEntryModel.model_validate(
                {
                    "pattern": int(entry.get("pattern", 0)),
                    "repeat_count": int(entry.get("repeat_count", 1)),
                }
            )
            for entry in song
        ]

    def _write_song_to_engine(self, entries: List[DrumSongEntryModel], song_loop: bool) -> None:
        engine = self._engine()
        if engine is None:
            return

        clear_song = getattr(engine, "clear_drum_song", None)
        add_entry = getattr(engine, "add_drum_song_entry", None)
        set_song_loop = getattr(engine, "set_drum_song_loop", None)
        if callable(clear_song):
            clear_song()
        if callable(add_entry):
            for index, entry in enumerate(entries):
                add_entry(entry.pattern, entry.repeat_count, index)
        if callable(set_song_loop):
            set_song_loop(song_loop)

    def get_song(self) -> List[Dict[str, Any]]:
        return [entry.model_dump() for entry in self._read_song_from_engine()]

    def get_song_loop(self) -> bool:
        engine = self._engine()
        if engine is None:
            return False
        getter = getattr(engine, "get_drum_song_loop", None)
        if not callable(getter):
            return False
        try:
            return bool(getter())
        except Exception:
            return False

    def replace_song(self, entries: List[DrumSongEntryModel], song_loop: bool = False) -> List[Dict[str, Any]]:
        validated = [entry if isinstance(entry, DrumSongEntryModel) else DrumSongEntryModel.model_validate(entry) for entry in entries]
        self._write_song_to_engine(validated, song_loop)
        return [entry.model_dump() for entry in validated]

    def get_pattern(self, pattern_id: int) -> Dict[str, Any]:
        pattern = self._read_pattern_from_engine(pattern_id)
        if pattern is None:
            path = self._pattern_path(pattern_id)
            if path.exists():
                try:
                    pattern = DrumPatternModel.model_validate(json.loads(path.read_text()))
                except (OSError, json.JSONDecodeError, ValidationError):
                    pattern = None
        if pattern is None:
            zero_row = [{"velocity": 0, "accent": False} for _ in range(64)]
            pattern = DrumPatternModel.model_validate(
                {
                    "pattern_id": pattern_id,
                    "length": 16,
                    "steps": [list(zero_row) for _ in range(16)],
                }
            )
        return pattern.model_dump()

    def save_pattern(self, pattern_id: int, payload: Dict[str, Any]) -> Dict[str, Any]:
        pattern = DrumPatternModel.model_validate({**payload, "pattern_id": pattern_id})
        self._write_pattern_to_engine(pattern)
        path = self._pattern_path(pattern_id)
        path.write_text(json.dumps(pattern.model_dump(), indent=2, sort_keys=True))
        return pattern.model_dump()

    def set_step(self, pattern_id: int, instrument: int, step: int, velocity: int, accent: bool = False) -> Dict[str, Any]:
        pattern = DrumPatternModel.model_validate(self.get_pattern(pattern_id))
        pattern.steps[instrument][step] = DrumSequencerStepModel(velocity=velocity, accent=accent)
        return self.save_pattern(pattern_id, pattern.model_dump())

    def save_bundle(self, bundle_id: str, kit_path: Optional[str] = None) -> Dict[str, Any]:
        engine = self._engine()
        swing = 0.0
        accent_velocity = 127
        song_loop = False
        if engine is not None:
            get_swing = getattr(engine, "get_drum_swing", None)
            get_accent_velocity = getattr(engine, "get_drum_accent_velocity", None)
            get_song_loop = getattr(engine, "get_drum_song_loop", None)
            if callable(get_swing):
                swing = float(get_swing())
            if callable(get_accent_velocity):
                accent_velocity = int(get_accent_velocity())
            if callable(get_song_loop):
                song_loop = bool(get_song_loop())

        bundle = DrumSequencerBundleModel.model_validate(
            {
                "bundle_id": bundle_id,
                "kit_path": kit_path,
                "swing": swing,
                "accent_velocity": accent_velocity,
                "song_loop": song_loop,
                "patterns": [self.get_pattern(pattern_id) for pattern_id in range(128)],
                "song": [entry.model_dump() for entry in self._read_song_from_engine()],
            }
        )
        path = self._bundle_path(bundle_id)
        path.write_text(json.dumps(bundle.model_dump(), indent=2, sort_keys=True))
        return {
            "status": "ok",
            "path": str(path),
            "bundle_id": bundle.bundle_id,
        }

    def load_bundle(self, bundle_id: str) -> Dict[str, Any]:
        path = self._bundle_path(bundle_id)
        payload = json.loads(path.read_text())
        bundle = DrumSequencerBundleModel.model_validate(payload)
        self._apply_bundle_to_engine(bundle)
        for pattern in bundle.patterns:
            self._pattern_path(pattern.pattern_id).write_text(json.dumps(pattern.model_dump(), indent=2, sort_keys=True))
        self._autosave_path.write_text(json.dumps(bundle.model_dump(), indent=2, sort_keys=True))
        return bundle.model_dump()

    def autosave(self, bundle_id: str = "autosave", kit_path: Optional[str] = None) -> Dict[str, Any]:
        bundle = DrumSequencerBundleModel.model_validate(
            {
                "bundle_id": bundle_id,
                "kit_path": kit_path,
                "swing": float(getattr(self._engine(), "get_drum_swing", lambda: 0.0)()),
                "accent_velocity": int(getattr(self._engine(), "get_drum_accent_velocity", lambda: 127)()),
                "song_loop": bool(getattr(self._engine(), "get_drum_song_loop", lambda: False)()),
                "patterns": [self.get_pattern(pattern_id) for pattern_id in range(128)],
                "song": [entry.model_dump() for entry in self._read_song_from_engine()],
            }
        )
        self._autosave_path.write_text(json.dumps(bundle.model_dump(), indent=2, sort_keys=True))
        return {
            "status": "ok",
            "path": str(self._autosave_path),
            "bundle_id": bundle.bundle_id,
        }

    def handle_transport_stop(self, kit_path: Optional[str] = None) -> Dict[str, Any]:
        return self.autosave(kit_path=kit_path)

    def _apply_bundle_to_engine(self, bundle: DrumSequencerBundleModel) -> None:
        engine = self._engine()
        if engine is None:
            return

        set_swing = getattr(engine, "set_drum_swing", None)
        set_accent_velocity = getattr(engine, "set_drum_accent_velocity", None)
        if callable(set_swing):
            set_swing(bundle.swing)
        if callable(set_accent_velocity):
            set_accent_velocity(bundle.accent_velocity)

        for pattern in bundle.patterns:
            self._write_pattern_to_engine(pattern)
        self._write_song_to_engine(bundle.song, bundle.song_loop)


def get_drum_sequencer_service() -> DrumSequencerService:
    return DrumSequencerService.get_instance()
