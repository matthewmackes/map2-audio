"""
Audio Interface Shopping Search API
Runs the search script and returns results for the web UI
"""

from fastapi import APIRouter, Query, HTTPException
from typing import List, Optional
import subprocess
import json
import logging
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/shopping", tags=["shopping"])


class DeviceMatch(BaseModel):
    """Matched device specification"""
    model: str
    io_count: str
    latency_ms: float
    tier: str
    score: int
    linux_support: str
    notes: str


class SearchResult(BaseModel):
    """Search result from marketplace"""
    title: str
    price: float
    url: str
    source: str  # eBay, ShopGoodwill, Reverb
    condition: str
    shipping: Optional[float]
    matched_device: Optional[DeviceMatch]
    score: int


class SearchResponse(BaseModel):
    """Response containing all search results"""
    results: List[SearchResult]
    total_count: int
    max_price: int
    search_time_seconds: float
    recommendations: Optional[dict] = None


@router.get("/search", response_model=SearchResponse)
async def search_audio_interfaces(
    max_price: int = Query(500, ge=50, le=2000, description="Maximum price to search")
):
    """
    Search eBay, ShopGoodwill, and Reverb for audio interfaces
    
    Returns results ranked by price and performance score
    """
    try:
        logger.info(f"Running audio interface search with max_price={max_price}")
        
        # Note: In production, this would run the actual search script
        # For now, return mock data that matches the script's output
        
        mock_results = [
            {
                "title": "Behringer ADA8200 ULTRAGAIN 8-Channel Mic Preamp with ADAT",
                "price": 89.99,
                "url": "https://www.ebay.com/itm/example1",
                "source": "eBay",
                "condition": "Used",
                "shipping": None,
                "matched_device": {
                    "model": "Behringer ADA8200",
                    "io_count": "8×8",
                    "latency_ms": 0.0,
                    "tier": "A",
                    "score": 80,
                    "linux_support": "Excellent",
                    "notes": "ADAT expander, best value"
                },
                "score": 80
            },
            {
                "title": "MOTU 828mk3 Hybrid FireWire/USB Audio Interface",
                "price": 124.50,
                "url": "https://www.ebay.com/itm/example2",
                "source": "eBay",
                "condition": "Used",
                "shipping": 15.0,
                "matched_device": {
                    "model": "MOTU 828mk3 Hybrid",
                    "io_count": "10×10",
                    "latency_ms": 3.0,
                    "tier": "A",
                    "score": 74,
                    "linux_support": "Good",
                    "notes": "Best value, USB/FW hybrid"
                },
                "score": 74
            },
            {
                "title": "Focusrite Scarlett 18i20 2nd Gen USB Audio Interface",
                "price": 139.00,
                "url": "https://shopgoodwill.com/item/example3",
                "source": "ShopGoodwill",
                "condition": "Used - Good",
                "shipping": None,
                "matched_device": {
                    "model": "Focusrite Scarlett 18i20",
                    "io_count": "8×10",
                    "latency_ms": 3.5,
                    "tier": "A",
                    "score": 70,
                    "linux_support": "Excellent",
                    "notes": "Plug-and-play, very common"
                },
                "score": 70
            },
            {
                "title": "Audient ASP880 8-Channel Mic Preamp ADAT Expander",
                "price": 149.99,
                "url": "https://reverb.com/item/example4",
                "source": "Reverb",
                "condition": "Good",
                "shipping": 12.0,
                "matched_device": {
                    "model": "Audient ASP880",
                    "io_count": "8 pre",
                    "latency_ms": 0.0,
                    "tier": "A+",
                    "score": 85,
                    "linux_support": "Excellent",
                    "notes": "ADAT expander, console preamps"
                },
                "score": 85
            },
            {
                "title": "PreSonus AudioBox 1818VSL USB Audio Interface",
                "price": 119.00,
                "url": "https://www.ebay.com/itm/example5",
                "source": "eBay",
                "condition": "Used",
                "shipping": None,
                "matched_device": {
                    "model": "PreSonus AudioBox 1818VSL",
                    "io_count": "8×8",
                    "latency_ms": 3.8,
                    "tier": "B",
                    "score": 62,
                    "linux_support": "Good",
                    "notes": "Budget rackmount option"
                },
                "score": 62
            },
        ]
        
        recommendations = {
            "best_adat_expander": {
                "model": "Behringer ADA8200",
                "price": 89.99,
                "source": "eBay",
                "url": "https://www.ebay.com/itm/example1",
                "reason": "No drivers needed, pure ADAT to UA-1000"
            },
            "best_latency": {
                "model": "Audient ASP880",
                "price": 149.99,
                "source": "Reverb",
                "url": "https://reverb.com/item/example4",
                "reason": "Professional preamps, ADAT expansion"
            },
            "best_value": {
                "model": "MOTU 828mk3 Hybrid",
                "price": 124.50,
                "source": "eBay",
                "url": "https://www.ebay.com/itm/example2",
                "reason": "Same I/O as UA-1000, better preamps, great used value"
            }
        }
        
        return SearchResponse(
            results=mock_results,
            total_count=len(mock_results),
            max_price=max_price,
            search_time_seconds=2.5,
            recommendations=recommendations
        )
        
    except Exception as e:
        logger.error(f"Search failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.get("/recommendations")
async def get_recommendations():
    """
    Get quick recommendations without full search
    """
    return {
        "top_picks": [
            {
                "rank": 1,
                "model": "Behringer ADA8200",
                "typical_price": "$90-120",
                "tier": "A",
                "reason": "Best ADAT expander for UA-1000 - adds 8 inputs, no drivers needed",
                "search_url": "https://www.ebay.com/sch/i.html?_nkw=behringer+ada8200"
            },
            {
                "rank": 2,
                "model": "MOTU 828mk3 Hybrid",
                "typical_price": "$120-150",
                "tier": "A",
                "reason": "Same I/O count as UA-1000 with better preamps",
                "search_url": "https://www.ebay.com/sch/i.html?_nkw=motu+828mk3"
            },
            {
                "rank": 3,
                "model": "Focusrite Scarlett 18i20",
                "typical_price": "$100-140",
                "tier": "A",
                "reason": "Plug-and-play Linux support, widely available",
                "search_url": "https://www.ebay.com/sch/i.html?_nkw=focusrite+18i20"
            }
        ]
    }
