"""Shared fixed-layout runtime and lab metadata for enriched physical surfaces."""

from __future__ import annotations

from copy import deepcopy
from typing import Any


_SHARED_OPERATOR_CONTRACT: dict[str, Any] = {
    "primary_role": "synth_control",
    "sub_menu_policy": "non-synth-functions-live-in-submenus",
    "multi_synth_mode": "parallel",
    "page_layout_mode": "fixed-zones-per-family",
    "view_sync": "independent-per-surface",
    "target_follow_policy": "follow-most-recently-touched-or-armed",
    "snapshot_strategy": "external-midi-program-control-passthrough",
    "community_firmware_support": "first-class",
    "surface_lab_mode": "integrated-per-device",
}

_UNIT_VIEW_LAYOUTS: dict[str, dict[str, Any]] = {
    "maschine-mk1": {
        "page_layout_mode": "fixed-zones-per-family",
        "view_sync": "independent-per-surface",
        "target_follow_policy": "follow-most-recently-touched-or-armed",
        "views": [
            {
                "view_id": "synth-parameters-primary",
                "label": "Primary Synth Parameters",
                "category": "synth_control",
                "note": "Primary parameter bank with values above the encoder row and parameter names below it.",
                "presentation": {
                    "focus_mode": "auto-follow-most-recent-target",
                    "encoder_alignment": "value-above-name-below-knob",
                },
                "zones": [
                    {"zone_id": "left-lcd", "label": "Left LCD", "role": "parameter values", "controls": ["lcd-left"]},
                    {"zone_id": "right-lcd", "label": "Right LCD", "role": "parameter names", "controls": ["lcd-right"]},
                    {"zone_id": "encoder-row", "label": "Encoder Row", "role": "primary parameter edit", "controls": ["encoders-1-8"]},
                    {"zone_id": "pad-matrix", "label": "Pad Matrix", "role": "synth zones and target focus", "controls": ["pads-1-16"]},
                    {"zone_id": "group-strip", "label": "Group Strip", "role": "secondary synth and effect targeting", "controls": ["group-buttons"]},
                ],
            },
            {
                "view_id": "synth-parameters-secondary",
                "label": "Secondary Synth and FX Parameters",
                "category": "synth_control",
                "replaces_view_id": "session-status",
                "note": "Secondary parameter bank that temporarily replaces transport/session/status while parameters are moving.",
                "presentation": {
                    "focus_mode": "auto-follow-most-recent-target",
                    "encoder_alignment": "value-above-name-below-knob",
                },
                "zones": [
                    {"zone_id": "left-lcd", "label": "Left LCD", "role": "secondary values", "controls": ["lcd-left"]},
                    {"zone_id": "right-lcd", "label": "Right LCD", "role": "secondary names", "controls": ["lcd-right"]},
                    {"zone_id": "encoder-row", "label": "Encoder Row", "role": "secondary parameter edit", "controls": ["encoders-1-8"]},
                    {"zone_id": "transport-strip", "label": "Transport Strip", "role": "momentary page return", "controls": ["transport-buttons"]},
                ],
            },
            {
                "view_id": "session-status",
                "label": "Transport and Session Status",
                "category": "session",
                "note": "Dedicated transport and status page kept separate from synth parameter pages.",
                "presentation": {"focus_mode": "manual"},
                "zones": [
                    {"zone_id": "lcd-pair", "label": "LCD Pair", "role": "session and transport status", "controls": ["lcd-left", "lcd-right"]},
                    {"zone_id": "transport-strip", "label": "Transport Strip", "role": "transport", "controls": ["transport-buttons"]},
                    {"zone_id": "pad-matrix", "label": "Pad Matrix", "role": "snapshot and scene launch", "controls": ["pads-1-16"]},
                ],
            },
            {
                "view_id": "snapshots",
                "label": "Snapshot Recall",
                "category": "snapshots",
                "note": "Snapshot and scene page with external MIDI-program/control compatibility.",
                "presentation": {"focus_mode": "manual"},
                "zones": [
                    {"zone_id": "pad-matrix", "label": "Pad Matrix", "role": "snapshot recall", "controls": ["pads-1-16"]},
                    {"zone_id": "encoder-row", "label": "Encoder Row", "role": "snapshot offsets and banks", "controls": ["encoders-1-8"]},
                ],
            },
            {
                "view_id": "surface-lab",
                "label": "Surface Lab",
                "category": "advanced",
                "note": "Low-level MK1 transport diagnostics, LCD tests, LED tests, and firmware tooling.",
                "presentation": {"focus_mode": "manual"},
                "zones": [
                    {"zone_id": "diagnostic-grid", "label": "Pad Matrix", "role": "LED and event diagnostics", "controls": ["pads-1-16"]},
                    {"zone_id": "encoder-row", "label": "Encoder Row", "role": "transport probe and replay", "controls": ["encoders-1-8"]},
                ],
            },
        ],
    },
    "ableton-push": {
        "page_layout_mode": "fixed-zones-per-family",
        "view_sync": "independent-per-surface",
        "target_follow_policy": "follow-most-recently-touched-or-armed",
        "views": [
            {
                "view_id": "synth-grid",
                "label": "Synth Grid",
                "category": "synth_control",
                "note": "Primary synth grid with pads for parallel synth targeting and performance.",
                "presentation": {"focus_mode": "auto-follow-most-recent-target"},
                "zones": [
                    {"zone_id": "display", "label": "Display", "role": "target and bank status", "controls": ["display"]},
                    {"zone_id": "pad-grid", "label": "8x8 Pad Grid", "role": "parallel synth zones", "controls": ["grid-8x8"]},
                    {"zone_id": "encoder-row", "label": "Touch Encoders", "role": "macro layer", "controls": ["encoders-1-8"]},
                    {"zone_id": "page-row", "label": "Page Row", "role": "fixed page selection", "controls": ["page-buttons"]},
                ],
            },
            {
                "view_id": "synth-parameters-primary",
                "label": "Primary Synth Parameters",
                "category": "synth_control",
                "note": "Primary Push parameter bank for the currently touched or armed target.",
                "presentation": {
                    "focus_mode": "auto-follow-most-recent-target",
                    "encoder_alignment": "display-title-plus-line-items",
                },
                "zones": [
                    {"zone_id": "display", "label": "Display", "role": "parameter names and values", "controls": ["display"]},
                    {"zone_id": "encoder-row", "label": "Touch Encoders", "role": "primary parameter edit", "controls": ["encoders-1-8"]},
                    {"zone_id": "touchstrip", "label": "Touchstrip", "role": "focused continuous gesture", "controls": ["touchstrip"]},
                ],
            },
            {
                "view_id": "synth-parameters-secondary",
                "label": "Secondary Synth and FX Parameters",
                "category": "synth_control",
                "note": "Secondary bank used when deeper synth or effect pages are invoked.",
                "presentation": {"focus_mode": "auto-follow-most-recent-target"},
                "zones": [
                    {"zone_id": "display", "label": "Display", "role": "secondary parameter details", "controls": ["display"]},
                    {"zone_id": "encoder-row", "label": "Touch Encoders", "role": "secondary parameter edit", "controls": ["encoders-1-8"]},
                ],
            },
            {
                "view_id": "device-routing",
                "label": "Routing and Device Paths",
                "category": "routing",
                "note": "Fixed routing page for synth and effect path inspection.",
                "presentation": {"focus_mode": "manual"},
                "zones": [
                    {"zone_id": "display", "label": "Display", "role": "routing labels", "controls": ["display"]},
                    {"zone_id": "pad-grid", "label": "8x8 Pad Grid", "role": "routing selection", "controls": ["grid-8x8"]},
                    {"zone_id": "encoder-row", "label": "Touch Encoders", "role": "routing adjustments", "controls": ["encoders-1-8"]},
                ],
            },
            {
                "view_id": "snapshots",
                "label": "Snapshot Recall",
                "category": "snapshots",
                "note": "Snapshot and preset page that can coexist with externally authored MIDI snapshot logic.",
                "presentation": {"focus_mode": "manual"},
                "zones": [
                    {"zone_id": "display", "label": "Display", "role": "snapshot names", "controls": ["display"]},
                    {"zone_id": "pad-grid", "label": "8x8 Pad Grid", "role": "snapshot launch", "controls": ["grid-8x8"]},
                ],
            },
            {
                "view_id": "surface-lab",
                "label": "Surface Lab",
                "category": "advanced",
                "note": "Display, pad, SysEx, capture, replay, and firmware maintenance tooling.",
                "presentation": {"focus_mode": "manual"},
                "zones": [
                    {"zone_id": "display", "label": "Display", "role": "diagnostics and protocol view", "controls": ["display"]},
                    {"zone_id": "pad-grid", "label": "8x8 Pad Grid", "role": "test patterns", "controls": ["grid-8x8"]},
                ],
            },
        ],
    },
    "ground-control-pro": {
        "page_layout_mode": "fixed-zones-per-family",
        "view_sync": "independent-per-surface",
        "target_follow_policy": "external-midi-program-control",
        "views": [
            {
                "view_id": "snapshots",
                "label": "Snapshot Recall",
                "category": "snapshots",
                "note": "Primary Ground Control Pro mode remains externally authored MIDI-program/control passthrough.",
                "presentation": {"focus_mode": "external-authoring"},
                "zones": [
                    {"zone_id": "footswitch-grid", "label": "Footswitch Grid", "role": "snapshot recall", "controls": ["footswitches"]},
                    {"zone_id": "expression", "label": "Expression Inputs", "role": "external controller passthrough", "controls": ["expression-1", "expression-2"]},
                ],
            },
            {
                "view_id": "program-control-map",
                "label": "Program and Control Maps",
                "category": "routing",
                "note": "Inspection view for externally authored MIDI-program/control maps.",
                "presentation": {"focus_mode": "manual"},
                "zones": [
                    {"zone_id": "footswitch-grid", "label": "Footswitch Grid", "role": "program map recall", "controls": ["footswitches"]},
                ],
            },
            {
                "view_id": "surface-lab",
                "label": "Surface Lab",
                "category": "advanced",
                "note": "SysEx capture, memory backup, validation, and replay tooling.",
                "presentation": {"focus_mode": "manual"},
                "zones": [
                    {"zone_id": "footswitch-grid", "label": "Footswitch Grid", "role": "diagnostic trigger surface", "controls": ["footswitches"]},
                ],
            },
        ],
    },
    "meloaudio-midi-commander": {
        "page_layout_mode": "fixed-zones-per-family",
        "view_sync": "independent-per-surface",
        "target_follow_policy": "follow-most-recently-touched-or-armed",
        "views": [
            {
                "view_id": "synth-macros",
                "label": "Synth Macros",
                "category": "synth_control",
                "note": "Primary macro page with fixed footswitch and expression assignments.",
                "presentation": {"focus_mode": "auto-follow-most-recent-target"},
                "zones": [
                    {"zone_id": "footswitch-row", "label": "Footswitch Row", "role": "macro triggers", "controls": ["footswitches"]},
                    {"zone_id": "expression", "label": "Expression Inputs", "role": "continuous macro control", "controls": ["expression-1", "expression-2"]},
                ],
            },
            {
                "view_id": "snapshots",
                "label": "Snapshot Recall",
                "category": "snapshots",
                "note": "Snapshot page that stays compatible with external MIDI-program/control authoring.",
                "presentation": {"focus_mode": "manual"},
                "zones": [
                    {"zone_id": "footswitch-row", "label": "Footswitch Row", "role": "snapshot recall", "controls": ["footswitches"]},
                ],
            },
            {
                "view_id": "surface-lab",
                "label": "Surface Lab",
                "category": "advanced",
                "note": "DFU, firmware flashing, capture, replay, and map-editor tooling.",
                "presentation": {"focus_mode": "manual"},
                "zones": [
                    {"zone_id": "footswitch-row", "label": "Footswitch Row", "role": "test triggers", "controls": ["footswitches"]},
                ],
            },
        ],
    },
    "novation-launch-control": {
        "page_layout_mode": "fixed-zones-per-family",
        "view_sync": "independent-per-surface",
        "target_follow_policy": "follow-most-recently-touched-or-armed",
        "views": [
            {
                "view_id": "synth-macros",
                "label": "Synth Macros",
                "category": "synth_control",
                "note": "Primary macro page with fixed knob and pad zones per Launch Control family template.",
                "presentation": {"focus_mode": "auto-follow-most-recent-target"},
                "zones": [
                    {"zone_id": "knob-banks", "label": "Knob Banks", "role": "macro control", "controls": ["knobs"]},
                    {"zone_id": "button-row", "label": "Button and Pad Rows", "role": "bank, target, and snapshot actions", "controls": ["pads", "buttons"]},
                ],
            },
            {
                "view_id": "templates",
                "label": "Template Banks",
                "category": "routing",
                "note": "Fixed template view for Components-backed custom modes and template exchange.",
                "presentation": {"focus_mode": "manual"},
                "zones": [
                    {"zone_id": "knob-banks", "label": "Knob Banks", "role": "template parameter edit", "controls": ["knobs"]},
                    {"zone_id": "button-row", "label": "Button and Pad Rows", "role": "template bank switching", "controls": ["pads", "buttons"]},
                ],
            },
            {
                "view_id": "surface-lab",
                "label": "Surface Lab",
                "category": "advanced",
                "note": "Components import/export, firmware maintenance, LED probe, capture, and replay tools.",
                "presentation": {"focus_mode": "manual"},
                "zones": [
                    {"zone_id": "knob-banks", "label": "Knob Banks", "role": "diagnostic input", "controls": ["knobs"]},
                ],
            },
        ],
    },
    "mackie-mcu-pro": {
        "page_layout_mode": "fixed-zones-per-family",
        "view_sync": "independent-per-surface",
        "target_follow_policy": "follow-most-recently-touched-or-armed",
        "views": [
            {
                "view_id": "current-view-mix",
                "label": "Current View Mix",
                "category": "synth_control",
                "note": "Motor faders always represent the current view, not a permanently fixed mixer page.",
                "presentation": {"focus_mode": "auto-follow-most-recent-target"},
                "zones": [
                    {"zone_id": "faders", "label": "Motor Faders", "role": "current-view continuous control", "controls": ["faders-1-8", "master-fader"]},
                    {"zone_id": "vpot-row", "label": "VPot Row", "role": "current-view secondary control", "controls": ["vpots-1-8"]},
                    {"zone_id": "scribble-strip", "label": "Scribble Strip", "role": "session names and target labels", "controls": ["scribble-strips"]},
                    {"zone_id": "meter-bridge", "label": "Meter Bridge", "role": "current-view metering", "controls": ["meter-bridge"]},
                ],
            },
            {
                "view_id": "session-transport",
                "label": "Session and Transport",
                "category": "session",
                "note": "Dedicated transport and session-name page.",
                "presentation": {"focus_mode": "manual"},
                "zones": [
                    {"zone_id": "transport", "label": "Transport Section", "role": "transport", "controls": ["transport-buttons"]},
                    {"zone_id": "scribble-strip", "label": "Scribble Strip", "role": "session names", "controls": ["scribble-strips"]},
                ],
            },
            {
                "view_id": "surface-lab",
                "label": "Surface Lab",
                "category": "advanced",
                "note": "Motor-fader safety tools, scribble-strip diagnostics, protocol capture, firmware update, and replay.",
                "presentation": {"focus_mode": "manual"},
                "zones": [
                    {"zone_id": "faders", "label": "Motor Faders", "role": "safety and replay", "controls": ["faders-1-8", "master-fader"]},
                    {"zone_id": "scribble-strip", "label": "Scribble Strip", "role": "diagnostic rendering", "controls": ["scribble-strips"]},
                ],
            },
        ],
    },
}

