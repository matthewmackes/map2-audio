"""Backend controller and state projection for the touchscreen app."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any

from ..api import MAP2APIClient
from ..api.base import APIResult
from .model import (
    GRID_COLUMNS,
    GRID_PLUGIN_END_INDEX,
    GRID_PLUGIN_START_INDEX,
    AudioStatus,
    BlockState,
    ChainState,
    EffectFamily,
    MidiStatus,
    StompAssignment,
    TouchscreenState,
    build_placeholder_chain,
    empty_stomp_assignments,
)


@dataclass(slots=True)
class TouchscreenBackendSnapshot:
    """Normalized backend snapshot consumed by the Textual app."""

    chains: list[dict[str, Any]] = field(default_factory=list)
    chain_detail: dict[str, Any] | None = None
    audio_status: dict[str, Any] | None = None
    audio_latency: dict[str, Any] | None = None
    audio_metrics: dict[str, Any] | None = None
    midi_status: dict[str, Any] | None = None
    midi_activity: dict[str, Any] | None = None
    errors: list[str] = field(default_factory=list)
    reachable: bool = False


class TouchscreenBackendController:
    """Async controller for live touchscreen backend operations."""

    def __init__(
        self,
        *,
        api_client: MAP2APIClient | None = None,
        api_url: str = "http://localhost:8080",
    ) -> None:
        self.api_client = api_client or MAP2APIClient(base_url=api_url)
        self._owns_client = api_client is None

    async def close(self) -> None:
        if self._owns_client:
            await self.api_client.close()

    async def fetch_snapshot(self, preferred_chain_id: int | None = None) -> TouchscreenBackendSnapshot:
        (
            chains_result,
            audio_status_result,
            audio_latency_result,
            audio_metrics_result,
            midi_status_result,
            midi_activity_result,
        ) = await asyncio.gather(
            self.api_client.chains.list_chains(),
            self.api_client.audio.get_audio_status(),
            self.api_client.audio.get_audio_latency(),
            self.api_client.audio.get_audio_pipedal_metrics(),
            self.api_client.midi.get_midi_status(),
            self.api_client.midi.get_midi_activity(limit=8),
        )

        errors: list[str] = []
        reachable = False
        chains_payload = _result_data(chains_result, "Unable to load chains", errors)
        audio_status_payload = _result_data(audio_status_result, "Unable to load audio status", errors)
        audio_latency_payload = _result_data(audio_latency_result, "Unable to load audio latency", errors)
        audio_metrics_payload = _result_data(audio_metrics_result, "Unable to load audio metrics", errors)
        midi_status_payload = _result_data(midi_status_result, "Unable to load MIDI status", errors)
        midi_activity_payload = _result_data(midi_activity_result, "Unable to load MIDI activity", errors)

        reachable = any(
            payload is not None
            for payload in (
                chains_payload,
                audio_status_payload,
                audio_latency_payload,
                audio_metrics_payload,
                midi_status_payload,
                midi_activity_payload,
            )
        )

        chains = _extract_chains(chains_payload)
        chain_id = _select_chain_id(chains, preferred_chain_id)
        chain_detail: dict[str, Any] | None = None
        if chain_id is not None:
            detail_result = await self.api_client.chains.get_chain(chain_id)
            chain_detail = _result_data(detail_result, f"Unable to load chain {chain_id}", errors)

        return TouchscreenBackendSnapshot(
            chains=chains,
            chain_detail=chain_detail,
            audio_status=audio_status_payload if isinstance(audio_status_payload, dict) else None,
            audio_latency=audio_latency_payload if isinstance(audio_latency_payload, dict) else None,
            audio_metrics=audio_metrics_payload if isinstance(audio_metrics_payload, dict) else None,
            midi_status=midi_status_payload if isinstance(midi_status_payload, dict) else None,
            midi_activity=midi_activity_payload if isinstance(midi_activity_payload, dict) else None,
            errors=errors,
            reachable=reachable,
        )

    async def activate_chain(self, chain_id: int) -> str:
        result = await self.api_client.chains.activate_chain(chain_id)
        payload = _require_success(result, f"Unable to activate chain {chain_id}")
        status = str(payload.get("status", "activated"))
        if status.endswith("deferred"):
            return f"Chain {chain_id} activation deferred"
        if status.endswith("throttled"):
            return f"Chain {chain_id} activation throttled"
        return f"Loaded chain {chain_id}"

    async def toggle_plugin_bypass(
        self,
        *,
        chain_id: int,
        plugin_uri: str,
        plugin_position: int | None,
        bypass: bool,
        block_name: str,
    ) -> str:
        result = await self.api_client.chains.toggle_plugin_bypass(
            chain_id,
            plugin_uri,
            bypass=bypass,
            plugin_position=plugin_position,
        )
        _require_success(result, f"Unable to update bypass for {block_name}")
        return f"{block_name} {'bypassed' if bypass else 'active'}"

    async def save_chain_preset(self, *, chain_id: int, chain_name: str) -> str:
        result = await self.api_client.chains.save_chain_preset(chain_id, chain_name)
        payload = _require_success(result, f"Unable to save chain preset for {chain_name}")
        preset_id = payload.get("preset_id")
        return f"Saved {chain_name} as preset {preset_id}" if preset_id is not None else f"Saved {chain_name}"

    async def persist_stomp_assignments(self, *, chain_id: int, assignments: list[StompAssignment]) -> str:
        payload = [
            {
                "slot": assignment.slot,
                "plugin_uri": assignment.plugin_uri,
                "plugin_position": assignment.plugin_position,
            }
            for assignment in assignments
            if assignment.assigned and assignment.plugin_position is not None
        ]
        result = await self.api_client.chains.update_touchscreen_stomps(chain_id, payload)
        _require_success(result, f"Unable to persist stomp assignments for chain {chain_id}")
        return f"Updated live stomps for chain {chain_id}"


def build_state_from_snapshot(
    previous: TouchscreenState,
    snapshot: TouchscreenBackendSnapshot,
    *,
    status_override: str | None = None,
) -> TouchscreenState:
    chains = _build_chain_states(snapshot)
    current_chain_index = _find_current_chain_index(chains)
    previous_chain_id = previous.active_chain_id
    if previous_chain_id is not None:
        previous_match = next((index for index, chain in enumerate(chains) if chain.chain_id == previous_chain_id), None)
        if previous_match is not None and snapshot.chain_detail is None:
            current_chain_index = previous_match

    backend_message = _backend_message(snapshot, chains)
    footer_status = status_override or backend_message
    selected_grid_index = previous.selected_grid_index
    if previous_chain_id != (chains[current_chain_index].chain_id if chains else None):
        selected_grid_index = GRID_PLUGIN_START_INDEX

    state = TouchscreenState(
        chains=chains,
        mode=previous.mode,
        view=previous.view,
        focus_region=previous.focus_region,
        selected_grid_index=max(0, min(selected_grid_index, (GRID_COLUMNS * 4) - 1)),
        selected_gig_index=previous.selected_gig_index,
        header_focus_index=previous.header_focus_index,
        midi_status=_build_midi_status(snapshot.midi_status, snapshot.midi_activity, previous.midi_status),
        audio_status=_build_audio_status(snapshot.audio_status, snapshot.audio_latency, snapshot.audio_metrics),
        footer_status=footer_status,
        backend_connected=snapshot.reachable,
        backend_message=backend_message,
        current_chain_index=current_chain_index,
    )

    if state.mode.value == "chain":
        state.selected_gig_index = current_chain_index % 8 if chains else 0
    else:
        state.selected_gig_index = max(0, min(state.selected_gig_index, 7))

    return state


def _result_data(result: APIResult, fallback_message: str, errors: list[str]) -> Any:
    if result.success:
        return result.data
    errors.append(result.error or fallback_message)
    return None


def _require_success(result: APIResult, fallback_message: str) -> dict[str, Any]:
    if not result.success:
        raise RuntimeError(result.error or fallback_message)
    payload = result.data
    if isinstance(payload, dict):
        return payload
    return {}


def _extract_chains(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    raw_chains = payload.get("chains", [])
    if not isinstance(raw_chains, list):
        return []
    return [chain for chain in raw_chains if isinstance(chain, dict)]


def _select_chain_id(chains: list[dict[str, Any]], preferred_chain_id: int | None) -> int | None:
    if not chains:
        return None
    if preferred_chain_id is not None:
        for chain in chains:
            if _coerce_int(chain.get("id")) == preferred_chain_id:
                return preferred_chain_id
    for chain in chains:
        if bool(chain.get("is_active")):
            return _coerce_int(chain.get("id"))
    return _coerce_int(chains[0].get("id"))


def _build_chain_states(snapshot: TouchscreenBackendSnapshot) -> list[ChainState]:
    chains = [_build_chain_summary(chain) for chain in snapshot.chains]
    if snapshot.chain_detail and isinstance(snapshot.chain_detail, dict):
        detailed = _build_chain_from_detail(snapshot.chain_detail)
        for index, chain in enumerate(chains):
            if chain.chain_id == detailed.chain_id:
                chains[index] = detailed
                break
        else:
            chains.append(detailed)

    if not chains:
        if snapshot.reachable:
            return [
                build_placeholder_chain(
                    name="NO CHAINS",
                    descriptor="Backend reachable, but no chains are available",
                    family=EffectFamily.UTILITY,
                    active=False,
                )
            ]
        return []
    return chains


def _find_current_chain_index(chains: list[ChainState]) -> int:
    for index, chain in enumerate(chains):
        if chain.is_active:
            return index
    return 0


def _build_chain_summary(payload: dict[str, Any]) -> ChainState:
    plugins = payload.get("plugins", [])
    if not isinstance(plugins, list):
        plugins = []
    return ChainState(
        chain_id=_coerce_int(payload.get("id")),
        name=str(payload.get("name") or "Unnamed Chain"),
        descriptor=_describe_chain(plugins),
        display_family=_display_family_for_plugins(plugins),
        is_active=bool(payload.get("is_active")),
        plugin_count=len(plugins),
        blocks=[],
        stomp_assignments=empty_stomp_assignments(),
        overflow_count=max(0, len(plugins) - ((GRID_PLUGIN_END_INDEX - GRID_PLUGIN_START_INDEX) + 1)),
    )


def _build_chain_from_detail(payload: dict[str, Any]) -> ChainState:
    plugins = payload.get("plugins", [])
    if not isinstance(plugins, list):
        plugins = []
    normalized_plugins = [plugin for plugin in plugins if isinstance(plugin, dict)]
    normalized_plugins.sort(key=lambda plugin: int(plugin.get("position", 0)))
    assignment_map = _touchscreen_assignment_map(payload.get("touchscreen"))
    blocks: list[BlockState] = [_make_input_block()]

    for plugin in normalized_plugins[: (GRID_PLUGIN_END_INDEX - GRID_PLUGIN_START_INDEX) + 1]:
        grid_index = GRID_PLUGIN_START_INDEX + len(blocks) - 1
        row, column = divmod(grid_index, GRID_COLUMNS)
        plugin_uri = _clean_string(plugin.get("uri"))
        position = _coerce_int(plugin.get("position"))
        family = _family_for_plugin(plugin)
        block_id = f"{payload.get('id', 'chain')}:{position if position is not None else len(blocks)}"
        stomp_slot = assignment_map.get((plugin_uri, position))
        blocks.append(
            BlockState(
                block_id=block_id,
                plugin_uri=plugin_uri,
                plugin_position=position,
                row=row,
                column=column,
                category=_plugin_category(plugin, family),
                family=family,
                name=_plugin_name(plugin),
                short_name=_short_label(_plugin_name(plugin)),
                detail=_plugin_detail(plugin),
                params=_plugin_params(plugin),
                route_hint=">..",
                bypassed=bool(plugin.get("bypassed")),
                stomp_slot=stomp_slot,
                virtual=False,
            )
        )

    blocks.append(_make_output_block())

    stomp_assignments = empty_stomp_assignments()
    block_by_slot = {block.stomp_slot: block for block in blocks if block.stomp_slot is not None}
    for assignment in stomp_assignments:
        block = block_by_slot.get(assignment.slot)
        if block is None:
            continue
        assignment.label = block.name
        assignment.block_id = block.block_id
        assignment.plugin_uri = block.plugin_uri
        assignment.plugin_position = block.plugin_position
        assignment.family = block.family
        assignment.bypassed = block.bypassed

    return ChainState(
        chain_id=_coerce_int(payload.get("id")),
        name=str(payload.get("name") or "Unnamed Chain"),
        descriptor=_describe_chain(normalized_plugins),
        display_family=_display_family_for_plugins(normalized_plugins),
        is_active=bool(payload.get("is_active", True)),
        plugin_count=len(normalized_plugins),
        blocks=blocks,
        stomp_assignments=stomp_assignments,
        overflow_count=max(0, len(normalized_plugins) - ((GRID_PLUGIN_END_INDEX - GRID_PLUGIN_START_INDEX) + 1)),
    )


def _touchscreen_assignment_map(payload: Any) -> dict[tuple[str | None, int | None], int]:
    if not isinstance(payload, dict):
        return {}
    assignments = payload.get("stomp_assignments", [])
    if not isinstance(assignments, list):
        return {}
    result: dict[tuple[str | None, int | None], int] = {}
    for assignment in assignments:
        if not isinstance(assignment, dict):
            continue
        slot = _coerce_int(assignment.get("slot"))
        plugin_uri = _clean_string(assignment.get("plugin_uri"))
        plugin_position = _coerce_int(assignment.get("plugin_position"))
        if slot is None or slot < 1 or slot > 8:
            continue
        result[(plugin_uri, plugin_position)] = slot
    return result


def _build_midi_status(
    status_payload: dict[str, Any] | None,
    activity_payload: dict[str, Any] | None,
    previous: MidiStatus,
) -> MidiStatus:
    messages = []
    if isinstance(activity_payload, dict):
        raw_messages = activity_payload.get("messages", [])
        if isinstance(raw_messages, list):
            messages = [message for message in raw_messages if isinstance(message, dict)]

    last_message = "Awaiting MIDI"
    if messages:
        last = messages[-1]
        message_type = _clean_string(last.get("type")) or "MIDI"
        channel = _coerce_int(last.get("channel"))
        suffix = f" CH{channel}" if channel is not None else ""
        last_message = f"{message_type.upper()}{suffix}"
    elif isinstance(status_payload, dict):
        device_count = _coerce_int(status_payload.get("devices")) or 0
        if device_count > 0:
            last_message = f"{device_count} device{'s' if device_count != 1 else ''}"

    midi = MidiStatus(
        available=bool(status_payload and status_payload.get("available", True)),
        enabled=bool(status_payload and status_payload.get("enabled", False)),
        connected=bool((status_payload and (status_payload.get("devices") or status_payload.get("input_device"))) or messages),
        last_message=last_message,
        pulse_step=previous.pulse_step,
        recent_activity=bool(messages),
    )
    return midi


def _build_audio_status(
    status_payload: dict[str, Any] | None,
    latency_payload: dict[str, Any] | None,
    metrics_payload: dict[str, Any] | None,
) -> AudioStatus:
    latency_ms = 0.0
    if isinstance(latency_payload, dict):
        try:
            latency_ms = float(latency_payload.get("latency_ms", 0.0))
        except (TypeError, ValueError):
            latency_ms = 0.0

    cpu_load = 0.0
    xruns = 0
    sample_rate = 0
    buffer_size = 0
    available = bool(status_payload and status_payload.get("available", False))
    running = bool(status_payload and status_payload.get("running", False))
    if isinstance(metrics_payload, dict):
        try:
            cpu_load = float(metrics_payload.get("cpu_load", 0.0))
        except (TypeError, ValueError):
            cpu_load = 0.0
        xruns = _coerce_int(metrics_payload.get("xruns")) or 0
        sample_rate = _coerce_int(metrics_payload.get("sample_rate")) or 0
        buffer_size = _coerce_int(metrics_payload.get("buffer_size")) or 0
        available = bool(metrics_payload.get("available", available))
        running = bool(metrics_payload.get("running", running))

    return AudioStatus(
        available=available,
        running=running,
        latency_ms=latency_ms,
        cpu_load=cpu_load,
        sample_rate=sample_rate,
        buffer_size=buffer_size,
        xruns=xruns,
    )


def _backend_message(snapshot: TouchscreenBackendSnapshot, chains: list[ChainState]) -> str:
    if not snapshot.reachable:
        return "Backend unavailable"
    if snapshot.errors:
        return snapshot.errors[0]
    if not chains:
        return "No chains available"
    return "Touchscreen synced"


def _describe_chain(plugins: list[dict[str, Any]]) -> str:
    if not plugins:
        return "Empty chain"
    family_labels: list[str] = []
    for plugin in plugins:
        label = _family_for_plugin(plugin).name.replace("_", " ").title()
        if label == "Signal Io":
            continue
        if label not in family_labels:
            family_labels.append(label)
        if len(family_labels) == 3:
            break
    family_summary = " / ".join(family_labels) if family_labels else "Signal path"
    return f"{len(plugins)} blocks | {family_summary}"


def _display_family_for_plugins(plugins: list[dict[str, Any]]) -> EffectFamily:
    for plugin in plugins:
        family = _family_for_plugin(plugin)
        if family not in {EffectFamily.SIGNAL_IO, EffectFamily.UTILITY}:
            return family
    return EffectFamily.UTILITY if plugins else EffectFamily.SIGNAL_IO


def _family_for_plugin(plugin: dict[str, Any]) -> EffectFamily:
    text = " ".join(
        part
        for part in (
            _clean_string(plugin.get("category")),
            _clean_string(plugin.get("name")),
            _clean_string(plugin.get("uri")),
        )
        if part
    ).lower()

    if any(token in text for token in ("input", "output", "split", "merge", "send", "return", "loop", "router")):
        return EffectFamily.SIGNAL_IO
    if any(token in text for token in ("amp", "cab", "speaker", "neural", "nam", "capture", "ir")):
        return EffectFamily.AMP
    if any(token in text for token in ("drive", "dist", "fuzz", "boost", "od", "overdrive")):
        return EffectFamily.DRIVE
    if any(token in text for token in ("comp", "compress", "gate", "limit", "eq", "dynamic")):
        return EffectFamily.DYNAMICS
    if any(token in text for token in ("chorus", "flanger", "phaser", "trem", "vibrato", "mod", "rotary")):
        return EffectFamily.MODULATION
    if any(token in text for token in ("delay", "echo", "repeat")):
        return EffectFamily.DELAY
    if any(token in text for token in ("reverb", "verb", "hall", "plate", "room", "ambience")):
        return EffectFamily.REVERB
    if any(token in text for token in ("pitch", "filter", "wah", "octave", "harm", "synth")):
        return EffectFamily.PITCH_FILTER
    return EffectFamily.UTILITY


def _plugin_name(plugin: dict[str, Any]) -> str:
    name = _clean_string(plugin.get("name"))
    if name:
        return name
    uri = _clean_string(plugin.get("uri")) or "Plugin"
    return uri.rsplit("/", 1)[-1].rsplit(":", 1)[-1]


def _plugin_category(plugin: dict[str, Any], family: EffectFamily) -> str:
    category = _clean_string(plugin.get("category"))
    if category:
        return category
    return family.name.replace("_", " ").title()


def _plugin_detail(plugin: dict[str, Any]) -> str:
    author = _clean_string(plugin.get("author")) or "MAP2"
    category = _clean_string(plugin.get("category")) or "Processor"
    return f"{category} | {author}"


def _plugin_params(plugin: dict[str, Any]) -> str:
    position = _coerce_int(plugin.get("position"))
    in_ports = _coerce_int(plugin.get("in_ports")) or 0
    out_ports = _coerce_int(plugin.get("out_ports")) or 0
    pos_label = f"P{position:02d}" if position is not None else "P--"
    port_label = f"{in_ports}>{out_ports}" if in_ports or out_ports else "--"
    return f"{pos_label} {port_label}"


def _short_label(name: str) -> str:
    compact = name.replace(" ", "")
    if len(compact) <= 6:
        return compact.upper()
    if len(name) <= 6:
        return name.upper()
    words = [part for part in name.split() if part]
    if len(words) >= 2:
        return "".join(word[0] for word in words[:4]).upper()
    return name[:6].upper()


def _make_input_block() -> BlockState:
    return BlockState(
        block_id="signal-input",
        plugin_uri=None,
        plugin_position=None,
        row=0,
        column=0,
        category="Input",
        family=EffectFamily.SIGNAL_IO,
        name="Input",
        short_name="IN",
        detail="Engine input",
        params="LIVE",
        route_hint="IN>",
        bypassed=False,
        stomp_slot=None,
        virtual=True,
    )


def _make_output_block() -> BlockState:
    grid_index = (GRID_COLUMNS * 4) - 1
    row, column = divmod(grid_index, GRID_COLUMNS)
    return BlockState(
        block_id="signal-output",
        plugin_uri=None,
        plugin_position=None,
        row=row,
        column=column,
        category="Output",
        family=EffectFamily.SIGNAL_IO,
        name="Main Out",
        short_name="OUT",
        detail="Engine output",
        params="LIVE",
        route_hint="OUT",
        bypassed=False,
        stomp_slot=None,
        virtual=True,
    )


def _clean_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value or None


def _coerce_int(value: Any) -> int | None:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None
