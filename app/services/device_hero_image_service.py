"""Device hero-image override service — backend half of T2426-C.

Stores operator-uploaded replacements for the packaged SVG hero images shown on
the Devices store page. Storage model mirrors the audio-artifact convention:

- PNG-only on the wire; server-side center-crop + downscale to 1024×1024.
- Shared globally per MAP2 install (single-user rig). Overrides live under
  ``~/.map2/device-hero-overrides/<device_id>.png`` with a sibling
  ``<device_id>.json`` manifest capturing original size/mime/timestamp.
- Service is a thin I/O + validation layer; the route group wraps it with
  FastAPI. Upload/GET/DELETE round-trips verified by pytest.

Kept deliberately small — no PlatformEvent emission, no Raft sync. Pin state
and hero-image overrides are UI-plane preferences per locked Q23.
"""

from __future__ import annotations

import io
import json
import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional

try:
    from PIL import Image, UnidentifiedImageError
    _PILLOW_AVAILABLE = True
except ImportError:  # pragma: no cover - pillow missing is a deploy-time config error
    Image = None  # type: ignore[assignment]
    UnidentifiedImageError = Exception  # type: ignore[assignment,misc]
    _PILLOW_AVAILABLE = False

logger = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 2 * 1024 * 1024  # 2 MB — Q18
TARGET_EDGE_PX = 1024  # Q19/Q20 — auto-crop + downscale to 1024×1024
ACCEPTED_CONTENT_TYPES = frozenset({"image/png"})
ACCEPTED_EXTENSIONS = frozenset({".png"})
MANIFEST_SUFFIX = ".json"
IMAGE_SUFFIX = ".png"


