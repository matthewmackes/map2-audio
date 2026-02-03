"""
IR Library API Routes
Browse, search, and download impulse response libraries.
"""

import logging
from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.ir_library.download_manager import get_download_manager
from app.database import get_db, ImpulseResponse, IRCategory, NAMModel
from sqlalchemy import or_, and_

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/irs", tags=["impulse_responses"])


class DownloadRequest(BaseModel):
    """Request to start IR download."""
    sources: Optional[List[str]] = None  # None = all sources
    parallel: int = 4
    skip_existing: bool = True
    limit: Optional[int] = None  # Limit for tone3000 source (default: 10)


class IRSearchRequest(BaseModel):
    """IR search request."""
    query: Optional[str] = None
    category: Optional[str] = None
    library: Optional[str] = None
    min_rt60: Optional[float] = None
    max_rt60: Optional[float] = None
    favorites_only: bool = False


class IRRatingRequest(BaseModel):
    """Request to rate an IR."""
    rating: int  # 1-5


class Tone3000ApiKeyRequest(BaseModel):
    """Request to set TONE3000 API key."""
    api_key: str


# ==================== TONE3000 API Key Management ====================
# These routes must be defined before /{ir_id} to avoid path conflicts

@router.get("/tone3000/status")
async def get_tone3000_status() -> Dict:
    """Get TONE3000 authentication status.

    Returns:
        {
            "configured": bool,
            "authenticated": bool,
            "auth_url": str,
            "token_expires": str | null
        }
    """
    try:
        manager = get_download_manager()
        scraper = manager.get_tone3000_scraper()

        if not scraper:
            return {
                "configured": False,
                "authenticated": False,
                "auth_url": "https://www.tone3000.com/api/v1/auth",
                "token_expires": None
            }

        status = scraper.get_status()
        return {
            "configured": status.get("configured", False),
            "authenticated": status.get("authenticated", False),
            "auth_url": status.get("auth_url"),
            "token_expires": status.get("token_expires")
        }
    except Exception as e:
        logger.error(f"Error getting TONE3000 status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tone3000/api-key")
