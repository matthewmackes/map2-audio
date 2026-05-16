"""Run-14b cycle 4 — `docs/architecture/SONOBUS_DAEMON.md` contract.

The daemon doc is the single canonical reference; if a future PR
renames a state string or error code without updating the doc, the
operator's mental model drifts from the actual code surface. These
tests pin the must-have anchors.
"""

from __future__ import annotations

from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
DOC = REPO_ROOT / "docs" / "architecture" / "SONOBUS_DAEMON.md"


def test_doc_exists() -> None:
    assert DOC.is_file(), f"missing daemon doc at {DOC}"


def test_doc_documents_each_supervisor_state_string() -> None:
    """The Tag tone selector on the GUI matches on these exact strings."""
    text = DOC.read_text()
    from app.services.sonobus.daemon_supervisor import SonoBusDaemonStatus
    for state in (
        SonoBusDaemonStatus.STOPPED,
        SonoBusDaemonStatus.WAITING_FOR_BINARY,
        SonoBusDaemonStatus.WAITING_FOR_DAEMON,
        SonoBusDaemonStatus.CONNECTING,
        SonoBusDaemonStatus.RUNNING,
        SonoBusDaemonStatus.RECONNECTING,
        SonoBusDaemonStatus.DEGRADED,
        SonoBusDaemonStatus.SHUTDOWN,
    ):
        assert state in text, (
            f"SONOBUS_DAEMON.md must document the {state!r} supervisor "
            f"state — drift breaks the GUI tag-tone selector"
        )


@pytest.mark.parametrize(
    "command_type",
    [
        "hello",
        "ping",
        "create_source",
        "destroy_source",
        "create_sink",
        "destroy_sink",
        "metrics_query",
        "shutdown",
    ],
)
def test_doc_documents_each_uds_command(command_type: str) -> None:
    text = DOC.read_text()
    assert command_type in text, (
        f"SONOBUS_DAEMON.md must document the {command_type!r} UDS command"
    )


@pytest.mark.parametrize(
    "error_code",
    [
        "invalid_json",
        "invalid_frame",
        "unknown_command",
        "invalid_argument",
        "transport_unavailable",
        "stream_not_found",
        "handler_exception",
    ],
)
def test_doc_documents_each_error_code(error_code: str) -> None:
    text = DOC.read_text()
    assert error_code in text, (
        f"SONOBUS_DAEMON.md must document the {error_code!r} canonical "
        "error code — drift means the supervisor's match table breaks "
        "without the doc updating"
    )


def test_doc_documents_three_build_modes() -> None:
    """full / stub / disabled — each path must be discoverable."""
    text = DOC.read_text()
    for mode in ("full", "stub", "disabled"):
        assert mode in text


def test_doc_documents_compile_time_flags() -> None:
    text = DOC.read_text()
    for flag in (
        "MAP2_SONOBUS_HAS_AOO",
        "MAP2_SONOBUS_HAS_JACK",
        "MAP2_SONOBUS_HAS_LIBUV",
    ):
        assert flag in text, f"daemon doc must document the {flag} compile-time flag"


def test_doc_documents_canonical_uds_socket_path() -> None:
    text = DOC.read_text()
    assert "/run/map2/sonobus-transport.sock" in text


def test_doc_cross_references_companion_docs() -> None:
    text = DOC.read_text()
    for companion in (
        "SONOBUS_AOO_TRANSPORT.md",   # Q1-Q21 locked decisions
        "SONOBUS_BENCH_HANDOFF.md",   # bench operator runbook
    ):
        assert companion in text, (
            f"SONOBUS_DAEMON.md must cross-reference {companion}"
        )


def test_doc_documents_aoo_vendor_pull_command() -> None:
    """The bench operator's primary instruction — a stub→full flip is a
    single git clone + rebuild. This must be findable in the doc."""
    text = DOC.read_text()
    assert "git clone https://git.iem.at/cm/aoo" in text


def test_doc_lists_test_surface_files() -> None:
    """A future contributor scanning for the test surface should find
    every T2521-4 test file from the doc's cross-reference list."""
    text = DOC.read_text()
    for test_file in (
        "test_t2521_sonobus_daemon_build.py",
        "test_t2521_sonobus_daemon_protocol.py",
        "test_t2521_daemon_supervisor.py",
        "test_t2521_metrics_and_events.py",
    ):
        assert test_file in text, (
            f"SONOBUS_DAEMON.md must list {test_file} in its test-surface "
            "cross-reference"
        )
