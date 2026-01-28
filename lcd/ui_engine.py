"""
LCD UI Engine - Multi-Page Display System
Inspired by professional audio gear: Kemper Profiler, Line 6 Helix, Fractal Axe-FX

Features:
- Multiple page types (status, VU meters, plugins, chains, settings)
- Smooth transitions and animations
- Real-time updates with minimal flicker
- Custom character support (VU bars, icons)
- Contextual information display
"""

import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Dict, List, Callable
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class PageType(Enum):
    """Available LCD page types."""
    STATUS = "status"           # System status overview
    VU_METERS = "vu"           # Audio level meters
    CHAIN = "chain"            # Active signal chain
    PLUGINS = "plugins"        # Plugin list
    MIDI = "midi"              # MIDI activity
    SETTINGS = "settings"      # System settings
    PERF = "performance"       # Performance metrics
    MENU = "menu"              # Navigation menu


# Custom Characters for 5x8 LCD (HD44780)
CUSTOM_CHARS = {
    # VU Meter bars (0-7 for different heights)
    'vu_0': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1F],  # Empty
    'vu_1': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1F, 0x1F],  # 1/8
    'vu_2': [0x00, 0x00, 0x00, 0x00, 0x00, 0x1F, 0x1F, 0x1F],  # 2/8
    'vu_3': [0x00, 0x00, 0x00, 0x00, 0x1F, 0x1F, 0x1F, 0x1F],  # 3/8
    'vu_4': [0x00, 0x00, 0x00, 0x1F, 0x1F, 0x1F, 0x1F, 0x1F],  # 4/8
    'vu_5': [0x00, 0x00, 0x1F, 0x1F, 0x1F, 0x1F, 0x1F, 0x1F],  # 5/8
    'vu_6': [0x00, 0x1F, 0x1F, 0x1F, 0x1F, 0x1F, 0x1F, 0x1F],  # 6/8
    'vu_7': [0x1F, 0x1F, 0x1F, 0x1F, 0x1F, 0x1F, 0x1F, 0x1F],  # 7/8 (full)
    
    # Icons
    'note': [0x02, 0x03, 0x02, 0x02, 0x0E, 0x1E, 0x0C, 0x00],   # Music note
    'speaker': [0x01, 0x03, 0x0F, 0x0F, 0x0F, 0x03, 0x01, 0x00], # Speaker
    'cpu': [0x1F, 0x11, 0x15, 0x11, 0x15, 0x11, 0x1F, 0x00],   # CPU
    'chain': [0x00, 0x0E, 0x1B, 0x1B, 0x1B, 0x0E, 0x00, 0x00],  # Chain link
    'arrow_right': [0x00, 0x08, 0x0C, 0x0E, 0x0C, 0x08, 0x00, 0x00],
    'arrow_left': [0x00, 0x02, 0x06, 0x0E, 0x06, 0x02, 0x00, 0x00],
    'arrow_up': [0x00, 0x04, 0x0E, 0x15, 0x04, 0x04, 0x00, 0x00],
    'arrow_down': [0x00, 0x04, 0x04, 0x15, 0x0E, 0x04, 0x00, 0x00],
}


@dataclass
class DisplayConfig:
    """LCD display configuration."""
    width: int = 20
    height: int = 2
    refresh_rate: float = 10.0  # Hz
    smooth_transitions: bool = True
    auto_brightness: bool = True
    screensaver_timeout: float = 300.0  # 5 minutes
    

class LCDPage(ABC):
    """Abstract base class for LCD pages."""
    
    def __init__(self, config: DisplayConfig):
        self.config = config
        self.last_update = 0.0
        self.visible = False
        
    @abstractmethod
    def render(self, data: Dict) -> List[str]:
        """Render page content as list of lines.
        
        Args:
            data: Dictionary of data to display
            
        Returns:
            List of strings, one per LCD line
        """
        pass
    
    def should_update(self) -> bool:
        """Check if page needs update based on refresh rate."""
        now = time.time()
        interval = 1.0 / self.config.refresh_rate
        if now - self.last_update >= interval:
            self.last_update = now
            return True
        return False
    
    def on_show(self):
        """Called when page becomes visible."""
        self.visible = True
        
    def on_hide(self):
        """Called when page becomes hidden."""
        self.visible = False


