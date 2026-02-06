"""
Tests for ChainAnalyzer (Checkpoint 3.1)
"""

import pytest
from app.services.chain_analyzer import ChainAnalyzer
from app.services.chain_service import ChainService


@pytest.mark.asyncio
async def test_chain_analyzer_returns_none_for_missing_chain():
    analyzer = ChainAnalyzer(ChainService(None))
    result = await analyzer.analyze_chain(999999)
    assert result is None
