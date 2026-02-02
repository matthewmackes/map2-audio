"""
Unified Asset Upload Service

Handles validation and storage for all audio asset types:
- NAM models (.nam)
- Cabinet IRs (.wav, .aif, .aiff, .flac)
- Reverb IRs (.wav, .aif, .aiff, .flac)
- VST3 plugins (.vst3, .zip)
"""

import hashlib
import io
import logging
import os
import shutil
import zipfile
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Optional, Tuple

logger = logging.getLogger(__name__)


class AssetType(str, Enum):
    """Supported audio asset types."""
    NAM = "nam"
    CABINET_IR = "cabinet_ir"
    REVERB_IR = "reverb_ir"
    VST3 = "vst3"


@dataclass
class UploadResult:
    """Result of an upload operation."""
    success: bool
    asset_type: AssetType
    filename: str
    file_path: str
    file_size: int
    file_hash: str
    message: str
    error: Optional[str] = None
    already_exists: bool = False


@dataclass
class ValidationResult:
    """Result of file validation."""
    valid: bool
    asset_type: Optional[AssetType]
    message: str
    details: dict


class UnifiedUploadService:
    """Service for handling all asset uploads."""

    # File extension to asset type mapping (unambiguous types)
    EXTENSION_MAP = {
        '.nam': AssetType.NAM,
        '.vst3': AssetType.VST3,
    }

    # Audio file extensions (require explicit type from user)
    AUDIO_EXTENSIONS = {'.wav', '.aif', '.aiff', '.flac'}

    # Max file sizes (bytes)
    MAX_SIZES = {
        AssetType.NAM: 500 * 1024 * 1024,       # 500 MB
        AssetType.CABINET_IR: 50 * 1024 * 1024,  # 50 MB
        AssetType.REVERB_IR: 100 * 1024 * 1024,  # 100 MB
        AssetType.VST3: 500 * 1024 * 1024,       # 500 MB
    }

    def __init__(self):
        from app.paths import StoragePaths
        self.paths = StoragePaths

    def detect_asset_type(
        self,
        filename: str,
        asset_type_override: Optional[str] = None
    ) -> Tuple[Optional[AssetType], str]:
        """Detect asset type from filename extension.

        Args:
            filename: Name of the file
            asset_type_override: Explicit type from user ('cabinet_ir' or 'reverb_ir')

        Returns:
            Tuple of (AssetType or None, message)
        """
        ext = Path(filename).suffix.lower()

        # Check for explicit override first
        if asset_type_override:
            try:
                return AssetType(asset_type_override), f"Type specified: {asset_type_override}"
            except ValueError:
                pass

        # Direct extension mapping for unambiguous types
        if ext in self.EXTENSION_MAP:
            return self.EXTENSION_MAP[ext], f"Detected {self.EXTENSION_MAP[ext].value}"

        # ZIP files - check if VST3 archive
        if ext == '.zip':
            return AssetType.VST3, "ZIP archive (will extract VST3)"

        # Audio files require explicit type from user
        if ext in self.AUDIO_EXTENSIONS:
            if asset_type_override in ('cabinet_ir', 'reverb_ir'):
                return AssetType(asset_type_override), f"Audio file for {asset_type_override}"
            # No type specified - return None to prompt user
            return None, "Audio file requires type selection (cabinet_ir or reverb_ir)"

        return None, f"Unknown file type: {ext}"

    def validate_file(
        self,
        filename: str,
        file_size: int,
        asset_type_override: Optional[str] = None
    ) -> ValidationResult:
        """Validate an uploaded file.

        Args:
            filename: Name of the file
            file_size: Size in bytes
            asset_type_override: Explicit type for audio files

        Returns:
            ValidationResult with validation status
        """
        ext = Path(filename).suffix.lower()

        # Check if audio file without type specification
        if ext in self.AUDIO_EXTENSIONS and not asset_type_override:
            return ValidationResult(
                valid=False,
                asset_type=None,
                message="Audio files require type selection",
                details={
                    "filename": filename,
                    "requires_type": True,
                    "options": ["cabinet_ir", "reverb_ir"]
                }
            )

        asset_type, detect_msg = self.detect_asset_type(filename, asset_type_override)

        if asset_type is None:
            return ValidationResult(
                valid=False,
                asset_type=None,
                message=f"Unsupported file type: {ext}",
                details={
                    "filename": filename,
                    "supported": [".nam", ".vst3", ".zip", ".wav", ".aif", ".aiff", ".flac"]
                }
            )

        # Check file size
        max_size = self.MAX_SIZES.get(asset_type, 100 * 1024 * 1024)
        if file_size > max_size:
            max_mb = max_size // (1024 * 1024)
            actual_mb = file_size / (1024 * 1024)
            return ValidationResult(
                valid=False,
                asset_type=asset_type,
                message=f"File too large ({actual_mb:.1f}MB, max {max_mb}MB)",
                details={"size": file_size, "max_size": max_size}
            )

        return ValidationResult(
            valid=True,
            asset_type=asset_type,
            message=f"Valid {asset_type.value} file",
            details={"detected_type": asset_type.value}
        )

    def get_storage_path(self, asset_type: AssetType) -> Path:
        """Get storage path for asset type."""
        paths = {
            AssetType.NAM: self.paths.get_nam_user_dir(),
            AssetType.CABINET_IR: self.paths.get_ir_cabinet_dir(),
            AssetType.REVERB_IR: self.paths.get_ir_reverb_dir(),
            AssetType.VST3: Path.home() / ".vst3",  # Standard VST3 user path
        }
        return paths[asset_type]

    async def save_upload(
        self,
        filename: str,
        content: bytes,
        asset_type: AssetType
    ) -> UploadResult:
        """Save uploaded file to appropriate location.

        Args:
            filename: Original filename
            content: File content bytes
            asset_type: Type of asset

        Returns:
            UploadResult with status and metadata
        """
        try:
            # Compute hash for deduplication
            file_hash = hashlib.sha256(content).hexdigest()

            # Get destination directory
            dest_dir = self.get_storage_path(asset_type)
            dest_dir.mkdir(parents=True, exist_ok=True)

            # Handle VST3 specially
            if asset_type == AssetType.VST3:
                return await self._save_vst3(filename, content, dest_dir, file_hash)

            # Regular file save
            dest_path = dest_dir / filename

            # Check for duplicates
            if dest_path.exists():
                existing_hash = hashlib.sha256(dest_path.read_bytes()).hexdigest()
                if existing_hash == file_hash:
                    return UploadResult(
                        success=True,
                        asset_type=asset_type,
                        filename=filename,
                        file_path=str(dest_path),
                        file_size=len(content),
                        file_hash=file_hash,
                        message="File already exists (identical)",
                        already_exists=True
                    )

            # Write file
            dest_path.write_bytes(content)

            logger.info(f"Uploaded {asset_type.value}: {filename} -> {dest_path}")

            return UploadResult(
                success=True,
                asset_type=asset_type,
                filename=filename,
                file_path=str(dest_path),
                file_size=len(content),
                file_hash=file_hash,
                message=f"Successfully uploaded {asset_type.value}"
            )

        except Exception as e:
            logger.error(f"Upload error for {filename}: {e}")
            return UploadResult(
                success=False,
                asset_type=asset_type,
                filename=filename,
                file_path="",
                file_size=len(content),
                file_hash="",
                message="Upload failed",
                error=str(e)
            )

    async def _save_vst3(
        self,
        filename: str,
        content: bytes,
        dest_dir: Path,
        file_hash: str
    ) -> UploadResult:
        """Save VST3 plugin, handling both bundles and zip archives.

        Args:
            filename: Original filename
            content: File content bytes
            dest_dir: Destination directory
            file_hash: SHA256 hash of content

        Returns:
            UploadResult with status
        """
        ext = Path(filename).suffix.lower()

        if ext == '.zip':
            # Extract VST3 from zip archive
            try:
                with zipfile.ZipFile(io.BytesIO(content)) as zf:
                    # Find .vst3 bundles in the archive
                    vst3_entries = [
                        name for name in zf.namelist()
                        if '.vst3' in name and not name.endswith('/')
                    ]

                    if not vst3_entries:
                        return UploadResult(
                            success=False,
                            asset_type=AssetType.VST3,
                            filename=filename,
                            file_path="",
                            file_size=len(content),
                            file_hash=file_hash,
                            message="No VST3 plugin found in archive",
                            error="ZIP does not contain .vst3 bundle"
                        )

                    # Extract to destination
                    zf.extractall(dest_dir)

                    # Find the root VST3 bundle name
                    bundle_name = vst3_entries[0].split('/')[0]
                    if not bundle_name.endswith('.vst3'):
                        # Look for actual .vst3 directory
                        for entry in vst3_entries:
                            parts = entry.split('/')
                            for part in parts:
                                if part.endswith('.vst3'):
                                    bundle_name = part
                                    break

                    dest_path = dest_dir / bundle_name

                    logger.info(f"Extracted VST3: {bundle_name} -> {dest_path}")

                    return UploadResult(
                        success=True,
                        asset_type=AssetType.VST3,
                        filename=bundle_name,
                        file_path=str(dest_path),
                        file_size=len(content),
                        file_hash=file_hash,
                        message=f"Extracted VST3 plugin: {bundle_name}"
                    )

            except zipfile.BadZipFile:
                return UploadResult(
                    success=False,
                    asset_type=AssetType.VST3,
                    filename=filename,
                    file_path="",
                    file_size=len(content),
                    file_hash=file_hash,
                    message="Invalid ZIP archive",
                    error="File is not a valid ZIP archive"
                )

        else:
            # Direct .vst3 bundle (uploaded as file, though usually a directory)
            dest_path = dest_dir / filename

            if dest_path.exists():
                # Remove existing to replace
                if dest_path.is_dir():
                    shutil.rmtree(dest_path)
                else:
                    dest_path.unlink()

            dest_path.write_bytes(content)

            logger.info(f"Uploaded VST3: {filename} -> {dest_path}")

            return UploadResult(
                success=True,
                asset_type=AssetType.VST3,
                filename=filename,
                file_path=str(dest_path),
                file_size=len(content),
                file_hash=file_hash,
                message=f"Uploaded VST3 plugin: {filename}"
            )


# Singleton instance
_upload_service: Optional[UnifiedUploadService] = None


def get_upload_service() -> UnifiedUploadService:
    """Get the unified upload service singleton."""
    global _upload_service
    if _upload_service is None:
        _upload_service = UnifiedUploadService()
    return _upload_service
