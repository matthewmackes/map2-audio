"""Backend-owned Maschine admin console state and action helpers."""

from __future__ import annotations

import asyncio
import logging
import subprocess
import threading
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from app.services.maschine.incident_log import get_maschine_incident_log_service

LOGGER = logging.getLogger(__name__)

_SYSTEMCTL_TIMEOUT_SECONDS = 20.0
_UPDATE_TIMEOUT_SECONDS = 1800.0


def _utcnow_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _safe_label(value: Any, *, limit: int = 18, fallback: str = "UNKNOWN") -> str:
    text = " ".join(str(value or fallback).strip().split())
    if not text:
        text = fallback
    return text[:limit].upper()


@dataclass(frozen=True)
class MaschineAdminAction:
    action_id: str
    label: str
    detail: str
    tier: int = 3
    kind: str = "systemctl"


async def _run_sudo_command(command: tuple[str, ...]) -> tuple[int, str, str]:
    def _run() -> tuple[int, str, str]:
        completed = subprocess.run(
            list(command),
            capture_output=True,
            text=True,
            timeout=_SYSTEMCTL_TIMEOUT_SECONDS,
            check=False,
        )
        return completed.returncode, completed.stdout.strip(), completed.stderr.strip()

    return await asyncio.to_thread(_run)


def _default_orchestrator_provider() -> Any:
    from app.services.service_orchestrator import get_orchestrator

    return get_orchestrator()


def _default_update_manager_provider() -> Any:
    from app.services.cluster.hybrid_update_manager import get_hybrid_update_manager

    return get_hybrid_update_manager()


