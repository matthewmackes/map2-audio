"""
Voxengo Impulse Response Scraper
Download free reverb IRs from Voxengo.

Source: https://www.voxengo.com/impulses/
License: Royalty-free for any purpose (including commercial)

Features:
- Direct download links
- High-quality concert halls, churches, studios
- 44.1 kHz 16-bit WAV format
"""

import logging
import aiohttp
import os
from typing import List, Optional, Callable
from bs4 import BeautifulSoup

from .scraper_base import IRScraperBase, IRFileInfo, DownloadStatus, DownloadState
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class VoxengoScraper(IRScraperBase):
    """Scraper for Voxengo's free impulse response library.

    Voxengo offers high-quality reverb impulse responses including:
    - Concert halls (Musikvereinsaal, Scala Milan)
    - Churches (St. Nicolaes)
    - Studios and rooms
    - Unique spaces (caves, bottle halls)

    All files are royalty-free for any purpose.
    """

    BASE_URL = "https://www.voxengo.com"
    IMPULSES_PAGE = "https://www.voxengo.com/impulses/"

    # Known Voxengo IR file - the main pack contains 40+ IRs
    KNOWN_FILES = [
        {
            "filename": "IMreverbs.zip",
            "url": "https://www.voxengo.com/files/impulses/IMreverbs.zip",
            "category": "Mixed Spaces",
            "description": "Voxengo IM Reverbs Pack - 40+ IRs including concert halls, churches, caves",
            "tags": ["concert hall", "church", "cave", "classical", "mixed"]
        },
    ]

    def __init__(self):
        """Initialize Voxengo scraper."""
        super().__init__(
            library_name="voxengo",
            base_url=self.BASE_URL,
            rate_limit_requests=5,
            rate_limit_period=1.0
        )

    async def discover_irs(self) -> List[IRFileInfo]:
        """Discover IRs from Voxengo website.

        Uses known stable URLs plus attempts to scrape the page for additional files.

        Returns:
            List of discovered IR files
        """
        logger.info(f"Discovering IRs from {self.library_name}")

        self.discovered_files = []

        # Add known files
        for file_data in self.KNOWN_FILES:
            file_info = IRFileInfo(
                url=file_data["url"],
                filename=file_data["filename"],
                library=self.library_name,
                category=file_data["category"],
                author="Voxengo",
                license="Royalty-free",
                description=file_data["description"],
                tags=file_data["tags"] + ["free", "reverb", "voxengo"]
            )
            self.discovered_files.append(file_info)

        # Try to scrape page for additional files
        try:
            await self._rate_limit()

            async with aiohttp.ClientSession() as session:
                async with session.get(self.IMPULSES_PAGE) as response:
                    if response.status == 200:
                        html = await response.text()
                        additional = self._parse_page(html)

                        # Add any new files not already in known list
                        known_filenames = {f["filename"] for f in self.KNOWN_FILES}
                        for file_info in additional:
                            if file_info.filename not in known_filenames:
                                self.discovered_files.append(file_info)
        except Exception as e:
            logger.warning(f"Could not scrape Voxengo page: {e}")

        self._stats["total_discovered"] = len(self.discovered_files)
        self._stats["last_discovery"] = datetime.now(timezone.utc).isoformat()

        logger.info(f"Discovered {len(self.discovered_files)} IRs from {self.library_name}")
        return self.discovered_files

    def _parse_page(self, html: str) -> List[IRFileInfo]:
        """Parse Voxengo page for download links.

        Args:
            html: Page HTML content

        Returns:
            List of additional IR files found
        """
        files = []
        try:
            soup = BeautifulSoup(html, 'html.parser')

            # Find all download links
            for link in soup.find_all('a', href=True):
                href = link['href']
                if href.endswith('.zip') and '/files/' in href:
                    # Build full URL if relative
                    if not href.startswith('http'):
                        href = f"{self.BASE_URL}{href}"

                    filename = os.path.basename(href)
                    name = os.path.splitext(filename)[0].replace('-', ' ').replace('_', ' ').title()

                    file_info = IRFileInfo(
                        url=href,
                        filename=filename,
                        library=self.library_name,
                        category="Reverb Spaces",
                        author="Voxengo",
                        license="Royalty-free",
                        description=f"{name} - Voxengo impulse response",
                        tags=["free", "reverb", "voxengo"]
                    )
                    files.append(file_info)

        except Exception as e:
            logger.warning(f"Error parsing Voxengo page: {e}")

        return files

    async def download_file(self, file_info: IRFileInfo, output_path: str,
                           progress_callback: Optional[Callable[[float], None]] = None) -> bool:
        """Download IR file from Voxengo.

        Args:
            file_info: File information with URL
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
                file_info=file_info,
                state=DownloadState.DOWNLOADING,
                started_at=datetime.now(timezone.utc)
            )
            self.download_progress[file_info.filename] = status

            async with aiohttp.ClientSession() as session:
                headers = {
                    "User-Agent": "MAP2-Audio-IR-Scraper/1.0"
                }

                async with session.get(file_info.url, headers=headers) as response:
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
