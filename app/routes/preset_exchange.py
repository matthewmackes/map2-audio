"""
Preset Exchange API - Universal Import/Export and Community Features

Provides:
- Universal preset import from FXP, VST3, LV2, JUCE, and MAP2UPF formats
- Export to MAP2UPF (primary), VST3, and LV2 formats
- Community preset sharing with ratings and downloads
- Open/permissionless upload model

Author: MAP2 Audio Team
License: MIT
"""

import logging
import json
import uuid
import hashlib
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/preset-exchange", tags=["preset-exchange"])


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class ImportPresetResponse(BaseModel):
    """Response for preset import operation."""
    success: bool
    preset_id: Optional[int] = None
    name: str
    plugin_identifier: str
    original_format: str
    parameters_imported: int
    message: str
    warnings: List[str] = []


class ExportPresetResponse(BaseModel):
    """MAP2 Universal Preset Format export."""
    format_version: str = "1.0.0"
    format_type: str = "map2upf"
    metadata: Dict[str, Any]
    target: Dict[str, Any]
    parameters: Dict[str, Any]
    state_chunk: Optional[str] = None
    checksum: str


class CommunityPresetUpload(BaseModel):
    """Request to upload a preset to community library."""
    name: str = Field(..., min_length=1, max_length=255)
    plugin_uri: str = Field(..., min_length=1)
    plugin_name: str = Field(..., min_length=1)
    parameters: Dict[str, Any]
    description: str = ""
    category: str = "User"
    tags: List[str] = []
    license: str = "CC-BY-4.0"
    author_name: str = "Anonymous"


class CommunityPresetInfo(BaseModel):
    """Community preset summary for browsing."""
    uuid: str
    name: str
    plugin_uri: str
    plugin_name: str
    author: str
    category: str
    tags: List[str]
    downloads: int
    rating: float
    rating_count: int
    created_at: str


class BrowsePresetsResponse(BaseModel):
    """Response for community preset browsing."""
    presets: List[CommunityPresetInfo]
    count: int
    total: int
    page: int
    page_size: int


class RatingResponse(BaseModel):
    """Response for rating operation."""
    success: bool
    preset_uuid: str
    new_rating: float
    rating_count: int


# =============================================================================
# IMPORT ENDPOINTS
# =============================================================================

