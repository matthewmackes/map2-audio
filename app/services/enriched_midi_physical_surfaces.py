"""Shared registry for the Enriched_MIDI_Physical_Surfaces stack."""

from __future__ import annotations

import contextlib
import importlib.util
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.services.enriched_surface_runtime import (
    build_reconnect_runtime,
    build_surface_lab_snapshot,
    build_unit_recent_target,
    build_shared_operator_contract,
    build_surface_lab,
    build_unit_view_state,
    get_unit_view_ids,
)
from app.services.enriched_surface_session import get_enriched_surface_session_service
from app.services.ground_control_pro import get_ground_control_pro_service
from app.services.launch_control_surface import get_launch_control_surface_service
from app.services.mcu_surface import get_mcu_surface_service
from app.services.midi_device_profiles import device_profile_service
from app.services.midi_hub.device_registry import get_midi_device_registry
from app.services.midi_commander_surface import get_midi_commander_surface_service
from app.services.maschine_service import get_maschine_service
from app.services.push_surface import get_push_surface_manager
from app.utils.singleton import Singleton


STACK_NAME = "Enriched_MIDI_Physical_Surfaces"

_SURFACE_PROFILE_IDS: dict[str, set[str]] = {
    "maschine-mk1": {"maschine_mk1"},
    "ground-control-pro": {"ground_control_pro"},
    "meloaudio-midi-commander": {"meloaudio_midi_commander"},
    "novation-launch-control": {"novation_launch_control"},
    "mackie-mcu-pro": {"mackie_mcu_pro"},
}

_SURFACE_CATALOG: list[dict[str, Any]] = [
    {
        "unit_id": "maschine-mk1",
        "display_name": "Native Instruments Maschine MK1",
        "family": "maschine",
        "device_type": "hybrid_surface",
        "specialized_route": "/maschine",
        "detection": {
            "vid_pid": ["17cc:0808"],
            "name_patterns": ["maschine", "maschine controller", "maschine mk1"],
        },
        "capabilities": [
            "pads",
            "encoders",
            "transport",
            "group buttons",
            "LED feedback",
            "dual LCD",
        ],
        "integration_notes": [
            "Prefer a hybrid path: direct MIDI for notes/CC plus a richer vendor transport for LCD and LED feedback.",
            "On this host the device is bound to snd-usb-caiaq and presents as MIDI-only through ALSA; richer MK1 feedback needs a transport layer that does not assume hidraw.",
        ],
        "transport_layers": [
            {"layer_id": "alsa-midi", "label": "ALSA MIDI", "kind": "midi"},
            {"layer_id": "vendor-bulk-feedback", "label": "Vendor USB feedback", "kind": "feedback"},
        ],
    },
    {
        "unit_id": "ableton-push",
        "display_name": "Ableton Push",
        "family": "push",
        "device_type": "rich_midi_surface",
        "specialized_route": "/labs/push-surface",
        "detection": {
            "vid_pid": [],
            "name_patterns": ["push", "ableton push"],
        },
        "capabilities": [
            "pads",
            "encoders",
            "display feedback",
            "button feedback",
            "device assignment",
        ],
        "integration_notes": [
            "Push already has the richest shared-stack implementation in the repo and should become the baseline abstraction for other advanced MIDI surfaces where the transport model overlaps.",
        ],
        "transport_layers": [
            {"layer_id": "midi-hub", "label": "MidiHub device bridge", "kind": "midi"},
            {"layer_id": "surface-renderer", "label": "Display and light renderer", "kind": "feedback"},
        ],
    },
    {
        "unit_id": "ground-control-pro",
        "display_name": "Voodoo Lab Ground Control Pro",
        "family": "ground-control-pro",
        "device_type": "sysex_surface",
        "specialized_route": "/ground-control-pro",
        "detection": {
            "vid_pid": [],
            "name_patterns": ["ground control", "ground control pro", "voodoo lab"],
        },
        "capabilities": [
            "full-memory SysEx backup",
            "structured validation",
            "safe retransmit",
            "transport selection",
        ],
        "integration_notes": [
            "Ground Control Pro is primarily a SysEx memory-dump device, not a live LED/LCD feedback surface.",
            "The existing MAP2 route is already strong and should be folded into the shared stack as the SysEx-specialized branch.",
        ],
        "transport_layers": [
            {"layer_id": "sysex-import-export", "label": "SysEx import/export", "kind": "sysex"},
            {"layer_id": "rtmidi-transport", "label": "Port transport", "kind": "midi"},
        ],
    },
    {
        "unit_id": "meloaudio-midi-commander",
        "display_name": "MeloAudio MIDI Commander",
        "family": "meloaudio",
        "device_type": "midi_controller",
        "specialized_route": "/midi-commander",
        "detection": {
            "vid_pid": [],
            "name_patterns": ["midi commander", "meloaudio", "tsmidi", "ts midi"],
        },
        "capabilities": [
            "footswitches",
            "expression pedals",
            "profile-based mapping",
            "calibration",
        ],
        "integration_notes": [
            "The current repo already treats MIDI Commander as a profile-driven controller with calibration and DFU-oriented UI.",
        ],
        "transport_layers": [
            {"layer_id": "midi-profile", "label": "Profile-driven MIDI mapping", "kind": "midi"},
        ],
    },
    {
        "unit_id": "novation-launch-control",
        "display_name": "Novation Launch Control Family",
        "family": "launch-control",
        "device_type": "midi_controller",
        "specialized_route": "/launch-control",
        "detection": {
            "vid_pid": [],
            "name_patterns": ["launch control", "launchcontrol", "launch control xl"],
        },
        "capabilities": [
            "knobs",
            "pads/buttons",
            "LED feedback",
            "template-driven MIDI control",
        ],
        "integration_notes": [
            "Launch Control belongs in the shared controller branch with LED feedback and profile/template management, not in a one-off isolated route.",
        ],
        "transport_layers": [
            {"layer_id": "midi-profile", "label": "Profile-driven MIDI mapping", "kind": "midi"},
            {"layer_id": "led-feedback", "label": "Pad and button feedback", "kind": "feedback"},
        ],
    },
    {
        "unit_id": "mackie-mcu-pro",
        "display_name": "Mackie MCU Pro",
        "family": "mcu-pro",
        "device_type": "mcu_surface",
        "specialized_route": "/mcu",
        "detection": {
            "vid_pid": [],
            "name_patterns": ["mackie mcu", "mcu pro", "mackie control", "mackie control universal"],
        },
        "capabilities": [
            "motor faders",
            "VPots",
            "transport",
            "scribble strips",
            "meter bridge",
        ],
        "integration_notes": [
            "MCU Pro should live behind an MCU-oriented protocol branch with explicit support for motorized faders and scribble-strip feedback.",
        ],
        "transport_layers": [
            {"layer_id": "mcu-protocol", "label": "MCU protocol", "kind": "midi"},
            {"layer_id": "motor-fader-feedback", "label": "Motor and display feedback", "kind": "feedback"},
        ],
    },
]


