"""
NAM (Neural Amp Modeler) API Routes

All NAM model loading goes through the RT-safe JUCE C++ engine.
This module provides:
- Model discovery and scanning
- Database-backed metadata (favorites, ratings, tags)
- Upload support
- Status/metering endpoints

IMPORTANT: Audio processing is handled ONLY by the JUCE C++ NAMProcessor.
The Python side handles file management and metadata only.
"""

import logging
import os
import hashlib
from typing import List, Dict, Optional
from pathlib import Path

logger = logging.getLogger(__name__)

try:
    from fastapi import APIRouter, HTTPException, Query, UploadFile, File
    from pydantic import BaseModel
    from app.paths import StoragePaths
    from app.database import get_db, NAMModel
    from app.services.juce_engine_service import get_audio_engine
    from sqlalchemy import or_

    router = APIRouter(prefix="/api/nam", tags=["nam"])

    # ==================== Pydantic Models ====================

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

    class NAMGainRequest(BaseModel):
        gain_db: float

    # ==================== Helper Functions ====================

    def _scan_nam_models() -> List[Dict]:
        """Scan directories for NAM model files (.nam format).

        Scans all configured NAM paths including:
        - User directory (~/.local/share/map2/nam)
        - System directory (/var/lib/map2/nam)
        - Extra paths from config
        """
        models = []
        seen_names = set()

        scan_dirs = StoragePaths.get_all_nam_paths(include_nonexistent=False)

        # Legacy config location
        legacy_dir = Path.home() / ".config" / "map2" / "nam_models"
        if legacy_dir.exists() and legacy_dir not in scan_dirs:
            scan_dirs.append(legacy_dir)

        for scan_dir in scan_dirs:
            if not scan_dir.exists():
                continue
            for model_file in scan_dir.glob("**/*.nam"):
                if model_file.stem in seen_names:
                    continue
                seen_names.add(model_file.stem)

                models.append({
                    "name": model_file.stem,
                    "path": str(model_file),
                    "type": _detect_model_type(model_file),
                    "size_mb": model_file.stat().st_size / (1024 * 1024)
                })

        return models

    def _detect_model_type(model_path: Path) -> str:
        """Detect if model is amp, pedal, or preamp based on filename."""
        name_lower = model_path.stem.lower()

        if any(x in name_lower for x in ['amp', 'amplifier', 'head']):
            return 'amp'
        elif any(x in name_lower for x in ['pedal', 'drive', 'dist', 'fuzz', 'boost']):
            return 'pedal'
        elif 'preamp' in name_lower:
            return 'preamp'
        else:
            return 'unknown'

    def _find_model_path(model_name: str) -> Optional[str]:
        """Find the full path for a model by name."""
        models = _scan_nam_models()
        for m in models:
            if m['name'] == model_name:
                return m['path']
        return None

    # ==================== Status Endpoints ====================

    @router.get("/")
    async def get_nam_root():
        """Get NAM processor status from JUCE engine."""
        engine = get_audio_engine()
        status = await engine.get_nam_status()

        # Add model count
        models = _scan_nam_models()
        status["total_models_found"] = len(models)

        return status

    @router.get("/status")
    async def get_nam_status():
        """Get NAM model status for frontend.

        Returns the format expected by the frontend NAMStatus interface.
        """
        engine = get_audio_engine()

        # Get status from JUCE engine
        available = await engine.is_nam_available()
        model_loaded = await engine.is_nam_model_loaded()
        loading = await engine.is_nam_loading()
        bypassed = await engine.is_nam_bypassed()
        model_info = await engine.get_nam_model_info()

        # Scan for available models
        models = _scan_nam_models()
        model_names = [m['name'] for m in models]

        # Get metering
        input_level = await engine.get_nam_input_level()
        output_level = await engine.get_nam_output_level()

        return {
            "available": available,
            "activeModel": model_info.get("name") if model_loaded else None,
            "loading": loading,
            "mix": 100,
            "bypass": bypassed,
            "inputLevel": input_level,
            "outputLevel": output_level,
            "peakInput": input_level,  # Simplified - use same as current
            "peakOutput": output_level,
            "latency": 0,  # NAM models are zero-latency (causal)
            "availableModels": model_names
        }

    # ==================== Categories ====================

    @router.get("/categories")
    async def get_nam_categories() -> Dict:
        """Get available NAM model categories and amp types."""
        try:
            session = get_db()

            categories = session.query(NAMModel.category).distinct().all()
            category_list = [c[0] for c in categories if c[0]]

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
        """List available NAM models with optional filtering."""
        try:
            session = get_db()
            query = session.query(NAMModel)

            if category:
                query = query.filter(NAMModel.category == category)
            if amp_type:
                query = query.filter(NAMModel.amp_type == amp_type)
            if favorites_only:
                query = query.filter(NAMModel.is_favorite == True)

            total = query.count()
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
            models = _scan_nam_models()
            return {"models": models, "total": len(models), "limit": limit, "offset": offset}

    # ==================== Search ====================

    @router.post("/search")
    async def search_nam_models(request: NAMSearchRequest) -> Dict:
        """Search NAM models by text and filters."""
        try:
            session = get_db()
            query = session.query(NAMModel)

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

            if request.category:
                query = query.filter(NAMModel.category == request.category)
            if request.amp_type:
                query = query.filter(NAMModel.amp_type == request.amp_type)
            if request.favorites_only:
                query = query.filter(NAMModel.is_favorite == True)

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
        """Get detailed NAM model information."""
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

    # ==================== Load/Unload (RT-safe via JUCE) ====================

    @router.post("/models/{model_name}/load")
    async def load_nam_model(model_name: str):
        """Load a NAM model via RT-safe JUCE C++ engine.

        This is the ONLY way to load NAM models for real-time audio.
        Loading happens on a background thread to avoid blocking audio.
        """
        # Find the model file path
        model_path = _find_model_path(model_name)
        if not model_path:
            raise HTTPException(status_code=404, detail=f"Model not found: {model_name}")

        # Load via JUCE engine (RT-safe)
        engine = get_audio_engine()
        success = await engine.load_nam_model(model_path)

        if not success:
            raise HTTPException(status_code=500, detail="Failed to start model loading")

        logger.info(f"NAM model loading started: {model_name} ({model_path})")
        return {"status": "loading", "model": model_name, "path": model_path}

    @router.post("/models/{model_name}/activate")
    async def activate_nam_model(model_name: str):
        """Activate a NAM model (alias for load)."""
        return await load_nam_model(model_name)

    @router.post("/unload")
    async def unload_nam_model():
        """Unload the current NAM model."""
        engine = get_audio_engine()
        await engine.unload_nam_model()
        return {"status": "unloaded"}

    # ==================== Controls ====================

    @router.post("/bypass")
    async def set_nam_bypass(bypass: bool = True):
        """Set NAM bypass state."""
        engine = get_audio_engine()
        await engine.set_nam_bypass(bypass)
        return {"status": "ok", "bypass": bypass}

    @router.post("/input-gain")
    async def set_nam_input_gain(request: NAMGainRequest):
        """Set NAM input gain in dB."""
        engine = get_audio_engine()
        await engine.set_nam_input_gain(request.gain_db)
        return {"status": "ok", "input_gain": request.gain_db}

    @router.post("/output-gain")
    async def set_nam_output_gain(request: NAMGainRequest):
        """Set NAM output gain in dB."""
        engine = get_audio_engine()
        await engine.set_nam_output_gain(request.gain_db)
        return {"status": "ok", "output_gain": request.gain_db}

    @router.post("/normalize")
    async def set_nam_normalize(normalize: bool = True):
        """Enable/disable NAM output normalization."""
        engine = get_audio_engine()
        await engine.set_nam_normalize(normalize)
        return {"status": "ok", "normalize": normalize}

    # ==================== Favorites and Ratings ====================

    @router.post("/models/{model_id}/favorite")
    async def toggle_nam_favorite(model_id: int) -> Dict:
        """Toggle favorite status for NAM model."""
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
        """Set rating for NAM model."""
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
        """Upload a NAM model file."""
        try:
            if not file.filename.lower().endswith('.nam'):
                raise HTTPException(status_code=400, detail="File must be a .nam file")

            upload_dir = StoragePaths.get_nam_user_dir()
            upload_dir.mkdir(parents=True, exist_ok=True)

            file_path = upload_dir / file.filename
            content = await file.read()

            with open(file_path, 'wb') as f:
                f.write(content)

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

    # ==================== Rescan ====================

    @router.post("/rescan")
    async def rescan_nam_models() -> Dict:
        """Rescan NAM model directories."""
        models = _scan_nam_models()
        return {
            "status": "ok",
            "count": len(models),
            "models": models
        }

except ImportError as e:
    # Create stub router if dependencies not available
    from fastapi import APIRouter
    router = APIRouter(prefix="/api/nam", tags=["nam"])

    @router.get("/")
    async def get_nam_root():
        return {
            "available": False,
            "error": "NAM dependencies not installed"
        }

    @router.get("/status")
    async def get_nam_status():
        return {
            "available": False,
            "activeModel": None,
            "loading": False,
            "bypass": False,
            "inputLevel": -100,
            "outputLevel": -100,
            "availableModels": []
        }
