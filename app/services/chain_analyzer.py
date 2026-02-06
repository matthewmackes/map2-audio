"""
Chain Analyzer Service
Estimates resource requirements for a chain.
"""

from typing import Dict, Optional
import time
import logging

from app.services.chain_service import ChainService

logger = logging.getLogger(__name__)


class ChainAnalyzer:
    """Analyzes chains to estimate resource requirements."""

    def __init__(self, chain_service: ChainService):
        self.chain_service = chain_service

    async def analyze_chain(self, chain_id: int) -> Optional[Dict]:
        chain = await self.chain_service.get_chain(chain_id)
        if not chain:
            return None

        plugins = chain.get("plugins", [])
        plugin_count = len(plugins)

        estimated_cpu = min(95, plugin_count * 6)
        estimated_memory = plugin_count * 120

        requires_gpu = False
        gpu_recommended = False

        for plugin in plugins:
            name = (plugin.get("name") or "").lower()
            uri = (plugin.get("uri") or "").lower()
            if "neural" in name or "nam" in name or "gpu" in name or "cuda" in name:
                requires_gpu = True
                gpu_recommended = True
            if "reverb" in name or "ir" in name:
                gpu_recommended = gpu_recommended or False

        return {
            "chain_id": chain_id,
            "chain_name": chain.get("name"),
            "plugin_count": plugin_count,
            "estimated_cpu_percent": estimated_cpu,
            "estimated_memory_mb": estimated_memory,
            "requires_gpu": requires_gpu,
            "gpu_recommended": gpu_recommended,
            "analysis_timestamp": time.time(),
        }