def _read_text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8").strip()
    except Exception:
        return None


def _walk_usb_ancestry(start_path: Path | None) -> dict[str, Any]:
    if start_path is None:
        return {}

    for candidate in [start_path, *start_path.parents]:
        vendor_id = _read_text(candidate / "idVendor")
        product_id = _read_text(candidate / "idProduct")
        if not vendor_id or not product_id:
            continue
        return {
            "vendor_id": vendor_id.lower(),
            "product_id": product_id.lower(),
            "manufacturer": _read_text(candidate / "manufacturer"),
            "product": _read_text(candidate / "product"),
            "serial": _read_text(candidate / "serial"),
            "usb_path": str(candidate),
            "busnum": _read_text(candidate / "busnum"),
            "devnum": _read_text(candidate / "devnum"),
            "speed": _read_text(candidate / "speed"),
        }
    return {}


def _scan_usb_devices() -> list[dict[str, Any]]:
    devices: list[dict[str, Any]] = []
    for entry in sorted(Path("/sys/bus/usb/devices").glob("*")):
        if ":" in entry.name:
            continue
        vendor_id = _read_text(entry / "idVendor")
        product_id = _read_text(entry / "idProduct")
        if not vendor_id or not product_id:
            continue
        devices.append(
            {
                "sys_name": entry.name,
                "vendor_id": vendor_id.lower(),
                "product_id": product_id.lower(),
                "manufacturer": _read_text(entry / "manufacturer"),
                "product": _read_text(entry / "product"),
                "serial": _read_text(entry / "serial"),
                "busnum": _read_text(entry / "busnum"),
                "devnum": _read_text(entry / "devnum"),
                "speed": _read_text(entry / "speed"),
            }
        )
    return devices


def _scan_sound_cards() -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    sound_root = Path("/sys/class/sound")
    for card_link in sorted(sound_root.glob("card[0-9]*")):
        card_name = card_link.name
        card_index = int(card_name.removeprefix("card"))
        device_path = None
        with contextlib.suppress(Exception):
            device_path = (card_link / "device").resolve()

        proc_card_path = Path(f"/proc/asound/card{card_index}")
        midi_nodes: list[dict[str, Any]] = []
        if proc_card_path.exists():
            for midi_file in sorted(proc_card_path.glob("midi*")):
                first_line = _read_text(midi_file)
                midi_nodes.append(
                    {
                        "node": midi_file.name,
                        "name": first_line.splitlines()[0] if first_line else midi_file.name,
                    }
                )

        cards.append(
            {
                "card_index": card_index,
                "alsa_id": _read_text(card_link / "id"),
                "device_path": str(device_path) if device_path is not None else None,
                "midi_nodes": midi_nodes,
                "has_midi": bool(midi_nodes),
                **_walk_usb_ancestry(device_path),
            }
        )
    return cards


def _candidate_strings(*values: Any) -> list[str]:
    candidates: list[str] = []
    for value in values:
        if isinstance(value, str):
            stripped = value.strip()
            if stripped:
                candidates.append(stripped.lower())
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, str) and item.strip():
                    candidates.append(item.strip().lower())
                elif isinstance(item, dict):
                    for nested_value in item.values():
                        if isinstance(nested_value, str) and nested_value.strip():
                            candidates.append(nested_value.strip().lower())
    return candidates


