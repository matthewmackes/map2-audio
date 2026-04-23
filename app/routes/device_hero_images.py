"""FastAPI routes for device hero-image overrides (T2426-C).

Exposes a three-verb endpoint group mirroring the audio-artifact shape:

- ``POST   /api/devices/hero-images/{device_id}`` — multipart PNG upload.
- ``GET    /api/devices/hero-images/{device_id}`` — serves the 1024×1024 PNG.
- ``DELETE /api/devices/hero-images/{device_id}`` — removes the override.

Errors follow the canonical envelope ``{ "error": { "code", "message" } }`` so
the frontend can surface them as toasts without string-matching prose.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, File, HTTPException, Path as FastAPIPath, Response, UploadFile
from fastapi.responses import FileResponse, JSONResponse

from app.services.device_hero_image_service import (
    DeviceHeroImageError,
    DeviceHeroImageRecord,
    get_device_hero_image_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/devices/hero-images", tags=["devices"])


def _error_response(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "details": None}},
    )


def _record_payload(record: DeviceHeroImageRecord) -> dict[str, Any]:
    return {
        "status": "ok",
        "device_id": record.device_id,
        "uploaded_at": record.uploaded_at,
        "original_size_bytes": record.original_size_bytes,
        "original_mime": record.original_mime,
    }


@router.post("/{device_id}")
async def upload_device_hero_image(
    device_id: str = FastAPIPath(..., min_length=1, max_length=64),
    file: UploadFile = File(...),
) -> Any:
    service = get_device_hero_image_service()
    try:
        payload = await file.read()
        record = service.save_upload(
            device_id,
            payload,
            content_type=file.content_type,
            original_filename=file.filename,
        )
    except DeviceHeroImageError as exc:
        logger.info("Device hero upload rejected (%s): %s", exc.code, exc.message)
        return _error_response(exc.status, exc.code, exc.message)
    except Exception as exc:  # pragma: no cover - unexpected failures surface as 500
        logger.exception("Device hero upload failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return _record_payload(record)


@router.get("/{device_id}")
async def get_device_hero_image(
    device_id: str = FastAPIPath(..., min_length=1, max_length=64),
) -> Response:
    service = get_device_hero_image_service()
    try:
        path = service.get_image_path(device_id)
    except DeviceHeroImageError as exc:
        return _error_response(exc.status, exc.code, exc.message)
    if path is None:
        return _error_response(404, "not_found", f"No hero override exists for device {device_id!r}.")
    return FileResponse(
        path,
        media_type="image/png",
        headers={
            "Cache-Control": "no-cache, must-revalidate",
        },
    )


@router.delete("/{device_id}")
async def delete_device_hero_image(
    device_id: str = FastAPIPath(..., min_length=1, max_length=64),
) -> Any:
    service = get_device_hero_image_service()
    try:
        removed = service.delete_override(device_id)
    except DeviceHeroImageError as exc:
        return _error_response(exc.status, exc.code, exc.message)
    return {"status": "ok", "removed": removed, "device_id": device_id.strip().lower()}
