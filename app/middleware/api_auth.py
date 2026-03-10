from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from typing import Optional
from urllib.parse import parse_qs

from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger(__name__)

ROLE_ORDER = {"operator": 1, "admin": 2, "cluster": 3}
PUBLIC_EXACT_PATHS = {
    "/",
    "/docs",
    "/openapi.json",
    "/manifest.json",
    "/favicon.ico",
    "/vite.svg",
    "/api/health",
    "/api/ready",
    "/api/version",
}
PUBLIC_PREFIXES = (
    "/assets/",
    "/css/",
    "/img/",
    "/var/",
    "/api/auth/",
)
CLUSTER_PREFIXES = (
    "/api/cluster",
    "/api/raft",
    "/api/config",
    "/api/flow_failover",
    "/api/deployment",
    "/api/ssh_trust",
)
MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


@dataclass(frozen=True)
class AuthSettings:
    mode: str
    operator_token: str
    admin_token: str
    cluster_token: str

    @classmethod
    def from_env(cls) -> "AuthSettings":
        return cls(
            mode=os.getenv("MAP2_API_AUTH_MODE", "disabled").strip().lower() or "disabled",
            operator_token=os.getenv("MAP2_API_OPERATOR_TOKEN", "").strip(),
            admin_token=os.getenv("MAP2_API_ADMIN_TOKEN", "").strip(),
            cluster_token=os.getenv("MAP2_API_CLUSTER_TOKEN", "").strip(),
        )

    def role_for_token(self, token: str | None) -> str | None:
        if not token:
            return None
        if self.cluster_token and token == self.cluster_token:
            return "cluster"
        if self.admin_token and token == self.admin_token:
            return "admin"
        if self.operator_token and token == self.operator_token:
            return "operator"
        return None


def is_public_path(path: str) -> bool:
    if path in PUBLIC_EXACT_PATHS:
        return True
    return any(path.startswith(prefix) for prefix in PUBLIC_PREFIXES)


def required_role_for_scope(scope_type: str, method: str | None, path: str) -> str | None:
    if is_public_path(path):
        return None
    if any(path.startswith(prefix) for prefix in CLUSTER_PREFIXES):
        return "cluster"
    if scope_type == "websocket":
        return "operator"
    if (method or "GET").upper() in MUTATING_METHODS:
        return "admin"
    return "operator"


def extract_token(scope: Scope) -> str | None:
    headers = {key.decode("latin1").lower(): value.decode("latin1") for key, value in scope.get("headers", [])}
    auth_header = headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        if token:
            return token
    api_key = headers.get("x-map2-api-key", "").strip()
    if api_key:
        return api_key
    query_string = scope.get("query_string", b"")
    if query_string:
        query = parse_qs(query_string.decode("latin1"))
        for key in ("token", "api_key"):
            values = query.get(key)
            if values and values[0].strip():
                return values[0].strip()
    return None


def role_satisfies(granted: str | None, required: str | None) -> bool:
    if required is None:
        return True
    if granted is None:
        return False
    return ROLE_ORDER[granted] >= ROLE_ORDER[required]


class APIAuthMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in {"http", "websocket"}:
            await self.app(scope, receive, send)
            return

        settings = AuthSettings.from_env()
        if settings.mode == "disabled":
            await self.app(scope, receive, send)
            return

        required_role = required_role_for_scope(scope["type"], scope.get("method"), scope.get("path", ""))
        if required_role is None:
            await self.app(scope, receive, send)
            return

        token = extract_token(scope)
        granted_role = settings.role_for_token(token)
        if role_satisfies(granted_role, required_role):
            scope.setdefault("state", {})["map2_role"] = granted_role
            await self.app(scope, receive, send)
            return

        error_code = "auth_required" if granted_role is None else "insufficient_role"
        message = "Authentication required" if granted_role is None else "Insufficient role for requested operation"
        details = {"required_role": required_role, "mode": settings.mode}
        if scope["type"] == "websocket":
            await send({"type": "websocket.close", "code": 4403 if granted_role else 4401})
            return

        status_code = 401 if granted_role is None else 403
        body = json.dumps({"error": {"code": error_code, "message": message, "details": details}}).encode("utf-8")
        headers = [(b"content-type", b"application/json")]
        await send({"type": "http.response.start", "status": status_code, "headers": headers})
        await send({"type": "http.response.body", "body": body})
