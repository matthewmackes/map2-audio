"""
SFZ Instruments GitHub Scraper
Download SFZ instruments from the sfzinstruments GitHub organization.

Source: https://github.com/sfzinstruments
License: Various (mostly CC-BY, CC0, Public Domain)

Features:
- GitHub API integration with rate limiting
- Organization-wide repository discovery
- SFZ and SF2 file detection
- Category extraction from repository names
"""

import logging
import aiohttp
import os
from typing import List, Optional, Callable, Dict, Any
from datetime import datetime

from .scraper_base import SFScraperBase, SFFileInfo, DownloadStatus, DownloadState

logger = logging.getLogger(__name__)


class SFZInstrumentsScraper(SFScraperBase):
    """Scraper for SFZ Instruments GitHub organization.

    Downloads SFZ and SF2 instruments from the sfzinstruments organization,
    which hosts open-source musical instruments.

    Features:
    - Scans multiple repositories in the organization
    - Automatic category detection from repository names
    - GitHub API for efficient discovery
    - Progress tracking and resumable downloads
    """

    GITHUB_ORG = "sfzinstruments"
    GITHUB_API_BASE = "https://api.github.com"
    GITHUB_RAW_BASE = "https://raw.githubusercontent.com"

    # GitHub rate limits (unauthenticated)
    GITHUB_RATE_LIMIT = 30
    GITHUB_RATE_PERIOD = 3600.0

    # Popular/notable repositories to prioritize
    PRIORITY_REPOS = [
        "SplendidGrandPiano",
        "GregSullivan.E-Pianos",
        "jlearman.jRhodes3c",
        "EthanWiner.Soundfonts",
        "VersilianStudios.Upright-Piano",
        "karoryfer.bear-sax",
        "VersilianStudios.Ethereal-Choirs",
    ]

    # Category mapping from repo name patterns
    CATEGORY_MAP = {
        'piano': 'Piano',
        'grand': 'Piano',
        'upright': 'Piano',
        'rhodes': 'Electric Piano',
        'e-piano': 'Electric Piano',
        'wurlitzer': 'Electric Piano',
        'organ': 'Organ',
        'guitar': 'Guitar',
        'bass': 'Bass',
        'drums': 'Drums',
        'percussion': 'Percussion',
        'strings': 'Strings',
        'violin': 'Strings',
        'cello': 'Strings',
        'viola': 'Strings',
        'choir': 'Choir',
        'vocal': 'Choir',
        'brass': 'Brass',
        'trumpet': 'Brass',
        'trombone': 'Brass',
        'horn': 'Brass',
        'woodwind': 'Woodwind',
        'flute': 'Woodwind',
        'clarinet': 'Woodwind',
        'sax': 'Woodwind',
        'oboe': 'Woodwind',
        'synth': 'Synthesizer',
        'pad': 'Synthesizer',
        'soundfont': 'General MIDI',
        'gm': 'General MIDI',
    }

    def __init__(self, github_token: Optional[str] = None):
        """Initialize SFZ Instruments scraper.

        Args:
            github_token: Optional GitHub personal access token for higher rate limits
        """
        super().__init__(
            library_name="sfzinstruments",
            base_url=f"https://github.com/{self.GITHUB_ORG}",
            rate_limit_requests=self.GITHUB_RATE_LIMIT,
            rate_limit_period=self.GITHUB_RATE_PERIOD
        )

        self.github_token = github_token

        # Cache
        self._repos_cache: Optional[List[Dict[str, Any]]] = None
        self._repos_cache_time: Optional[datetime] = None
        self._cache_ttl_seconds = 3600

    def _get_headers(self) -> Dict[str, str]:
        """Get HTTP headers for GitHub API requests."""
        headers = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "MAP2-Audio-SoundFont-Scraper/1.0"
        }
        if self.github_token:
            headers["Authorization"] = f"token {self.github_token}"
        return headers

    async def discover_soundfonts(self) -> List[SFFileInfo]:
        """Discover SoundFont files from sfzinstruments organization.

        Scans repositories in the organization for .sfz and .sf2 files.

        Returns:
            List of discovered SoundFont files
        """
        logger.info(f"Discovering SoundFonts from {self.library_name}")

        self.discovered_files = []

        try:
            # Get organization repositories
            repos = await self._get_org_repos()

            if not repos:
                logger.warning("No repositories found")
                return []

            # Scan each repository for SoundFont files
            for repo in repos:
                repo_name = repo.get('name', '')
                default_branch = repo.get('default_branch', 'main')

                # Skip archived or empty repos
                if repo.get('archived', False) or repo.get('size', 0) == 0:
                    continue

                await self._rate_limit()

                files = await self._scan_repo_for_soundfonts(repo_name, default_branch)
                self.discovered_files.extend(files)

                if len(self.discovered_files) >= 500:
                    logger.info("Reached discovery limit, stopping scan")
                    break

            self._stats["total_discovered"] = len(self.discovered_files)
            self._stats["last_discovery"] = datetime.now().isoformat()

            logger.info(f"Discovered {len(self.discovered_files)} SoundFonts from {self.library_name}")
            return self.discovered_files

        except aiohttp.ClientError as e:
            logger.error(f"Network error discovering SoundFonts: {e}")
            return []
        except Exception as e:
            logger.error(f"Error discovering SoundFonts: {e}")
            return []

    async def _get_org_repos(self) -> List[Dict[str, Any]]:
        """Get repositories from the sfzinstruments organization."""
        if self._is_cache_valid():
            logger.debug("Using cached repository list")
            return self._repos_cache or []

        repos = []

        try:
            async with aiohttp.ClientSession() as session:
                # Get first 100 repos (should be enough)
                url = f"{self.GITHUB_API_BASE}/orgs/{self.GITHUB_ORG}/repos?per_page=100&sort=updated"

                async with session.get(url, headers=self._get_headers()) as response:
                    if response.status == 403:
                        logger.error("GitHub API rate limit exceeded")
                        return []

                    if response.status != 200:
                        logger.error(f"GitHub API error: {response.status}")
                        return []

                    repos = await response.json()

            # Sort: priority repos first, then by stars
            def sort_key(r):
                name = r.get('name', '')
                if name in self.PRIORITY_REPOS:
                    return (0, -r.get('stargazers_count', 0))
                return (1, -r.get('stargazers_count', 0))

            repos.sort(key=sort_key)

            self._repos_cache = repos
            self._repos_cache_time = datetime.now()

            logger.info(f"Found {len(repos)} repositories in {self.GITHUB_ORG}")
            return repos

        except Exception as e:
            logger.error(f"Error fetching org repos: {e}")
            return []

    async def _scan_repo_for_soundfonts(self, repo_name: str, branch: str) -> List[SFFileInfo]:
        """Scan a repository for SoundFont files.

        Args:
            repo_name: Name of the repository
            branch: Default branch name

        Returns:
            List of discovered SoundFont files in this repo
        """
        files = []

        try:
            async with aiohttp.ClientSession() as session:
                # Use the Git Trees API with recursive flag
                tree_url = f"{self.GITHUB_API_BASE}/repos/{self.GITHUB_ORG}/{repo_name}/git/trees/{branch}?recursive=1"

                async with session.get(tree_url, headers=self._get_headers()) as response:
                    if response.status != 200:
                        logger.debug(f"Could not get tree for {repo_name}: HTTP {response.status}")
                        return []

                    data = await response.json()
                    tree = data.get('tree', [])

                    for item in tree:
                        path = item.get('path', '')
                        ext = os.path.splitext(path.lower())[1]

                        if ext in ('.sfz', '.sf2', '.sf3'):
                            file_info = self._create_file_info(repo_name, branch, path, item)
                            if file_info:
                                files.append(file_info)

            if files:
                logger.debug(f"Found {len(files)} SoundFonts in {repo_name}")

        except Exception as e:
            logger.debug(f"Error scanning {repo_name}: {e}")

        return files

    def _create_file_info(self, repo_name: str, branch: str, path: str, item: Dict[str, Any]) -> Optional[SFFileInfo]:
        """Create SFFileInfo from GitHub tree item.

        Args:
            repo_name: Repository name
            branch: Branch name
            path: File path in repository
            item: GitHub tree item

        Returns:
            SFFileInfo or None
        """
        filename = os.path.basename(path)
        ext = os.path.splitext(filename.lower())[1]

        # Determine format
        if ext == '.sfz':
            format_type = 'sfz'
        elif ext in ('.sf2', '.sf3'):
            format_type = 'sf2'
        else:
            return None

        # Determine category from repo name
        category = self._get_category_from_repo(repo_name)

        # Extract author from repo name (often in format "Author.InstrumentName")
        author = None
        if '.' in repo_name:
            author = repo_name.split('.')[0].replace('-', ' ')

        # Build raw file URL
        url = f"{self.GITHUB_RAW_BASE}/{self.GITHUB_ORG}/{repo_name}/{branch}/{path}"

        # Create display name
        name = os.path.splitext(filename)[0].replace('_', ' ').replace('-', ' ')

        # Build tags
        tags = ['sfzinstruments', format_type, category.lower()]
        if author:
            tags.append(author.lower())

        return SFFileInfo(
            url=url,
            filename=f"{repo_name}_{filename}".replace('.', '_'),  # Unique filename
            library=self.library_name,
            format=format_type,
            category=category,
            subcategory=repo_name.replace('.', ' ').replace('-', ' '),
            author=author or "SFZ Instruments Community",
            license="Various (check repository)",
            description=f"{name} from {repo_name}",
            tags=tags,
            file_size_bytes=item.get('size'),
        )

    def _get_category_from_repo(self, repo_name: str) -> str:
        """Determine category from repository name.

        Args:
            repo_name: Repository name

        Returns:
            Category string
        """
        name_lower = repo_name.lower()

        for pattern, category in self.CATEGORY_MAP.items():
            if pattern in name_lower:
                return category

        return "Instrument"

    def _is_cache_valid(self) -> bool:
        """Check if the repository cache is still valid."""
        if not self._repos_cache or not self._repos_cache_time:
            return False
        age = (datetime.now() - self._repos_cache_time).total_seconds()
        return age < self._cache_ttl_seconds

    async def download_file(self, file_info: SFFileInfo, output_path: str,
                           progress_callback: Optional[Callable[[float], None]] = None) -> bool:
        """Download SoundFont file from GitHub.

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
        """Clear the repository cache."""
        self._repos_cache = None
        self._repos_cache_time = None
        logger.debug("Repository cache cleared")
