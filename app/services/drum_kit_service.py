"""
Drum kit management service.

Indexes factory and user drum kits, validates kit manifests, and applies kit
instrument assignments to the drum machine engine.
"""

from __future__ import annotations

import io
import json
import os
import re
import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, ValidationError, field_validator

from app.services.juce_engine_service import get_audio_engine
from app.utils.singleton import Singleton


_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_DRUMS_ROOT = Path(os.environ.get("MAP2_DRUMS_ROOT", Path.home() / ".map2" / "drums"))
_FACTORY_KITS_DIR = Path(os.environ.get("MAP2_DRUMS_FACTORY_KITS_DIR", _PROJECT_ROOT / "data" / "drums" / "factory_kits"))
_USER_KITS_DIR = Path(os.environ.get("MAP2_DRUMS_USER_KITS_DIR", _DEFAULT_DRUMS_ROOT / "user_kits"))
_ACTIVE_KIT_STATE_PATH = Path(os.environ.get("MAP2_DRUMS_ACTIVE_KIT_STATE_PATH", _DEFAULT_DRUMS_ROOT / "active_kit.json"))


class DrumKitInstrumentModel(BaseModel):
    name: str = Field(min_length=1)
    sfz_path: str = Field(min_length=1)
    default_note: int = Field(ge=0, le=127)
    bus_assignment: int = Field(ge=0, le=7)
    default_volume: float = Field(ge=0.0, le=1.0)
    default_pan: float = Field(ge=-1.0, le=1.0)
    default_tune: float = Field(ge=-24.0, le=24.0)

    @field_validator("sfz_path")
    @classmethod
    def _validate_sfz_path(cls, value: str) -> str:
        if value.startswith("/"):
            raise ValueError("sfz_path must be relative to the kit root")
        if ".." in Path(value).parts:
            raise ValueError("sfz_path must not traverse outside the kit root")
        if not value.endswith(".sfz"):
            raise ValueError("sfz_path must end with .sfz")
        return value


class DrumKitModel(BaseModel):
    kit_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    description: str = ""
    author: str = ""
    version: int = Field(ge=1)
    category: Literal["acoustic", "electronic", "percussion", "hybrid"]
    license: str = Field(min_length=1)
    default_bpm: float = Field(ge=20.0, le=300.0)
    default_swing: float = Field(ge=0.0, le=100.0)
    instruments: List[DrumKitInstrumentModel] = Field(min_length=16, max_length=16)


class DrumKitSummaryModel(BaseModel):
    kit_id: str
    name: str
    description: str = ""
    author: str = ""
    version: int = 1
    category: str
    license: str
    source: Literal["factory", "user"]
    root_path: str


class ActiveDrumKitModel(BaseModel):
    kit_id: str
    source: Literal["factory", "user"]
    root_path: str


