"""
SoundFont Download Manager
Coordinate downloading from multiple SoundFont libraries.
"""

import logging
import asyncio
import os
from typing import List, Dict, Optional, Set
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from .scraper_base import SFScraperBase, SFFileInfo
from .sfzinstruments_scraper import SFZInstrumentsScraper
from .musical_artifacts_scraper import MusicalArtifactsScraper
from .freepats_scraper import FreePatsScraper

logger = logging.getLogger(__name__)


@dataclass
class SourceStats:
    """Per-source download statistics."""
    name: str
    total_files: int = 0
    discovered: int = 0
    downloaded: int = 0
    failed: int = 0
    skipped: int = 0
    current_file: Optional[str] = None
    state: str = "pending"  # pending, discovering, downloading, completed, failed


@dataclass
class DownloadStats:
    """Download statistics."""
    total_files: int = 0
    downloaded: int = 0
    failed: int = 0
    skipped: int = 0
    total_bytes: int = 0
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None


class SFDownloadManager:
    """Manage SoundFont library downloads."""

    def __init__(self, storage_path: Optional[str] = None):
        """Initialize download manager.

        Args:
            storage_path: Base path for storing SoundFonts (uses default if None)
        """
        # Use default path if not specified
        if storage_path:
            self.storage_path = storage_path
        else:
            self.storage_path = self._get_default_storage_path()

        self.scrapers: Dict[str, SFScraperBase] = {}
        self.stats = DownloadStats()
        self.source_stats: Dict[str, SourceStats] = {}
        self.is_downloading = False
        self.downloaded_hashes: Set[str] = set()
        self.current_source: Optional[str] = None
        self.active_sources: List[str] = []
        self.failed_sources: List[str] = []

        # Initialize scrapers
        self._init_scrapers()

        # Create storage directory
        os.makedirs(self.storage_path, exist_ok=True)

        logger.info(f"SoundFont Download Manager initialized: {self.storage_path}")

    def _get_default_storage_path(self) -> str:
        """Get default storage path for SoundFonts."""
        try:
            from app.paths import StoragePaths
            return str(StoragePaths.get_soundfont_download_dir())
        except (ImportError, AttributeError):
            # Fallback if paths module not updated yet
            return os.path.expanduser("~/.local/share/map2/soundfonts/downloads")

    def _init_scrapers(self) -> None:
        """Initialize all scrapers."""
        self.scrapers = {
            'sfzinstruments': SFZInstrumentsScraper(),
            'musical_artifacts': MusicalArtifactsScraper(),
            'freepats': FreePatsScraper(),
        }

    async def discover_all(self, sources: Optional[List[str]] = None) -> Dict[str, List[SFFileInfo]]:
        """Discover SoundFonts from all or specified sources.

        Args:
            sources: List of source names (None = all)

        Returns:
            Dict of source -> file list
        """
        if sources is None:
            sources = list(self.scrapers.keys())

        discovered = {}

        for source in sources:
            if source not in self.scrapers:
                logger.warning(f"Unknown source: {source}")
                continue

            # Update source state
            if source in self.source_stats:
                self.source_stats[source].state = "discovering"

            logger.info(f"Discovering SoundFonts from {source}...")
            scraper = self.scrapers[source]
            try:
                files = await scraper.discover_soundfonts()
                discovered[source] = files
                if source in self.source_stats:
                    self.source_stats[source].discovered = len(files)
                logger.info(f"Found {len(files)} SoundFonts from {source}")
            except Exception as e:
                logger.error(f"Discovery failed for {source}: {e}")
                discovered[source] = []
                if source in self.source_stats:
                    self.source_stats[source].state = "failed"

        return discovered

    async def download_all(self, sources: Optional[List[str]] = None,
                          parallel: int = 4, skip_existing: bool = True) -> DownloadStats:
        """Download SoundFonts from all or specified sources.

        Args:
            sources: List of source names (None = all)
            parallel: Number of parallel downloads
            skip_existing: Skip files that already exist

        Returns:
            Download statistics
        """
        if self.is_downloading:
            logger.warning("Download already in progress")
            return self.stats

        self.is_downloading = True
        self.stats = DownloadStats(start_time=datetime.utcnow())
        self.failed_sources = []

        # Initialize source stats
        if sources is None:
            sources = list(self.scrapers.keys())

        self.active_sources = sources.copy()
        self.source_stats = {
            source: SourceStats(name=source, state="pending")
            for source in sources
        }

        try:
            # Discover files
            discovered = await self.discover_all(sources)

            # Flatten file list and track per-source counts
            all_files = []
            for source, files in discovered.items():
                if source in self.source_stats:
                    self.source_stats[source].total_files = len(files)
                    self.source_stats[source].state = "downloading" if files else "completed"
                all_files.extend(files)

            self.stats.total_files = len(all_files)
            logger.info(f"Starting download of {len(all_files)} SoundFonts with {parallel} parallel workers")

            # Download in parallel batches
            semaphore = asyncio.Semaphore(parallel)
            tasks = [
                self._download_with_semaphore(file_info, semaphore, skip_existing)
                for file_info in all_files
            ]

            results = await asyncio.gather(*tasks, return_exceptions=True)

            # Count results
            for result in results:
                if isinstance(result, Exception):
                    self.stats.failed += 1
                elif result is True:
                    self.stats.downloaded += 1
                elif result is False:
                    self.stats.failed += 1
                elif result is None:
                    self.stats.skipped += 1

            # Mark all sources as completed
            for source in self.source_stats:
                if self.source_stats[source].state == "downloading":
                    self.source_stats[source].state = "completed"

            self.stats.end_time = datetime.utcnow()

            # Log summary
            duration = (self.stats.end_time - self.stats.start_time).total_seconds()
            logger.info(f"Download complete: {self.stats.downloaded} downloaded, "
                       f"{self.stats.skipped} skipped, {self.stats.failed} failed "
                       f"in {duration:.1f}s")

            return self.stats

        finally:
            self.is_downloading = False

    async def _download_with_semaphore(self, file_info: SFFileInfo,
                                      semaphore: asyncio.Semaphore,
                                      skip_existing: bool) -> Optional[bool]:
        """Download file with semaphore limit.

        Args:
            file_info: File to download
            semaphore: Semaphore for limiting concurrency
            skip_existing: Skip if exists

        Returns:
            True if downloaded, False if failed, None if skipped
        """
        async with semaphore:
            return await self._download_file(file_info, skip_existing)

    async def _download_file(self, file_info: SFFileInfo, skip_existing: bool) -> Optional[bool]:
        """Download and process a single SoundFont file.

        Args:
            file_info: File information
            skip_existing: Skip if already exists

        Returns:
            True if downloaded, False if failed, None if skipped
        """
        source = file_info.library
        src_stats = self.source_stats.get(source)

        try:
            # Update current file being downloaded
            if src_stats:
                src_stats.current_file = file_info.filename

            # Build output path
            library_dir = os.path.join(self.storage_path, file_info.library)
            category_dir = os.path.join(library_dir, file_info.category.lower().replace(' ', '_'))

            os.makedirs(category_dir, exist_ok=True)
            output_path = os.path.join(category_dir, file_info.filename)

            # Check if exists
            if skip_existing and os.path.exists(output_path):
                logger.debug(f"Skipping existing file: {file_info.filename}")
                if src_stats:
                    src_stats.skipped += 1
                return None

            # Download
            scraper = self.scrapers.get(file_info.library)
            if not scraper:
                logger.error(f"No scraper for library: {file_info.library}")
                if src_stats:
                    src_stats.failed += 1
                return False

            success = await scraper.download_file(file_info, output_path)

            if success:
                # Handle ZIP/archive files
                is_archive = any(file_info.filename.lower().endswith(ext)
                               for ext in ['.zip', '.tar.xz', '.tar.bz2', '.tar.gz'])
                if is_archive:
                    # TODO: Extract archive and process contents
                    logger.info(f"Downloaded archive: {file_info.filename}")

                if src_stats:
                    src_stats.downloaded += 1
                    src_stats.current_file = None
                return True

            if src_stats:
                src_stats.failed += 1
            return False

        except Exception as e:
            logger.error(f"Error downloading {file_info.filename}: {e}")
            if src_stats:
                src_stats.failed += 1
            return False

    def get_progress(self) -> Dict:
        """Get current download progress.

        Returns:
            Progress dict with stats
        """
        # Calculate duration
        duration = 0.0
        if self.stats.start_time:
            end = self.stats.end_time or datetime.utcnow()
            duration = (end - self.stats.start_time).total_seconds()

        # Calculate progress percentage
        progress_pct = 0.0
        if self.stats.total_files > 0:
            completed = self.stats.downloaded + self.stats.failed + self.stats.skipped
            progress_pct = (completed / self.stats.total_files) * 100.0

        has_stats = self.stats.total_files > 0 or self.stats.start_time is not None

        # Build per-source stats
        sources_progress = []
        for name, src_stats in self.source_stats.items():
            sources_progress.append({
                "name": name,
                "state": src_stats.state,
                "discovered": src_stats.discovered,
                "total_files": src_stats.total_files,
                "downloaded": src_stats.downloaded,
                "failed": src_stats.failed,
                "skipped": src_stats.skipped,
                "current_file": src_stats.current_file
            })

        return {
            "is_downloading": self.is_downloading,
            "progress_percent": progress_pct,
            "current_source": self.current_source,
            "active_sources": self.active_sources,
            "stats": {
                "total_files": self.stats.total_files,
                "downloaded": self.stats.downloaded,
                "failed": self.stats.failed,
                "skipped": self.stats.skipped,
                "duration_seconds": duration
            } if has_stats else None,
            "sources": sources_progress if sources_progress else None
        }

    def reset_stats(self) -> None:
        """Reset download stats for a fresh start."""
        self.stats = DownloadStats()
        self.source_stats = {}
        self.current_source = None
        self.active_sources = []
        self.failed_sources = []

    async def cancel_download(self) -> None:
        """Cancel ongoing download."""
        if self.is_downloading:
            self.is_downloading = False
            # Cancel all scrapers
            for scraper in self.scrapers.values():
                scraper.cancel_downloads()
            logger.info("Download cancelled by user")

    def get_libraries_info(self) -> List[Dict]:
        """Get information about available SoundFont libraries.

        Returns:
            List of library info dictionaries
        """
        return [
            {
                "name": "sfzinstruments",
                "displayName": "SFZ Instruments",
                "description": "Open source SFZ instruments from GitHub",
                "license": "Various (mostly CC)",
                "iconColor": "#10b981",
                "count": len(self.scrapers['sfzinstruments'].discovered_files) if 'sfzinstruments' in self.scrapers else 0,
            },
            {
                "name": "musical_artifacts",
                "displayName": "Musical Artifacts",
                "description": "Community-curated SF2 and SFZ collection",
                "license": "Various",
                "iconColor": "#8b5cf6",
                "count": len(self.scrapers['musical_artifacts'].discovered_files) if 'musical_artifacts' in self.scrapers else 0,
            },
            {
                "name": "freepats",
                "displayName": "FreePats",
                "description": "Quality free soundfonts with CC licenses",
                "license": "CC-BY / CC0",
                "iconColor": "#f59e0b",
                "count": len(self.scrapers['freepats'].discovered_files) if 'freepats' in self.scrapers else 0,
            },
        ]


# Global instance
_sf_download_manager: Optional[SFDownloadManager] = None


def get_sf_download_manager(storage_path: Optional[str] = None) -> SFDownloadManager:
    """Get or create download manager instance."""
    global _sf_download_manager
    if _sf_download_manager is None:
        _sf_download_manager = SFDownloadManager(storage_path)
    return _sf_download_manager
