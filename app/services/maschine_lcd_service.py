"""Maschine MK1 LCD rendering helpers and profile runtime."""

from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any, Literal

from app.config import get_config as get_runtime_config_manager
from app.routes.automation import get_full_status as get_automation_status_route
from app.routes.audio import get_audio_status_route
from app.routes.health import build_system_health_snapshot
from app.routes.midi_hub import get_hub_status
from app.services.drum_machine_service import get_drum_machine_service
from app.services.drum_sample_editor import get_drum_sample_editor_service
from app.services.drum_sequencer_service import get_drum_sequencer_service
from app.services.drum_kit_service import get_drum_kit_service
from app.services.maschine.admin_console import get_maschine_admin_console_service
from app.services.maschine.fonts import build_default_font_roster
from app.services.maschine.incident_log import get_maschine_incident_log_service
from app.services.maschine.profiles import MaschineProfileRuntime, PROFILE_ALIASES
from app.services.maschine.render import GrayFramebuffer
from app.services.maschine.render.framebuffer import DamageRect
from app.services.midi_hub.clock_engine import get_midi_clock_engine
from app.services.performance_brain_service import get_performance_brain_service
from app.services.snapshot_service import SnapshotService
from app.services.snapshot_tempo_service import get_snapshot_tempo_service
from app.services.transport_service import get_transport_service
from app.services.juce_engine_service import get_audio_engine
from app.services.midi_hub.macros import get_midi_macro_service
from app.services.midi_hub.recorder import get_midi_recorder
from app.services.midi_learn import midi_learn_manager
from app.deployment.deployment import get_deployment_config
from app.utils.singleton import Singleton

LCD_WIDTH = 255
LCD_HEIGHT = 64
_HELP_ROWS = [
    {"display": "SHIFT+NAV OPEN MENU", "is_selected": True},
    {"display": "NOTE REPEAT = ENTER", "is_selected": False},
    {"display": "CONTROL = BACK", "is_selected": False},
    {"display": "PADS = SELECT BLOCK", "is_selected": False},
]
_REFERENCE_ROWS = [
    {"display": "NAV + TURN = PROFILE", "is_selected": True},
    {"display": "SHIFT+PAD = ALT MODE", "is_selected": False},
    {"display": "ERASE = CLEAR/STOP", "is_selected": False},
    {"display": "PLAY/REC = TRANSPORT", "is_selected": False},
]


def _clamp(value: int, lower: int, upper: int) -> int:
    return max(lower, min(upper, value))


def _safe_label(value: Any, fallback: str = "---", *, limit: int = 18) -> str:
    text = str(value or fallback).strip().upper()
    if not text:
        text = fallback
    return text[:limit]


