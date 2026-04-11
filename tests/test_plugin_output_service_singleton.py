from __future__ import annotations

from app.services.plugin_output_service import get_output_service, reset_output_service


def test_plugin_output_service_singleton_reset() -> None:
    reset_output_service()
    first = get_output_service()
    second = get_output_service()
    assert first is second

    reset_output_service()
    replacement = get_output_service()
    assert replacement is not first
