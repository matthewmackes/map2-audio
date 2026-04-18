"""Retained-mode grayscale framebuffer and damage tracking."""

from __future__ import annotations

from dataclasses import dataclass

from app.services.maschine.mk1_protocol import DISPLAY_PIXEL_MAX, FrameBuffer

from .dither import DitherAlgorithm, dither_pixels


@dataclass(frozen=True)
class DamageRect:
    x: int
    y: int
    width: int
    height: int


class GrayFramebuffer:
    def __init__(self, width: int, height: int, *, fill: int = 0) -> None:
        self.width = width
        self.height = height
        self._pixels = [max(0, min(DISPLAY_PIXEL_MAX, int(fill))) for _ in range(width * height)]

    def clone(self) -> "GrayFramebuffer":
        frame = GrayFramebuffer(self.width, self.height)
        frame._pixels = list(self._pixels)
        return frame

    def clear(self, value: int = 0) -> None:
        value = max(0, min(DISPLAY_PIXEL_MAX, int(value)))
        self._pixels[:] = [value] * len(self._pixels)

    def _index(self, x: int, y: int) -> int:
        return (y * self.width) + x

    def get_pixel(self, x: int, y: int) -> int:
        if not (0 <= x < self.width and 0 <= y < self.height):
            return 0
        return self._pixels[self._index(x, y)]

    def set_pixel(self, x: int, y: int, value: int) -> None:
        if not (0 <= x < self.width and 0 <= y < self.height):
            return
        self._pixels[self._index(x, y)] = max(0, min(DISPLAY_PIXEL_MAX, int(value)))

    def fill_rect(self, x: int, y: int, width: int, height: int, value: int) -> None:
        for row in range(y, y + height):
            if not (0 <= row < self.height):
                continue
            for col in range(x, x + width):
                if 0 <= col < self.width:
                    self.set_pixel(col, row, value)

    def draw_hline(self, x: int, y: int, width: int, value: int) -> None:
        self.fill_rect(x, y, width, 1, value)

    def invert_rect(self, x: int, y: int, width: int, height: int) -> None:
        for row in range(y, y + height):
            if not (0 <= row < self.height):
                continue
            for col in range(x, x + width):
                if 0 <= col < self.width:
                    current = self.get_pixel(col, row)
                    self.set_pixel(col, row, DISPLAY_PIXEL_MAX - current)

    def blit_glyph(self, glyph_rows: tuple[str, ...], *, x: int, y: int, brightness: int) -> None:
        for row_index, row in enumerate(glyph_rows):
            for col_index, bit in enumerate(row):
                if bit == "1":
                    self.set_pixel(x + col_index, y + row_index, brightness)

    def diff(self, previous: "GrayFramebuffer | None", *, tile_size: int = 8) -> list[DamageRect]:
        if previous is None or previous.width != self.width or previous.height != self.height:
            return [DamageRect(0, 0, self.width, self.height)]
        rects: list[DamageRect] = []
        for y in range(0, self.height, tile_size):
            for x in range(0, self.width, tile_size):
                changed = False
                for row in range(y, min(y + tile_size, self.height)):
                    start = (row * self.width) + x
                    end = min(start + tile_size, (row * self.width) + self.width)
                    if self._pixels[start:end] != previous._pixels[start:end]:
                        changed = True
                        break
                if changed:
                    rects.append(DamageRect(x=x, y=y, width=min(tile_size, self.width - x), height=min(tile_size, self.height - y)))
        return rects

    def to_xbm_hex(self, *, algorithm: DitherAlgorithm = "bayer") -> str:
        pixels_8bit = [int((value / DISPLAY_PIXEL_MAX) * 255.0) for value in self._pixels]
        mono = dither_pixels(pixels_8bit, width=self.width, height=self.height, algorithm=algorithm)
        packed = bytearray()
        bytes_per_row = (self.width + 7) // 8
        for y in range(self.height):
            row_start = y * self.width
            for x_byte in range(bytes_per_row):
                value = 0
                for bit in range(8):
                    x = (x_byte * 8) + bit
                    if x < self.width and mono[row_start + x]:
                        value |= 1 << bit
                packed.append(value)
        return packed.hex().upper()

    def to_mk1_framebuffer(self) -> bytes:
        fb = FrameBuffer()
        fb.fill_black()
        for y in range(self.height):
            for x in range(self.width):
                fb.set_pixel(x, y, self.get_pixel(x, y))
        return fb.buffer()

