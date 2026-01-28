"""
EchoThief Impulse Response Scraper
Download free real-world space IRs from EchoThief.

Source: http://www.echothief.com/
License: Free for any use

Features:
- 100+ real-world space impulse responses
- Caves, subways, bridges, historic sites
- Captured across North America
"""

import logging
import aiohttp
import os
from typing import List, Optional, Callable

from .scraper_base import IRScraperBase, IRFileInfo, DownloadStatus, DownloadState
from datetime import datetime

logger = logging.getLogger(__name__)


class EchoThiefScraper(IRScraperBase):
    """Scraper for EchoThief's free impulse response library.

    EchoThief offers high-quality real-world space impulse responses including:
    - Casa Grande Domes (Arizona)
    - Death Valley Charcoal Kilns (California)
    - Subway Cave Lava Tube (California)
    - Castillo De Los Tres Reyes Del Morro (Cuba)
    - B-39 Black Widow submarine (California)
    - Echo Bridge (Massachusetts)
    - Sunset Cliffs Sea Cave (California)
    - Red Bridge (Wisconsin)

    All files are free for any use.
    """

    BASE_URL = "https://www.echothief.com"

    # Known EchoThief IR file - main pack with 100+ IRs
    KNOWN_FILES = [
        {
            "filename": "EchoThief.zip",
            "url": "https://www.echothief.com/wp-content/uploads/2025/10/EchoThief.zip",
            "category": "Real Spaces",
            "description": "EchoThief Collection - 100+ real-world space IRs from caves, bridges, historic sites",
            "tags": ["cave", "bridge", "real space", "outdoor", "natural"]
        },
    ]

    def __init__(self):
        """Initialize EchoThief scraper."""
        super().__init__(
            library_name="echothief",
            base_url=self.BASE_URL,
            rate_limit_requests=5,
            rate_limit_period=1.0
        )

    async def discover_irs(self) -> List[IRFileInfo]:
        """Discover IRs from EchoThief.

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
                author="Dr. Chris Warren",
                license="Free",
                description=file_data["description"],
                tags=file_data["tags"] + ["free", "reverb", "echothief"]
            )
            self.discovered_files.append(file_info)

        self._stats["total_discovered"] = len(self.discovered_files)
        self._stats["last_discovery"] = datetime.now().isoformat()

        logger.info(f"Discovered {len(self.discovered_files)} IRs from {self.library_name}")
        return self.discovered_files

    async def download_file(self, file_info: IRFileInfo, output_path: str,
                           progress_callback: Optional[Callable[[float], None]] = None) -> bool:
        """Download IR file from EchoThief.

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
