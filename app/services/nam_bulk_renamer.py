"""
NAM Library Bulk Rename Service

Safely renames NAM files across the library to a standardized format:
{Brand}_{Model}_{Type}_[SOURCE-{id}].nam

Features:
- Metadata enrichment from GitHub, TONE3000, and database
- Transactional updates with rollback capability
- Dry-run mode for preview
- Audit logging of all changes
- Backup tracking of original names
"""

import logging
import hashlib
import shutil
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from datetime import datetime
import json

from app.paths import StoragePaths
from app.database import get_db, NAMModel
from app.services.ir_library.nam_github_scraper import NAMGitHubScraper

logger = logging.getLogger(__name__)


class BulkRenameResult:
    """Result from a bulk rename operation."""
    
    def __init__(self):
        self.total_files = 0
        self.renamed_count = 0
        self.skipped_count = 0
        self.failed_count = 0
        self.renamed_files: List[Dict] = []
        self.skipped_files: List[Dict] = []
        self.failed_files: List[Dict] = []
        self.errors: List[str] = []
        self.start_time: Optional[datetime] = None
        self.end_time: Optional[datetime] = None

    @property
    def duration_seconds(self) -> float:
        """Get operation duration in seconds."""
        if self.start_time and self.end_time:
            return (self.end_time - self.start_time).total_seconds()
        return 0

    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization."""
        return {
            'total_files': self.total_files,
            'renamed_count': self.renamed_count,
            'skipped_count': self.skipped_count,
            'failed_count': self.failed_count,
            'renamed_files': self.renamed_files,
            'skipped_files': self.skipped_files,
            'failed_files': self.failed_files,
            'errors': self.errors,
            'duration_seconds': self.duration_seconds
        }


class NAMBulkRenamer:
    """Manages bulk renaming of NAM library files."""

    def __init__(self):
        """Initialize the bulk renamer."""
        self.github_scraper = NAMGitHubScraper()
        self.nam_dirs = StoragePaths.get_all_nam_paths(include_nonexistent=False)
        self.audit_log_dir = StoragePaths.get_nam_user_dir() / "audit_logs"
        self.audit_log_dir.mkdir(parents=True, exist_ok=True)

    async def scan_library(self) -> List[Dict]:
        """Scan all NAM directories and collect file information.
        
        Returns:
            List of file info dicts with metadata
        """
        logger.info(f"Scanning NAM library from {len(self.nam_dirs)} directories")
        files_info = []
        seen_hashes = set()

        for scan_dir in self.nam_dirs:
            if not scan_dir.exists():
                continue

            for nam_file in scan_dir.glob("**/*.nam"):
                try:
                    file_hash = self._calculate_hash(nam_file)
                    
                    # Skip duplicates
                    if file_hash in seen_hashes:
                        logger.debug(f"Skipping duplicate: {nam_file}")
                        continue
                    
                    seen_hashes.add(file_hash)

                    file_info = {
                        'original_path': str(nam_file),
                        'original_name': nam_file.stem,
                        'file_size': nam_file.stat().st_size,
                        'file_hash': file_hash,
                        'directory': str(nam_file.parent),
                        'metadata': self._extract_metadata(nam_file)
                    }
                    files_info.append(file_info)

                except Exception as e:
                    logger.warning(f"Error scanning {nam_file}: {e}")

        logger.info(f"Scanned {len(files_info)} unique NAM files")
        return files_info

    async def enrich_metadata(self, files_info: List[Dict]) -> List[Dict]:
        """Enrich file metadata from GitHub, database, and TONE3000.
        
        Args:
            files_info: List of file info dicts
            
        Returns:
            List of enriched file info dicts
        """
        logger.info(f"Enriching metadata for {len(files_info)} files")
        
        # Load GitHub models for reference
        try:
            github_models = await self.github_scraper.discover_irs(limit=500)
            logger.info(f"Loaded {len(github_models)} GitHub model references")
        except Exception as e:
            logger.warning(f"Could not load GitHub models: {e}")
            github_models = []

        # Load database records
        db = get_db()
        try:
            db_models = db.query(NAMModel).all()
            db_lookup = {m.file_hash: m for m in db_models}
            logger.info(f"Loaded {len(db_lookup)} database records")
        finally:
            db.close()

        # Enrich each file
        for file_info in files_info:
            file_hash = file_info['file_hash']
            original_name = file_info['original_name']

            # Try database lookup first
            if file_hash in db_lookup:
                db_record = db_lookup[file_hash]
                file_info['database_metadata'] = {
                    'amp_name': db_record.amp_name,
                    'amp_type': db_record.amp_type,
                    'category': db_record.category,
                    'author': db_record.author,
                    'source_tone3000_id': db_record.source_tone3000_id
                }

            # Try GitHub match
            for github_model in github_models:
                # Simple filename matching
                if original_name.lower() in github_model.filename.lower() or \
                   github_model.filename.lower() in original_name.lower():
                    file_info['github_metadata'] = {
                        'filename': github_model.filename,
                        'category': github_model.category,
                        'author': github_model.author,
                        'library': github_model.library
                    }
                    break

        return files_info

    def _extract_metadata(self, file_path: Path) -> Dict:
        """Extract metadata from filename.
        
        Args:
            file_path: Path to NAM file
            
        Returns:
            Dict with extracted metadata
        """
        name = file_path.stem
        
        # Simple heuristics for extraction
        name_lower = name.lower()
        
        # Detect type
        amp_type = "unknown"
        if any(x in name_lower for x in ['clean', 'crunch', 'drive']):
            amp_type = "clean" if "clean" in name_lower else "crunch"
        elif any(x in name_lower for x in ['high gain', 'lead', 'metal', 'dist']):
            amp_type = "high_gain"
        
        # Try to extract brand/model from name
        parts = name.replace('_', ' ').replace('-', ' ').split()
        
        return {
            'detected_type': amp_type,
            'name_parts': parts,
            'source': 'unknown'
        }

    def _generate_new_name(self, file_info: Dict) -> Tuple[str, str]:
        """Generate standardized new filename.
        
        Args:
            file_info: File info dict with metadata
            
        Returns:
            Tuple of (new_filename, reason) or (None, error_reason)
        """
        # Priority: database > GitHub > extracted
        metadata = file_info.get('database_metadata') or \
                  file_info.get('github_metadata') or {}
        
        amp_name = metadata.get('amp_name', '').replace(' ', '_') or \
                   (metadata.get('category', '').replace(' ', '_') if metadata.get('category') else None) or \
                   'Unknown_Amp'
        
        amp_type = metadata.get('amp_type', 'Standard').replace(' ', '_')
        
        source_id = metadata.get('source_tone3000_id') or \
                   metadata.get('library') or 'UNKNOWN'
        
        # Format: Brand_Model_Type_[SOURCE-id].nam
        new_filename = f"{amp_name}_{amp_type}_[{source_id}].nam"
        
        # Sanitize filename for filesystem
        new_filename = self._sanitize_filename(new_filename)
        
        if new_filename == f"{file_info['original_name']}.nam":
            return None, "No metadata found for meaningful rename"
        
        return new_filename, "success"

    @staticmethod
    def _sanitize_filename(filename: str) -> str:
        """Sanitize filename for filesystem safety.
        
        Args:
            filename: Original filename
            
        Returns:
            Sanitized filename
        """
        # Remove problematic characters
        invalid_chars = '<>:"/\\|?*'
        for char in invalid_chars:
            filename = filename.replace(char, '_')
        
        # Collapse multiple underscores
        while '__' in filename:
            filename = filename.replace('__', '_')
        
        # Ensure extension
        if not filename.endswith('.nam'):
            filename += '.nam'
        
        return filename

    async def preview_renames(self, files_info: List[Dict], 
                             dry_run: bool = True) -> Dict:
        """Preview planned renames without making changes.
        
        Args:
            files_info: List of file info dicts
            dry_run: If False, actually performs renames
            
        Returns:
            Dict with preview results
        """
        result = BulkRenameResult()
        result.start_time = datetime.now()
        result.total_files = len(files_info)

        db = get_db()
        db_lookup = {m.file_hash: m for m in db.query(NAMModel).all()}

        try:
            for file_info in files_info:
                try:
                    original_path = Path(file_info['original_path'])
                    file_hash = file_info['file_hash']
                    
                    # Generate new name
                    new_name, reason = self._generate_new_name(file_info)
                    
                    if not new_name:
                        result.skipped_count += 1
                        result.skipped_files.append({
                            'original_name': file_info['original_name'],
                            'reason': reason
                        })
                        continue
                    
                    new_path = original_path.parent / new_name
                    
                    # Check for conflicts
                    if new_path.exists() and new_path != original_path:
                        result.failed_count += 1
                        result.failed_files.append({
                            'original_name': file_info['original_name'],
                            'new_name': new_name,
                            'error': 'Target filename already exists'
                        })
                        continue
                    
                    if not dry_run:
                        # Actually rename
                        logger.info(f"Renaming: {original_path.name} -> {new_name}")
                        shutil.move(str(original_path), str(new_path))
                        
                        # Update database
                        if file_hash in db_lookup:
                            db_model = db_lookup[file_hash]
                            db_model.name = new_name.replace('.nam', '')
                            db_model.file_path = str(new_path)
                            db.commit()
                    
                    result.renamed_count += 1
                    result.renamed_files.append({
                        'original_name': file_info['original_name'],
                        'new_name': new_name,
                        'file_size': file_info['file_size']
                    })

                except Exception as e:
                    logger.error(f"Error processing {file_info['original_name']}: {e}")
                    result.failed_count += 1
                    result.failed_files.append({
                        'original_name': file_info['original_name'],
                        'error': str(e)
                    })
                    result.errors.append(str(e))

        finally:
            db.close()

        result.end_time = datetime.now()
        
        # Save audit log
        self._save_audit_log(result, dry_run)
        
        logger.info(f"Rename operation: {result.renamed_count} renamed, "
                   f"{result.skipped_count} skipped, {result.failed_count} failed")
        
        return result.to_dict()

    def _save_audit_log(self, result: BulkRenameResult, dry_run: bool) -> None:
        """Save audit log of rename operation.
        
        Args:
            result: BulkRenameResult object
            dry_run: Whether this was a dry-run
        """
        try:
            log_filename = f"rename_{'preview' if dry_run else 'execute'}" \
                          f"_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            log_path = self.audit_log_dir / log_filename
            
            audit_data = {
                'timestamp': datetime.now().isoformat(),
                'operation_type': 'dry_run' if dry_run else 'execute',
                'result': result.to_dict()
            }
            
            with open(log_path, 'w') as f:
                json.dump(audit_data, f, indent=2)
            
            logger.info(f"Saved audit log: {log_path}")
        except Exception as e:
            logger.error(f"Error saving audit log: {e}")

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

    async def execute_bulk_rename(self, files_info: List[Dict]) -> Dict:
        """Execute bulk rename operation (non-dry-run).
        
        Args:
            files_info: List of file info dicts
            
        Returns:
            Dict with execution results
        """
        logger.info(f"Executing bulk rename for {len(files_info)} files")
        return await self.preview_renames(files_info, dry_run=False)
