"""
Overdriven.fr Cabinet IR Scraper
Download free guitar cabinet IRs from Overdriven.fr.

Source: https://overdriven.fr/overdriven/index.php/irdownloads/
License: Free for personal use

Features:
- Multiple guitar cabinet IRs
- Various speaker/mic combinations
- Direct download links
"""

import logging
import aiohttp
import os
import re
from typing import List, Optional, Callable
from datetime import datetime
from bs4 import BeautifulSoup

from .scraper_base import IRScraperBase, IRFileInfo, DownloadStatus, DownloadState

logger = logging.getLogger(__name__)


class OverdrivenScraper(IRScraperBase):
    """Scraper for Overdriven.fr free cabinet IRs.

    Overdriven.fr offers high-quality guitar cabinet impulse responses
    captured in home studio conditions. All basic collections are free.
    """

    BASE_URL = "https://overdriven.fr"
    DOWNLOADS_PAGE = "https://overdriven.fr/overdriven/index.php/irdownloads/"

    # Known stable download packages
    KNOWN_PACKAGES = [
        {
            "name": "US-412 V30 Home Studio Edition",
            "url": "https://overdriven.fr/overdriven/index.php/download/overdriven-us412-v30-ssp1-class-d/",
            "page_url": "https://overdriven.fr/overdriven/index.php/us-412-v30-home-studio-edition-free-guitar-cab-impulse-responses-download/",
            "description": "USA 4x12 cabinet with Celestion V30 speakers",
            "speakers": "Celestion V30",
        },
        {
            "name": "UK-112 V30 Home Studio Edition",
            "url": "https://overdriven.fr/overdriven/index.php/download/uk-112-v30-ssp1-class-d/",
            "page_url": "https://overdriven.fr/overdriven/index.php/ir-uk-112-celestion-v30-home-studio-edition-free-guitar-cab-impulse-responses-download/",
            "description": "Orange PPC 112 with Celestion V30",
            "speakers": "Celestion V30",
        },
        {
            "name": "Calif-R112 V30 Home Studio Edition",
            "url": "https://overdriven.fr/overdriven/index.php/download/calif-r112-v30-ssp1-class-d/",
            "page_url": "https://overdriven.fr/overdriven/index.php/ir-calif-r112-celestion-v30-home-studio-edition-free-guitar-cab-impulse-responses-download/",
            "description": "Mesa Boogie Mini Recto 1x12 with Celestion V30",
            "speakers": "Celestion V30",
        },
        {
            "name": "German-112 GB55 Home Studio Edition",
            "url": "https://overdriven.fr/overdriven/index.php/download/german-112-celestion-g12h55-ssp1/",
            "page_url": "https://overdriven.fr/overdriven/index.php/german-112-celestion-g12h55-home-studio-edition-free-guitar-cab-impulse-responses-download/",
            "description": "German 1x12 with Celestion G12H-55",
            "speakers": "Celestion G12H-55",
        },
        {
            "name": "UK-212-Gov Home Studio Edition",
            "url": "https://overdriven.fr/overdriven/index.php/download/uk212-gov-ssp1-class-d/",
            "page_url": "https://overdriven.fr/overdriven/index.php/uk212-gov-home-studio-edition-free-guitar-cab-impulse-responses-download/",
            "description": "UK 2x12 Governor cabinet",
            "speakers": "Celestion Governor",
        },
        {
            "name": "E112-K-100 G4",
            "url": "https://overdriven.fr/overdriven/index.php/download/e112-k-100-ssp2-classd/",
            "page_url": "https://overdriven.fr/overdriven/index.php/e112-k-100-free-guitar-cab-impulse-responses-download/",
            "description": "ENGL 1x12 with Celestion K100",
            "speakers": "Celestion K100",
        },
        {
            "name": "M212-P50 G4",
            "url": "https://overdriven.fr/overdriven/index.php/download/m212-p50-g4-ssp2-classd/",
            "page_url": "https://overdriven.fr/overdriven/index.php/m212-p50-g4-free-guitar-cab-impulse-responses-download/",
            "description": "Marshall 2x12 with Celestion G12T-75",
            "speakers": "Celestion G12T-75",
        },
        {
            "name": "DE-112-GM G4",
            "url": "https://overdriven.fr/overdriven/index.php/download/de-112-gm-ssp2-classd-g4/",
            "page_url": "https://overdriven.fr/overdriven/index.php/de-112-gm-g4-free-guitar-cab-impulse-responses-download/",
            "description": "Diezel 1x12 with Celestion G12M",
            "speakers": "Celestion G12M",
        },
        {
            "name": "FB-212-VET30 G4",
            "url": "https://overdriven.fr/overdriven/index.php/download/fb-212-vet30-ssp2-classd-g4/",
            "page_url": "https://overdriven.fr/overdriven/index.php/fb-212-vet30-g4-free-guitar-cab-impulse-responses-download/",
            "description": "Fryette 2x12 with Celestion Vintage 30",
            "speakers": "Celestion V30",
        },
        {
            "name": "M-212-L-VINT G4",
            "url": "https://overdriven.fr/overdriven/index.php/download/m-212-l-vint-ssp2-classd-g4/",
            "page_url": "https://overdriven.fr/overdriven/index.php/m-212-l-vint-g4-free-guitar-cab-impulse-responses-download/",
            "description": "Marshall 2x12 Lead Vintage",
            "speakers": "Celestion Vintage",
        },
    ]

    def __init__(self):
        """Initialize Overdriven.fr scraper."""
        super().__init__(
            library_name="overdriven",
            base_url=self.BASE_URL,
            rate_limit_requests=5,
            rate_limit_period=2.0
        )

    async def discover_irs(self) -> List[IRFileInfo]:
        """Discover IR packs from Overdriven.fr.

        Returns:
            List of discovered IR pack files
        """
        logger.info(f"Discovering IRs from {self.library_name}")

        self.discovered_files = []

        # Add known packages
        for pkg in self.KNOWN_PACKAGES:
            file_info = IRFileInfo(
                url=pkg["url"],
                filename=f"overdriven_{pkg['name'].lower().replace(' ', '_').replace('-', '_')}.zip",
                library=self.library_name,
                category="Guitar Cabinets",
                subcategory=pkg.get("speakers", "Mixed"),
                author="Overdriven.fr",
                license="Free for personal use",
                description=pkg["description"],
                tags=["cabinet", "free", "overdriven", "guitar", pkg.get("speakers", "").lower()]
            )
            self.discovered_files.append(file_info)

        # Try to scrape page for additional downloads
        try:
            await self._rate_limit()

            async with aiohttp.ClientSession() as session:
                headers = {"User-Agent": "MAP2-Audio-IR-Scraper/1.0"}

                async with session.get(self.DOWNLOADS_PAGE, headers=headers) as response:
                    if response.status == 200:
                        html = await response.text()
                        additional = self._parse_downloads_page(html)

                        # Add any new files
                        known_urls = {f.url for f in self.discovered_files}
                        for file_info in additional:
                            if file_info.url not in known_urls:
                                self.discovered_files.append(file_info)

        except Exception as e:
            logger.warning(f"Could not scrape Overdriven.fr page: {e}")

        self._stats["total_discovered"] = len(self.discovered_files)
        self._stats["last_discovery"] = datetime.now().isoformat()

        logger.info(f"Discovered {len(self.discovered_files)} IR packs from {self.library_name}")
        return self.discovered_files

    def _parse_downloads_page(self, html: str) -> List[IRFileInfo]:
        """Parse Overdriven.fr downloads page for additional links.

        Args:
            html: Page HTML content

        Returns:
            List of discovered IR files
        """
        files = []

        try:
            soup = BeautifulSoup(html, 'html.parser')

            # Find download links in tables or article sections
            for link in soup.find_all('a', href=True):
                href = link['href']

                # Look for download page links
                if '/download/' in href or href.endswith('.zip'):
                    if not href.startswith('http'):
                        href = f"{self.BASE_URL}{href}"

                    # Get link text for name
                    link_text = link.get_text(strip=True)
                    if not link_text:
                        continue

                    filename = f"overdriven_{link_text.lower().replace(' ', '_').replace('-', '_')}.zip"

                    file_info = IRFileInfo(
                        url=href,
                        filename=filename,
                        library=self.library_name,
                        category="Guitar Cabinets",
                        author="Overdriven.fr",
                        license="Free for personal use",
                        description=f"Overdriven.fr cabinet IR: {link_text}",
                        tags=["cabinet", "free", "overdriven", "guitar"]
                    )
                    files.append(file_info)

        except Exception as e:
            logger.warning(f"Error parsing Overdriven.fr page: {e}")

        return files

    async def download_file(self, file_info: IRFileInfo, output_path: str,
                           progress_callback: Optional[Callable[[float], None]] = None) -> bool:
        """Download IR pack from Overdriven.fr.

        The download URLs redirect to actual zip files. We need to follow redirects.

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
                started_at=datetime.now()
            )
            self.download_progress[file_info.filename] = status

            async with aiohttp.ClientSession() as session:
                headers = {
                    "User-Agent": "MAP2-Audio-IR-Scraper/1.0",
                    "Accept": "application/zip,application/octet-stream,*/*"
                }

                # First get the download page to find actual zip link
                async with session.get(file_info.url, headers=headers, allow_redirects=True) as response:
                    if response.status != 200:
                        # Try direct download
                        pass

                    content_type = response.headers.get('content-type', '')

                    # Check if this is HTML (download page) or actual file
                    if 'text/html' in content_type:
                        html = await response.text()
                        # Parse for actual download link
                        soup = BeautifulSoup(html, 'html.parser')

                        # Look for direct download link
                        download_link = None
                        for link in soup.find_all('a', href=True):
                            href = link['href']
                            if '.zip' in href.lower():
                                if not href.startswith('http'):
                                    href = f"{self.BASE_URL}{href}"
                                download_link = href
                                break

                        if not download_link:
                            # Look for download buttons
                            for btn in soup.find_all(['a', 'button'], class_=re.compile(r'download', re.I)):
                                if btn.get('href'):
                                    href = btn['href']
                                    if not href.startswith('http'):
                                        href = f"{self.BASE_URL}{href}"
                                    download_link = href
                                    break

                        if download_link:
                            return await self._download_direct(download_link, output_path, status, progress_callback)
                        else:
                            logger.error(f"Could not find download link on page: {file_info.url}")
                            status.state = DownloadState.FAILED
                            status.error_message = "No download link found"
                            return False
                    else:
                        # Direct file download
                        return await self._download_stream(response, output_path, status, progress_callback)

        except Exception as e:
            logger.error(f"Error downloading {file_info.filename}: {e}")
            if file_info.filename in self.download_progress:
                self.download_progress[file_info.filename].state = DownloadState.FAILED
                self.download_progress[file_info.filename].error_message = str(e)
            return False

    async def _download_direct(self, url: str, output_path: str, status: DownloadStatus,
                              progress_callback: Optional[Callable[[float], None]] = None) -> bool:
        """Download file directly from URL."""
        async with aiohttp.ClientSession() as session:
            headers = {"User-Agent": "MAP2-Audio-IR-Scraper/1.0"}

            async with session.get(url, headers=headers, allow_redirects=True) as response:
                if response.status != 200:
                    logger.error(f"Download failed: HTTP {response.status}")
                    status.state = DownloadState.FAILED
                    status.error_message = f"HTTP {response.status}"
                    return False

                return await self._download_stream(response, output_path, status, progress_callback)

    async def _download_stream(self, response: aiohttp.ClientResponse, output_path: str,
                               status: DownloadStatus,
                               progress_callback: Optional[Callable[[float], None]] = None) -> bool:
        """Stream download to file with progress tracking."""
        total_size = int(response.headers.get('content-length', 0))
        downloaded = 0
        start_time = datetime.now()

        with open(output_path, 'wb') as f:
            async for chunk in response.content.iter_chunked(8192):
                if self._cancel_requested:
                    logger.info(f"Download cancelled")
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

        logger.info(f"Downloaded: {output_path} ({downloaded} bytes)")
        return True
