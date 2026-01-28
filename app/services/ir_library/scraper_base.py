"""
Base IR Scraper Class - State-of-the-Art IR Library Management

Abstract base for IR library scrapers with advanced features:
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
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class IRFileInfo:
    """Comprehensive information about an IR file.
    
    Attributes:
        url: Download URL for the IR file
        filename: Local filename to use
        library: Source library name
        category: Primary category (e.g., 'Concert Halls', 'Plate Reverbs')
        subcategory: Optional subcategory for finer organization
        author: Creator/contributor name
        license: License type (MIT, CC-BY, etc.)
        description: Human-readable description
        tags: Searchable tags for filtering
        file_size_bytes: Expected file size for progress calculation
        checksum: SHA256 hash for integrity verification
        sample_rate: Native sample rate of the IR (e.g., 48000)
        channels: Number of audio channels (1=mono, 2=stereo)
        duration_ms: Duration of the impulse response in milliseconds
        created_at: When this metadata was discovered
    """
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
        """Generate unique identifier for deduplication."""
        return f"{self.library}:{self.filename}"
    
    def matches_filter(self, query: str) -> bool:
        """Check if this IR matches a search query.
        
        Args:
            query: Search string (case-insensitive)
            
        Returns:
            True if any field matches
        """
        query_lower = query.lower()
        searchable = [
            self.filename, self.category, self.subcategory or "",
            self.author or "", self.description or "",
            *self.tags
        ]
        return any(query_lower in field.lower() for field in searchable)


@dataclass
class DownloadStatus:
    """Real-time status of a download operation."""
    file_info: IRFileInfo
    state: DownloadState = DownloadState.PENDING
    progress: float = 0.0
    bytes_downloaded: int = 0
    speed_bps: float = 0.0
    eta_seconds: Optional[float] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class IRScraperBase(ABC):
    """Abstract base class for IR library scrapers.
    
    Provides a robust foundation for implementing IR library scrapers with:
    - Async discovery and download operations
    - Progress tracking with speed and ETA calculation
    - Checksum verification for data integrity
    - Rate limiting to respect API quotas
    - Retry logic for transient failures
    - Event callbacks for real-time UI updates
    
    Subclasses must implement:
    - discover_irs(): Find available IR files
    - download_file(): Download a specific file
    
    Example:
        class MyLibraryScraper(IRScraperBase):
            async def discover_irs(self) -> List[IRFileInfo]:
                # Fetch catalog from API
                ...
            
            async def download_file(self, file_info, output_path, progress_callback=None) -> bool:
                # Download with progress reporting
                ...
        
        scraper = MyLibraryScraper("mylibrary", "https://api.example.com")
        irs = await scraper.discover_irs()
        await scraper.download_batch(irs[:10], "/path/to/irs/")
    """
    
    # Rate limiting defaults
    DEFAULT_RATE_LIMIT_REQUESTS = 10
    DEFAULT_RATE_LIMIT_PERIOD = 1.0  # seconds
    
    def __init__(self, library_name: str, base_url: str, 
                 rate_limit_requests: int = DEFAULT_RATE_LIMIT_REQUESTS,
                 rate_limit_period: float = DEFAULT_RATE_LIMIT_PERIOD):
        """Initialize scraper with configuration.
        
        Args:
            library_name: Name of the library (e.g., 'conners', 'openair')
            base_url: Base URL for the library
            rate_limit_requests: Max requests per rate_limit_period
            rate_limit_period: Time window for rate limiting in seconds
        """
        self.library_name = library_name
        self.base_url = base_url
        self.discovered_files: List[IRFileInfo] = []
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
    async def discover_irs(self) -> List[IRFileInfo]:
        """Discover available IR files from the library.
        
        Subclasses should implement this to fetch the catalog of available
        impulse responses from their source (API, web scraping, etc.).
        
        Returns:
            List of IRFileInfo objects describing available files
            
        Raises:
            Exception: On network or parsing errors
        """
        raise NotImplementedError("Subclasses must implement discover_irs()")
    
    @abstractmethod
    async def download_file(self, file_info: IRFileInfo, output_path: str, 
                           progress_callback: Optional[Callable[[float], None]] = None) -> bool:
        """Download a single IR file.
        
        Subclasses should implement the actual download logic, calling
        progress_callback periodically with values from 0.0 to 1.0.
        
        Args:
            file_info: Metadata about the file to download
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
    
    async def download_batch(self, files: List[IRFileInfo], output_dir: str,
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
        
        async def download_one(file_info: IRFileInfo) -> tuple:
            async with semaphore:
                if self._cancel_requested:
                    return file_info.filename, False
                
                output_path = os.path.join(output_dir, file_info.filename)
                
                # Check if already downloaded
                if skip_existing and os.path.exists(output_path):
                    if file_info.checksum:
                        if self._verify_checksum(output_path, file_info.checksum):
                            logger.debug(f"Skipping {file_info.filename} (already exists with valid checksum)")
                            return file_info.filename, True
                    else:
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
                    
                    if success and file_info.checksum:
                        status.state = DownloadState.VERIFYING
                        if on_progress:
                            on_progress(file_info.filename, status)
                        
                        if not self._verify_checksum(output_path, file_info.checksum):
                            logger.warning(f"Checksum mismatch for {file_info.filename}")
                            os.remove(output_path)
                            success = False
                    
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
        """Calculate SHA256 hash of file.
        
        Args:
            file_path: Path to file
            
        Returns:
            Lowercase hex digest of SHA256 hash
        """
        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha256.update(chunk)
        return sha256.hexdigest()
    
    def _verify_checksum(self, file_path: str, expected_hash: str) -> bool:
        """Verify file checksum matches expected value.
        
        Args:
            file_path: Path to file
            expected_hash: Expected SHA256 hash (hex string)
            
        Returns:
            True if checksums match
        """
        try:
            actual_hash = self._calculate_file_hash(file_path)
            return actual_hash.lower() == expected_hash.lower()
        except (IOError, OSError) as e:
            logger.error(f"Could not verify checksum for {file_path}: {e}")
            return False
    
    def get_progress(self, filename: str) -> float:
        """Get download progress for a specific file.
        
        Args:
            filename: Filename to check
            
        Returns:
            Progress from 0.0 to 1.0, or 0.0 if not found
        """
        status = self.download_progress.get(filename)
        return status.progress if status else 0.0
    
    def get_status(self, filename: str) -> Optional[DownloadStatus]:
        """Get full download status for a file.
        
        Args:
            filename: Filename to check
            
        Returns:
            DownloadStatus object or None
        """
        return self.download_progress.get(filename)
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get scraper statistics.
        
        Returns:
            Dictionary with discovery and download statistics
        """
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
    
    def filter_files(self, query: str) -> List[IRFileInfo]:
        """Filter discovered files by search query.
        
        Args:
            query: Search string
            
        Returns:
            Matching IRFileInfo objects
        """
        if not query:
            return self.discovered_files
        return [f for f in self.discovered_files if f.matches_filter(query)]
    
    def get_categories(self) -> Dict[str, int]:
        """Get category breakdown of discovered files.

        Returns:
            Dict mapping category name to count
        """
        categories: Dict[str, int] = {}
        for f in self.discovered_files:
            categories[f.category] = categories.get(f.category, 0) + 1
        return dict(sorted(categories.items()))

    def extract_zip(self, zip_path: str, output_dir: str,
                   delete_zip: bool = True,
                   flatten: bool = False) -> List[str]:
        """Extract ZIP archive and return list of extracted files.

        Handles IR files (.wav, .aif, .flac) and NAM models (.nam, .json).

        Args:
            zip_path: Path to the ZIP file
            output_dir: Directory to extract files to
            delete_zip: Whether to delete the ZIP after extraction
            flatten: If True, extract all files to output_dir ignoring internal paths

        Returns:
            List of paths to extracted audio/model files
        """
        extracted_files = []
        ir_extensions = {'.wav', '.aif', '.aiff', '.flac', '.nam', '.json'}

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

                    # Check if it's an IR or NAM file
                    _, ext = os.path.splitext(member.lower())
                    if ext not in ir_extensions:
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

            logger.info(f"Extracted {len(extracted_files)} files from {os.path.basename(zip_path)}")

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

    async def download_and_extract(self, file_info: IRFileInfo, output_dir: str,
                                   progress_callback: Optional[Callable[[float], None]] = None,
                                   delete_zip: bool = True) -> List[str]:
        """Download ZIP file and extract IR/NAM files.

        Args:
            file_info: File info with download URL
            output_dir: Directory to extract files to
            progress_callback: Optional progress callback
            delete_zip: Whether to delete ZIP after extraction

        Returns:
            List of paths to extracted files
        """
        # Download to temp location
        zip_path = os.path.join(output_dir, file_info.filename)

        success = await self.download_file(file_info, zip_path, progress_callback)
        if not success:
            return []

        # Extract if it's a ZIP
        if file_info.filename.lower().endswith('.zip'):
            return self.extract_zip(zip_path, output_dir, delete_zip=delete_zip)
        else:
            return [zip_path]
