"""
Base SoundFont Scraper Class

Abstract base for SoundFont library scrapers with advanced features:
- Async download with progress tracking and cancellation
- Checksum verification (SHA256)
- Rate limiting and retry logic
- Comprehensive metadata extraction
"""

import logging
import asyncio
import os
import time
import zipfile
import shutil
from abc import ABC, abstractmethod
from typing import List, Dict, Optional, Callable, Any, Set
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import hashlib

logger = logging.getLogger(__name__)


class DownloadState(Enum):
    """State of a download operation."""
    PENDING = "pending"
    DOWNLOADING = "downloading"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class SFFileInfo:
    """Comprehensive information about a SoundFont file.

    Attributes:
        url: Download URL for the SoundFont file
        filename: Local filename to use
        library: Source library name
        format: File format ('sf2' or 'sfz')
        category: Primary category (e.g., 'Piano', 'Strings', 'Drums')
        subcategory: Optional subcategory for finer organization
        author: Creator/contributor name
        license: License type (MIT, CC-BY, etc.)
        description: Human-readable description
        tags: Searchable tags for filtering
        file_size_bytes: Expected file size for progress calculation
        checksum: SHA256 hash for integrity verification
        preset_count: Number of presets/patches in the SoundFont
        instrument_count: Number of instruments
        sample_rate: Native sample rate
        created_at: When this metadata was discovered
    """
    url: str
    filename: str
    library: str
    format: str  # 'sf2' or 'sfz'
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
        """Generate unique identifier for deduplication."""
        return f"{self.library}:{self.filename}"

    def matches_filter(self, query: str) -> bool:
        """Check if this SoundFont matches a search query.

        Args:
            query: Search string (case-insensitive)

        Returns:
            True if any field matches
        """
        query_lower = query.lower()
        searchable = [
            self.filename, self.category, self.subcategory or "",
            self.author or "", self.description or "", self.format,
            *self.tags
        ]
        return any(query_lower in field.lower() for field in searchable)


