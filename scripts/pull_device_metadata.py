#!/usr/bin/env python3
"""Pull device metadata (product imagery, datasheets, manuals) into local cache.

Given a device profile YAML's ``metadata`` block, fetches each declared
URL with a bounded timeout and writes the bytes to the per-device cache
under ``/var/lib/map2/devices/<vendor>/<model>/``. Subsequent backend
boots serve the cached bytes through
``/api/devices/<pack_id>/<model>/asset/<filename>``.

Hard contract:

- Network unreachable → log + continue. Cache directory is created but
  empty; the GUI falls back to the DeviceProfilePanel's text-only
  rendering. **Backend boot must never fail because of this script.**
- Per-URL timeout: 15 s default.
- Cache writes are atomic via ``tempfile`` + ``os.replace``.

Run modes:

- As a CLI: ``python3 scripts/pull_device_metadata.py``
  (walks every pack, fetches every metadata URL).
- As a library: ``from scripts.pull_device_metadata import enrich_pack``
  (the backend invokes this on demand from
  ``app.services.controllers.metadata_enrichment``).

Worklist: T2459-C3.
Architecture: docs/architecture/CONTROLLER_LAYER.md §4.
"""

from __future__ import annotations

import argparse
import dataclasses
import logging
import os
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Iterable
from urllib.parse import urlsplit

import yaml

logger = logging.getLogger("pull_device_metadata")

DEFAULT_CACHE_ROOT = Path("/var/lib/map2/devices")
DEFAULT_TIMEOUT_SECONDS = 15.0
DEFAULT_USER_AGENT = "MAP2-Audio-Platform/1.0 (T2459-C3 metadata enrichment)"


@dataclasses.dataclass(frozen=True)
class FetchOutcome:
    """Result of a single URL fetch attempt."""

    url: str
    cached_path: Path | None
    ok: bool
    reason: str | None


def _safe_filename_from_url(url: str, fallback_kind: str) -> str:
    """Generate a stable filename from a URL.

    Strips path components, keeps the leaf, falls back to a fixed name
    based on ``fallback_kind`` (``image_<n>``, ``datasheet``, ``manual``).
    """
    parts = urlsplit(url)
    leaf = Path(parts.path).name
    if leaf and "." in leaf:
        # Drop any query string from the extension (e.g., '.jpg?x=y' →
        # '.jpg' isn't a thing here, but be defensive).
        return leaf
    return fallback_kind


def _fetch_one(
    url: str,
    dest_dir: Path,
    fallback_kind: str,
    timeout_seconds: float,
    user_agent: str,
) -> FetchOutcome:
    """Fetch one URL into ``dest_dir``. Returns a FetchOutcome with
    ``ok=False`` on any failure — never raises.
    """
    filename = _safe_filename_from_url(url, fallback_kind)
    target = dest_dir / filename
    tmp_fd: int | None = None
    tmp_path: Path | None = None

    request = urllib.request.Request(url, headers={"User-Agent": user_agent})
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            tmp_fd, tmp_path_str = tempfile.mkstemp(prefix=".pull_", dir=dest_dir)
            tmp_path = Path(tmp_path_str)
            try:
                with os.fdopen(tmp_fd, "wb") as f:
                    tmp_fd = None  # ownership transferred
                    while True:
                        chunk = response.read(64 * 1024)
                        if not chunk:
                            break
                        f.write(chunk)
            finally:
                if tmp_fd is not None:
                    os.close(tmp_fd)
        os.replace(tmp_path, target)
        tmp_path = None
        logger.info("Fetched %s → %s", url, target)
        return FetchOutcome(url=url, cached_path=target, ok=True, reason=None)
    except (urllib.error.URLError, OSError, TimeoutError) as exc:
        logger.warning("Failed to fetch %s: %s", url, exc)
        if tmp_path is not None and tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass
        return FetchOutcome(url=url, cached_path=None, ok=False, reason=str(exc))


