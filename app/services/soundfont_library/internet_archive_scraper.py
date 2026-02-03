"""
Internet Archive SoundFont Scraper
Download SoundFonts from the Internet Archive's 500 Soundfonts collection.

Source: https://archive.org/details/500-soundfonts-full-gm-sets
License: Various (community collection)

Features:
- Large collection of 500 General MIDI soundfonts
- Direct download URLs
- Single ZIP archive (36.7 GB)
"""

import logging
import aiohttp
import os
from typing import List, Optional, Callable
from datetime import datetime

from .scraper_base import SFScraperBase, SFFileInfo

logger = logging.getLogger(__name__)


class InternetArchiveScraper(SFScraperBase):
    """Scraper for Internet Archive 500 Soundfonts collection.

    Downloads the comprehensive 500 Soundfonts Full GM Sets collection,
    which includes a wide variety of General MIDI compatible soundfonts.

    Note: This is a large download (~36.7 GB) and extraction may take time.
    """

    BASE_URL = "https://archive.org"
    COLLECTION_ID = "500-soundfonts-full-gm-sets"

    # Known files in the collection
    KNOWN_FILES = [
        {
            "filename": "500_Soundfonts_Full_GM_Sets.zip",
            "url": "https://archive.org/download/500-soundfonts-full-gm-sets/500_Soundfonts_Full_GM_Sets.zip",
            "size_bytes": 39424106496,  # ~36.7 GB
            "description": "500 Full General MIDI SoundFont collection",
            "category": "General MIDI",
        },
    ]

    # Working direct download URLs (GitHub raw files and reliable mirrors)
    ALTERNATIVE_FILES = [
        {
            "filename": "FluidR3_GM.sf2",
            "url": "https://github.com/urish/cinto/raw/master/media/FluidR3%20GM.sf2",
            "size_bytes": 148000000,  # ~141 MB
            "description": "FluidR3 GM - Popular open source GM soundfont",
            "category": "General MIDI",
        },
        {
            "filename": "GeneralUser_GS_1.471.sf2",
            "url": "https://github.com/trevorwslee/Arduino-DumbDisplay/raw/master/tools/GeneralUser%20GS%201.471/GeneralUser%20GS%201.471.sf2",
            "size_bytes": 31000000,  # ~30 MB
            "description": "GeneralUser GS - Lightweight quality GM/GS soundfont",
            "category": "General MIDI",
        },
        {
            "filename": "TimGM6mb.sf2",
            "url": "https://github.com/andrewsleigh/learning-synthesis/raw/master/Resources/Soundfonts/TimGM6mb.sf2",
            "size_bytes": 6000000,  # ~6 MB
            "description": "TimGM6mb - Compact GM soundfont for low memory",
            "category": "General MIDI",
        },
    ]

    def __init__(self, include_large_collection: bool = False):
        """Initialize Internet Archive scraper.

        Args:
            include_large_collection: If True, include the 36.7GB full collection
        """
        super().__init__(
            library_name="internet_archive",
            base_url=self.BASE_URL,
            rate_limit_requests=5,
            rate_limit_period=1.0
        )
        self.include_large_collection = include_large_collection

    async def discover_soundfonts(self) -> List[SFFileInfo]:
        """Discover available SoundFonts from Internet Archive.

        Returns:
            List of SFFileInfo objects for available files
        """
        logger.info("Discovering SoundFonts from Internet Archive...")
        self.discovered_files = []

        # Add alternative individual files (smaller, more practical)
        for file_data in self.ALTERNATIVE_FILES:
            file_info = SFFileInfo(
                url=file_data["url"],
                filename=file_data["filename"],
                library=self.library_name,
                format="sf2",
                category=file_data["category"],
                description=file_data["description"],
                file_size_bytes=file_data["size_bytes"],
                license="Various",
                tags=["general-midi", "gm", "full-set"],
            )
            self.discovered_files.append(file_info)

        # Optionally add the large collection
        if self.include_large_collection:
            for file_data in self.KNOWN_FILES:
                file_info = SFFileInfo(
                    url=file_data["url"],
                    filename=file_data["filename"],
                    library=self.library_name,
                    format="sf2",
                    category=file_data["category"],
                    description=file_data["description"],
                    file_size_bytes=file_data["size_bytes"],
                    license="Various",
                    tags=["general-midi", "gm", "collection", "large"],
                )
                self.discovered_files.append(file_info)

        self._stats["total_discovered"] = len(self.discovered_files)
        self._stats["last_discovery"] = datetime.now().isoformat()

        logger.info(f"Discovered {len(self.discovered_files)} SoundFonts from Internet Archive")
        return self.discovered_files

    async def download_file(self, file_info: SFFileInfo, output_path: str,
                           progress_callback: Optional[Callable[[float], None]] = None) -> bool:
        """Download a SoundFont file from Internet Archive.

        Args:
            file_info: File metadata
            output_path: Local path to save the file
            progress_callback: Optional progress callback

        Returns:
            True if download succeeded
        """
        try:
            await self._rate_limit()

            headers = {
                "User-Agent": "Mozilla/5.0 (compatible; Map2AudioBot/1.0; +https://github.com/map2audio)"
            }

            async with aiohttp.ClientSession() as session:
                async with session.get(file_info.url, headers=headers) as response:
                    if response.status != 200:
                        logger.error(f"Failed to download {file_info.filename}: HTTP {response.status}")
                        return False

                    total_size = int(response.headers.get('content-length', 0))
                    if total_size == 0 and file_info.file_size_bytes:
                        total_size = file_info.file_size_bytes

                    # Create parent directory
                    os.makedirs(os.path.dirname(output_path), exist_ok=True)

                    downloaded = 0
                    with open(output_path, 'wb') as f:
                        async for chunk in response.content.iter_chunked(65536):
                            if self._cancel_requested:
                                logger.info(f"Download cancelled: {file_info.filename}")
                                return False
                            f.write(chunk)
                            downloaded += len(chunk)
                            if progress_callback and total_size > 0:
                                progress_callback(downloaded / total_size)

                    logger.info(f"Downloaded: {file_info.filename} ({downloaded} bytes)")
                    return True

        except Exception as e:
            logger.error(f"Error downloading {file_info.filename}: {e}")
            return False