_UNIT_SURFACE_LABS: dict[str, dict[str, Any]] = {
    "maschine-mk1": {
        "enabled": True,
        "access": "integrated-advanced-mode",
        "features": [
            "raw-midi-monitor",
            "vendor-usb-transport-inspector",
            "lcd-frame-preview",
            "pad-led-tester",
            "capture-and-replay",
            "firmware-flasher",
            "control-map-editor",
        ],
    },
    "ableton-push": {
        "enabled": True,
        "access": "integrated-advanced-mode",
        "features": [
            "raw-midi-monitor",
            "display-sysex-inspector",
            "pad-led-tester",
            "capture-and-replay",
            "firmware-maintenance",
            "control-map-editor",
        ],
    },
    "ground-control-pro": {
        "enabled": True,
        "access": "integrated-advanced-mode",
        "features": [
            "sysex-dump-capture",
            "memory-backup-restore",
            "payload-validator",
            "capture-and-replay",
            "control-map-inspector",
        ],
    },
    "meloaudio-midi-commander": {
        "enabled": True,
        "access": "integrated-advanced-mode",
        "features": [
            "raw-midi-monitor",
            "dfu-firmware-flasher",
            "community-firmware-manager",
            "capture-and-replay",
            "control-map-editor",
        ],
    },
    "novation-launch-control": {
        "enabled": True,
        "access": "integrated-advanced-mode",
        "features": [
            "raw-midi-monitor",
            "components-template-import-export",
            "led-feedback-tester",
            "firmware-maintenance",
            "capture-and-replay",
            "control-map-editor",
        ],
    },
    "mackie-mcu-pro": {
        "enabled": True,
        "access": "integrated-advanced-mode",
        "features": [
            "raw-midi-monitor",
            "mcu-protocol-inspector",
            "motor-fader-safety-tools",
            "scribble-strip-render-test",
            "firmware-flasher",
            "capture-and-replay",
        ],
    },
}