async def set_tone3000_api_key(request: Tone3000ApiKeyRequest) -> Dict:
    """Set TONE3000 API key for authentication.

    The API key is obtained after authenticating at the TONE3000 auth page.

    Args:
        request: API key from TONE3000

    Returns:
        {
            "status": "ok",
            "configured": true
        }
    """
    try:
        manager = get_download_manager()
        scraper = manager.get_tone3000_scraper()

        if not scraper:
            raise HTTPException(status_code=500, detail="TONE3000 scraper not initialized")

        scraper.set_api_key(request.api_key)

        return {
            "status": "ok",
            "configured": True
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting TONE3000 API key: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tone3000/test")
async def test_tone3000_auth() -> Dict:
    """Test TONE3000 authentication and fetch sample models.

    Returns:
        {
            "status": "ok",
            "authenticated": bool,
            "sample_models": [...]
        }
    """
    try:
        manager = get_download_manager()
        scraper = manager.get_tone3000_scraper()

        if not scraper:
            raise HTTPException(status_code=500, detail="TONE3000 scraper not initialized")

        if not scraper.is_configured():
            return {
                "status": "error",
                "authenticated": False,
                "message": "API key not configured"
            }

        # Try to discover a few models as a test
        models = await scraper.discover_irs(limit=5)

        return {
            "status": "ok",
            "authenticated": True,
            "sample_models": [
                {"name": m.filename, "author": m.author, "category": m.category}
                for m in models
            ]
        }
    except Exception as e:
        logger.error(f"Error testing TONE3000 auth: {e}")
        return {
            "status": "error",
            "authenticated": False,
            "message": str(e)
        }


# ==================== IR List and Detail ====================

@router.get("/")
async def list_irs(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    category: Optional[str] = None,
    library: Optional[str] = None
) -> Dict:
    """List available IRs with pagination.
    
    Args:
        limit: Number of results
        offset: Offset for pagination
        category: Filter by category
        library: Filter by library
        
    Returns:
        {
            "irs": [...],
            "total": int,
            "limit": int,
            "offset": int
        }
    """
    try:
        session = get_db()
        
        query = session.query(ImpulseResponse)
        
        # Apply filters
        if category:
            query = query.filter(ImpulseResponse.category == category)
        if library:
            query = query.filter(ImpulseResponse.library == library)
        
        # Get total count
        total = query.count()
        
        # Apply pagination
        irs = query.order_by(ImpulseResponse.name).offset(offset).limit(limit).all()
        
        # Convert to dicts
        ir_list = []
        for ir in irs:
            ir_list.append({
                "id": ir.id,
                "name": ir.name,
                "category": ir.category,
                "subcategory": ir.subcategory,
                "library": ir.library,
                "duration_seconds": ir.duration_seconds,
                "rt60": ir.rt60,
                "sample_rate": ir.sample_rate,
                "channels": ir.channels,
                "author": ir.author
            })
        
        session.close()
        
        return {
            "irs": ir_list,
            "total": total,
            "limit": limit,
            "offset": offset
        }
        
    except Exception as e:
        logger.error(f"Error listing IRs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Category and Library Routes ====================
# These routes must be defined before /{ir_id} to avoid path conflicts

@router.get("/categories/")
async def get_categories() -> Dict:
    """Get IR category tree.

    Returns:
        {
            "categories": [...],
            "count": int
        }
    """
    try:
        session = get_db()
        categories = session.query(IRCategory).order_by(IRCategory.display_order).all()

        cat_list = []
        for cat in categories:
            cat_list.append({
                "id": cat.id,
                "name": cat.name,
                "parent_id": cat.parent_id,
                "description": cat.description,
                "icon": cat.icon
            })

        session.close()

        return {
            "categories": cat_list,
            "count": len(cat_list)
        }

    except Exception as e:
        logger.error(f"Error getting categories: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/libraries/")
async def get_libraries() -> Dict:
    """Get available IR libraries.

    Returns:
        {
            "libraries": [
                {
                    "name": str,
                    "count": int,
                    "license": str
                },
                ...
            ]
        }
    """
    try:
        manager = get_download_manager()
        session = get_db()

        # NAM source names (these count from NAMModel table instead of ImpulseResponse)
        nam_sources = {'nam_github', 'tone3000'}

        # Get all scrapers and their discovered file counts
        libraries = []
        for lib_name in manager.scrapers.keys():
            if lib_name in nam_sources:
                # Count NAM models from NAMModel table
                # NAM files are stored with library prefix in their path
                count = session.query(NAMModel).filter(
                    NAMModel.file_path.contains(f'/{lib_name}/')
                ).count()
                license_str = "Various"
            else:
                # Check IR database for existing files
                count = session.query(ImpulseResponse).filter_by(library=lib_name).count()
                # Get license from first IR or from scraper
                ir = session.query(ImpulseResponse).filter_by(library=lib_name).first()
                license_str = ir.license if ir else "Free"

            libraries.append({
                "name": lib_name,
                "count": count,
                "license": license_str
            })

        # Also include user library if it exists
        user_count = session.query(ImpulseResponse).filter_by(library='user').count()
        if user_count > 0:
            libraries.append({
                "name": "user",
                "count": user_count,
                "license": "User uploaded"
            })

        session.close()

        return {
            "libraries": libraries
        }

    except Exception as e:
        logger.error(f"Error getting libraries: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
        manager = get_download_manager()
        return manager.get_progress()
    except Exception as e:
        logger.error(f"Error getting download status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== IR Detail ====================

@router.get("/{ir_id}")
async def get_ir(ir_id: int) -> Dict:
    """Get detailed IR information.
    
    Args:
        ir_id: IR database ID
        
    Returns:
        Complete IR metadata
    """
    try:
        session = get_db()
        ir = session.query(ImpulseResponse).filter_by(id=ir_id).first()
        
        if not ir:
            session.close()
            raise HTTPException(status_code=404, detail=f"IR {ir_id} not found")
        
        result = {
            "id": ir.id,
            "name": ir.name,
            "file_path": ir.file_path,
            "file_hash": ir.file_hash,
            "sample_rate": ir.sample_rate,
            "channels": ir.channels,
            "duration_seconds": ir.duration_seconds,
            "length_samples": ir.length_samples,
            "peak_amplitude": ir.peak_amplitude,
            "rms_level": ir.rms_level,
            "category": ir.category,
            "subcategory": ir.subcategory,
            "library": ir.library,
            "license": ir.license,
            "source_url": ir.source_url,
            "author": ir.author,
            "rt60": ir.rt60,
            "early_decay_time": ir.early_decay_time,
            "peak_location_ms": ir.peak_location_ms,
            "tags": ir.tags,
            "description": ir.description,
            "created_at": ir.created_at.isoformat() if ir.created_at else None
        }
        
        session.close()
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting IR: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search")
async def search_irs(request: IRSearchRequest) -> Dict:
    """Search IRs with filters.
    
    Args:
        request: Search parameters
        
    Returns:
        {
            "results": [...],
            "count": int
        }
    """
    try:
        session = get_db()
        query = session.query(ImpulseResponse)
        
        # Text search
        if request.query:
            search_term = f"%{request.query}%"
            query = query.filter(
                or_(
                    ImpulseResponse.name.ilike(search_term),
                    ImpulseResponse.description.ilike(search_term),
                    ImpulseResponse.category.ilike(search_term)
                )
            )
        
        # Category filter
        if request.category:
            query = query.filter(ImpulseResponse.category == request.category)
        
        # Library filter
        if request.library:
            query = query.filter(ImpulseResponse.library == request.library)
        
        # RT60 range filter
        if request.min_rt60 is not None:
            query = query.filter(ImpulseResponse.rt60 >= request.min_rt60)
        if request.max_rt60 is not None:
            query = query.filter(ImpulseResponse.rt60 <= request.max_rt60)
        
        # Execute query
        irs = query.order_by(ImpulseResponse.name).limit(100).all()

        results = []
        for ir in irs:
            results.append({
                "id": ir.id,
                "name": ir.name,
                "category": ir.category,
                "library": ir.library,
                "rt60": ir.rt60,
                "author": ir.author
            })
        
        session.close()
        
        return {
            "results": results,
            "count": len(results)
        }
        
    except Exception as e:
        logger.error(f"Error searching IRs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Scan and Import ====================

@router.post("/scan")
async def scan_existing_irs() -> Dict:
    """Scan downloaded IR and NAM directories and import files to database.

    Scans both IR and NAM directories for existing files not yet in the database.
    IR files go to ImpulseResponse table, NAM files go to NAMModel table.

    Returns:
        {
            "status": "ok",
            "ir_scanned": int,
            "ir_imported": int,
            "nam_scanned": int,
            "nam_imported": int,
            "skipped": int,
            "errors": int
        }
    """
    try:
        from app.services.ir_loader import get_ir_loader
        from app.paths import StoragePaths
        import os
        import hashlib

        loader = get_ir_loader()
        session = get_db()

        stats = {
            "ir_scanned": 0,
            "ir_imported": 0,
            "nam_scanned": 0,
            "nam_imported": 0,
            "skipped": 0,
            "errors": 0
        }

        ir_extensions = {'.wav', '.aif', '.aiff', '.flac'}
        nam_extensions = {'.nam'}

        # Scan IR directory
        ir_dir = StoragePaths.get_ir_download_dir()
        if ir_dir.exists():
            for root, dirs, files in os.walk(str(ir_dir)):
                for filename in files:
                    file_path = os.path.join(root, filename)
                    ext = os.path.splitext(filename.lower())[1]

                    if ext in ir_extensions:
                        stats["ir_scanned"] += 1
                        try:
                            result = loader.load_ir_file(file_path)
                            if result is None:
                                stats["errors"] += 1
                                continue

                            audio_data, sample_rate, metadata = result

                            # Check if already in database
                            existing = session.query(ImpulseResponse).filter_by(
                                file_hash=metadata['file_hash']
                            ).first()

                            if existing:
                                stats["skipped"] += 1
                                continue

                            # Determine library and category from path
                            rel_path = os.path.relpath(root, str(ir_dir))
                            path_parts = rel_path.split(os.sep)
                            library = path_parts[0] if path_parts else "unknown"
                            category = path_parts[1] if len(path_parts) > 1 else "uncategorized"
                            subcategory = path_parts[2] if len(path_parts) > 2 else None

                            ir_entry = ImpulseResponse(
                                name=metadata['file_name'],
                                file_path=file_path,
                                file_hash=metadata['file_hash'],
                                sample_rate=metadata['sample_rate'],
                                channels=metadata['channels'],
                                duration_seconds=metadata['duration_seconds'],
                                length_samples=metadata['length_samples'],
                                peak_amplitude=metadata['peak_amplitude'],
                                rms_level=metadata['rms_level'],
                                category=category,
                                subcategory=subcategory,
                                library=library,
                                license="Various",
                                rt60=metadata.get('rt60_seconds'),
                                early_decay_time=metadata.get('early_decay_time_seconds'),
                                peak_location_ms=metadata.get('peak_location_ms'),
                                estimated_characteristics=metadata.get('estimated', True)
                            )

                            session.add(ir_entry)
                            session.commit()
                            stats["ir_imported"] += 1

                        except Exception as e:
                            logger.warning(f"Error scanning IR {file_path}: {e}")
                            stats["errors"] += 1

        # Scan NAM directory
        nam_dir = StoragePaths.get_nam_system_dir()
        if nam_dir.exists():
            for root, dirs, files in os.walk(str(nam_dir)):
                for filename in files:
                    file_path = os.path.join(root, filename)
                    ext = os.path.splitext(filename.lower())[1]

                    if ext in nam_extensions:
                        stats["nam_scanned"] += 1
                        try:
                            # Compute file hash
                            with open(file_path, 'rb') as f:
                                file_hash = hashlib.sha256(f.read()).hexdigest()

                            # Check if already in database
                            existing = session.query(NAMModel).filter_by(
                                file_hash=file_hash
                            ).first()

                            if existing:
                                stats["skipped"] += 1
                                continue

                            # Determine library and category from path
                            rel_path = os.path.relpath(root, str(nam_dir))
                            path_parts = rel_path.split(os.sep)
                            library = path_parts[0] if path_parts else "unknown"
                            category = path_parts[1] if len(path_parts) > 1 else "uncategorized"

                            # Get file size
                            file_size = os.path.getsize(file_path)

                            # Extract name from filename (remove .nam extension)
                            model_name = os.path.splitext(filename)[0]

                            nam_entry = NAMModel(
                                name=model_name,
                                file_path=file_path,
                                file_hash=file_hash,
                                file_size=file_size,
                                model_type="unknown",
                                category=category,
                                license="Various"
                            )

                            session.add(nam_entry)
                            session.commit()
                            stats["nam_imported"] += 1

                        except Exception as e:
                            logger.warning(f"Error scanning NAM {file_path}: {e}")
                            stats["errors"] += 1

        session.close()

        return {
            "status": "ok",
            **stats
        }

    except Exception as e:
        logger.error(f"Error scanning files: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Download Management ====================

@router.post("/download")
async def start_download(request: DownloadRequest) -> Dict:
    """Start IR library download.

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
        manager = get_download_manager()

        # Start download in background (non-blocking)
        import asyncio
        asyncio.create_task(
            manager.download_all(
                sources=request.sources,
                parallel=request.parallel,
                skip_existing=request.skip_existing,
                limit=request.limit
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
        manager = get_download_manager()
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
        manager = get_download_manager()
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
        manager = get_download_manager()
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
        manager = get_download_manager()
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
        manager = get_download_manager()
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
        manager = get_download_manager()
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
        manager = get_download_manager()

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


# ==================== IR Favorites and Ratings ====================

@router.post("/{ir_id}/favorite")
async def toggle_favorite(ir_id: int) -> Dict:
    """Toggle favorite status for IR.
    
    Args:
        ir_id: IR ID
        
    Returns:
        {
            "status": "ok",
            "is_favorite": bool
        }
    """
    try:
        session = get_db()
        ir = session.query(ImpulseResponse).filter_by(id=ir_id).first()
        
        if not ir:
            session.close()
            raise HTTPException(status_code=404, detail=f"IR {ir_id} not found")
        
        ir.is_favorite = not ir.is_favorite
        session.commit()
        
        result = {
            "status": "ok",
            "is_favorite": ir.is_favorite
        }
        
        session.close()
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error toggling favorite: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{ir_id}/rating")
async def set_rating(ir_id: int, request: IRRatingRequest) -> Dict:
    """Set rating for IR.
    
    Args:
        ir_id: IR ID
        request: Rating (1-5)
        
    Returns:
        {
            "status": "ok",
            "rating": int
        }
    """
    try:
        if not 1 <= request.rating <= 5:
            raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
        
        session = get_db()
        ir = session.query(ImpulseResponse).filter_by(id=ir_id).first()
        
        if not ir:
            session.close()
            raise HTTPException(status_code=404, detail=f"IR {ir_id} not found")
        
        ir.rating = request.rating
        session.commit()
        session.close()
        
        return {
            "status": "ok",
            "rating": request.rating
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting rating: {e}")
        raise HTTPException(status_code=500, detail=str(e))
