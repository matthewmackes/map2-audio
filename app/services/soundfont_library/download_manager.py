"""
SoundFont Download Manager
Coordinate downloading from multiple SoundFont libraries.
Enhanced with pause/resume, state persistence, and real-time progress tracking.
"""

import logging
import asyncio
import os
import zipfile
import tarfile
import shutil
import json
from typing import List, Dict, Optional, Set, Callable
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path

try:
    import py7zr
    HAS_7Z_SUPPORT = True
except ImportError:
    HAS_7Z_SUPPORT = False

from .scraper_base import SFScraperBase, SFFileInfo
from .sfzinstruments_scraper import SFZInstrumentsScraper
from .musical_artifacts_scraper import MusicalArtifactsScraper
from .freepats_scraper import FreePatsScraper
from .internet_archive_scraper import InternetArchiveScraper
from .polyphone_scraper import PolyphoneScraper
from .vsco_scraper import VSCOScraper
from .pianobook_scraper import PianoBookScraper
from .vpo_scraper import VirtualPlayingOrchestraScraper
from app.services.websocket_manager import ws_manager

logger = logging.getLogger(__name__)


@dataclass
class SourceStats:
    """Per-source download statistics."""
    name: str
    total_files: int = 0
    discovered: int = 0
    downloaded: int = 0
    failed: int = 0
    skipped: int = 0
    current_file: Optional[str] = None
    state: str = "pending"  # pending, discovering, downloading, completed, failed


@dataclass
class DownloadStats:
    """Download statistics."""
    total_files: int = 0
    downloaded: int = 0
    failed: int = 0
    skipped: int = 0
    paused: int = 0
    total_bytes: int = 0
    downloaded_bytes: int = 0
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    pause_time: Optional[datetime] = None
    resume_time: Optional[datetime] = None
    total_pause_duration: float = 0.0
    speed_bps: float = 0.0
    average_speed_bps: float = 0.0
    peak_speed_bps: float = 0.0


@dataclass
class EnhancedDownloadState:
    """Persistent download state for resume capability."""
    manager_state: str = "IDLE"  # IDLE, DOWNLOADING, PAUSED, CANCELLED, COMPLETED
    stats: Dict = field(default_factory=dict)
    sources: Dict = field(default_factory=dict)
    active_files: Dict = field(default_factory=dict)
    completed_files: List[str] = field(default_factory=list)
    failed_files: List[str] = field(default_factory=list)
    paused_files: List[str] = field(default_factory=list)
    pending_files: List[Dict] = field(default_factory=list)
    parallel: int = 4
    skip_existing: bool = True
    chunk_size: int = 1024 * 1024
    max_retries: int = 3
    last_saved: Optional[datetime] = None


