"""T2503 Set 5 — DAW project service.

Owns the on-disk representation of DAW projects under
``~/.map2/daw/<project>/``. Schema is defined in
``schemas/daw-project-v1.schema.json``. Authoritative source for all DAW
project state; the engine-side ``DawProjectLoader`` (Set 5 C++ side)
reads ``project.json`` and rebuilds the in-memory
``juce::AudioProcessorGraph`` from it.

Filesystem layout:
    ~/.map2/daw/<project>/
    ├── project.json       (authoritative)
    ├── audio/             (recorded takes; created on first record)
    ├── render/            (bounce / mixdown output; created on first render)
    └── .lock              (single-writer lock file; advisory)

Exposes:
    DawProjectService.list_projects()
    DawProjectService.create_project(name)            -> DawProject
    DawProjectService.load_project(name_or_path)      -> DawProject
    DawProjectService.save_project(project)
    DawProjectService.delete_project(name)
    DawProjectService.add_track(project, track_type, name=None) -> int
    DawProjectService.remove_track(project, track_id)
    DawProjectService.add_clip(project, ...)          -> int
    DawProjectService.remove_clip(project, clip_id)
    DawProjectService.move_clip(project, clip_id, new_start)
    DawProjectService.add_plugin(project, track_id, plugin_uri) -> int
    DawProjectService.remove_plugin(project, track_id, slot_index)
    DawProjectService.set_plugin_param(project, track_id, slot_index, param_id, value)
    DawProjectService.set_automation_point(project, lane_id, position, value)

Each mutation returns the updated DawProject snapshot. Persistence is
explicit via ``save_project`` so callers can batch mutations.
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.services.daw_project_schema import validate_daw_project

logger = logging.getLogger(__name__)


_DEFAULT_BASE_DIR = Path.home() / ".map2" / "daw"
_PROJECT_FILE_NAME = "project.json"
_LOCK_FILE_NAME = ".lock"
_AUDIO_SUBDIR = "audio"
_RENDER_SUBDIR = "render"

# Project name validation: alphanumerics, dashes, underscores, spaces; 1..255.
_VALID_NAME = re.compile(r"^[A-Za-z0-9 _\-]{1,255}$")


class DawProjectError(RuntimeError):
    """Base for project-service errors that map to 4xx responses."""


class ProjectNotFound(DawProjectError):
    pass


class ProjectAlreadyExists(DawProjectError):
    pass


class InvalidProjectName(DawProjectError):
    pass


class ProjectValidationError(DawProjectError):
    pass


@dataclass
class DawProject:
    """In-memory mirror of project.json, validated against the schema."""

    name: str
    path: Path
    document: Dict[str, Any]
    dirty: bool = False

    def to_response(self) -> Dict[str, Any]:
        """Compact response shape for the FastAPI surface."""
        return {
            "name": self.name,
            "path": str(self.path),
            "dirty": self.dirty,
            "tracks_count": len(self.document.get("tracks", [])),
            "clips_count": len(self.document.get("clips", [])),
            "plugins_count": len(self.document.get("plugin_instances", [])),
        }


class DawProjectService:
    """Filesystem-backed CRUD over DAW projects.

    Threadsafe at the project level — writes acquire a per-project lock so
    interleaved mutations from FastAPI + engine_command paths don't tear the
    JSON. Reads are unsynchronized (in practice the FastAPI handlers run on
    a single asyncio loop).
    """

    def __init__(self, base_dir: Optional[Path] = None) -> None:
        self.base_dir = Path(base_dir) if base_dir is not None else _DEFAULT_BASE_DIR
        self._lock = threading.Lock()
        self._project_locks: Dict[str, threading.Lock] = {}

    # --- helpers ---

    def _project_dir(self, name: str) -> Path:
        return self.base_dir / name

    def _project_file(self, name: str) -> Path:
        return self._project_dir(name) / _PROJECT_FILE_NAME

    def _ensure_base_dir(self) -> None:
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _project_lock(self, name: str) -> threading.Lock:
        with self._lock:
            lock = self._project_locks.get(name)
            if lock is None:
                lock = threading.Lock()
                self._project_locks[name] = lock
            return lock

    def _next_id(self, items: List[Dict[str, Any]]) -> int:
        return (max((int(item["id"]) for item in items), default=-1)) + 1

    def _validate_name(self, name: str) -> None:
        if not _VALID_NAME.match(name):
            raise InvalidProjectName(
                f"project name {name!r} must match [A-Za-z0-9 _-]{{1,255}}"
            )

    def _new_document(self, name: str) -> Dict[str, Any]:
        return {
            "schema_version": "v1",
            "name": name,
            "sample_rate": 48000,
            "tempo_bpm": 120,
            "time_signature_numerator": 4,
            "time_signature_denominator": 4,
            "tracks": [],
            "clips": [],
            "plugin_instances": [],
            "automation_lanes": [],
            "avb_buses": [],
            "metadata": {
                "created_at": time.time(),
                "last_modified": time.time(),
            },
        }

    # --- public API ---

    def list_projects(self) -> List[str]:
        """Return the names of every project under base_dir."""
        if not self.base_dir.exists():
            return []
        return sorted(
            entry.name
            for entry in self.base_dir.iterdir()
            if entry.is_dir() and (entry / _PROJECT_FILE_NAME).is_file()
        )

    def create_project(self, name: str) -> DawProject:
        self._validate_name(name)
        self._ensure_base_dir()
        project_dir = self._project_dir(name)
        if project_dir.exists():
            raise ProjectAlreadyExists(f"project {name!r} already exists at {project_dir}")
        project_dir.mkdir(parents=True)
        (project_dir / _AUDIO_SUBDIR).mkdir(exist_ok=True)
        (project_dir / _RENDER_SUBDIR).mkdir(exist_ok=True)
        document = self._new_document(name)
        validate_daw_project(document)  # sanity — schema-default doc must validate
        project = DawProject(name=name, path=project_dir, document=document, dirty=True)
        self.save_project(project)
        logger.info("daw.project.create: %s at %s", name, project_dir)
        return project

    def load_project(self, name: str) -> DawProject:
        self._validate_name(name)
        project_file = self._project_file(name)
        if not project_file.is_file():
            raise ProjectNotFound(f"project {name!r} not found at {project_file}")
        with project_file.open("r", encoding="utf-8") as f:
            document = json.load(f)
        try:
            validate_daw_project(document)
        except Exception as exc:
            raise ProjectValidationError(
                f"project {name!r} failed validation: {exc}"
            ) from exc
        return DawProject(
            name=name,
            path=self._project_dir(name),
            document=document,
            dirty=False,
        )

    def save_project(self, project: DawProject) -> None:
        with self._project_lock(project.name):
            project.document.setdefault("metadata", {})["last_modified"] = time.time()
            validate_daw_project(project.document)
            target = project.path / _PROJECT_FILE_NAME
            tmp = target.with_suffix(".json.tmp")
            with tmp.open("w", encoding="utf-8") as f:
                json.dump(project.document, f, indent=2, sort_keys=False)
                f.flush()
                os.fsync(f.fileno())
            tmp.replace(target)
        project.dirty = False
        logger.info("daw.project.save: %s -> %s", project.name, target)

    def delete_project(self, name: str) -> None:
        self._validate_name(name)
        project_dir = self._project_dir(name)
        if not project_dir.exists():
            raise ProjectNotFound(f"project {name!r} not found")
        # Best-effort recursive delete — refuse if there's anything outside
        # the canonical layout that would be lost.
        for entry in project_dir.rglob("*"):
            rel = entry.relative_to(project_dir).parts
            if rel and rel[0] not in (
                _AUDIO_SUBDIR, _RENDER_SUBDIR, _PROJECT_FILE_NAME, _LOCK_FILE_NAME,
                _PROJECT_FILE_NAME + ".tmp",
            ):
                # Defensive — refuse to delete unknown content.
                logger.warning(
                    "daw.project.delete: refusing to remove %s (unexpected entry %s)",
                    project_dir, entry,
                )
                raise DawProjectError(
                    f"project {name!r} contains unexpected entries; "
                    f"remove manually if intentional"
                )
        import shutil
        shutil.rmtree(project_dir)
        logger.info("daw.project.delete: removed %s", project_dir)

    # --- mutation helpers ---

    def add_track(
        self,
        project: DawProject,
        track_type: str,
        *,
        name: Optional[str] = None,
    ) -> int:
        if track_type not in ("audio", "midi"):
            raise DawProjectError(f"invalid track type {track_type!r}")
        tracks = project.document["tracks"]
        new_id = self._next_id(tracks)
        if name is None:
            type_count = sum(1 for t in tracks if t["type"] == track_type)
            name = f"{track_type.capitalize()} {type_count + 1}"
        tracks.append({"id": new_id, "type": track_type, "name": name})
        project.dirty = True
        return new_id

    def remove_track(self, project: DawProject, track_id: int) -> None:
        before = len(project.document["tracks"])
        project.document["tracks"] = [
            t for t in project.document["tracks"] if t["id"] != track_id
        ]
        if len(project.document["tracks"]) == before:
            raise DawProjectError(f"track {track_id} not found")
        # Cascade: remove clips + plugins on the deleted track.
        project.document["clips"] = [
            c for c in project.document["clips"] if c["track_id"] != track_id
        ]
        project.document["plugin_instances"] = [
            p for p in project.document["plugin_instances"]
            if p["track_id"] != track_id
        ]
        project.dirty = True

    def set_track_arm(self, project: DawProject, track_id: int, armed: bool) -> None:
        for track in project.document["tracks"]:
            if track["id"] == track_id:
                track["armed"] = armed
                project.dirty = True
                return
        raise DawProjectError(f"track {track_id} not found")

    def add_clip(
        self,
        project: DawProject,
        track_id: int,
        start_samples: int,
        length_samples: int,
        source: str,
    ) -> int:
        # Validate the track exists.
        if not any(t["id"] == track_id for t in project.document["tracks"]):
            raise DawProjectError(f"track {track_id} not found")
        if start_samples < 0:
            raise DawProjectError("start_samples must be >= 0")
        if length_samples <= 0:
            raise DawProjectError("length_samples must be > 0")
        clips = project.document["clips"]
        new_id = self._next_id(clips)
        clips.append(
            {
                "id": new_id,
                "track_id": track_id,
                "start_samples": start_samples,
                "length_samples": length_samples,
                "source": source,
            }
        )
        project.dirty = True
        return new_id

    def remove_clip(self, project: DawProject, clip_id: int) -> None:
        before = len(project.document["clips"])
        project.document["clips"] = [
            c for c in project.document["clips"] if c["id"] != clip_id
        ]
        if len(project.document["clips"]) == before:
            raise DawProjectError(f"clip {clip_id} not found")
        project.dirty = True

    def move_clip(self, project: DawProject, clip_id: int, new_start_samples: int) -> None:
        if new_start_samples < 0:
            raise DawProjectError("new_start_samples must be >= 0")
        for clip in project.document["clips"]:
            if clip["id"] == clip_id:
                clip["start_samples"] = new_start_samples
                project.dirty = True
                return
        raise DawProjectError(f"clip {clip_id} not found")

    def add_plugin(
        self,
        project: DawProject,
        track_id: int,
        plugin_uri: str,
    ) -> int:
        if not any(t["id"] == track_id for t in project.document["tracks"]):
            raise DawProjectError(f"track {track_id} not found")
        plugins = project.document["plugin_instances"]
        existing_slots = [
            p["slot_index"] for p in plugins if p["track_id"] == track_id
        ]
        new_slot = (max(existing_slots) + 1) if existing_slots else 0
        plugins.append(
            {
                "track_id": track_id,
                "slot_index": new_slot,
                "plugin_uri": plugin_uri,
                "enabled": True,
                "params": {},
            }
        )
        project.dirty = True
        return new_slot

    def remove_plugin(self, project: DawProject, track_id: int, slot_index: int) -> None:
        before = len(project.document["plugin_instances"])
        project.document["plugin_instances"] = [
            p for p in project.document["plugin_instances"]
            if not (p["track_id"] == track_id and p["slot_index"] == slot_index)
        ]
        if len(project.document["plugin_instances"]) == before:
            raise DawProjectError(
                f"plugin at track={track_id} slot={slot_index} not found"
            )
        project.dirty = True

    def set_plugin_param(
        self,
        project: DawProject,
        track_id: int,
        slot_index: int,
        param_id: str,
        value: float,
    ) -> None:
        for plugin in project.document["plugin_instances"]:
            if plugin["track_id"] == track_id and plugin["slot_index"] == slot_index:
                plugin.setdefault("params", {})[param_id] = float(value)
                project.dirty = True
                return
        raise DawProjectError(
            f"plugin at track={track_id} slot={slot_index} not found"
        )

    def set_automation_point(
        self,
        project: DawProject,
        lane_id: int,
        position: float,
        value: float,
    ) -> None:
        for lane in project.document["automation_lanes"]:
            if lane["id"] == lane_id:
                points = lane.setdefault("points", [])
                # Update an existing point at this position or insert a new
                # one. Position-equality uses an absolute-tolerance ε since
                # callers may dispatch slightly off-grid coordinates.
                eps = 1e-9
                for point in points:
                    if abs(point["position"] - position) < eps:
                        point["value"] = float(value)
                        break
                else:
                    points.append({"position": float(position), "value": float(value)})
                    points.sort(key=lambda p: p["position"])
                project.dirty = True
                return
        raise DawProjectError(f"automation lane {lane_id} not found")


# ---- Singleton accessor ----

_INSTANCE: Optional[DawProjectService] = None


def get_daw_project_service() -> DawProjectService:
    global _INSTANCE
    if _INSTANCE is None:
        _INSTANCE = DawProjectService()
    return _INSTANCE


def reset_daw_project_service() -> None:
    """Test helper."""
    global _INSTANCE
    _INSTANCE = None
