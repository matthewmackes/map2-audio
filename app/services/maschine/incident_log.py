"""Retained Maschine incident log helpers."""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any

from app.utils.singleton import Singleton
from app.utils.time import utc_now


_INCIDENT_LOG_PATH = Path.home() / ".map2" / "maschine_incident_log.jsonl"
_SEVERITIES = {"info", "warn", "error", "critical"}


def _utcnow_iso() -> str:
    return utc_now().isoformat().replace("+00:00", "Z")


class MaschineIncidentLogService(Singleton):
    def __init__(self, path: Path | None = None) -> None:
        self._path = Path(path) if path is not None else _INCIDENT_LOG_PATH
        self._lock = threading.Lock()

    def set_path(self, path: Path) -> None:
        self._path = Path(path)

    def get_path(self) -> Path:
        return self._path

    def append(
        self,
        *,
        severity: str = "info",
        source: str = "maschine",
        message: str,
        detail: str | None = None,
        event: str | None = None,
        context: dict[str, Any] | None = None,
        timestamp: str | None = None,
    ) -> dict[str, Any]:
        normalized_severity = str(severity or "info").strip().lower()
        if normalized_severity not in _SEVERITIES:
            normalized_severity = "info"
        entry = {
            "timestamp": str(timestamp or _utcnow_iso()),
            "severity": normalized_severity,
            "source": str(source or "maschine").strip() or "maschine",
            "message": str(message or "incident").strip() or "incident",
        }
        if detail:
            entry["detail"] = str(detail)
        if event:
            entry["event"] = str(event)
        if isinstance(context, dict) and context:
            entry["context"] = dict(context)

        line = json.dumps(entry, sort_keys=True)
        path = self._path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self._lock:
            with path.open("a", encoding="utf-8") as handle:
                handle.write(f"{line}\n")
                handle.flush()
                try:
                    os.fsync(handle.fileno())
                except OSError:
                    pass
        return entry

    def list_entries(self, *, limit: int = 20) -> list[dict[str, Any]]:
        path = self._path
        if not path.exists():
            return []
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except Exception:
            return []
        entries: list[dict[str, Any]] = []
        for raw_line in reversed(lines):
            raw_line = raw_line.strip()
            if not raw_line:
                continue
            try:
                payload = json.loads(raw_line)
            except Exception:
                continue
            if isinstance(payload, dict):
                entries.append(payload)
            if len(entries) >= max(0, int(limit)):
                break
        return entries


def get_maschine_incident_log_service() -> MaschineIncidentLogService:
    return MaschineIncidentLogService.get_instance()


def reset_maschine_incident_log_service() -> None:
    MaschineIncidentLogService.reset_instance()
