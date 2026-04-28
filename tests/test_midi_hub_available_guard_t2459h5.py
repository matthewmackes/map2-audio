from __future__ import annotations

from pathlib import Path


def test_midi_hub_available_flag_is_retired_from_h5_runtime_paths() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    targets = [
        repo_root / "app" / "routes" / "midi_v2.py",
        repo_root / "app" / "services" / "midi_service.py",
        repo_root / "app" / "services" / "midi_learn.py",
        repo_root / "app" / "services" / "midi_broadcast.py",
        repo_root / "app" / "services" / "midi_engine.py",
        repo_root / "app" / "services" / "sysex_device_bridge.py",
    ]

    offenders = []
    for path in targets:
        text = path.read_text(encoding="utf-8")
        if "MIDI_HUB_AVAILABLE" in text:
            offenders.append(str(path.relative_to(repo_root)))

    assert not offenders, (
        "Found retired MIDI_HUB_AVAILABLE flag in H5 runtime paths: "
        + ", ".join(offenders)
    )