class DeviceHeroImageError(Exception):
    """Typed failure envelope for the service — routes translate to HTTPException."""

    def __init__(self, code: str, message: str, *, status: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


@dataclass(frozen=True)
class DeviceHeroImageRecord:
    device_id: str
    image_path: Path
    manifest_path: Path
    uploaded_at: float
    original_size_bytes: int
    original_mime: str

    def to_dict(self) -> dict:
        return {
            "device_id": self.device_id,
            "uploaded_at": self.uploaded_at,
            "original_size_bytes": self.original_size_bytes,
            "original_mime": self.original_mime,
        }


def _default_storage_dir() -> Path:
    return Path.home() / ".map2" / "device-hero-overrides"


def _validate_device_id(device_id: str) -> str:
    if not device_id or not device_id.strip():
        raise DeviceHeroImageError("invalid_device_id", "Device id is required.")
    cleaned = device_id.strip().lower()
    # Match the client-side registry shape: lowercase alphanumeric + hyphen only.
    if not all(ch.isalnum() or ch == "-" for ch in cleaned):
        raise DeviceHeroImageError(
            "invalid_device_id",
            f"Device id must be lowercase alphanumeric or hyphen: got {device_id!r}.",
        )
    return cleaned


def _ensure_pillow_available() -> None:
    if not _PILLOW_AVAILABLE:
        raise DeviceHeroImageError(
            "pillow_missing",
            "Pillow is required for device hero-image uploads. Install Pillow and restart map2-backend.service.",
            status=503,
        )


class DeviceHeroImageService:
    """Filesystem-backed store for operator-uploaded device hero images."""

    def __init__(self, storage_dir: Optional[Path] = None) -> None:
        self._storage_dir = Path(storage_dir) if storage_dir else _default_storage_dir()

    @property
    def storage_dir(self) -> Path:
        return self._storage_dir

    # ---- internal helpers ------------------------------------------------

    def _image_path_for(self, device_id: str) -> Path:
        return self._storage_dir / f"{device_id}{IMAGE_SUFFIX}"

    def _manifest_path_for(self, device_id: str) -> Path:
        return self._storage_dir / f"{device_id}{MANIFEST_SUFFIX}"

    def _ensure_dir(self) -> None:
        self._storage_dir.mkdir(parents=True, exist_ok=True)

    def _write_manifest(self, record: DeviceHeroImageRecord) -> None:
        record.manifest_path.write_text(
            json.dumps(record.to_dict(), indent=2, sort_keys=True),
            encoding="utf-8",
        )

    def _read_manifest(self, device_id: str) -> Optional[dict]:
        path = self._manifest_path_for(device_id)
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Corrupt manifest for %s: %s", device_id, exc)
            return None

    # ---- validation ------------------------------------------------------

    @staticmethod
    def _validate_content_type(content_type: Optional[str]) -> None:
        if not content_type or content_type.lower() not in ACCEPTED_CONTENT_TYPES:
            raise DeviceHeroImageError(
                "unsupported_content_type",
                f"Only PNG uploads are accepted. Got content-type={content_type!r}.",
            )

    @staticmethod
    def _validate_filename(filename: Optional[str]) -> None:
        if not filename:
            # Filename isn't strictly required (content-type governs validity),
            # but when present it must be sane.
            return
        lower = filename.lower()
        if "/" in lower or "\\" in lower or ".." in lower:
            raise DeviceHeroImageError("invalid_filename", "Filename contains illegal path separators.")
        if not any(lower.endswith(ext) for ext in ACCEPTED_EXTENSIONS):
            raise DeviceHeroImageError(
                "unsupported_filename",
                f"Filename must end with one of {sorted(ACCEPTED_EXTENSIONS)}.",
            )

    @staticmethod
    def _validate_size(payload_len: int) -> None:
        if payload_len <= 0:
            raise DeviceHeroImageError("empty_payload", "Uploaded payload is empty.")
        if payload_len > MAX_UPLOAD_BYTES:
            raise DeviceHeroImageError(
                "payload_too_large",
                f"Payload exceeds the {MAX_UPLOAD_BYTES}-byte cap (got {payload_len}).",
                status=413,
            )

    # ---- image transform -------------------------------------------------

    @staticmethod
    def _center_crop_to_square(image: "Image.Image") -> "Image.Image":
        width, height = image.size
        if width == height:
            return image
        edge = min(width, height)
        left = (width - edge) // 2
        top = (height - edge) // 2
        return image.crop((left, top, left + edge, top + edge))

    def _process(self, payload: bytes) -> bytes:
        _ensure_pillow_available()
        try:
            with Image.open(io.BytesIO(payload)) as source:
                source.load()
                if source.format != "PNG":
                    raise DeviceHeroImageError(
                        "unsupported_image_format",
                        f"Decoded image format is {source.format!r}; expected PNG.",
                    )
                rgba = source.convert("RGBA")
        except UnidentifiedImageError as exc:
            raise DeviceHeroImageError(
                "corrupt_image",
                "Payload could not be decoded as a PNG image.",
            ) from exc

        cropped = self._center_crop_to_square(rgba)
        if cropped.size != (TARGET_EDGE_PX, TARGET_EDGE_PX):
            cropped = cropped.resize((TARGET_EDGE_PX, TARGET_EDGE_PX), Image.LANCZOS)

        buffer = io.BytesIO()
        cropped.save(buffer, format="PNG", optimize=True)
        return buffer.getvalue()

    # ---- public API ------------------------------------------------------

    def save_upload(
        self,
        device_id: str,
        payload: bytes,
        *,
        content_type: Optional[str] = None,
        original_filename: Optional[str] = None,
    ) -> DeviceHeroImageRecord:
        cleaned = _validate_device_id(device_id)
        self._validate_content_type(content_type)
        self._validate_filename(original_filename)
        self._validate_size(len(payload))

        processed = self._process(payload)

        self._ensure_dir()
        image_path = self._image_path_for(cleaned)
        manifest_path = self._manifest_path_for(cleaned)

        image_path.write_bytes(processed)
        record = DeviceHeroImageRecord(
            device_id=cleaned,
            image_path=image_path,
            manifest_path=manifest_path,
            uploaded_at=time.time(),
            original_size_bytes=len(payload),
            original_mime=(content_type or "image/png").lower(),
        )
        self._write_manifest(record)
        logger.info(
            "Saved device hero override for %s (original_size=%d bytes)",
            cleaned, len(payload),
        )
        return record

    def get_image_path(self, device_id: str) -> Optional[Path]:
        cleaned = _validate_device_id(device_id)
        path = self._image_path_for(cleaned)
        return path if path.exists() else None

    def has_override(self, device_id: str) -> bool:
        return self.get_image_path(device_id) is not None

    def get_record(self, device_id: str) -> Optional[DeviceHeroImageRecord]:
        cleaned = _validate_device_id(device_id)
        image_path = self._image_path_for(cleaned)
        if not image_path.exists():
            return None
        manifest = self._read_manifest(cleaned) or {}
        return DeviceHeroImageRecord(
            device_id=cleaned,
            image_path=image_path,
            manifest_path=self._manifest_path_for(cleaned),
            uploaded_at=float(manifest.get("uploaded_at", 0.0) or 0.0),
            original_size_bytes=int(manifest.get("original_size_bytes", 0) or 0),
            original_mime=str(manifest.get("original_mime", "image/png")),
        )

    def delete_override(self, device_id: str) -> bool:
        cleaned = _validate_device_id(device_id)
        image_path = self._image_path_for(cleaned)
        manifest_path = self._manifest_path_for(cleaned)
        removed = False
        if image_path.exists():
            image_path.unlink()
            removed = True
        if manifest_path.exists():
            manifest_path.unlink()
        return removed

    def list_overrides(self) -> Iterable[DeviceHeroImageRecord]:
        if not self._storage_dir.exists():
            return []
        records: list[DeviceHeroImageRecord] = []
        for image_path in sorted(self._storage_dir.glob(f"*{IMAGE_SUFFIX}")):
            device_id = image_path.stem
            record = self.get_record(device_id)
            if record is not None:
                records.append(record)
        return records


_singleton: Optional[DeviceHeroImageService] = None


def get_device_hero_image_service() -> DeviceHeroImageService:
    global _singleton
    if _singleton is None:
        _singleton = DeviceHeroImageService()
    return _singleton


def reset_device_hero_image_service_for_tests() -> None:
    """Clear the singleton so tests can inject a scratch directory."""
    global _singleton
    _singleton = None
