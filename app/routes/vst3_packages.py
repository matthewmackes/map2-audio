"""
VST3 Packages Routes - API endpoints for VST3 plugin package management
"""

import logging
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks

try:
    from app.services.vst3_library import get_vst3_download_manager, VST3DownloadManager
    VST3_PACKAGES_AVAILABLE = True
except ImportError as e:
    VST3_PACKAGES_AVAILABLE = False
    import_error = str(e)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/vst3-packages", tags=["vst3-packages"])


@router.get("/sources")
async def get_vst3_sources() -> Dict[str, Any]:
    """
    Get available VST3 plugin sources.

    Returns:
        List of available sources
    """
    if not VST3_PACKAGES_AVAILABLE:
        return {
            "sources": [],
            "count": 0,
            "error": "VST3 packages service not available"
        }

    try:
        manager = get_vst3_download_manager()
        sources = manager.get_available_sources()

        return {
            "sources": sources,
            "count": len(sources)
        }

    except Exception as e:
        logger.error(f"Error getting VST3 sources: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/discover")
async def discover_vst3_packages(sources: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Discover available VST3 packages from sources.

    Args:
        sources: List of source names (None = all)

    Returns:
        Discovery results
    """
    if not VST3_PACKAGES_AVAILABLE:
        return {
            "packages": [],
            "count": 0,
            "error": "VST3 packages service not available"
        }

    try:
        manager = get_vst3_download_manager()
        discovered = await manager.discover_all(sources)

        # Flatten and format packages
        packages = []
        for source, plugins in discovered.items():
            for plugin in plugins:
                packages.append({
                    "source": source,
                    "name": plugin.name,
                    "filename": plugin.filename,
                    "category": plugin.category,
                    "author": plugin.author,
                    "version": plugin.version,
                    "license": plugin.license,
                    "description": plugin.description,
                    "tags": plugin.tags,
                    "file_size": plugin.file_size_bytes,
                    "url": plugin.url,
                    "homepage": plugin.homepage,
                })

        return {
            "packages": packages,
            "count": len(packages),
            "sources_queried": list(discovered.keys())
        }

    except Exception as e:
        logger.error(f"Error discovering VST3 packages: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/packages")
async def list_vst3_packages() -> Dict[str, Any]:
    """
    List all discovered VST3 packages.

    Returns:
        List of packages
    """
    if not VST3_PACKAGES_AVAILABLE:
        return {"packages": [], "count": 0}

    try:
        manager = get_vst3_download_manager()
        packages = manager.get_discovered_packages()

        return {
            "packages": packages,
            "count": len(packages)
        }

    except Exception as e:
        logger.error(f"Error listing VST3 packages: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/download")
async def download_vst3_packages(
    background_tasks: BackgroundTasks,
    sources: Optional[List[str]] = None,
    parallel: int = 2
) -> Dict[str, Any]:
    """
    Start downloading VST3 packages from sources.

    Args:
        sources: List of source names (None = all)
        parallel: Number of parallel downloads

    Returns:
        Download status
    """
    if not VST3_PACKAGES_AVAILABLE:
        raise HTTPException(status_code=503, detail="VST3 packages service not available")

    try:
        manager = get_vst3_download_manager()

        if manager.is_downloading:
            return {
                "status": "already_running",
                "message": "Download already in progress",
                "progress": manager.get_progress()
            }

        # Start download in background
        async def run_download():
            await manager.download_all(sources=sources, parallel=parallel)

        background_tasks.add_task(run_download)

        return {
            "status": "started",
            "message": "Download started in background",
            "sources": sources or list(manager.scrapers.keys())
        }

    except Exception as e:
        logger.error(f"Error starting VST3 download: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/progress")
async def get_download_progress() -> Dict[str, Any]:
    """
    Get current download progress.

    Returns:
        Download progress info
    """
    if not VST3_PACKAGES_AVAILABLE:
        return {
            "is_downloading": False,
            "progress_percent": 0,
            "stats": None
        }

    try:
        manager = get_vst3_download_manager()
        return manager.get_progress()

    except Exception as e:
        logger.error(f"Error getting progress: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cancel")
async def cancel_download() -> Dict[str, str]:
    """
    Cancel ongoing download.

    Returns:
        Cancellation status
    """
    if not VST3_PACKAGES_AVAILABLE:
        raise HTTPException(status_code=503, detail="VST3 packages service not available")

    try:
        manager = get_vst3_download_manager()
        await manager.cancel_download()

        return {
            "status": "success",
            "message": "Download cancelled"
        }

    except Exception as e:
        logger.error(f"Error cancelling download: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reset")
async def reset_stats() -> Dict[str, str]:
    """
    Reset download statistics.

    Returns:
        Reset status
    """
    if not VST3_PACKAGES_AVAILABLE:
        raise HTTPException(status_code=503, detail="VST3 packages service not available")

    try:
        manager = get_vst3_download_manager()
        manager.reset_stats()

        return {
            "status": "success",
            "message": "Statistics reset"
        }

    except Exception as e:
        logger.error(f"Error resetting stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/install-path")
async def get_install_path() -> Dict[str, str]:
    """
    Get VST3 installation path.

    Returns:
        Installation path info
    """
    if not VST3_PACKAGES_AVAILABLE:
        return {"path": "~/.vst3", "available": False}

    try:
        manager = get_vst3_download_manager()
        import os

        return {
            "path": manager.install_path,
            "exists": os.path.isdir(manager.install_path),
            "available": True
        }

    except Exception as e:
        logger.error(f"Error getting install path: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/source/{source_name}")
async def get_source_packages(source_name: str) -> Dict[str, Any]:
    """
    Get packages from a specific source.

    Args:
        source_name: Name of the source

    Returns:
        Packages from the source
    """
    if not VST3_PACKAGES_AVAILABLE:
        return {"packages": [], "count": 0}

    try:
        manager = get_vst3_download_manager()

        if source_name not in manager.scrapers:
            raise HTTPException(status_code=404, detail=f"Unknown source: {source_name}")

        scraper = manager.scrapers[source_name]
        plugins = scraper.discovered_plugins

        packages = []
        for plugin in plugins:
            packages.append({
                "source": source_name,
                "name": plugin.name,
                "filename": plugin.filename,
                "category": plugin.category,
                "author": plugin.author,
                "version": plugin.version,
                "license": plugin.license,
                "description": plugin.description,
                "tags": plugin.tags,
                "file_size": plugin.file_size_bytes,
                "url": plugin.url,
                "homepage": plugin.homepage,
            })

        return {
            "source": source_name,
            "packages": packages,
            "count": len(packages)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting source packages: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/source/{source_name}/discover")
async def discover_source_packages(source_name: str) -> Dict[str, Any]:
    """
    Discover packages from a specific source.

    Args:
        source_name: Name of the source

    Returns:
        Discovered packages
    """
    if not VST3_PACKAGES_AVAILABLE:
        return {"packages": [], "count": 0}

    try:
        manager = get_vst3_download_manager()

        if source_name not in manager.scrapers:
            raise HTTPException(status_code=404, detail=f"Unknown source: {source_name}")

        discovered = await manager.discover_all([source_name])
        plugins = discovered.get(source_name, [])

        packages = []
        for plugin in plugins:
            packages.append({
                "source": source_name,
                "name": plugin.name,
                "filename": plugin.filename,
                "category": plugin.category,
                "author": plugin.author,
                "version": plugin.version,
                "license": plugin.license,
                "description": plugin.description,
                "tags": plugin.tags,
                "file_size": plugin.file_size_bytes,
                "url": plugin.url,
                "homepage": plugin.homepage,
            })

        return {
            "source": source_name,
            "packages": packages,
            "count": len(packages)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error discovering source packages: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/source/{source_name}/download")
async def download_source_packages(
    source_name: str,
    background_tasks: BackgroundTasks
) -> Dict[str, Any]:
    """
    Download packages from a specific source.

    Args:
        source_name: Name of the source

    Returns:
        Download status
    """
    if not VST3_PACKAGES_AVAILABLE:
        raise HTTPException(status_code=503, detail="VST3 packages service not available")

    try:
        manager = get_vst3_download_manager()

        if source_name not in manager.scrapers:
            raise HTTPException(status_code=404, detail=f"Unknown source: {source_name}")

        if manager.is_downloading:
            return {
                "status": "already_running",
                "message": "Download already in progress",
                "progress": manager.get_progress()
            }

        # Start download in background
        async def run_download():
            await manager.download_all(sources=[source_name])

        background_tasks.add_task(run_download)

        return {
            "status": "started",
            "message": f"Download started for {source_name}",
            "source": source_name
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting source download: {e}")
        raise HTTPException(status_code=500, detail=str(e))