@router.post("/import", response_model=ImportPresetResponse)
async def import_preset(
    file: UploadFile = File(...),
    plugin_uri: Optional[str] = Query(None, description="Target plugin URI for parameter mapping"),
    save_to_library: bool = Query(True, description="Save imported preset to local library")
) -> ImportPresetResponse:
    """
    Import a preset from any supported format.

    **Supported formats:**
    - `.map2preset` - MAP2 Universal Preset Format (recommended)
    - `.fxp` / `.fxb` - VST2 presets (legacy)
    - `.vstpreset` - VST3 presets
    - `.lv2preset` / `.ttl` - LV2 presets
    - `.jucepreset` - JUCE state files

    **Parameters:**
    - `file`: The preset file to import (multipart upload)
    - `plugin_uri`: Optional target plugin URI for parameter mapping
    - `save_to_library`: Whether to save the imported preset to local library

    **Returns:**
    - Import result with preset ID and parameter count
    """
    from app.services.preset_converter_service import get_preset_converter

    converter = get_preset_converter()

    # Save uploaded file temporarily
    suffix = Path(file.filename).suffix if file.filename else ".preset"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        # Import preset
        result = converter.import_preset(tmp_path, plugin_uri)

        if not result.success:
            raise HTTPException(
                status_code=400,
                detail=result.errors[0] if result.errors else "Import failed"
            )

        preset_id = None

        # Optionally save to local library
        if save_to_library:
            from app.database import get_session, PluginPreset, PresetImportHistory

            async with get_session() as session:
                # Check for duplicate import
                file_hash = converter.compute_file_hash(tmp_path)

                # Create import history record
                import_history = PresetImportHistory(
                    source_file_hash=file_hash,
                    original_filename=file.filename or "unknown",
                    original_format=result.original_format.value,
                    file_size_bytes=len(content),
                    target_plugin_uri=plugin_uri or result.plugin_identifier,
                    parameters_imported=len(result.parameters),
                    conversion_success=True,
                )
                session.add(import_history)

                # Create preset
                preset = PluginPreset(
                    name=result.name,
                    plugin_uri=plugin_uri or result.plugin_identifier,
                    plugin_name=result.metadata.get("plugin_name", result.name),
                    parameters=json.dumps(result.parameters),
                    tags=[result.original_format.value, "imported"],
                    category="Imported",
                    description=f"Imported from {result.original_format.value} format",
                )
                session.add(preset)
                await session.flush()

                preset_id = preset.id
                import_history.converted_preset_id = preset_id

        return ImportPresetResponse(
            success=True,
            preset_id=preset_id,
            name=result.name,
            plugin_identifier=result.plugin_identifier,
            original_format=result.original_format.value,
            parameters_imported=len(result.parameters),
            message=f"Successfully imported '{result.name}' with {len(result.parameters)} parameters",
            warnings=result.warnings,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Import error: {e}")
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")
    finally:
        # Cleanup temp file
        tmp_path.unlink(missing_ok=True)


@router.get("/formats")
async def get_supported_formats() -> Dict[str, Any]:
    """
    Get list of supported import/export formats.

    **Returns:**
    - List of formats with extensions and capabilities
    """
    from app.services.preset_converter_service import get_preset_converter

    converter = get_preset_converter()
    return {
        "formats": converter.supported_formats,
        "primary_format": "map2upf",
        "recommended_extension": ".map2preset",
    }


# =============================================================================
# EXPORT ENDPOINTS
# =============================================================================

@router.get("/export/{preset_id}")
async def export_preset(
    preset_id: int,
    format: str = Query("map2upf", description="Export format: map2upf, lv2, juce")
) -> Dict[str, Any]:
    """
    Export a preset from the local library.

    **Parameters:**
    - `preset_id`: ID of the preset to export
    - `format`: Target format (map2upf recommended)

    **Returns:**
    - Preset data in MAP2 Universal Preset Format
    """
    from app.database import get_session, PluginPreset
    from sqlalchemy import select

    async with get_session() as session:
        result = await session.execute(
            select(PluginPreset).filter(PluginPreset.id == preset_id)
        )
        preset = result.scalar_one_or_none()

        if not preset:
            raise HTTPException(status_code=404, detail="Preset not found")

        # Build MAP2UPF export
        parameters = json.loads(preset.parameters) if isinstance(preset.parameters, str) else preset.parameters

        export_data = {
            "format_version": "1.0.0",
            "format_type": "map2upf",
            "metadata": {
                "name": preset.name,
                "description": preset.description,
                "category": preset.category,
                "tags": preset.tags or [],
                "created_at": preset.created_at.isoformat() if preset.created_at else None,
                "updated_at": preset.updated_at.isoformat() if preset.updated_at else None,
                "license": "CC-BY-4.0",
            },
            "target": {
                "plugin_uri": preset.plugin_uri,
                "plugin_name": preset.plugin_name,
            },
            "parameters": parameters,
            "checksum": hashlib.sha256(
                json.dumps(parameters, sort_keys=True).encode()
            ).hexdigest(),
        }

        return export_data


# =============================================================================
# COMMUNITY ENDPOINTS
# =============================================================================

@router.post("/community/upload")
async def upload_community_preset(preset: CommunityPresetUpload) -> Dict[str, Any]:
    """
    Upload a preset to the community library.

    **Open/Permissionless** - No authentication required.
    Presets are auto-approved by default.

    **Parameters:**
    - `name`: Preset name (required)
    - `plugin_uri`: Target plugin URI (required)
    - `plugin_name`: Plugin display name (required)
    - `parameters`: Parameter values (required)
    - `description`: Optional description
    - `category`: Optional category (default: "User")
    - `tags`: Optional tags list
    - `license`: License (default: CC-BY-4.0)
    - `author_name`: Optional author name (default: "Anonymous")

    **Returns:**
    - UUID for the uploaded preset
    """
    from app.database import get_session, CommunityPreset

    async with get_session() as session:
        # Generate unique ID
        preset_uuid = str(uuid.uuid4())

        # Compute hash for deduplication
        params_json = json.dumps(preset.parameters, sort_keys=True)
        source_hash = hashlib.sha256(
            f"{preset.plugin_uri}:{params_json}".encode()
        ).hexdigest()

        # Check for duplicate
        from sqlalchemy import select
        existing = await session.execute(
            select(CommunityPreset).filter(CommunityPreset.source_file_hash == source_hash)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail="A preset with identical parameters already exists"
            )

        # Create community preset
        community_preset = CommunityPreset(
            uuid=preset_uuid,
            name=preset.name,
            plugin_uri=preset.plugin_uri,
            plugin_name=preset.plugin_name,
            parameters=params_json,
            author_name=preset.author_name,
            description=preset.description,
            category=preset.category,
            tags=preset.tags,
            license=preset.license,
            source_file_hash=source_hash,
            is_approved=True,  # Auto-approve (permissionless)
        )
        session.add(community_preset)
        await session.flush()

        logger.info(f"Community preset uploaded: {preset.name} (UUID: {preset_uuid})")

        return {
            "success": True,
            "preset_uuid": preset_uuid,
            "message": f"Preset '{preset.name}' uploaded to community library",
        }


@router.get("/community/browse", response_model=BrowsePresetsResponse)
async def browse_community_presets(
    plugin_uri: Optional[str] = Query(None, description="Filter by plugin URI"),
    category: Optional[str] = Query(None, description="Filter by category"),
    search: Optional[str] = Query(None, description="Search in name/description"),
    tags: Optional[str] = Query(None, description="Comma-separated tags to filter"),
    sort_by: str = Query("downloads", enum=["downloads", "rating", "newest"]),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100)
) -> BrowsePresetsResponse:
    """
    Browse community presets with filtering and sorting.

    **Parameters:**
    - `plugin_uri`: Filter by specific plugin
    - `category`: Filter by category
    - `search`: Search in name and description
    - `tags`: Comma-separated tags to filter
    - `sort_by`: Sort order (downloads, rating, newest)
    - `page`: Page number (default: 1)
    - `page_size`: Items per page (default: 20, max: 100)

    **Returns:**
    - List of community presets with pagination info
    """
    from app.database import get_session, CommunityPreset
    from sqlalchemy import select, desc, func

    async with get_session() as session:
        # Base query
        query = select(CommunityPreset).filter(
            CommunityPreset.is_flagged == False,
            CommunityPreset.is_hidden == False,
            CommunityPreset.is_approved == True
        )

        # Apply filters
        if plugin_uri:
            query = query.filter(CommunityPreset.plugin_uri == plugin_uri)
        if category:
            query = query.filter(CommunityPreset.category == category)
        if search:
            search_pattern = f"%{search}%"
            query = query.filter(
                (CommunityPreset.name.ilike(search_pattern)) |
                (CommunityPreset.description.ilike(search_pattern)) |
                (CommunityPreset.plugin_name.ilike(search_pattern))
            )
        if tags:
            tag_list = [t.strip() for t in tags.split(",")]
            # Filter presets that have any of the specified tags
            for tag in tag_list:
                query = query.filter(CommunityPreset.tags.contains([tag]))

        # Count total before pagination
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await session.execute(count_query)
        total = total_result.scalar() or 0

        # Apply sorting
        if sort_by == "downloads":
            query = query.order_by(desc(CommunityPreset.download_count))
        elif sort_by == "rating":
            # Order by average rating (rating_sum / rating_count), handle division by zero
            query = query.order_by(
                desc(
                    func.coalesce(
                        CommunityPreset.rating_sum / func.nullif(CommunityPreset.rating_count, 0),
                        0
                    )
                )
            )
        else:  # newest
            query = query.order_by(desc(CommunityPreset.created_at))

        # Apply pagination
        offset = (page - 1) * page_size
        query = query.limit(page_size).offset(offset)

        result = await session.execute(query)
        presets = result.scalars().all()

        return BrowsePresetsResponse(
            presets=[
                CommunityPresetInfo(
                    uuid=p.uuid,
                    name=p.name,
                    plugin_uri=p.plugin_uri,
                    plugin_name=p.plugin_name,
                    author=p.author_name or "Anonymous",
                    category=p.category or "User",
                    tags=p.tags or [],
                    downloads=p.download_count or 0,
                    rating=round(p.rating_sum / p.rating_count, 2) if p.rating_count > 0 else 0.0,
                    rating_count=p.rating_count or 0,
                    created_at=p.created_at.isoformat() if p.created_at else "",
                )
                for p in presets
            ],
            count=len(presets),
            total=total,
            page=page,
            page_size=page_size,
        )


