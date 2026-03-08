"""Extraction of AVB/TSN-relevant config from scan results."""

from __future__ import annotations

from collections import defaultdict
from pathlib import Path
import re

from .models import EvidenceRef, ExtractedConfig, FeatureObservation, ScanResult

FEATURE_TERMS: dict[str, list[str]] = {
    "gptp_sync": ["gptp", "802.1as", "ptp4l", "phc2sys"],
    "stream_reservation": ["srp", "msrp", "802.1qat", "802.1qcc", "stream reservation"],
    "credit_based_shaping": ["802.1qav", "fqtss", "credit-based shaper", "cbs", "qdisc", "taprio", "mqprio"],
    "rt_scheduling": ["preempt_rt", "sched_fifo", "rtprio", "realtime"],
    "hw_timestamping": ["timestamp", "ethtool", "so_timestamping", "hwtstamp"],
    "vlan_qos": ["vlan", "pcp", "priority"],
}

BUFFER_RE = re.compile(r"(?:buffer[_\- ]?size|quantum)\D{0,24}(\d{2,5})", re.IGNORECASE)
SAMPLE_RATE_RE = re.compile(r"(?:sample[_\- ]?rate|samplerate|sample rate)\D{0,24}(\d{4,6})", re.IGNORECASE)
HOP_COUNT_RE = re.compile(r"(?:hop[_\- ]?count|hops?)\D{0,12}(\d{1,2})", re.IGNORECASE)
PRESENTATION_RE = re.compile(
    r"(?:\bpresentation(?:[_\- ](?:time|offset))\b|\bmax(?:[_\- ]transit)?[_\- ]time\b)\D{0,24}(\d+(?:\.\d+)?)\s*(ms|us)?",
    re.IGNORECASE,
)


def _feature_from_matches(scan: ScanResult, feature_name: str, terms: list[str]) -> FeatureObservation:
    evidence: list[EvidenceRef] = []
    term_set = {term.lower() for term in terms}

    for match in scan.matches:
        if match.keyword in term_set:
            evidence.append(EvidenceRef(path=match.path, line=match.line, excerpt=match.text))
            if len(evidence) >= 6:
                break

    if evidence:
        return FeatureObservation(
            name=feature_name,
            present=True,
            classification="observed",
            evidence=evidence,
            note="Feature signals found in repository scan.",
        )

    return FeatureObservation(
        name=feature_name,
        present=False,
        classification="inferred",
        evidence=[],
        note="No direct keyword evidence in scanned scope.",
    )


def _safe_read(path: Path) -> str:
    try:
        raw = path.read_bytes()
    except Exception:
        return ""
    if b"\x00" in raw[:2048]:
        return ""
    return raw.decode("utf-8", errors="ignore")


def _extract_numeric_values(root: Path, scanned_files: list[str]) -> tuple[dict[str, float], dict[str, list[EvidenceRef]]]:
    values: dict[str, list[float]] = defaultdict(list)
    evidence: dict[str, list[EvidenceRef]] = defaultdict(list)

    for rel in scanned_files:
        path = root / rel
        text = _safe_read(path)
        if not text:
            continue

        for idx, line in enumerate(text.splitlines(), start=1):
            if len(line) > 4000:
                continue
            buffer_match = BUFFER_RE.search(line)
            if buffer_match:
                val = float(buffer_match.group(1))
                if 8 <= val <= 8192:
                    values["buffer_size_samples"].append(val)
                    evidence["buffer_size_samples"].append(EvidenceRef(path=rel, line=idx, excerpt=line.strip()[:300]))

            rate_match = SAMPLE_RATE_RE.search(line)
            if rate_match:
                val = float(rate_match.group(1))
                if 8000 <= val <= 384000:
                    values["sample_rate_hz"].append(val)
                    evidence["sample_rate_hz"].append(EvidenceRef(path=rel, line=idx, excerpt=line.strip()[:300]))

            hop_match = HOP_COUNT_RE.search(line)
            if hop_match:
                val = float(hop_match.group(1))
                if 1 <= val <= 32:
                    values["hop_count"].append(val)
                    evidence["hop_count"].append(EvidenceRef(path=rel, line=idx, excerpt=line.strip()[:300]))

            presentation_match = PRESENTATION_RE.search(line)
            if presentation_match:
                val = float(presentation_match.group(1))
                unit = (presentation_match.group(2) or "ms").lower()
                ms_val = val / 1000.0 if unit == "us" else val
                if 0 < ms_val <= 1000:
                    values["presentation_offset_ms"].append(ms_val)
                    evidence["presentation_offset_ms"].append(EvidenceRef(path=rel, line=idx, excerpt=line.strip()[:300]))

    def _select_numeric_value(key: str, vlist: list[float]) -> float:
        if not vlist:
            raise ValueError("empty list")

        if key == "sample_rate_hz":
            preferred = [48000.0, 96000.0, 44100.0]
            for candidate in preferred:
                if candidate in vlist:
                    return candidate

        if key == "buffer_size_samples":
            preferred = [128.0, 64.0, 256.0]
            for candidate in preferred:
                if candidate in vlist:
                    return candidate

        counts: dict[float, int] = {}
        for val in vlist:
            counts[val] = counts.get(val, 0) + 1
        most_common = sorted(counts.items(), key=lambda item: (-item[1], item[0]))[0][0]

        if key == "hop_count":
            return float(min(vlist))

        if key == "presentation_offset_ms":
            return float(min(vlist))

        return float(most_common)

    final_values: dict[str, float] = {}
    for key, vlist in values.items():
        if vlist:
            final_values[key] = _select_numeric_value(key, vlist)

    return final_values, evidence


