"""Bindings writer + Undo store.

T2459-G7. Owns the write path for MIDI / HID profile bindings:

  - ``write_bindings(profile, payload)`` validates the new
    ``controls`` / ``outputs`` against the profile's schema, swaps the
    YAML on disk via atomic rename, and returns a
    :class:`WriteResult` carrying the new revision id + an undo token.

  - The undo store keeps the previous YAML body keyed by undo_token
    for 60 s; ``apply_undo(token)`` swaps the file back, returning a
    fresh revision so a subsequent state-of-the-world fetch matches.

  - ``notify_reload(profile)`` calls into the controller-host
    supervisor so the running map2-controller-host re-reads the file
    without a process restart. The supervisor IPC isn't shipped in
    this subtask — for now we log + invalidate the registry's cached
    profile so the next read picks up the new contents.

Schema validation reuses the registry's loaded jsonschema documents
so we don't drift from `_schema/*.schema.yaml` definitions.

Worklist: ``T2459-G7``.
"""

from __future__ import annotations

import dataclasses
import logging
import os
import secrets
import threading
import time
import uuid
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

UNDO_TTL_S = 60.0


class BindingsWriteError(Exception):
    """Raised when a bindings write fails (validation, IO, or unknown
    profile). Maps to a 4xx HTTP response in the route layer.
    """


@dataclasses.dataclass(frozen=True)
class WriteResult:
    revision: str
    undo_token: str
    profile_key: str
    bytes_written: int


@dataclasses.dataclass
class _UndoEntry:
    profile_path: Path
    previous_yaml: str
    profile_key: str
    saved_at: float


