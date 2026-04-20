"""
Shared helpers for resolving legacy JUCE plugin instance ids.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from typing import Any

LegacyInstanceIdResolver = Callable[..., Any]


def get_legacy_instance_id_resolver(engine: Any) -> LegacyInstanceIdResolver | None:
    resolver = getattr(engine, "_get_instance_id_for_uri", None)
    return resolver if callable(resolver) else None


async def call_legacy_instance_id_resolver(
    resolver: LegacyInstanceIdResolver | None,
    plugin_uri: str,
    plugin_position: int | None = None,
) -> int | None:
    if not callable(resolver):
        return None

    try:
        if isinstance(plugin_position, int) and plugin_position >= 0:
            try:
                resolved = await asyncio.to_thread(resolver, plugin_uri, plugin_position)
            except TypeError:
                resolved = await asyncio.to_thread(resolver, plugin_uri)
        else:
            resolved = await asyncio.to_thread(resolver, plugin_uri)
    except Exception:
        return None

    return resolved if isinstance(resolved, int) and resolved > 0 else None


async def resolve_legacy_instance_id(
    engine: Any,
    plugin_uri: str,
    plugin_position: int | None = None,
) -> int | None:
    return await call_legacy_instance_id_resolver(
        get_legacy_instance_id_resolver(engine),
        plugin_uri,
        plugin_position,
    )
