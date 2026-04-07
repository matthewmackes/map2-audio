"""
Impulse Response API Routes
"""

import asyncio

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

try:
    import soundfile as sf
except ImportError:  # pragma: no cover - optional runtime dependency
    sf = None

try:
    from fastapi import APIRouter, File, HTTPException, Query, UploadFile

    from app.database import Chain, ChainPlugin, get_db_session
    from app.services.ir_processor import IRProcessor
    from app.services.juce_engine_service import get_audio_engine
    from app.services.plugin_uris import (
        CABINET_IR_CONFIG_PLUGIN_URIS,
        CABINET_IR_PLUGIN_URI,
        REVERB_IR_CONFIG_PLUGIN_URIS,
        REVERB_IR_PLUGIN_URI,
    )
    from app.services.upload_service import AssetType, get_upload_service

    logger = logging.getLogger(__name__)
    router = APIRouter(prefix="/api/ir", tags=["ir"])
    IR_PLUGIN_URIS = {
        "cabinet": CABINET_IR_PLUGIN_URI,
        "reverb": REVERB_IR_PLUGIN_URI,
    }
    IR_CONFIG_PLUGIN_URIS = {
        "cabinet": CABINET_IR_CONFIG_PLUGIN_URIS,
        "reverb": REVERB_IR_CONFIG_PLUGIN_URIS,
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

    def _build_ir_waveform_preview(asset_path: str, sample_count: int = 192) -> Dict[str, Any]:
        if sf is None:
            raise HTTPException(status_code=503, detail="soundfile dependency unavailable")

        normalized_sample_count = max(32, min(int(sample_count or 192), 512))
        resolved_path = Path(asset_path).expanduser()
        if not resolved_path.is_file():
            raise HTTPException(status_code=404, detail="IR asset not found")

        audio_data, sample_rate = sf.read(str(resolved_path), dtype="float32", always_2d=False)
        if getattr(audio_data, "ndim", 1) > 1:
            audio_data = np.mean(audio_data, axis=1)
        audio_array = np.asarray(audio_data, dtype=np.float32).reshape(-1)
        if audio_array.size == 0:
            raise HTTPException(status_code=404, detail="IR asset is empty")

        bin_edges = np.linspace(0, audio_array.size, num=normalized_sample_count + 1, dtype=int)
        points: List[float] = []
        for start, end in zip(bin_edges[:-1], bin_edges[1:]):
            segment = audio_array[start:end]
            points.append(float(np.max(np.abs(segment))) if segment.size > 0 else 0.0)

        return {
            "assetPath": str(resolved_path),
            "fileName": resolved_path.name,
            "sampleRate": int(sample_rate),
            "sampleCount": int(audio_array.size),
            "durationMs": float(audio_array.size / float(sample_rate) * 1000.0) if sample_rate else 0.0,
            "points": points,
        }

    def _has_plugin_position(plugin_position: Optional[int]) -> bool:
        return isinstance(plugin_position, int) and plugin_position >= 0

    def _has_explicit_instance_id(instance_id: Optional[int]) -> bool:
        return isinstance(instance_id, int) and instance_id > 0

    def _is_scoped_ir_request(instance_id: Optional[int], plugin_position: Optional[int]) -> bool:
        return _has_explicit_instance_id(instance_id) or _has_plugin_position(plugin_position)

    def _raise_scoped_ir_not_found(
        ir_type: str,
        instance_id: Optional[int],
        plugin_position: Optional[int],
    ) -> None:
        if _has_plugin_position(plugin_position):
            raise HTTPException(status_code=404, detail=f"{ir_type.title()} IR instance not found at position: {plugin_position}")
        if _has_explicit_instance_id(instance_id):
            raise HTTPException(status_code=404, detail=f"IR instance not found: {instance_id}")
        raise HTTPException(status_code=404, detail=f"{ir_type.title()} IR instance not found")

    async def _resolve_scoped_instance_id(
        ir_type: str,
        instance_id: Optional[int],
        plugin_position: Optional[int],
    ) -> Optional[int]:
        explicit_instance_id = instance_id if _has_explicit_instance_id(instance_id) else None
        engine = get_audio_engine()
        resolver = getattr(engine, "resolve_instance_id", None)
        if callable(resolver):
            try:
                resolved_instance_id = await resolver(
                    IR_PLUGIN_URIS[ir_type],
                    plugin_position,
                    fallback_instance_id=explicit_instance_id,
                )
            except TypeError:
                resolved_instance_id = await resolver(IR_PLUGIN_URIS[ir_type], plugin_position)
                if not isinstance(resolved_instance_id, int) or resolved_instance_id <= 0:
                    resolved_instance_id = explicit_instance_id
            return resolved_instance_id if isinstance(resolved_instance_id, int) and resolved_instance_id > 0 else None

        if explicit_instance_id is not None:
            return explicit_instance_id
        if not _has_plugin_position(plugin_position):
            return None

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

    async def _runtime_has_ir_type(engine, ir_type: str) -> bool:
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
            isinstance(item, dict) and item.get("uri") == IR_PLUGIN_URIS[ir_type]
            for item in items
        )

    def _get_scoped_ir_chain_plugin(ir_type: str, plugin_position: Optional[int]) -> Optional[ChainPlugin]:
        if not _has_plugin_position(plugin_position):
            return None

        session = get_db_session()
        try:
            active_plugins = (
                session.query(ChainPlugin)
                .join(Chain, Chain.id == ChainPlugin.chain_id)
                .filter(
                    Chain.is_active.is_(True),
                    ChainPlugin.position == plugin_position,
                    ChainPlugin.plugin_uri.in_(IR_CONFIG_PLUGIN_URIS[ir_type]),
                )
                .order_by(ChainPlugin.chain_id.asc(), ChainPlugin.id.asc())
                .all()
            )
            if len(active_plugins) == 1:
                return active_plugins[0]
            if len(active_plugins) > 1:
                return None

            active_count = int(
                session.query(ChainPlugin)
                .join(Chain, Chain.id == ChainPlugin.chain_id)
                .filter(
                    Chain.is_active.is_(True),
                    ChainPlugin.plugin_uri.in_(IR_CONFIG_PLUGIN_URIS[ir_type]),
                )
                .count()
            )
            if active_count > 0:
                return None

            total_plugins = (
                session.query(ChainPlugin)
                .filter(
                    ChainPlugin.position == plugin_position,
                    ChainPlugin.plugin_uri.in_(IR_CONFIG_PLUGIN_URIS[ir_type]),
                )
                .order_by(ChainPlugin.chain_id.asc(), ChainPlugin.id.asc())
                .all()
            )
            return total_plugins[0] if len(total_plugins) == 1 else None
        finally:
            session.close()

    def _get_configured_ir_state(ir_type: str, plugin_position: Optional[int]) -> Optional[Dict[str, Any]]:
        plugin = _get_scoped_ir_chain_plugin(ir_type, plugin_position)
        if plugin is None:
            return None
        return {
            "ir": plugin.selected_asset_name,
            "asset_path": plugin.selected_asset_path,
            "mix": 100.0 if plugin.ir_mix is None and ir_type == "cabinet" else 30.0 if plugin.ir_mix is None else float(plugin.ir_mix),
            "bypass": bool(plugin.bypass),
        }

    def _persist_scoped_ir_state(
        ir_type: str,
        plugin_position: Optional[int],
        *,
        ir_name: Optional[str] = None,
        ir_path: Optional[str] = None,
        clear_ir: bool = False,
        mix: Optional[float] = None,
        bypass: Optional[bool] = None,
    ) -> bool:
        plugin = _get_scoped_ir_chain_plugin(ir_type, plugin_position)
        if plugin is None:
            return False

        session = get_db_session()
        try:
            target = session.query(ChainPlugin).filter(ChainPlugin.id == plugin.id).first()
            if target is None:
                return False
            if clear_ir:
                target.selected_asset_name = None
                target.selected_asset_path = None
            if ir_name is not None:
                target.selected_asset_name = ir_name
            if ir_path is not None:
                target.selected_asset_path = ir_path
            if mix is not None:
                target.ir_mix = float(mix)
            if bypass is not None:
                target.bypass = bool(bypass)
            session.commit()
            return True
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def _configured_ir_blocks_allow_global_fallback(ir_type: str, plugin_position: Optional[int] = None) -> bool:
        session = get_db_session()
        try:
            if _has_plugin_position(plugin_position):
                active_position_count = int(
                    session.query(ChainPlugin)
                    .join(Chain, Chain.id == ChainPlugin.chain_id)
                    .filter(
                        Chain.is_active.is_(True),
                        ChainPlugin.position == plugin_position,
                        ChainPlugin.plugin_uri.in_(IR_CONFIG_PLUGIN_URIS[ir_type]),
                    )
                    .count()
                )
                if active_position_count == 1:
                    return True
                if active_position_count > 1:
                    return False

                active_count = int(
                    session.query(ChainPlugin)
                    .join(Chain, Chain.id == ChainPlugin.chain_id)
                    .filter(
                        Chain.is_active.is_(True),
                        ChainPlugin.plugin_uri.in_(IR_CONFIG_PLUGIN_URIS[ir_type]),
                    )
                    .count()
                )
                if active_count > 0:
                    return False

                total_position_count = int(
                    session.query(ChainPlugin)
                    .filter(
                        ChainPlugin.position == plugin_position,
                        ChainPlugin.plugin_uri.in_(IR_CONFIG_PLUGIN_URIS[ir_type]),
                    )
                    .count()
                )
                if total_position_count != 1:
                    return False

                total_count = int(
                    session.query(ChainPlugin)
                    .filter(ChainPlugin.plugin_uri.in_(IR_CONFIG_PLUGIN_URIS[ir_type]))
                    .count()
                )
                return total_count == 1

            active_count = int(
                session.query(ChainPlugin)
                .join(Chain, Chain.id == ChainPlugin.chain_id)
                .filter(
                    Chain.is_active.is_(True),
                    ChainPlugin.plugin_uri.in_(IR_CONFIG_PLUGIN_URIS[ir_type]),
                )
                .count()
            )
            if active_count == 1:
                return True
            if active_count > 1:
                return False
            total_count = int(
                session.query(ChainPlugin)
                .filter(ChainPlugin.plugin_uri.in_(IR_CONFIG_PLUGIN_URIS[ir_type]))
                .count()
            )
            return total_count == 1
        finally:
            session.close()

    async def _allow_global_ir_fallback(engine, ir_type: str, plugin_position: Optional[int]) -> bool:
        if not _has_plugin_position(plugin_position):
            return False
        if await _runtime_has_ir_type(engine, ir_type):
            return False
        try:
            return await asyncio.to_thread(_configured_ir_blocks_allow_global_fallback, ir_type, plugin_position)
        except TypeError:
            return await asyncio.to_thread(_configured_ir_blocks_allow_global_fallback, ir_type)

    def _duplicate_ir_fallback_detail(ir_type: str, plugin_position: Optional[int]) -> str:
        return (
            f"Multiple active {ir_type} IR loaders are configured without live runtime identity; "
            f"refusing global fallback for position: {plugin_position}"
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
        engine = get_audio_engine()
        runtime_has_ir_instances = False
        allow_global_fallback = False
        if _has_plugin_position(plugin_position) and not (isinstance(scoped_instance_id, int) and scoped_instance_id > 0):
            runtime_has_ir_instances = await _runtime_has_ir_type(engine, ir_type)
            if not runtime_has_ir_instances:
                allow_global_fallback = await _allow_global_ir_fallback(engine, ir_type, plugin_position)
        if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
            if ir_type == "cabinet":
                success = await engine.load_cabinet_ir_instance(scoped_instance_id, ir_path)
            else:
                success = await engine.load_reverb_ir_instance(scoped_instance_id, ir_path)
            if not success:
                raise HTTPException(status_code=404, detail=f"IR instance not found: {scoped_instance_id}")
        elif _has_plugin_position(plugin_position) and runtime_has_ir_instances:
            _raise_scoped_ir_not_found(ir_type, instance_id, plugin_position)
        elif _has_plugin_position(plugin_position) and not allow_global_fallback:
            raise HTTPException(status_code=409, detail=_duplicate_ir_fallback_detail(ir_type, plugin_position))
        elif _is_scoped_ir_request(instance_id, plugin_position) and not (
            _has_plugin_position(plugin_position) and allow_global_fallback
        ):
            _raise_scoped_ir_not_found(ir_type, instance_id, plugin_position)
        else:
            success = _ir_processor.load_ir(ir_name, ir_type)
            if not success:
                raise HTTPException(status_code=404, detail=f"{ir_type.title()} IR not found or failed to load")

        if _has_plugin_position(plugin_position):
            _persist_scoped_ir_state(ir_type, plugin_position, ir_name=ir_name, ir_path=ir_path)
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
        engine = get_audio_engine()
        runtime_has_ir_instances = False
        allow_global_fallback = False
        if _has_plugin_position(plugin_position) and not (isinstance(scoped_instance_id, int) and scoped_instance_id > 0):
            runtime_has_ir_instances = await _runtime_has_ir_type(engine, ir_type)
            if not runtime_has_ir_instances:
                allow_global_fallback = await _allow_global_ir_fallback(engine, ir_type, plugin_position)
        if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
            updated = await engine.set_ir_mix_instance(scoped_instance_id, mix)
            if not updated:
                raise HTTPException(status_code=404, detail=f"IR instance not found: {scoped_instance_id}")
        elif _has_plugin_position(plugin_position) and runtime_has_ir_instances:
            _raise_scoped_ir_not_found(ir_type, instance_id, plugin_position)
        elif _has_plugin_position(plugin_position) and not allow_global_fallback:
            raise HTTPException(status_code=409, detail=_duplicate_ir_fallback_detail(ir_type, plugin_position))
        elif _is_scoped_ir_request(instance_id, plugin_position) and not (
            _has_plugin_position(plugin_position) and allow_global_fallback
        ):
            _raise_scoped_ir_not_found(ir_type, instance_id, plugin_position)
        elif ir_type == "cabinet":
            _ir_processor.set_cabinet_mix(mix)
        else:
            _ir_processor.set_reverb_mix(mix)

        if _has_plugin_position(plugin_position):
            _persist_scoped_ir_state(ir_type, plugin_position, mix=mix)
        return {"status": "ok", "mix": mix, "type": ir_type}

    async def _set_ir_bypass(
        ir_type: str,
        bypass: bool,
        instance_id: Optional[int],
        plugin_position: Optional[int] = None,
    ) -> Dict[str, Any]:
        scoped_instance_id = await _resolve_scoped_instance_id(ir_type, instance_id, plugin_position)
        engine = get_audio_engine()
        runtime_has_ir_instances = False
        allow_global_fallback = False
        if _has_plugin_position(plugin_position) and not (isinstance(scoped_instance_id, int) and scoped_instance_id > 0):
            runtime_has_ir_instances = await _runtime_has_ir_type(engine, ir_type)
            if not runtime_has_ir_instances:
                allow_global_fallback = await _allow_global_ir_fallback(engine, ir_type, plugin_position)
        if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
            updated = await engine.set_ir_bypass_instance(scoped_instance_id, bypass)
            if not updated:
                raise HTTPException(status_code=404, detail=f"IR instance not found: {scoped_instance_id}")
        elif _has_plugin_position(plugin_position) and runtime_has_ir_instances:
            _raise_scoped_ir_not_found(ir_type, instance_id, plugin_position)
        elif _has_plugin_position(plugin_position) and not allow_global_fallback:
            raise HTTPException(status_code=409, detail=_duplicate_ir_fallback_detail(ir_type, plugin_position))
        elif _is_scoped_ir_request(instance_id, plugin_position) and not (
            _has_plugin_position(plugin_position) and allow_global_fallback
        ):
            _raise_scoped_ir_not_found(ir_type, instance_id, plugin_position)
        elif ir_type == "cabinet":
            _ir_processor.set_cabinet_bypass(bypass)
        else:
            _ir_processor.set_reverb_bypass(bypass)

        if _has_plugin_position(plugin_position):
            _persist_scoped_ir_state(ir_type, plugin_position, bypass=bypass)
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
        elif _is_scoped_ir_request(instance_id, plugin_position):
            _raise_scoped_ir_not_found(ir_type, instance_id, plugin_position)
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
        configured_state = _get_configured_ir_state(type, plugin_position)
        if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
            payload = await _get_instance_ir_status(scoped_instance_id, type)
            if configured_state is not None:
                payload.update(
                    {
                        "configuredIR": configured_state.get("ir"),
                        "configuredAssetPath": configured_state.get("asset_path"),
                        "configuredMix": configured_state.get("mix"),
                        "configuredBypass": configured_state.get("bypass"),
                    }
                )
            return payload
        if _is_scoped_ir_request(instance_id, plugin_position):
            if not _has_plugin_position(plugin_position):
                _raise_scoped_ir_not_found(type, instance_id, plugin_position)
            engine = get_audio_engine()
            runtime_has_ir_instances = await _runtime_has_ir_type(engine, type)
            allow_global_fallback = False
            if not runtime_has_ir_instances:
                allow_global_fallback = await _allow_global_ir_fallback(engine, type, plugin_position)
            if runtime_has_ir_instances:
                _raise_scoped_ir_not_found(type, instance_id, plugin_position)
            if not allow_global_fallback:
                irs = _scan_irs(type)
                payload = _build_ir_status_payload(
                    type,
                    irs,
                    loaded_name=None,
                    mix=float(configured_state.get("mix", 100.0 if type == "cabinet" else 30.0)) if configured_state else (100.0 if type == "cabinet" else 30.0),
                    bypass=bool(configured_state.get("bypass", False)) if configured_state else False,
                )
                if configured_state is not None:
                    payload.update(
                        {
                            "configuredIR": configured_state.get("ir"),
                            "configuredAssetPath": configured_state.get("asset_path"),
                            "configuredMix": configured_state.get("mix"),
                            "configuredBypass": configured_state.get("bypass"),
                            "runtimeWarning": f"Configured {type} IR block is not active in the live runtime",
                        }
                    )
                return payload

        irs = _scan_irs(type)
        active_ir = _ir_processor.active_cabinet_ir if type == "cabinet" else _ir_processor.active_reverb_ir
        loaded_name = active_ir.name if active_ir else None
        default_mix = getattr(active_ir, "wet_mix", 1.0) * 100 if active_ir else (100.0 if type == "cabinet" else 30.0)
        bypass = bool(getattr(active_ir, "bypass", False)) if active_ir else False
        payload = _build_ir_status_payload(type, irs, loaded_name=loaded_name, mix=default_mix, bypass=bypass)
        if configured_state is not None:
            payload.update(
                {
                    "configuredIR": configured_state.get("ir"),
                    "configuredAssetPath": configured_state.get("asset_path"),
                    "configuredMix": configured_state.get("mix"),
                    "configuredBypass": configured_state.get("bypass"),
                }
            )
        return payload

    @router.get("/waveform-preview")
    async def get_ir_waveform_preview(
        asset_path: str = Query(..., min_length=1),
        sample_count: int = Query(192, ge=32, le=512),
    ):
        """Return a downsampled waveform envelope preview for a selected IR asset."""
        return _build_ir_waveform_preview(asset_path, sample_count)

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
        engine = get_audio_engine()
        runtime_has_ir_instances = False
        allow_global_fallback = False
        if _has_plugin_position(plugin_position) and not (isinstance(scoped_instance_id, int) and scoped_instance_id > 0):
            runtime_has_ir_instances = await _runtime_has_ir_type(engine, type)
            if not runtime_has_ir_instances:
                allow_global_fallback = await _allow_global_ir_fallback(engine, type, plugin_position)
        if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
            unloaded = await engine.unload_ir_instance(scoped_instance_id)
            if not unloaded:
                raise HTTPException(status_code=404, detail=f"IR instance not found: {scoped_instance_id}")
        elif _has_plugin_position(plugin_position) and runtime_has_ir_instances:
            _raise_scoped_ir_not_found(type, instance_id, plugin_position)
        elif _has_plugin_position(plugin_position) and not allow_global_fallback:
            raise HTTPException(status_code=409, detail=_duplicate_ir_fallback_detail(type, plugin_position))
        elif _is_scoped_ir_request(instance_id, plugin_position) and not (
            _has_plugin_position(plugin_position) and allow_global_fallback
        ):
            _raise_scoped_ir_not_found(type, instance_id, plugin_position)
        elif type == "cabinet":
            _ir_processor.unload_ir("cabinet")
        else:
            _ir_processor.unload_ir("reverb")

        if _has_plugin_position(plugin_position):
            _persist_scoped_ir_state(type, plugin_position, clear_ir=True)
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
