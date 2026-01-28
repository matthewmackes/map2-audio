"""
VST3 Download Manager
Coordinate downloading VST3 plugins from multiple sources.
"""

import logging
import asyncio
import os
import shutil
from typing import List, Dict, Optional, Set
from dataclasses import dataclass
from datetime import datetime

from .scraper_base import VST3ScraperBase, VST3PluginInfo
from .airwindows_scraper import AirwindowsScraper
from .lsp_scraper import LSPPluginsScraper
from .surge_scraper import SurgeXTScraper
from .distrho_scraper import DISTRHOScraper
from .vital_scraper import VitalScraper
from .dexed_scraper import DexedScraper
from .odin_scraper import OdinScraper
from .chowdsp_scraper import ChowDSPScraper
from .obxd_scraper import OBXdScraper
from .github_discovery_scraper import GitHubDiscoveryScraper

logger = logging.getLogger(__name__)


# Default VST3 installation path
DEFAULT_VST3_PATH = os.path.expanduser("~/.vst3")


@dataclass
class SourceStats:
    """Per-source download statistics."""
    name: str
    total_packages: int = 0
    discovered: int = 0
    downloaded: int = 0
    failed: int = 0
    skipped: int = 0
    current_package: Optional[str] = None
    state: str = "pending"  # pending, discovering, downloading, completed, failed


@dataclass
class DownloadStats:
    """Download statistics."""
    total_packages: int = 0
    downloaded: int = 0
    failed: int = 0
    skipped: int = 0
    total_bytes: int = 0
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None


