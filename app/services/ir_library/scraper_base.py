"""IR scraper base built on the shared downloader infrastructure."""

from __future__ import annotations

import os
from abc import abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable, List, Optional

from app.services.common.scraper_base import DownloadScraperBase, DownloadState, DownloadStatus


@dataclass
class IRFileInfo:
    url: str
    filename: str
    library: str
    category: str
    subcategory: Optional[str] = None
    author: Optional[str] = None
    license: str = "Unknown"
    description: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    file_size_bytes: Optional[int] = None
    checksum: Optional[str] = None
    sample_rate: Optional[int] = None
    channels: Optional[int] = None
    duration_ms: Optional[float] = None
    created_at: datetime = field(default_factory=datetime.now)

    def __post_init__(self):
        if self.tags is None:
            self.tags = []

    @property
    def unique_id(self) -> str:
        return f"{self.library}:{self.filename}"

    def matches_filter(self, query: str) -> bool:
        query_lower = query.lower()
        searchable = [
            self.filename,
            self.category,
            self.subcategory or "",
            self.author or "",
            self.description or "",
            *self.tags,
        ]
        return any(query_lower in field.lower() for field in searchable)


class IRScraperBase(DownloadScraperBase[IRFileInfo]):
    @abstractmethod
    async def discover_irs(self) -> List[IRFileInfo]:
        raise NotImplementedError("Subclasses must implement discover_irs()")

    @abstractmethod
    async def download_file(
        self,
        file_info: IRFileInfo,
        output_path: str,
        progress_callback: Optional[Callable[[float], None]] = None,
    ) -> bool:
        raise NotImplementedError("Subclasses must implement download_file()")

    def _is_existing_file_valid(self, file_info: IRFileInfo, output_path: str) -> bool:
        if not os.path.exists(output_path):
            return False
        if file_info.checksum:
            return self._verify_checksum(output_path, file_info.checksum)
        return True

    def _verify_downloaded_file(
        self,
        file_info: IRFileInfo,
        output_path: str,
        status: DownloadStatus[IRFileInfo],
    ) -> bool:
        if not file_info.checksum:
            return True
        status.state = DownloadState.VERIFYING
        if self._verify_checksum(output_path, file_info.checksum):
            return True
        os.remove(output_path)
        return False

    def _verify_checksum(self, file_path: str, expected_hash: str) -> bool:
        try:
            actual_hash = self._calculate_file_hash(file_path)
            return actual_hash.lower() == expected_hash.lower()
        except (IOError, OSError):
            return False

    def extract_zip(
        self,
        zip_path: str,
        output_dir: str,
        delete_zip: bool = True,
        flatten: bool = False,
    ) -> List[str]:
        return self._extract_zip(
            zip_path,
            output_dir,
            allowed_extensions={".wav", ".aif", ".aiff", ".flac", ".nam", ".json"},
            delete_zip=delete_zip,
            flatten=flatten,
            label="files",
        )

    async def download_and_extract(
        self,
        file_info: IRFileInfo,
        output_dir: str,
        progress_callback: Optional[Callable[[float], None]] = None,
        delete_zip: bool = True,
    ) -> List[str]:
        zip_path = os.path.join(output_dir, file_info.filename)
        success = await self.download_file(file_info, zip_path, progress_callback)
        if not success:
            return []
        if file_info.filename.lower().endswith(".zip"):
            return self.extract_zip(zip_path, output_dir, delete_zip=delete_zip)
        return [zip_path]
