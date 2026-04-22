"""Tonechaser URI catalog for the MAP2 State Authority.

Owns the canonical `map2:{type}:{name}` URI registry (Q82, Q85). Every URI
the platform references — FX, system blocks, I/O, controls — is listed here
with its type, display label, short operator description, and optional
default parameter seed so graph documents can be built with consistent,
machine-validated identifiers without depending on the plugin registry
subsystem.

Consumers:

- `state_authority_graph.canonicalize_plugin_uri` consults this catalog to
  canonicalize legacy URIs that the static map cannot resolve.
- Frontend block picker fetches via `GET /api/state-authority/uri-catalog`.
- Activation preflight verifies every node URI referenced in a graph doc
  exists in the catalog or is a valid third-party plugin URI.
- Reconciliation uses the catalog to identify system/ctrl blocks that are
  service-managed (not stored in graph doc per Q93).

The catalog intentionally lives separate from `state_authority_graph.py` so
it can be extended without touching the validator surface. Adding a new
entry is a two-step operation: (1) add an entry here, (2) update the
consumer that knows how to load the underlying plugin/system block. The
validator accepts any `map2:{fx|io|sys|ctrl}:<slug>` URI whether or not it
is catalogued — the catalog is the seed list, not the exhaustive allowlist.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable


CATALOG_TYPES = ("fx", "io", "sys", "ctrl")


@dataclass(frozen=True)
class UriCatalogEntry:
    """One canonical URI registered for the tonechaser workflow."""

    uri: str
    type: str  # fx | io | sys | ctrl
    name: str  # slug portion (matches [a-z0-9-]+)
    label: str  # operator-facing display name
    description: str
    category: str = ""  # coarse grouping hint for the block picker
    default_parameters: dict[str, float] = field(default_factory=dict)
    default_state: dict[str, Any] = field(default_factory=dict)
    aliases: tuple[str, ...] = ()  # legacy URIs that resolve here
    is_system_managed: bool = False  # true when not persisted in graph doc (Q93)


def _entry(
    uri: str,
    *,
    label: str,
    description: str,
    category: str = "",
    default_parameters: dict[str, float] | None = None,
    default_state: dict[str, Any] | None = None,
    aliases: Iterable[str] = (),
    is_system_managed: bool = False,
) -> UriCatalogEntry:
    parts = uri.split(":", 2)
    if len(parts) != 3 or parts[0] != "map2":
        raise ValueError(f"invalid catalog URI: {uri!r}")
    uri_type, name = parts[1], parts[2]
    if uri_type not in CATALOG_TYPES:
        raise ValueError(f"catalog type {uri_type!r} must be one of {CATALOG_TYPES}")
    return UriCatalogEntry(
        uri=uri,
        type=uri_type,
        name=name,
        label=label,
        description=description,
        category=category,
        default_parameters=dict(default_parameters or {}),
        default_state=dict(default_state or {}),
        aliases=tuple(aliases),
        is_system_managed=is_system_managed,
    )


TONECHASER_FX_CATALOG: tuple[UriCatalogEntry, ...] = (
    _entry(
        "map2:fx:nam",
        label="Neural Amp Modeler",
        description="Neural-net amp-head model loader — cornerstone of the tonechaser workflow.",
        category="amp",
        default_parameters={"gain": 0.7, "normalize": 1.0, "output_level": 0.8},
        default_state={"map2:state:model_path": "", "map2:state:model_name": ""},
        aliases=("map2://juce/nam", "urn:map2:nam-player"),
    ),
    _entry(
        "map2:fx:cabinet-ir",
        label="Cabinet IR",
        description="Impulse-response cabinet loader — pairs with NAM for the full amp sim rig.",
        category="cabinet",
        default_parameters={"mix": 1.0, "gain": 0.0},
        default_state={
            "map2:state:ir_path": "",
            "map2:state:ir_name": "",
            "map2:state:ir_type": "cabinet",
        },
        aliases=("map2://juce/convolution/cabinet", "urn:map2:ir-cabinet"),
    ),
    _entry(
        "map2:fx:reverb-ir",
        label="Reverb IR",
        description="Convolution reverb from an impulse response — halls, plates, rooms, spaces.",
        category="reverb",
        default_parameters={"mix": 0.4, "gain": 0.0},
        default_state={
            "map2:state:ir_path": "",
            "map2:state:ir_name": "",
            "map2:state:ir_type": "reverb",
        },
        aliases=("map2://juce/convolution/reverb", "urn:map2:ir-reverb"),
    ),
    _entry(
        "map2:fx:delay",
        label="Delay",
        description="Tempo-syncable delay for rhythmic echo, slapback, and ambient wash.",
        category="delay",
        default_parameters={"time_ms": 375.0, "feedback": 0.35, "mix": 0.3, "tempo_sync": 0.0},
        aliases=("map2://juce/delay",),
    ),
    _entry(
        "map2:fx:tape-delay",
        label="Tape Delay",
        description="Wow/flutter-modelled tape delay — warm, age-able, saturated feedback loop.",
        category="delay",
        default_parameters={"time_ms": 500.0, "feedback": 0.4, "mix": 0.35, "wow": 0.1, "flutter": 0.1, "age": 0.2},
    ),
    _entry(
        "map2:fx:chorus",
        label="Chorus",
        description="Pitch-modulated delay for width and motion.",
        category="modulation",
        default_parameters={"rate": 0.4, "depth": 0.5, "mix": 0.3},
    ),
    _entry(
        "map2:fx:phaser",
        label="Phaser",
        description="All-pass phase modulator.",
        category="modulation",
        default_parameters={"rate": 0.4, "depth": 0.6, "feedback": 0.3, "mix": 0.35},
    ),
    _entry(
        "map2:fx:flanger",
        label="Flanger",
        description="Short modulated delay with feedback.",
        category="modulation",
        default_parameters={"rate": 0.3, "depth": 0.5, "feedback": 0.4, "mix": 0.35},
    ),
    _entry(
        "map2:fx:tremolo",
        label="Tremolo",
        description="Amplitude modulation.",
        category="modulation",
        default_parameters={"rate": 0.5, "depth": 0.6, "shape": 0.0},
    ),
    _entry(
        "map2:fx:vibrato",
        label="Vibrato",
        description="Pitch modulation without a dry signal.",
        category="modulation",
        default_parameters={"rate": 0.5, "depth": 0.4},
    ),
    _entry(
        "map2:fx:rotary",
        label="Rotary Speaker",
        description="Two-rotor Leslie-style rotary cabinet.",
        category="modulation",
        default_parameters={"speed": 0.5, "horn_rate": 0.7, "drum_rate": 0.3, "mix": 0.8},
    ),
    _entry(
        "map2:fx:pitch-shifter",
        label="Pitch Shifter",
        description="Polyphonic pitch shift (semitones + cents).",
        category="pitch",
        default_parameters={"semitones": 0.0, "cents": 0.0, "mix": 1.0, "feedback": 0.0},
    ),
    _entry(
        "map2:fx:h3000",
        label="H3000 FX Processor",
        description="Eventide H3000-style multi-FX: harmoniser, crystals, reverse, MC detune.",
        category="multi-fx",
        default_parameters={"program": 0.0, "mix": 0.5},
    ),
    _entry(
        "map2:fx:shoegaze",
        label="Shoegaze Multi-FX",
        description="Dense wall-of-sound multi-effect: reverse reverb, octave, pitch, tremolo, delay.",
        category="multi-fx",
        default_parameters={"intensity": 0.6, "mix": 0.5, "character": 0.5},
        aliases=("map2://juce/multieffect/shoegaze",),
    ),
    _entry(
        "map2:fx:lexilove",
        label="LexiLove PCM-70",
        description="Lexicon PCM-70-modelled reverb engine.",
        category="reverb",
        default_parameters={"program": 0.0, "mix": 0.4, "decay": 0.5, "tone": 0.5},
        aliases=("map2://juce/reverb/pcm70",),
    ),
    _entry(
        "map2:fx:mpx1",
        label="MPX-1 Multi-FX",
        description="Lexicon MPX-1-modelled multi-effect rack.",
        category="multi-fx",
        default_parameters={"program": 0.0, "mix": 0.5},
    ),
    _entry(
        "map2:fx:overdrive",
        label="Overdrive",
        description="Soft-clip overdrive.",
        category="drive",
        default_parameters={"drive": 0.5, "tone": 0.5, "level": 0.7},
    ),
    _entry(
        "map2:fx:distortion",
        label="Distortion",
        description="Harder-edged distortion.",
        category="drive",
        default_parameters={"drive": 0.6, "tone": 0.5, "level": 0.7},
    ),
    _entry(
        "map2:fx:fuzz",
        label="Fuzz",
        description="Vintage fuzz voice.",
        category="drive",
        default_parameters={"fuzz": 0.7, "tone": 0.5, "level": 0.6},
    ),
    _entry(
        "map2:fx:wah",
        label="Wah",
        description="Sweepable resonant bandpass.",
        category="filter",
        default_parameters={"frequency": 0.5, "q": 0.6, "mix": 1.0},
    ),
    _entry(
        "map2:fx:eq",
        label="EQ",
        description="Parametric equalizer.",
        category="eq",
        default_parameters={"low_gain_db": 0.0, "mid_gain_db": 0.0, "high_gain_db": 0.0, "low_hz": 100.0, "high_hz": 8000.0},
    ),
    _entry(
        "map2:fx:compressor",
        label="Compressor",
        description="Feed-forward RMS compressor.",
        category="dynamics",
        default_parameters={"threshold_db": -18.0, "ratio": 4.0, "attack_ms": 10.0, "release_ms": 80.0, "makeup_db": 0.0},
    ),
    _entry(
        "map2:fx:limiter",
        label="Limiter",
        description="Brick-wall lookahead limiter.",
        category="dynamics",
        default_parameters={"threshold_db": -3.0, "ceiling_db": -0.3, "release_ms": 50.0},
    ),
    _entry(
        "map2:fx:gate",
        label="Gate",
        description="Noise gate for cleaning up high-gain signals.",
        category="dynamics",
        default_parameters={"threshold_db": -45.0, "attack_ms": 1.0, "hold_ms": 5.0, "release_ms": 100.0},
    ),
)


TONECHASER_SYSTEM_BLOCKS: tuple[UriCatalogEntry, ...] = (
    _entry(
        "map2:sys:output-limiter",
        label="Output Limiter",
        description="Per-snapshot output brickwall protection (Q92) — auto-injected.",
        category="safety",
        default_parameters={"threshold_dbfs": -18.0, "ceiling_dbfs": -0.3},
        is_system_managed=True,
    ),
    _entry(
        "map2:sys:noise-gate",
        label="Noise Gate",
        description="Auto-injected noise gate (Q93) — not persisted in graph doc.",
        category="safety",
        default_parameters={"threshold_db": -40.0, "release_ms": 100.0},
        is_system_managed=True,
    ),
    _entry(
        "map2:sys:input-gain",
        label="Input Gain",
        description="Pre-chain input gain stage.",
        category="io",
        default_parameters={"gain_db": 0.0},
    ),
    _entry(
        "map2:sys:output-gain",
        label="Output Gain",
        description="Post-chain output gain stage.",
        category="io",
        default_parameters={"gain_db": 0.0},
    ),
    _entry(
        "map2:sys:dry-blend",
        label="Dry Blend",
        description="Per-channel dry/wet blend stage.",
        category="mix",
        default_parameters={"dry_wet_mix": 100.0},
    ),
    _entry(
        "map2:sys:boost",
        label="Clean Boost",
        description="Unity-to-+12dB transparent boost.",
        category="drive",
        default_parameters={"gain_db": 0.0},
    ),
    _entry(
        "map2:sys:tuner",
        label="Tuner",
        description="Chromatic tuner (mutes output while active).",
        category="utility",
        default_parameters={},
    ),
)


TONECHASER_IO_BLOCKS: tuple[UriCatalogEntry, ...] = (
    _entry("map2:io:input", label="Input", description="Primary instrument input.", category="io"),
    _entry("map2:io:output", label="Output", description="Primary monitor output.", category="io"),
    _entry("map2:io:monitor", label="Monitor", description="Dedicated monitor/headphone bus.", category="io"),
    _entry("map2:io:aux-send-1", label="Aux Send 1", description="Post-chain aux send 1.", category="io"),
    _entry("map2:io:aux-send-2", label="Aux Send 2", description="Post-chain aux send 2.", category="io"),
    _entry("map2:io:aux-send-3", label="Aux Send 3", description="Post-chain aux send 3.", category="io"),
    _entry("map2:io:aux-send-4", label="Aux Send 4", description="Post-chain aux send 4.", category="io"),
    _entry("map2:io:aux-return-1", label="Aux Return 1", description="External effects-loop return 1.", category="io"),
    _entry("map2:io:aux-return-2", label="Aux Return 2", description="External effects-loop return 2.", category="io"),
    _entry("map2:io:aux-return-3", label="Aux Return 3", description="External effects-loop return 3.", category="io"),
    _entry("map2:io:aux-return-4", label="Aux Return 4", description="External effects-loop return 4.", category="io"),
)


TONECHASER_CONTROL_SOURCES: tuple[UriCatalogEntry, ...] = (
    _entry(
        "map2:ctrl:morph",
        label="Morph Pad",
        description="A/B/C/D quad morph X/Y control surface (Q70).",
        category="morph",
    ),
    _entry(
        "map2:ctrl:expression-pedal",
        label="Expression Pedal",
        description="Hardware or virtual expression pedal.",
        category="expression",
    ),
    _entry(
        "map2:ctrl:tap-tempo",
        label="Tap Tempo",
        description="Session tempo tap source.",
        category="tempo",
    ),
    _entry(
        "map2:ctrl:midi-cc",
        label="MIDI CC",
        description="Standard MIDI continuous controller.",
        category="midi",
    ),
    _entry(
        "map2:ctrl:osc",
        label="OSC Control",
        description="OSC-addressed control source.",
        category="osc",
    ),
    _entry(
        "map2:ctrl:gpio",
        label="GPIO Footswitch",
        description="Physical GPIO input (footswitch, button, pedal jack).",
        category="gpio",
    ),
    _entry(
        "map2:ctrl:maschine-encoder",
        label="Maschine Encoder",
        description="NI Maschine MK1 encoder.",
        category="maschine",
    ),
    _entry(
        "map2:ctrl:maschine-pad",
        label="Maschine Pad",
        description="NI Maschine MK1 pad.",
        category="maschine",
    ),
    _entry(
        "map2:ctrl:footswitch",
        label="Generic Footswitch",
        description="Any registered footswitch target.",
        category="gpio",
    ),
)


TONECHASER_CATALOG: tuple[UriCatalogEntry, ...] = (
    TONECHASER_FX_CATALOG
    + TONECHASER_SYSTEM_BLOCKS
    + TONECHASER_IO_BLOCKS
    + TONECHASER_CONTROL_SOURCES
)


_CATALOG_BY_URI: dict[str, UriCatalogEntry] = {entry.uri: entry for entry in TONECHASER_CATALOG}


def _build_alias_index() -> dict[str, str]:
    index: dict[str, str] = {}
    for entry in TONECHASER_CATALOG:
        for alias in entry.aliases:
            index[alias] = entry.uri
    return index


_ALIAS_INDEX: dict[str, str] = _build_alias_index()


def lookup_uri(uri: str) -> UriCatalogEntry | None:
    """Return the catalog entry for a canonical map2:{type}:{name} URI, or None."""
    return _CATALOG_BY_URI.get(str(uri or "").strip())


def lookup_alias(uri: str) -> str | None:
    """Return the canonical URI that a legacy URI resolves to, or None."""
    return _ALIAS_INDEX.get(str(uri or "").strip())


def iter_catalog(*, catalog_type: str | None = None) -> Iterable[UriCatalogEntry]:
    """Iterate catalog entries, optionally filtered to one URI type."""
    if catalog_type is None:
        return iter(TONECHASER_CATALOG)
    if catalog_type not in CATALOG_TYPES:
        raise ValueError(f"catalog_type must be one of {CATALOG_TYPES}, got {catalog_type!r}")
    return (entry for entry in TONECHASER_CATALOG if entry.type == catalog_type)


def catalog_aliases() -> dict[str, str]:
    """Return a copy of the legacy→canonical alias index."""
    return dict(_ALIAS_INDEX)


def seed_node_defaults(uri: str) -> dict[str, Any]:
    """Return a shallow-copyable seed dict with default parameters + state for a
    catalogued URI — useful when instantiating a new graph node from the block
    picker. Returns an empty dict for unknown URIs so callers can still build
    a valid graph node with `{"parameters": {}, "state": {}}`."""
    entry = lookup_uri(uri)
    if entry is None:
        return {"parameters": {}, "state": {}}
    return {
        "parameters": dict(entry.default_parameters),
        "state": dict(entry.default_state),
    }
