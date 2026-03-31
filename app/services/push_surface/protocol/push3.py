"""Push 3 protocol helpers."""

from __future__ import annotations


def build_display_payload(*_args, **_kwargs) -> list[bytes]:
    """Return Push 3 display payloads.

    UNVERIFIED: Push 3 control-attached display transport remains isolated
    behind this interface pending protocol capture/verification.
    """

    return []
