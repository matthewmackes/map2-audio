"""
Audio port and routing /api/audio routes.
"""

from .common import *

router = APIRouter()

_CHAIN_ROUTING_CONFIG_KEY = "audio_routing"

# Global routing config stays memory-backed; per-chain overrides are persisted in Chain.config.
_port_routing_config = {
    "input_ports": [0, 1],  # Default: first stereo pair
    "output_ports": [0, 1],  # Default: first stereo pair
    "input_avb_endpoints": [],
    "output_avb_endpoints": [],
}

_chain_port_routing: Dict[int, Dict[str, list]] = {}


def _chain_routing_overrides() -> Dict[int, Dict[str, list]]:
    override = _audio_package_override("_chain_port_routing", _chain_port_routing)
    return override if isinstance(override, dict) else _chain_port_routing


def _dedupe_int_list(raw: Optional[List[int]]) -> List[int]:
    values: List[int] = []
    seen = set()
    for item in raw or []:
        try:
            value = int(item)
        except Exception:
            continue
        if value < 0 or value in seen:
            continue
        seen.add(value)
        values.append(value)
    return values

def _dedupe_string_list(raw: Optional[List[str]]) -> List[str]:
    values: List[str] = []
    seen = set()
    for item in raw or []:
        value = str(item or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        values.append(value)
    return values

def _sanitize_routing_payload(raw: Optional[Dict[str, Any]]) -> Dict[str, List[Any]]:
    payload = raw if isinstance(raw, dict) else {}
    return {
        "input_ports": _dedupe_int_list(payload.get("input_ports")),
        "output_ports": _dedupe_int_list(payload.get("output_ports")),
        "input_avb_endpoints": _dedupe_string_list(payload.get("input_avb_endpoints")),
        "output_avb_endpoints": _dedupe_string_list(payload.get("output_avb_endpoints")),
    }

def _parse_chain_config(raw_config: Any) -> Dict[str, Any]:
    if isinstance(raw_config, dict):
        return dict(raw_config)
    if not isinstance(raw_config, str) or not raw_config.strip():
        return {}
    try:
        parsed = json.loads(raw_config)
        return dict(parsed) if isinstance(parsed, dict) else {}
    except Exception:
        return {}

def _build_capability_indexes(capabilities: Dict[str, Any]) -> Dict[str, Any]:
    local_inputs = list(capabilities.get("local_inputs") or [])
    local_outputs = list(capabilities.get("local_outputs") or [])
    avb_talkers = list(capabilities.get("avb_talkers") or [])
    avb_listeners = list(capabilities.get("avb_listeners") or [])

    inputs_by_index = {
        int(port.get("index")): port
        for port in local_inputs
        if isinstance(port, dict) and str(port.get("index", "")).strip() != ""
    }
    outputs_by_index = {
        int(port.get("index")): port
        for port in local_outputs
        if isinstance(port, dict) and str(port.get("index", "")).strip() != ""
    }
    talkers_by_id = {
        str(device.get("endpoint_id")).strip(): device
        for device in avb_talkers
        if isinstance(device, dict) and str(device.get("endpoint_id", "")).strip()
    }
    listeners_by_id = {
        str(device.get("endpoint_id")).strip(): device
        for device in avb_listeners
        if isinstance(device, dict) and str(device.get("endpoint_id", "")).strip()
    }

    return {
        "local_input_indices": set(inputs_by_index.keys()),
        "local_output_indices": set(outputs_by_index.keys()),
        "inputs_by_index": inputs_by_index,
        "outputs_by_index": outputs_by_index,
        "talkers_by_id": talkers_by_id,
        "listeners_by_id": listeners_by_id,
    }

def _validate_local_ports(*, ports: List[int], allowed_indices: set, label: str) -> None:
    invalid = [port for port in ports if port not in allowed_indices]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {label} port(s): {invalid}. Valid {label} ports: {sorted(allowed_indices)}",
        )

