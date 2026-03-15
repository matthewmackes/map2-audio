"""Domain-based API surface for the unified TUI."""

from __future__ import annotations

from .audio import AudioAPI
from .base import APIResult, APITransport
from .chains import ChainsAPI
from .cluster import ClusterAPI
from .midi import MidiAPI
from .plugins import PluginsAPI
from .system import SystemAPI


class MAP2APIClient:
    """Compatibility facade over the new domain-specific API clients."""

    def __init__(self, base_url: str = "http://localhost:8080", timeout: float = 10.0) -> None:
        self.transport = APITransport(base_url=base_url, timeout=timeout)
        self.audio = AudioAPI(self.transport)
        self.chains = ChainsAPI(self.transport)
        self.midi = MidiAPI(self.transport)
        self.cluster = ClusterAPI(self.transport)
        self.plugins = PluginsAPI(self.transport)
        self.system = SystemAPI(self.transport)
        self._domains = (
            self.audio,
            self.chains,
            self.midi,
            self.cluster,
            self.plugins,
            self.system,
        )

    @property
    def base_url(self) -> str:
        return self.transport.base_url

    @property
    def timeout(self) -> float:
        return self.transport.timeout

    async def __aenter__(self) -> "MAP2APIClient":
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        await self.close()

    async def close(self) -> None:
        await self.transport.close()

    async def get(self, endpoint: str, **kwargs):
        result = await self.transport.get(endpoint, **kwargs)
        return result.data if result.success else None

    async def post(self, endpoint: str, **kwargs):
        result = await self.transport.post(endpoint, **kwargs)
        return result.data if result.success else None

    def __getattr__(self, name: str):
        for domain in self._domains:
            if hasattr(domain, name):
                return getattr(domain, name)
        raise AttributeError(name)


api_client: MAP2APIClient | None = None


def get_api_client() -> MAP2APIClient:
    global api_client
    if api_client is None:
        api_client = MAP2APIClient()
    return api_client


__all__ = [
    "APIResult",
    "APITransport",
    "AudioAPI",
    "ChainsAPI",
    "ClusterAPI",
    "MAP2APIClient",
    "MidiAPI",
    "PluginsAPI",
    "SystemAPI",
    "get_api_client",
]
