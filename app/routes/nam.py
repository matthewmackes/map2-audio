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

import asyncio
import logging
from typing import List, Dict, Optional
from pathlib import Path

logger = logging.getLogger(__name__)

try:
    from fastapi import APIRouter, HTTPException, Query, UploadFile, File
    from pydantic import BaseModel
    from app.paths import StoragePaths
    from app.database import Chain, ChainPlugin, get_db, get_db_session, NAMModel
    from app.services.juce_engine_service import get_audio_engine
    from app.services.upload_service import AssetType, get_upload_service
    from sqlalchemy import or_

    router = APIRouter(prefix="/api/nam", tags=["nam"])
    NAM_PLUGIN_URI = "map2://juce/nam"
    NAM_CONFIG_PLUGIN_URIS = (NAM_PLUGIN_URI, "urn:map2:nam-player")

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

    def _has_plugin_position(plugin_position: Optional[int]) -> bool:
        return isinstance(plugin_position, int) and plugin_position >= 0

    async def _resolve_scoped_instance_id(
        engine,
        instance_id: Optional[int],
        plugin_position: Optional[int],
    ) -> Optional[int]:
        explicit_instance_id = instance_id if isinstance(instance_id, int) and instance_id > 0 else None
        resolver = getattr(engine, "resolve_instance_id", None)
        if callable(resolver):
            try:
                resolved_instance_id = await resolver(
                    NAM_PLUGIN_URI,
                    plugin_position,
                    fallback_instance_id=explicit_instance_id,
                )
            except TypeError:
                resolved_instance_id = await resolver(NAM_PLUGIN_URI, plugin_position)
                if not isinstance(resolved_instance_id, int) or resolved_instance_id <= 0:
                    resolved_instance_id = explicit_instance_id
            if (
                explicit_instance_id is not None
                and isinstance(resolved_instance_id, int)
                and resolved_instance_id > 0
                and resolved_instance_id != explicit_instance_id
            ):
                logger.info(
                    "NAM instance remapped from stale instance_id=%s to instance_id=%s using plugin_position=%s",
                    explicit_instance_id,
                    resolved_instance_id,
                    plugin_position,
                )
            return resolved_instance_id

        if explicit_instance_id is not None:
            return explicit_instance_id
        if not _has_plugin_position(plugin_position):
            return None

        legacy_resolver = getattr(engine, "_get_instance_id_for_uri", None)
        if callable(legacy_resolver):
            return await asyncio.to_thread(legacy_resolver, NAM_PLUGIN_URI, plugin_position)

        return None

    async def _runtime_has_plugin_uri(engine, plugin_uri: str) -> bool:
        getter = getattr(engine, "get_current_pedalboard", None)
        if not callable(getter):
            return False

        try:
            pedalboard = await getter()
        except Exception:
            return False

        if not isinstance(pedalboard, dict):
            return False

        items = pedalboard.get("items")
        if not isinstance(items, list):
            items = pedalboard.get("plugins")
        if not isinstance(items, list):
            return False

        return any(
            isinstance(item, dict) and item.get("uri") == plugin_uri
            for item in items
        )

    async def _requires_runtime_nam_scope(engine, plugin_position: Optional[int]) -> bool:
        return _has_plugin_position(plugin_position) and await _runtime_has_plugin_uri(engine, NAM_PLUGIN_URI)

    def _configured_nam_blocks_allow_global_fallback() -> bool:
        session = get_db_session()
        try:
            active_count = int(
                session.query(ChainPlugin)
                .join(Chain, Chain.id == ChainPlugin.chain_id)
                .filter(
                    Chain.is_active.is_(True),
                    ChainPlugin.plugin_uri.in_(NAM_CONFIG_PLUGIN_URIS),
                )
                .count()
            )
            if active_count == 1:
                return True
            if active_count > 1:
                return False

            total_count = int(
                session.query(ChainPlugin)
                .filter(ChainPlugin.plugin_uri.in_(NAM_CONFIG_PLUGIN_URIS))
                .count()
            )
            return total_count == 1
        except Exception as e:
            logger.warning("Unable to evaluate configured NAM fallback safety: %s", e)
            return False
        finally:
            session.close()

    async def _allow_global_nam_fallback(
        engine,
        plugin_position: Optional[int],
    ) -> bool:
        if not _has_plugin_position(plugin_position):
            return False
        if await _runtime_has_plugin_uri(engine, NAM_PLUGIN_URI):
            return False
        return await asyncio.to_thread(_configured_nam_blocks_allow_global_fallback)

    def _duplicate_loader_fallback_detail(plugin_position: Optional[int]) -> str:
        return (
            "Multiple active NAM loaders are configured without live runtime identity; "
            f"refusing global fallback for position: {plugin_position}"
        )

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
    async def get_nam_status(
        instance_id: Optional[int] = Query(None),
        plugin_position: Optional[int] = Query(None),
    ):
        """Get NAM model status for frontend.

        Returns the format expected by the frontend NAMStatus interface.
        """
        engine = get_audio_engine()

        scoped_instance_id = await _resolve_scoped_instance_id(engine, instance_id, plugin_position)
        runtime_has_nam_instances = False
        allow_global_fallback = False

        if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
            instance_info = await engine.get_nam_model_info_instance(scoped_instance_id)
            models = _scan_nam_models()
            model_names = [m['name'] for m in models]
            return {
                "available": True,
                "activeModel": instance_info.get("name") if instance_info.get("loaded") else None,
                "loading": False,
                "mix": 100,
                "bypass": bool(instance_info.get("bypass", False)),
                "inputLevel": float(instance_info.get("input_level", -100.0)),
                "outputLevel": float(instance_info.get("output_level", -100.0)),
                "peakInput": float(instance_info.get("input_level", -100.0)),
                "peakOutput": float(instance_info.get("output_level", -100.0)),
                "latency": 0,
                "availableModels": model_names,
                "input_gain": float(instance_info.get("input_gain", 0.0)),
                "output_gain": float(instance_info.get("output_gain", 0.0)),
                "normalize": bool(instance_info.get("normalize", True)),
            }

        if _has_plugin_position(plugin_position):
            runtime_has_nam_instances = await _requires_runtime_nam_scope(engine, plugin_position)
            if not runtime_has_nam_instances:
                allow_global_fallback = await _allow_global_nam_fallback(engine, plugin_position)

        if _has_plugin_position(plugin_position) and (runtime_has_nam_instances or not allow_global_fallback):
            models = _scan_nam_models()
            model_names = [m['name'] for m in models]
            return {
                "available": True,
                "activeModel": None,
                "loading": False,
                "mix": 100,
                "bypass": False,
                "inputLevel": -100.0,
                "outputLevel": -100.0,
                "peakInput": -100.0,
                "peakOutput": -100.0,
                "latency": 0,
                "availableModels": model_names,
                "input_gain": 0.0,
                "output_gain": 0.0,
                "normalize": True,
            }

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
            "availableModels": model_names,
            "input_gain": await engine.get_nam_input_gain(),
            "output_gain": await engine.get_nam_output_gain(),
            "normalize": await engine.is_nam_normalized(),
        }

    # ==================== Categories ====================

    @router.get("/categories")
    async def get_nam_categories() -> Dict:
        """Get available NAM model categories and amp types."""
        session = get_db_session()
        try:
            categories = session.query(NAMModel.category).distinct().all()
            category_list = [c[0] for c in categories if c[0]]

            amp_types = session.query(NAMModel.amp_type).distinct().all()
            amp_type_list = [t[0] for t in amp_types if t[0]]

            return {
                "categories": sorted(category_list),
                "amp_types": sorted(amp_type_list)
            }
        except Exception as e:
            logger.error(f"Error getting NAM categories: {e}")
            raise HTTPException(status_code=500, detail=str(e))
        finally:
            session.close()

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
        session = get_db_session()
        try:
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
        finally:
            session.close()

    # ==================== Search ====================

    @router.post("/search")
    async def search_nam_models(request: NAMSearchRequest) -> Dict:
        """Search NAM models by text and filters."""
        session = get_db_session()
        try:
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

            return {
                "results": results,
                "count": len(results)
            }
        except Exception as e:
            logger.error(f"Error searching NAM models: {e}")
            raise HTTPException(status_code=500, detail=str(e))
        finally:
            session.close()

    # ==================== Model Detail ====================

    @router.get("/models/{model_id}")
    async def get_nam_model(model_id: int) -> Dict:
        """Get detailed NAM model information."""
        session = get_db_session()
        try:
            model = session.query(NAMModel).filter_by(id=model_id).first()

            if not model:
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

            return result

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting NAM model: {e}")
            raise HTTPException(status_code=500, detail=str(e))
        finally:
            session.close()

    # ==================== Load/Unload (RT-safe via JUCE) ====================

    @router.post("/models/{model_name}/load")
    async def load_nam_model(
        model_name: str,
        instance_id: Optional[int] = Query(None),
        plugin_position: Optional[int] = Query(None),
    ):
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
        scoped_instance_id = await _resolve_scoped_instance_id(engine, instance_id, plugin_position)
        runtime_has_nam_instances = False
        allow_global_fallback = False
        if _has_plugin_position(plugin_position) and not (isinstance(scoped_instance_id, int) and scoped_instance_id > 0):
            runtime_has_nam_instances = await _requires_runtime_nam_scope(engine, plugin_position)
            if not runtime_has_nam_instances:
                allow_global_fallback = await _allow_global_nam_fallback(engine, plugin_position)
        if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
            success = await engine.load_nam_model_instance(scoped_instance_id, model_path)
        elif _has_plugin_position(plugin_position) and runtime_has_nam_instances:
            raise HTTPException(status_code=404, detail=f"NAM instance not found at position: {plugin_position}")
        elif _has_plugin_position(plugin_position) and not allow_global_fallback:
            raise HTTPException(status_code=409, detail=_duplicate_loader_fallback_detail(plugin_position))
        else:
            success = await engine.load_nam_model(model_path)

        if not success:
            logger.warning(
                "NAM scoped load failed for model=%s requested_instance_id=%s plugin_position=%s resolved_instance_id=%s",
                model_name,
                instance_id,
                plugin_position,
                scoped_instance_id,
            )
            raise HTTPException(status_code=500, detail="Failed to start model loading")

        logger.info(f"NAM model loading started: {model_name} ({model_path})")
        return {"status": "loading", "model": model_name, "path": model_path}

    @router.post("/models/{model_name}/activate")
    async def activate_nam_model(
        model_name: str,
        instance_id: Optional[int] = Query(None),
        plugin_position: Optional[int] = Query(None),
    ):
        """Activate a NAM model (alias for load)."""
        return await load_nam_model(model_name, instance_id, plugin_position)

    @router.post("/unload")
    async def unload_nam_model(
        instance_id: Optional[int] = Query(None),
        plugin_position: Optional[int] = Query(None),
    ):
        """Unload the current NAM model."""
        engine = get_audio_engine()
        scoped_instance_id = await _resolve_scoped_instance_id(engine, instance_id, plugin_position)
        runtime_has_nam_instances = False
        allow_global_fallback = False
        if _has_plugin_position(plugin_position) and not (isinstance(scoped_instance_id, int) and scoped_instance_id > 0):
            runtime_has_nam_instances = await _requires_runtime_nam_scope(engine, plugin_position)
            if not runtime_has_nam_instances:
                allow_global_fallback = await _allow_global_nam_fallback(engine, plugin_position)
        if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
            unloaded = await engine.unload_nam_model_instance(scoped_instance_id)
            if not unloaded:
                raise HTTPException(status_code=404, detail=f"NAM instance not found: {scoped_instance_id}")
        elif _has_plugin_position(plugin_position) and runtime_has_nam_instances:
            raise HTTPException(status_code=404, detail=f"NAM instance not found at position: {plugin_position}")
        elif _has_plugin_position(plugin_position) and not allow_global_fallback:
            raise HTTPException(status_code=409, detail=_duplicate_loader_fallback_detail(plugin_position))
        else:
            await engine.unload_nam_model()
        return {"status": "unloaded"}

    # ==================== Controls ====================

    @router.post("/bypass")
    async def set_nam_bypass(
        bypass: bool = True,
        instance_id: Optional[int] = Query(None),
        plugin_position: Optional[int] = Query(None),
    ):
        """Set NAM bypass state."""
        engine = get_audio_engine()
        scoped_instance_id = await _resolve_scoped_instance_id(engine, instance_id, plugin_position)
        runtime_has_nam_instances = False
        allow_global_fallback = False
        if _has_plugin_position(plugin_position) and not (isinstance(scoped_instance_id, int) and scoped_instance_id > 0):
            runtime_has_nam_instances = await _requires_runtime_nam_scope(engine, plugin_position)
            if not runtime_has_nam_instances:
                allow_global_fallback = await _allow_global_nam_fallback(engine, plugin_position)
        if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
            updated = await engine.set_nam_bypass_instance(scoped_instance_id, bypass)
            if not updated:
                raise HTTPException(status_code=404, detail=f"NAM instance not found: {scoped_instance_id}")
        elif _has_plugin_position(plugin_position) and runtime_has_nam_instances:
            raise HTTPException(status_code=404, detail=f"NAM instance not found at position: {plugin_position}")
        elif _has_plugin_position(plugin_position) and not allow_global_fallback:
            raise HTTPException(status_code=409, detail=_duplicate_loader_fallback_detail(plugin_position))
        else:
            await engine.set_nam_bypass(bypass)
        return {"status": "ok", "bypass": bypass}

    @router.post("/input-gain")
    async def set_nam_input_gain(
        request: NAMGainRequest,
        instance_id: Optional[int] = Query(None),
        plugin_position: Optional[int] = Query(None),
    ):
        """Set NAM input gain in dB."""
        engine = get_audio_engine()
        scoped_instance_id = await _resolve_scoped_instance_id(engine, instance_id, plugin_position)
        runtime_has_nam_instances = False
        allow_global_fallback = False
        if _has_plugin_position(plugin_position) and not (isinstance(scoped_instance_id, int) and scoped_instance_id > 0):
            runtime_has_nam_instances = await _requires_runtime_nam_scope(engine, plugin_position)
            if not runtime_has_nam_instances:
                allow_global_fallback = await _allow_global_nam_fallback(engine, plugin_position)
        if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
            updated = await engine.set_nam_input_gain_instance(scoped_instance_id, request.gain_db)
            if not updated:
                raise HTTPException(status_code=404, detail=f"NAM instance not found: {scoped_instance_id}")
        elif _has_plugin_position(plugin_position) and runtime_has_nam_instances:
            raise HTTPException(status_code=404, detail=f"NAM instance not found at position: {plugin_position}")
        elif _has_plugin_position(plugin_position) and not allow_global_fallback:
            raise HTTPException(status_code=409, detail=_duplicate_loader_fallback_detail(plugin_position))
        else:
            await engine.set_nam_input_gain(request.gain_db)
        return {"status": "ok", "input_gain": request.gain_db}

    @router.post("/output-gain")
    async def set_nam_output_gain(
        request: NAMGainRequest,
        instance_id: Optional[int] = Query(None),
        plugin_position: Optional[int] = Query(None),
    ):
        """Set NAM output gain in dB."""
        engine = get_audio_engine()
        scoped_instance_id = await _resolve_scoped_instance_id(engine, instance_id, plugin_position)
        runtime_has_nam_instances = False
        allow_global_fallback = False
        if _has_plugin_position(plugin_position) and not (isinstance(scoped_instance_id, int) and scoped_instance_id > 0):
            runtime_has_nam_instances = await _requires_runtime_nam_scope(engine, plugin_position)
            if not runtime_has_nam_instances:
                allow_global_fallback = await _allow_global_nam_fallback(engine, plugin_position)
        if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
            updated = await engine.set_nam_output_gain_instance(scoped_instance_id, request.gain_db)
            if not updated:
                raise HTTPException(status_code=404, detail=f"NAM instance not found: {scoped_instance_id}")
        elif _has_plugin_position(plugin_position) and runtime_has_nam_instances:
            raise HTTPException(status_code=404, detail=f"NAM instance not found at position: {plugin_position}")
        elif _has_plugin_position(plugin_position) and not allow_global_fallback:
            raise HTTPException(status_code=409, detail=_duplicate_loader_fallback_detail(plugin_position))
        else:
            await engine.set_nam_output_gain(request.gain_db)
        return {"status": "ok", "output_gain": request.gain_db}

    @router.post("/normalize")
    async def set_nam_normalize(
        normalize: bool = True,
        instance_id: Optional[int] = Query(None),
        plugin_position: Optional[int] = Query(None),
    ):
        """Enable/disable NAM output normalization."""
        engine = get_audio_engine()
        scoped_instance_id = await _resolve_scoped_instance_id(engine, instance_id, plugin_position)
        runtime_has_nam_instances = False
        allow_global_fallback = False
        if _has_plugin_position(plugin_position) and not (isinstance(scoped_instance_id, int) and scoped_instance_id > 0):
            runtime_has_nam_instances = await _requires_runtime_nam_scope(engine, plugin_position)
            if not runtime_has_nam_instances:
                allow_global_fallback = await _allow_global_nam_fallback(engine, plugin_position)
        if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
            updated = await engine.set_nam_normalize_instance(scoped_instance_id, normalize)
            if not updated:
                raise HTTPException(status_code=404, detail=f"NAM instance not found: {scoped_instance_id}")
        elif _has_plugin_position(plugin_position) and runtime_has_nam_instances:
            raise HTTPException(status_code=404, detail=f"NAM instance not found at position: {plugin_position}")
        elif _has_plugin_position(plugin_position) and not allow_global_fallback:
            raise HTTPException(status_code=409, detail=_duplicate_loader_fallback_detail(plugin_position))
        else:
            await engine.set_nam_normalize(normalize)
        return {"status": "ok", "normalize": normalize}

    # ==================== Favorites and Ratings ====================

    @router.post("/models/{model_id}/favorite")
    async def toggle_nam_favorite(model_id: int) -> Dict:
        """Toggle favorite status for NAM model."""
        session = get_db_session()
        try:
            model = session.query(NAMModel).filter_by(id=model_id).first()

            if not model:
                raise HTTPException(status_code=404, detail=f"Model {model_id} not found")

            model.is_favorite = not model.is_favorite
            session.commit()

            return {
                "status": "ok",
                "is_favorite": model.is_favorite
            }

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error toggling favorite: {e}")
            raise HTTPException(status_code=500, detail=str(e))
        finally:
            session.close()

    @router.put("/models/{model_id}/rating")
    async def set_nam_rating(model_id: int, request: NAMRatingRequest) -> Dict:
        """Set rating for NAM model."""
        if not 1 <= request.rating <= 5:
            raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

        session = get_db_session()
        try:
            model = session.query(NAMModel).filter_by(id=model_id).first()

            if not model:
                raise HTTPException(status_code=404, detail=f"Model {model_id} not found")

            model.rating = request.rating
            session.commit()

            return {
                "status": "ok",
                "rating": request.rating
            }

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error setting rating: {e}")
            raise HTTPException(status_code=500, detail=str(e))
        finally:
            session.close()

    # ==================== Upload ====================

    @router.post("/upload")
    async def upload_nam_model(file: UploadFile = File(...)) -> Dict:
        """Upload a NAM model file."""
        try:
            if not file.filename or not file.filename.lower().endswith('.nam'):
                raise HTTPException(status_code=400, detail="File must be a .nam file")

            content = await file.read()
            upload_service = get_upload_service()
            validation = upload_service.validate_file(file.filename, len(content), asset_type_override=AssetType.NAM.value)
            if not validation.valid or validation.asset_type != AssetType.NAM:
                raise HTTPException(status_code=400, detail=validation.message)

            upload_result = await upload_service.save_upload(file.filename, content, AssetType.NAM)
            if not upload_result.success:
                raise HTTPException(status_code=400, detail=upload_result.error or upload_result.message)

            # Check if already in database
            session = get_db_session()
            try:
                existing = session.query(NAMModel).filter_by(file_hash=upload_result.file_hash).first()

                if existing:
                    return {
                        "status": "exists" if upload_result.already_exists else "ok",
                        "model": {
                            "id": existing.id,
                            "name": existing.name,
                            "file_path": existing.file_path,
                        },
                        "message": upload_result.message,
                    }

                # Create database entry
                model_name = Path(upload_result.filename).stem

                new_model = NAMModel(
                    name=model_name,
                    file_path=upload_result.file_path,
                    file_hash=upload_result.file_hash,
                    file_size=upload_result.file_size,
                    model_type="unknown",
                    category="User",
                    license="User uploaded"
                )

                session.add(new_model)
                session.commit()

                model_id = new_model.id
            finally:
                session.close()

            logger.info(f"Uploaded NAM model: {file.filename}")

            return {
                "status": "ok",
                "model": {
                    "id": model_id,
                    "name": model_name,
                    "file_path": upload_result.file_path
                },
                "message": upload_result.message,
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

    # ==================== Featured Amps ====================

    @router.post("/refresh-featured")
    async def refresh_featured_amps() -> Dict:
        """Fetch and download featured top 7 amps from TONE3000.
        
        This endpoint discovers the top 7 most popular amps on TONE3000
        and the top 3 variants of each, downloads them, and registers
        them as featured models in the NAM chooser.
        
        Returns:
            Dict with featured amps download results
        """
        try:
            from app.services.featured_amps_manager import FeaturedAmpsManager
            import asyncio
            
            manager = FeaturedAmpsManager()
            
            # Clear existing featured models
            await manager.clear_featured_models()
            logger.info("Cleared previous featured models")
            
            # Discover and download new featured amps
            results = await manager.discover_and_download_featured_amps()
            
            return {
                "status": "ok" if results['success'] else "error",
                "total_downloaded": results['total_downloaded'],
                "featured_amps": results['featured_amps'],
                "errors": results['errors']
            }
            
        except Exception as e:
            logger.error(f"Error refreshing featured amps: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/featured")
    async def get_featured_models(limit: int = Query(21, ge=1, le=100)) -> Dict:
        """Get featured NAM models for display in chooser.
        
        Args:
            limit: Maximum number of featured models to return
            
        Returns:
            List of featured models sorted by featured_position
        """
        session = get_db_session()
        try:
            featured = session.query(NAMModel).filter(
                NAMModel.is_featured == True
            ).order_by(NAMModel.featured_position).limit(limit).all()
            
            return {
                "status": "ok",
                "count": len(featured),
                "models": [
                    {
                        "id": m.id,
                        "name": m.name,
                        "amp_name": m.amp_name,
                        "amp_type": m.amp_type,
                        "category": m.category,
                        "featured_position": m.featured_position,
                        "source_tone3000_id": m.source_tone3000_id,
                        "tags": m.tags
                    }
                    for m in featured
                ]
            }
            
        except Exception as e:
            logger.error(f"Error getting featured models: {e}")
            raise HTTPException(status_code=500, detail=str(e))
        finally:
            session.close()

    # ==================== Bulk Rename ====================

    @router.post("/bulk-rename/preview")
    async def preview_bulk_rename() -> Dict:
        """Preview planned NAM file renames without making changes.
        
        Scans the NAM library, enriches metadata from GitHub and database,
        and shows what files would be renamed and how.
        
        Returns:
            Dict with preview results including:
            - total_files: Number of NAM files found
            - renamed_count: How many would be renamed
            - skipped_count: How many don't have sufficient metadata
            - failed_count: How many have conflicts
            - renamed_files: List of planned renames
            - errors: Any errors encountered
        """
        try:
            from app.services.nam_bulk_renamer import NAMBulkRenamer
            
            renamer = NAMBulkRenamer()
            
            # Scan library
            logger.info("Starting bulk rename preview...")
            files_info = await renamer.scan_library()
            
            # Enrich metadata
            enriched_files = await renamer.enrich_metadata(files_info)
            
            # Preview renames (dry_run=True)
            results = await renamer.preview_renames(enriched_files, dry_run=True)
            
            return {
                "status": "ok",
                "operation": "dry_run",
                "results": results
            }
            
        except Exception as e:
            logger.error(f"Error in bulk rename preview: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/bulk-rename/execute")
    async def execute_bulk_rename() -> Dict:
        """Execute bulk rename of NAM files to standardized format.
        
        WARNING: This operation modifies files and database records.
        A preview should be run first to verify the changes.
        
        Rename format: {Brand}_{Model}_{Type}_[SOURCE-{id}].nam
        
        Returns:
            Dict with execution results including:
            - renamed_count: Number of files actually renamed
            - skipped_count: Files without sufficient metadata
            - failed_count: Files that couldn't be renamed
            - renamed_files: List of successfully renamed files
            - errors: Any errors encountered
        """
        try:
            from app.services.nam_bulk_renamer import NAMBulkRenamer
            
            renamer = NAMBulkRenamer()
            
            # Scan library
            logger.info("Starting bulk rename execution...")
            files_info = await renamer.scan_library()
            
            # Enrich metadata
            enriched_files = await renamer.enrich_metadata(files_info)
            
            # Execute renames (dry_run=False)
            results = await renamer.execute_bulk_rename(enriched_files)
            
            logger.info(f"Bulk rename complete: {results['renamed_count']} renamed, "
                       f"{results['skipped_count']} skipped, {results['failed_count']} failed")
            
            return {
                "status": "ok",
                "operation": "execute",
                "results": results
            }
            
        except Exception as e:
            logger.error(f"Error in bulk rename execution: {e}")
            raise HTTPException(status_code=500, detail=str(e))

except ImportError as e:
    from fastapi import APIRouter, HTTPException
    router = APIRouter(prefix="/api/nam", tags=["nam"])
    _error_detail = f"NAM dependencies not installed: {e}"

    @router.get("/")
    async def get_nam_root():
        raise HTTPException(status_code=503, detail=_error_detail)

    @router.get("/status")
    async def get_nam_status():
        raise HTTPException(status_code=503, detail=_error_detail)
