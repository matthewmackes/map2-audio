"""Helpers for deterministic python-rtmidi-shape client cleanup.

T2482 loop 9 / iter 87: python-rtmidi was dropped from
requirements-backend-runtime.txt. This helper has zero rtmidi
imports — it's a pure duck-typed close+delete shim used by the
remaining test-factory paths in
app/services/ground_control_pro/midi_transport.py and
app/services/sysex_device_bridge.py. Test factories inject
rtmidi-shape mocks (objects with close_port / delete methods);
this helper drains them cleanly without depending on the real
python-rtmidi package.

Production code no longer reaches this helper.
"""

from __future__ import annotations

from typing import Any


def dispose_rtmidi_client(client: Any, *, cancel_callback: bool = False) -> None:
    """Best-effort shutdown for python-rtmidi-shape clients.

    `close_port()` alone does not always release the underlying ALSA sequencer
    client. Call `delete()` as well when the wrapper exposes it. Used by
    test factories that supply rtmidi-shape mocks; production code routes
    MIDI through the controller-host (no rtmidi clients to dispose).
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
