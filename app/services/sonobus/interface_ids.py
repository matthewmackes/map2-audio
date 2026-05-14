"""SonoBus interface-ID conventions and Q12 recorder/artifact exclusion.

T2521-7. Provides the canonical `sonobus:` ID space that the unified
`AudioInterfaceRegistry` (T2518) will surface to the Snapshot Editor
and routing matrix, plus the Q12-locked exclusion helper used by the
Recorder and Audio Artifacts services to reject any attempt to record
into / out of a SonoBus binding.

Q12 is a hard exclusion:
- No SonoBus endpoint feeds the Recorder service.
- No SonoBus binding appears under Audio Artifacts.
- The CI regression in tests/sonobus/test_sonobus_recorder_exclusion.py
  enforces this — anywhere a `sonobus:` ID could leak into recorder
  flows, those flows must call `assert_not_sonobus_id()` first.

See `docs/architecture/SONOBUS_AOO_TRANSPORT.md §2.5.3` for the
rationale.
"""

from __future__ import annotations

from typing import Optional

SONOBUS_ID_PREFIX = "sonobus:"


class SonoBusInterfaceForbiddenError(Exception):
    """Raised when a SonoBus interface ID is passed to a service that
    explicitly excludes the SonoBus transport (Recorder + Audio
    Artifacts per Q12).

    The error message names the locked decision so failures explain
    themselves in logs/operator output.
    """

    def __init__(self, interface_id: str, service_name: str) -> None:
        super().__init__(
            f"SonoBus interface {interface_id!r} cannot be used by "
            f"{service_name} (T2521 Q12: no recorder/artifact integration "
            f"for the SonoBus transport)."
        )
        self.interface_id = interface_id
        self.service_name = service_name


def make_sonobus_interface_id(
    peer_id: str,
    group_id: str,
    stream_id: str,
) -> str:
    """Build a canonical SonoBus interface ID for the
    `AudioInterfaceRegistry`. The shape mirrors the AVB pattern
    (`avb:<endpoint_id>`) so the registry can dispatch by prefix.

    Example: `sonobus:peer-alpha:group-default:stream-0001`.
    """
    if not peer_id or ":" in peer_id:
        raise ValueError(f"peer_id must be non-empty and colon-free: {peer_id!r}")
    if not group_id or ":" in group_id:
        raise ValueError(f"group_id must be non-empty and colon-free: {group_id!r}")
    if not stream_id or ":" in stream_id:
        raise ValueError(
            f"stream_id must be non-empty and colon-free: {stream_id!r}"
        )
    return f"{SONOBUS_ID_PREFIX}{peer_id}:{group_id}:{stream_id}"


def is_sonobus_interface_id(interface_id: Optional[str]) -> bool:
    """True if the interface ID names a SonoBus binding.

    Operates on the string form so callers don't have to import the
    full SonoBusBinding schema. None and empty strings are treated as
    non-SonoBus.
    """
    if not interface_id:
        return False
    return interface_id.startswith(SONOBUS_ID_PREFIX)


def parse_sonobus_interface_id(
    interface_id: str,
) -> tuple[str, str, str]:
    """Split a SonoBus interface ID into (peer_id, group_id, stream_id).

    Raises ValueError if the ID isn't a well-formed SonoBus ID.
    """
    if not is_sonobus_interface_id(interface_id):
        raise ValueError(
            f"Not a SonoBus interface ID: {interface_id!r}"
        )
    body = interface_id[len(SONOBUS_ID_PREFIX) :]
    parts = body.split(":")
    if len(parts) != 3 or not all(parts):
        raise ValueError(
            f"Malformed SonoBus interface ID: {interface_id!r} "
            f"(expected sonobus:<peer>:<group>:<stream>)"
        )
    peer_id, group_id, stream_id = parts
    return peer_id, group_id, stream_id


def assert_not_sonobus_id(
    interface_id: Optional[str],
    *,
    service_name: str,
) -> None:
    """Q12 enforcement helper. Raises `SonoBusInterfaceForbiddenError`
    when a SonoBus ID reaches a recorder/artifact code path.

    Call from:
      - Recorder service entry points that accept an interface ID.
      - Audio Artifacts service entry points.
      - Any future code path the operator confirms is recorder-adjacent.

    `service_name` is the human-readable name of the calling service —
    "Recorder", "Audio Artifacts", etc. It appears in the raised error
    so logs explain the rejection.
    """
    if is_sonobus_interface_id(interface_id):
        raise SonoBusInterfaceForbiddenError(
            interface_id=interface_id or "",
            service_name=service_name,
        )


__all__ = [
    "SONOBUS_ID_PREFIX",
    "SonoBusInterfaceForbiddenError",
    "make_sonobus_interface_id",
    "is_sonobus_interface_id",
    "parse_sonobus_interface_id",
    "assert_not_sonobus_id",
]