def _validate_endpoint_ids(*, endpoint_ids: List[str], allowed_ids: set, label: str) -> None:
    invalid = [endpoint_id for endpoint_id in endpoint_ids if endpoint_id not in allowed_ids]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {label} endpoint(s): {invalid}. Endpoint must be currently discovered and available.",
        )

def _build_local_binding(
    *,
    direction: str,
    index: int,
    port_payload: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    if port_payload:
        return {
            "selection_type": "local_port",
            "index": index,
            "name": str(port_payload.get("name") or f"{direction.title()} {index + 1}"),
            "source": str(port_payload.get("source") or "juce_local"),
            "available": bool(port_payload.get("available", True)),
        }
    return {
        "selection_type": "local_port",
        "index": index,
        "name": f"{direction.title()} {index + 1}",
        "source": "juce_local",
        "available": False,
        "missing": True,
    }

def _build_avb_binding(
    *,
    direction: str,
    endpoint_id: str,
    endpoint_payload: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    if endpoint_payload:
        return {
            "selection_type": "avb_endpoint",
            "endpoint_id": endpoint_id,
            "direction": str(endpoint_payload.get("direction") or direction),
            "device_name": str(endpoint_payload.get("device_name") or endpoint_id),
            "host": str(endpoint_payload.get("host") or ""),
            "channels": int(endpoint_payload.get("channels") or 0),
            "sample_rate": int(endpoint_payload.get("sample_rate") or 0),
            "available": bool(endpoint_payload.get("available", True)),
        }
    return {
        "selection_type": "avb_endpoint",
        "endpoint_id": endpoint_id,
        "direction": direction,
        "device_name": endpoint_id,
        "host": "",
        "channels": 0,
        "sample_rate": 0,
        "available": False,
        "missing": True,
    }

def _build_routing_response(
    *,
    routing_payload: Dict[str, List[Any]],
    capabilities: Dict[str, Any],
    chain_id: Optional[int] = None,
    is_override: bool = False,
) -> Dict[str, Any]:
    indexes = _build_capability_indexes(capabilities)

    input_bindings = [
        _build_local_binding(
            direction="input",
            index=port_index,
            port_payload=indexes["inputs_by_index"].get(port_index),
        )
        for port_index in routing_payload["input_ports"]
    ] + [
        _build_avb_binding(
            direction="talker",
            endpoint_id=endpoint_id,
            endpoint_payload=indexes["talkers_by_id"].get(endpoint_id),
        )
        for endpoint_id in routing_payload["input_avb_endpoints"]
    ]

    output_bindings = [
        _build_local_binding(
            direction="output",
            index=port_index,
            port_payload=indexes["outputs_by_index"].get(port_index),
        )
        for port_index in routing_payload["output_ports"]
    ] + [
        _build_avb_binding(
            direction="listener",
            endpoint_id=endpoint_id,
            endpoint_payload=indexes["listeners_by_id"].get(endpoint_id),
        )
        for endpoint_id in routing_payload["output_avb_endpoints"]
    ]

    payload = {
        "available": True,
        "input_ports": routing_payload["input_ports"],
        "output_ports": routing_payload["output_ports"],
        "input_avb_endpoints": routing_payload["input_avb_endpoints"],
        "output_avb_endpoints": routing_payload["output_avb_endpoints"],
        "input_bindings": input_bindings,
        "output_bindings": output_bindings,
        "is_override": is_override,
    }
    if chain_id is not None:
        payload["chain_id"] = chain_id
    return payload

def _get_minimal_capabilities() -> Dict[str, Any]:
    return {
        "local_inputs": [],
        "local_outputs": [],
        "avb_talkers": [],
        "avb_listeners": [],
    }

def _get_current_capabilities(service: Any) -> Dict[str, Any]:
    from app.services.avb.avb_service import get_avb_service

    info = service.get_system_info()
    return get_avb_service().get_channel_capabilities(system_info=info)

async def _fetch_chain_routing_override(chain_id: int) -> tuple[bool, Optional[Dict[str, List[Any]]]]:
    from sqlalchemy import select
    from app.database import get_session, Chain

    async with get_session() as session:
        result = await session.execute(select(Chain).filter(Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is None:
            return False, None
        chain_config = _parse_chain_config(chain.config)
        raw_routing = chain_config.get(_CHAIN_ROUTING_CONFIG_KEY)
        if isinstance(raw_routing, dict):
            return True, _sanitize_routing_payload(raw_routing)
        return True, None

async def _persist_chain_routing_override(
    chain_id: int,
    routing_payload: Optional[Dict[str, List[Any]]],
) -> bool:
    from sqlalchemy import select
    from app.database import get_session, Chain

    async with get_session() as session:
        result = await session.execute(select(Chain).filter(Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is None:
            return False

        chain_config = _parse_chain_config(chain.config)
        if routing_payload is None:
            chain_config.pop(_CHAIN_ROUTING_CONFIG_KEY, None)
        else:
            chain_config[_CHAIN_ROUTING_CONFIG_KEY] = _sanitize_routing_payload(routing_payload)

        chain.config = json.dumps(chain_config)
        await session.flush()
        return True

def _apply_engine_routing(
    service: Any,
    *,
    chain_id: Optional[int] = None,
    input_ports: Optional[List[int]] = None,
    output_ports: Optional[List[int]] = None,
    input_avb_endpoints: Optional[List[str]] = None,
    output_avb_endpoints: Optional[List[str]] = None,
) -> None:
    engine = service.engine
    if engine is None:
        return

    def _call_first(method_names: List[str], *args: Any) -> bool:
        for method_name in method_names:
            method = getattr(engine, method_name, None)
            if callable(method):
                method(*args)
                return True
        return False

    if input_ports is not None:
        try:
            _call_first(["set_input_channels"], input_ports)
        except Exception as exc:
            logger.warning("Could not apply input routing to engine: %s", exc)

    if output_ports is not None:
        try:
            _call_first(["set_output_channels"], output_ports)
        except Exception as exc:
            logger.warning("Could not apply output routing to engine: %s", exc)

    if input_avb_endpoints is not None:
        try:
            applied = False
            if chain_id is not None:
                applied = _call_first(
                    ["set_chain_input_avb_endpoints", "setChainInputAvbEndpoints"],
                    chain_id,
                    input_avb_endpoints,
                )
            if not applied:
                _call_first(["set_input_avb_endpoints", "setAvbInputEndpoints"], input_avb_endpoints)
        except Exception as exc:
            logger.warning("Could not apply AVB input routing to engine: %s", exc)

    if output_avb_endpoints is not None:
        try:
            applied = False
            if chain_id is not None:
                applied = _call_first(
                    ["set_chain_output_avb_endpoints", "setChainOutputAvbEndpoints"],
                    chain_id,
                    output_avb_endpoints,
                )
            if not applied:
                _call_first(["set_output_avb_endpoints", "setAvbOutputEndpoints"], output_avb_endpoints)
        except Exception as exc:
            logger.warning("Could not apply AVB output routing to engine: %s", exc)

@router.get("/ports")
async def get_available_ports() -> Dict[str, Any]:
    """
    Get available audio input/output ports on the connected interface.

    Returns:
        List of input/output local ports + AVB endpoint capabilities.
    """
    service = get_audio_engine()
    from app.services.avb.avb_service import get_avb_service

    is_available = bool(
        getattr(service, "is_available", False)
        if not callable(getattr(service, "is_available", None))
        else service.is_available()
    )
    if not is_available:
        return {
            "available": False,
            "inputs": [],
            "outputs": [],
            "error": "Audio engine not available"
        }

    info = service.get_system_info()
    capabilities = get_avb_service().get_channel_capabilities(system_info=info)
    device_name = str(
        capabilities.get("device")
        or info.get("audio_device")
        or info.get("alsa_device")
        or "hw:0,0"
    )
    inputs = list(capabilities.get("local_inputs") or [])
    outputs = list(capabilities.get("local_outputs") or [])
    input_channels = len(inputs)
    output_channels = len(outputs)

    return {
        "available": True,
        "device": device_name,
        "inputs": inputs,
        "outputs": outputs,
        "input_count": input_channels,
        "output_count": output_channels,
        "avb_readiness": capabilities.get("readiness", {}),
        "avb_talkers": capabilities.get("avb_talkers", []),
        "avb_listeners": capabilities.get("avb_listeners", []),
        "capabilities": capabilities,
    }

@router.get("/routing")
async def get_port_routing() -> Dict[str, Any]:
    """
    Get current global audio port routing configuration.
    """
    service = get_engine_service()

    if not service.is_available:
        return {
            "available": False,
            "input_ports": [],
            "output_ports": [],
            "input_avb_endpoints": [],
            "output_avb_endpoints": [],
            "input_bindings": [],
            "output_bindings": [],
            "error": "Audio engine not available"
        }

    capabilities = _get_current_capabilities(service)
    return _build_routing_response(
        routing_payload=_sanitize_routing_payload(_port_routing_config),
        capabilities=capabilities,
        is_override=False,
    )

@router.post("/routing")
async def set_port_routing(
    input_ports: List[int] = Query(None, description="Input local port indices to use"),
    output_ports: List[int] = Query(None, description="Output local port indices to use"),
    input_avb_endpoints: List[str] = Query(None, description="AVB talker endpoint IDs to map as inputs"),
    output_avb_endpoints: List[str] = Query(None, description="AVB listener endpoint IDs to map as outputs"),
) -> Dict[str, Any]:
    """
    Set global audio routing configuration across local and AVB sources/sinks.
    """
    global _port_routing_config
    service = get_engine_service()

    if not service.is_available:
        raise HTTPException(status_code=503, detail="Audio engine not available")

    capabilities = _get_current_capabilities(service)
    indexes = _build_capability_indexes(capabilities)

    if input_ports is not None:
        normalized_input_ports = _dedupe_int_list(input_ports)
        _validate_local_ports(
            ports=normalized_input_ports,
            allowed_indices=indexes["local_input_indices"],
            label="input",
        )
        _port_routing_config["input_ports"] = normalized_input_ports
        _apply_engine_routing(service, input_ports=normalized_input_ports)

    if output_ports is not None:
        normalized_output_ports = _dedupe_int_list(output_ports)
        _validate_local_ports(
            ports=normalized_output_ports,
            allowed_indices=indexes["local_output_indices"],
            label="output",
        )
        _port_routing_config["output_ports"] = normalized_output_ports
        _apply_engine_routing(service, output_ports=normalized_output_ports)

    if input_avb_endpoints is not None:
        normalized_input_endpoints = _dedupe_string_list(input_avb_endpoints)
        _validate_endpoint_ids(
            endpoint_ids=normalized_input_endpoints,
            allowed_ids=set(indexes["talkers_by_id"].keys()),
            label="input AVB",
        )
        _port_routing_config["input_avb_endpoints"] = normalized_input_endpoints
        _apply_engine_routing(service, input_avb_endpoints=normalized_input_endpoints)

    if output_avb_endpoints is not None:
        normalized_output_endpoints = _dedupe_string_list(output_avb_endpoints)
        _validate_endpoint_ids(
            endpoint_ids=normalized_output_endpoints,
            allowed_ids=set(indexes["listeners_by_id"].keys()),
            label="output AVB",
        )
        _port_routing_config["output_avb_endpoints"] = normalized_output_endpoints
        _apply_engine_routing(service, output_avb_endpoints=normalized_output_endpoints)

    payload = _build_routing_response(
        routing_payload=_sanitize_routing_payload(_port_routing_config),
        capabilities=capabilities,
        is_override=False,
    )
    payload["success"] = True
    payload["message"] = "Port routing updated"
    return payload

@router.get("/routing/chain/{chain_id}")
async def get_chain_port_routing(chain_id: int) -> Dict[str, Any]:
    """
    Get routing for a specific chain, falling back to global routing.
    """
    service = get_engine_service()
    capabilities = _get_current_capabilities(service) if service.is_available else _get_minimal_capabilities()
    chain_exists, persisted_override = await _fetch_chain_routing_override(chain_id)

    legacy_override = _chain_routing_overrides().get(chain_id)
    merged_override = persisted_override
    if merged_override is None and isinstance(legacy_override, dict):
        merged_override = _sanitize_routing_payload(legacy_override)

    effective_routing = merged_override or _sanitize_routing_payload(_port_routing_config)
    payload = _build_routing_response(
        chain_id=chain_id,
        routing_payload=effective_routing,
        capabilities=capabilities,
        is_override=merged_override is not None,
    )
    payload["chain_exists"] = chain_exists
    return payload

@router.post("/routing/chain/{chain_id}")
async def set_chain_port_routing(
    chain_id: int,
    input_ports: List[int] = Query(None, description="Input local port indices for this chain"),
    output_ports: List[int] = Query(None, description="Output local port indices for this chain"),
    input_avb_endpoints: List[str] = Query(None, description="AVB talker endpoint IDs for this chain"),
    output_avb_endpoints: List[str] = Query(None, description="AVB listener endpoint IDs for this chain"),
) -> Dict[str, Any]:
    """
    Set routing override for a specific chain/flow and persist it in Chain.config.
    """
    service = get_engine_service()
    if not service.is_available:
        raise HTTPException(status_code=503, detail="Audio engine not available")

    capabilities = _get_current_capabilities(service)
    indexes = _build_capability_indexes(capabilities)
    chain_exists, persisted_override = await _fetch_chain_routing_override(chain_id)
    if not chain_exists:
        raise HTTPException(status_code=404, detail=f"Chain {chain_id} not found")

    if persisted_override is not None:
        routing_payload = dict(persisted_override)
    elif chain_id in _chain_routing_overrides():
        routing_payload = _sanitize_routing_payload(_chain_routing_overrides()[chain_id])
    else:
        routing_payload = _sanitize_routing_payload(_port_routing_config)

    if input_ports is not None:
        normalized_input_ports = _dedupe_int_list(input_ports)
        _validate_local_ports(
            ports=normalized_input_ports,
            allowed_indices=indexes["local_input_indices"],
            label="input",
        )
        routing_payload["input_ports"] = normalized_input_ports
        _apply_engine_routing(service, chain_id=chain_id, input_ports=normalized_input_ports)

    if output_ports is not None:
        normalized_output_ports = _dedupe_int_list(output_ports)
        _validate_local_ports(
            ports=normalized_output_ports,
            allowed_indices=indexes["local_output_indices"],
            label="output",
        )
        routing_payload["output_ports"] = normalized_output_ports
        _apply_engine_routing(service, chain_id=chain_id, output_ports=normalized_output_ports)

    if input_avb_endpoints is not None:
        normalized_input_endpoints = _dedupe_string_list(input_avb_endpoints)
        _validate_endpoint_ids(
            endpoint_ids=normalized_input_endpoints,
            allowed_ids=set(indexes["talkers_by_id"].keys()),
            label="input AVB",
        )
        routing_payload["input_avb_endpoints"] = normalized_input_endpoints
        _apply_engine_routing(
            service,
            chain_id=chain_id,
            input_avb_endpoints=normalized_input_endpoints,
        )

    if output_avb_endpoints is not None:
        normalized_output_endpoints = _dedupe_string_list(output_avb_endpoints)
        _validate_endpoint_ids(
            endpoint_ids=normalized_output_endpoints,
            allowed_ids=set(indexes["listeners_by_id"].keys()),
            label="output AVB",
        )
        routing_payload["output_avb_endpoints"] = normalized_output_endpoints
        _apply_engine_routing(
            service,
            chain_id=chain_id,
            output_avb_endpoints=normalized_output_endpoints,
        )

    routing_payload = _sanitize_routing_payload(routing_payload)
    persisted = await _persist_chain_routing_override(chain_id, routing_payload)
    if not persisted:
        raise HTTPException(status_code=404, detail=f"Chain {chain_id} not found")
    _chain_routing_overrides()[chain_id] = dict(routing_payload)

    payload = _build_routing_response(
        chain_id=chain_id,
        routing_payload=routing_payload,
        capabilities=capabilities,
        is_override=True,
    )
    payload["success"] = True
    payload["message"] = f"Chain {chain_id} routing updated"
    return payload

@router.delete("/routing/chain/{chain_id}")
async def clear_chain_port_routing(chain_id: int) -> Dict[str, Any]:
    """
    Remove per-chain routing override and revert to global routing.
    """
    chain_exists, _override = await _fetch_chain_routing_override(chain_id)
    if not chain_exists:
        raise HTTPException(status_code=404, detail=f"Chain {chain_id} not found")

    persisted = await _persist_chain_routing_override(chain_id, None)
    if not persisted:
        raise HTTPException(status_code=404, detail=f"Chain {chain_id} not found")

    overrides = _chain_routing_overrides()
    if chain_id in overrides:
        del overrides[chain_id]

    service = get_engine_service()
    capabilities = _get_current_capabilities(service) if service.is_available else _get_minimal_capabilities()
    payload = _build_routing_response(
        chain_id=chain_id,
        routing_payload=_sanitize_routing_payload(_port_routing_config),
        capabilities=capabilities,
        is_override=False,
    )
    payload["success"] = True
    payload["message"] = f"Chain {chain_id} reverted to global routing"
    return payload

@router.get("/ports/presets")
async def get_port_presets() -> Dict[str, Any]:
    """
    Get common port routing presets for the connected interface.

    Returns:
        List of preset routing configurations
    """
    service = get_engine_service()

    if not service.is_available:
        return {"presets": []}

    info = service.get_system_info()
    input_channels = info.get("input_channels", 2)
    output_channels = info.get("output_channels", 2)

    presets = []

    # Always have stereo preset
    presets.append({
        "id": "stereo",
        "name": "Stereo (1-2)",
        "description": "Standard stereo input/output",
        "input_ports": [0, 1],
        "output_ports": [0, 1]
    })

    # Add mono preset
    presets.append({
        "id": "mono",
        "name": "Mono (1)",
        "description": "Mono input to stereo output",
        "input_ports": [0],
        "output_ports": [0, 1]
    })

    # Multi-channel presets for interfaces with more ports
    if input_channels >= 4:
        presets.append({
            "id": "inputs_3_4",
            "name": "Inputs 3-4",
            "description": "Use inputs 3 and 4",
            "input_ports": [2, 3],
            "output_ports": [0, 1]
        })

    if input_channels >= 6:
        presets.append({
            "id": "spdif_in",
            "name": "S/PDIF Input",
            "description": "Digital S/PDIF input",
            "input_ports": [4, 5],
            "output_ports": [0, 1]
        })

    if output_channels >= 4:
        presets.append({
            "id": "outputs_3_4",
            "name": "Outputs 3-4",
            "description": "Route to outputs 3 and 4",
            "input_ports": [0, 1],
            "output_ports": [2, 3]
        })

    if output_channels >= 10:
        presets.append({
            "id": "spdif_out",
            "name": "S/PDIF Output",
            "description": "Digital S/PDIF output",
            "input_ports": [0, 1],
            "output_ports": [8, 9]
        })
        presets.append({
            "id": "all_analog_out",
            "name": "All Analog Outputs",
            "description": "Route to all 8 analog outputs",
            "input_ports": [0, 1],
            "output_ports": [0, 1, 2, 3, 4, 5, 6, 7]
        })

    return {
        "presets": presets,
        "current": {
            "input_ports": _port_routing_config["input_ports"],
            "output_ports": _port_routing_config["output_ports"],
            "input_avb_endpoints": _port_routing_config["input_avb_endpoints"],
            "output_avb_endpoints": _port_routing_config["output_avb_endpoints"],
        }
    }
