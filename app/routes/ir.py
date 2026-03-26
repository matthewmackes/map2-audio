"""
Impulse Response API Routes
"""

import asyncio

import logging
from typing import Any, Dict, List, Optional

try:
    from fastapi import APIRouter, File, HTTPException, Query, UploadFile

    from app.services.ir_processor import IRProcessor
    from app.services.juce_engine_service import get_audio_engine
    from app.services.upload_service import AssetType, get_upload_service

    logger = logging.getLogger(__name__)
    router = APIRouter(prefix="/api/ir", tags=["ir"])
    IR_PLUGIN_URIS = {
        "cabinet": "map2://juce/convolution/cabinet",
        "reverb": "map2://juce/convolution/reverb",
    }

    # Legacy global IR service remains available for non-instance routes.
    _ir_processor = IRProcessor()

    def _scan_irs(ir_type: str) -> List[Dict[str, Any]]:
        return _ir_processor.scan_irs(ir_type)

    def _find_ir_path(ir_name: str, ir_type: str) -> Optional[str]:
        for ir in _scan_irs(ir_type):
            if ir.get("name") == ir_name:
                return str(ir.get("path"))
        return None

    def _select_adjacent_ir_name(irs: List[Dict[str, Any]], current_name: Optional[str], direction: str) -> Optional[str]:
        if not irs:
            return None
        if direction not in {"next", "prev"}:
            return None

        names = [str(ir.get("name")) for ir in irs if ir.get("name")]
        if not names:
            return None

        step = 1 if direction == "next" else -1
        if current_name in names:
            start_index = names.index(current_name)
            return names[(start_index + step) % len(names)]
        return names[0 if direction == "next" else -1]

    def _build_ir_status_payload(
        ir_type: str,
        available_irs: List[Dict[str, Any]],
        *,
        loaded_name: Optional[str],
        mix: float,
        bypass: bool,
        ir_info: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        normalized_mix = float(mix)
        active_name = loaded_name or None
        current_size = 0
        duration = 0.0
        sample_rate = 0.0

        if ir_info:
            current_size = int(ir_info.get("length_samples", 0) or 0)
            duration = float(ir_info.get("length_ms", 0.0) or 0.0) / 1000.0
            sample_rate = float(ir_info.get("sample_rate", 0.0) or 0.0)

        base_payload: Dict[str, Any] = {
            "available": True,
            "loaded": active_name,
            "mix": normalized_mix,
            "bypass": bool(bypass),
            "inputLevel": -60.0,
            "outputLevel": -60.0,
            "peakInput": -60.0,
            "peakOutput": -60.0,
            "latency": 0,
            "currentIRSize": f"{current_size / 1024:.0f} KB" if current_size > 0 else "0 KB",
            "duration": duration,
            "sampleRate": sample_rate,
        }

        if ir_type == "cabinet":
            base_payload.update(
                {
                    "loaded_cabinet": active_name,
                    "active_cabinet": active_name,
                    "frequencyResponse": [],
                    "availableIRs": [
                        {
                            "name": ir["name"],
                            "size": f"{ir.get('size_mb', 0):.2f} MB",
                            "length": ir.get("length", 0),
                        }
                        for ir in available_irs
                    ],
                }
            )
        else:
            base_payload.update(
                {
                    "loaded_reverb": active_name,
                    "active_reverb": active_name,
                    "decayTail": [],
                    "availableIRs": [
                        {
                            "name": ir["name"],
                            "type": ir.get("type", "room"),
                            "decay": ir.get("decay", 0),
                        }
                        for ir in available_irs
                    ],
                    "currentDecay": ir_info.get("length_ms", 0.0) if ir_info else 0.0,
                    "preDelay": 0,
                }
            )

        return base_payload

    def _has_plugin_position(plugin_position: Optional[int]) -> bool:
        return isinstance(plugin_position, int) and plugin_position >= 0

    async def _resolve_scoped_instance_id(
        ir_type: str,
        instance_id: Optional[int],
        plugin_position: Optional[int],
    ) -> Optional[int]:
        if isinstance(instance_id, int) and instance_id > 0:
            return instance_id
        if not _has_plugin_position(plugin_position):
            return None

        engine = get_audio_engine()
        resolver = getattr(engine, "resolve_instance_id", None)
        if callable(resolver):
            return await resolver(IR_PLUGIN_URIS[ir_type], plugin_position)

        legacy_resolver = getattr(engine, "_get_instance_id_for_uri", None)
        if callable(legacy_resolver):
            return await asyncio.to_thread(legacy_resolver, IR_PLUGIN_URIS[ir_type], plugin_position)

        return None

    async def _get_instance_ir_status(instance_id: int, ir_type: str) -> Dict[str, Any]:
        engine = get_audio_engine()
        irs = _scan_irs(ir_type)
        info = await engine.get_ir_info_instance(instance_id)
        loaded_name = info.get("name") if info.get("loaded") else None
        default_mix = 100.0 if ir_type == "cabinet" else 30.0
        return _build_ir_status_payload(
            ir_type,
            irs,
            loaded_name=loaded_name,
            mix=float(info.get("mix", default_mix) or default_mix),
            bypass=bool(info.get("bypass", False)),
            ir_info=info,
        )

    async def _load_ir_to_target(
        ir_name: str,
        ir_type: str,
        instance_id: Optional[int],
        plugin_position: Optional[int] = None,
    ) -> Dict[str, Any]:
        ir_path = _find_ir_path(ir_name, ir_type)
        if not ir_path:
            raise HTTPException(status_code=404, detail=f"{ir_type.title()} IR not found: {ir_name}")

        scoped_instance_id = await _resolve_scoped_instance_id(ir_type, instance_id, plugin_position)
        if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
            engine = get_audio_engine()
            if ir_type == "cabinet":
                success = await engine.load_cabinet_ir_instance(scoped_instance_id, ir_path)
            else:
                success = await engine.load_reverb_ir_instance(scoped_instance_id, ir_path)
            if not success:
                raise HTTPException(status_code=404, detail=f"IR instance not found: {scoped_instance_id}")
        elif _has_plugin_position(plugin_position):
            raise HTTPException(status_code=404, detail=f"{ir_type.title()} IR instance not found at position: {plugin_position}")
        else:
            success = _ir_processor.load_ir(ir_name, ir_type)
            if not success:
                raise HTTPException(status_code=404, detail=f"{ir_type.title()} IR not found or failed to load")

        return {"status": "loaded", "ir": ir_name, "type": ir_type, "path": ir_path}

    async def _set_ir_mix(
        ir_type: str,
        mix: float,
        instance_id: Optional[int],
        plugin_position: Optional[int] = None,
    ) -> Dict[str, Any]:
        if not 0 <= mix <= 100:
            raise HTTPException(status_code=400, detail="Mix must be between 0 and 100")

        scoped_instance_id = await _resolve_scoped_instance_id(ir_type, instance_id, plugin_position)
        if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
            engine = get_audio_engine()
            updated = await engine.set_ir_mix_instance(scoped_instance_id, mix)
            if not updated:
                raise HTTPException(status_code=404, detail=f"IR instance not found: {scoped_instance_id}")
        elif _has_plugin_position(plugin_position):
            raise HTTPException(status_code=404, detail=f"{ir_type.title()} IR instance not found at position: {plugin_position}")
        elif ir_type == "cabinet":
            _ir_processor.set_cabinet_mix(mix)
        else:
            _ir_processor.set_reverb_mix(mix)

        return {"status": "ok", "mix": mix, "type": ir_type}

    async def _set_ir_bypass(
        ir_type: str,
        bypass: bool,
        instance_id: Optional[int],
        plugin_position: Optional[int] = None,
    ) -> Dict[str, Any]:
        scoped_instance_id = await _resolve_scoped_instance_id(ir_type, instance_id, plugin_position)
        if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
            engine = get_audio_engine()
            updated = await engine.set_ir_bypass_instance(scoped_instance_id, bypass)
            if not updated:
                raise HTTPException(status_code=404, detail=f"IR instance not found: {scoped_instance_id}")
        elif _has_plugin_position(plugin_position):
            raise HTTPException(status_code=404, detail=f"{ir_type.title()} IR instance not found at position: {plugin_position}")
        elif ir_type == "cabinet":
            _ir_processor.set_cabinet_bypass(bypass)
        else:
            _ir_processor.set_reverb_bypass(bypass)

        return {"status": "ok", "bypass": bypass, "type": ir_type}

    async def _navigate_ir(
        ir_type: str,
        direction: str,
        instance_id: Optional[int],
        plugin_position: Optional[int] = None,
    ) -> Dict[str, Any]:
        irs = _scan_irs(ir_type)
        if not irs:
            raise HTTPException(status_code=404, detail="No IRs available to navigate")

        current_name: Optional[str]
        scoped_instance_id = await _resolve_scoped_instance_id(ir_type, instance_id, plugin_position)
        if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
            info = await get_audio_engine().get_ir_info_instance(scoped_instance_id)
            current_name = info.get("name") if info.get("loaded") else None
        elif _has_plugin_position(plugin_position):
            raise HTTPException(status_code=404, detail=f"{ir_type.title()} IR instance not found at position: {plugin_position}")
        else:
            current_ir = _ir_processor.active_cabinet_ir if ir_type == "cabinet" else _ir_processor.active_reverb_ir
            current_name = current_ir.name if current_ir else None

        next_name = _select_adjacent_ir_name(irs, current_name, direction)
        if not next_name:
            raise HTTPException(status_code=404, detail="No IRs available to navigate")

        return await _load_ir_to_target(next_name, ir_type, instance_id, plugin_position)

    @router.get("/")
    async def get_ir_root():
        """Get legacy/global IR processor status."""
        return _ir_processor.get_status()

    @router.get("/status")
    async def get_ir_status(
        type: str = Query("cabinet"),
        instance_id: Optional[int] = Query(None),
        plugin_position: Optional[int] = Query(None),
    ):
        """Get IR status for cabinet or reverb assets."""
        if type not in {"cabinet", "reverb"}:
            raise HTTPException(status_code=400, detail="type must be 'cabinet' or 'reverb'")

        scoped_instance_id = await _resolve_scoped_instance_id(type, instance_id, plugin_position)
        if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
            return await _get_instance_ir_status(scoped_instance_id, type)
        if _has_plugin_position(plugin_position):
            return _build_ir_status_payload(
                type,
                _scan_irs(type),
                loaded_name=None,
                mix=100.0 if type == "cabinet" else 30.0,
                bypass=False,
            )

        irs = _scan_irs(type)
        active_ir = _ir_processor.active_cabinet_ir if type == "cabinet" else _ir_processor.active_reverb_ir
        loaded_name = active_ir.name if active_ir else None
        default_mix = getattr(active_ir, "wet_mix", 1.0) * 100 if active_ir else (100.0 if type == "cabinet" else 30.0)
        bypass = bool(getattr(active_ir, "bypass", False)) if active_ir else False
        return _build_ir_status_payload(type, irs, loaded_name=loaded_name, mix=default_mix, bypass=bypass)

    @router.get("/cabinets")
    async def list_cabinet_irs():
        """List available cabinet IRs."""
        irs = _scan_irs("cabinet")
        return {"irs": irs, "cabinets": irs, "count": len(irs)}

    @router.get("/reverbs")
    async def list_reverb_irs():
        """List available reverb IRs."""
        irs = _scan_irs("reverb")
        return {"irs": irs, "reverbs": irs, "count": len(irs)}

    @router.post("/cabinets/{ir_name}/load")
    async def load_cabinet_ir(
        ir_name: str,
        instance_id: Optional[int] = Query(None),
        plugin_position: Optional[int] = Query(None),
    ):
        """Load a cabinet IR."""
        return await _load_ir_to_target(ir_name, "cabinet", instance_id, plugin_position)

    @router.post("/set-cabinet/{ir_name}")
    async def set_cabinet_ir(
        ir_name: str,
        instance_id: Optional[int] = Query(None),
        plugin_position: Optional[int] = Query(None),
    ):
        """Set/load a cabinet IR (alias for frontend compatibility)."""
        payload = await _load_ir_to_target(ir_name, "cabinet", instance_id, plugin_position)
        payload["status"] = "ok"
        return payload

    @router.post("/reverbs/{ir_name}/load")
    async def load_reverb_ir(
        ir_name: str,
        instance_id: Optional[int] = Query(None),
        plugin_position: Optional[int] = Query(None),
    ):
        """Load a reverb IR."""
        return await _load_ir_to_target(ir_name, "reverb", instance_id, plugin_position)

    @router.post("/set-reverb/{ir_name}")
    async def set_reverb_ir(
        ir_name: str,
        instance_id: Optional[int] = Query(None),
        plugin_position: Optional[int] = Query(None),
    ):
        """Set/load a reverb IR (alias for frontend compatibility)."""
        payload = await _load_ir_to_target(ir_name, "reverb", instance_id, plugin_position)
        payload["status"] = "ok"
        return payload

    @router.post("/set-cabinet-mix/{mix}")
    async def set_cabinet_mix(
        mix: float,
        instance_id: Optional[int] = Query(None),
        plugin_position: Optional[int] = Query(None),
    ):
        """Set cabinet IR wet/dry mix."""
        return await _set_ir_mix("cabinet", mix, instance_id, plugin_position)

    @router.post("/set-reverb-mix/{mix}")
    async def set_reverb_mix(
        mix: float,
        instance_id: Optional[int] = Query(None),
        plugin_position: Optional[int] = Query(None),
    ):
        """Set reverb IR wet/dry mix."""
        return await _set_ir_mix("reverb", mix, instance_id, plugin_position)

    @router.post("/set-cabinet-bypass/{bypass}")
    async def set_cabinet_bypass(
        bypass: bool,
        instance_id: Optional[int] = Query(None),
        plugin_position: Optional[int] = Query(None),
    ):
        """Set cabinet IR bypass state."""
        return await _set_ir_bypass("cabinet", bypass, instance_id, plugin_position)

    @router.post("/set-reverb-bypass/{bypass}")
    async def set_reverb_bypass(
        bypass: bool,
        instance_id: Optional[int] = Query(None),
        plugin_position: Optional[int] = Query(None),
    ):
        """Set reverb IR bypass state."""
        return await _set_ir_bypass("reverb", bypass, instance_id, plugin_position)

    @router.post("/navigate-cabinet/{direction}")
    async def navigate_cabinet_ir(
        direction: str,
        instance_id: Optional[int] = Query(None),
        plugin_position: Optional[int] = Query(None),
    ):
        """Navigate to the next/previous cabinet IR."""
        return await _navigate_ir("cabinet", direction, instance_id, plugin_position)

    @router.post("/navigate-reverb/{direction}")
    async def navigate_reverb_ir(
        direction: str,
        instance_id: Optional[int] = Query(None),
        plugin_position: Optional[int] = Query(None),
    ):
        """Navigate to the next/previous reverb IR."""
        return await _navigate_ir("reverb", direction, instance_id, plugin_position)

    @router.post("/unload")
    async def unload_ir(
        type: str = Query("cabinet"),
        instance_id: Optional[int] = Query(None),
        plugin_position: Optional[int] = Query(None),
    ):
        """Unload the current cabinet or reverb IR."""
        if type not in {"cabinet", "reverb"}:
            raise HTTPException(status_code=400, detail="type must be 'cabinet' or 'reverb'")

        scoped_instance_id = await _resolve_scoped_instance_id(type, instance_id, plugin_position)
        if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
            unloaded = await get_audio_engine().unload_ir_instance(scoped_instance_id)
            if not unloaded:
                raise HTTPException(status_code=404, detail=f"IR instance not found: {scoped_instance_id}")
        elif _has_plugin_position(plugin_position):
            raise HTTPException(status_code=404, detail=f"{type.title()} IR instance not found at position: {plugin_position}")
        elif type == "cabinet":
            _ir_processor.unload_ir("cabinet")
        else:
            _ir_processor.unload_ir("reverb")

        return {"status": "unloaded", "type": type}

    async def _upload_ir(file: UploadFile, asset_type: AssetType, ir_type: str) -> Dict[str, Any]:
        if not file.filename:
            raise HTTPException(status_code=400, detail="Missing filename")

        service = get_upload_service()
        content = await file.read()
        validation = service.validate_file(file.filename, len(content), asset_type_override=asset_type.value)
        if not validation.valid or validation.asset_type != asset_type:
            raise HTTPException(status_code=400, detail=validation.message)

        result = await service.save_upload(file.filename, content, asset_type)
        if not result.success:
            raise HTTPException(status_code=400, detail=result.error or result.message)

        return {
            "status": "uploaded",
            "filename": result.filename,
            "type": ir_type,
            "message": result.message,
            "already_exists": result.already_exists,
            "file_path": result.file_path,
        }

    @router.post("/cabinets/upload")
    async def upload_cabinet_ir(file: UploadFile = File(...)):
        """Upload a new cabinet IR file."""
        return await _upload_ir(file, AssetType.CABINET_IR, "cabinet")

    @router.post("/reverbs/upload")
    async def upload_reverb_ir(file: UploadFile = File(...)):
        """Upload a new reverb IR file."""
        return await _upload_ir(file, AssetType.REVERB_IR, "reverb")

except ImportError as e:
    from fastapi import APIRouter, HTTPException

    router = APIRouter(prefix="/api/ir", tags=["ir"])
    _error_detail = f"IR dependencies not installed: {e}"

    @router.get("/")
    async def get_ir_root():
        raise HTTPException(status_code=503, detail=_error_detail)

    @router.get("/status")
    async def get_ir_status(type: str = "cabinet"):
        raise HTTPException(status_code=503, detail=_error_detail)
