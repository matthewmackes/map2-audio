"""Route-level tests for /api/devices/hero-images/{device_id} (T2426-C)."""

from __future__ import annotations

import io
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from app.routes import device_hero_images
from app.services import device_hero_image_service as service_module


@pytest.fixture()
def client(tmp_path: Path) -> TestClient:
    # Reset singleton to use a scratch directory so tests don't touch ~/.map2.
    service_module.reset_device_hero_image_service_for_tests()
    service_module._singleton = service_module.DeviceHeroImageService(  # type: ignore[attr-defined]
        storage_dir=tmp_path / "overrides"
    )
    app = FastAPI()
    app.include_router(device_hero_images.router)
    try:
        yield TestClient(app)
    finally:
        service_module.reset_device_hero_image_service_for_tests()


def _png_payload(width: int = 800, height: int = 800) -> bytes:
    buf = io.BytesIO()
    Image.new("RGBA", (width, height), (10, 20, 30, 255)).save(buf, format="PNG")
    return buf.getvalue()


def test_upload_then_get_round_trip(client: TestClient) -> None:
    payload = _png_payload()
    upload = client.post(
        "/api/devices/hero-images/mpx1",
        files={"file": ("mpx1.png", payload, "image/png")},
    )
    assert upload.status_code == 200, upload.text
    body = upload.json()
    assert body["status"] == "ok"
    assert body["device_id"] == "mpx1"
    assert body["original_mime"] == "image/png"

    fetched = client.get("/api/devices/hero-images/mpx1")
    assert fetched.status_code == 200
    assert fetched.headers["content-type"].startswith("image/png")
    assert len(fetched.content) > 0


def test_get_missing_override_returns_404_envelope(client: TestClient) -> None:
    response = client.get("/api/devices/hero-images/nobody")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_upload_rejects_jpeg_content_type(client: TestClient) -> None:
    response = client.post(
        "/api/devices/hero-images/mpx1",
        files={"file": ("mpx1.jpg", b"not really a jpeg", "image/jpeg")},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "unsupported_content_type"


def test_upload_rejects_oversized_payload(client: TestClient) -> None:
    # Deliberately over the 2 MB cap — use a fake PNG header so size validation fires.
    oversized = b"\x89PNG\r\n\x1a\n" + b"\x00" * (service_module.MAX_UPLOAD_BYTES + 10)
    response = client.post(
        "/api/devices/hero-images/mpx1",
        files={"file": ("mpx1.png", oversized, "image/png")},
    )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "payload_too_large"


def test_delete_round_trip(client: TestClient) -> None:
    payload = _png_payload()
    client.post(
        "/api/devices/hero-images/intelfx",
        files={"file": ("intelfx.png", payload, "image/png")},
    )
    response = client.delete("/api/devices/hero-images/intelfx")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "removed": True, "device_id": "intelfx"}

    # GET now returns the not_found envelope.
    fetched = client.get("/api/devices/hero-images/intelfx")
    assert fetched.status_code == 404


def test_delete_is_idempotent(client: TestClient) -> None:
    response = client.delete("/api/devices/hero-images/never-uploaded")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "removed": False, "device_id": "never-uploaded"}
