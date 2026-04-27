"""Bench-device connection detector.

T2459-G1. Unions four detection sources to produce one
``ConnectionRecord`` per matched device profile fingerprint:

  1. **USB enumeration** — ``/sys/bus/usb/devices/*/{idVendor,idProduct}``.
     Authoritative for "the cable is plugged in".
  2. **ALSA seq** — ``aconnect -i -l`` parsing for MIDI client/port
     visibility. Authoritative for "the kernel sees the MIDI endpoint".
  3. **ALSA card** — ``/proc/asound/cards`` + ``/proc/asound/card*/id``
     for audio card visibility.
  4. **PipeWire node graph** — ``pw-dump`` JSON for "the userspace
     graph has the node available".

Each source can fail independently (missing tool, missing kernel
support, container without ``/sys`` mount). A failed source is logged
once and ignored — the detector returns the union of whatever did
work, marking missing sources in ``ConnectionRecord.evidence`` so the
GUI can show partial-detection state honestly.

Inputs to matching come from ``DeviceProfile.hardware_id`` (USB
``vid:pid``), ``alsa_card_regex``, and ``alsa_client_pattern``. We
also accept a profile-level ``pipewire.node_name`` substring for the
fourth source.

Architecture: ``docs/architecture/HARDWARE_STORE_INTEGRATION.md`` §5.
Worklist: ``T2459-G1``.
"""

from __future__ import annotations

import dataclasses
import json
import logging
import re
import subprocess
import time
from pathlib import Path
from typing import Any, Iterable

from app.services.controllers.profile_registry import (
    DeviceProfile,
    ProfileRegistry,
)

logger = logging.getLogger(__name__)

# Detection sources we attempt — order matches the brief.
_SOURCE_USB = "usb"
_SOURCE_ALSA_SEQ = "alsa_seq"
_SOURCE_ALSA_CARD = "alsa_card"
_SOURCE_PIPEWIRE = "pipewire"
_ALL_SOURCES = (_SOURCE_USB, _SOURCE_ALSA_SEQ, _SOURCE_ALSA_CARD, _SOURCE_PIPEWIRE)


@dataclasses.dataclass(frozen=True)
class ConnectionRecord:
    """One connected (or recently-seen) device + the evidence chain."""

    pack_id: str
    model: str
    kind: str
    profile_key: str  # f"{pack_id}/{model}.{kind}"
    matched_sources: tuple[str, ...]
    evidence: dict[str, Any]
    detected_at: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "pack_id": self.pack_id,
            "model": self.model,
            "kind": self.kind,
            "profile_key": self.profile_key,
            "matched_sources": list(self.matched_sources),
            "evidence": self.evidence,
            "detected_at": self.detected_at,
        }


# ---------------------------------------------------------------------------
# Source readers
# ---------------------------------------------------------------------------


def _read_usb_devices(sysfs_root: Path = Path("/sys/bus/usb/devices")) -> list[dict[str, str]]:
    """Return a list of ``{"vid": "0582", "pid": "00ed", "path": "..."}``.

    Robust to missing sysfs (containers): returns an empty list.
    """
    if not sysfs_root.is_dir():
        logger.debug("USB sysfs not available at %s", sysfs_root)
        return []
    out: list[dict[str, str]] = []
    for entry in sysfs_root.iterdir():
        vid_p = entry / "idVendor"
        pid_p = entry / "idProduct"
        if not (vid_p.is_file() and pid_p.is_file()):
            continue
        try:
            vid = vid_p.read_text(encoding="utf-8").strip().lower()
            pid = pid_p.read_text(encoding="utf-8").strip().lower()
        except OSError:
            continue
        if not (re.fullmatch(r"[0-9a-f]{4}", vid) and re.fullmatch(r"[0-9a-f]{4}", pid)):
            continue
        out.append({"vid": vid, "pid": pid, "path": str(entry)})
    return out


