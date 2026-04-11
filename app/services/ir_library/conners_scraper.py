"""
REAPER Blog Reverb IR Scraper
Download free synthetic reverb impulse responses from REAPER Blog.

Source: https://reaper.blog/2018/11/free_reverb_irs/
License: Free

Note: This scraper was originally named 'conners' for a GitHub repository
that no longer exists. It now fetches from REAPER Blog.

Features:
- 48 synthetic reverb IRs
- Various decay times (125ms to 1000ms)
- Multiple fade shapes and effects
- Direct download link
"""

import logging
import aiohttp
import os
from typing import List, Optional, Callable
from datetime import datetime, timezone

from .scraper_base import IRScraperBase, IRFileInfo, DownloadStatus, DownloadState

logger = logging.getLogger(__name__)


class ConnersScraper(IRScraperBase):
    """Scraper for REAPER Blog free reverb IRs.

    Note: This scraper was originally named 'conners' for historical reasons.
    It now fetches from REAPER Blog which provides working reverb IRs.

    Features:
    - 48 synthetic reverb impulse responses
    - Various decay times and fade shapes
    - Direct ZIP download
    """

    BASE_URL = "https://reaper.blog"
    DOWNLOAD_URL = "https://reaper.blog/wp-content/uploads/2018/11/reaperblog-IRs.zip"

    def __init__(self, github_token: Optional[str] = None):
        """Initialize REAPER Blog scraper.

        Args:
            github_token: Unused, kept for API compatibility
        """
        super().__init__(
            library_name="conners",
            base_url=self.BASE_URL,
            rate_limit_requests=5,
            rate_limit_period=1.0
        )

    async def discover_irs(self) -> List[IRFileInfo]:
        """Discover IR pack from REAPER Blog.

        Returns:
            List containing the single IR pack file
        """
        logger.info(f"Discovering IRs from {self.library_name}")

        self.discovered_files = []

        # Single known download package
        file_info = IRFileInfo(
            url=self.DOWNLOAD_URL,
            filename="reaperblog-IRs.zip",
            library=self.library_name,
            category="Synthetic Reverbs",
            author="REAPER Blog",
            license="Free",
            description="48 synthetic reverb IRs with various decay times (125ms-1000ms)",
            tags=["reverb", "free", "synthetic", "reaper"]
        )
        self.discovered_files.append(file_info)

        self._stats["total_discovered"] = len(self.discovered_files)
        self._stats["last_discovery"] = datetime.now(timezone.utc).isoformat()

        logger.info(f"Discovered {len(self.discovered_files)} IR packs from {self.library_name}")
        return self.discovered_files

    async def download_file(self, file_info: IRFileInfo, output_path: str,
                           progress_callback: Optional[Callable[[float], None]] = None) -> bool:
        """Download IR pack from REAPER Blog.

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
                                    remaining = total_size - downloaded
                                    status.eta_seconds = remaining / status.speed_bps if status.speed_bps > 0 else None

                                if progress_callback:
                                    progress_callback(progress)

            status.state = DownloadState.COMPLETED
            status.completed_at = datetime.now(timezone.utc)
            status.progress = 1.0

            logger.info(f"Downloaded: {file_info.filename} ({downloaded} bytes)")
            return True

        except aiohttp.ClientError as e:
            logger.error(f"Network error downloading {file_info.filename}: {e}")
            if file_info.filename in self.download_progress:
                self.download_progress[file_info.filename].state = DownloadState.FAILED
                self.download_progress[file_info.filename].error_message = str(e)
            return False
        except IOError as e:
            logger.error(f"I/O error downloading {file_info.filename}: {e}")
            if file_info.filename in self.download_progress:
                self.download_progress[file_info.filename].state = DownloadState.FAILED
                self.download_progress[file_info.filename].error_message = str(e)
            return False
        except Exception as e:
            logger.error(f"Error downloading {file_info.filename}: {e}")
            if file_info.filename in self.download_progress:
                self.download_progress[file_info.filename].state = DownloadState.FAILED
                self.download_progress[file_info.filename].error_message = str(e)
            return False

    def clear_cache(self) -> None:
        """Clear cache - no-op for this simple scraper."""
        pass