def enrich_pack(
    pack_dir: Path,
    cache_root: Path = DEFAULT_CACHE_ROOT,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    user_agent: str = DEFAULT_USER_AGENT,
) -> dict[str, list[FetchOutcome]]:
    """Walk one pack's audio profiles and pull each model's metadata.

    Returns a dict keyed by ``"<pack_id>/<model>"`` with the list of
    fetch outcomes. Failures are recorded as ``FetchOutcome(ok=False)``;
    the function never raises for network failures.
    """
    out: dict[str, list[FetchOutcome]] = {}

    manifest_path = pack_dir / "pack.yaml"
    if not manifest_path.exists():
        return out

    try:
        manifest = yaml.safe_load(manifest_path.read_text())
    except yaml.YAMLError as exc:
        logger.warning("pack %s: invalid pack.yaml: %s", pack_dir.name, exc)
        return out

    pack_id = manifest.get("pack_id") or pack_dir.name

    profiles_dir = pack_dir / "profiles"
    if not profiles_dir.is_dir():
        return out

    for profile_path in sorted(profiles_dir.glob("*.audio.yaml")):
        try:
            doc = yaml.safe_load(profile_path.read_text())
        except yaml.YAMLError as exc:
            logger.warning(
                "profile %s: invalid YAML: %s", profile_path, exc,
            )
            continue

        identity = doc.get("identity", {}) or {}
        model = (
            identity.get("model")
            or profile_path.stem.removesuffix(".audio")
        )
        # Stable model id used in URLs and the cache path.
        model_id = str(model).lower().replace(" ", "-")

        metadata = doc.get("metadata", {}) or {}
        urls: list[tuple[str, str]] = []
        for idx, image_url in enumerate(metadata.get("product_image_urls", []) or []):
            urls.append((str(image_url), f"image_{idx}"))
        if metadata.get("datasheet_url"):
            urls.append((str(metadata["datasheet_url"]), "datasheet.pdf"))
        if metadata.get("manual_url"):
            urls.append((str(metadata["manual_url"]), "manual.html"))

        if not urls:
            continue

        dest_dir = cache_root / pack_id / model_id
        dest_dir.mkdir(parents=True, exist_ok=True)

        outcomes: list[FetchOutcome] = []
        for url, fallback in urls:
            outcomes.append(
                _fetch_one(url, dest_dir, fallback, timeout_seconds, user_agent)
            )
        out[f"{pack_id}/{model_id}"] = outcomes

    return out


def enrich_all(
    packs_root: Path,
    cache_root: Path = DEFAULT_CACHE_ROOT,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    user_agent: str = DEFAULT_USER_AGENT,
) -> dict[str, list[FetchOutcome]]:
    """Walk every vendor pack under ``packs_root`` and enrich each."""
    out: dict[str, list[FetchOutcome]] = {}
    if not packs_root.is_dir():
        logger.warning("Packs root %s does not exist", packs_root)
        return out

    for child in sorted(packs_root.iterdir()):
        if not child.is_dir() or child.name.startswith("_"):
            continue
        result = enrich_pack(child, cache_root=cache_root,
                              timeout_seconds=timeout_seconds,
                              user_agent=user_agent)
        out.update(result)
    return out


def list_cached_assets(
    pack_id: str, model: str, cache_root: Path = DEFAULT_CACHE_ROOT,
) -> list[Path]:
    """Return every cached asset file for the given pack/model."""
    dest = cache_root / pack_id / model
    if not dest.is_dir():
        return []
    return sorted(p for p in dest.iterdir() if p.is_file())


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--packs-root",
        default=str(Path(__file__).resolve().parents[1] / "device-packs"),
        help="Path to device-packs/ tree (default: repo's).",
    )
    parser.add_argument(
        "--cache-root",
        default=str(DEFAULT_CACHE_ROOT),
        help="Path to per-device cache root (default: /var/lib/map2/devices).",
    )
    parser.add_argument(
        "--timeout-seconds", type=float, default=DEFAULT_TIMEOUT_SECONDS,
    )
    parser.add_argument(
        "--user-agent", default=DEFAULT_USER_AGENT,
    )
    parser.add_argument(
        "--pack-id",
        help="If set, enrich only this pack (e.g. 'edirol-ua').",
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    packs_root = Path(args.packs_root)
    cache_root = Path(args.cache_root)

    if args.pack_id:
        pack_dir = packs_root / args.pack_id
        results = enrich_pack(pack_dir, cache_root=cache_root,
                              timeout_seconds=args.timeout_seconds,
                              user_agent=args.user_agent)
    else:
        results = enrich_all(packs_root, cache_root=cache_root,
                             timeout_seconds=args.timeout_seconds,
                             user_agent=args.user_agent)

    total_attempts = sum(len(v) for v in results.values())
    successes = sum(1 for outcomes in results.values() for o in outcomes if o.ok)
    logger.info(
        "Metadata enrichment complete: %d models, %d/%d URLs cached.",
        len(results), successes, total_attempts,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
