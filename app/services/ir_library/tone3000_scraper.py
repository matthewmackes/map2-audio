"""
TONE3000 NAM Model Scraper
Download Neural Amp Modeler profiles from TONE3000.

Source: https://www.tone3000.com/
License: Various (per model)

Features:
- OAuth-style API authentication
- Search trending/popular NAM models
- Download .nam files directly
- Rate limited to 100 req/min
"""

import logging
import aiohttp
import os
import json
from typing import List, Optional, Callable, Dict, Any
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .scraper_base import IRScraperBase, IRFileInfo, DownloadStatus, DownloadState

logger = logging.getLogger(__name__)


class Tone3000Scraper(IRScraperBase):
    """Scraper for TONE3000 NAM model community.

    TONE3000 (formerly ToneHunt) is the largest community for sharing
    Neural Amp Modeler profiles. Requires API authentication.

    Authentication flow:
    1. User gets api_key from TONE3000 auth page
    2. Exchange api_key for access_token via /api/v1/auth/session
    3. Use access_token in Authorization header

    Rate limit: 100 requests per minute
    """

    BASE_URL = "https://www.tone3000.com"
    API_BASE = "https://www.tone3000.com/api/v1"

    # Config file for storing credentials
    CONFIG_DIR = Path.home() / ".config" / "map2"
    CONFIG_FILE = CONFIG_DIR / "tone3000.json"

    def __init__(self):
        """Initialize TONE3000 scraper."""
        super().__init__(
            library_name="tone3000",
            base_url=self.BASE_URL,
            rate_limit_requests=90,  # Stay under 100/min limit
            rate_limit_period=60.0
        )

        self.access_token: Optional[str] = None
        self.refresh_token: Optional[str] = None
        self.token_expires_at: Optional[datetime] = None
        self.api_key: Optional[str] = None

        # Load saved credentials
        self._load_config()

    def _load_config(self) -> None:
        """Load saved API credentials from config file."""
        try:
            if self.CONFIG_FILE.exists():
                with open(self.CONFIG_FILE, 'r') as f:
                    config = json.load(f)
                    self.api_key = config.get('api_key')
                    self.access_token = config.get('access_token')
                    self.refresh_token = config.get('refresh_token')
                    expires_str = config.get('token_expires_at')
                    if expires_str:
                        self.token_expires_at = datetime.fromisoformat(expires_str)
                    logger.info("Loaded TONE3000 credentials from config")
        except Exception as e:
            logger.warning(f"Could not load TONE3000 config: {e}")

    def _save_config(self) -> None:
        """Save API credentials to config file."""
        try:
            self.CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            config = {
                'api_key': self.api_key,
                'access_token': self.access_token,
                'refresh_token': self.refresh_token,
                'token_expires_at': self.token_expires_at.isoformat() if self.token_expires_at else None
            }
            with open(self.CONFIG_FILE, 'w') as f:
                json.dump(config, f)
            logger.info("Saved TONE3000 credentials to config")
        except Exception as e:
            logger.warning(f"Could not save TONE3000 config: {e}")

    def set_api_key(self, api_key: str) -> None:
        """Set the API key for authentication.

        Args:
            api_key: API key from TONE3000 auth flow
        """
        self.api_key = api_key
        self.access_token = None  # Clear old tokens
        self.refresh_token = None
        self.token_expires_at = None
        self._save_config()
        logger.info("TONE3000 API key updated")

    def get_auth_url(self) -> str:
        """Get the URL for user to authenticate and get API key.

        Returns:
            URL to TONE3000 authentication page
        """
        return f"{self.BASE_URL}/api/v1/auth"

    def is_configured(self) -> bool:
        """Check if API credentials are configured.

        Returns:
            True if api_key is set
        """
        return bool(self.api_key)

    async def _ensure_authenticated(self) -> bool:
        """Ensure we have valid access token.

        Returns:
            True if authenticated successfully
        """
        if not self.api_key:
            logger.warning("TONE3000 API key not configured")
            return False

        # Check if token is still valid (with 30s buffer)
        if self.access_token and self.token_expires_at:
            if datetime.now(timezone.utc) < self.token_expires_at - timedelta(seconds=30):
                return True

            # Try to refresh token
            if self.refresh_token:
                if await self._refresh_tokens():
                    return True

        # Exchange api_key for new tokens
        return await self._exchange_api_key()

    async def _exchange_api_key(self) -> bool:
        """Exchange API key for access tokens.

        Returns:
            True if successful
        """
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.API_BASE}/auth/session",
                    json={"api_key": self.api_key},
                    headers={"Content-Type": "application/json"}
                ) as response:
                    if response.status != 200:
                        logger.error(f"Token exchange failed: HTTP {response.status}")
                        return False

                    data = await response.json()
                    self.access_token = data.get('access_token')
                    self.refresh_token = data.get('refresh_token')
                    expires_in = data.get('expires_in', 3600)
                    self.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

                    self._save_config()
                    logger.info("TONE3000 tokens obtained successfully")
                    return True

        except Exception as e:
            logger.error(f"Token exchange error: {e}")
            return False

    async def _refresh_tokens(self) -> bool:
        """Refresh access tokens.

        Returns:
            True if successful
        """
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.API_BASE}/auth/session/refresh",
                    json={
                        "access_token": self.access_token,
                        "refresh_token": self.refresh_token
                    },
                    headers={"Content-Type": "application/json"}
                ) as response:
                    if response.status != 200:
                        logger.warning(f"Token refresh failed: HTTP {response.status}")
                        return False

                    data = await response.json()
                    self.access_token = data.get('access_token')
                    self.refresh_token = data.get('refresh_token')
                    expires_in = data.get('expires_in', 3600)
                    self.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

                    self._save_config()
                    logger.info("TONE3000 tokens refreshed")
                    return True

        except Exception as e:
            logger.error(f"Token refresh error: {e}")
            return False

    def _get_auth_headers(self) -> Dict[str, str]:
        """Get headers with authorization token.

        Returns:
            Headers dict with Bearer token
        """
        headers = {
            "User-Agent": "MAP2-Audio-NAM-Scraper/1.0",
            "Content-Type": "application/json"
        }
        if self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"
        return headers

    async def discover_irs(self, limit: int = 10) -> List[IRFileInfo]:
        """Discover top NAM models from TONE3000.

        Args:
            limit: Number of models to discover (default 10)

        Returns:
            List of discovered NAM model files
        """
        logger.info(f"Discovering top {limit} NAM models from {self.library_name}")

        self.discovered_files = []

        if not await self._ensure_authenticated():
            logger.error("TONE3000 authentication failed - cannot discover models")
            return self.discovered_files

        try:
            await self._rate_limit()

            async with aiohttp.ClientSession() as session:
                # Search for trending NAM models
                params = {
                    "page": 1,
                    "page_size": limit,
                    "sort": "downloads-all-time"  # Get most popular
                }

                async with session.get(
                    f"{self.API_BASE}/tones/search",
                    params=params,
                    headers=self._get_auth_headers()
                ) as response:
                    if response.status != 200:
                        logger.error(f"Search failed: HTTP {response.status}")
                        text = await response.text()
                        logger.error(f"Response: {text[:500]}")
                        return self.discovered_files

                    data = await response.json()
                    tones = data.get('data', [])

                    logger.info(f"Found {len(tones)} tones from search")

                    # Get models for each tone
                    for tone in tones:
                        tone_id = tone.get('id')
                        tone_name = tone.get('name', 'Unknown')
                        tone_author = tone.get('user', {}).get('username', 'Unknown')
                        tone_category = tone.get('gear', 'Amp')

                        # Get models for this tone
                        await self._rate_limit()

                        async with session.get(
                            f"{self.API_BASE}/models",
                            params={"tone_id": tone_id, "page": 1, "page_size": 10},
                            headers=self._get_auth_headers()
                        ) as models_response:
                            if models_response.status != 200:
                                continue

                            models_data = await models_response.json()
                            models = models_data.get('data', [])

                            for model in models:
                                model_url = model.get('model_url')
                                model_name = model.get('name', tone_name)
                                model_size = model.get('size', 'standard')

                                if model_url:
                                    filename = f"{tone_name}_{model_size}.nam".replace(' ', '_').replace('/', '_')

                                    file_info = IRFileInfo(
                                        url=model_url,
                                        filename=filename,
                                        library=self.library_name,
                                        category=tone_category,
                                        subcategory=model_size,
                                        author=tone_author,
                                        license="TONE3000 Community",
                                        description=f"{tone_name} by {tone_author} ({model_size})",
                                        tags=["nam", "neural", "amp", model_size, tone_category.lower()]
                                    )
                                    self.discovered_files.append(file_info)

                                    # Stop if we have enough
                                    if len(self.discovered_files) >= limit:
                                        break

                        if len(self.discovered_files) >= limit:
                            break

        except Exception as e:
            logger.error(f"Discovery error: {e}")

        self._stats["total_discovered"] = len(self.discovered_files)
        self._stats["last_discovery"] = datetime.now(timezone.utc).isoformat()

        logger.info(f"Discovered {len(self.discovered_files)} NAM models from {self.library_name}")
        return self.discovered_files

    async def download_file(self, file_info: IRFileInfo, output_path: str,
                           progress_callback: Optional[Callable[[float], None]] = None) -> bool:
        """Download NAM model from TONE3000.

        Args:
            file_info: File information with pre-signed URL
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
                started_at=datetime.now(timezone.utc)
            )
            self.download_progress[file_info.filename] = status

            async with aiohttp.ClientSession() as session:
                # Model URLs are pre-signed, include auth header anyway
                headers = self._get_auth_headers()

                async with session.get(file_info.url, headers=headers) as response:
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

    def get_status(self) -> Dict[str, Any]:
        """Get scraper status including auth state.

        Returns:
            Status dict with auth info
        """
        return {
            "library": self.library_name,
            "configured": self.is_configured(),
            "authenticated": bool(self.access_token),
            "token_expires": self.token_expires_at.isoformat() if self.token_expires_at else None,
            "auth_url": self.get_auth_url(),
            "discovered": len(self.discovered_files),
            "stats": self._stats
        }