_PUSH_PAGE_TO_VIEW_ID = {
    "home": "synth-grid",
    "chains": "synth-grid",
    "node_detail": "synth-grid",
    "parameters": "synth-parameters-primary",
    "presets": "snapshots",
    "routing": "device-routing",
    "cluster": "synth-grid",
    "diagnostics": "surface-lab",
}


def _normalize_notification(payload: Any) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    emitted_at = str(payload.get("emitted_at") or "").strip()
    title = str(payload.get("title") or "").strip()
    subtitle = str(payload.get("subtitle") or "").strip()
    if not emitted_at or not title or not subtitle:
        return None
    severity = str(payload.get("severity") or "info").strip().lower() or "info"
    return {
        "severity": severity,
        "title": title,
        "subtitle": subtitle,
        "emitted_at": emitted_at,
    }


def build_reconnect_runtime(unit_id: str, service_state: dict[str, Any]) -> dict[str, Any]:
    daemon_status = service_state.get("daemon_status") if isinstance(service_state.get("daemon_status"), dict) else {}

    if unit_id == "maschine-mk1":
        connected = bool(service_state.get("daemon_connected") or service_state.get("websocket_connected"))
        return {
            "auto_reconnect": True,
            "state": "connected" if connected else "reconnecting",
            "available": connected,
            "reconnect_count": int(service_state.get("reconnect_count") or 0),
            "last_seen_at": service_state.get("last_seen_at"),
            "last_repush_at": service_state.get("last_repush_at"),
            "repush_scope": [
                "encoder_map",
                "audio_grid_selection",
                "lcd_frames",
                "pad_led_state",
            ],
            "notification": _normalize_notification(service_state.get("notification")),
        }

    if unit_id == "ableton-push":
        available = bool(service_state.get("active_device"))
        return {
            "auto_reconnect": True,
            "state": "connected" if available else "reconnecting",
            "available": available,
            "reconnect_count": int(service_state.get("reconnect_count") or 0),
            "last_seen_at": service_state.get("last_seen_at"),
            "last_repush_at": service_state.get("last_repush_at"),
            "repush_scope": [
                "page_state",
                "pad_led_state",
                "display_frame",
                "touchstrip_state",
            ],
            "notification": _normalize_notification(service_state.get("notification")),
        }

    repush_scope = {
        "ground-control-pro": [
            "snapshot_assignments",
            "relay_state",
            "transport_selection",
        ],
        "meloaudio-midi-commander": [
            "snapshot_assignments",
            "manual_setup_guidance",
            "expression_profile",
        ],
        "novation-launch-control": [
            "template_selection",
            "snapshot_mappings",
            "led_feedback",
        ],
        "mackie-mcu-pro": [
            "focused_bank_projection",
            "scribble_strip_labels",
            "motor_faders",
            "transport_state",
        ],
    }.get(unit_id, ["snapshot_assignments"])

    return {
        "auto_reconnect": bool(daemon_status.get("enabled", True)),
        "state": str(daemon_status.get("state") or "idle"),
        "available": bool(daemon_status.get("available")),
        "reconnect_count": int(daemon_status.get("reconnect_count") or 0),
        "last_seen_at": daemon_status.get("last_seen_at"),
        "last_repush_at": daemon_status.get("last_repush_at"),
        "repush_scope": repush_scope,
        "notification": _normalize_notification(daemon_status.get("notification")),
    }


