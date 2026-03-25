"""SoundFont scraper base built on the shared downloader infrastructure."""

from __future__ import annotations

from abc import abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable, List, Optional

from app.services.common.scraper_base import DownloadScraperBase, DownloadState, DownloadStatus


@dataclass
class SFFileInfo:
    url: str
    filename: str
    library: str
    format: str
    category: str
    subcategory: Optional[str] = None
    author: Optional[str] = None
    license: str = "Unknown"
    description: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    file_size_bytes: Optional[int] = None
    checksum: Optional[str] = None
    preset_count: Optional[int] = None
    instrument_count: Optional[int] = None
    sample_rate: Optional[int] = None
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
            self.format,
            *self.tags,
        ]
        return any(query_lower in field.lower() for field in searchable)


class SFScraperBase(DownloadScraperBase[SFFileInfo]):
    @abstractmethod
    async def discover_soundfonts(self) -> List[SFFileInfo]:
        raise NotImplementedError("Subclasses must implement discover_soundfonts()")

    @abstractmethod
    async def download_file(
        self,
        file_info: SFFileInfo,
        output_path: str,
        progress_callback: Optional[Callable[[float], None]] = None,
    ) -> bool:
        raise NotImplementedError("Subclasses must implement download_file()")

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
            allowed_extensions={".sf2", ".sfz", ".sf3"},
            delete_zip=delete_zip,
            flatten=flatten,
            label="SoundFont files",
        )
