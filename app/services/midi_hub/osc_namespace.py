"""Hierarchical OSC namespace router for MAP2 MIDI Hub."""

from __future__ import annotations

import asyncio
import time
from typing import Any, Dict, List, Optional

from app.services.midi_hub.clock_engine import MidiClockEngine, get_midi_clock_engine
from app.services.midi_hub.event_list_service import MidiHubEventListService, get_midi_hub_event_list_service
from app.services.midi_hub.macros import MidiMacroService, get_midi_macro_service
from app.services.midi_hub.preset_service import MidiHubPresetService, get_midi_hub_preset_service
from app.services.midi_hub.virtual_gpio import VirtualGpioService, get_virtual_gpio_service


class OscNamespaceRouter:
    def __init__(
        self,
        *,
        clock_engine: Optional[MidiClockEngine] = None,
        preset_service: Optional[MidiHubPresetService] = None,
        macro_service: Optional[MidiMacroService] = None,
        event_list_service: Optional[MidiHubEventListService] = None,
        virtual_gpio: Optional[VirtualGpioService] = None,
    ) -> None:
        self._clock = clock_engine or get_midi_clock_engine()
        self._presets = preset_service or get_midi_hub_preset_service()
        self._macros = macro_service or get_midi_macro_service()
        self._event_lists = event_list_service or get_midi_hub_event_list_service()
        self._gpio = virtual_gpio or get_virtual_gpio_service()
        self._plugin_state: Dict[str, Dict[str, Any]] = {}
        self._events: List[Dict[str, Any]] = []

    def recent_events(self, limit: int = 40) -> List[Dict[str, Any]]:
        return [dict(event) for event in self._events[-max(1, min(500, int(limit))):]]

    def _publish(self, address: str, value: Any, *, source: str = "namespace", metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        event = {
            "address": address,
            "value": value,
            "source": source,
            "metadata": dict(metadata or {}),
            "timestamp": time.time(),
        }
        self._events.append(event)
        return event

    async def dispatch(self, address: str, value: Any = None, *, source: str = "osc") -> Dict[str, Any]:
        path = [segment for segment in str(address or "").strip().split("/") if segment]
        if not path or path[0] != "map2":
            return {"ok": False, "reason": "unsupported_address", "address": address}

        if path[1:] == ["transport", "bpm"]:
            if value is not None:
                self._clock.configure(bpm=float(value))
            status = self._clock.status()
            event = self._publish("/map2/out/transport/bpm", status["bpm"], source=source)
            return {"ok": True, "address": address, "value": status["bpm"], "events": [event]}

        if path[1:] == ["transport", "start"]:
            status = await self._clock.start()
            return {"ok": True, "address": address, "value": status["running"], "events": [self._publish("/map2/out/transport/start", status["running"], source=source)]}

        if path[1:] == ["transport", "stop"]:
            status = await self._clock.stop()
            return {"ok": True, "address": address, "value": status["running"], "events": [self._publish("/map2/out/transport/stop", status["running"], source=source)]}

        if path[1:] == ["transport", "continue"]:
            status = await self._clock.cont()
            return {"ok": True, "address": address, "value": status["running"], "events": [self._publish("/map2/out/transport/continue", status["running"], source=source)]}

        if len(path) == 5 and path[1] == "plugin" and path[3] == "param":
            plugin_id = path[2]
            param_name = path[4]
            self._plugin_state.setdefault(plugin_id, {"params": {}, "bypass": False})
            if value is not None:
                self._plugin_state[plugin_id]["params"][param_name] = value
            current = self._plugin_state[plugin_id]["params"].get(param_name, value if value is not None else 0.0)
            return {
                "ok": True,
                "address": address,
                "value": current,
                "events": [self._publish(f"/map2/out/plugin/{plugin_id}/param/{param_name}", current, source=source)],
            }

        if len(path) == 4 and path[1] == "plugin" and path[3] == "bypass":
            plugin_id = path[2]
            self._plugin_state.setdefault(plugin_id, {"params": {}, "bypass": False})
            if value is None:
                self._plugin_state[plugin_id]["bypass"] = not bool(self._plugin_state[plugin_id]["bypass"])
            else:
                self._plugin_state[plugin_id]["bypass"] = bool(value)
            bypass = bool(self._plugin_state[plugin_id]["bypass"])
            return {
                "ok": True,
                "address": address,
                "value": bypass,
                "events": [self._publish(f"/map2/out/plugin/{plugin_id}/bypass", bypass, source=source)],
            }

        if len(path) == 6 and path[1] == "chain" and path[3] == "preset" and path[5] == "fire":
            chain_id = path[2]
            step_index = max(0, int(path[4]) - 1)
            preset = await self._presets.recall_chain_step(chain_id, step_index)
            if preset is None:
                return {"ok": False, "reason": "chain_step_not_found", "address": address}
            event = self._publish("/map2/out/active/preset", preset["preset_id"], source=source)
            return {"ok": True, "address": address, "value": preset["preset_id"], "events": [event]}

        if len(path) == 5 and path[1] == "cue" and path[4] == "fire":
            event_list_id = path[2]
            cue_number = int(path[3])
            event = next((row for row in self._event_lists.list_events(event_list_id) if int(row.get("order", 0)) == cue_number), None)
            if event is None:
                return {"ok": False, "reason": "cue_not_found", "address": address}
            await self._event_lists._fire_event(event_list_id, event=self._event_lists._events[event_list_id][event["event_id"]])
            feedback = self._publish(f"/map2/out/event/cue/{event_list_id}/{cue_number}/fire", event["event_id"], source=source)
            active = self._publish(f"/map2/out/active/cue/{event_list_id}/{cue_number}", event["event_id"], source=source)
            return {"ok": True, "address": address, "value": event["event_id"], "events": [feedback, active]}

        if path[1:] == ["preset", "fire"]:
            target = str(int(float(value))) if value is not None else ""
            preset = await self._presets.recall_preset(target)
            if preset is None:
                return {"ok": False, "reason": "preset_not_found", "address": address}
            event = self._publish("/map2/out/active/preset", preset["preset_id"], source=source)
            return {"ok": True, "address": address, "value": preset["preset_id"], "events": [event]}

        if len(path) == 4 and path[1] == "preset" and path[3] == "fire":
            preset = await self._presets.recall_preset(path[2])
            if preset is None:
                return {"ok": False, "reason": "preset_not_found", "address": address}
            event = self._publish(f"/map2/out/event/preset/{path[2]}/recall", preset["preset_id"], source=source)
            return {"ok": True, "address": address, "value": preset["preset_id"], "events": [event]}

        if len(path) == 4 and path[1] == "macro" and path[3] == "fire":
            payload = await self._macros.trigger_macro(path[2], payload={"osc_value": value, "source": source})
            if not payload.get("ok"):
                return {"ok": False, "reason": payload.get("reason", "macro_failed"), "address": address}
            event = self._publish(f"/map2/out/event/macro/{path[2]}/fire", True, source=source)
            return {"ok": True, "address": address, "value": True, "events": [event]}

        if len(path) == 4 and path[1] == "gpio" and path[2] == "in":
            channel = f"in-{int(path[3]):02d}"
            row = next((item for item in self._gpio.snapshot()["inputs"] if item["channel_id"] == channel), None)
            return {"ok": row is not None, "address": address, "value": row["state"] if row else None, "events": []}

        if len(path) == 4 and path[1] == "gpio" and path[2] == "out":
            channel = f"out-{int(path[3]):02d}"
            payload = self._gpio.set_state(channel, bool(value), source=source)
            event = self._publish(f"/map2/out/gpio/out/{path[3]}", payload["channel"]["state"], source=source)
            return {"ok": True, "address": address, "value": payload["channel"]["state"], "events": [event]}

        if len(path) == 3 and path[1] == "meter":
            channel = path[2]
            meter_value = max(0.0, min(1.0, float(value) if value is not None else 0.5))
            event = self._publish(f"/map2/out/meter/{channel}", meter_value, source=source)
            return {"ok": True, "address": address, "value": meter_value, "events": [event]}

        if path[1:] == ["cmd"]:
            command = str(value or "").strip()
            event = self._publish("/map2/out/cmd", command, source=source)
            return {"ok": True, "address": address, "value": command, "events": [event]}

        if path[1:] == ["ping"]:
            pong = {"echo": value, "timestamp": time.time()}
            event = self._publish("/map2/out/ping", pong, source=source)
            return {"ok": True, "address": address, "value": pong, "events": [event]}

        return {"ok": False, "reason": "unhandled_address", "address": address}

    def catalog(self) -> Dict[str, Any]:
        preset_rows = self._presets.list_presets()
        macro_rows = self._macros.list_macros()
        event_list_rows = self._event_lists.list_event_lists()
        gpio = self._gpio.snapshot()
        clock = self._clock.status()
        entries: List[Dict[str, Any]] = [
            {
                "address": "/map2/transport/bpm",
                "description": "Get or set the transport BPM.",
                "direction": "bidirectional",
                "current_value": clock.get("bpm"),
            },
            {
                "address": "/map2/transport/start",
                "description": "Start the transport clock.",
                "direction": "input",
                "current_value": clock.get("running"),
            },
            {
                "address": "/map2/transport/stop",
                "description": "Stop the transport clock.",
                "direction": "input",
                "current_value": clock.get("running"),
            },
            {
                "address": "/map2/transport/continue",
                "description": "Continue the transport clock.",
                "direction": "input",
                "current_value": clock.get("running"),
            },
            {
                "address": "/map2/preset/fire",
                "description": "Recall a preset by numeric slot or id payload.",
                "direction": "input",
                "current_value": self._presets.get_default_preset().get("default_preset_id"),
            },
            {
                "address": "/map2/ping",
                "description": "Round-trip latency check with response at /map2/out/ping.",
                "direction": "input",
                "current_value": None,
            },
            {
                "address": "/map2/cmd",
                "description": "Dispatch a string command through the namespace bridge.",
                "direction": "input",
                "current_value": None,
            },
        ]

        for preset in preset_rows[:32]:
            entries.append(
                {
                    "address": f"/map2/preset/{preset['preset_id']}/fire",
                    "description": f"Recall preset {preset['name']}.",
                    "direction": "input",
                    "current_value": preset["preset_id"],
                }
            )

        for macro in macro_rows[:32]:
            entries.append(
                {
                    "address": f"/map2/macro/{macro['macro_id']}/fire",
                    "description": f"Trigger macro {macro['name']}.",
                    "direction": "input",
                    "current_value": macro["enabled"],
                }
            )

        for event_list in event_list_rows[:32]:
            entries.append(
                {
                    "address": f"/map2/cue/{event_list['event_list_id']}/1/fire",
                    "description": f"Fire cue 1 from event list {event_list['name']}.",
                    "direction": "input",
                    "current_value": event_list.get("running"),
                }
            )

        for channel in gpio["inputs"][:12]:
            entries.append(
                {
                    "address": f"/map2/gpio/in/{channel['index']}",
                    "description": f"Read virtual GPIO input {channel['label']}.",
                    "direction": "output",
                    "current_value": channel["state"],
                }
            )
        for channel in gpio["outputs"][:12]:
            entries.append(
                {
                    "address": f"/map2/gpio/out/{channel['index']}",
                    "description": f"Set virtual GPIO output {channel['label']}.",
                    "direction": "bidirectional",
                    "current_value": channel["state"],
                }
            )

        entries.extend(
            [
                {
                    "address": "/map2/plugin/demo/param/gain",
                    "description": "Get or set a plugin parameter by id and parameter name.",
                    "direction": "bidirectional",
                    "current_value": self._plugin_state.get("demo", {}).get("params", {}).get("gain", 0.0),
                },
                {
                    "address": "/map2/plugin/demo/bypass",
                    "description": "Toggle plugin bypass state.",
                    "direction": "bidirectional",
                    "current_value": self._plugin_state.get("demo", {}).get("bypass", False),
                },
                {
                    "address": "/map2/chain/demo/preset/1/fire",
                    "description": "Recall chain preset step 1.",
                    "direction": "input",
                    "current_value": None,
                },
                {
                    "address": "/map2/meter/1",
                    "description": "Subscribe to metering feedback with output at /map2/out/meter/1.",
                    "direction": "bidirectional",
                    "current_value": 0.5,
                },
                {
                    "address": "/map2/out/active/preset",
                    "description": "Implicit output for active preset recall feedback.",
                    "direction": "output",
                    "current_value": self._presets.get_default_preset().get("default_preset_id"),
                },
                {
                    "address": "/map2/out/ping",
                    "description": "Implicit output for ping responses.",
                    "direction": "output",
                    "current_value": self.recent_events(limit=1)[-1]["value"] if self.recent_events(limit=1) else None,
                },
            ]
        )

        return {
            "count": len(entries),
            "entries": sorted(entries, key=lambda row: row["address"]),
            "recent_events": self.recent_events(),
        }


_osc_namespace_router_singleton: Optional[OscNamespaceRouter] = None


def get_osc_namespace_router() -> OscNamespaceRouter:
    global _osc_namespace_router_singleton
    if _osc_namespace_router_singleton is None:
        _osc_namespace_router_singleton = OscNamespaceRouter()
    return _osc_namespace_router_singleton
