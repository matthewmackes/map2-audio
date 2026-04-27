"""Mixxx ControlObject → MAP2 engine target bridge.

Mixxx mapping JS calls ``engine.setValue("[Channel1]", "volume", 0.7)``.
MAP2 has no decks — its parameter graph speaks in terms of chains,
master, and snapshot-defined targets. This bridge translates between
the two, with two layers:

1. **Well-known table** — a static dict mapping Mixxx ControlObject
   ``(group, key)`` pairs to MAP2 engine target paths. Covers the
   ~150 most common Mixxx ControlObjects observed across upstream
   ``mixxx/res/controllers/`` mappings.

2. **Per-pack alias table** — vendor packs can override the mapping
   for an entire group (e.g. ``[Channel1] → audio.chain.7``) via
   their MIDI profile's ``mixxx_alias_table`` field.

Bindings that touch unmapped Mixxx features (scratch on a beatgrid,
AutoDJ, sampler) fail soft — the binding is skipped at load time, a
warning is logged. This is the right behavior; refusing to load any
mapping that touches an unmapped feature would reject every
interesting Mixxx mapping.

Architecture: ``docs/architecture/CONTROLLER_LAYER.md`` §6.4.
Worklist: ``T2459-B3``.
"""

from __future__ import annotations

import dataclasses
import logging

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Well-known ControlObject mappings.
#
# Sourced from Mixxx's ControlObject documentation:
#   https://manual.mixxx.org/2.5/en/chapters/appendix/mixxx_controls.html
#
# Format: (group, key) → MAP2 engine target path. We accept both the
# common deck-style group ([ChannelN], [Master]) and effect-style group
# names. The MAP2 target is the dotted path the audio engine consumes
# (audio.chain.<n>.<name>, audio.master.<name>, etc.).
# ---------------------------------------------------------------------------

WELL_KNOWN: dict[tuple[str, str], str] = {
    # --- Master channel ---
    ("[Master]", "volume"):              "audio.master.volume",
    ("[Master]", "headVolume"):          "audio.master.headphone_volume",
    ("[Master]", "headMix"):             "audio.master.headphone_mix",
    ("[Master]", "balance"):             "audio.master.balance",
    ("[Master]", "crossfader"):          "audio.master.crossfader",
    ("[Master]", "gain"):                "audio.master.gain",
    ("[Master]", "VuMeterL"):            "audio.master.vu_left",
    ("[Master]", "VuMeterR"):            "audio.master.vu_right",
    ("[Master]", "PeakIndicatorL"):      "audio.master.peak_left",
    ("[Master]", "PeakIndicatorR"):      "audio.master.peak_right",

    # --- Per-channel deck-equivalent controls (parametric N) ---
    # Decks are keyed by [ChannelN]. The bridge expands these by
    # substituting N with the alias-mapped chain index at lookup time.
    # The well-known table here uses N=1..4 explicitly so a
    # not-yet-aliased mapping resolves to chain.1..chain.4 by default.
}

