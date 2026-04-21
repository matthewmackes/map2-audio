"""FastAPI WebSocket route for the Web SSH console (T2419-B).

Framing — all frames are JSON except server-to-client `data` frames, which
are sent as raw bytes for efficiency. Client MUST send the initial `open`
frame within 10s of connecting.

Client → server:
    {"type": "open", "host": "10.0.0.50", "port": 22, "username": "mm",
     "auth": "publickey" | "password", "password": "...", "private_key": "...",
     "known_hosts": "accept-new" | "strict" | "auto-add",
     "keepalive_s": 30.0, "connect_timeout_s": 10.0,
     "term_cols": 80, "term_rows": 24, "env": {...}, "idle_timeout_s": 900}
    {"type": "data", "data": "<utf-8 text>"}           # user keystrokes
    {"type": "resize", "cols": 120, "rows": 40}         # container resize
    {"type": "close"}

Server → client:
    {"type": "open_ok", "session_id": "..."}
    {"type": "open_error", "error": {"code", "message", "details"}}
    <raw bytes>                                           # PTY stdout
    {"type": "closed", "reason": "..."}
    {"type": "error", "error": {"code", "message", "details"}}
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.ssh_bridge_service import (
    SshBridgeError,
    SshOpenRequest,
    get_ssh_bridge_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["SSH Bridge"])

_OPEN_FRAME_TIMEOUT_S = 10.0


def _build_open_request(payload: Dict[str, Any]) -> SshOpenRequest:
    try:
        return SshOpenRequest(
            host=str(payload["host"]),
            port=int(payload.get("port", 22)),
            username=str(payload.get("username", "mm")),
            auth=payload.get("auth", "publickey"),
            password=payload.get("password"),
            private_key=payload.get("private_key"),
            known_hosts=payload.get("known_hosts", "accept-new"),
            keepalive_s=float(payload.get("keepalive_s", 30.0)),
            connect_timeout_s=float(payload.get("connect_timeout_s", 10.0)),
            term_cols=int(payload.get("term_cols", 80)),
            term_rows=int(payload.get("term_rows", 24)),
            env=dict(payload.get("env") or {}),
            idle_timeout_s=float(payload.get("idle_timeout_s", 900.0)),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise SshBridgeError(
            "invalid_open_frame",
            f"Malformed open frame: {exc}",
            details={"exception_class": type(exc).__name__},
        )


async def _send_error(ws: WebSocket, kind: str, err: SshBridgeError) -> None:
    payload = {"type": kind, **err.as_envelope()}
    try:
        await ws.send_json(payload)
    except Exception:
        logger.debug("ssh_bridge send_error failed (ws likely closed)")


@router.websocket("/ws/ssh")
async def ssh_bridge_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    service = get_ssh_bridge_service()
    session = None

    # --- Wait for the initial open frame --------------------------------
    try:
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=_OPEN_FRAME_TIMEOUT_S)
    except asyncio.TimeoutError:
        await _send_error(
            websocket,
            "open_error",
            SshBridgeError("open_frame_timeout", "No open frame within 10s."),
        )
        await websocket.close()
        return
    except WebSocketDisconnect:
        return

    try:
        frame = json.loads(raw)
    except json.JSONDecodeError as exc:
        await _send_error(
            websocket,
            "open_error",
            SshBridgeError("invalid_open_frame", f"Open frame is not valid JSON: {exc}"),
        )
        await websocket.close()
        return

    if not isinstance(frame, dict) or frame.get("type") != "open":
        await _send_error(
            websocket,
            "open_error",
            SshBridgeError("invalid_open_frame", "First frame must be type=open."),
        )
        await websocket.close()
        return

    # --- Build request and open the SSH session -------------------------
    try:
        open_request = _build_open_request(frame)
    except SshBridgeError as exc:
        await _send_error(websocket, "open_error", exc)
        await websocket.close()
        return

    async def on_data(chunk: bytes) -> None:
        try:
            await websocket.send_bytes(chunk)
        except Exception:
            pass

    async def on_error(envelope: Dict[str, Any]) -> None:
        try:
            await websocket.send_json({"type": "error", **envelope})
        except Exception:
            pass

    closed_event = asyncio.Event()
    close_reason = {"reason": "client_close"}

    async def on_closed(reason: str) -> None:
        close_reason["reason"] = reason
        closed_event.set()

    try:
        session = await service.open_session(
            open_request,
            on_data=on_data,
            on_closed=on_closed,
            on_error=on_error,
        )
    except SshBridgeError as exc:
        await _send_error(websocket, "open_error", exc)
        await websocket.close()
        return
    except Exception as exc:  # defensive: unclassified failure
        await _send_error(
            websocket,
            "open_error",
            SshBridgeError("internal_error", str(exc), details={"exception_class": type(exc).__name__}),
        )
        await websocket.close()
        return

    await websocket.send_json({"type": "open_ok", "session_id": session.session_id})

    # --- Forward client frames to the session ---------------------------
    try:
        while True:
            if closed_event.is_set():
                break
            try:
                msg = await websocket.receive()
            except WebSocketDisconnect:
                break

            if msg.get("type") == "websocket.disconnect":
                break

            if "text" in msg and msg["text"] is not None:
                await _handle_text_frame(session, msg["text"], websocket)
            elif "bytes" in msg and msg["bytes"] is not None:
                # Raw binary means keystrokes passthrough
                await session.send(msg["bytes"])
    finally:
        try:
            if session is not None and session.is_open:
                await session.close("client_disconnect")
        except Exception:
            logger.exception("ssh_bridge cleanup error")
        # Final closed frame (best-effort; client may already be gone)
        try:
            await websocket.send_json({"type": "closed", "reason": close_reason["reason"]})
        except Exception:
            pass
        try:
            await websocket.close()
        except Exception:
            pass


async def _handle_text_frame(session, text: str, websocket: WebSocket) -> None:
    try:
        frame = json.loads(text)
    except json.JSONDecodeError:
        # Treat raw text as keystrokes
        await session.send(text.encode("utf-8"))
        return
    if not isinstance(frame, dict):
        await session.send(text.encode("utf-8"))
        return

    ftype = frame.get("type")
    try:
        if ftype == "data":
            data = frame.get("data", "")
            if isinstance(data, str):
                await session.send(data.encode("utf-8"))
            elif isinstance(data, (bytes, bytearray)):
                await session.send(bytes(data))
        elif ftype == "resize":
            cols = int(frame.get("cols", 80))
            rows = int(frame.get("rows", 24))
            await session.resize(cols, rows)
        elif ftype == "close":
            await session.close("client_close")
        else:
            # Unknown frame types are ignored rather than breaking the stream
            logger.debug("ssh_bridge ignoring unknown frame type=%s", ftype)
    except SshBridgeError as exc:
        await _send_error(websocket, "error", exc)
    except Exception as exc:
        await _send_error(
            websocket,
            "error",
            SshBridgeError("frame_handler_failed", str(exc)),
        )
