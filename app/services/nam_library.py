"""
NAM Model Library Database Integration

Handles database operations for NAM model management.
Provides persistence layer for model metadata and library operations.
"""

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import List, Dict, Any, Optional
from sqlalchemy import Column, String, Integer, JSON, DateTime, create_engine, inspect
from sqlalchemy.orm import declarative_base, Session, sessionmaker
from app.database import RetryingSession
from app.paths import Map2Paths
from app.utils.singleton import Singleton
from app.utils.time import utc_now

logger = logging.getLogger(__name__)

# Database models
Base = declarative_base()


class NAMModelRecord(Base):
    """SQLAlchemy model for NAM model records."""
    __tablename__ = "nam_models"
    
    id = Column(Integer, primary_key=True)
    name = Column(String(255), unique=True, nullable=False, index=True)
    author = Column(String(255), nullable=False)
    version = Column(Integer, default=1)
    architecture = Column(String(50), nullable=False)
    sample_rate = Column(Integer, nullable=False)
    file_path = Column(String(512), nullable=False)
    file_hash = Column(String(64), unique=True, nullable=True)
    file_size_bytes = Column(Integer, default=0)
    model_metadata = Column(JSON, default={})  # Renamed from 'metadata' to avoid SQLAlchemy reserved name
    uploaded_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            'id': self.id,
            'name': self.name,
            'author': self.author,
            'version': self.version,
            'architecture': self.architecture,
            'sample_rate': self.sample_rate,
            'file_path': self.file_path,
            'file_hash': self.file_hash,
            'file_size_bytes': self.file_size_bytes,
            'file_size_mb': self.file_size_bytes / (1024 * 1024),
            'metadata': self.model_metadata or {},
            'uploaded_at': self.uploaded_at.isoformat() if self.uploaded_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class NAMLibraryService:
    """
    NAM Model Library Database Service.
    
    Manages NAM model records, metadata, and library operations.
    """

    def __init__(self, database_url: str = "sqlite:////var/lib/map2/nam.db"):
        """
        Initialize NAM library service.
        
        Args:
            database_url: SQLAlchemy database URL
        """
        self.database_url = database_url
        self.engine = create_engine(
            database_url,
            echo=False,
            connect_args={"check_same_thread": False} if "sqlite" in database_url else {}
        )
        self.SessionLocal = sessionmaker(
            bind=self.engine,
            class_=RetryingSession,
            expire_on_commit=False,
        )
        
        # Create tables
        Base.metadata.create_all(self.engine)
        
        self.logger = logging.getLogger("NAMLibraryService")

    def add_model(
        self,
        name: str,
        author: str,
        version: int,
        architecture: str,
        sample_rate: int,
        file_path: str,
        file_hash: Optional[str] = None,
        file_size_bytes: int = 0,
        metadata: Optional[Dict[str, Any]] = None
    ) -> NAMModelRecord:
        """
        Add a NAM model to the library.
        
        Args:
            name: Model name
            author: Model author
            version: Model version
            architecture: Model architecture type
            sample_rate: Sample rate in Hz
            file_path: Path to model file
            file_hash: SHA256 hash of file
            file_size_bytes: File size in bytes
            metadata: Additional metadata
            
        Returns:
            NAMModelRecord
        """
        try:
            session = self.SessionLocal()
            
            record = NAMModelRecord(
                name=name,
                author=author,
                version=version,
                architecture=architecture,
                sample_rate=sample_rate,
                file_path=file_path,
                file_hash=file_hash,
                file_size_bytes=file_size_bytes,
                metadata=metadata or {}
            )
            
            session.add(record)
            session.commit()
            session.refresh(record)
            
            self.logger.info(f"Added NAM model: {name}")
            return record
            
        except Exception as e:
            session.rollback()
            self.logger.error(f"Failed to add NAM model: {e}")
            raise
        finally:
            session.close()

    def get_model(self, name: str) -> Optional[NAMModelRecord]:
        """Get a NAM model by name."""
        try:
            session = self.SessionLocal()
            record = session.query(NAMModelRecord).filter_by(name=name).first()
            if record:
                session.refresh(record)
            return record
        finally:
            session.close()

    def get_model_by_hash(self, file_hash: str) -> Optional[NAMModelRecord]:
        """Get a NAM model by file hash."""
        try:
            session = self.SessionLocal()
            record = session.query(NAMModelRecord).filter_by(file_hash=file_hash).first()
            if record:
                session.refresh(record)
            return record
        finally:
            session.close()

    def list_models(
        self,
        skip: int = 0,
        limit: int = 100,
        architecture: Optional[str] = None,
        author: Optional[str] = None
    ) -> List[NAMModelRecord]:
        """
        List NAM models with optional filtering.
        
        Args:
            skip: Skip this many records
            limit: Return at most this many records
            architecture: Filter by architecture
            author: Filter by author
            
        Returns:
            List of NAMModelRecord
        """
        try:
            session = self.SessionLocal()
            query = session.query(NAMModelRecord)
            
            if architecture:
                query = query.filter_by(architecture=architecture)
            if author:
                query = query.filter_by(author=author)
            
            records = query.offset(skip).limit(limit).all()
            return records
            
        finally:
            session.close()

    def delete_model(self, name: str) -> bool:
        """
        Delete a NAM model from the library.
        
        Args:
            name: Model name
            
        Returns:
            True if deleted, False if not found
        """
        try:
            session = self.SessionLocal()
            record = session.query(NAMModelRecord).filter_by(name=name).first()
            
            if record:
                session.delete(record)
                session.commit()
                self.logger.info(f"Deleted NAM model: {name}")
                return True
            
            return False
            
        except Exception as e:
            session.rollback()
            self.logger.error(f"Failed to delete NAM model: {e}")
            raise
        finally:
            session.close()

    def update_model(
        self,
        name: str,
        **kwargs
    ) -> Optional[NAMModelRecord]:
        """
        Update a NAM model record.
        
        Args:
            name: Model name
            **kwargs: Fields to update
            
        Returns:
            Updated NAMModelRecord or None if not found
        """
        try:
            session = self.SessionLocal()
            record = session.query(NAMModelRecord).filter_by(name=name).first()
            
            if record:
                for key, value in kwargs.items():
                    if hasattr(record, key):
                        setattr(record, key, value)
                
                record.updated_at = utc_now()
                session.commit()
                session.refresh(record)
                
                self.logger.info(f"Updated NAM model: {name}")
                return record
            
            return None
            
        except Exception as e:
            session.rollback()
            self.logger.error(f"Failed to update NAM model: {e}")
            raise
        finally:
            session.close()

    def get_stats(self) -> Dict[str, Any]:
        """Get library statistics."""
        try:
            session = self.SessionLocal()
            
            records = session.query(NAMModelRecord).all()
            
            stats = {
                'total_models': len(records),
                'total_size_bytes': sum(r.file_size_bytes for r in records),
                'total_size_mb': sum(r.file_size_bytes for r in records) / (1024 * 1024),
                'architectures': {},
                'authors': set(),
                'sample_rates': set(),
            }
            
            for record in records:
                arch = record.architecture
                stats['architectures'][arch] = stats['architectures'].get(arch, 0) + 1
                stats['authors'].add(record.author)
                stats['sample_rates'].add(record.sample_rate)
            
            stats['unique_authors'] = len(stats['authors'])
            stats['unique_sample_rates'] = len(stats['sample_rates'])
            stats['authors'] = list(stats['authors'])
            stats['sample_rates'] = sorted(list(stats['sample_rates']))
            
            return stats
            
        finally:
            session.close()

    def verify_library_integrity(self) -> Dict[str, Any]:
        """
        Verify library integrity - check if all referenced files exist.
        
        Returns:
            Dict with integrity check results
        """
        try:
            session = self.SessionLocal()
            records = session.query(NAMModelRecord).all()
            
            results = {
                'total_records': len(records),
                'valid_files': 0,
                'missing_files': [],
                'invalid_paths': []
            }
            
            for record in records:
                try:
                    path = Path(record.file_path)
                    if path.exists():
                        results['valid_files'] += 1
                    else:
                        results['missing_files'].append(record.name)
                except Exception as e:
                    results['invalid_paths'].append({
                        'name': record.name,
                        'path': record.file_path,
                        'error': str(e)
                    })
            
            return results
            
        finally:
            session.close()

    def cleanup_orphaned_records(self) -> int:
        """
        Remove database records for files that no longer exist.
        
        Returns:
            Number of records removed
        """
        try:
            session = self.SessionLocal()
            records = session.query(NAMModelRecord).all()
            
            removed = 0
            for record in records:
                try:
                    path = Path(record.file_path)
                    if not path.exists():
                        session.delete(record)
                        removed += 1
                        self.logger.warning(f"Removed orphaned record: {record.name}")
                except Exception:
                    pass
            
            session.commit()
            return removed
            
        except Exception as e:
            session.rollback()
            self.logger.error(f"Cleanup failed: {e}")
            raise
        finally:
            session.close()


def get_nam_library_service() -> NAMLibraryService:
    """Get or create NAM library service instance."""
    if NAMLibraryService in Singleton._instances:
        return Singleton._instances[NAMLibraryService]  # type: ignore[return-value]

    with Singleton._lock:
        if NAMLibraryService not in Singleton._instances:
            lib_dir = Map2Paths.service_state_dir()
            lib_dir.mkdir(parents=True, exist_ok=True)
            Singleton._instances[NAMLibraryService] = NAMLibraryService()
        return Singleton._instances[NAMLibraryService]  # type: ignore[return-value]


def initialize_nam_library(database_url: str = "sqlite:////var/lib/map2/nam.db") -> NAMLibraryService:
    """Initialize NAM library service."""
    with Singleton._lock:
        Singleton._instances[NAMLibraryService] = NAMLibraryService(database_url)
        return Singleton._instances[NAMLibraryService]  # type: ignore[return-value]


def reset_nam_library_service() -> None:
    """Reset the NAM library singleton."""
    with Singleton._lock:
        Singleton._instances.pop(NAMLibraryService, None)
