"""
PianoBook Community Samples Scraper
Download free community-sampled instruments from PianoBook.

Source: https://www.pianobook.co.uk
License: Various (mostly free for personal use)

Features:
- Community-sampled instruments
- High quality piano and orchestral samples
- SFZ format support (alongside Kontakt)
"""

import logging
import aiohttp
import os
import re
from typing import List, Optional, Callable
from datetime import datetime

from .scraper_base import SFScraperBase, SFFileInfo

logger = logging.getLogger(__name__)


class PianoBookScraper(SFScraperBase):
    """Scraper for PianoBook community samples.

    PianoBook is a community-driven library of free sampled instruments,
    primarily focused on pianos but also including other instruments.

    Note: PianoBook primarily offers Kontakt/Decent Sampler formats,
    but some instruments include SFZ versions.
    """

    BASE_URL = "https://www.pianobook.co.uk"
    INSTRUMENTS_URL = "https://www.pianobook.co.uk/instruments/"

    # Categories on PianoBook
    CATEGORIES = {
        "pianos": "Piano",
        "keys": "Electric Piano",
        "strings": "Strings",
        "woodwinds": "Woodwind",
        "brass": "Brass",
        "percussion": "Percussion",
        "guitars": "Guitar",
        "synths": "Synthesizer",
        "organs": "Organ",
        "sfx": "Sound Effects",
        "pads": "Pads",
        "vocals": "Choir",
    }

    # Known SFZ-compatible instruments from PianoBook
    KNOWN_SFZ_INSTRUMENTS = [
        {
            "name": "Soft-Piano",
            "filename": "Soft-Piano-SFZ.zip",
            "url": "https://www.pianobook.co.uk/downloads/soft-piano-sfz/",
            "category": "Piano",
            "description": "Warm, soft upright piano samples",
            "author": "PianoBook Community",
        },
        {
            "name": "Cinematic-Strings",
            "filename": "Cinematic-Strings-SFZ.zip",
            "url": "https://www.pianobook.co.uk/downloads/cinematic-strings-sfz/",
            "category": "Strings",
            "description": "Cinematic string ensemble",
            "author": "PianoBook Community",
        },
        {
            "name": "Felt-Piano",
            "filename": "Felt-Piano-SFZ.zip",
            "url": "https://www.pianobook.co.uk/downloads/felt-piano-sfz/",
            "category": "Piano",
            "description": "Intimate felt-damped piano",
            "author": "PianoBook Community",
        },
        {
            "name": "Old-Tape-Piano",
            "filename": "Old-Tape-Piano-SFZ.zip",
            "url": "https://www.pianobook.co.uk/downloads/old-tape-piano-sfz/",
            "category": "Piano",
            "description": "Lo-fi tape-degraded piano samples",
            "author": "PianoBook Community",
        },
        {
            "name": "Prepared-Piano",
            "filename": "Prepared-Piano-SFZ.zip",
            "url": "https://www.pianobook.co.uk/downloads/prepared-piano-sfz/",
            "category": "Piano",
            "description": "Experimental prepared piano sounds",
            "author": "PianoBook Community",
        },
    ]

    # Alternative: Labs by Spitfire Audio (free, high quality)
    SPITFIRE_LABS = [
        {
            "name": "LABS-Soft-Piano",
            "filename": "LABS-Soft-Piano.zip",
            "url": "https://labs.spitfireaudio.com/soft-piano",
            "category": "Piano",
            "description": "Spitfire LABS Soft Piano - requires LABS player",
            "author": "Spitfire Audio",
            "note": "Requires LABS player (free)",
        },
    ]

    def __init__(self):
        """Initialize PianoBook scraper."""
        super().__init__(
            library_name="pianobook",
            base_url=self.BASE_URL,
            rate_limit_requests=2,
            rate_limit_period=3.0
        )

    async def discover_soundfonts(self) -> List[SFFileInfo]:
        """Discover SFZ instruments from PianoBook.

        Note: PianoBook requires account for downloads, so we primarily
        use known direct links and documented SFZ instruments.

        Returns:
            List of SFFileInfo objects
        """
        logger.info("Discovering SFZ instruments from PianoBook...")
        self.discovered_files = []

        # Try to discover from the website
        try:
            await self._rate_limit()
            discovered_online = await self._scrape_sfz_instruments()
            if discovered_online:
                self.discovered_files.extend(discovered_online)
        except Exception as e:
            logger.warning(f"Could not scrape PianoBook website: {e}")

        # Add known SFZ instruments
        for instrument in self.KNOWN_SFZ_INSTRUMENTS:
            # Check if not already discovered
            if not any(f.filename == instrument["filename"] for f in self.discovered_files):
                file_info = SFFileInfo(
                    url=instrument["url"],
                    filename=instrument["filename"],
                    library=self.library_name,
                    format="sfz",
                    category=instrument["category"],
                    description=instrument["description"],
                    author=instrument.get("author", "PianoBook Community"),
                    license="Free for personal use",
                    tags=["pianobook", "community", instrument["category"].lower()],
                )
                self.discovered_files.append(file_info)

        self._stats["total_discovered"] = len(self.discovered_files)
        self._stats["last_discovery"] = datetime.now().isoformat()

        logger.info(f"Discovered {len(self.discovered_files)} SFZ instruments from PianoBook")
        return self.discovered_files

    async def _scrape_sfz_instruments(self) -> List[SFFileInfo]:
        """Scrape PianoBook for SFZ instruments."""
        instruments = []

        headers = {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
        }

        try:
            async with aiohttp.ClientSession() as session:
                # Search for SFZ instruments
                search_url = f"{self.BASE_URL}/?s=sfz&post_type=instrument"

                async with session.get(search_url, headers=headers) as response:
                    if response.status != 200:
                        return instruments

                    html = await response.text()

                    # Parse instrument links
                    # Pattern for instrument pages
                    pattern = r'<a[^>]+href="(https://www\.pianobook\.co\.uk/packs/[^"]+)"[^>]*>([^<]+)</a>'
                    matches = re.findall(pattern, html)

                    for url, name in matches[:20]:  # Limit to first 20
                        # Create file info
                        filename = f"{name.replace(' ', '-')}-SFZ.zip"
                        instruments.append(SFFileInfo(
                            url=url,
                            filename=filename,
                            library=self.library_name,
                            format="sfz",
                            category="Miscellaneous",  # Would need to parse page for category
                            description=f"PianoBook: {name}",
                            license="Free for personal use",
                            tags=["pianobook", "community"],
                        ))

        except Exception as e:
            logger.debug(f"Error scraping PianoBook: {e}")

        return instruments

    async def download_file(self, file_info: SFFileInfo, output_path: str,
                           progress_callback: Optional[Callable[[float], None]] = None) -> bool:
        """Download a PianoBook instrument.

        Note: Some PianoBook downloads require authentication.

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
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
                "Referer": self.BASE_URL,
            }

            async with aiohttp.ClientSession() as session:
                # First, try to get the actual download link from the page
                async with session.get(file_info.url, headers=headers, allow_redirects=True) as response:
                    if response.status != 200:
                        logger.error(f"Failed to access {file_info.filename}: HTTP {response.status}")
                        return False

                    # Check if this is a download page or direct file
                    content_type = response.headers.get('content-type', '')

                    if 'text/html' in content_type:
                        # Parse page for download link
                        html = await response.text()
                        download_url = self._extract_download_link(html)

                        if not download_url:
                            logger.warning(f"Could not find download link for {file_info.filename}")
                            logger.info("PianoBook may require account login for this download")
                            return False

                        # Download the actual file
                        async with session.get(download_url, headers=headers) as dl_response:
                            if dl_response.status != 200:
                                return False
                            return await self._save_response(dl_response, output_path, progress_callback)
                    else:
                        # Direct download
                        return await self._save_response(response, output_path, progress_callback)

        except Exception as e:
            logger.error(f"Error downloading {file_info.filename}: {e}")
            return False

    def _extract_download_link(self, html: str) -> Optional[str]:
        """Extract direct download link from PianoBook page."""
        patterns = [
            r'href="([^"]+\.zip)"',
            r'data-download="([^"]+)"',
            r'download-link[^>]+href="([^"]+)"',
        ]

        for pattern in patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                url = match.group(1)
                if not url.startswith('http'):
                    url = f"{self.BASE_URL}{url}"
                return url

        return None

    async def _save_response(self, response, output_path: str,
                            progress_callback: Optional[Callable[[float], None]]) -> bool:
        """Save HTTP response to file with progress tracking."""
        total_size = int(response.headers.get('content-length', 0))

        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        downloaded = 0
        with open(output_path, 'wb') as f:
            async for chunk in response.content.iter_chunked(32768):
                if self._cancel_requested:
                    return False
                f.write(chunk)
                downloaded += len(chunk)
                if progress_callback and total_size > 0:
                    progress_callback(downloaded / total_size)

        logger.info(f"Downloaded: {os.path.basename(output_path)}")
        return True