@router.post("/community/{preset_uuid}/download")
async def download_community_preset(preset_uuid: str) -> Dict[str, Any]:
    """
    Download a community preset and increment download counter.

    **Parameters:**
    - `preset_uuid`: UUID of the preset to download

    **Returns:**
    - Full preset data in MAP2UPF format
    """
    from app.database import get_session, CommunityPreset
    from sqlalchemy import select

    async with get_session() as session:
        result = await session.execute(
            select(CommunityPreset).filter(CommunityPreset.uuid == preset_uuid)
        )
        preset = result.scalar_one_or_none()

        if not preset:
            raise HTTPException(status_code=404, detail="Preset not found")

        if preset.is_hidden or preset.is_flagged:
            raise HTTPException(status_code=404, detail="Preset not available")

        # Increment download count
        preset.download_count = (preset.download_count or 0) + 1

        # Parse parameters
        parameters = json.loads(preset.parameters) if isinstance(preset.parameters, str) else preset.parameters

        return {
            "format_version": "1.0.0",
            "format_type": "map2upf",
            "metadata": {
                "name": preset.name,
                "author": preset.author_name,
                "description": preset.description,
                "category": preset.category,
                "tags": preset.tags or [],
                "license": preset.license,
                "downloads": preset.download_count,
                "rating": round(preset.rating_sum / preset.rating_count, 2) if preset.rating_count > 0 else 0,
            },
            "target": {
                "plugin_uri": preset.plugin_uri,
                "plugin_name": preset.plugin_name,
            },
            "parameters": parameters,
        }


