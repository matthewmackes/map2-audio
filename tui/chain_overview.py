"""
Chain Overview Menu
===================
Displays current chain name and effects with color coding.
"""

import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class EffectType(Enum):
    """Effect type categories with colors."""
    DISTORTION = ("🔴", "#FF4444")  # Red - Distortion effects
    MODULATION = ("🟠", "#FF9900")  # Orange - Modulation effects
    DELAY = ("🟡", "#FFDD00")       # Yellow - Delay effects
    REVERB = ("🔵", "#4488FF")      # Blue - Reverb/Space effects
    EQ = ("🟢", "#44DD44")          # Green - EQ effects
    COMPRESSION = ("🟣", "#DD44DD") # Purple - Compression effects
    UTILITY = ("⚪", "#CCCCCC")     # Gray - Utility effects
    UNKNOWN = ("⚫", "#666666")      # Black - Unknown effects


@dataclass
class ChainEffect:
    """A single effect in the chain."""
    name: str
    effect_type: EffectType
    position: int
    enabled: bool = True
    
    def get_display(self) -> str:
        """Get formatted display string for this effect."""
        status = "✓" if self.enabled else "✗"
        emoji, color = self.effect_type.value
        return f"{emoji} {self.name} {status}"


class ChainOverviewMenu:
    """Overview menu showing current chain and effects."""
    
    def __init__(self):
        """Initialize chain overview."""
        self._current_chain: Optional[str] = None
        self._effects: List[ChainEffect] = []
        self._color_map = self._build_color_map()
    
    def _build_color_map(self) -> Dict[str, tuple]:
        """Build color mapping for common effect types."""
        return {
            # Distortion
            "overdrive": EffectType.DISTORTION,
            "distortion": EffectType.DISTORTION,
            "fuzz": EffectType.DISTORTION,
            "tone": EffectType.DISTORTION,
            
            # Modulation
            "chorus": EffectType.MODULATION,
            "flanger": EffectType.MODULATION,
            "phaser": EffectType.MODULATION,
            "vibrato": EffectType.MODULATION,
            "tremolo": EffectType.MODULATION,
            
            # Delay
            "delay": EffectType.DELAY,
            "echo": EffectType.DELAY,
            
            # Reverb/Space
            "reverb": EffectType.REVERB,
            "spring": EffectType.REVERB,
            "hall": EffectType.REVERB,
            "plate": EffectType.REVERB,
            
            # EQ
            "eq": EffectType.EQ,
            "equalizer": EffectType.EQ,
            "bass": EffectType.EQ,
            "treble": EffectType.EQ,
            "mid": EffectType.EQ,
            
            # Compression
            "compressor": EffectType.COMPRESSION,
            "compression": EffectType.COMPRESSION,
            "gate": EffectType.COMPRESSION,
            "limiter": EffectType.COMPRESSION,
            
            # Utility
            "boost": EffectType.UTILITY,
            "level": EffectType.UTILITY,
            "volume": EffectType.UTILITY,
            "gain": EffectType.UTILITY,
            "tuner": EffectType.UTILITY,
        }
    
    def set_current_chain(self, chain_name: str) -> None:
        """
        Set the current chain name.
        
        Args:
            chain_name: Name of the current chain
        """
        self._current_chain = chain_name
        logger.debug(f"Set current chain: {chain_name}")
    
    def add_effect(self, effect_name: str, position: int, enabled: bool = True) -> None:
        """
        Add an effect to the current chain view.
        
        Args:
            effect_name: Name of the effect
            position: Position in chain (0-based)
            enabled: Whether effect is active
        """
        # Detect effect type
        effect_lower = effect_name.lower()
        effect_type = EffectType.UNKNOWN
        
        for keyword, etype in self._color_map.items():
            if keyword in effect_lower:
                effect_type = etype
                break
        
        effect = ChainEffect(
            name=effect_name,
            effect_type=effect_type,
            position=position,
            enabled=enabled
        )
        self._effects.append(effect)
    
    def clear_effects(self) -> None:
        """Clear all effects from the view."""
        self._effects = []
    
    def get_menu_display(self) -> str:
        """
        Get formatted menu display for terminal.
        
        Returns:
            Formatted string for display
        """
        lines = []
        
        # Title with current chain name centered and bold
        if self._current_chain:
            title = f"╔════════════════════════════════════════╗"
            lines.append(title)
            
            # Center the chain name
            chain_display = f"  ► {self._current_chain} ◄  "
            padding = (36 - len(self._current_chain) - 6) // 2
            centered = " " * padding + chain_display
            lines.append(f"║{centered:<36}║")
            
            lines.append(f"╚════════════════════════════════════════╝")
            lines.append("")
        
        # Effects display
        if self._effects:
            # Sort by position
            sorted_effects = sorted(self._effects, key=lambda e: e.position)
            
            # Create effect line
            effect_line = "  "
            for effect in sorted_effects:
                emoji, _ = effect.effect_type.value
                status = "●" if effect.enabled else "○"
                effect_line += f"{emoji} {effect.name} {status}  │  "
            
            # Remove trailing separator
            effect_line = effect_line.rstrip(" │ ")
            lines.append(effect_line)
            lines.append("")
            
            # Legend
            lines.append("  COLOR LEGEND:")
            for etype in EffectType:
                if etype != EffectType.UNKNOWN:
                    emoji, _ = etype.value
                    lines.append(f"    {emoji} {etype.name}")
            
            lines.append("")
        else:
            lines.append("  (No effects in chain)")
            lines.append("")
        
        return "\n".join(lines)
    
    def get_json_export(self) -> Dict[str, Any]:
        """
        Export chain overview as JSON.
        
        Returns:
            Dictionary with chain info
        """
        return {
            "chain_name": self._current_chain,
            "effects_count": len(self._effects),
            "effects": [
                {
                    "position": e.position,
                    "name": e.name,
                    "type": e.effect_type.name,
                    "enabled": e.enabled
                }
                for e in sorted(self._effects, key=lambda x: x.position)
            ]
        }
    
    def get_summary(self) -> Dict[str, Any]:
        """Get summary of current chain."""
        return {
            "chain_name": self._current_chain,
            "total_effects": len(self._effects),
            "enabled_effects": len([e for e in self._effects if e.enabled]),
            "disabled_effects": len([e for e in self._effects if not e.enabled]),
            "effect_types": {
                etype.name: len([e for e in self._effects if e.effect_type == etype])
                for etype in EffectType
            }
        }


# Global instance
chain_overview = ChainOverviewMenu()