def build_shared_operator_contract() -> dict[str, Any]:
    payload = deepcopy(_SHARED_OPERATOR_CONTRACT)
    payload["reconnect_strategy"] = "auto-reconnect-and-repush-current-snapshot-state"
    return payload


def get_unit_view_ids(unit_id: str) -> list[str]:
    layout = _UNIT_VIEW_LAYOUTS.get(unit_id) or {}
    return [str(view.get("view_id") or "") for view in layout.get("views") or [] if str(view.get("view_id") or "")]


def build_surface_lab(unit_id: str) -> dict[str, Any]:
    base = _UNIT_SURFACE_LABS.get(unit_id)
    if base is None:
        return {
            "enabled": True,
            "access": "integrated-advanced-mode",
            "features": ["raw-midi-monitor", "capture-and-replay"],
            "snapshot": {},
        }
    snapshot = build_surface_lab_snapshot(unit_id, {})
    payload = deepcopy(base)
    payload["snapshot"] = snapshot
    return payload


def build_unit_view_state(
    unit_id: str,
    *,
    service_state: dict[str, Any],
    host_detected: bool,
) -> dict[str, Any]:
    layout = deepcopy(_UNIT_VIEW_LAYOUTS.get(unit_id) or {
        "page_layout_mode": "fixed-zones-per-family",
        "view_sync": "independent-per-surface",
        "target_follow_policy": "follow-most-recently-touched-or-armed",
        "views": [],
    })
    current_view_id, current_view_source = _resolve_current_view(unit_id, service_state=service_state, host_detected=host_detected)
    layout["current_view_id"] = current_view_id
    layout["current_view_label"] = _resolve_view_label(layout.get("views") or [], current_view_id)
    layout["current_view_source"] = current_view_source
    layout["recent_target"] = build_unit_recent_target(unit_id, service_state=service_state)
    layout["is_override_active"] = False
    return layout


