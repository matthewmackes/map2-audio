"""
Phase 3 profiling tests (Checkpoint 3.4)
"""

import pytest
from app.services.chain_analyzer import ChainAnalyzer


class _FakeChainService:
    async def get_chain(self, chain_id: int):
        if chain_id != 42:
            return None

        return {
            "name": "Live Guitar",
            "plugins": [
                {
                    "name": "NAM Lead",
                    "uri": "urn:map2:nam-player",
                },
                {
                    "name": "Hall Reverb",
                    "uri": "urn:map2:ir-reverb",
                },
            ],
        }


@pytest.mark.asyncio
async def test_chain_analysis_reports_expected_metrics():
    analyzer = ChainAnalyzer(_FakeChainService())
    result = await analyzer.analyze_chain(42)

    assert result is not None
    assert result["chain_id"] == 42
    assert result["chain_name"] == "Live Guitar"
    assert result["plugin_count"] == 2
    assert result["estimated_cpu_percent"] == 12
    assert result["estimated_memory_mb"] == 240
    assert result["requires_gpu"] is True
    assert result["gpu_recommended"] is True
    assert isinstance(result["analysis_timestamp"], float)
