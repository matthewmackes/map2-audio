"""Maschine MK1 LCD rendering helpers for Audio Grid and Stats contexts."""

from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any, Literal

from app.routes.audio import get_audio_status_route
from app.routes.health import build_system_health_snapshot
from app.routes.midi_hub import get_hub_status
from app.utils.singleton import Singleton

LCD_WIDTH = 128
LCD_HEIGHT = 64

_FONT_5X7: dict[str, tuple[str, ...]] = {
    " ": ("00000", "00000", "00000", "00000", "00000", "00000", "00000"),
    "-": ("00000", "00000", "00000", "11111", "00000", "00000", "00000"),
    ".": ("00000", "00000", "00000", "00000", "00000", "01100", "01100"),
    ":": ("00000", "01100", "01100", "00000", "01100", "01100", "00000"),
    "/": ("00001", "00010", "00100", "01000", "10000", "00000", "00000"),
    ">": ("10000", "01000", "00100", "00010", "00100", "01000", "10000"),
    "+": ("00100", "00100", "00100", "11111", "00100", "00100", "00100"),
    "_": ("00000", "00000", "00000", "00000", "00000", "00000", "11111"),
    "0": ("01110", "10001", "10011", "10101", "11001", "10001", "01110"),
    "1": ("00100", "01100", "00100", "00100", "00100", "00100", "01110"),
    "2": ("01110", "10001", "00001", "00010", "00100", "01000", "11111"),
    "3": ("11110", "00001", "00001", "01110", "00001", "00001", "11110"),
    "4": ("00010", "00110", "01010", "10010", "11111", "00010", "00010"),
    "5": ("11111", "10000", "10000", "11110", "00001", "00001", "11110"),
    "6": ("01110", "10000", "10000", "11110", "10001", "10001", "01110"),
    "7": ("11111", "00001", "00010", "00100", "01000", "01000", "01000"),
    "8": ("01110", "10001", "10001", "01110", "10001", "10001", "01110"),
    "9": ("01110", "10001", "10001", "01111", "00001", "00001", "01110"),
    "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
    "B": ("11110", "10001", "10001", "11110", "10001", "10001", "11110"),
    "C": ("01110", "10001", "10000", "10000", "10000", "10001", "01110"),
    "D": ("11110", "10001", "10001", "10001", "10001", "10001", "11110"),
    "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
    "F": ("11111", "10000", "10000", "11110", "10000", "10000", "10000"),
    "G": ("01110", "10001", "10000", "10111", "10001", "10001", "01110"),
    "H": ("10001", "10001", "10001", "11111", "10001", "10001", "10001"),
    "I": ("01110", "00100", "00100", "00100", "00100", "00100", "01110"),
    "J": ("00001", "00001", "00001", "00001", "10001", "10001", "01110"),
    "K": ("10001", "10010", "10100", "11000", "10100", "10010", "10001"),
    "L": ("10000", "10000", "10000", "10000", "10000", "10000", "11111"),
    "M": ("10001", "11011", "10101", "10101", "10001", "10001", "10001"),
    "N": ("10001", "10001", "11001", "10101", "10011", "10001", "10001"),
    "O": ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
    "P": ("11110", "10001", "10001", "11110", "10000", "10000", "10000"),
    "Q": ("01110", "10001", "10001", "10001", "10101", "10010", "01101"),
    "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
    "S": ("01111", "10000", "10000", "01110", "00001", "00001", "11110"),
    "T": ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
    "U": ("10001", "10001", "10001", "10001", "10001", "10001", "01110"),
    "V": ("10001", "10001", "10001", "10001", "10001", "01010", "00100"),
    "W": ("10001", "10001", "10001", "10101", "10101", "10101", "01010"),
    "X": ("10001", "10001", "01010", "00100", "01010", "10001", "10001"),
    "Y": ("10001", "10001", "01010", "00100", "00100", "00100", "00100"),
    "Z": ("11111", "00001", "00010", "00100", "01000", "10000", "11111"),
}


