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
_MIDI_CONFIGS_DIR = Path(os.environ.get("MAP2_DRUMS_MIDI_CONFIGS_DIR", _DEFAULT_DRUMS_ROOT / "midi_configs"))
_DEFAULT_DRUM_NOTES = [36, 38, 42, 46, 41, 43, 45, 49, 51, 57, 39, 37, 56, 47, 50, 48]


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


class DrumMidiPadMappingModel(BaseModel):
    pad: int = Field(..., ge=0, le=15)
    notes: List[int] = Field(default_factory=list)
    midi_channel: int = Field(0, ge=0, le=16)


class DrumMidiMappingModel(BaseModel):
    global_midi_channel: int = Field(0, ge=0, le=16)
    pads: List[DrumMidiPadMappingModel] = Field(default_factory=list)


class DrumPadVelocityCurveModel(BaseModel):
    pad: int = Field(..., ge=0, le=15)
    curve_type: int = Field(0, ge=0, le=4)
    fixed_velocity: float = Field(1.0, ge=0.0, le=1.0)
    input_floor: float = Field(0.0, ge=0.0, le=1.0)
    output_floor: float = Field(0.0, ge=0.0, le=1.0)
    output_ceiling: float = Field(1.0, ge=0.0, le=1.0)
    preview: List[float] = Field(default_factory=list)
    last_velocity: float = Field(0.0, ge=0.0, le=1.0)


class DrumMidiVelocityCurvesModel(BaseModel):
    pads: List[DrumPadVelocityCurveModel] = Field(default_factory=list)


class DrumPadZoneModel(BaseModel):
    kind: int = Field(..., ge=0, le=2)
    trigger_note: int = Field(..., ge=0, le=127)
    key_switch_note: int = Field(-1, ge=-1, le=127)
    velocity_scale: float = Field(1.0, ge=0.0, le=2.0)
    enabled: bool = True


class DrumPadZonesModel(BaseModel):
    pad: int = Field(..., ge=0, le=15)
    zones: List[DrumPadZoneModel] = Field(default_factory=list)


class DrumMidiZonesModel(BaseModel):
    pads: List[DrumPadZonesModel] = Field(default_factory=list)


class DrumMidiLearnStateModel(BaseModel):
    active: bool = False
    learn_all: bool = False
    active_pad_index: int = -1
    next_pad_index: int = -1
    last_received_note: int = -1
    last_received_channel: int = -1
    timeout_seconds: int = Field(10, ge=1)


class DrumMidiPresetListModel(BaseModel):
    presets: List[str] = Field(default_factory=list)