class StatusPage(LCDPage):
    """System status overview page."""
    
    def render(self, data: Dict) -> List[str]:
        sample_rate = data.get('sample_rate', 48000)
        buffer_size = data.get('buffer_size', 256)
        cpu_load = data.get('cpu_load', 0.0)
        active_chain = data.get('active_chain', 'None')
        xruns = data.get('xruns', 0)
        
        line1 = f"MAP2 Audio Platform"
        line2 = f"SR:{sample_rate/1000:.0f}k Buf:{buffer_size}"
        line3 = f"CPU:{cpu_load:3.0f}% XR:{xruns}"
        line4 = f"Chain:{active_chain[:14]}"
        
        # Pad to proper width
        lines = [line1, line2, line3, line4]
        return [line.ljust(self.config.width)[:self.config.width] for line in lines]


class VUMeterPage(LCDPage):
    """Audio level meters with peak hold."""
    
    def __init__(self, config: DisplayConfig):
        super().__init__(config)
        self.peak_l = 0.0
        self.peak_r = 0.0
        self.peak_hold_time = 1.0  # seconds
        self.peak_l_time = 0.0
        self.peak_r_time = 0.0
    
    def render(self, data: Dict) -> List[str]:
        level_l = data.get('input_level_l', 0.0)
        level_r = data.get('input_level_r', 0.0)
        
        now = time.time()
        
        # Update peaks
        if level_l > self.peak_l:
            self.peak_l = level_l
            self.peak_l_time = now
        elif now - self.peak_l_time > self.peak_hold_time:
            self.peak_l = level_l
            
        if level_r > self.peak_r:
            self.peak_r = level_r
            self.peak_r_time = now
        elif now - self.peak_r_time > self.peak_hold_time:
            self.peak_r = level_r
        
        # Create VU bars (use ASCII for simulation)
        bar_width = self.config.width - 3  # "L: " prefix
        bar_l = self._create_bar(level_l, self.peak_l, bar_width)
        bar_r = self._create_bar(level_r, self.peak_r, bar_width)
        
        line1 = f"L:{bar_l}"
        line2 = f"R:{bar_r}"
        
        return [line1, line2]
    
    def _create_bar(self, level: float, peak: float, width: int) -> str:
        """Create VU meter bar with peak indicator.
        
        Level is 0.0 to 1.0, with colors:
        - Green: 0-0.7 (safe)
        - Yellow: 0.7-0.9 (caution)
        - Red: 0.9-1.0 (danger)
        """
        filled = int(level * width)
        peak_pos = int(peak * width)
        
        bar = ""
        for i in range(width):
            if i == peak_pos:
                bar += "▸"  # Peak indicator
            elif i < filled:
                if level > 0.9:
                    bar += "█"  # Red zone (clipping risk)
                elif level > 0.7:
                    bar += "▓"  # Yellow zone
                else:
                    bar += "░"  # Green zone
            else:
                bar += " "
        
        return bar


class ChainPage(LCDPage):
    """Active signal chain display."""
    
    def __init__(self, config: DisplayConfig):
        super().__init__(config)
        self.scroll_offset = 0
        self.scroll_delay = 0.5  # seconds per scroll
        self.last_scroll = 0.0
        
    def render(self, data: Dict) -> List[str]:
        chain_name = data.get('chain_name', 'No Chain')
        plugins = data.get('plugins', [])
        plugin_count = len(plugins)
        
        # Line 1: Chain name
        line1 = f"♪ {chain_name}"[:self.config.width]
        
        # Line 2: Plugin list (scrolling if too long)
        if plugins:
            plugin_names = " → ".join([p.get('name', 'Unknown')[:8] for p in plugins])
            line2 = self._scroll_text(plugin_names, self.config.width)
        else:
            line2 = "No plugins loaded"
        
        return [
            line1.ljust(self.config.width),
            line2.ljust(self.config.width)
        ]
    
    def _scroll_text(self, text: str, width: int) -> str:
        """Scroll long text horizontally."""
        if len(text) <= width:
            return text
        
        now = time.time()
        if now - self.last_scroll > self.scroll_delay:
            self.scroll_offset = (self.scroll_offset + 1) % (len(text) - width + 1)
            self.last_scroll = now
        
        return text[self.scroll_offset:self.scroll_offset + width]


