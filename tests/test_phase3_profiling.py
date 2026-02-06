"""
Phase 3 profiling tests (Checkpoint 3.4)
"""

import pytest
from app.services.chain_analyzer import ChainAnalyzer
from app.services.chain_service import ChainService


@pytest.mark.asyncio
async def test_chain_analysis_missing_chain():
    analyzer = ChainAnalyzer(ChainService(None))
    result = await analyzer.analyze_chain(123456)
    assert result is None
