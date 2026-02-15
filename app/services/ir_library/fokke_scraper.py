"""
Fokke van Saane Impulse Response Scraper
Download classic hardware reverb and acoustic space IRs from Fokke van Saane's collection.

Source: https://fokkie.home.xs4all.nl/IR.htm
License: Freeware - free for personal and educational use

Features:
- Classic hardware reverb IRs (various manufacturers)
- Acoustic spaces (churches, factories, forests)
- Creative IRs (speakers, telephones, small spaces)
- Multiple variations and presets
"""

import logging
import aiohttp
import os
import re
from urllib.parse import unquote, urljoin
from typing import List, Optional, Callable
from bs4 import BeautifulSoup

from .scraper_base import IRScraperBase, IRFileInfo, DownloadStatus, DownloadState
from datetime import datetime

logger = logging.getLogger(__name__)


class FokkeScraper(IRScraperBase):
    """Scraper for Fokke van Saane's impulse response collection.

    Fokke van Saane's collection includes:
    - Hardware reverbs: Classic digital reverbs, EMT 244, Roland RE-201/DEP3
    - Spring reverbs: Fostex 3180, Masterroom MR-II
    - Acoustic spaces: Churches, factories, forests, streets
    - Creative IRs: Vintage speakers, telephones, small spaces

    All files are freeware for personal and educational use.
    """

    BASE_URL = "https://fokkie.home.xs4all.nl"
    IR_PAGE = "https://fokkie.home.xs4all.nl/IR.htm"

    # Known ZIP files available for download (verified from website)
    # Note: Many files are .sit (Mac StuffIt) - we only list .zip for cross-platform
    KNOWN_COLLECTIONS = [
        # Hardware Reverbs
        {
            "filename": "EMT 244 (A. Bernhard).zip",
            "url": "https://fokkie.home.xs4all.nl/Files/EMT%20244%20(A.%20Bernhard).zip",
            "category": "Hardware Reverb",
            "subcategory": "EMT",
            "description": "EMT 244 Digital Reverb - captured by A. Bernhard",
            "tags": ["emt", "digital", "244", "vintage"]
        },
        # Acoustic Spaces
        {
            "filename": "Speakers and telephones.zip",
            "url": "https://fokkie.home.xs4all.nl/Files/Speakers%20and%20telephones.zip",
            "category": "Creative",
            "subcategory": "Speakers",
            "description": "Tube radios, speakers, telephone horns, walkman headphones",
            "tags": ["speaker", "telephone", "radio", "lo-fi", "creative"]
        },
        {
            "filename": "Claustrofobia v1.1.zip",
            "url": "https://fokkie.home.xs4all.nl/Files/Claustrofobia%20v1.1.zip",
            "category": "Creative",
            "subcategory": "Small Spaces",
            "description": "Claustrophobic small spaces - flower pots, dustbins, etc.",
            "tags": ["small", "creative", "claustrophobic", "experimental"]
        },
        {
            "filename": "Factory Hall.zip",
            "url": "https://fokkie.home.xs4all.nl/Files/Factory%20Hall.zip",
            "category": "Acoustic Spaces",
            "subcategory": "Industrial",
            "description": "Large Amsterdam factory hall with PA speaker",
            "tags": ["factory", "hall", "industrial", "large", "amsterdam"]
        },
        {
            "filename": "Church Schellingwoude.zip",
            "url": "https://fokkie.home.xs4all.nl/Files/Church%20Schellingwoude.zip",
            "category": "Acoustic Spaces",
            "subcategory": "Churches",
            "description": "Small church in Schellingwoude, Amsterdam",
            "tags": ["church", "reverb", "acoustic", "amsterdam"]
        },
    ]

    def __init__(self):
        """Initialize Fokke van Saane scraper."""
        super().__init__(
            library_name="fokke",
            base_url=self.BASE_URL,
            rate_limit_requests=3,
            rate_limit_period=1.0
        )

    async def discover_irs(self) -> List[IRFileInfo]:
        """Discover IRs from Fokke van Saane's collection.

        Scrapes the IR page for all available ZIP files, supplemented by known URLs.

        Returns:
            List of discovered IR files
        """
        logger.info(f"Discovering IRs from {self.library_name}")

        self.discovered_files = []
        discovered_urls = set()

        # Try to scrape page first for the most accurate list
        try:
            await self._rate_limit()

            async with aiohttp.ClientSession() as session:
                headers = {
                    "User-Agent": "MAP2-Audio-IR-Scraper/1.0"
                }
                async with session.get(self.IR_PAGE, headers=headers) as response:
                    if response.status == 200:
                        html = await response.text()
                        scraped = self._parse_page(html)

                        for file_info in scraped:
                            if file_info.url not in discovered_urls:
                                self.discovered_files.append(file_info)
                                discovered_urls.add(file_info.url)
                                logger.debug(f"Found IR: {file_info.filename}")
        except Exception as e:
            logger.warning(f"Could not scrape Fokke page: {e}")

        # Add known collections as fallback (skip if already discovered)
        for collection in self.KNOWN_COLLECTIONS:
            if collection["url"] not in discovered_urls:
                file_info = IRFileInfo(
                    url=collection["url"],
                    filename=collection["filename"],
                    library=self.library_name,
                    category=collection["category"],
                    subcategory=collection.get("subcategory"),
                    author="Fokke van Saane",
                    license="Freeware",
                    description=collection["description"],
                    tags=collection["tags"] + ["free", "fokke"]
                )
                self.discovered_files.append(file_info)
                discovered_urls.add(collection["url"])

        self._stats["total_discovered"] = len(self.discovered_files)
        self._stats["last_discovery"] = datetime.now().isoformat()

        logger.info(f"Discovered {len(self.discovered_files)} IRs from {self.library_name}")
        return self.discovered_files

    def _parse_page(self, html: str) -> List[IRFileInfo]:
        """Parse Fokke's IR page for download links.

        Args:
            html: Page HTML content

        Returns:
            List of IR files found (ZIP files only for cross-platform compatibility)
        """
        files = []
        seen_urls = set()

        try:
            soup = BeautifulSoup(html, 'html.parser')

            # Find all download links
            for link in soup.find_all('a', href=True):
                href = link['href']

                # Only process ZIP files (skip .sit Mac archives)
                if not href.lower().endswith('.zip'):
                    continue

                # Build full URL
                if href.startswith('http'):
                    full_url = href
                else:
                    full_url = urljoin(self.BASE_URL + "/", href)

                # Skip duplicates
                if full_url in seen_urls:
                    continue
                seen_urls.add(full_url)

                # Decode filename from URL
                filename = unquote(os.path.basename(href))

                # Clean name for description
                name = os.path.splitext(filename)[0]
                name_clean = re.sub(r'\s+v\d+\.\d+', '', name)  # Remove version numbers
                name_clean = re.sub(r'\s*\([^)]*\)', '', name_clean)  # Remove parentheticals

                # Categorize based on filename/content
                category, subcategory, tags = self._categorize_file(name.lower())

                # Get description from link text or parent element
                description = self._extract_description(link, name_clean)

                file_info = IRFileInfo(
                    url=full_url,
                    filename=filename,
                    library=self.library_name,
                    category=category,
                    subcategory=subcategory,
                    author="Fokke van Saane",
                    license="Freeware",
                    description=description,
                    tags=tags + ["free", "fokke"]
                )
                files.append(file_info)

        except Exception as e:
            logger.warning(f"Error parsing Fokke page: {e}")

        return files

    def _categorize_file(self, name_lower: str) -> tuple:
        """Categorize an IR file based on its name.

        Args:
            name_lower: Lowercase filename

        Returns:
            Tuple of (category, subcategory, tags)
        """
        # Hardware reverbs
        if "lexicon" in name_lower:
            return "Hardware Reverb", "Lexicon", ["lexicon", "digital", "reverb"]
        if "emt" in name_lower:
            return "Hardware Reverb", "EMT", ["emt", "digital", "reverb"]
        if "roland" in name_lower or "re201" in name_lower or "re-201" in name_lower:
            return "Hardware Reverb", "Roland", ["roland", "tape", "echo"]
        if "dep3" in name_lower:
            return "Hardware Reverb", "Roland", ["roland", "digital", "reverb"]
        if "spring" in name_lower or "fostex" in name_lower or "master room" in name_lower:
            return "Hardware Reverb", "Spring", ["spring", "reverb", "vintage"]

        # Acoustic spaces
        if "church" in name_lower:
            return "Acoustic Spaces", "Churches", ["church", "reverb", "acoustic"]
        if "factory" in name_lower or "hall" in name_lower:
            return "Acoustic Spaces", "Halls", ["hall", "reverb", "large"]
        if "forest" in name_lower:
            return "Acoustic Spaces", "Nature", ["forest", "nature", "outdoor"]
        if "street" in name_lower:
            return "Acoustic Spaces", "Urban", ["street", "urban", "outdoor"]
        if "domestic" in name_lower:
            return "Acoustic Spaces", "Rooms", ["room", "domestic", "indoor"]

        # Creative/experimental
        if "speaker" in name_lower or "phone" in name_lower or "telephone" in name_lower:
            return "Creative", "Speakers", ["speaker", "lo-fi", "creative"]
        if "claustro" in name_lower:
            return "Creative", "Small Spaces", ["small", "creative", "experimental"]
        if "mercedes" in name_lower or "van" in name_lower:
            return "Creative", "Vehicles", ["vehicle", "car", "creative"]

        # Default
        return "Impulse Response", None, ["reverb"]

    def _extract_description(self, link, name_clean: str) -> str:
        """Extract description from link context.

        Args:
            link: BeautifulSoup link element
            name_clean: Cleaned filename

        Returns:
            Description string
        """
        # Try to get text from parent or sibling elements
        parent = link.parent
        if parent:
            # Look for description text nearby
            text = parent.get_text(strip=True)
            # Remove the link text itself
            link_text = link.get_text(strip=True)
            if link_text and text.startswith(link_text):
                desc = text[len(link_text):].strip(" -–:")
                if desc and len(desc) > 5:
                    return desc

        return f"{name_clean} - Fokke van Saane impulse response"

    async def download_file(self, file_info: IRFileInfo, output_path: str,
                           progress_callback: Optional[Callable[[float], None]] = None) -> bool:
        """Download IR file from Fokke van Saane's site.

        Args:
            file_info: File information with URL
            output_path: Local path to save file
            progress_callback: Optional callback for progress (0.0-1.0)

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
                started_at=datetime.now()
            )
            self.download_progress[file_info.filename] = status

            async with aiohttp.ClientSession() as session:
                headers = {
                    "User-Agent": "MAP2-Audio-IR-Scraper/1.0"
                }

                async with session.get(file_info.url, headers=headers) as response:
                    if response.status != 200:
                        logger.error(f"Download failed: HTTP {response.status} for {file_info.url}")
                        status.state = DownloadState.FAILED
                        status.error_message = f"HTTP {response.status}"
                        return False

                    total_size = int(response.headers.get('content-length', 0))
                    downloaded = 0
                    start_time = datetime.now()

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

                                elapsed = (datetime.now() - start_time).total_seconds()
                                if elapsed > 0:
                                    status.speed_bps = downloaded / elapsed

                                if progress_callback:
                                    progress_callback(progress)

            status.state = DownloadState.COMPLETED
            status.completed_at = datetime.now()
            status.progress = 1.0

            logger.info(f"Downloaded: {file_info.filename} ({downloaded} bytes)")
            return True

        except Exception as e:
            logger.error(f"Error downloading {file_info.filename}: {e}")
            if file_info.filename in self.download_progress:
                self.download_progress[file_info.filename].state = DownloadState.FAILED
                self.download_progress[file_info.filename].error_message = str(e)
            return False
