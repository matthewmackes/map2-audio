"""Canonical plugin key-parameter resolver for controller-display prep."""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import asdict, dataclass
from typing import Any, Optional


_FAMILY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "delay": ("delay", "echo"),
    "reverb": ("reverb", "hall", "plate", "room", "spring", "ambience", "ambient"),
    "gain": ("distortion", "overdrive", "fuzz", "drive", "amp", "amplifier", "preamp", "gain"),
    "modulation": ("modulation", "chorus", "phaser", "flanger", "tremolo", "vibrato", "rotary", "univibe"),
    "dynamics": ("dynamics", "compressor", "limiter", "gate"),
    "pitch": ("pitch", "harmonizer", "shifter", "detune", "octave"),
}

_FAMILY_PATTERNS: dict[str, tuple[tuple[str, ...], ...]] = {
    "delay": (
        ("feedback",),
        ("mix",),
        ("delay_time", "delay time", "time"),
        ("tempo",),
        ("diffusion",),
    ),
    "reverb": (
        ("mix",),
        ("decay",),
        ("pre_delay", "predelay", "pre delay"),
        ("damping", "damp"),
        ("diffusion",),
    ),
    "gain": (
        ("drive",),
        ("gain",),
        ("input_gain", "input gain", "preamp"),
        ("threshold",),
        ("output_gain", "output gain", "level"),
    ),
    "modulation": (
        ("depth",),
        ("rate",),
        ("mix",),
        ("feedback",),
    ),
    "dynamics": (
        ("threshold",),
        ("ratio",),
        ("attack",),
        ("release",),
    ),
    "pitch": (
        ("balance",),
        ("mix",),
        ("pitch", "shift"),
        ("feedback",),
    ),
}

_GENERIC_PATTERNS: tuple[tuple[str, ...], ...] = (
    ("mix",),
    ("feedback",),
    ("depth",),
    ("drive",),
    ("gain",),
    ("threshold",),
    ("decay",),
    ("rate",),
    ("time",),
    ("frequency",),
)

_NON_KEY_PARAMETER_TERMS = {
    "auto",
    "automakeup",
    "auto makeup",
    "bypass",
    "enable",
    "enabled",
    "mode",
    "normalize",
    "preset",
    "program",
    "spillover",
}


