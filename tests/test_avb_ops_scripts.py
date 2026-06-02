import json
import os
import stat
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def _run_bash(script: str, *, env: dict[str, str] | None = None) -> str:
    result = subprocess.run(
        ["bash", "-c", script],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        env=env,
    )
    if result.returncode != 0:
        raise AssertionError(
            "bash command failed\n"
            f"exit={result.returncode}\n"
            f"stdout:\n{result.stdout}\n"
            f"stderr:\n{result.stderr}"
        )
    return result.stdout.strip()


def _make_executable(path: Path) -> None:
    path.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    mode = path.stat().st_mode
    path.chmod(mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def test_setup_script_prefers_mrpd_when_both_daemons_exist(tmp_path: Path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir(parents=True, exist_ok=True)
    _make_executable(bin_dir / "mrpd")
    _make_executable(bin_dir / "msrpd")

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"

    output = _run_bash(
        """
source scripts/setup_avb.sh
_detect_srp_daemon_binary
printf "%s|%s|%s\\n" "$SRP_DAEMON" "$SRP_DAEMON_BIN" "$SRP_CONTROL_SOCKET"
""",
        env=env,
    )

    daemon, binary_path, socket_path = output.split("|")
    assert daemon == "mrpd"
    assert binary_path == str(bin_dir / "mrpd")
    assert socket_path == "/var/run/mrp_socket"


def test_setup_script_writes_srp_manifest_contract(tmp_path: Path):
    manifest_path = tmp_path / "srp-install-manifest.json"

    _run_bash(
        f"""
source scripts/setup_avb.sh
DRY_RUN=false
SRP_MANIFEST="{manifest_path}"
SRP_INSTALL_MODE="package"
SRP_DAEMON="mrpd"
SRP_DAEMON_BIN="/usr/sbin/mrpd"
SRP_CONTROL_SOCKET="/var/run/mrp_socket"
SRP_SOURCE_REPO="https://example.com/openavnu.git"
SRP_SOURCE_REF="deadbeef"
SRP_SOURCE_ROOT="/usr/local/src/map2-srpd"
_write_srp_manifest
""",
    )

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["install_mode"] == "package"
    assert manifest["daemon_type"] == "mrpd"
    assert manifest["binary_path"] == "/usr/sbin/mrpd"
    assert manifest["control_socket"] == "/var/run/mrp_socket"
    assert manifest["source_ref"] == "deadbeef"
    assert "/etc/systemd/system/map2-srpd.service" in manifest["managed_files"]
    assert "/etc/default/map2-srpd" in manifest["managed_files"]
    assert str(manifest_path) in manifest["managed_files"]


def test_uninstall_script_removes_manifest_tracked_artifacts_with_allowlist(tmp_path: Path):
    binary_path = tmp_path / "usr-local" / "bin" / "mrpd"
    source_root = tmp_path / "usr-local" / "src" / "map2-srpd"
    managed_file = tmp_path / "etc" / "map2-srpd.service"
    manifest_path = tmp_path / "srp-install-manifest.json"

    binary_path.parent.mkdir(parents=True, exist_ok=True)
    _make_executable(binary_path)
    source_root.mkdir(parents=True, exist_ok=True)
    (source_root / "README.txt").write_text("source tree", encoding="utf-8")
    managed_file.parent.mkdir(parents=True, exist_ok=True)
    managed_file.write_text("[Unit]\nDescription=test\n", encoding="utf-8")

    manifest = {
        "install_mode": "source",
        "binary_path": str(binary_path),
        "source_root": str(source_root),
        "managed_files": [str(managed_file), str(manifest_path)],
    }
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    env = os.environ.copy()
    env["MAP2_SRPD_UNINSTALL_ALLOW_PREFIXES"] = f"{tmp_path}/"

    _run_bash(
        f"""
source scripts/uninstall_avb.sh
SRP_MANIFEST="{manifest_path}"
remove_srp_artifacts_from_manifest
""",
        env=env,
    )

    assert not binary_path.exists()
    assert not source_root.exists()
    assert not managed_file.exists()
    assert not manifest_path.exists()


def test_uninstall_script_default_allowlist_skips_non_system_paths(tmp_path: Path):
    binary_path = tmp_path / "usr-local" / "bin" / "mrpd"
    source_root = tmp_path / "usr-local" / "src" / "map2-srpd"
    managed_file = tmp_path / "etc" / "map2-srpd.service"
    manifest_path = tmp_path / "srp-install-manifest.json"

    binary_path.parent.mkdir(parents=True, exist_ok=True)
    _make_executable(binary_path)
    source_root.mkdir(parents=True, exist_ok=True)
    (source_root / "README.txt").write_text("source tree", encoding="utf-8")
    managed_file.parent.mkdir(parents=True, exist_ok=True)
    managed_file.write_text("[Unit]\nDescription=test\n", encoding="utf-8")

    manifest = {
        "install_mode": "source",
        "binary_path": str(binary_path),
        "source_root": str(source_root),
        "managed_files": [str(managed_file), str(manifest_path)],
    }
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    _run_bash(
        f"""
source scripts/uninstall_avb.sh
SRP_MANIFEST="{manifest_path}"
remove_srp_artifacts_from_manifest
""",
    )

    # Default allowlist is /usr/local and /etc. Test paths under tmp should not be removed.
    assert binary_path.exists()
    assert source_root.exists()
    assert managed_file.exists()
    # Manifest is always removed after processing.
    assert not manifest_path.exists()