def _resolve_view_label(views: list[dict[str, Any]], current_view_id: str) -> str:
    for view in views:
        if str(view.get("view_id") or "") == current_view_id:
            return str(view.get("label") or current_view_id)
    return current_view_id.replace("-", " ").title()


def _resolve_current_view(
    unit_id: str,
    *,
    service_state: dict[str, Any],
    host_detected: bool,
) -> tuple[str, str]:
    if unit_id == "maschine-mk1":
        audio_grid = service_state.get("audio_grid") if isinstance(service_state.get("audio_grid"), dict) else {}
        if audio_grid.get("selected_block_id"):
            return "synth-parameters-primary", "maschine-audio-grid-selection"
        if service_state.get("websocket_connected"):
            return "session-status", "maschine-websocket-runtime"
        return "session-status", "default-family-layout"

    if unit_id == "ableton-push":
        snapshot_state = service_state.get("snapshot_state") if isinstance(service_state.get("snapshot_state"), dict) else {}
        active_page = str(snapshot_state.get("active_page") or "")
        if active_page:
            return _PUSH_PAGE_TO_VIEW_ID.get(active_page, "synth-grid"), "push-active-page"
        if service_state.get("running") or host_detected:
            return "synth-grid", "push-runtime-default"
        return "synth-grid", "default-family-layout"

    if unit_id == "ground-control-pro":
        if int(service_state.get("session_count") or 0) > 0:
            return "surface-lab", "ground-control-pro-session"
        return "snapshots", "external-midi-program-control"

    if unit_id == "meloaudio-midi-commander":
        if str(service_state.get("active_profile_id") or "") == "meloaudio_commander":
            return "synth-macros", "midi-profile-service"
        return "synth-macros", "default-family-layout"

    if unit_id == "novation-launch-control":
        if int(service_state.get("detected_device_count") or 0) > 0:
            return "templates", "midi-hub-profile-detected"
        return "synth-macros", "default-family-layout"

    if unit_id == "mackie-mcu-pro":
        if int(service_state.get("detected_device_count") or 0) > 0:
            return "current-view-mix", "midi-hub-profile-detected"
        return "current-view-mix", "current-view-policy"

    return "surface-lab", "default-family-layout"


