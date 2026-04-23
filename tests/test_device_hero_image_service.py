"""Unit tests for DeviceHeroImageService (T2426-C)."""

from __future__ import annotations

import io
import json
from pathlib import Path

import pytest
from PIL import Image

from app.services.device_hero_image_service import (
    DeviceHeroImageError,
    DeviceHeroImageService,
    MAX_UPLOAD_BYTES,
    TARGET_EDGE_PX,
)


def _png_bytes(width: int = 800, height: int = 800, color: tuple[int, int, int, int] = (10, 20, 30, 255)) -> bytes:
    img = Image.new("RGBA", (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _read_png(payload: bytes) -> Image.Image:
    return Image.open(io.BytesIO(payload))


def _make_service(tmp_path: Path) -> DeviceHeroImageService:
    return DeviceHeroImageService(storage_dir=tmp_path / "overrides")


def test_save_upload_writes_1024_png_and_manifest(tmp_path: Path) -> None:
    service = _make_service(tmp_path)
    record = service.save_upload(
        "mpx1",
        _png_bytes(800, 800),
        content_type="image/png",
        original_filename="mpx1.png",
    )

    assert record.device_id == "mpx1"
    assert record.image_path.exists()
    assert record.manifest_path.exists()

    processed = _read_png(record.image_path.read_bytes())
    assert processed.size == (TARGET_EDGE_PX, TARGET_EDGE_PX)
    manifest = json.loads(record.manifest_path.read_text())
    assert manifest["device_id"] == "mpx1"
    assert manifest["original_size_bytes"] > 0
    assert manifest["original_mime"] == "image/png"


def test_save_upload_center_crops_non_square_input(tmp_path: Path) -> None:
    service = _make_service(tmp_path)
    record = service.save_upload("intelfx", _png_bytes(2000, 1200), content_type="image/png")
    processed = _read_png(record.image_path.read_bytes())
    assert processed.size == (TARGET_EDGE_PX, TARGET_EDGE_PX)


def test_save_upload_downscales_oversized_square_input(tmp_path: Path) -> None:
    service = _make_service(tmp_path)
    record = service.save_upload("tesira", _png_bytes(2048, 2048), content_type="image/png")
    processed = _read_png(record.image_path.read_bytes())
    assert processed.size == (TARGET_EDGE_PX, TARGET_EDGE_PX)


def test_save_upload_rejects_non_png_content_type(tmp_path: Path) -> None:
    service = _make_service(tmp_path)
    with pytest.raises(DeviceHeroImageError) as excinfo:
        service.save_upload("mpx1", _png_bytes(), content_type="image/jpeg")
    assert excinfo.value.code == "unsupported_content_type"


def test_save_upload_rejects_payload_over_cap(tmp_path: Path) -> None:
    service = _make_service(tmp_path)
    oversized = b"\x89PNG\r\n\x1a\n" + b"\x00" * (MAX_UPLOAD_BYTES + 1)
    with pytest.raises(DeviceHeroImageError) as excinfo:
        service.save_upload("mpx1", oversized, content_type="image/png")
    assert excinfo.value.code == "payload_too_large"
    assert excinfo.value.status == 413


def test_save_upload_rejects_empty_payload(tmp_path: Path) -> None:
    service = _make_service(tmp_path)
    with pytest.raises(DeviceHeroImageError) as excinfo:
        service.save_upload("mpx1", b"", content_type="image/png")
    assert excinfo.value.code == "empty_payload"


def test_save_upload_rejects_corrupt_image(tmp_path: Path) -> None:
    service = _make_service(tmp_path)
    with pytest.raises(DeviceHeroImageError) as excinfo:
        service.save_upload("mpx1", b"this is not a png", content_type="image/png")
    assert excinfo.value.code == "corrupt_image"


def test_save_upload_rejects_non_png_payload_even_if_content_type_lies(tmp_path: Path) -> None:
    # JPEG payload masquerading as PNG via the content-type header.
    service = _make_service(tmp_path)
    jpeg_buf = io.BytesIO()
    Image.new("RGB", (256, 256), (255, 0, 0)).save(jpeg_buf, format="JPEG")
    with pytest.raises(DeviceHeroImageError) as excinfo:
        service.save_upload("mpx1", jpeg_buf.getvalue(), content_type="image/png")
    assert excinfo.value.code == "unsupported_image_format"


def test_save_upload_rejects_invalid_device_id(tmp_path: Path) -> None:
    service = _make_service(tmp_path)
    with pytest.raises(DeviceHeroImageError) as excinfo:
        service.save_upload("has spaces", _png_bytes(), content_type="image/png")
    assert excinfo.value.code == "invalid_device_id"


def test_save_upload_rejects_filename_with_path_traversal(tmp_path: Path) -> None:
    service = _make_service(tmp_path)
    with pytest.raises(DeviceHeroImageError) as excinfo:
        service.save_upload(
            "mpx1",
            _png_bytes(),
            content_type="image/png",
            original_filename="../sneaky.png",
        )
    assert excinfo.value.code == "invalid_filename"


def test_get_image_path_returns_none_when_missing(tmp_path: Path) -> None:
    service = _make_service(tmp_path)
    assert service.get_image_path("mpx1") is None
    assert service.has_override("mpx1") is False


def test_delete_override_removes_both_files(tmp_path: Path) -> None:
    service = _make_service(tmp_path)
    record = service.save_upload("mpx1", _png_bytes(), content_type="image/png")
    assert record.image_path.exists()
    assert record.manifest_path.exists()
    assert service.delete_override("mpx1") is True
    assert not record.image_path.exists()
    assert not record.manifest_path.exists()
    # Idempotent second delete returns False (nothing to remove).
    assert service.delete_override("mpx1") is False


def test_list_overrides_yields_every_record(tmp_path: Path) -> None:
    service = _make_service(tmp_path)
    service.save_upload("mpx1", _png_bytes(), content_type="image/png")
    service.save_upload("intelfx", _png_bytes(), content_type="image/png")
    records = list(service.list_overrides())
    assert sorted(record.device_id for record in records) == ["intelfx", "mpx1"]


def test_save_upload_normalizes_device_id_case_and_whitespace(tmp_path: Path) -> None:
    service = _make_service(tmp_path)
    record = service.save_upload("  Maschine-MK1  ", _png_bytes(), content_type="image/png")
    assert record.device_id == "maschine-mk1"
    assert record.image_path.name == "maschine-mk1.png"
