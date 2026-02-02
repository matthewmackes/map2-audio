"""
Unified Upload API Routes

Single endpoint for all asset type uploads with auto-detection and batch support.

Endpoints:
    POST /api/upload/           - Upload single file
    POST /api/upload/batch      - Upload multiple files
    POST /api/upload/validate   - Validate file before upload
    GET  /api/upload/types      - Get supported upload types
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from app.services.upload_service import (
    AssetType,
    get_upload_service,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/upload", tags=["upload"])


# ==================== Response Models ====================


class UploadResponse(BaseModel):
    """Response for single file upload."""
    success: bool
    asset_type: str
    filename: str
    file_path: str
    file_size: int
    file_hash: str
    message: str
    error: Optional[str] = None
    already_exists: bool = False


class BatchUploadResponse(BaseModel):
    """Response for batch file upload."""
    total: int
    successful: int
    failed: int
    results: List[UploadResponse]


class ValidationResponse(BaseModel):
    """Response for file validation."""
    valid: bool
    asset_type: Optional[str]
    message: str
    details: dict
    requires_type: bool = False


class UploadTypeInfo(BaseModel):
    """Information about a supported upload type."""
    type: str
    name: str
    extensions: List[str]
    max_size_mb: int
    description: str


# ==================== Endpoints ====================


@router.post("/", response_model=UploadResponse)
async def upload_asset(
    file: UploadFile = File(...),
    asset_type: Optional[str] = Form(
        None,
        description="Asset type override: nam, cabinet_ir, reverb_ir, vst3. Required for audio files."
    )
):
    """Upload a single audio asset.

    Auto-detects asset type from file extension:
    - .nam -> NAM model
    - .vst3 / .zip -> VST3 plugin
    - .wav/.aif/.aiff/.flac -> IR (requires asset_type to specify cabinet_ir vs reverb_ir)

    Args:
        file: The file to upload
        asset_type: Required for audio files to specify cabinet_ir or reverb_ir

    Returns:
        UploadResponse with upload status and metadata
    """
    service = get_upload_service()

    # Read file content
    content = await file.read()
    file_size = len(content)

    # Validate file
    validation = service.validate_file(
        file.filename,
        file_size,
        asset_type_override=asset_type
    )

    if not validation.valid:
        if validation.details.get("requires_type"):
            raise HTTPException(
                status_code=400,
                detail={
                    "message": validation.message,
                    "requires_type": True,
                    "options": validation.details.get("options", [])
                }
            )
        raise HTTPException(status_code=400, detail=validation.message)

    # Save file
    result = await service.save_upload(
        file.filename,
        content,
        validation.asset_type
    )

    if not result.success:
        raise HTTPException(status_code=500, detail=result.error or result.message)

    return UploadResponse(
        success=result.success,
        asset_type=result.asset_type.value,
        filename=result.filename,
        file_path=result.file_path,
        file_size=result.file_size,
        file_hash=result.file_hash,
        message=result.message,
        error=result.error,
        already_exists=result.already_exists
    )


@router.post("/batch", response_model=BatchUploadResponse)
async def upload_assets_batch(
    files: List[UploadFile] = File(...),
    asset_type: Optional[str] = Form(
        None,
        description="Asset type for all audio files in batch"
    )
):
    """Upload multiple audio assets at once.

    Auto-detects each file's type. For audio files, asset_type must be specified
    to indicate whether they are cabinet_ir or reverb_ir.

    Args:
        files: List of files to upload
        asset_type: Required for audio files (cabinet_ir or reverb_ir)

    Returns:
        BatchUploadResponse with results for each file
    """
    service = get_upload_service()
    results = []
    successful = 0
    failed = 0

    for file in files:
        content = await file.read()

        # Validate
        validation = service.validate_file(
            file.filename,
            len(content),
            asset_type_override=asset_type
        )

        if not validation.valid:
            results.append(UploadResponse(
                success=False,
                asset_type=asset_type or "unknown",
                filename=file.filename,
                file_path="",
                file_size=len(content),
                file_hash="",
                message=validation.message,
                error=validation.message
            ))
            failed += 1
            continue

        # Save
        result = await service.save_upload(
            file.filename,
            content,
            validation.asset_type
        )

        results.append(UploadResponse(
            success=result.success,
            asset_type=result.asset_type.value,
            filename=result.filename,
            file_path=result.file_path,
            file_size=result.file_size,
            file_hash=result.file_hash,
            message=result.message,
            error=result.error,
            already_exists=result.already_exists
        ))

        if result.success:
            successful += 1
        else:
            failed += 1

    return BatchUploadResponse(
        total=len(files),
        successful=successful,
        failed=failed,
        results=results
    )


@router.post("/validate", response_model=ValidationResponse)
async def validate_upload(
    file: UploadFile = File(...),
    asset_type: Optional[str] = Form(None)
):
    """Validate a file before upload.

    Returns validation status and detected asset type without saving the file.
    Use this to check if a file is valid before committing to upload.

    Args:
        file: The file to validate
        asset_type: Optional type hint for audio files

    Returns:
        ValidationResponse with validation status
    """
    service = get_upload_service()
    content = await file.read()

    validation = service.validate_file(
        file.filename,
        len(content),
        asset_type_override=asset_type
    )

    return ValidationResponse(
        valid=validation.valid,
        asset_type=validation.asset_type.value if validation.asset_type else None,
        message=validation.message,
        details=validation.details,
        requires_type=validation.details.get("requires_type", False)
    )


@router.get("/types", response_model=dict)
async def get_supported_types():
    """Get supported upload types and their file extensions.

    Returns information about each supported asset type including
    accepted file extensions and size limits.
    """
    return {
        "types": [
            {
                "type": "nam",
                "name": "NAM Model",
                "extensions": [".nam"],
                "max_size_mb": 500,
                "description": "Neural Amp Modeler model files for amp/pedal emulation"
            },
            {
                "type": "cabinet_ir",
                "name": "Cabinet IR",
                "extensions": [".wav", ".aif", ".aiff", ".flac"],
                "max_size_mb": 50,
                "description": "Speaker cabinet impulse response files"
            },
            {
                "type": "reverb_ir",
                "name": "Reverb IR",
                "extensions": [".wav", ".aif", ".aiff", ".flac"],
                "max_size_mb": 100,
                "description": "Reverb/room impulse response files"
            },
            {
                "type": "vst3",
                "name": "VST3 Plugin",
                "extensions": [".vst3", ".zip"],
                "max_size_mb": 500,
                "description": "VST3 plugin bundles or ZIP archives containing plugins"
            }
        ]
    }