def extract_avb_config(scan: ScanResult) -> ExtractedConfig:
    """Build structured AVB/TSN config signals from scan results."""

    root = Path(scan.root_path)
    features = {
        feature_name: _feature_from_matches(scan, feature_name, terms)
        for feature_name, terms in FEATURE_TERMS.items()
    }

    numeric, numeric_evidence = _extract_numeric_values(root, scan.scanned_files)

    if "buffer_size_samples" in numeric:
        features["buffer_size_samples"] = FeatureObservation(
            name="buffer_size_samples",
            present=True,
            classification="observed",
            value=int(numeric["buffer_size_samples"]),
            evidence=numeric_evidence.get("buffer_size_samples", [])[:5],
            note="Parsed from config/docs/code references.",
        )
    else:
        features["buffer_size_samples"] = FeatureObservation(
            name="buffer_size_samples",
            present=None,
            classification="unknown",
            value=None,
            evidence=[],
            note="No buffer size value detected from scanned content.",
        )

    if "sample_rate_hz" in numeric:
        features["sample_rate_hz"] = FeatureObservation(
            name="sample_rate_hz",
            present=True,
            classification="observed",
            value=int(numeric["sample_rate_hz"]),
            evidence=numeric_evidence.get("sample_rate_hz", [])[:5],
            note="Parsed from config/docs/code references.",
        )
    else:
        features["sample_rate_hz"] = FeatureObservation(
            name="sample_rate_hz",
            present=None,
            classification="unknown",
            value=None,
            evidence=[],
            note="No sample rate value detected from scanned content.",
        )

    if "hop_count" in numeric:
        features["hop_count"] = FeatureObservation(
            name="hop_count",
            present=True,
            classification="observed",
            value=int(numeric["hop_count"]),
            evidence=numeric_evidence.get("hop_count", [])[:5],
            note="Parsed from config/docs/code references.",
        )
    else:
        features["hop_count"] = FeatureObservation(
            name="hop_count",
            present=None,
            classification="unknown",
            value=None,
            evidence=[],
            note="No hop count value detected from scanned content.",
        )

    if "presentation_offset_ms" in numeric:
        features["presentation_offset_ms"] = FeatureObservation(
            name="presentation_offset_ms",
            present=True,
            classification="observed",
            value=float(numeric["presentation_offset_ms"]),
            evidence=numeric_evidence.get("presentation_offset_ms", [])[:5],
            note="Parsed from config/docs/code references.",
        )
    else:
        features["presentation_offset_ms"] = FeatureObservation(
            name="presentation_offset_ms",
            present=None,
            classification="unknown",
            value=None,
            evidence=[],
            note="No presentation offset value detected from scanned content.",
        )

    notes = [
        "Numeric values use conservative minimum extraction from scanned text and should be validated on live runtime.",
        "Absence of keywords is not definitive absence on host; classify as inferred unless direct measurements exist.",
    ]

    return ExtractedConfig(features=features, numeric=numeric, notes=notes)
