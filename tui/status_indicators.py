"""Shared Carbon-style status indicator helpers for the TUIs."""

from __future__ import annotations

from rich.text import Text

CARBON_STATUS_STYLES = {
    "ok": "green",
    "warn": "yellow",
    "error": "red",
    "idle": "grey70",
}

_OK_STATUSES = {
    "active",
    "available",
    "connected",
    "enabled",
    "healthy",
    "live",
    "ok",
    "online",
    "ready",
    "running",
    "up",
}
_WARN_STATUSES = {
    "connecting",
    "degraded",
    "idle",
    "pending",
    "restarting",
    "starting",
    "stopping",
    "unknown",
    "warning",
}
_ERROR_STATUSES = {
    "dead",
    "disabled",
    "disconnected",
    "down",
    "error",
    "failed",
    "inactive",
    "offline",
    "stopped",
    "unhealthy",
}


def status_tone(value: object) -> str:
    normalized = normalize_status(value)
    if normalized in _OK_STATUSES:
        return "ok"
    if normalized in _ERROR_STATUSES:
        return "error"
    if normalized in _WARN_STATUSES:
        return "warn"
    return "idle"


def normalize_status(value: object) -> str:
    if value is None:
        return "unknown"
    return str(value).strip().lower().replace("-", " ").replace("_", " ")


def format_status_label(value: object) -> str:
    normalized = normalize_status(value)
    if not normalized:
        return "Unknown"
    return " ".join(part.capitalize() for part in normalized.split())


def render_status_text(value: object) -> Text:
    tone = status_tone(value)
    label = format_status_label(value)
    text = Text()
    text.append("●", style=CARBON_STATUS_STYLES[tone])
    text.append(f" {label}")
    return text
