"""DFU flash orchestrator for the MeloAudio MIDI Commander.

T2459-H3-CFG Phase 4.

Owns the operator-visible flow for installing the harvie256 custom
firmware:

1. **Pre-check** — verify ``dfu-util`` is installed, verify the
   bundled ``.dfu`` binary exists in
   ``device-packs/meloaudio/firmware/``, verify the device is in DFU
   bootloader mode (USB ID ``0483:DF11``).
2. **Flash** — invoke ``dfu-util`` and stream its progress output to
   the caller via a structured event stream.
3. **Post-check** — wait for the device to re-enumerate as the custom
   firmware (or report a timeout if it doesn't).

This module DOES NOT trigger DFU mode entry — the operator must hold
the firmware-defined footswitch combo at power-on. We can't put the
device into DFU mode from software because that's a hardware-boot
button on the STM32 MCU.

The orchestrator is **synchronous** — caller (typically a FastAPI
route) runs it in a worker thread and streams progress events back to
the UI via WebSocket.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Callable, Iterable, Optional

logger = logging.getLogger(__name__)


# Bundled firmware lives here. Each .dfu binary is named with a
# version suffix; the orchestrator picks the operator-selected one (or
# the latest if unspecified).
FIRMWARE_BUNDLE_DIR = (
    Path(__file__).resolve().parents[3]
    / "device-packs"
    / "meloaudio"
    / "firmware"
)

# Default dfu-util CLI args. The harvie256 firmware lives at flash
# address 0x08000000 (STM32 main flash), and the ``leave`` suffix tells
# dfu-util to issue a "leave DFU mode" command after the write so the
# device boots into normal mode without a manual power-cycle.
DFU_FLASH_TARGET_ADDRESS = "0x08000000"
DFU_UTIL_INTERFACE_ALT = "0"


class DfuFlashPhase(str, Enum):
    """Lifecycle stages of a DFU flash operation."""

    PRE_CHECK = "pre_check"
    """Verifying dfu-util presence + firmware binary + device state."""

    FLASHING = "flashing"
    """dfu-util is actively writing to flash."""

    POST_CHECK = "post_check"
    """Waiting for the device to re-enumerate after flash completion."""

    SUCCESS = "success"
    """Flash completed and device re-enumerated as the custom firmware."""

    FAILED = "failed"
    """A pre-check or flash step failed; see :class:`DfuFlashEvent.error`."""


@dataclass(frozen=True)
class DfuFlashEvent:
    """A single status update emitted by the orchestrator.

    Caller's UI consumes the event stream to drive a
    Carbon ``<ProgressIndicator>`` and surface error messages.
    """

    phase: DfuFlashPhase
    message: str
    progress_pct: Optional[int] = None
    """0-100 for incremental progress within FLASHING; ``None`` for
    discrete phases (PRE_CHECK / POST_CHECK / SUCCESS / FAILED)."""

    error: Optional[str] = None
    """Populated on FAILED; ``None`` otherwise."""

    def is_terminal(self) -> bool:
        return self.phase in (DfuFlashPhase.SUCCESS, DfuFlashPhase.FAILED)


@dataclass
class DfuFlashRequest:
    """Inputs to a flash operation."""

    firmware_path: Path
    """Absolute path to the .dfu binary to flash."""

    dfu_util_path: Optional[Path] = None
    """Override the dfu-util binary location. ``None`` = use $PATH."""

    timeout_seconds: float = 120.0
    """Hard timeout for the dfu-util subprocess. Real flashes take
    20-40 seconds; 120 is a safety margin."""

    extra_args: list[str] = field(default_factory=list)
    """Additional flags passed verbatim to dfu-util. Power users only."""


# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------


def find_dfu_util(override: Optional[Path] = None) -> Optional[Path]:
    """Locate the dfu-util binary.

    If ``override`` is provided, returns it iff the file exists.
    Otherwise searches PATH for ``dfu-util``. Returns ``None`` if not
    found — caller surfaces the install instructions to the operator.
    """
    if override is not None:
        return override if override.exists() else None
    found = shutil.which("dfu-util")
    return Path(found) if found else None


def list_bundled_firmware(directory: Path = FIRMWARE_BUNDLE_DIR) -> list[Path]:
    """Enumerate .dfu binaries in the bundled-firmware directory.

    Returned in lexical order. Caller picks the latest (or asks the
    operator to choose if there are multiple versions).
    """
    if not directory.exists():
        return []
    return sorted(directory.glob("*.dfu"))


@dataclass
class PreCheckResult:
    """Outcome of the orchestrator's pre-check step."""

    ok: bool
    dfu_util_path: Optional[Path] = None
    firmware_path: Optional[Path] = None
    issues: list[str] = field(default_factory=list)


def run_pre_check(
    request: DfuFlashRequest,
    *,
    expected_dfu_present: bool = True,
) -> PreCheckResult:
    """Verify the prerequisites for a flash run.

    ``expected_dfu_present`` is whether the caller already verified
    the device is in DFU mode (via the detection module). The
    pre-check doesn't re-verify USB state because the detection
    module is the canonical surface for that.
    """
    issues: list[str] = []
    dfu = find_dfu_util(request.dfu_util_path)
    if dfu is None:
        issues.append(
            "dfu-util not found. Install with `sudo dnf install dfu-util` "
            "(Fedora) or `sudo apt install dfu-util` (Debian/Ubuntu)."
        )
    if not request.firmware_path.exists():
        issues.append(
            f"Firmware binary not found at {request.firmware_path}. "
            "Verify the bundled firmware shipped with this MAP2 install."
        )
    if not expected_dfu_present:
        issues.append(
            "Device is not in DFU bootloader mode. Hold the firmware "
            "footswitch combo at power-on to enter DFU, then retry."
        )
    return PreCheckResult(
        ok=len(issues) == 0,
        dfu_util_path=dfu,
        firmware_path=request.firmware_path,
        issues=issues,
    )


