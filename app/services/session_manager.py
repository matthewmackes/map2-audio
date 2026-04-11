"""
Session Manager - Project save/load and state management
"""

import json
import logging
from typing import Dict, List, Any, Optional
from pathlib import Path
from dataclasses import dataclass, field, asdict
import shutil

from app.utils.time import utc_now

logger = logging.getLogger(__name__)


@dataclass
class SessionMetadata:
    """Session metadata"""
    name: str
    created_at: str
    modified_at: str
    description: str = ""
    author: str = ""
    tags: List[str] = field(default_factory=list)
    version: str = "1.0"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'SessionMetadata':
        """Create from dictionary"""
        return cls(**data)


@dataclass
class SessionState:
    """Complete session state"""
    metadata: SessionMetadata
    chains: List[Dict[str, Any]] = field(default_factory=list)
    plugins: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    midi_mappings: List[Dict[str, Any]] = field(default_factory=list)
    automation: Dict[str, Any] = field(default_factory=dict)
    audio_config: Dict[str, Any] = field(default_factory=dict)
    midi_config: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "metadata": self.metadata.to_dict(),
            "chains": self.chains,
            "plugins": self.plugins,
            "midi_mappings": self.midi_mappings,
            "automation": self.automation,
            "audio_config": self.audio_config,
            "midi_config": self.midi_config
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'SessionState':
        """Create from dictionary"""
        metadata = SessionMetadata.from_dict(data["metadata"])
        return cls(
            metadata=metadata,
            chains=data.get("chains", []),
            plugins=data.get("plugins", {}),
            midi_mappings=data.get("midi_mappings", []),
            automation=data.get("automation", {}),
            audio_config=data.get("audio_config", {}),
            midi_config=data.get("midi_config", {})
        )


