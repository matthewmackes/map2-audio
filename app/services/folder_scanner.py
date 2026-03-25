"""
Folder Scanner Service
Detect changes in NAM, IR, and LV2 plugin folders and update databases.
"""

import logging
import os
import hashlib
from typing import Dict, List, Set, Optional
from pathlib import Path
from datetime import datetime
import asyncio

from app.services.ir_loader import get_ir_loader
from app.database import get_session, ImpulseResponse, NAMModel, Plugin
from app.paths import StoragePaths
from app.utils.singleton import Singleton
from app.utils.logging_utils import get_logger
from sqlalchemy import delete

logger = get_logger(__name__)


class FolderScanner(Singleton):
    """Scan folders for audio files and plugins."""

    # Supported file extensions
    NAM_EXTENSIONS = ['.nam']
    IR_EXTENSIONS = ['.wav', '.flac', '.aiff', '.aif']
    LV2_EXTENSIONS = ['.ttl']  # LV2 manifest files

    def __init__(self):
        """Initialize folder scanner."""
        super().__init__()
        # Use centralized paths from StoragePaths
        self.base_paths = {
            'nams': str(StoragePaths.get_nam_system_dir()),
            'irs': str(StoragePaths.get_ir_system_dir()),
            'lv2': '/var/lib/map2/lv2'
        }

        # Ensure directories exist
        StoragePaths.ensure_directories()
        StoragePaths.ensure_system_directories()

        logger.info("Folder scanner initialized")
    
    def _calculate_file_hash(self, file_path: str) -> str:
        """Calculate SHA256 hash of file.
        
        Args:
            file_path: Path to file
            
        Returns:
            Hash string
        """
        sha256 = hashlib.sha256()
        try:
            with open(file_path, 'rb') as f:
                for chunk in iter(lambda: f.read(4096), b''):
                    sha256.update(chunk)
            return sha256.hexdigest()
        except Exception as e:
            logger.error(f"Error hashing file {file_path}: {e}")
            return ""
    
    def _scan_directory(self, directory: str, extensions: List[str]) -> Dict[str, dict]:
        """Scan directory for files with given extensions.
        
        Args:
            directory: Directory to scan
            extensions: List of file extensions to match
            
        Returns:
            Dict of file_path -> file_info
        """
        files = {}
        
        if not os.path.exists(directory):
            logger.warning(f"Directory does not exist: {directory}")
            return files
        
        for root, dirs, filenames in os.walk(directory):
            for filename in filenames:
                ext = os.path.splitext(filename)[1].lower()
                if ext in extensions:
                    file_path = os.path.join(root, filename)
                    try:
                        stat = os.stat(file_path)
                        files[file_path] = {
                            'name': filename,
                            'size': stat.st_size,
                            'modified': datetime.fromtimestamp(stat.st_mtime),
                            'hash': self._calculate_file_hash(file_path)
                        }
                    except Exception as e:
                        logger.error(f"Error scanning file {file_path}: {e}")
        
        return files
    
    async def scan_nams(self) -> Dict[str, int]:
        """Scan NAM models folder.

        Returns:
            Statistics: {'found': int, 'added': int, 'removed': int}
        """
        logger.info("Scanning NAM models...")

        nam_dir = self.base_paths['nams']
        found_files = self._scan_directory(nam_dir, self.NAM_EXTENSIONS)

        stats = {
            'found': len(found_files),
            'added': 0,
            'removed': 0,
            'updated': 0
        }

        session = get_session()

        try:
            # Get existing NAMs from database
            existing_nams = session.query(NAMModel).all()
            existing_paths = {nam.file_path: nam for nam in existing_nams}
            existing_hashes = {nam.file_hash: nam for nam in existing_nams}

            found_paths = set(found_files.keys())
            db_paths = set(existing_paths.keys())

            # Find new files
            new_paths = found_paths - db_paths

            # Find removed files
            removed_paths = db_paths - found_paths

            # Add new NAMs
            for file_path in new_paths:
                info = found_files[file_path]
                file_hash = info['hash']

                # Check if already exists by hash (moved file)
                if file_hash in existing_hashes:
                    # Update path of existing entry
                    existing_nams_entry = existing_hashes[file_hash]
                    existing_nams_entry.file_path = file_path
                    stats['updated'] += 1
                    logger.info(f"Updated NAM path: {info['name']}")
                    continue

                # Create new database entry
                nam_entry = NAMModel(
                    name=os.path.splitext(info['name'])[0],
                    file_path=file_path,
                    file_hash=file_hash,
                    file_size=info['size'],
                    model_type="NAM Model",
                    category="Amp Model"
                )

                session.add(nam_entry)
                stats['added'] += 1
                logger.info(f"Added NAM: {info['name']}")

            # Remove deleted NAMs
            for file_path in removed_paths:
                nam = existing_paths[file_path]
                session.delete(nam)
                stats['removed'] += 1
                logger.info(f"Removed NAM: {nam.name}")

            # Check for updated files (hash changed)
            common_paths = found_paths & db_paths
            for file_path in common_paths:
                found_hash = found_files[file_path]['hash']
                db_nam = existing_paths[file_path]

                if found_hash != db_nam.file_hash:
                    # File was modified - update hash
                    db_nam.file_hash = found_hash
                    db_nam.file_size = found_files[file_path]['size']
                    stats['updated'] += 1
                    logger.info(f"Updated NAM: {db_nam.name}")

            session.commit()

        except Exception as e:
            logger.error(f"Error during NAM scan: {e}")
            session.rollback()
        finally:
            session.close()

        logger.info(f"NAM scan complete: {stats}")
        return stats
    
    async def scan_irs(self) -> Dict[str, int]:
        """Scan impulse response folder.
        
        Returns:
            Statistics: {'found': int, 'added': int, 'removed': int, 'updated': int}
        """
        logger.info("Scanning impulse responses...")
        
        ir_dir = self.base_paths['irs']
        found_files = self._scan_directory(ir_dir, self.IR_EXTENSIONS)
        
        stats = {
            'found': len(found_files),
            'added': 0,
            'removed': 0,
            'updated': 0
        }
        
        session = get_session()
        
        try:
            # Get existing IRs from database
            existing_irs = session.query(ImpulseResponse).all()
            existing_paths = {ir.file_path: ir for ir in existing_irs}
            existing_hashes = {ir.file_hash: ir for ir in existing_irs}
            
            found_paths = set(found_files.keys())
            db_paths = set(existing_paths.keys())
            
            # Find new files
            new_paths = found_paths - db_paths
            
            # Find removed files
            removed_paths = db_paths - found_paths
            
            # Add new IRs
            ir_loader = get_ir_loader()
            for file_path in new_paths:
                try:
                    result = ir_loader.load_ir_file(file_path)
                    if result:
                        audio_data, sample_rate, metadata = result
                        
                        # Check if already exists by hash
                        if metadata['file_hash'] in existing_hashes:
                            logger.debug(f"IR already exists with different path: {file_path}")
                            continue
                        
                        # Create new database entry
                        ir_entry = ImpulseResponse(
                            name=metadata['file_name'],
                            file_path=file_path,
                            file_hash=metadata['file_hash'],
                            sample_rate=metadata['sample_rate'],
                            channels=metadata['channels'],
                            duration_seconds=metadata['duration_seconds'],
                            length_samples=metadata['length_samples'],
                            peak_amplitude=metadata['peak_amplitude'],
                            rms_level=metadata['rms_level'],
                            library='user',
                            rt60=metadata.get('rt60_seconds'),
                            early_decay_time=metadata.get('early_decay_time_seconds'),
                            peak_location_ms=metadata.get('peak_location_ms'),
                            estimated_characteristics=metadata.get('estimated', True)
                        )
                        
                        session.add(ir_entry)
                        stats['added'] += 1
                        logger.info(f"Added IR: {metadata['file_name']}")
                
                except Exception as e:
                    logger.error(f"Error adding IR {file_path}: {e}")
            
            # Remove deleted IRs
            for file_path in removed_paths:
                ir = existing_paths[file_path]
                session.delete(ir)
                stats['removed'] += 1
                logger.info(f"Removed IR: {ir.name}")
            
            # Check for updated files (hash changed)
            common_paths = found_paths & db_paths
            for file_path in common_paths:
                found_hash = found_files[file_path]['hash']
                db_ir = existing_paths[file_path]
                
                if found_hash != db_ir.file_hash:
                    # File was modified - reload
                    try:
                        result = ir_loader.load_ir_file(file_path)
                        if result:
                            audio_data, sample_rate, metadata = result
                            
                            # Update database entry
                            db_ir.file_hash = metadata['file_hash']
                            db_ir.sample_rate = metadata['sample_rate']
                            db_ir.channels = metadata['channels']
                            db_ir.duration_seconds = metadata['duration_seconds']
                            db_ir.length_samples = metadata['length_samples']
                            db_ir.peak_amplitude = metadata['peak_amplitude']
                            db_ir.rms_level = metadata['rms_level']
                            db_ir.rt60 = metadata.get('rt60_seconds')
                            db_ir.early_decay_time = metadata.get('early_decay_time_seconds')
                            db_ir.peak_location_ms = metadata.get('peak_location_ms')
                            
                            stats['updated'] += 1
                            logger.info(f"Updated IR: {db_ir.name}")
                    
                    except Exception as e:
                        logger.error(f"Error updating IR {file_path}: {e}")
            
            session.commit()
            
        except Exception as e:
            logger.error(f"Error during IR scan: {e}")
            session.rollback()
        finally:
            session.close()
        
        logger.info(f"IR scan complete: {stats}")
        return stats
    
    async def scan_lv2(self) -> Dict[str, int]:
        """Scan LV2 plugins folder using the unified plugin loader.

        Returns:
            Statistics: {'found': int, 'added': int, 'removed': int}
        """
        logger.info("Scanning LV2 plugins...")

        from app.services.plugin_loader_unified import get_plugin_loader

        stats = {
            'found': 0,
            'added': 0,
            'removed': 0,
            'updated': 0
        }

        try:
            loader = get_plugin_loader()
            plugins = await loader.discover(force_refresh=False)

            stats['found'] = len(plugins)

            session = get_session()
            try:
                # Get existing plugins from database
                existing_plugins = session.query(Plugin).all()
                existing_uris = {p.uri: p for p in existing_plugins}

                discovered_uris = {plugin.uri for plugin in plugins}
                db_uris = set(existing_uris.keys())

                # Find new plugins
                new_uris = discovered_uris - db_uris

                # Find removed plugins
                removed_uris = db_uris - discovered_uris

                # Add new plugins to database
                for plugin_data in plugins:
                    uri = plugin_data.uri
                    if uri in new_uris:
                        plugin_entry = Plugin(
                            uri=uri,
                            name=plugin_data.name or 'Unknown',
                            category=plugin_data.category or 'Utility',
                            bundle_path=None,
                        )
                        session.add(plugin_entry)
                        stats['added'] += 1
                        logger.info(f"Added LV2 plugin: {plugin_data.name or uri}")

                # Remove plugins no longer on system
                for uri in removed_uris:
                    plugin = existing_uris[uri]
                    session.delete(plugin)
                    stats['removed'] += 1
                    logger.info(f"Removed LV2 plugin: {plugin.name}")

                session.commit()

            except Exception as e:
                logger.error(f"Error updating plugin database: {e}")
                session.rollback()
            finally:
                session.close()

        except Exception as e:
            logger.error(f"Error during LV2 scan: {e}")

        logger.info(f"LV2 scan complete: {stats}")
        return stats
    
    async def scan_all(self) -> Dict[str, Dict]:
        """Scan all folders.
        
        Returns:
            Combined statistics for all scans
        """
        logger.info("Starting full folder scan...")
        
        start_time = datetime.utcnow()
        
        results = {
            'nams': await self.scan_nams(),
            'irs': await self.scan_irs(),
            'lv2': await self.scan_lv2(),
            'scan_time': (datetime.utcnow() - start_time).total_seconds()
        }
        
        # Calculate totals
        results['totals'] = {
            'found': sum(r['found'] for r in [results['nams'], results['irs'], results['lv2']]),
            'added': sum(r['added'] for r in [results['nams'], results['irs'], results['lv2']]),
            'removed': sum(r['removed'] for r in [results['nams'], results['irs'], results['lv2']]),
            'updated': sum(r.get('updated', 0) for r in [results['nams'], results['irs'], results['lv2']])
        }
        
        logger.info(f"Full scan complete in {results['scan_time']:.1f}s: {results['totals']}")
        return results
    
    def get_folder_stats(self) -> Dict[str, Dict]:
        """Get current folder statistics without scanning.
        
        Returns:
            Statistics for each folder
        """
        stats = {}
        
        for name, path in self.base_paths.items():
            if not os.path.exists(path):
                stats[name] = {
                    'exists': False,
                    'path': path,
                    'file_count': 0,
                    'total_size': 0
                }
                continue
            
            file_count = 0
            total_size = 0
            
            for root, dirs, files in os.walk(path):
                file_count += len(files)
                for f in files:
                    try:
                        total_size += os.path.getsize(os.path.join(root, f))
                    except Exception:
                        pass
            
            stats[name] = {
                'exists': True,
                'path': path,
                'file_count': file_count,
                'total_size': total_size,
                'total_size_mb': total_size / (1024 * 1024)
            }
        
        return stats


# Singleton accessor
def get_folder_scanner() -> FolderScanner:
    """Get or create global folder scanner instance."""
    return FolderScanner.get_instance()