class VST3DownloadManager:
    """Manage VST3 plugin downloads from multiple sources."""

    def __init__(self, install_path: Optional[str] = None):
        """Initialize download manager.

        Args:
            install_path: Path to install VST3 plugins (default: ~/.vst3)
        """
        self.install_path = install_path or DEFAULT_VST3_PATH
        self.download_path = os.path.join(os.path.expanduser("~/.cache/map2"), "vst3_downloads")
        self.scrapers: Dict[str, VST3ScraperBase] = {}
        self.stats = DownloadStats()
        self.source_stats: Dict[str, SourceStats] = {}
        self.is_downloading = False
        self.current_source: Optional[str] = None
        self.active_sources: List[str] = []
        self.failed_sources: List[str] = []

        # Initialize scrapers
        self._init_scrapers()

        # Create directories
        os.makedirs(self.install_path, exist_ok=True)
        os.makedirs(self.download_path, exist_ok=True)

        logger.info(f"VST3 Download Manager initialized: install={self.install_path}")

    def _init_scrapers(self) -> None:
        """Initialize all scrapers."""
        self.scrapers = {
            # Original sources
            'airwindows': AirwindowsScraper(),
            'lsp-plugins': LSPPluginsScraper(),
            'surge-xt': SurgeXTScraper(),
            'distrho': DISTRHOScraper(),
            # New verified sources
            'vital': VitalScraper(),
            'dexed': DexedScraper(),
            'odin2': OdinScraper(),
            'chowdsp': ChowDSPScraper(),
            'obxd': OBXdScraper(),
            # GitHub discovery (finds additional plugins)
            'github-discovery': GitHubDiscoveryScraper(),
        }

    def get_available_sources(self) -> List[Dict]:
        """Get list of available plugin sources.

        Returns:
            List of source info dicts
        """
        sources = []
        for name, scraper in self.scrapers.items():
            sources.append({
                "id": name,
                "name": name.replace("-", " ").title(),
                "library_name": scraper.library_name,
                "base_url": scraper.base_url,
            })
        return sources

    async def discover_all(self, sources: Optional[List[str]] = None) -> Dict[str, List[VST3PluginInfo]]:
        """Discover plugins from all or specified sources.

        Args:
            sources: List of source names (None = all)

        Returns:
            Dict of source -> plugin list
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

            logger.info(f"Discovering plugins from {source}...")
            scraper = self.scrapers[source]
            try:
                plugins = await scraper.discover_plugins()
                discovered[source] = plugins
                if source in self.source_stats:
                    self.source_stats[source].discovered = len(plugins)
                logger.info(f"Found {len(plugins)} packages from {source}")
            except Exception as e:
                logger.error(f"Discovery failed for {source}: {e}")
                discovered[source] = []
                if source in self.source_stats:
                    self.source_stats[source].state = "failed"

        return discovered

    async def download_all(self, sources: Optional[List[str]] = None,
                          parallel: int = 2, skip_existing: bool = True) -> DownloadStats:
        """Download plugins from all or specified sources.

        Args:
            sources: List of source names (None = all)
            parallel: Number of parallel downloads
            skip_existing: Skip packages that already exist

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
            # Discover packages
            discovered = await self.discover_all(sources)

            # Flatten package list
            all_packages = []
            for source, packages in discovered.items():
                if source in self.source_stats:
                    self.source_stats[source].total_packages = len(packages)
                    self.source_stats[source].state = "downloading" if packages else "completed"
                all_packages.extend(packages)

            self.stats.total_packages = len(all_packages)
            logger.info(f"Starting download of {len(all_packages)} packages with {parallel} parallel workers")

            # Download in parallel
            semaphore = asyncio.Semaphore(parallel)
            tasks = [
                self._download_with_semaphore(pkg, semaphore, skip_existing)
                for pkg in all_packages
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

    async def _download_with_semaphore(self, plugin_info: VST3PluginInfo,
                                       semaphore: asyncio.Semaphore,
                                       skip_existing: bool) -> Optional[bool]:
        """Download package with semaphore limit."""
        async with semaphore:
            return await self._download_package(plugin_info, skip_existing)

    async def _download_package(self, plugin_info: VST3PluginInfo,
                                skip_existing: bool) -> Optional[bool]:
        """Download and install a single plugin package.

        Args:
            plugin_info: Plugin information
            skip_existing: Skip if already exists

        Returns:
            True if downloaded, False if failed, None if skipped
        """
        source = plugin_info.library
        src_stats = self.source_stats.get(source)

        try:
            # Update current package
            if src_stats:
                src_stats.current_package = plugin_info.name

            # Download to cache directory
            download_dir = os.path.join(self.download_path, source)
            os.makedirs(download_dir, exist_ok=True)
            download_path = os.path.join(download_dir, plugin_info.filename)

            # Check if already downloaded
            if skip_existing and os.path.exists(download_path):
                logger.debug(f"Skipping existing package: {plugin_info.filename}")
                if src_stats:
                    src_stats.skipped += 1
                return None

            # Get scraper and download
            scraper = self.scrapers.get(source)
            if not scraper:
                logger.error(f"No scraper for source: {source}")
                if src_stats:
                    src_stats.failed += 1
                return False

            # Download and extract
            extracted = await scraper.download_and_extract(
                plugin_info,
                download_dir,
                delete_archive=True
            )

            if extracted:
                # Install extracted VST3 bundles to installation path
                installed = 0
                for vst3_path in extracted:
                    if os.path.isdir(vst3_path) and vst3_path.endswith('.vst3'):
                        dest_path = os.path.join(self.install_path, os.path.basename(vst3_path))
                        try:
                            if os.path.exists(dest_path):
                                shutil.rmtree(dest_path)
                            shutil.copytree(vst3_path, dest_path)
                            installed += 1
                            logger.info(f"Installed: {os.path.basename(vst3_path)}")
                        except Exception as e:
                            logger.error(f"Failed to install {vst3_path}: {e}")

                if installed > 0:
                    if src_stats:
                        src_stats.downloaded += 1
                        src_stats.current_package = None
                    return True

            if src_stats:
                src_stats.failed += 1
            return False

        except Exception as e:
            logger.error(f"Error downloading {plugin_info.name}: {e}")
            if src_stats:
                src_stats.failed += 1
            return False

    def get_progress(self) -> Dict:
        """Get current download progress."""
        duration = 0.0
        if self.stats.start_time:
            end = self.stats.end_time or datetime.utcnow()
            duration = (end - self.stats.start_time).total_seconds()

        progress_pct = 0.0
        if self.stats.total_packages > 0:
            completed = self.stats.downloaded + self.stats.failed + self.stats.skipped
            progress_pct = (completed / self.stats.total_packages) * 100.0

        has_stats = self.stats.total_packages > 0 or self.stats.start_time is not None

        sources_progress = []
        for name, src_stats in self.source_stats.items():
            sources_progress.append({
                "name": name,
                "state": src_stats.state,
                "discovered": src_stats.discovered,
                "total_packages": src_stats.total_packages,
                "downloaded": src_stats.downloaded,
                "failed": src_stats.failed,
                "skipped": src_stats.skipped,
                "current_package": src_stats.current_package
            })

        return {
            "is_downloading": self.is_downloading,
            "progress_percent": progress_pct,
            "current_source": self.current_source,
            "active_sources": self.active_sources,
            "install_path": self.install_path,
            "stats": {
                "total_packages": self.stats.total_packages,
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

    def get_discovered_packages(self) -> List[Dict]:
        """Get all discovered packages from all sources.

        Returns:
            List of package info dicts
        """
        packages = []
        for name, scraper in self.scrapers.items():
            for plugin in scraper.discovered_plugins:
                packages.append({
                    "source": name,
                    "name": plugin.name,
                    "filename": plugin.filename,
                    "category": plugin.category,
                    "author": plugin.author,
                    "version": plugin.version,
                    "license": plugin.license,
                    "description": plugin.description,
                    "tags": plugin.tags,
                    "file_size": plugin.file_size_bytes,
                    "url": plugin.url,
                    "homepage": plugin.homepage,
                })
        return packages


# Global instance
_vst3_download_manager: Optional[VST3DownloadManager] = None


def get_vst3_download_manager(install_path: Optional[str] = None) -> VST3DownloadManager:
    """Get or create VST3 download manager instance."""
    global _vst3_download_manager
    if _vst3_download_manager is None:
        _vst3_download_manager = VST3DownloadManager(install_path)
    return _vst3_download_manager
