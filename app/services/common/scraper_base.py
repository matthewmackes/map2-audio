"""Shared scraper infrastructure for downloadable asset libraries."""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import shutil
import time
import zipfile
from abc import ABC
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Dict, Generic, List, Optional, Set, TypeVar

logger = logging.getLogger(__name__)

TFileInfo = TypeVar("TFileInfo")


class DownloadState(Enum):
    PENDING = "pending"
    DOWNLOADING = "downloading"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class DownloadStatus(Generic[TFileInfo]):
    file_info: TFileInfo
    state: DownloadState = DownloadState.PENDING
    progress: float = 0.0
    bytes_downloaded: int = 0
    speed_bps: float = 0.0
    eta_seconds: Optional[float] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class DownloadScraperBase(Generic[TFileInfo], ABC):
    DEFAULT_RATE_LIMIT_REQUESTS = 10
    DEFAULT_RATE_LIMIT_PERIOD = 1.0

    def __init__(
        self,
        library_name: str,
        base_url: str,
        rate_limit_requests: int = DEFAULT_RATE_LIMIT_REQUESTS,
        rate_limit_period: float = DEFAULT_RATE_LIMIT_PERIOD,
    ):
        self.library_name = library_name
        self.base_url = base_url
        self.discovered_files: List[TFileInfo] = []
        self.download_progress: Dict[str, DownloadStatus[TFileInfo]] = {}
        self._downloaded_ids: Set[str] = set()
        self._rate_limit_requests = rate_limit_requests
        self._rate_limit_period = rate_limit_period
        self._request_times: List[float] = []
        self._rate_lock = asyncio.Lock()
        self._cancel_requested = False
        self._stats = {
            "total_discovered": 0,
            "total_downloaded": 0,
            "total_bytes": 0,
            "failed_downloads": 0,
            "last_discovery": None,
        }

    async def _rate_limit(self) -> None:
        async with self._rate_lock:
            now = time.time()
            self._request_times = [
                stamp for stamp in self._request_times if now - stamp < self._rate_limit_period
            ]
            if len(self._request_times) >= self._rate_limit_requests:
                wait_time = self._rate_limit_period - (now - self._request_times[0])
                if wait_time > 0:
                    logger.debug(f"Rate limit reached, waiting {wait_time:.2f}s")
                    await asyncio.sleep(wait_time)
            self._request_times.append(time.time())

    async def download_batch(
        self,
        files: List[TFileInfo],
        output_dir: str,
        max_concurrent: int = 3,
        on_progress: Optional[Callable[[str, DownloadStatus[TFileInfo]], None]] = None,
        skip_existing: bool = True,
    ) -> Dict[str, bool]:
        os.makedirs(output_dir, exist_ok=True)
        results: Dict[str, bool] = {}
        semaphore = asyncio.Semaphore(max_concurrent)

        async def download_one(file_info: TFileInfo) -> tuple[str, bool]:
            async with semaphore:
                filename = getattr(file_info, "filename")
                if self._cancel_requested:
                    return filename, False

                output_path = os.path.join(output_dir, filename)
                if skip_existing and self._is_existing_file_valid(file_info, output_path):
                    logger.debug(f"Skipping {filename} (already exists)")
                    return filename, True

                status = DownloadStatus(
                    file_info=file_info,
                    state=DownloadState.DOWNLOADING,
                    started_at=datetime.now(),
                )
                self.download_progress[filename] = status

                def update_progress(progress: float):
                    status.progress = progress
                    if on_progress:
                        on_progress(filename, status)

                try:
                    await self._rate_limit()
                    success = await self.download_file(file_info, output_path, update_progress)

                    if success and not self._verify_downloaded_file(file_info, output_path, status):
                        success = False

                    status.state = DownloadState.COMPLETED if success else DownloadState.FAILED
                    status.completed_at = datetime.now()

                    if success:
                        self._stats["total_downloaded"] += 1
                        file_size_bytes = getattr(file_info, "file_size_bytes", None)
                        if file_size_bytes:
                            self._stats["total_bytes"] += file_size_bytes
                    else:
                        self._stats["failed_downloads"] += 1

                    return filename, success
                except Exception as exc:
                    logger.error(f"Download failed for {filename}: {exc}")
                    status.state = DownloadState.FAILED
                    status.error_message = str(exc)
                    self._stats["failed_downloads"] += 1
                    return filename, False
                finally:
                    if on_progress:
                        on_progress(filename, status)

        completed = await asyncio.gather(*(download_one(file_info) for file_info in files), return_exceptions=True)
        for result in completed:
            if isinstance(result, tuple):
                results[result[0]] = result[1]
            else:
                logger.error(f"Download task failed: {result}")
        return results

    def _is_existing_file_valid(self, file_info: TFileInfo, output_path: str) -> bool:
        return os.path.exists(output_path)

    def _verify_downloaded_file(
        self,
        file_info: TFileInfo,
        output_path: str,
        status: DownloadStatus[TFileInfo],
    ) -> bool:
        return True

    def cancel_downloads(self) -> None:
        self._cancel_requested = True
        logger.info(f"Cancellation requested for {self.library_name} downloads")

    def reset_cancellation(self) -> None:
        self._cancel_requested = False

    def _calculate_file_hash(self, file_path: str) -> str:
        sha256 = hashlib.sha256()
        with open(file_path, "rb") as handle:
            for chunk in iter(lambda: handle.read(8192), b""):
                sha256.update(chunk)
        return sha256.hexdigest()

    def get_progress(self, filename: str) -> float:
        status = self.download_progress.get(filename)
        return status.progress if status else 0.0

    def get_status(self, filename: str) -> Optional[DownloadStatus[TFileInfo]]:
        return self.download_progress.get(filename)

    def get_statistics(self) -> Dict[str, Any]:
        return {
            **self._stats,
            "library_name": self.library_name,
            "pending_downloads": sum(
                1
                for status in self.download_progress.values()
                if status.state in (DownloadState.PENDING, DownloadState.DOWNLOADING)
            ),
        }

    def reset_progress(self) -> None:
        self.download_progress.clear()
        self._downloaded_ids.clear()

    def filter_files(self, query: str) -> List[TFileInfo]:
        if not query:
            return self.discovered_files
        return [file_info for file_info in self.discovered_files if file_info.matches_filter(query)]

    def get_categories(self) -> Dict[str, int]:
        categories: Dict[str, int] = {}
        for file_info in self.discovered_files:
            categories[file_info.category] = categories.get(file_info.category, 0) + 1
        return dict(sorted(categories.items()))

    def _extract_zip(
        self,
        zip_path: str,
        output_dir: str,
        *,
        allowed_extensions: Set[str],
        delete_zip: bool = True,
        flatten: bool = False,
        label: str = "files",
    ) -> List[str]:
        extracted_files: List[str] = []
        try:
            if not zipfile.is_zipfile(zip_path):
                logger.warning(f"Not a valid ZIP file: {zip_path}")
                return []

            os.makedirs(output_dir, exist_ok=True)
            with zipfile.ZipFile(zip_path, "r") as zip_file:
                for member in zip_file.namelist():
                    if member.endswith("/") or "__MACOSX" in member or member.startswith("."):
                        continue

                    _, ext = os.path.splitext(member.lower())
                    if ext not in allowed_extensions:
                        continue

                    if flatten:
                        filename = os.path.basename(member)
                        out_path = os.path.join(output_dir, filename)
                    else:
                        out_path = os.path.join(output_dir, member)
                        os.makedirs(os.path.dirname(out_path) or output_dir, exist_ok=True)

                    if os.path.exists(out_path):
                        base, out_ext = os.path.splitext(out_path)
                        counter = 1
                        while os.path.exists(out_path):
                            out_path = f"{base}_{counter}{out_ext}"
                            counter += 1

                    try:
                        with zip_file.open(member) as src, open(out_path, "wb") as dst:
                            shutil.copyfileobj(src, dst)
                        extracted_files.append(out_path)
                    except Exception as exc:
                        logger.warning(f"Failed to extract {member}: {exc}")

            logger.info(f"Extracted {len(extracted_files)} {label} from {os.path.basename(zip_path)}")
            if delete_zip:
                try:
                    os.remove(zip_path)
                except OSError as exc:
                    logger.warning(f"Could not delete ZIP {zip_path}: {exc}")
        except zipfile.BadZipFile as exc:
            logger.error(f"Bad ZIP file {zip_path}: {exc}")
        except Exception as exc:
            logger.error(f"Error extracting {zip_path}: {exc}")

        return extracted_files
