"""
IR Download Manager
Coordinate downloading from multiple IR libraries.
"""

import logging
import asyncio
import os
from typing import List, Dict, Optional, Set
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime

from .scraper_base import IRScraperBase, IRFileInfo
from .conners_scraper import ConnersScraper
from .voxengo_scraper import VoxengoScraper
from .nam_github_scraper import NAMGitHubScraper
from .djammincabs_scraper import DjammincabsScraper
from .overdriven_scraper import OverdrivenScraper
from .samplicity_scraper import SamplicityScraper
from .signaltonoize_scraper import SignalToNoizeScraper
from .echothief_scraper import EchoThiefScraper
from .lexicon_scraper import LexiconScraper
from .tone3000_scraper import Tone3000Scraper
from .fokke_scraper import FokkeScraper
from app.services.ir_loader import get_ir_loader
from app.database import get_session, ImpulseResponse
from app.paths import StoragePaths

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
    total_bytes: int = 0
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None


class IRDownloadManager:
    """Manage IR library downloads."""

    def __init__(self, storage_path: Optional[str] = None):
        """Initialize download manager.

        Args:
            storage_path: Base path for storing IRs (uses config default if None)
        """
        # Use centralized paths from StoragePaths
        if storage_path:
            self.storage_path = storage_path
        else:
            self.storage_path = str(StoragePaths.get_ir_download_dir())
        self.scrapers: Dict[str, IRScraperBase] = {}
        self.stats = DownloadStats()
        self.source_stats: Dict[str, SourceStats] = {}
        self.is_downloading = False
        self.downloaded_hashes: Set[str] = set()
        self.current_source: Optional[str] = None
        self.active_sources: List[str] = []
        self.failed_sources: List[str] = []

        # Initialize scrapers
        self._init_scrapers()

        # Create storage directory
        os.makedirs(self.storage_path, exist_ok=True)

        logger.info(f"IR Download Manager initialized: {self.storage_path}")
    
    def _init_scrapers(self) -> None:
        """Initialize all scrapers."""
        self.scrapers = {
            # Reverb IR scrapers
            'conners': ConnersScraper(),
            'voxengo': VoxengoScraper(),
            'samplicity': SamplicityScraper(),
            'signaltonoize': SignalToNoizeScraper(),
            'echothief': EchoThiefScraper(),
            'lexicon': LexiconScraper(),
            'fokke': FokkeScraper(),
            # Cabinet IR scrapers
            'djammincabs': DjammincabsScraper(),
            'overdriven': OverdrivenScraper(),
            # NAM model scrapers
            'nam_github': NAMGitHubScraper(),
            'tone3000': Tone3000Scraper(),
        }

    def get_tone3000_scraper(self) -> Tone3000Scraper:
        """Get the TONE3000 scraper instance.

        Returns:
            Tone3000Scraper instance
        """
        return self.scrapers.get('tone3000')
    
    async def discover_all(self, sources: Optional[List[str]] = None) -> Dict[str, List[IRFileInfo]]:
        """Discover IRs from all or specified sources.

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

            logger.info(f"Discovering IRs from {source}...")
            scraper = self.scrapers[source]
            try:
                files = await scraper.discover_irs()
                discovered[source] = files
                if source in self.source_stats:
                    self.source_stats[source].discovered = len(files)
                logger.info(f"Found {len(files)} IRs from {source}")
            except Exception as e:
                logger.error(f"Discovery failed for {source}: {e}")
                discovered[source] = []
                if source in self.source_stats:
                    self.source_stats[source].state = "failed"

        return discovered

    async def download_all(self, sources: Optional[List[str]] = None,
                          parallel: int = 4, skip_existing: bool = True) -> DownloadStats:
        """Download IRs from all or specified sources.

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

        try:
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
            logger.info(f"Starting download of {len(all_files)} IRs with {parallel} parallel workers")

            # Load existing hashes if skipping
            if skip_existing:
                await self._load_existing_hashes()

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

            return self.stats
            
        finally:
            self.is_downloading = False
    
    async def _download_with_semaphore(self, file_info: IRFileInfo, 
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
    
    async def _download_file(self, file_info: IRFileInfo, skip_existing: bool) -> Optional[bool]:
        """Download and process a single IR file.

        Handles ZIP files by extracting and importing all contained IRs.

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

            # Determine base storage path based on file type
            # NAM files (.nam) go to NAM directory, everything else to IR directory
            is_nam_file = file_info.filename.lower().endswith('.nam')
            if is_nam_file:
                base_path = str(StoragePaths.get_nam_system_dir())
            else:
                base_path = self.storage_path

            # Build output path
            library_dir = os.path.join(base_path, file_info.library)
            category_dir = os.path.join(library_dir, file_info.category.lower().replace(' ', '_'))

            if file_info.subcategory:
                category_dir = os.path.join(category_dir, file_info.subcategory.lower().replace(' ', '_'))

            os.makedirs(category_dir, exist_ok=True)
            output_path = os.path.join(category_dir, file_info.filename)

            # Check if exists (for non-ZIP files)
            is_zip = file_info.filename.lower().endswith('.zip')
            if skip_existing and not is_zip and os.path.exists(output_path):
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
                if is_zip:
                    # Extract ZIP and import all files
                    extracted_files = scraper.extract_zip(output_path, category_dir, delete_zip=True)
                    for extracted_path in extracted_files:
                        await self._import_ir_to_database(extracted_path, file_info)
                    logger.info(f"Extracted and imported {len(extracted_files)} files from {file_info.filename}")
                else:
                    # Import single file
                    await self._import_ir_to_database(output_path, file_info)

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
    
    async def _import_ir_to_database(self, file_path: str, file_info: IRFileInfo) -> None:
        """Import IR to database.
        
        Args:
            file_path: Path to downloaded file
            file_info: File metadata
        """
        try:
            # Load and analyze IR
            loader = get_ir_loader()
            result = loader.load_ir_file(file_path)
            
            if result is None:
                logger.warning(f"Could not load IR: {file_path}")
                return
            
            audio_data, sample_rate, metadata = result
            
            # Create database entry
            session = get_session()
            
            # Check if already exists
            existing = session.query(ImpulseResponse).filter_by(
                file_hash=metadata['file_hash']
            ).first()
            
            if existing:
                logger.debug(f"IR already in database: {file_info.filename}")
                session.close()
                return
            
            ir_entry = ImpulseResponse(
                name=metadata['file_name'],
                file_path=file_path,
                file_hash=metadata['file_hash'],
                sample_rate=metadata['sample_rate'],
                channels=metadata['channels'],
                duration_seconds=metadata['duration_seconds'],
                length_samples=metadata['length_samples'],
                peak_amplitude=metadata['peak_amplitude'],
                rms_level=metadata['rms_level'],
                category=file_info.category,
                subcategory=file_info.subcategory,
                library=file_info.library,
                license=file_info.license,
                source_url=file_info.url,
                author=file_info.author,
                description=file_info.description,
                tags=file_info.tags,
                rt60=metadata.get('rt60_seconds'),
                early_decay_time=metadata.get('early_decay_time_seconds'),
                peak_location_ms=metadata.get('peak_location_ms'),
                estimated_characteristics=metadata.get('estimated', True)
            )
            
            session.add(ir_entry)
            session.commit()
            session.close()
            
            logger.debug(f"Imported IR to database: {file_info.filename}")
            
        except Exception as e:
            logger.error(f"Error importing IR to database: {e}")
    
    async def _load_existing_hashes(self) -> None:
        """Load hashes of existing IRs from database."""
        try:
            session = get_session()
            irs = session.query(ImpulseResponse).all()
            self.downloaded_hashes = {ir.file_hash for ir in irs}
            session.close()
            logger.info(f"Loaded {len(self.downloaded_hashes)} existing IR hashes")
        except Exception as e:
            logger.error(f"Error loading existing hashes: {e}")
    
    def get_progress(self) -> Dict:
        """Get current download progress.

        Returns:
            Progress dict with stats (even after download completes)
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

        # Return stats even when not downloading (so UI can show completion)
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
            logger.info("Download cancelled by user")


# Global instance
_download_manager: Optional[IRDownloadManager] = None


def get_download_manager(storage_path: Optional[str] = None) -> IRDownloadManager:
    """Get or create download manager instance."""
    global _download_manager
    if _download_manager is None:
        _download_manager = IRDownloadManager(storage_path)
    return _download_manager
