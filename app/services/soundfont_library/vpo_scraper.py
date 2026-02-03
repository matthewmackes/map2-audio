"""
Virtual Playing Orchestra Scraper
Download the Virtual Playing Orchestra free orchestral sample library.

Source: http://virtualplaying.com/virtual-playing-orchestra/
License: CC-BY-SA (Creative Commons Attribution-ShareAlike)

Features:
- Complete orchestral sections
- High quality SFZ format
- Based on public domain samples
"""

import logging
import aiohttp
import os
from typing import List, Optional, Callable
from datetime import datetime

from .scraper_base import SFScraperBase, SFFileInfo

logger = logging.getLogger(__name__)


class VirtualPlayingOrchestraScraper(SFScraperBase):
    """Scraper for Virtual Playing Orchestra (VPO).

    Downloads the Virtual Playing Orchestra, a free orchestral sample
    library in SFZ format built from public domain samples.
    """

    BASE_URL = "http://virtualplaying.com"
    INFO_URL = "http://virtualplaying.com/virtual-playing-orchestra/"

    # VPO download files - Musical Artifacts mirror (most reliable)
    DOWNLOAD_FILES = [
        {
            "filename": "vpo-wave-files.zip",
            "urls": [
                "https://musical-artifacts.com/artifacts/896/vpo-wave-files-v3-1.zip",
                "https://virtualplaying.com/go/virtual-playing-orchestra-v3-1-wave-files-onedrive/",
            ],
            "size_bytes": 632000000,  # ~603 MB
            "category": "Orchestral",
            "description": "Virtual Playing Orchestra 3.1 - Wave files",
        },
        {
            "filename": "vpo-standard-scripts.zip",
            "urls": [
                "https://musical-artifacts.com/artifacts/896/vpo-standard-scripts-v3-2-4.zip",
                "https://virtualplaying.com/go/virtual-playing-orchestra-v3-2-4-standard-scripts/",
            ],
            "size_bytes": 550000,  # ~536 KB
            "category": "Orchestral",
            "description": "VPO 3.2.4 Standard Orchestra SFZ scripts",
        },
    ]

    # SSO from sfzinstruments GitHub (reliable mirror)
    SSO_FILES = [
        {
            "filename": "SSO-Strings.zip",
            "url": "https://github.com/sfzinstruments/SSO/archive/refs/heads/master.zip",
            "size_bytes": 200000000,  # ~200 MB
            "category": "Orchestral",
            "description": "Sonatina Symphonic Orchestra - from sfzinstruments",
        },
    ]

    def __init__(self, include_sso: bool = True, full_version: bool = True):
        """Initialize VPO scraper.

        Args:
            include_sso: Include Sonatina Symphonic Orchestra
            full_version: Download full version (vs standard)
        """
        super().__init__(
            library_name="vpo",
            base_url=self.BASE_URL,
            rate_limit_requests=3,
            rate_limit_period=2.0
        )
        self.include_sso = include_sso
        self.full_version = full_version

    async def discover_soundfonts(self) -> List[SFFileInfo]:
        """Discover Virtual Playing Orchestra files.

        Returns:
            List of SFFileInfo objects
        """
        logger.info("Discovering Virtual Playing Orchestra files...")
        self.discovered_files = []

        # Add main VPO downloads
        for file_data in self.DOWNLOAD_FILES:
            # Skip standard if we want full, and vice versa
            is_full = "full" in file_data["filename"].lower()
            if is_full != self.full_version:
                continue

            # Use first available URL
            url = file_data["urls"][0] if file_data.get("urls") else file_data.get("url")
            if not url:
                continue

            file_info = SFFileInfo(
                url=url,
                filename=file_data["filename"],
                library=self.library_name,
                format="sfz",
                category=file_data["category"],
                description=file_data["description"],
                file_size_bytes=file_data.get("size_bytes"),
                author="Paul Shortridge",
                license="CC-BY-SA",
                tags=["orchestral", "vpo", "free", "sfz"],
            )
            self.discovered_files.append(file_info)

        # Add SSO if requested
        if self.include_sso:
            for file_data in self.SSO_FILES:
                file_info = SFFileInfo(
                    url=file_data["url"],
                    filename=file_data["filename"],
                    library=self.library_name,
                    format="sfz",
                    category=file_data["category"],
                    description=file_data["description"],
                    file_size_bytes=file_data.get("size_bytes"),
                    author="Mattias Westlund",
                    license="CC-BY",
                    tags=["orchestral", "sso", "free", "sfz"],
                )
                self.discovered_files.append(file_info)

        self._stats["total_discovered"] = len(self.discovered_files)
        self._stats["last_discovery"] = datetime.now().isoformat()

        logger.info(f"Discovered {len(self.discovered_files)} VPO/SSO files")
        return self.discovered_files

    async def download_file(self, file_info: SFFileInfo, output_path: str,
                           progress_callback: Optional[Callable[[float], None]] = None) -> bool:
        """Download a VPO file.

        Args:
            file_info: File metadata
            output_path: Local path to save the file
            progress_callback: Optional progress callback

        Returns:
            True if download succeeded
        """
        try:
            await self._rate_limit()

            # Try multiple URLs if available
            urls_to_try = [file_info.url]

            # Find alternate URLs for this file
            for file_data in self.DOWNLOAD_FILES + self.SSO_FILES:
                if file_data["filename"] == file_info.filename:
                    if "urls" in file_data:
                        urls_to_try = file_data["urls"]
                    break

            headers = {
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
            }

            async with aiohttp.ClientSession() as session:
                for url in urls_to_try:
                    try:
                        async with session.get(url, headers=headers, allow_redirects=True) as response:
                            if response.status != 200:
                                logger.debug(f"URL failed with {response.status}: {url}")
                                continue

                            total_size = int(response.headers.get('content-length', 0))
                            if total_size == 0 and file_info.file_size_bytes:
                                total_size = file_info.file_size_bytes

                            os.makedirs(os.path.dirname(output_path), exist_ok=True)

                            downloaded = 0
                            with open(output_path, 'wb') as f:
                                async for chunk in response.content.iter_chunked(65536):
                                    if self._cancel_requested:
                                        logger.info(f"Download cancelled: {file_info.filename}")
                                        return False
                                    f.write(chunk)
                                    downloaded += len(chunk)
                                    if progress_callback and total_size > 0:
                                        progress_callback(downloaded / total_size)

                            logger.info(f"Downloaded: {file_info.filename} ({downloaded} bytes)")
                            return True

                    except Exception as e:
                        logger.debug(f"Error with URL {url}: {e}")
                        continue

            logger.error(f"All URLs failed for {file_info.filename}")
            return False

        except Exception as e:
            logger.error(f"Error downloading {file_info.filename}: {e}")
            return False
