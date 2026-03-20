"""
Drum machine state service.

Provides a persistence-backed, typed service layer for the current drum machine
surface while the deeper engine integration work is still in progress.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, ValidationError

from app.services.juce_engine_service import get_audio_engine
from app.services.user_content_manager import UserContentManager
from app.utils.singleton import Singleton


_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_DRUMS_ROOT = Path(os.environ.get("MAP2_DRUMS_ROOT", Path.home() / ".map2" / "drums"))
_DEFAULT_STATE_PATH = Path(os.environ.get("MAP2_DRUMS_STATE_PATH", _DEFAULT_DRUMS_ROOT / "state.json"))
_FACTORY_PACKS_DIR = Path(os.environ.get("MAP2_DRUMS_FACTORY_PACKS_DIR", _PROJECT_ROOT / "data" / "drums" / "factory_packs"))
_GENERATED_PACKS_DIR = Path(os.environ.get("MAP2_DRUMS_GENERATED_PACKS_DIR", _PROJECT_ROOT / "data" / "drums" / "generated"))
_POSITION_POLL_INTERVAL_SECONDS = float(os.environ.get("MAP2_DRUM_POSITION_POLL_INTERVAL_SECONDS", "0.05"))


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


class DrumSequencerPositionModel(BaseModel):
    step: int = Field(0, ge=0, le=63)
    bar: int = Field(1, ge=1)
    beat: int = Field(1, ge=1, le=4)
    pattern: int = Field(0, ge=0, le=127)
    pattern_id: int = Field(0, ge=0, le=127)
    variation: int = Field(0, ge=0, le=10)
    is_playing: bool = False
    updated_at: Optional[str] = None


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
        self._position = DrumSequencerPositionModel(
            pattern=self._state.pattern,
            pattern_id=self._state.pattern,
            variation=self._state.variation,
        )
        self._position_poll_task: Optional[asyncio.Task] = None
        self._event_loop: Optional[asyncio.AbstractEventLoop] = None
        self._sync_static_state_to_engine()

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
        self._position = DrumSequencerPositionModel.model_validate(
            {
                **self._position.model_dump(),
                "pattern": self._state.pattern,
                "pattern_id": self._state.pattern,
                "variation": self._state.variation,
            }
        )
        self._sync_state_patch_to_engine(patch)
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
        self._sync_transport_patch_to_engine(patch)
        if patch.get("is_playing") is False:
            try:
                from app.services.drum_sequencer_service import DrumSequencerService, get_drum_sequencer_service

                if DrumSequencerService.has_instance():
                    get_drum_sequencer_service().handle_transport_stop(self._state.active_pack)
            except Exception:
                pass
            self._persist_state()
        return self.get_transport()

    def get_metering(self) -> Dict[str, Any]:
        self._refresh_metering_from_engine()
        return self._metering.model_dump()

    def update_metering(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        self._metering = DrumMeteringModel.model_validate(payload)
        return self._metering.model_dump()

    def get_position(self) -> Dict[str, Any]:
        return self._position.model_dump()

    def update_position(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        current = self._position.model_dump()
        current.update({key: value for key, value in patch.items() if value is not None or key in patch})
        current["pattern"] = self._state.pattern if "pattern" not in patch else current["pattern"]
        current["pattern_id"] = current["pattern"]
        current["variation"] = self._state.variation if "variation" not in patch else current["variation"]
        current["is_playing"] = self._state.transport if "is_playing" not in patch else current["is_playing"]
        current["updated_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        self._position = DrumSequencerPositionModel.model_validate(current)
        return self.get_position()

    async def publish_state_update(self) -> None:
        from app.services.websocket_manager import ws_manager

        payload = {
            "type": "drum_state",
            "data": self.get_state(),
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        await ws_manager.broadcast_json(payload, topic="drums")

    async def publish_transport_update(self) -> None:
        from app.services.websocket_manager import ws_manager

        payload = {
            "type": "drum_transport",
            "data": self.get_transport(),
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        await ws_manager.broadcast_json(payload, topic="drums:transport")
        await ws_manager.broadcast_json(payload, topic="drums")

    async def publish_position_update(self) -> None:
        from app.services.websocket_manager import ws_manager

        payload = {
            "type": "drum_position",
            "data": self.get_position(),
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        await ws_manager.broadcast_json(payload, topic="drums:position")
        await ws_manager.broadcast_json(payload, topic="drums")

    async def publish_metering_update(self) -> None:
        from app.services.websocket_manager import ws_manager

        payload = {
            "type": "drum_metering",
            "data": self._metering.model_dump(),
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        await ws_manager.broadcast_json(payload, topic="drums:metering")
        await ws_manager.broadcast_json(payload, topic="drums")

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

    def _engine(self) -> Any:
        try:
            return get_audio_engine().engine
        except Exception:
            return None

    def _sync_static_state_to_engine(self) -> None:
        self._sync_state_patch_to_engine({"volume": self._state.volume})
        self._refresh_metering_from_engine()
        self._refresh_position_from_engine()

    def _sync_state_patch_to_engine(self, patch: Dict[str, Any]) -> None:
        engine = self._engine()
        if engine is None:
            return

        if "volume" in patch:
            setter = getattr(engine, "set_drum_master_volume", None)
            if callable(setter):
                setter(float(self._state.volume) / 100.0)

    def _sync_transport_patch_to_engine(self, patch: Dict[str, Any]) -> None:
        engine = self._engine()
        if engine is None:
            return

        if "bpm" in patch:
            setter = getattr(engine, "set_drum_bpm", None)
            if callable(setter):
                setter(self._state.bpm)

        if "pattern" in patch:
            setter = getattr(engine, "set_drum_current_pattern", None)
            if callable(setter):
                setter(self._state.pattern)

        if "swing" in patch:
            setter = getattr(engine, "set_drum_swing", None)
            if callable(setter):
                setter(float(self._state.swing))

        if "is_playing" in patch:
            self._event_loop = self._safe_running_loop()
            if patch["is_playing"]:
                setter = getattr(engine, "set_drum_transport_playing", None)
                if callable(setter):
                    setter(True)
                self._ensure_position_poll_task()
            else:
                setter = getattr(engine, "set_drum_transport_playing", None)
                if callable(setter):
                    setter(False)
                self._stop_position_poll_task()
                self._refresh_position_from_engine()

    def _safe_running_loop(self) -> Optional[asyncio.AbstractEventLoop]:
        try:
            return asyncio.get_running_loop()
        except RuntimeError:
            return None

    def _ensure_position_poll_task(self) -> None:
        if self._event_loop is None:
            return
        if self._position_poll_task is None or self._position_poll_task.done():
            self._position_poll_task = self._event_loop.create_task(
                self._position_poll_loop(),
                name="drum_machine_position_poll",
            )

    def _stop_position_poll_task(self) -> None:
        if self._position_poll_task is None:
            return
        task = self._position_poll_task
        self._position_poll_task = None
        task.cancel()
        if self._event_loop is not None and self._event_loop.is_running():
            self._event_loop.create_task(self._drain_cancelled_task(task))

    async def _position_poll_loop(self) -> None:
        try:
            while self._state.transport:
                changed = self._refresh_position_from_engine()
                if changed:
                    await self.publish_position_update()
                await asyncio.sleep(_POSITION_POLL_INTERVAL_SECONDS)
        except asyncio.CancelledError:
            raise

    async def _drain_cancelled_task(self, task: asyncio.Task) -> None:
        with contextlib.suppress(asyncio.CancelledError):
            await task

    def _refresh_position_from_engine(self) -> bool:
        engine = self._engine()
        if engine is None:
            return False

        getter = getattr(engine, "get_drum_sequencer_position", None)
        if not callable(getter):
            return False

        try:
            payload = dict(getter())
        except Exception:
            return False

        payload.setdefault("pattern", payload.get("pattern_id", self._state.pattern))
        payload.setdefault("pattern_id", payload.get("pattern", self._state.pattern))
        payload.setdefault("variation", self._state.variation)
        payload.setdefault("is_playing", self._state.transport)
        payload.setdefault("beat", min(4, (int(payload.get("step", 0)) // 4) + 1))

        current_snapshot = self._position.model_dump(exclude={"updated_at"})
        updated = self.update_position(payload)
        updated_snapshot = {key: value for key, value in updated.items() if key != "updated_at"}
        return updated_snapshot != current_snapshot

    def _refresh_metering_from_engine(self) -> None:
        engine = self._engine()
        if engine is None:
            return

        getter = getattr(engine, "get_drum_metering", None)
        if not callable(getter):
            return

        try:
            payload = getter()
            if payload:
                self._metering = DrumMeteringModel.model_validate(dict(payload))
        except Exception:
            return


def get_drum_machine_service() -> DrumMachineService:
    return DrumMachineService.get_instance()
