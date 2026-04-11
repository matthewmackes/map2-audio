from __future__ import annotations

from types import SimpleNamespace

from app.services.frontend_degradation import (
    FrontendOnlyGracefulDegradation,
    get_frontend_degradation,
    initialize_frontend_degradation,
)


def test_initialize_frontend_degradation_resets_singleton_and_applies_remote_backend(monkeypatch):
    frontend_only_config = SimpleNamespace(
        mode=SimpleNamespace(value="frontend-only"),
        is_service_enabled=lambda _service: True,
        get_service_policy=lambda _service: None,
    )
    monkeypatch.setattr(
        "app.services.frontend_degradation.get_deployment_config",
        lambda: frontend_only_config,
    )

    FrontendOnlyGracefulDegradation.reset_instance()
    try:
        first = get_frontend_degradation()
        first.set_remote_backend("http://old-backend")

        initialize_frontend_degradation("http://new-backend")
        second = get_frontend_degradation()

        assert second is get_frontend_degradation()
        assert second is not first
        assert second.remote_backend_url == "http://new-backend"
    finally:
        FrontendOnlyGracefulDegradation.reset_instance()
