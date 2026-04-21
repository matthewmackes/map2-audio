"""Branding service — single source of truth for platform branding.

Loads ``branding/brand.manifest.json`` from the repo root and layers any
user overrides from ``~/.map2/brand.manifest.override.json`` on top. The
merged manifest is what the web UI, OS template renderers, and backend
routes read from.

Design choices:

* The repo-shipped manifest stays read-only — edits go to the override
  file so an RPM/git refresh does not clobber user customization.
* Shallow merge per top-level section (``palette``, ``copy``, ``assets``)
  so partial overrides are safe.
* Cached in-memory; ``reload()`` clears the cache after disk changes.
"""
from __future__ import annotations

import json
import logging
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_MANIFEST_PATH = REPO_ROOT / "branding" / "brand.manifest.json"
DEFAULT_OVERRIDE_PATH = Path.home() / ".map2" / "brand.manifest.override.json"

_MERGE_SECTIONS = ("assets", "palette", "copy")
_lock = threading.Lock()


@dataclass
class BrandingPaths:
    manifest: Path = DEFAULT_MANIFEST_PATH
    override: Path = DEFAULT_OVERRIDE_PATH


class BrandingService:
    """Manifest loader + override layer. Thread-safe, process-local cache."""

    def __init__(self, paths: BrandingPaths | None = None) -> None:
        self._paths = paths or BrandingPaths()
        self._cache: dict[str, Any] | None = None

    @property
    def paths(self) -> BrandingPaths:
        return self._paths

    def _load_disk_manifest(self) -> dict[str, Any]:
        try:
            return json.loads(self._paths.manifest.read_text(encoding="utf-8"))
        except FileNotFoundError:
            logger.warning("Brand manifest missing at %s — using minimal fallback", self._paths.manifest)
            return {
                "schemaVersion": 1,
                "id": "mackes-audio-platform",
                "productName": "Mackes Audio Platform",
                "shortName": "MAP",
                "tagline": "MACKES AUDIO PLATFORM",
                "vendor": "Mackes",
                "assets": {},
                "palette": {"primary": "#4DA6FF", "background": "#000000"},
                "copy": {},
            }
        except json.JSONDecodeError as exc:
            logger.error("Brand manifest is not valid JSON: %s", exc)
            raise

    def _load_override(self) -> dict[str, Any]:
        if not self._paths.override.exists():
            return {}
        try:
            return json.loads(self._paths.override.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            logger.warning("Brand override is not valid JSON (%s): %s — ignoring", self._paths.override, exc)
            return {}

    def _merge(self, base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
        merged: dict[str, Any] = dict(base)
        for key, value in override.items():
            if key in _MERGE_SECTIONS and isinstance(value, dict) and isinstance(base.get(key), dict):
                merged[key] = {**base[key], **value}
            else:
                merged[key] = value
        return merged

    def get(self) -> dict[str, Any]:
        with _lock:
            if self._cache is None:
                self._cache = self._merge(self._load_disk_manifest(), self._load_override())
            return dict(self._cache)

    def reload(self) -> dict[str, Any]:
        with _lock:
            self._cache = None
        return self.get()

    def update(self, patch: dict[str, Any]) -> dict[str, Any]:
        """Merge ``patch`` into the override file and return the new merged manifest.

        Only runtime-safe keys at the top level + inside ``palette`` / ``copy`` /
        ``assets`` are persisted. ``schemaVersion`` and ``id`` are immutable.
        """
        _IMMUTABLE = {"schemaVersion", "id"}
        filtered = {k: v for k, v in patch.items() if k not in _IMMUTABLE}
        with _lock:
            current_override = self._load_override()
            new_override = self._merge(current_override, filtered)
            self._paths.override.parent.mkdir(parents=True, exist_ok=True)
            self._paths.override.write_text(
                json.dumps(new_override, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
            self._cache = None
        return self.get()

    def reset(self) -> dict[str, Any]:
        """Delete the override file, reverting to the on-disk manifest."""
        with _lock:
            if self._paths.override.exists():
                self._paths.override.unlink()
            self._cache = None
        return self.get()


_singleton: BrandingService | None = None


def get_branding_service() -> BrandingService:
    global _singleton
    if _singleton is None:
        _singleton = BrandingService()
    return _singleton
