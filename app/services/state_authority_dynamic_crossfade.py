"""T2454-B — dynamic crossfade length helper for warm-path activation.

The warm-path activation always spills (Q3=D locked). The crossfade length
scales to the longest active tail-bearing processor in the target snapshot:

    map2://juce/delay              → 1500ms
    map2://juce/multieffect/shoegaze → 1200ms
    map2://juce/reverb/pcm70       →  2000ms
    (default for non-tail processors)→  500ms

Result is clamped to [500, 2000] ms — the locked floor / cap. Bypassed
processors don't count (they're silent regardless of tail length). Empty
or non-tail-bearing graphs return the 500ms floor.

Pure helper; no engine I/O. The activation FSM calls this once at the
start of APPLYING and threads the result into `apply_graph_document_to_engine`'s
`max_crossfade_ms` parameter.
"""

from __future__ import annotations

from typing import Any, Mapping


# Locked vocabulary from T2454-B-Q3=A. Updating these requires bumping the
# task and re-confirming with the user — these are the perceptual lengths
# the operator is signed off on.
SNAPSHOT_TAIL_LENGTHS_MS: Mapping[str, int] = {
    "map2://juce/delay": 1500,
    "map2://juce/multieffect/shoegaze": 1200,
    "map2://juce/reverb/pcm70": 2000,
}

DEFAULT_CROSSFADE_MS = 500
MIN_CROSSFADE_MS = 500
MAX_CROSSFADE_MS = 2000


def compute_dynamic_crossfade_ms(target_detail: Mapping[str, Any] | None) -> int:
    """Walk the target snapshot's chains/plugins, pick the longest active
    tail-bearing processor's tail length, clamp to [500, 2000]ms.

    Bypassed processors don't count. Non-tail-bearing processors don't
    count. If nothing tail-bearing is active, returns the 500ms floor."""
    longest = DEFAULT_CROSSFADE_MS

    if not isinstance(target_detail, Mapping):
        return _clamp(longest)

    chains = target_detail.get("chains")
    if not isinstance(chains, list):
        return _clamp(longest)

    for chain in chains:
        if not isinstance(chain, Mapping):
            continue
        plugins = chain.get("plugins")
        if not isinstance(plugins, list):
            continue
        for plugin in plugins:
            if not isinstance(plugin, Mapping):
                continue
            if bool(plugin.get("bypass", False)):
                continue
            uri = plugin.get("uri")
            if not isinstance(uri, str):
                continue
            tail = SNAPSHOT_TAIL_LENGTHS_MS.get(uri)
            if tail is None:
                continue
            if tail > longest:
                longest = tail

    return _clamp(longest)


def _clamp(value: int) -> int:
    if value < MIN_CROSSFADE_MS:
        return MIN_CROSSFADE_MS
    if value > MAX_CROSSFADE_MS:
        return MAX_CROSSFADE_MS
    return value