class BindingsWriter:
    """Process-singleton orchestrator for binding writes + undo."""

    def __init__(self) -> None:
        self._undo_store: dict[str, _UndoEntry] = {}
        self._lock = threading.RLock()

    # ----- public API ----------------------------------------------------

    def write_bindings(
        self,
        *,
        profile_path: Path,
        profile_kind: str,
        new_controls: list[dict[str, Any]] | None,
        new_outputs: list[dict[str, Any]] | None,
        registry,
    ) -> WriteResult:
        """Apply a new ``controls`` / ``outputs`` block to one profile.

        ``registry`` is the live :class:`ProfileRegistry`. We use its
        loaded schemas to validate the post-write document and trigger
        a per-pack reload after the swap.
        """
        if profile_kind not in {"midi", "hid"}:
            raise BindingsWriteError(
                f"binding writes only allowed for midi/hid profiles, got {profile_kind}"
            )
        if not profile_path.is_file():
            raise BindingsWriteError(f"profile file not found: {profile_path}")

        import yaml
        import jsonschema

        try:
            previous_yaml = profile_path.read_text(encoding="utf-8")
        except OSError as exc:
            raise BindingsWriteError(f"could not read {profile_path}: {exc}") from exc

        try:
            doc = yaml.safe_load(previous_yaml) or {}
        except yaml.YAMLError as exc:
            raise BindingsWriteError(f"existing profile YAML is invalid: {exc}") from exc

        if not isinstance(doc, dict):
            raise BindingsWriteError("profile YAML root must be a mapping")

        if new_controls is not None:
            doc["controls"] = list(new_controls)
        if new_outputs is not None:
            doc["outputs"] = list(new_outputs)

        # Validate against the registry's loaded schema.
        schema = (registry._schemas or {}).get(profile_kind)   # noqa: SLF001
        if schema is None:
            raise BindingsWriteError(f"no loaded schema for kind={profile_kind}")
        try:
            jsonschema.validate(doc, schema)
        except jsonschema.ValidationError as exc:
            raise BindingsWriteError(f"updated profile failed schema validation: {exc.message}") from exc

        new_yaml = yaml.safe_dump(doc, sort_keys=False, allow_unicode=True)
        revision = uuid.uuid4().hex
        undo_token = secrets.token_urlsafe(16)
        profile_key = f"{profile_path.parent.parent.name}/{profile_path.stem}"

        # Atomic rename: write a sibling tmp file then os.replace().
        tmp_path = profile_path.with_suffix(profile_path.suffix + f".tmp.{revision[:8]}")
        try:
            tmp_path.write_text(new_yaml, encoding="utf-8")
            os.replace(tmp_path, profile_path)
        except OSError as exc:
            try:
                if tmp_path.exists():
                    tmp_path.unlink()
            except OSError:
                pass
            raise BindingsWriteError(f"could not write profile: {exc}") from exc

        # Record the undo entry.
        with self._lock:
            self._gc_locked()
            self._undo_store[undo_token] = _UndoEntry(
                profile_path=profile_path,
                previous_yaml=previous_yaml,
                profile_key=profile_key,
                saved_at=time.time(),
            )

        # Best-effort hot reload — the supervisor IPC bridge isn't
        # required to land the file write.
        try:
            pack_id = profile_path.parent.parent.name
            registry.reload_pack(pack_id)
        except Exception as exc:   # noqa: BLE001 — defensive
            logger.warning("Pack reload after binding write failed: %s", exc)

        # T2461-A3 — record the save timestamp on the bench-state
        # tracker so the Hardware Store DeviceCard can render
        # "Bound 2m ago" alongside the existing "Last seen" row.
        try:
            from app.services.controllers.bench_state import (
                get_bench_state_tracker,
            )
            # The writer's profile_key shape is `<pack_id>/<filename-stem>`,
            # but the tracker keys by `<pack_id>/<model>.<kind>`. Build the
            # tracker form from filesystem metadata so the field aligns
            # with /api/devices/known rows.
            tracker_key = f"{pack_id}/{profile_path.stem}.{profile_kind}"
            # filename-stem is `<model>.<kind>`; keep pack_id form below
            # by stripping the trailing `.<kind>` if duplicated.
            if tracker_key.endswith(f".{profile_kind}.{profile_kind}"):
                tracker_key = tracker_key.rsplit(f".{profile_kind}", 1)[0]
            get_bench_state_tracker().record_binding_save(tracker_key)
        except Exception as exc:   # noqa: BLE001
            logger.debug("record_binding_save skipped: %s", exc)

        return WriteResult(
            revision=revision,
            undo_token=undo_token,
            profile_key=profile_key,
            bytes_written=len(new_yaml.encode("utf-8")),
        )

    def apply_undo(self, undo_token: str, *, registry) -> WriteResult:
        """Restore the previous YAML body associated with the token.

        Returns a fresh ``WriteResult`` so the GUI can chain another
        undo if it needs to.
        """
        with self._lock:
            self._gc_locked()
            entry = self._undo_store.pop(undo_token, None)
        if entry is None:
            raise BindingsWriteError(f"undo token unknown or expired: {undo_token}")

        try:
            entry.profile_path.write_text(entry.previous_yaml, encoding="utf-8")
        except OSError as exc:
            raise BindingsWriteError(f"undo write failed: {exc}") from exc

        try:
            pack_id = entry.profile_path.parent.parent.name
            registry.reload_pack(pack_id)
        except Exception as exc:   # noqa: BLE001
            logger.warning("Pack reload after undo failed: %s", exc)

        return WriteResult(
            revision=uuid.uuid4().hex,
            undo_token="",   # no chained undo from a restore
            profile_key=entry.profile_key,
            bytes_written=len(entry.previous_yaml.encode("utf-8")),
        )

    def pending_undo_count(self) -> int:
        with self._lock:
            self._gc_locked()
            return len(self._undo_store)

    # ----- internals -----------------------------------------------------

    def _gc_locked(self) -> None:
        """Drop expired undo entries. Caller must hold ``_lock``."""
        cutoff = time.time() - UNDO_TTL_S
        expired = [k for k, v in self._undo_store.items() if v.saved_at < cutoff]
        for k in expired:
            self._undo_store.pop(k, None)


# ---------------------------------------------------------------------------
# Singleton accessor
# ---------------------------------------------------------------------------


_singleton: BindingsWriter | None = None
_singleton_lock = threading.Lock()


def get_bindings_writer() -> BindingsWriter:
    global _singleton
    with _singleton_lock:
        if _singleton is None:
            _singleton = BindingsWriter()
        return _singleton


def reset_bindings_writer_for_tests() -> BindingsWriter:
    global _singleton
    with _singleton_lock:
        _singleton = BindingsWriter()
        return _singleton