class MaschineAdminConsoleService:
    def __init__(
        self,
        *,
        command_runner: Callable[[tuple[str, ...]], Awaitable[tuple[int, str, str]]] | None = None,
        orchestrator_provider: Callable[[], Any] = _default_orchestrator_provider,
        update_manager_provider: Callable[[], Any] = _default_update_manager_provider,
    ) -> None:
        self._command_runner = command_runner or _run_sudo_command
        self._orchestrator_provider = orchestrator_provider
        self._update_manager_provider = update_manager_provider
        self._lock = threading.RLock()
        self._session_unlocked = False
        self._selected_action_index = 0
        self._confirmation_progress = 0
        self._active_action_id: str | None = None
        self._active_action_started_at: str | None = None
        self._last_result: dict[str, Any] = {}
        self._action_task: asyncio.Task[None] | None = None
        self._actions: tuple[MaschineAdminAction, ...] = (
            MaschineAdminAction(
                action_id="restart_backend",
                label="RESTART BACKEND",
                detail="RECYCLE MAP2 API HOST",
            ),
            MaschineAdminAction(
                action_id="restart_web",
                label="RESTART WEB",
                detail="REFRESH PORT 3000 SERVER",
            ),
            MaschineAdminAction(
                action_id="restart_maschine",
                label="RESTART MASCHINE",
                detail="RECYCLE MK1 DAEMON",
            ),
            MaschineAdminAction(
                action_id="start_all_services",
                label="START ALL",
                detail="ORCHESTRATOR START SEQUENCE",
                kind="orchestrator",
            ),
            MaschineAdminAction(
                action_id="stop_all_services",
                label="STOP ALL",
                detail="GRACEFUL ORCHESTRATOR STOP",
                kind="orchestrator",
            ),
            MaschineAdminAction(
                action_id="run_full_update",
                label="RUN FULL UPDATE",
                detail="SYSTEM + APP HYBRID UPDATE",
                kind="update",
            ),
            MaschineAdminAction(
                action_id="reboot_system",
                label="REBOOT HOST",
                detail="SYSTEMCTL REBOOT",
            ),
        )

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            actions = [
                {
                    "action_id": action.action_id,
                    "label": action.label,
                    "detail": action.detail,
                    "tier": action.tier,
                    "kind": action.kind,
                    "is_selected": index == self._selected_action_index,
                    "is_active": action.action_id == self._active_action_id,
                }
                for index, action in enumerate(self._actions)
            ]
            selected = self._actions[self._selected_action_index] if self._actions else None
            busy = self._action_task is not None and not self._action_task.done()
            return {
                "session_unlocked": self._session_unlocked,
                "selected_action_id": selected.action_id if selected is not None else None,
                "selected_action_index": self._selected_action_index,
                "selected_action_label": selected.label if selected is not None else "NO ACTION",
                "selected_action_detail": selected.detail if selected is not None else "NO ACTION AVAILABLE",
                "confirmation_progress": self._confirmation_progress,
                "confirmation_required": 3,
                "busy": busy,
                "active_action_id": self._active_action_id,
                "active_action_started_at": self._active_action_started_at,
                "last_result": dict(self._last_result),
                "actions": actions,
                "updated_at": _utcnow_iso(),
            }

    async def unlock(self) -> dict[str, Any]:
        with self._lock:
            if not self._session_unlocked:
                self._session_unlocked = True
                self._confirmation_progress = 0
        self._record_incident("info", "Maschine admin session unlocked", "admin_unlocked")
        return self.snapshot()

    async def lock(self) -> dict[str, Any]:
        with self._lock:
            self._session_unlocked = False
            self._confirmation_progress = 0
        self._record_incident("warn", "Maschine admin session locked", "admin_locked")
        return self.snapshot()

    async def cancel(self) -> dict[str, Any]:
        cleared_confirmation = False
        with self._lock:
            if self._confirmation_progress > 0:
                self._confirmation_progress = 0
                cleared_confirmation = True
            elif self._session_unlocked and not self._is_busy_locked():
                self._session_unlocked = False
        if cleared_confirmation:
            self._record_incident("warn", "Maschine admin confirmation cancelled", "admin_confirmation_cancelled")
        else:
            self._record_incident("warn", "Maschine admin session cancelled", "admin_cancelled")
        return self.snapshot()

    async def select_relative(self, delta: int) -> dict[str, Any]:
        if delta == 0:
            return self.snapshot()
        with self._lock:
            if not self._session_unlocked or self._is_busy_locked() or not self._actions:
                return self.snapshot()
            self._selected_action_index = (self._selected_action_index + int(delta)) % len(self._actions)
            self._confirmation_progress = 0
        return self.snapshot()

    async def confirm(self) -> dict[str, Any]:
        with self._lock:
            if self._is_busy_locked():
                return self.snapshot()
            if not self._session_unlocked:
                self._session_unlocked = True
                self._confirmation_progress = 0
                self._record_incident("info", "Maschine admin session unlocked", "admin_unlocked")
                return self.snapshot()
            if not self._actions:
                return self.snapshot()
            action = self._actions[self._selected_action_index]
            self._confirmation_progress += 1
            progress = self._confirmation_progress
            if progress < 3:
                self._record_incident(
                    "warn",
                    f"Maschine admin confirmation step {progress}/3 for {action.label.lower()}",
                    "admin_confirmation_progress",
                    context={"action_id": action.action_id, "progress": progress},
                )
                return self.snapshot()
            self._confirmation_progress = 0
            self._active_action_id = action.action_id
            self._active_action_started_at = _utcnow_iso()
            self._last_result = {
                "status": "running",
                "action_id": action.action_id,
                "label": action.label,
                "detail": action.detail,
                "started_at": self._active_action_started_at,
            }
            loop = asyncio.get_running_loop()
            self._action_task = loop.create_task(self._execute_action(action))
        self._record_incident(
            "warn",
            f"Maschine admin action armed: {action.label.lower()}",
            "admin_action_started",
            context={"action_id": action.action_id},
        )
        return self.snapshot()

    async def wait_for_idle(self, *, timeout: float = 5.0) -> None:
        task = self._action_task
        if task is None:
            return
        await asyncio.wait_for(asyncio.shield(task), timeout=max(0.1, float(timeout)))

    def _is_busy_locked(self) -> bool:
        return self._action_task is not None and not self._action_task.done()

    async def _execute_action(self, action: MaschineAdminAction) -> None:
        result: dict[str, Any]
        try:
            if action.kind == "orchestrator":
                result = await self._execute_orchestrator_action(action)
            elif action.kind == "update":
                result = await self._execute_update_action(action)
            else:
                result = await self._execute_systemctl_action(action)
        except Exception as exc:  # pragma: no cover - safety net
            LOGGER.exception("Maschine admin action %s crashed", action.action_id)
            result = {
                "status": "failed",
                "action_id": action.action_id,
                "label": action.label,
                "detail": str(exc),
                "completed_at": _utcnow_iso(),
            }

        with self._lock:
            self._active_action_id = None
            self._active_action_started_at = None
            self._last_result = result
            self._action_task = None

        severity = "info" if result.get("status") == "completed" else "error"
        event = "admin_action_completed" if result.get("status") == "completed" else "admin_action_failed"
        self._record_incident(
            severity,
            f"Maschine admin action {action.label.lower()} {result.get('status')}",
            event,
            detail=str(result.get("detail") or ""),
            context={"action_id": action.action_id},
        )

    async def _execute_systemctl_action(self, action: MaschineAdminAction) -> dict[str, Any]:
        command_map = {
            "restart_backend": ("sudo", "-n", "systemctl", "restart", "map2-backend.service"),
            "restart_web": ("sudo", "-n", "systemctl", "restart", "map2-web-prod.service"),
            "restart_maschine": ("sudo", "-n", "systemctl", "restart", "map2-maschine.service"),
            "reboot_system": ("sudo", "-n", "systemctl", "reboot"),
        }
        command = command_map[action.action_id]
        returncode, stdout, stderr = await self._command_runner(command)
        detail = stderr or stdout or action.detail
        status = "completed" if returncode == 0 else "failed"
        return {
            "status": status,
            "action_id": action.action_id,
            "label": action.label,
            "detail": _safe_label(detail, limit=36, fallback=action.detail),
            "command": " ".join(command),
            "returncode": returncode,
            "completed_at": _utcnow_iso(),
        }

    async def _execute_orchestrator_action(self, action: MaschineAdminAction) -> dict[str, Any]:
        orchestrator = self._orchestrator_provider()
        if action.action_id == "start_all_services":
            results = await orchestrator.start_all()
        else:
            results = await orchestrator.stop_all()
        success = all(bool(value) for value in results.values()) if results else True
        return {
            "status": "completed" if success else "failed",
            "action_id": action.action_id,
            "label": action.label,
            "detail": f"{sum(1 for value in results.values() if value)}/{len(results)} SERVICES",
            "results": dict(results),
            "completed_at": _utcnow_iso(),
        }

    async def _execute_update_action(self, action: MaschineAdminAction) -> dict[str, Any]:
        manager = self._update_manager_provider()

        async def _run() -> dict[str, Any]:
            return await manager.trigger_full_update(
                update_system=True,
                update_application=True,
                version=None,
                node_id=None,
            )

        result = await asyncio.wait_for(_run(), timeout=_UPDATE_TIMEOUT_SECONDS)
        success = str(result.get("status") or "").strip().lower() == "ok" and bool(result.get("success", True))
        detail = str(result.get("message") or "FULL UPDATE COMPLETE")
        return {
            "status": "completed" if success else "failed",
            "action_id": action.action_id,
            "label": action.label,
            "detail": _safe_label(detail, limit=36, fallback=action.detail),
            "result": dict(result),
            "completed_at": _utcnow_iso(),
        }

    @staticmethod
    def _record_incident(
        severity: str,
        message: str,
        event: str,
        *,
        detail: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> None:
        try:
            get_maschine_incident_log_service().append(
                severity=severity,
                source="maschine-admin",
                message=message,
                detail=detail,
                event=event,
                context=context,
            )
        except Exception as exc:  # pragma: no cover - best effort
            LOGGER.debug("Maschine admin incident append failed: %s", exc)


_ADMIN_CONSOLE_SERVICE: MaschineAdminConsoleService | None = None
_ADMIN_CONSOLE_LOCK = threading.Lock()


def get_maschine_admin_console_service() -> MaschineAdminConsoleService:
    global _ADMIN_CONSOLE_SERVICE
    if _ADMIN_CONSOLE_SERVICE is None:
        with _ADMIN_CONSOLE_LOCK:
            if _ADMIN_CONSOLE_SERVICE is None:
                _ADMIN_CONSOLE_SERVICE = MaschineAdminConsoleService()
    return _ADMIN_CONSOLE_SERVICE


def reset_maschine_admin_console_service() -> None:
    global _ADMIN_CONSOLE_SERVICE
    with _ADMIN_CONSOLE_LOCK:
        _ADMIN_CONSOLE_SERVICE = None
