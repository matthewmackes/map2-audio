"""
Samplicity Bricasti M7 Reverb IR Scraper
Download high-quality Bricasti M7 reverb impulse responses.

Source: https://samplicity.com/bricasti-m7-impulse-response-files/
License: Free (Newconomyware - donations appreciated)

Features:
- 134 M7 preset IRs
- True Stereo and Mono-to-Stereo formats
- Multiple sample rates and bit depths
"""

import logging
import aiohttp
import os
from typing import List, Optional, Callable
from datetime import datetime, timezone
from bs4 import BeautifulSoup
import re

from .scraper_base import IRScraperBase, IRFileInfo, DownloadStatus, DownloadState

logger = logging.getLogger(__name__)


class SamplicityScraper(IRScraperBase):
    """Scraper for Samplicity Bricasti M7 reverb IRs.

    Samplicity offers high-quality IRs of all 134 Bricasti M7 presets
    in various formats. These are industry-standard reverb IRs.
    """

    BASE_URL = "https://samplicity.com"
    DOWNLOADS_PAGE = "https://samplicity.com/bricasti-m7-impulse-response-files/"

    # Known download packages based on their typical naming
    KNOWN_PACKAGES = [
        {
            "name": "Bricasti M7 True Stereo 44.1kHz 24bit",
            "filename": "samplicity_m7_truestereo_44.1khz_24bit.zip",
            "category": "Hardware Reverbs",
            "subcategory": "Bricasti M7",
            "description": "Bricasti M7 True Stereo IRs - 44.1kHz 24-bit",
            "format": "True Stereo",
            "sample_rate": 44100,
        },
        {
            "name": "Bricasti M7 True Stereo 48kHz 24bit",
            "filename": "samplicity_m7_truestereo_48khz_24bit.zip",
            "category": "Hardware Reverbs",
            "subcategory": "Bricasti M7",
            "description": "Bricasti M7 True Stereo IRs - 48kHz 24-bit",
            "format": "True Stereo",
            "sample_rate": 48000,
        },
        {
            "name": "Bricasti M7 Mono-to-Stereo 44.1kHz 24bit",
            "filename": "samplicity_m7_mono2stereo_44.1khz_24bit.zip",
            "category": "Hardware Reverbs",
            "subcategory": "Bricasti M7",
            "description": "Bricasti M7 Mono-to-Stereo IRs - 44.1kHz 24-bit",
            "format": "Mono-to-Stereo",
            "sample_rate": 44100,
        },
        {
            "name": "Bricasti M7 Quad 44.1kHz 32bit",
            "filename": "samplicity_m7_quad_44.1khz_32bit.zip",
            "category": "Hardware Reverbs",
            "subcategory": "Bricasti M7",
            "description": "Bricasti M7 Quad channel IRs for Waves IR-1, Steinberg REVerence",
            "format": "Quad",
            "sample_rate": 44100,
        },
    ]

    def __init__(self):
        """Initialize Samplicity scraper."""
        super().__init__(
            library_name="samplicity",
            base_url=self.BASE_URL,
            rate_limit_requests=3,
            rate_limit_period=2.0
        )
        self._discovered_urls = {}

    async def discover_irs(self) -> List[IRFileInfo]:
        """Discover IR packs from Samplicity.

        Returns:
            List of discovered IR pack files
        """
        logger.info(f"Discovering IRs from {self.library_name}")

        self.discovered_files = []
        self._discovered_urls = {}

        # Scrape the downloads page to get actual download links
        try:
            await self._rate_limit()

            async with aiohttp.ClientSession() as session:
                headers = {"User-Agent": "MAP2-Audio-IR-Scraper/1.0"}

                async with session.get(self.DOWNLOADS_PAGE, headers=headers) as response:
                    if response.status == 200:
                        html = await response.text()
                        self._parse_downloads_page(html)

        except Exception as e:
            logger.warning(f"Could not scrape Samplicity page: {e}")

        # Create file info objects for known packages
        for pkg in self.KNOWN_PACKAGES:
            url = self._discovered_urls.get(pkg["filename"])
            if not url:
                # Try to find a matching URL
                for discovered_name, discovered_url in self._discovered_urls.items():
                    if self._matches_package(discovered_name, pkg):
                        url = discovered_url
                        break

            if url:
                file_info = IRFileInfo(
                    url=url,
                    filename=pkg["filename"],
                    library=self.library_name,
                    category=pkg["category"],
                    subcategory=pkg["subcategory"],
                    author="Samplicity",
                    license="Free (Newconomyware)",
                    description=pkg["description"],
                    tags=["reverb", "free", "bricasti", "m7", "hardware", pkg["format"].lower()],
                    sample_rate=pkg.get("sample_rate")
                )
                self.discovered_files.append(file_info)

        # Add any additional discovered files not in known packages
        known_filenames = {pkg["filename"] for pkg in self.KNOWN_PACKAGES}
        for filename, url in self._discovered_urls.items():
            if filename not in known_filenames and '.zip' in filename.lower():
                file_info = IRFileInfo(
                    url=url,
                    filename=filename,
                    library=self.library_name,
                    category="Hardware Reverbs",
                    subcategory="Bricasti M7",
                    author="Samplicity",
                    license="Free (Newconomyware)",
                    description=f"Bricasti M7 IR pack: {filename}",
                    tags=["reverb", "free", "bricasti", "m7", "hardware"]
                )
                self.discovered_files.append(file_info)

        self._stats["total_discovered"] = len(self.discovered_files)
        self._stats["last_discovery"] = datetime.now(timezone.utc).isoformat()

        logger.info(f"Discovered {len(self.discovered_files)} IR packs from {self.library_name}")
        return self.discovered_files

    def _parse_downloads_page(self, html: str) -> None:
        """Parse Samplicity downloads page for links.

        Args:
            html: Page HTML content
        """
        try:
            soup = BeautifulSoup(html, 'html.parser')

            # Find download links - usually zip files
            for link in soup.find_all('a', href=True):
                href = link['href']

                if '.zip' in href.lower():
                    if not href.startswith('http'):
                        href = f"{self.BASE_URL}{href}"

                    filename = os.path.basename(href.split('?')[0])
                    self._discovered_urls[filename] = href

            logger.debug(f"Found {len(self._discovered_urls)} download links on Samplicity page")

        except Exception as e:
            logger.warning(f"Error parsing Samplicity page: {e}")

    def _matches_package(self, filename: str, pkg: dict) -> bool:
        """Check if a discovered filename matches a known package."""
        filename_lower = filename.lower()

        # Check for format keywords
        if pkg.get("format") == "True Stereo" and "truestereo" not in filename_lower and "true_stereo" not in filename_lower:
            return False
        if pkg.get("format") == "Mono-to-Stereo" and "mono" not in filename_lower:
            return False
        if pkg.get("format") == "Quad" and "quad" not in filename_lower:
            return False

        # Check for sample rate
        sample_rate = pkg.get("sample_rate")
        if sample_rate == 44100 and "44" not in filename_lower:
            return False
        if sample_rate == 48000 and "48" not in filename_lower:
            return False

        return True

    async def download_file(self, file_info: IRFileInfo, output_path: str,
                           progress_callback: Optional[Callable[[float], None]] = None) -> bool:
        """Download IR pack from Samplicity.

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