def _clamp(value: int, lower: int, upper: int) -> int:
    return max(lower, min(upper, value))


def _safe_label(value: Any, fallback: str = "---", *, limit: int = 18) -> str:
    text = str(value or fallback).strip().upper()
    if not text:
        text = fallback
    return text[:limit]


class _Canvas:
    def __init__(self, width: int = LCD_WIDTH, height: int = LCD_HEIGHT) -> None:
        self.width = width
        self.height = height
        self._pixels = [[0 for _ in range(width)] for _ in range(height)]

    def set_pixel(self, x: int, y: int, value: int = 1) -> None:
        if 0 <= x < self.width and 0 <= y < self.height:
            self._pixels[y][x] = 1 if value else 0

    def invert_rect(self, x: int, y: int, width: int, height: int) -> None:
        for row in range(y, y + height):
            if not (0 <= row < self.height):
                continue
            for col in range(x, x + width):
                if 0 <= col < self.width:
                    self._pixels[row][col] = 0 if self._pixels[row][col] else 1

    def fill_rect(self, x: int, y: int, width: int, height: int, value: int = 1) -> None:
        for row in range(y, y + height):
            if not (0 <= row < self.height):
                continue
            for col in range(x, x + width):
                if 0 <= col < self.width:
                    self._pixels[row][col] = 1 if value else 0

    def draw_hline(self, x: int, y: int, width: int, value: int = 1) -> None:
        self.fill_rect(x, y, width, 1, value=value)

    def draw_text(self, text: str, x: int, y: int, *, scale: int = 1) -> None:
        cursor_x = x
        for raw_char in str(text):
            glyph = _FONT_5X7.get(raw_char.upper(), _FONT_5X7[" "])
            for row_index, row in enumerate(glyph):
                for col_index, bit in enumerate(row):
                    if bit != "1":
                        continue
                    for dy in range(scale):
                        for dx in range(scale):
                            self.set_pixel(
                                cursor_x + (col_index * scale) + dx,
                                y + (row_index * scale) + dy,
                                1,
                            )
            cursor_x += (6 * scale)

    def to_xbm_hex(self) -> str:
        packed = bytearray()
        for row in self._pixels:
            for byte_index in range(0, self.width, 8):
                byte_value = 0
                for bit_index in range(8):
                    pixel_index = byte_index + bit_index
                    if pixel_index < self.width and row[pixel_index]:
                        byte_value |= 1 << bit_index
                packed.append(byte_value)
        return packed.hex().upper()


@dataclass
class _MetricSnapshot:
    key: str
    value: float
    label: str
    source: str


