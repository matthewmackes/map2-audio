"""
Drum Machine API routes.

This route set preserves the current drum page/card contract while moving the
implementation onto a typed, persistence-backed service.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List

from fastapi import APIRouter, File, HTTPException, Path, Response, UploadFile
from pydantic import BaseModel, Field

from app.services.drum_kit_service import (
    DrumKitModel,
    DrumKitService,
    DrumKitSummaryModel,
    get_drum_kit_service,
)

from app.services.drum_sequencer_service import (
    DrumPatternModel,
    DrumSequencerStepModel,
    DrumSequencerService,
    DrumSongEntryModel,
    get_drum_sequencer_service,
)
from app.services.drum_machine_service import (
    DrumBackingTrackSummaryModel,
    DrumBackingTrackTransportStateModel,
    DrumBackingTrackTransportUpdateModel,
    DrumBusMixerModel,
    DrumCcLearnStateModel,
    DrumCcMappingModel,
    DrumCompModel,
    DrumCvGateConfigModel,
    DrumEqModel,
    DrumMidiLearnStateModel,
    DrumMidiMappingModel,
    DrumMidiOutputConfigModel,
    DrumMidiPresetListModel,
    DrumMidiVelocityCurvesModel,
    DrumMidiZonesModel,
    DrumMachineStateModel,
    DrumMachineStateUpdateModel,
    DrumMachineService,
    DrumMeteringModel,
    DrumMasterFxModel,
    DrumPadFilterModel,
    DrumPadControlModel,
    DrumSequencerPositionModel,
    DrumSongTransportStateModel,
    DrumSynthParamModel,
    DrumTransportStateModel,
    DrumTransportUpdateModel,
    get_drum_machine_service,
)
from app.services.drum_sample_editor import (
    DrumPadRecordingStateModel,
    DrumPadSampleWaveformModel,
    get_drum_sample_editor_service,
)

router = APIRouter()


class DrumStateResponse(BaseModel):
    status: str = "ok"
    state: DrumMachineStateModel


class DrumPackUploadResponse(BaseModel):
    status: str
    path: str
    pack_id: str


class DrumPatternStepUpdateModel(BaseModel):
    instrument: int = Field(..., ge=0, le=15)
    step: int = Field(..., ge=0, le=63)
    velocity: int = Field(..., ge=0, le=127)
    accent: bool = False
    micro_timing: int = Field(0, ge=-48, le=48)
    probability: float = Field(1.0, ge=0.0, le=1.0)
    ratchet_count: int = Field(1, ge=1, le=8)
    ratchet_decay: int = Field(0, ge=0, le=100)
    lock_pitch: float | None = Field(default=None, ge=-24.0, le=24.0)
    lock_filter_cutoff: float | None = Field(default=None, ge=20.0, le=20000.0)
    lock_decay: float | None = Field(default=None, ge=1.0, le=5000.0)
    lock_pan: float | None = Field(default=None, ge=-1.0, le=1.0)
    lock_volume: float | None = Field(default=None, ge=0.0, le=1.0)


class DrumTrackSwingUpdateModel(BaseModel):
    swing: int = Field(..., ge=0, le=100)


class DrumTrackLengthUpdateModel(BaseModel):
    length: int = Field(..., ge=0, le=64)


class DrumSongUpdateResponse(BaseModel):
    song: List[DrumSongEntryModel]
    song_loop: bool


class DrumSongUpdateModel(BaseModel):
    song: List[DrumSongEntryModel]
    song_loop: bool = False


class DrumPatternCopyModel(BaseModel):
    source_pattern_id: int = Field(..., ge=0, le=127)
    destination_pattern_id: int = Field(..., ge=0, le=127)


class DrumKitLoadRequest(BaseModel):
    kit_id: str


class DrumKitCreateRequest(BaseModel):
    template_kit_id: str
    new_kit_id: str
    name: str | None = None
    description: str | None = None
    author: str | None = None


class DrumKitLoadResponse(BaseModel):
    status: str
    loaded_pad_count: int
    kit: DrumKitModel
    engine_status: Dict[str, Any]


class DrumKitMutationResponse(BaseModel):
    status: str = "ok"
    kit: DrumKitModel
    source: str
    root_path: str


class DrumKitInstrumentPatchModel(BaseModel):
    name: str | None = None
    sfz_path: str | None = None
    default_note: int | None = Field(default=None, ge=0, le=127)
    bus_assignment: int | None = Field(default=None, ge=0, le=7)
    default_volume: float | None = Field(default=None, ge=0.0, le=1.0)
    default_pan: float | None = Field(default=None, ge=-1.0, le=1.0)
    default_tune: float | None = Field(default=None, ge=-24.0, le=24.0)


class DrumMidiLearnStartRequest(BaseModel):
    pad: int = Field(..., ge=0, le=15)
    learn_all: bool = False
    timeout_seconds: int = Field(10, ge=1, le=60)


class DrumMidiPresetLoadRequest(BaseModel):
    preset_name: str


class DrumCcLearnStartRequest(BaseModel):
    slot: int = Field(..., ge=0, le=31)
    timeout_seconds: int = Field(10, ge=1, le=60)


class DrumPadSoundSourceModel(BaseModel):
    pad: int = Field(..., ge=0, le=15)
    source: str


class DrumPadSoundSourceUpdateModel(BaseModel):
    source: str


class DrumPadSynthParamsResponseModel(BaseModel):
    pad: int = Field(..., ge=0, le=15)
    params: DrumSynthParamModel


class DrumPadFilterResponseModel(BaseModel):
    pad: int = Field(..., ge=0, le=15)
    filter: DrumPadFilterModel


class DrumPadCvGateResponseModel(BaseModel):
    pad: int = Field(..., ge=0, le=15)
    config: DrumCvGateConfigModel


class DrumPadControlUpdateModel(BaseModel):
    volume: float | None = Field(default=None, ge=0.0, le=100.0)
    pan: float | None = Field(default=None, ge=-100.0, le=100.0)
    tune: float | None = Field(default=None, ge=-24.0, le=24.0)
    mute: bool | None = None
    solo: bool | None = None
    bus_assignment: int | None = Field(default=None, ge=0, le=7)


class DrumPadSampleTrimModel(BaseModel):
    start_sample: int = Field(..., ge=0)
    end_sample: int = Field(..., ge=1)


class DrumPadSampleNormalizeModel(BaseModel):
    target_peak: float = Field(0.99, gt=0.0, le=1.0)


class DrumPadSampleFadeModel(BaseModel):
    fade_in_ms: float = Field(0.0, ge=0.0, le=60000.0)
    fade_out_ms: float = Field(0.0, ge=0.0, le=60000.0)


class DrumBusMixerUpdateModel(BaseModel):
    eq: DrumEqModel | None = None
    comp: DrumCompModel | None = None
    level: float | None = Field(default=None, ge=0.0, le=100.0)
    pan: float | None = Field(default=None, ge=-100.0, le=100.0)
    mute: bool | None = None
    solo: bool | None = None
    output_pair: int | None = Field(default=None, ge=0)
    reverb_send: float | None = Field(default=None, ge=0.0, le=100.0)


class DrumMasterVolumeResponseModel(BaseModel):
    volume: int = Field(..., ge=0, le=100)


class DrumMasterVolumeUpdateModel(BaseModel):
    volume: int = Field(..., ge=0, le=100)


class DrumBusReverbSendUpdateModel(BaseModel):
    level: float = Field(..., ge=0.0, le=100.0)


def _get_service() -> DrumMachineService:
    return get_drum_machine_service()


def _get_sequencer_service() -> DrumSequencerService:
    return get_drum_sequencer_service()


def _get_kit_service() -> DrumKitService:
    return get_drum_kit_service()


def _get_sample_editor_service():
    return get_drum_sample_editor_service()


@router.get("/api/engine/drums/state", response_model=DrumMachineStateModel)
def get_drum_machine_state() -> Dict[str, Any]:
    return _get_service().get_state()


@router.post("/api/engine/drums/state", response_model=DrumStateResponse)
async def set_drum_machine_state(state: DrumMachineStateUpdateModel) -> DrumStateResponse:
    updated = _get_service().update_state(state.model_dump(exclude_unset=True))
    await _get_service().publish_state_update()
    return DrumStateResponse(state=DrumMachineStateModel.model_validate(updated))


@router.get("/api/engine/drums/transport", response_model=DrumTransportStateModel)
def get_drum_transport() -> Dict[str, Any]:
    return _get_service().get_transport()


@router.get("/api/engine/drums/backing-tracks", response_model=List[DrumBackingTrackSummaryModel])
def get_drum_backing_tracks() -> List[Dict[str, Any]]:
    return _get_service().list_backing_tracks()


@router.get("/api/engine/drums/backing-tracks/transport", response_model=DrumBackingTrackTransportStateModel)
def get_drum_backing_track_transport() -> Dict[str, Any]:
    try:
        return _get_service().get_backing_track_transport()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/api/engine/drums/pad/{pad}/source", response_model=DrumPadSoundSourceModel)
def get_drum_pad_sound_source(pad: int = Path(..., ge=0, le=15)) -> Dict[str, Any]:
    try:
        return _get_service().get_pad_sound_source(pad)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/engine/drums/pad/{pad}/source", response_model=DrumPadSoundSourceModel)
def set_drum_pad_sound_source(
    payload: DrumPadSoundSourceUpdateModel,
    pad: int = Path(..., ge=0, le=15),
) -> Dict[str, Any]:
    try:
        return _get_service().set_pad_sound_source(pad, payload.source)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/api/engine/drums/pad/{pad}/synth", response_model=DrumPadSynthParamsResponseModel)
def get_drum_pad_synth_params(pad: int = Path(..., ge=0, le=15)) -> Dict[str, Any]:
    try:
        return _get_service().get_pad_synth_params(pad)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/engine/drums/pad/{pad}/synth", response_model=DrumPadSynthParamsResponseModel)
def set_drum_pad_synth_params(
    payload: DrumSynthParamModel,
    pad: int = Path(..., ge=0, le=15),
) -> Dict[str, Any]:
    try:
        return _get_service().set_pad_synth_params(pad, payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/api/engine/drums/pad/{pad}/filter", response_model=DrumPadFilterResponseModel)
def get_drum_pad_filter(pad: int = Path(..., ge=0, le=15)) -> Dict[str, Any]:
    try:
        return _get_service().get_pad_filter(pad)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/engine/drums/pad/{pad}/filter", response_model=DrumPadFilterResponseModel)
def set_drum_pad_filter(
    payload: DrumPadFilterModel,
    pad: int = Path(..., ge=0, le=15),
) -> Dict[str, Any]:
    try:
        return _get_service().set_pad_filter(pad, payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/api/engine/drums/pad/{pad}/cv-gate", response_model=DrumPadCvGateResponseModel)
def get_drum_pad_cv_gate_config(pad: int = Path(..., ge=0, le=15)) -> Dict[str, Any]:
    try:
        return _get_service().get_pad_cv_gate_config(pad)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/engine/drums/pad/{pad}/cv-gate", response_model=DrumPadCvGateResponseModel)
def set_drum_pad_cv_gate_config(
    payload: DrumCvGateConfigModel,
    pad: int = Path(..., ge=0, le=15),
) -> Dict[str, Any]:
    try:
        return _get_service().set_pad_cv_gate_config(pad, payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/api/engine/drums/pad/{pad}/sample/waveform", response_model=DrumPadSampleWaveformModel)
def get_drum_pad_sample_waveform(
    pad: int = Path(..., ge=0, le=15),
    points: int = 256,
) -> Dict[str, Any]:
    try:
        return _get_sample_editor_service().get_waveform(pad, points=points)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/api/engine/drums/pad/{pad}/sample/file")
def get_drum_pad_sample_file(pad: int = Path(..., ge=0, le=15)) -> Response:
    try:
        filename, payload = _get_sample_editor_service().export_sample(pad)
        return Response(
            content=payload,
            media_type="audio/wav",
            headers={"Content-Disposition": f'inline; filename="{filename}"'},
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/engine/drums/pad/{pad}/sample/upload", response_model=DrumPadSampleWaveformModel)
async def upload_drum_pad_sample(
    pad: int = Path(..., ge=0, le=15),
    file: UploadFile = File(...),
) -> Dict[str, Any]:
    try:
        return _get_sample_editor_service().upload_sample(pad, file.filename or "sample.wav", await file.read())
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/engine/drums/pad/{pad}/record/start", response_model=DrumPadRecordingStateModel)
def start_drum_pad_recording(pad: int = Path(..., ge=0, le=15)) -> Dict[str, Any]:
    try:
        return _get_sample_editor_service().start_recording(pad)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/engine/drums/pad/{pad}/record/stop", response_model=DrumPadSampleWaveformModel)
def stop_drum_pad_recording(pad: int = Path(..., ge=0, le=15)) -> Dict[str, Any]:
    try:
        return _get_sample_editor_service().stop_recording(pad)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/engine/drums/pad/{pad}/sample/trim", response_model=DrumPadSampleWaveformModel)
def trim_drum_pad_sample(
    payload: DrumPadSampleTrimModel,
    pad: int = Path(..., ge=0, le=15),
) -> Dict[str, Any]:
    try:
        return _get_sample_editor_service().trim_sample(pad, payload.start_sample, payload.end_sample)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/engine/drums/pad/{pad}/sample/normalize", response_model=DrumPadSampleWaveformModel)
def normalize_drum_pad_sample(
    payload: DrumPadSampleNormalizeModel,
    pad: int = Path(..., ge=0, le=15),
) -> Dict[str, Any]:
    try:
        return _get_sample_editor_service().normalize_sample(pad, payload.target_peak)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/engine/drums/pad/{pad}/sample/reverse", response_model=DrumPadSampleWaveformModel)
def reverse_drum_pad_sample(pad: int = Path(..., ge=0, le=15)) -> Dict[str, Any]:
    try:
        return _get_sample_editor_service().reverse_sample(pad)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/engine/drums/pad/{pad}/sample/fade", response_model=DrumPadSampleWaveformModel)
def fade_drum_pad_sample(
    payload: DrumPadSampleFadeModel,
    pad: int = Path(..., ge=0, le=15),
) -> Dict[str, Any]:
    try:
        return _get_sample_editor_service().fade_sample(pad, payload.fade_in_ms, payload.fade_out_ms)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/engine/drums/transport", response_model=DrumTransportStateModel)
async def set_drum_transport(update: DrumTransportUpdateModel) -> Dict[str, Any]:
    updated = _get_service().update_transport(update.model_dump(exclude_unset=True))
    await _get_service().publish_transport_update()
    await _get_service().publish_position_update()
    return updated


@router.post("/api/engine/drums/backing-tracks/transport", response_model=DrumBackingTrackTransportStateModel)
def set_drum_backing_track_transport(update: DrumBackingTrackTransportUpdateModel) -> Dict[str, Any]:
    try:
        return _get_service().update_backing_track_transport(update.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/api/engine/drums/position", response_model=DrumSequencerPositionModel)
def get_drum_position() -> Dict[str, Any]:
    return _get_service().get_position()


@router.post("/api/engine/drums/fill/trigger")
def trigger_drum_fill() -> Dict[str, Any]:
    return _get_service().trigger_fill()


@router.post("/api/engine/drums/pattern/copy", response_model=DrumPatternModel)
def copy_drum_pattern(copy: DrumPatternCopyModel) -> Dict[str, Any]:
    service = _get_sequencer_service()
    try:
        source = DrumPatternModel.model_validate(service.get_pattern(copy.source_pattern_id))
        payload = source.model_dump(exclude={"pattern_id"})
        return service.save_pattern(copy.destination_pattern_id, payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/api/engine/drums/pattern/{pattern_id}", response_model=DrumPatternModel)
def get_drum_pattern(pattern_id: int) -> Dict[str, Any]:
    try:
        return _get_sequencer_service().get_pattern(pattern_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/engine/drums/pattern/{pattern_id}", response_model=DrumPatternModel)
def set_drum_pattern(pattern_id: int, pattern: DrumPatternModel) -> Dict[str, Any]:
    try:
        return _get_sequencer_service().save_pattern(
            pattern_id,
            pattern.model_dump(exclude={"pattern_id"}),
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/engine/drums/pattern/{pattern_id}/step", response_model=DrumPatternModel)
def set_drum_pattern_step(pattern_id: int, update: DrumPatternStepUpdateModel) -> Dict[str, Any]:
    try:
        return _get_sequencer_service().set_step(
            pattern_id,
            update.instrument,
            update.step,
            update.velocity,
            update.accent,
            update.micro_timing,
            update.probability,
            update.ratchet_count,
            update.ratchet_decay,
            update.lock_pitch,
            update.lock_filter_cutoff,
            update.lock_decay,
            update.lock_pan,
            update.lock_volume,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/engine/drums/pattern/{pattern_id}/clear", response_model=DrumPatternModel)
def clear_drum_pattern(pattern_id: int) -> Dict[str, Any]:
    service = _get_sequencer_service()
    try:
        pattern = DrumPatternModel.model_validate(service.get_pattern(pattern_id))
        pattern.length = 16
        pattern.track_lengths = [0] * 16
        pattern.steps = [[DrumSequencerStepModel() for _ in range(64)] for _ in range(16)]
        return service.save_pattern(pattern_id, pattern.model_dump(exclude={"pattern_id"}))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/engine/drums/pattern/{pattern_id}/track/{instrument}/length", response_model=DrumPatternModel)
def set_drum_track_length(
    pattern_id: int,
    update: DrumTrackLengthUpdateModel,
    instrument: int = Path(..., ge=0, le=15),
) -> Dict[str, Any]:
    try:
        return _get_sequencer_service().set_track_length(pattern_id, instrument, update.length)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/api/engine/drums/track/{instrument}/swing")
def get_drum_track_swing(instrument: int = Path(..., ge=0, le=15)) -> Dict[str, Any]:
    transport = _get_service().get_transport()
    return {
        "instrument": instrument,
        "swing": int(transport["track_swing"][instrument]),
        "track_swing": transport["track_swing"],
    }


@router.post("/api/engine/drums/track/{instrument}/swing")
def set_drum_track_swing(
    update: DrumTrackSwingUpdateModel,
    instrument: int = Path(..., ge=0, le=15),
) -> Dict[str, Any]:
    try:
        return _get_service().set_track_swing(instrument, update.swing)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/api/engine/drums/song", response_model=DrumSongUpdateResponse)
def get_drum_song() -> DrumSongUpdateResponse:
    service = _get_sequencer_service()
    return DrumSongUpdateResponse(
        song=[DrumSongEntryModel.model_validate(entry) for entry in service.get_song()],
        song_loop=service.get_song_loop(),
    )


@router.post("/api/engine/drums/song", response_model=DrumSongUpdateResponse)
def set_drum_song(update: DrumSongUpdateModel) -> DrumSongUpdateResponse:
    service = _get_sequencer_service()
    try:
        service.replace_song(update.song, update.song_loop)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return DrumSongUpdateResponse(song=update.song, song_loop=update.song_loop)


@router.post("/api/engine/drums/song/entries", response_model=DrumSongUpdateResponse)
def add_drum_song_entry(entry: DrumSongEntryModel) -> DrumSongUpdateResponse:
    service = _get_sequencer_service()
    try:
        next_song = [DrumSongEntryModel.model_validate(item) for item in service.get_song()]
        next_song.append(entry)
        service.replace_song(next_song, service.get_song_loop())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return DrumSongUpdateResponse(song=next_song, song_loop=service.get_song_loop())


@router.delete("/api/engine/drums/song/entries/{position}", response_model=DrumSongUpdateResponse)
def remove_drum_song_entry(position: int = Path(..., ge=0)) -> DrumSongUpdateResponse:
    service = _get_sequencer_service()
    song = [DrumSongEntryModel.model_validate(item) for item in service.get_song()]
    if position >= len(song):
        raise HTTPException(status_code=404, detail="Song entry not found")
    try:
        next_song = [entry for index, entry in enumerate(song) if index != position]
        service.replace_song(next_song, service.get_song_loop())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return DrumSongUpdateResponse(song=next_song, song_loop=service.get_song_loop())


@router.get("/api/engine/drums/song/transport", response_model=DrumSongTransportStateModel)
def get_drum_song_transport() -> Dict[str, Any]:
    return _get_service().get_song_transport()


@router.post("/api/engine/drums/song/transport/play", response_model=DrumSongTransportStateModel)
async def play_drum_song_transport() -> Dict[str, Any]:
    service = _get_service()
    state = service.start_song_playback()
    await service.publish_transport_update()
    await service.publish_position_update()
    return state


@router.post("/api/engine/drums/song/transport/stop", response_model=DrumSongTransportStateModel)
async def stop_drum_song_transport() -> Dict[str, Any]:
    service = _get_service()
    state = service.stop_song_playback()
    await service.publish_transport_update()
    await service.publish_position_update()
    return state


@router.get("/api/engine/drums/metering", response_model=DrumMeteringModel)
def get_drum_metering() -> Dict[str, Any]:
    return _get_service().get_metering()


@router.get("/api/engine/drums/mixer/pads", response_model=List[DrumPadControlModel])
def get_drum_pad_controls() -> List[Dict[str, Any]]:
    return _get_service().get_pad_controls()


@router.patch("/api/engine/drums/mixer/pads/{pad}", response_model=DrumPadControlModel)
def set_drum_pad_control(
    payload: DrumPadControlUpdateModel,
    pad: int = Path(..., ge=0, le=15),
) -> Dict[str, Any]:
    try:
        return _get_service().set_pad_control(pad, payload.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/api/engine/drums/mixer/buses", response_model=List[DrumBusMixerModel])
def get_drum_bus_mixers() -> List[Dict[str, Any]]:
    return _get_service().get_bus_mixers()


@router.patch("/api/engine/drums/mixer/buses/{bus}", response_model=DrumBusMixerModel)
def set_drum_bus_mixer(
    payload: DrumBusMixerUpdateModel,
    bus: int = Path(..., ge=0, le=7),
) -> Dict[str, Any]:
    try:
        return _get_service().set_bus_mixer(bus, payload.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/api/engine/drums/mixer/master", response_model=DrumMasterVolumeResponseModel)
def get_drum_master_volume() -> Dict[str, Any]:
    return _get_service().get_master_volume()


@router.post("/api/engine/drums/mixer/master", response_model=DrumMasterVolumeResponseModel)
def set_drum_master_volume(payload: DrumMasterVolumeUpdateModel) -> Dict[str, Any]:
    return _get_service().set_master_volume(payload.volume)


@router.get("/api/engine/drums/master-fx", response_model=DrumMasterFxModel)
def get_drum_master_fx() -> Dict[str, Any]:
    return _get_service().get_master_fx()


@router.post("/api/engine/drums/master-fx", response_model=DrumMasterFxModel)
def set_drum_master_fx(payload: DrumMasterFxModel) -> Dict[str, Any]:
    return _get_service().set_master_fx(payload.model_dump())


@router.post("/api/engine/drums/bus/{bus}/reverb-send", response_model=DrumBusMixerModel)
def set_drum_bus_reverb_send(
    payload: DrumBusReverbSendUpdateModel,
    bus: int = Path(..., ge=0, le=7),
) -> Dict[str, Any]:
    try:
        return _get_service().set_bus_reverb_send(bus, payload.level)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/api/engine/drums/midi/mapping", response_model=DrumMidiMappingModel)
def get_drum_midi_mapping() -> Dict[str, Any]:
    return _get_service().get_midi_mapping()


@router.post("/api/engine/drums/midi/mapping", response_model=DrumMidiMappingModel)
def set_drum_midi_mapping(payload: DrumMidiMappingModel) -> Dict[str, Any]:
    return _get_service().update_midi_mapping(payload.model_dump())


@router.get("/api/engine/drums/midi/velocity-curves", response_model=DrumMidiVelocityCurvesModel)
def get_drum_midi_velocity_curves() -> Dict[str, Any]:
    return _get_service().get_velocity_curves()


@router.post("/api/engine/drums/midi/velocity-curves", response_model=DrumMidiVelocityCurvesModel)
def set_drum_midi_velocity_curves(payload: DrumMidiVelocityCurvesModel) -> Dict[str, Any]:
    return _get_service().update_velocity_curves(payload.model_dump())


@router.get("/api/engine/drums/midi/zones", response_model=DrumMidiZonesModel)
def get_drum_midi_zones() -> Dict[str, Any]:
    return _get_service().get_midi_zones()


@router.post("/api/engine/drums/midi/zones", response_model=DrumMidiZonesModel)
def set_drum_midi_zones(payload: DrumMidiZonesModel) -> Dict[str, Any]:
    return _get_service().update_midi_zones(payload.model_dump())


@router.get("/api/engine/drums/midi/output", response_model=DrumMidiOutputConfigModel)
def get_drum_midi_output_config() -> Dict[str, Any]:
    return _get_service().get_midi_output_config()


@router.post("/api/engine/drums/midi/output", response_model=DrumMidiOutputConfigModel)
def set_drum_midi_output_config(payload: DrumMidiOutputConfigModel) -> Dict[str, Any]:
    return _get_service().update_midi_output_config(payload.model_dump())


@router.get("/api/engine/drums/midi/cc-mappings", response_model=DrumCcMappingModel)
def get_drum_cc_mappings() -> Dict[str, Any]:
    return _get_service().get_cc_mappings()


@router.post("/api/engine/drums/midi/cc-mappings", response_model=DrumCcMappingModel)
def set_drum_cc_mappings(payload: DrumCcMappingModel) -> Dict[str, Any]:
    return _get_service().update_cc_mappings(payload.model_dump())


@router.post("/api/engine/drums/midi/cc-learn/start", response_model=DrumCcLearnStateModel)
def start_drum_cc_learn(payload: DrumCcLearnStartRequest) -> Dict[str, Any]:
    try:
        return _get_service().start_cc_learn(payload.slot, payload.timeout_seconds)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/engine/drums/midi/cc-learn/stop", response_model=DrumCcLearnStateModel)
def stop_drum_cc_learn() -> Dict[str, Any]:
    return _get_service().stop_cc_learn()


@router.get("/api/engine/drums/midi/cc-learn/status", response_model=DrumCcLearnStateModel)
def get_drum_cc_learn_status() -> Dict[str, Any]:
    return _get_service().get_cc_learn_state()


@router.post("/api/engine/drums/midi/learn/start", response_model=DrumMidiLearnStateModel)
def start_drum_midi_learn(payload: DrumMidiLearnStartRequest) -> Dict[str, Any]:
    try:
        return _get_service().start_midi_learn(payload.pad, payload.learn_all, payload.timeout_seconds)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/engine/drums/midi/learn/stop", response_model=DrumMidiLearnStateModel)
def stop_drum_midi_learn() -> Dict[str, Any]:
    return _get_service().stop_midi_learn()


@router.get("/api/engine/drums/midi/learn/status", response_model=DrumMidiLearnStateModel)
def get_drum_midi_learn_status() -> Dict[str, Any]:
    return _get_service().get_midi_learn_state()


@router.get("/api/engine/drums/midi/presets", response_model=DrumMidiPresetListModel)
def get_drum_midi_presets() -> Dict[str, Any]:
    return _get_service().get_midi_presets()


@router.post("/api/engine/drums/midi/presets/load")
def load_drum_midi_preset(payload: DrumMidiPresetLoadRequest) -> Dict[str, Any]:
    try:
        return _get_service().load_midi_preset(payload.preset_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/api/engine/drums/kits", response_model=List[DrumKitSummaryModel])
def list_drum_kits() -> List[Dict[str, Any]]:
    return _get_kit_service().list_kits()


@router.get("/api/engine/drums/kits/active")
def get_active_drum_kit() -> Dict[str, Any] | None:
    return _get_kit_service().get_active_kit()


@router.get("/api/engine/drums/kits/{kit_id}", response_model=DrumKitModel)
def get_drum_kit(kit_id: str) -> Dict[str, Any]:
    try:
        return _get_kit_service().get_kit(kit_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Kit not found")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/engine/drums/kits/load", response_model=DrumKitLoadResponse)
def load_drum_kit(request: DrumKitLoadRequest) -> Dict[str, Any]:
    try:
        return _get_kit_service().load_kit(request.kit_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Kit not found")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/engine/drums/kits/create", response_model=DrumKitMutationResponse)
def create_drum_kit(request: DrumKitCreateRequest) -> Dict[str, Any]:
    try:
        created = _get_kit_service().create_user_kit(
            request.template_kit_id,
            request.new_kit_id,
            name=request.name,
            description=request.description,
            author=request.author,
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Template kit not found")
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"status": "ok", "kit": created, "source": created["source"], "root_path": created["root_path"]}


@router.post("/api/engine/drums/kits/import", response_model=DrumKitMutationResponse)
async def import_drum_kit(file: UploadFile = File(...)) -> Dict[str, Any]:
    try:
        imported = _get_kit_service().import_user_kit_archive(await file.read(), filename=file.filename or "kit.zip")
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"status": "ok", "kit": imported, "source": imported["source"], "root_path": imported["root_path"]}


@router.patch("/api/engine/drums/kits/{kit_id}/instruments/{pad}", response_model=DrumKitModel)
def patch_drum_kit_instrument(kit_id: str, pad: int, patch: DrumKitInstrumentPatchModel) -> Dict[str, Any]:
    try:
        return _get_kit_service().update_kit_instrument(kit_id, pad, patch.model_dump(exclude_unset=True))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Kit not found")
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except IndexError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/api/engine/drums/packs/factory")
def get_factory_packs() -> List[Dict[str, Any]]:
    return _get_service().list_factory_packs()


@router.get("/api/engine/drums/packs/generated")
def get_generated_packs() -> List[Dict[str, Any]]:
    return _get_service().list_generated_packs()


@router.get("/api/engine/drums/packs/factory/{pack_id}")
def get_factory_pack_details(pack_id: str) -> Dict[str, Any]:
    try:
        return _get_service().get_factory_pack_details(pack_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Pack not found")


@router.get("/api/engine/drums/packs/generated/{pack_id}")
def get_generated_pack_details(pack_id: str) -> Dict[str, Any]:
    try:
        return _get_service().get_generated_pack_details(pack_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Pack not found")


@router.post("/api/engine/drums/packs/upload", response_model=DrumPackUploadResponse)
async def upload_user_pack(file: UploadFile = File(...)) -> DrumPackUploadResponse:
    try:
        content = await file.read()
        pack = json.loads(content)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {exc.msg}")

    if not isinstance(pack, dict):
        raise HTTPException(status_code=400, detail="Pack payload must be a JSON object")

    try:
        saved = _get_service().save_generated_pack(pack)
    except Exception as exc:  # pragma: no cover - defensive route boundary
        raise HTTPException(status_code=400, detail=str(exc))

    return DrumPackUploadResponse(**saved)
