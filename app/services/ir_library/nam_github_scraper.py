"""
NAM Models GitHub Repository Scraper
Download NAM models from the community GitHub repository.

Source: https://github.com/pelennor2170/NAM_models
License: Various (check individual model licenses)

Features:
- GitHub API integration with rate limiting
- Organized by amp brand and type
- Community-curated collection
- Direct .nam file downloads
"""

import logging
import aiohttp
import os
from typing import List, Optional, Callable, Dict, Any
from datetime import datetime

from .scraper_base import IRScraperBase, IRFileInfo, DownloadStatus, DownloadState

logger = logging.getLogger(__name__)


class NAMGitHubScraper(IRScraperBase):
    """Scraper for community NAM models on GitHub.

    Downloads Neural Amp Modeler models from the pelennor2170/NAM_models
    repository, which collects community-submitted amp models.

    Features:
    - Organized by brand (Fender, Marshall, Mesa, etc.)
    - GitHub API for efficient discovery
    - Automatic category detection from folder structure
    - Progress tracking and resumable downloads
    """

    REPO_OWNER = "pelennor2170"
    REPO_NAME = "NAM_models"
    GITHUB_API_BASE = "https://api.github.com"
    GITHUB_RAW_BASE = "https://raw.githubusercontent.com"

    # GitHub rate limits
    GITHUB_RATE_LIMIT = 50
    GITHUB_RATE_PERIOD = 3600.0

    def __init__(self, github_token: Optional[str] = None):
        """Initialize NAM GitHub scraper.

        Args:
            github_token: Optional GitHub personal access token for higher rate limits
        """
        super().__init__(
            library_name="nam_github",
            base_url=f"https://github.com/{self.REPO_OWNER}/{self.REPO_NAME}",
            rate_limit_requests=self.GITHUB_RATE_LIMIT,
            rate_limit_period=self.GITHUB_RATE_PERIOD
        )

        self.github_token = github_token

        # Brand/category mapping
        self.category_map = {
            'fender': 'Fender',
            'marshall': 'Marshall',
            'mesa': 'Mesa Boogie',
            'mesa-boogie': 'Mesa Boogie',
            'vox': 'Vox',
            'orange': 'Orange',
            'peavey': 'Peavey',
            'soldano': 'Soldano',
            'engl': 'ENGL',
            'bogner': 'Bogner',
            'diezel': 'Diezel',
            'friedman': 'Friedman',
            'evh': 'EVH',
            'hughes-kettner': 'Hughes & Kettner',
            'laney': 'Laney',
            'blackstar': 'Blackstar',
            'victory': 'Victory',
            'pedals': 'Pedals',
            'preamps': 'Preamps',
            'other': 'Other Amps',
        }

        # Cache
        self._tree_cache: Optional[List[Dict[str, Any]]] = None
        self._tree_cache_time: Optional[datetime] = None
        self._cache_ttl_seconds = 3600

    def _get_headers(self) -> Dict[str, str]:
        """Get HTTP headers for GitHub API requests."""
        headers = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "MAP2-Audio-NAM-Scraper/1.0"
        }
        if self.github_token:
            headers["Authorization"] = f"token {self.github_token}"
        return headers

    async def discover_irs(self) -> List[IRFileInfo]:
        """Discover NAM models from GitHub repository.

        Uses the GitHub Trees API to efficiently list all .nam files.

        Returns:
            List of discovered NAM model files
        """
        logger.info(f"Discovering NAM models from {self.library_name}")

        # Check cache
        if self._is_cache_valid():
            logger.debug("Using cached repository tree")
            return self._parse_tree(self._tree_cache or [])

        self.discovered_files = []

        try:
            await self._rate_limit()

            async with aiohttp.ClientSession() as session:
                # Try main branch first, then master
                for branch in ['main', 'master']:
                    tree_url = f"{self.GITHUB_API_BASE}/repos/{self.REPO_OWNER}/{self.REPO_NAME}/git/trees/{branch}?recursive=1"

                    async with session.get(tree_url, headers=self._get_headers()) as response:
                        if response.status == 403:
                            logger.error("GitHub API rate limit exceeded")
                            return []

                        if response.status == 404:
                            continue  # Try next branch

                        if response.status != 200:
                            logger.error(f"GitHub API error: {response.status}")
                            continue

                        data = await response.json()
                        tree = data.get('tree', [])

                        if tree:
                            self._tree_cache = tree
                            self._tree_cache_time = datetime.now()
                            self._branch = branch
                            self.discovered_files = self._parse_tree(tree)
                            break

            self._stats["total_discovered"] = len(self.discovered_files)
            self._stats["last_discovery"] = datetime.now().isoformat()

            logger.info(f"Discovered {len(self.discovered_files)} NAM models from {self.library_name}")
            return self.discovered_files

        except aiohttp.ClientError as e:
            logger.error(f"Network error discovering NAM models: {e}")
            return []
        except Exception as e:
            logger.error(f"Error discovering NAM models: {e}")
            return []

    def _is_cache_valid(self) -> bool:
        """Check if the tree cache is still valid."""
        if not self._tree_cache or not self._tree_cache_time:
            return False
        age = (datetime.now() - self._tree_cache_time).total_seconds()
        return age < self._cache_ttl_seconds

    def _parse_tree(self, tree: List[Dict[str, Any]]) -> List[IRFileInfo]:
        """Parse GitHub tree into IRFileInfo objects."""
        files = []
        for item in tree:
            path = item.get('path', '')
            # Look for .nam files
            if path.lower().endswith('.nam'):
                file_info = self._create_file_info(path, item)
                if file_info:
                    files.append(file_info)
        return files

    def _create_file_info(self, path: str, item: Dict[str, Any]) -> Optional[IRFileInfo]:
        """Create IRFileInfo from GitHub tree item.

        Args:
            path: File path in repository
            item: GitHub tree item

        Returns:
            IRFileInfo or None
        """
        parts = path.split('/')
        category = "Uncategorized"
        subcategory = None

        # Parse category from folder structure
        if len(parts) > 1:
            folder = parts[0].lower().replace('_', '-')
            category = self.category_map.get(folder, folder.replace('-', ' ').title())
            if len(parts) > 2:
                subcategory = parts[1].replace('_', ' ').replace('-', ' ').title()

        # Get branch (default to main)
        branch = getattr(self, '_branch', 'main')

        # Build raw file URL
        url = f"{self.GITHUB_RAW_BASE}/{self.REPO_OWNER}/{self.REPO_NAME}/{branch}/{path}"

        filename = os.path.basename(path)
        name = os.path.splitext(filename)[0].replace('_', ' ').replace('-', ' ')

        return IRFileInfo(
            url=url,
            filename=filename,
            library=self.library_name,
            category=category,
            subcategory=subcategory,
            author="Community",
            license="Various (check model)",
            description=f"{name} - NAM model from GitHub community collection",
            tags=['nam', 'neural-amp-modeler', 'github', category.lower()],
            file_size_bytes=item.get('size'),
        )

    async def download_file(self, file_info: IRFileInfo, output_path: str,
                           progress_callback: Optional[Callable[[float], None]] = None) -> bool:
        """Download NAM model file from GitHub.

        Args:
            file_info: File information with URL
            output_path: Local path to save file
            progress_callback: Optional callback for progress

        Returns:
            True if download succeeded
        """
        try:
            output_dir = os.path.dirname(output_path)
            if output_dir:
                os.makedirs(output_dir, exist_ok=True)

            status = DownloadStatus(
                file_info=file_info,
                state=DownloadState.DOWNLOADING,
                started_at=datetime.now()
            )
            self.download_progress[file_info.filename] = status

            async with aiohttp.ClientSession() as session:
                async with session.get(file_info.url, headers=self._get_headers()) as response:
                    if response.status != 200:
                        logger.error(f"Download failed: HTTP {response.status} for {file_info.url}")
                        status.state = DownloadState.FAILED
                        status.error_message = f"HTTP {response.status}"
                        return False

                    total_size = int(response.headers.get('content-length', 0))
                    downloaded = 0
                    start_time = datetime.now()

                    with open(output_path, 'wb') as f:
                        async for chunk in response.content.iter_chunked(8192):
                            if self._cancel_requested:
                                logger.info(f"Download cancelled: {file_info.filename}")
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

            logger.info(f"Downloaded: {file_info.filename} ({downloaded} bytes)")
            return True

        except Exception as e:
            logger.error(f"Error downloading {file_info.filename}: {e}")
            if file_info.filename in self.download_progress:
                self.download_progress[file_info.filename].state = DownloadState.FAILED
                self.download_progress[file_info.filename].error_message = str(e)
            return False

    def clear_cache(self) -> None:
        """Clear the repository tree cache."""
        self._tree_cache = None
        self._tree_cache_time = None
        logger.debug("Repository cache cleared")
