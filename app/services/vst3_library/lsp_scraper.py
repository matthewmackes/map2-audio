"""
LSP Plugins VST3 Scraper
Download free LSP (Linux Studio Plugins) from GitHub releases.

Source: https://github.com/sadko4u/lsp-plugins
License: LGPL-3.0
Author: Vladimir Sadovnikov

Features:
- Professional-grade audio plugins
- Parametric EQ, Compressors, Limiters
- Spectrum analyzer, Oscilloscope
- Convolution reverb, Delay lines
"""

import logging
import aiohttp
import os
from typing import List, Optional, Callable
from datetime import datetime

from .scraper_base import VST3ScraperBase, VST3PluginInfo, DownloadStatus, DownloadState

logger = logging.getLogger(__name__)


class LSPPluginsScraper(VST3ScraperBase):
    """Scraper for LSP (Linux Studio Plugins).

    LSP Plugins is a collection of professional-grade audio plugins
    for Linux, including:
    - Parametric and graphic equalizers
    - Dynamic processors (compressors, limiters, gates)
    - Delay and reverb effects
    - Analysis tools (spectrum, oscilloscope)
    - Samplers and sound generators
    """

    BASE_URL = "https://github.com"
    API_URL = "https://api.github.com"
    REPO = "lsp-plugins/lsp-plugins"  # Repo moved from sadko4u

    # Known stable packages (fallback if API fails)
    KNOWN_PACKAGES = [
        {
            "name": "LSP Plugins Bundle",
            "filename": "lsp-plugins-1.2.26-Linux-x86_64.7z",
            "url": "https://github.com/lsp-plugins/lsp-plugins/releases/download/1.2.26/lsp-plugins-1.2.26-Linux-x86_64.7z",
            "category": "Multi-Effect",
            "description": "Complete LSP Plugins bundle - Professional audio processing suite",
            "tags": ["eq", "compressor", "limiter", "reverb", "analyzer", "professional", "free"],
            "version": "1.2.26",
        },
    ]

    # Plugin names and their categories
    PLUGIN_CATEGORIES = {
        "eq": ["Equalizer", "Graphic EQ", "Para EQ", "Filter"],
        "dynamics": ["Compressor", "Gate", "Expander", "Limiter", "Dynamic"],
        "reverb": ["Impulse", "Room", "Reverb"],
        "delay": ["Delay", "Slap", "Artistic"],
        "analyzer": ["Analyzer", "Spectrum", "Oscilloscope", "Phase", "Correlometer"],
        "generator": ["Generator", "Oscillator", "Noise"],
        "sampler": ["Sampler", "Trigger", "Kick"],
        "utility": ["Latency", "Meter", "Profiler"],
    }

    def __init__(self):
        """Initialize LSP Plugins scraper."""
        super().__init__(
            library_name="lsp-plugins",
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
        """Discover plugins from LSP Plugins GitHub releases.

        Returns:
            List of discovered plugin packages
        """
        logger.info(f"Discovering plugins from {self.library_name}")

        self.discovered_plugins = []

        # Try to fetch latest release from GitHub API
        try:
            await self._rate_limit()
            release = await self._fetch_latest_release()

            if release:
                assets = release.get("assets", [])
                version = release.get("tag_name", "unknown")

                for asset in assets:
                    name = asset.get("name", "")
                    # LSP now provides combined bundles (not separate VST3)
                    # Look for Linux x86_64 package (e.g., lsp-plugins-1.2.26-Linux-x86_64.7z)
                    if "linux" in name.lower() and "x86_64" in name.lower() and name.endswith(".7z"):
                        # Skip doc and src packages
                        if "-doc-" in name or "-src-" in name:
                            continue
                        plugin_info = VST3PluginInfo(
                            url=asset.get("browser_download_url", ""),
                            filename=name,
                            name="LSP Plugins Bundle",
                            library=self.library_name,
                            category="Multi-Effect",
                            author="Vladimir Sadovnikov",
                            version=version,
                            license="LGPL-3.0",
                            description="Complete LSP Plugins bundle - Professional EQ, compressors, limiters, reverbs, and analyzers",
                            tags=["eq", "compressor", "limiter", "reverb", "analyzer", "professional", "free"],
                            file_size_bytes=asset.get("size"),
                            platform="linux",
                            homepage="https://lsp-plug.in/"
                        )
                        self.discovered_plugins.append(plugin_info)
                        break  # Only need one package

        except Exception as e:
            logger.warning(f"Could not fetch GitHub releases: {e}")

        # Fall back to known packages if API fails
        if not self.discovered_plugins:
            for pkg in self.KNOWN_PACKAGES:
                plugin_info = VST3PluginInfo(
                    url=pkg["url"],
                    filename=pkg["filename"],
                    name=pkg["name"],
                    library=self.library_name,
                    category=pkg["category"],
                    author="Vladimir Sadovnikov",
                    version=pkg.get("version", "latest"),
                    license="LGPL-3.0",
                    description=pkg["description"],
                    tags=pkg.get("tags", ["free", "lsp"]),
                    platform="linux",
                    homepage="https://lsp-plug.in/"
                )
                self.discovered_plugins.append(plugin_info)

        self._stats["total_discovered"] = len(self.discovered_plugins)
        self._stats["last_discovery"] = datetime.now().isoformat()

        logger.info(f"Discovered {len(self.discovered_plugins)} plugin packages from {self.library_name}")
        return self.discovered_plugins

    async def _fetch_latest_release(self) -> Optional[dict]:
        """Fetch latest release from GitHub API.

        Returns:
            Release dict from GitHub API or None
        """
        async with aiohttp.ClientSession() as session:
            headers = {
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "MAP2-Audio-VST3-Scraper/1.0"
            }

            url = f"{self.API_URL}/repos/{self.REPO}/releases/latest"
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    logger.warning(f"GitHub API returned {response.status}")
                    return None

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
