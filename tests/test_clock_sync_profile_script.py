import json
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = REPO_ROOT / "scripts" / "apply_clock_sync_profile.py"


def _run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["python3", str(SCRIPT_PATH), *args],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


def test_list_profiles_includes_all_five_options() -> None:
    result = _run("--list-profiles")
    assert result.returncode == 0, result.stderr

    output = result.stdout
    assert "spdif_master_48k" in output
    assert "spdif_master_44k1" in output
    assert "avb_master_48k" in output
    assert "dual_locked_48k" in output
    assert "hybrid_adaptive_44k1_48k" in output


def test_apply_profile_updates_config_pipewire_and_systemd(tmp_path: Path) -> None:
    config_file = tmp_path / "config.json"
    pipewire_conf = tmp_path / "pipewire.conf"
    systemd_dropin = tmp_path / "20-clock-sync-profile.conf"

    config_file.write_text(
        json.dumps(
            {
                "audio": {"sample_rate": 48000, "buffer_size": 64},
                "avb": {"enabled": False, "interface": "enp11s0"},
            }
        ),
        encoding="utf-8",
    )

    result = _run(
        "--profile",
        "spdif_master_44k1",
        "--config-file",
        str(config_file),
        "--pipewire-conf",
        str(pipewire_conf),
        "--systemd-dropin",
        str(systemd_dropin),
        "--avb-interface",
        "enp2s0",
    )
    assert result.returncode == 0, result.stderr

    updated = json.loads(config_file.read_text(encoding="utf-8"))
    assert updated["audio"]["sample_rate"] == 44100
    assert updated["audio"]["sync_profile"] == "spdif_master_44k1"
    assert updated["clock_sync"]["selected_profile"] == "spdif_master_44k1"
    assert updated["clock_sync"]["avb_stream_rate_hz"] == 44100
    assert updated["avb"]["interface"] == "enp2s0"
    assert updated["spdif"]["enabled"] is True
    assert updated["spdif"]["sample_rate_hz"] == 44100

    pipewire_text = pipewire_conf.read_text(encoding="utf-8")
    assert "default.clock.rate = 44100" in pipewire_text
    assert "default.clock.allowed-rates = [ 44100 ]" in pipewire_text
    assert "default.clock.quantum = 64" in pipewire_text

    systemd_text = systemd_dropin.read_text(encoding="utf-8")
    assert "clock.force-rate 44100" in systemd_text
    assert "clock.force-quantum 64" in systemd_text
    assert "PIPEWIRE_LATENCY=64/44100" in systemd_text


def test_apply_profile_dry_run_does_not_write_files(tmp_path: Path) -> None:
    config_file = tmp_path / "config.json"
    pipewire_conf = tmp_path / "pipewire.conf"
    systemd_dropin = tmp_path / "20-clock-sync-profile.conf"

    result = _run(
        "--profile",
        "avb_master_48k",
        "--config-file",
        str(config_file),
        "--pipewire-conf",
        str(pipewire_conf),
        "--systemd-dropin",
        str(systemd_dropin),
        "--dry-run",
    )
    assert result.returncode == 0, result.stderr
    assert not config_file.exists()
    assert not pipewire_conf.exists()
    assert not systemd_dropin.exists()
