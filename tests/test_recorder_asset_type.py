"""T2508-2 + T2508-3 — Recorder asset-type + library-dir parity tests.

Covers:
  - `AssetType.RECORDING` registered with the canonical "recording"
    string value.
  - `MAX_SIZES[AssetType.RECORDING]` set to the 10 GB ceiling per
    the worklist spec (T2508-2).
  - `Map2Paths.recordings_library_dir()` returns
    `<service-state>/recordings` (service-plane authority, NOT
    user-plane).

Plumbing slice — no service surface or route involved here, just
the constants the recorder service + future T2508-5 routes consume.
"""

from __future__ import annotations

from pathlib import Path

from app.paths import Map2Paths
from app.services.upload_service import AssetType, UnifiedUploadService


# ---------------------------------------------------------------------------
# AssetType + MAX_SIZES (T2508-2)
# ---------------------------------------------------------------------------


def test_asset_type_recording_value_is_canonical() -> None:
    assert AssetType.RECORDING.value == "recording"


def test_asset_type_recording_round_trips_via_constructor() -> None:
    """`AssetType("recording")` must accept the string value, so route
    layers can deserialize an asset_type_override from JSON without
    special-casing."""
    assert AssetType("recording") is AssetType.RECORDING


def test_max_size_for_recording_is_ten_gigabytes() -> None:
    expected = 10 * 1024 * 1024 * 1024  # 10 GB
    assert UnifiedUploadService.MAX_SIZES[AssetType.RECORDING] == expected


def test_max_size_for_recording_is_an_order_of_magnitude_above_nam() -> None:
    """Sanity: a recording takes ~20× the per-NAM ceiling — making it
    the largest single-asset class. This pins the relationship so a
    future ratchet of the NAM ceiling doesn't accidentally swap them."""
    nam_size = UnifiedUploadService.MAX_SIZES[AssetType.NAM]
    recording_size = UnifiedUploadService.MAX_SIZES[AssetType.RECORDING]
    assert recording_size > nam_size * 10


def test_all_asset_types_have_a_max_size_entry() -> None:
    """Every enum member must appear in MAX_SIZES — otherwise a
    new type ships without a ceiling and lets unbounded uploads
    through."""
    sizes = UnifiedUploadService.MAX_SIZES
    for member in AssetType:
        assert member in sizes, f"missing MAX_SIZES entry for {member}"


# ---------------------------------------------------------------------------
# recordings_library_dir (T2508-3)
# ---------------------------------------------------------------------------


def test_recordings_library_dir_returns_service_plane_path() -> None:
    """Service-plane authority — recordings live under the
    service-state root (default `/var/lib/map2` or
    `MAP2_SERVICE_STATE_DIR`), not under `~/.map2` (user plane)."""
    path = Map2Paths.recordings_library_dir()
    assert isinstance(path, Path)
    assert path.name == "recordings"
    # The service-state dir is the canonical authority for this path.
    assert path.parent == Map2Paths.service_state_dir()


def test_recordings_library_dir_is_a_sibling_of_other_library_dirs() -> None:
    """The new dir lives next to nam/lv2/irs library dirs."""
    recordings = Map2Paths.recordings_library_dir()
    nam = Map2Paths.nam_library_dir()
    ir_cabinets = Map2Paths.ir_cabinets_library_dir()
    # All four share a parent — the service-state root.
    assert recordings.parent == nam.parent
    # IR cabinets/reverbs are nested one level deeper; recordings sit
    # at the same level as nam/lv2.
    assert recordings.parent == ir_cabinets.parent.parent


def test_recordings_library_dir_is_idempotent_call() -> None:
    """The accessor is a pure function — successive calls return
    equal paths (no random suffixes, no time-based hashes)."""
    assert Map2Paths.recordings_library_dir() == Map2Paths.recordings_library_dir()
