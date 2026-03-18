"""
Shared API readiness helpers for startup and warmup-sensitive routes.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable

from fastapi import HTTPException


_READY_STATES = {"running", "ready"}
_DEFAULT_RETRY_AFTER_SECONDS = 2


def _safe_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    return bool(value)


def _service_entry(services: Dict[str, Any], name: str) -> Dict[str, Any]:
    raw = services.get(name, {})
    return raw if isinstance(raw, dict) else {}


def _health_entry(service_entry: Dict[str, Any]) -> Dict[str, Any]:
    raw = service_entry.get("health", {})
    return raw if isinstance(raw, dict) else {}


def _build_payload(
    *,
    route: str,
    reason: str,
    issues: list[str],
    required_services: Iterable[str],
    services: Dict[str, Any],
    orchestrator_running: bool,
) -> Dict[str, Any]:
    return {
        "ready": False,
        "code": "API_ROUTE_NOT_READY",
        "route": route,
        "reason": reason,
        "message": "API dependency warmup in progress; retry shortly.",
        "retry_after_seconds": _DEFAULT_RETRY_AFTER_SECONDS,
        "orchestrator_running": orchestrator_running,
        "issues": issues,
        "required_services": {
            name: {
                "state": _service_entry(services, name).get("state", "missing"),
                "health": _health_entry(_service_entry(services, name)).get("healthy"),
                "health_message": _health_entry(_service_entry(services, name)).get("message"),
                "metrics": _health_entry(_service_entry(services, name)).get("metrics", {}),
            }
            for name in required_services
        },
    }


def _raise_not_ready(
    *,
    route: str,
    reason: str,
    issues: list[str],
    required_services: Iterable[str],
    services: Dict[str, Any],
    orchestrator_running: bool,
) -> None:
    raise HTTPException(
        status_code=503,
        detail=_build_payload(
            route=route,
            reason=reason,
            issues=issues,
            required_services=required_services,
            services=services,
            orchestrator_running=orchestrator_running,
        ),
        headers={"Retry-After": str(_DEFAULT_RETRY_AFTER_SECONDS)},
    )


def ensure_chain_route_ready(route: str) -> None:
    from app.services.service_orchestrator import get_orchestrator

    orchestrator = get_orchestrator()
    status = orchestrator.get_all_status() or {}
    services = status.get("services", {}) if isinstance(status, dict) else {}
    orchestrator_running = _safe_bool(status.get("orchestrator", {}).get("running"), False)
    issues: list[str] = []
    required = ("database",)

    if not orchestrator_running:
        issues.append("Service orchestrator is still starting")

    database = _service_entry(services, "database")
    db_state = database.get("state", "missing")
    db_health = _health_entry(database).get("healthy")

    if db_state not in _READY_STATES:
        issues.append(f"Database service state is {db_state}")
    if db_health is False:
        issues.append(f"Database health check failed: {_health_entry(database).get('message', '')}".strip())

    if issues:
        _raise_not_ready(
            route=route,
            reason="chain_store_warming",
            issues=issues,
            required_services=required,
            services=services,
            orchestrator_running=orchestrator_running,
        )


def ensure_plugin_route_ready(route: str) -> None:
    from app.services.service_orchestrator import get_orchestrator

    orchestrator = get_orchestrator()
    status = orchestrator.get_all_status() or {}
    services = status.get("services", {}) if isinstance(status, dict) else {}
    orchestrator_running = _safe_bool(status.get("orchestrator", {}).get("running"), False)
    issues: list[str] = []
    required = ("database", "plugin_loader")

    if not orchestrator_running:
        issues.append("Service orchestrator is still starting")

    database = _service_entry(services, "database")
    db_state = database.get("state", "missing")
    db_health = _health_entry(database).get("healthy")
    if db_state not in _READY_STATES:
        issues.append(f"Database service state is {db_state}")
    if db_health is False:
        issues.append(f"Database health check failed: {_health_entry(database).get('message', '')}".strip())

    plugin_loader = _service_entry(services, "plugin_loader")
    loader_state = plugin_loader.get("state", "missing")
    loader_metrics = _health_entry(plugin_loader).get("metrics", {})
    loader_scan_state = loader_metrics.get("scan_state", "unknown")
    if loader_state not in _READY_STATES:
        issues.append(f"Plugin loader service state is {loader_state}")
    if loader_scan_state in {"warming", "starting", "unknown"}:
        issues.append(f"Plugin loader scan state is {loader_scan_state}")
    if loader_scan_state == "error":
        issues.append(f"Plugin loader scan failed: {loader_metrics.get('scan_error', 'unknown error')}")

    if issues:
        _raise_not_ready(
            route=route,
            reason="plugin_inventory_warming",
            issues=issues,
            required_services=required,
            services=services,
            orchestrator_running=orchestrator_running,
        )


def ensure_audio_route_ready(route: str) -> None:
    from app.services.service_orchestrator import get_orchestrator

    orchestrator = get_orchestrator()
    status = orchestrator.get_all_status() or {}
    services = status.get("services", {}) if isinstance(status, dict) else {}
    orchestrator_running = _safe_bool(status.get("orchestrator", {}).get("running"), False)
    issues: list[str] = []
    required = ("juce_engine",)

    if not orchestrator_running:
        issues.append("Service orchestrator is still starting")

    juce_engine = _service_entry(services, "juce_engine")
    juce_state = juce_engine.get("state", "missing")
    juce_health = _health_entry(juce_engine)
    juce_metrics = juce_health.get("metrics", {})
    engine_running = juce_metrics.get("running")
    engine_available = juce_metrics.get("available")

    if juce_state not in _READY_STATES:
        issues.append(f"JUCE engine service state is {juce_state}")
    if engine_available is False:
        issues.append("JUCE engine reports unavailable")
    if engine_running is False:
        issues.append("JUCE engine reports not running")
    if juce_health.get("healthy") is False and juce_health.get("message"):
        issues.append(f"JUCE engine health check failed: {juce_health.get('message')}")

    if issues:
        _raise_not_ready(
            route=route,
            reason="audio_engine_warming",
            issues=issues,
            required_services=required,
            services=services,
            orchestrator_running=orchestrator_running,
        )
