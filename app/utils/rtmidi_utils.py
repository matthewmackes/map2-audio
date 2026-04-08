"""Helpers for deterministic python-rtmidi client cleanup."""

from __future__ import annotations

from typing import Any


def dispose_rtmidi_client(client: Any, *, cancel_callback: bool = False) -> None:
    """Best-effort shutdown for python-rtmidi clients.

    `close_port()` alone does not always release the underlying ALSA sequencer
    client. Call `delete()` as well when the wrapper exposes it.
    """

    if client is None:
        return

    if cancel_callback:
        cancel = getattr(client, "cancel_callback", None)
        if callable(cancel):
            try:
                cancel()
            except Exception:
                pass

    close_port = getattr(client, "close_port", None)
    if callable(close_port):
        try:
            close_port()
        except Exception:
            pass

    delete = getattr(client, "delete", None)
    if callable(delete):
        try:
            delete()
        except Exception:
            pass
