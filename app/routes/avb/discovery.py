"""AVB discovery and AVDECC entity inventory routes."""

from .common import *

router = APIRouter()

@router.get("/devices")
async def get_avb_devices() -> Dict[str, Any]:
    """
    Get AVB device inventory exposed by JUCE engine.

    Returns:
        - available: AVB runtime availability
        - count: number of AVB device names
        - device_names: JUCE-selectable AVB device names
        - discovered_count: number of discovered endpoint cache entries
        - discovered_devices: normalized discovered endpoint metadata
    """
    try:
        from app.services.avb.avb_service import get_avb_service

        avb_service = get_avb_service()
        readiness_getter = getattr(avb_service, "get_readiness", None)
        if callable(readiness_getter):
            readiness = readiness_getter()
        else:
            available = False
            is_available = getattr(avb_service, "is_available", None)
            if callable(is_available):
                try:
                    available = bool(is_available())
                except Exception:
                    available = False
            readiness = {
                "enabled": available,
                "configured": available,
                "operational": available,
                "degraded": False,
                "available": available,
                "state": "operational" if available else "unavailable",
                "interface": None,
                "interface_source": "service_fallback",
                "reason": None if available else "AVB readiness unavailable",
                "checks": {},
            }
        device_names = list(getattr(avb_service, "get_device_names", lambda: [])() or [])
        source_node_id = _local_source_node_id()
        discovered_devices = []
        discovered_getter = getattr(avb_service, "get_discovered_devices", None)
        for raw_device in (discovered_getter() if callable(discovered_getter) else []):
            if isinstance(raw_device, dict):
                device = dict(raw_device)
            else:
                try:
                    device = dict(raw_device)
                except Exception:
                    continue
            device.setdefault("source_node_id", source_node_id)
            device.setdefault("node_id", device.get("source_node_id") or source_node_id)
            discovered_devices.append(device)

        return {
            "available": bool(readiness.get("available", False)),
            "readiness": readiness,
            "count": len(device_names),
            "device_names": device_names,
            "discovered_count": len(discovered_devices),
            "discovered_devices": discovered_devices,
            "source_node_id": source_node_id,
        }
    except Exception as e:
        logger.error(f"Error getting AVB device inventory: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
        return {
            "available": False,
            "count": 0,
            "device_names": [],
            "discovered_count": 0,
            "discovered_devices": [],
            "error": f"Internal error: {str(e)}",
        }


@router.get("/capabilities/channels")
async def get_avb_channel_capabilities() -> Dict[str, Any]:
    """Get canonical local + AVB channel capability inventory."""
    try:
        from app.services.avb.avb_service import get_avb_service
        from app.services.juce_engine_service import get_audio_engine

        audio_service = get_audio_engine()
        system_info: Dict[str, Any] = {}
        if audio_service.is_available:
            try:
                system_info = dict(audio_service.get_system_info() or {})
            except Exception as info_exc:
                logger.debug("AVB capabilities system_info lookup failed: %s", info_exc)

        avb_service = get_avb_service()
        capabilities = avb_service.get_channel_capabilities(system_info=system_info)
        return capabilities
    except Exception as e:
        logger.error(f"Error getting AVB channel capabilities: {e}", exc_info=True)
        return {
            "available": False,
            "readiness": get_avb_readiness(),
            "device": "unknown",
            "local_inputs": [],
            "local_outputs": [],
            "avb_talkers": [],
            "avb_listeners": [],
            "sample_rates": [],
            "summary": {
                "local_input_count": 0,
                "local_output_count": 0,
                "avb_talker_count": 0,
                "avb_listener_count": 0,
            },
            "error": f"Internal error: {str(e)}",
        }


# ============================================================================
# Discovery Endpoints
# ============================================================================

@router.get("/discovery")
async def get_avb_discovery() -> Dict[str, Any]:
    """
    Get AVB device discovery summary.

    Returns:
        Discovery summary with:
        - enabled: bool (AVB discovery enabled)
        - total_discovered: int (number of discovered AVB nodes)
        - talker_nodes: int (nodes with talker streams)
        - listener_nodes: int (nodes with listener streams)
        - nodes: list of discovered AvbNode objects

    This endpoint always returns 200 OK, even when AVB discovery is disabled.
    Check the 'enabled' field to determine if discovery is active.
    """
    try:
        from app.services.avb.avb_discovery import get_avb_discovery_service

        discovery = get_avb_discovery_service()
        return discovery.get_discovery_summary()

    except Exception as e:
        logger.error(f"Error getting AVB discovery summary: {e}", exc_info=True)
        return {
            "enabled": False,
            "total_discovered": 0,
            "talker_nodes": 0,
            "listener_nodes": 0,
            "nodes": [],
            "error": f"Internal error: {str(e)}"
        }


@router.get("/discovery/nodes")
async def get_discovered_nodes() -> Dict[str, Any]:
    """
    Get list of discovered AVB nodes.

    Returns:
        List of discovered AvbNode objects (online only)
    """
    try:
        from app.services.avb.avb_discovery import get_avb_discovery_service

        discovery = get_avb_discovery_service()

        if not discovery.is_enabled():
            return {
                "enabled": False,
                "nodes": [],
                "error": "AVB discovery not enabled"
            }

        nodes = discovery.get_discovered_nodes()

        return {
            "enabled": True,
            "nodes": [n.to_dict() for n in nodes]
        }

    except Exception as e:
        logger.error(f"Error getting discovered AVB nodes: {e}", exc_info=True)
        return {
            "enabled": False,
            "nodes": [],
            "error": f"Internal error: {str(e)}"
        }


@router.get("/discovery/nodes/{node_id}")
async def get_discovered_node(node_id: str) -> Dict[str, Any]:
    """Get specific discovered AVB node by ID"""
    try:
        from app.services.avb.avb_discovery import get_avb_discovery_service

        discovery = get_avb_discovery_service()

        if not discovery.is_enabled():
            raise HTTPException(status_code=503, detail="AVB discovery not enabled")

        node = discovery.get_discovered_node(node_id)

        if node is None:
            raise HTTPException(status_code=404, detail="Node not found")

        return node.to_dict()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting discovered AVB node: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# AVDECC (IEEE 1722.1) Endpoints
# ============================================================================

@router.get("/avdecc/entities")
async def get_avdecc_entities() -> Dict[str, Any]:
    """
    Get discovered AVDECC entities (third-party AVB devices).

    Returns:
        List of discovered AVDECC entities with capabilities.
    """
    try:
        source_node_id = _local_source_node_id()
        if not _is_avdecc_enabled():
            return {
                "enabled": False,
                "entities": [],
                "error": "AVDECC not enabled in configuration",
                "source_node_id": source_node_id,
            }

        from app.services.avb.avb_router import get_avb_router

        router = get_avb_router()

        if not router or not router.avdecc_entity:
            return {
                "enabled": True,
                "entities": [],
                "error": "AVDECC entity not initialized",
                "source_node_id": source_node_id,
            }

        discover_fn = _resolve_avdecc_callable(
            router.avdecc_entity,
            [
                "getDiscoveredEntities",
                "get_discovered_entities",
                "get_avdecc_entities",
                "getAvdeccEntities",
            ],
        )
        if discover_fn is None:
            return {
                "enabled": False,
                "entities": [],
                "error": "AVDECC discovery API unavailable",
                "source_node_id": source_node_id,
            }

        entities = discover_fn()
        if inspect.isawaitable(entities):
            entities = await entities
        entities_list = [_format_avdecc_entity_payload(entity, source_node_id=source_node_id) for entity in (entities or [])]

        return {
            "enabled": True,
            "entities": entities_list,
            "source_node_id": source_node_id,
        }

    except Exception as e:
        logger.error(f"Error getting AVDECC entities: {e}", exc_info=True)
        return {
            "enabled": False,
            "entities": [],
            "error": f"Internal error: {str(e)}"
        }


@router.get("/avdecc/entities/{entity_id}")
async def get_avdecc_entity(entity_id: str) -> Dict[str, Any]:
    """Get specific AVDECC entity by ID"""
    try:
        if not _is_avdecc_enabled():
            raise HTTPException(status_code=503, detail="AVDECC not enabled")

        from app.services.avb.avb_router import get_avb_router

        router = get_avb_router()

        if not router or not router.avdecc_entity:
            raise HTTPException(status_code=503, detail="AVDECC entity not initialized")

        normalized_id = _normalize_avdecc_entity_id(entity_id)
        if normalized_id is None:
            raise HTTPException(status_code=400, detail="Invalid entity ID format")

        entity = None
        find_fn = _resolve_avdecc_callable(router.avdecc_entity, ["findEntity", "find_entity"])
        if find_fn is not None:
            entity_id_int = int(normalized_id, 16)
            entity = find_fn(entity_id_int)
            if inspect.isawaitable(entity):
                entity = await entity
            if hasattr(entity, "value"):
                try:
                    entity = entity.value()
                except Exception:
                    pass

        if not entity:
            discover_fn = _resolve_avdecc_callable(
                router.avdecc_entity,
                [
                    "getDiscoveredEntities",
                    "get_discovered_entities",
                    "get_avdecc_entities",
                    "getAvdeccEntities",
                ],
            )
            if discover_fn is None:
                raise HTTPException(status_code=503, detail="AVDECC discovery API unavailable")

            entities = discover_fn()
            if inspect.isawaitable(entities):
                entities = await entities
            for candidate in entities or []:
                candidate_id = _normalize_avdecc_entity_id(
                    _read_avdecc_field(candidate, "entity_id", "entityId", default=None)
                )
                if candidate_id == normalized_id:
                    entity = candidate
                    break

        if not entity:
            raise HTTPException(status_code=404, detail="Entity not found")

        return _format_avdecc_entity_payload(entity, source_node_id=_local_source_node_id())

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting AVDECC entity: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/avdecc/stats")
async def get_avdecc_stats() -> Dict[str, Any]:
    """Get AVDECC protocol statistics"""
    try:
        if not _is_avdecc_enabled():
            return {
                "enabled": False,
                "error": "AVDECC not enabled"
            }

        from app.services.avb.avb_router import get_avb_router

        router = get_avb_router()

        if not router or not router.avdecc_entity:
            return {
                "enabled": True,
                "entities_discovered": 0,
                "connections_active": 0,
                "error": "AVDECC entity not initialized"
            }

        # Synthesize stats from available engine methods (no getStats binding exists)
        entities_discovered = 0
        connections_active = 0

        discover_fn = _resolve_avdecc_callable(
            router.avdecc_entity,
            ["get_avdecc_entities", "getDiscoveredEntities", "get_discovered_entities", "getAvdeccEntities"],
        )
        if discover_fn is not None:
            try:
                entities = await asyncio.to_thread(discover_fn)
                entities_discovered = len(entities) if entities else 0
            except Exception:
                pass

        connections_fn = _resolve_avdecc_callable(
            router.avdecc_entity,
            ["get_active_connections", "getActiveConnections"],
        )
        if connections_fn is not None:
            try:
                conns = await asyncio.to_thread(connections_fn)
                connections_active = len(conns) if conns else 0
            except Exception:
                pass

        return {
            "enabled": True,
            "adp": {"messages_sent": 0, "messages_received": 0},
            "acmp": {"messages_sent": 0, "messages_received": 0},
            "aecp": {"messages_sent": 0, "messages_received": 0},
            "entities_discovered": entities_discovered,
            "connections_active": connections_active
        }

    except Exception as e:
        logger.error(f"Error getting AVDECC stats: {e}", exc_info=True)
        return {
            "enabled": False,
            "error": f"Internal error: {str(e)}"
        }


# ============================================================================
# Routing Matrix Endpoints
# ============================================================================

@router.get("/avdecc/entities/{entity_id}/model")
async def get_entity_model(entity_id: str) -> Dict[str, Any]:
    """
    Get complete AVDECC entity model (descriptor tree).

    Returns enumerated entity model with all descriptors:
    - Entity descriptor (name, capabilities, etc.)
    - Configuration descriptors
    - Stream Input/Output descriptors
    - AVB Interface descriptors
    - Clock Source descriptors
    - Audio Unit descriptors

    Args:
        entity_id: Entity ID in hex format (e.g., "001b21fffe0102ab")

    Returns:
        Dict with:
        - entity_id: str (entity ID in hex)
        - model: dict (complete descriptor tree) if enumerated
        - complete: bool (true if enumeration finished successfully)
        - missing: list of missing descriptor types (if incomplete)
        - cached: bool (true if served from cache)
        - error: str (error message if unavailable)

    Raises:
        HTTPException 503: If AVDECC not available
        HTTPException 404: If entity not found or not enumerated
    """
    try:
        # Check if AVDECC is enabled
        if not _is_avdecc_enabled():
            raise HTTPException(
                status_code=503,
                detail="AVDECC not enabled in configuration"
            )

        # Check if AVDECC is available
        if not is_avb_available():
            raise HTTPException(
                status_code=503,
                detail="AVDECC hardware not available"
            )

        # Parse entity ID from hex
        try:
            entity_id_int = int(entity_id, 16)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid entity ID format: {entity_id} (expected hex)"
            )

        # Resolve low-level C++ engine from JUCE service singleton.
        from app.services.juce_engine_service import get_audio_engine, JUCE_AVAILABLE, juce_engine

        engine_service = get_audio_engine()
        if not engine_service:
            raise HTTPException(
                status_code=503,
                detail="Audio engine not available"
            )

        engine = getattr(engine_service, "_engine", None)
        if engine is None:
            raise HTTPException(
                status_code=503,
                detail="Audio engine not initialized"
            )

        # Check if AVDECC is available (compile-time check)
        if JUCE_AVAILABLE and juce_engine and hasattr(juce_engine, "is_avdecc_available"):
            if not juce_engine.is_avdecc_available():
                raise HTTPException(
                    status_code=503,
                    detail="AVDECC not compiled (USE_AVDECC=OFF)"
                )

        if not hasattr(engine, "get_avdecc_entity_model") or not hasattr(engine, "get_avdecc_entities"):
            raise HTTPException(
                status_code=503,
                detail="AVDECC entity model API not available in engine build"
            )

        entities = await asyncio.to_thread(engine.get_avdecc_entities)
        entity_info = next(
            (
                entity for entity in entities
                if _coerce_optional_hex_int(entity.get("entity_id")) == entity_id_int
            ),
            None,
        )

        cache = None
        entity_model_id_int: Optional[int] = None
        firmware_version = ""
        if entity_info:
            entity_model_id_int = _coerce_optional_hex_int(entity_info.get("entity_model_id"))
            firmware_version = str(entity_info.get("firmware_version", "")).strip()

        # Read-through cache (if cache key metadata is available).
        if entity_model_id_int is not None and firmware_version:
            try:
                from app.services.avb.aem_cache import get_aem_cache

                cache = get_aem_cache()
                max_age_seconds = _coerce_non_negative_int(
                    config_get("avb.avdecc.aem_cache_max_age_seconds", 86400),
                    86400,
                )
                cached_model = await asyncio.to_thread(
                    cache.get,
                    entity_model_id_int,
                    firmware_version,
                    max_age_seconds=max_age_seconds,
                    require_complete=True,
                    require_compatible=True,
                )
                if cached_model is not None:
                    cached_complete, cached_missing = _derive_model_completeness(cached_model)
                    if not _model_payload_is_compatible(
                        cached_model,
                        entity_model_id=entity_model_id_int,
                        firmware_version=firmware_version,
                    ):
                        await asyncio.to_thread(
                            cache.invalidate,
                            entity_model_id_int,
                            firmware_version,
                            "incompatible",
                        )
                    else:
                        return {
                            "entity_id": entity_id,
                            "model": cached_model,
                            "complete": cached_complete,
                            "missing": cached_missing,
                            "cached": True,
                        }
            except Exception as cache_exc:
                logger.warning(
                    "AEM cache lookup failed for entity %s: %s",
                    entity_id,
                    cache_exc,
                )

        # Cache miss or invalid cache; enumerate via engine.
        model_json = await asyncio.to_thread(engine.get_avdecc_entity_model, entity_id_int)

        if model_json is None:
            # Entity not found or not enumerated yet
            # Return detailed error
            raise HTTPException(
                status_code=404,
                detail=f"Entity {entity_id} not found or not enumerated. "
                       f"Found {len(entities)} total entities."
            )

        complete, missing = _derive_model_completeness(model_json)

        if cache is not None and entity_model_id_int is not None and firmware_version:
            try:
                if complete:
                    model_for_cache = dict(model_json)
                    model_for_cache.setdefault("entity_model_id", f"{entity_model_id_int:016x}")
                    model_for_cache.setdefault("firmware_version", firmware_version)
                    await asyncio.to_thread(
                        cache.set,
                        entity_model_id_int,
                        firmware_version,
                        model_for_cache,
                    )
                else:
                    await asyncio.to_thread(
                        cache.invalidate,
                        entity_model_id_int,
                        firmware_version,
                        "incomplete",
                    )
            except Exception as cache_exc:
                logger.warning(
                    "AEM cache writeback failed for entity %s: %s",
                    entity_id,
                    cache_exc,
                )

        # Return model with metadata
        return {
            "entity_id": entity_id,
            "model": model_json,
            "complete": complete,
            "missing": missing,
            "cached": False,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting entity model: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/avdecc/cache/stats")
async def get_aem_cache_stats() -> Dict[str, Any]:
    """
    Get AEM (Entity Model) cache statistics.

    Returns cache performance metrics including hit rate, entry count, etc.

    Returns:
        Dict with cache statistics:
        - hit_count: int
        - miss_count: int
        - total_requests: int
        - hit_rate_percent: float
        - entry_count: int
        - max_entries: int
        - cache_full: bool
        - enumeration_time_avg_ms: float
        - last_cleanup: datetime
        - cleanup_age_days: int
    """
    try:
        from app.services.avb.aem_cache import get_aem_cache

        cache = get_aem_cache()
        stats = await asyncio.to_thread(cache.get_stats)

        return stats

    except Exception as e:
        logger.error(f"Error getting AEM cache stats: {e}", exc_info=True)
        return {
            "error": f"Internal error: {str(e)}"
        }


for _route in router.routes:
    if hasattr(_route, "endpoint"):
        _route.endpoint.__module__ = "app.routes.avb"


__all__ = [name for name in globals() if not name.startswith("__")]


# ============================================================================
# AVDECC Stream Connection Management (Phase 11 - ACMP)
# ============================================================================
