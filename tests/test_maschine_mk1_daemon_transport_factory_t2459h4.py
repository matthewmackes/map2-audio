"""T2459-H4 slice 12 — daemon transport-factory tests.

Validates that the daemon's transport construction now goes through
``_build_maschine_mk1_transport`` and that the
``MAP2_MASCHINE_HOST_CLIENT_TRANSPORT`` env flag controls which
implementation is constructed.
"""

from __future__ import annotations

import os
import inspect

import pytest

from app.services.maschine import maschine_mk1_daemon
from app.services.maschine.maschine_mk1_daemon import (
    _build_maschine_mk1_transport,
    _maschine_use_host_client_transport,
)
from app.services.maschine.mk1_host_client_transport import (
    MaschineMK1HostClientTransport,
)
from app.services.maschine.mk1_usb_transport import MaschineMK1UsbTransport


@pytest.fixture(autouse=True)
def _clear_env_flag(monkeypatch):
    """Always start each test with the env flag cleared."""
    monkeypatch.delenv("MAP2_MASCHINE_HOST_CLIENT_TRANSPORT", raising=False)
    yield


def test_default_env_returns_legacy_transport(monkeypatch):
    """When the flag is unset, the factory returns the legacy
    USB transport (the daemon's current production behavior)."""
    transport = _build_maschine_mk1_transport(allow_kernel_detach=False)
    assert isinstance(transport, MaschineMK1UsbTransport)


@pytest.mark.parametrize("falsy", ["", "0", "false", "off", "no", "OFF", "  ", "anything-else"])
def test_falsy_env_returns_legacy_transport(monkeypatch, falsy):
    """Anything other than the explicit truthy set defaults to legacy."""
    monkeypatch.setenv("MAP2_MASCHINE_HOST_CLIENT_TRANSPORT", falsy)
    transport = _build_maschine_mk1_transport(allow_kernel_detach=False)
    assert isinstance(transport, MaschineMK1UsbTransport)


@pytest.mark.parametrize("truthy", ["1", "true", "TRUE", "yes", "Yes", "on", "ON", "On"])
def test_truthy_env_returns_host_client_transport(monkeypatch, truthy):
    """Every documented truthy value flips the factory to the host-client facade."""
    monkeypatch.setenv("MAP2_MASCHINE_HOST_CLIENT_TRANSPORT", truthy)
    transport = _build_maschine_mk1_transport(allow_kernel_detach=False)
    assert isinstance(transport, MaschineMK1HostClientTransport)


def test_helper_returns_bool_for_typing(monkeypatch):
    """The flag helper must return strictly bool (not str / None)
    so callers can use it directly in conditionals without
    truthiness surprises."""
    assert _maschine_use_host_client_transport() is False
    monkeypatch.setenv("MAP2_MASCHINE_HOST_CLIENT_TRANSPORT", "1")
    assert _maschine_use_host_client_transport() is True


def test_daemon_module_imports_host_client_facade():
    """Source-level pin: the daemon module must keep importing the
    host-client facade so future code edits can't accidentally drop
    the import + silently break the slice-12 wire-up."""
    source = inspect.getsource(maschine_mk1_daemon)
    assert "from app.services.maschine.mk1_host_client_transport import" in source
    assert "MaschineMK1HostClientTransport" in source


def test_daemon_construction_site_uses_factory():
    """The daemon's run-loop transport construction must go through
    the factory, not call MaschineMK1UsbTransport(...) directly."""
    source = inspect.getsource(maschine_mk1_daemon)
    # The factory must be referenced at least once.
    assert "_build_maschine_mk1_transport(" in source
    # Inside the daemon's _run() loop the legacy class should NOT
    # appear as a direct constructor call (only as a type annotation
    # or inside the factory body).
    run_loop_start = source.find("def _run(")
    if run_loop_start >= 0:
        run_loop_text = source[run_loop_start : run_loop_start + 50_000]
        # The factory call IS in the run loop.
        assert "_build_maschine_mk1_transport(" in run_loop_text
        # Direct construction is NOT.
        assert "MaschineMK1UsbTransport(" not in run_loop_text
