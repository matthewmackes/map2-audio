"""
T2492-1 — Device-pack writer.

Validates a synthesized manifest + XML + JS and writes them to a
runtime state directory under `<runtime_state>/device-packs/<vendor>/<model>/`.
Returns the canonical profile_key for the new pack.

**T2492-1a fix (2026-05-02): default target moved out of the repo.**
Operator-generated packs land in the runtime state directory, NOT the
in-tree `device-packs/` mirror. Per CLAUDE.md's Configuration Authority
Model: `/var/lib/map2/` is for durable service-managed state; the
in-tree `device-packs/` is for vendor-curated profiles authored
through git. Mixing them caused production deployments (read-only
repo mount) to 500-error on commit.

Target-directory resolution order:
  1. `MAP2_DEVICE_PACKS_RUNTIME_DIR` env var (test/operator override).
  2. `/var/lib/map2/device-packs/` if writable.
  3. `~/.map2/device-packs/` as the user-state fallback.

The runtime ProfileRegistry should load packs from BOTH the in-tree
mirror (read-only vendor catalog) AND the operator-state dir
(auto-generated). Wiring the registry to read both is queued as
T2492-2.

Reload of the live ProfileRegistry is best-effort — if the registry
hot-reload plumbing isn't wired we still report the path so the
operator knows where the pack landed.
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from .lookup import REPO_ROOT
from .synthesis import _slug

logger = logging.getLogger(__name__)

# Legacy in-tree dir kept for read access (the existing 144-mapping
# Mixxx mirror lives there). Writes go to the runtime state dir.
DEVICE_PACKS_DIR = REPO_ROOT / "device-packs"

VAR_LIB_TARGET = Path("/var/lib/map2/device-packs")
HOME_FALLBACK_TARGET = Path.home() / ".map2" / "device-packs"


def _resolve_runtime_packs_dir() -> Path:
    """
    Pick the writable target directory for operator-generated packs.

    Order:
      1. `MAP2_DEVICE_PACKS_RUNTIME_DIR` env var (explicit override; used
         by tests + advanced operators).
      2. `/var/lib/map2/device-packs/` when writable.
      3. `~/.map2/device-packs/` as the user-state fallback. Always
         creatable from the backend's process user.
    """
    override = os.environ.get("MAP2_DEVICE_PACKS_RUNTIME_DIR")
    if override:
        return Path(override).expanduser().resolve()
    # /var/lib/map2 is writable when the systemd unit grants it (or in
    # development on a workstation). os.access uses real-uid checks
    # which is what we want here.
    if VAR_LIB_TARGET.exists() and os.access(VAR_LIB_TARGET, os.W_OK):
        return VAR_LIB_TARGET
    parent = VAR_LIB_TARGET.parent
    if parent.exists() and os.access(parent, os.W_OK):
        return VAR_LIB_TARGET
    return HOME_FALLBACK_TARGET


# Resolved at import-time so tests + production share one path. Re-
# resolved on each PackWriter() if the env var changes between calls.
DEFAULT_RUNTIME_PACKS_DIR = _resolve_runtime_packs_dir()


class PackWriteError(Exception):
    """Raised when commit-to-disk fails for a recoverable reason."""


@dataclass
class PackWriteResult:
    profile_key: str
    pack_dir: str
    manifest_path: str
    mapping_path: str
    scripts_path: str
    # T2492-1a: surface which target directory was used so the operator
    # can see whether the pack landed in /var/lib/map2/, ~/.map2/, or
    # an explicit override.
    runtime_packs_dir: str


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


def _enforce_provenance(content: str) -> str:
    """T2492-4: every auto-generator pack must declare the
    provenance fields under `runtime_extra`. Operators can edit the
    manifest in step 3 of the wizard before commit, but can't silently
    strip the provenance trail — the writer re-asserts the minimum
    audit fields and raises if `created_via` was wiped.

    The MUST-have field is `created_via: auto-generator`. We do not
    impose a strict YAML parser here (the manifest is operator-edit
    text); the gate is a substring assertion that survives the
    canonical formats produced by the synthesizer.
    """
    if "created_via:" not in content:
        raise PackWriteError(
            "Manifest YAML missing runtime_extra.created_via field "
            "(provenance trail required for auto-generator packs)"
        )
    if "auto-generator" not in content:
        raise PackWriteError(
            "Manifest YAML must declare runtime_extra.created_via "
            "as 'auto-generator' for auto-generator packs"
        )
    return content


def _validate_xml(content: str) -> None:
    if not content.strip():
        raise PackWriteError("Mapping XML is empty")
    head = content.lstrip()[:100]
    if not (head.startswith("<?xml") or head.startswith("<")):
        raise PackWriteError("Mapping XML does not look like XML")


class PackWriter:
    """Commits a synthesized pack to disk.

    Default target is the runtime state directory (resolved per the
    docstring at module top), NOT the in-tree `device-packs/` mirror.
    Tests + advanced operators can pass `packs_dir=` to override.
    """

    def __init__(self, packs_dir: Optional[Path] = None) -> None:
        self._packs_dir = packs_dir if packs_dir is not None else _resolve_runtime_packs_dir()

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
        _enforce_provenance(manifest_yaml)
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

        # T2492-1a: translate OSError into PackWriteError so the route
        # can return a clean 400 with operator-actionable detail
        # instead of bubbling a 500 + raw kernel errno.
        try:
            pack_dir.mkdir(parents=True, exist_ok=True)
            manifest_path.write_text(manifest_yaml, encoding="utf-8")
            mapping_path.write_text(mapping_xml, encoding="utf-8")
            if scripts_js.strip():
                scripts_path.write_text(scripts_js, encoding="utf-8")
        except OSError as exc:
            # Common cases: read-only file system (production
            # backend mounted r/o on /home/mm/map2-audio), permission
            # denied (process user lacks /var/lib/map2 write), no
            # space left, etc.
            raise PackWriteError(
                f"Failed to write pack to {pack_dir}: {exc.strerror or exc}. "
                f"Set MAP2_DEVICE_PACKS_RUNTIME_DIR or grant write access "
                f"to {self._packs_dir}."
            ) from exc

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
            runtime_packs_dir=str(self._packs_dir),
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