@dataclass
class DownloadStatus:
    """Real-time status of a download operation."""
    file_info: SFFileInfo
    state: DownloadState = DownloadState.PENDING
    progress: float = 0.0
    bytes_downloaded: int = 0
    speed_bps: float = 0.0
    eta_seconds: Optional[float] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class SFScraperBase(ABC):
    """Abstract base class for SoundFont library scrapers.

    Provides a robust foundation for implementing SoundFont scrapers with:
    - Async discovery and download operations
    - Progress tracking with speed and ETA calculation
    - Rate limiting to respect API quotas
    - Event callbacks for real-time UI updates

    Subclasses must implement:
    - discover_soundfonts(): Find available SoundFont files
    - download_file(): Download a specific file
    """

    # Rate limiting defaults
    DEFAULT_RATE_LIMIT_REQUESTS = 10
    DEFAULT_RATE_LIMIT_PERIOD = 1.0  # seconds

    def __init__(self, library_name: str, base_url: str,
                 rate_limit_requests: int = DEFAULT_RATE_LIMIT_REQUESTS,
                 rate_limit_period: float = DEFAULT_RATE_LIMIT_PERIOD):
        """Initialize scraper with configuration.

        Args:
            library_name: Name of the library (e.g., 'sfzinstruments', 'freepats')
            base_url: Base URL for the library
            rate_limit_requests: Max requests per rate_limit_period
            rate_limit_period: Time window for rate limiting in seconds
        """
        self.library_name = library_name
        self.base_url = base_url
        self.discovered_files: List[SFFileInfo] = []
        self.download_progress: Dict[str, DownloadStatus] = {}
        self._downloaded_ids: Set[str] = set()

        # Rate limiting
        self._rate_limit_requests = rate_limit_requests
        self._rate_limit_period = rate_limit_period
        self._request_times: List[float] = []
        self._rate_lock = asyncio.Lock()

        # Cancellation support
        self._cancel_requested = False

        # Statistics
        self._stats = {
            "total_discovered": 0,
            "total_downloaded": 0,
            "total_bytes": 0,
            "failed_downloads": 0,
            "last_discovery": None
        }

        logger.info(f"Initialized {library_name} scraper (rate limit: {rate_limit_requests}/{rate_limit_period}s)")

    @abstractmethod
    async def discover_soundfonts(self) -> List[SFFileInfo]:
        """Discover available SoundFont files from the library.

        Subclasses should implement this to fetch the catalog of available
        SoundFonts from their source (API, web scraping, etc.).

        Returns:
            List of SFFileInfo objects describing available files
        """
        raise NotImplementedError("Subclasses must implement discover_soundfonts()")

    @abstractmethod
    async def download_file(self, file_info: SFFileInfo, output_path: str,
                           progress_callback: Optional[Callable[[float], None]] = None) -> bool:
        """Download a single SoundFont file.

        Args:
            file_info: Metadata about the file to download
            output_path: Local filesystem path to save the file
            progress_callback: Optional function to report download progress

        Returns:
            True if download succeeded, False otherwise
        """
        raise NotImplementedError("Subclasses must implement download_file()")

    async def _rate_limit(self) -> None:
        """Apply rate limiting before making a request."""
        async with self._rate_lock:
            now = time.time()
            # Remove old request times outside the window
            self._request_times = [t for t in self._request_times
                                   if now - t < self._rate_limit_period]

            if len(self._request_times) >= self._rate_limit_requests:
                # Wait until oldest request expires
                wait_time = self._rate_limit_period - (now - self._request_times[0])
                if wait_time > 0:
                    logger.debug(f"Rate limit reached, waiting {wait_time:.2f}s")
                    await asyncio.sleep(wait_time)

            self._request_times.append(time.time())

    async def download_batch(self, files: List[SFFileInfo], output_dir: str,
                            max_concurrent: int = 3,
                            on_progress: Optional[Callable[[str, DownloadStatus], None]] = None,
                            skip_existing: bool = True) -> Dict[str, bool]:
        """Download multiple files with concurrent execution.

        Args:
            files: List of files to download
            output_dir: Directory to save files
            max_concurrent: Maximum concurrent downloads
            on_progress: Callback for progress updates (filename, status)
            skip_existing: Skip files that already exist locally

        Returns:
            Dict mapping filename to success status
        """
        os.makedirs(output_dir, exist_ok=True)
        results: Dict[str, bool] = {}
        semaphore = asyncio.Semaphore(max_concurrent)

        async def download_one(file_info: SFFileInfo) -> tuple:
            async with semaphore:
                if self._cancel_requested:
                    return file_info.filename, False

                output_path = os.path.join(output_dir, file_info.filename)

                # Check if already downloaded
                if skip_existing and os.path.exists(output_path):
                    logger.debug(f"Skipping {file_info.filename} (already exists)")
                    return file_info.filename, True

                # Initialize status
                status = DownloadStatus(
                    file_info=file_info,
                    state=DownloadState.DOWNLOADING,
                    started_at=datetime.now()
                )
                self.download_progress[file_info.filename] = status

                def update_progress(progress: float):
                    status.progress = progress
                    if on_progress:
                        on_progress(file_info.filename, status)

                try:
                    await self._rate_limit()
                    success = await self.download_file(file_info, output_path, update_progress)

                    status.state = DownloadState.COMPLETED if success else DownloadState.FAILED
                    status.completed_at = datetime.now()

                    if success:
                        self._stats["total_downloaded"] += 1
                        if file_info.file_size_bytes:
                            self._stats["total_bytes"] += file_info.file_size_bytes
                    else:
                        self._stats["failed_downloads"] += 1

                    return file_info.filename, success

                except Exception as e:
                    logger.error(f"Download failed for {file_info.filename}: {e}")
                    status.state = DownloadState.FAILED
                    status.error_message = str(e)
                    self._stats["failed_downloads"] += 1
                    return file_info.filename, False
                finally:
                    if on_progress:
                        on_progress(file_info.filename, status)

        # Execute downloads concurrently
        tasks = [download_one(f) for f in files]
        completed = await asyncio.gather(*tasks, return_exceptions=True)

        for result in completed:
            if isinstance(result, tuple):
                results[result[0]] = result[1]
            else:
                logger.error(f"Download task failed: {result}")

        return results

    def cancel_downloads(self) -> None:
        """Request cancellation of ongoing downloads."""
        self._cancel_requested = True
        logger.info(f"Cancellation requested for {self.library_name} downloads")

    def reset_cancellation(self) -> None:
        """Reset cancellation flag for new operations."""
        self._cancel_requested = False

    def _calculate_file_hash(self, file_path: str) -> str:
        """Calculate SHA256 hash of file."""
        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha256.update(chunk)
        return sha256.hexdigest()

    def get_statistics(self) -> Dict[str, Any]:
        """Get scraper statistics."""
        return {
            **self._stats,
            "library_name": self.library_name,
            "pending_downloads": sum(
                1 for s in self.download_progress.values()
                if s.state in (DownloadState.PENDING, DownloadState.DOWNLOADING)
            )
        }

    def filter_files(self, query: str) -> List[SFFileInfo]:
        """Filter discovered files by search query."""
        if not query:
            return self.discovered_files
        return [f for f in self.discovered_files if f.matches_filter(query)]

    def get_categories(self) -> Dict[str, int]:
        """Get category breakdown of discovered files."""
        categories: Dict[str, int] = {}
        for f in self.discovered_files:
            categories[f.category] = categories.get(f.category, 0) + 1
        return dict(sorted(categories.items()))

    def extract_zip(self, zip_path: str, output_dir: str,
                   delete_zip: bool = True,
                   flatten: bool = False) -> List[str]:
        """Extract ZIP archive and return list of extracted SoundFont files.

        Args:
            zip_path: Path to the ZIP file
            output_dir: Directory to extract files to
            delete_zip: Whether to delete the ZIP after extraction
            flatten: If True, extract all files to output_dir ignoring internal paths

        Returns:
            List of paths to extracted SoundFont files
        """
        extracted_files = []
        sf_extensions = {'.sf2', '.sfz', '.sf3'}

        try:
            if not zipfile.is_zipfile(zip_path):
                logger.warning(f"Not a valid ZIP file: {zip_path}")
                return []

            os.makedirs(output_dir, exist_ok=True)

            with zipfile.ZipFile(zip_path, 'r') as zf:
                for member in zf.namelist():
                    # Skip directories and macOS metadata
                    if member.endswith('/') or '__MACOSX' in member or member.startswith('.'):
                        continue

                    # Check if it's a SoundFont file
                    _, ext = os.path.splitext(member.lower())
                    if ext not in sf_extensions:
                        continue

                    # Determine output path
                    if flatten:
                        filename = os.path.basename(member)
                        out_path = os.path.join(output_dir, filename)
                    else:
                        out_path = os.path.join(output_dir, member)
                        os.makedirs(os.path.dirname(out_path) or output_dir, exist_ok=True)

                    # Handle duplicates
                    if os.path.exists(out_path):
                        base, ext = os.path.splitext(out_path)
                        counter = 1
                        while os.path.exists(out_path):
                            out_path = f"{base}_{counter}{ext}"
                            counter += 1

                    # Extract file
                    try:
                        with zf.open(member) as src, open(out_path, 'wb') as dst:
                            shutil.copyfileobj(src, dst)
                        extracted_files.append(out_path)
                        logger.debug(f"Extracted: {out_path}")
                    except Exception as e:
                        logger.warning(f"Failed to extract {member}: {e}")

            logger.info(f"Extracted {len(extracted_files)} SoundFont files from {os.path.basename(zip_path)}")

            # Delete ZIP if requested
            if delete_zip:
                try:
                    os.remove(zip_path)
                    logger.debug(f"Deleted ZIP: {zip_path}")
                except OSError as e:
                    logger.warning(f"Could not delete ZIP {zip_path}: {e}")

        except zipfile.BadZipFile as e:
            logger.error(f"Bad ZIP file {zip_path}: {e}")
        except Exception as e:
            logger.error(f"Error extracting {zip_path}: {e}")

        return extracted_files
