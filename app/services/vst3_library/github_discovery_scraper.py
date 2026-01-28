"""
GitHub VST3 Discovery Scraper

Deep searches GitHub for VST3 plugins using topic-based discovery.
Finds open-source VST3 plugins that provide Linux builds.
"""

import logging
import aiohttp
import asyncio
from typing import List, Optional, Set
from datetime import datetime

from .scraper_base import VST3ScraperBase, VST3PluginInfo

logger = logging.getLogger(__name__)


class GitHubDiscoveryScraper(VST3ScraperBase):
    """Scraper that discovers VST3 plugins from GitHub topics and searches.

    Uses GitHub's search API to find repositories tagged with:
    - vst3-plugin
    - vst3
    - audio-plugin
    - synthesizer (with vst3 in readme/description)

    Filters for Linux-compatible releases.
    """

    BASE_URL = "https://github.com"
    API_URL = "https://api.github.com"

    # Topics to search for VST3 plugins
    TOPICS = [
        "vst3-plugin",
        "vst3",
        "audio-plugin",
        "juce-plugin",
    ]

    # Search queries for finding VST3 plugins
    SEARCH_QUERIES = [
        "vst3 linux synthesizer",
        "vst3 linux effect",
        "vst3 plugin linux",
        "audio plugin linux vst3",
    ]

    # Known repositories to skip (already covered by dedicated scrapers)
    SKIP_REPOS = {
        "airwindows/airwindows",
        "sadko4u/lsp-plugins",
        "surge-synthesizer/surge",
        "DISTRHO/Cardinal",
        "DISTRHO/DISTRHO-Ports",
        "DISTRHO/DPF-Plugins",
        "mtytel/vital",
        "asb2m10/dexed",
        "TheWaveWarden/odin2",
        "jatinchowdhury18/AnalogTapeModel",
        "Chowdhury-DSP/ChowMatrix",
        "jatinchowdhury18/KlonCentaur",
        "surge-synthesizer/OB-Xf",
        "reales/OB-Xd",
    }

    # Category mapping based on keywords
    CATEGORY_KEYWORDS = {
        "Synthesizer": ["synth", "synthesizer", "oscillator", "wavetable", "fm"],
        "Distortion": ["distortion", "overdrive", "saturation", "amp", "tube", "fuzz"],
        "Delay": ["delay", "echo"],
        "Reverb": ["reverb", "room", "hall", "plate"],
        "Dynamics": ["compressor", "limiter", "gate", "expander", "dynamics"],
        "EQ": ["eq", "equalizer", "filter", "tone"],
        "Modulation": ["chorus", "flanger", "phaser", "vibrato", "tremolo"],
        "Utility": ["utility", "meter", "analyzer", "tuner", "gain"],
    }

    def __init__(self):
        """Initialize GitHub discovery scraper."""
        super().__init__(
            library_name="github-discovery",
            base_url=self.BASE_URL,
            rate_limit_requests=5,  # GitHub API has stricter limits
            rate_limit_period=2.0
        )
        self._seen_repos: Set[str] = set()

    def _guess_category(self, name: str, description: str) -> str:
        """Guess plugin category from name and description."""
        text = f"{name} {description}".lower()
        for category, keywords in self.CATEGORY_KEYWORDS.items():
            for keyword in keywords:
                if keyword in text:
                    return category
        return "Effect"

    async def discover_plugins(self) -> List[VST3PluginInfo]:
        """Discover VST3 plugins from GitHub topics and searches.

        Returns:
            List of discovered plugin packages
        """
        logger.info(f"Discovering plugins from {self.library_name}")

        self.discovered_plugins = []
        self._seen_repos = set(self.SKIP_REPOS)

        # Search by topics
        for topic in self.TOPICS:
            try:
                await self._rate_limit()
                repos = await self._search_by_topic(topic)
                await self._process_repositories(repos)
            except Exception as e:
                logger.warning(f"Error searching topic {topic}: {e}")

        # Search by queries
        for query in self.SEARCH_QUERIES:
            try:
                await self._rate_limit()
                repos = await self._search_repositories(query)
                await self._process_repositories(repos)
            except Exception as e:
                logger.warning(f"Error searching query '{query}': {e}")

        self._stats["total_discovered"] = len(self.discovered_plugins)
        self._stats["last_discovery"] = datetime.now().isoformat()

        logger.info(f"Discovered {len(self.discovered_plugins)} plugin packages from {self.library_name}")
        return self.discovered_plugins

    async def _search_by_topic(self, topic: str) -> List[dict]:
        """Search repositories by topic."""
        async with aiohttp.ClientSession() as session:
            headers = {
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "MAP2-Audio-VST3-Scraper/1.0"
            }

            url = f"{self.API_URL}/search/repositories"
            params = {
                "q": f"topic:{topic}",
                "sort": "stars",
                "order": "desc",
                "per_page": 30,
            }

            async with session.get(url, headers=headers, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("items", [])
                return []

    async def _search_repositories(self, query: str) -> List[dict]:
        """Search repositories by query string."""
        async with aiohttp.ClientSession() as session:
            headers = {
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "MAP2-Audio-VST3-Scraper/1.0"
            }

            url = f"{self.API_URL}/search/repositories"
            params = {
                "q": query,
                "sort": "stars",
                "order": "desc",
                "per_page": 20,
            }

            async with session.get(url, headers=headers, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("items", [])
                return []

    async def _process_repositories(self, repos: List[dict]) -> None:
        """Process discovered repositories and extract plugin info."""
        for repo in repos:
            full_name = repo.get("full_name", "")

            # Skip already processed or known repos
            if full_name in self._seen_repos:
                continue

            self._seen_repos.add(full_name)

            # Check if repo looks like an audio plugin
            description = repo.get("description", "") or ""
            name = repo.get("name", "")

            if not self._looks_like_audio_plugin(name, description):
                continue

            # Try to find Linux releases
            try:
                await self._rate_limit()
                release = await self._fetch_latest_release(full_name)

                if release:
                    linux_asset = self._find_linux_asset(release.get("assets", []))
                    if linux_asset:
                        plugin_info = VST3PluginInfo(
                            url=linux_asset.get("browser_download_url", ""),
                            filename=linux_asset.get("name", ""),
                            name=name.replace("-", " ").replace("_", " ").title(),
                            library=self.library_name,
                            category=self._guess_category(name, description),
                            author=repo.get("owner", {}).get("login", "Unknown"),
                            version=release.get("tag_name", "unknown"),
                            license=repo.get("license", {}).get("spdx_id", "Unknown") if repo.get("license") else "Unknown",
                            description=description[:200] if description else None,
                            tags=["github", "open-source", "free"],
                            file_size_bytes=linux_asset.get("size"),
                            platform="linux",
                            homepage=repo.get("html_url", "")
                        )
                        self.discovered_plugins.append(plugin_info)
                        logger.info(f"Found plugin: {plugin_info.name} from {full_name}")

            except Exception as e:
                logger.debug(f"Could not process releases for {full_name}: {e}")

    def _looks_like_audio_plugin(self, name: str, description: str) -> bool:
        """Check if repo looks like an audio plugin project."""
        text = f"{name} {description}".lower()

        # Must have some audio-related keywords
        audio_keywords = ["vst", "audio", "plugin", "synth", "effect", "daw", "music"]
        has_audio = any(kw in text for kw in audio_keywords)

        # Should not be a library or framework (we want actual plugins)
        exclude_keywords = ["sdk", "framework", "library", "template", "example", "tutorial"]
        is_framework = any(kw in text for kw in exclude_keywords)

        return has_audio and not is_framework

    def _find_linux_asset(self, assets: List[dict]) -> Optional[dict]:
        """Find a Linux-compatible asset from release assets."""
        for asset in assets:
            name = asset.get("name", "").lower()

            # Must be Linux
            if "linux" not in name:
                continue

            # Should be an archive
            if not any(name.endswith(ext) for ext in ['.tar.gz', '.zip', '.tar.xz', '.deb']):
                continue

            # Prefer 64-bit
            if 'x86_64' in name or 'amd64' in name or 'linux' in name:
                return asset

        return None

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