def _short_timestamp(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return "LIVE"
    if "T" in text:
        text = text.split("T", 1)[1]
    return text.replace("Z", "")[:8] or "LIVE"


def _bool_label(value: Any, *, truthy: str = "ON", falsy: str = "OFF") -> str:
    return truthy if bool(value) else falsy


class _Canvas:
    """Compatibility canvas used by daemon reconnect/menu helper bitmaps."""

    def __init__(self, width: int = LCD_WIDTH, height: int = LCD_HEIGHT) -> None:
        self.width = width
        self.height = height
        self._frame = GrayFramebuffer(width, height)
        self._fonts = build_default_font_roster()

    def set_pixel(self, x: int, y: int, value: int = 31) -> None:
        self._frame.set_pixel(x, y, 31 if value else 0)

    def invert_rect(self, x: int, y: int, width: int, height: int) -> None:
        self._frame.invert_rect(x, y, width, height)

    def fill_rect(self, x: int, y: int, width: int, height: int, value: int = 31) -> None:
        self._frame.fill_rect(x, y, width, height, 31 if value else 0)

    def draw_hline(self, x: int, y: int, width: int, value: int = 31) -> None:
        self._frame.draw_hline(x, y, width, 31 if value else 0)

    def draw_text(self, text: str, x: int, y: int, *, scale: int = 1) -> None:
        font_key = "spleen" if scale <= 1 else ("tamsyn" if scale == 2 else "map2_display_32")
        atlas = self._fonts[font_key]
        cursor_x = x
        for char in str(text):
            self._frame.blit_glyph(atlas.glyph(char), x=cursor_x, y=y, brightness=31)
            cursor_x += atlas.pixel_width + atlas.tracking

    def to_xbm_hex(self) -> str:
        return self._frame.to_xbm_hex()

    def to_mk1_framebuffer(self) -> bytes:
        return self._frame.to_mk1_framebuffer()


def _canvas_panel(canvas: "_Canvas") -> dict[str, Any]:
    return {
        "width": LCD_WIDTH,
        "height": LCD_HEIGHT,
        "format": "xbm",
        "data": canvas.to_xbm_hex(),
        "framebuffer": canvas.to_mk1_framebuffer().hex(),
        "damage": [DamageRect(0, 0, LCD_WIDTH, LCD_HEIGHT).__dict__],
    }


@dataclass
class _MetricSnapshot:
    key: str
    value: float
    label: str
    source: str


class MaschineLCDRenderService(Singleton):
    def __init__(self) -> None:
        self._metric_history: dict[str, list[float]] = {}
        self._profile_runtime = MaschineProfileRuntime()

    def menu_items(self) -> list[dict[str, Any]]:
        return self._profile_runtime.menu_items()

    async def render(
        self,
        *,
        session: Any,
        maschine_service: Any,
        context: Literal["audio_grid", "stats"] | str = "audio_grid",
        focus_metric: str | None = None,
        profile_id: str | None = None,
    ) -> dict[str, Any]:
        normalized_profile = PROFILE_ALIASES.get(str(profile_id or context or "t1_ctrl"), str(profile_id or context or "t1_ctrl"))
        stats = await self._collect_stats_snapshot()
        audio_grid = await maschine_service.get_audio_grid_projection(session)
        status = maschine_service.get_status() if hasattr(maschine_service, "get_status") else {}
        snapshot_state = await self._collect_snapshot_state(session)
        automation_status = await self._get_automation_payload()
        transport_state = self._collect_transport_state()
        step_state = self._collect_step_state()
        browser_state = self._collect_browser_state()
        brain_morph_state = await self._collect_brain_morph_state(snapshot_state)
        tool_state = await self._collect_tool_state(status=status, stats=stats)
        state = self._build_profile_state(
            audio_grid=audio_grid,
            stats=stats,
            status=status,
            focus_metric=focus_metric,
            snapshot_state=snapshot_state,
            automation_status=automation_status,
            transport_state=transport_state,
            step_state=step_state,
            browser_state=browser_state,
            brain_morph_state=brain_morph_state,
            tool_state=tool_state,
        )
        rendered = self._profile_runtime.render(state, profile_id=normalized_profile, context=context)
        meta = dict(rendered.meta)
        if str(context) == "stats":
            meta.update(
                {
                    "focus_metric": state.get("focus_metric_key"),
                    "history_points": len(self._metric_history.get(str(state.get("focus_metric_key") or ""), [])),
                    "metric_count": int(stats.get("metric_count") or len(stats.get("metrics") or [])),
                }
            )
        else:
            meta.update(
                {
                    "selected_block_id": audio_grid.get("selected_block_id"),
                    "selected_plugin_name": state.get("selected_plugin_name"),
                }
            )
        return {
            "context": str(context),
            "profile_id": rendered.profile_id,
            "profile_name": rendered.profile_name,
            "description": rendered.description,
            "audio_grid": copy.deepcopy(audio_grid),
            "stats": copy.deepcopy(stats),
            "left": rendered.left,
            "right": rendered.right,
            "meta": meta,
        }

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
        try:
            payload = await build_system_health_snapshot(0.0)
            return payload if isinstance(payload, dict) else {}
        except Exception:
            return {}

    async def _get_audio_payload(self) -> dict[str, Any]:
        try:
            payload = await get_audio_status_route()
            return payload if isinstance(payload, dict) else {}
        except Exception:
            return {}

    async def _get_midi_payload(self) -> dict[str, Any]:
        try:
            payload = await get_hub_status()
            return payload if isinstance(payload, dict) else {}
        except Exception:
            return {}

    async def _get_automation_payload(self) -> dict[str, Any]:
        try:
            payload = await get_automation_status_route()
            return payload if isinstance(payload, dict) else {}
        except Exception:
            return {}

    async def _collect_snapshot_state(self, session: Any) -> dict[str, Any]:
        try:
            service = SnapshotService(session)
            live_snapshot = await service.get_control_plane_snapshot()
            recent_snapshots = await service.list_snapshots(limit=4, offset=0)
        except Exception:
            live_snapshot = None
            recent_snapshots = []
        live_snapshot = dict(live_snapshot or {})
        snapshot_id = live_snapshot.get("id")
        stored_tempo = live_snapshot.get("tempo_bpm") or 120.0
        try:
            tempo = get_snapshot_tempo_service().get_status(
                snapshot_id=int(snapshot_id) if snapshot_id is not None else None,
                stored_tempo_bpm=stored_tempo,
                is_active=snapshot_id is not None,
            )
        except Exception:
            tempo = {
                "snapshot_id": snapshot_id,
                "stored_tempo_bpm": float(stored_tempo or 120.0),
                "active_tempo_bpm": float(stored_tempo or 120.0),
                "tempo_source": "stored",
                "tap_count": 0,
            }
        try:
            clock = get_midi_clock_engine().status()
        except Exception:
            clock = {}
        return {
            "live": live_snapshot,
            "recent": [dict(snapshot) for snapshot in recent_snapshots if isinstance(snapshot, dict)],
            "tempo": dict(tempo or {}),
            "clock": dict(clock or {}),
        }

    def _collect_transport_state(self) -> dict[str, Any]:
        try:
            return get_transport_service().get_state()
        except Exception:
            return {}

    def _collect_step_state(self) -> dict[str, Any]:
        try:
            transport = get_drum_machine_service().get_transport()
        except Exception:
            transport = {}
        pattern_id = int(transport.get("pattern") or 0)
        try:
            pattern = get_drum_sequencer_service().get_pattern(pattern_id)
        except Exception:
            pattern = {}
        return {
            "transport": dict(transport or {}),
            "pattern": dict(pattern or {}),
        }

    def _collect_browser_state(self) -> dict[str, Any]:
        try:
            library = get_performance_brain_service().get_library()
        except Exception:
            library = {}
        try:
            sample_editor = get_performance_brain_service().get_sample_editor()
        except Exception:
            sample_editor = {}
        try:
            kits = get_drum_kit_service().list_kits()
        except Exception:
            kits = []
        try:
            active_kit = get_drum_kit_service().get_active_kit()
        except Exception:
            active_kit = None
        sample_waveform = None
        slot_id = int((sample_editor or {}).get("slot_id") or 0)
        try:
            sample_waveform = get_drum_sample_editor_service().get_waveform(slot_id, points=64)
        except Exception:
            sample_waveform = None
        return {
            "library": dict(library or {}),
            "sample_editor": dict(sample_editor or {}),
            "kits": [dict(kit) for kit in kits if isinstance(kit, dict)],
            "active_kit": dict(active_kit or {}) if isinstance(active_kit, dict) else {},
            "sample_waveform": dict(sample_waveform or {}) if isinstance(sample_waveform, dict) else {},
        }

    async def _collect_brain_morph_state(self, snapshot_state: dict[str, Any]) -> dict[str, Any]:
        brain_service = get_performance_brain_service()
        try:
            brain_state = brain_service.get_state()
        except Exception:
            brain_state = {}
        try:
            brain_transport = brain_service.get_transport()
        except Exception:
            brain_transport = {}
        try:
            brain_sequence = brain_service.get_sequence()
        except Exception:
            brain_sequence = {}
        try:
            brain_diagnostics = brain_service.get_diagnostics()
        except Exception:
            brain_diagnostics = {}
        try:
            engine = get_audio_engine()
            morph_state = await engine.get_morph_state() if engine is not None else {}
        except Exception:
            morph_state = {}
        live_snapshot = dict(snapshot_state.get("live") or {})
        routing = dict(live_snapshot.get("routing") or {})
        return {
            "brain_state": dict(brain_state or {}),
            "brain_transport": dict(brain_transport or {}),
            "brain_sequence": dict(brain_sequence or {}),
            "brain_diagnostics": dict(brain_diagnostics or {}),
            "morph_routing": routing,
            "morph_engine": dict(morph_state or {}),
        }

    async def _collect_tool_state(self, *, status: dict[str, Any], stats: dict[str, Any]) -> dict[str, Any]:
        try:
            engine = get_audio_engine()
            engine_midi_learn = await engine.get_midi_learn_status() if engine is not None else {}
        except Exception:
            engine_midi_learn = {}
        try:
            drum_midi_learn = get_drum_machine_service().get_midi_learn_state()
        except Exception:
            drum_midi_learn = {}
        try:
            macros = get_midi_macro_service().list_macros()
        except Exception:
            macros = []
        try:
            sessions = get_midi_recorder().list_sessions()
        except Exception:
            sessions = []
        try:
            deployment_mode = get_deployment_config().mode.value
        except Exception:
            deployment_mode = "UNKNOWN"
        try:
            admin_console = get_maschine_admin_console_service().snapshot()
        except Exception:
            admin_console = {}
        return {
            "tuner_available": False,
            "engine_midi_learn": dict(engine_midi_learn or {}),
            "drum_midi_learn": dict(drum_midi_learn or {}),
            "macros": [dict(item) for item in macros if isinstance(item, dict)],
            "sessions": [dict(item) for item in sessions if isinstance(item, dict)],
            "deployment_mode": str(deployment_mode or "UNKNOWN"),
            "session_unlocked": bool(admin_console.get("session_unlocked")),
            "admin_console": dict(admin_console or {}),
            "daemon_status": dict(status or {}),
            "health": dict((stats.get("sources") or {}).get("health") or {}),
        }

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

    def _build_profile_state(
        self,
        *,
        audio_grid: dict[str, Any],
        stats: dict[str, Any],
        status: dict[str, Any],
        focus_metric: str | None,
        snapshot_state: dict[str, Any],
        automation_status: dict[str, Any],
        transport_state: dict[str, Any],
        step_state: dict[str, Any],
        browser_state: dict[str, Any],
        brain_morph_state: dict[str, Any],
        tool_state: dict[str, Any],
    ) -> dict[str, Any]:
        blocks = list(audio_grid.get("blocks") or [])
        selected_block_id = audio_grid.get("selected_block_id")
        selected_index = next(
            (index for index, block in enumerate(blocks) if block.get("block_id") == selected_block_id),
            0,
        )
        selected_block = dict(blocks[selected_index]) if blocks and selected_index < len(blocks) else {}
        selected_param = dict((selected_block.get("top_parameters") or [{}])[0] or {})
        block_rows = []
        for index, block in enumerate(blocks[:8]):
            block_rows.append(
                {
                    "display": f"{'>' if block.get('block_id') == selected_block_id else ' '} {_safe_label(block.get('plugin_name') or block.get('chain_name') or f'BLOCK {index + 1}', limit=16)}",
                    "is_selected": block.get("block_id") == selected_block_id,
                }
            )
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
        metric_rows = []
        for metric in metrics[:8]:
            if not isinstance(metric, dict):
                continue
            metric_rows.append(
                {
                    "display": f"{'>' if metric.get('key') == selected_key else ' '} {_safe_label(metric.get('label'), limit=12)} {_safe_label(metric.get('value'), limit=6)}",
                    "is_selected": metric.get("key") == selected_key,
                }
            )
        metric_min = min(history) if history else float(selected_metric.get("value") or 0.0)
        metric_max = max(history) if history else float(selected_metric.get("value") or 1.0)
        span = max(metric_max - metric_min, 1.0)
        normalized = (float(selected_metric.get("value") or 0.0) - metric_min) / span
        updated_at = str(stats.get("updated_at") or "")[-8:] if stats.get("updated_at") else "LIVE"
        health_payload = dict((stats.get("sources") or {}).get("health") or {})
        audio_payload = dict((stats.get("sources") or {}).get("audio") or {})
        midi_payload = dict((stats.get("sources") or {}).get("midi_hub") or {})
        transport_config = self._get_transport_preferences()
        incident_entries = self._load_incident_entries(limit=8)
        selected_incident = dict(incident_entries[0] if incident_entries else {})
        health_rows = self._build_health_rows(health_payload)
        diagnostics_rows = self._build_diagnostics_rows(
            health_payload=health_payload,
            audio_payload=audio_payload,
            midi_payload=midi_payload,
            daemon_status=status,
            audio_grid=audio_grid,
        )
        preference_rows = self._build_preference_rows(transport_config, status=status)
        incident_rows = self._build_incident_rows(incident_entries)
        system_status = _safe_label(health_payload.get("overall_status") or health_payload.get("status") or "unknown", limit=10)
        issue_count = len(list(health_payload.get("issues") or []))
        live_snapshot = dict(snapshot_state.get("live") or {})
        recent_snapshots = list(snapshot_state.get("recent") or [])
        tempo_status = dict(snapshot_state.get("tempo") or {})
        clock_status = dict(snapshot_state.get("clock") or {})
        snapshot_rows = self._build_snapshot_rows(live_snapshot, recent_snapshots)
        automation_rows = self._build_automation_rows(automation_status)
        metronome_rows = self._build_metronome_rows(tempo_status, clock_status, transport_state)
        step_rows = self._build_step_rows(step_state)
        browser_rows, browser_detail = self._build_browser_rows(browser_state)
        sample_rows, sample_detail = self._build_sample_rows(browser_state)
        kit_rows, kit_detail = self._build_kit_rows(browser_state)
        brain_left_rows, brain_left_detail = self._build_brain_bank_rows(brain_morph_state, bank="left")
        brain_right_rows, brain_right_detail = self._build_brain_bank_rows(brain_morph_state, bank="right")
        brain_sequence_rows, brain_sequence_detail = self._build_brain_sequence_rows(brain_morph_state)
        morph_rows, morph_detail = self._build_morph_rows(brain_morph_state)
        tuner_rows, tuner_detail = self._build_tuner_rows(tool_state, selected_plugin_name=_safe_label(selected_block.get("plugin_name") or "NO BLOCK", limit=18))
        midi_learn_rows, midi_learn_detail = self._build_midi_learn_rows(tool_state)
        macro_rows, macro_detail = self._build_macro_rows(tool_state)
        admin_rows, admin_detail = self._build_admin_rows(tool_state)
        transport_owner = _safe_label(transport_state.get("active_owner") or "none", limit=18)
        active_tempo = float(tempo_status.get("active_tempo_bpm") or live_snapshot.get("tempo_bpm") or 120.0)
        snapshot_id_value = live_snapshot.get("id")
        snapshot_id_label = f"SNAP {int(snapshot_id_value)}" if isinstance(snapshot_id_value, int) else "LIVE"
        return {
            "snapshot_name": _safe_label(audio_grid.get("snapshot_name") or "LIVE SNAPSHOT", limit=18),
            "block_rows": block_rows or [{"display": "NO ACTIVE BLOCKS", "is_selected": True}],
            "blocks": blocks,
            "block_count": len(blocks),
            "selected_index": selected_index,
            "selected_index_max": max(1, len(blocks) - 1),
            "selected_block_id": str(selected_block_id or "NO-BLOCK"),
            "selected_plugin_name": _safe_label(selected_block.get("plugin_name") or "NO BLOCK", limit=18),
            "selected_path_label": _safe_label(selected_block.get("path_label") or selected_block.get("chain_name") or "CHAIN", limit=16),
            "selected_param_name": _safe_label(selected_param.get("param_id") or "STATE", limit=18),
            "selected_param_value": _safe_label(selected_param.get("value") or ("BYPASS" if selected_block.get("bypassed") else "ACTIVE"), limit=8),
            "selected_block": selected_block,
            "metric_rows": metric_rows or [{"display": "NO METRICS", "is_selected": True}],
            "metric_count": len(metrics),
            "focus_metric_key": selected_key,
            "focus_metric_label": _safe_label(selected_metric.get("label") or selected_key or "NO METRIC", limit=18),
            "focus_metric_source": _safe_label(selected_metric.get("source") or "SYSTEM", limit=10),
            "focus_metric_value": _safe_label(f"{float(selected_metric.get('value') or 0.0):.2f}", limit=8),
            "focus_metric_min": _safe_label(f"{metric_min:.1f}", limit=6),
            "focus_metric_max": _safe_label(f"{metric_max:.1f}", limit=6),
            "focus_metric_normalized": max(0.0, min(1.0, normalized)),
            "stats_updated_at_short": updated_at,
            "system_status": system_status,
            "system_health_ratio": max(0.0, min(1.0, 1.0 - min(1.0, issue_count / 6.0))),
            "health_rows": health_rows,
            "health_summary": _safe_label(f"{system_status} {issue_count} ISSUES", limit=18),
            "health_issue_count": issue_count,
            "diagnostics_rows": diagnostics_rows,
            "diagnostics_summary": _safe_label(f"{len(diagnostics_rows)} CHECKS READY", limit=18),
            "daemon_state_label": _safe_label(status.get("status") or "disconnected", limit=18),
            "device_state_label": _safe_label(
                "usb linked" if status.get("connected") else "usb offline",
                limit=18,
            ),
            "transport_state_label": _safe_label(status.get("transport", {}).get("status") or "transport idle", limit=18),
            "incident_rows": incident_rows,
            "incident_count": len(incident_entries),
            "incident_status": _safe_label(
                f"{len(incident_entries)} ENTRIES" if incident_entries else "LOG EMPTY",
                limit=18,
            ),
            "incident_selected_severity": _safe_label(selected_incident.get("severity") or "info", limit=10),
            "incident_selected_when": _safe_label(
                _short_timestamp(selected_incident.get("timestamp")),
                limit=10,
            ),
            "incident_selected_source": _safe_label(selected_incident.get("source") or "maschine", limit=18),
            "incident_selected_message": _safe_label(selected_incident.get("message") or "No incidents recorded yet.", limit=28),
            "incident_selected_detail": _safe_label(
                selected_incident.get("detail") or selected_incident.get("event") or "Awaiting the first retained incident entry.",
                limit=28,
            ),
            "incident_log_path": _safe_label(get_maschine_incident_log_service().get_path().as_posix(), limit=18),
            "preference_rows": preference_rows,
            "preference_summary": _safe_label(f"{transport_config.get('transport_preference', 'auto')} LINK", limit=18),
            "transport_preference": _safe_label(transport_config.get("transport_preference") or "auto", limit=18),
            "allow_kernel_detach_label": _bool_label(transport_config.get("allow_kernel_detach")),
            "transport_apply_label": _safe_label(transport_config.get("applies_on") or "next reconnect", limit=18),
            "virtual_port_label": _safe_label(status.get("virtual_port_name") or "MAP2:MASCHINE-MK1", limit=18),
            "help_rows": copy.deepcopy(_HELP_ROWS),
            "help_focus": "HOW TO DRIVE THE MK1",
            "help_detail": "SHIFT MODIFIES. NAV OPENS THE TOP MENU. NOTE REPEAT CONFIRMS.",
            "reference_rows": copy.deepcopy(_REFERENCE_ROWS),
            "reference_focus": "FAST LIVE GESTURES",
            "reference_detail": "PADS PICK BLOCKS. ENCODERS TOUCH PARAMS. CONTROL RETURNS.",
            "snapshot_rows": snapshot_rows,
            "snapshot_live_name": _safe_label(live_snapshot.get("name") or "LIVE SNAPSHOT", limit=18),
            "snapshot_live_id": _safe_label(snapshot_id_label, limit=10),
            "snapshot_count": len(recent_snapshots),
            "snapshot_tempo_label": _safe_label(f"{active_tempo:.1f} BPM", limit=12),
            "snapshot_source_label": _safe_label(tempo_status.get("tempo_source") or "stored", limit=10),
            "automation_rows": automation_rows,
            "automation_count": int(automation_status.get("automated_parameters") or 0),
            "automation_state_label": _safe_label(
                "recording" if automation_status.get("recording") else ("playing" if automation_status.get("playing") else "idle"),
                limit=18,
            ),
            "automation_time_label": _safe_label(f"{float(automation_status.get('current_time') or 0.0):.1f}s", limit=10),
            "metronome_rows": metronome_rows,
            "metronome_bpm_label": _safe_label(f"{active_tempo:.1f}", limit=8),
            "metronome_source_label": _safe_label(tempo_status.get("tempo_source") or "stored", limit=10),
            "metronome_tap_count": int(tempo_status.get("tap_count") or 0),
            "metronome_clock_label": _safe_label(clock_status.get("source_mode") or "internal", limit=10),
            "transport_owner_label": transport_owner,
            "step_rows": step_rows,
            "step_pattern_label": _safe_label(
                f"PAT {int(step_state.get('transport', {}).get('pattern') or 0) + 1}",
                limit=10,
            ),
            "step_variation_label": _safe_label(
                f"VAR {int(step_state.get('transport', {}).get('variation') or 0)}",
                limit=10,
            ),
            "step_swing_label": _safe_label(
                f"SW {int(step_state.get('transport', {}).get('swing') or 0)}",
                limit=10,
            ),
            "browser_rows": browser_rows,
            "browser_collection_label": browser_detail["collection_label"],
            "browser_asset_label": browser_detail["asset_label"],
            "browser_source_label": browser_detail["source_label"],
            "browser_featured_count": browser_detail["featured_count"],
            "sample_rows": sample_rows,
            "sample_slot_label": sample_detail["slot_label"],
            "sample_duration_label": sample_detail["duration_label"],
            "sample_path_label": sample_detail["path_label"],
            "sample_waveform_label": sample_detail["waveform_label"],
            "kit_rows": kit_rows,
            "kit_active_label": kit_detail["active_label"],
            "kit_category_label": kit_detail["category_label"],
            "kit_instrument_label": kit_detail["instrument_label"],
            "kit_count_label": kit_detail["count_label"],
            "brain_left_rows": brain_left_rows,
            "brain_left_label": brain_left_detail["label"],
            "brain_left_focus": brain_left_detail["focus"],
            "brain_left_mode": brain_left_detail["mode"],
            "brain_right_rows": brain_right_rows,
            "brain_right_label": brain_right_detail["label"],
            "brain_right_focus": brain_right_detail["focus"],
            "brain_right_mode": brain_right_detail["mode"],
            "brain_sequence_rows": brain_sequence_rows,
            "brain_sequence_label": brain_sequence_detail["label"],
            "brain_sequence_fill": brain_sequence_detail["fill"],
            "brain_sequence_song": brain_sequence_detail["song"],
            "morph_rows": morph_rows,
            "morph_position_label": morph_detail["position"],
            "morph_source_label": morph_detail["source"],
            "morph_target_label": morph_detail["target"],
            "morph_engine_label": morph_detail["engine"],
            "tuner_rows": tuner_rows,
            "tuner_status_label": tuner_detail["status"],
            "tuner_focus_label": tuner_detail["focus"],
            "tuner_detail_label": tuner_detail["detail"],
            "midi_learn_rows": midi_learn_rows,
            "midi_learn_status_label": midi_learn_detail["status"],
            "midi_learn_target_label": midi_learn_detail["target"],
            "midi_learn_scope_label": midi_learn_detail["scope"],
            "macro_rows": macro_rows,
            "macro_status_label": macro_detail["status"],
            "macro_focus_label": macro_detail["focus"],
            "macro_detail_label": macro_detail["detail"],
            "admin_rows": admin_rows,
            "admin_lock_label": admin_detail["lock"],
            "admin_mode_label": admin_detail["mode"],
            "admin_detail_label": admin_detail["detail"],
            "transport": copy.deepcopy(status.get("transport") or {}),
        }

    def _get_transport_preferences(self) -> dict[str, Any]:
        runtime_config = get_runtime_config_manager()
        return {
            "transport_preference": str(runtime_config.get("maschine.transport_preference", "auto") or "auto"),
            "allow_kernel_detach": bool(runtime_config.get("maschine.allow_kernel_detach", False)),
            "applies_on": "next reconnect",
        }

    def _load_incident_entries(self, *, limit: int) -> list[dict[str, Any]]:
        return get_maschine_incident_log_service().list_entries(limit=limit)

    def _build_health_rows(self, health_payload: dict[str, Any]) -> list[dict[str, Any]]:
        issues = list(health_payload.get("issues") or [])
        cpu_percent = f"{float(health_payload.get('cpu_percent') or 0.0):.1f}%"
        memory_percent = f"{float(health_payload.get('memory_percent') or 0.0):.1f}%"
        return [
            {
                "display": f" STATUS {_safe_label(health_payload.get('overall_status') or health_payload.get('status') or 'unknown', limit=8)}",
                "is_selected": True,
            },
            {
                "display": f" CPU {_safe_label(cpu_percent, limit=8)}",
                "is_selected": False,
            },
            {
                "display": f" MEM {_safe_label(memory_percent, limit=8)}",
                "is_selected": False,
            },
            {
                "display": f" AUDIO {_safe_label(_bool_label(health_payload.get('audio_running'), truthy='RUN', falsy='OFF'), limit=8)}",
                "is_selected": False,
            },
            {
                "display": f" ISSUES {_safe_label(len(issues), limit=4)}",
                "is_selected": False,
            },
        ]

    def _build_diagnostics_rows(
        self,
        *,
        health_payload: dict[str, Any],
        audio_payload: dict[str, Any],
        midi_payload: dict[str, Any],
        daemon_status: dict[str, Any],
        audio_grid: dict[str, Any],
    ) -> list[dict[str, Any]]:
        route_count = int(midi_payload.get("route_count") or 0)
        block_count = len(list(audio_grid.get("blocks") or []))
        return [
            {
                "display": f" DAEMON {_safe_label(daemon_status.get('status') or 'offline', limit=9)}",
                "is_selected": True,
            },
            {
                "display": f" USB {_safe_label(_bool_label(daemon_status.get('connected'), truthy='LINKED', falsy='DOWN'), limit=9)}",
                "is_selected": False,
            },
            {
                "display": f" AUDIO {_safe_label(_bool_label(audio_payload.get('running'), truthy='RUN', falsy='STOP'), limit=9)}",
                "is_selected": False,
            },
            {
                "display": f" MIDI {route_count:02d} ROUTES",
                "is_selected": False,
            },
            {
                "display": f" GRID {block_count:02d} BLOCKS",
                "is_selected": False,
            },
            {
                "display": f" HEALTH {_safe_label(health_payload.get('overall_status') or 'unknown', limit=8)}",
                "is_selected": False,
            },
        ]

    def _build_preference_rows(self, transport_config: dict[str, Any], *, status: dict[str, Any]) -> list[dict[str, Any]]:
        return [
            {
                "display": f" LINK {_safe_label(transport_config.get('transport_preference') or 'auto', limit=10)}",
                "is_selected": True,
            },
            {
                "display": f" DETACH {_safe_label(_bool_label(transport_config.get('allow_kernel_detach')), limit=10)}",
                "is_selected": False,
            },
            {
                "display": f" PORT {_safe_label(status.get('virtual_port_name') or 'MAP2', limit=10)}",
                "is_selected": False,
            },
            {
                "display": " MODE OBSERVER ONLY",
                "is_selected": False,
            },
        ]

    def _build_incident_rows(self, entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not entries:
            return [{"display": " NO INCIDENTS YET", "is_selected": True}]
        rows: list[dict[str, Any]] = []
        for index, entry in enumerate(entries[:4]):
            rows.append(
                {
                    "display": (
                        f" {_safe_label(entry.get('severity') or 'info', limit=4)} "
                        f"{_safe_label(entry.get('message') or entry.get('event') or 'entry', limit=11)}"
                    ),
                    "is_selected": index == 0,
                }
            )
        return rows

    def _build_snapshot_rows(self, live_snapshot: dict[str, Any], recent_snapshots: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not recent_snapshots:
            return [{"display": f" {_safe_label(live_snapshot.get('name') or 'LIVE SNAPSHOT', limit=16)}", "is_selected": True}]
        live_id = live_snapshot.get("id")
        rows: list[dict[str, Any]] = []
        for snapshot in recent_snapshots[:4]:
            snapshot_id = snapshot.get("id")
            rows.append(
                {
                    "display": (
                        f" {snapshot_id if isinstance(snapshot_id, int) else '--':>2} "
                        f"{_safe_label(snapshot.get('name') or 'SNAPSHOT', limit=12)}"
                    ),
                    "is_selected": snapshot_id == live_id or (live_id is None and not rows),
                }
            )
        return rows

    def _build_automation_rows(self, automation_status: dict[str, Any]) -> list[dict[str, Any]]:
        automated = int(automation_status.get("automated_parameters") or 0)
        return [
            {"display": f" STATE {_safe_label('record' if automation_status.get('recording') else 'idle', limit=8)}", "is_selected": True},
            {"display": f" PLAY {_safe_label(_bool_label(automation_status.get('playing')), limit=8)}", "is_selected": False},
            {"display": f" LANES {automated:02d}", "is_selected": False},
            {"display": f" LOOP {_safe_label(_bool_label(automation_status.get('loop_enabled')), limit=8)}", "is_selected": False},
        ]

    def _build_metronome_rows(
        self,
        tempo_status: dict[str, Any],
        clock_status: dict[str, Any],
        transport_state: dict[str, Any],
    ) -> list[dict[str, Any]]:
        active_tempo = float(tempo_status.get("active_tempo_bpm") or 120.0)
        return [
            {"display": f" BPM {_safe_label(f'{active_tempo:.1f}', limit=8)}", "is_selected": True},
            {"display": f" SRC {_safe_label(tempo_status.get('tempo_source') or 'stored', limit=8)}", "is_selected": False},
            {"display": f" CLK {_safe_label(clock_status.get('source_mode') or 'internal', limit=8)}", "is_selected": False},
            {"display": f" OWN {_safe_label(transport_state.get('active_owner') or 'none', limit=8)}", "is_selected": False},
        ]

    def _build_step_rows(self, step_state: dict[str, Any]) -> list[dict[str, Any]]:
        transport = dict(step_state.get("transport") or {})
        pattern = dict(step_state.get("pattern") or {})
        rows: list[dict[str, Any]] = [
            {
                "display": (
                    f" P{int(transport.get('pattern') or 0) + 1:02d} "
                    f"VAR{int(transport.get('variation') or 0)} "
                    f"SW{int(transport.get('swing') or 0):02d}"
                ),
                "is_selected": True,
            }
        ]
        steps = list(pattern.get("steps") or [])
        length = int(pattern.get("length") or 16)
        track_lengths = list(pattern.get("track_lengths") or [length] * 16)
        for index, row in enumerate(steps[:4]):
            visible = list(row or [])[: max(1, int(track_lengths[index] or length or 16))]
            active_steps = 0
            for step in visible:
                if not isinstance(step, dict):
                    continue
                if int(step.get("velocity") or 0) > 0 or bool(step.get("accent")):
                    active_steps += 1
            rows.append(
                {
                    "display": f" T{index + 1:02d} {active_steps:02d}/{len(visible):02d}",
                    "is_selected": False,
                }
            )
        return rows[:4]

    def _build_browser_rows(self, browser_state: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        library = dict(browser_state.get("library") or {})
        collections = [dict(collection) for collection in list(library.get("collections") or []) if isinstance(collection, dict)]
        featured_assets = list(library.get("featured_assets") or [])
        rows: list[dict[str, Any]] = []
        selected_collection = collections[0] if collections else {}
        selected_asset = {}
        for index, collection in enumerate(collections[:4]):
            assets = [dict(asset) for asset in list(collection.get("assets") or []) if isinstance(asset, dict)]
            if not selected_asset and assets:
                selected_asset = assets[0]
            rows.append(
                {
                    "display": (
                        f" {_safe_label(collection.get('label') or collection.get('collection_id') or 'COLL', limit=11)} "
                        f"{int(collection.get('asset_count') or len(assets) or 0):02d}"
                    ),
                    "is_selected": index == 0,
                }
            )
        if not rows:
            rows = [{"display": " LIBRARY EMPTY", "is_selected": True}]
        return rows, {
            "collection_label": _safe_label(selected_collection.get("label") or "LIBRARY", limit=18),
            "asset_label": _safe_label(selected_asset.get("name") or "NO FEATURED ASSET", limit=18),
            "source_label": _safe_label(selected_asset.get("source") or "brain", limit=12),
            "featured_count": _safe_label(len(featured_assets), limit=4),
        }

    def _build_sample_rows(self, browser_state: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        sample_editor = dict(browser_state.get("sample_editor") or {})
        sample_waveform = dict(browser_state.get("sample_waveform") or {})
        slot_id = int(sample_editor.get("slot_id") or 0)
        rows = [
            {"display": f" SLOT {slot_id + 1:02d}", "is_selected": True},
            {
                "display": f" WAVE {_safe_label(_bool_label(sample_editor.get('waveform_available')), limit=8)}",
                "is_selected": False,
            },
            {
                "display": f" START {_safe_label(sample_editor.get('start_sample') or 0, limit=8)}",
                "is_selected": False,
            },
            {
                "display": f" END {_safe_label(sample_editor.get('end_sample') or 0, limit=8)}",
                "is_selected": False,
            },
        ]
        return rows, {
            "slot_label": _safe_label(f"SLOT {slot_id + 1}", limit=10),
            "duration_label": _safe_label(f"{float(sample_editor.get('duration_seconds') or 0.0):.2f}S", limit=10),
            "path_label": _safe_label(sample_editor.get("asset_path") or "NO SAMPLE", limit=18),
            "waveform_label": _safe_label(
                f"{int(sample_waveform.get('sample_count') or 0)} SAMPLES" if sample_waveform else "NO WAVEFORM",
                limit=18,
            ),
        }

    def _build_kit_rows(self, browser_state: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        kits = [dict(kit) for kit in list(browser_state.get("kits") or []) if isinstance(kit, dict)]
        active_kit = dict(browser_state.get("active_kit") or {})
        active_kit_id = active_kit.get("kit_id")
        rows: list[dict[str, Any]] = []
        selected_kit = active_kit if active_kit else (kits[0] if kits else {})
        for kit in kits[:4]:
            kit_id = kit.get("kit_id")
            rows.append(
                {
                    "display": (
                        f" {_safe_label(kit.get('name') or kit_id or 'KIT', limit=11)} "
                        f"{_safe_label(kit.get('source') or 'user', limit=4)}"
                    ),
                    "is_selected": bool(active_kit_id and kit_id == active_kit_id) or (not active_kit_id and not rows),
                }
            )
        if not rows:
            rows = [{"display": " NO KITS FOUND", "is_selected": True}]
        instrument_name = ""
        instruments = list(selected_kit.get("instruments") or [])
        if instruments and isinstance(instruments[0], dict):
            instrument_name = str(instruments[0].get("name") or "")
        return rows, {
            "active_label": _safe_label(selected_kit.get("name") or active_kit_id or "NO ACTIVE KIT", limit=18),
            "category_label": _safe_label(selected_kit.get("category") or "KIT", limit=12),
            "instrument_label": _safe_label(instrument_name or "PAD 1", limit=18),
            "count_label": _safe_label(len(kits), limit=4),
        }

    def _build_brain_bank_rows(self, brain_morph_state: dict[str, Any], *, bank: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        brain_state = dict(brain_morph_state.get("brain_state") or {})
        slots = [dict(slot) for slot in list(brain_state.get("slots") or []) if isinstance(slot, dict)]
        active_slot = int(brain_state.get("active_slot") or 0)
        start = 0 if bank == "left" else 8
        end = 8 if bank == "left" else 16
        bank_slots = slots[start:end]
        rows: list[dict[str, Any]] = []
        selected = bank_slots[0] if bank_slots else {}
        for slot in bank_slots[:4]:
            slot_id = int(slot.get("slot_id") or 0)
            if slot_id == active_slot:
                selected = slot
            rows.append(
                {
                    "display": (
                        f" {slot_id + 1:02d} "
                        f"{_safe_label(slot.get('name') or f'SLOT {slot_id + 1}', limit=10)} "
                        f"{_safe_label(slot.get('mode') or 'drum', limit=4)}"
                    ),
                    "is_selected": slot_id == active_slot,
                }
            )
        if not rows:
            rows = [{"display": " NO BRAIN SLOTS", "is_selected": True}]
        return rows, {
            "label": _safe_label("BRAIN LEFT" if bank == "left" else "BRAIN RIGHT", limit=18),
            "focus": _safe_label(selected.get("name") or "NO SLOT", limit=18),
            "mode": _safe_label(selected.get("mode") or "drum", limit=10),
        }

    def _build_brain_sequence_rows(self, brain_morph_state: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        sequence = dict(brain_morph_state.get("brain_sequence") or {})
        patterns = [dict(pattern) for pattern in list(sequence.get("patterns") or []) if isinstance(pattern, dict)]
        current_pattern = int(sequence.get("current_pattern") or 0)
        rows: list[dict[str, Any]] = []
        selected = patterns[0] if patterns else {}
        for pattern in patterns[:4]:
            pattern_id = int(pattern.get("pattern_id") or 0)
            if pattern_id == current_pattern:
                selected = pattern
            rows.append(
                {
                    "display": (
                        f" P{pattern_id + 1:02d} "
                        f"{int(pattern.get('active_lane_count') or 0):02d}L "
                        f"{int(pattern.get('length') or 16):02d}S"
                    ),
                    "is_selected": pattern_id == current_pattern,
                }
            )
        if not rows:
            rows = [{"display": " NO PATTERNS", "is_selected": True}]
        return rows, {
            "label": _safe_label(f"PAT {current_pattern + 1}", limit=10),
            "fill": _safe_label(sequence.get("fill_mode") or "manual", limit=12),
            "song": _safe_label(f"{int(sequence.get('song_entry_count') or 0)} SONG", limit=12),
        }

    def _build_morph_rows(self, brain_morph_state: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        routing = dict(brain_morph_state.get("morph_routing") or {})
        engine = dict(brain_morph_state.get("morph_engine") or {})
        position = max(0.0, min(1.0, float(routing.get("morph_position", 0.5) or 0.5)))
        rows = [
            {"display": f" POS {_safe_label(f'{position:.2f}', limit=6)}", "is_selected": True},
            {
                "display": f" SRC {_safe_label(routing.get('morph_source_channel_key') or 'unset', limit=10)}",
                "is_selected": False,
            },
            {
                "display": f" TGT {_safe_label(routing.get('morph_target_channel_key') or 'unset', limit=10)}",
                "is_selected": False,
            },
            {
                "display": f" ENG {_safe_label(engine.get('mode') or engine.get('engine_mode') or 'unknown', limit=10)}",
                "is_selected": False,
            },
        ]
        return rows, {
            "position": _safe_label(f"{position:.2f}", limit=8),
            "source": _safe_label(routing.get("morph_source_channel_key") or "unset", limit=18),
            "target": _safe_label(routing.get("morph_target_channel_key") or "unset", limit=18),
            "engine": _safe_label(engine.get("mode") or engine.get("engine_mode") or "observer", limit=18),
        }

    def _build_tuner_rows(self, tool_state: dict[str, Any], *, selected_plugin_name: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        rows = [
            {"display": " STATUS UNSUPPORTED", "is_selected": True},
            {"display": f" BLOCK {_safe_label(selected_plugin_name, limit=10)}", "is_selected": False},
            {"display": " RUNTIME NO TUNER", "is_selected": False},
            {"display": " USE WEB/PLUGIN UI", "is_selected": False},
        ]
        return rows, {
            "status": "UNSUPPORTED",
            "focus": selected_plugin_name,
            "detail": "NO DEDICATED TUNER RUNTIME",
        }

    def _build_midi_learn_rows(self, tool_state: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        engine_status = dict(tool_state.get("engine_midi_learn") or {})
        drum_status = dict(tool_state.get("drum_midi_learn") or {})
        generic_status = midi_learn_manager.get_learn_status()
        target = engine_status.get("target") if isinstance(engine_status.get("target"), dict) else {}
        target_label = _safe_label(
            target.get("parameter_id")
            or generic_status.get("target_parameter")
            or engine_status.get("target_param")
            or "NO TARGET",
            limit=18,
        )
        rows = [
            {"display": f" ENGINE {_safe_label(_bool_label(engine_status.get('active')), limit=8)}", "is_selected": True},
            {"display": f" HUB {_safe_label(_bool_label(generic_status.get('active')), limit=8)}", "is_selected": False},
            {"display": f" DRUM {_safe_label(_bool_label(drum_status.get('active')), limit=8)}", "is_selected": False},
            {"display": f" TGT {_safe_label(target_label, limit=11)}", "is_selected": False},
        ]
        return rows, {
            "status": _safe_label("ACTIVE" if any((engine_status.get("active"), generic_status.get("active"), drum_status.get("active"))) else "IDLE", limit=10),
            "target": target_label,
            "scope": _safe_label("ENGINE/HUB/DRUM", limit=18),
        }

    def _build_macro_rows(self, tool_state: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        macros = [dict(item) for item in list(tool_state.get("macros") or []) if isinstance(item, dict)]
        sessions = [dict(item) for item in list(tool_state.get("sessions") or []) if isinstance(item, dict)]
        active_session = next((session for session in sessions if session.get("started_at") and not session.get("stopped_at")), {})
        rows = [
            {"display": f" MACROS {len(macros):02d}", "is_selected": True},
            {"display": f" SESS {len(sessions):02d}", "is_selected": False},
            {"display": f" REC {_safe_label(_bool_label(bool(active_session)), limit=8)}", "is_selected": False},
            {"display": f" FOCUS {_safe_label((macros[0] if macros else {}).get('name') or (active_session.get('name') or 'NONE'), limit=9)}", "is_selected": False},
        ]
        return rows, {
            "status": _safe_label("RECORDING" if active_session else "READY", limit=10),
            "focus": _safe_label((macros[0] if macros else {}).get("name") or active_session.get("name") or "NO MACRO", limit=18),
            "detail": _safe_label(f"{len(macros)} MACROS / {len(sessions)} SESS", limit=18),
        }

    def _build_admin_rows(self, tool_state: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        health = dict(tool_state.get("health") or {})
        daemon_status = dict(tool_state.get("daemon_status") or {})
        admin_console = dict(tool_state.get("admin_console") or {})
        locked = not bool(admin_console.get("session_unlocked"))
        actions = [dict(item) for item in list(admin_console.get("actions") or []) if isinstance(item, dict)]
        selected_index = max(0, int(admin_console.get("selected_action_index") or 0))
        confirmation_progress = max(0, int(admin_console.get("confirmation_progress") or 0))
        busy = bool(admin_console.get("busy"))
        rows: list[dict[str, Any]]
        if actions:
            window_start = max(0, min(selected_index - 1, max(0, len(actions) - 4)))
            rows = []
            for action in actions[window_start: window_start + 4]:
                prefix = "!"
                if not bool(action.get("is_active")):
                    prefix = ">" if bool(action.get("is_selected")) else " "
                rows.append(
                    {
                        "display": f"{prefix} {_safe_label(action.get('label') or 'ACTION', limit=16)}",
                        "is_selected": bool(action.get("is_selected")),
                    }
                )
        else:
            rows = [
                {"display": f" LOCK {_safe_label('ENGAGED' if locked else 'OPEN', limit=8)}", "is_selected": True},
                {"display": f" MODE {_safe_label(tool_state.get('deployment_mode') or 'UNKNOWN', limit=9)}", "is_selected": False},
                {"display": f" HEALTH {_safe_label(health.get('overall_status') or health.get('status') or 'unknown', limit=8)}", "is_selected": False},
                {"display": f" DAEMON {_safe_label(daemon_status.get('status') or 'offline', limit=8)}", "is_selected": False},
            ]

        last_result = dict(admin_console.get("last_result") or {})
        detail = "SHIFT+CTRL / NR"
        if busy:
            detail = _safe_label(f"RUN {last_result.get('label') or admin_console.get('selected_action_label') or 'ACTION'}", limit=18)
        elif confirmation_progress > 0:
            detail = _safe_label(f"CONFIRM {confirmation_progress}/3", limit=18)
        elif locked:
            detail = "SHIFT+CTRL / NR"
        elif last_result:
            prefix = "OK" if str(last_result.get("status") or "").strip().lower() == "completed" else "FAIL"
            detail = _safe_label(f"{prefix} {last_result.get('label') or 'ACTION'}", limit=18)
        else:
            detail = "TURN NAV / NR FIRE"
        return rows, {
            "lock": _safe_label("LOCKED" if locked else "UNLOCKED", limit=10),
            "mode": _safe_label(tool_state.get("deployment_mode") or "UNKNOWN", limit=18),
            "detail": detail,
        }

    def _render_audio_grid(self, *, audio_grid: dict[str, Any]) -> dict[str, Any]:
        state = self._build_profile_state(audio_grid=audio_grid, stats={"metrics": []}, status={}, focus_metric=None)
        rendered = self._profile_runtime.render(state, profile_id="t1_ctrl")
        return {
            "context": "audio_grid",
            "audio_grid": copy.deepcopy(audio_grid),
            "left": rendered.left,
            "right": rendered.right,
            "meta": rendered.meta,
        }

    def _render_stats(self, *, stats: dict[str, Any], focus_metric: str | None = None) -> dict[str, Any]:
        state = self._build_profile_state(audio_grid={"blocks": []}, stats=stats, status={}, focus_metric=focus_metric)
        rendered = self._profile_runtime.render(state, profile_id="t16_monitor")
        return {
            "context": "stats",
            "stats": copy.deepcopy(stats),
            "left": rendered.left,
            "right": rendered.right,
            "meta": rendered.meta,
        }


def get_maschine_lcd_render_service() -> MaschineLCDRenderService:
    return MaschineLCDRenderService.get_instance()


def reset_maschine_lcd_render_service() -> None:
    MaschineLCDRenderService.reset_instance()
