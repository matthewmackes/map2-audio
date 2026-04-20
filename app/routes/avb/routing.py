"""AVB stream, router, and AVDECC connection routes."""

from .common import *

router = APIRouter()

@router.get("/streams")
async def get_streams() -> Dict[str, Any]:
    """
    Get all AVB streams.

    Returns:
        List of stream information dicts
    """
    try:
        from app.services.avb.avb_service import get_avb_service

        avb_service = get_avb_service()

        if not avb_service.is_available():
            return {
                "available": False,
                "streams": [],
                "error": "AVB not available"
            }

        streams = avb_service.get_all_streams()
        snapshots = await _collect_transport_health_snapshots(streams)
        ptp_status = snapshots["ptp"]
        tsn_by_interface = snapshots["tsn_by_interface"]

        enriched_streams: List[Dict[str, Any]] = []
        for stream in streams:
            if not isinstance(stream, dict):
                continue
            stream_payload = dict(stream)
            stream_interface = _stream_interface_name(stream_payload)
            tsn_status = tsn_by_interface.get(stream_interface)
            if tsn_status is None:
                tsn_status = {"available": False, "interface": stream_interface, "error": "TSN status unavailable"}
            stream_payload["health"] = _build_stream_health(
                stream_payload,
                ptp_status=ptp_status,
                tsn_status=tsn_status,
            )
            stream_payload["diagnostics"] = _build_stream_diagnostics(
                stream_payload,
                avb_service=avb_service,
                ptp_status=ptp_status,
                tsn_status=tsn_status,
            )
            enriched_streams.append(stream_payload)

        return {
            "available": True,
            "streams": enriched_streams
        }

    except Exception as e:
        logger.error(f"Error getting AVB streams: {e}", exc_info=True)
        return {
            "available": False,
            "streams": [],
            "error": f"Internal error: {str(e)}"
        }