class SFDownloadManager:
    """Manage SoundFont library downloads with pause/resume and state persistence."""

    STATE_FILE_PATH = "~/.map2/soundfont_download_state.json"
    BROADCASTER_INTERVAL = 0.5  # Broadcast every 500ms

    def __init__(self, storage_path: Optional[str] = None):
        """Initialize download manager.

        Args:
            storage_path: Base path for storing SoundFonts (uses default if None)
        """
        # Use default path if not specified
        if storage_path:
            self.storage_path = storage_path
        else:
            self.storage_path = self._get_default_storage_path()

        self.scrapers: Dict[str, SFScraperBase] = {}
        self.stats = DownloadStats()
        self.source_stats: Dict[str, SourceStats] = {}
        self.is_downloading = False
        self.is_paused = False
        self.downloaded_hashes: Set[str] = set()
        self.current_source: Optional[str] = None
        self.active_sources: List[str] = []
        self.failed_sources: List[str] = []

        # Enhanced state management
        self._state_lock = asyncio.Lock()
        self._download_state = EnhancedDownloadState()
        self.state_file_path = os.path.expanduser(self.STATE_FILE_PATH)

        # Initialize scrapers
        self._init_scrapers()

        # Create storage directory
        os.makedirs(self.storage_path, exist_ok=True)

        # Create state directory
        os.makedirs(os.path.dirname(self.state_file_path), exist_ok=True)

        logger.info(f"SoundFont Download Manager initialized: {self.storage_path}")

        # Try to load previous state
        asyncio.create_task(self._load_state_async())

    def _get_default_storage_path(self) -> str:
        """Get default storage path for SoundFonts."""
        try:
            from app.paths import StoragePaths
            return str(StoragePaths.get_soundfont_download_dir())
        except (ImportError, AttributeError):
            # Fallback if paths module not updated yet
            return os.path.expanduser("~/.local/share/map2/soundfonts/downloads")

    def _init_scrapers(self) -> None:
        """Initialize all scrapers."""
        self.scrapers = {
            'sfzinstruments': SFZInstrumentsScraper(),
            'musical_artifacts': MusicalArtifactsScraper(),
            'freepats': FreePatsScraper(),
            'internet_archive': InternetArchiveScraper(),
            'polyphone': PolyphoneScraper(),
            'vsco': VSCOScraper(),
            'pianobook': PianoBookScraper(),
            'vpo': VirtualPlayingOrchestraScraper(),
        }

    # ==================== State Persistence ====================

    async def _load_state_async(self) -> None:
        """Asynchronously load saved download state."""
        try:
            await self._load_state()
        except Exception as e:
            logger.warning(f"Could not load previous download state: {e}")

    async def _load_state(self) -> bool:
        """Load download state from disk."""
        try:
            if not os.path.exists(self.state_file_path):
                return False

            with open(self.state_file_path, 'r') as f:
                data = json.load(f)

            async with self._state_lock:
                self._download_state = EnhancedDownloadState(**data)
                logger.info(f"Loaded download state: {self._download_state.manager_state}")

            return True
        except Exception as e:
            logger.error(f"Error loading download state: {e}")
            return False

    async def _save_state(self) -> None:
        """Save download state to disk."""
        try:
            async with self._state_lock:
                state_dict = asdict(self._download_state)
                state_dict['last_saved'] = datetime.utcnow().isoformat()

            with open(self.state_file_path, 'w') as f:
                json.dump(state_dict, f, indent=2, default=str)

            logger.debug("Download state saved")
        except Exception as e:
            logger.warning(f"Error saving download state: {e}")

    # ==================== Pause/Resume Control ====================

    async def pause_download(self) -> None:
        """Pause ongoing download."""
        if not self.is_downloading:
            logger.warning("No download in progress to pause")
            return

        async with self._state_lock:
            self.is_paused = True
            self._download_state.manager_state = "PAUSED"
            self.stats.pause_time = datetime.utcnow()

        logger.info("Download paused")
        await self._save_state()
        await self._broadcast_event("download:paused", {})

    async def resume_download(self) -> None:
        """Resume paused download."""
        if not self.is_paused:
            logger.warning("No paused download to resume")
            return

        async with self._state_lock:
            self.is_paused = False
            self._download_state.manager_state = "DOWNLOADING"
            if self.stats.pause_time:
                pause_duration = (datetime.utcnow() - self.stats.pause_time).total_seconds()
                self.stats.total_pause_duration += pause_duration
            self.stats.resume_time = datetime.utcnow()

        logger.info("Download resumed")
        await self._save_state()
        await self._broadcast_event("download:resumed", {})

    # ==================== Progress Broadcasting ====================

    async def _broadcast_progress(self) -> None:
        """Broadcast current progress via WebSocket."""
        try:
            progress = self.get_progress()
            await ws_manager.broadcast_json(
                topic="soundfont:download:progress",
                message=progress
            )
        except Exception as e:
            logger.warning(f"Error broadcasting progress: {e}")

    async def _broadcast_event(self, event_type: str, data: Dict) -> None:
        """Broadcast a download event via WebSocket."""
        try:
            message = {
                "event": event_type,
                "timestamp": datetime.utcnow().isoformat(),
                "data": data
            }
            await ws_manager.broadcast_json(
                topic="soundfont:download:progress",
                message=message
            )
        except Exception as e:
            logger.warning(f"Error broadcasting event: {e}")

    async def _progress_broadcaster_task(self) -> None:
        """Background task to broadcast progress periodically."""
        while self.is_downloading:
            try:
                await self._broadcast_progress()
                await asyncio.sleep(self.BROADCASTER_INTERVAL)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"Error in progress broadcaster: {e}")

    async def discover_all(self, sources: Optional[List[str]] = None) -> Dict[str, List[SFFileInfo]]:
        """Discover SoundFonts from all or specified sources.

        Args:
            sources: List of source names (None = all)

        Returns:
            Dict of source -> file list
        """
        if sources is None:
            sources = list(self.scrapers.keys())

        discovered = {}

        for source in sources:
            if source not in self.scrapers:
                logger.warning(f"Unknown source: {source}")
                continue

            # Update source state
            if source in self.source_stats:
                self.source_stats[source].state = "discovering"

            logger.info(f"Discovering SoundFonts from {source}...")
            scraper = self.scrapers[source]
            try:
                files = await scraper.discover_soundfonts()
                discovered[source] = files
                if source in self.source_stats:
                    self.source_stats[source].discovered = len(files)
                logger.info(f"Found {len(files)} SoundFonts from {source}")
            except Exception as e:
                logger.error(f"Discovery failed for {source}: {e}")
                discovered[source] = []
                if source in self.source_stats:
                    self.source_stats[source].state = "failed"

        return discovered

    async def download_all(self, sources: Optional[List[str]] = None,
                          parallel: int = 4, skip_existing: bool = True) -> DownloadStats:
        """Download SoundFonts from all or specified sources.

        Args:
            sources: List of source names (None = all)
            parallel: Number of parallel downloads
            skip_existing: Skip files that already exist

        Returns:
            Download statistics
        """
        if self.is_downloading:
            logger.warning("Download already in progress")
            return self.stats

        self.is_downloading = True
        self.is_paused = False
        self.stats = DownloadStats(start_time=datetime.utcnow())
        self.failed_sources = []

        # Initialize source stats
        if sources is None:
            sources = list(self.scrapers.keys())

        self.active_sources = sources.copy()
        self.source_stats = {
            source: SourceStats(name=source, state="pending")
            for source in sources
        }

        # Start progress broadcaster
        broadcaster_task = asyncio.create_task(self._progress_broadcaster_task())
        state_saver_task = asyncio.create_task(self._state_saver_task())

        try:
            # Broadcast download started
            await self._broadcast_event("download:started", {"sources": sources, "parallel": parallel})

            # Discover files
            discovered = await self.discover_all(sources)

            # Flatten file list and track per-source counts
            all_files = []
            for source, files in discovered.items():
                if source in self.source_stats:
                    self.source_stats[source].total_files = len(files)
                    self.source_stats[source].state = "downloading" if files else "completed"
                all_files.extend(files)

            self.stats.total_files = len(all_files)
            logger.info(f"Starting download of {len(all_files)} SoundFonts with {parallel} parallel workers")

            # Download in parallel batches
            semaphore = asyncio.Semaphore(parallel)
            tasks = [
                self._download_with_semaphore(file_info, semaphore, skip_existing)
                for file_info in all_files
            ]

            results = await asyncio.gather(*tasks, return_exceptions=True)

            # Count results
            for result in results:
                if isinstance(result, Exception):
                    self.stats.failed += 1
                elif result is True:
                    self.stats.downloaded += 1
                elif result is False:
                    self.stats.failed += 1
                elif result is None:
                    self.stats.skipped += 1

            # Mark all sources as completed
            for source in self.source_stats:
                if self.source_stats[source].state == "downloading":
                    self.source_stats[source].state = "completed"

            self.stats.end_time = datetime.utcnow()

            # Log summary
            duration = (self.stats.end_time - self.stats.start_time).total_seconds()
            logger.info(f"Download complete: {self.stats.downloaded} downloaded, "
                       f"{self.stats.skipped} skipped, {self.stats.failed} failed "
                       f"in {duration:.1f}s")

            # Broadcast completion
            await self._broadcast_event("download:completed", {
                "downloaded": self.stats.downloaded,
                "failed": self.stats.failed,
                "skipped": self.stats.skipped,
                "duration_seconds": duration
            })

            return self.stats

        finally:
            self.is_downloading = False
            broadcaster_task.cancel()
            state_saver_task.cancel()
            try:
                await broadcaster_task
                await state_saver_task
            except asyncio.CancelledError:
                pass
            await self._save_state()

    async def _download_with_semaphore(self, file_info: SFFileInfo,
                                      semaphore: asyncio.Semaphore,
                                      skip_existing: bool) -> Optional[bool]:
        """Download file with semaphore limit.

        Args:
            file_info: File to download
            semaphore: Semaphore for limiting concurrency
            skip_existing: Skip if exists

        Returns:
            True if downloaded, False if failed, None if skipped
        """
        async with semaphore:
            return await self._download_file(file_info, skip_existing)

    async def _download_file(self, file_info: SFFileInfo, skip_existing: bool) -> Optional[bool]:
        """Download and process a single SoundFont file.

        Args:
            file_info: File information
            skip_existing: Skip if already exists

        Returns:
            True if downloaded, False if failed, None if skipped
        """
        source = file_info.library
        src_stats = self.source_stats.get(source)

        try:
            # Update current file being downloaded
            if src_stats:
                src_stats.current_file = file_info.filename

            # Build output path
            library_dir = os.path.join(self.storage_path, file_info.library)
            category_dir = os.path.join(library_dir, file_info.category.lower().replace(' ', '_'))

            os.makedirs(category_dir, exist_ok=True)
            output_path = os.path.join(category_dir, file_info.filename)

            # Check if exists
            if skip_existing and os.path.exists(output_path):
                logger.debug(f"Skipping existing file: {file_info.filename}")
                if src_stats:
                    src_stats.skipped += 1
                return None

            # Download
            scraper = self.scrapers.get(file_info.library)
            if not scraper:
                logger.error(f"No scraper for library: {file_info.library}")
                if src_stats:
                    src_stats.failed += 1
                return False

            success = await scraper.download_file(file_info, output_path)

            if success:
                # Handle ZIP/archive files
                is_archive = any(file_info.filename.lower().endswith(ext)
                               for ext in ['.zip', '.tar.xz', '.tar.bz2', '.tar.gz', '.tgz', '.7z'])
                if is_archive:
                    # Extract archive and process contents
                    extract_dir = os.path.dirname(output_path)
                    extracted = self._extract_archive(output_path, extract_dir)
                    logger.info(f"Extracted {len(extracted)} files from archive: {file_info.filename}")

                if src_stats:
                    src_stats.downloaded += 1
                    src_stats.current_file = None
                return True

            if src_stats:
                src_stats.failed += 1
            return False

        except Exception as e:
            logger.error(f"Error downloading {file_info.filename}: {e}")
            if src_stats:
                src_stats.failed += 1
            return False

    def get_progress(self) -> Dict:
        """Get current download progress.

        Returns:
            Progress dict with stats
        """
        # Calculate duration
        duration = 0.0
        if self.stats.start_time:
            end = self.stats.end_time or datetime.utcnow()
            duration = (end - self.stats.start_time).total_seconds()

        # Calculate progress percentage
        progress_pct = 0.0
        if self.stats.total_files > 0:
            completed = self.stats.downloaded + self.stats.failed + self.stats.skipped
            progress_pct = (completed / self.stats.total_files) * 100.0

        has_stats = self.stats.total_files > 0 or self.stats.start_time is not None

        # Build per-source stats
        sources_progress = []
        for name, src_stats in self.source_stats.items():
            sources_progress.append({
                "name": name,
                "state": src_stats.state,
                "discovered": src_stats.discovered,
                "total_files": src_stats.total_files,
                "downloaded": src_stats.downloaded,
                "failed": src_stats.failed,
                "skipped": src_stats.skipped,
                "current_file": src_stats.current_file
            })

        return {
            "is_downloading": self.is_downloading,
            "progress_percent": progress_pct,
            "current_source": self.current_source,
            "active_sources": self.active_sources,
            "stats": {
                "total_files": self.stats.total_files,
                "downloaded": self.stats.downloaded,
                "failed": self.stats.failed,
                "skipped": self.stats.skipped,
                "duration_seconds": duration
            } if has_stats else None,
            "sources": sources_progress if sources_progress else None
        }

    def _extract_archive(self, archive_path: str, output_dir: str) -> List[str]:
        """Extract archive contents and return list of extracted SoundFont files.

        Args:
            archive_path: Path to the archive file
            output_dir: Directory to extract to

        Returns:
            List of extracted SoundFont file paths
        """
        extracted_files = []
        archive_lower = archive_path.lower()

        # Valid SoundFont extensions
        sf_extensions = {'.sf2', '.sfz', '.sf3'}

        try:
            if archive_lower.endswith('.zip'):
                # Extract ZIP file
                with zipfile.ZipFile(archive_path, 'r') as zf:
                    for member in zf.namelist():
                        # Skip directories and hidden files
                        if member.endswith('/') or member.startswith('__MACOSX'):
                            continue

                        # Extract the file
                        member_lower = member.lower()
                        ext = Path(member).suffix.lower()

                        # Only extract SoundFont files and related assets
                        if ext in sf_extensions or ext in {'.wav', '.flac', '.ogg', '.aiff', '.aif'}:
                            # Create subdirectory based on archive name (without extension)
                            archive_name = Path(archive_path).stem
                            dest_dir = os.path.join(output_dir, archive_name)
                            os.makedirs(dest_dir, exist_ok=True)

                            # Extract preserving directory structure
                            dest_path = os.path.join(dest_dir, os.path.basename(member))
                            with zf.open(member) as src, open(dest_path, 'wb') as dst:
                                shutil.copyfileobj(src, dst)

                            if ext in sf_extensions:
                                extracted_files.append(dest_path)
                            logger.debug(f"Extracted: {member} -> {dest_path}")

            elif archive_lower.endswith(('.tar.gz', '.tgz', '.tar.bz2', '.tar.xz')):
                # Determine compression mode
                if archive_lower.endswith(('.tar.gz', '.tgz')):
                    mode = 'r:gz'
                elif archive_lower.endswith('.tar.bz2'):
                    mode = 'r:bz2'
                else:
                    mode = 'r:xz'

                with tarfile.open(archive_path, mode) as tf:
                    for member in tf.getmembers():
                        # Skip directories
                        if member.isdir():
                            continue

                        member_lower = member.name.lower()
                        ext = Path(member.name).suffix.lower()

                        # Only extract SoundFont files and related assets
                        if ext in sf_extensions or ext in {'.wav', '.flac', '.ogg', '.aiff', '.aif'}:
                            # Create subdirectory based on archive name
                            archive_name = Path(archive_path).stem
                            if archive_name.endswith('.tar'):
                                archive_name = archive_name[:-4]
                            dest_dir = os.path.join(output_dir, archive_name)
                            os.makedirs(dest_dir, exist_ok=True)

                            # Extract
                            dest_path = os.path.join(dest_dir, os.path.basename(member.name))
                            with tf.extractfile(member) as src:
                                if src:
                                    with open(dest_path, 'wb') as dst:
                                        shutil.copyfileobj(src, dst)

                            if ext in sf_extensions:
                                extracted_files.append(dest_path)
                            logger.debug(f"Extracted: {member.name} -> {dest_path}")

            elif archive_lower.endswith('.7z'):
                # Extract 7z file
                if not HAS_7Z_SUPPORT:
                    logger.error("py7zr not installed, cannot extract .7z files")
                    return []

                # Get archive name for subdirectory
                archive_name = Path(archive_path).stem
                dest_dir = os.path.join(output_dir, archive_name)
                os.makedirs(dest_dir, exist_ok=True)

                with py7zr.SevenZipFile(archive_path, mode='r') as szf:
                    # Get list of files to extract
                    names_to_extract = []
                    for name in szf.getnames():
                        # Skip directories
                        if name.endswith('/'):
                            continue
                        ext = Path(name).suffix.lower()
                        # Only extract SoundFont files and related assets
                        if ext in sf_extensions or ext in {'.wav', '.flac', '.ogg', '.aiff', '.aif'}:
                            names_to_extract.append(name)

                    # Extract selected files
                    if names_to_extract:
                        szf.extract(path=dest_dir, targets=names_to_extract)

                        # Track extracted SoundFont files
                        for name in names_to_extract:
                            ext = Path(name).suffix.lower()
                            dest_path = os.path.join(dest_dir, os.path.basename(name))
                            # Handle nested paths - files may be extracted in subdirs
                            full_path = os.path.join(dest_dir, name)
                            if os.path.exists(full_path) and ext in sf_extensions:
                                # Move to flat directory structure
                                if full_path != dest_path:
                                    shutil.move(full_path, dest_path)
                                extracted_files.append(dest_path)
                            elif os.path.exists(dest_path) and ext in sf_extensions:
                                extracted_files.append(dest_path)
                            logger.debug(f"Extracted: {name} -> {dest_path}")

            # Remove original archive after successful extraction
            if extracted_files:
                os.remove(archive_path)
                logger.info(f"Extracted {len(extracted_files)} SoundFont files from {archive_path}")
            else:
                logger.warning(f"No SoundFont files found in archive: {archive_path}")

        except Exception as e:
            logger.error(f"Failed to extract archive {archive_path}: {e}")

        return extracted_files

    async def _state_saver_task(self) -> None:
        """Background task to save state periodically."""
        while self.is_downloading:
            try:
                await asyncio.sleep(5)  # Save every 5 seconds
                await self._save_state()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"Error in state saver: {e}")

    async def get_file_tasks(self) -> List[Dict]:
        """Get all active file download tasks."""
        return []  # SoundFonts use different tracking mechanism

    async def get_file_task(self, filename: str) -> Optional[Dict]:
        """Get progress for specific file."""
        return None  # SoundFonts use different tracking mechanism

    def reset_stats(self) -> None:
        """Reset download stats for a fresh start."""
        self.stats = DownloadStats()
        self.source_stats = {}
        self.current_source = None
        self.active_sources = []
        self.failed_sources = []

    async def cancel_download(self) -> None:
        """Cancel ongoing download."""
        if self.is_downloading:
            self.is_downloading = False
            # Cancel all scrapers
            for scraper in self.scrapers.values():
                scraper.cancel_downloads()
            logger.info("Download cancelled by user")
            await self._broadcast_event("download:cancelled", {})

    def get_libraries_info(self) -> List[Dict]:
        """Get information about available SoundFont libraries.

        Returns:
            List of library info dictionaries
        """
        return [
            {
                "name": "sfzinstruments",
                "displayName": "SFZ Instruments",
                "description": "Open source SFZ instruments from GitHub",
                "license": "Various (mostly CC)",
                "iconColor": "#10b981",
                "count": len(self.scrapers['sfzinstruments'].discovered_files) if 'sfzinstruments' in self.scrapers else 0,
            },
            {
                "name": "musical_artifacts",
                "displayName": "Musical Artifacts",
                "description": "Community-curated SF2 and SFZ collection",
                "license": "Various",
                "iconColor": "#8b5cf6",
                "count": len(self.scrapers['musical_artifacts'].discovered_files) if 'musical_artifacts' in self.scrapers else 0,
            },
            {
                "name": "freepats",
                "displayName": "FreePats",
                "description": "Quality free soundfonts with CC licenses",
                "license": "CC-BY / CC0",
                "iconColor": "#f59e0b",
                "count": len(self.scrapers['freepats'].discovered_files) if 'freepats' in self.scrapers else 0,
            },
            {
                "name": "internet_archive",
                "displayName": "Internet Archive",
                "description": "Classic GM soundfonts - Arachno, FluidR3, GeneralUser",
                "license": "Various",
                "iconColor": "#3b82f6",
                "count": len(self.scrapers['internet_archive'].discovered_files) if 'internet_archive' in self.scrapers else 0,
            },
            {
                "name": "polyphone",
                "displayName": "Polyphone",
                "description": "Community SF2 repository with quality instruments",
                "license": "Various",
                "iconColor": "#06b6d4",
                "count": len(self.scrapers['polyphone'].discovered_files) if 'polyphone' in self.scrapers else 0,
            },
            {
                "name": "vsco",
                "displayName": "VSCO Community",
                "description": "Versilian Studios Chamber Orchestra - professional orchestral",
                "license": "CC0",
                "iconColor": "#8b5cf6",
                "count": len(self.scrapers['vsco'].discovered_files) if 'vsco' in self.scrapers else 0,
            },
            {
                "name": "pianobook",
                "displayName": "PianoBook",
                "description": "Community-sampled instruments - pianos and more",
                "license": "Free for personal use",
                "iconColor": "#ec4899",
                "count": len(self.scrapers['pianobook'].discovered_files) if 'pianobook' in self.scrapers else 0,
            },
            {
                "name": "vpo",
                "displayName": "Virtual Playing Orchestra",
                "description": "Free orchestral library with SSO - strings, brass, woodwinds",
                "license": "CC-BY-SA",
                "iconColor": "#f97316",
                "count": len(self.scrapers['vpo'].discovered_files) if 'vpo' in self.scrapers else 0,
            },
        ]


# Global instance
_sf_download_manager: Optional[SFDownloadManager] = None


def get_sf_download_manager(storage_path: Optional[str] = None) -> SFDownloadManager:
    """Get or create download manager instance."""
    global _sf_download_manager
    if _sf_download_manager is None:
        _sf_download_manager = SFDownloadManager(storage_path)
    return _sf_download_manager
