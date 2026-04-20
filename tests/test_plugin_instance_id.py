import asyncio

from app.services.plugin_instance_id import (
    call_legacy_instance_id_resolver,
    get_legacy_instance_id_resolver,
    resolve_legacy_instance_id,
)


class _PositionAwareEngine:
    def __init__(self) -> None:
        self.calls: list[tuple[str, int | None]] = []

    def _get_instance_id_for_uri(self, plugin_uri: str, plugin_position: int | None = None) -> int | None:
        self.calls.append((plugin_uri, plugin_position))
        if plugin_position == 2:
            return 42
        return None


class _UriOnlyResolver:
    def __init__(self) -> None:
        self.calls: list[tuple[object, ...]] = []

    def __call__(self, *args: object) -> int:
        self.calls.append(args)
        if len(args) == 2:
            raise TypeError("uri-only resolver")
        return 77


def test_get_legacy_instance_id_resolver_returns_private_engine_resolver() -> None:
    engine = _PositionAwareEngine()

    assert get_legacy_instance_id_resolver(engine) == engine._get_instance_id_for_uri
    assert get_legacy_instance_id_resolver(object()) is None


def test_resolve_legacy_instance_id_prefers_positioned_lookup() -> None:
    engine = _PositionAwareEngine()

    resolved = asyncio.run(resolve_legacy_instance_id(engine, "urn:test:plugin", plugin_position=2))

    assert resolved == 42
    assert engine.calls == [("urn:test:plugin", 2)]


def test_call_legacy_instance_id_resolver_falls_back_to_uri_only_after_type_error() -> None:
    resolver = _UriOnlyResolver()

    resolved = asyncio.run(call_legacy_instance_id_resolver(resolver, "urn:test:plugin", plugin_position=4))

    assert resolved == 77
    assert resolver.calls == [("urn:test:plugin", 4), ("urn:test:plugin",)]


def test_call_legacy_instance_id_resolver_rejects_invalid_results_and_missing_resolvers() -> None:
    assert asyncio.run(call_legacy_instance_id_resolver(lambda _uri: 0, "urn:test:plugin")) is None
    assert asyncio.run(call_legacy_instance_id_resolver(None, "urn:test:plugin")) is None
