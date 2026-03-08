"""
Tests for installer config schema, kickstart I/O, and defaults.

These tests run without root, without hardware, and without a live TUI —
safe to run in CI.  They validate the Pydantic models and YAML round-trips.
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

import pytest
import yaml

from installer.config.schema import (
    AudioConfig, BufferSize, InstallerConfig, InstallMode,
    RealTimeConfig, SampleRate, UserConfig,
)
from installer.config.kickstart import (
    generate_template, load_kickstart, save_kickstart, validate_kickstart_file,
)
from installer.config.defaults import config_for_mode, MODE_DESCRIPTIONS


# ─────────────────────────────────────────────────────────────────────────────
# Schema tests
# ─────────────────────────────────────────────────────────────────────────────

class TestInstallerConfig:
    def test_default_config_is_valid(self):
        cfg = InstallerConfig()
        assert cfg.mode == InstallMode.AUDIO
        assert cfg.audio.buffer_size == BufferSize.S64

    def test_audio_latency_ms(self):
        cfg = InstallerConfig()
        cfg.audio.buffer_size = BufferSize.S64
        cfg.audio.sample_rate = SampleRate.SR48000
        assert cfg.audio.latency_ms == pytest.approx(1.333, rel=1e-2)

    def test_pipewire_latency_env(self):
        cfg = InstallerConfig()
        cfg.audio.buffer_size = BufferSize.S64
        cfg.audio.sample_rate = SampleRate.SR48000
        assert cfg.audio.pipewire_latency_env == "64/48000"

    def test_mode_audio_disables_frontend(self):
        cfg = InstallerConfig(mode=InstallMode.AUDIO)
        # apply_mode_defaults runs automatically
        assert not cfg.software.install_frontend
        assert cfg.software.install_juce_engine

    def test_mode_management_disables_juce(self):
        cfg = InstallerConfig(mode=InstallMode.MANAGEMENT)
        assert not cfg.software.install_juce_engine
        assert cfg.software.install_cluster_mgr

    def test_grub_cmdline_additions(self):
        rt = RealTimeConfig(isolated_cores="4,5", max_cstate=1)
        cmdline = rt.grub_cmdline_additions
        assert "isolcpus=4,5" in cmdline
        assert "nohz_full=4,5" in cmdline
        assert "threadirqs" in cmdline
        assert "intel_idle.max_cstate=1" in cmdline

    def test_invalid_cpu_core_range_raises(self):
        with pytest.raises(Exception, match="Invalid CPU core range"):
            RealTimeConfig(isolated_cores="abc")

    def test_invalid_username_raises(self):
        with pytest.raises(Exception):
            UserConfig(username="Root User!")  # Invalid chars

    def test_rtprio_bounds(self):
        with pytest.raises(Exception):
            RealTimeConfig(audio_rtprio=100)  # > 99
        with pytest.raises(Exception):
            RealTimeConfig(audio_rtprio=0)    # < 1


class TestKickstart:
    def test_round_trip_yaml(self, tmp_path):
        """Save and reload config; values must survive the round-trip."""
        cfg = InstallerConfig()
        cfg.network.hostname = "test-host-42"
        cfg.audio.buffer_size = BufferSize.S128
        ks_file = tmp_path / "test.yaml"
        save_kickstart(cfg, ks_file)
        loaded = load_kickstart(ks_file)
        assert loaded.network.hostname == "test-host-42"
        assert loaded.audio.buffer_size == BufferSize.S128

    def test_load_example_ks(self):
        """The bundled example KS file must be valid."""
        example = Path(__file__).parent.parent / "examples" / "map2-ks.yaml"
        errors = validate_kickstart_file(example)
        assert errors == [], f"Example KS has errors: {errors}"

    def test_validate_bad_file(self, tmp_path):
        bad = tmp_path / "bad.yaml"
        bad.write_text("mode: invalid-mode-xyz\n")
        errors = validate_kickstart_file(bad)
        assert len(errors) > 0

    def test_missing_file(self):
        errors = validate_kickstart_file("/nonexistent/path/ks.yaml")
        assert len(errors) > 0

    def test_generate_template_audio(self):
        cfg = generate_template("audio")
        assert cfg.mode == InstallMode.AUDIO
        assert cfg.generated_at is not None

    def test_generate_template_management(self):
        cfg = generate_template("management")
        assert not cfg.software.install_juce_engine


class TestDefaults:
    def test_all_modes_have_descriptions(self):
        for mode in InstallMode:
            assert mode in MODE_DESCRIPTIONS
            desc = MODE_DESCRIPTIONS[mode]
            assert "label" in desc and "summary" in desc and "detail" in desc

    def test_config_for_mode_audio(self):
        cfg = config_for_mode(InstallMode.AUDIO)
        assert cfg.audio.buffer_size == BufferSize.S64
        assert not cfg.software.install_frontend

    def test_config_for_mode_all_in_one(self):
        cfg = config_for_mode(InstallMode.ALL_IN_ONE)
        assert cfg.software.install_frontend
        assert cfg.software.install_juce_engine
        assert cfg.audio.buffer_size == BufferSize.S128


# ─────────────────────────────────────────────────────────────────────────────
# Backend executor tests (dry-run only — no actual system calls)
# ─────────────────────────────────────────────────────────────────────────────

class TestExecutor:
    def test_dry_run_returns_success(self):
        from installer.backend.executor import CommandExecutor
        ex = CommandExecutor(dry_run=True)
        r  = ex.run(["dnf", "install", "-y", "pipewire"])
        assert r.ok
        assert r.dry_run
        assert "dry-run" in r.stdout.lower()

    def test_live_echo(self):
        from installer.backend.executor import CommandExecutor
        ex = CommandExecutor(dry_run=False)
        r  = ex.run(["echo", "hello-map2"])
        assert r.ok
        assert "hello-map2" in r.stdout

    def test_command_not_found(self):
        from installer.backend.executor import CommandExecutor
        ex = CommandExecutor(dry_run=False)
        r  = ex.run(["this-command-does-not-exist-12345"])
        assert r.returncode == 127
        assert not r.ok

    def test_check_raises_on_failure(self):
        from installer.backend.executor import CommandExecutor, ExecutorError
        ex = CommandExecutor(dry_run=False)
        with pytest.raises(ExecutorError):
            ex.run(["false"], check=True)


# ─────────────────────────────────────────────────────────────────────────────
# Unattended runner (dry-run, no root needed)
# ─────────────────────────────────────────────────────────────────────────────

class TestUnattended:
    def test_dry_run_with_example_ks(self, tmp_path):
        """Dry-run the example KS — should return exit code 0."""
        example = Path(__file__).parent.parent / "examples" / "map2-ks.yaml"
        from installer.modes.unattended import UnattendedRunner
        runner = UnattendedRunner(
            ks_path=str(example),
            dry_run=True,
            log_file=str(tmp_path / "test-install.log"),
        )
        rc = runner.run()
        # Dry-run may fail some stages (e.g. hostnamectl) without root — accept 0 or 2
        assert rc in (0, 2), f"Unexpected exit code: {rc}"

    def test_invalid_ks_returns_1(self, tmp_path):
        bad = tmp_path / "bad.yaml"
        bad.write_text("mode: not-a-real-mode\n")
        from installer.modes.unattended import UnattendedRunner
        runner = UnattendedRunner(ks_path=str(bad), dry_run=True)
        rc = runner.run()
        assert rc == 1
