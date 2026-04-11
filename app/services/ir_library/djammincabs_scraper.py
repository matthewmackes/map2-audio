"""
Djammincabs Cabinet IR Scraper
Download free guitar and bass cabinet IRs from Djammincabs.

Source: https://zystrix.com/djammincabs.htm
License: Free for personal and commercial use

Features:
- 100+ free guitar cabinet IRs
- 100+ free bass cabinet IRs
- Direct download links
- Various mic positions and cab types
"""

import logging
import aiohttp
import os
from typing import List, Optional, Callable
from datetime import datetime, timezone
from bs4 import BeautifulSoup

from .scraper_base import IRScraperBase, IRFileInfo, DownloadStatus, DownloadState

logger = logging.getLogger(__name__)


class DjammincabsScraper(IRScraperBase):
    """Scraper for Djammincabs free cabinet IRs.

    Djammincabs offers a large collection of free guitar and bass
    cabinet impulse responses, captured from various speaker/mic
    combinations.

    Features:
    - 100+ guitar cabinet IRs
    - 100+ bass cabinet IRs
    - Various mic types and positions
    - Free for any use
    """

    BASE_URL = "https://zystrix.com"
    MAIN_PAGE = "https://zystrix.com/djammincabs.htm"

    # Known download packages (stable links)
    KNOWN_PACKAGES = [
        {
            "name": "Djammincabs Guitar Pack",
            "url": "https://zystrix.com/downloads/djammincabs_guitar_100.zip",
            "category": "Guitar Cabinets",
            "description": "100 free guitar cabinet impulse responses",
            "count": 100,
        },
        {
            "name": "Djammincabs Bass Pack",
            "url": "https://zystrix.com/downloads/djammincabs_bass_100.zip",
            "category": "Bass Cabinets",
            "description": "100 free bass cabinet impulse responses",
            "count": 100,
        },
        {
            "name": "Djammincabs Extra Guitar",
            "url": "https://zystrix.com/downloads/djammincabs_guitar_extra_50.zip",
            "category": "Guitar Cabinets",
            "description": "50 extra free guitar cabinet impulse responses",
            "count": 50,
        },
        {
            "name": "Djammincabs Extra Bass",
            "url": "https://zystrix.com/downloads/djammincabs_bass_extra_50.zip",
            "category": "Bass Cabinets",
            "description": "50 extra free bass cabinet impulse responses",
            "count": 50,
        },
    ]

    def __init__(self):
        """Initialize Djammincabs scraper."""
        super().__init__(
            library_name="djammincabs",
            base_url=self.BASE_URL,
            rate_limit_requests=5,
            rate_limit_period=1.0
        )

    async def discover_irs(self) -> List[IRFileInfo]:
        """Discover IR packs from Djammincabs.

        Returns known stable download packages, plus attempts to find
        additional downloads from the website.

        Returns:
            List of discovered IR pack files
        """
        logger.info(f"Discovering IRs from {self.library_name}")

        self.discovered_files = []

        # Add known packages
        for pkg in self.KNOWN_PACKAGES:
            file_info = IRFileInfo(
                url=pkg["url"],
                filename=os.path.basename(pkg["url"]),
                library=self.library_name,
                category=pkg["category"],
                author="Djammincabs",
                license="Free for any use",
                description=pkg["description"],
                tags=[
                    "cabinet", "free", "djammincabs",
                    "guitar" if "guitar" in pkg["category"].lower() else "bass"
                ]
            )
            self.discovered_files.append(file_info)

        # Try to scrape page for additional downloads
        try:
            await self._rate_limit()

            async with aiohttp.ClientSession() as session:
                headers = {"User-Agent": "MAP2-Audio-IR-Scraper/1.0"}

                async with session.get(self.MAIN_PAGE, headers=headers) as response:
                    if response.status == 200:
                        html = await response.text()
                        additional = self._parse_page(html)

                        # Add any new files
                        known_urls = {f.url for f in self.discovered_files}
                        for file_info in additional:
                            if file_info.url not in known_urls:
                                self.discovered_files.append(file_info)

        except Exception as e:
            logger.warning(f"Could not scrape Djammincabs page: {e}")

        self._stats["total_discovered"] = len(self.discovered_files)
        self._stats["last_discovery"] = datetime.now(timezone.utc).isoformat()

        logger.info(f"Discovered {len(self.discovered_files)} IR packs from {self.library_name}")
        return self.discovered_files

    def _parse_page(self, html: str) -> List[IRFileInfo]:
        """Parse Djammincabs page for download links.

        Args:
            html: Page HTML content

        Returns:
            List of discovered IR pack files
        """
        files = []

        try:
            soup = BeautifulSoup(html, 'html.parser')

            # Find download links
            for link in soup.find_all('a', href=True):
                href = link['href']

                # Look for zip downloads
                if '.zip' in href.lower():
                    # Build full URL
                    if not href.startswith('http'):
                        if href.startswith('/'):
                            href = f"{self.BASE_URL}{href}"
                        else:
                            href = f"{self.BASE_URL}/{href}"

                    filename = os.path.basename(href)

                    # Determine category from filename
                    category = "Guitar Cabinets"
                    if 'bass' in filename.lower():
                        category = "Bass Cabinets"

                    # Get link text for description
                    link_text = link.get_text(strip=True)
                    description = link_text if link_text else f"Cabinet IR pack: {filename}"

                    file_info = IRFileInfo(
                        url=href,
                        filename=filename,
                        library=self.library_name,
                        category=category,
                        author="Djammincabs",
                        license="Free for any use",
                        description=description,
                        tags=["cabinet", "free", "djammincabs"]
                    )
                    files.append(file_info)

        except Exception as e:
            logger.warning(f"Error parsing Djammincabs page: {e}")

        return files

    async def download_file(self, file_info: IRFileInfo, output_path: str,
                           progress_callback: Optional[Callable[[float], None]] = None) -> bool:
        """Download IR pack from Djammincabs.

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
