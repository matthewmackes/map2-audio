"""PipeWire UMP-MIDI2 substrate probe — T2459-H7-PW-UMP Path 4.

This module is the **environment-detection seam** for Path 4 of
`docs/midi/T2459_H7_PW_UMP_DECISION.md` (selected 2026-05-08).

Path 4 declares the existing ALSA-seq fallback the production answer for
the PipeWire 1.4.10 UMP-MIDI2 → legacy MIDI 1.0 bridge gap. Per-device
the platform's hot path is libremidi-via-`AlsaSeq` (subscribing the
`[type=kernel]` MIDI 1.0 client directly), bypassing the broken
`Midi-Bridge:*` JACK MIDI ports that PipeWire publishes but never feeds
events into.

Detection runs at controller-host launch (called by
`ControllerHostService` before `_spawn_and_wait`). The probe is
deliberately Python-side so it can ship without rebuilding the C++
controller-host binary; its output is forwarded to the C++ side as the
``MAP2_MIDI_BACKEND_FORCE`` env var (consumed by ``forceSelect()``).

Heuristic
---------

The substrate is **broken** (Path 4 fallback engages) when ALL of:

1. PipeWire is the running audio daemon (``pw-cli info 0`` returns OK)
   AND its core version is ``>= 1.4.10``.
2. PipeWire's UMP-MIDI2 ALSA seq clients are present on the bus (the
   default-named ``Midi-Bridge`` client appears in
   ``/proc/asound/seq/clients`` with a high client-id, typically 142+).
3. At least one ``[type=kernel]`` MIDI 1.0 client is present on the bus
   without a ``Connecting To:`` peer — i.e. PipeWire's UMP bridge has
   not subscribed to it. This is the actual gap signature.

Any other state (no PipeWire, older PipeWire, no UMP-MIDI2 clients, all
kernel clients have peers) is **healthy** and the probe returns
``ALSA_SEQ_NOT_FORCED`` so the C++ probe order keeps its original
``JackMidi → PipewireNative → AlsaSeq → AlsaRaw`` priority.

Per-device vs global
--------------------

Path 4 in the worklist is described as "per-device". The current C++
``Map2MidiBackend`` is process-global (one selected backend per host
process), so this Python probe takes the host-wide posture: if any
legacy MIDI 1.0 device on this host has the gap signature, force the
host to ``alsa_seq``. UMP-MIDI2-native devices that *would* prefer the
JackMidi path are still routable via ALSA seq (which subscribes the
kernel client directly with no UMP translation step) — there is no
correctness regression, only a unification regression for ports
multiplexed by JACK that we don't currently exercise. A future iteration
can move per-device backend selection into the C++ adapter (see
``docs/midi/T2459_H7_PW_UMP_DECISION.md`` §5 "If per-device routing
becomes necessary"); Path 4 ships the host-wide posture today.

Operator override
-----------------

If the heuristic produces a false positive (rare but possible on hosts
that run a non-default UMP-MIDI2 ALSA-seq client name), an operator can
short-circuit the probe by exporting ``MAP2_PW_UMP_PROBE_DISABLE=1``
before the controller-host starts. The existing
``MAP2_MIDI_BACKEND_FORCE=jack_midi`` escape hatch on the C++ side then
re-asserts the original probe order.

Tests
-----

This module is hermetic: the public function ``detect_substrate_state``
takes injected fixtures so unit tests can assert each branch without
spinning a real PipeWire daemon. The HIL regression test
``tests/test_t2459h7_pw_ump_fallback.py`` exercises the probe against
the live system when ``MAP2_HIL_PIPEWIRE_UMP=1`` is set; it is a no-op
on CI hosts.
"""

from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from enum import Enum
from typing import Callable, Iterable, Optional

logger = logging.getLogger(__name__)


# Minimum PipeWire core version with the UMP-MIDI2 bridge gap. Versions
# strictly older than this still use the legacy ALSA seq → JACK MIDI
# auto-bridge that worked before the UMP migration.
PIPEWIRE_VERSION_BROKEN_AT = (1, 4, 10)

# ALSA-seq client names that identify PipeWire's UMP-MIDI2 bridge
# clients (the things that *should* be subscribing to legacy kernel
# clients but aren't). The default PipeWire-published name is
# ``Midi-Bridge``; a small number of distros patch it. The hints below
# are matched as case-insensitive substrings — they MUST be specific
# enough to not collide with kernel device names that happen to embed
# the substring "midi2" (e.g. the MeloAudio Commander surfaces as
# ``TSMIDI2.0``). Use distinctive strings only.
UMP_MIDI2_CLIENT_NAME_HINTS = (
    "Midi-Bridge",
    "PipeWire-UMP",
    "PipeWire-MIDI2",
)

