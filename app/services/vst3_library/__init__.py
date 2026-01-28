"""
VST3 Library - Plugin Discovery and Download Management

Provides scrapers for free VST3 plugin sources and download management.
"""

from .scraper_base import VST3ScraperBase, VST3PluginInfo, DownloadState, DownloadStatus
from .download_manager import VST3DownloadManager, get_vst3_download_manager

__all__ = [
    'VST3ScraperBase',
    'VST3PluginInfo',
    'DownloadState',
    'DownloadStatus',
    'VST3DownloadManager',
    'get_vst3_download_manager',
]
