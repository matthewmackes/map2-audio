"""Retained-mode renderer with front/back buffer tracking."""

from __future__ import annotations

from dataclasses import dataclass

from .dither import DitherAlgorithm
from .framebuffer import DamageRect, GrayFramebuffer
from .scene import Bounds, SceneNode


@dataclass(frozen=True)
class RenderResult:
    frame: GrayFramebuffer
    damage: list[DamageRect]
    algorithm: DitherAlgorithm


class RetainedRenderer:
    def __init__(self, width: int, height: int, *, algorithm: DitherAlgorithm = "bayer") -> None:
        self.width = width
        self.height = height
        self.algorithm = algorithm
        self._front: GrayFramebuffer | None = None
        self._back = GrayFramebuffer(width, height)

    def render(self, scene: SceneNode, *, fonts: dict[str, object]) -> RenderResult:
        self._back.clear(0)
        scene.render(self._back, bounds=Bounds(0, 0, self.width, self.height), fonts=fonts)  # type: ignore[arg-type]
        current = self._back.clone()
        damage = current.diff(self._front)
        self._front = current.clone()
        return RenderResult(frame=current, damage=damage, algorithm=self.algorithm)

