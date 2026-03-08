"""
TesiraFirmwareService — fetch and cache the latest Biamp Tesira firmware version.

Scrapes the Biamp release notes page to determine the latest available version,
caches the result for 1 hour, and provides helper URLs for firmware download
and the official update path calculator.
"""
from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timezone, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

_RELEASE_NOTES_URL = "https://support.biamp.com/Tesira/Miscellaneous/Tesira_release_notes"
_DOWNLOAD_URL      = "https://support.biamp.com/Tesira/Software-Firmware"
_UPDATE_PATH_URL   = "https://support.biamp.com/Tesira/Software-Firmware/Tesira_firmware_update_path_calculator"
_CACHE_TTL = timedelta(hours=1)


class TesiraFirmwareService:
    """Fetch and cache Tesira latest firmware version from Biamp's release notes."""

    def __init__(self) -> None:
        self._cached_version: Optional[str] = None
        self._cached_at: Optional[datetime] = None
        self._fetch_lock = asyncio.Lock()

    async def get_latest_version(self) -> Optional[str]:
        """
        Return the latest Tesira firmware version string (e.g. "5.5.0").
        Result is cached for 1 hour. Returns None if the page is unreachable.
        """
        now = datetime.now(timezone.utc)
        if self._cached_version and self._cached_at and (now - self._cached_at) < _CACHE_TTL:
            return self._cached_version

        async with self._fetch_lock:
            # Double-check under lock
            now = datetime.now(timezone.utc)
            if self._cached_version and self._cached_at and (now - self._cached_at) < _CACHE_TTL:
                return self._cached_version

            version = await self._fetch_latest()
            if version:
                self._cached_version = version
                self._cached_at = now
                logger.info("TesiraFirmware: latest version fetched: %s", version)
            else:
                logger.warning("TesiraFirmware: could not fetch latest version from Biamp")
            return self._cached_version

    def get_cached_version(self) -> Optional[str]:
        return self._cached_version

    def get_cached_at(self) -> Optional[str]:
        if self._cached_at:
            return self._cached_at.isoformat()
        return None

    @staticmethod
    def get_download_url() -> str:
        return _DOWNLOAD_URL

    @staticmethod
    def get_release_notes_url() -> str:
        return _RELEASE_NOTES_URL

    @staticmethod
    def get_update_path_url(from_version: Optional[str] = None) -> str:
        """Return the Biamp firmware update path calculator URL."""
        if from_version:
            # The calculator doesn't have a direct deep-link query param,
            # so just return the base URL; the user can enter their version there.
            return _UPDATE_PATH_URL
        return _UPDATE_PATH_URL

    @staticmethod
    def compare_versions(current: Optional[str], latest: Optional[str]) -> bool:
        """
        Return True if an update is available (latest > current).
        Uses semantic version comparison (major.minor.patch).
        """
        if not current or not latest:
            return False
        try:
            def _parse(v: str):
                return tuple(int(x) for x in v.split(".")[:3])
            return _parse(latest) > _parse(current)
        except (ValueError, AttributeError):
            return False

    # ──────────────────────────────────────────────────────────────────────────
    # Internal
    # ──────────────────────────────────────────────────────────────────────────

    @staticmethod
    async def _fetch_latest() -> Optional[str]:
        """
        Fetch Biamp's Tesira release notes page and extract the latest version.
        Looks for patterns like "Tesira 5.5.0" or "Version 5.5.0" near the top.
        """
        try:
            import aiohttp  # type: ignore
            timeout = aiohttp.ClientTimeout(total=10)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(_RELEASE_NOTES_URL, ssl=False) as resp:
                    if resp.status != 200:
                        logger.debug("TesiraFirmware: HTTP %d from release notes page", resp.status)
                        return None
                    text = await resp.text()
        except ImportError:
            # aiohttp not available — fall back to httpx or requests
            return await TesiraFirmwareService._fetch_latest_httpx()
        except Exception as exc:
            logger.debug("TesiraFirmware: fetch error: %s", exc)
            return None

        return TesiraFirmwareService._parse_version(text)

    @staticmethod
    async def _fetch_latest_httpx() -> Optional[str]:
        """Fallback fetch using httpx (sync in threadpool)."""
        try:
            import httpx  # type: ignore
            def _do_get():
                with httpx.Client(timeout=10, verify=False) as c:
                    return c.get(_RELEASE_NOTES_URL).text
            text = await asyncio.get_event_loop().run_in_executor(None, _do_get)
            return TesiraFirmwareService._parse_version(text)
        except Exception as exc:
            logger.debug("TesiraFirmware: httpx fetch error: %s", exc)
            return None

    @staticmethod
    def _parse_version(html: str) -> Optional[str]:
        """
        Extract the highest-numbered Tesira version from HTML text.
        Matches patterns like: "Tesira 5.5.0", "version 5.5.0", "5.5.0 (Feb"
        Returns the lexicographically largest semantic version found.
        """
        # Broad pattern: major.minor.patch
        candidates = re.findall(r'\b(\d+\.\d+\.\d+)\b', html)
        if not candidates:
            return None

        def _sortkey(v: str):
            try:
                return tuple(int(x) for x in v.split("."))
            except ValueError:
                return (0, 0, 0)

        # Filter to plausible Tesira versions (2.x–9.x range)
        plausible = [v for v in candidates if 2 <= int(v.split(".")[0]) <= 9]
        if not plausible:
            return None

        return max(plausible, key=_sortkey)


# ──────────────────────────────────────────────────────────────────────────────
# Singleton
# ──────────────────────────────────────────────────────────────────────────────

_firmware_service: Optional[TesiraFirmwareService] = None


def get_firmware_service() -> TesiraFirmwareService:
    global _firmware_service
    if _firmware_service is None:
        _firmware_service = TesiraFirmwareService()
    return _firmware_service
