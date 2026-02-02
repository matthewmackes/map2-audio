"""
SoundFont Library Management Package
Auto-download and manage SoundFont (.sf2, .sfz) libraries.
"""

from .scraper_base import SFScraperBase, SFFileInfo
from .download_manager import SFDownloadManager, get_sf_download_manager

__all__ = ['SFScraperBase', 'SFFileInfo', 'SFDownloadManager', 'get_sf_download_manager']
