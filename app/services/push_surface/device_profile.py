"""Device profiles for Ableton Push generations and generic fallback."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

from app.services.push_surface.models.capabilities import CapabilityTier, DeviceCapabilities, MappingConfidence, SurfaceColor
from app.services.push_surface.protocol.generic_midi import (
    ControlKind,
    EncoderMode,
    MidiControlBinding,
    MidiControlType,
    grid_control_id,
)


LOGICAL_PAGE_BUTTONS = (
    "page_home",
    "page_chains",
    "page_node_detail",
    "page_parameters",
    "page_presets",
    "page_routing",
    "page_cluster",
    "page_diagnostics",
)


@dataclass(frozen=True)
class PushDeviceProfile:
    """Static description of a Push generation or generic fallback."""

    profile_id: str
    display_name: str
    port_name_hints: tuple[str, ...]
    capabilities: DeviceCapabilities
    bindings: tuple[MidiControlBinding, ...]
    color_map: dict[SurfaceColor, int]
    encoder_mode: EncoderMode = EncoderMode.RELATIVE_TWOS_COMPLEMENT
    midi_channel: int = 0
    grid_origin: str = "bottom_left"
    display_transport: str = "none"
    experimental_protocol: bool = False
    metadata: dict[str, str] = field(default_factory=dict)

    def matches_port_name(self, port_name: str) -> bool:
        normalized = str(port_name or "").strip().lower()
        return any(hint in normalized for hint in self.port_name_hints)

    def find_binding(self, midi_type: MidiControlType, number: int) -> MidiControlBinding | None:
        for binding in self.bindings:
            if binding.midi_type == midi_type and binding.number == int(number):
                return binding
        return None

    def binding_for_logical_name(self, logical_name: str) -> MidiControlBinding | None:
        for binding in self.bindings:
            if binding.logical_name == logical_name:
                return binding
        return None

    def pad_binding(self, x: int, y: int) -> MidiControlBinding | None:
        return self.binding_for_logical_name(grid_control_id(x, y))

    def led_value(self, color: SurfaceColor, *, emphasized: bool = False) -> int:
        if color == SurfaceColor.DIM and emphasized:
            color = SurfaceColor.WHITE
        return int(self.color_map.get(color, self.color_map.get(SurfaceColor.WHITE, 1)))


def _build_grid_bindings(*, note_start: int = 36, row_stride: int = 8) -> list[MidiControlBinding]:
    bindings: list[MidiControlBinding] = []
    for y in range(8):
        for x in range(8):
            note = note_start + (y * row_stride) + x
            bindings.append(
                MidiControlBinding(
                    logical_name=grid_control_id(x, y),
                    control_kind=ControlKind.PAD,
                    midi_type=MidiControlType.NOTE,
                    number=note,
                    led_midi_type=MidiControlType.NOTE,
                    led_number=note,
                    grid_x=x,
                    grid_y=y,
                    # INFERRED: the contiguous 8x8 note grid is a generic Push-style
                    # default used by MAP2's simulator and fallback profile until a
                    # device capture confirms a hardware-specific note map.
                    confidence=MappingConfidence.INFERRED,
                )
            )
    return bindings


def _build_button_bindings(*, cc_start: int = 20) -> list[MidiControlBinding]:
    button_names = [
        *LOGICAL_PAGE_BUTTONS,
        "nav_left",
        "nav_right",
        "back",
        "shift",
        "confirm",
        "bypass",
        "select",
        "home",
    ]
    bindings: list[MidiControlBinding] = []
    for index, name in enumerate(button_names):
        cc = cc_start + index
        bindings.append(
            MidiControlBinding(
                logical_name=name,
                control_kind=ControlKind.BUTTON,
                midi_type=MidiControlType.CONTROL_CHANGE,
                number=cc,
                led_midi_type=MidiControlType.CONTROL_CHANGE,
                led_number=cc,
                default_page_behavior=name,
                # UNVERIFIED: page/navigation CC defaults are intentionally
                # overrideable because different Push generations can expose
                # control-mode buttons differently across firmware revisions.
                confidence=MappingConfidence.UNVERIFIED,
            )
        )
    return bindings


def _build_encoder_bindings(*, cc_start: int = 71, touch_cc_start: int = 91) -> list[MidiControlBinding]:
    bindings: list[MidiControlBinding] = []
    for index in range(8):
        bindings.append(
            MidiControlBinding(
                logical_name=f"encoder_{index}",
                control_kind=ControlKind.ENCODER,
                midi_type=MidiControlType.CONTROL_CHANGE,
                number=cc_start + index,
                encoder_index=index,
                # INFERRED: relative encoder CC addresses are safe defaults for the
                # generic fallback/simulator path and can be overridden per capture.
                confidence=MappingConfidence.INFERRED,
            )
        )
        bindings.append(
            MidiControlBinding(
                logical_name=f"encoder_touch_{index}",
                control_kind=ControlKind.ENCODER_TOUCH,
                midi_type=MidiControlType.CONTROL_CHANGE,
                number=touch_cc_start + index,
                encoder_index=index,
                confidence=MappingConfidence.UNVERIFIED,
            )
        )
    return bindings


def _common_bindings() -> tuple[MidiControlBinding, ...]:
    bindings = []
    bindings.extend(_build_grid_bindings())
    bindings.extend(_build_button_bindings())
    bindings.extend(_build_encoder_bindings())
    bindings.append(
        MidiControlBinding(
            logical_name="touchstrip",
            control_kind=ControlKind.TOUCHSTRIP,
            midi_type=MidiControlType.PITCH_BEND,
            number=0,
            confidence=MappingConfidence.UNVERIFIED,
        )
    )
    bindings.append(
        MidiControlBinding(
            logical_name="pedal",
            control_kind=ControlKind.PEDAL,
            midi_type=MidiControlType.CONTROL_CHANGE,
            number=64,
            confidence=MappingConfidence.CONFIRMED,
        )
    )
    return tuple(bindings)


def _generic_color_map() -> dict[SurfaceColor, int]:
    # INFERRED: these palette slots are generic LED values for the simulator and
    # fallback MIDI mode. Profile-specific color tables can override them later.
    return {
        SurfaceColor.OFF: 0,
        SurfaceColor.DIM: 1,
        SurfaceColor.WHITE: 3,
        SurfaceColor.BLUE: 45,
        SurfaceColor.CYAN: 33,
        SurfaceColor.GREEN: 21,
        SurfaceColor.YELLOW: 13,
        SurfaceColor.AMBER: 9,
        SurfaceColor.ORANGE: 7,
        SurfaceColor.RED: 5,
        SurfaceColor.MAGENTA: 53,
    }


def _profile_with_name(
    *,
    profile_id: str,
    display_name: str,
    port_name_hints: Iterable[str],
    capabilities: DeviceCapabilities,
    display_transport: str = "none",
    experimental_protocol: bool = False,
) -> PushDeviceProfile:
    return PushDeviceProfile(
        profile_id=profile_id,
        display_name=display_name,
        port_name_hints=tuple(str(item).lower() for item in port_name_hints),
        capabilities=capabilities,
        bindings=_common_bindings(),
        color_map=_generic_color_map(),
        display_transport=display_transport,
        experimental_protocol=experimental_protocol,
    )


GENERIC_PUSH_PROFILE = _profile_with_name(
    profile_id="generic_push",
    display_name="Generic Push Fallback",
    port_name_hints=("push", "ableton", "push surface sim"),
    capabilities=DeviceCapabilities(
        supports_leds=True,
        supports_aftertouch=True,
        supports_touchstrip=True,
        supports_encoder_touch=True,
        supported_tiers=(CapabilityTier.GENERIC_MIDI,),
        mapping_confidence=MappingConfidence.INFERRED,
    ),
)

PUSH_1_PROFILE = _profile_with_name(
    profile_id="push1",
    display_name="Ableton Push 1",
    port_name_hints=("ableton push", "push user"),
    capabilities=DeviceCapabilities(
        supports_leds=True,
        supports_aftertouch=True,
        supports_touchstrip=True,
        supports_encoder_touch=True,
        supported_tiers=(CapabilityTier.GENERIC_MIDI, CapabilityTier.ENHANCED_SURFACE),
        mapping_confidence=MappingConfidence.UNVERIFIED,
    ),
)

PUSH_2_PROFILE = _profile_with_name(
    profile_id="push2",
    display_name="Ableton Push 2",
    port_name_hints=("push 2", "ableton push 2"),
    capabilities=DeviceCapabilities(
        supports_leds=True,
        supports_display=True,
        supports_aftertouch=True,
        supports_touchstrip=True,
        supports_encoder_touch=True,
        supported_tiers=(
            CapabilityTier.GENERIC_MIDI,
            CapabilityTier.ENHANCED_SURFACE,
            CapabilityTier.ADVANCED_DISPLAY,
        ),
        mapping_confidence=MappingConfidence.UNVERIFIED,
    ),
    display_transport="push2_sysex",
    experimental_protocol=True,
)

PUSH_3_PROFILE = _profile_with_name(
    profile_id="push3",
    display_name="Ableton Push 3",
    port_name_hints=("push 3", "ableton push 3"),
    capabilities=DeviceCapabilities(
        supports_leds=True,
        supports_display=True,
        supports_aftertouch=True,
        supports_poly_aftertouch=True,
        supports_touchstrip=True,
        supports_encoder_touch=True,
        supported_tiers=(
            CapabilityTier.GENERIC_MIDI,
            CapabilityTier.ENHANCED_SURFACE,
            CapabilityTier.ADVANCED_DISPLAY,
        ),
        mapping_confidence=MappingConfidence.UNVERIFIED,
    ),
    display_transport="push3_sysex",
    experimental_protocol=True,
)


BUILTIN_PROFILES: tuple[PushDeviceProfile, ...] = (
    PUSH_3_PROFILE,
    PUSH_2_PROFILE,
    PUSH_1_PROFILE,
    GENERIC_PUSH_PROFILE,
)


def get_profile(profile_id: str) -> PushDeviceProfile:
    """Return a built-in profile by ID, falling back to the generic profile."""

    normalized = str(profile_id or "").strip().lower()
    for profile in BUILTIN_PROFILES:
        if profile.profile_id == normalized:
            return profile
    return GENERIC_PUSH_PROFILE


def guess_profile_for_ports(port_names: Iterable[str], *, preferred_profile: str | None = None) -> PushDeviceProfile:
    """Return the most likely profile for a set of port names."""

    if preferred_profile:
        return get_profile(preferred_profile)

    names = [str(name or "").strip().lower() for name in port_names]
    for profile in BUILTIN_PROFILES:
        if any(profile.matches_port_name(name) for name in names):
            return profile
    return GENERIC_PUSH_PROFILE