# Env vars consumed by the probe.
ENV_DISABLE_PROBE = "MAP2_PW_UMP_PROBE_DISABLE"
ENV_BACKEND_FORCE = "MAP2_MIDI_BACKEND_FORCE"
ENV_HIL_GATE = "MAP2_HIL_PIPEWIRE_UMP"


class SubstrateState(str, Enum):
    """Outcome of the substrate probe.

    - ``HEALTHY`` — JACK MIDI auto-bridge works (or PipeWire is absent /
      older / has no broken signature). Keep the C++ probe order.
    - ``BROKEN_UMP_BRIDGE`` — the gap signature matched. Force ``alsa_seq``
      on the controller-host.
    - ``NO_PIPEWIRE`` — PipeWire is not running. Keep the C++ probe order
      (raw ALSA / JACK still works for the few hosts that don't run
      PipeWire).
    - ``PROBE_DISABLED`` — operator opted out via env var.
    - ``PROBE_ERROR`` — the probe itself failed (missing tools, exception).
      Keep the C++ probe order; log a warning.
    """

    HEALTHY = "healthy"
    BROKEN_UMP_BRIDGE = "broken_ump_bridge"
    NO_PIPEWIRE = "no_pipewire"
    PROBE_DISABLED = "probe_disabled"
    PROBE_ERROR = "probe_error"


@dataclass(frozen=True)
class SubstrateProbeResult:
    """Result of the substrate probe.

    ``state`` is the classification; ``reason`` is the human-readable
    one-liner suitable for ``journalctl``; ``env_overrides`` is the dict
    callers should merge into ``ControllerHostService.env_overrides``
    before spawning the host (empty dict when nothing needs forcing).
    """

    state: SubstrateState
    reason: str
    pipewire_version: Optional[tuple[int, int, int]] = None
    ump_clients_seen: tuple[str, ...] = ()
    orphan_kernel_clients: tuple[str, ...] = ()

    @property
    def env_overrides(self) -> dict[str, str]:
        if self.state is SubstrateState.BROKEN_UMP_BRIDGE:
            return {ENV_BACKEND_FORCE: "alsa_seq"}
        return {}

    @property
    def is_broken(self) -> bool:
        return self.state is SubstrateState.BROKEN_UMP_BRIDGE


# ---------------------------------------------------------------------------
# Public entrypoint
# ---------------------------------------------------------------------------


