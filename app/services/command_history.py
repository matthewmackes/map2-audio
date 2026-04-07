"""
Command History - Persistent Undo/Redo system with power-failure resilience

Features:
- State snapshots persisted to SQLite database
- Survives application restart and power failure
- Configurable history depth
- Session-based grouping
- Efficient partial restore for targeted undo
"""

import logging
import json
import uuid
from typing import Dict, List, Optional, Any, Callable, Awaitable
from dataclasses import dataclass, field
from datetime import datetime
from abc import ABC, abstractmethod
import asyncio

from app.utils.time import utc_now

logger = logging.getLogger(__name__)


@dataclass
class CommandContext:
    """Context for command execution with state capture."""
    command_type: str
    description: str
    affected_chain_ids: List[int] = field(default_factory=list)
    affected_plugin_uris: List[str] = field(default_factory=list)


class PersistentCommandHistory:
    """
    Persistent command history manager with database-backed undo/redo.

    All state changes are persisted to SQLite with WAL mode for power-failure
    resilience. Commands can be recovered after restart.

    Usage:
        history = PersistentCommandHistory()
        await history.initialize()

        # Execute with state tracking
        async with history.track_change("Add plugin", ["chain:1"], ["plugin:uri"]) as ctx:
            # Perform the operation
            await chain_service.add_plugin(chain_id, plugin_uri)
    """

    def __init__(self, max_history: int = 100):
        """
        Initialize command history.

        Args:
            max_history: Maximum number of commands to keep per session
        """
        self.max_history = max_history
        self.session_id = str(uuid.uuid4())
        self._sequence = 0
        self._lock = asyncio.Lock()
        self._state_capture_funcs: List[Callable[[], Awaitable[Dict[str, Any]]]] = []

    async def initialize(self) -> None:
        """Initialize and restore state from database on startup."""
        from app.database import get_session, CommandHistory as CommandHistoryModel
        from sqlalchemy import select, func

        async with get_session() as session:
            # Get the highest sequence number from previous session
            result = await session.execute(
                select(func.max(CommandHistoryModel.sequence))
            )
            max_seq = result.scalar()
            self._sequence = (max_seq or 0)

        logger.info(f"Persistent command history initialized (session: {self.session_id[:8]})")

    def register_state_capture(self, func: Callable[[], Awaitable[Dict[str, Any]]]) -> None:
        """
        Register a function that captures current application state.

        Args:
            func: Async function that returns state dict
        """
        self._state_capture_funcs.append(func)

    async def _capture_state(self) -> Dict[str, Any]:
        """Capture current application state from all registered sources."""
        state = {}
        for func in self._state_capture_funcs:
            try:
                partial_state = await func()
                state.update(partial_state)
            except Exception as e:
                logger.warning(f"State capture failed: {e}")
        return state

    async def record_change(
        self,
        command_type: str,
        description: str,
        state_before: Dict[str, Any],
        state_after: Dict[str, Any],
        affected_chain_ids: Optional[List[int]] = None,
        affected_plugin_uris: Optional[List[str]] = None,
    ) -> int:
        """
        Record a state change to the database.

        Args:
            command_type: Type identifier (e.g., "chain_create", "plugin_add")
            description: Human-readable description
            state_before: State snapshot before the change
            state_after: State snapshot after the change
            affected_chain_ids: Chain IDs affected by this change
            affected_plugin_uris: Plugin URIs affected by this change

        Returns:
            Command ID in database
        """
        from app.database import get_session, CommandHistory as CommandHistoryModel

        async with self._lock:
            self._sequence += 1
            sequence = self._sequence

        async with get_session() as session:
            command = CommandHistoryModel(
                session_id=self.session_id,
                sequence=sequence,
                command_type=command_type,
                description=description,
                state_before=json.dumps(state_before),
                state_after=json.dumps(state_after),
                affected_chain_ids=affected_chain_ids or [],
                affected_plugin_uris=affected_plugin_uris or [],
                is_undone=False,
                executed_at=utc_now(),
            )
            session.add(command)
            await session.flush()
            command_id = command.id

            # Prune old history if exceeding max
            await self._prune_history(session)

            logger.debug(f"Recorded command: {description} (id={command_id})")
            return command_id

    async def _prune_history(self, session) -> None:
        """Remove old commands exceeding max_history limit."""
        from app.database import CommandHistory as CommandHistoryModel
        from sqlalchemy import select, delete

        # Count commands in current session
        result = await session.execute(
            select(CommandHistoryModel.id)
            .where(CommandHistoryModel.session_id == self.session_id)
            .order_by(CommandHistoryModel.sequence.desc())
            .offset(self.max_history)
        )
        old_ids = [row[0] for row in result.fetchall()]

        if old_ids:
            await session.execute(
                delete(CommandHistoryModel).where(CommandHistoryModel.id.in_(old_ids))
            )
            logger.debug(f"Pruned {len(old_ids)} old commands")

    async def undo(self) -> Optional[Dict[str, Any]]:
        """
        Undo the last command by returning the state_before snapshot.

        Returns:
            State to restore, or None if nothing to undo
        """
        from app.database import get_session, CommandHistory as CommandHistoryModel
        from sqlalchemy import select

        async with get_session() as session:
            # Find the last non-undone command
            result = await session.execute(
                select(CommandHistoryModel)
                .where(CommandHistoryModel.is_undone == False)
                .order_by(CommandHistoryModel.sequence.desc())
                .limit(1)
            )
            command = result.scalar_one_or_none()

            if not command:
                logger.info("Nothing to undo")
                return None

            # Mark as undone
            command.is_undone = True
            command.undone_at = utc_now()

            state_before = json.loads(command.state_before)
            logger.info(f"Undo: {command.description}")

            return {
                "state": state_before,
                "description": command.description,
                "command_type": command.command_type,
                "affected_chain_ids": command.affected_chain_ids,
                "affected_plugin_uris": command.affected_plugin_uris,
            }

    async def redo(self) -> Optional[Dict[str, Any]]:
        """
        Redo the last undone command by returning the state_after snapshot.

        Returns:
            State to restore, or None if nothing to redo
        """
        from app.database import get_session, CommandHistory as CommandHistoryModel
        from sqlalchemy import select

        async with get_session() as session:
            # Find the last undone command (lowest sequence among undone)
            result = await session.execute(
                select(CommandHistoryModel)
                .where(CommandHistoryModel.is_undone == True)
                .order_by(CommandHistoryModel.sequence.asc())
                .limit(1)
            )
            command = result.scalar_one_or_none()

            if not command:
                logger.info("Nothing to redo")
                return None

            # Mark as not undone
            command.is_undone = False
            command.undone_at = None

            state_after = json.loads(command.state_after)
            logger.info(f"Redo: {command.description}")

            return {
                "state": state_after,
                "description": command.description,
                "command_type": command.command_type,
                "affected_chain_ids": command.affected_chain_ids,
                "affected_plugin_uris": command.affected_plugin_uris,
            }

    async def can_undo(self) -> bool:
        """Check if undo is available."""
        from app.database import get_session, CommandHistory as CommandHistoryModel
        from sqlalchemy import select, func

        async with get_session() as session:
            result = await session.execute(
                select(func.count(CommandHistoryModel.id))
                .where(CommandHistoryModel.is_undone == False)
            )
            return result.scalar() > 0

    async def can_redo(self) -> bool:
        """Check if redo is available."""
        from app.database import get_session, CommandHistory as CommandHistoryModel
        from sqlalchemy import select, func

        async with get_session() as session:
            result = await session.execute(
                select(func.count(CommandHistoryModel.id))
                .where(CommandHistoryModel.is_undone == True)
            )
            return result.scalar() > 0

    async def get_undo_description(self) -> Optional[str]:
        """Get description of next undo operation."""
        from app.database import get_session, CommandHistory as CommandHistoryModel
        from sqlalchemy import select

        async with get_session() as session:
            result = await session.execute(
                select(CommandHistoryModel.description)
                .where(CommandHistoryModel.is_undone == False)
                .order_by(CommandHistoryModel.sequence.desc())
                .limit(1)
            )
            row = result.first()
            return row[0] if row else None

    async def get_redo_description(self) -> Optional[str]:
        """Get description of next redo operation."""
        from app.database import get_session, CommandHistory as CommandHistoryModel
        from sqlalchemy import select

        async with get_session() as session:
            result = await session.execute(
                select(CommandHistoryModel.description)
                .where(CommandHistoryModel.is_undone == True)
                .order_by(CommandHistoryModel.sequence.asc())
                .limit(1)
            )
            row = result.first()
            return row[0] if row else None

    async def get_history(self, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Get command history.

        Args:
            limit: Maximum number of entries to return

        Returns:
            List of command dictionaries (most recent first)
        """
        from app.database import get_session, CommandHistory as CommandHistoryModel
        from sqlalchemy import select

        async with get_session() as session:
            result = await session.execute(
                select(CommandHistoryModel)
                .order_by(CommandHistoryModel.sequence.desc())
                .limit(limit)
            )
            commands = result.scalars().all()

            return [
                {
                    "id": cmd.id,
                    "type": cmd.command_type,
                    "description": cmd.description,
                    "is_undone": cmd.is_undone,
                    "executed_at": cmd.executed_at.isoformat(),
                    "undone_at": cmd.undone_at.isoformat() if cmd.undone_at else None,
                    "affected_chains": cmd.affected_chain_ids,
                    "affected_plugins": cmd.affected_plugin_uris,
                }
                for cmd in commands
            ]

    async def clear(self) -> int:
        """
        Clear all history for current session.

        Returns:
            Number of commands cleared
        """
        from app.database import get_session, CommandHistory as CommandHistoryModel
        from sqlalchemy import delete, select, func

        async with get_session() as session:
            # Count first
            result = await session.execute(
                select(func.count(CommandHistoryModel.id))
                .where(CommandHistoryModel.session_id == self.session_id)
            )
            count = result.scalar()

            # Delete
            await session.execute(
                delete(CommandHistoryModel)
                .where(CommandHistoryModel.session_id == self.session_id)
            )

            self._sequence = 0
            logger.info(f"Cleared {count} commands from history")
            return count

    async def get_status(self) -> Dict[str, Any]:
        """Get current undo/redo status."""
        return {
            "can_undo": await self.can_undo(),
            "can_redo": await self.can_redo(),
            "next_undo": await self.get_undo_description(),
            "next_redo": await self.get_redo_description(),
            "session_id": self.session_id,
            "max_history": self.max_history,
        }


class StateChangeTracker:
    """
    Context manager for tracking state changes with automatic undo support.

    Usage:
        async with StateChangeTracker(history, "Add plugin", chain_id=1) as tracker:
            await chain_service.add_plugin(chain_id, plugin_uri)
            tracker.add_affected_plugin(plugin_uri)
    """

    def __init__(
        self,
        history: PersistentCommandHistory,
        command_type: str,
        description: str,
        state_capture_func: Callable[[], Awaitable[Dict[str, Any]]],
    ):
        self.history = history
        self.command_type = command_type
        self.description = description
        self.state_capture_func = state_capture_func
        self.affected_chain_ids: List[int] = []
        self.affected_plugin_uris: List[str] = []
        self.state_before: Dict[str, Any] = {}

    def add_affected_chain(self, chain_id: int) -> None:
        """Add a chain ID to the affected list."""
        if chain_id not in self.affected_chain_ids:
            self.affected_chain_ids.append(chain_id)

    def add_affected_plugin(self, plugin_uri: str) -> None:
        """Add a plugin URI to the affected list."""
        if plugin_uri not in self.affected_plugin_uris:
            self.affected_plugin_uris.append(plugin_uri)

    async def __aenter__(self) -> "StateChangeTracker":
        """Capture state before the change."""
        self.state_before = await self.state_capture_func()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> bool:
        """Capture state after the change and record to history."""
        if exc_type is None:
            # Success - record the change
            state_after = await self.state_capture_func()
            await self.history.record_change(
                command_type=self.command_type,
                description=self.description,
                state_before=self.state_before,
                state_after=state_after,
                affected_chain_ids=self.affected_chain_ids,
                affected_plugin_uris=self.affected_plugin_uris,
            )
        else:
            # Error - don't record, let exception propagate
            logger.warning(f"State change failed: {exc_val}")
        return False  # Don't suppress exceptions


# =============================================================================
# Session Backup Manager
# =============================================================================

class SessionBackupManager:
    """
    Automatic session backup with versioning.

    Creates periodic backups of the entire session state for disaster recovery.
    """

    def __init__(
        self,
        auto_backup_interval_seconds: int = 300,  # 5 minutes
        max_backups_per_session: int = 20,
    ):
        self.auto_backup_interval = auto_backup_interval_seconds
        self.max_backups = max_backups_per_session
        self._backup_task: Optional[asyncio.Task] = None
        self._state_capture_funcs: List[Callable[[], Awaitable[Dict[str, Any]]]] = []
        self.session_name = "default"

    def register_state_capture(self, name: str, func: Callable[[], Awaitable[Dict[str, Any]]]) -> None:
        """Register a state capture function."""
        self._state_capture_funcs.append((name, func))

    async def start_auto_backup(self) -> None:
        """Start automatic backup task."""
        if self._backup_task is None:
            self._backup_task = asyncio.create_task(self._auto_backup_loop())
            logger.info(f"Auto-backup started (interval: {self.auto_backup_interval}s)")

    async def stop_auto_backup(self) -> None:
        """Stop automatic backup task."""
        if self._backup_task:
            self._backup_task.cancel()
            try:
                await self._backup_task
            except asyncio.CancelledError:
                pass
            self._backup_task = None
            logger.info("Auto-backup stopped")

    async def _auto_backup_loop(self) -> None:
        """Background loop for automatic backups."""
        while True:
            await asyncio.sleep(self.auto_backup_interval)
            try:
                await self.create_backup("auto", "Periodic auto-backup")
            except Exception as e:
                logger.error(f"Auto-backup failed: {e}")

    async def create_backup(
        self,
        backup_type: str = "manual",
        trigger_reason: Optional[str] = None,
    ) -> int:
        """
        Create a session backup.

        Args:
            backup_type: "auto", "manual", or "pre_change"
            trigger_reason: Why this backup was created

        Returns:
            Backup ID
        """
        from app.database import get_session, SessionBackup
        from sqlalchemy import select, func

        # Capture all state
        chains_snapshot = {}
        presets_snapshot = {}
        midi_snapshot = {}
        automation_snapshot = {}

        for name, func in self._state_capture_funcs:
            try:
                state = await func()
                if name == "chains":
                    chains_snapshot = state
                elif name == "presets":
                    presets_snapshot = state
                elif name == "midi":
                    midi_snapshot = state
                elif name == "automation":
                    automation_snapshot = state
            except Exception as e:
                logger.warning(f"Failed to capture {name} state: {e}")

        async with get_session() as session:
            # Get next version number
            result = await session.execute(
                select(func.max(SessionBackup.version))
                .where(SessionBackup.session_name == self.session_name)
            )
            max_version = result.scalar() or 0

            # Calculate approximate size
            chains_json = json.dumps(chains_snapshot)
            presets_json = json.dumps(presets_snapshot)
            midi_json = json.dumps(midi_snapshot)
            automation_json = json.dumps(automation_snapshot)
            total_size = len(chains_json) + len(presets_json) + len(midi_json) + len(automation_json)

            backup = SessionBackup(
                session_name=self.session_name,
                version=max_version + 1,
                chains_snapshot=chains_json,
                presets_snapshot=presets_json,
                midi_mappings_snapshot=midi_json,
                automation_snapshot=automation_json,
                backup_type=backup_type,
                trigger_reason=trigger_reason,
                file_size_bytes=total_size,
            )
            session.add(backup)
            await session.flush()
            backup_id = backup.id

            # Prune old backups
            await self._prune_backups(session)

            logger.info(f"Created backup v{max_version + 1} ({total_size} bytes)")
            return backup_id

    async def _prune_backups(self, session) -> None:
        """Remove old backups exceeding limit."""
        from app.database import SessionBackup
        from sqlalchemy import select, delete

        result = await session.execute(
            select(SessionBackup.id)
            .where(SessionBackup.session_name == self.session_name)
            .order_by(SessionBackup.version.desc())
            .offset(self.max_backups)
        )
        old_ids = [row[0] for row in result.fetchall()]

        if old_ids:
            await session.execute(
                delete(SessionBackup).where(SessionBackup.id.in_(old_ids))
            )
            logger.debug(f"Pruned {len(old_ids)} old backups")

    async def list_backups(self, limit: int = 10) -> List[Dict[str, Any]]:
        """List available backups."""
        from app.database import get_session, SessionBackup
        from sqlalchemy import select

        async with get_session() as session:
            result = await session.execute(
                select(SessionBackup)
                .where(SessionBackup.session_name == self.session_name)
                .order_by(SessionBackup.version.desc())
                .limit(limit)
            )
            backups = result.scalars().all()

            return [
                {
                    "id": b.id,
                    "version": b.version,
                    "backup_type": b.backup_type,
                    "trigger_reason": b.trigger_reason,
                    "size_bytes": b.file_size_bytes,
                    "created_at": b.created_at.isoformat(),
                }
                for b in backups
            ]

    async def restore_backup(self, backup_id: int) -> Optional[Dict[str, Any]]:
        """
        Restore a backup by ID.

        Returns:
            Backup state data, or None if not found
        """
        from app.database import get_session, SessionBackup
        from sqlalchemy import select

        async with get_session() as session:
            result = await session.execute(
                select(SessionBackup).where(SessionBackup.id == backup_id)
            )
            backup = result.scalar_one_or_none()

            if not backup:
                return None

            return {
                "chains": json.loads(backup.chains_snapshot),
                "presets": json.loads(backup.presets_snapshot),
                "midi_mappings": json.loads(backup.midi_mappings_snapshot),
                "automation": json.loads(backup.automation_snapshot),
                "version": backup.version,
                "created_at": backup.created_at.isoformat(),
            }


# Global instances
command_history = PersistentCommandHistory(max_history=100)
backup_manager = SessionBackupManager()
