"""
NAM (Neural Amp Modeler) API Routes

Enhanced with:
- Database-backed model metadata
- Favorites and ratings
- Search and categories
- Upload support
"""

import logging
import os
import hashlib
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

try:
    from fastapi import APIRouter, HTTPException, Query, UploadFile, File
    from pydantic import BaseModel
    from app.services.nam_processor import NAMProcessor
    from app.paths import StoragePaths
    from app.database import get_db, NAMModel
    from sqlalchemy import or_

    router = APIRouter(prefix="/api/nam", tags=["nam"])

    # Initialize NAM processor
    _nam_processor = NAMProcessor()

    class NAMModelInfo(BaseModel):
        name: str
        type: str

    class NAMSearchRequest(BaseModel):
        query: str = ""
        category: Optional[str] = None
        amp_type: Optional[str] = None
        favorites_only: bool = False

    class NAMRatingRequest(BaseModel):
        rating: int  # 1-5

    # ==================== Status Endpoints ====================

    @router.get("/")
    async def get_nam_root():
        """Get NAM processor status including GPU information."""
        status = _nam_processor.get_status()
        gpu_info = _nam_processor.get_gpu_info()
        return {**status, "gpu_details": gpu_info}

    @router.get("/status")
    async def get_nam_status():
        """Get NAM status for the native plugins UI.

        Returns the format expected by the frontend NAMStatus interface.
        """
        from app.services.nam_processor import NAM_AVAILABLE
        from app.services.native_plugin_meters import get_native_plugin_meters

        # Scan for available models
        models = _nam_processor.scan_models()
        model_names = [m['name'] for m in models]

        # Get active model info
        active_model = _nam_processor.active_model
        active_name = active_model.name if active_model else None
        latency_ms = (active_model.get_latency_samples() / 48000 * 1000) if active_model else 0

        # Get real-time audio levels from metering service
        meters = get_native_plugin_meters()
        levels = meters.get_levels("nam")

        return {
            "available": NAM_AVAILABLE,
            "activeModel": active_name,
            "mix": 100,  # TODO: Store mix level in processor
            "bypass": active_model._is_bypassed if active_model else False,
            "inputLevel": levels["inputLevel"],
            "outputLevel": levels["outputLevel"],
            "peakInput": levels["peakInput"],
            "peakOutput": levels["peakOutput"],
            "latency": latency_ms,
            "availableModels": model_names
        }

    @router.get("/gpu")
    async def get_gpu_status():
        """Get detailed GPU/acceleration status."""
        return _nam_processor.get_gpu_info()

    # ==================== Categories ====================

    @router.get("/categories")
    async def get_nam_categories() -> Dict:
        """Get available NAM model categories and amp types.

        Returns:
            {
                "categories": ["Amp Model", ...],
                "amp_types": ["amp", "pedal", "preamp", ...]
            }
        """
        try:
            session = get_db()

            # Get unique categories
            categories = session.query(NAMModel.category).distinct().all()
            category_list = [c[0] for c in categories if c[0]]

            # Get unique amp types
            amp_types = session.query(NAMModel.amp_type).distinct().all()
            amp_type_list = [t[0] for t in amp_types if t[0]]

            session.close()

            return {
                "categories": sorted(category_list),
                "amp_types": sorted(amp_type_list)
            }
        except Exception as e:
            logger.error(f"Error getting NAM categories: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    # ==================== Model Listing ====================

    @router.get("/models")
    async def list_nam_models(
        limit: int = Query(100, ge=1, le=500),
        offset: int = Query(0, ge=0),
        category: Optional[str] = None,
        amp_type: Optional[str] = None,
        favorites_only: bool = False
    ) -> Dict:
        """List available NAM models with optional filtering.

        Args:
            limit: Max models to return
            offset: Pagination offset
            category: Filter by category
            amp_type: Filter by amp type (amp, pedal, preamp)
            favorites_only: Only return favorites

        Returns:
            {
                "models": [...],
                "total": int,
                "limit": int,
                "offset": int
            }
        """
        try:
            session = get_db()
            query = session.query(NAMModel)

            # Apply filters
            if category:
                query = query.filter(NAMModel.category == category)
            if amp_type:
                query = query.filter(NAMModel.amp_type == amp_type)
            if favorites_only:
                query = query.filter(NAMModel.is_favorite == True)

            # Get total count
            total = query.count()

            # Get page
            models = query.order_by(NAMModel.name).offset(offset).limit(limit).all()

            model_list = []
            for m in models:
                model_list.append({
                    "id": m.id,
                    "name": m.name,
                    "file_path": m.file_path,
                    "model_type": m.model_type,
                    "category": m.category,
                    "amp_type": m.amp_type,
                    "amp_name": m.amp_name,
                    "author": m.author,
                    "is_favorite": m.is_favorite,
                    "rating": m.rating,
                    "tags": m.tags or []
                })

            session.close()

            return {
                "models": model_list,
                "total": total,
                "limit": limit,
                "offset": offset
            }
        except Exception as e:
            logger.error(f"Error listing NAM models: {e}")
            # Fall back to file-based listing
            models = _nam_processor.scan_models()
            return {"models": models, "total": len(models), "limit": limit, "offset": offset}

    # ==================== Search ====================

    @router.post("/search")
    async def search_nam_models(request: NAMSearchRequest) -> Dict:
        """Search NAM models by text and filters.

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
            query = session.query(NAMModel)

            # Text search
            if request.query:
                search_term = f"%{request.query}%"
                query = query.filter(
                    or_(
                        NAMModel.name.ilike(search_term),
                        NAMModel.amp_name.ilike(search_term),
                        NAMModel.author.ilike(search_term),
                        NAMModel.description.ilike(search_term)
                    )
                )

            # Category filter
            if request.category:
                query = query.filter(NAMModel.category == request.category)

            # Amp type filter
            if request.amp_type:
                query = query.filter(NAMModel.amp_type == request.amp_type)

            # Favorites filter
            if request.favorites_only:
                query = query.filter(NAMModel.is_favorite == True)

            # Execute
            models = query.order_by(NAMModel.name).limit(100).all()

            results = []
            for m in models:
                results.append({
                    "id": m.id,
                    "name": m.name,
                    "category": m.category,
                    "amp_type": m.amp_type,
                    "amp_name": m.amp_name,
                    "author": m.author,
                    "is_favorite": m.is_favorite,
                    "rating": m.rating
                })

            session.close()

            return {
                "results": results,
                "count": len(results)
            }
        except Exception as e:
            logger.error(f"Error searching NAM models: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    # ==================== Model Detail ====================

    @router.get("/models/{model_id}")
    async def get_nam_model(model_id: int) -> Dict:
        """Get detailed NAM model information.

        Args:
            model_id: Model database ID

        Returns:
            Complete model metadata
        """
        try:
            session = get_db()
            model = session.query(NAMModel).filter_by(id=model_id).first()

            if not model:
                session.close()
                raise HTTPException(status_code=404, detail=f"Model {model_id} not found")

            result = {
                "id": model.id,
                "name": model.name,
                "file_path": model.file_path,
                "file_hash": model.file_hash,
                "file_size": model.file_size,
                "model_type": model.model_type,
                "sample_rate": model.sample_rate,
                "input_gain": model.input_gain,
                "output_gain": model.output_gain,
                "category": model.category,
                "amp_type": model.amp_type,
                "amp_name": model.amp_name,
                "author": model.author,
                "description": model.description,
                "tags": model.tags or [],
                "license": model.license,
                "source_url": model.source_url,
                "is_favorite": model.is_favorite,
                "rating": model.rating,
                "created_at": model.created_at.isoformat() if model.created_at else None
            }

            session.close()
            return result

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting NAM model: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    # ==================== Load/Activate ====================

    @router.post("/models/{model_name}/load")
    async def load_nam_model(model_name: str):
        """Load a NAM model (also activates it)."""
        success = _nam_processor.load_model(model_name)
        if not success:
            raise HTTPException(status_code=404, detail="Model not found or failed to load")
        # Also activate after loading
        _nam_processor.set_active_model(model_name)
        return {"status": "loaded", "model": model_name}

    @router.post("/models/{model_name}/activate")
    async def activate_nam_model(model_name: str):
        """Set active NAM model (deprecated, use load instead)."""
        success = _nam_processor.set_active_model(model_name)
        if not success:
            raise HTTPException(status_code=404, detail="Model not found")
        return {"status": "activated", "model": model_name}

    # ==================== Favorites and Ratings ====================

    @router.post("/models/{model_id}/favorite")
    async def toggle_nam_favorite(model_id: int) -> Dict:
        """Toggle favorite status for NAM model.

        Args:
            model_id: Model ID

        Returns:
            {
                "status": "ok",
                "is_favorite": bool
            }
        """
        try:
            session = get_db()
            model = session.query(NAMModel).filter_by(id=model_id).first()

            if not model:
                session.close()
                raise HTTPException(status_code=404, detail=f"Model {model_id} not found")

            model.is_favorite = not model.is_favorite
            session.commit()

            new_status = model.is_favorite
            session.close()

            return {
                "status": "ok",
                "is_favorite": new_status
            }

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error toggling favorite: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @router.put("/models/{model_id}/rating")
    async def set_nam_rating(model_id: int, request: NAMRatingRequest) -> Dict:
        """Set rating for NAM model.

        Args:
            model_id: Model ID
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
            model = session.query(NAMModel).filter_by(id=model_id).first()

            if not model:
                session.close()
                raise HTTPException(status_code=404, detail=f"Model {model_id} not found")

            model.rating = request.rating
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

    # ==================== Upload ====================

    @router.post("/upload")
    async def upload_nam_model(file: UploadFile = File(...)) -> Dict:
        """Upload a NAM model file.

        Args:
            file: NAM model file (.nam)

        Returns:
            {
                "status": "ok",
                "model": {...}
            }
        """
        try:
            # Validate file extension
            if not file.filename.lower().endswith('.nam'):
                raise HTTPException(status_code=400, detail="File must be a .nam file")

            # Get upload directory
            upload_dir = StoragePaths.get_nam_user_dir()
            upload_dir.mkdir(parents=True, exist_ok=True)

            # Save file
            file_path = upload_dir / file.filename
            content = await file.read()

            with open(file_path, 'wb') as f:
                f.write(content)

            # Compute hash
            file_hash = hashlib.sha256(content).hexdigest()

            # Check if already in database
            session = get_db()
            existing = session.query(NAMModel).filter_by(file_hash=file_hash).first()

            if existing:
                session.close()
                return {
                    "status": "exists",
                    "model": {
                        "id": existing.id,
                        "name": existing.name
                    }
                }

            # Create database entry
            model_name = os.path.splitext(file.filename)[0]

            new_model = NAMModel(
                name=model_name,
                file_path=str(file_path),
                file_hash=file_hash,
                file_size=len(content),
                model_type="unknown",
                category="User",
                license="User uploaded"
            )

            session.add(new_model)
            session.commit()

            model_id = new_model.id
            session.close()

            logger.info(f"Uploaded NAM model: {file.filename}")

            return {
                "status": "ok",
                "model": {
                    "id": model_id,
                    "name": model_name,
                    "file_path": str(file_path)
                }
            }

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error uploading NAM model: {e}")
            raise HTTPException(status_code=500, detail=str(e))

except ImportError as e:
    # Create stub router if dependencies not available
    from fastapi import APIRouter
    router = APIRouter(prefix="/api/nam", tags=["nam"])

    @router.get("/")
    async def get_nam_root():
        # Use default path from config schema when dependencies unavailable
        return {
            "available": False,
            "torch_available": False,
            "cuda_available": False,
            "mps_available": False,
            "device": "cpu",
            "gpu_info": None,
            "model_directory": "~/.local/share/map2/nam",  # Default from config
            "loaded_models": [],
            "active_model": None,
            "active_model_stats": None,
            "total_models_found": 0,
            "error": "NAM dependencies not installed"
        }

    @router.get("/status")
    async def get_nam_status():
        # Fallback status when NAM dependencies not available
        return {
            "available": False,
            "activeModel": None,
            "mix": 100,
            "bypass": False,
            "inputLevel": -60,
            "outputLevel": -60,
            "peakInput": -60,
            "peakOutput": -60,
            "latency": 0,
            "availableModels": []
        }

    @router.get("/gpu")
    async def get_gpu_status():
        return {
            "available": False,
            "reason": "PyTorch not installed",
        }
