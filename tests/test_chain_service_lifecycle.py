from __future__ import annotations

import threading

from app.services.chain_service import ChainService


def test_chain_service_uses_app_scoped_command_queue(monkeypatch):
    sentinel_queue = object()
    monkeypatch.setattr("app.services.chain_service.get_command_queue", lambda: sentinel_queue)
    ChainService._cache_initialized = True

    service = ChainService(None)

    assert service.command_queue is sentinel_queue


def test_chain_service_plugin_cache_init_and_invalidate_are_lock_safe(monkeypatch):
    class _Loader:
        plugins = {
            "urn:test:a": {"name": "A", "author": "x", "category": "fx", "audio_inputs": 1, "audio_outputs": 1},
            "urn:test:b": {"name": "B", "author": "y", "category": "fx", "audio_inputs": 2, "audio_outputs": 2},
        }

    monkeypatch.setattr("app.services.chain_service.get_plugin_loader", lambda: _Loader())
    ChainService.invalidate_cache()

    services: list[ChainService] = []

    def _build_service() -> None:
        services.append(ChainService(None))

    threads = [threading.Thread(target=_build_service) for _ in range(4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=1.0)

    assert ChainService._cache_initialized is True
    assert ChainService._plugin_meta_cache["urn:test:a"]["name"] == "A"

    def _invalidate() -> None:
        ChainService.invalidate_cache()

    invalidate_threads = [threading.Thread(target=_invalidate) for _ in range(4)]
    for thread in invalidate_threads:
        thread.start()
    for thread in invalidate_threads:
        thread.join(timeout=1.0)

    assert ChainService._cache_initialized is False
    assert ChainService._plugin_meta_cache == {}