class PluginListPage(LCDPage):
    """Scrollable plugin list."""
    
    def __init__(self, config: DisplayConfig):
        super().__init__(config)
        self.selected_index = 0
        
    def render(self, data: Dict) -> List[str]:
        plugins = data.get('plugins', [])
        
        if not plugins:
            return [
                "No plugins loaded".ljust(self.config.width),
                "".ljust(self.config.width)
            ]
        
        # Show 2 plugins (current + next)
        lines = []
        for i in range(self.config.height):
            idx = self.selected_index + i
            if idx < len(plugins):
                plugin = plugins[idx]
                name = plugin.get('name', 'Unknown')[:15]
                bypass = plugin.get('bypassed', False)
                prefix = "►" if i == 0 else " "
                status = "BYP" if bypass else "ON"
                line = f"{prefix}{name:<15} {status}"
                lines.append(line.ljust(self.config.width))
            else:
                lines.append("".ljust(self.config.width))
        
        return lines
    
    def scroll_up(self):
        """Move selection up."""
        if self.selected_index > 0:
            self.selected_index -= 1
    
    def scroll_down(self, total_plugins: int):
        """Move selection down."""
        if self.selected_index < total_plugins - 1:
            self.selected_index += 1


class MIDIActivityPage(LCDPage):
    """MIDI activity monitor."""
    
    def __init__(self, config: DisplayConfig):
        super().__init__(config)
        self.last_messages = []
        self.activity_indicator = 0
        
    def render(self, data: Dict) -> List[str]:
        midi_in = data.get('midi_device_in', 'None')
        midi_out = data.get('midi_device_out', 'None')
        last_cc = data.get('last_cc', None)
        midi_active = data.get('midi_active', False)
        
        # Animate activity indicator
        if midi_active:
            self.activity_indicator = (self.activity_indicator + 1) % 4
            indicator = ['|', '/', '-', '\\'][self.activity_indicator]
        else:
            indicator = ' '
        
        line1 = f"MIDI {indicator} In:{midi_in[:11]}"
        
        if last_cc:
            cc_num = last_cc.get('cc', 0)
            cc_val = last_cc.get('value', 0)
            line2 = f"CC{cc_num:3d}={cc_val:3d} Out:{midi_out[:6]}"
        else:
            line2 = f"No activity"
        
        return [
            line1.ljust(self.config.width),
            line2.ljust(self.config.width)
        ]


class PerformancePage(LCDPage):
    """Performance metrics display."""
    
    def render(self, data: Dict) -> List[str]:
        cpu_load = data.get('cpu_load', 0.0)
        xruns = data.get('xruns', 0)
        callback_time = data.get('callback_us', 0)
        deadline = data.get('deadline_us', 5333)
        
        # Calculate callback utilization
        util_pct = (callback_time / deadline * 100) if deadline > 0 else 0
        
        line1 = f"CPU:{cpu_load:5.1f}% XR:{xruns:4d}"
        line2 = f"CB:{callback_time:4.0f}us {util_pct:4.1f}%"
        
        return [
            line1.ljust(self.config.width),
            line2.ljust(self.config.width)
        ]


class MenuPage(LCDPage):
    """Navigation menu."""
    
    def __init__(self, config: DisplayConfig):
        super().__init__(config)
        self.menu_items = [
            ('Status', PageType.STATUS),
            ('VU Meters', PageType.VU_METERS),
            ('Chain', PageType.CHAIN),
            ('Plugins', PageType.PLUGINS),
            ('MIDI', PageType.MIDI),
            ('Performance', PageType.PERF),
            ('Settings', PageType.SETTINGS),
        ]
        self.selected_index = 0
        
    def render(self, data: Dict) -> List[str]:
        lines = []
        for i in range(self.config.height):
            idx = self.selected_index + i
            if idx < len(self.menu_items):
                name, _ = self.menu_items[idx]
                prefix = "►" if i == 0 else " "
                line = f"{prefix} {name}"
                lines.append(line.ljust(self.config.width))
            else:
                lines.append("".ljust(self.config.width))
        
        return lines
    
    def get_selected_page_type(self) -> PageType:
        """Get currently selected page type."""
        if 0 <= self.selected_index < len(self.menu_items):
            return self.menu_items[self.selected_index][1]
        return PageType.STATUS