def _matches_surface(
    surface: dict[str, Any],
    *,
    usb_devices: list[dict[str, Any]],
    sound_cards: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    detection = surface.get("detection", {})
    vid_pid_values = {value.lower() for value in detection.get("vid_pid", []) if isinstance(value, str)}
    name_patterns = [str(value).strip().lower() for value in detection.get("name_patterns", []) if str(value).strip()]

    matched_usb: list[dict[str, Any]] = []
    for device in usb_devices:
        vid_pid = f"{device.get('vendor_id')}:{device.get('product_id')}"
        device_candidates = _candidate_strings(device.get("manufacturer"), device.get("product"), device.get("serial"))
        if vid_pid_values and vid_pid in vid_pid_values:
            matched_usb.append(deepcopy(device))
            continue
        if name_patterns and any(pattern in candidate for pattern in name_patterns for candidate in device_candidates):
            matched_usb.append(deepcopy(device))

    matched_cards: list[dict[str, Any]] = []
    for card in sound_cards:
        vid_pid = f"{card.get('vendor_id')}:{card.get('product_id')}"
        card_candidates = _candidate_strings(
            card.get("alsa_id"),
            card.get("manufacturer"),
            card.get("product"),
            card.get("midi_nodes"),
        )
        if vid_pid_values and vid_pid in vid_pid_values:
            matched_cards.append(deepcopy(card))
            continue
        if name_patterns and any(pattern in candidate for pattern in name_patterns for candidate in card_candidates):
            matched_cards.append(deepcopy(card))

    return matched_usb, matched_cards


def _match_midi_hub_devices(unit_id: str, devices: list[dict[str, Any]]) -> list[dict[str, Any]]:
    profile_ids = _SURFACE_PROFILE_IDS.get(unit_id, set())
    if not profile_ids:
        return []
    matches: list[dict[str, Any]] = []
    for device in devices:
        profile_id = str(device.get("profile_id") or "").strip()
        if profile_id in profile_ids:
            matches.append(deepcopy(device))
    return matches


def _resolve_profile_payload(
    profiles: list[dict[str, Any]],
    matched_midi_devices: list[dict[str, Any]],
) -> dict[str, Any]:
    matched_profile_ids = {
        str(device.get("profile_id") or "").strip()
        for device in matched_midi_devices
        if str(device.get("profile_id") or "").strip()
    }
    for profile in profiles:
        profile_id = str(profile.get("profile_id") or "").strip()
        if profile_id in matched_profile_ids:
            return deepcopy(profile)
    return {}


def _has_python_module(module_name: str) -> bool:
    return importlib.util.find_spec(module_name) is not None


class EnrichedMidiPhysicalSurfacesService(Singleton):
    """Unifies host detection, runtime state, and capability metadata."""

    async def get_summary(self) -> dict[str, Any]:
        usb_devices = _scan_usb_devices()
        sound_cards = _scan_sound_cards()
        maschine_status = get_maschine_service().get_status()
        maschine_hid_history = get_maschine_service().get_hid_history(limit=50)
        push_health = await self._get_push_health()
        push_snapshot = await self._get_push_snapshot()
        ground_control_state = await self._get_ground_control_state()
        launch_control_state = await self._get_launch_control_state()
        midi_commander_state = await self._get_midi_commander_state()
        mcu_state = await self._get_mcu_state()
        midi_hub_inventory = await self._get_midi_hub_inventory()
        midi_hub_devices = [
            deepcopy(device)
            for device in midi_hub_inventory.get("devices", [])
            if isinstance(device, dict)
        ]
        midi_hub_profiles = [
            deepcopy(profile)
            for profile in midi_hub_inventory.get("profiles", [])
            if isinstance(profile, dict)
        ]
        meloaudio_profile_state = self._get_meloaudio_profile_state()
        session_service = get_enriched_surface_session_service()

        units: list[dict[str, Any]] = []
        for catalog_entry in _SURFACE_CATALOG:
            unit = deepcopy(catalog_entry)
            matched_usb, matched_cards = _matches_surface(
                catalog_entry,
                usb_devices=usb_devices,
                sound_cards=sound_cards,
            )
            matched_midi_devices = _match_midi_hub_devices(str(unit["unit_id"]), midi_hub_devices)
            unit["matched_usb_devices"] = matched_usb
            unit["matched_sound_cards"] = matched_cards
            unit["matched_midi_devices"] = matched_midi_devices
            unit["host_detected"] = bool(matched_usb or matched_cards or matched_midi_devices)
            if str(unit["unit_id"]) == "ground-control-pro" and not unit["host_detected"]:
                unit["host_detected"] = bool(
                    (ground_control_state.get("inputs") or []) or (ground_control_state.get("outputs") or [])
                )
            unit["status"] = self._resolve_unit_status(
                unit_id=str(unit["unit_id"]),
                host_detected=bool(unit["host_detected"]),
                maschine_status=maschine_status,
                push_health=push_health,
                ground_control_state=ground_control_state,
                matched_midi_devices=matched_midi_devices,
                meloaudio_profile_state=meloaudio_profile_state,
            )
            unit["status_reason"] = self._resolve_status_reason(
                unit_id=str(unit["unit_id"]),
                host_detected=bool(unit["host_detected"]),
                maschine_status=maschine_status,
                push_health=push_health,
                ground_control_state=ground_control_state,
                matched_midi_devices=matched_midi_devices,
                meloaudio_profile_state=meloaudio_profile_state,
            )
            unit["service_state"] = self._build_service_state(
                unit_id=str(unit["unit_id"]),
                maschine_status=maschine_status,
                maschine_hid_history=maschine_hid_history,
                push_health=push_health,
                push_snapshot=push_snapshot,
                ground_control_state=ground_control_state,
                matched_midi_devices=matched_midi_devices,
                midi_hub_profiles=midi_hub_profiles,
                meloaudio_profile_state=meloaudio_profile_state,
                launch_control_state=launch_control_state,
                midi_commander_state=midi_commander_state,
                mcu_state=mcu_state,
            )
            unit["transport_layers"] = self._resolve_transport_layers(
                unit,
                maschine_status=maschine_status,
                push_health=push_health,
                ground_control_state=ground_control_state,
                matched_midi_devices=matched_midi_devices,
                meloaudio_profile_state=meloaudio_profile_state,
            )
            unit["firmware_posture"] = self._resolve_firmware_posture(str(unit["unit_id"]))
            unit["view_state"] = build_unit_view_state(
                str(unit["unit_id"]),
                service_state=unit["service_state"],
                host_detected=bool(unit["host_detected"]),
            )
            unit["surface_lab"] = build_surface_lab(str(unit["unit_id"]))
            unit["surface_lab"]["snapshot"] = build_surface_lab_snapshot(
                str(unit["unit_id"]),
                unit["service_state"],
            )
            derived_recent_target = build_unit_recent_target(
                str(unit["unit_id"]),
                service_state=unit["service_state"],
            )
            session_state = await session_service.resolve_session(
                str(unit["unit_id"]),
                derived_view_id=str(unit["view_state"]["current_view_id"]),
                derived_view_source=str(unit["view_state"]["current_view_source"]),
                available_view_ids=get_unit_view_ids(str(unit["unit_id"])),
                derived_recent_target=derived_recent_target,
            )
            unit["view_state"]["current_view_id"] = session_state["current_view_id"]
            unit["view_state"]["current_view_label"] = self._resolve_current_view_label(
                unit["view_state"].get("views") or [],
                str(session_state["current_view_id"]),
            )
            unit["view_state"]["current_view_source"] = session_state["current_view_source"]
            unit["view_state"]["recent_target"] = session_state["recent_target"]
            unit["view_state"]["is_override_active"] = bool(session_state["is_override_active"])
            unit["operator_session"] = session_state
            units.append(unit)

        notifications = [
            {
                "id": f"surface-reconnect-{unit['unit_id']}-{notification['emitted_at']}",
                "unit_id": unit["unit_id"],
                "display_name": unit["display_name"],
                **notification,
            }
            for unit in units
            for notification in [build_reconnect_runtime(str(unit["unit_id"]), unit["service_state"]).get("notification")]
            if isinstance(notification, dict)
        ]

        return {
            "stack_name": STACK_NAME,
            "summary_generated_at": self._timestamp(),
            "shared_operator_contract": build_shared_operator_contract(),
            "notifications": notifications,
            "host_observations": {
                "usb_devices": usb_devices,
                "sound_cards": sound_cards,
                "midi_hub_devices": midi_hub_devices,
                "python_modules": {
                    "hid": _has_python_module("hid"),
                    "rtmidi": _has_python_module("rtmidi"),
                },
                "maschinen_mk1_host_note": (
                    "Current host sees Maschine as Native Instruments 17cc:0808 on snd-usb-caiaq with MIDI exposure but no PCM stream; "
                    "existing MK1 daemon expects hidapi, so LCD/LED enrichment needs a shared vendor-transport path."
                ),
            },
            "units": units,
        }

    @staticmethod
    def _timestamp() -> str:
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    @staticmethod
    def _resolve_current_view_label(views: list[dict[str, Any]], current_view_id: str) -> str:
        for view in views:
            if str(view.get("view_id") or "") == current_view_id:
                return str(view.get("label") or current_view_id)
        return current_view_id.replace("-", " ").title()

    async def _get_push_health(self) -> dict[str, Any]:
        try:
            return await get_push_surface_manager().get_health()
        except Exception as exc:
            return {"error": str(exc)}

    async def _get_push_snapshot(self) -> dict[str, Any]:
        try:
            return await get_push_surface_manager().get_state_snapshot()
        except Exception as exc:
            return {"error": str(exc)}

    async def _get_ground_control_state(self) -> dict[str, Any]:
        try:
            service = get_ground_control_pro_service()
            ports = await service.get_ports()
            active_jobs = [
                job
                for job in service.jobs.values()
                if getattr(job, "status", None) == "running"
            ]
            return {
                **ports,
                "session_count": len(service.sessions),
                "artifact_count": len(service.artifacts),
                "job_count": len(service.jobs),
                "active_job_count": len(active_jobs),
            }
        except Exception as exc:
            return {"error": str(exc)}

    async def _get_launch_control_state(self) -> dict[str, Any]:
        try:
            service = get_launch_control_surface_service()
            return service.get_state_snapshot()
        except Exception as exc:
            return {"error": str(exc)}

    async def _get_midi_commander_state(self) -> dict[str, Any]:
        try:
            service = get_midi_commander_surface_service()
            return service.get_state_snapshot()
        except Exception as exc:
            return {"error": str(exc)}

    async def _get_mcu_state(self) -> dict[str, Any]:
        try:
            service = get_mcu_surface_service()
            return service.get_state_snapshot()
        except Exception as exc:
            return {"error": str(exc)}

    async def _get_midi_hub_inventory(self) -> dict[str, Any]:
        try:
            return await get_midi_device_registry().inspect_local_ports()
        except Exception as exc:
            return {"count": 0, "devices": [], "profiles": [], "error": str(exc)}

    @staticmethod
    def _get_meloaudio_profile_state() -> dict[str, Any]:
        try:
            profile = device_profile_service.get_profile("meloaudio_midi_commander")
            active_profile = device_profile_service.get_active_profile()
            active_profile_id = str(active_profile.get("profile_id") or "").strip() if isinstance(active_profile, dict) else ""
            return {
                "profile": deepcopy(profile) if isinstance(profile, dict) else {},
                "active_profile": deepcopy(active_profile) if isinstance(active_profile, dict) else {},
                "active_profile_id": active_profile_id or None,
                "current_bank": int(device_profile_service.get_current_bank("meloaudio_midi_commander")),
                "expression_calibrations": deepcopy(device_profile_service.get_all_expression_calibrations()),
            }
        except Exception as exc:
            return {
                "profile": {},
                "active_profile": {},
                "active_profile_id": None,
                "current_bank": 0,
                "expression_calibrations": {},
                "error": str(exc),
            }

    @staticmethod
    def _resolve_unit_status(
        *,
        unit_id: str,
        host_detected: bool,
        maschine_status: dict[str, Any],
        push_health: dict[str, Any],
        ground_control_state: dict[str, Any],
        matched_midi_devices: list[dict[str, Any]],
        meloaudio_profile_state: dict[str, Any],
    ) -> str:
        if unit_id == "maschine-mk1":
            if maschine_status.get("connected"):
                return "online"
            return "detected" if host_detected else "planned"
        if unit_id == "ableton-push":
            if push_health.get("active_device"):
                return "online"
            discovery = push_health.get("discovery") or {}
            if discovery.get("matched_device") or host_detected:
                return "detected"
            return "planned"
        if unit_id == "ground-control-pro":
            if int(ground_control_state.get("session_count") or 0) > 0:
                return "online"
            inputs = (ground_control_state.get("inputs") or []) if isinstance(ground_control_state, dict) else []
            outputs = (ground_control_state.get("outputs") or []) if isinstance(ground_control_state, dict) else []
            if inputs or outputs:
                return "detected"
            return "planned"
        if unit_id == "meloaudio-midi-commander":
            if device_profile_service.is_meloaudio_profile_id(str(meloaudio_profile_state.get("active_profile_id") or "")):
                return "online"
            return "detected" if matched_midi_devices or host_detected else "planned"
        if unit_id == "novation-launch-control":
            return "detected" if matched_midi_devices or host_detected else "planned"
        if unit_id == "mackie-mcu-pro":
            return "detected" if matched_midi_devices or host_detected else "planned"
        return "detected" if host_detected else "planned"

    @staticmethod
    def _resolve_status_reason(
        *,
        unit_id: str,
        host_detected: bool,
        maschine_status: dict[str, Any],
        push_health: dict[str, Any],
        ground_control_state: dict[str, Any],
        matched_midi_devices: list[dict[str, Any]],
        meloaudio_profile_state: dict[str, Any],
    ) -> str:
        if unit_id == "maschine-mk1":
            if maschine_status.get("connected"):
                transport = maschine_status.get("transport") if isinstance(maschine_status.get("transport"), dict) else {}
                transport_id = str(transport.get("transport_id") or "unknown")
                return f"Maschine daemon is registered and the enriched surface path is online through {transport_id}."
            if host_detected:
                transport = maschine_status.get("transport") if isinstance(maschine_status.get("transport"), dict) else {}
                candidates = transport.get("candidates") if isinstance(transport.get("candidates"), list) else []
                connectable = [
                    str(candidate.get("transport_id") or "")
                    for candidate in candidates
                    if isinstance(candidate, dict) and candidate.get("connectable")
                ]
                if connectable:
                    return f"USB hardware is present on this host; richer feedback transport candidates are available: {', '.join(connectable)}."
                return "USB hardware is present on this host; shared rich-feedback transport still needs to sit above the raw MIDI exposure."
            return "Maschine hardware is not currently detected."
        if unit_id == "ableton-push":
            if push_health.get("active_device"):
                return "Push surface manager has an active matched device."
            if push_health.get("error"):
                return f"Push health probe failed: {push_health['error']}"
            if host_detected:
                return "Push-class USB names are visible, but the shared Push manager has not claimed an active device."
            return "No Push-class device is currently active."
        if unit_id == "ground-control-pro":
            if isinstance(ground_control_state, dict) and ground_control_state.get("error"):
                return f"Ground Control port probe failed: {ground_control_state['error']}"
            session_count = int(ground_control_state.get("session_count") or 0)
            if session_count > 0:
                return f"Ground Control Pro has {session_count} active SysEx session(s) inside the shared stack."
            inputs = len(ground_control_state.get("inputs") or [])
            outputs = len(ground_control_state.get("outputs") or [])
            if inputs or outputs:
                return f"Ground Control Pro exposes {inputs} input(s) and {outputs} output(s) for the shared SysEx branch."
            return "Ground Control Pro remains a transport-selected SysEx device path."
        if unit_id == "meloaudio-midi-commander":
            if device_profile_service.is_meloaudio_profile_id(str(meloaudio_profile_state.get("active_profile_id") or "")):
                calibration_count = len(meloaudio_profile_state.get("expression_calibrations") or {})
                return (
                    "MeloAudio MIDI Commander is the active MIDI profile "
                    f"with bank {int(meloaudio_profile_state.get('current_bank') or 0) + 1} and "
                    f"{calibration_count} calibrated expression path(s)."
                )
            if matched_midi_devices:
                return f"MIDI Hub matched {len(matched_midi_devices)} MeloAudio MIDI Commander device(s) on this host."
        if unit_id == "novation-launch-control":
            if matched_midi_devices:
                return f"MIDI Hub matched {len(matched_midi_devices)} Launch Control-family device(s) for the shared template branch."
        if unit_id == "mackie-mcu-pro":
            if matched_midi_devices:
                return f"MIDI Hub matched {len(matched_midi_devices)} Mackie MCU Pro device(s) for the shared MCU branch."
        if host_detected:
            return "Host-side detection matched this surface family."
        return "No matching hardware is currently visible on this host."

    @staticmethod
    def _build_service_state(
        *,
        unit_id: str,
        maschine_status: dict[str, Any],
        maschine_hid_history: list[dict[str, Any]],
        push_health: dict[str, Any],
        push_snapshot: dict[str, Any],
        ground_control_state: dict[str, Any],
        matched_midi_devices: list[dict[str, Any]],
        midi_hub_profiles: list[dict[str, Any]],
        meloaudio_profile_state: dict[str, Any],
        launch_control_state: dict[str, Any],
        midi_commander_state: dict[str, Any],
        mcu_state: dict[str, Any],
    ) -> dict[str, Any]:
        if unit_id == "maschine-mk1":
            return {
                "daemon_connected": bool(maschine_status.get("connected")),
                "websocket_connected": bool(maschine_status.get("websocket_connected")),
                "virtual_port_name": maschine_status.get("virtual_port_name"),
                "firmware_info": deepcopy(maschine_status.get("firmware_info") or {}),
                "audio_grid": deepcopy(maschine_status.get("audio_grid") or {}),
                "lcd": deepcopy(maschine_status.get("lcd") or {}),
                "led_state": deepcopy(maschine_status.get("led_state") or {}),
                "transport": deepcopy(maschine_status.get("transport") or {}),
                "transport_candidates": deepcopy(maschine_status.get("transport_candidates") or []),
                "last_seen_at": maschine_status.get("last_seen_at"),
                "hid_history_depth": len(maschine_hid_history),
                "last_event_type": maschine_status.get("last_event_type"),
                "reconnect_count": int(maschine_status.get("reconnect_count") or 0),
                "last_repush_at": maschine_status.get("last_repush_at"),
                "notification": deepcopy(maschine_status.get("notification")),
            }
        if unit_id == "ableton-push":
            return {
                "running": bool(push_health.get("running")),
                "active_device": deepcopy(push_health.get("active_device")),
                "discovery": deepcopy(push_health.get("discovery") or {}),
                "active_page": push_snapshot.get("active_page"),
                "snapshot_state": deepcopy(push_snapshot.get("state") or {}),
                "welcome_runtime": deepcopy(push_snapshot.get("welcome_runtime") or {}),
                "midi_events_in": push_health.get("midi_events_in"),
                "midi_events_out": push_health.get("midi_events_out"),
                "reconnect_count": int(push_health.get("reconnect_count") or 0),
                "last_seen_at": push_health.get("last_seen_at"),
                "last_repush_at": push_health.get("last_repush_at"),
                "notification": deepcopy(push_health.get("notification")),
                "last_capability_dump": deepcopy(push_health.get("last_capability_dump")),
                "last_diagnostics_export": push_health.get("last_diagnostics_export"),
            }
        if unit_id == "ground-control-pro":
            return deepcopy(ground_control_state)
        if unit_id == "meloaudio-midi-commander":
            return {
                "profile": deepcopy(meloaudio_profile_state.get("profile") or {}),
                "active_profile": deepcopy(meloaudio_profile_state.get("active_profile") or {}),
                "active_profile_id": meloaudio_profile_state.get("active_profile_id"),
                "current_bank": int(meloaudio_profile_state.get("current_bank") or 0),
                "calibration_count": len(meloaudio_profile_state.get("expression_calibrations") or {}),
                "detected_device_count": len(matched_midi_devices),
                "detected_devices": deepcopy(matched_midi_devices),
                "daemon_status": deepcopy(midi_commander_state.get("daemon_status") or {}),
                "active_snapshot_mapping": deepcopy(midi_commander_state.get("active_snapshot_mapping") or {}),
                "last_activation_push": deepcopy(midi_commander_state.get("last_activation_push") or {}),
            }
        if unit_id == "novation-launch-control":
            profile = _resolve_profile_payload(midi_hub_profiles, matched_midi_devices)
            return {
                "profile": profile,
                "display_capabilities": deepcopy(profile.get("metadata", {}).get("display_capabilities") or {}),
                "detected_device_count": len(matched_midi_devices),
                "detected_devices": deepcopy(matched_midi_devices),
                "template_state_by_port": deepcopy(launch_control_state.get("template_state_by_port") or {}),
                "push_count": int(launch_control_state.get("push_count") or 0),
                "last_push": deepcopy(launch_control_state.get("last_push") or {}),
                "daemon_status": deepcopy(launch_control_state.get("daemon_status") or {}),
                "active_snapshot_mapping": deepcopy(launch_control_state.get("active_snapshot_mapping") or {}),
                "last_activation_push": deepcopy(launch_control_state.get("last_activation_push") or {}),
            }
        if unit_id == "mackie-mcu-pro":
            profile = _resolve_profile_payload(midi_hub_profiles, matched_midi_devices)
            return {
                "profile": profile,
                "display_capabilities": deepcopy(profile.get("metadata", {}).get("display_capabilities") or {}),
                "detected_device_count": len(matched_midi_devices),
                "detected_devices": deepcopy(matched_midi_devices),
                "daemon_status": deepcopy(mcu_state.get("daemon_status") or {}),
                "identity": deepcopy(mcu_state.get("identity") or {}),
                "last_activation_push": deepcopy(mcu_state.get("last_activation_push") or {}),
            }
        return {}

    @staticmethod
    def _resolve_transport_layers(
        unit: dict[str, Any],
        *,
        maschine_status: dict[str, Any],
        push_health: dict[str, Any],
        ground_control_state: dict[str, Any],
        matched_midi_devices: list[dict[str, Any]],
        meloaudio_profile_state: dict[str, Any],
    ) -> list[dict[str, Any]]:
        layers = deepcopy(unit.get("transport_layers") or [])
        unit_id = str(unit.get("unit_id") or "")
        for layer in layers:
            layer["status"] = "planned"
            layer["detail"] = "Planned for the shared surface stack."

        if unit_id == "maschine-mk1":
            transport = maschine_status.get("transport") if isinstance(maschine_status.get("transport"), dict) else {}
            selected_transport = str(transport.get("transport_id") or "none")
            candidates = transport.get("candidates") if isinstance(transport.get("candidates"), list) else []
            connectable = [
                str(candidate.get("transport_id") or "")
                for candidate in candidates
                if isinstance(candidate, dict) and candidate.get("connectable")
            ]
            for layer in layers:
                if layer["layer_id"] == "alsa-midi":
                    layer["status"] = "online" if unit.get("host_detected") else "planned"
                    layer["detail"] = "Kernel host path is available through snd-usb-caiaq / ALSA MIDI."
                elif layer["layer_id"] == "vendor-bulk-feedback":
                    if maschine_status.get("connected"):
                        layer["status"] = "online"
                        layer["detail"] = f"Maschine daemon reports the richer feedback path as connected through {selected_transport}."
                    elif unit.get("host_detected"):
                        layer["status"] = "attention"
                        layer["detail"] = (
                            f"Hardware is present and the daemon now probes host-aware rich transport candidates. "
                            f"Current selected transport is {selected_transport}; connectable candidates: {', '.join(connectable) if connectable else 'none'}."
                        )
            return layers

        if unit_id == "ableton-push":
            active_device = push_health.get("active_device")
            for layer in layers:
                layer["status"] = "online" if active_device else "planned"
                layer["detail"] = (
                    "Push manager has an active matched device."
                    if active_device
                    else "Shared Push transport is present in the repo but no active device is currently matched."
                )
            return layers

        if unit_id == "ground-control-pro":
            ports_available = bool((ground_control_state.get("inputs") or []) or (ground_control_state.get("outputs") or []))
            session_count = int(ground_control_state.get("session_count") or 0)
            for layer in layers:
                if layer["layer_id"] == "sysex-import-export":
                    layer["status"] = "online" if session_count > 0 else ("detected" if ports_available else "planned")
                    layer["detail"] = (
                        f"{session_count} active session(s) are loaded through the shared SysEx workflow."
                        if session_count > 0
                        else (
                            "MIDI transport ports are available for SysEx backup/push."
                            if ports_available
                            else "Ground Control transport requires explicit MIDI port selection."
                        )
                    )
                else:
                    connected_inputs = len(
                        [port for port in ground_control_state.get("inputs") or [] if isinstance(port, dict) and port.get("connected")]
                    )
                    connected_outputs = len(
                        [port for port in ground_control_state.get("outputs") or [] if isinstance(port, dict) and port.get("connected")]
                    )
                    layer["status"] = "detected" if ports_available else "planned"
                    layer["detail"] = (
                        f"Connected transport ports: {connected_inputs} input(s), {connected_outputs} output(s)."
                        if ports_available
                        else "Ground Control transport requires explicit MIDI port selection."
                    )
            return layers

        if unit_id == "meloaudio-midi-commander":
            active_profile_id = str(meloaudio_profile_state.get("active_profile_id") or "")
            calibration_count = len(meloaudio_profile_state.get("expression_calibrations") or {})
            for layer in layers:
                if device_profile_service.is_meloaudio_profile_id(active_profile_id):
                    layer["status"] = "online"
                    layer["detail"] = (
                        "MeloAudio is the active MIDI v2 profile "
                        f"with bank {int(meloaudio_profile_state.get('current_bank') or 0) + 1} and "
                        f"{calibration_count} calibrated expression path(s)."
                    )
                elif matched_midi_devices:
                    layer["status"] = "detected"
                    layer["detail"] = "MIDI Hub matched MeloAudio MIDI Commander hardware; the shared profile branch is available."
                else:
                    layer["status"] = "planned"
                    layer["detail"] = "Waiting for a matched MIDI Commander device or an active profile selection."
            return layers

        if unit_id == "novation-launch-control":
            for layer in layers:
                if not matched_midi_devices:
                    continue
                if layer["layer_id"] == "midi-profile":
                    layer["status"] = "detected"
                    layer["detail"] = "MIDI Hub matched Launch Control-family hardware for the shared template/profile branch."
                else:
                    layer["status"] = "attention"
                    layer["detail"] = "Hardware is visible; dedicated LED/template runtime handling still needs the richer shared feedback path."
            return layers

        if unit_id == "mackie-mcu-pro":
            for layer in layers:
                if not matched_midi_devices:
                    continue
                if layer["layer_id"] == "mcu-protocol":
                    layer["status"] = "detected"
                    layer["detail"] = "MIDI Hub matched Mackie MCU Pro hardware for the shared MCU protocol branch."
                else:
                    layer["status"] = "attention"
                    layer["detail"] = "Hardware is visible, but motor-fader and scribble-strip feedback still need the dedicated MCU runtime branch."
            return layers

        if unit.get("host_detected"):
            for layer in layers:
                layer["status"] = "detected"
                layer["detail"] = "Matching hardware is visible on this host."
        return layers

    @staticmethod
    def _resolve_firmware_posture(unit_id: str) -> dict[str, Any]:
        if unit_id == "maschine-mk1":
            return {
                "status": "official-ni-downloads-plus-legacy-midi-templates",
                "detail": (
                    "Native Instruments still publishes MK1 downloads, firmware/drivers, and Controller Editor template tooling, "
                    "but MAP2 should keep runtime enrichment separate from NI utilities. On this host the unit is visible through "
                    "snd-usb-caiaq and ALSA MIDI, so LCD/LED depth needs a dedicated vendor transport above the stock MIDI path."
                ),
            }
        if unit_id == "ableton-push":
            return {
                "status": "official-live-managed-firmware",
                "detail": (
                    "Push 2 and Push 3 firmware should stay on Ableton's official Live-managed update path. "
                    "MAP2 should target runtime integration and user/control modes, not replace Ableton's firmware flow."
                ),
            }
        if unit_id == "ground-control-pro":
            return {
                "status": "official-eprom-plus-sysex-memory",
                "detail": (
                    "Ground Control Pro uses MIDI/SysEx for memory backup and restore, while official firmware updates are handled "
                    "as replacement EPROM upgrades through Voodoo Lab. MAP2 should stay focused on safe SysEx workflows."
                ),
            }
        if unit_id == "meloaudio-midi-commander":
            return {
                "status": "legacy-vendor-dfu-plus-community-custom",
                "detail": (
                    "Keep the stock DFU/update path optional in the UI, but treat present-day vendor support as legacy until reverified. "
                    "Community custom firmware exists and uses the normal DFU flow, so MAP2 should isolate it behind an explicit advanced path."
                ),
            }
        if unit_id == "novation-launch-control":
            return {
                "status": "official-components-managed",
                "detail": (
                    "Launch Control firmware and template management should align with Novation Components. "
                    "Older MK1/XL MK1/2 units use bootloader entry on connect, while Launch Control 3 and XL 3 add richer Components-managed custom modes."
                ),
            }
        if unit_id == "mackie-mcu-pro":
            return {
                "status": "official-midi-file-updater",
                "detail": (
                    "MCU Pro has an official MIDI-file firmware update path and established Mackie Control / HUI / Logic Control modes. "
                    "MAP2 should prioritize protocol depth first and surface firmware flashing as an explicit maintenance operation."
                ),
            }
        return {
            "status": "unknown",
            "detail": "No firmware posture has been assigned yet.",
        }


def get_enriched_midi_physical_surfaces_service() -> EnrichedMidiPhysicalSurfacesService:
    return EnrichedMidiPhysicalSurfacesService.get_instance()


def reset_enriched_midi_physical_surfaces_service() -> None:
    EnrichedMidiPhysicalSurfacesService.reset_instance()
