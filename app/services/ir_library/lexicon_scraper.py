"""
Classic Reverb Impulse Response Scraper
Download free classic reverb IRs from Housecall.

Source: https://www.housecallfm.com/download-gns-personal-lexicon-480l
License: Free

Features:
- 50+ presets from classic digital reverb hardware
- Halls, plates, rooms, ambiences, effects
- Captured from Grant Nelson's personal unit
"""

import logging
import aiohttp
import os
from typing import List, Optional, Callable

from .scraper_base import IRScraperBase, IRFileInfo, DownloadStatus, DownloadState
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class LexiconScraper(IRScraperBase):
    """Scraper for classic reverb impulse responses from Housecall.

    Contains 50+ presets from classic digital reverb hardware:
    - Ambiences
    - Effects
    - Halls
    - Plates
    - Rooms
    - Wild spaces

    All files are free for any use.
    """

    BASE_URL = "https://www.housecallfm.com"

    KNOWN_FILES = [
        {
            "filename": "BGLex480.zip",
            "url": "http://www.housecallfm.com/download.php?f=BGLex480.zip",
            "category": "Classic Hardware",
            "description": "Lexicon 480L - 50+ presets including halls, plates, rooms, ambiences",
            "tags": ["lexicon", "480l", "hall", "plate", "room", "classic", "hardware"]
        },
    ]

    def __init__(self):
        """Initialize Lexicon scraper."""
        super().__init__(
            library_name="lexicon",
            base_url=self.BASE_URL,
            rate_limit_requests=5,
            rate_limit_period=1.0
        )

    async def discover_irs(self) -> List[IRFileInfo]:
        """Discover IRs from Housecall Lexicon collection.

        Returns:
            List of discovered IR files
        """
        logger.info(f"Discovering IRs from {self.library_name}")

        self.discovered_files = []

        for file_data in self.KNOWN_FILES:
            file_info = IRFileInfo(
                url=file_data["url"],
                filename=file_data["filename"],
                library=self.library_name,
                category=file_data["category"],
                author="Grant Nelson / Housecall",
                license="Free",
                description=file_data["description"],
                tags=file_data["tags"] + ["free", "reverb"]
            )
            self.discovered_files.append(file_info)

        self._stats["total_discovered"] = len(self.discovered_files)
        self._stats["last_discovery"] = datetime.now(timezone.utc).isoformat()

        logger.info(f"Discovered {len(self.discovered_files)} IRs from {self.library_name}")
        return self.discovered_files

    async def download_file(self, file_info: IRFileInfo, output_path: str,
                           progress_callback: Optional[Callable[[float], None]] = None) -> bool:
        """Download IR file from Housecall.

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
