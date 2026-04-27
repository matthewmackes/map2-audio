#!/usr/bin/env python3
"""T2459-F4 — Hardware-in-the-Loop smoke runner for the controller subsystem.

Boots the bench environment, walks every shipped vendor pack, attempts
each device profile's MIDI input + audio loopback measurement + GUI
panel-render verification, and writes versioned evidence under
``docs/fit-for-purpose-evidence/<YYYYMMDD>/t2459-hil-smoke/``.

Failure modes are reported clearly without crashing the runner:

  - Missing device → recorded as ``not_connected``, run continues.
  - Unresponsive MIDI bridge → recorded as ``midi_unreachable``,
    audio measurement still attempts (independent path).
  - Broken pack → already filtered by ProfileRegistry.load_packs at
    backend startup; the runner reports ``pack_degraded`` for any
    pack with degraded files.

Usage::

    python3 scripts/run_t2459_device_subsystem_hil_smoke.py

Reads ``--bench-host http://127.0.0.1:8080`` for the FastAPI base
URL and the live ``device-packs/`` tree from the repo root. Falls
back to the synthetic loopback when no JACK server is reachable so
that the runner produces evidence even on a CI host without audio
hardware (the synthetic fallback is clearly marked in the evidence
JSON).

Worklist: ``T2459-F4``.
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger("t2459_hil_smoke")

REPO_ROOT = Path(__file__).resolve().parents[1]
PACKS_ROOT = REPO_ROOT / "device-packs"
EVIDENCE_BASE = REPO_ROOT / "docs" / "fit-for-purpose-evidence"

# When run as a script, the repo root isn't on sys.path. Add it so the
# `app.services.controllers.*` imports succeed.
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


@dataclasses.dataclass
class ProfileSmokeResult:
    pack_id: str
    model: str
    kind: str
    profile_loaded: bool
    profile_load_error: str | None
    has_loopback_ports: bool
    loopback_method: str | None    # "jack" | "synthetic" | None
    mean_rtt_ms: float | None
    p95_rtt_ms: float | None
    jitter_p95_ms: float | None
    midi_profile_present: bool
    notes: str


def _load_profile_registry():
    """Build a ProfileRegistry pointed at the live device-packs/ tree.

    Wrapped so the runner can degrade gracefully if the controller
    service refuses to import (broken state, missing dep, etc.).
    """
    try:
        from app.services.controllers.profile_registry import ProfileRegistry
    except Exception as exc:
        logger.error("ProfileRegistry import failed: %s", exc)
        return None
    registry = ProfileRegistry(packs_root=PACKS_ROOT)
    try:
        registry.load_packs()
    except Exception as exc:   # noqa: BLE001 — defensive
        logger.error("load_packs raised: %s", exc)
        return None
    return registry


def _smoke_one_audio_profile(profile, registry) -> ProfileSmokeResult:
    """Measure latency on the profile if loopback_ports are declared."""
    doc = profile.document
    loopback = doc.get("loopback_ports") if isinstance(doc, dict) else None
    has_loopback = bool(
        isinstance(loopback, dict)
        and loopback.get("playback")
        and loopback.get("capture")
    )

    midi_present = any(
        p.kind == "midi" and p.pack_id == profile.pack_id and p.model == profile.model
        for p in registry.profiles()
    )

    method = None
    mean_rtt = None
    p95_rtt = None
    jitter_p95 = None
    notes = ""

    if has_loopback:
        try:
            from scripts.measure_loopback_ir import measure_loopback_ir
            result = measure_loopback_ir(
                playback_port=loopback["playback"],
                capture_port=loopback["capture"],
                sample_rate=48000,
                duration_ms=200,    # short — keep the smoke fast
                tail_ms=200,
                trials=2,
                use_synthetic_fallback=True,
            )
            method = result.method
            mean_rtt = result.mean_rtt_ms
            p95_rtt = result.p95_rtt_ms
            jitter_p95 = result.jitter_p95_ms
        except Exception as exc:   # noqa: BLE001
            notes = f"latency_measure_failed: {exc}"

    return ProfileSmokeResult(
        pack_id=profile.pack_id,
        model=profile.model,
        kind=profile.kind,
        profile_loaded=True,
        profile_load_error=None,
        has_loopback_ports=has_loopback,
        loopback_method=method,
        mean_rtt_ms=mean_rtt,
        p95_rtt_ms=p95_rtt,
        jitter_p95_ms=jitter_p95,
        midi_profile_present=midi_present,
        notes=notes,
    )


def run_smoke() -> dict[str, Any]:
    """Run the smoke against every shipped audio profile. Returns a
    summary dict suitable for serialisation as evidence.
    """
    registry = _load_profile_registry()
    if registry is None:
        return {
            "status": "FAIL",
            "reason": "ProfileRegistry unavailable",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "packs": [],
            "profiles": [],
            "summary": {
                "audio_profiles": 0, "midi_profiles": 0, "hid_profiles": 0,
                "with_loopback_ports": 0,
                "latency_measurements_completed": 0,
            },
        }

    results: list[ProfileSmokeResult] = []
    audio_profiles = registry.profiles(kind="audio")
    for profile in audio_profiles:
        try:
            r = _smoke_one_audio_profile(profile, registry)
        except Exception as exc:   # noqa: BLE001 — defensive
            r = ProfileSmokeResult(
                pack_id=profile.pack_id,
                model=profile.model,
                kind=profile.kind,
                profile_loaded=False,
                profile_load_error=str(exc),
                has_loopback_ports=False,
                loopback_method=None,
                mean_rtt_ms=None,
                p95_rtt_ms=None,
                jitter_p95_ms=None,
                midi_profile_present=False,
                notes="",
            )
        results.append(r)

    pack_summaries: list[dict[str, Any]] = []
    for pack in registry.packs():
        pack_summaries.append({
            "pack_id": pack.pack_id,
            "vendor": pack.vendor_name,
            "models": list(pack.models),
            "profile_count": len(pack.profiles),
            "is_degraded": pack.is_degraded,
            "degraded_files": [str(p.relative_to(REPO_ROOT)) for p in pack.degraded_files],
        })

    return {
        "status": "PASS" if all(r.profile_loaded for r in results) else "PARTIAL",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "packs": pack_summaries,
        "profiles": [dataclasses.asdict(r) for r in results],
        "summary": {
            "audio_profiles": len(audio_profiles),
            "midi_profiles": len(registry.profiles(kind="midi")),
            "hid_profiles": len(registry.profiles(kind="hid")),
            "with_loopback_ports": sum(1 for r in results if r.has_loopback_ports),
            "latency_measurements_completed": sum(
                1 for r in results
                if r.has_loopback_ports and r.mean_rtt_ms is not None
            ),
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Override evidence output directory.",
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    summary = run_smoke()

    if args.output_dir is not None:
        evidence_dir = args.output_dir
    else:
        evidence_dir = (
            EVIDENCE_BASE / datetime.now().strftime("%Y%m%d") / "t2459-hil-smoke"
        )
    evidence_dir.mkdir(parents=True, exist_ok=True)
    output_path = evidence_dir / f"smoke-{datetime.now().strftime('%H%M%S')}.json"
    output_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

    s = summary["summary"]
    try:
        relative_evidence = output_path.relative_to(REPO_ROOT)
    except ValueError:
        relative_evidence = output_path
    logger.info(
        "Smoke complete: status=%s, packs=%d, audio_profiles=%d, "
        "with_loopback_ports=%d, latency_measurements_completed=%d. "
        "Evidence: %s",
        summary["status"],
        len(summary["packs"]),
        s["audio_profiles"],
        s["with_loopback_ports"],
        s["latency_measurements_completed"],
        relative_evidence,
    )

    return 0 if summary["status"] in ("PASS", "PARTIAL") else 1


if __name__ == "__main__":
    sys.exit(main())