def detect_substrate_state(
    *,
    pw_cli_runner: Optional[Callable[[], Optional[str]]] = None,
    aseq_clients_reader: Optional[Callable[[], Optional[str]]] = None,
    env: Optional[dict[str, str]] = None,
) -> SubstrateProbeResult:
    """Probe the host substrate; return a classification + env overrides.

    All three external dependencies (``pw-cli``, ``/proc/asound/seq/clients``,
    process env) are injected as callables / dicts so unit tests can drive
    each branch hermetically. The default implementations call the live
    system.

    Behaviour:

    1. If ``MAP2_PW_UMP_PROBE_DISABLE=1`` is set in env → ``PROBE_DISABLED``.
    2. If the system has no ``pw-cli`` binary → ``NO_PIPEWIRE``.
    3. If ``pw-cli info 0`` returns nothing or no parseable version →
       ``PROBE_ERROR``.
    4. If the parsed PipeWire version is older than 1.4.10 → ``HEALTHY``
       (substrate doesn't have the UMP-MIDI2 migration yet).
    5. If no UMP-MIDI2 ALSA-seq client is present → ``HEALTHY``.
    6. If no orphan kernel MIDI 1.0 client is present → ``HEALTHY``.
    7. Otherwise → ``BROKEN_UMP_BRIDGE`` (the gap signature matched).
    """
    env = env if env is not None else os.environ.copy()

    if env.get(ENV_DISABLE_PROBE, "0").lower() in ("1", "true", "yes"):
        return SubstrateProbeResult(
            state=SubstrateState.PROBE_DISABLED,
            reason=(
                f"{ENV_DISABLE_PROBE} is set; substrate probe skipped, "
                "C++ probe order preserved."
            ),
        )

    pw_cli_runner = pw_cli_runner or _default_pw_cli_runner
    aseq_clients_reader = aseq_clients_reader or _default_aseq_clients_reader

    pw_info = pw_cli_runner()
    if pw_info is None:
        return SubstrateProbeResult(
            state=SubstrateState.NO_PIPEWIRE,
            reason=(
                "PipeWire not detected (pw-cli unavailable or daemon "
                "absent). C++ probe order preserved."
            ),
        )

    version = _parse_pipewire_core_version(pw_info)
    if version is None:
        return SubstrateProbeResult(
            state=SubstrateState.PROBE_ERROR,
            reason=(
                "Could not parse PipeWire core.version from pw-cli output. "
                "C++ probe order preserved; bench operator should inspect "
                "`pw-cli info 0` manually."
            ),
        )

    if version < PIPEWIRE_VERSION_BROKEN_AT:
        return SubstrateProbeResult(
            state=SubstrateState.HEALTHY,
            reason=(
                f"PipeWire core.version {_fmt_version(version)} is older "
                f"than {_fmt_version(PIPEWIRE_VERSION_BROKEN_AT)}; "
                "UMP-MIDI2 bridge gap does not apply."
            ),
            pipewire_version=version,
        )

    aseq_text = aseq_clients_reader()
    if aseq_text is None:
        return SubstrateProbeResult(
            state=SubstrateState.PROBE_ERROR,
            reason=(
                "Could not read /proc/asound/seq/clients. C++ probe order "
                "preserved; verify alsa-utils is installed."
            ),
            pipewire_version=version,
        )

    ump_clients = _find_ump_midi2_clients(aseq_text)
    if not ump_clients:
        return SubstrateProbeResult(
            state=SubstrateState.HEALTHY,
            reason=(
                f"PipeWire {_fmt_version(version)} detected but no "
                "UMP-MIDI2 ALSA-seq client present; bridge gap does not "
                "apply."
            ),
            pipewire_version=version,
        )

    orphans = _find_orphan_kernel_midi_clients(aseq_text)
    if not orphans:
        return SubstrateProbeResult(
            state=SubstrateState.HEALTHY,
            reason=(
                f"PipeWire {_fmt_version(version)} with UMP-MIDI2 clients "
                f"{ump_clients!r} present, but no orphan kernel MIDI 1.0 "
                "clients on the bus; substrate is healthy for connected "
                "devices."
            ),
            pipewire_version=version,
            ump_clients_seen=tuple(ump_clients),
        )

    return SubstrateProbeResult(
        state=SubstrateState.BROKEN_UMP_BRIDGE,
        reason=(
            f"PipeWire {_fmt_version(version)} UMP-MIDI2 bridge gap "
            f"detected: orphan kernel MIDI 1.0 clients {orphans!r} have no "
            f"peer subscription from {ump_clients!r}. Forcing controller-host "
            "to alsa_seq backend (Path 4)."
        ),
        pipewire_version=version,
        ump_clients_seen=tuple(ump_clients),
        orphan_kernel_clients=tuple(orphans),
    )


def apply_to_env_overrides(
    base: dict[str, str],
    result: SubstrateProbeResult,
) -> dict[str, str]:
    """Merge the probe's env overrides into a base dict, returning a new dict.

    Caller-supplied values in ``base`` win over probe values (the probe
    is a default; explicit operator overrides take priority). This keeps
    ``MAP2_MIDI_BACKEND_FORCE=jack_midi`` (operator override) intact even
    when the probe wants to force ``alsa_seq``.
    """
    merged = dict(result.env_overrides)
    merged.update(base)  # base wins
    return merged


# ---------------------------------------------------------------------------
# Default live-system implementations
# ---------------------------------------------------------------------------


def _default_pw_cli_runner() -> Optional[str]:
    """Run ``pw-cli info 0`` and return stdout, or None on failure."""
    pw_cli = shutil.which("pw-cli")
    if pw_cli is None:
        return None
    try:
        proc = subprocess.run(
            [pw_cli, "info", "0"],
            capture_output=True,
            text=True,
            timeout=2.0,
        )
    except (subprocess.TimeoutExpired, OSError) as exc:
        logger.debug("pw-cli info 0 failed: %s", exc)
        return None
    if proc.returncode != 0:
        return None
    return proc.stdout


