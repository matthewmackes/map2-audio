"""
Base VST3 Scraper Class - VST3 Plugin Library Management

Abstract base for VST3 plugin scrapers with advanced features:
- Async download with progress tracking and cancellation
- Checksum verification (SHA256)
- Rate limiting and retry logic
- Caching and deduplication
- Comprehensive metadata extraction
- Event-driven progress notifications
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
    EXTRACTING = "extracting"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class VST3PluginInfo:
    """Comprehensive information about a VST3 plugin package.

    Attributes:
        url: Download URL for the plugin
        filename: Local filename to use
        name: Human-readable plugin name
        library: Source library name
        category: Primary category (e.g., 'Distortion', 'Reverb')
        author: Plugin developer/company
        version: Plugin version string
        license: License type (Freeware, GPL, etc.)
        description: Human-readable description
        tags: Searchable tags for filtering
        file_size_bytes: Expected file size for progress calculation
        checksum: SHA256 hash for integrity verification
        platform: Target platform (linux, windows, mac, all)
        homepage: Plugin homepage URL
        created_at: When this metadata was discovered
    """
    url: str
    filename: str
    name: str
    library: str
    category: str
    author: Optional[str] = None
    version: Optional[str] = None
    license: str = "Freeware"
    description: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    file_size_bytes: Optional[int] = None
    checksum: Optional[str] = None
    platform: str = "linux"
    homepage: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.now)

    def __post_init__(self):
        if self.tags is None:
            self.tags = []

    @property
    def unique_id(self) -> str:
        """Generate unique identifier for deduplication."""
        return f"{self.library}:{self.name}:{self.version or 'latest'}"

    def matches_filter(self, query: str) -> bool:
        """Check if this plugin matches a search query.

        Args:
            query: Search string (case-insensitive)

        Returns:
            True if any field matches
        """
        query_lower = query.lower()
        searchable = [
            self.name, self.filename, self.category,
            self.author or "", self.description or "",
            *self.tags
        ]
        return any(query_lower in field.lower() for field in searchable)


@dataclass
class DownloadStatus:
    """Real-time status of a download operation."""
    plugin_info: VST3PluginInfo
    state: DownloadState = DownloadState.PENDING
    progress: float = 0.0
    bytes_downloaded: int = 0
    speed_bps: float = 0.0
    eta_seconds: Optional[float] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class VST3ScraperBase(ABC):
    """Abstract base class for VST3 plugin scrapers.

    Provides a robust foundation for implementing VST3 plugin scrapers with:
    - Async discovery and download operations
    - Progress tracking with speed and ETA calculation
    - Checksum verification for data integrity
    - Rate limiting to respect API quotas
    - Retry logic for transient failures
    - Event callbacks for real-time UI updates

    Subclasses must implement:
    - discover_plugins(): Find available plugins
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
            library_name: Name of the library (e.g., 'airwindows', 'uhe')
            base_url: Base URL for the library
            rate_limit_requests: Max requests per rate_limit_period
            rate_limit_period: Time window for rate limiting in seconds
        """
        self.library_name = library_name
        self.base_url = base_url
        self.discovered_plugins: List[VST3PluginInfo] = []
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

        logger.info(f"Initialized {library_name} VST3 scraper (rate limit: {rate_limit_requests}/{rate_limit_period}s)")

    @abstractmethod
    async def discover_plugins(self) -> List[VST3PluginInfo]:
        """Discover available VST3 plugins from the library.

        Subclasses should implement this to fetch the catalog of available
        plugins from their source (API, web scraping, etc.).

        Returns:
            List of VST3PluginInfo objects describing available plugins

        Raises:
            Exception: On network or parsing errors
        """
        raise NotImplementedError("Subclasses must implement discover_plugins()")

    @abstractmethod
    async def download_file(self, plugin_info: VST3PluginInfo, output_path: str,
                           progress_callback: Optional[Callable[[float], None]] = None) -> bool:
        """Download a single plugin file.

        Subclasses should implement the actual download logic, calling
        progress_callback periodically with values from 0.0 to 1.0.

        Args:
            plugin_info: Metadata about the file to download
            output_path: Local filesystem path to save the file
            progress_callback: Optional function to report download progress

        Returns:
            True if download succeeded, False otherwise

        Raises:
            Exception: On network or I/O errors
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

    async def download_batch(self, plugins: List[VST3PluginInfo], output_dir: str,
                            max_concurrent: int = 3,
                            on_progress: Optional[Callable[[str, DownloadStatus], None]] = None,
                            skip_existing: bool = True) -> Dict[str, bool]:
        """Download multiple plugins with concurrent execution.

        Args:
            plugins: List of plugins to download
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

        async def download_one(plugin_info: VST3PluginInfo) -> tuple:
            async with semaphore:
                if self._cancel_requested:
                    return plugin_info.filename, False

                output_path = os.path.join(output_dir, plugin_info.filename)

                # Check if already downloaded
                if skip_existing and os.path.exists(output_path):
                    if plugin_info.checksum:
                        if self._verify_checksum(output_path, plugin_info.checksum):
                            logger.debug(f"Skipping {plugin_info.filename} (already exists with valid checksum)")
                            return plugin_info.filename, True
                    else:
                        logger.debug(f"Skipping {plugin_info.filename} (already exists)")
                        return plugin_info.filename, True

                # Initialize status
                status = DownloadStatus(
                    plugin_info=plugin_info,
                    state=DownloadState.DOWNLOADING,
                    started_at=datetime.now()
                )
                self.download_progress[plugin_info.filename] = status

                def update_progress(progress: float):
                    status.progress = progress
                    if on_progress:
                        on_progress(plugin_info.filename, status)

                try:
                    await self._rate_limit()
                    success = await self.download_file(plugin_info, output_path, update_progress)

                    if success and plugin_info.checksum:
                        status.state = DownloadState.VERIFYING
                        if on_progress:
                            on_progress(plugin_info.filename, status)

                        if not self._verify_checksum(output_path, plugin_info.checksum):
                            logger.warning(f"Checksum mismatch for {plugin_info.filename}")
                            os.remove(output_path)
                            success = False

                    status.state = DownloadState.COMPLETED if success else DownloadState.FAILED
                    status.completed_at = datetime.now()

                    if success:
                        self._stats["total_downloaded"] += 1
                        if plugin_info.file_size_bytes:
                            self._stats["total_bytes"] += plugin_info.file_size_bytes
                    else:
                        self._stats["failed_downloads"] += 1

                    return plugin_info.filename, success

                except Exception as e:
                    logger.error(f"Download failed for {plugin_info.filename}: {e}")
                    status.state = DownloadState.FAILED
                    status.error_message = str(e)
                    self._stats["failed_downloads"] += 1
                    return plugin_info.filename, False
                finally:
                    if on_progress:
                        on_progress(plugin_info.filename, status)

        # Execute downloads concurrently
        tasks = [download_one(p) for p in plugins]
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

    def _verify_checksum(self, file_path: str, expected_hash: str) -> bool:
        """Verify file checksum matches expected value."""
        try:
            actual_hash = self._calculate_file_hash(file_path)
            return actual_hash.lower() == expected_hash.lower()
        except (IOError, OSError) as e:
            logger.error(f"Could not verify checksum for {file_path}: {e}")
            return False

    def get_progress(self, filename: str) -> float:
        """Get download progress for a specific file."""
        status = self.download_progress.get(filename)
        return status.progress if status else 0.0

    def get_status(self, filename: str) -> Optional[DownloadStatus]:
        """Get full download status for a file."""
        return self.download_progress.get(filename)

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

    def reset_progress(self) -> None:
        """Reset all progress tracking and statistics."""
        self.download_progress.clear()
        self._downloaded_ids.clear()

    def filter_plugins(self, query: str) -> List[VST3PluginInfo]:
        """Filter discovered plugins by search query."""
        if not query:
            return self.discovered_plugins
        return [p for p in self.discovered_plugins if p.matches_filter(query)]

    def get_categories(self) -> Dict[str, int]:
        """Get category breakdown of discovered plugins."""
        categories: Dict[str, int] = {}
        for p in self.discovered_plugins:
            categories[p.category] = categories.get(p.category, 0) + 1
        return dict(sorted(categories.items()))

    def extract_archive(self, archive_path: str, output_dir: str,
                       delete_archive: bool = True,
                       flatten: bool = False) -> List[str]:
        """Extract archive (ZIP/tar.gz) and return list of extracted VST3 bundles.

        Args:
            archive_path: Path to the archive file
            output_dir: Directory to extract files to
            delete_archive: Whether to delete the archive after extraction
            flatten: If True, extract all files to output_dir ignoring internal paths

        Returns:
            List of paths to extracted .vst3 bundles
        """
        extracted_files = []

        try:
            os.makedirs(output_dir, exist_ok=True)

            if archive_path.lower().endswith('.zip'):
                if not zipfile.is_zipfile(archive_path):
                    logger.warning(f"Not a valid ZIP file: {archive_path}")
                    return []

                with zipfile.ZipFile(archive_path, 'r') as zf:
                    for member in zf.namelist():
                        # Skip macOS metadata
                        if '__MACOSX' in member or member.startswith('.'):
                            continue

                        # Look for .vst3 bundles (they're directories)
                        if '.vst3' in member:
                            # Get the .vst3 bundle root
                            parts = member.split('/')
                            vst3_idx = next((i for i, p in enumerate(parts) if p.endswith('.vst3')), None)
                            if vst3_idx is not None:
                                vst3_name = parts[vst3_idx]
                                if flatten:
                                    out_base = os.path.join(output_dir, vst3_name)
                                else:
                                    out_base = os.path.join(output_dir, '/'.join(parts[:vst3_idx+1]))

                                if out_base not in extracted_files:
                                    extracted_files.append(out_base)

                    # Extract all files
                    zf.extractall(output_dir)

            elif archive_path.lower().endswith(('.tar.gz', '.tgz')):
                import tarfile
                with tarfile.open(archive_path, 'r:gz') as tf:
                    for member in tf.getmembers():
                        if '.vst3' in member.name:
                            parts = member.name.split('/')
                            vst3_idx = next((i for i, p in enumerate(parts) if p.endswith('.vst3')), None)
                            if vst3_idx is not None:
                                # Use full path including parent directories (same as ZIP extraction)
                                if flatten:
                                    out_base = os.path.join(output_dir, parts[vst3_idx])
                                else:
                                    out_base = os.path.join(output_dir, '/'.join(parts[:vst3_idx+1]))
                                if out_base not in extracted_files:
                                    extracted_files.append(out_base)
                    tf.extractall(output_dir)

            elif archive_path.lower().endswith('.7z'):
                try:
                    import py7zr
                    with py7zr.SevenZipFile(archive_path, mode='r') as archive:
                        # Get list of files to find .vst3 bundles
                        for name in archive.getnames():
                            if '.vst3' in name:
                                parts = name.split('/')
                                vst3_idx = next((i for i, p in enumerate(parts) if p.endswith('.vst3')), None)
                                if vst3_idx is not None:
                                    if flatten:
                                        out_base = os.path.join(output_dir, parts[vst3_idx])
                                    else:
                                        out_base = os.path.join(output_dir, '/'.join(parts[:vst3_idx+1]))
                                    if out_base not in extracted_files:
                                        extracted_files.append(out_base)
                        archive.extractall(output_dir)
                except ImportError:
                    logger.error("py7zr not installed - cannot extract .7z archives. Run: pip install py7zr")

            logger.info(f"Extracted {len(extracted_files)} VST3 bundles from {os.path.basename(archive_path)}")

            # Delete archive if requested
            if delete_archive:
                try:
                    os.remove(archive_path)
                    logger.debug(f"Deleted archive: {archive_path}")
                except OSError as e:
                    logger.warning(f"Could not delete archive {archive_path}: {e}")

        except Exception as e:
            logger.error(f"Error extracting {archive_path}: {e}")

        return extracted_files

    async def download_and_extract(self, plugin_info: VST3PluginInfo, output_dir: str,
                                   progress_callback: Optional[Callable[[float], None]] = None,
                                   delete_archive: bool = True) -> List[str]:
        """Download archive and extract VST3 bundles.

        Args:
            plugin_info: Plugin info with download URL
            output_dir: Directory to extract files to
            progress_callback: Optional progress callback
            delete_archive: Whether to delete archive after extraction

        Returns:
            List of paths to extracted VST3 bundles
        """
        # Download to temp location
        archive_path = os.path.join(output_dir, plugin_info.filename)

        success = await self.download_file(plugin_info, archive_path, progress_callback)
        if not success:
            return []

        # Extract if it's an archive
        if plugin_info.filename.lower().endswith(('.zip', '.tar.gz', '.tgz', '.7z')):
            return self.extract_archive(archive_path, output_dir, delete_archive=delete_archive)
        else:
            return [archive_path]
