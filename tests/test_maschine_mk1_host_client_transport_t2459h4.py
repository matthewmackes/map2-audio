"""T2459-H4 slice 11 — MaschineMK1HostClientTransport facade tests.

Pins the facade's public surface against the legacy
``MaschineMK1UsbTransport`` (so the daemon can swap implementations
behind a feature flag without touching call sites) and validates
the stub-mode behavior that ships before slices 13-15 land the
engine-side IPC.
"""

from __future__ import annotations

import inspect
import threading

import pytest

from app.services.maschine.mk1_host_client_transport import (
    MaschineMK1HostClientTransport,
)
from app.services.maschine.mk1_usb_transport import MaschineMK1UsbTransport


# ---------------------------------------------------------------------------
# Surface-parity guard: every public method on the legacy transport must
# also be defined on the host-client facade with the same parameter
# signature so the daemon can swap one for the other without code edits.
# ---------------------------------------------------------------------------

_LEGACY_PUBLIC_METHODS = (
    "is_open",
    "open",
    "close",
    "initialize_device",
    "write_leds",
    "write_display_frame",
    "read_pads",
    "read_buttons_encoders",
)


def test_facade_implements_every_legacy_public_method() -> None:
    """The host-client facade must export the same public method names
    the daemon already calls on the legacy transport."""
    for name in _LEGACY_PUBLIC_METHODS:
        assert hasattr(MaschineMK1UsbTransport, name), (
            f"Legacy transport missing {name} — audit-test premise broken"
        )
        assert hasattr(MaschineMK1HostClientTransport, name), (
            f"Host-client facade is missing public method '{name}'"
        )


def test_facade_methods_are_callable() -> None:
    """Each parity method must be a callable, not (e.g.) a class."""
    transport = MaschineMK1HostClientTransport()
    for name in _LEGACY_PUBLIC_METHODS:
        method = getattr(transport, name)
        assert callable(method), f"{name} is not callable on the facade"


def test_facade_read_signature_matches_legacy() -> None:
    """``read_pads`` and ``read_buttons_encoders`` accept the same
    keyword shape on both transports."""
    for name in ("read_pads", "read_buttons_encoders"):
        legacy_sig = inspect.signature(getattr(MaschineMK1UsbTransport, name))
        facade_sig = inspect.signature(getattr(MaschineMK1HostClientTransport, name))
        # Both should accept timeout_ms.
        assert "timeout_ms" in legacy_sig.parameters
        assert "timeout_ms" in facade_sig.parameters


# ---------------------------------------------------------------------------
# Lifecycle tests — open / close are idempotent, stub-mode is safe.
# ---------------------------------------------------------------------------


def test_open_then_close_is_idempotent() -> None:
    transport = MaschineMK1HostClientTransport()
    assert transport.is_open() is False

    transport.open()
    assert transport.is_open() is True

    transport.open()  # second open is a no-op
    assert transport.is_open() is True

    transport.close()
    assert transport.is_open() is False

    transport.close()  # second close is a no-op
    assert transport.is_open() is False


def test_close_stops_reader_thread() -> None:
    """The reader thread (when started) must exit on close()."""
    transport = MaschineMK1HostClientTransport()
    transport.open()

    # Capture the thread reference if the host client constructed
    # successfully. In CI without the host running, the construction
    # may fail and the reader simply never starts; in that case the
    # field stays None and the test still passes.
    thread = transport._reader_thread  # type: ignore[attr-defined]
    transport.close()
    if thread is not None:
        thread.join(timeout=1.0)
        assert not thread.is_alive(), "reader thread should be stopped after close()"


def test_read_returns_none_when_not_open() -> None:
    transport = MaschineMK1HostClientTransport()
    assert transport.read_pads(timeout_ms=0) is None
    assert transport.read_buttons_encoders(timeout_ms=0) is None


def test_writes_are_no_op_safe_when_stub_mode() -> None:
    """In stub mode (no host wired up yet), writes do not raise."""
    transport = MaschineMK1HostClientTransport()
    transport.open()
    transport.write_leds(b"\x00" * 100)
    transport.write_display_frame(b"\x00" * 1024)
    transport.close()


# ---------------------------------------------------------------------------
# Diagnostics surface — operator-visible counters.
# ---------------------------------------------------------------------------


def test_diagnostics_snapshot_shape() -> None:
    transport = MaschineMK1HostClientTransport()
    snap = transport.diagnostics_snapshot()
    expected_keys = {
        "transport",
        "opened",
        "client_constructed",
        "client_construct_error",
        "pad_packets_received",
        "button_packets_received",
        "led_writes_attempted",
        "led_writes_dropped",
        "display_writes_attempted",
        "display_writes_dropped",
    }
    assert set(snap.keys()) >= expected_keys
    assert snap["transport"] == "host-client"
    assert snap["opened"] is False


def test_diagnostics_counts_dropped_writes_in_stub_mode() -> None:
    """A flag-on caller should still see the writes attempted; they're
    counted as dropped while the host slice hasn't shipped yet."""
    transport = MaschineMK1HostClientTransport()
    transport.open()

    transport.write_leds(b"\x00" * 5)
    transport.write_leds(b"\x00" * 5)
    transport.write_display_frame(b"\x00" * 5)

    snap = transport.diagnostics_snapshot()
    assert snap["led_writes_attempted"] == 2
    assert snap["display_writes_attempted"] == 1
    # Stub mode drops everything — by design until slice 15 lands.
    assert snap["led_writes_dropped"] == 2
    assert snap["display_writes_dropped"] == 1

    transport.close()


# ---------------------------------------------------------------------------
# Class-name + module-path pin so the daemon's lazy import target stays
# correct.
# ---------------------------------------------------------------------------


def test_facade_module_path_is_pinned() -> None:
    assert (
        MaschineMK1HostClientTransport.__module__
        == "app.services.maschine.mk1_host_client_transport"
    )


def test_no_active_threads_after_close_when_stub_mode() -> None:
    """In stub mode (no host) no reader thread is spawned, so the
    process thread count after open()+close() must equal the count
    before open()."""
    before = threading.active_count()
    transport = MaschineMK1HostClientTransport()
    transport.open()
    transport.close()
    after = threading.active_count()
    # Allow some slack for unrelated test threads.
    assert after <= before + 1
