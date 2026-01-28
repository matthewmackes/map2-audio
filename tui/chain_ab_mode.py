#!/usr/bin/env python3
"""
MAP2 Audio Platform - Terminal UI for Dual-Chain A/B Mode
Professional A/B comparison interface for terminal-based operations
"""

import asyncio
from typing import Optional, List, Dict, Callable
from dataclasses import dataclass
from enum import Enum

@dataclass
class ABModeState:
    """State for A/B mode operations"""
    enabled: bool = False
    chain_a_id: Optional[int] = None
    chain_b_id: Optional[int] = None
    blend_position: float = 0.5  # 0 = 100% A, 100 = 100% B
    linked: bool = False
    dsp_load_a: Optional[float] = None
    dsp_load_b: Optional[float] = None


class ABModeKeyHandler:
    """Handles keyboard input for A/B mode operations"""
    
    # Keyboard shortcuts
    SHORTCUTS = {
        ' ': 'toggle_ab_mode',      # Space: Toggle A/B mode on/off
        'a': 'select_chain_a',       # 'a': Select chain for position A
        'b': 'select_chain_b',       # 'b': Select chain for position B
        'x': 'swap_chains',          # 'x': Swap A and B
        'l': 'toggle_link',          # 'l': Link A/B pair
        'd': 'duplicate',            # 'd': Duplicate chain
        '<': 'blend_decrease',       # '<': Decrease blend (more A)
        '>': 'blend_increase',       # '>': Increase blend (more B)
        '[': 'blend_a_only',         # '[': 100% A
        ']': 'blend_b_only',         # ']': 100% B
        '=': 'blend_equal',          # '=': 50/50 blend
        'h': 'show_help',            # 'h': Show help
    }


