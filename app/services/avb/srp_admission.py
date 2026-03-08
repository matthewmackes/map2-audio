"""SRP/MSRP daemon-backed AVB admission control service."""

from __future__ import annotations

import asyncio
import logging
import os
import re
import shutil
import socket
import tempfile
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

from app.config import config_get
from app.services.avb.srp_log_store import SrpAdmissionLogStore

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    """UTC timestamp as naive datetime for current DB schema compatibility."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _is_udp_endpoint(control_socket: str) -> bool:
    return str(control_socket or "").strip().lower().startswith("udp://")


def _parse_udp_endpoint(control_socket: str) -> Tuple[str, int]:
    raw = str(control_socket or "").strip()
    if not _is_udp_endpoint(raw):
        raise ValueError(f"Unsupported UDP control endpoint: {control_socket}")

    host_port = raw[6:]
    if ":" not in host_port:
        raise ValueError(f"Invalid UDP control endpoint: {control_socket}")

    host, port_text = host_port.rsplit(":", 1)
    host = host.strip() or "127.0.0.1"
    try:
        port = int(port_text)
    except ValueError as exc:
        raise ValueError(f"Invalid UDP port in control endpoint: {control_socket}") from exc

    if port < 1 or port > 65535:
        raise ValueError(f"Invalid UDP port in control endpoint: {control_socket}")

    return host, port


def _probe_udp_endpoint(control_socket: str, *, timeout_ms: int = 150) -> bool:
    try:
        host, port = _parse_udp_endpoint(control_socket)
    except ValueError:
        return False

    payload = b"S??\n"
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.settimeout(max(0.05, timeout_ms / 1000.0))
        sock.sendto(payload, (host, port))
        response, _ = sock.recvfrom(4096)
        return bool(response)
    except Exception:
        return False
    finally:
        try:
            sock.close()
        except Exception:
            pass


def _control_endpoint_exists(control_socket: str) -> bool:
    path = str(control_socket or "").strip()
    if not path:
        return False
    if _is_udp_endpoint(path):
        return _probe_udp_endpoint(path)
    return os.path.exists(path)


@dataclass
class SrpAdmissionRequest:
    """Normalized admission request context."""

    endpoint: str
    stream_id: Optional[str] = None
    talker_id: Optional[str] = None
    listener_id: Optional[str] = None
    talker_mac: Optional[str] = None
    listener_mac: Optional[str] = None
    request_metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SrpAdmissionResult:
    """Admission decision payload used by routes and logging."""

    admission_id: str
    decision: str
    reason_code: str
    reason: str
    remediation: List[str]
    daemon_type: str
    daemon_socket: Optional[str]
    endpoint: str
    stream_id: Optional[str]
    talker_id: Optional[str]
    listener_id: Optional[str]
    reservation_id: Optional[str]
    raw_response: Optional[str]
    created_at: datetime
    completed_at: datetime

    def to_dict(self) -> Dict[str, Any]:
        return {
            "admission_id": self.admission_id,
            "decision": self.decision,
            "reason_code": self.reason_code,
            "reason": self.reason,
            "remediation": list(self.remediation),
            "daemon_type": self.daemon_type,
            "daemon_socket": self.daemon_socket,
            "endpoint": self.endpoint,
            "stream_id": self.stream_id,
            "talker_id": self.talker_id,
            "listener_id": self.listener_id,
            "reservation_id": self.reservation_id,
            "raw_response": self.raw_response,
            "created_at": self.created_at.isoformat(),
            "completed_at": self.completed_at.isoformat(),
        }


@dataclass
class SrpReleaseResult:
    """Release outcome for existing reservations."""

    success: bool
    reason_code: str
    reason: str
    daemon_type: str
    raw_response: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "reason_code": self.reason_code,
            "reason": self.reason,
            "daemon_type": self.daemon_type,
            "raw_response": self.raw_response,
        }


@dataclass
class _AdapterExchangeResult:
    success: bool
    reason_code: str
    reason: str
    raw_response: Optional[str]


class _UnixSocketTransport:
    """Performs best-effort daemon command exchange over UNIX sockets or UDP endpoints."""

    @staticmethod
    def _decode_response(response: bytes) -> str:
        # OpenAvnu mrpd often returns fixed-size buffers padded with NUL bytes.
        return response.decode("utf-8", errors="replace").replace("\x00", "").strip()

    @staticmethod
    def _run_dgram_exchange(control_socket: str, message: str, timeout_ms: int) -> str:
        timeout_sec = max(0.1, timeout_ms / 1000.0)
        client_path = os.path.join(
            tempfile.gettempdir(),
            f"map2-srp-{os.getpid()}-{uuid.uuid4().hex}.sock",
        )
        payload = f"{message}\n".encode("utf-8", errors="ignore")

        sock = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
        try:
            sock.settimeout(timeout_sec)
            sock.bind(client_path)
            sock.sendto(payload, control_socket)
            response = sock.recv(65535)
            return _UnixSocketTransport._decode_response(response)
        finally:
            try:
                sock.close()
            except Exception:
                pass
            try:
                if os.path.exists(client_path):
                    os.unlink(client_path)
            except Exception:
                pass

    @staticmethod
    def _run_stream_exchange(control_socket: str, message: str, timeout_ms: int) -> str:
        timeout_sec = max(0.1, timeout_ms / 1000.0)
        payload = f"{message}\n".encode("utf-8", errors="ignore")

        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            sock.settimeout(timeout_sec)
            sock.connect(control_socket)
            sock.sendall(payload)
            response = sock.recv(65535)
            return _UnixSocketTransport._decode_response(response)
        finally:
            try:
                sock.close()
            except Exception:
                pass

    @staticmethod
    def _run_udp_exchange(control_socket: str, message: str, timeout_ms: int) -> str:
        timeout_sec = max(0.1, timeout_ms / 1000.0)
        payload = f"{message}\n".encode("utf-8", errors="ignore")
        host, port = _parse_udp_endpoint(control_socket)

        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            sock.settimeout(timeout_sec)
            sock.sendto(payload, (host, port))
            response, _ = sock.recvfrom(65535)
            return _UnixSocketTransport._decode_response(response)
        finally:
            try:
                sock.close()
            except Exception:
                pass

    @classmethod
    async def exchange(cls, control_socket: str, message: str, timeout_ms: int) -> str:
        if _is_udp_endpoint(control_socket):
            return await asyncio.to_thread(
                cls._run_udp_exchange,
                control_socket,
                message,
                timeout_ms,
            )

        try:
            return await asyncio.to_thread(
                cls._run_dgram_exchange,
                control_socket,
                message,
                timeout_ms,
            )
        except TimeoutError:
            raise
        except (ConnectionRefusedError, BrokenPipeError, OSError):
            return await asyncio.to_thread(
                cls._run_stream_exchange,
                control_socket,
                message,
                timeout_ms,
            )


class _BaseSrpAdapter:
    daemon_type = "unknown"
    binary_candidates: Sequence[str] = ()
    socket_candidates: Sequence[str] = ()

    @staticmethod
    def _compact_hex(value: Optional[str]) -> str:
        text = str(value or "").lower().replace("0x", "")
        return "".join(ch for ch in text if ch in "0123456789abcdef")

    @classmethod
    def _normalize_stream_id(cls, stream_id: Optional[str], fallback_seed: str) -> str:
        candidate = cls._compact_hex(stream_id)
        if not candidate:
            candidate = cls._compact_hex(fallback_seed)
        if not candidate:
            candidate = "0"
        if len(candidate) < 16:
            candidate = candidate.rjust(16, "0")
        return candidate[:16]

    @classmethod
    def _normalize_mac(cls, raw_value: Optional[str], fallback: str) -> str:
        value = str(raw_value or "").strip().lower()
        if re.fullmatch(r"(?:[0-9a-f]{2}:){5}[0-9a-f]{2}", value):
            return value

        compact = cls._compact_hex(value)
        if len(compact) < 12:
            compact = cls._compact_hex(fallback)
        if len(compact) < 12:
            compact = "000000000000"
        compact = compact[:12]
        return ":".join(compact[i:i + 2] for i in range(0, 12, 2))

    @staticmethod
    def _normalize_token(raw_value: Optional[str], fallback: str) -> str:
        token = str(raw_value or "").strip()
        if not token:
            token = fallback
        token = token.replace(",", "_").replace(" ", "_")
        return token

    def resolve_socket(self, override_socket: str = "") -> str:
        if override_socket:
            return override_socket
        for candidate in self.socket_candidates:
            if os.path.exists(candidate):
                return candidate
        return self.socket_candidates[0] if self.socket_candidates else ""

    @staticmethod
    def _class_priority(sr_class: str) -> int:
        return 3 if sr_class.upper() == "A" else 2

    @staticmethod
    def _classify_response(raw_response: Optional[str]) -> Tuple[bool, str, str]:
        if raw_response is None:
            return False, "SRP_NO_RESPONSE", "SRP daemon returned no response"

        text = raw_response.strip()
        if not text:
            return False, "SRP_NO_RESPONSE", "SRP daemon returned empty response"

        upper = text.upper()
        deny_patterns = (
            r"\bDENY(?:IED)?\b",
            r"\bREJECT(?:ED)?\b",
            r"\bFAIL(?:ED|URE)?\b",
            r"\bERROR\b",
            r"\bNACK\b",
            r"\bNO\s*RESOURCE\b",
            r"\bUNAVAILABLE\b",
            r"\bINSUFFICIENT\b",
            r"\bNOT\s+READY\b",
            r"\bNOT\s+REGISTERED\b",
            r"\bNOT\s+JOINED\b",
            r"\bNOT\s+ADVERTISED\b",
        )
        allow_patterns = (
            r"\bACK(?:NOWLEDGED)?\b",
            r"\bOK\b",
            r"\bSUCCESS\b",
            r"\bREGISTER(?:ED)?\b",
            r"\bJOIN(?:ED)?\b",
            r"\bADVERTISE(?:D)?\b",
            r"\bREADY\b",
            r"\bRESERV(?:E|ED)\b",
            r"\b2\d\d\b",
        )

        if any(re.search(pattern, upper) for pattern in deny_patterns):
            return False, "SRP_DENIED", "SRP daemon rejected reservation"
        if any(re.search(pattern, upper) for pattern in allow_patterns):
            return True, "SRP_ADMITTED", "SRP reservation acknowledged"

        return False, "SRP_UNKNOWN_RESPONSE", "SRP daemon response could not be classified"

    async def reserve(
        self,
        *,
        control_socket: str,
        timeout_ms: int,
        request: SrpAdmissionRequest,
        reservation_id: str,
        vlan_id: int,
        sr_class: str,
    ) -> _AdapterExchangeResult:
        message = self.build_reserve_message(
            request=request,
            reservation_id=reservation_id,
            vlan_id=vlan_id,
            sr_class=sr_class,
            priority=self._class_priority(sr_class),
        )
        try:
            raw_response = await _UnixSocketTransport.exchange(control_socket, message, timeout_ms)
        except TimeoutError:
            return _AdapterExchangeResult(
                success=False,
                reason_code="SRP_TIMEOUT",
                reason="Timed out waiting for SRP daemon response",
                raw_response=None,
            )
        except FileNotFoundError:
            return _AdapterExchangeResult(
                success=False,
                reason_code="SRP_SOCKET_UNAVAILABLE",
                reason="SRP daemon control socket not found",
                raw_response=None,
            )
        except Exception as exc:
            return _AdapterExchangeResult(
                success=False,
                reason_code="SRP_PROTOCOL_ERROR",
                reason=f"SRP daemon exchange failed: {exc}",
                raw_response=None,
            )

        success, reason_code, reason = self._classify_response(raw_response)
        return _AdapterExchangeResult(
            success=success,
            reason_code=reason_code,
            reason=reason,
            raw_response=raw_response,
        )

    async def release(
        self,
        *,
        control_socket: str,
        timeout_ms: int,
        reservation_id: str,
    ) -> _AdapterExchangeResult:
        message = self.build_release_message(reservation_id)
        try:
            raw_response = await _UnixSocketTransport.exchange(control_socket, message, timeout_ms)
        except TimeoutError:
            return _AdapterExchangeResult(
                success=False,
                reason_code="SRP_RELEASE_TIMEOUT",
                reason="Timed out waiting for SRP release response",
                raw_response=None,
            )
        except FileNotFoundError:
            return _AdapterExchangeResult(
                success=False,
                reason_code="SRP_RELEASE_SOCKET_UNAVAILABLE",
                reason="SRP daemon control socket not found",
                raw_response=None,
            )
        except Exception as exc:
            return _AdapterExchangeResult(
                success=False,
                reason_code="SRP_RELEASE_PROTOCOL_ERROR",
                reason=f"SRP release exchange failed: {exc}",
                raw_response=None,
            )

        success, reason_code, reason = self._classify_response(raw_response)
        if success:
            return _AdapterExchangeResult(
                success=True,
                reason_code="SRP_RELEASED",
                reason="SRP reservation released",
                raw_response=raw_response,
            )

        return _AdapterExchangeResult(
            success=False,
            reason_code=f"SRP_RELEASE_{reason_code}",
            reason=reason,
            raw_response=raw_response,
        )

    def build_reserve_message(
        self,
        *,
        request: SrpAdmissionRequest,
        reservation_id: str,
        vlan_id: int,
        sr_class: str,
        priority: int,
    ) -> str:
        raise NotImplementedError

    def build_release_message(self, reservation_id: str) -> str:
        raise NotImplementedError

    def build_ping_message(self) -> str:
        return "PING"


class MrpdAdapter(_BaseSrpAdapter):
    daemon_type = "mrpd"
    binary_candidates = ("mrpd",)
    socket_candidates = (
        "/var/run/mrp_socket",
        "/run/mrp_socket",
    )

    def build_reserve_message(
        self,
        *,
        request: SrpAdmissionRequest,
        reservation_id: str,
        vlan_id: int,
        sr_class: str,
        priority: int,
    ) -> str:
        stream_id = self._normalize_stream_id(request.stream_id, reservation_id)
        talker = self._normalize_mac(request.talker_mac or request.talker_id, "00:00:00:00:00:00")
        listener = self._normalize_mac(request.listener_mac or request.listener_id, "ff:ff:ff:ff:ff:ff")
        token = self._normalize_token(reservation_id, "res")

        # mrpd control plane text exchange for MSRP stream reservation intent.
        return (
            "S++:"
            f"S={stream_id},"
            f"T={talker},"
            f"L={listener},"
            f"V={vlan_id},"
            f"C={sr_class.upper()},"
            f"P={priority},"
            f"R={token}"
        )

    def build_release_message(self, reservation_id: str) -> str:
        token = self._normalize_token(reservation_id, "res")
        return f"S--:R={token}"

    def build_ping_message(self) -> str:
        return "S??"


class MsrpdAdapter(_BaseSrpAdapter):
    daemon_type = "msrpd"
    binary_candidates = ("msrpd",)
    socket_candidates = (
        "/run/msrpd/msrpd.sock",
        "/var/run/msrpd.sock",
        "/run/msrpd.sock",
    )

    def build_reserve_message(
        self,
        *,
        request: SrpAdmissionRequest,
        reservation_id: str,
        vlan_id: int,
        sr_class: str,
        priority: int,
    ) -> str:
        stream_id = self._normalize_stream_id(request.stream_id, reservation_id)
        talker = self._normalize_mac(request.talker_mac or request.talker_id, "00:00:00:00:00:00")
        listener = self._normalize_mac(request.listener_mac or request.listener_id, "ff:ff:ff:ff:ff:ff")
        token = self._normalize_token(reservation_id, "res")

        return (
            "RESERVE "
            f"STREAM_ID={stream_id} "
            f"TALKER_MAC={talker} "
            f"LISTENER_MAC={listener} "
            f"VLAN_ID={vlan_id} "
            f"CLASS={sr_class.upper()} "
            f"PRIORITY={priority} "
            f"RESERVATION_ID={token}"
        )

    def build_release_message(self, reservation_id: str) -> str:
        token = self._normalize_token(reservation_id, "res")
        return f"RELEASE RESERVATION_ID={token}"

    def build_ping_message(self) -> str:
        return "STATUS"


class SrpAdmissionService:
    """Admission controller that enforces daemon-backed SRP/MSRP reservations."""

    _ADMIT_RETRYABLE_REASON_CODES = {
        "SRP_TIMEOUT",
        "SRP_SOCKET_UNAVAILABLE",
        "SRP_PROTOCOL_ERROR",
        "SRP_NO_RESPONSE",
        "SRP_UNKNOWN_RESPONSE",
    }
    _RELEASE_RETRYABLE_REASON_CODES = {
        "SRP_RELEASE_TIMEOUT",
        "SRP_RELEASE_SOCKET_UNAVAILABLE",
        "SRP_RELEASE_PROTOCOL_ERROR",
        "SRP_RELEASE_SRP_NO_RESPONSE",
        "SRP_RELEASE_SRP_UNKNOWN_RESPONSE",
    }

    def __init__(self) -> None:
        self._log_store = SrpAdmissionLogStore()
        self._last_error: Optional[str] = None
        self._adapters: Dict[str, _BaseSrpAdapter] = {
            "mrpd": MrpdAdapter(),
            "msrpd": MsrpdAdapter(),
        }

    @staticmethod
    def _enabled() -> bool:
        return bool(config_get("avb.srp.enabled", True))

    @staticmethod
    def _required() -> bool:
        return bool(config_get("avb.srp.required", True))

    @staticmethod
    def _daemon_preference() -> str:
        raw = str(config_get("avb.srp.daemon", "auto") or "auto").strip().lower()
        if raw in {"mrpd", "msrpd", "auto"}:
            return raw
        return "auto"

    @staticmethod
    def _timeout_ms() -> int:
        try:
            return max(100, int(config_get("avb.srp.timeout_ms", 2000)))
        except Exception:
            return 2000

    @staticmethod
    def _vlan_id() -> int:
        try:
            return max(1, min(4094, int(config_get("avb.srp.vlan_id", 2))))
        except Exception:
            return 2

    @staticmethod
    def _sr_class() -> str:
        value = str(config_get("avb.srp.class", "A") or "A").strip().upper()
        return value if value in {"A", "B"} else "A"

    @staticmethod
    def _socket_override() -> str:
        raw = config_get("avb.srp.control_socket", "")
        return str(raw or "").strip()

    @staticmethod
    def _find_binary(adapter: _BaseSrpAdapter) -> Optional[str]:
        for candidate in adapter.binary_candidates:
            path = shutil.which(candidate)
            if path:
                return path
        return None

    def _resolve_adapter(self) -> Tuple[Optional[_BaseSrpAdapter], Optional[str], Optional[str], List[Dict[str, Any]]]:
        preference = self._daemon_preference()
        override_socket = self._socket_override()
        detected: List[Dict[str, Any]] = []

        if preference == "auto":
            order = ("mrpd", "msrpd")
        else:
            order = (preference,)

        best_adapter: Optional[_BaseSrpAdapter] = None
        best_socket: Optional[str] = None
        best_binary: Optional[str] = None
        best_score = -1

        for daemon_name in order:
            adapter = self._adapters.get(daemon_name)
            if adapter is None:
                continue

            socket_path = adapter.resolve_socket(override_socket)
            binary_path = self._find_binary(adapter)
            socket_exists = _control_endpoint_exists(socket_path)

            detected.append(
                {
                    "daemon_type": adapter.daemon_type,
                    "binary_path": binary_path,
                    "control_socket": socket_path,
                    "socket_exists": socket_exists,
                }
            )

            if preference != "auto":
                return adapter, socket_path, binary_path, detected

            # Prefer actively reachable daemons (socket exists), then fall back
            # to daemon binaries when no live socket is detected.
            score = (2 if socket_exists else 0) + (1 if binary_path else 0)
            if score > best_score:
                best_adapter = adapter
                best_socket = socket_path
                best_binary = binary_path
                best_score = score

        if preference == "auto" and best_adapter is not None and best_score > 0:
            return best_adapter, best_socket, best_binary, detected

        if preference == "auto":
            for daemon_name in ("mrpd", "msrpd"):
                adapter = self._adapters[daemon_name]
                socket_path = adapter.resolve_socket(override_socket)
                binary_path = self._find_binary(adapter)
                socket_exists = _control_endpoint_exists(socket_path)
                if not any(entry["daemon_type"] == adapter.daemon_type for entry in detected):
                    detected.append(
                        {
                            "daemon_type": adapter.daemon_type,
                            "binary_path": binary_path,
                            "control_socket": socket_path,
                            "socket_exists": socket_exists,
                        }
                    )

        return None, None, None, detected

    def _resolve_alternate_adapter(
        self,
        *,
        current_daemon_type: str,
        detected: List[Dict[str, Any]],
    ) -> Tuple[Optional[_BaseSrpAdapter], Optional[str], Optional[str]]:
        for entry in detected:
            daemon_type = str(entry.get("daemon_type") or "")
            if not daemon_type or daemon_type == current_daemon_type:
                continue

            adapter = self._adapters.get(daemon_type)
            if adapter is None:
                continue

            socket_path = str(entry.get("control_socket") or "").strip()
            if not socket_path:
                socket_path = adapter.resolve_socket(self._socket_override())
            binary_path = str(entry.get("binary_path") or "").strip() or self._find_binary(adapter)

            return adapter, socket_path, binary_path

        return None, None, None

    def _runtime_control_socket(self, adapter: _BaseSrpAdapter, socket_path: Optional[str]) -> str:
        resolved = str(socket_path or "").strip()
        if not adapter or adapter.daemon_type != "mrpd":
            return resolved
        if _is_udp_endpoint(resolved):
            return resolved
        if _control_endpoint_exists(resolved):
            return resolved
        override = self._socket_override()
        if override and not _is_udp_endpoint(override):
            # Preserve explicit override when it is valid; otherwise allow
            # mrpd UDP fallback for legacy UNIX-socket defaults.
            if _control_endpoint_exists(resolved):
                return resolved

        udp_candidate = "udp://127.0.0.1:7500"
        if _control_endpoint_exists(udp_candidate):
            return udp_candidate
        return resolved

    async def _ping_daemon(
        self,
        adapter: _BaseSrpAdapter,
        socket_path: str,
    ) -> Tuple[bool, Optional[str]]:
        if not socket_path:
            return False, "SRP control socket path is not configured"
        if not _control_endpoint_exists(socket_path):
            return False, f"SRP control socket not found: {socket_path}"

        timeout_ms = min(self._timeout_ms(), 500)
        try:
            response = await _UnixSocketTransport.exchange(
                socket_path,
                adapter.build_ping_message(),
                timeout_ms,
            )
        except TimeoutError:
            return False, "Timed out waiting for SRP daemon ping response"
        except Exception as exc:
            return False, f"SRP daemon ping failed: {exc}"

        if not (response or "").strip():
            return False, "SRP daemon ping returned empty response"

        return True, None

    async def get_status(self) -> Dict[str, Any]:
        """Return SRP daemon readiness and configuration status."""
        enabled = self._enabled()
        required = self._required()
        timeout_ms = self._timeout_ms()
        sr_class = self._sr_class()
        vlan_id = self._vlan_id()
        preference = self._daemon_preference()

        adapter, socket_path, binary_path, detected = self._resolve_adapter()
        daemon_type = adapter.daemon_type if adapter else "none"
        if adapter:
            socket_path = self._runtime_control_socket(adapter, socket_path)

        running = False
        status_error: Optional[str] = self._last_error
        if adapter and socket_path:
            running, ping_error = await self._ping_daemon(adapter, socket_path)
            if not running and preference == "auto":
                alt_adapter, alt_socket, alt_binary = self._resolve_alternate_adapter(
                    current_daemon_type=adapter.daemon_type,
                    detected=detected,
                )
                if alt_adapter and alt_socket:
                    alt_running, alt_ping_error = await self._ping_daemon(alt_adapter, alt_socket)
                    if alt_running:
                        adapter = alt_adapter
                        socket_path = alt_socket
                        binary_path = alt_binary
                        daemon_type = alt_adapter.daemon_type
                        running = True
                        ping_error = None
                    elif ping_error is None and alt_ping_error:
                        ping_error = alt_ping_error

            if ping_error:
                status_error = ping_error
                self._last_error = ping_error
            elif running:
                status_error = None
                self._last_error = None

        return {
            "enabled": enabled,
            "required": required,
            "daemon_preference": preference,
            "daemon_type": daemon_type,
            "binary_path": binary_path,
            "control_socket": socket_path,
            "running": running,
            "protocol_mode": "msrp-message-exchange",
            "timeout_ms": timeout_ms,
            "vlan_id": vlan_id,
            "class": sr_class,
            "last_error": status_error,
            "detected_daemons": detected,
        }

    @staticmethod
    def _base_remediation() -> List[str]:
        return [
            "Verify SRP daemon is installed and active (map2-srpd.service).",
            "Check SRP control socket path in avb.srp.control_socket or daemon defaults.",
            "Use /api/avb/srp/status to confirm daemon health before retrying connection.",
        ]

    async def _persist(self, request: SrpAdmissionRequest, result: SrpAdmissionResult) -> None:
        try:
            await self._log_store.record(
                admission_id=result.admission_id,
                decision=result.decision,
                reason_code=result.reason_code,
                reason=result.reason,
                remediation=result.remediation,
                daemon_type=result.daemon_type,
                daemon_socket=result.daemon_socket,
                raw_response=result.raw_response,
                endpoint=result.endpoint,
                stream_id=result.stream_id,
                talker_id=result.talker_id,
                listener_id=result.listener_id,
                reservation_id=result.reservation_id,
                request_metadata=request.request_metadata,
                created_at=result.created_at,
                completed_at=result.completed_at,
            )
        except Exception as exc:
            logger.error("Failed to persist SRP admission log: %s", exc)

    async def admit(self, request: SrpAdmissionRequest) -> SrpAdmissionResult:
        """Attempt SRP admission and return normalized decision payload."""
        admission_id = uuid.uuid4().hex
        started = _utcnow()

        enabled = self._enabled()
        required = self._required()
        timeout_ms = self._timeout_ms()

        if not enabled:
            result = SrpAdmissionResult(
                admission_id=admission_id,
                decision="bypass",
                reason_code="SRP_DISABLED",
                reason="SRP admission control is disabled",
                remediation=[],
                daemon_type="none",
                daemon_socket=None,
                endpoint=request.endpoint,
                stream_id=request.stream_id,
                talker_id=request.talker_id,
                listener_id=request.listener_id,
                reservation_id=None,
                raw_response=None,
                created_at=started,
                completed_at=_utcnow(),
            )
            await self._persist(request, result)
            return result

        adapter, socket_path, _binary_path, detected = self._resolve_adapter()
        if adapter:
            socket_path = self._runtime_control_socket(adapter, socket_path)
        if adapter is None or not socket_path:
            self._last_error = "No SRP daemon detected"
            decision = "denied" if required else "bypass"
            reason_code = "SRP_DAEMON_UNAVAILABLE" if required else "SRP_OPTIONAL_BYPASS"
            reason = "No SRP daemon detected for admission requests"
            result = SrpAdmissionResult(
                admission_id=admission_id,
                decision=decision,
                reason_code=reason_code,
                reason=reason,
                remediation=self._base_remediation(),
                daemon_type="none",
                daemon_socket=None,
                endpoint=request.endpoint,
                stream_id=request.stream_id,
                talker_id=request.talker_id,
                listener_id=request.listener_id,
                reservation_id=None,
                raw_response=None,
                created_at=started,
                completed_at=_utcnow(),
            )
            await self._persist(request, result)
            return result

        if not _control_endpoint_exists(socket_path):
            self._last_error = f"SRP socket unavailable: {socket_path}"
            decision = "denied" if required else "bypass"
            reason_code = "SRP_SOCKET_UNAVAILABLE" if required else "SRP_OPTIONAL_BYPASS"
            result = SrpAdmissionResult(
                admission_id=admission_id,
                decision=decision,
                reason_code=reason_code,
                reason=f"SRP control socket not found: {socket_path}",
                remediation=self._base_remediation(),
                daemon_type=adapter.daemon_type,
                daemon_socket=socket_path,
                endpoint=request.endpoint,
                stream_id=request.stream_id,
                talker_id=request.talker_id,
                listener_id=request.listener_id,
                reservation_id=None,
                raw_response=None,
                created_at=started,
                completed_at=_utcnow(),
            )
            await self._persist(request, result)
            return result

        reservation_id = f"srp-{uuid.uuid4().hex}"
        exchange = await adapter.reserve(
            control_socket=socket_path,
            timeout_ms=timeout_ms,
            request=request,
            reservation_id=reservation_id,
            vlan_id=self._vlan_id(),
            sr_class=self._sr_class(),
        )

        if (
            not exchange.success
            and self._daemon_preference() == "auto"
            and exchange.reason_code in self._ADMIT_RETRYABLE_REASON_CODES
        ):
            alt_adapter, alt_socket, _alt_binary = self._resolve_alternate_adapter(
                current_daemon_type=adapter.daemon_type,
                detected=detected,
            )
            if alt_adapter:
                alt_socket = self._runtime_control_socket(alt_adapter, alt_socket)
            if alt_adapter and alt_socket and _control_endpoint_exists(alt_socket):
                alt_exchange = await alt_adapter.reserve(
                    control_socket=alt_socket,
                    timeout_ms=timeout_ms,
                    request=request,
                    reservation_id=reservation_id,
                    vlan_id=self._vlan_id(),
                    sr_class=self._sr_class(),
                )
                if alt_exchange.success or alt_exchange.reason_code not in self._ADMIT_RETRYABLE_REASON_CODES:
                    adapter = alt_adapter
                    socket_path = alt_socket
                    exchange = alt_exchange

        if exchange.success:
            decision = "allowed"
            reason_code = "SRP_ADMITTED"
            reason = "SRP reservation accepted"
            remediation: List[str] = []
            resolved_reservation = reservation_id
            self._last_error = None
        else:
            self._last_error = exchange.reason
            decision = "denied" if required else "bypass"
            reason_code = exchange.reason_code if required else "SRP_OPTIONAL_BYPASS"
            reason = exchange.reason
            remediation = self._base_remediation()
            resolved_reservation = None

        result = SrpAdmissionResult(
            admission_id=admission_id,
            decision=decision,
            reason_code=reason_code,
            reason=reason,
            remediation=remediation,
            daemon_type=adapter.daemon_type,
            daemon_socket=socket_path,
            endpoint=request.endpoint,
            stream_id=request.stream_id,
            talker_id=request.talker_id,
            listener_id=request.listener_id,
            reservation_id=resolved_reservation,
            raw_response=exchange.raw_response,
            created_at=started,
            completed_at=_utcnow(),
        )
        await self._persist(request, result)
        return result

    async def release(
        self,
        *,
        reservation_id: str,
        endpoint: str,
        stream_id: Optional[str] = None,
        talker_id: Optional[str] = None,
        listener_id: Optional[str] = None,
    ) -> SrpReleaseResult:
        """Release an existing SRP reservation."""
        if not reservation_id:
            return SrpReleaseResult(
                success=True,
                reason_code="SRP_RELEASE_NOOP",
                reason="No SRP reservation bound",
                daemon_type="none",
                raw_response=None,
            )

        if not self._enabled():
            return SrpReleaseResult(
                success=True,
                reason_code="SRP_RELEASE_BYPASS",
                reason="SRP is disabled",
                daemon_type="none",
                raw_response=None,
            )

        adapter, socket_path, _binary_path, detected = self._resolve_adapter()
        if adapter:
            socket_path = self._runtime_control_socket(adapter, socket_path)
        if adapter is None or not socket_path:
            result = SrpReleaseResult(
                success=False,
                reason_code="SRP_RELEASE_DAEMON_UNAVAILABLE",
                reason="No SRP daemon detected for release",
                daemon_type="none",
                raw_response=None,
            )
            await self._log_store.mark_release(
                reservation_id=reservation_id,
                success=False,
                reason=result.reason,
                raw_response=None,
            )
            return result

        exchange = await adapter.release(
            control_socket=socket_path,
            timeout_ms=self._timeout_ms(),
            reservation_id=reservation_id,
        )

        if (
            not exchange.success
            and self._daemon_preference() == "auto"
            and exchange.reason_code in self._RELEASE_RETRYABLE_REASON_CODES
        ):
            alt_adapter, alt_socket, _alt_binary = self._resolve_alternate_adapter(
                current_daemon_type=adapter.daemon_type,
                detected=detected,
            )
            if alt_adapter:
                alt_socket = self._runtime_control_socket(alt_adapter, alt_socket)
            if alt_adapter and alt_socket and _control_endpoint_exists(alt_socket):
                alt_exchange = await alt_adapter.release(
                    control_socket=alt_socket,
                    timeout_ms=self._timeout_ms(),
                    reservation_id=reservation_id,
                )
                if alt_exchange.success or alt_exchange.reason_code not in self._RELEASE_RETRYABLE_REASON_CODES:
                    adapter = alt_adapter
                    exchange = alt_exchange

        await self._log_store.mark_release(
            reservation_id=reservation_id,
            success=exchange.success,
            reason=exchange.reason,
            raw_response=exchange.raw_response,
        )

        return SrpReleaseResult(
            success=exchange.success,
            reason_code=exchange.reason_code,
            reason=exchange.reason,
            daemon_type=adapter.daemon_type,
            raw_response=exchange.raw_response,
        )


_srp_admission_service: Optional[SrpAdmissionService] = None


def get_srp_admission_service() -> SrpAdmissionService:
    """Get singleton SRP admission service."""
    global _srp_admission_service
    if _srp_admission_service is None:
        _srp_admission_service = SrpAdmissionService()
    return _srp_admission_service