class SessionManager:
    """
    Project session management
    
    Features:
    - Save/load complete project state
    - Session metadata and tagging
    - Automatic backups
    - Import/export
    - Session templates
    """
    
    def __init__(self, sessions_dir: Optional[Path] = None):
        """
        Initialize session manager
        
        Args:
            sessions_dir: Directory for sessions (default: ~/.map2/sessions)
        """
        if sessions_dir is None:
            sessions_dir = Path.home() / ".map2" / "sessions"
        
        self.sessions_dir = sessions_dir
        self.sessions_dir.mkdir(parents=True, exist_ok=True)
        
        self.current_session: Optional[SessionState] = None
        self.current_session_path: Optional[Path] = None
        
        logger.info(f"Session manager initialized (sessions: {self.sessions_dir})")

    @staticmethod
    def _utc_now_iso() -> str:
        return utc_now().isoformat()
    
    def create_session(
        self,
        name: str,
        description: str = "",
        author: str = "",
        tags: Optional[List[str]] = None
    ) -> SessionState:
        """
        Create a new session
        
        Args:
            name: Session name
            description: Session description
            author: Author name
            tags: Session tags
        
        Returns:
            New session state
        """
        if tags is None:
            tags = []
        
        metadata = SessionMetadata(
            name=name,
            created_at=self._utc_now_iso(),
            modified_at=self._utc_now_iso(),
            description=description,
            author=author,
            tags=tags
        )
        
        session = SessionState(metadata=metadata)
        self.current_session = session
        
        logger.info(f"Created new session: {name}")
        return session
    
    def save_session(
        self,
        session: Optional[SessionState] = None,
        path: Optional[Path] = None,
        create_backup: bool = True
    ) -> Path:
        """
        Save session to disk
        
        Args:
            session: Session to save (default: current session)
            path: Save path (default: sessions dir + name)
            create_backup: Create backup before saving
        
        Returns:
            Path to saved file
        """
        if session is None:
            session = self.current_session
        
        if session is None:
            raise ValueError("No session to save")
        
        if path is None:
            # Generate path from session name
            filename = self._sanitize_filename(session.metadata.name) + ".map2"
            path = self.sessions_dir / filename
        
        # Create backup if file exists
        if create_backup and path.exists():
            self._create_backup(path)
        
        # Update modified time
        session.metadata.modified_at = self._utc_now_iso()
        
        # Save to disk
        try:
            with open(path, 'w') as f:
                json.dump(session.to_dict(), f, indent=2)
            
            self.current_session_path = path
            logger.info(f"Saved session to: {path}")
            return path
            
        except Exception as e:
            logger.error(f"Error saving session: {e}")
            raise
    
    def load_session(self, path: Path) -> SessionState:
        """
        Load session from disk
        
        Args:
            path: Path to session file
        
        Returns:
            Loaded session state
        """
        if not path.exists():
            raise FileNotFoundError(f"Session file not found: {path}")
        
        try:
            with open(path, 'r') as f:
                data = json.load(f)
            
            session = SessionState.from_dict(data)
            self.current_session = session
            self.current_session_path = path
            
            logger.info(f"Loaded session from: {path}")
            return session
            
        except Exception as e:
            logger.error(f"Error loading session: {e}")
            raise
    
    def list_sessions(self) -> List[Dict[str, Any]]:
        """
        List all available sessions
        
        Returns:
            List of session info dictionaries
        """
        sessions = []
        
        for path in self.sessions_dir.glob("*.map2"):
            try:
                with open(path, 'r') as f:
                    data = json.load(f)
                
                metadata = data.get("metadata", {})
                sessions.append({
                    "name": metadata.get("name", "Unknown"),
                    "path": str(path),
                    "created_at": metadata.get("created_at"),
                    "modified_at": metadata.get("modified_at"),
                    "description": metadata.get("description", ""),
                    "author": metadata.get("author", ""),
                    "tags": metadata.get("tags", []),
                    "size_bytes": path.stat().st_size
                })
                
            except Exception as e:
                logger.error(f"Error reading session {path}: {e}")
        
        # Sort by modified time (newest first)
        sessions.sort(key=lambda s: s.get("modified_at", ""), reverse=True)
        
        return sessions
    
    def delete_session(self, path: Path, create_backup: bool = True) -> bool:
        """
        Delete a session file
        
        Args:
            path: Path to session file
            create_backup: Create backup before deleting
        
        Returns:
            True if deleted successfully
        """
        if not path.exists():
            return False
        
        try:
            if create_backup:
                self._create_backup(path)
            
            path.unlink()
            
            # Clear current session if it was deleted
            if path == self.current_session_path:
                self.current_session = None
                self.current_session_path = None
            
            logger.info(f"Deleted session: {path}")
            return True
            
        except Exception as e:
            logger.error(f"Error deleting session: {e}")
            return False
    
    def export_session(
        self,
        session: Optional[SessionState] = None,
        export_path: Optional[Path] = None
    ) -> Path:
        """
        Export session to specific location
        
        Args:
            session: Session to export (default: current session)
            export_path: Export path
        
        Returns:
            Path to exported file
        """
        if session is None:
            session = self.current_session
        
        if session is None:
            raise ValueError("No session to export")
        
        if export_path is None:
            filename = self._sanitize_filename(session.metadata.name) + ".map2"
            export_path = Path.cwd() / filename
        
        return self.save_session(session, export_path, create_backup=False)
    
    def import_session(self, import_path: Path) -> SessionState:
        """
        Import session from external file
        
        Args:
            import_path: Path to session file
        
        Returns:
            Imported session state
        """
        if not import_path.exists():
            raise FileNotFoundError(f"Import file not found: {import_path}")
        
        # Copy to sessions directory
        filename = import_path.name
        dest_path = self.sessions_dir / filename
        
        # Ensure unique filename
        counter = 1
        while dest_path.exists():
            stem = import_path.stem
            dest_path = self.sessions_dir / f"{stem}_{counter}.map2"
            counter += 1
        
        shutil.copy2(import_path, dest_path)
        logger.info(f"Imported session to: {dest_path}")
        
        return self.load_session(dest_path)
    
    def _create_backup(self, path: Path):
        """Create backup of session file"""
        if not path.exists():
            return
        
        backup_dir = self.sessions_dir / "backups"
        backup_dir.mkdir(exist_ok=True)
        
        timestamp = utc_now().strftime("%Y%m%d_%H%M%S")
        backup_name = f"{path.stem}_{timestamp}.map2"
        backup_path = backup_dir / backup_name
        
        shutil.copy2(path, backup_path)
        logger.info(f"Created backup: {backup_path}")
        
        # Keep only last 10 backups per session
        self._cleanup_old_backups(path.stem)
    
    def _cleanup_old_backups(self, session_stem: str, keep_count: int = 10):
        """Remove old backup files"""
        backup_dir = self.sessions_dir / "backups"
        if not backup_dir.exists():
            return
        
        backups = sorted(
            backup_dir.glob(f"{session_stem}_*.map2"),
            key=lambda p: p.stat().st_mtime,
            reverse=True
        )
        
        # Delete old backups
        for old_backup in backups[keep_count:]:
            try:
                old_backup.unlink()
                logger.debug(f"Removed old backup: {old_backup}")
            except Exception as e:
                logger.error(f"Error removing backup {old_backup}: {e}")
    
    def _sanitize_filename(self, name: str) -> str:
        """Sanitize name for use as filename"""
        # Replace invalid characters
        invalid_chars = '<>:"/\\|?*'
        for char in invalid_chars:
            name = name.replace(char, '_')
        
        # Limit length
        if len(name) > 200:
            name = name[:200]
        
        return name
    
    def get_current_session(self) -> Optional[SessionState]:
        """Get current session"""
        return self.current_session
    
    def search_sessions(
        self,
        query: str = "",
        tags: Optional[List[str]] = None,
        author: str = ""
    ) -> List[Dict[str, Any]]:
        """
        Search sessions by criteria
        
        Args:
            query: Name/description search query
            tags: Required tags
            author: Author filter
        
        Returns:
            List of matching sessions
        """
        all_sessions = self.list_sessions()
        results = []
        
        query_lower = query.lower()
        
        for session in all_sessions:
            # Name/description search
            if query:
                name_match = query_lower in session["name"].lower()
                desc_match = query_lower in session.get("description", "").lower()
                if not (name_match or desc_match):
                    continue
            
            # Tags filter
            if tags:
                session_tags = set(session.get("tags", []))
                required_tags = set(tags)
                if not required_tags.issubset(session_tags):
                    continue
            
            # Author filter
            if author and author.lower() not in session.get("author", "").lower():
                continue
            
            results.append(session)
        
        return results


# Global instance
session_manager = SessionManager()
