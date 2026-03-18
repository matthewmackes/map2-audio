"""
SoundFont Library API Routes
Browse, search, and download SoundFont (.sf2, .sfz) libraries.
"""

import logging
import os
from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from pydantic import BaseModel

from app.services.soundfont_library.download_manager import get_sf_download_manager
from app.services.soundfont_parser import attach_soundfont_summaries, parse_soundfont_presets
from app.paths import StoragePaths

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/soundfonts", tags=["soundfonts"])


class DownloadRequest(BaseModel):
    """Request to start SoundFont download."""
    sources: Optional[List[str]] = None  # None = all sources
    parallel: int = 4
    skip_existing: bool = True


# ==================== List and Browse ====================

@router.get("/")
async def list_soundfonts(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    category: Optional[str] = None,
    format: Optional[str] = None,
    include_presets: bool = Query(False),
) -> Dict:
    """List installed SoundFont files.

    Args:
        limit: Number of results
        offset: Offset for pagination
        category: Filter by category
        format: Filter by format (sf2 or sfz)

    Returns:
        {
            "soundfonts": [...],
            "total": int,
            "limit": int,
            "offset": int
        }
    """
    try:
        soundfonts = []
        sf_dir = StoragePaths.get_soundfont_user_dir()
        download_dir = StoragePaths.get_soundfont_download_dir()

        sf_extensions = {'.sf2', '.sfz', '.sf3'}

        # Scan user soundfont directory
        for search_dir in [sf_dir, download_dir]:
            if not search_dir.exists():
                continue

            for root, dirs, files in os.walk(str(search_dir)):
                for filename in files:
                    ext = os.path.splitext(filename.lower())[1]
                    if ext not in sf_extensions:
                        continue

                    file_path = os.path.join(root, filename)
                    rel_path = os.path.relpath(root, str(search_dir))
                    path_parts = rel_path.split(os.sep) if rel_path != '.' else []

                    # Determine format
                    sf_format = 'sf2' if ext in ('.sf2', '.sf3') else 'sfz'

                    # Apply filters
                    if format and sf_format != format:
                        continue

                    # Determine category from path
                    sf_category = path_parts[1] if len(path_parts) > 1 else 'General'
                    if category and sf_category.lower() != category.lower():
                        continue

                    # Get file size
                    try:
                        file_size = os.path.getsize(file_path)
                    except OSError:
                        file_size = 0

                    soundfonts.append({
                        "name": os.path.splitext(filename)[0],
                        "filename": filename,
                        "path": file_path,
                        "format": sf_format,
                        "category": sf_category,
                        "library": path_parts[0] if path_parts else 'user',
                        "size": file_size,
                    })

        # Sort by name
        soundfonts.sort(key=lambda x: x['name'].lower())

        # Apply pagination
        total = len(soundfonts)
        soundfonts = soundfonts[offset:offset + limit]

        if include_presets:
            soundfonts = attach_soundfont_summaries(soundfonts)

        return {
            "soundfonts": soundfonts,
            "total": total,
            "limit": limit,
            "offset": offset
        }

    except Exception as e:
        logger.error(f"Error listing soundfonts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/presets/")
async def get_soundfont_presets(path: str = Query(..., min_length=1, max_length=4096)) -> Dict:
    """Parse bank/program presets from a SoundFont 2/3 file."""
    try:
        presets = parse_soundfont_presets(path)
        return {
            "path": path,
            "presets": presets,
            "total": len(presets),
        }
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.error(f"Error parsing soundfont presets for {path}: {exc}")
        raise HTTPException(status_code=500, detail="Failed to parse SoundFont presets") from exc


@router.get("/libraries/")
async def get_libraries() -> Dict:
    """Get available SoundFont libraries (sources for downloading).

    Returns:
        {
            "libraries": [
                {
                    "name": str,
                    "displayName": str,
                    "description": str,
                    "license": str,
                    "count": int,
                    "iconColor": str
                },
                ...
            ]
        }
    """
    try:
        manager = get_sf_download_manager()
        libraries = manager.get_libraries_info()

        return {
            "libraries": libraries
        }

    except Exception as e:
        logger.error(f"Error getting libraries: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/categories/")
