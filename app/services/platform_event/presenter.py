from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from typing import Any

from .envelope import PlatformEvent


@dataclass(frozen=True)
class SurfaceAction:
    surface: str
    action_type: str
    event_id: str
    payload: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class Presenter(ABC):
    surface: str

    @abstractmethod
    def wants(self, event: PlatformEvent) -> bool:
        raise NotImplementedError

    @abstractmethod
    def present(self, event: PlatformEvent) -> SurfaceAction | None:
        raise NotImplementedError

    def on_dismiss(self, event_id: str) -> SurfaceAction | None:
        return None

    def tick(self, now: float) -> list[SurfaceAction]:
        return []


__all__ = ["Presenter", "SurfaceAction"]

