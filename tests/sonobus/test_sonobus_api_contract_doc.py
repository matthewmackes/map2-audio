"""T2521 — API contract documentation presence tests.

Locks in the api-contract-standards.md surface row for /api/sonobus/*
so future edits can't accidentally remove the SonoBus contract block.
"""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def _text() -> str:
    return (REPO_ROOT / "docs" / "api-contract-standards.md").read_text()


def test_sonobus_section_present():
    text = _text()
    assert "## Example: sonobus" in text


def test_lists_canonical_endpoints():
    text = _text()
    for endpoint in (
        "/api/sonobus/status",
        "/api/sonobus/bindings",
        "/api/sonobus/bindings/matrix",
        "/api/sonobus/cluster/bindings/matrix",
        "/api/sonobus/peers",
        "/api/sonobus/groups",
        "/api/sonobus/sessions",
        "/api/sonobus/profiles",
        "/api/sonobus/events",
    ):
        assert endpoint in text, f"missing endpoint in api-contract-standards.md: {endpoint}"


def test_lists_custom_error_codes():
    text = _text()
    for code in (
        "sonobus.daemon_unreachable",
        "sonobus.peer_capability_unsupported",
        "sonobus.binding_conflict",
        "sonobus.transport_disabled_for_recorder",
    ):
        assert code in text, f"missing error code: {code}"


def test_documents_ws_frame_shape():
    text = _text()
    assert "schema_version" in text
    assert "sonobus:state" in text
    assert "sonobus:heartbeat" in text or "sonobus:state" in text
