"""
SageVue deployment adapter for Tesira layout operations.

This client provides authenticated HTTP calls to a SageVue instance so MAP2 can
trigger Tesira layout deployment jobs without launching Tesira Software UI.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


@dataclass
class SageVueSettings:
    enabled: bool
    base_url: str
    api_token: str = field(repr=False)
    verify_ssl: bool
    timeout_s: float


class SageVueClient:
    """Thin async wrapper over SageVue REST endpoints used by MAP2."""

    def __init__(self, settings: SageVueSettings) -> None:
        self._settings = settings

    @property
    def enabled(self) -> bool:
        return self._settings.enabled

    @property
    def base_url(self) -> str:
        return self._settings.base_url

    @property
    def has_token(self) -> bool:
        return bool(self._settings.api_token.strip())

    @classmethod
    def from_config(cls) -> "SageVueClient":
        from app.config import get_config

        cfg = get_config()
        settings = SageVueSettings(
            enabled=bool(cfg.get("tesira.sagevue_enabled", False)),
            base_url=str(cfg.get("tesira.sagevue_base_url", "")).strip(),
            api_token=str(cfg.get("tesira.sagevue_api_token", "")).strip(),
            verify_ssl=bool(cfg.get("tesira.sagevue_verify_ssl", True)),
            timeout_s=float(cfg.get("tesira.sagevue_timeout_s", 15.0)),
        )
        return cls(settings)

    def _headers(self) -> Dict[str, str]:
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        if self._settings.api_token:
            headers["Authorization"] = f"Bearer {self._settings.api_token}"
        return headers

    def _assert_ready(self) -> None:
        if not self._settings.enabled:
            raise RuntimeError("SageVue integration is disabled (tesira.sagevue_enabled=false)")
        if not self._settings.base_url:
            raise RuntimeError("SageVue base URL is not configured")

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        self._assert_ready()

        try:
            import httpx  # type: ignore
        except Exception as exc:
            raise RuntimeError("httpx is required for SageVue integration") from exc

        url = f"{self._settings.base_url.rstrip('/')}/{path.lstrip('/')}"
        try:
            async with httpx.AsyncClient(
                timeout=self._settings.timeout_s,
                verify=self._settings.verify_ssl,
            ) as client:
                resp = await client.request(
                    method.upper(),
                    url,
                    headers=self._headers(),
                    json=json_body,
                    params=params,
                )
                resp.raise_for_status()
                data = resp.json() if resp.content else {}
                if isinstance(data, dict):
                    return data
                return {"data": data}
        except Exception as exc:
            logger.warning("SageVue request failed: %s %s (%s)", method.upper(), url, exc)
            raise RuntimeError(f"SageVue request failed: {exc}") from exc

    async def health_check(self) -> Dict[str, Any]:
        """Probe SageVue availability using its health endpoint."""
        return await self._request("GET", "/api/health")

    async def deploy_layout(
        self,
        *,
        layout_id: str,
        target_device: str,
        dry_run: bool = False,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Trigger a layout deployment job in SageVue.

        Endpoint path is intentionally configurable by deployment to tolerate
        SageVue API surface differences across versions.
        """
        from app.config import get_config

        cfg = get_config()
        deploy_path = str(cfg.get("tesira.sagevue_deploy_path", "/api/tesira/layouts/deploy")).strip()
        payload = {
            "layout_id": layout_id,
            "target_device": target_device,
            "dry_run": bool(dry_run),
            "metadata": dict(metadata or {}),
        }
        return await self._request("POST", deploy_path, json_body=payload)


_sagevue_client: Optional[SageVueClient] = None
_sagevue_client_lock = threading.Lock()


def get_sagevue_client() -> SageVueClient:
    global _sagevue_client
    if _sagevue_client is None:
        with _sagevue_client_lock:
            if _sagevue_client is None:
                _sagevue_client = SageVueClient.from_config()
    return _sagevue_client


def reset_sagevue_client() -> None:
    """Test helper: drop singleton so next getter rebuilds from config."""
    global _sagevue_client
    _sagevue_client = None
