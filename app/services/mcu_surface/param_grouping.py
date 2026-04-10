from __future__ import annotations

import math
import re
from typing import Any, Mapping, Sequence

MCU_BANK_SIZE = 8

_SEMANTIC_PRIORITY = {
    "eq": 0,
    "dynamics": 1,
    "modulation": 2,
    "delay": 3,
    "reverb": 4,
    "pitch": 5,
    "amp": 6,
    "mixer": 7,
    "input": 8,
    "output": 9,
    "switches": 10,
    "utility": 11,
}

_SEMANTIC_LABELS = {
    "eq": "EQ",
    "dynamics": "Dynamics",
    "modulation": "Modulation",
    "delay": "Delay",
    "reverb": "Reverb",
    "pitch": "Pitch",
    "amp": "Amp",
    "mixer": "Mixer",
    "input": "Input",
    "output": "Output",
    "switches": "Switches",
    "utility": "Utility",
}

_PLUGIN_CATEGORY_HINTS = {
    "eq": ("eq", "equalizer", "filter", "parametric"),
    "dynamics": ("compressor", "limiter", "gate", "dynamics"),
    "modulation": ("modulation", "chorus", "flanger", "phaser", "vibrato", "tremolo"),
    "delay": ("delay", "echo"),
    "reverb": ("reverb", "verb", "plate", "hall", "room"),
    "pitch": ("pitch", "shifter", "harmonizer", "octaver"),
    "amp": ("amp", "amplifier", "cabinet", "distortion", "drive", "simulator"),
    "mixer": ("mixer", "gain", "widener", "balance"),
    "utility": ("utility", "macro", "rack", "multi", "generic"),
}

_ROLE_PATTERNS = {
    "frequency": ("freq", "frequency", "cutoff", "lowcut", "highcut", "lo_cut", "hi_cut"),
    "gain": ("gain", "trim", "level", "makeup", "volume"),
    "q": ("q", "resonance", "bandwidth"),
    "type": ("type", "mode", "shape"),
    "slope": ("slope",),
    "threshold": ("threshold", "thresh"),
    "ratio": ("ratio",),
    "attack": ("attack",),
    "release": ("release",),
    "hold": ("hold",),
    "knee": ("knee",),
    "range": ("range",),
    "time": ("time", "delay", "predelay", "pre_delay", "pre-delay", "decay"),
    "feedback": ("feedback", "regen", "repeat"),
    "rate": ("rate", "speed"),
    "depth": ("depth", "amount"),
    "phase": ("phase",),
    "mix": ("mix", "blend", "wet", "dry", "balance"),
    "drive": ("drive", "saturation", "dist", "distortion"),
    "tone": ("tone", "bass", "mid", "mids", "treble", "presence", "colour", "color"),
    "width": ("width", "spread", "stereo"),
    "size": ("size", "room"),
    "diffusion": ("diffusion",),
    "damping": ("damping", "damp"),
    "pitch": ("pitch", "detune", "semitone", "octave", "formant", "transpose"),
    "pan": ("pan",),
    "input": ("input", "in"),
    "output": ("output", "out"),
    "enable": ("enable", "enabled", "active", "on", "off"),
    "bypass": ("bypass",),
}

_ROLE_ORDER = {
    "eq": (
        "frequency",
        "gain",
        "q",
        "type",
        "slope",
        "mix",
        "output",
        "enable",
        "bypass",
    ),
    "dynamics": (
        "threshold",
        "ratio",
        "attack",
        "release",
        "hold",
        "knee",
        "range",
        "gain",
        "mix",
        "output",
        "enable",
        "bypass",
    ),
    "modulation": (
        "rate",
        "depth",
        "phase",
        "feedback",
        "width",
        "mix",
        "output",
        "enable",
        "bypass",
    ),
    "delay": (
        "time",
        "feedback",
        "frequency",
        "width",
        "mix",
        "output",
        "enable",
        "bypass",
    ),
    "reverb": (
        "time",
        "size",
        "diffusion",
        "damping",
        "tone",
        "width",
        "mix",
        "output",
        "enable",
        "bypass",
    ),
    "pitch": (
        "pitch",
        "frequency",
        "mix",
        "output",
        "enable",
        "bypass",
    ),
    "amp": (
        "drive",
        "gain",
        "tone",
        "mix",
        "output",
        "enable",
        "bypass",
    ),
    "mixer": ("input", "pan", "width", "gain", "mix", "output"),
    "input": ("input", "gain", "frequency", "enable"),
    "output": ("output", "gain", "mix", "enable"),
    "switches": ("enable", "bypass"),
    "utility": ("gain", "mix", "frequency", "time", "enable", "bypass"),
}

