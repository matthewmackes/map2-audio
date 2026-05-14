"""Pivot-13d cycle 2 — api-contract-standards.md presence tests for the
device peak-meters surface.

Locks in the route table + JSON shapes documented in the contract so
future edits can't accidentally remove the entries.
"""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def _text() -> str:
    return (REPO_ROOT / "docs" / "api-contract-standards.md").read_text()


def test_section_present():
    text = _text()
    assert "## Example: device peak-meters" in text


def test_lists_canonical_endpoints():
    text = _text()
    for endpoint in (
        "/api/v1/devices/{device_id}/peak-meters",
        "/api/v1/devices/peak-meters/registry",
        "/api/v1/devices/peak-meters/stream",
    ):
        assert endpoint in text, f"missing endpoint: {endpoint}"


def test_documents_include_snapshot_query():
    text = _text()
    assert "include_snapshot=true" in text


def test_documents_device_ids_filter():
    text = _text()
    assert "device_ids=a,b,c" in text or "device_ids=" in text


def test_documents_source_field_states():
    """All three source values reachable through the registry are
    documented so consumers can render distinct tags."""
    text = _text()
    assert '`"engine"`' in text
    assert '`"engine_unavailable"`' in text
    assert '`"placeholder"`' in text


def test_documents_captured_at_semantics():
    text = _text()
    assert "captured_at" in text
    assert "unix timestamp" in text


def test_documents_ws_frame_envelope():
    text = _text()
    assert "device_peak_meters:registry" in text
    assert "schema_version" in text


def test_documents_custom_error_code():
    text = _text()
    assert "device_not_registered" in text


def test_documents_broadcast_floor():
    text = _text()
    assert "WS_BROADCAST_INTERVAL_SECONDS" in text
    assert "30 fps" in text
