from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _read_write_paths_from_unit(unit_text: str) -> list[str]:
    for line in unit_text.splitlines():
        stripped = line.strip()
        if stripped.startswith("ReadWritePaths="):
            return stripped.split("=", 1)[1].split()
    return []


def test_backend_service_unit_allows_canonical_map2_state_paths_under_strict_protection():
    unit_text = (ROOT / "systemd" / "map2-backend.service").read_text(encoding="utf-8")

    assert "ProtectSystem=strict" in unit_text

    read_write_paths = _read_write_paths_from_unit(unit_text)
    assert "/var/lib/map2" in read_write_paths
    assert "/var/log/map2" in read_write_paths


def test_backend_override_guidance_keeps_canonical_map2_state_paths():
    setup_text = (ROOT / "scripts" / "setup_realtime.sh").read_text(encoding="utf-8")
    new_node_text = (ROOT / "ReadMe-Make_New_Node.txt").read_text(encoding="utf-8")

    for required_path in ("/var/lib/map2", "/var/log/map2", "/etc/map2", "/run/map2-audio"):
        assert required_path in setup_text
        assert required_path in new_node_text