_SEMANTIC_TOKENS = {
    "eq": ("eq", "frequency", "freq", "cutoff", "q", "resonance", "bandwidth", "shelf", "peak", "notch", "band"),
    "dynamics": ("threshold", "thresh", "ratio", "attack", "release", "knee", "compress", "gate", "limiter", "hold", "makeup"),
    "modulation": ("rate", "speed", "depth", "phase", "chorus", "flanger", "phaser", "vibrato", "tremolo", "lfo"),
    "delay": ("delay", "echo", "feedback", "tap", "ping", "pong", "repeat"),
    "reverb": ("reverb", "room", "hall", "plate", "diffusion", "damping", "predelay", "pre_delay", "pre-delay", "decay"),
    "pitch": ("pitch", "detune", "octave", "semitone", "formant", "transpose", "tune"),
    "amp": ("amp", "cab", "drive", "distortion", "presence", "sag", "bias", "bass", "mid", "treble"),
    "mixer": ("mix", "blend", "wet", "dry", "pan", "width", "balance", "gain", "level", "volume"),
    "input": ("input", "preamp"),
    "output": ("output", "master"),
    "switches": ("enable", "enabled", "active", "bypass", "power", "mute", "solo"),
}

_CLUSTER_PATTERNS = (
    re.compile(r"(band|filter|eq|osc|voice|lfo|env|delay|tap|stage|operator|op|channel|path)[ _-]*(\d+)", re.IGNORECASE),
    re.compile(r"(\d+)[ _-]*(band|filter|eq|osc|voice|lfo|env|delay|tap|stage|operator|op|channel|path)", re.IGNORECASE),
)


def _tokenize(*values: Any) -> set[str]:
    text = " ".join(str(value or "") for value in values).lower()
    return {token for token in re.split(r"[^a-z0-9]+", text) if token}


def _normalize_parameter(parameter: Mapping[str, Any], fallback_index: int) -> dict[str, Any]:
    name = str(parameter.get("name") or parameter.get("label") or parameter.get("symbol") or f"Param {fallback_index + 1}").strip()
    symbol = str(parameter.get("symbol") or "").strip()
    min_value = _safe_float(parameter.get("min"), 0.0)
    max_value = _safe_float(parameter.get("max"), 1.0)
    default_value = _safe_float(parameter.get("default"), min_value)
    return {
        "index": int(parameter.get("index", fallback_index)),
        "name": name,
        "symbol": symbol,
        "min": min_value,
        "max": max_value,
        "default": default_value,
        "current": parameter.get("current"),
        "is_toggled": bool(parameter.get("is_toggled", False)),
        "is_log": bool(parameter.get("is_log", False)),
        "unit": str(parameter.get("unit") or "").strip(),
    }


def _safe_float(raw_value: Any, fallback: float) -> float:
    try:
        value = float(raw_value)
    except (TypeError, ValueError):
        return fallback
    return value if math.isfinite(value) else fallback


def _infer_plugin_mode(*, plugin_name: str, plugin_category: str, plugin_class: str) -> str | None:
    tokens = _tokenize(plugin_name, plugin_category, plugin_class)
    best_group: str | None = None
    best_score = 0
    for group_id, hints in _PLUGIN_CATEGORY_HINTS.items():
        score = sum(1 for hint in hints if hint in tokens)
        if score > best_score:
            best_group = group_id
            best_score = score
    return best_group


