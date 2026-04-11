"""
VSCO Community Edition Scraper
Download the Versilian Studios Chamber Orchestra Community Edition.

Source: https://vis.versilstudios.com/vsco-community.html
License: CC0 (Public Domain)

Features:
- High quality orchestral samples
- SFZ format with WAV samples
- Professionally recorded instruments
"""

import logging
import aiohttp
import os
from typing import List, Optional, Callable
from datetime import datetime, timezone

from .scraper_base import SFScraperBase, SFFileInfo

logger = logging.getLogger(__name__)


class VSCOScraper(SFScraperBase):
    """Scraper for VSCO Community Edition orchestral samples.

    Downloads the Versilian Studios Chamber Orchestra Community Edition,
    a high-quality free orchestral sample library in SFZ format.
    """

    BASE_URL = "https://vis.versilstudios.com"
    INFO_URL = "https://vis.versilstudios.com/vsco-community.html"

    # Direct download links for VSCO CE (verified working URLs)
    DOWNLOAD_FILES = [
        {
            "filename": "VSCO-2-CE-1.1.0.zip",
            "url": "https://www.dropbox.com/s/p2p6whunwekb9s1/VSCO-2-CE-1.1.0.zip?dl=1",
            "size_bytes": 3221225472,  # ~3 GB
            "category": "Orchestral",
            "description": "VSCO 2 Community Edition - Full orchestral library (SFZ + WAV)",
        },
    ]

    # Internet Archive mirror as backup
    ARCHIVE_MIRRORS = [
        {
            "filename": "vsco-2-ce-sfz.zip",
            "url": "https://archive.org/download/vsco-2-ce-sfz/vsco-2-ce-sfz.zip",
            "size_bytes": 3000000000,  # ~3 GB
            "category": "Orchestral",
            "description": "VSCO 2 CE - Internet Archive mirror",
        },
    ]

    def __init__(self):
        """Initialize VSCO scraper."""
        super().__init__(
            library_name="vsco",
            base_url=self.BASE_URL,
            rate_limit_requests=2,
            rate_limit_period=2.0
        )

    async def discover_soundfonts(self) -> List[SFFileInfo]:
        """Discover VSCO Community Edition files.

        Returns:
            List of SFFileInfo objects for VSCO files
        """
        logger.info("Discovering VSCO Community Edition files...")
        self.discovered_files = []

        # Add main download (Dropbox)
        for file_data in self.DOWNLOAD_FILES:
            file_info = SFFileInfo(
                url=file_data["url"],
                filename=file_data["filename"],
                library=self.library_name,
                format="sfz",
                category=file_data["category"],
                description=file_data["description"],
                file_size_bytes=file_data.get("size_bytes"),
                author="Versilian Studios",
                license="CC0",
                tags=["orchestral", "vsco", "professional", "full-library"],
            )
            self.discovered_files.append(file_info)

        self._stats["total_discovered"] = len(self.discovered_files)
        self._stats["last_discovery"] = datetime.now(timezone.utc).isoformat()

        logger.info(f"Discovered {len(self.discovered_files)} VSCO files")
        return self.discovered_files

    async def download_file(self, file_info: SFFileInfo, output_path: str,
                           progress_callback: Optional[Callable[[float], None]] = None) -> bool:
        """Download a VSCO file.

        Args:
            file_info: File metadata
            output_path: Local path to save the file
            progress_callback: Optional progress callback

        Returns:
            True if download succeeded
        """
        try:
            await self._rate_limit()

            headers = {
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
            }

            # Handle GitHub releases (may redirect)
            async with aiohttp.ClientSession() as session:
                async with session.get(file_info.url, headers=headers, allow_redirects=True) as response:
                    if response.status != 200:
                        logger.error(f"Failed to download {file_info.filename}: HTTP {response.status}")
                        return False

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
            logger.error(f"Error downloading {file_info.filename}: {e}")
            return False