def build_unit_recent_target(unit_id: str, *, service_state: dict[str, Any]) -> dict[str, Any] | None:
    if unit_id == "maschine-mk1":
        audio_grid = service_state.get("audio_grid")
        if not isinstance(audio_grid, dict):
            return None
        selected_block_id = str(audio_grid.get("selected_block_id") or "").strip()
        if not selected_block_id:
            return None
        blocks = audio_grid.get("blocks") if isinstance(audio_grid.get("blocks"), list) else []
        block = next((candidate for candidate in blocks if isinstance(candidate, dict) and str(candidate.get("block_id") or "") == selected_block_id), {})
        label = (
            str(block.get("plugin_name") or "")
            or str(block.get("path_label") or "")
            or str(block.get("chain_name") or "")
            or selected_block_id
        )
        return {
            "target_id": selected_block_id,
            "label": label,
            "kind": "maschine-audio-grid-block",
            "source": "maschine-audio-grid-selection",
        }

    if unit_id == "ableton-push":
        snapshot_state = service_state.get("snapshot_state")
        if not isinstance(snapshot_state, dict):
            return None
        selected_node_id = str(snapshot_state.get("selected_node_id") or "").strip()
        if selected_node_id:
            for chain in snapshot_state.get("chains") or []:
                if not isinstance(chain, dict):
                    continue
                for node in chain.get("nodes") or []:
                    if isinstance(node, dict) and str(node.get("id") or "") == selected_node_id:
                        return {
                            "target_id": selected_node_id,
                            "label": str(node.get("name") or selected_node_id),
                            "kind": "push-node",
                            "source": "push-selected-node",
                        }
            return {
                "target_id": selected_node_id,
                "label": selected_node_id,
                "kind": "push-node",
                "source": "push-selected-node",
            }
        selected_chain_id = str(snapshot_state.get("selected_chain_id") or "").strip()
        if selected_chain_id:
            for chain in snapshot_state.get("chains") or []:
                if isinstance(chain, dict) and str(chain.get("id") or "") == selected_chain_id:
                    return {
                        "target_id": selected_chain_id,
                        "label": str(chain.get("name") or selected_chain_id),
                        "kind": "push-chain",
                        "source": "push-selected-chain",
                    }
            return {
                "target_id": selected_chain_id,
                "label": selected_chain_id,
                "kind": "push-chain",
                "source": "push-selected-chain",
            }
        selected_preset_id = str(snapshot_state.get("selected_preset_id") or "").strip()
        if selected_preset_id:
            for preset in snapshot_state.get("presets") or []:
                if isinstance(preset, dict) and str(preset.get("id") or "") == selected_preset_id:
                    return {
                        "target_id": selected_preset_id,
                        "label": str(preset.get("name") or selected_preset_id),
                        "kind": "push-preset",
                        "source": "push-selected-preset",
                    }
            return {
                "target_id": selected_preset_id,
                "label": selected_preset_id,
                "kind": "push-preset",
                "source": "push-selected-preset",
            }
    return None