@router.post("/community/{preset_uuid}/rate", response_model=RatingResponse)
async def rate_community_preset(
    preset_uuid: str,
    rating: int = Query(..., ge=1, le=5, description="Rating from 1-5 stars"),
    fingerprint: str = Query(..., min_length=32, max_length=64, description="Anonymous device fingerprint")
) -> RatingResponse:
    """
    Rate a community preset (1-5 stars).

    Uses anonymous device fingerprinting to prevent duplicate ratings
    while preserving privacy (no accounts required).

    **Parameters:**
    - `preset_uuid`: UUID of the preset to rate
    - `rating`: Rating from 1-5 stars
    - `fingerprint`: Anonymous device fingerprint (SHA-256 hash)

    **Returns:**
    - Updated average rating
    """
    from app.database import get_session, CommunityPreset, PresetRating
    from sqlalchemy import select

    async with get_session() as session:
        # Get preset
        result = await session.execute(
            select(CommunityPreset).filter(CommunityPreset.uuid == preset_uuid)
        )
        preset = result.scalar_one_or_none()

        if not preset:
            raise HTTPException(status_code=404, detail="Preset not found")

        # Check for existing rating from this fingerprint
        existing_result = await session.execute(
            select(PresetRating).filter(
                PresetRating.preset_id == preset.id,
                PresetRating.user_fingerprint == fingerprint
            )
        )
        existing_rating = existing_result.scalar_one_or_none()

        if existing_rating:
            # Update existing rating
            old_rating = existing_rating.rating
            existing_rating.rating = rating
            existing_rating.updated_at = datetime.utcnow()

            # Update preset aggregate
            preset.rating_sum = (preset.rating_sum or 0) - old_rating + rating
        else:
            # Create new rating
            new_rating = PresetRating(
                preset_id=preset.id,
                user_fingerprint=fingerprint,
                rating=rating,
            )
            session.add(new_rating)

            # Update preset aggregate
            preset.rating_sum = (preset.rating_sum or 0) + rating
            preset.rating_count = (preset.rating_count or 0) + 1

        # Calculate new average
        new_average = preset.rating_sum / preset.rating_count if preset.rating_count > 0 else 0

        return RatingResponse(
            success=True,
            preset_uuid=preset_uuid,
            new_rating=round(new_average, 2),
            rating_count=preset.rating_count,
        )


