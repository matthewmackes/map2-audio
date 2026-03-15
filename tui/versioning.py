"""Version helpers for the unified MAP2 Textual console."""

from __future__ import annotations

from app.utils.platform_version import get_platform_product_name, get_platform_version


def get_product_name() -> str:
    """Return the configured product name."""

    return get_platform_product_name()


def get_version() -> str:
    """Return the canonical platform version."""

    return get_platform_version()
