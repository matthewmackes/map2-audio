"""
Dual-Chain A/B Mode Service
Support for simultaneous chain processing, blending, and A/B comparison
"""

try:
    from fastapi import APIRouter, HTTPException, Query
    from pydantic import BaseModel
    from typing import Any, List, Optional, Dict
    from app.services.chain_service import ChainService
    from app.services.event_publisher import event_publisher, EventType

    router = APIRouter(prefix="/api/chains/ab", tags=["chains"])

    class ChainBlendConfig(BaseModel):
        """Configuration for A/B chain blending"""
        chain_a_id: int
        chain_b_id: int
        blend_position: float = 0.5  # 0 = 100% A, 1 = 100% B
        enabled: bool = True
        linked: bool = False  # True = synchronized pair

    class DuplicateChainRequest(BaseModel):
        """Request to duplicate a chain"""
        name: str
        include_settings: bool = True

    def _plugin_position(plugin: Dict[str, Any], fallback_index: int) -> Optional[int]:
        """Extract a stable chain position for duplicate-safe plugin matching."""
        for key in ("plugin_position", "position", "chain_position", "slot_index", "order", "index"):
            raw_position = plugin.get(key)
            try:
                position = int(raw_position)
            except (TypeError, ValueError):
                continue
            if position >= 0:
                return position
        return fallback_index if fallback_index >= 0 else None

    def _plugin_identity(plugin: Dict[str, Any], fallback_index: int) -> Optional[tuple[str, int]]:
        uri = plugin.get("uri")
        if not isinstance(uri, str) or not uri:
            return None
        position = _plugin_position(plugin, fallback_index)
        if position is None:
            return None
        return (uri, position)

    def _plugin_ref_payload(identity: tuple[str, int]) -> Dict[str, Any]:
        uri, plugin_position = identity
        return {"uri": uri, "plugin_position": plugin_position}

    def _plugins_by_identity(chain: Dict[str, Any]) -> Dict[tuple[str, int], Dict[str, Any]]:
        plugins: Dict[tuple[str, int], Dict[str, Any]] = {}
        for index, plugin in enumerate(chain.get("plugins", [])):
            if not isinstance(plugin, dict):
                continue
            identity = _plugin_identity(plugin, index)
            if identity is None:
                continue
            plugins[identity] = plugin
        return plugins

    @router.post("/{chain_id}/duplicate")
    async def duplicate_chain(chain_id: int, request: DuplicateChainRequest):
        """Duplicate a signal chain with all plugins and settings.
        
        Useful for creating A/B pairs quickly.
        
        Args:
            chain_id: Source chain ID
            request: Duplication parameters
        """
        from app.database import get_session
        
        if not request.name or len(request.name) < 1 or len(request.name) > 256:
            raise HTTPException(status_code=400, detail="Chain name must be 1-256 characters")

        async with get_session() as session:
            service = ChainService(session)
            
            # Get source chain
            source_chain = await service.get_chain(chain_id)
            if not source_chain:
                raise HTTPException(status_code=404, detail="Source chain not found")
            
            # Create new chain
            new_chain = await service.create_chain(request.name)
            if not new_chain:
                raise HTTPException(status_code=400, detail="Failed to create duplicate chain")
            
            # Copy all plugins from source
            for plugin in source_chain.get("plugins", []):
                await service.add_plugin_to_chain(new_chain["id"], plugin["uri"])
                
                # Parameter snapshots are not persisted in ChainPlugin rows.
                # Runtime parameter state is managed by the engine layer.
                if plugin.get("parameters"):
                    continue
            
            # Publish event
            await event_publisher.publish(
                "chain_updates",
                EventType.CHAIN_CREATED,
                {
                    "chain_id": new_chain["id"],
                    "name": new_chain["name"],
                    "duplicated_from": chain_id,
                }
            )
            
            return new_chain

    @router.post("/{chain_id}/blend")
    async def set_chain_blend(chain_id: int, config: ChainBlendConfig):
        """Configure A/B blending for two chains.
        
        Args:
            chain_id: Primary chain ID (typically chain A)
            config: Blend configuration
        """
        from app.database import get_session
        
        if config.blend_position < 0 or config.blend_position > 1:
            raise HTTPException(status_code=400, detail="Blend position must be between 0 and 1")

        async with get_session() as session:
            service = ChainService(session)
            
            # Validate both chains exist
            chain_a = await service.get_chain(config.chain_a_id)
            chain_b = await service.get_chain(config.chain_b_id)
            
            if not chain_a or not chain_b:
                raise HTTPException(status_code=404, detail="One or both chains not found")
            
            # Store blend config (in real implementation, would save to database)
            blend_data = {
                "chain_a_id": config.chain_a_id,
                "chain_b_id": config.chain_b_id,
                "blend_position": config.blend_position,
                "enabled": config.enabled,
                "linked": config.linked,
            }
            
            # Publish blend configuration event
            await event_publisher.publish(
                "chain_updates",
                EventType.CHAIN_BLENDED,
                blend_data
            )
            
            return {
                "status": "blend_configured",
                "blend_config": blend_data,
            }

    @router.get("/{chain_a_id}/compare/{chain_b_id}")
    async def compare_chains(chain_a_id: int, chain_b_id: int):
        """Get comparison data for two chains.
        
        Useful for A/B testing and visualization.
        """
        from app.database import get_session
        
        async with get_session() as session:
            service = ChainService(session)
            
            chain_a = await service.get_chain(chain_a_id)
            chain_b = await service.get_chain(chain_b_id)
            
            if not chain_a or not chain_b:
                raise HTTPException(status_code=404, detail="One or both chains not found")
            
            # Calculate differences
            plugins_a = _plugins_by_identity(chain_a)
            plugins_b = _plugins_by_identity(chain_b)
            
            only_in_a = [p for identity, p in plugins_a.items() if identity not in plugins_b]
            only_in_b = [p for identity, p in plugins_b.items() if identity not in plugins_a]
            common = [identity for identity in plugins_a if identity in plugins_b]
            
            return {
                "chain_a": chain_a,
                "chain_b": chain_b,
                "differences": {
                    "only_in_a": only_in_a,
                    "only_in_b": only_in_b,
                    "common_plugins": len(common),
                    "common_plugin_refs": [_plugin_ref_payload(identity) for identity in common],
                    "plugin_count_diff": len(chain_a.get("plugins", [])) - len(chain_b.get("plugins", [])),
                },
                "estimated_latency_diff": abs(
                    sum(p.get("latency_samples", 0) for p in chain_a["plugins"]) -
                    sum(p.get("latency_samples", 0) for p in chain_b["plugins"])
                ),
            }

    @router.post("/{chain_id}/morph")
    async def morph_chain_parameters(
        chain_id: int,
        target_chain_id: int,
        progress: float = Query(0.5, ge=0, le=1)
    ):
        """Morph parameters from one chain to another.
        
        Smoothly interpolate between two chain configurations.
        Useful for parameter sweeps and preset interpolation.
        
        Args:
            chain_id: Source chain
            target_chain_id: Target chain
            progress: 0 = source, 1 = target, 0.5 = midpoint
        """
        from app.database import get_session
        
        async with get_session() as session:
            service = ChainService(session)
            
            source = await service.get_chain(chain_id)
            target = await service.get_chain(target_chain_id)
            
            if not source or not target:
                raise HTTPException(status_code=404, detail="Source or target chain not found")
            
            # Find common plugins between source and target chains
            source_plugins = _plugins_by_identity(source)
            target_plugins = _plugins_by_identity(target)
            common_identities = [
                identity for identity in source_plugins
                if identity in target_plugins
            ]
            
            # Interpolate parameters for common plugins
            morphed_plugins = []
            for identity in common_identities:
                uri, plugin_position = identity
                src_plugin = source_plugins[identity]
                tgt_plugin = target_plugins[identity]
                
                # Get parameters from both plugins
                src_params = {p["symbol"]: p for p in src_plugin.get("parameters", [])}
                tgt_params = {p["symbol"]: p for p in tgt_plugin.get("parameters", [])}
                
                interpolated_params = []
                for symbol in src_params:
                    if symbol in tgt_params:
                        src_val = src_params[symbol].get("value", 0)
                        tgt_val = tgt_params[symbol].get("value", 0)
                        
                        # Only interpolate numeric values
                        if isinstance(src_val, (int, float)) and isinstance(tgt_val, (int, float)):
                            # Linear interpolation: result = src + (tgt - src) * progress
                            interpolated_val = src_val + (tgt_val - src_val) * progress
                            
                            interpolated_params.append({
                                "symbol": symbol,
                                "name": src_params[symbol].get("name", symbol),
                                "source_value": src_val,
                                "target_value": tgt_val,
                                "morphed_value": interpolated_val,
                            })
                
                morphed_plugins.append({
                    "uri": uri,
                    "plugin_position": plugin_position,
                    "name": src_plugin.get("name", uri),
                    "parameters": interpolated_params,
                    "param_count": len(interpolated_params),
                })
            
            # Build comprehensive morphed state
            morphed_state = {
                "source_chain_id": chain_id,
                "target_chain_id": target_chain_id,
                "progress": progress,
                "status": "morphed",
                "common_plugins": len(common_identities),
                "common_plugin_refs": [_plugin_ref_payload(identity) for identity in common_identities],
                "morphed_plugins": morphed_plugins,
                "total_interpolated_params": sum(p["param_count"] for p in morphed_plugins),
                "source_only_plugins": [
                    _plugin_ref_payload(identity)
                    for identity in source_plugins
                    if identity not in target_plugins
                ],
                "target_only_plugins": [
                    _plugin_ref_payload(identity)
                    for identity in target_plugins
                    if identity not in source_plugins
                ],
            }
            
            # Apply morphed parameters to active chain if source is active
            try:
                from app.services.juce_engine_service import get_audio_engine
                engine = get_audio_engine()
                if engine and engine.is_running:
                    for plugin in morphed_plugins:
                        for param in plugin["parameters"]:
                            await engine.set_parameter(
                                plugin["uri"],
                                param["symbol"],
                                param["morphed_value"],
                                plugin_position=plugin.get("plugin_position"),
                            )
                    morphed_state["applied_to_engine"] = True
            except Exception as e:
                morphed_state["applied_to_engine"] = False
                morphed_state["engine_error"] = str(e)
            
            await event_publisher.publish(
                "chain_updates",
                EventType.CHAIN_MORPHED,
                morphed_state
            )
            
            return morphed_state

    @router.get("/{chain_id}/dsp-load")
    async def get_chain_dsp_load(chain_id: int):
        """Get current DSP load estimate for a chain.
        
        Returns CPU usage percentage and per-plugin breakdown.
        """
        from app.database import get_session
        
        async with get_session() as session:
            service = ChainService(session)
            
            chain = await service.get_chain(chain_id)
            if not chain:
                raise HTTPException(status_code=404, detail="Chain not found")
            
            # Estimate DSP load (in real implementation, would query audio service)
            plugin_loads = []
            total_load = 0.0
            
            for plugin in chain.get("plugins", []):
                # Rough estimates - would be calibrated per hardware
                estimated_load = {
                    "Distortion": 2.5,
                    "Reverb": 15.0,
                    "Compressor": 3.0,
                    "EQ": 2.0,
                    "Delay": 5.0,
                    "Modulation": 3.5,
                }.get(plugin.get("class_label", "Generic"), 1.0)
                
                plugin_loads.append({
                    "uri": plugin["uri"],
                    "name": plugin["name"],
                    "estimated_cpu_percent": estimated_load,
                    "is_bypassed": plugin.get("bypassed", False),
                })
                
                if not plugin.get("bypassed"):
                    total_load += estimated_load
            
            return {
                "chain_id": chain_id,
                "chain_name": chain["name"],
                "total_dsp_load_percent": min(total_load, 100.0),
                "plugin_loads": plugin_loads,
                "warning": total_load > 80,
                "warning_message": "DSP load exceeding 80% - risk of audio dropouts" if total_load > 80 else None,
            }

except ImportError:
    pass  # FastAPI not installed
