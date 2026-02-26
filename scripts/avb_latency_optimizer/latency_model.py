"""Latency budget estimation for AVB path planning."""

from __future__ import annotations

from .models import ExtractedConfig, LatencyBudget


def estimate_latency_budget(config: ExtractedConfig) -> LatencyBudget:
    """Estimate current and optimized one-way AVB latency in milliseconds."""

    assumptions: list[str] = []

    sample_rate = int(config.numeric.get("sample_rate_hz", 48000))
    if "sample_rate_hz" not in config.numeric:
        assumptions.append("ASSUMPTION: sample_rate_hz=48000")

    buffer_size = int(config.numeric.get("buffer_size_samples", 128))
    if "buffer_size_samples" not in config.numeric:
        assumptions.append("ASSUMPTION: buffer_size_samples=128")

    hop_count = int(config.numeric.get("hop_count", 2))
    if "hop_count" not in config.numeric:
        assumptions.append("ASSUMPTION: hop_count=2")

    presentation_offset_ms = float(config.numeric.get("presentation_offset_ms", 0.5))
    if "presentation_offset_ms" not in config.numeric:
        assumptions.append("ASSUMPTION: presentation_offset_ms=0.5")

    one_buffer_ms = (buffer_size / sample_rate) * 1000.0

    has_cbs = bool(config.features.get("credit_based_shaping") and config.features["credit_based_shaping"].present)
    has_gptp = bool(config.features.get("gptp_sync") and config.features["gptp_sync"].present)

    if has_cbs and has_gptp:
        per_hop_us = 75.0
    elif has_gptp:
        per_hop_us = 125.0
    else:
        per_hop_us = 250.0
        assumptions.append("ASSUMPTION: per-hop queueing degraded without observed gPTP/CBS")

    network_ms = (hop_count * per_hop_us) / 1000.0
    processing_ms = 0.20

    components = {
        "talker_buffer_ms": round(one_buffer_ms, 4),
        "network_hops_ms": round(network_ms, 4),
        "listener_buffer_ms": round(one_buffer_ms, 4),
        "presentation_offset_ms": round(presentation_offset_ms, 4),
        "processing_ms": round(processing_ms, 4),
    }

    worst_case_ms = round(sum(components.values()), 4)

    optimized_buffer = 64 if buffer_size >= 64 else max(32, buffer_size)
    optimized_sample_rate = max(sample_rate, 48000)
    optimized_buffer_ms = (optimized_buffer / optimized_sample_rate) * 1000.0
    optimized_presentation = min(presentation_offset_ms, 0.35)
    optimized_network_ms = (hop_count * 50.0) / 1000.0
    optimized_target_raw = (
        optimized_buffer_ms + optimized_buffer_ms + optimized_network_ms + optimized_presentation + processing_ms
    )
    optimized_target_ms = round(min(optimized_target_raw, worst_case_ms), 4)
    if optimized_target_raw > worst_case_ms:
        assumptions.append("ASSUMPTION: current settings already below generic optimization profile")

    observed_count = sum(1 for key in ("sample_rate_hz", "buffer_size_samples", "hop_count", "presentation_offset_ms") if key in config.numeric)
    confidence = min(0.95, 0.45 + (observed_count * 0.12) + (0.1 if has_gptp else 0.0) + (0.1 if has_cbs else 0.0))

    return LatencyBudget(
        components_ms=components,
        worst_case_ms=worst_case_ms,
        optimized_target_ms=optimized_target_ms,
        confidence=round(confidence, 2),
        assumptions=assumptions,
    )