class DrumMachineService(Singleton):
    def __init__(self) -> None:
        super().__init__()
        self._state_path = _DEFAULT_STATE_PATH
        self._factory_packs_dir = _FACTORY_PACKS_DIR
        self._user_content_manager = UserContentManager(_GENERATED_PACKS_DIR)
        self._midi_configs_dir = _MIDI_CONFIGS_DIR
        self._metering = DrumMeteringModel()
        self._state = self._load_state()
        self._position = DrumSequencerPositionModel(
            pattern=self._state.pattern,
            pattern_id=self._state.pattern,
            variation=self._state.variation,
        )
        self._position_poll_task: Optional[asyncio.Task] = None
        self._event_loop: Optional[asyncio.AbstractEventLoop] = None
        self._global_midi_channel = 0
        self._pad_midi_notes = {index: [note] for index, note in enumerate(_DEFAULT_DRUM_NOTES)}
        self._pad_midi_channels = {index: 0 for index in range(16)}
        self._velocity_curves = {
            index: {
                "curve_type": 0,
                "fixed_velocity": 1.0,
                "input_floor": 0.0,
                "output_floor": 0.0,
                "output_ceiling": 1.0,
            }
            for index in range(16)
        }
        self._pad_zones = {index: [] for index in range(16)}
        self._midi_learn_state = DrumMidiLearnStateModel()
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

    def _get_active_kit_id(self) -> Optional[str]:
        try:
            from app.services.drum_kit_service import DrumKitService, get_drum_kit_service

            if not DrumKitService.has_instance():
                return None
            active_kit = get_drum_kit_service().get_active_kit()
            return None if active_kit is None else str(active_kit.get("kit_id") or "")
        except Exception:
            return None

    def _midi_config_path(self, kit_id: str) -> Path:
        return self._midi_configs_dir / f"{kit_id}.json"

    def _current_midi_config_payload(self) -> Dict[str, Any]:
        return {
            "mapping": self.get_midi_mapping(),
            "velocity_curves": self.get_velocity_curves(),
            "zones": self.get_midi_zones(),
        }

    def persist_midi_config_for_kit(self, kit_id: str) -> Dict[str, Any]:
        payload = self._current_midi_config_payload()
        self._midi_configs_dir.mkdir(parents=True, exist_ok=True)
        path = self._midi_config_path(kit_id)
        temp_path = path.with_suffix(".tmp")
        temp_path.write_text(json.dumps(payload, indent=2, sort_keys=True))
        temp_path.replace(path)
        return payload

    def persist_active_kit_midi_config(self) -> Optional[Dict[str, Any]]:
        kit_id = self._get_active_kit_id()
        if not kit_id:
            return None
        return self.persist_midi_config_for_kit(kit_id)

    def load_midi_config_for_kit(self, kit_id: str) -> Dict[str, Any]:
        path = self._midi_config_path(kit_id)
        if not path.exists():
            return self._current_midi_config_payload()

        payload = json.loads(path.read_text())
        mapping = DrumMidiMappingModel.model_validate(payload.get("mapping", {})).model_dump()
        velocity_curves = DrumMidiVelocityCurvesModel.model_validate(payload.get("velocity_curves", {})).model_dump()
        zones = DrumMidiZonesModel.model_validate(payload.get("zones", {})).model_dump()
        self.update_midi_mapping(mapping)
        self.update_velocity_curves(velocity_curves)
        self.update_midi_zones(zones)
        return self._current_midi_config_payload()

    def get_midi_mapping(self) -> Dict[str, Any]:
        engine = self._engine()
        getter = getattr(engine, "get_drum_global_midi_channel", None) if engine is not None else None
        if callable(getter):
            try:
                self._global_midi_channel = int(getter())
            except Exception:
                pass

        get_notes = getattr(engine, "get_drum_pad_notes", None) if engine is not None else None
        for pad in range(16):
            if callable(get_notes):
                try:
                    self._pad_midi_notes[pad] = [int(note) for note in list(get_notes(pad))]
                except Exception:
                    pass

        return DrumMidiMappingModel(
            global_midi_channel=self._global_midi_channel,
            pads=[
                DrumMidiPadMappingModel(
                    pad=pad,
                    notes=list(self._pad_midi_notes[pad]),
                    midi_channel=self._pad_midi_channels[pad],
                )
                for pad in range(16)
            ],
        ).model_dump()

    def update_midi_mapping(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        engine = self._engine()
        if "global_midi_channel" in payload:
            self._global_midi_channel = int(payload["global_midi_channel"])
            setter = getattr(engine, "set_drum_global_midi_channel", None) if engine is not None else None
            if callable(setter):
                setter(self._global_midi_channel)

        for pad_payload in payload.get("pads", []):
            pad = int(pad_payload["pad"])
            notes = [int(note) for note in pad_payload.get("notes", [])]
            midi_channel = int(pad_payload.get("midi_channel", self._pad_midi_channels[pad]))
            previous_notes = list(self._pad_midi_notes.get(pad, []))
            self._pad_midi_notes[pad] = notes or [self._pad_midi_notes.get(pad, [_DEFAULT_DRUM_NOTES[pad]])[0]]
            self._pad_midi_channels[pad] = midi_channel

            if engine is not None:
                set_note = getattr(engine, "set_drum_pad_note", None)
                add_note = getattr(engine, "add_drum_pad_note", None)
                remove_note = getattr(engine, "remove_drum_pad_note", None)
                set_channel = getattr(engine, "set_drum_pad_midi_channel", None)
                if callable(set_note) and self._pad_midi_notes[pad]:
                    set_note(pad, self._pad_midi_notes[pad][0])
                if callable(remove_note):
                    for note in previous_notes[1:]:
                        if note not in self._pad_midi_notes[pad]:
                            remove_note(pad, note)
                if callable(add_note):
                    for note in self._pad_midi_notes[pad][1:]:
                        add_note(pad, note)
                if callable(set_channel):
                    set_channel(pad, midi_channel)

        updated = self.get_midi_mapping()
        self.persist_active_kit_midi_config()
        return updated

    def get_velocity_curves(self) -> Dict[str, Any]:
        engine = self._engine()
        get_preview = getattr(engine, "get_drum_pad_velocity_curve_preview", None) if engine is not None else None
        get_last_velocity = getattr(engine, "get_drum_pad_last_velocity", None) if engine is not None else None
        pads: List[DrumPadVelocityCurveModel] = []
        for pad in range(16):
            config = dict(self._velocity_curves[pad])
            preview = []
            if callable(get_preview):
                try:
                    preview = [float(value) for value in list(get_preview(pad))]
                except Exception:
                    preview = []
            last_velocity = 0.0
            if callable(get_last_velocity):
                try:
                    last_velocity = float(get_last_velocity(pad))
                except Exception:
                    last_velocity = 0.0
            pads.append(DrumPadVelocityCurveModel(pad=pad, preview=preview, last_velocity=last_velocity, **config))
        return DrumMidiVelocityCurvesModel(pads=pads).model_dump()

    def update_velocity_curves(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        engine = self._engine()
        setter = getattr(engine, "set_drum_pad_velocity_curve", None) if engine is not None else None
        for pad_payload in payload.get("pads", []):
            pad = int(pad_payload["pad"])
            self._velocity_curves[pad] = {
                "curve_type": int(pad_payload.get("curve_type", 0)),
                "fixed_velocity": float(pad_payload.get("fixed_velocity", 1.0)),
                "input_floor": float(pad_payload.get("input_floor", 0.0)),
                "output_floor": float(pad_payload.get("output_floor", 0.0)),
                "output_ceiling": float(pad_payload.get("output_ceiling", 1.0)),
            }
            if callable(setter):
                setter(
                    pad,
                    self._velocity_curves[pad]["curve_type"],
                    self._velocity_curves[pad]["fixed_velocity"],
                    self._velocity_curves[pad]["input_floor"],
                    self._velocity_curves[pad]["output_floor"],
                    self._velocity_curves[pad]["output_ceiling"],
                )
        updated = self.get_velocity_curves()
        self.persist_active_kit_midi_config()
        return updated

    def get_midi_zones(self) -> Dict[str, Any]:
        engine = self._engine()
        getter = getattr(engine, "get_drum_pad_zones", None) if engine is not None else None
        pads: List[DrumPadZonesModel] = []
        for pad in range(16):
            zones = self._pad_zones[pad]
            if callable(getter):
                try:
                    zones = [dict(zone) for zone in list(getter(pad))]
                    self._pad_zones[pad] = zones
                except Exception:
                    pass
            pads.append(
                DrumPadZonesModel(
                    pad=pad,
                    zones=[DrumPadZoneModel.model_validate(zone) for zone in zones],
                )
            )
        return DrumMidiZonesModel(pads=pads).model_dump()

    def update_midi_zones(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        engine = self._engine()
        set_zone = getattr(engine, "set_drum_pad_zone", None) if engine is not None else None
        clear_zone = getattr(engine, "clear_drum_pad_zone", None) if engine is not None else None
        for pad_payload in payload.get("pads", []):
            pad = int(pad_payload["pad"])
            zones = [DrumPadZoneModel.model_validate(zone).model_dump() for zone in pad_payload.get("zones", [])]
            self._pad_zones[pad] = zones
            if callable(clear_zone):
                for kind in range(3):
                    clear_zone(pad, kind)
            if callable(set_zone):
                for zone in zones:
                    if zone["enabled"]:
                        set_zone(
                            pad,
                            zone["kind"],
                            zone["trigger_note"],
                            zone["key_switch_note"],
                            zone["velocity_scale"],
                        )
        updated = self.get_midi_zones()
        self.persist_active_kit_midi_config()
        return updated

    def start_midi_learn(self, pad: int, learn_all: bool = False, timeout_seconds: int = 10) -> Dict[str, Any]:
        engine = self._engine()
        starter = getattr(engine, "start_drum_midi_learn", None) if engine is not None else None
        started = True
        if callable(starter):
            started = bool(starter(pad, learn_all, timeout_seconds))
        if not started:
            raise ValueError("Unable to start drum MIDI learn mode")
        self._midi_learn_state = DrumMidiLearnStateModel(
            active=True,
            learn_all=learn_all,
            active_pad_index=pad,
            next_pad_index=pad,
            timeout_seconds=timeout_seconds,
        )
        return self.get_midi_learn_state()

    def stop_midi_learn(self) -> Dict[str, Any]:
        engine = self._engine()
        stopper = getattr(engine, "stop_drum_midi_learn", None) if engine is not None else None
        if callable(stopper):
            stopper()
        self._midi_learn_state.active = False
        self._midi_learn_state.learn_all = False
        self._midi_learn_state.active_pad_index = -1
        self._midi_learn_state.next_pad_index = -1
        return self.get_midi_learn_state()

    def get_midi_learn_state(self) -> Dict[str, Any]:
        engine = self._engine()
        getter = getattr(engine, "get_drum_midi_learn_state", None) if engine is not None else None
        if callable(getter):
            try:
                self._midi_learn_state = DrumMidiLearnStateModel.model_validate(dict(getter()))
            except Exception:
                pass
        return self._midi_learn_state.model_dump()

    def get_midi_presets(self) -> Dict[str, Any]:
        engine = self._engine()
        getter = getattr(engine, "get_drum_midi_presets", None) if engine is not None else None
        presets: List[str] = []
        if callable(getter):
            try:
                presets = [str(preset) for preset in list(getter())]
            except Exception:
                presets = []
        return DrumMidiPresetListModel(presets=presets).model_dump()

    def load_midi_preset(self, preset_name: str) -> Dict[str, Any]:
        engine = self._engine()
        loader = getattr(engine, "apply_drum_midi_preset", None) if engine is not None else None
        applied = True
        if callable(loader):
            applied = bool(loader(preset_name))
        if not applied:
            raise ValueError(f"Unknown drum MIDI preset: {preset_name}")
        payload = {
            "status": "ok",
            "preset_name": preset_name,
            "mapping": self.get_midi_mapping(),
            "zones": self.get_midi_zones(),
        }
        self.persist_active_kit_midi_config()
        return payload

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
