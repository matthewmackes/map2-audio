"""
Drum machine state service.

Provides a persistence-backed, typed service layer for the current drum machine
surface while the deeper engine integration work is still in progress.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, ValidationError

from app.services.user_content_manager import UserContentManager
from app.utils.singleton import Singleton


_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_DRUMS_ROOT = Path(os.environ.get("MAP2_DRUMS_ROOT", Path.home() / ".map2" / "drums"))
_DEFAULT_STATE_PATH = Path(os.environ.get("MAP2_DRUMS_STATE_PATH", _DEFAULT_DRUMS_ROOT / "state.json"))
_FACTORY_PACKS_DIR = Path(os.environ.get("MAP2_DRUMS_FACTORY_PACKS_DIR", _PROJECT_ROOT / "data" / "drums" / "factory_packs"))
_GENERATED_PACKS_DIR = Path(os.environ.get("MAP2_DRUMS_GENERATED_PACKS_DIR", _PROJECT_ROOT / "data" / "drums" / "generated"))


class DrumMachineStateModel(BaseModel):
    ui_mode: Literal["practice", "advanced", "backing_tracks"] = "practice"
    bpm: int = Field(120, ge=40, le=300)
    volume: int = Field(80, ge=0, le=100)
    pattern: int = Field(0, ge=0, le=127)
    variation: int = Field(0, ge=0, le=10)
    transport: bool = False
    swing: int = Field(0, ge=0, le=100)
    active_pack: Optional[str] = None
    practice_style_id: Optional[str] = None
    practice_variation: int = Field(0, ge=0, le=10)
    practice_change_quantization: int = Field(1, ge=1, le=8)
    practice_count_in_bars: int = Field(1, ge=0, le=4)
    practice_auto_fill: bool = False


class DrumMachineStateUpdateModel(BaseModel):
    ui_mode: Optional[Literal["practice", "advanced", "backing_tracks"]] = None
    bpm: Optional[int] = Field(None, ge=40, le=300)
    volume: Optional[int] = Field(None, ge=0, le=100)
    pattern: Optional[int] = Field(None, ge=0, le=127)
    variation: Optional[int] = Field(None, ge=0, le=10)
    transport: Optional[bool] = None
    swing: Optional[int] = Field(None, ge=0, le=100)
    active_pack: Optional[str] = None
    practice_style_id: Optional[str] = None
    practice_variation: Optional[int] = Field(None, ge=0, le=10)
    practice_change_quantization: Optional[int] = Field(None, ge=1, le=8)
    practice_count_in_bars: Optional[int] = Field(None, ge=0, le=4)
    practice_auto_fill: Optional[bool] = None


class DrumTransportStateModel(BaseModel):
    is_playing: bool = False
    bpm: int = Field(120, ge=40, le=300)
    pattern: int = Field(0, ge=0, le=127)
    variation: int = Field(0, ge=0, le=10)
    swing: int = Field(0, ge=0, le=100)


class DrumTransportUpdateModel(BaseModel):
    is_playing: Optional[bool] = None
    bpm: Optional[int] = Field(None, ge=40, le=300)
    pattern: Optional[int] = Field(None, ge=0, le=127)
    variation: Optional[int] = Field(None, ge=0, le=10)
    swing: Optional[int] = Field(None, ge=0, le=100)


class DrumMeteringModel(BaseModel):
    per_pad_peak: List[float] = Field(default_factory=lambda: [0.0] * 16, min_length=16, max_length=16)
    per_pad_rms: List[float] = Field(default_factory=lambda: [0.0] * 16, min_length=16, max_length=16)
    per_bus_peak: List[float] = Field(default_factory=lambda: [0.0] * 8, min_length=8, max_length=8)
    per_bus_rms: List[float] = Field(default_factory=lambda: [0.0] * 8, min_length=8, max_length=8)
    master_peak_left: float = 0.0
    master_peak_right: float = 0.0
    master_rms_left: float = 0.0
    master_rms_right: float = 0.0


class DrumPackSummaryModel(BaseModel):
    pack_id: str
    name: str
    description: str = ""
    source: str = ""
    filename: str


class DrumMachineService(Singleton):
    def __init__(self) -> None:
        super().__init__()
        self._state_path = _DEFAULT_STATE_PATH
        self._factory_packs_dir = _FACTORY_PACKS_DIR
        self._user_content_manager = UserContentManager(_GENERATED_PACKS_DIR)
        self._metering = DrumMeteringModel()
        self._state = self._load_state()

    def _load_state(self) -> DrumMachineStateModel:
        if not self._state_path.exists():
            return DrumMachineStateModel()

        try:
            payload = json.loads(self._state_path.read_text())
            return DrumMachineStateModel.model_validate(payload)
        except (OSError, json.JSONDecodeError, ValidationError):
            return DrumMachineStateModel()

    def _persist_state(self) -> None:
        self._state_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = self._state_path.with_suffix(".tmp")
        temp_path.write_text(json.dumps(self._state.model_dump(), indent=2, sort_keys=True))
        temp_path.replace(self._state_path)

    def get_state(self) -> Dict[str, Any]:
        return self._state.model_dump()

    def update_state(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        current = self._state.model_dump()
        current.update({key: value for key, value in patch.items() if value is not None or key in patch})
        self._state = DrumMachineStateModel.model_validate(current)
        self._persist_state()
        return self.get_state()

    def get_transport(self) -> Dict[str, Any]:
        return DrumTransportStateModel(
            is_playing=self._state.transport,
            bpm=self._state.bpm,
            pattern=self._state.pattern,
            variation=self._state.variation,
            swing=self._state.swing,
        ).model_dump()

    def update_transport(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        payload: Dict[str, Any] = {}
        if "is_playing" in patch:
            payload["transport"] = patch["is_playing"]
        for source, target in (
            ("bpm", "bpm"),
            ("pattern", "pattern"),
            ("variation", "variation"),
            ("swing", "swing"),
        ):
            if source in patch:
                payload[target] = patch[source]
        self.update_state(payload)
        return self.get_transport()

    def get_metering(self) -> Dict[str, Any]:
        return self._metering.model_dump()

    def _index_pack_file(self, pack_file: Path) -> Optional[DrumPackSummaryModel]:
        try:
            pack = json.loads(pack_file.read_text())
        except (OSError, json.JSONDecodeError):
            return None

        pack_id = pack.get("pack_id")
        if not pack_id:
            return None

        return DrumPackSummaryModel(
            pack_id=str(pack_id),
            name=str(pack.get("name") or pack_id),
            description=str(pack.get("description") or ""),
            source=str(pack.get("source") or ""),
            filename=pack_file.name,
        )

    def list_factory_packs(self) -> List[Dict[str, Any]]:
        if not self._factory_packs_dir.exists():
            return []

        packs: List[DrumPackSummaryModel] = []
        for pack_file in sorted(self._factory_packs_dir.glob("*.json")):
            pack = self._index_pack_file(pack_file)
            if pack is not None:
                packs.append(pack)
        return [pack.model_dump() for pack in packs]

    def list_generated_packs(self) -> List[Dict[str, Any]]:
        return self._user_content_manager.list_packs()

    def get_factory_pack_details(self, pack_id: str) -> Dict[str, Any]:
        for pack_file in sorted(self._factory_packs_dir.glob("*.json")):
            try:
                pack = json.loads(pack_file.read_text())
            except (OSError, json.JSONDecodeError):
                continue
            if pack.get("pack_id") == pack_id:
                return pack
        raise FileNotFoundError(pack_id)

    def get_generated_pack_details(self, pack_id: str) -> Dict[str, Any]:
        return self._user_content_manager.get_pack(pack_id)

    def save_generated_pack(self, pack: Dict[str, Any]) -> Dict[str, Any]:
        path = self._user_content_manager.save_pack(pack)
        pack_id = str(pack.get("pack_id") or Path(path).stem)
        return {
            "status": "ok",
            "path": path,
            "pack_id": pack_id,
        }


def get_drum_machine_service() -> DrumMachineService:
    return DrumMachineService.get_instance()
