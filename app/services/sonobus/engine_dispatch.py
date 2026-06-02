"""SonoBus → JUCE-engine name-exchange dispatch (T2521-4 step 5).

Translates a committed desired-IO intent into the engine's SonoBus
name-exchange binding. When a snapshot's requested input/output interface
is a `sonobus:` id, the engine stores the *stream name* so the standalone
`map2-sonobus-transport` daemon can discover the engine's JACK ports and
do the live port wiring on its own RT thread. AOO never enters the JUCE
RT path (SONOBUS_DAEMON_RT_SAFETY_REVIEW.md §1); the engine only stores a
name and exposes it for reflection/daemon-discovery.

This module is a pure, testable seam: given a desired-IO object (anything
exposing `requested_input_interface_id` / `requested_output_interface_id`)
and an engine-IO seam (anything exposing async
`set_sonobus_input_id` / `set_sonobus_output_id`), it detects SonoBus ids
via the canonical `interface_ids.py` helpers and binds/clears accordingly.

Activation-path wiring: `apply_sonobus_io_binding` is already wired into the
snapshot activation apply path via
`SnapshotService._apply_snapshot_sonobus_io_binding` (snapshot_runtime.py),
which is invoked from `StateAuthorityActivationService` alongside the audio
device + monitoring-output bindings. The *general* interface-routing applier
(driving engine device selection from `requested_*_interface_id` for
non-SonoBus ids) lands with T2518 — this module only owns the SonoBus slice.
"""

from __future__ import annotations

from typing import Any, Optional

from app.services.sonobus.interface_ids import (
    is_sonobus_interface_id,
    parse_sonobus_interface_id,
)


def _resolve_sonobus_stream_id(interface_id: Optional[str]) -> Optional[str]:
    """Return the SonoBus stream-name component of an interface id, or None.

    Non-SonoBus / empty ids resolve to None so the caller unbinds.
    """
    if not is_sonobus_interface_id(interface_id):
        return None
    # interface_id is guaranteed non-empty + well-prefixed here.
    _peer_id, _group_id, stream_id = parse_sonobus_interface_id(interface_id)  # type: ignore[arg-type]
    return stream_id


async def apply_sonobus_io_binding(engine_io: Any, desired_io: Any) -> dict[str, Any]:
    """Apply (or clear) the engine's SonoBus name-exchange binding.

    For each direction (input / output):
      - if the requested interface id is a `sonobus:` id, parse out the stream
        name and call ``engine_io.set_sonobus_{input,output}_id(stream_name)``.
      - otherwise (non-SonoBus id or None), clear the binding by calling the
        setter with "" so a switch-away unbinds the engine.

    Args:
        engine_io: object exposing async ``set_sonobus_input_id`` /
            ``set_sonobus_output_id`` (the juce_process seam, or a fake).
        desired_io: object exposing ``requested_input_interface_id`` /
            ``requested_output_interface_id`` (e.g. ``AudioStateDesiredIO``).

    Returns:
        Summary dict::

            {
              "input_bound": bool,    # True iff a real sonobus stream was bound
              "output_bound": bool,
              "input_stream_id": Optional[str],   # the stream name, or None when cleared
              "output_stream_id": Optional[str],
            }
    """
    requested_input = getattr(desired_io, "requested_input_interface_id", None)
    requested_output = getattr(desired_io, "requested_output_interface_id", None)

    input_stream_id = _resolve_sonobus_stream_id(requested_input)
    output_stream_id = _resolve_sonobus_stream_id(requested_output)

    # Bind the resolved stream name, or clear ("") when no sonobus id is present.
    input_applied = await engine_io.set_sonobus_input_id(input_stream_id or "")
    output_applied = await engine_io.set_sonobus_output_id(output_stream_id or "")

    return {
        "input_bound": bool(input_stream_id) and bool(input_applied),
        "output_bound": bool(output_stream_id) and bool(output_applied),
        "input_stream_id": input_stream_id,
        "output_stream_id": output_stream_id,
    }


__all__ = ["apply_sonobus_io_binding"]
