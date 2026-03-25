"""
Drum sample import, recording, editing, and waveform analysis service.
"""

from __future__ import annotations

import io
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Literal, Optional

import numpy as np
import soundfile as sf
from pydantic import BaseModel, Field

from app.services.drum_kit_service import get_drum_kit_service
from app.services.juce_engine_service import get_audio_engine
from app.utils.singleton import Singleton


class DrumPadRecordingStateModel(BaseModel):
    pad: int = Field(..., ge=0, le=15)
    active: bool
    max_duration_seconds: float = Field(30.0, gt=0.0)


class DrumPadSampleInfoModel(BaseModel):
    pad: int = Field(..., ge=0, le=15)
    kit_id: str
    kit_source: Literal["factory", "user"]
    root_path: str
    sfz_path: str
    sample_path: str
    sample_rate: int = Field(..., ge=1)
    channel_count: int = Field(..., ge=1)
    sample_count: int = Field(..., ge=0)
    duration_seconds: float = Field(..., ge=0.0)


class DrumPadSampleWaveformModel(DrumPadSampleInfoModel):
    peaks: list[float] = Field(default_factory=list)
    points: int = Field(..., ge=16, le=4096)


class DrumSampleEditorService(Singleton):
    _MAX_RECORDING_SECONDS = 30.0

    def __init__(self) -> None:
        super().__init__()
        self._recording_pad: Optional[int] = None

    def get_recording_state(self, pad: int) -> Dict[str, Any]:
        self._validate_pad(pad)
        return DrumPadRecordingStateModel(
            pad=pad,
            active=self._recording_pad == pad,
            max_duration_seconds=self._MAX_RECORDING_SECONDS,
        ).model_dump()

    def start_recording(self, pad: int) -> Dict[str, Any]:
        self._validate_pad(pad)
        self._ensure_editable_active_kit()
        engine = self._engine()
        if engine is None:
            raise RuntimeError("Audio engine is unavailable")
        starter = getattr(engine, "start_drum_pad_recording", None)
        if not callable(starter):
            raise RuntimeError("Audio engine does not expose start_drum_pad_recording")
        if not starter(pad):
            raise RuntimeError("Audio engine rejected drum pad recording start")
        self._recording_pad = pad
        return self.get_recording_state(pad)

    def stop_recording(self, pad: int) -> Dict[str, Any]:
        self._validate_pad(pad)
        if self._recording_pad is not None and self._recording_pad != pad:
            raise RuntimeError(f"Pad {self._recording_pad} is currently recording")

        engine = self._engine()
        if engine is None:
            raise RuntimeError("Audio engine is unavailable")
        stopper = getattr(engine, "stop_drum_pad_recording", None)
        if not callable(stopper):
            raise RuntimeError("Audio engine does not expose stop_drum_pad_recording")

        payload = dict(stopper())
        self._recording_pad = None
        samples = np.asarray(payload.get("samples", []), dtype=np.float32)
        sample_rate = max(1, int(payload.get("sample_rate", 48000)))
        if samples.size == 0:
            raise RuntimeError("No recorded input was captured")

        return self._write_pad_asset(
            pad,
            samples,
            sample_rate,
            operation="recorded",
        )

    def upload_sample(self, pad: int, filename: str, file_bytes: bytes) -> Dict[str, Any]:
        self._validate_pad(pad)
        if not file_bytes:
            raise ValueError("Sample upload is empty")
        data, sample_rate = sf.read(io.BytesIO(file_bytes), dtype="float32", always_2d=False)
        return self._write_pad_asset(
            pad,
            self._normalize_audio_shape(np.asarray(data, dtype=np.float32)),
            int(sample_rate),
            operation="uploaded",
            original_name=filename,
        )

    def get_waveform(self, pad: int, points: int = 256) -> Dict[str, Any]:
        self._validate_pad(pad)
        points = max(16, min(4096, int(points)))
        asset = self._resolve_pad_asset(pad)
        audio, sample_rate = self._read_audio(asset["sample_file"])
        mono = self._to_mono(audio)
        sample_count = int(mono.shape[0])
        peaks = self._compute_waveform_peaks(mono, points)
        return DrumPadSampleWaveformModel(
            pad=pad,
            kit_id=asset["kit"]["kit_id"],
            kit_source=asset["kit"]["source"],
            root_path=str(asset["kit_root"]),
            sfz_path=asset["instrument"]["sfz_path"],
            sample_path=asset["sample_relative_path"],
            sample_rate=int(sample_rate),
            channel_count=self._channel_count(audio),
            sample_count=sample_count,
            duration_seconds=(sample_count / float(sample_rate)) if sample_count > 0 else 0.0,
            peaks=peaks,
            points=points,
        ).model_dump()

    def export_sample(self, pad: int) -> tuple[str, bytes]:
        asset = self._resolve_pad_asset(pad)
        sample_file = asset["sample_file"]
        return sample_file.name, sample_file.read_bytes()

    def trim_sample(self, pad: int, start_sample: int, end_sample: int) -> Dict[str, Any]:
        asset = self._resolve_pad_asset(pad)
        audio, sample_rate = self._read_audio(asset["sample_file"])
        total_samples = int(audio.shape[0])
        start = max(0, min(int(start_sample), total_samples))
        end = max(start + 1, min(int(end_sample), total_samples))
        return self._write_pad_asset(
            pad,
            audio[start:end],
            sample_rate,
            operation="trim",
        )

    def normalize_sample(self, pad: int, target_peak: float = 0.99) -> Dict[str, Any]:
        asset = self._resolve_pad_asset(pad)
        audio, sample_rate = self._read_audio(asset["sample_file"])
        normalized_target = float(np.clip(target_peak, 0.01, 1.0))
        peak = float(np.max(np.abs(audio))) if audio.size else 0.0
        processed = audio if peak <= 1.0e-8 else np.clip(audio * (normalized_target / peak), -1.0, 1.0)
        return self._write_pad_asset(
            pad,
            processed,
            sample_rate,
            operation="normalize",
        )

    def reverse_sample(self, pad: int) -> Dict[str, Any]:
        asset = self._resolve_pad_asset(pad)
        audio, sample_rate = self._read_audio(asset["sample_file"])
        return self._write_pad_asset(
            pad,
            audio[::-1].copy(),
            sample_rate,
            operation="reverse",
        )

    def fade_sample(self, pad: int, fade_in_ms: float, fade_out_ms: float) -> Dict[str, Any]:
        asset = self._resolve_pad_asset(pad)
        audio, sample_rate = self._read_audio(asset["sample_file"])
        processed = np.array(audio, copy=True)
        frame_count = int(processed.shape[0])
        fade_in_frames = min(frame_count, max(0, int((float(fade_in_ms) / 1000.0) * sample_rate)))
        fade_out_frames = min(frame_count, max(0, int((float(fade_out_ms) / 1000.0) * sample_rate)))
        if fade_in_frames > 0:
            fade = np.linspace(0.0, 1.0, fade_in_frames, endpoint=True, dtype=np.float32)
            processed[:fade_in_frames] *= fade[:, None] if processed.ndim == 2 else fade
        if fade_out_frames > 0:
            fade = np.linspace(1.0, 0.0, fade_out_frames, endpoint=True, dtype=np.float32)
            processed[-fade_out_frames:] *= fade[:, None] if processed.ndim == 2 else fade
        return self._write_pad_asset(
            pad,
            processed,
            sample_rate,
            operation="fade",
        )

    def _resolve_pad_asset(self, pad: int) -> Dict[str, Any]:
        self._validate_pad(pad)
        active_kit = get_drum_kit_service().get_active_kit()
        if not active_kit:
            raise RuntimeError("No active drum kit is loaded")
        kit = get_drum_kit_service().get_kit(active_kit["kit_id"])
        kit_root = Path(kit["root_path"])
        instrument = dict(kit["instruments"][pad])
        sfz_file = kit_root / instrument["sfz_path"]
        sample_relative_path = self._extract_primary_sample_path(sfz_file)
        sample_file = (sfz_file.parent / sample_relative_path).resolve()
        return {
            "kit": kit,
            "kit_root": kit_root,
            "instrument": instrument,
            "sfz_file": sfz_file,
            "sample_relative_path": sample_relative_path,
            "sample_file": sample_file,
        }

    def _write_pad_asset(
        self,
        pad: int,
        audio: np.ndarray,
        sample_rate: int,
        *,
        operation: str,
        original_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        active_kit = self._ensure_editable_active_kit()
        kit_root = Path(active_kit["root_path"])
        normalized_audio = self._normalize_audio_shape(np.asarray(audio, dtype=np.float32))
        if normalized_audio.shape[0] <= 0:
            raise ValueError("Sample contains no audio frames")

        sample_dir = kit_root / "samples" / f"pad_{pad + 1}"
        sample_dir.mkdir(parents=True, exist_ok=True)
        stem = self._asset_stem(pad, operation, original_name)
        sample_relative_path = Path("samples") / f"pad_{pad + 1}" / f"{stem}.wav"
        sample_path = kit_root / sample_relative_path
        sf.write(str(sample_path), normalized_audio, int(sample_rate), subtype="PCM_16")

        sfz_relative_path = Path(f"pad_{pad + 1}_sample.sfz")
        sfz_path = kit_root / sfz_relative_path
        sfz_path.write_text(f"<region>\nsample={sample_relative_path.as_posix()}\n")

        get_drum_kit_service().update_kit_instrument(active_kit["kit_id"], pad, {"sfz_path": sfz_relative_path.as_posix()})
        return self.get_waveform(pad)

    def _ensure_editable_active_kit(self) -> Dict[str, Any]:
        kit_service = get_drum_kit_service()
        active_kit = kit_service.get_active_kit()
        if not active_kit:
            raise RuntimeError("No active drum kit is loaded")
        if active_kit["source"] == "user":
            return active_kit

        editable_kit_id = f"{active_kit['kit_id']}_editable"
        try:
            kit_service.get_kit(editable_kit_id)
        except FileNotFoundError:
            name = f"{active_kit['name']} Editable"
            description = active_kit.get("description") or f"Editable copy of {active_kit['name']}"
            author = active_kit.get("author") or "MAP2"
            kit_service.create_user_kit(
                active_kit["kit_id"],
                editable_kit_id,
                name=name,
                description=description,
                author=author,
            )
        kit_service.load_kit(editable_kit_id)
        active_user_kit = kit_service.get_active_kit()
        if not active_user_kit:
            raise RuntimeError("Failed to activate editable drum kit")
        return active_user_kit

    def _extract_primary_sample_path(self, sfz_file: Path) -> str:
        for line in sfz_file.read_text().splitlines():
            stripped = line.strip()
            if stripped.startswith("sample="):
                sample_relative_path = stripped.split("=", 1)[1].strip()
                if sample_relative_path:
                    return sample_relative_path
        raise RuntimeError(f"No sample= entry found in {sfz_file}")

    def _read_audio(self, sample_file: Path) -> tuple[np.ndarray, int]:
        audio, sample_rate = sf.read(str(sample_file), dtype="float32", always_2d=False)
        return self._normalize_audio_shape(np.asarray(audio, dtype=np.float32)), int(sample_rate)

    def _compute_waveform_peaks(self, mono_audio: np.ndarray, points: int) -> list[float]:
        if mono_audio.size == 0:
            return [0.0] * points
        peaks: list[float] = []
        edges = np.linspace(0, mono_audio.shape[0], num=points + 1, dtype=int)
        for index in range(points):
            start = int(edges[index])
            end = int(edges[index + 1])
            if end <= start:
                end = min(mono_audio.shape[0], start + 1)
            window = mono_audio[start:end]
            peaks.append(float(np.max(np.abs(window))) if window.size else 0.0)
        return peaks

    def _normalize_audio_shape(self, audio: np.ndarray) -> np.ndarray:
        if audio.ndim == 0:
            return audio.reshape(1)
        if audio.ndim > 2:
            audio = audio.reshape(audio.shape[0], -1)
        if audio.ndim == 2 and audio.shape[1] > 2:
            audio = audio[:, :2]
        return np.asarray(audio, dtype=np.float32)

    def _to_mono(self, audio: np.ndarray) -> np.ndarray:
        if audio.ndim == 1:
            return audio
        return np.mean(audio, axis=1, dtype=np.float32)

    def _channel_count(self, audio: np.ndarray) -> int:
        return 1 if audio.ndim == 1 else int(audio.shape[1])

    def _asset_stem(self, pad: int, operation: str, original_name: Optional[str]) -> str:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        name = Path(original_name).stem if original_name else operation
        safe_name = "".join(ch.lower() if ch.isalnum() else "_" for ch in name).strip("_") or operation
        return f"pad_{pad + 1}_{operation}_{safe_name}_{timestamp}"

    def _validate_pad(self, pad: int) -> None:
        if pad < 0 or pad >= 16:
            raise ValueError("pad must be between 0 and 15")

    def _engine(self) -> Any:
        try:
            return get_audio_engine().engine
        except Exception:
            return None


def get_drum_sample_editor_service() -> DrumSampleEditorService:
    return DrumSampleEditorService.get_instance()
