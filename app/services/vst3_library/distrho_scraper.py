"""
DISTRHO Ports VST3 Scraper
Download free DISTRHO ported plugins from GitHub releases.

Source: https://github.com/DISTRHO/Cardinal
License: GPL-3.0
Author: DISTRHO Team

Features:
- Cardinal (VCV Rack as a plugin)
- Ported classic plugins
- Cross-platform builds
"""

import logging
import aiohttp
import os
from typing import List, Optional, Callable
from datetime import datetime

from .scraper_base import VST3ScraperBase, VST3PluginInfo, DownloadStatus, DownloadState

logger = logging.getLogger(__name__)


class DISTRHOScraper(VST3ScraperBase):
    """Scraper for DISTRHO plugins.

    DISTRHO provides high-quality ports of classic plugins
    and original creations including:
    - Cardinal (VCV Rack as a plugin)
    - Classic effect ports
    - Mini Series plugins
    """

    BASE_URL = "https://github.com"
    API_URL = "https://api.github.com"

    # Multiple DISTRHO repositories with plugins
    REPOS = [
        {
            "repo": "DISTRHO/Cardinal",
            "name": "Cardinal",
            "category": "Modular",
            "description": "VCV Rack as a plugin - virtual modular synthesizer",
            "tags": ["modular", "synth", "vcv", "rack", "free"],
        },
        {
            "repo": "DISTRHO/DISTRHO-Ports",
            "name": "DISTRHO Ports",
            "category": "Multi-Effect",
            "description": "Collection of ported classic plugins",
            "tags": ["ports", "classic", "free"],
        },
        {
            "repo": "DISTRHO/DPF-Plugins",
            "name": "DPF Plugins",
            "category": "Multi-Effect",
            "description": "DPF plugin collection - Mini series and more",
            "tags": ["dpf", "mini", "free"],
        },
    ]

    def __init__(self):
        """Initialize DISTRHO scraper."""
        super().__init__(
            library_name="distrho",
            base_url=self.BASE_URL,
            rate_limit_requests=10,
            rate_limit_period=1.0
        )

    async def discover_plugins(self) -> List[VST3PluginInfo]:
        """Discover plugins from DISTRHO GitHub repositories.

        Returns:
            List of discovered plugin packages
        """
        logger.info(f"Discovering plugins from {self.library_name}")

        self.discovered_plugins = []

        for repo_info in self.REPOS:
            try:
                await self._rate_limit()
                release = await self._fetch_latest_release(repo_info["repo"])

                if release:
                    assets = release.get("assets", [])
                    version = release.get("tag_name", "unknown")

                    for asset in assets:
                        name = asset.get("name", "")
                        # Look for Linux VST3 packages
                        if "linux" in name.lower() and ("vst3" in name.lower() or name.endswith(('.tar.gz', '.zip'))):
                            if 'x86_64' in name.lower() or 'amd64' in name.lower():
                                plugin_info = VST3PluginInfo(
                                    url=asset.get("browser_download_url", ""),
                                    filename=name,
                                    name=repo_info["name"],
                                    library=self.library_name,
                                    category=repo_info["category"],
                                    author="DISTRHO Team",
                                    version=version,
                                    license="GPL-3.0",
                                    description=repo_info["description"],
                                    tags=repo_info["tags"],
                                    file_size_bytes=asset.get("size"),
                                    platform="linux",
                                    homepage=f"https://github.com/{repo_info['repo']}"
                                )
                                self.discovered_plugins.append(plugin_info)
                                break  # One per repo

            except Exception as e:
                logger.warning(f"Could not fetch releases for {repo_info['repo']}: {e}")

        self._stats["total_discovered"] = len(self.discovered_plugins)
        self._stats["last_discovery"] = datetime.now().isoformat()

        logger.info(f"Discovered {len(self.discovered_plugins)} plugin packages from {self.library_name}")
        return self.discovered_plugins

    async def _fetch_latest_release(self, repo: str) -> Optional[dict]:
        """Fetch latest release from GitHub API."""
        async with aiohttp.ClientSession() as session:
            headers = {
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "MAP2-Audio-VST3-Scraper/1.0"
            }

            url = f"{self.API_URL}/repos/{repo}/releases/latest"
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    return await response.json()
                return None

    async def download_file(self, plugin_info: VST3PluginInfo, output_path: str,
                           progress_callback: Optional[Callable[[float], None]] = None) -> bool:
        """Download plugin package from GitHub."""
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
                headers = {"User-Agent": "MAP2-Audio-VST3-Scraper/1.0"}

                async with session.get(plugin_info.url, headers=headers, allow_redirects=True) as response:
                    if response.status != 200:
                        status.state = DownloadState.FAILED
                        status.error_message = f"HTTP {response.status}"
                        return False

                    total_size = int(response.headers.get('content-length', 0))
                    downloaded = 0
                    start_time = datetime.now()

                    with open(output_path, 'wb') as f:
                        async for chunk in response.content.iter_chunked(8192):
                            if self._cancel_requested:
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
            return True

        except Exception as e:
            logger.error(f"Error downloading {plugin_info.filename}: {e}")
            if plugin_info.filename in self.download_progress:
                self.download_progress[plugin_info.filename].state = DownloadState.FAILED
                self.download_progress[plugin_info.filename].error_message = str(e)
            return False
