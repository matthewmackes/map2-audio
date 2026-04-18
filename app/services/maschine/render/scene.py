"""Scene graph nodes for the retained-mode Maschine renderer."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from app.services.maschine.fonts import BitmapFontAtlas

from .framebuffer import GrayFramebuffer


@dataclass(frozen=True)
class Bounds:
    x: int
    y: int
    width: int
    height: int


class SceneNode:
    def render(self, frame: GrayFramebuffer, *, bounds: Bounds, fonts: dict[str, BitmapFontAtlas]) -> None:
        raise NotImplementedError


@dataclass
class RectNode(SceneNode):
    brightness: int

    def render(self, frame: GrayFramebuffer, *, bounds: Bounds, fonts: dict[str, BitmapFontAtlas]) -> None:
        frame.fill_rect(bounds.x, bounds.y, bounds.width, bounds.height, self.brightness)


@dataclass
class RuleNode(SceneNode):
    brightness: int

    def render(self, frame: GrayFramebuffer, *, bounds: Bounds, fonts: dict[str, BitmapFontAtlas]) -> None:
        frame.draw_hline(bounds.x, bounds.y, bounds.width, self.brightness)


@dataclass
class TextNode(SceneNode):
    text: str
    font: str = "spleen"
    brightness: int = 31
    align: Literal["left", "center", "right"] = "left"
    invert_background: bool = False

    def render(self, frame: GrayFramebuffer, *, bounds: Bounds, fonts: dict[str, BitmapFontAtlas]) -> None:
        atlas = fonts[self.font]
        text_width = atlas.text_width(self.text)
        if self.align == "center":
            cursor_x = bounds.x + max(0, (bounds.width - text_width) // 2)
        elif self.align == "right":
            cursor_x = bounds.x + max(0, bounds.width - text_width)
        else:
            cursor_x = bounds.x
        if self.invert_background:
            frame.fill_rect(bounds.x, bounds.y, bounds.width, bounds.height, self.brightness)
            brightness = 0
        else:
            brightness = self.brightness
        cursor_y = bounds.y + max(0, (bounds.height - atlas.pixel_height) // 2)
        for char in self.text:
            frame.blit_glyph(atlas.glyph(char), x=cursor_x, y=cursor_y, brightness=brightness)
            cursor_x += atlas.pixel_width + atlas.tracking


@dataclass
class ProgressNode(SceneNode):
    ratio: float
    fill_brightness: int = 31
    track_brightness: int = 6

    def render(self, frame: GrayFramebuffer, *, bounds: Bounds, fonts: dict[str, BitmapFontAtlas]) -> None:
        frame.fill_rect(bounds.x, bounds.y, bounds.width, bounds.height, self.track_brightness)
        fill_width = max(0, min(bounds.width, int(bounds.width * max(0.0, min(1.0, self.ratio)))))
        frame.fill_rect(bounds.x, bounds.y, fill_width, bounds.height, self.fill_brightness)


@dataclass
class FlexNode(SceneNode):
    direction: Literal["row", "column"]
    children: list[SceneNode] = field(default_factory=list)
    gap: int = 0
    padding: int = 0
    background: int | None = None
    child_flex: list[int] | None = None

    def render(self, frame: GrayFramebuffer, *, bounds: Bounds, fonts: dict[str, BitmapFontAtlas]) -> None:
        if self.background is not None:
            frame.fill_rect(bounds.x, bounds.y, bounds.width, bounds.height, self.background)
        inner = Bounds(
            x=bounds.x + self.padding,
            y=bounds.y + self.padding,
            width=max(0, bounds.width - (self.padding * 2)),
            height=max(0, bounds.height - (self.padding * 2)),
        )
        if not self.children:
            return
        flex = list(self.child_flex or [1] * len(self.children))
        total_units = max(1, sum(max(1, unit) for unit in flex))
        available = inner.width if self.direction == "row" else inner.height
        available -= self.gap * (len(self.children) - 1)
        cursor_x = inner.x
        cursor_y = inner.y
        remainder = available
        units_left = total_units
        for index, child in enumerate(self.children):
            unit = max(1, flex[index] if index < len(flex) else 1)
            if index == len(self.children) - 1:
                primary = max(0, remainder)
            else:
                primary = max(0, int(round((available * unit) / total_units)))
            if self.direction == "row":
                child_bounds = Bounds(cursor_x, inner.y, primary, inner.height)
                cursor_x += primary + self.gap
            else:
                child_bounds = Bounds(inner.x, cursor_y, inner.width, primary)
                cursor_y += primary + self.gap
            child.render(frame, bounds=child_bounds, fonts=fonts)
            remainder -= primary
            units_left -= unit

