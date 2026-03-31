"""Push 2 protocol helpers."""

from __future__ import annotations


def build_display_payload(*_args, **_kwargs) -> list[bytes]:
    """Return Push 2 display payloads.

    UNVERIFIED: Push 2 display transport is intentionally isolated until MAP2
    captures and verifies the required SysEx payload format.
    """

    return []
