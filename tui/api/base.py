"""Shared HTTP transport for the unified TUI API domains."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx


@dataclass(slots=True)
class APIResult:
    """Normalized API result used across domain clients."""

    success: bool
    data: Any = None
    error: str | None = None
    status_code: int | None = None


class APITransport:
    """HTTP transport with lazy client creation and consistent error handling."""

    def __init__(self, base_url: str = "http://localhost:8080", timeout: float = 10.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

    async def _ensure_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout,
                limits=httpx.Limits(
                    max_connections=10,
                    max_keepalive_connections=5,
                    keepalive_expiry=30.0,
                ),
            )
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def request(self, method: str, endpoint: str, **kwargs: Any) -> APIResult:
        client = await self._ensure_client()
        try:
            response = await client.request(method, endpoint, **kwargs)
            status_code = response.status_code
            if 200 <= status_code < 300:
                try:
                    return APIResult(True, response.json(), status_code=status_code)
                except ValueError:
                    return APIResult(True, response.text, status_code=status_code)
            return APIResult(
                False,
                error=f"HTTP {status_code}: {response.text[:200]}",
                status_code=status_code,
            )
        except httpx.TimeoutException:
            return APIResult(False, error="Request timed out")
        except httpx.ConnectError:
            return APIResult(False, error="Cannot connect to backend")
        except Exception as exc:
            return APIResult(False, error=f"Unexpected error: {exc}")

    async def get(self, endpoint: str, **kwargs: Any) -> APIResult:
        return await self.request("GET", endpoint, **kwargs)

    async def post(self, endpoint: str, **kwargs: Any) -> APIResult:
        return await self.request("POST", endpoint, **kwargs)

    async def put(self, endpoint: str, **kwargs: Any) -> APIResult:
        return await self.request("PUT", endpoint, **kwargs)

    async def delete(self, endpoint: str, **kwargs: Any) -> APIResult:
        return await self.request("DELETE", endpoint, **kwargs)


class DomainClient:
    """Base class for domain clients."""

    def __init__(self, transport: APITransport) -> None:
        self.transport = transport