def _default_aseq_clients_reader() -> Optional[str]:
    """Read ``/proc/asound/seq/clients`` and return its content."""
    try:
        with open("/proc/asound/seq/clients", "r", encoding="utf-8") as fh:
            return fh.read()
    except OSError as exc:
        logger.debug("read /proc/asound/seq/clients failed: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Parsers — pure functions, fully unit-testable
# ---------------------------------------------------------------------------


_PW_VERSION_RE = re.compile(r'core\.version\s*=\s*"([^"]+)"')
_VERSION_TUPLE_RE = re.compile(r"(\d+)\.(\d+)\.(\d+)")


def _parse_pipewire_core_version(pw_info: str) -> Optional[tuple[int, int, int]]:
    """Extract the ``core.version`` tuple from ``pw-cli info 0`` output.

    Tolerates extra whitespace / quoting variants seen across PipeWire
    minor releases.
    """
    match = _PW_VERSION_RE.search(pw_info)
    if match is None:
        return None
    inner = _VERSION_TUPLE_RE.search(match.group(1))
    if inner is None:
        return None
    return (int(inner.group(1)), int(inner.group(2)), int(inner.group(3)))


def _fmt_version(v: tuple[int, int, int]) -> str:
    return f"{v[0]}.{v[1]}.{v[2]}"


_CLIENT_HEADER_RE = re.compile(
    r'^Client\s+(\d+)\s*:\s*"([^"]+)"\s*\[([^\]]+)\]',
    re.MULTILINE,
)


def _find_ump_midi2_clients(aseq_text: str) -> list[str]:
    """Return display names of any ALSA-seq clients matching the UMP-MIDI2 hints."""
    found: list[str] = []
    for match in _CLIENT_HEADER_RE.finditer(aseq_text):
        name = match.group(2)
        for hint in UMP_MIDI2_CLIENT_NAME_HINTS:
            if hint.lower() in name.lower():
                found.append(name)
                break
    return found


def _find_orphan_kernel_midi_clients(aseq_text: str) -> list[str]:
    """Return display names of ``[type=kernel]`` clients with no ``Connecting To`` peer.

    Heuristic mirrors the bench observation in
    ``docs/midi/T2459_H7_PW_UMP_DECISION.md`` §1: client 32 (TSMIDI2.0) has
    ``[type=kernel]`` and no ``Connecting To:`` line under any of its ports,
    so it never feeds the JACK MIDI graph.

    The parser walks the file by client header, accumulates each client's
    block (everything between the ``Client N:`` header and the next one),
    and classifies a kernel client as orphan when the block contains
    none of the markers ``Connecting To:`` or ``Connected From:``.
    """
    blocks = _split_into_client_blocks(aseq_text)
    orphans: list[str] = []
    for header, body in blocks:
        m = _CLIENT_HEADER_RE.match(header)
        if m is None:
            continue
        name = m.group(2)
        attrs = m.group(3)
        if "type=kernel" not in attrs.lower():
            continue
        # Skip system-level kernel clients that don't carry MIDI traffic
        # (e.g. "System" client 0). Real MIDI 1.0 devices have ports.
        if name.lower() in {"system", "midi through"}:
            continue
        if "connecting to:" in body.lower():
            continue
        if "connected from:" in body.lower():
            # Some legacy clients are subscribed-from a peer; treat that
            # as a working subscription too.
            continue
        # Must have at least one Port: line to be a real device.
        if "port " not in body.lower():
            continue
        orphans.append(name)
    return orphans


def _split_into_client_blocks(aseq_text: str) -> list[tuple[str, str]]:
    """Split ``/proc/asound/seq/clients`` text into ``(header, body)`` pairs."""
    lines = aseq_text.splitlines()
    blocks: list[tuple[str, str]] = []
    current_header: Optional[str] = None
    current_body: list[str] = []
    for line in lines:
        if _CLIENT_HEADER_RE.match(line):
            if current_header is not None:
                blocks.append((current_header, "\n".join(current_body)))
            current_header = line
            current_body = []
        else:
            if current_header is not None:
                current_body.append(line)
    if current_header is not None:
        blocks.append((current_header, "\n".join(current_body)))
    return blocks


__all__ = [
    "SubstrateState",
    "SubstrateProbeResult",
    "detect_substrate_state",
    "apply_to_env_overrides",
    "ENV_DISABLE_PROBE",
    "ENV_BACKEND_FORCE",
    "ENV_HIL_GATE",
    "PIPEWIRE_VERSION_BROKEN_AT",
    "UMP_MIDI2_CLIENT_NAME_HINTS",
]
