"""
Musical Artifacts Scraper
Download SoundFonts from Musical Artifacts community repository.

Source: https://musical-artifacts.com
License: Various (community-curated, check individual artifact licenses)

Features:
- JSON API support
- SF2 and SFZ format filtering
- Pagination support
- Rich metadata extraction
"""

import logging
import asyncio
import aiohttp
import os
from typing import List, Optional, Callable, Dict, Any
from datetime import datetime, timezone
from urllib.parse import urljoin, quote

from .scraper_base import SFScraperBase, SFFileInfo, DownloadStatus, DownloadState

logger = logging.getLogger(__name__)


class MusicalArtifactsScraper(SFScraperBase):
    """Scraper for Musical Artifacts community repository.

    Downloads SF2 and SFZ SoundFonts from the Musical Artifacts website,
    which is an open-source community repository for music production assets.

    Features:
    - JSON API for efficient discovery
    - Multiple format support (sf2, sfz)
    - License information extraction
    - Tag-based categorization
    """

    BASE_URL = "https://musical-artifacts.com"
    API_BASE = "https://musical-artifacts.com/artifacts.json"

    # Rate limiting (be respectful to community site)
    RATE_LIMIT = 5
    RATE_PERIOD = 2.0

    # Tag to category mapping
    TAG_CATEGORY_MAP = {
        'piano': 'Piano',
        'grand piano': 'Piano',
        'electric piano': 'Electric Piano',
        'rhodes': 'Electric Piano',
        'organ': 'Organ',
        'guitar': 'Guitar',
        'bass': 'Bass',
        'drums': 'Drums',
        'drumkit': 'Drums',
        'percussion': 'Percussion',
        'strings': 'Strings',
        'orchestra': 'Orchestral',
        'orchestral': 'Orchestral',
        'choir': 'Choir',
        'vocal': 'Choir',
        'synth': 'Synthesizer',
        'synthesizer': 'Synthesizer',
        'brass': 'Brass',
        'woodwind': 'Woodwind',
        'flute': 'Woodwind',
        'gm': 'General MIDI',
        'general midi': 'General MIDI',
        'soundfont': 'General',
        'video game': 'Video Game',
        'retro': 'Retro',
        '8bit': 'Retro',
        'chiptune': 'Retro',
    }

    def __init__(self):
        """Initialize Musical Artifacts scraper."""
        super().__init__(
            library_name="musical_artifacts",
            base_url=self.BASE_URL,
            rate_limit_requests=self.RATE_LIMIT,
            rate_limit_period=self.RATE_PERIOD
        )

        # Cache
        self._artifacts_cache: Optional[List[Dict[str, Any]]] = None
        self._cache_time: Optional[datetime] = None
        self._cache_ttl_seconds = 1800  # 30 minutes

    async def discover_soundfonts(self) -> List[SFFileInfo]:
        """Discover SoundFont files from Musical Artifacts.

        Queries the JSON API for SF2 and SFZ artifacts.

        Returns:
            List of discovered SoundFont files
        """
        logger.info(f"Discovering SoundFonts from {self.library_name}")

        self.discovered_files = []

        try:
            # Fetch SF2 files
            sf2_artifacts = await self._fetch_artifacts(format_filter='sf2')
            # Fetch SFZ files
            sfz_artifacts = await self._fetch_artifacts(format_filter='sfz')

            all_artifacts = sf2_artifacts + sfz_artifacts

            # Convert to SFFileInfo
            for artifact in all_artifacts:
                file_info = self._create_file_info(artifact)
                if file_info:
                    self.discovered_files.append(file_info)

            self._stats["total_discovered"] = len(self.discovered_files)
            self._stats["last_discovery"] = datetime.now(timezone.utc).isoformat()

            logger.info(f"Discovered {len(self.discovered_files)} SoundFonts from {self.library_name}")
            return self.discovered_files

        except aiohttp.ClientError as e:
            logger.error(f"Network error discovering SoundFonts: {e}")
            return []
        except Exception as e:
            logger.error(f"Error discovering SoundFonts: {e}")
            return []

    async def _fetch_artifacts(self, format_filter: str, max_pages: int = 5) -> List[Dict[str, Any]]:
        """Fetch artifacts from the Musical Artifacts API.

        Args:
            format_filter: Format to filter by (sf2 or sfz)
            max_pages: Maximum number of pages to fetch

        Returns:
            List of artifact dictionaries
        """
        artifacts = []
        page = 1

        # Use browser-like headers to avoid Cloudflare blocking
        headers = {
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://musical-artifacts.com/",
            "Origin": "https://musical-artifacts.com",
        }

        # Timeout configuration
        timeout = aiohttp.ClientTimeout(total=30, connect=10)

        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                while page <= max_pages:
                    await self._rate_limit()

                    # Build API URL with filters
                    url = f"{self.API_BASE}?formats={format_filter}&page={page}&order=most_downloaded"

                    # Retry logic for Cloudflare challenges
                    for attempt in range(3):
                        try:
                            async with session.get(url, headers=headers) as response:
                                if response.status == 403:
                                    # Cloudflare challenge - log and skip
                                    logger.warning(f"Musical Artifacts: Cloudflare challenge detected (attempt {attempt + 1}/3)")
                                    if attempt < 2:
                                        await asyncio.sleep(2 ** attempt)  # Exponential backoff
                                        continue
                                    else:
                                        logger.error("Musical Artifacts: Unable to bypass Cloudflare after 3 attempts")
                                        return artifacts

                                if response.status != 200:
                                    logger.warning(f"API returned {response.status} for page {page}")
                                    return artifacts

                                data = await response.json()

                                # Handle both array and object response formats
                                if isinstance(data, list):
                                    page_artifacts = data
                                elif isinstance(data, dict):
                                    page_artifacts = data.get('artifacts', data.get('data', []))
                                else:
                                    return artifacts

                                if not page_artifacts:
                                    return artifacts

                                artifacts.extend(page_artifacts)
                                logger.debug(f"Fetched {len(page_artifacts)} {format_filter} artifacts from page {page}")

                                # Stop if we got fewer than expected (last page)
                                if len(page_artifacts) < 20:
                                    return artifacts

                                page += 1
                                break  # Success, move to next page

                        except asyncio.TimeoutError:
                            logger.warning(f"Timeout fetching page {page} (attempt {attempt + 1}/3)")
                            if attempt < 2:
                                await asyncio.sleep(2 ** attempt)
                            continue

        except Exception as e:
            logger.error(f"Error fetching {format_filter} artifacts: {e}")

        return artifacts

    def _create_file_info(self, artifact: Dict[str, Any]) -> Optional[SFFileInfo]:
        """Create SFFileInfo from Musical Artifacts artifact data.

        Args:
            artifact: Artifact dictionary from API

        Returns:
            SFFileInfo or None
        """
        try:
            # Get download URL
            file_url = artifact.get('file')
            if not file_url:
                # Try mirrors
                mirrors = artifact.get('mirrors', [])
                if mirrors:
                    file_url = mirrors[0]

            if not file_url:
                return None

            # Make URL absolute if needed
            if not file_url.startswith('http'):
                file_url = urljoin(self.BASE_URL, file_url)

            # Get filename
            name = artifact.get('name', 'Unknown')
            original_filename = artifact.get('file_name', '')

            # Determine format from filename or formats list
            formats = artifact.get('formats', [])
            if 'sf2' in formats or original_filename.lower().endswith('.sf2'):
                format_type = 'sf2'
                ext = '.sf2'
            elif 'sfz' in formats or original_filename.lower().endswith('.sfz'):
                format_type = 'sfz'
                ext = '.sfz'
            else:
                # Try to detect from URL
                if '.sf2' in file_url.lower():
                    format_type = 'sf2'
                    ext = '.sf2'
                elif '.sfz' in file_url.lower():
                    format_type = 'sfz'
                    ext = '.sfz'
                else:
                    return None

            # Create safe filename
            safe_name = "".join(c if c.isalnum() or c in ' -_' else '_' for c in name)
            filename = f"ma_{artifact.get('id', 0)}_{safe_name[:50]}{ext}"

            # Get category from tags
            tags = artifact.get('tags', [])
            category = self._get_category_from_tags(tags)

            # Get license
            license_info = artifact.get('license', 'Unknown')
            if isinstance(license_info, dict):
                license_info = license_info.get('name', 'Unknown')

            # Get author
            author = artifact.get('author')
            if isinstance(author, dict):
                author = author.get('name', author.get('username'))

            # Get description
            description = artifact.get('description', '')
            if len(description) > 200:
                description = description[:197] + '...'

            # Build tags list
            tag_list = ['musical-artifacts', format_type]
            if tags:
                tag_list.extend([t.lower() for t in tags[:5]])

            return SFFileInfo(
                url=file_url,
                filename=filename,
                library=self.library_name,
                format=format_type,
                category=category,
                subcategory=None,
                author=author,
                license=license_info,
                description=description or f"{name} from Musical Artifacts",
                tags=tag_list,
                file_size_bytes=artifact.get('file_size'),
            )

        except Exception as e:
            logger.debug(f"Error creating file info from artifact: {e}")
            return None

    def _get_category_from_tags(self, tags: List[str]) -> str:
        """Determine category from artifact tags.

        Args:
            tags: List of tags from the artifact

        Returns:
            Category string
        """
        if not tags:
            return "General"

        for tag in tags:
            tag_lower = tag.lower()
            if tag_lower in self.TAG_CATEGORY_MAP:
                return self.TAG_CATEGORY_MAP[tag_lower]

            # Partial matching
            for pattern, category in self.TAG_CATEGORY_MAP.items():
                if pattern in tag_lower:
                    return category

        return "General"

    async def download_file(self, file_info: SFFileInfo, output_path: str,
                           progress_callback: Optional[Callable[[float], None]] = None) -> bool:
        """Download SoundFont file from Musical Artifacts.

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
                started_at=datetime.now(timezone.utc)
            )
            self.download_progress[file_info.filename] = status

            headers = {
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "*/*",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer": "https://musical-artifacts.com/",
            }

            timeout = aiohttp.ClientTimeout(total=300, connect=30)  # 5 min for large files

            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(file_info.url, headers=headers, allow_redirects=True) as response:
                    if response.status != 200:
                        logger.error(f"Download failed: HTTP {response.status} for {file_info.url}")
                        status.state = DownloadState.FAILED
                        status.error_message = f"HTTP {response.status}"
                        return False

                    total_size = int(response.headers.get('content-length', 0))
                    downloaded = 0
                    start_time = datetime.now(timezone.utc)

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

                                elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
                                if elapsed > 0:
                                    status.speed_bps = downloaded / elapsed

                                if progress_callback:
                                    progress_callback(progress)

            status.state = DownloadState.COMPLETED
            status.completed_at = datetime.now(timezone.utc)
            status.progress = 1.0

            logger.info(f"Downloaded: {file_info.filename} ({downloaded} bytes)")
            return True

        except Exception as e:
            logger.error(f"Error downloading {file_info.filename}: {e}")
            if file_info.filename in self.download_progress:
                self.download_progress[file_info.filename].state = DownloadState.FAILED
                self.download_progress[file_info.filename].error_message = str(e)
            return False