@router.get("/streams/{stream_id}")
async def get_stream(stream_id: str) -> Dict[str, Any]:
    """Get specific AVB stream information"""
    try:
        from app.services.avb.avb_service import get_avb_service

        avb_service = get_avb_service()

        if not avb_service.is_available():
            raise HTTPException(status_code=503, detail="AVB not available")

        stream = avb_service.get_stream(stream_id)

        if stream is None:
            raise HTTPException(status_code=404, detail="Stream not found")

        if not isinstance(stream, dict):
            raise HTTPException(status_code=500, detail="Invalid stream payload")

        snapshots = await _collect_transport_health_snapshots([stream])
        ptp_status = snapshots["ptp"]
        stream_interface = _stream_interface_name(stream)
        tsn_status = snapshots["tsn_by_interface"].get(stream_interface)
        if tsn_status is None:
            tsn_status = {"available": False, "interface": stream_interface, "error": "TSN status unavailable"}

        stream_payload = dict(stream)
        stream_payload["health"] = _build_stream_health(
            stream_payload,
            ptp_status=ptp_status,
            tsn_status=tsn_status,
        )
        stream_payload["diagnostics"] = _build_stream_diagnostics(
            stream_payload,
            avb_service=avb_service,
            ptp_status=ptp_status,
            tsn_status=tsn_status,
        )
        return stream_payload

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting AVB stream: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/streams/{stream_id}/diagnostics")
async def get_stream_diagnostics(stream_id: str) -> Dict[str, Any]:
    """Get one stream with consolidated runtime diagnostics."""
    try:
        from app.services.avb.avb_service import get_avb_service

        avb_service = get_avb_service()

        if not avb_service.is_available():
            raise HTTPException(status_code=503, detail="AVB not available")

        stream = avb_service.get_stream(stream_id)
        if stream is None:
            raise HTTPException(status_code=404, detail="Stream not found")
        if not isinstance(stream, dict):
            raise HTTPException(status_code=500, detail="Invalid stream payload")

        snapshots = await _collect_transport_health_snapshots([stream])
        ptp_status = snapshots["ptp"]
        stream_interface = _stream_interface_name(stream)
        tsn_status = snapshots["tsn_by_interface"].get(stream_interface)
        if tsn_status is None:
            tsn_status = {"available": False, "interface": stream_interface, "error": "TSN status unavailable"}

        stream_payload = dict(stream)
        health = _build_stream_health(
            stream_payload,
            ptp_status=ptp_status,
            tsn_status=tsn_status,
        )
        diagnostics = _build_stream_diagnostics(
            stream_payload,
            avb_service=avb_service,
            ptp_status=ptp_status,
            tsn_status=tsn_status,
        )

        return {
            "stream_id": stream_payload.get("stream_id"),
            "state": stream_payload.get("state"),
            "health": health,
            "diagnostics": diagnostics,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting AVB stream diagnostics: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/streams")
async def create_stream(config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Create new AVB stream.

    Body:
        {
            "stream_id": "stream-001",
            "direction": "talker" or "listener",
            "channels": 2,
            "sample_rate": 48000,
            "buffer_size": 256,
            "interface": "enp3s0",
            "dest_mac": "01:AA:BB:CC:DD:EE"  // for talkers only
        }
    """
    try:
        from app.services.avb.avb_service import get_avb_service, AvbStreamConfig, StreamDirection

        avb_service = get_avb_service()

        if not avb_service.is_available():
            raise HTTPException(status_code=503, detail="AVB not available")

        stream_id = config.get("stream_id")
        if not isinstance(stream_id, str) or not stream_id.strip():
            raise HTTPException(status_code=400, detail="stream_id is required")

        direction_raw = config.get("direction")
        if not isinstance(direction_raw, str):
            raise HTTPException(status_code=400, detail="direction must be 'talker' or 'listener'")
        try:
            direction = StreamDirection(direction_raw)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="direction must be 'talker' or 'listener'") from exc

        srp_payload = config.get("srp")
        srp_reservation_id = None
        srp_admission_id = None
        srp_metadata: Dict[str, Any] = {}

        if srp_payload is not None:
            if not isinstance(srp_payload, dict):
                raise HTTPException(status_code=400, detail="srp must be an object when provided")

            srp_reservation_raw = srp_payload.get("reservation_id")
            if srp_reservation_raw is not None:
                if not isinstance(srp_reservation_raw, str) or not srp_reservation_raw.strip():
                    raise HTTPException(status_code=400, detail="srp.reservation_id must be a non-empty string")
                srp_reservation_id = srp_reservation_raw.strip()

            srp_admission_raw = srp_payload.get("admission_id")
            if srp_admission_raw is not None:
                if not isinstance(srp_admission_raw, str) or not srp_admission_raw.strip():
                    raise HTTPException(status_code=400, detail="srp.admission_id must be a non-empty string")
                srp_admission_id = srp_admission_raw.strip()

            for key in (
                "talker_id",
                "listener_id",
                "endpoint",
                "class",
                "vlan_id",
                "daemon_type",
                "daemon_socket",
            ):
                if key in srp_payload:
                    srp_metadata[key] = srp_payload.get(key)

            if _srp_required() and srp_reservation_id is None:
                raise HTTPException(
                    status_code=400,
                    detail="Strict SRP mode requires srp.reservation_id when SRP metadata is provided",
                )

        channels = _require_positive_int_field(config, "channels", default=2)
        sample_rate = _require_positive_int_field(config, "sample_rate", default=48000)
        buffer_size = _require_positive_int_field(config, "buffer_size", default=256)
        presentation_offset_us = _require_positive_int_field(config, "presentation_offset_us", default=2000)

        try:
            priority = int(config.get("priority", 3))
        except Exception as exc:
            raise HTTPException(status_code=400, detail="priority must be an integer between 0 and 7") from exc
        if priority < 0 or priority > 7:
            raise HTTPException(status_code=400, detail="priority must be an integer between 0 and 7")

        interface = _resolve_stream_interface(config)
        global_failover_policy = _sanitize_failover_policy(config_get("avb.failover_policy", "none"))
        failover_policy = _parse_failover_policy(
            config.get("failover_policy"),
            default=global_failover_policy,
        )
        failover_raw = config.get("failover_interfaces", config_get("avb.failover_interfaces", []))
        failover_interfaces = _parse_failover_interfaces(failover_raw)
        if interface and interface not in failover_interfaces:
            failover_interfaces.insert(0, interface)
        ownership = _parse_stream_ownership(config)
        connection_role = _parse_connection_role(config.get("connection_role"))
        loop_id = _coerce_optional_text(config.get("loop_id"))

        # Parse config
        stream_config = AvbStreamConfig(
            stream_id=stream_id,
            direction=direction,
            channels=channels,
            sample_rate=sample_rate,
            buffer_size=buffer_size,
            interface=interface,
            dest_mac=config.get("dest_mac"),
            presentation_offset_us=presentation_offset_us,
            priority=priority,
            failover_policy=failover_policy,
            failover_interfaces=failover_interfaces,
            srp_reservation_id=srp_reservation_id,
            srp_admission_id=srp_admission_id,
            srp_metadata=srp_metadata,
            owner_node_id=ownership["owner_node_id"],
            peer_node_id=ownership["peer_node_id"],
            owner_endpoint_id=ownership["owner_endpoint_id"],
            peer_endpoint_id=ownership["peer_endpoint_id"],
            talker_node_id=ownership["talker_node_id"],
            listener_node_id=ownership["listener_node_id"],
            talker_endpoint_id=ownership["talker_endpoint_id"],
            listener_endpoint_id=ownership["listener_endpoint_id"],
            connection_role=connection_role,
            loop_id=loop_id,
        )

        result = await avb_service.create_stream(stream_config)

        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        await _broadcast_avb_runtime_updates()
        return result

    except HTTPException:
        raise
    except (TypeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid stream config: {e}")
    except Exception as e:
        logger.error(f"Error creating AVB stream: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/streams/{stream_id}")
async def delete_stream(stream_id: str) -> Dict[str, Any]:
    """Delete AVB stream"""
    try:
        from app.services.avb.avb_service import get_avb_service

        avb_service = get_avb_service()

        if not avb_service.is_available():
            raise HTTPException(status_code=503, detail="AVB not available")

        binding = avb_service.get_srp_binding(stream_id)
        result = await avb_service.delete_stream(stream_id)

        if "error" in result:
            if result["code"] == "NOT_FOUND":
                raise HTTPException(status_code=404, detail=result["error"])
            raise HTTPException(status_code=400, detail=result["error"])

        if binding and binding.get("reservation_id"):
            reservation_id = str(binding["reservation_id"])
            try:
                from app.services.avb.srp_admission import get_srp_admission_service

                release_result = await get_srp_admission_service().release(
                    reservation_id=reservation_id,
                    endpoint="streams.delete",
                    stream_id=stream_id,
                )
                avb_service.clear_srp_reservation(stream_id)
                result["srp_release"] = _build_srp_release_payload(
                    release_result,
                    reservation_id=reservation_id,
                )
            except Exception as exc:
                logger.warning("SRP release failed during stream delete %s: %s", stream_id, exc)
                result["srp_release_warning"] = _build_srp_release_warning(
                    reason="Stream delete succeeded but SRP reservation release failed",
                    reservation_id=reservation_id,
                    detail=exc,
                )

        await _broadcast_avb_runtime_updates()
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting AVB stream: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/streams/{stream_id}/start")
async def start_stream(stream_id: str) -> Dict[str, Any]:
    """Start AVB stream"""
    created_binding = False
    start_succeeded = False
    rollback_handled = False
    srp_binding: Optional[Dict[str, Any]] = None
    avb_service = None
    admission: Any = None

    try:
        from app.services.avb.avb_service import get_avb_service
        from app.services.avb.srp_admission import SrpAdmissionRequest, get_srp_admission_service

        avb_service = get_avb_service()

        if not avb_service.is_available():
            raise HTTPException(status_code=503, detail="AVB not available")

        stream = avb_service.get_stream(stream_id)
        if stream is None:
            raise HTTPException(status_code=404, detail="Stream not found")

        srp_binding = avb_service.get_srp_binding(stream_id)
        admission_payload: Optional[Dict[str, Any]] = None

        if _srp_enabled() and not srp_binding:
            admission = await get_srp_admission_service().admit(
                SrpAdmissionRequest(
                    endpoint="streams.start",
                    stream_id=stream_id,
                    talker_id=stream_id if stream.get("direction") == "talker" else None,
                    listener_id=stream_id if stream.get("direction") == "listener" else None,
                    request_metadata={
                        "direction": stream.get("direction"),
                        "channels": stream.get("config", {}).get("channels"),
                        "sample_rate": stream.get("config", {}).get("sample_rate"),
                    },
                )
            )
            admission_payload = admission.to_dict()
            if admission.decision == "denied":
                _raise_srp_denied(admission)
            if admission.decision == "allowed":
                if not admission.reservation_id:
                    _raise_srp_denied(
                        admission,
                        code="SRP_ADMISSION_INVALID",
                        reason_code="SRP_INVALID_ADMISSION",
                        reason="SRP admission acknowledged without reservation_id",
                    )

                bound = avb_service.bind_srp_reservation(
                    stream_id,
                    admission.reservation_id,
                    admission_id=admission.admission_id,
                    metadata={
                        "endpoint": admission.endpoint,
                        "daemon_type": admission.daemon_type,
                        "daemon_socket": admission.daemon_socket,
                        "reason_code": admission.reason_code,
                    },
                )
                if not bound:
                    raise HTTPException(status_code=500, detail="Failed to bind SRP reservation to stream")
                created_binding = True
                srp_binding = avb_service.get_srp_binding(stream_id)

        result = await avb_service.start_stream(stream_id)

        if "error" in result:
            if created_binding and srp_binding and srp_binding.get("reservation_id"):
                reservation_id = str(srp_binding["reservation_id"])
                try:
                    release_result = await get_srp_admission_service().release(
                        reservation_id=reservation_id,
                        endpoint="streams.start.rollback",
                        stream_id=stream_id,
                    )
                    avb_service.clear_srp_reservation(stream_id)
                    result["srp_release"] = _build_srp_release_payload(
                        release_result,
                        reservation_id=reservation_id,
                    )
                    rollback_handled = True
                except Exception as release_exc:
                    logger.warning(
                        "SRP release failed during stream start rollback %s: %s",
                        stream_id,
                        release_exc,
                    )
                    result["srp_release_warning"] = _build_srp_release_warning(
                        reason="Stream start failed and SRP rollback release also failed",
                        reservation_id=reservation_id,
                        detail=release_exc,
                    )
                    rollback_handled = True
            if result["code"] == "NOT_FOUND":
                raise HTTPException(status_code=404, detail=result["error"])
            raise HTTPException(status_code=400, detail=result["error"])

        start_succeeded = True

        if srp_binding:
            result["srp"] = srp_binding
        if admission_payload:
            result["srp_admission"] = admission_payload

        await _broadcast_avb_runtime_updates()
        return result

    except HTTPException:
        if avb_service is not None:
            rollback_reservation: Optional[str] = None
            if created_binding and srp_binding and srp_binding.get("reservation_id"):
                rollback_reservation = str(srp_binding["reservation_id"])
            elif admission is not None and getattr(admission, "decision", None) == "allowed":
                reservation_id = getattr(admission, "reservation_id", None)
                if reservation_id:
                    rollback_reservation = str(reservation_id)

            if rollback_reservation and not start_succeeded and not rollback_handled:
                try:
                    from app.services.avb.srp_admission import get_srp_admission_service

                    await get_srp_admission_service().release(
                        reservation_id=rollback_reservation,
                        endpoint="streams.start.exception",
                        stream_id=stream_id,
                    )
                    if created_binding:
                        avb_service.clear_srp_reservation(stream_id)
                except Exception as release_exc:
                    logger.warning(
                        "SRP release failed during stream start HTTPException %s: %s",
                        stream_id,
                        release_exc,
                    )
        raise
    except Exception as e:
        if avb_service is not None:
            rollback_reservation: Optional[str] = None
            if created_binding and srp_binding and srp_binding.get("reservation_id"):
                rollback_reservation = str(srp_binding["reservation_id"])
            elif admission is not None and getattr(admission, "decision", None) == "allowed":
                reservation_id = getattr(admission, "reservation_id", None)
                if reservation_id:
                    rollback_reservation = str(reservation_id)

            if rollback_reservation and not start_succeeded and not rollback_handled:
                try:
                    from app.services.avb.srp_admission import get_srp_admission_service

                    await get_srp_admission_service().release(
                        reservation_id=rollback_reservation,
                        endpoint="streams.start.exception",
                        stream_id=stream_id,
                    )
                    if created_binding:
                        avb_service.clear_srp_reservation(stream_id)
                except Exception as release_exc:
                    logger.warning(
                        "SRP release failed during stream start exception %s: %s",
                        stream_id,
                        release_exc,
                    )
        logger.error(f"Error starting AVB stream: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/streams/{stream_id}/stop")
async def stop_stream(stream_id: str) -> Dict[str, Any]:
    """Stop AVB stream"""
    try:
        from app.services.avb.avb_service import get_avb_service
        from app.services.avb.srp_admission import get_srp_admission_service

        avb_service = get_avb_service()

        if not avb_service.is_available():
            raise HTTPException(status_code=503, detail="AVB not available")

        srp_binding = avb_service.get_srp_binding(stream_id)
        result = await avb_service.stop_stream(stream_id)

        if "error" in result:
            if result["code"] == "NOT_FOUND":
                raise HTTPException(status_code=404, detail=result["error"])
            raise HTTPException(status_code=400, detail=result["error"])

        if srp_binding and srp_binding.get("reservation_id"):
            reservation_id = str(srp_binding["reservation_id"])
            try:
                release_result = await get_srp_admission_service().release(
                    reservation_id=reservation_id,
                    endpoint="streams.stop",
                    stream_id=stream_id,
                )
                avb_service.clear_srp_reservation(stream_id)
                result["srp_release"] = _build_srp_release_payload(
                    release_result,
                    reservation_id=reservation_id,
                )
            except Exception as release_exc:
                logger.warning("SRP release failed during stream stop %s: %s", stream_id, release_exc)
                result["srp_release_warning"] = _build_srp_release_warning(
                    reason="Stream stop succeeded but SRP reservation release failed",
                    reservation_id=reservation_id,
                    detail=release_exc,
                )

        await _broadcast_avb_runtime_updates()
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error stopping AVB stream: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/streams/{stream_id}/stats")
async def get_stream_stats(stream_id: str) -> Dict[str, Any]:
    """Get AVB stream statistics"""
    try:
        from app.services.avb.avb_service import get_avb_service

        avb_service = get_avb_service()

        if not avb_service.is_available():
            raise HTTPException(status_code=503, detail="AVB not available")

        stats = avb_service.get_stream_stats(stream_id)

        if stats is None:
            raise HTTPException(status_code=404, detail="Stream not found")

        # Normalize response shape for API clients (snake_case keys)
        return {
            "frames_sent": stats.get("frames_sent", 0),
            "frames_received": stats.get("frames_received", 0),
            "send_errors": stats.get("send_errors", 0),
            "receive_errors": stats.get("receive_errors", 0),
            "underruns": stats.get("underruns", 0),
            "overruns": stats.get("overruns", 0),
            "timestamp_errors": stats.get("timestamp_errors", 0),
            "sequence_errors": stats.get("sequence_errors", 0),
            "sequence_gap_events": stats.get("sequence_gap_events", 0),
            "timestamp_skew_events": stats.get("timestamp_skew_events", 0),
            "decode_errors": stats.get("decode_errors", 0),
            "max_timestamp_skew_ns": stats.get("max_timestamp_skew_ns", 0),
            "bytes_transferred": stats.get("bytes_transferred", 0),
            "max_latency_ns": stats.get("max_latency_ns", 0),
            "min_latency_ns": stats.get("min_latency_ns", 0),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting AVB stream stats: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/streams/{stream_id}/stats/reset")
async def reset_stream_stats(stream_id: str) -> Dict[str, Any]:
    """Reset AVB stream statistics"""
    try:
        from app.services.avb.avb_service import get_avb_service

        avb_service = get_avb_service()

        if not avb_service.is_available():
            raise HTTPException(status_code=503, detail="AVB not available")

        if avb_service.get_stream(stream_id) is None:
            raise HTTPException(status_code=404, detail="Stream not found")

        success = avb_service.reset_stream_stats(stream_id)
        if not success:
            raise HTTPException(status_code=400, detail="Failed to reset stream stats")

        return {"status": "reset", "stream_id": stream_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resetting AVB stream stats: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/router/endpoints")
async def get_router_endpoints(direction: Optional[str] = None) -> Dict[str, Any]:
    """
    Get all audio endpoints (talkers and listeners).

    Query params:
        direction: Optional filter ("talker" or "listener")

    Returns:
        List of AudioEndpoint objects
    """
    try:
        from app.services.avb.avb_router import get_avb_router, StreamDirection

        router = get_avb_router()

        if not router:
            return {
                "endpoints": [],
                "error": "Router not initialized"
            }

        # Parse direction filter
        dir_filter = None
        if direction:
            dir_filter = StreamDirection(direction.lower())

        endpoints = router.get_endpoints(dir_filter)

        source_node_id = _local_source_node_id()
        endpoints_list = [_serialize_router_endpoint(ep, source_node_id=source_node_id) for ep in endpoints]
        endpoints_list.sort(key=lambda item: str(item.get("endpoint_id", "")))

        return {
            "endpoints": endpoints_list,
            "count": len(endpoints_list),
            "source_node_id": source_node_id,
        }

    except Exception as e:
        logger.error(f"Error getting router endpoints: {e}", exc_info=True)
        return {
            "endpoints": [],
            "error": f"Internal error: {str(e)}"
        }


@router.get("/router/connections")
async def get_router_connections() -> Dict[str, Any]:
    """
    Get all active stream connections.

    Returns:
        List of StreamConnection objects
    """
    try:
        from app.services.avb.avb_router import get_avb_router

        router = get_avb_router()

        if not router:
            return {
                "connections": [],
                "error": "Router not initialized"
            }

        connections = router.get_connections()

        source_node_id = _local_source_node_id()
        connections_list = []
        for conn in connections:
            connections_list.append(
                {
                    "connection_id": conn.connection_id(),
                    "talker": _serialize_router_endpoint(conn.talker, direction_fallback="talker", source_node_id=source_node_id),
                    "listener": _serialize_router_endpoint(conn.listener, direction_fallback="listener", source_node_id=source_node_id),
                    "state": conn.state.value,
                    "established_time": conn.established_time.isoformat() if conn.established_time else None,
                    "error_message": conn.error_message,
                    "srp_reservation_id": conn.srp_reservation_id,
                    "srp_admission_id": conn.srp_admission_id,
                    "connection_role": getattr(conn, "connection_role", "general_route"),
                    "loop_id": getattr(conn, "loop_id", None),
                }
            )

        return {
            "connections": connections_list,
            "count": len(connections_list),
            "source_node_id": source_node_id,
        }

    except Exception as e:
        logger.error(f"Error getting router connections: {e}", exc_info=True)
        return {
            "connections": [],
            "error": f"Internal error: {str(e)}"
        }


@router.get("/router/matrix")
async def get_routing_matrix() -> Dict[str, Any]:
    """
    Get routing matrix showing all possible connections.

    Returns:
        Dict[talker_id, Dict[listener_id, ConnectionState or None]]
    """
    try:
        from app.services.avb.avb_router import get_avb_router

        router = get_avb_router()

        if not router:
            return {
                "matrix": {},
                "error": "Router not initialized"
            }

        matrix = router.get_routing_matrix()

        # Convert enum values to strings
        matrix_serializable = {
            talker_id: {
                listener_id: state.value if state else None
                for listener_id, state in listeners.items()
            }
            for talker_id, listeners in matrix.items()
        }

        return {
            "matrix": matrix_serializable,
            "talker_count": len(matrix),
            "listener_count": len(next(iter(matrix.values()), {}))
        }

    except Exception as e:
        logger.error(f"Error getting routing matrix: {e}", exc_info=True)
        return {
            "matrix": {},
            "error": f"Internal error: {str(e)}"
        }


async def _broadcast_router_state_updates():
    """Publish AVB routing endpoint/connection snapshots to websocket subscribers."""
    from app.services.event_publisher import event_publisher, EventType

    try:
        endpoints_snapshot = await get_router_endpoints()
        connections_snapshot = await get_router_connections()

        await event_publisher.publish(
            topic="avb:router:endpoints",
            event_type=EventType.AVB_ENDPOINTS_UPDATED,
            data=endpoints_snapshot,
        )
        await event_publisher.publish(
            topic="avb:router:connections",
            event_type=EventType.AVB_CONNECTIONS_UPDATED,
            data=connections_snapshot,
        )
    except Exception as e:
        logger.warning(f"Failed to publish AVB router state websocket updates: {e}")


async def _broadcast_router_connection_state(
    route_id: str,
    state: str,
    error_message: Optional[str] = None,
    *,
    connection_role: Optional[str] = None,
    loop_id: Optional[str] = None,
):
    """Publish a single AVB route state change event."""
    from app.services.event_publisher import event_publisher, EventType

    try:
        await event_publisher.publish(
            topic="avb:router:connection_state",
            event_type=EventType.AVB_CONNECTION_STATE_CHANGED,
            data={
                "route_id": route_id,
                "state": state,
                "error_message": error_message,
                "connection_role": connection_role,
                "loop_id": loop_id,
            },
        )
    except Exception as e:
        logger.warning(f"Failed to publish AVB connection state websocket update: {e}")


async def _broadcast_avb_runtime_updates(
    *,
    streams: bool = True,
    ptp: bool = True,
    avdecc: bool = True,
) -> None:
    """Publish AVB runtime websocket snapshots when stream/PTP/entity state changes."""
    try:
        from app.services.avb_event_sync import get_avb_event_sync_service

        await get_avb_event_sync_service().publish_runtime_snapshots(
            streams=streams,
            ptp=ptp,
            avdecc=avdecc,
            force=False,
        )
    except Exception as e:
        logger.warning(f"Failed to publish AVB runtime websocket updates: {e}")


@router.post("/router/connect")
async def connect_streams(connection_request: Dict[str, Any]) -> Dict[str, Any]:
    """
    Connect talker to listener.

    Body:
        {
            "talker_id": "001122fffe334455:0",
            "listener_id": "667788fffe99aabb:1"
        }

    Returns:
        Connection result
    """
    talker_id: Optional[str] = None
    listener_id: Optional[str] = None
    connection_role: str = "general_route"
    loop_id: Optional[str] = None
    admission: Any = None
    route_reservation_id: Optional[str] = None
    route_id: Optional[str] = None
    connection_succeeded = False

    try:
        from app.services.avb.avb_router import get_avb_router
        from app.services.avb.srp_admission import SrpAdmissionRequest, get_srp_admission_service

        router = get_avb_router()

        if not router:
            raise HTTPException(status_code=503, detail="Router not initialized")

        talker_id = connection_request.get("talker_id")
        listener_id = connection_request.get("listener_id")
        connection_role = _parse_connection_role(connection_request.get("connection_role"))
        loop_id = _coerce_optional_text(connection_request.get("loop_id"))

        if not talker_id or not listener_id:
            raise HTTPException(status_code=400, detail="Missing talker_id or listener_id")

        talker = router.endpoints.get(talker_id) if hasattr(router, "endpoints") else None
        listener = router.endpoints.get(listener_id) if hasattr(router, "endpoints") else None
        if talker is None or listener is None:
            missing: List[str] = []
            if talker is None:
                missing.append(f"talker_id={talker_id}")
            if listener is None:
                missing.append(f"listener_id={listener_id}")
            raise HTTPException(
                status_code=404,
                detail=f"Endpoint not found: {', '.join(missing)}",
            )

        if _srp_enabled():
            admission = await get_srp_admission_service().admit(
                SrpAdmissionRequest(
                    endpoint="router.connect",
                    stream_id=f"{talker_id}->{listener_id}",
                    talker_id=talker_id,
                    listener_id=listener_id,
                    talker_mac=getattr(talker, "mac_address", None),
                    listener_mac=getattr(listener, "mac_address", None),
                    request_metadata={
                        "talker_device_type": getattr(talker, "device_type", None),
                        "listener_device_type": getattr(listener, "device_type", None),
                    },
                )
            )
            if admission.decision == "denied":
                _raise_srp_denied(admission)
            if admission.decision == "allowed" and not admission.reservation_id:
                _raise_srp_denied(
                    admission,
                    code="SRP_ADMISSION_INVALID",
                    reason_code="SRP_INVALID_ADMISSION",
                    reason="SRP admission acknowledged without reservation_id",
                )

        if admission is not None:
            if admission.decision == "allowed":
                route_reservation_id = admission.reservation_id
            else:
                # Preserve bypass decision from route-level admission and avoid duplicate
                # internal SRP admission attempts.
                route_reservation_id = ""

        connect_fn = getattr(router, "connect")
        connect_result: Any

        supports_connect_details = False
        try:
            import inspect

            supports_connect_details = "return_details" in inspect.signature(connect_fn).parameters
        except (TypeError, ValueError):
            supports_connect_details = False

        connect_kwargs = {
            "reservation_id": route_reservation_id,
            "admission_id": admission.admission_id if admission and admission.decision == "allowed" else None,
            "connection_role": connection_role,
            "loop_id": loop_id,
        }

        if supports_connect_details:
            connect_kwargs["return_details"] = True

        try:
            connect_result = await connect_fn(
                talker_id,
                listener_id,
                **connect_kwargs,
            )
        except TypeError:
            # Backward compatibility for mocked/legacy routers without loop metadata args.
            connect_kwargs.pop("connection_role", None)
            connect_kwargs.pop("loop_id", None)
            connect_result = await connect_fn(
                talker_id,
                listener_id,
                **connect_kwargs,
            )

        if isinstance(connect_result, dict):
            success = bool(connect_result.get("success", False))
            connect_payload = connect_result
        else:
            success = bool(connect_result)
            connect_payload = {}

        if not success:
            if connect_payload:
                raise HTTPException(
                    status_code=500,
                    detail=_build_connection_failure_detail(
                        code="ROUTER_CONNECT_FAILED",
                        message=str(connect_payload.get("reason") or "Connection failed"),
                        payload=connect_payload,
                    ),
                )
            raise HTTPException(status_code=500, detail="Connection failed")

        connection_succeeded = True

        route_id = f"{talker_id}→{listener_id}"
        response = {
            "success": True,
            "connection_id": route_id,
            "message": "Stream connected successfully",
            "connection_role": connection_role,
            "loop_id": loop_id,
        }
        if connect_payload.get("connection_role") is not None:
            response["connection_role"] = connect_payload.get("connection_role")
        if connect_payload.get("loop_id") is not None:
            response["loop_id"] = connect_payload.get("loop_id")
        if connect_payload.get("trace_id") is not None:
            response["trace_id"] = connect_payload["trace_id"]
        if connect_payload.get("stages") is not None:
            response["stages"] = connect_payload["stages"]
        if admission:
            response["srp_admission"] = admission.to_dict()

        if route_id:
            await _broadcast_router_connection_state(
                route_id=route_id,
                state="connected",
                connection_role=connection_role,
                loop_id=loop_id,
            )
        await _broadcast_router_state_updates()
        await _broadcast_avb_runtime_updates()

        return response

    except HTTPException:
        raise
    except Exception as e:
        if (
            admission is not None
            and getattr(admission, "decision", None) == "allowed"
            and route_reservation_id
            and talker_id
            and listener_id
            and not connection_succeeded
        ):
            try:
                from app.services.avb.srp_admission import get_srp_admission_service

                await get_srp_admission_service().release(
                    reservation_id=route_reservation_id,
                    endpoint="router.connect.exception",
                    stream_id=f"{talker_id}->{listener_id}",
                    talker_id=talker_id,
                    listener_id=listener_id,
                )
            except Exception as release_exc:
                logger.warning(
                    "SRP rollback release failed after router.connect exception %s->%s: %s",
                    talker_id,
                    listener_id,
                    release_exc,
                )
        logger.error(f"Error connecting streams: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/router/disconnect")
async def disconnect_streams(disconnection_request: Dict[str, Any]) -> Dict[str, Any]:
    """
    Disconnect talker from listener.

    Body:
        {
            "talker_id": "001122fffe334455:0",
            "listener_id": "667788fffe99aabb:1"
        }

    Returns:
        Disconnection result
    """
    try:
        from app.services.avb.avb_router import get_avb_router

        router = get_avb_router()

        if not router:
            raise HTTPException(status_code=503, detail="Router not initialized")

        talker_id = disconnection_request.get("talker_id")
        listener_id = disconnection_request.get("listener_id")

        if not talker_id or not listener_id:
            raise HTTPException(status_code=400, detail="Missing talker_id or listener_id")

        disconnect_fn = getattr(router, "disconnect")
        disconnect_result: Any

        supports_disconnect_details = False
        try:
            import inspect

            supports_disconnect_details = "return_details" in inspect.signature(disconnect_fn).parameters
        except (TypeError, ValueError):
            supports_disconnect_details = False

        if supports_disconnect_details:
            disconnect_result = await disconnect_fn(talker_id, listener_id, return_details=True)
        else:
            disconnect_result = await disconnect_fn(talker_id, listener_id)

        if isinstance(disconnect_result, dict):
            success = bool(disconnect_result.get("success", False))
            disconnect_payload = disconnect_result
        else:
            success = bool(disconnect_result)
            disconnect_payload = {}

        if not success:
            raise HTTPException(status_code=404, detail="Connection not found or disconnect failed")

        response: Dict[str, Any] = {
            "success": True,
            "connection_id": f"{talker_id}→{listener_id}",
            "message": "Stream disconnected successfully"
        }
        if disconnect_payload.get("trace_id") is not None:
            response["trace_id"] = disconnect_payload["trace_id"]
        if disconnect_payload.get("stages") is not None:
            response["stages"] = disconnect_payload["stages"]
        if disconnect_payload.get("srp_release") is not None:
            response["srp_release"] = disconnect_payload["srp_release"]
        if disconnect_payload.get("srp_release_warning") is not None:
            response["srp_release_warning"] = disconnect_payload["srp_release_warning"]
        if disconnect_payload.get("connection_role") is not None:
            response["connection_role"] = disconnect_payload["connection_role"]
        if disconnect_payload.get("loop_id") is not None:
            response["loop_id"] = disconnect_payload["loop_id"]

        await _broadcast_router_connection_state(
            route_id=f"{talker_id}→{listener_id}",
            state="disconnected",
            connection_role=response.get("connection_role"),
            loop_id=response.get("loop_id"),
        )
        await _broadcast_router_state_updates()
        await _broadcast_avb_runtime_updates()

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error disconnecting streams: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/router/stats")
async def get_router_stats() -> Dict[str, Any]:
    """Get routing matrix statistics"""
    try:
        from app.services.avb.avb_router import get_avb_router

        router = get_avb_router()

        if not router:
            return {
                "error": "Router not initialized"
            }

        stats = router.get_stats()

        return stats

    except Exception as e:
        logger.error(f"Error getting router stats: {e}", exc_info=True)
        return {
            "error": f"Internal error: {str(e)}"
        }


# ============================================================================
# AVDECC Entity Model Endpoints (Phase 10)
# ============================================================================

class StreamConnectionRequest(BaseModel):
    """Request to connect an AVTP stream between talker and listener."""
    talker_entity_id: str  # Hex string (e.g., "001b21fffe123456")
    talker_stream_index: int  # 0-based stream index
    listener_entity_id: str  # Hex string
    listener_stream_index: int  # 0-based stream index


class StreamFormatPatchRequest(BaseModel):
    """Request to set an AVDECC stream format tuple."""
    direction: str  # talker/listener
    channels: int
    sample_rate: int
    bits_per_sample: int
    configuration_index: int = 0


def _get_engine():
    """Resolve the low-level C++ engine instance."""
    from app.services.juce_engine_service import get_audio_engine

    engine_service = get_audio_engine()
    if not engine_service:
        raise HTTPException(status_code=503, detail="Audio engine not available")

    engine = getattr(engine_service, "_engine", None)
    if engine is None:
        raise HTTPException(status_code=503, detail="Audio engine not initialized")

    return engine


def _check_acmp_available(engine):
    """Verify AVDECC and ACMP methods are available on the engine."""
    if not _is_avdecc_enabled():
        raise HTTPException(status_code=503, detail="AVDECC not enabled in configuration")

    for method in ("connect_stream", "disconnect_stream", "get_active_connections"):
        if not hasattr(engine, method):
            raise HTTPException(
                status_code=503,
                detail=f"ACMP not available in engine build (missing {method})"
            )


def _stream_format_methods_available(engine: Any) -> bool:
    return hasattr(engine, "get_stream_format") and hasattr(engine, "set_stream_format")


async def _validate_and_negotiate_connection_stream_format(
    *,
    engine: Any,
    talker_entity_id: int,
    talker_stream_index: int,
    listener_entity_id: int,
    listener_stream_index: int,
) -> Dict[str, Any]:
    if not _stream_format_methods_available(engine):
        return {
            "success": True,
            "validated": False,
            "negotiated": False,
            "skipped": True,
            "reason": "engine_stream_format_api_unavailable",
        }

    async def _query(entity_id: int, stream_index: int, direction: str, stage: str) -> Dict[str, Any]:
        raw = await asyncio.to_thread(
            engine.get_stream_format,
            entity_id,
            stream_index,
            direction,
            0,
        )
        result = _normalize_engine_stream_format_result(raw, default_message=f"{stage}_failed")
        decoded = _decode_avdecc_stream_format(result.get("stream_format"))
        return {
            "result": result,
            "decoded": decoded,
            "stage": stage,
        }

    talker_query = await _query(talker_entity_id, talker_stream_index, "talker", "talker_get_stream_format")
    talker_result = talker_query["result"]
    talker_decoded = talker_query["decoded"]
    if not talker_result.get("success"):
        return {
            "success": False,
            "code": "ACMP_STREAM_FORMAT_QUERY_FAILED",
            "message": f"Talker stream format query failed: {talker_result.get('status')}",
            "stage": talker_query["stage"],
            "result": talker_result,
        }
    if talker_decoded is None:
        return {
            "success": False,
            "code": "ACMP_STREAM_FORMAT_INVALID",
            "message": "Talker stream format is missing or unsupported",
            "stage": talker_query["stage"],
            "result": talker_result,
        }

    listener_query = await _query(listener_entity_id, listener_stream_index, "listener", "listener_get_stream_format")
    listener_result = listener_query["result"]
    listener_decoded = listener_query["decoded"]
    if not listener_result.get("success"):
        return {
            "success": False,
            "code": "ACMP_STREAM_FORMAT_QUERY_FAILED",
            "message": f"Listener stream format query failed: {listener_result.get('status')}",
            "stage": listener_query["stage"],
            "result": listener_result,
        }
    if listener_decoded is None:
        return {
            "success": False,
            "code": "ACMP_STREAM_FORMAT_INVALID",
            "message": "Listener stream format is missing or unsupported",
            "stage": listener_query["stage"],
            "result": listener_result,
        }

    talker_tuple = (
        int(talker_decoded["channels"]),
        int(talker_decoded["sample_rate"]),
        int(talker_decoded["bits_per_sample"]),
    )
    listener_tuple = (
        int(listener_decoded["channels"]),
        int(listener_decoded["sample_rate"]),
        int(listener_decoded["bits_per_sample"]),
    )

    if talker_tuple == listener_tuple:
        return {
            "success": True,
            "validated": True,
            "negotiated": False,
            "talker": dict(talker_decoded),
            "listener": dict(listener_decoded),
            "stream_format": int(talker_result.get("stream_format", 0)),
        }

    set_raw = await asyncio.to_thread(
        engine.set_stream_format,
        listener_entity_id,
        listener_stream_index,
        "listener",
        int(talker_result.get("stream_format", 0)),
        0,
    )
    set_result = _normalize_engine_stream_format_result(
        set_raw,
        default_message="listener_set_stream_format_failed",
    )
    if not set_result.get("success"):
        return {
            "success": False,
            "code": "ACMP_STREAM_FORMAT_NEGOTIATION_FAILED",
            "message": f"Failed to set listener stream format: {set_result.get('status')}",
            "stage": "listener_set_stream_format",
            "result": set_result,
        }

    listener_query_after = await _query(
        listener_entity_id,
        listener_stream_index,
        "listener",
        "listener_verify_stream_format",
    )
    listener_after_result = listener_query_after["result"]
    listener_after_decoded = listener_query_after["decoded"]
    if not listener_after_result.get("success") or listener_after_decoded is None:
        return {
            "success": False,
            "code": "ACMP_STREAM_FORMAT_NEGOTIATION_FAILED",
            "message": "Failed to verify listener stream format after negotiation",
            "stage": listener_query_after["stage"],
            "result": listener_after_result,
        }

    listener_after_tuple = (
        int(listener_after_decoded["channels"]),
        int(listener_after_decoded["sample_rate"]),
        int(listener_after_decoded["bits_per_sample"]),
    )
    if listener_after_tuple != talker_tuple:
        return {
            "success": False,
            "code": "ACMP_STREAM_FORMAT_NEGOTIATION_FAILED",
            "message": "Listener stream format remains incompatible after negotiation",
            "stage": "listener_verify_stream_format",
            "result": listener_after_result,
        }

    return {
        "success": True,
        "validated": True,
        "negotiated": True,
        "talker": dict(talker_decoded),
        "listener": dict(listener_after_decoded),
        "stream_format": int(talker_result.get("stream_format", 0)),
    }


@router.patch("/avdecc/entities/{entity_id}/streams/{stream_index}/format")
async def patch_stream_format(
    entity_id: str,
    stream_index: int,
    req: StreamFormatPatchRequest,
) -> Dict[str, Any]:
    """
    Set AVDECC stream format tuple via AECP SET_STREAM_FORMAT.
    """
    engine = _get_engine()
    _check_acmp_available(engine)

    if not _stream_format_methods_available(engine):
        raise HTTPException(
            status_code=503,
            detail="Stream format API not available in engine build (missing get_stream_format/set_stream_format)",
        )

    normalized_entity_id = _normalize_avdecc_entity_id(entity_id)
    if normalized_entity_id is None:
        raise HTTPException(status_code=400, detail=f"Invalid entity ID format: {entity_id}")

    if stream_index < 0:
        raise HTTPException(status_code=400, detail="stream_index must be >= 0")
    if req.configuration_index < 0:
        raise HTTPException(status_code=400, detail="configuration_index must be >= 0")

    direction = _normalize_stream_direction(req.direction)
    stream_format = _encode_avdecc_stream_format(
        channels=int(req.channels),
        sample_rate=int(req.sample_rate),
        bits_per_sample=int(req.bits_per_sample),
    )

    entity_id_int = int(normalized_entity_id, 16)
    set_raw = await asyncio.to_thread(
        engine.set_stream_format,
        entity_id_int,
        int(stream_index),
        direction,
        int(stream_format),
        int(req.configuration_index),
    )
    set_result = _normalize_engine_stream_format_result(
        set_raw,
        default_message="set_stream_format_failed",
    )
    if not set_result.get("success"):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "STREAM_FORMAT_UPDATE_FAILED",
                "message": str(set_result.get("status") or "set_stream_format_failed"),
                "engine_result": set_result,
            },
        )

    get_raw = await asyncio.to_thread(
        engine.get_stream_format,
        entity_id_int,
        int(stream_index),
        direction,
        int(req.configuration_index),
    )
    get_result = _normalize_engine_stream_format_result(
        get_raw,
        default_message="get_stream_format_failed",
    )
    if not get_result.get("success"):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "STREAM_FORMAT_VERIFY_FAILED",
                "message": str(get_result.get("status") or "get_stream_format_failed"),
                "engine_result": get_result,
            },
        )

    applied = _decode_avdecc_stream_format(get_result.get("stream_format"))
    if applied is None:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "STREAM_FORMAT_VERIFY_FAILED",
                "message": "Engine returned an undecodable stream format",
                "engine_result": get_result,
            },
        )

    requested_tuple = (int(req.channels), int(req.sample_rate), int(req.bits_per_sample))
    applied_tuple = (
        int(applied["channels"]),
        int(applied["sample_rate"]),
        int(applied["bits_per_sample"]),
    )
    if requested_tuple != applied_tuple:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "STREAM_FORMAT_MISMATCH",
                "message": "Requested stream format does not match applied format",
                "requested": {
                    "channels": requested_tuple[0],
                    "sample_rate": requested_tuple[1],
                    "bits_per_sample": requested_tuple[2],
                },
                "applied": dict(applied),
            },
        )

    return {
        "status": "updated",
        "entity_id": normalized_entity_id,
        "stream_index": int(stream_index),
        "direction": direction,
        "configuration_index": int(req.configuration_index),
        "requested": {
            "channels": requested_tuple[0],
            "sample_rate": requested_tuple[1],
            "bits_per_sample": requested_tuple[2],
            "stream_format": int(stream_format),
            "stream_format_hex": f"0x{int(stream_format):016x}",
        },
        "applied": {
            "channels": applied_tuple[0],
            "sample_rate": applied_tuple[1],
            "bits_per_sample": applied_tuple[2],
            "stream_format": int(applied["stream_format"]),
            "stream_format_hex": f"0x{int(applied['stream_format']):016x}",
        },
        "engine_status": {
            "set": set_result,
            "verify": get_result,
        },
    }


@router.post("/avdecc/connections")
async def connect_stream(req: StreamConnectionRequest) -> Dict[str, Any]:
    """
    Connect an AVTP stream from talker to listener via ACMP.

    Sends ACMP CONNECT_TX_COMMAND and waits for response (up to 2s).
    On success, adds the connection to the active connections list.

    Args:
        req: StreamConnectionRequest with talker/listener entity IDs and stream indices

    Returns:
        Connection details including stream destination MAC and VLAN ID
    """
    engine = _get_engine()
    _check_acmp_available(engine)
    from app.services.avb.srp_admission import SrpAdmissionRequest, get_srp_admission_service

    try:
        talker_id = int(req.talker_entity_id, 16)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid talker entity ID: {req.talker_entity_id}")

    try:
        listener_id = int(req.listener_entity_id, 16)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid listener entity ID: {req.listener_entity_id}")

    admission: Any = None
    connection_succeeded = False
    format_validation: Dict[str, Any] = {
        "success": True,
        "validated": False,
        "negotiated": False,
        "skipped": True,
        "reason": "not_run",
    }

    async def _release_acmp_reservation(endpoint: str) -> Optional[Dict[str, Any]]:
        if not (admission and admission.decision == "allowed" and admission.reservation_id):
            return None
        reservation_id = str(admission.reservation_id)
        try:
            release_result = await get_srp_admission_service().release(
                reservation_id=reservation_id,
                endpoint=endpoint,
                stream_id=(
                    f"{req.talker_entity_id}:{req.talker_stream_index}"
                    f"->{req.listener_entity_id}:{req.listener_stream_index}"
                ),
                talker_id=req.talker_entity_id,
                listener_id=req.listener_entity_id,
            )
            release_payload = _build_srp_release_payload(
                release_result,
                reservation_id=reservation_id,
            )
            if not bool(getattr(release_result, "success", False)):
                return {
                    "srp_release": release_payload,
                    "srp_release_warning": _build_srp_release_warning(
                        reason="ACMP connect failed and SRP rollback release failed",
                        reservation_id=reservation_id,
                        detail=(
                            f"{getattr(release_result, 'reason_code', None)}:"
                            f" {getattr(release_result, 'reason', None)}"
                        ),
                    ),
                }
            return {"srp_release": release_payload}
        except Exception as release_exc:
            logger.warning(
                "SRP release failed during ACMP connect rollback %s:%s->%s:%s: %s",
                req.talker_entity_id,
                req.talker_stream_index,
                req.listener_entity_id,
                req.listener_stream_index,
                release_exc,
            )
            return {
                "srp_release_warning": _build_srp_release_warning(
                    reason="ACMP connect failed and SRP rollback release failed",
                    reservation_id=reservation_id,
                    detail=release_exc,
                )
            }

    try:
        if _srp_enabled():
            admission = await get_srp_admission_service().admit(
                SrpAdmissionRequest(
                    endpoint="avdecc.connections",
                    stream_id=(
                        f"{req.talker_entity_id}:{req.talker_stream_index}"
                        f"->{req.listener_entity_id}:{req.listener_stream_index}"
                    ),
                    talker_id=req.talker_entity_id,
                    listener_id=req.listener_entity_id,
                    request_metadata={
                        "talker_stream_index": req.talker_stream_index,
                        "listener_stream_index": req.listener_stream_index,
                    },
                )
            )
            if admission.decision == "denied":
                _raise_srp_denied(admission)
            if admission.decision == "allowed" and not admission.reservation_id:
                _raise_srp_denied(
                    admission,
                    code="SRP_ADMISSION_INVALID",
                    reason_code="SRP_INVALID_ADMISSION",
                    reason="SRP admission acknowledged without reservation_id",
                )

        format_validation = await _validate_and_negotiate_connection_stream_format(
            engine=engine,
            talker_entity_id=talker_id,
            talker_stream_index=req.talker_stream_index,
            listener_entity_id=listener_id,
            listener_stream_index=req.listener_stream_index,
        )
        if not format_validation.get("success"):
            rollback_payload = await _release_acmp_reservation(endpoint="avdecc.connections.rollback")
            detail = _build_connection_failure_detail(
                code=str(format_validation.get("code") or "ACMP_STREAM_FORMAT_NEGOTIATION_FAILED"),
                message=str(format_validation.get("message") or "Stream format validation failed"),
                payload=rollback_payload,
            )
            detail["stream_format"] = format_validation
            raise HTTPException(status_code=409, detail=detail)

        success = await asyncio.to_thread(
            engine.connect_stream,
            talker_id,
            req.talker_stream_index,
            listener_id,
            req.listener_stream_index
        )

        if not success:
            rollback_payload = await _release_acmp_reservation(endpoint="avdecc.connections.rollback")
            raise HTTPException(
                status_code=500,
                detail=_build_connection_failure_detail(
                    code="ACMP_CONNECTION_FAILED",
                    message="ACMP connection failed (timeout or rejected by remote entity)",
                    payload=rollback_payload,
                ),
            )

        connection_succeeded = True

        connection_id = (
            f"{req.talker_entity_id}:{req.talker_stream_index}"
            f":{req.listener_entity_id}:{req.listener_stream_index}"
        )

        response: Dict[str, Any] = {
            "status": "connected",
            "connection_id": connection_id,
            "talker_entity_id": req.talker_entity_id,
            "talker_stream_index": req.talker_stream_index,
            "listener_entity_id": req.listener_entity_id,
            "listener_stream_index": req.listener_stream_index,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "stream_format_validation": format_validation,
        }

        if admission and admission.decision == "allowed" and admission.reservation_id:
            _acmp_srp_reservations[connection_id] = {
                "reservation_id": admission.reservation_id,
                "admission_id": admission.admission_id,
            }
            response["srp_admission"] = admission.to_dict()

        return response
    except HTTPException:
        raise
    except Exception as e:
        rollback_payload: Optional[Dict[str, Any]] = None
        if not connection_succeeded:
            rollback_payload = await _release_acmp_reservation(endpoint="avdecc.connections.rollback")
        logger.error(f"ACMP connect_stream failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=_build_connection_failure_detail(
                code="ACMP_CONNECTION_FAILED",
                message=f"ACMP connection failed: {e}",
                payload=rollback_payload,
            ),
        )


@router.delete("/avdecc/connections/{connection_id}")
async def disconnect_stream(connection_id: str) -> Dict[str, Any]:
    """
    Disconnect an AVTP stream via ACMP DISCONNECT_TX.

    Connection ID format: "{talker_id}:{talker_idx}:{listener_id}:{listener_idx}"

    Args:
        connection_id: Composite connection identifier

    Returns:
        Disconnect confirmation
    """
    engine = _get_engine()
    _check_acmp_available(engine)
    from app.services.avb.srp_admission import get_srp_admission_service

    parts = connection_id.split(":")
    if len(parts) != 4:
        raise HTTPException(
            status_code=400,
            detail="Invalid connection_id format. Expected: talker_id:talker_idx:listener_id:listener_idx"
        )

    try:
        talker_id = int(parts[0], 16)
        talker_idx = int(parts[1])
        listener_id = int(parts[2], 16)
        listener_idx = int(parts[3])
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid hex/integer in connection_id")

    try:
        success = await asyncio.to_thread(
            engine.disconnect_stream,
            talker_id,
            talker_idx,
            listener_id,
            listener_idx
        )
    except Exception as e:
        logger.error(f"ACMP disconnect_stream failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"ACMP disconnect failed: {e}")

    if not success:
        raise HTTPException(status_code=404, detail="Connection not found or disconnect failed")

    response: Dict[str, Any] = {
        "status": "disconnected",
        "connection_id": connection_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    binding = _acmp_srp_reservations.pop(connection_id, None)
    if binding and binding.get("reservation_id"):
        reservation_id = str(binding["reservation_id"])
        try:
            release_result = await get_srp_admission_service().release(
                reservation_id=reservation_id,
                endpoint="avdecc.disconnect",
                stream_id=connection_id,
                talker_id=parts[0],
                listener_id=parts[2],
            )
            response["srp_release"] = _build_srp_release_payload(
                release_result,
                reservation_id=reservation_id,
            )
        except Exception as release_exc:
            logger.warning(
                "SRP release failed during ACMP disconnect %s: %s",
                connection_id,
                release_exc,
            )
            response["srp_release_warning"] = _build_srp_release_warning(
                reason="ACMP disconnect succeeded but SRP reservation release failed",
                reservation_id=reservation_id,
                detail=release_exc,
            )

    return response


@router.get("/avdecc/connections")
async def get_active_connections() -> List[Dict[str, Any]]:
    """
    List all active ACMP stream connections.

    Returns:
        List of active connections with talker/listener info and stream details
    """
    engine = _get_engine()
    _check_acmp_available(engine)

    try:
        connections = await asyncio.to_thread(engine.get_active_connections)
    except Exception as e:
        logger.error(f"get_active_connections failed: {e}", exc_info=True)
        return []

    return connections


for _route in router.routes:
    if hasattr(_route, "endpoint"):
        _route.endpoint.__module__ = "app.routes.avb"


__all__ = [name for name in globals() if not name.startswith("__")]
