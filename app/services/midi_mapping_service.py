"""
MIDI Mapping Service with Database Persistence
Manages MIDI CC to parameter mappings with database storage.
"""

import logging
from typing import List, Dict, Any, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class MIDIMappingService:
    """Service for managing MIDI mappings with database persistence."""

    def __init__(self, session: Optional[AsyncSession] = None):
        """Initialize MIDI mapping service with optional database session."""
        self.session = session

    async def add_mapping(self, channel: int, cc: int, target_uri: str, param_index: int) -> Optional[Dict[str, Any]]:
        """Add MIDI CC to parameter mapping.
        
        Args:
            channel: MIDI channel 1-16
            cc: MIDI CC 0-127
            target_uri: Target plugin URI
            param_index: Parameter index
            
        Returns:
            Mapping dict or None on error
        """
        try:
            # Validate inputs
            if not (1 <= channel <= 16):
                logger.error(f"Invalid MIDI channel {channel}")
                return None
            if not (0 <= cc <= 127):
                logger.error(f"Invalid MIDI CC {cc}")
                return None
            if param_index < 0:
                logger.error(f"Invalid parameter index {param_index}")
                return None
            
            if not self.session:
                logger.warning("No database session available")
                return None
            
            from app.database import MIDIMapping
            
            # Check if mapping already exists
            existing = await self.session.execute(
                select(MIDIMapping).filter(
                    (MIDIMapping.channel == channel) &
                    (MIDIMapping.cc == cc)
                )
            )
            existing_mapping = existing.scalar_one_or_none()
            
            if existing_mapping:
                # Update existing mapping
                existing_mapping.target_plugin_uri = target_uri
                existing_mapping.target_param_index = param_index
                await self.session.flush()
                logger.info(f"Updated MIDI mapping: CH{channel} CC{cc} -> {target_uri}")
            else:
                # Create new mapping
                mapping = MIDIMapping(
                    channel=channel,
                    cc=cc,
                    target_plugin_uri=target_uri,
                    target_param_index=param_index
                )
                self.session.add(mapping)
                await self.session.flush()
                await self.session.refresh(mapping)
                logger.info(f"Created MIDI mapping: CH{channel} CC{cc} -> {target_uri}")
            
            return {
                "id": existing_mapping.id if existing_mapping else mapping.id,
                "channel": channel,
                "cc": cc,
                "target": target_uri,
                "param": param_index
            }
        except Exception as e:
            logger.error(f"Error adding MIDI mapping: {e}")
            return None

    async def get_mapping(self, mapping_id: int) -> Optional[Dict[str, Any]]:
        """Get mapping by ID.
        
        Args:
            mapping_id: Mapping ID
            
        Returns:
            Mapping dict or None
        """
        try:
            if not self.session:
                return None
            
            from app.database import MIDIMapping
            
            result = await self.session.execute(
                select(MIDIMapping).filter(MIDIMapping.id == mapping_id)
            )
            mapping = result.scalar_one_or_none()
            
            if not mapping:
                return None
            
            return {
                "id": mapping.id,
                "channel": mapping.channel,
                "cc": mapping.cc,
                "target": mapping.target_plugin_uri,
                "param": mapping.target_param_index,
                "min": mapping.min_val,
                "max": mapping.max_val
            }
        except Exception as e:
            logger.error(f"Error getting MIDI mapping {mapping_id}: {e}")
            return None

    async def list_mappings(self) -> List[Dict[str, Any]]:
        """List all MIDI mappings.
        
        Returns:
            List of mapping dicts
        """
        try:
            if not self.session:
                return []
            
            from app.database import MIDIMapping
            
            result = await self.session.execute(select(MIDIMapping))
            mappings = result.scalars().all()
            
            return [
                {
                    "id": m.id,
                    "channel": m.channel,
                    "cc": m.cc,
                    "target": m.target_plugin_uri,
                    "param": m.target_param_index,
                    "min": m.min_val,
                    "max": m.max_val
                }
                for m in mappings
            ]
        except Exception as e:
            logger.error(f"Error listing MIDI mappings: {e}")
            return []

    async def delete_mapping(self, mapping_id: int) -> bool:
        """Delete mapping by ID.
        
        Args:
            mapping_id: Mapping ID
            
        Returns:
            True if deleted, False otherwise
        """
        try:
            if not self.session:
                return False
            
            from app.database import MIDIMapping
            
            result = await self.session.execute(
                select(MIDIMapping).filter(MIDIMapping.id == mapping_id)
            )
            mapping = result.scalar_one_or_none()
            
            if not mapping:
                return False
            
            self.session.delete(mapping)
            await self.session.flush()
            
            logger.info(f"Deleted MIDI mapping {mapping_id}")
            return True
        except Exception as e:
            logger.error(f"Error deleting MIDI mapping {mapping_id}: {e}")
            return False

    async def get_mapping_by_cc(self, channel: int, cc: int) -> Optional[Dict[str, Any]]:
        """Get mapping by channel and CC.
        
        Args:
            channel: MIDI channel 1-16
            cc: MIDI CC 0-127
            
        Returns:
            Mapping dict or None
        """
        try:
            if not self.session:
                return None
            
            from app.database import MIDIMapping
            
            result = await self.session.execute(
                select(MIDIMapping).filter(
                    (MIDIMapping.channel == channel) &
                    (MIDIMapping.cc == cc)
                )
            )
            mapping = result.scalar_one_or_none()
            
            if not mapping:
                return None
            
            return {
                "id": mapping.id,
                "channel": mapping.channel,
                "cc": mapping.cc,
                "target": mapping.target_plugin_uri,
                "param": mapping.target_param_index,
                "min": mapping.min_val,
                "max": mapping.max_val
            }
        except Exception as e:
            logger.error(f"Error getting MIDI mapping for CH{channel} CC{cc}: {e}")
            return None
