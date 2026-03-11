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
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
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


class ClusterPresetBundle(BaseModel):
    """Portable plugin preset payload for cluster distribution."""
    preset_id: Optional[int] = None
    name: str
    plugin_uri: str
    plugin_name: str
    parameters: Dict[str, Any]
    tags: List[str] = []
    category: str = "User"
    description: str = ""
    is_favorite: bool = False
    is_default: bool = False
    checksum: str
    source_node_id: Optional[str] = None
    exported_at: Optional[str] = None


class DeployPresetRequest(BaseModel):
    """Request to deploy cluster content to one or more nodes."""
    content_type: Literal["preset", "ir", "nam"] = "preset"
    preset_id: Optional[int] = Field(None, ge=1)
    path_token: Optional[str] = Field(None, min_length=3)
    source_node_id: Optional[str] = None
    target_node_id: Optional[str] = None
    target_node_ids: List[str] = []


def _preset_checksum(plugin_uri: str, parameters: Dict[str, Any]) -> str:
    payload = json.dumps(parameters, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(f"{plugin_uri}:{payload}".encode()).hexdigest()


async def import_preset_bytes(
    filename: str,
    content: bytes,
    plugin_uri: Optional[str] = None,
    save_to_library: bool = True,
) -> Dict[str, Any]:
    """Import preset bytes using the same flow as the upload endpoint."""
    from app.services.preset_converter_service import get_preset_converter

    converter = get_preset_converter()
    suffix = Path(filename or "preset.map2preset").suffix or ".preset"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        result = converter.import_preset(tmp_path, plugin_uri)

        if not result.success:
            raise HTTPException(
                status_code=400,
                detail=result.errors[0] if result.errors else "Import failed",
            )

        preset_id = None
        if save_to_library:
            from app.database import PluginPreset, PresetImportHistory, get_session

            async with get_session() as session:
                file_hash = converter.compute_file_hash(tmp_path)

                import_history = PresetImportHistory(
                    source_file_hash=file_hash,
                    original_filename=filename or "unknown",
                    original_format=result.original_format.value,
                    file_size_bytes=len(content),
                    target_plugin_uri=plugin_uri or result.plugin_identifier,
                    parameters_imported=len(result.parameters),
                    conversion_success=True,
                )
                session.add(import_history)

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

        return {
            "success": True,
            "preset_id": preset_id,
            "name": result.name,
            "plugin_identifier": result.plugin_identifier,
            "original_format": result.original_format.value,
            "parameters_imported": len(result.parameters),
            "message": f"Successfully imported '{result.name}' with {len(result.parameters)} parameters",
            "warnings": result.warnings,
            "checksum": hashlib.sha256(content).hexdigest(),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Import error: {e}")
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")
    finally:
        tmp_path.unlink(missing_ok=True)


def _cluster_content_roots(content_type: str) -> Dict[str, Path]:
    from app.paths import StoragePaths

    if content_type == "ir":
        roots = StoragePaths.get_all_ir_paths(include_nonexistent=True)
    elif content_type == "nam":
        roots = StoragePaths.get_all_nam_paths(include_nonexistent=True)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported content_type: {content_type}")

    return {f"{content_type}_{index}": root for index, root in enumerate(roots)}


def _list_cluster_files(content_type: str) -> List[Dict[str, Any]]:
    if content_type == "ir":
        allowed_exts = {".wav", ".aif", ".aiff", ".flac"}
    elif content_type == "nam":
        allowed_exts = {".nam", ".json"}
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported content_type: {content_type}")

    items: List[Dict[str, Any]] = []
    for root_name, root_path in _cluster_content_roots(content_type).items():
        if not root_path.exists():
            continue

        for file_path in sorted(root_path.rglob("*")):
            if not file_path.is_file() or file_path.suffix.lower() not in allowed_exts:
                continue
            relative_path = file_path.relative_to(root_path).as_posix()
            checksum = hashlib.sha256(file_path.read_bytes()).hexdigest()
            asset_type = "nam"
            if content_type == "ir":
                asset_type = "reverb_ir" if "reverb" in file_path.as_posix().lower() else "cabinet_ir"

            items.append(
                {
                    "path_token": f"{root_name}:{relative_path}",
                    "relative_path": relative_path,
                    "filename": file_path.name,
                    "size_bytes": file_path.stat().st_size,
                    "checksum": checksum,
                    "asset_type": asset_type,
                }
            )

    return items


def _resolve_cluster_file(content_type: str, path_token: str) -> Path:
    if ":" not in path_token:
        raise HTTPException(status_code=400, detail="path_token must be in '<root>:<relative_path>' format")

    root_name, relative_path = path_token.split(":", 1)
    roots = _cluster_content_roots(content_type)
    root_path = roots.get(root_name)
    if root_path is None:
        raise HTTPException(status_code=404, detail="Unknown content root")

    candidate = (root_path / relative_path).resolve()
    if not str(candidate).startswith(str(root_path.resolve())):
        raise HTTPException(status_code=400, detail="Illegal content path")
    if not candidate.is_file():
        raise HTTPException(status_code=404, detail="Content file not found")
    return candidate


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
    content = await file.read()
    payload = await import_preset_bytes(
        filename=file.filename or "preset.map2preset",
        content=content,
        plugin_uri=plugin_uri,
        save_to_library=save_to_library,
    )
    return ImportPresetResponse(**payload)


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


@router.get("/cluster/presets/{preset_id}", response_model=ClusterPresetBundle)
async def get_cluster_preset_export(preset_id: int) -> ClusterPresetBundle:
    """Export a plugin preset as a portable cluster payload."""
    from app.database import PluginPreset, get_session
    from sqlalchemy import select
    from app.services.cluster.enhanced_node_identity import get_enhanced_node_identity

    async with get_session() as session:
        result = await session.execute(select(PluginPreset).filter(PluginPreset.id == preset_id))
        preset = result.scalar_one_or_none()
        if not preset:
            raise HTTPException(status_code=404, detail="Preset not found")

        parameters = json.loads(preset.parameters) if isinstance(preset.parameters, str) else preset.parameters
        return ClusterPresetBundle(
            preset_id=preset.id,
            name=preset.name,
            plugin_uri=preset.plugin_uri,
            plugin_name=preset.plugin_name,
            parameters=parameters,
            tags=preset.tags or [],
            category=preset.category or "User",
            description=preset.description or "",
            is_favorite=bool(preset.is_favorite),
            is_default=bool(preset.is_default),
            checksum=_preset_checksum(preset.plugin_uri, parameters),
            source_node_id=get_enhanced_node_identity().get_node_id(),
            exported_at=datetime.utcnow().isoformat(),
        )


@router.post("/import-cluster")
async def import_cluster_preset(bundle: ClusterPresetBundle) -> Dict[str, Any]:
    """Create or update a plugin preset received from another node."""
    from app.database import PluginPreset, get_session
    from sqlalchemy import select

    expected_checksum = _preset_checksum(bundle.plugin_uri, bundle.parameters)
    if bundle.checksum != expected_checksum:
        raise HTTPException(status_code=400, detail="Preset checksum mismatch")

    async with get_session() as session:
        existing_result = await session.execute(
            select(PluginPreset).filter(
                (PluginPreset.plugin_uri == bundle.plugin_uri) &
                (PluginPreset.name == bundle.name)
            )
        )
        preset = existing_result.scalar_one_or_none()
        already_exists = False

        if bundle.is_default:
            defaults = (
                await session.execute(
                    select(PluginPreset).filter(
                        (PluginPreset.plugin_uri == bundle.plugin_uri) &
                        (PluginPreset.is_default == True)
                    )
                )
            ).scalars().all()
            for default in defaults:
                if preset is None or default.id != preset.id:
                    default.is_default = False

        if preset is None:
            preset = PluginPreset(
                name=bundle.name,
                plugin_uri=bundle.plugin_uri,
                plugin_name=bundle.plugin_name,
                parameters=json.dumps(bundle.parameters),
                tags=bundle.tags,
                category=bundle.category,
                description=bundle.description,
                is_favorite=bundle.is_favorite,
                is_default=bundle.is_default,
            )
            session.add(preset)
            action = "created"
        else:
            current_parameters = json.loads(preset.parameters) if isinstance(preset.parameters, str) else preset.parameters
            already_exists = _preset_checksum(preset.plugin_uri, current_parameters) == bundle.checksum
            preset.plugin_name = bundle.plugin_name
            preset.parameters = json.dumps(bundle.parameters)
            preset.tags = bundle.tags
            preset.category = bundle.category
            preset.description = bundle.description
            preset.is_favorite = bundle.is_favorite
            preset.is_default = bundle.is_default
            action = "updated"

        await session.flush()
        await session.refresh(preset)

        return {
            "success": True,
            "preset_id": preset.id,
            "status": action,
            "already_exists": already_exists,
            "checksum": bundle.checksum,
            "source_node_id": bundle.source_node_id,
        }


@router.get("/cluster/library")
async def get_cluster_library_index(content_type: str = Query(..., pattern="^(preset|ir|nam)$")) -> Dict[str, Any]:
    """List content available for cross-node sharing."""
    if content_type == "preset":
        from app.database import PluginPreset, get_session
        from sqlalchemy import select

        async with get_session() as session:
            presets = (
                await session.execute(select(PluginPreset).order_by(PluginPreset.plugin_uri, PluginPreset.name))
            ).scalars().all()
            items = []
            for preset in presets:
                parameters = json.loads(preset.parameters) if isinstance(preset.parameters, str) else preset.parameters
                items.append(
                    {
                        "preset_id": preset.id,
                        "name": preset.name,
                        "plugin_uri": preset.plugin_uri,
                        "plugin_name": preset.plugin_name,
                        "checksum": _preset_checksum(preset.plugin_uri, parameters),
                        "updated_at": preset.updated_at.isoformat() if preset.updated_at else None,
                    }
                )
            return {"content_type": content_type, "items": items, "count": len(items)}

    items = _list_cluster_files(content_type)
    return {"content_type": content_type, "items": items, "count": len(items)}


@router.get("/cluster/files/{content_type}")
async def get_cluster_content_file(
    content_type: str,
    path_token: str = Query(..., min_length=3),
) -> FileResponse:
    """Download a cluster-sharable IR or NAM file by safe token."""
    if content_type not in {"ir", "nam"}:
        raise HTTPException(status_code=400, detail="content_type must be 'ir' or 'nam'")
    file_path = _resolve_cluster_file(content_type, path_token)
    return FileResponse(path=file_path, filename=file_path.name, media_type="application/octet-stream")


@router.get("/availability")
async def get_preset_availability(
    preset_id: int = Query(..., ge=1),
    target_node_ids: Optional[str] = Query(None, description="Comma-separated node IDs to filter"),
    source_node_id: Optional[str] = Query(None, description="Source node containing the preset"),
) -> Dict[str, Any]:
    """Report which nodes already have a preset with the same payload."""
    from app.services.cluster.content_distributor import get_content_distributor

    distributor = get_content_distributor()
    targets = [node_id.strip() for node_id in (target_node_ids or "").split(",") if node_id.strip()]
    return await distributor.get_preset_availability(preset_id, targets or None, source_node_id=source_node_id)


@router.post("/deploy")
async def deploy_preset_to_nodes(request: DeployPresetRequest) -> Dict[str, Any]:
    """Deploy a plugin preset or library asset to one or more cluster nodes."""
    from app.services.cluster.content_distributor import get_content_distributor

    distributor = get_content_distributor()
    target_node_ids = request.target_node_ids or ([request.target_node_id] if request.target_node_id else [])
    if not target_node_ids:
        raise HTTPException(status_code=400, detail="At least one target node ID is required")

    if request.content_type == "preset":
        if request.preset_id is None:
            raise HTTPException(status_code=400, detail="preset_id is required for preset deployment")
        result = await distributor.deploy_preset(request.preset_id, target_node_ids, source_node_id=request.source_node_id)
        return {
            "content_type": request.content_type,
            "preset_id": request.preset_id,
            "source_node_id": request.source_node_id,
            "targets": target_node_ids,
            "results": result,
            "successful": [node_id for node_id, ok in result.items() if ok],
            "failed": [node_id for node_id, ok in result.items() if not ok],
        }

    if request.path_token is None:
        raise HTTPException(status_code=400, detail="path_token is required for IR/NAM deployment")

    result = await distributor.deploy_library_item(
        request.content_type,
        request.path_token,
        target_node_ids,
        source_node_id=request.source_node_id,
    )
    return {
        "content_type": request.content_type,
        "path_token": request.path_token,
        "source_node_id": request.source_node_id,
        "targets": target_node_ids,
        "results": result,
        "successful": [node_id for node_id, ok in result.items() if ok],
        "failed": [node_id for node_id, ok in result.items() if not ok],
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
