"""
T2492-1 — Device-pack writer.

Validates a synthesized manifest + XML + JS and writes them to disk
under `device-packs/<vendor>/<model>/`. Returns the canonical
profile_key for the new pack.

Reload of the live ProfileRegistry is best-effort — if the registry
hot-reload plumbing isn't wired (T2459-G) we still report the path so
the operator knows where the pack landed.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from .lookup import REPO_ROOT
from .synthesis import _slug

logger = logging.getLogger(__name__)

DEVICE_PACKS_DIR = REPO_ROOT / "device-packs"


class PackWriteError(Exception):
    """Raised when commit-to-disk fails for a recoverable reason."""


@dataclass
class PackWriteResult:
    profile_key: str
    pack_dir: str
    manifest_path: str
    mapping_path: str
    scripts_path: str


_VENDOR_RESERVED = {
    "_mixx-imports",
    "_lookup-index",
    "_runtime",
    "_tests",
    "common",
    "shared",
}


def _validate_directory_name(name: str, kind: str) -> str:
    slug = _slug(name)
    if not slug or slug in _VENDOR_RESERVED:
        raise PackWriteError(f"Invalid {kind} directory name: {name!r}")
    if not re.fullmatch(r"[a-z0-9][a-z0-9._-]*", slug):
        raise PackWriteError(f"Invalid {kind} slug after normalization: {slug!r}")
    return slug


def _validate_yaml(content: str) -> None:
    if not content.strip():
        raise PackWriteError("Manifest YAML is empty")
    if "schemaVersion:" not in content:
        raise PackWriteError("Manifest YAML missing schemaVersion field")


def _validate_xml(content: str) -> None:
    if not content.strip():
        raise PackWriteError("Mapping XML is empty")
    head = content.lstrip()[:100]
    if not (head.startswith("<?xml") or head.startswith("<")):
        raise PackWriteError("Mapping XML does not look like XML")


class PackWriter:
    """Commits a synthesized pack to disk."""

    def __init__(self, packs_dir: Path = DEVICE_PACKS_DIR) -> None:
        self._packs_dir = packs_dir

    def commit(
        self,
        *,
        vendor: str,
        model: str,
        manifest_yaml: str,
        mapping_xml: str,
        scripts_js: str,
        overwrite: bool = False,
    ) -> PackWriteResult:
        vendor_slug = _validate_directory_name(vendor, "vendor")
        model_slug = _validate_directory_name(model, "model")
        _validate_yaml(manifest_yaml)
        _validate_xml(mapping_xml)
        # scripts_js is allowed to be empty for devices with no JS.

        pack_dir = self._packs_dir / vendor_slug / model_slug
        manifest_path = pack_dir / ".MAP2.yaml"
        mapping_path = pack_dir / "mapping.xml"
        scripts_path = pack_dir / "scripts.js"

        if not overwrite and manifest_path.exists():
            raise PackWriteError(
                f"Pack already exists at {pack_dir}; pass overwrite=true to replace"
            )

        pack_dir.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(manifest_yaml, encoding="utf-8")
        mapping_path.write_text(mapping_xml, encoding="utf-8")
        if scripts_js.strip():
            scripts_path.write_text(scripts_js, encoding="utf-8")

        profile_key = f"{vendor_slug}-{model_slug}"
        self._reload_registry_best_effort(profile_key)

        # Report repo-relative paths for the operator-visible response,
        # but fall through to absolute paths when the writer is rooted
        # outside the repo (test scenarios with tmpdirs).
        def _rel(path: Path) -> str:
            try:
                return str(path.relative_to(REPO_ROOT))
            except ValueError:
                return str(path)

        return PackWriteResult(
            profile_key=profile_key,
            pack_dir=_rel(pack_dir),
            manifest_path=_rel(manifest_path),
            mapping_path=_rel(mapping_path),
            scripts_path=_rel(scripts_path),
        )

    def _reload_registry_best_effort(self, profile_key: str) -> None:
        """Best-effort hot-reload; never block the commit on it."""
        try:
            from app.services.midi_hub.device_registry import (  # type: ignore
                get_midi_device_registry,
            )

            registry = get_midi_device_registry()
            reload_fn = getattr(registry, "reload_pack", None) or getattr(
                registry, "reload_packs", None
            )
            if callable(reload_fn):
                try:
                    reload_fn(profile_key)
                except TypeError:
                    reload_fn()
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "ProfileRegistry hot-reload skipped after writing pack %s: %s",
                profile_key,
                exc,
            )
