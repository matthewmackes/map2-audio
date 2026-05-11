"""
T2499-B Slice 7 — Maschine MK1 profile-selection driver (T700 Q68 catalog).

Final calibration phase of the T2499-B onboarding orchestrator. After
pad sensitivity, pressure curves, and LCD calibration are saved, the
operator picks a default boot profile from the T700 Q68 25-profile
catalog (T1..T25). This module:

  1. Enumerates the 25-profile catalog (24 JSON descriptors on disk +
     the code-defined T9 effect-chain editor) into a stable, ordered
     list keyed by `T<n>` ids.
  2. Records the operator's selection — single-shot or replaced — and
     validates that the id falls inside T1..T25.
  3. Emits a payload accepted by ``MaschineCalibrationStore.update(
     selected_profile=...)``, i.e. ``{"id": "T<n>"}``.

Why a separate driver module
----------------------------

Following the slice 4 / 5 / 6 pattern (`pad_sensitivity_calibrator`,
`pressure_curve_fitter`, `lcd_calibration_fitter`): each phase has its
own pure-Python recorder + finalizer the orchestrator can drive without
owning operator-input semantics. Keeps the orchestrator state machine
free of catalog-loading + input-validation logic; lets the daemon swap
in a stubbed catalog for tests; mirrors the
`MaschineCalibrationStore.update(...)` write surface exactly.

The catalog itself is *static* — it ships with the daemon, doesn't
mutate at runtime, and is loaded once at driver construction. If T700
ever ships an additional profile, edit `app/services/maschine/profiles/
json/` (or the code-defined registry) and the catalog enumeration here
picks it up on next driver instantiation.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple


# T700 Q68 locks the catalog to T1..T25 (same regex used by
# calibration_store._validate_profile).
_PROFILE_ID_RE = re.compile(r"^T([1-9]|1[0-9]|2[0-5])$")

# The T9 profile is code-defined (T9EffectChainEditorProfile) rather
# than JSON, so we register it explicitly.
T9_CATALOG_ENTRY: Tuple[str, str] = ("T9", "T9 EFFECT CHAIN EDITOR")


class ProfileSelectionError(ValueError):
    """Raised on invalid profile ids or catalog-load failures."""


@dataclass(frozen=True)
class ProfileCatalogEntry:
    """One row of the T700 Q68 25-profile catalog."""

    id: str           # 'T1' .. 'T25' (matches calibration_store regex)
    name: str         # operator-facing label (e.g. 'T1 CTRL', 'T9 EFFECT CHAIN EDITOR')
    source: str       # 'json' or 'code' — provenance for the orchestrator UI


def _extract_t_number(profile_id_raw: str) -> Optional[int]:
    """Return the integer suffix of a Maschine profile_id like 't1_ctrl'
    → 1, or None if the id doesn't match the pattern.
    """
    if not isinstance(profile_id_raw, str):
        return None
    match = re.match(r"^t(\d+)", profile_id_raw)
    if not match:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


def _default_catalog_root() -> Path:
    """Live JSON profile descriptors ship inside the daemon's
    `profiles/json/` directory. Tests can override the root via
    `ProfileSelectionDriver(catalog_root=...)` to inject a fake fixture.
    """
    return Path(__file__).resolve().parent / "profiles" / "json"


def _load_catalog(catalog_root: Optional[Path]) -> List[ProfileCatalogEntry]:
    """Walk the JSON directory + add the code-defined T9 entry.

    Result is ordered by the integer profile number so the operator's
    picker lists T1, T2, ..., T25 deterministically. Duplicate ids
    raise — that would indicate a packaging bug rather than a runtime
    issue.
    """
    root = catalog_root if catalog_root is not None else _default_catalog_root()
    if not root.exists() or not root.is_dir():
        raise ProfileSelectionError(
            f"profile catalog root missing or not a directory: {root}",
        )

    entries: Dict[str, ProfileCatalogEntry] = {}

    for path in sorted(root.glob("*.json")):
        try:
            payload = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError) as exc:
            raise ProfileSelectionError(
                f"failed to load profile descriptor {path.name}: {exc}",
            ) from exc
        raw_id = payload.get("profile_id") or payload.get("id")
        t_num = _extract_t_number(raw_id)
        if t_num is None or not (1 <= t_num <= 25):
            # Skip files whose profile_id isn't a Q68 catalog member —
            # better to silently drop fixtures or in-progress drafts
            # than to fail the orchestrator's final phase. The strict
            # cardinality check happens at the end.
            continue
        canonical_id = f"T{t_num}"
        name = payload.get("name")
        if not isinstance(name, str) or not name:
            name = canonical_id
        if canonical_id in entries:
            raise ProfileSelectionError(
                f"duplicate profile id {canonical_id} in catalog ({path.name})",
            )
        entries[canonical_id] = ProfileCatalogEntry(
            id=canonical_id,
            name=name,
            source="json",
        )

    # Register the code-defined T9 entry if it didn't land via JSON.
    t9_id, t9_name = T9_CATALOG_ENTRY
    if t9_id not in entries:
        entries[t9_id] = ProfileCatalogEntry(id=t9_id, name=t9_name, source="code")

    ordered = sorted(entries.values(), key=lambda e: int(e.id[1:]))
    return ordered


class ProfileSelectionDriver:
    """Records the operator's profile selection.

    Single-shot semantics: ``select()`` may be called multiple times —
    later calls overwrite earlier ones — and ``finalize()`` emits the
    final selection. Empty driver → ``finalize()`` raises so the
    orchestrator never advances PROFILE_SELECTION → READY with no pick.
    """

    def __init__(self, catalog_root: Optional[Path] = None) -> None:
        self._catalog: List[ProfileCatalogEntry] = _load_catalog(catalog_root)
        self._by_id: Dict[str, ProfileCatalogEntry] = {
            entry.id: entry for entry in self._catalog
        }
        self._selected: Optional[str] = None

    # ------------------------------------------------------------------
    # Catalog access
    # ------------------------------------------------------------------

    @property
    def catalog(self) -> Tuple[ProfileCatalogEntry, ...]:
        """Immutable ordered view (T1..T25) for the picker UI."""
        return tuple(self._catalog)

    def is_complete_catalog(self) -> bool:
        """T700 Q68 mandates all 25 ids present; expose for diagnostics."""
        return len(self._catalog) == 25 and set(self._by_id) == {
            f"T{n}" for n in range(1, 26)
        }

    # ------------------------------------------------------------------
    # Selection
    # ------------------------------------------------------------------

    def select(self, profile_id: str) -> None:
        """Record (or replace) the operator's pick."""
        if not _PROFILE_ID_RE.match(profile_id or ""):
            raise ProfileSelectionError(
                f"profile_id must match T1..T25; got {profile_id!r}",
            )
        if profile_id not in self._by_id:
            # Catalog-load drift — the id matches the regex but isn't
            # in the registered catalog. Surface clearly.
            raise ProfileSelectionError(
                f"profile_id {profile_id!r} is not registered in the catalog "
                f"(catalog ids: {sorted(self._by_id)})",
            )
        self._selected = profile_id

    def clear(self) -> None:
        """Reset selection — useful for the operator pressing 'go back'."""
        self._selected = None

    @property
    def selected(self) -> Optional[str]:
        return self._selected

    # ------------------------------------------------------------------
    # Finalize
    # ------------------------------------------------------------------

    def finalize(self) -> Dict[str, str]:
        """Emit the payload accepted by MaschineCalibrationStore.update(
        selected_profile=...). Raises if no selection was made."""
        if self._selected is None:
            raise ProfileSelectionError(
                "finalize() called before select(); operator must pick a "
                "profile from the T700 Q68 catalog before the orchestrator "
                "can advance PROFILE_SELECTION → READY",
            )
        return {"id": self._selected}


__all__ = [
    "ProfileCatalogEntry",
    "ProfileSelectionDriver",
    "ProfileSelectionError",
    "T9_CATALOG_ENTRY",
]