async def get_categories() -> Dict:
    """Get SoundFont categories.

    Returns:
        {
            "categories": [
                {"name": str, "count": int},
                ...
            ]
        }
    """
    try:
        categories = {}
        sf_dir = StoragePaths.get_soundfont_user_dir()
        download_dir = StoragePaths.get_soundfont_download_dir()

        sf_extensions = {'.sf2', '.sfz', '.sf3'}

        for search_dir in [sf_dir, download_dir]:
            if not search_dir.exists():
                continue

            for root, dirs, files in os.walk(str(search_dir)):
                for filename in files:
                    ext = os.path.splitext(filename.lower())[1]
                    if ext not in sf_extensions:
                        continue

                    rel_path = os.path.relpath(root, str(search_dir))
                    path_parts = rel_path.split(os.sep) if rel_path != '.' else []
                    category = path_parts[1] if len(path_parts) > 1 else 'General'

                    categories[category] = categories.get(category, 0) + 1

        return {
            "categories": [
                {"name": name, "count": count}
                for name, count in sorted(categories.items())
            ]
        }

    except Exception as e:
        logger.error(f"Error getting categories: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Download Management ====================

@router.get("/download/status")
async def get_download_status() -> Dict:
    """Get current download status.

    Returns:
        {
            "is_downloading": bool,
            "progress_percent": float,
            "stats": {...}
        }
    """
    try:
        manager = get_sf_download_manager()
        return manager.get_progress()
    except Exception as e:
        logger.error(f"Error getting download status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/download")
async def start_download(request: DownloadRequest) -> Dict:
    """Start SoundFont library download.

    Args:
        request: Download configuration

    Returns:
        {
            "status": "started",
            "sources": [...],
            "parallel": int
        }
    """
    try:
        manager = get_sf_download_manager()

        # Start download in background (non-blocking)
        import asyncio
        asyncio.create_task(
            manager.download_all(
                sources=request.sources,
                parallel=request.parallel,
                skip_existing=request.skip_existing
            )
        )

        return {
            "status": "started",
            "sources": request.sources or list(manager.scrapers.keys()),
            "parallel": request.parallel,
            "skip_existing": request.skip_existing
        }

    except Exception as e:
        logger.error(f"Error starting download: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/download/cancel")
async def cancel_download() -> Dict:
    """Cancel ongoing download.

    Returns:
        {
            "status": "cancelled"
        }
    """
    try:
        manager = get_sf_download_manager()
        await manager.cancel_download()

        return {
            "status": "cancelled"
        }
    except Exception as e:
        logger.error(f"Error cancelling download: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/download/pause")
async def pause_download() -> Dict:
    """Pause ongoing download.

    Returns:
        {
            "status": "paused"
        }
    """
    try:
        manager = get_sf_download_manager()
        await manager.pause_download()

        return {
            "status": "paused"
        }
    except Exception as e:
        logger.error(f"Error pausing download: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/download/resume")
async def resume_download() -> Dict:
    """Resume paused download.

    Returns:
        {
            "status": "resumed"
        }
    """
    try:
        manager = get_sf_download_manager()
        await manager.resume_download()

        return {
            "status": "resumed"
        }
    except Exception as e:
        logger.error(f"Error resuming download: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download/files")
async def get_file_tasks() -> List[Dict]:
    """Get all active file download tasks.

    Returns:
        List of file download tasks with progress
    """
    try:
        manager = get_sf_download_manager()
        tasks = await manager.get_file_tasks()
        return tasks
    except Exception as e:
        logger.error(f"Error getting file tasks: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download/file/{filename}")
async def get_file_progress(filename: str) -> Dict:
    """Get progress for a specific file.

    Args:
        filename: Name of the file

    Returns:
        File download task with progress
    """
    try:
        manager = get_sf_download_manager()
        task = await manager.get_file_task(filename)

        if not task:
            raise HTTPException(status_code=404, detail=f"File not found: {filename}")

        return task
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting file progress: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/download/reset")
async def reset_download() -> Dict:
    """Reset download stats and prepare for a new download.

    Returns:
        {
            "status": "reset"
        }
    """
    try:
        manager = get_sf_download_manager()
        manager.reset_stats()

        return {
            "status": "reset"
        }
    except Exception as e:
        logger.error(f"Error resetting download: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/download/retry/{source}")
async def retry_source(source: str) -> Dict:
    """Retry downloading a specific source.

    Args:
        source: Source name to retry

    Returns:
        {
            "status": "started",
            "source": str
        }
    """
    try:
        manager = get_sf_download_manager()

        if source not in manager.scrapers:
            raise HTTPException(status_code=404, detail=f"Unknown source: {source}")

        # Start download for single source
        import asyncio
        asyncio.create_task(
            manager.download_all(
                sources=[source],
                parallel=4,
                skip_existing=True
            )
        )

        return {
            "status": "started",
            "source": source
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrying source {source}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Upload ====================

@router.post("/upload")
async def upload_soundfont(file: UploadFile = File(...)) -> Dict:
    """Upload a SoundFont file.

    Args:
        file: SoundFont file (.sf2, .sfz)

    Returns:
        {
            "status": "uploaded",
            "filename": str,
            "format": str
        }
    """
    try:
        filename_lower = file.filename.lower()

        if not any(filename_lower.endswith(ext) for ext in ['.sf2', '.sfz', '.sf3']):
            raise HTTPException(
                status_code=400,
                detail="Only SoundFont files (.sf2, .sfz, .sf3) are supported"
            )

        # Determine format
        if filename_lower.endswith('.sfz'):
            sf_format = 'sfz'
        else:
            sf_format = 'sf2'

        # Save to user soundfont directory
        sf_dir = StoragePaths.get_soundfont_user_dir()
        sf_dir.mkdir(parents=True, exist_ok=True)
        safe_name = os.path.basename(file.filename)
        if not safe_name or safe_name.startswith('.'):
            raise HTTPException(status_code=400, detail="Invalid filename")
        file_path = sf_dir / safe_name

        import shutil
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return {
            "status": "uploaded",
            "filename": file.filename,
            "format": sf_format,
            "path": str(file_path)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading soundfont: {e}")
        raise HTTPException(status_code=500, detail=str(e))