class MaschineLCDRenderService(Singleton):
    def __init__(self) -> None:
        self._metric_history: dict[str, list[float]] = {}

    async def render(
        self,
        *,
        session: Any,
        maschine_service: Any,
        context: Literal["audio_grid", "stats"] = "audio_grid",
        focus_metric: str | None = None,
    ) -> dict[str, Any]:
        normalized_context = "stats" if context == "stats" else "audio_grid"
        if normalized_context == "stats":
            stats = await self._collect_stats_snapshot()
            return self._render_stats(stats=stats, focus_metric=focus_metric)
        audio_grid = await maschine_service.get_audio_grid_projection(session)
        return self._render_audio_grid(audio_grid=audio_grid)

    async def _collect_stats_snapshot(self) -> dict[str, Any]:
        payloads = {
            "health": await self._get_health_payload(),
            "audio": await self._get_audio_payload(),
            "midi_hub": await self._get_midi_payload(),
        }
        metrics = self._extract_numeric_metrics(payloads)
        snapshots = [
            _MetricSnapshot(
                key=key,
                value=value,
                label=_safe_label(key.replace(".", " "), limit=20),
                source=key.split(".", 1)[0].upper(),
            )
            for key, value in sorted(metrics.items())
        ]
        return {
            "sources": payloads,
            "metrics": [snapshot.__dict__ for snapshot in snapshots],
            "metric_count": len(snapshots),
            "updated_at": copy.deepcopy(payloads.get("health", {})).get("timestamp"),
        }

    async def _get_health_payload(self) -> dict[str, Any]:
        payload = await build_system_health_snapshot(0.0)
        return payload if isinstance(payload, dict) else {}

    async def _get_audio_payload(self) -> dict[str, Any]:
        payload = await get_audio_status_route()
        return payload if isinstance(payload, dict) else {}

    async def _get_midi_payload(self) -> dict[str, Any]:
        payload = await get_hub_status()
        return payload if isinstance(payload, dict) else {}

    def _extract_numeric_metrics(self, value: Any, prefix: str = "") -> dict[str, float]:
        metrics: dict[str, float] = {}
        if isinstance(value, dict):
            for key, nested_value in value.items():
                child_prefix = f"{prefix}.{key}" if prefix else str(key)
                metrics.update(self._extract_numeric_metrics(nested_value, child_prefix))
        elif isinstance(value, list):
            for index, nested_value in enumerate(value[:8]):
                metrics.update(self._extract_numeric_metrics(nested_value, f"{prefix}[{index}]"))
        elif isinstance(value, (int, float)) and not isinstance(value, bool):
            metrics[prefix] = float(value)
        return metrics

    def _render_audio_grid(self, *, audio_grid: dict[str, Any]) -> dict[str, Any]:
        blocks = list(audio_grid.get("blocks") or [])
        selected_id = audio_grid.get("selected_block_id")
        selected_index = next(
            (index for index, block in enumerate(blocks) if block.get("block_id") == selected_id),
            0,
        )
        selected_block = blocks[selected_index] if blocks else {}
        left = _Canvas()
        left.draw_text("AUDIO GRID", 4, 4)
        menu_items = ["AUDIO GRID", "STATS", "---", "---", "---"]
        for index, item in enumerate(menu_items):
            row_y = 14 + (index * 9)
            if index == 0:
                left.fill_rect(2, row_y - 1, 76, 8, value=1)
                left.draw_text(item, 6, row_y, scale=1)
                left.invert_rect(2, row_y - 1, 76, 8)
            else:
                left.draw_text(item, 6, row_y, scale=1)
        viewport_start = max(0, selected_index - 2)
        for row_index, block in enumerate(blocks[viewport_start: viewport_start + 3]):
            line_y = 18 + (row_index * 12)
            label = _safe_label(block.get("plugin_name") or block.get("chain_name"), limit=14)
            prefix = ">" if block.get("block_id") == selected_id else " "
            left.draw_text(f"{prefix}{label}", 82, line_y)
        left.draw_hline(0, 55, LCD_WIDTH)
        breadcrumb = f"> AUDIO GRID > {_safe_label(selected_block.get('plugin_name') or 'EMPTY', limit=12)}"
        left.draw_text(breadcrumb, 3, 57)

        right = _Canvas()
        plugin_name = _safe_label(selected_block.get("plugin_name") or "NO BLOCK", limit=16)
        right.draw_text(plugin_name, 4, 4)
        top_params = list(selected_block.get("top_parameters") or [])
        focused_param = top_params[0] if top_params else None
        param_name = _safe_label((focused_param or {}).get("param_id") or "STATE", limit=10)
        param_value = _safe_label((focused_param or {}).get("value") or ("BYPASS" if selected_block.get("bypassed") else "ACTIVE"), limit=8)
        right.draw_text(param_name, 4, 16)
        right.draw_hline(4, 28, LCD_WIDTH - 8)
        progress_units = _clamp((selected_index + 1) * 6, 4, LCD_WIDTH - 8)
        right.fill_rect(4, 31, progress_units, 4)
        right.draw_text(param_value, 8, 38, scale=3)
        right.draw_text("MIN", 4, 56)
        right.draw_text("MAX", 104, 56)

        return {
            "context": "audio_grid",
            "audio_grid": copy.deepcopy(audio_grid),
            "left": {
                "width": LCD_WIDTH,
                "height": LCD_HEIGHT,
                "format": "xbm",
                "data": left.to_xbm_hex(),
            },
            "right": {
                "width": LCD_WIDTH,
                "height": LCD_HEIGHT,
                "format": "xbm",
                "data": right.to_xbm_hex(),
            },
            "meta": {
                "menu_items": menu_items,
                "selected_block_id": selected_id,
                "selected_plugin_name": selected_block.get("plugin_name"),
            },
        }

    def _render_stats(self, *, stats: dict[str, Any], focus_metric: str | None = None) -> dict[str, Any]:
        metrics = list(stats.get("metrics") or [])
        available_keys = [str(metric.get("key")) for metric in metrics if isinstance(metric, dict)]
        selected_key = focus_metric if focus_metric in available_keys else (available_keys[0] if available_keys else None)
        selected_metric = next(
            (metric for metric in metrics if isinstance(metric, dict) and metric.get("key") == selected_key),
            {},
        )
        if selected_key:
            history = self._metric_history.setdefault(selected_key, [])
            history.append(float(selected_metric.get("value") or 0.0))
            self._metric_history[selected_key] = history[-32:]
        history = list(self._metric_history.get(selected_key or "", []))

        left = _Canvas()
        left.draw_text("STATS", 4, 4)
        visible_metrics = metrics[:5]
        for index, metric in enumerate(visible_metrics):
            if not isinstance(metric, dict):
                continue
            row_y = 14 + (index * 9)
            line = f"{'>' if metric.get('key') == selected_key else ' '} {_safe_label(metric.get('label'), limit=11)}"
            left.draw_text(line, 4, row_y)
            value_text = _safe_label(metric.get("value"), limit=8)
            left.draw_text(value_text, 76, row_y)
        left.draw_hline(0, 55, LCD_WIDTH)
        left.draw_text(f"> STATS > {_safe_label(selected_key or 'NONE', limit=12)}", 3, 57)

        right = _Canvas()
        right.draw_text(_safe_label(selected_key or "NO METRIC", limit=18), 4, 4)
        right.draw_hline(4, 14, LCD_WIDTH - 8)
        numeric_value = float(selected_metric.get("value") or 0.0)
        right.draw_text(_safe_label(f"{numeric_value:.2f}", limit=8), 8, 20, scale=3)
        if history:
            min_value = min(history)
            max_value = max(history)
            span = max(max_value - min_value, 1.0)
            for index, sample in enumerate(history[-32:]):
                normalized = (sample - min_value) / span
                bar_height = 1 + int(normalized * 20)
                x = 4 + (index * 3)
                right.fill_rect(x, 54 - bar_height, 2, bar_height)
            right.draw_text(_safe_label(f"{min_value:.1f}", limit=6), 4, 56)
            right.draw_text(_safe_label(f"{max_value:.1f}", limit=6), 92, 56)
        else:
            right.draw_text("MIN", 4, 56)
            right.draw_text("MAX", 104, 56)

        return {
            "context": "stats",
            "stats": copy.deepcopy(stats),
            "left": {
                "width": LCD_WIDTH,
                "height": LCD_HEIGHT,
                "format": "xbm",
                "data": left.to_xbm_hex(),
            },
            "right": {
                "width": LCD_WIDTH,
                "height": LCD_HEIGHT,
                "format": "xbm",
                "data": right.to_xbm_hex(),
            },
            "meta": {
                "focus_metric": selected_key,
                "history_points": len(history),
                "metric_count": len(metrics),
            },
        }


def get_maschine_lcd_render_service() -> MaschineLCDRenderService:
    return MaschineLCDRenderService.get_instance()


def reset_maschine_lcd_render_service() -> None:
    MaschineLCDRenderService.reset_instance()
