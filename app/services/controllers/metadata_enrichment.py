"""Backend integration for the metadata enrichment script.

T2459-C3 lands `scripts/pull_device_metadata.py` as the canonical
fetcher; this module wraps it for backend use:

- :func:`get_cached_asset_path`: returns the path to a cached asset
  for a given ``(pack_id, model, filename)`` tuple, or None if absent.
  Consumed by the FastAPI route ``/api/devices/<pack>/<model>/asset/...``.

- :func:`list_cached_assets`: lists every cached asset for a model.

- :func:`refresh_pack_async`: schedules a background fetch for the
  pack (operator-triggered from the GUI). Non-blocking.

The script's :func:`enrich_pack` is the source of truth; this module
is only the FastAPI/lifespan adapter layer.

Worklist: T2459-C3.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_CACHE_ROOT = Path("/var/lib/map2/devices")


def _safe_join(cache_root: Path, *parts: str) -> Path | None:
    """Resolve ``cache_root / parts...`` and refuse paths that escape."""
    base = cache_root.resolve()
    candidate = (cache_root / Path(*parts)).resolve()
    try:
        candidate.relative_to(base)
    except ValueError:
        return None
    return candidate


def get_cached_asset_path(
    pack_id: str,
    model: str,
    filename: str,
    cache_root: Path = DEFAULT_CACHE_ROOT,
) -> Path | None:
    """Return the absolute path of a cached asset, or None if absent.

    Refuses anything that escapes ``cache_root`` via path traversal.
    """
    if "/" in pack_id or ".." in pack_id:
        return None
    if "/" in model or ".." in model:
        return None
    if "/" in filename or ".." in filename:
        return None
    candidate = _safe_join(cache_root, pack_id, model, filename)
    if candidate is None or not candidate.is_file():
        return None
    return candidate


def list_cached_assets(
    pack_id: str,
    model: str,
    cache_root: Path = DEFAULT_CACHE_ROOT,
) -> list[str]:
    """Return the filenames of every cached asset for the model."""
    if "/" in pack_id or ".." in pack_id or "/" in model or ".." in model:
        return []
    base = cache_root / pack_id / model
    if not base.is_dir():
        return []
    return sorted(p.name for p in base.iterdir() if p.is_file())


async def refresh_pack_async(
    pack_dir: Path,
    cache_root: Path = DEFAULT_CACHE_ROOT,
) -> dict[str, int]:
    """Schedule a background fetch for ``pack_dir``.

    Returns counts: ``{"models": N, "fetched": K, "failed": M}``. Errors
    inside the fetcher are caught — backend boot must never fail
    because metadata enrichment can't reach the network.
    """
    # Lazy import — keep `pull_device_metadata` out of the import graph
    # for processes that never enrich (tests).
    from scripts.pull_device_metadata import enrich_pack

    loop = asyncio.get_running_loop()

    def _run() -> dict[str, int]:
        try:
            outcomes = enrich_pack(pack_dir, cache_root=cache_root)
        except Exception as exc:  # noqa: BLE001 — defensive
            logger.warning("Metadata enrichment failed for %s: %s", pack_dir, exc)
            return {"models": 0, "fetched": 0, "failed": 0}
        models = len(outcomes)
        fetched = sum(1 for outs in outcomes.values() for o in outs if o.ok)
        failed = sum(1 for outs in outcomes.values() for o in outs if not o.ok)
        return {"models": models, "fetched": fetched, "failed": failed}

    return await loop.run_in_executor(None, _run)
