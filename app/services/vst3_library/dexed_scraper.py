"""
Dexed VST3 Scraper

Scrapes VST3 plugins from the Dexed DX7 emulator GitHub repository.
Dexed is a multi-platform FM synthesizer closely modeled on the Yamaha DX7.
"""

import logging
import aiohttp
from typing import List, Optional
from datetime import datetime

from .scraper_base import VST3ScraperBase, VST3PluginInfo

logger = logging.getLogger(__name__)


class DexedScraper(VST3ScraperBase):
    """Scraper for Dexed DX7 FM synthesizer.

    Dexed features:
    - Accurate DX7 emulation
    - FM synthesis with 6 operators
    - Compatible with original DX7 patches
    - Built-in patch browser
    """

    BASE_URL = "https://github.com"
    API_URL = "https://api.github.com"
    REPO = "asb2m10/dexed"

    def __init__(self):
        """Initialize Dexed scraper."""
        super().__init__(
            library_name="dexed",
            base_url=self.BASE_URL,
            rate_limit_requests=10,
            rate_limit_period=1.0
        )

    async def discover_plugins(self) -> List[VST3PluginInfo]:
        """Discover Dexed from GitHub releases.

        Returns:
            List of discovered plugin packages
        """
        logger.info(f"Discovering plugins from {self.library_name}")

        self.discovered_plugins = []

        try:
            await self._rate_limit()
            release = await self._fetch_latest_release()

            if release:
                assets = release.get("assets", [])
                version = release.get("tag_name", "unknown")

                for asset in assets:
                    name = asset.get("name", "")
                    # Look for Linux packages - prefer tar.gz or zip with linux in name
                    if "linux" in name.lower():
                        if name.endswith(('.tar.gz', '.zip')) or 'x86_64' in name.lower():
                            plugin_info = VST3PluginInfo(
                                url=asset.get("browser_download_url", ""),
                                filename=name,
                                name="Dexed",
                                library=self.library_name,
                                category="Synthesizer",
                                author="Digital Suburban",
                                version=version,
                                license="GPL-3.0",
                                description="DX7 FM synthesizer emulation with full compatibility",
                                tags=["synth", "fm", "dx7", "yamaha", "vintage", "free"],
                                file_size_bytes=asset.get("size"),
                                platform="linux",
                                homepage="https://asb2m10.github.io/dexed/"
                            )
                            self.discovered_plugins.append(plugin_info)
                            break  # One package is enough

        except Exception as e:
            logger.warning(f"Could not fetch GitHub releases for Dexed: {e}")

        self._stats["total_discovered"] = len(self.discovered_plugins)
        self._stats["last_discovery"] = datetime.now().isoformat()

        logger.info(f"Discovered {len(self.discovered_plugins)} plugin packages from {self.library_name}")
        return self.discovered_plugins

    async def _fetch_latest_release(self) -> Optional[dict]:
        """Fetch latest release from GitHub API."""
        async with aiohttp.ClientSession() as session:
            headers = {
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "MAP2-Audio-VST3-Scraper/1.0"
            }

            url = f"{self.API_URL}/repos/{self.REPO}/releases/latest"
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    return await response.json()
                return None

    async def download_file(
        self,
        plugin_info: VST3PluginInfo,
        dest_path: str,
        progress_callback: Optional[callable] = None
    ) -> bool:
        """Download a plugin file with progress tracking.

        Args:
            plugin_info: Plugin to download
            dest_path: Destination file path
            progress_callback: Optional callback for progress updates

        Returns:
            True if download succeeded
        """
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(plugin_info.url) as response:
                    if response.status != 200:
                        logger.error(f"Download failed: HTTP {response.status}")
                        return False

                    total_size = int(response.headers.get('content-length', 0))
                    downloaded = 0

                    with open(dest_path, 'wb') as f:
                        async for chunk in response.content.iter_chunked(8192):
                            f.write(chunk)
                            downloaded += len(chunk)

                            if progress_callback and total_size:
                                progress = (downloaded / total_size) * 100
                                progress_callback(progress, downloaded, total_size)

                    return True

        except Exception as e:
            logger.error(f"Download error for {plugin_info.name}: {e}")
            return False
