"""
Signal To Noize Classic Reverb IR Scraper
Download classic hardware reverb impulse responses.

Source: https://signaltonoize.com/?page_id=4188
License: Free (donations appreciated)

Features:
- Classic digital reverb units (M200, M300, M5000)
- PCM 70 Versions 2 & 3
- Quantec QRS/XL
- Classic hardware reverbs
"""

import logging
import aiohttp
import os
from typing import List, Optional, Callable
from datetime import datetime, timezone
from bs4 import BeautifulSoup

from .scraper_base import IRScraperBase, IRFileInfo, DownloadStatus, DownloadState

logger = logging.getLogger(__name__)


class SignalToNoizeScraper(IRScraperBase):
    """Scraper for Signal To Noize classic reverb IRs.

    Signal To Noize offers free impulse responses from classic
    hardware reverb units including classic digital reverbs, TC Electronic,
    Yamaha, and Quantec.
    """

    BASE_URL = "https://signaltonoize.com"
    DOWNLOADS_PAGE = "https://signaltonoize.com/?page_id=4188"

    # Known classic reverb IRs
    KNOWN_PACKAGES = [
        {
            "name": "Lexicon M200",
            "category": "Hardware Reverbs",
            "subcategory": "Lexicon",
            "description": "Lexicon M200 reverb impulse responses",
            "keywords": ["m200", "lexicon"],
        },
        {
            "name": "Lexicon M300",
            "category": "Hardware Reverbs",
            "subcategory": "Lexicon",
            "description": "Lexicon M300 reverb impulse responses",
            "keywords": ["m300", "lexicon"],
        },
        {
            "name": "Lexicon M5000",
            "category": "Hardware Reverbs",
            "subcategory": "Lexicon",
            "description": "Lexicon M5000 / 480L reverb impulse responses",
            "keywords": ["m5000", "480l", "lexicon"],
        },
        {
            "name": "PCM 70 Version 2",
            "category": "Hardware Reverbs",
            "subcategory": "Lexicon",
            "description": "Lexicon PCM 70 Version 2 impulse responses",
            "keywords": ["pcm70", "pcm 70", "v2", "version 2"],
        },
        {
            "name": "PCM 70 Version 3",
            "category": "Hardware Reverbs",
            "subcategory": "Lexicon",
            "description": "Lexicon PCM 70 Version 3 impulse responses",
            "keywords": ["pcm70", "pcm 70", "v3", "version 3"],
        },
        {
            "name": "Quantec QRS/XL",
            "category": "Hardware Reverbs",
            "subcategory": "Quantec",
            "description": "Quantec QRS and XL room simulator impulse responses",
            "keywords": ["quantec", "qrs", "xl"],
        },
        {
            "name": "Eventide H3000",
            "category": "Hardware Reverbs",
            "subcategory": "Eventide",
            "description": "Eventide H3000 reverb impulse responses",
            "keywords": ["eventide", "h3000"],
        },
        {
            "name": "TC Electronic M5000",
            "category": "Hardware Reverbs",
            "subcategory": "TC Electronic",
            "description": "TC Electronic M5000 reverb impulse responses",
            "keywords": ["tc", "electronic", "m5000"],
        },
        {
            "name": "Yamaha SPX990",
            "category": "Hardware Reverbs",
            "subcategory": "Yamaha",
            "description": "Yamaha SPX990 reverb impulse responses",
            "keywords": ["yamaha", "spx990", "spx"],
        },
    ]

    def __init__(self):
        """Initialize Signal To Noize scraper."""
        super().__init__(
            library_name="signaltonoize",
            base_url=self.BASE_URL,
            rate_limit_requests=3,
            rate_limit_period=2.0
        )

    async def discover_irs(self) -> List[IRFileInfo]:
        """Discover IR packs from Signal To Noize.

        Note: As of 2024, Signal To Noize has moved to a paid/donation model.
        Direct free downloads are no longer available. The site offers high-quality
        classic hardware reverb IRs for purchase ($1-20 suggested donation).

        Returns:
            List of discovered IR pack files (may be empty if no free downloads found)
        """
        logger.info(f"Discovering IRs from {self.library_name}")

        self.discovered_files = []

        try:
            await self._rate_limit()

            # Use browser-like headers
            headers = {
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            }

            timeout = aiohttp.ClientTimeout(total=30, connect=10)

            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(self.DOWNLOADS_PAGE, headers=headers) as response:
                    if response.status == 200:
                        html = await response.text()
                        self._parse_downloads_page(html)

                        # If no direct downloads found, log info about paid options
                        if not self.discovered_files:
                            logger.info(
                                f"Signal To Noize: No free downloads available. "
                                f"Site offers paid IRs (Lexicon, Quantec, Eventide, etc.) "
                                f"at https://signaltonoize.com/?page_id=4188"
                            )
                    elif response.status == 403:
                        logger.warning(f"Signal To Noize: Access forbidden (may require browser)")
                    else:
                        logger.warning(f"Signal To Noize: HTTP {response.status}")

        except Exception as e:
            logger.warning(f"Could not scrape Signal To Noize page: {e}")

        self._stats["total_discovered"] = len(self.discovered_files)
        self._stats["last_discovery"] = datetime.now(timezone.utc).isoformat()

        logger.info(f"Discovered {len(self.discovered_files)} IR packs from {self.library_name}")
        return self.discovered_files

    def _parse_downloads_page(self, html: str) -> None:
        """Parse Signal To Noize downloads page for links.

        Args:
            html: Page HTML content
        """
        try:
            soup = BeautifulSoup(html, 'html.parser')

            # Find all download links
            for link in soup.find_all('a', href=True):
                href = link['href']
                link_text = link.get_text(strip=True)

                # Look for zip/rar files
                if any(ext in href.lower() for ext in ['.zip', '.rar', '.7z']):
                    if not href.startswith('http'):
                        href = f"{self.BASE_URL}{href}"

                    filename = os.path.basename(href.split('?')[0])

                    # Try to match to known package
                    matched_pkg = self._match_package(filename, link_text)

                    if matched_pkg:
                        file_info = IRFileInfo(
                            url=href,
                            filename=filename,
                            library=self.library_name,
                            category=matched_pkg["category"],
                            subcategory=matched_pkg["subcategory"],
                            author="Signal To Noize",
                            license="Free (donations appreciated)",
                            description=matched_pkg["description"],
                            tags=["reverb", "free", "hardware", "classic", matched_pkg["subcategory"].lower()]
                        )
                    else:
                        file_info = IRFileInfo(
                            url=href,
                            filename=filename,
                            library=self.library_name,
                            category="Hardware Reverbs",
                            author="Signal To Noize",
                            license="Free (donations appreciated)",
                            description=f"Classic reverb IR: {link_text or filename}",
                            tags=["reverb", "free", "hardware", "classic"]
                        )

                    self.discovered_files.append(file_info)

        except Exception as e:
            logger.warning(f"Error parsing Signal To Noize page: {e}")

    def _match_package(self, filename: str, link_text: str) -> Optional[dict]:
        """Match a download to known packages.

        Args:
            filename: Downloaded filename
            link_text: Link text from page

        Returns:
            Matched package info or None
        """
        combined = f"{filename} {link_text}".lower()

        for pkg in self.KNOWN_PACKAGES:
            matches = sum(1 for kw in pkg["keywords"] if kw.lower() in combined)
            if matches >= 2:  # Require at least 2 keyword matches
                return pkg

        return None

    async def download_file(self, file_info: IRFileInfo, output_path: str,
                           progress_callback: Optional[Callable[[float], None]] = None) -> bool:
        """Download IR pack from Signal To Noize.

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