class LCDUIEngine:
    """Main LCD UI engine managing pages and transitions."""

    def __init__(self, config: Optional[DisplayConfig] = None):
        self.config = config or DisplayConfig()
        self.pages: Dict[PageType, LCDPage] = {}
        self.current_page: Optional[LCDPage] = None
        self.current_page_type = PageType.STATUS
        self.screensaver_active = False
        self.last_interaction = time.time()
        self._current_data: Dict = {}  # Cache current data for scroll operations

        # Initialize all pages
        self._init_pages()

        # Set initial page
        self.set_page(PageType.STATUS)
        
    def _init_pages(self):
        """Initialize all page types."""
        self.pages[PageType.STATUS] = StatusPage(self.config)
        self.pages[PageType.VU_METERS] = VUMeterPage(self.config)
        self.pages[PageType.CHAIN] = ChainPage(self.config)
        self.pages[PageType.PLUGINS] = PluginListPage(self.config)
        self.pages[PageType.MIDI] = MIDIActivityPage(self.config)
        self.pages[PageType.PERF] = PerformancePage(self.config)
        self.pages[PageType.MENU] = MenuPage(self.config)
    
    def set_page(self, page_type: PageType):
        """Switch to a different page."""
        if self.current_page:
            self.current_page.on_hide()
        
        self.current_page_type = page_type
        self.current_page = self.pages.get(page_type)
        
        if self.current_page:
            self.current_page.on_show()
            
        self.last_interaction = time.time()
        self.screensaver_active = False
        
        logger.info(f"Switched to page: {page_type.value}")
    
    def next_page(self):
        """Navigate to next page."""
        page_types = list(PageType)
        current_idx = page_types.index(self.current_page_type)
        next_idx = (current_idx + 1) % len(page_types)
        self.set_page(page_types[next_idx])
    
    def prev_page(self):
        """Navigate to previous page."""
        page_types = list(PageType)
        current_idx = page_types.index(self.current_page_type)
        prev_idx = (current_idx - 1) % len(page_types)
        self.set_page(page_types[prev_idx])
    
    def update(self, data: Dict) -> Optional[List[str]]:
        """Update current page with new data.

        Args:
            data: Dictionary of data to display

        Returns:
            List of lines to display, or None if no update needed
        """
        # Cache current data for scroll operations
        self._current_data = data

        # Check screensaver
        if self.config.screensaver_timeout > 0:
            idle_time = time.time() - self.last_interaction
            if idle_time > self.config.screensaver_timeout:
                if not self.screensaver_active:
                    self.screensaver_active = True
                    logger.info("Screensaver activated")
                return [" " * self.config.width] * self.config.height

        # Update current page
        if self.current_page and self.current_page.should_update():
            return self.current_page.render(data)

        return None
    
    def on_button_press(self, button: str):
        """Handle button press event."""
        self.last_interaction = time.time()
        self.screensaver_active = False
        
        if button == 'next':
            self.next_page()
        elif button == 'prev':
            self.prev_page()
        elif button == 'select':
            if self.current_page_type == PageType.MENU:
                menu_page = self.pages[PageType.MENU]
                selected_type = menu_page.get_selected_page_type()
                self.set_page(selected_type)
        elif button == 'menu':
            self.set_page(PageType.MENU)
        elif button == 'up':
            if isinstance(self.current_page, (PluginListPage, MenuPage)):
                self.current_page.scroll_up()
        elif button == 'down':
            if isinstance(self.current_page, (PluginListPage, MenuPage)):
                # Get actual data length from cached data
                if isinstance(self.current_page, PluginListPage):
                    data_len = len(self._current_data.get('plugins', []))
                elif isinstance(self.current_page, MenuPage):
                    data_len = len(self.current_page.menu_items)
                else:
                    data_len = 10
                self.current_page.scroll_down(data_len)
    
    def get_page(self, page_type: PageType) -> Optional[LCDPage]:
        """Get specific page instance."""
        return self.pages.get(page_type)
