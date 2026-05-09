"""Reusable YAML-backed ``OverrideStore`` implementation.

Generalizes the pattern shipped in
``app.services.devices.meloaudio.commander_discovery``: per-host
overrides live under ``~/.map2/devices/<pack_id>-<slug>.yaml`` and are
written atomically. Each store instance owns one file path; one
device-pack can hold multiple stores (e.g. one per onboarding flow)
by giving each its own ``slug``.
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any, Mapping, Optional

import yaml


DEFAULT_DEVICES_DIR = Path("~/.map2/devices").expanduser()


class OverrideSchemaError(ValueError):
    """Raised when a YAML override file does not match the expected schema."""


class YamlOverrideStore:
    """Atomic YAML override file with schema validation.

    Args:
        pack_id: Device-pack identifier (e.g. ``"meloaudio"``). Used
            both as a filename component and as a payload validation
            field — load() raises if the file's ``device`` does not
            match.
        slug: Optional sub-identifier when one pack has multiple
            override files (e.g. ``"midi-commander-discovered"``).
            Defaults to ``"override"``.
        schema_version: Integer schema version this store accepts.
            ``load()`` raises ``OverrideSchemaError`` on mismatch.
        directory: Override the default ``~/.map2/devices`` location.
            Useful for tests.
    """

    def __init__(
        self,
        *,
        pack_id: str,
        slug: str = "override",
        schema_version: int = 1,
        directory: Optional[Path] = None,
    ) -> None:
        if not pack_id or not pack_id.strip():
            raise ValueError("pack_id must be a non-empty string")
        self._pack_id = pack_id
        self._slug = slug
        self._schema_version = schema_version
        self._directory = directory or DEFAULT_DEVICES_DIR

    # --- public API -----------------------------------------------------

    def path(self) -> str:
        return str(self._file_path())

    def load(self) -> Optional[Mapping[str, Any]]:
        file_path = self._file_path()
        if not file_path.exists():
            return None
        with file_path.open("r", encoding="utf-8") as handle:
            payload = yaml.safe_load(handle)
        if payload is None:
            return None
        if not isinstance(payload, dict):
            raise OverrideSchemaError(
                f"Override at {file_path} must be a mapping, got {type(payload).__name__}",
            )
        self._validate(payload, source=str(file_path))
        return payload

    def save(self, payload: Mapping[str, Any]) -> str:
        merged = dict(payload)
        merged.setdefault("schema_version", self._schema_version)
        merged.setdefault("device", self._pack_id)
        self._validate(merged, source="save()")
        file_path = self._file_path()
        file_path.parent.mkdir(parents=True, exist_ok=True)
        # Atomic write: temp file + os.replace.
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=str(file_path.parent),
            prefix=f".{file_path.name}.",
            suffix=".tmp",
            delete=False,
        ) as tmp:
            yaml.safe_dump(merged, tmp, sort_keys=True)
            tmp_path = Path(tmp.name)
        os.replace(tmp_path, file_path)
        return str(file_path)

    def delete(self) -> bool:
        file_path = self._file_path()
        if not file_path.exists():
            return False
        file_path.unlink()
        return True

    # --- internals ------------------------------------------------------

    def _file_path(self) -> Path:
        filename = f"{self._pack_id}-{self._slug}.yaml"
        return self._directory / filename

    def _validate(self, payload: Mapping[str, Any], *, source: str) -> None:
        version = payload.get("schema_version")
        if version != self._schema_version:
            raise OverrideSchemaError(
                f"Override {source}: expected schema_version="
                f"{self._schema_version}, got {version!r}",
            )
        device = payload.get("device")
        if device != self._pack_id:
            raise OverrideSchemaError(
                f"Override {source}: expected device={self._pack_id!r}, got {device!r}",
            )
