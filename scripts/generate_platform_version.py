#!/usr/bin/env python3
"""Generate and persist the canonical MAP2 platform build version."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app.utils.platform_version import (  # noqa: E402
    DEFAULT_API_VERSION,
    DEFAULT_CHANNEL_CODE,
    DEFAULT_PRODUCT,
    DEFAULT_VERSION_SOURCE,
    DEFAULT_VERSION,
    generate_platform_version,
    load_platform_version,
    write_platform_version,
)


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate a digits-only MAP2 platform version from local date, time, and beta code.",
    )
    parser.add_argument(
        "--product",
        default="",
        help=f"Override product name (default: current version.json product or {DEFAULT_PRODUCT!r}).",
    )
    parser.add_argument(
        "--channel-code",
        default="",
        help=f"Override the numeric beta/build channel suffix (default: {DEFAULT_CHANNEL_CODE}).",
    )
    parser.add_argument(
        "--api-version",
        default="",
        help=f"Override the API version field stored in version.json (default: {DEFAULT_API_VERSION}).",
    )
    parser.add_argument(
        "--version-source",
        default=DEFAULT_VERSION_SOURCE,
        help=f"Override the version_source metadata field (default: {DEFAULT_VERSION_SOURCE!r}).",
    )
    return parser


def main() -> int:
    parser = build_arg_parser()
    args = parser.parse_args()

    current = load_platform_version()
    product = args.product or current.product or DEFAULT_PRODUCT
    channel_code = args.channel_code or current.build_channel or DEFAULT_CHANNEL_CODE
    api_version = args.api_version or current.api_version or DEFAULT_API_VERSION
    version_source = args.version_source or DEFAULT_VERSION_SOURCE
    normalized_channel_code = channel_code[-2:].zfill(2)

    if (
        current.version != DEFAULT_VERSION
        and not current.dirty
        and current.product == product
        and current.build_channel == normalized_channel_code
        and current.api_version == api_version
        and current.version_source == version_source
    ):
        info = current
    else:
        info = generate_platform_version(
            product=product,
            channel_code=channel_code,
            api_version=api_version,
            version_source=version_source,
        )
    write_platform_version(info, include_runtime_state=False)
    print(info.version)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