# Generate per-channel rows for N=1..4 (4-deck Mixxx default).
for _n in (1, 2, 3, 4):
    _group = f"[Channel{_n}]"
    _chain = f"audio.chain.{_n}"
    WELL_KNOWN.update({
        (_group, "play"):                    f"{_chain}.play",
        (_group, "pause"):                   f"{_chain}.pause",
        (_group, "cue_default"):             f"{_chain}.cue",
        (_group, "cue_set"):                 f"{_chain}.cue_set",
        (_group, "volume"):                  f"{_chain}.volume",
        (_group, "pregain"):                 f"{_chain}.gain",
        (_group, "mute"):                    f"{_chain}.mute",
        (_group, "pfl"):                     f"{_chain}.solo",
        (_group, "rate"):                    f"{_chain}.rate",
        (_group, "rate_perm_up"):            f"{_chain}.rate_up",
        (_group, "rate_perm_down"):          f"{_chain}.rate_down",
        (_group, "rate_temp_up"):            f"{_chain}.rate_temp_up",
        (_group, "rate_temp_down"):          f"{_chain}.rate_temp_down",
        (_group, "loop_in"):                 f"{_chain}.loop_in",
        (_group, "loop_out"):                f"{_chain}.loop_out",
        (_group, "reloop_exit"):             f"{_chain}.loop_toggle",
        (_group, "beatloop_activate"):       f"{_chain}.beatloop",
        (_group, "filterLow"):               f"{_chain}.eq.low",
        (_group, "filterMid"):               f"{_chain}.eq.mid",
        (_group, "filterHigh"):              f"{_chain}.eq.high",
        (_group, "filterLowKill"):           f"{_chain}.eq.low_kill",
        (_group, "filterMidKill"):           f"{_chain}.eq.mid_kill",
        (_group, "filterHighKill"):          f"{_chain}.eq.high_kill",
        (_group, "VuMeter"):                 f"{_chain}.vu",
        (_group, "VuMeterL"):                f"{_chain}.vu_left",
        (_group, "VuMeterR"):                f"{_chain}.vu_right",
        (_group, "PeakIndicator"):           f"{_chain}.peak",
        (_group, "back"):                    f"{_chain}.transport_back",
        (_group, "fwd"):                     f"{_chain}.transport_forward",
        (_group, "track_loaded"):            f"{_chain}.track_loaded",
        (_group, "duration"):                f"{_chain}.duration",
        (_group, "playposition"):            f"{_chain}.position",
        (_group, "bpm"):                     f"{_chain}.bpm",
        (_group, "sync_enabled"):            f"{_chain}.sync",
        (_group, "sync_master"):             f"{_chain}.sync_master",
        (_group, "keylock"):                 f"{_chain}.keylock",
        (_group, "key"):                     f"{_chain}.key",
        # Hot cues — Mixxx supports up to 8 by default.
        **{
            (_group, f"hotcue_{i}_activate"): f"{_chain}.hotcue.{i}.activate"
            for i in range(1, 9)
        },
        **{
            (_group, f"hotcue_{i}_clear"): f"{_chain}.hotcue.{i}.clear"
            for i in range(1, 9)
        },
    })


# Mixxx features MAP2 doesn't yet have an analogue for. Bindings that
# resolve to one of these are explicitly logged + skipped (rather than
# silently failing) so the operator's GUI can show "N bindings skipped
# — these Mixxx features aren't supported on MAP2 yet".
UNSUPPORTED_KEYS: set[str] = {
    "scratch_position",
    "scratch_enable",
    "scratch2",
    "scratch2_enable",
    "beatgrid_translate_curpos",
    "beats_translate_match_alignment",
    "rate_set_default",
    "AutoDJ",   # legacy
    "sampler",  # placeholder — sampler-related keys live in [SamplerN] groups
}


@dataclasses.dataclass
class BridgeResult:
    """Outcome of resolving a Mixxx (group, key) tuple."""

    target: str | None
    fail_soft_reason: str | None = None

    @property
    def resolved(self) -> bool:
        return self.target is not None


def resolve(
    group: str,
    key: str,
    alias_table: dict[str, str] | None = None,
) -> BridgeResult:
    """Translate a Mixxx ControlObject (group, key) to a MAP2 target.

    Resolution order:

    1. If the per-pack ``alias_table`` overrides the group, use
       ``f"{alias_table[group]}.{key}"`` directly. This is how a vendor
       pack maps Mixxx's 4-deck assumption onto MAP2's chain layout.
    2. Otherwise, look up the well-known table.
    3. If unmapped and the ``key`` is in :data:`UNSUPPORTED_KEYS`, log
       a fail-soft warning explaining the feature isn't supported.
    4. Otherwise, log a fail-soft warning that the binding is unknown.
    """
    alias_table = alias_table or {}

    if group in alias_table:
        target = f"{alias_table[group]}.{key}"
        return BridgeResult(target=target)

    target = WELL_KNOWN.get((group, key))
    if target is not None:
        return BridgeResult(target=target)

    # Sampler / sub-group prefixes get a generic fail-soft.
    if group.startswith("[Sampler") or group.startswith("[QuickEffectRack"):
        reason = f"Mixxx feature not supported on MAP2: {group}.{key}"
        return BridgeResult(target=None, fail_soft_reason=reason)

    if key in UNSUPPORTED_KEYS:
        reason = f"Mixxx feature explicitly unsupported on MAP2: {group}.{key}"
        return BridgeResult(target=None, fail_soft_reason=reason)

    return BridgeResult(
        target=None,
        fail_soft_reason=(
            f"Unknown Mixxx ControlObject: {group}.{key}. "
            "Add to WELL_KNOWN in mixxx_control_object_bridge.py "
            "or to the pack's mixxx_alias_table."
        ),
    )