@dataclass(frozen=True)
class PluginKeyParameterMetadata:
    """Stable key-parameter descriptor derived from plugin metadata."""

    family: str
    parameter_index: int
    parameter_symbol: str
    parameter_name: str
    selection_strategy: str
    matched_on: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _normalize_text(value: Any) -> str:
    text = str(value or "").strip().lower().replace("_", " ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


def _keyword_score(text: str, keyword: str) -> int:
    if not text or not keyword:
        return 0
    if text == keyword:
        return 120
    if f" {keyword} " in f" {text} ":
        return 105
    if text.startswith(f"{keyword} ") or text.endswith(f" {keyword}"):
        return 100
    if keyword in text:
        return 90
    return 0


def _infer_plugin_family(plugin: Mapping[str, Any]) -> tuple[str, str]:
    category = _normalize_text(plugin.get("category"))
    class_label = _normalize_text(plugin.get("class_label"))
    name = _normalize_text(plugin.get("name"))
    uri = _normalize_text(plugin.get("uri"))

    best_family = ""
    best_keyword = ""
    best_score = 0

    for family, keywords in _FAMILY_KEYWORDS.items():
        for keyword in keywords:
            normalized_keyword = _normalize_text(keyword)
            score = max(
                _keyword_score(category, normalized_keyword) * 4,
                _keyword_score(class_label, normalized_keyword) * 3,
                _keyword_score(name, normalized_keyword) * 2,
                _keyword_score(uri, normalized_keyword),
            )
            if score > best_score:
                best_family = family
                best_keyword = normalized_keyword
                best_score = score

    return best_family, best_keyword


def _coerce_index(parameter: Mapping[str, Any], fallback: int) -> int:
    try:
        return int(parameter.get("index"))
    except (TypeError, ValueError):
        return fallback


def _parameter_text(parameter: Mapping[str, Any]) -> tuple[str, str]:
    return (
        _normalize_text(parameter.get("symbol")),
        _normalize_text(parameter.get("name")),
    )


def _is_meaningful_parameter(parameter: Mapping[str, Any]) -> bool:
    symbol_text, name_text = _parameter_text(parameter)
    if not symbol_text and not name_text:
        return False
    combined = " ".join(part for part in (symbol_text, name_text) if part)
    if "bypass" in combined:
        return False
    if symbol_text in _NON_KEY_PARAMETER_TERMS or name_text in _NON_KEY_PARAMETER_TERMS:
        return False
    return True


def _match_parameter(
    parameter: Mapping[str, Any],
    keywords: tuple[str, ...],
) -> tuple[int, str]:
    symbol_text, name_text = _parameter_text(parameter)
    if not symbol_text and not name_text:
        return 0, ""

    best_score = 0
    best_keyword = ""
    digit_penalty = 8 if re.search(r"\d", f"{symbol_text} {name_text}") else 0

    for keyword in keywords:
        normalized_keyword = _normalize_text(keyword)
        score = 0
        symbol_score = _keyword_score(symbol_text, normalized_keyword)
        name_score = _keyword_score(name_text, normalized_keyword)
        if symbol_score > 0:
            score = max(score, symbol_score + 30)
        if name_score > 0:
            score = max(score, name_score + 20)
        if score <= 0:
            continue
        score -= digit_penalty
        if score > best_score:
            best_score = score
            best_keyword = normalized_keyword

    return best_score, best_keyword


def _select_best_parameter(
    plugin: Mapping[str, Any],
    patterns: tuple[tuple[str, ...], ...],
    *,
    family: str,
    selection_strategy: str,
) -> Optional[PluginKeyParameterMetadata]:
    raw_parameters = plugin.get("parameters")
    if not isinstance(raw_parameters, list):
        return None

    for keywords in patterns:
        best_parameter: Optional[Mapping[str, Any]] = None
        best_keyword = ""
        best_score = 0
        best_index = 0

        for fallback_index, parameter in enumerate(raw_parameters):
            if not isinstance(parameter, Mapping):
                continue
            if not _is_meaningful_parameter(parameter):
                continue

            score, matched_on = _match_parameter(parameter, keywords)
            if score <= 0:
                continue

            parameter_index = _coerce_index(parameter, fallback_index)
            if best_parameter is None or score > best_score or (
                score == best_score and parameter_index < best_index
            ):
                best_parameter = parameter
                best_score = score
                best_keyword = matched_on
                best_index = parameter_index

        if best_parameter is not None:
            return PluginKeyParameterMetadata(
                family=family,
                parameter_index=_coerce_index(best_parameter, best_index),
                parameter_symbol=str(best_parameter.get("symbol") or "").strip(),
                parameter_name=str(best_parameter.get("name") or "").strip(),
                selection_strategy=selection_strategy,
                matched_on=best_keyword,
            )

    return None


def _fallback_parameter(plugin: Mapping[str, Any], *, family: str) -> Optional[PluginKeyParameterMetadata]:
    raw_parameters = plugin.get("parameters")
    if not isinstance(raw_parameters, list):
        return None

    for fallback_index, parameter in enumerate(raw_parameters):
        if not isinstance(parameter, Mapping):
            continue
        if not _is_meaningful_parameter(parameter):
            continue
        return PluginKeyParameterMetadata(
            family=family or "generic",
            parameter_index=_coerce_index(parameter, fallback_index),
            parameter_symbol=str(parameter.get("symbol") or "").strip(),
            parameter_name=str(parameter.get("name") or "").strip(),
            selection_strategy="first_usable_parameter",
            matched_on="index_order",
        )
    return None


def resolve_plugin_key_parameter(plugin: Mapping[str, Any]) -> Optional[PluginKeyParameterMetadata]:
    """Resolve the default key parameter for a plugin metadata payload."""

    family, _matched_keyword = _infer_plugin_family(plugin)
    if family:
        family_match = _select_best_parameter(
            plugin,
            _FAMILY_PATTERNS.get(family, ()),
            family=family,
            selection_strategy="family_override",
        )
        if family_match is not None:
            return family_match

    generic_match = _select_best_parameter(
        plugin,
        _GENERIC_PATTERNS,
        family=family or "generic",
        selection_strategy="generic_preference",
    )
    if generic_match is not None:
        return generic_match

    fallback = _fallback_parameter(plugin, family=family or "generic")
    if fallback is not None:
        return fallback

    return None


def attach_plugin_key_parameter_metadata(plugin: Mapping[str, Any]) -> dict[str, Any]:
    """Attach a stable key-parameter descriptor to a plugin metadata payload."""

    payload = dict(plugin)
    resolved = resolve_plugin_key_parameter(payload)
    payload["key_parameter"] = resolved.to_dict() if resolved is not None else None
    return payload
