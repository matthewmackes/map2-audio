"""
Airwindows VST3 Scraper
Download free Airwindows plugins from GitHub releases.

Source: https://github.com/airwindows/airwindows
License: MIT
Author: Chris Johnson

Features:
- 300+ free audio plugins
- Available for Linux, Windows, macOS
- Consolidated releases on GitHub
"""

import logging
import aiohttp
import os
from typing import List, Optional, Callable
from datetime import datetime

from .scraper_base import VST3ScraperBase, VST3PluginInfo, DownloadStatus, DownloadState

logger = logging.getLogger(__name__)


class AirwindowsScraper(VST3ScraperBase):
    """Scraper for Airwindows free plugins.

    Airwindows offers a massive collection of free audio plugins
    created by Chris Johnson. All plugins are MIT licensed.

    Categories include:
    - Saturation/Distortion
    - EQ/Tone
    - Dynamics/Compression
    - Reverb/Ambience
    - Modulation
    - Utility
    """

    BASE_URL = "https://github.com"
    API_URL = "https://api.github.com"
    REPO = "airwindows/airwindows"

    # Known consolidated packages (stable links to releases)
    KNOWN_PACKAGES = [
        {
            "name": "Airwindows Consolidated",
            "filename": "AirwindowsConsolidated-linux.zip",
            "url": "https://github.com/airwindows/airwindows/releases/latest/download/AirwindowsConsolidated-linux.zip",
            "category": "Multi-Effect",
            "description": "300+ Airwindows plugins in one consolidated package",
            "tags": ["saturation", "eq", "dynamics", "reverb", "modulation", "utility", "free"],
            "version": "latest",
        },
    ]

    # Individual plugin categories for scraping releases
    PLUGIN_CATEGORIES = {
        "distortion": ["Density", "Drive", "Dirt", "Tube", "Tape", "Saturation", "Console"],
        "dynamics": ["Pressure", "Surge", "Pop", "Thunder", "Loud", "Comp"],
        "eq": ["EQ", "Tone", "Bass", "Treble", "Air", "High", "Low", "Mid"],
        "reverb": ["Verb", "Room", "Hall", "Plate", "Spring", "Chamber", "Ambience"],
        "modulation": ["Chorus", "Flange", "Phase", "Vibrato", "Tremolo", "Wobble"],
        "utility": ["Gain", "Dither", "Pan", "Width", "Mono", "Stereo", "Mix"],
    }

    def __init__(self):
        """Initialize Airwindows scraper."""
        super().__init__(
            library_name="airwindows",
            base_url=self.BASE_URL,
            rate_limit_requests=10,
            rate_limit_period=1.0
        )

    def _guess_category(self, plugin_name: str) -> str:
        """Guess plugin category from name."""
        name_lower = plugin_name.lower()
        for category, keywords in self.PLUGIN_CATEGORIES.items():
            for keyword in keywords:
                if keyword.lower() in name_lower:
                    return category.capitalize()
        return "Effect"

    async def discover_plugins(self) -> List[VST3PluginInfo]:
        """Discover plugins from Airwindows GitHub releases.

        Returns known consolidated packages plus attempts to find
        individual plugin releases.

        Returns:
            List of discovered plugin packages
        """
        logger.info(f"Discovering plugins from {self.library_name}")

        self.discovered_plugins = []

        # Add known consolidated packages
        for pkg in self.KNOWN_PACKAGES:
            plugin_info = VST3PluginInfo(
                url=pkg["url"],
                filename=pkg["filename"],
                name=pkg["name"],
                library=self.library_name,
                category=pkg["category"],
                author="Chris Johnson",
                version=pkg.get("version", "latest"),
                license="MIT",
                description=pkg["description"],
                tags=pkg.get("tags", ["free", "airwindows"]),
                platform="linux",
                homepage="https://www.airwindows.com"
            )
            self.discovered_plugins.append(plugin_info)

        # Try to fetch releases from GitHub API
        try:
            await self._rate_limit()
            releases = await self._fetch_github_releases()

            for release in releases[:10]:  # Limit to recent releases
                assets = release.get("assets", [])
                for asset in assets:
                    name = asset.get("name", "")
                    # Only include Linux VST3 packages
                    if "linux" in name.lower() and (name.endswith('.zip') or name.endswith('.tar.gz')):
                        # Skip if already in known packages
                        if any(p.filename == name for p in self.discovered_plugins):
                            continue

                        plugin_name = name.replace("-linux", "").replace(".zip", "").replace(".tar.gz", "")

                        plugin_info = VST3PluginInfo(
                            url=asset.get("browser_download_url", ""),
                            filename=name,
                            name=plugin_name,
                            library=self.library_name,
                            category=self._guess_category(plugin_name),
                            author="Chris Johnson",
                            version=release.get("tag_name", "unknown"),
                            license="MIT",
                            description=f"Airwindows {plugin_name} plugin",
                            tags=["free", "airwindows"],
                            file_size_bytes=asset.get("size"),
                            platform="linux",
                            homepage="https://www.airwindows.com"
                        )
                        self.discovered_plugins.append(plugin_info)

        except Exception as e:
            logger.warning(f"Could not fetch GitHub releases: {e}")

        self._stats["total_discovered"] = len(self.discovered_plugins)
        self._stats["last_discovery"] = datetime.now().isoformat()

        logger.info(f"Discovered {len(self.discovered_plugins)} plugin packages from {self.library_name}")
        return self.discovered_plugins

    async def _fetch_github_releases(self) -> List[dict]:
        """Fetch releases from GitHub API.

        Returns:
            List of release dicts from GitHub API
        """
        async with aiohttp.ClientSession() as session:
            headers = {
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "MAP2-Audio-VST3-Scraper/1.0"
            }

            url = f"{self.API_URL}/repos/{self.REPO}/releases"
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    logger.warning(f"GitHub API returned {response.status}")
                    return []

    async def download_file(self, plugin_info: VST3PluginInfo, output_path: str,
                           progress_callback: Optional[Callable[[float], None]] = None) -> bool:
        """Download plugin package from GitHub.

        Args:
            plugin_info: Plugin information with URL
            output_path: Local path to save file
            progress_callback: Optional callback for progress (0.0-1.0)

        Returns:
            True if download succeeded
        """
        try:
            output_dir = os.path.dirname(output_path)
            if output_dir:
                os.makedirs(output_dir, exist_ok=True)

            status = DownloadStatus(
                plugin_info=plugin_info,
                state=DownloadState.DOWNLOADING,
                started_at=datetime.now()
            )
            self.download_progress[plugin_info.filename] = status

            async with aiohttp.ClientSession() as session:
                headers = {
                    "User-Agent": "MAP2-Audio-VST3-Scraper/1.0"
                }

                async with session.get(plugin_info.url, headers=headers, allow_redirects=True) as response:
                    if response.status != 200:
                        logger.error(f"Download failed: HTTP {response.status} for {plugin_info.url}")
                        status.state = DownloadState.FAILED
                        status.error_message = f"HTTP {response.status}"
                        return False

                    total_size = int(response.headers.get('content-length', 0))
                    downloaded = 0
                    start_time = datetime.now()

                    with open(output_path, 'wb') as f:
                        async for chunk in response.content.iter_chunked(8192):
                            if self._cancel_requested:
                                logger.info(f"Download cancelled: {plugin_info.filename}")
                                status.state = DownloadState.CANCELLED
                                return False

                            f.write(chunk)
                            downloaded += len(chunk)

                            if total_size > 0:
                                progress = downloaded / total_size
                                status.progress = progress
                                status.bytes_downloaded = downloaded

                                elapsed = (datetime.now() - start_time).total_seconds()
                                if elapsed > 0:
                                    status.speed_bps = downloaded / elapsed

                                if progress_callback:
                                    progress_callback(progress)

            status.state = DownloadState.COMPLETED
            status.completed_at = datetime.now()
            status.progress = 1.0

            logger.info(f"Downloaded: {plugin_info.filename} ({downloaded} bytes)")
            return True

        except Exception as e:
            logger.error(f"Error downloading {plugin_info.filename}: {e}")
            if plugin_info.filename in self.download_progress:
                self.download_progress[plugin_info.filename].state = DownloadState.FAILED
                self.download_progress[plugin_info.filename].error_message = str(e)
            return False
