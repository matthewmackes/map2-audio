"""T2448: PipeWire quantum + sample-rate drift detection and enforcement.

Observes live PipeWire metadata via ``pw-metadata`` and compares it against
the Tier-A locked values (48000 Hz / 64 samples). On drift the caller can
choose to re-force the values (default) or surface a structured error.

The module is intentionally thin so it can be unit-tested by monkey-patching
``_run_pw_metadata``.
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from typing import Literal, Optional

logger = logging.getLogger(__name__)

# Tier-A locked values per docs/CLAUDE.md.
EXPECTED_RATE_HZ = 48000
EXPECTED_QUANTUM = 64

# Reasonable bounds for parsed values. Anything outside is treated as unknown.
_MIN_PLAUSIBLE_RATE = 8000
_MAX_PLAUSIBLE_RATE = 384000
_MIN_PLAUSIBLE_QUANTUM = 16
_MAX_PLAUSIBLE_QUANTUM = 8192

QuantumPolicy = Literal["reforce", "fail"]


class PipeWireMetadataUnavailable(RuntimeError):
    """Raised when ``pw-metadata`` cannot be executed (binary missing, no session)."""


class QuantumDriftError(ValueError):
    """Raised when drift is detected and policy is ``fail``.

    The message is stable and used by the route layer to build a structured
    activation error envelope with code ``audio_quantum_drift``.
    """

    def __init__(self, *, observed_rate: Optional[int], observed_quantum: Optional[int]):
        self.observed_rate = observed_rate
        self.observed_quantum = observed_quantum
        super().__init__(
            f"PipeWire quantum drift: observed rate={observed_rate} quantum={observed_quantum}"
            f" expected rate={EXPECTED_RATE_HZ} quantum={EXPECTED_QUANTUM}"
        )


@dataclass(frozen=True)
class QuantumObservation:
    rate: Optional[int]
    quantum: Optional[int]

    @property
    def matches_expected(self) -> bool:
        return self.rate == EXPECTED_RATE_HZ and self.quantum == EXPECTED_QUANTUM


@dataclass(frozen=True)
class QuantumEnforcementResult:
    observed: QuantumObservation
    action: Literal["none", "reforced", "failed"]
    expected_rate: int = EXPECTED_RATE_HZ
    expected_quantum: int = EXPECTED_QUANTUM


async def _run_pw_metadata(args: list[str], *, timeout_s: float = 2.0) -> tuple[int, str, str]:
    """Run ``pw-metadata`` and return ``(returncode, stdout, stderr)``.

    Split out so tests can monkey-patch without spawning real processes.
    """
    try:
        proc = await asyncio.create_subprocess_exec(
            "pw-metadata",
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError as exc:
        raise PipeWireMetadataUnavailable("pw-metadata binary not found") from exc

    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout_s)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise PipeWireMetadataUnavailable("pw-metadata timed out") from None

    return proc.returncode or 0, stdout.decode(errors="replace"), stderr.decode(errors="replace")


_SETTING_VALUE_RE = re.compile(
    r"key:'(?P<key>[^']+)'.*?value:'(?P<value>[^']*)'",
    re.DOTALL,
)


def _parse_setting(output: str, key: str) -> Optional[int]:
    """Parse a single integer-valued setting from ``pw-metadata -n settings 0``."""
    for match in _SETTING_VALUE_RE.finditer(output):
        if match.group("key") == key:
            try:
                return int(match.group("value"))
            except (TypeError, ValueError):
                return None
    return None


async def observe_quantum() -> QuantumObservation:
    """Read the live PipeWire settings. Raises ``PipeWireMetadataUnavailable`` on failure."""
    rc, stdout, stderr = await _run_pw_metadata(["-n", "settings", "0"])
    if rc != 0:
        raise PipeWireMetadataUnavailable(
            f"pw-metadata exited with rc={rc}: {stderr.strip() or stdout.strip()}"
        )

    rate = _parse_setting(stdout, "clock.force-rate") or _parse_setting(stdout, "clock.rate")
    quantum = (
        _parse_setting(stdout, "clock.force-quantum")
        or _parse_setting(stdout, "clock.quantum")
    )
    if rate is not None and not (_MIN_PLAUSIBLE_RATE <= rate <= _MAX_PLAUSIBLE_RATE):
        rate = None
    if quantum is not None and not (_MIN_PLAUSIBLE_QUANTUM <= quantum <= _MAX_PLAUSIBLE_QUANTUM):
        quantum = None
    return QuantumObservation(rate=rate, quantum=quantum)


async def reforce_quantum(*, rate: int = EXPECTED_RATE_HZ, quantum: int = EXPECTED_QUANTUM) -> None:
    """Set rate first, then quantum (order matters — see docs/CLAUDE.md)."""
    rc, _out, err = await _run_pw_metadata(["0", "clock.force-rate", str(rate)])
    if rc != 0:
        raise PipeWireMetadataUnavailable(f"force-rate failed: {err.strip()}")
    rc, _out, err = await _run_pw_metadata(["0", "clock.force-quantum", str(quantum)])
    if rc != 0:
        raise PipeWireMetadataUnavailable(f"force-quantum failed: {err.strip()}")


async def enforce_expected_quantum(policy: QuantumPolicy = "reforce") -> QuantumEnforcementResult:
    """Observe live settings; re-force or fail based on policy.

    * ``policy="reforce"`` (default): silent correction, returns ``action="reforced"`` on drift.
    * ``policy="fail"``: raises :class:`QuantumDriftError` on drift.

    If ``pw-metadata`` is unavailable the function returns ``action="none"`` and
    logs a warning — the caller decides whether to proceed. This matches the
    existing posture where PipeWire-less environments (e.g. CI, non-audio nodes)
    should not block snapshot activation entirely.
    """
    try:
        observed = await observe_quantum()
    except PipeWireMetadataUnavailable as exc:
        logger.warning("PipeWire quantum check skipped: %s", exc)
        return QuantumEnforcementResult(
            observed=QuantumObservation(rate=None, quantum=None),
            action="none",
        )

    if observed.matches_expected:
        return QuantumEnforcementResult(observed=observed, action="none")

    logger.warning(
        "PipeWire quantum drift detected: rate=%s quantum=%s (expected %s/%s); policy=%s",
        observed.rate,
        observed.quantum,
        EXPECTED_RATE_HZ,
        EXPECTED_QUANTUM,
        policy,
    )

    if policy == "fail":
        raise QuantumDriftError(observed_rate=observed.rate, observed_quantum=observed.quantum)

    try:
        await reforce_quantum()
    except PipeWireMetadataUnavailable as exc:
        logger.error("PipeWire quantum re-force failed: %s", exc)
        raise QuantumDriftError(observed_rate=observed.rate, observed_quantum=observed.quantum) from exc
    return QuantumEnforcementResult(observed=observed, action="reforced")
