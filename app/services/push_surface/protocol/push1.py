"""Push 1 protocol helpers.

This module intentionally keeps hardware-specific extensions isolated from the
generic MIDI layer. Confirmed display/SysEx support can be added incrementally
without changing the parser or renderer contracts.
"""

from __future__ import annotations


def build_display_payload(*_args, **_kwargs) -> list[bytes]:
    """Return Push 1 display payloads.

    UNVERIFIED: MAP2 does not currently ship a confirmed Push 1 display
    transport. The manager keeps display rendering behind this interface so a
    verified transport can land later without touching page logic.
    """

    return []
