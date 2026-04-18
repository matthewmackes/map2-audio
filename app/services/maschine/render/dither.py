"""Monochrome dithering helpers for Maschine MK1 LCD rendering."""

from __future__ import annotations

from typing import Literal


DitherAlgorithm = Literal["bayer", "blue_noise", "atkinson", "floyd_steinberg"]

_BAYER_4X4 = (
    (0, 8, 2, 10),
    (12, 4, 14, 6),
    (3, 11, 1, 9),
    (15, 7, 13, 5),
)

_BLUE_NOISE_8X8 = (
    (14, 48, 12, 60, 16, 50, 10, 58),
    (34, 2, 44, 6, 32, 0, 42, 4),
    (18, 52, 24, 56, 20, 54, 22, 62),
    (46, 30, 38, 26, 40, 28, 36, 8),
    (15, 49, 13, 61, 17, 51, 11, 59),
    (35, 3, 45, 7, 33, 1, 43, 5),
    (19, 53, 25, 57, 21, 55, 23, 63),
    (47, 31, 39, 27, 41, 29, 37, 9),
)


def _clamp8(value: float) -> int:
    return max(0, min(255, int(round(value))))


def ordered_dither(
    pixels: list[int],
    *,
    width: int,
    height: int,
    matrix: tuple[tuple[int, ...], ...],
) -> list[int]:
    rows = len(matrix)
    cols = len(matrix[0])
    scale = rows * cols
    output = [0] * len(pixels)
    for y in range(height):
        for x in range(width):
            threshold = ((matrix[y % rows][x % cols] + 0.5) / scale) * 255.0
            idx = (y * width) + x
            output[idx] = 1 if pixels[idx] >= threshold else 0
    return output


def atkinson_dither(pixels: list[int], *, width: int, height: int) -> list[int]:
    work = [float(value) for value in pixels]
    output = [0] * len(work)
    for y in range(height):
        for x in range(width):
            idx = (y * width) + x
            old = work[idx]
            new = 255.0 if old >= 128.0 else 0.0
            output[idx] = 1 if new else 0
            error = (old - new) / 8.0
            for dx, dy in ((1, 0), (2, 0), (-1, 1), (0, 1), (1, 1), (0, 2)):
                nx = x + dx
                ny = y + dy
                if 0 <= nx < width and 0 <= ny < height:
                    work[(ny * width) + nx] = _clamp8(work[(ny * width) + nx] + error)
    return output


def floyd_steinberg_dither(pixels: list[int], *, width: int, height: int) -> list[int]:
    work = [float(value) for value in pixels]
    output = [0] * len(work)
    for y in range(height):
        for x in range(width):
            idx = (y * width) + x
            old = work[idx]
            new = 255.0 if old >= 128.0 else 0.0
            output[idx] = 1 if new else 0
            error = old - new
            for dx, dy, weight in ((1, 0, 7 / 16), (-1, 1, 3 / 16), (0, 1, 5 / 16), (1, 1, 1 / 16)):
                nx = x + dx
                ny = y + dy
                if 0 <= nx < width and 0 <= ny < height:
                    work[(ny * width) + nx] = _clamp8(work[(ny * width) + nx] + (error * weight))
    return output


def dither_pixels(
    pixels: list[int],
    *,
    width: int,
    height: int,
    algorithm: DitherAlgorithm,
) -> list[int]:
    if algorithm == "blue_noise":
        return ordered_dither(pixels, width=width, height=height, matrix=_BLUE_NOISE_8X8)
    if algorithm == "atkinson":
        return atkinson_dither(pixels, width=width, height=height)
    if algorithm == "floyd_steinberg":
        return floyd_steinberg_dither(pixels, width=width, height=height)
    return ordered_dither(pixels, width=width, height=height, matrix=_BAYER_4X4)