class ChainABModeTUI:
    """Terminal User Interface for dual-chain A/B mode"""
    
    def __init__(self):
        self.state = ABModeState()
        self.chains: List[Dict] = []
        self.on_chain_a_selected: Optional[Callable[[int], None]] = None
        self.on_chain_b_selected: Optional[Callable[[int], None]] = None
        self.on_blend_changed: Optional[Callable[[float], None]] = None
        self.on_chains_swapped: Optional[Callable[[], None]] = None
        self.on_pair_linked: Optional[Callable[[], None]] = None
    
    def render(self) -> str:
        """Render A/B mode interface as string"""
        if not self.state.enabled:
            return self._render_disabled_state()
        return self._render_enabled_state()
    
    def _render_disabled_state(self) -> str:
        """Render when A/B mode is disabled"""
        lines = [
            "╔════════════════════════════════════════════════════════════╗",
            "║ A/B MODE: OFF                                     [SPACE]  ║",
            "║ Compare two signal chains side-by-side                    ║",
            "║                                                            ║",
            "║ Press SPACE to enable A/B mode, or 'h' for help           ║",
            "╚════════════════════════════════════════════════════════════╝",
        ]
        return "\n".join(lines)
    
    def _render_enabled_state(self) -> str:
        """Render when A/B mode is enabled"""
        lines = []
        
        # Header
        linked_indicator = " [LINKED]" if self.state.linked else ""
        lines.append("╔════════════════════════════════════════════════════════════╗")
        lines.append(f"║ A/B MODE: ON {linked_indicator:<36} [SPACE]  ║")
        lines.append("╠════════════════════════════════════════════════════════════╣")
        
        # Chain A section
        chain_a_name = self._get_chain_name(self.state.chain_a_id)
        chain_a_plugins = self._get_chain_plugin_count(self.state.chain_a_id)
        dsp_a_str = self._format_dsp_load(self.state.dsp_load_a)
        
        lines.append(f"║ CHAIN A: {chain_a_name:<20} {chain_a_plugins:>3} plugins  [a]  ║")
        lines.append(f"║ CPU: {dsp_a_str:<52} ║")
        
        lines.append("║                                                            ║")
        
        # Blend slider in the middle
        blend_visual = self._render_blend_slider()
        for line in blend_visual:
            lines.append(f"║ {line:<58} ║")
        
        lines.append("║                                                            ║")
        
        # Chain B section
        chain_b_name = self._get_chain_name(self.state.chain_b_id)
        chain_b_plugins = self._get_chain_plugin_count(self.state.chain_b_id)
        dsp_b_str = self._format_dsp_load(self.state.dsp_load_b)
        
        lines.append(f"║ CHAIN B: {chain_b_name:<20} {chain_b_plugins:>3} plugins  [b]  ║")
        lines.append(f"║ CPU: {dsp_b_str:<52} ║")
        
        # Footer with controls
        lines.append("╠════════════════════════════════════════════════════════════╣")
        lines.append("║ [x]=Swap  [<>=]=Blend  [l]=Link  [d]=Duplicate  [h]=Help   ║")
        lines.append("╚════════════════════════════════════════════════════════════╝")
        
        return "\n".join(lines)
    
    def _render_blend_slider(self) -> List[str]:
        """Render vertical blend slider"""
        bars = 20
        filled = int(self.state.blend_position * bars)
        
        blend_pct = int(self.state.blend_position * 100)
        
        lines = []
        lines.append(f"BLEND: {blend_pct:>3}% (A←→B)")
        
        # Visual bar
        bar = "█" * filled + "░" * (bars - filled)
        lines.append(f"  {bar}")
        
        # Blend value
        if blend_pct == 0:
            lines.append("  100% A")
        elif blend_pct == 100:
            lines.append("  100% B")
        else:
            a_pct = 100 - blend_pct
            lines.append(f"  {a_pct}% A / {blend_pct}% B")
        
        return lines
    
    def _render_help(self) -> str:
        """Render help screen"""
        help_text = """
╔════════════════════════════════════════════════════════════╗
║                    A/B MODE HELP                          ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║ SPACE      Toggle A/B Mode on/off                         ║
║ a          Select chain for position A                    ║
║ b          Select chain for position B                    ║
║ x          Swap chains (A ↔ B)                            ║
║ l          Link/unlink A/B as synchronized pair           ║
║ d          Duplicate chain to create quick A/B pair       ║
║                                                            ║
║ BLEND CONTROLS:                                           ║
║ <          Decrease blend (move toward 100% A)           ║
║ >          Increase blend (move toward 100% B)           ║
║ [          Set to 100% A (chain A only)                  ║
║ ]          Set to 100% B (chain B only)                  ║
║ =          Set to 50/50 blend                            ║
║                                                            ║
║ WORKFLOW TIPS:                                            ║
║ • Press [d] to quickly duplicate chain A as chain B       ║
║ • Use blend slider to compare tone or settings           ║
║ • Link chains to save A/B pair configuration              ║
║ • DSP load shown for each chain (watch for >80%)          ║
║                                                            ║
║ Press 'h' again or ESC to close help                      ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
        """
        return help_text.strip()
    
    def _get_chain_name(self, chain_id: Optional[int]) -> str:
        """Get display name for chain"""
        if not chain_id:
            return "[No chain selected]"
        chain = next((c for c in self.chains if c.get("id") == chain_id), None)
        return chain.get("name", "Unknown") if chain else "[Chain not found]"
    
    def _get_chain_plugin_count(self, chain_id: Optional[int]) -> int:
        """Get plugin count for chain"""
        if not chain_id:
            return 0
        chain = next((c for c in self.chains if c.get("id") == chain_id), None)
        return len(chain.get("plugins", [])) if chain else 0
    
    def _format_dsp_load(self, load: Optional[float]) -> str:
        """Format DSP load with color indicator"""
        if load is None:
            return "??%"
        
        # Determine indicator
        if load < 50:
            indicator = "✓"  # OK
        elif load < 80:
            indicator = "⚠"  # Warning
        else:
            indicator = "✗"  # Critical
        
        return f"{indicator} {load:.1f}%"
    
    def handle_input(self, key: str) -> Optional[str]:
        """Handle keyboard input, return action name"""
        if key == ' ':
            self.state.enabled = not self.state.enabled
            return "toggle_ab_mode"
        
        if not self.state.enabled:
            if key.lower() == 'h':
                return "show_help"
            return None
        
        # Handle A/B specific commands
        action_map = {
            'a': 'select_chain_a',
            'b': 'select_chain_b',
            'x': 'swap_chains',
            'l': 'toggle_link',
            'd': 'duplicate_chain',
            '<': 'blend_decrease',
            '>': 'blend_increase',
            '[': 'blend_a_only',
            ']': 'blend_b_only',
            '=': 'blend_equal',
            'h': 'show_help',
        }
        
        return action_map.get(key.lower())
    
    def set_chains(self, chains: List[Dict]):
        """Update available chains"""
        self.chains = chains
    
    def set_blend_position(self, position: float):
        """Set blend position (0-1)"""
        self.state.blend_position = max(0, min(1, position))
    
    def get_blend_position(self) -> float:
        """Get current blend position"""
        return self.state.blend_position
    
    def select_chain_a(self, chain_id: int):
        """Select chain for position A"""
        self.state.chain_a_id = chain_id
        if self.on_chain_a_selected:
            self.on_chain_a_selected(chain_id)
    
    def select_chain_b(self, chain_id: int):
        """Select chain for position B"""
        self.state.chain_b_id = chain_id
        if self.on_chain_b_selected:
            self.on_chain_b_selected(chain_id)
    
    def swap_chains(self):
        """Swap A and B chains"""
        self.state.chain_a_id, self.state.chain_b_id = self.state.chain_b_id, self.state.chain_a_id
        if self.on_chains_swapped:
            self.on_chains_swapped()
    
    def toggle_link(self):
        """Toggle link state for A/B pair"""
        self.state.linked = not self.state.linked
        if self.on_pair_linked:
            self.on_pair_linked()
    
    def adjust_blend(self, delta: float):
        """Adjust blend position by delta (-1 to 1)"""
        self.state.blend_position = max(0, min(1, self.state.blend_position + delta))
        if self.on_blend_changed:
            self.on_blend_changed(self.state.blend_position)
    
    def set_dsp_loads(self, load_a: Optional[float], load_b: Optional[float]):
        """Update DSP load estimates"""
        self.state.dsp_load_a = load_a
        self.state.dsp_load_b = load_b


# Singleton instance
_ab_mode_ui = ChainABModeTUI()


def get_ab_mode_tui() -> ChainABModeTUI:
    """Get singleton A/B mode TUI instance"""
    return _ab_mode_ui
