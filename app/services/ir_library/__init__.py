"""
IR Library Management Package
Auto-download and manage impulse response libraries.
"""

from .scraper_base import IRScraperBase
from .download_manager import IRDownloadManager

__all__ = ['IRScraperBase', 'IRDownloadManager']