def _extract_cluster(tokens: set[str], token_text: str) -> tuple[str, int] | None:
    for pattern in _CLUSTER_PATTERNS:
        match = pattern.search(token_text)
        if not match:
            continue
        groups = match.groups()
        if groups[0].isdigit():
            return (groups[1].lower(), int(groups[0]))
        return (groups[0].lower(), int(groups[1]))
    for token in tokens:
        match = re.fullmatch(r"([a-z]+)(\d+)", token)
        if match:
            return (match.group(1).lower(), int(match.group(2)))
    return None


def _infer_role(tokens: set[str]) -> str:
    for role_id, patterns in _ROLE_PATTERNS.items():
        if any(pattern in tokens for pattern in patterns):
            return role_id
    return "utility"


def _semantic_scores(tokens: set[str], *, role_id: str, plugin_mode: str | None, is_toggled: bool) -> dict[str, int]:
    scores = {group_id: 0 for group_id in _SEMANTIC_PRIORITY}
    token_text = " ".join(sorted(tokens))

    for group_id, hints in _SEMANTIC_TOKENS.items():
        scores[group_id] += sum(1 for hint in hints if hint in tokens or hint in token_text)

    if role_id in {"input", "output", "pan", "width", "mix"}:
        scores["mixer"] += 2
    if role_id in {"input", "gain"} and "input" in tokens:
        scores["input"] += 3
    if role_id in {"output", "gain"} and ("output" in tokens or "master" in tokens):
        scores["output"] += 3
    if is_toggled or role_id in {"enable", "bypass"}:
        scores["switches"] += 4
    if role_id in {"threshold", "ratio", "attack", "release", "hold", "knee", "range"}:
        scores["dynamics"] += 4
    if role_id in {"frequency", "q", "type", "slope"}:
        scores["eq"] += 3
    if role_id in {"rate", "depth", "phase"}:
        scores["modulation"] += 3
    if role_id in {"time", "feedback"}:
        scores["delay"] += 2
        scores["reverb"] += 1
    if role_id == "pitch":
        scores["pitch"] += 4
    if role_id in {"drive", "tone"}:
        scores["amp"] += 4

    if plugin_mode:
        scores[plugin_mode] += 3
        if plugin_mode == "modulation" and role_id == "mix":
            scores["modulation"] += 2
        if plugin_mode == "delay" and role_id in {"time", "feedback", "frequency", "mix"}:
            scores["delay"] += 2
        if plugin_mode == "reverb" and role_id in {"time", "size", "diffusion", "damping", "mix"}:
            scores["reverb"] += 2
        if plugin_mode == "eq" and role_id in {"frequency", "gain", "q", "type", "slope"}:
            scores["eq"] += 2
        if plugin_mode == "dynamics" and role_id in {"threshold", "ratio", "attack", "release", "knee", "gain"}:
            scores["dynamics"] += 2
        if plugin_mode == "dynamics" and role_id == "mix":
            scores["dynamics"] += 3
        if plugin_mode == "amp" and role_id in {"drive", "gain", "tone", "output"}:
            scores["amp"] += 2

    return scores


def classify_parameter_group(
    parameter: Mapping[str, Any],
    *,
    plugin_name: str = "",
    plugin_category: str = "",
    plugin_class: str = "",
) -> dict[str, Any]:
    normalized = _normalize_parameter(parameter, int(parameter.get("index", 0) or 0))
    tokens = _tokenize(normalized["name"], normalized["symbol"], normalized["unit"])
    token_text = f"{normalized['name']} {normalized['symbol']}".lower()
    role_id = _infer_role(tokens)
    plugin_mode = _infer_plugin_mode(
        plugin_name=plugin_name,
        plugin_category=plugin_category,
        plugin_class=plugin_class,
    )
    cluster = _extract_cluster(tokens, token_text)
    scores = _semantic_scores(
        tokens,
        role_id=role_id,
        plugin_mode=plugin_mode,
        is_toggled=normalized["is_toggled"],
    )
    group_id = min(
        scores,
        key=lambda candidate: (-scores[candidate], _SEMANTIC_PRIORITY.get(candidate, 999), candidate),
    )
    if scores[group_id] <= 0:
        group_id = "switches" if normalized["is_toggled"] else "utility"
    return {
        **normalized,
        "group_id": group_id,
        "group_label": _SEMANTIC_LABELS[group_id],
        "role_id": role_id,
        "cluster_id": cluster[0] if cluster else None,
        "cluster_index": cluster[1] if cluster else None,
        "tokens": sorted(tokens),
    }