class DrumKitService(Singleton):
    def __init__(self) -> None:
        super().__init__()
        self._factory_kits_dir = _FACTORY_KITS_DIR
        self._user_kits_dir = _USER_KITS_DIR
        self._active_kit_state_path = _ACTIVE_KIT_STATE_PATH
        self._user_kits_dir.mkdir(parents=True, exist_ok=True)
        self._active_kit: Optional[ActiveDrumKitModel] = self._load_active_kit()

    def list_kits(self) -> List[Dict[str, Any]]:
        kits: Dict[str, DrumKitSummaryModel] = {}
        for source, root_dir in (("factory", self._factory_kits_dir), ("user", self._user_kits_dir)):
            for summary in self._index_kit_root(root_dir, source):
                kits[summary.kit_id] = summary
        return [summary.model_dump() for _, summary in sorted(kits.items(), key=lambda item: item[0])]

    def get_kit(self, kit_id: str) -> Dict[str, Any]:
        source, root_path = self._resolve_kit_path(kit_id)
        manifest = self._read_kit_manifest(root_path)
        payload = manifest.model_dump()
        payload["source"] = source
        payload["root_path"] = str(root_path)
        return payload

    def get_active_kit(self) -> Optional[Dict[str, Any]]:
        if self._active_kit is None:
            return None
        try:
            kit = self.get_kit(self._active_kit.kit_id)
        except FileNotFoundError:
            return self._active_kit.model_dump()
        kit["active"] = True
        return kit

    def load_kit(self, kit_id: str) -> Dict[str, Any]:
        source, root_path = self._resolve_kit_path(kit_id)
        manifest = self._read_kit_manifest(root_path)
        engine = self._engine()
        if engine is None:
            raise RuntimeError("Audio engine is unavailable")

        loader = getattr(engine, "load_drum_pad_sfz", None)
        if not callable(loader):
            raise RuntimeError("Audio engine does not expose load_drum_pad_sfz")

        pad_bus_setter = getattr(engine, "set_drum_pad_bus", None)
        if not callable(pad_bus_setter):
            raise RuntimeError("Audio engine does not expose set_drum_pad_bus")

        transport_setter = getattr(engine, "set_drum_transport_playing", None)
        position_getter = getattr(engine, "get_drum_sequencer_position", None)
        was_playing = False
        if callable(position_getter):
            try:
                position_payload = dict(position_getter())
                was_playing = bool(position_payload.get("is_playing"))
            except Exception:
                was_playing = False
        if was_playing and callable(transport_setter):
            transport_setter(False)

        loaded_pads = 0
        try:
            for pad_index, instrument in enumerate(manifest.instruments):
                sfz_path = root_path / instrument.sfz_path
                if not loader(pad_index, str(sfz_path)):
                    raise RuntimeError(f"Failed to load pad {pad_index} SFZ: {sfz_path}")
                self._apply_instrument_to_engine(engine, pad_index, instrument)
                loaded_pads += 1
        finally:
            if was_playing and callable(transport_setter):
                transport_setter(True)

        self._active_kit = ActiveDrumKitModel(kit_id=manifest.kit_id, source=source, root_path=str(root_path))
        self._persist_active_kit()

        status_getter = getattr(engine, "get_drum_kit_status", None)
        status_payload = dict(status_getter()) if callable(status_getter) else {}

        return {
            "status": "ok",
            "loaded_pad_count": loaded_pads,
            "kit": {
                **manifest.model_dump(),
                "source": source,
                "root_path": str(root_path),
            },
            "engine_status": status_payload,
        }

    def create_user_kit(
        self,
        template_kit_id: str,
        new_kit_id: str,
        *,
        name: Optional[str] = None,
        description: Optional[str] = None,
        author: Optional[str] = None,
    ) -> Dict[str, Any]:
        new_kit_id = self._normalize_kit_id(new_kit_id)
        if not new_kit_id:
            raise ValueError("new_kit_id must not be empty")

        _, template_root = self._resolve_kit_path(template_kit_id)
        destination_root = self._user_kits_dir / new_kit_id
        if destination_root.exists():
            raise FileExistsError(f"User kit already exists: {new_kit_id}")

        shutil.copytree(template_root, destination_root)
        manifest = self._read_kit_manifest(destination_root)
        updated_manifest = manifest.model_copy(
            update={
                "kit_id": new_kit_id,
                "name": name or manifest.name,
                "description": description if description is not None else manifest.description,
                "author": author if author is not None else manifest.author,
            }
        )
        self._write_kit_manifest(destination_root, updated_manifest)
        return self.get_kit(new_kit_id)

    def import_user_kit_archive(self, archive_bytes: bytes, filename: str = "kit.zip") -> Dict[str, Any]:
        if not archive_bytes:
            raise ValueError("Kit archive is empty")

        self._user_kits_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=self._user_kits_dir) as temp_dir_str:
            temp_dir = Path(temp_dir_str)
            self._extract_archive(archive_bytes, temp_dir, filename)
            kit_root = self._find_extracted_kit_root(temp_dir)
            manifest = self._read_kit_manifest(kit_root)
            self._validate_kit_files(kit_root, manifest)

            destination = self._user_kits_dir / manifest.kit_id
            if destination.exists():
                raise FileExistsError(f"User kit already exists: {manifest.kit_id}")

            shutil.copytree(kit_root, destination)

        return self.get_kit(manifest.kit_id)

    def _index_kit_root(self, root_dir: Path, source: Literal["factory", "user"]) -> List[DrumKitSummaryModel]:
        if not root_dir.exists():
            return []

        summaries: List[DrumKitSummaryModel] = []
        for kit_root in sorted(path for path in root_dir.iterdir() if path.is_dir()):
            try:
                manifest = self._read_kit_manifest(kit_root)
            except (FileNotFoundError, ValidationError, OSError, json.JSONDecodeError):
                continue
            summaries.append(
                DrumKitSummaryModel(
                    kit_id=manifest.kit_id,
                    name=manifest.name,
                    description=manifest.description,
                    author=manifest.author,
                    version=manifest.version,
                    category=manifest.category,
                    license=manifest.license,
                    source=source,
                    root_path=str(kit_root),
                )
            )
        return summaries

    def _resolve_kit_path(self, kit_id: str) -> tuple[Literal["factory", "user"], Path]:
        user_root = self._user_kits_dir / kit_id
        if user_root.exists():
            return "user", user_root

        factory_root = self._factory_kits_dir / kit_id
        if factory_root.exists():
            return "factory", factory_root

        raise FileNotFoundError(kit_id)

    def _read_kit_manifest(self, kit_root: Path) -> DrumKitModel:
        manifest_path = kit_root / "kit.json"
        if not manifest_path.exists():
            raise FileNotFoundError(f"Missing kit manifest: {manifest_path}")
        payload = json.loads(manifest_path.read_text())
        manifest = DrumKitModel.model_validate(payload)
        self._validate_kit_files(kit_root, manifest)
        return manifest

    def _write_kit_manifest(self, kit_root: Path, manifest: DrumKitModel) -> None:
        (kit_root / "kit.json").write_text(json.dumps(manifest.model_dump(), indent=2) + "\n")

    def _validate_kit_files(self, kit_root: Path, manifest: DrumKitModel) -> None:
        for instrument in manifest.instruments:
            sfz_path = (kit_root / instrument.sfz_path).resolve()
            kit_root_resolved = kit_root.resolve()
            if kit_root_resolved not in sfz_path.parents and sfz_path != kit_root_resolved:
                raise ValueError(f"SFZ path escapes kit root: {instrument.sfz_path}")
            if not sfz_path.exists():
                raise FileNotFoundError(f"Missing SFZ file: {instrument.sfz_path}")
            sample_paths = self._extract_sfz_samples(sfz_path)
            for sample_path in sample_paths:
                resolved_sample = (sfz_path.parent / sample_path).resolve()
                if kit_root_resolved not in resolved_sample.parents and resolved_sample != kit_root_resolved:
                    raise ValueError(f"Sample path escapes kit root: {sample_path}")
                if not resolved_sample.exists():
                    raise FileNotFoundError(f"Missing sample file referenced by {sfz_path.name}: {sample_path}")

    def _extract_sfz_samples(self, sfz_path: Path) -> List[str]:
        samples: List[str] = []
        for line in sfz_path.read_text().splitlines():
            stripped = line.strip()
            if stripped.startswith("sample="):
                sample_path = stripped.split("=", 1)[1].strip()
                if sample_path:
                    samples.append(sample_path)
        return samples

    def _apply_instrument_to_engine(self, engine: Any, pad_index: int, instrument: DrumKitInstrumentModel) -> None:
        self._call_engine(engine, "set_drum_pad_note", pad_index, instrument.default_note)
        self._call_engine(engine, "set_drum_pad_volume", pad_index, instrument.default_volume)
        self._call_engine(engine, "set_drum_pad_pan", pad_index, instrument.default_pan)
        self._call_engine(engine, "set_drum_pad_tune", pad_index, instrument.default_tune)
        self._call_engine(engine, "set_drum_pad_bus", pad_index, instrument.bus_assignment)

    def _call_engine(self, engine: Any, method_name: str, *args: Any) -> None:
        method = getattr(engine, method_name, None)
        if not callable(method):
            raise RuntimeError(f"Audio engine does not expose {method_name}")
        if not method(*args):
            raise RuntimeError(f"Audio engine rejected {method_name}")

    def _engine(self) -> Any:
        try:
            return get_audio_engine().engine
        except Exception:
            return None

    def _load_active_kit(self) -> Optional[ActiveDrumKitModel]:
        if not self._active_kit_state_path.exists():
            return None
        try:
            payload = json.loads(self._active_kit_state_path.read_text())
            return ActiveDrumKitModel.model_validate(payload)
        except (OSError, json.JSONDecodeError, ValidationError):
            return None

    def _persist_active_kit(self) -> None:
        self._active_kit_state_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = self._active_kit_state_path.with_suffix(".tmp")
        payload = self._active_kit.model_dump() if self._active_kit is not None else {}
        temp_path.write_text(json.dumps(payload, indent=2, sort_keys=True))
        temp_path.replace(self._active_kit_state_path)

    def _extract_archive(self, archive_bytes: bytes, destination: Path, filename: str) -> None:
        if not filename.lower().endswith(".zip"):
            raise ValueError("Kit import archive must be a .zip file")

        with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
            for member in archive.infolist():
                member_path = Path(member.filename)
                if member_path.is_absolute() or ".." in member_path.parts:
                    raise ValueError(f"Invalid archive member path: {member.filename}")
                target_path = destination / member.filename
                target_path.parent.mkdir(parents=True, exist_ok=True)
                if member.is_dir():
                    target_path.mkdir(parents=True, exist_ok=True)
                    continue
                with archive.open(member) as source_handle, target_path.open("wb") as target_handle:
                    shutil.copyfileobj(source_handle, target_handle)

    def _find_extracted_kit_root(self, extracted_root: Path) -> Path:
        manifest_candidates = sorted(extracted_root.rglob("kit.json"))
        if len(manifest_candidates) != 1:
            raise ValueError("Kit archive must contain exactly one kit.json manifest")
        return manifest_candidates[0].parent

    def _normalize_kit_id(self, value: str) -> str:
        collapsed = re.sub(r"[^a-z0-9_\\-]+", "_", value.strip().lower())
        return collapsed.strip("_")


def get_drum_kit_service() -> DrumKitService:
    return DrumKitService.get_instance()
