"""
Featured NAM Amps Manager

Discovers top 7 amps from TONE3000 and their top 3 variants,
downloads them, and manages them as featured models in the NAM chooser.
"""

import logging
import asyncio
import hashlib
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from datetime import datetime

from app.paths import StoragePaths
from app.database import get_db, NAMModel
from app.services.ir_library.tone3000_scraper import Tone3000Scraper

logger = logging.getLogger(__name__)


class FeaturedAmpsManager:
    """Manages featured NAM amp models from TONE3000."""

    # Top 7 most popular amps to feature (mapping to TONE3000 search terms)
    TOP_AMPS = [
        "Fender Twin Reverb",
        "Marshall JCM800",
        "Mesa Boogie Dual Rectifier",
        "Vox AC30",
        "Marshall Plexi 50W",
        "Fender Bassman",
        "Orange Amplifiers Dark Terror"
    ]

    def __init__(self):
        """Initialize the featured amps manager."""
        self.scraper = Tone3000Scraper()
        self.featured_dir = StoragePaths.get_nam_user_dir() / "featured"
        self.featured_dir.mkdir(parents=True, exist_ok=True)

    async def discover_and_download_featured_amps(self) -> Dict[str, any]:
        """Discover top 7 amps and their 3 variants from TONE3000, then download.

        Returns:
            Dict with results: {
                'success': bool,
                'total_downloaded': int,
                'featured_amps': List[Dict with amp info],
                'errors': List[str]
            }
        """
        logger.info("Starting featured amps discovery and download")
        results = {
            'success': True,
            'total_downloaded': 0,
            'featured_amps': [],
            'errors': []
        }

        if not self.scraper.is_configured():
            error = "TONE3000 API key not configured"
            logger.error(error)
            results['success'] = False
            results['errors'].append(error)
            return results

        # Ensure authenticated
        if not await self.scraper._ensure_authenticated():
            error = "TONE3000 authentication failed"
            logger.error(error)
            results['success'] = False
            results['errors'].append(error)
            return results

        # For each top amp, search and get top 3 variants
        position = 0
        for amp_name in self.TOP_AMPS:
            try:
                variants = await self._fetch_amp_variants(amp_name, limit=3)
                
                if not variants:
                    logger.warning(f"No variants found for {amp_name}")
                    continue

                # Download each variant
                for variant in variants:
                    try:
                        featured_info = await self._download_and_register_variant(
                            amp_name, variant, position
                        )
                        if featured_info:
                            results['featured_amps'].append(featured_info)
                            results['total_downloaded'] += 1
                            position += 1
                            
                            if position >= 21:  # Stop at 21 featured models
                                logger.info(f"Reached max featured count (21)")
                                break
                    except Exception as e:
                        error = f"Failed to download variant of {amp_name}: {str(e)}"
                        logger.error(error)
                        results['errors'].append(error)

                if position >= 21:
                    break

            except Exception as e:
                error = f"Error processing {amp_name}: {str(e)}"
                logger.error(error)
                results['errors'].append(error)

        logger.info(f"Featured amps discovery complete: {results['total_downloaded']} downloaded")
        return results

    async def _fetch_amp_variants(self, amp_name: str, limit: int = 3) -> List[Dict]:
        """Fetch top variants of an amp from TONE3000.

        Args:
            amp_name: Name of the amp to search for
            limit: Number of variants to fetch

        Returns:
            List of variant dicts with model info
        """
        variants = []
        try:
            await self.scraper._rate_limit()

            # Search for the amp - using TONE3000 API
            # Query the models endpoint with amp name
            import aiohttp

            async with aiohttp.ClientSession() as session:
                params = {
                    "search": amp_name,
                    "page": 1,
                    "page_size": limit + 5  # Get extra in case of duplicates
                }

                async with session.get(
                    f"{self.scraper.API_BASE}/tones/search",
                    params=params,
                    headers=self.scraper._get_auth_headers()
                ) as response:
                    if response.status != 200:
                        logger.warning(f"Search failed for {amp_name}: HTTP {response.status}")
                        return variants

                    data = await response.json()
                    tones = data.get('data', [])

                    logger.info(f"Found {len(tones)} tones for {amp_name}")

                    # Get models for matching tones
                    for tone in tones[:5]:  # Check top 5 matching tones
                        tone_id = tone.get('id')
                        tone_name = tone.get('name', amp_name)

                        await self.scraper._rate_limit()

                        async with session.get(
                            f"{self.scraper.API_BASE}/models",
                            params={"tone_id": tone_id, "page": 1, "page_size": 10},
                            headers=self.scraper._get_auth_headers()
                        ) as models_response:
                            if models_response.status != 200:
                                continue

                            models_data = await models_response.json()
                            models = models_data.get('data', [])

                            for model in models:
                                if len(variants) >= limit:
                                    break

                                variant = {
                                    'model_url': model.get('model_url'),
                                    'model_id': model.get('id'),
                                    'name': model.get('name', tone_name),
                                    'tone_name': tone_name,
                                    'size': model.get('size', 'standard'),
                                    'author': tone.get('user', {}).get('username', 'Unknown'),
                                    'description': tone.get('description', '')
                                }
                                variants.append(variant)

                        if len(variants) >= limit:
                            break

        except Exception as e:
            logger.error(f"Error fetching variants for {amp_name}: {e}")

        return variants[:limit]

    async def _download_and_register_variant(
        self, amp_name: str, variant: Dict, position: int
    ) -> Optional[Dict]:
        """Download a variant and register it as a featured model.

        Args:
            amp_name: Name of the amp
            variant: Variant dict from TONE3000
            position: Featured position (0-20)

        Returns:
            Featured model info dict or None if failed
        """
        try:
            # Create friendly filename
            variant_type = variant.get('size', 'standard').replace('_', ' ').title()
            tone_id = variant.get('model_id', 'unknown')
            
            # Format: Brand_Model_Variant_[TONE3000-id].nam
            friendly_name = f"{amp_name.replace(' ', '_')}_{variant_type}_[TONE3000-{tone_id}]"
            filename = f"{friendly_name}.nam"
            file_path = self.featured_dir / filename

            # Download the file
            logger.info(f"Downloading featured amp: {filename}")
            success = await self.scraper.download_file(
                file_info=type('IRFileInfo', (), {
                    'url': variant.get('model_url'),
                    'filename': filename,
                    'library': 'tone3000'
                })(),
                output_path=str(file_path)
            )

            if not success:
                logger.warning(f"Download failed for {filename}")
                return None

            # Calculate file hash
            file_hash = self._calculate_hash(file_path)

            # Register in database as featured
            db = get_db()
            try:
                # Check if already exists
                existing = db.query(NAMModel).filter_by(file_hash=file_hash).first()
                
                if existing:
                    # Update existing record
                    existing.is_featured = True
                    existing.featured_position = position
                    existing.source_tone3000_id = tone_id
                    existing.source_tone3000_name = variant.get('name', '')
                    logger.info(f"Updated existing model {existing.name} as featured")
                else:
                    # Create new record
                    nam_model = NAMModel(
                        name=friendly_name,
                        file_path=str(file_path),
                        file_hash=file_hash,
                        file_size=file_path.stat().st_size,
                        category="Featured Amp",
                        amp_name=amp_name,
                        amp_type=variant.get('size', 'standard'),
                        author=variant.get('author', 'TONE3000'),
                        description=variant.get('description', f"{amp_name} {variant_type}"),
                        license="TONE3000 Community",
                        source_url=variant.get('model_url'),
                        tags=['featured', 'tone3000', 'nam', amp_name.lower()],
                        is_featured=True,
                        featured_position=position,
                        source_tone3000_id=tone_id,
                        source_tone3000_name=variant.get('name', '')
                    )
                    db.add(nam_model)
                    logger.info(f"Created new featured model: {friendly_name}")

                db.commit()

                return {
                    'filename': filename,
                    'amp_name': amp_name,
                    'variant_type': variant_type,
                    'position': position,
                    'tone3000_id': tone_id,
                    'file_path': str(file_path)
                }

            finally:
                db.close()

        except Exception as e:
            logger.error(f"Error downloading/registering variant: {e}")
            return None

    @staticmethod
    def _calculate_hash(file_path: Path) -> str:
        """Calculate SHA256 hash of file.

        Args:
            file_path: Path to file

        Returns:
            Hex hash string
        """
        sha256_hash = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()

    async def get_featured_models_count(self) -> int:
        """Get count of currently featured models.

        Returns:
            Number of featured NAM models
        """
        db = get_db()
        try:
            count = db.query(NAMModel).filter_by(is_featured=True).count()
            return count
        finally:
            db.close()

    async def clear_featured_models(self) -> int:
        """Clear featured status from all models.

        Returns:
            Number of models cleared
        """
        db = get_db()
        try:
            count = db.query(NAMModel).filter_by(is_featured=True).update(
                {'is_featured': False, 'featured_position': None}
            )
            db.commit()
            logger.info(f"Cleared featured status from {count} models")
            return count
        finally:
            db.close()