def _role_sort_value(group_id: str, role_id: str) -> int:
    order = _ROLE_ORDER.get(group_id, ())
    try:
        return order.index(role_id)
    except ValueError:
        return len(order) + 1


def _parameter_sort_key(parameter: Mapping[str, Any]) -> tuple[Any, ...]:
    group_id = str(parameter.get("group_id") or "utility")
    cluster_index = parameter.get("cluster_index")
    has_cluster = isinstance(cluster_index, int)
    cluster_rank = 0 if has_cluster and group_id not in {"input", "output", "mixer"} else 1
    return (
        _SEMANTIC_PRIORITY.get(group_id, 999),
        cluster_rank,
        str(parameter.get("cluster_id") or ""),
        int(cluster_index) if has_cluster else 0,
        _role_sort_value(group_id, str(parameter.get("role_id") or "utility")),
        int(parameter.get("index", 0)),
        str(parameter.get("symbol") or parameter.get("name") or ""),
    )


def build_parameter_banks(
    parameters: Sequence[Mapping[str, Any]],
    *,
    plugin_name: str = "",
    plugin_category: str = "",
    plugin_class: str = "",
    bank_size: int = MCU_BANK_SIZE,
) -> list[dict[str, Any]]:
    effective_bank_size = max(1, int(bank_size or MCU_BANK_SIZE))
    classified = [
        classify_parameter_group(
            parameter,
            plugin_name=plugin_name,
            plugin_category=plugin_category,
            plugin_class=plugin_class,
        )
        for parameter in parameters
    ]
    classified.sort(key=_parameter_sort_key)

    groups: dict[str, list[dict[str, Any]]] = {}
    for parameter in classified:
        groups.setdefault(str(parameter["group_id"]), []).append(parameter)

    banks: list[dict[str, Any]] = []
    for group_id in sorted(groups, key=lambda candidate: _SEMANTIC_PRIORITY.get(candidate, 999)):
        grouped_parameters = groups[group_id]
        total_pages = max(1, math.ceil(len(grouped_parameters) / effective_bank_size))
        for page_index in range(total_pages):
            window = grouped_parameters[page_index * effective_bank_size : (page_index + 1) * effective_bank_size]
            banks.append(
                {
                    "bank_index": len(banks),
                    "page_index": page_index,
                    "page_count": total_pages,
                    "group_id": group_id,
                    "group_label": _SEMANTIC_LABELS.get(group_id, group_id.title()),
                    "title": (
                        _SEMANTIC_LABELS.get(group_id, group_id.title())
                        if total_pages == 1
                        else f"{_SEMANTIC_LABELS.get(group_id, group_id.title())} {page_index + 1}/{total_pages}"
                    ),
                    "parameters": [
                        {
                            key: value
                            for key, value in parameter.items()
                            if key != "tokens"
                        }
                        for parameter in window
                    ],
                }
            )
    return banks


def build_plugin_parameter_banks(plugin: Mapping[str, Any], *, bank_size: int = MCU_BANK_SIZE) -> list[dict[str, Any]]:
    raw_parameters = plugin.get("parameters")
    parameters = raw_parameters if isinstance(raw_parameters, Sequence) else []
    return build_parameter_banks(
        [parameter for parameter in parameters if isinstance(parameter, Mapping)],
        plugin_name=str(plugin.get("name") or ""),
        plugin_category=str(plugin.get("category") or ""),
        plugin_class=str(plugin.get("class_label") or ""),
        bank_size=bank_size,
    )