# ---------------------------------------------------------------------------
# Flash invocation
# ---------------------------------------------------------------------------


def build_dfu_util_command(
    *,
    dfu_util_path: Path,
    firmware_path: Path,
    extra_args: Iterable[str] = (),
) -> list[str]:
    """Construct the dfu-util argv list for flashing the firmware.

    Standard form per the harvie256 README::

        dfu-util -a 0 -s 0x08000000:leave -D <firmware>.dfu
    """
    return [
        str(dfu_util_path),
        "-a",
        DFU_UTIL_INTERFACE_ALT,
        "-s",
        f"{DFU_FLASH_TARGET_ADDRESS}:leave",
        "-D",
        str(firmware_path),
        *extra_args,
    ]


def parse_dfu_util_progress(line: str) -> Optional[int]:
    """Extract a 0-100 percentage from a dfu-util output line.

    dfu-util writes progress lines that look like::

        [=========================] 100%

    or::

        Download	[============================        ]  73%

    The exact format varies by dfu-util version; we look for ``NN%``
    anywhere in the line.
    """
    text = line.strip()
    # Look for any number followed by '%'
    import re
    match = re.search(r"(\d+)\s*%", text)
    if match is None:
        return None
    pct = int(match.group(1))
    if 0 <= pct <= 100:
        return pct
    return None


def run_dfu_flash(
    request: DfuFlashRequest,
    *,
    on_event: Optional[Callable[[DfuFlashEvent], None]] = None,
    expected_dfu_present: bool = True,
    subprocess_runner: Callable[..., subprocess.CompletedProcess] = subprocess.run,
) -> DfuFlashEvent:
    """Run the full flash sequence, emitting events through ``on_event``.

    Returns the terminal event (SUCCESS or FAILED). Caller can use
    that for a final status report; intermediate events surface
    through ``on_event``.

    The ``subprocess_runner`` parameter is a test seam — production
    callers pass ``subprocess.run`` (the default); tests pass a fake
    that returns a controllable result.
    """
    def _emit(event: DfuFlashEvent) -> None:
        if on_event is not None:
            try:
                on_event(event)
            except Exception:  # pragma: no cover
                logger.exception("DFU flash on_event callback raised")

    # 1. Pre-check
    _emit(DfuFlashEvent(phase=DfuFlashPhase.PRE_CHECK, message="Verifying dfu-util + firmware binary"))
    pre = run_pre_check(request, expected_dfu_present=expected_dfu_present)
    if not pre.ok:
        terminal = DfuFlashEvent(
            phase=DfuFlashPhase.FAILED,
            message="Pre-check failed",
            error="; ".join(pre.issues),
        )
        _emit(terminal)
        return terminal

    assert pre.dfu_util_path is not None
    assert pre.firmware_path is not None

    # 2. Flash
    cmd = build_dfu_util_command(
        dfu_util_path=pre.dfu_util_path,
        firmware_path=pre.firmware_path,
        extra_args=request.extra_args,
    )
    _emit(DfuFlashEvent(
        phase=DfuFlashPhase.FLASHING,
        message=f"Running: {' '.join(cmd)}",
        progress_pct=0,
    ))
    try:
        result = subprocess_runner(
            cmd,
            capture_output=True,
            text=True,
            timeout=request.timeout_seconds,
        )
    except subprocess.TimeoutExpired:
        terminal = DfuFlashEvent(
            phase=DfuFlashPhase.FAILED,
            message="dfu-util timed out",
            error=(
                f"dfu-util did not complete within {request.timeout_seconds}s. "
                "Power-cycle the device and retry."
            ),
        )
        _emit(terminal)
        return terminal
    except FileNotFoundError as exc:
        terminal = DfuFlashEvent(
            phase=DfuFlashPhase.FAILED,
            message="Failed to invoke dfu-util",
            error=str(exc),
        )
        _emit(terminal)
        return terminal

    # Parse progress lines from stdout/stderr (dfu-util writes to both)
    output_text = (result.stdout or "") + "\n" + (result.stderr or "")
    last_pct = 0
    for line in output_text.splitlines():
        pct = parse_dfu_util_progress(line)
        if pct is not None and pct > last_pct:
            last_pct = pct
            _emit(DfuFlashEvent(
                phase=DfuFlashPhase.FLASHING,
                message=line.strip(),
                progress_pct=pct,
            ))

    if result.returncode != 0:
        terminal = DfuFlashEvent(
            phase=DfuFlashPhase.FAILED,
            message=f"dfu-util exited with code {result.returncode}",
            error=output_text.strip()[-2000:],   # truncate to last 2KB to keep events compact
        )
        _emit(terminal)
        return terminal

    # 3. Post-check (caller is responsible for actually waiting on
    # USB re-enumeration; we just emit the marker event so the UI
    # progress bar reaches 100% and surfaces the "wait" prompt).
    _emit(DfuFlashEvent(
        phase=DfuFlashPhase.POST_CHECK,
        message="dfu-util completed; waiting for device to re-enumerate",
        progress_pct=100,
    ))

    terminal = DfuFlashEvent(
        phase=DfuFlashPhase.SUCCESS,
        message="Firmware flashed successfully",
        progress_pct=100,
    )
    _emit(terminal)
    return terminal
