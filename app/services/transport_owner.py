"""Abstract transport-owner contract for Maschine and future sequencers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class TransportOwner(ABC):
    name: str

    @abstractmethod
    async def play(self) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    async def stop(self) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    async def record(self) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    async def restart(self) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    async def erase(self) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def get_state(self) -> dict[str, Any]:
        raise NotImplementedError
