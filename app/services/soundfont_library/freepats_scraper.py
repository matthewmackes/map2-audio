"""
FreePats Scraper
Download high-quality SoundFonts from FreePats project.

Source: https://freepats.zenvoid.org
License: Various Creative Commons (CC-BY, CC0)

Features:
- High-quality, professionally curated SoundFonts
- Clear licensing information
- Web scraping with fallback to known URLs
"""

import logging
import aiohttp
import os
import re
from typing import List, Optional, Callable, Dict, Any
from datetime import datetime, timezone
from urllib.parse import urljoin

from .scraper_base import SFScraperBase, SFFileInfo, DownloadStatus, DownloadState

logger = logging.getLogger(__name__)


class FreePatsScraper(SFScraperBase):
    """Scraper for FreePats SoundFont collection.

    Downloads high-quality SoundFonts from the FreePats project,
    which focuses on free and open-source sound banks.

    Features:
    - Curated collection of quality instruments
    - Clear CC licensing
    - Multiple piano and orchestral samples
    """

    BASE_URL = "https://freepats.zenvoid.org"

    # Rate limiting
    RATE_LIMIT = 3
    RATE_PERIOD = 2.0

    # Known SoundFonts with stable URLs (updated 2026-02)
    KNOWN_SOUNDFONTS = [
        # === Pianos ===
        {
            "url": "https://freepats.zenvoid.org/Piano/SalamanderGrandPiano/SalamanderGrandPiano-SF2-V3+20200602.tar.xz",
            "name": "Salamander Grand Piano",
            "filename": "SalamanderGrandPiano-SF2-V3.tar.xz",
            "category": "Piano",
            "author": "Alexander Holm",
            "license": "CC-BY-3.0",
            "description": "High-quality Yamaha C5 grand piano sample, 16 velocity layers",
            "format": "sf2",
        },
        {
            "url": "https://freepats.zenvoid.org/Piano/UprightPianoKW/UprightPianoKW-SF2-20220221.7z",
            "name": "Upright Piano KW",
            "filename": "UprightPianoKW-SF2-20220221.7z",
            "category": "Piano",
            "author": "Katsuhiro Watanabe",
            "license": "CC0-1.0",
            "description": "Kawai upright piano samples",
            "format": "sf2",
        },
        {
            "url": "https://freepats.zenvoid.org/Piano/YDP-GrandPiano/YDP-GrandPiano-SF2-20160804.tar.bz2",
            "name": "YDP Grand Piano",
            "filename": "YDP-GrandPiano-SF2-20160804.tar.bz2",
            "category": "Piano",
            "author": "Freepats Project",
            "license": "CC0-1.0",
            "description": "Yamaha digital piano samples",
            "format": "sf2",
        },
        # === Electric Pianos ===
        {
            "url": "https://github.com/freepats/fm-piano1/releases/download/2019-09-16/FM-Piano1-SF2-20190916.7z",
            "name": "FM Piano 1",
            "filename": "FM-Piano1-SF2-20190916.7z",
            "category": "Electric Piano",
            "author": "Freepats Project",
            "license": "CC0-1.0",
            "description": "FM synthesized piano sounds",
            "format": "sf2",
        },
        {
            "url": "https://github.com/freepats/fm-piano2/releases/download/2016-11-12/FM-Piano2-SF2-20161112.7z",
            "name": "FM Piano 2",
            "filename": "FM-Piano2-SF2-20161112.7z",
            "category": "Electric Piano",
            "author": "Freepats Project",
            "license": "CC0-1.0",
            "description": "FM synthesized piano sounds variation 2",
            "format": "sf2",
        },
        # === Organs ===
        {
            "url": "https://freepats.zenvoid.org/Organ/DrawbarOrganEmulation/DrawbarOrganEmulation-SF2-20190712.tar.xz",
            "name": "Drawbar Organ Emulation",
            "filename": "DrawbarOrganEmulation-SF2-20190712.tar.xz",
            "category": "Organ",
            "author": "Freepats Project",
            "license": "CC0-1.0",
            "description": "Hammond-style drawbar organ emulation",
            "format": "sf2",
        },
        {
            "url": "https://freepats.zenvoid.org/Organ/PercussiveOrganEmulation/PercussiveOrganEmulation-SF2-20190715.tar.xz",
            "name": "Percussive Organ Emulation",
            "filename": "PercussiveOrganEmulation-SF2-20190715.tar.xz",
            "category": "Organ",
            "author": "Freepats Project",
            "license": "CC0-1.0",
            "description": "Percussive organ samples",
            "format": "sf2",
        },
        {
            "url": "https://freepats.zenvoid.org/Organ/RockOrganEmulation/RockOrganEmulation-SF2-20190715.tar.xz",
            "name": "Rock Organ Emulation",
            "filename": "RockOrganEmulation-SF2-20190715.tar.xz",
            "category": "Organ",
            "author": "Freepats Project",
            "license": "CC0-1.0",
            "description": "Rock organ samples",
            "format": "sf2",
        },
        # === Percussion ===
        {
            "url": "https://github.com/freepats/tubular-bells1/releases/download/2024-11-30/TubularBells-SF2-20241130.7z",
            "name": "Tubular Bells",
            "filename": "TubularBells-SF2-20241130.7z",
            "category": "Percussion",
            "author": "Freepats Project",
            "license": "CC0-1.0",
            "description": "Orchestral tubular bells with randomized layers",
            "format": "sf2",
        },
    ]

    def __init__(self):
        """Initialize FreePats scraper."""
        super().__init__(
            library_name="freepats",
            base_url=self.BASE_URL,
            rate_limit_requests=self.RATE_LIMIT,
            rate_limit_period=self.RATE_PERIOD
        )

    async def discover_soundfonts(self) -> List[SFFileInfo]:
        """Discover SoundFont files from FreePats.

        Uses known URLs for reliable discovery.

        Returns:
            List of discovered SoundFont files
        """
        logger.info(f"Discovering SoundFonts from {self.library_name}")

        self.discovered_files = []

        # Create SFFileInfo from known soundfonts
        for sf_data in self.KNOWN_SOUNDFONTS:
            file_info = SFFileInfo(
                url=sf_data["url"],
                filename=sf_data["filename"],
                library=self.library_name,
                format=sf_data["format"],
                category=sf_data["category"],
                author=sf_data["author"],
                license=sf_data["license"],
                description=sf_data["description"],
                tags=['freepats', sf_data["format"], sf_data["category"].lower()],
            )
            self.discovered_files.append(file_info)

        # Try to discover additional files from the website
        try:
            additional = await self._scrape_additional_files()
            self.discovered_files.extend(additional)
        except Exception as e:
            logger.debug(f"Could not scrape additional files: {e}")

        self._stats["total_discovered"] = len(self.discovered_files)
        self._stats["last_discovery"] = datetime.now(timezone.utc).isoformat()

        logger.info(f"Discovered {len(self.discovered_files)} SoundFonts from {self.library_name}")
        return self.discovered_files

    async def _scrape_additional_files(self) -> List[SFFileInfo]:
        """Scrape the FreePats website for additional SoundFont files.

        Returns:
            List of additional discovered files
        """
        additional_files = []

        # Pages to scrape
        pages = [
            "/Piano/",
            "/ElectricPiano/",
            "/Organ/",
            "/Guitar/",
            "/Bass/",
            "/Strings/",
            "/Brass/",
            "/Reed/",
        ]

        try:
            async with aiohttp.ClientSession() as session:
                for page in pages:
                    await self._rate_limit()

                    url = urljoin(self.BASE_URL, page)
                    headers = {
                        "User-Agent": "MAP2-Audio-SoundFont-Scraper/1.0"
                    }

                    try:
                        async with session.get(url, headers=headers) as response:
                            if response.status != 200:
                                continue

                            html = await response.text()

                            # Find .sf2 and .sfz download links
                            sf2_pattern = r'href="([^"]+\.sf2)"'
                            sfz_pattern = r'href="([^"]+\.sfz)"'

                            for pattern, format_type in [(sf2_pattern, 'sf2'), (sfz_pattern, 'sfz')]:
                                matches = re.findall(pattern, html, re.IGNORECASE)
                                for match in matches:
                                    file_url = urljoin(url, match)

                                    # Skip if already in known soundfonts
                                    if any(sf["url"] == file_url for sf in self.KNOWN_SOUNDFONTS):
                                        continue

                                    filename = os.path.basename(match)
                                    category = page.strip('/').replace('/', ' ')

                                    file_info = SFFileInfo(
                                        url=file_url,
                                        filename=f"fp_{filename}",
                                        library=self.library_name,
                                        format=format_type,
                                        category=category,
                                        author="FreePats Project",
                                        license="CC (check source)",
                                        description=f"{filename} from FreePats {category}",
                                        tags=['freepats', format_type, category.lower()],
                                    )
                                    additional_files.append(file_info)

                    except Exception as e:
                        logger.debug(f"Error scraping {page}: {e}")
                        continue

        except Exception as e:
            logger.debug(f"Error in additional scraping: {e}")

        return additional_files

    async def download_file(self, file_info: SFFileInfo, output_path: str,
                           progress_callback: Optional[Callable[[float], None]] = None) -> bool:
        """Download SoundFont file from FreePats.

        Handles various archive formats (tar.xz, tar.bz2, direct sf2/sfz).

        Args:
            file_info: File information with URL
            output_path: Local path to save file
            progress_callback: Optional callback for progress

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

            headers = {
                "User-Agent": "MAP2-Audio-SoundFont-Scraper/1.0",
                "Accept": "*/*",
            }

            async with aiohttp.ClientSession() as session:
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

                                if progress_callback:
                                    progress_callback(progress)

            status.state = DownloadState.COMPLETED
            status.completed_at = datetime.now(timezone.utc)
            status.progress = 1.0

            logger.info(f"Downloaded: {file_info.filename} ({downloaded} bytes)")
            return True

        except Exception as e:
            logger.error(f"Error downloading {file_info.filename}: {e}")
            if file_info.filename in self.download_progress:
                self.download_progress[file_info.filename].state = DownloadState.FAILED
                self.download_progress[file_info.filename].error_message = str(e)
            return False
