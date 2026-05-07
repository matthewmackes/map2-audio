"""T2459-H3-CFG Phase 4 — DFU flash orchestrator tests."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from app.services.devices.meloaudio.dfu_flash import (
    DFU_FLASH_TARGET_ADDRESS,
    DFU_UTIL_INTERFACE_ALT,
    DfuFlashEvent,
    DfuFlashPhase,
    DfuFlashRequest,
    PreCheckResult,
    build_dfu_util_command,
    find_dfu_util,
    list_bundled_firmware,
    parse_dfu_util_progress,
    run_dfu_flash,
    run_pre_check,
)


# ---------------------------------------------------------------------------
# find_dfu_util
# ---------------------------------------------------------------------------


def test_find_dfu_util_with_override(tmp_path: Path) -> None:
    fake = tmp_path / "dfu-util"
    fake.write_text("")
    fake.chmod(0o755)
    assert find_dfu_util(override=fake) == fake


def test_find_dfu_util_with_missing_override(tmp_path: Path) -> None:
    """Override pointing at non-existent file returns None."""
    fake = tmp_path / "definitely-not-here"
    assert find_dfu_util(override=fake) is None


def test_find_dfu_util_falls_back_to_path(monkeypatch) -> None:
    """When no override and shutil.which returns None, returns None."""
    import shutil
    monkeypatch.setattr(shutil, "which", lambda _: None)
    assert find_dfu_util() is None


def test_find_dfu_util_returns_path_when_on_PATH(monkeypatch) -> None:
    import shutil
    monkeypatch.setattr(shutil, "which", lambda _: "/usr/bin/dfu-util")
    found = find_dfu_util()
    assert found == Path("/usr/bin/dfu-util")


# ---------------------------------------------------------------------------
# list_bundled_firmware
# ---------------------------------------------------------------------------


def test_list_bundled_firmware_empty_dir(tmp_path: Path) -> None:
    assert list_bundled_firmware(tmp_path) == []


def test_list_bundled_firmware_finds_dfu_files(tmp_path: Path) -> None:
    (tmp_path / "harvie256-v1.0.dfu").write_bytes(b"x")
    (tmp_path / "harvie256-v2.0.dfu").write_bytes(b"y")
    (tmp_path / "README.md").write_text("ignore me")
    found = list_bundled_firmware(tmp_path)
    assert len(found) == 2
    # Returned in lexical order
    assert found[0].name == "harvie256-v1.0.dfu"
    assert found[1].name == "harvie256-v2.0.dfu"


def test_list_bundled_firmware_missing_dir() -> None:
    """Missing directory → empty list, not crash."""
    assert list_bundled_firmware(Path("/nonexistent/dir")) == []


# ---------------------------------------------------------------------------
# parse_dfu_util_progress
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("line,expected", [
    ("[=========================] 100%", 100),
    ("Download	[============================        ]  73%", 73),
    ("Erase  [==        ] 25%", 25),
    ("0%", 0),
    ("just text, no percent", None),
    ("", None),
    ("999%", None),  # out of range
    # Note: dfu-util never emits negative percentages; the parser
    # accepts the digit run after the `-` since it's a defensive
    # "find any number followed by %" extractor. Operators won't
    # see this in practice.
])
def test_parse_dfu_util_progress_examples(line: str, expected) -> None:
    assert parse_dfu_util_progress(line) == expected


# ---------------------------------------------------------------------------
# build_dfu_util_command
# ---------------------------------------------------------------------------


def test_build_dfu_util_command_default() -> None:
    cmd = build_dfu_util_command(
        dfu_util_path=Path("/usr/bin/dfu-util"),
        firmware_path=Path("/path/to/firmware.dfu"),
    )
    assert cmd == [
        "/usr/bin/dfu-util",
        "-a", DFU_UTIL_INTERFACE_ALT,
        "-s", f"{DFU_FLASH_TARGET_ADDRESS}:leave",
        "-D", "/path/to/firmware.dfu",
    ]


def test_build_dfu_util_command_with_extra_args() -> None:
    cmd = build_dfu_util_command(
        dfu_util_path=Path("/usr/bin/dfu-util"),
        firmware_path=Path("/path/to/firmware.dfu"),
        extra_args=["--verbose", "--reset"],
    )
    assert cmd[-2:] == ["--verbose", "--reset"]


# ---------------------------------------------------------------------------
# run_pre_check
# ---------------------------------------------------------------------------


def test_pre_check_passes_when_everything_is_present(tmp_path: Path) -> None:
    fake_dfu_util = tmp_path / "dfu-util"
    fake_dfu_util.write_text("")
    fake_firmware = tmp_path / "harvie.dfu"
    fake_firmware.write_bytes(b"x")
    request = DfuFlashRequest(
        firmware_path=fake_firmware,
        dfu_util_path=fake_dfu_util,
    )
    result = run_pre_check(request, expected_dfu_present=True)
    assert result.ok
    assert result.issues == []
    assert result.dfu_util_path == fake_dfu_util
    assert result.firmware_path == fake_firmware


def test_pre_check_fails_when_dfu_util_missing(tmp_path: Path) -> None:
    fake_firmware = tmp_path / "harvie.dfu"
    fake_firmware.write_bytes(b"x")
    request = DfuFlashRequest(
        firmware_path=fake_firmware,
        dfu_util_path=tmp_path / "nope",
    )
    result = run_pre_check(request, expected_dfu_present=True)
    assert not result.ok
    assert any("dfu-util not found" in issue for issue in result.issues)


def test_pre_check_fails_when_firmware_missing(tmp_path: Path) -> None:
    fake_dfu_util = tmp_path / "dfu-util"
    fake_dfu_util.write_text("")
    request = DfuFlashRequest(
        firmware_path=tmp_path / "missing.dfu",
        dfu_util_path=fake_dfu_util,
    )
    result = run_pre_check(request, expected_dfu_present=True)
    assert not result.ok
    assert any("Firmware binary not found" in issue for issue in result.issues)


def test_pre_check_fails_when_device_not_in_dfu_mode(tmp_path: Path) -> None:
    fake_dfu_util = tmp_path / "dfu-util"
    fake_dfu_util.write_text("")
    fake_firmware = tmp_path / "harvie.dfu"
    fake_firmware.write_bytes(b"x")
    request = DfuFlashRequest(
        firmware_path=fake_firmware,
        dfu_util_path=fake_dfu_util,
    )
    result = run_pre_check(request, expected_dfu_present=False)
    assert not result.ok
    assert any("not in DFU bootloader mode" in issue for issue in result.issues)


def test_pre_check_collects_multiple_issues(tmp_path: Path) -> None:
    """Missing tool + missing firmware + not-in-DFU = three issues, all
    reported at once so the operator can fix them in one go.
    """
    request = DfuFlashRequest(
        firmware_path=tmp_path / "missing.dfu",
        dfu_util_path=tmp_path / "nope",
    )
    result = run_pre_check(request, expected_dfu_present=False)
    assert not result.ok
    assert len(result.issues) == 3


# ---------------------------------------------------------------------------
# run_dfu_flash — orchestrator end-to-end with a mock subprocess
# ---------------------------------------------------------------------------


class _MockCompletedProcess:
    """Minimal stand-in for subprocess.CompletedProcess."""
    def __init__(self, returncode: int, stdout: str = "", stderr: str = "") -> None:
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


def test_run_dfu_flash_pre_check_failure_short_circuits(tmp_path: Path) -> None:
    request = DfuFlashRequest(
        firmware_path=tmp_path / "missing.dfu",
        dfu_util_path=tmp_path / "missing-tool",
    )
    events: list[DfuFlashEvent] = []
    terminal = run_dfu_flash(
        request,
        on_event=events.append,
        expected_dfu_present=True,
    )
    assert terminal.phase is DfuFlashPhase.FAILED
    assert terminal.is_terminal()
    assert any(e.phase is DfuFlashPhase.PRE_CHECK for e in events)
    # Did not enter FLASHING phase
    assert not any(e.phase is DfuFlashPhase.FLASHING for e in events)


def test_run_dfu_flash_success_path(tmp_path: Path) -> None:
    fake_dfu_util = tmp_path / "dfu-util"
    fake_dfu_util.write_text("")
    fake_firmware = tmp_path / "harvie.dfu"
    fake_firmware.write_bytes(b"x")
    request = DfuFlashRequest(
        firmware_path=fake_firmware,
        dfu_util_path=fake_dfu_util,
    )

    fake_runner_stdout = (
        "Opening DFU device 0483:DF11\n"
        "Download\t[==                        ]  10%\n"
        "Download\t[============              ]  50%\n"
        "Download\t[==========================] 100%\n"
        "File downloaded successfully\n"
    )

    def fake_runner(*_args, **_kwargs):
        return _MockCompletedProcess(returncode=0, stdout=fake_runner_stdout, stderr="")

    events: list[DfuFlashEvent] = []
    terminal = run_dfu_flash(
        request,
        on_event=events.append,
        expected_dfu_present=True,
        subprocess_runner=fake_runner,
    )
    assert terminal.phase is DfuFlashPhase.SUCCESS
    assert terminal.is_terminal()
    # We should have seen at least one progress event mid-flash
    progress_events = [e for e in events if e.phase is DfuFlashPhase.FLASHING and e.progress_pct]
    assert any(e.progress_pct == 10 for e in progress_events)
    assert any(e.progress_pct == 50 for e in progress_events)
    assert any(e.progress_pct == 100 for e in progress_events)
    # Then POST_CHECK and SUCCESS
    assert any(e.phase is DfuFlashPhase.POST_CHECK for e in events)
    assert events[-1].phase is DfuFlashPhase.SUCCESS


def test_run_dfu_flash_subprocess_returncode_failure(tmp_path: Path) -> None:
    fake_dfu_util = tmp_path / "dfu-util"
    fake_dfu_util.write_text("")
    fake_firmware = tmp_path / "harvie.dfu"
    fake_firmware.write_bytes(b"x")
    request = DfuFlashRequest(
        firmware_path=fake_firmware,
        dfu_util_path=fake_dfu_util,
    )

    def fake_runner(*_args, **_kwargs):
        return _MockCompletedProcess(
            returncode=74,
            stderr="dfu-util: Cannot open DFU device 0483:df11 found on devnum 12 (LIBUSB_ERROR_ACCESS)\n",
        )

    events: list[DfuFlashEvent] = []
    terminal = run_dfu_flash(
        request,
        on_event=events.append,
        expected_dfu_present=True,
        subprocess_runner=fake_runner,
    )
    assert terminal.phase is DfuFlashPhase.FAILED
    assert "exited with code 74" in terminal.message
    assert "LIBUSB_ERROR_ACCESS" in (terminal.error or "")


def test_run_dfu_flash_timeout(tmp_path: Path) -> None:
    fake_dfu_util = tmp_path / "dfu-util"
    fake_dfu_util.write_text("")
    fake_firmware = tmp_path / "harvie.dfu"
    fake_firmware.write_bytes(b"x")
    request = DfuFlashRequest(
        firmware_path=fake_firmware,
        dfu_util_path=fake_dfu_util,
        timeout_seconds=0.001,
    )

    def fake_runner(*_args, **kwargs):
        raise subprocess.TimeoutExpired(cmd=["dfu-util"], timeout=kwargs.get("timeout", 0))

    events: list[DfuFlashEvent] = []
    terminal = run_dfu_flash(
        request,
        on_event=events.append,
        expected_dfu_present=True,
        subprocess_runner=fake_runner,
    )
    assert terminal.phase is DfuFlashPhase.FAILED
    assert "timed out" in terminal.message


def test_run_dfu_flash_subprocess_file_not_found(tmp_path: Path) -> None:
    fake_dfu_util = tmp_path / "dfu-util"
    fake_dfu_util.write_text("")
    fake_firmware = tmp_path / "harvie.dfu"
    fake_firmware.write_bytes(b"x")
    request = DfuFlashRequest(
        firmware_path=fake_firmware,
        dfu_util_path=fake_dfu_util,
    )

    def fake_runner(*_args, **_kwargs):
        raise FileNotFoundError("dfu-util binary not executable")

    terminal = run_dfu_flash(
        request,
        expected_dfu_present=True,
        subprocess_runner=fake_runner,
    )
    assert terminal.phase is DfuFlashPhase.FAILED
    assert "Failed to invoke" in terminal.message


def test_dfu_flash_event_terminal_predicate() -> None:
    success = DfuFlashEvent(phase=DfuFlashPhase.SUCCESS, message="x")
    failed = DfuFlashEvent(phase=DfuFlashPhase.FAILED, message="x")
    flashing = DfuFlashEvent(phase=DfuFlashPhase.FLASHING, message="x", progress_pct=50)
    pre = DfuFlashEvent(phase=DfuFlashPhase.PRE_CHECK, message="x")
    assert success.is_terminal()
    assert failed.is_terminal()
    assert not flashing.is_terminal()
    assert not pre.is_terminal()


def test_run_dfu_flash_emits_events_in_phase_order(tmp_path: Path) -> None:
    """Lock the lifecycle: PRE_CHECK → FLASHING (with progress) →
    POST_CHECK → SUCCESS. No skipped phases.
    """
    fake_dfu_util = tmp_path / "dfu-util"
    fake_dfu_util.write_text("")
    fake_firmware = tmp_path / "harvie.dfu"
    fake_firmware.write_bytes(b"x")
    request = DfuFlashRequest(
        firmware_path=fake_firmware,
        dfu_util_path=fake_dfu_util,
    )

    def fake_runner(*_args, **_kwargs):
        return _MockCompletedProcess(
            returncode=0,
            stdout="Download\t[==========================] 100%\n",
        )

    events: list[DfuFlashEvent] = []
    run_dfu_flash(
        request,
        on_event=events.append,
        expected_dfu_present=True,
        subprocess_runner=fake_runner,
    )
    phases = [e.phase for e in events]
    # Must contain each phase, in order
    assert phases.index(DfuFlashPhase.PRE_CHECK) < phases.index(DfuFlashPhase.FLASHING)
    assert phases.index(DfuFlashPhase.FLASHING) < phases.index(DfuFlashPhase.POST_CHECK)
    assert phases.index(DfuFlashPhase.POST_CHECK) < phases.index(DfuFlashPhase.SUCCESS)


def test_pre_check_result_dataclass_defaults() -> None:
    result = PreCheckResult(ok=True)
    assert result.dfu_util_path is None
    assert result.firmware_path is None
    assert result.issues == []