def build_surface_lab_snapshot(unit_id: str, service_state: dict[str, Any]) -> dict[str, Any]:
    if unit_id == "maschine-mk1":
        transport = service_state.get("transport") if isinstance(service_state.get("transport"), dict) else {}
        return {
            "daemon_connected": bool(service_state.get("daemon_connected")),
            "websocket_connected": bool(service_state.get("websocket_connected")),
            "selected_transport": transport.get("transport_id"),
            "transport_candidate_count": len(service_state.get("transport_candidates") or []),
            "hid_history_depth": int(service_state.get("hid_history_depth") or 0),
            "last_event_type": service_state.get("last_event_type"),
            "reconnect_runtime": build_reconnect_runtime(unit_id, service_state),
        }
    if unit_id == "ableton-push":
        snapshot_state = service_state.get("snapshot_state") if isinstance(service_state.get("snapshot_state"), dict) else {}
        return {
            "running": bool(service_state.get("running")),
            "active_page": service_state.get("active_page"),
            "midi_events_in": int(service_state.get("midi_events_in") or 0),
            "midi_events_out": int(service_state.get("midi_events_out") or 0),
            "decoded_events": len(snapshot_state.get("diagnostics", {}).get("decoded_events", []) if isinstance(snapshot_state.get("diagnostics"), dict) else []),
            "last_diagnostics_export": service_state.get("last_diagnostics_export"),
            "reconnect_runtime": build_reconnect_runtime(unit_id, service_state),
        }
    if unit_id == "ground-control-pro":
        return {
            "input_count": len(service_state.get("inputs") or []),
            "output_count": len(service_state.get("outputs") or []),
            "connected_input_count": len([port for port in service_state.get("inputs") or [] if isinstance(port, dict) and port.get("connected")]),
            "connected_output_count": len([port for port in service_state.get("outputs") or [] if isinstance(port, dict) and port.get("connected")]),
            "session_count": int(service_state.get("session_count") or 0),
            "artifact_count": int(service_state.get("artifact_count") or 0),
            "job_count": int(service_state.get("job_count") or 0),
            "active_job_count": int(service_state.get("active_job_count") or 0),
            "reconnect_runtime": build_reconnect_runtime(unit_id, service_state),
        }
    if unit_id == "meloaudio-midi-commander":
        profile = service_state.get("profile") if isinstance(service_state.get("profile"), dict) else {}
        return {
            "active_profile_id": service_state.get("active_profile_id"),
            "current_bank": int(service_state.get("current_bank") or 0),
            "calibration_count": int(service_state.get("calibration_count") or 0),
            "detected_device_count": int(service_state.get("detected_device_count") or 0),
            "footswitch_count": len(profile.get("footswitches") or []),
            "expression_pedal_count": len(profile.get("expression_pedals") or []),
            "supports_firmware_update": bool(profile.get("supports_firmware_update")),
            "reconnect_runtime": build_reconnect_runtime(unit_id, service_state),
        }
    if unit_id == "novation-launch-control":
        display_capabilities = service_state.get("display_capabilities") if isinstance(service_state.get("display_capabilities"), dict) else {}
        profile = service_state.get("profile") if isinstance(service_state.get("profile"), dict) else {}
        return {
            "detected_device_count": int(service_state.get("detected_device_count") or 0),
            "profile_id": profile.get("profile_id"),
            "led_feedback": bool(display_capabilities.get("supports_led_feedback")),
            "template_strategy": profile.get("metadata", {}).get("template_strategy") if isinstance(profile.get("metadata"), dict) else None,
            "reconnect_runtime": build_reconnect_runtime(unit_id, service_state),
        }
    if unit_id == "mackie-mcu-pro":
        display_capabilities = service_state.get("display_capabilities") if isinstance(service_state.get("display_capabilities"), dict) else {}
        return {
            "detected_device_count": int(service_state.get("detected_device_count") or 0),
            "motor_faders": int(display_capabilities.get("motor_faders") or 0),
            "scribble_strip_transport": display_capabilities.get("transport"),
            "supports_channel_labels": bool(display_capabilities.get("supports_channel_labels")),
            "reconnect_runtime": build_reconnect_runtime(unit_id, service_state),
        }
    return {}