@router.post("/community/{preset_uuid}/report")
async def report_community_preset(
    preset_uuid: str,
    reason: str = Query(..., min_length=10, max_length=500, description="Reason for report")
) -> Dict[str, Any]:
    """
    Report a community preset for spam/abuse.

    **Parameters:**
    - `preset_uuid`: UUID of the preset to report
    - `reason`: Reason for the report (10-500 chars)

    **Returns:**
    - Confirmation of report submission
    """
    from app.database import get_session, CommunityPreset
    from sqlalchemy import select

    async with get_session() as session:
        result = await session.execute(
            select(CommunityPreset).filter(CommunityPreset.uuid == preset_uuid)
        )
        preset = result.scalar_one_or_none()

        if not preset:
            raise HTTPException(status_code=404, detail="Preset not found")

        # Increment report count
        preset.report_count = (preset.report_count or 0) + 1

        # Auto-flag if too many reports
        if preset.report_count >= 5:
            preset.is_flagged = True
            logger.warning(f"Preset {preset_uuid} auto-flagged after {preset.report_count} reports")

        return {
            "success": True,
            "message": "Report submitted. Thank you for helping keep the community clean.",
        }


@router.get("/community/categories")
async def get_community_categories() -> Dict[str, Any]:
    """
    Get list of categories with preset counts.

    **Returns:**
    - List of categories with counts
    """
    from app.database import get_session, CommunityPreset
    from sqlalchemy import select, func

    async with get_session() as session:
        result = await session.execute(
            select(
                CommunityPreset.category,
                func.count(CommunityPreset.id).label("count")
            )
            .filter(
                CommunityPreset.is_flagged == False,
                CommunityPreset.is_hidden == False,
                CommunityPreset.is_approved == True
            )
            .group_by(CommunityPreset.category)
            .order_by(func.count(CommunityPreset.id).desc())
        )
        categories = result.all()

        return {
            "categories": [
                {"name": cat or "Uncategorized", "count": count}
                for cat, count in categories
            ]
        }


@router.get("/community/plugins")
async def get_community_plugins() -> Dict[str, Any]:
    """
    Get list of plugins with community presets.

    **Returns:**
    - List of plugins with preset counts
    """
    from app.database import get_session, CommunityPreset
    from sqlalchemy import select, func

    async with get_session() as session:
        result = await session.execute(
            select(
                CommunityPreset.plugin_uri,
                CommunityPreset.plugin_name,
                func.count(CommunityPreset.id).label("count")
            )
            .filter(
                CommunityPreset.is_flagged == False,
                CommunityPreset.is_hidden == False,
                CommunityPreset.is_approved == True
            )
            .group_by(CommunityPreset.plugin_uri, CommunityPreset.plugin_name)
            .order_by(func.count(CommunityPreset.id).desc())
        )
        plugins = result.all()

        return {
            "plugins": [
                {"uri": uri, "name": name, "preset_count": count}
                for uri, name, count in plugins
            ]
        }
