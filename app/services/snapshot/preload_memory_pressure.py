"""T2454 hardening — memory-pressure-aware warm-cache cap.

Adapts the `SnapshotPreloadOrchestrator`'s effective cap based on actual
memory pressure rather than a static `len(pinned)`. The pinned set itself
(in Special Settings) is unchanged — it always carries up to 5 ids — but
the orchestrator's *warm cache* may shrink toward 2 entries when the
host is under memory pressure.

Locked decision (2026-04-26): D-primary + C-fallback.

Primary signal: Linux Pressure Stall Information (PSI) at
`/proc/pressure/memory`. The kernel exposes `some avg10` (percentage of
the last 10s during which at least one task was stalled on memory).
PSI is the same signal systemd's `MemoryPressureWatch` and Kubernetes
OOMKill predictors use — it captures behavioral stalls, not just
numerical headroom.

Fallback signal: when PSI is unavailable (kernel without CONFIG_PSI=y
or sandbox restricts /proc/pressure access), use the free-ratio
(available / total) with a smooth linear scale.

Both paths produce a cap in [2, 5]. The orchestrator's reconciler reads
the cap each tick (no new background task) and evicts oldest-warmed
pins beyond it.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

# Locked vocabulary from MP-Q best-practice.
HARD_FLOOR_CAP = 2
HARD_CEILING_CAP = 5

# PSI thresholds — `some avg10` percentage stalled on memory in the last 10s.
PSI_AVG10_HEAVY_PERCENT = 10.0  # → cap = 2 (severe paging)
PSI_AVG10_MEDIUM_PERCENT = 5.0  # → cap = 3
PSI_AVG10_LIGHT_PERCENT = 1.0  # → cap = 4
# below 1.0% → cap = 5

# Free-ratio fallback uses a smooth linear scale anchored at 10% / 40%.
# At 10% free → cap = 2 (matching PSI heavy).
# At 40% free → cap = 5 (matching PSI healthy).
FREE_RATIO_FLOOR = 0.10
FREE_RATIO_CEILING = 0.40

PSI_PATH = "/proc/pressure/memory"

_psi_unavailable_logged = False


@dataclass(frozen=True)
class MemoryPressureSnapshot:
    """Decision-grade snapshot of host memory pressure."""

    cap: int
    source: str  # "psi" | "free_ratio" | "fallback_default"
    psi_avg10: Optional[float]  # PSI `some avg10` percent, if read
    free_ratio: Optional[float]  # available / total, if read
    notes: str = ""


def read_psi_some_avg10() -> Optional[float]:
    """Read `/proc/pressure/memory` and return the `some avg10` percent.

    Returns None if PSI is unavailable (kernel without CONFIG_PSI, or
    /proc/pressure restricted by sandbox). On the first unavailable read,
    logs at WARNING; subsequent reads degrade silently."""
    global _psi_unavailable_logged
    try:
        with open(PSI_PATH, "r", encoding="utf-8") as fh:
            for line in fh:
                # Format: "some avg10=X.YZ avg60=... avg300=... total=..."
                if line.startswith("some "):
                    for token in line.strip().split():
                        if token.startswith("avg10="):
                            try:
                                value = float(token.split("=", 1)[1])
                            except ValueError:
                                return None
                            if math.isnan(value) or math.isinf(value):
                                return None
                            return value
    except FileNotFoundError:
        if not _psi_unavailable_logged:
            logger.warning(
                "Memory PSI unavailable (%s missing) — falling back to free-ratio cap",
                PSI_PATH,
            )
            _psi_unavailable_logged = True
        return None
    except PermissionError:
        if not _psi_unavailable_logged:
            logger.warning(
                "Memory PSI unreadable (%s permission denied) — falling back to free-ratio cap",
                PSI_PATH,
            )
            _psi_unavailable_logged = True
        return None
    except OSError as exc:
        if not _psi_unavailable_logged:
            logger.warning("Memory PSI read failed (%s) — falling back: %s", PSI_PATH, exc)
            _psi_unavailable_logged = True
        return None
    return None


def read_free_ratio() -> Optional[float]:
    """Return `available / total` as a 0..1 ratio. Returns None if psutil
    is unavailable or memory info can't be read."""
    try:
        import psutil  # type: ignore[import-untyped]
    except ImportError:
        return None
    try:
        info = psutil.virtual_memory()
        total = float(info.total)
        if total <= 0:
            return None
        return float(info.available) / total
    except Exception:
        return None


def compute_cap_from_psi(psi_avg10: float) -> int:
    """Map PSI `some avg10` → cap. Higher pressure = lower cap."""
    if psi_avg10 >= PSI_AVG10_HEAVY_PERCENT:
        return HARD_FLOOR_CAP  # 2
    if psi_avg10 >= PSI_AVG10_MEDIUM_PERCENT:
        return 3
    if psi_avg10 >= PSI_AVG10_LIGHT_PERCENT:
        return 4
    return HARD_CEILING_CAP  # 5


def compute_cap_from_free_ratio(free_ratio: float) -> int:
    """Smooth linear scale from FREE_RATIO_FLOOR (cap=2) to
    FREE_RATIO_CEILING (cap=5). Saturates at the bounds."""
    if free_ratio <= FREE_RATIO_FLOOR:
        return HARD_FLOOR_CAP
    if free_ratio >= FREE_RATIO_CEILING:
        return HARD_CEILING_CAP
    # Linear interp: floor at 0.10, ceiling at 0.40.
    span = FREE_RATIO_CEILING - FREE_RATIO_FLOOR  # 0.30
    progress = (free_ratio - FREE_RATIO_FLOOR) / span
    cap_range = HARD_CEILING_CAP - HARD_FLOOR_CAP  # 3
    return _clamp_cap(round(HARD_FLOOR_CAP + progress * cap_range))


def compute_warm_cap() -> MemoryPressureSnapshot:
    """Pick the warm-cache cap from PSI primary, free-ratio fallback,
    or the hard ceiling if neither signal is available."""
    psi = read_psi_some_avg10()
    if psi is not None:
        cap = compute_cap_from_psi(psi)
        return MemoryPressureSnapshot(
            cap=_clamp_cap(cap),
            source="psi",
            psi_avg10=psi,
            free_ratio=None,
        )

    free_ratio = read_free_ratio()
    if free_ratio is not None:
        cap = compute_cap_from_free_ratio(free_ratio)
        return MemoryPressureSnapshot(
            cap=_clamp_cap(cap),
            source="free_ratio",
            psi_avg10=None,
            free_ratio=free_ratio,
        )

    return MemoryPressureSnapshot(
        cap=HARD_CEILING_CAP,
        source="fallback_default",
        psi_avg10=None,
        free_ratio=None,
        notes="PSI unavailable AND psutil missing — defaulting to ceiling cap",
    )


def _clamp_cap(value: int) -> int:
    if value < HARD_FLOOR_CAP:
        return HARD_FLOOR_CAP
    if value > HARD_CEILING_CAP:
        return HARD_CEILING_CAP
    return value
