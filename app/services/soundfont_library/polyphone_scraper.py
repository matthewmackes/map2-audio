"""
Polyphone SoundFont Repository Scraper
Download SoundFonts from the Polyphone community repository.

Source: https://www.polyphone.io/soundfonts
License: Various (community contributions)

Features:
- Community-curated SF2 collection
- Category-based organization
- Quality ratings and descriptions
"""

import logging
import aiohttp
import os
import re
from typing import List, Optional, Callable
from datetime import datetime, timezone

from .scraper_base import SFScraperBase, SFFileInfo

logger = logging.getLogger(__name__)


class PolyphoneScraper(SFScraperBase):
    """Scraper for Polyphone soundfont repository.

    Downloads SF2 SoundFonts from the Polyphone community repository,
    which hosts user-contributed soundfonts organized by category.
    """

    BASE_URL = "https://www.polyphone.io"
    SOUNDFONTS_URL = "https://www.polyphone.io/soundfonts"

    # Category mapping
    CATEGORIES = {
        "piano": "Piano",
        "organ": "Organ",
        "guitar": "Guitar",
        "bass": "Bass",
        "strings": "Strings",
        "brass": "Brass",
        "woodwind": "Woodwind",
        "percussion": "Percussion",
        "synth": "Synthesizer",
        "ethnic": "Ethnic",
        "sfx": "Sound Effects",
        "misc": "Miscellaneous",
    }

    def __init__(self):
        """Initialize Polyphone scraper."""
        super().__init__(
            library_name="polyphone",
            base_url=self.BASE_URL,
            rate_limit_requests=3,
            rate_limit_period=2.0
        )

    async def discover_soundfonts(self) -> List[SFFileInfo]:
        """Discover available SoundFonts from Polyphone repository.

        The Polyphone website uses JavaScript to load soundfont data,
        so we try to parse the embedded JSON or fallback to known URLs.

        Returns:
            List of SFFileInfo objects
        """
        logger.info("Discovering SoundFonts from Polyphone...")
        self.discovered_files = []

        try:
            await self._rate_limit()

            headers = {
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
            }

            async with aiohttp.ClientSession() as session:
                # Try to fetch the soundfonts page
                async with session.get(self.SOUNDFONTS_URL, headers=headers) as response:
                    if response.status != 200:
                        logger.warning(f"Could not access Polyphone: HTTP {response.status}")
                        return self._get_known_soundfonts()

                    html = await response.text()

                    # Try to extract soundfont data from embedded JavaScript
                    # The page uses Vue.js with data embedded in script tags
                    soundfonts = self._parse_embedded_data(html)

                    if soundfonts:
                        self.discovered_files = soundfonts
                    else:
                        # Fallback to known soundfonts
                        logger.info("Using known Polyphone soundfonts")
                        self.discovered_files = self._get_known_soundfonts()

        except Exception as e:
            logger.error(f"Error discovering Polyphone soundfonts: {e}")
            self.discovered_files = self._get_known_soundfonts()

        self._stats["total_discovered"] = len(self.discovered_files)
        self._stats["last_discovery"] = datetime.now(timezone.utc).isoformat()

        logger.info(f"Discovered {len(self.discovered_files)} SoundFonts from Polyphone")
        return self.discovered_files

    def _parse_embedded_data(self, html: str) -> List[SFFileInfo]:
        """Parse soundfont data embedded in the page JavaScript."""
        soundfonts = []

        # Look for JSON data in script tags
        # Pattern for Vue.js data binding
        patterns = [
            r'soundfonts\s*[:=]\s*(\[[\s\S]*?\])',
            r'data\s*[:=]\s*\{[^}]*soundfonts\s*:\s*(\[[\s\S]*?\])',
            r'"soundfonts"\s*:\s*(\[[\s\S]*?\])',
        ]

        import json
        for pattern in patterns:
            match = re.search(pattern, html)
            if match:
                try:
                    data = json.loads(match.group(1))
                    for item in data:
                        if isinstance(item, dict):
                            sf = self._parse_soundfont_item(item)
                            if sf:
                                soundfonts.append(sf)
                    if soundfonts:
                        break
                except json.JSONDecodeError:
                    continue

        return soundfonts

    def _parse_soundfont_item(self, item: dict) -> Optional[SFFileInfo]:
        """Parse a single soundfont item from JSON data."""
        try:
            url = item.get("download_url") or item.get("url") or item.get("file")
            name = item.get("name") or item.get("title", "Unknown")
            filename = item.get("filename") or f"{name}.sf2"

            if not url:
                return None

            # Ensure full URL
            if not url.startswith("http"):
                url = f"{self.BASE_URL}{url}"

            category = item.get("category", "Miscellaneous")
            if category.lower() in self.CATEGORIES:
                category = self.CATEGORIES[category.lower()]

            return SFFileInfo(
                url=url,
                filename=filename,
                library=self.library_name,
                format="sf2",
                category=category,
                description=item.get("description"),
                author=item.get("author") or item.get("user"),
                file_size_bytes=item.get("size"),
                license=item.get("license", "Unknown"),
                tags=item.get("tags", []),
            )
        except Exception as e:
            logger.debug(f"Could not parse soundfont item: {e}")
            return None

    def _get_known_soundfonts(self) -> List[SFFileInfo]:
        """Return a list of known Polyphone-hosted soundfonts."""
        # These are manually curated known soundfonts from Polyphone
        known = [
            {
                "name": "Nice-Keys-Ultimate-V2.3",
                "url": "https://www.polyphone.io/download/file/117",
                "category": "Piano",
                "description": "High quality piano soundfont",
            },
            {
                "name": "Acoustic-Grand-Piano",
                "url": "https://www.polyphone.io/download/file/92",
                "category": "Piano",
                "description": "Acoustic grand piano samples",
            },
            {
                "name": "Jeux-Orgue",
                "url": "https://www.polyphone.io/download/file/85",
                "category": "Organ",
                "description": "Pipe organ soundfont",
            },
            {
                "name": "Classical-Guitar",
                "url": "https://www.polyphone.io/download/file/78",
                "category": "Guitar",
                "description": "Nylon string classical guitar",
            },
            {
                "name": "Electric-Bass",
                "url": "https://www.polyphone.io/download/file/65",
                "category": "Bass",
                "description": "Electric bass guitar",
            },
        ]

        soundfonts = []
        for item in known:
            soundfonts.append(SFFileInfo(
                url=item["url"],
                filename=f"{item['name']}.sf2",
                library=self.library_name,
                format="sf2",
                category=item["category"],
                description=item.get("description"),
                license="Unknown",
                tags=["polyphone", item["category"].lower()],
            ))

        return soundfonts

    async def download_file(self, file_info: SFFileInfo, output_path: str,
                           progress_callback: Optional[Callable[[float], None]] = None) -> bool:
        """Download a SoundFont file from Polyphone.

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
                "Referer": self.SOUNDFONTS_URL,
            }

            async with aiohttp.ClientSession() as session:
                async with session.get(file_info.url, headers=headers, allow_redirects=True) as response:
                    if response.status != 200:
                        logger.error(f"Failed to download {file_info.filename}: HTTP {response.status}")
                        return False

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

                    logger.info(f"Downloaded: {file_info.filename}")
                    return True

        except Exception as e:
            logger.error(f"Error downloading {file_info.filename}: {e}")
            return False