def _read_alsa_seq_clients() -> list[str]:
    """Return ALSA sequencer client names visible to ``aconnect -l``.

    Each list item is one human-readable client/port name as it appears
    in aconnect output (e.g. ``"EDIROL UA-1000 MIDI 1"``). The detector
    matches profile ``alsa_client_pattern`` substrings against these.
    """
    try:
        proc = subprocess.run(
            ["aconnect", "-i", "-l"],
            capture_output=True, text=True, timeout=2.0, check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        logger.debug("aconnect unavailable: %s", exc)
        return []
    names: list[str] = []
    # Output lines look like:
    #   client 24: 'EDIROL UA-1000' [type=kernel,card=2]
    #       0 'EDIROL UA-1000 MIDI 1'
    #       1 'EDIROL UA-1000 MIDI 2'
    rx_client = re.compile(r"client\s+\d+:\s+'([^']+)'")
    rx_port = re.compile(r"^\s+\d+\s+'([^']+)'")
    for line in proc.stdout.splitlines():
        m = rx_client.match(line)
        if m:
            names.append(m.group(1))
            continue
        m = rx_port.match(line)
        if m:
            names.append(m.group(1))
    return names


def _read_alsa_card_names(asound_root: Path = Path("/proc/asound")) -> list[str]:
    """Read ALSA card names from ``/proc/asound/cards`` + per-card ``id`` files."""
    if not asound_root.is_dir():
        return []
    cards_file = asound_root / "cards"
    names: list[str] = []
    if cards_file.is_file():
        # Format:
        #   2 [UA1000         ]: USB-Audio - EDIROL UA-1000
        #                        EDIROL UA-1000 at usb-...
        try:
            text = cards_file.read_text(encoding="utf-8")
        except OSError:
            text = ""
        for line in text.splitlines():
            m = re.match(r"\s*\d+\s+\[([^\]]+)\]:\s+\S+\s+-\s+(.+)$", line)
            if m:
                names.append(m.group(1).strip())
                names.append(m.group(2).strip())
    # Also collect card-id files for completeness.
    for card_dir in sorted(asound_root.glob("card*")):
        id_file = card_dir / "id"
        if id_file.is_file():
            try:
                names.append(id_file.read_text(encoding="utf-8").strip())
            except OSError:
                continue
    return [n for n in names if n]


def _read_pipewire_nodes() -> list[str]:
    """Return PipeWire ``node.name``/``node.description`` strings.

    Uses ``pw-dump`` JSON; degrades silently when the tool or PipeWire
    is unavailable (e.g. CI without a session bus).
    """
    try:
        proc = subprocess.run(
            ["pw-dump"],
            capture_output=True, text=True, timeout=3.0, check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        logger.debug("pw-dump unavailable: %s", exc)
        return []
    if proc.returncode != 0 or not proc.stdout:
        return []
    try:
        objs = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        logger.warning("pw-dump returned invalid JSON: %s", exc)
        return []
    names: list[str] = []
    for obj in objs:
        if not isinstance(obj, dict):
            continue
        if obj.get("type") != "PipeWire:Interface:Node":
            continue
        info = obj.get("info") or {}
        props = info.get("props") or {}
        for key in ("node.name", "node.description", "node.nick", "alsa.card_name"):
            v = props.get(key)
            if isinstance(v, str) and v:
                names.append(v)
    return names


# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------


def _hardware_id_to_vid_pid(hardware_id: str) -> tuple[str, str] | None:
    """Parse ``"usb:vvvv:pppp"`` into ``("vvvv", "pppp")`` lowercase."""
    if not hardware_id:
        return None
    m = re.fullmatch(r"usb:([0-9a-fA-F]{4}):([0-9a-fA-F]{4})", hardware_id.strip())
    if not m:
        return None
    return m.group(1).lower(), m.group(2).lower()


def _profile_pipewire_pattern(profile: DeviceProfile) -> str | None:
    """Return the optional ``pipewire.node_name`` substring from the profile."""
    doc = profile.document
    if not isinstance(doc, dict):
        return None
    pw = doc.get("pipewire")
    if isinstance(pw, dict):
        v = pw.get("node_name")
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def _match_one_profile(
    profile: DeviceProfile,
    *,
    usb_devices: list[dict[str, str]],
    alsa_clients: list[str],
    alsa_cards: list[str],
    pipewire_nodes: list[str],
    sources_attempted: tuple[str, ...],
) -> ConnectionRecord | None:
    """Attempt to match a profile against the evidence; None if none of the
    profile's fingerprints match anything we can see.
    """
    matched: list[str] = []
    evidence: dict[str, Any] = {
        "sources_attempted": list(sources_attempted),
    }

    # USB
    if _SOURCE_USB in sources_attempted:
        vp = _hardware_id_to_vid_pid(profile.hardware_id or "")
        if vp:
            for dev in usb_devices:
                if dev["vid"] == vp[0] and dev["pid"] == vp[1]:
                    matched.append(_SOURCE_USB)
                    evidence["usb"] = {"vid": vp[0], "pid": vp[1], "path": dev["path"]}
                    break

    # ALSA seq
    if _SOURCE_ALSA_SEQ in sources_attempted:
        pat = profile.alsa_client_pattern
        if pat:
            for name in alsa_clients:
                if pat.lower() in name.lower():
                    matched.append(_SOURCE_ALSA_SEQ)
                    evidence["alsa_seq"] = {"matched_name": name, "pattern": pat}
                    break

    # ALSA card
    if _SOURCE_ALSA_CARD in sources_attempted:
        rx = profile.alsa_card_regex
        if rx is not None:
            for name in alsa_cards:
                if rx.search(name):
                    matched.append(_SOURCE_ALSA_CARD)
                    evidence["alsa_card"] = {"matched_name": name, "pattern": rx.pattern}
                    break

    # PipeWire
    if _SOURCE_PIPEWIRE in sources_attempted:
        pw_pat = _profile_pipewire_pattern(profile)
        if pw_pat:
            for name in pipewire_nodes:
                if pw_pat.lower() in name.lower():
                    matched.append(_SOURCE_PIPEWIRE)
                    evidence["pipewire"] = {"matched_name": name, "pattern": pw_pat}
                    break

    if not matched:
        return None

    return ConnectionRecord(
        pack_id=profile.pack_id,
        model=profile.model,
        kind=profile.kind,
        profile_key=f"{profile.pack_id}/{profile.model}.{profile.kind}",
        matched_sources=tuple(matched),
        evidence=evidence,
        detected_at=time.time(),
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


@dataclasses.dataclass(frozen=True)
class DetectionSnapshot:
    """One full run of the detector. Surfaced verbatim by the GUI hook."""

    records: tuple[ConnectionRecord, ...]
    sources_attempted: tuple[str, ...]
    sources_failed: tuple[str, ...]
    snapshot_at: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "records": [r.to_dict() for r in self.records],
            "sources_attempted": list(self.sources_attempted),
            "sources_failed": list(self.sources_failed),
            "snapshot_at": self.snapshot_at,
        }


def detect_connections(
    registry: ProfileRegistry,
    *,
    enabled_sources: Iterable[str] | None = None,
    usb_reader=None,
    alsa_seq_reader=None,
    alsa_card_reader=None,
    pipewire_reader=None,
) -> DetectionSnapshot:
    """Run a single detection pass against the registry.

    Each source reader is called at most once. Failed readers (raised
    exception) are recorded in ``sources_failed`` but do not abort
    detection — the union of remaining sources is still reported.

    Readers default to the module-level ``_read_*`` functions; passing
    ``None`` resolves them at call time so monkey-patching the module
    works as expected.
    """
    usb_reader = usb_reader or _read_usb_devices
    alsa_seq_reader = alsa_seq_reader or _read_alsa_seq_clients
    alsa_card_reader = alsa_card_reader or _read_alsa_card_names
    pipewire_reader = pipewire_reader or _read_pipewire_nodes
    sources = tuple(enabled_sources) if enabled_sources is not None else _ALL_SOURCES
    attempted: list[str] = []
    failed: list[str] = []

    usb_devices: list[dict[str, str]] = []
    alsa_clients: list[str] = []
    alsa_cards: list[str] = []
    pipewire_nodes: list[str] = []

    if _SOURCE_USB in sources:
        attempted.append(_SOURCE_USB)
        try:
            usb_devices = list(usb_reader())
        except Exception as exc:   # noqa: BLE001 — defensive
            logger.warning("USB detection source failed: %s", exc)
            failed.append(_SOURCE_USB)

    if _SOURCE_ALSA_SEQ in sources:
        attempted.append(_SOURCE_ALSA_SEQ)
        try:
            alsa_clients = list(alsa_seq_reader())
        except Exception as exc:   # noqa: BLE001
            logger.warning("ALSA seq detection source failed: %s", exc)
            failed.append(_SOURCE_ALSA_SEQ)

    if _SOURCE_ALSA_CARD in sources:
        attempted.append(_SOURCE_ALSA_CARD)
        try:
            alsa_cards = list(alsa_card_reader())
        except Exception as exc:   # noqa: BLE001
            logger.warning("ALSA card detection source failed: %s", exc)
            failed.append(_SOURCE_ALSA_CARD)

    if _SOURCE_PIPEWIRE in sources:
        attempted.append(_SOURCE_PIPEWIRE)
        try:
            pipewire_nodes = list(pipewire_reader())
        except Exception as exc:   # noqa: BLE001
            logger.warning("PipeWire detection source failed: %s", exc)
            failed.append(_SOURCE_PIPEWIRE)

    records: list[ConnectionRecord] = []
    for profile in registry.profiles():
        rec = _match_one_profile(
            profile,
            usb_devices=usb_devices,
            alsa_clients=alsa_clients,
            alsa_cards=alsa_cards,
            pipewire_nodes=pipewire_nodes,
            sources_attempted=tuple(attempted),
        )
        if rec is not None:
            records.append(rec)

    return DetectionSnapshot(
        records=tuple(records),
        sources_attempted=tuple(attempted),
        sources_failed=tuple(failed),
        snapshot_at=time.time(),
    )
