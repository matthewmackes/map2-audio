"""
Audio Interface Shopping Search API
Runs marketplace search and returns ranked results for the web UI.
"""

import asyncio
import importlib.util
import logging
import sys
import time
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/shopping", tags=["shopping"])


class DeviceMatch(BaseModel):
    """Matched device specification."""

    model: str
    io_count: str
    latency_ms: float
    tier: str
    score: int
    linux_support: str
    notes: str


class SearchResult(BaseModel):
    """Search result from marketplace."""

    title: str
    price: float
    url: str
    source: str  # eBay, ShopGoodwill, Reverb
    condition: str
    shipping: Optional[float]
    matched_device: Optional[DeviceMatch]
    score: int


class SearchResponse(BaseModel):
    """Response containing all search results."""

    results: List[SearchResult]
    total_count: int
    max_price: int
    search_time_seconds: float
    recommendations: Optional[dict] = None


@lru_cache(maxsize=1)
def _load_search_module():
    """Load search script module from local scripts directory."""
    script_path = Path(__file__).resolve().parents[2] / "scripts" / "search_audio_interfaces.py"
    if not script_path.exists():
        raise RuntimeError(f"Search script not found: {script_path}")

    spec = importlib.util.spec_from_file_location("search_audio_interfaces", script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Failed to load module spec for: {script_path}")

    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _serialize_result(result: Any) -> Dict[str, Any]:
    """Convert script SearchResult object into API payload."""
    matched = getattr(result, "matched_device", None)
    matched_payload: Optional[Dict[str, Any]] = None
    if matched is not None:
        matched_payload = {
            "model": str(getattr(matched, "model", "Unknown")),
            "io_count": str(getattr(matched, "io_count", "")),
            "latency_ms": float(getattr(matched, "latency_ms", 0.0) or 0.0),
            "tier": str(getattr(matched, "tier", "Unknown")),
            "score": int(getattr(matched, "score", 0) or 0),
            "linux_support": str(getattr(matched, "linux_support", "Unknown")),
            "notes": str(getattr(matched, "notes", "")),
        }

    return {
        "title": str(getattr(result, "title", "")).strip(),
        "price": float(getattr(result, "price", 0.0) or 0.0),
        "url": str(getattr(result, "url", "")).strip(),
        "source": str(getattr(result, "source", "Unknown")),
        "condition": str(getattr(result, "condition", "Unknown")),
        "shipping": getattr(result, "shipping", None),
        "matched_device": matched_payload,
        "score": int(getattr(result, "score", 0) or 0),
    }


def _dedupe_results(results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Deduplicate likely duplicate listings from overlapping searches."""
    seen = set()
    deduped: List[Dict[str, Any]] = []

    for item in results:
        key = (
            item.get("source", "").strip().lower(),
            item.get("title", "").strip().lower(),
            round(float(item.get("price", 0.0) or 0.0), 2),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)

    return deduped


def _build_recommendations(results: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Build recommendations from discovered results."""
    matched = [r for r in results if r.get("matched_device")]
    if not matched:
        return None

    adat_expanders = [r for r in matched if (r["matched_device"].get("latency_ms", 0.0) == 0.0)]
    low_latency = [r for r in matched if r["matched_device"].get("tier") in {"S+", "S", "A+"}]
    value_candidates = [
        r
        for r in matched
        if r["matched_device"].get("tier") in {"A", "A+"} and float(r.get("price", 0.0) or 0.0) > 0
    ]

    recommendations: Dict[str, Any] = {}

    if adat_expanders:
        best_adat = min(adat_expanders, key=lambda x: x["price"])
        recommendations["best_adat_expander"] = {
            "model": best_adat["matched_device"]["model"],
            "price": best_adat["price"],
            "source": best_adat["source"],
            "url": best_adat["url"],
            "reason": "Lowest-cost ADAT expansion option from current listings",
        }

    if low_latency:
        best_latency = min(low_latency, key=lambda x: x["price"])
        recommendations["best_latency"] = {
            "model": best_latency["matched_device"]["model"],
            "price": best_latency["price"],
            "source": best_latency["source"],
            "url": best_latency["url"],
            "reason": "Best low-latency tier option at current price",
        }

    if value_candidates:
        best_value = max(value_candidates, key=lambda x: x["score"] / max(x["price"], 1.0))
        recommendations["best_value"] = {
            "model": best_value["matched_device"]["model"],
            "price": best_value["price"],
            "source": best_value["source"],
            "url": best_value["url"],
            "reason": "Best score-to-price ratio in discovered listings",
        }

    return recommendations or None


def _run_search(max_price: int) -> Tuple[List[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """Run marketplace search script and normalize output."""
    module = _load_search_module()
    scraper_cls = getattr(module, "AudioInterfaceScraper", None)
    if scraper_cls is None:
        raise RuntimeError("AudioInterfaceScraper class not found in search script")

    scraper = scraper_cls(max_price=max_price)
    scraper.search_all()

    raw_results = [_serialize_result(r) for r in getattr(scraper, "results", [])]
    deduped = _dedupe_results(raw_results)
    deduped.sort(key=lambda r: (-int(r.get("score", 0) or 0), float(r.get("price", 0.0) or 0.0)))

    return deduped, _build_recommendations(deduped)


@router.get("/search", response_model=SearchResponse)
async def search_audio_interfaces(
    max_price: int = Query(500, ge=50, le=2000, description="Maximum price to search")
):
    """Search eBay, ShopGoodwill, and Reverb for audio interfaces."""
    try:
        logger.info("Running audio interface search with max_price=%s", max_price)
        started = time.perf_counter()
        results, recommendations = await asyncio.wait_for(
            asyncio.to_thread(_run_search, max_price),
            timeout=90,
        )
        elapsed = time.perf_counter() - started

        return SearchResponse(
            results=results,
            total_count=len(results),
            max_price=max_price,
            search_time_seconds=round(elapsed, 3),
            recommendations=recommendations,
        )

    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Search timed out")
    except Exception as e:
        logger.error("Search failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Search failed: {e}")


@router.get("/recommendations")
async def get_recommendations():
    """Get baseline recommendations from the built-in device ranking database."""
    try:
        module = _load_search_module()
        device_specs = getattr(module, "DEVICE_SPECS", {})
        ranked = sorted(
            device_specs.values(),
            key=lambda spec: int(getattr(spec, "score", 0) or 0),
            reverse=True,
        )

        top_picks = []
        for rank, spec in enumerate(ranked[:3], start=1):
            model = str(getattr(spec, "model", "Unknown"))
            top_picks.append(
                {
                    "rank": rank,
                    "model": model,
                    "typical_price": "Varies by market",
                    "tier": str(getattr(spec, "tier", "Unknown")),
                    "reason": str(getattr(spec, "notes", "High-ranked in internal benchmark")),
                    "search_url": f"https://www.ebay.com/sch/i.html?_nkw={model.replace(' ', '+')}",
                }
            )

        return {"top_picks": top_picks}
    except Exception as e:
        logger.error("Failed to build recommendations: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to build recommendations: {e}")
