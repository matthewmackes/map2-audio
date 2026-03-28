# TUI v1 - Enhanced with 5 Major Improvements

## Overview

The MAP2 Audio Platform TUI (Terminal User Interface) has been significantly improved with professional-grade features for better usability, performance, and maintainability.

---

## **5 Major Improvements**

### **1. 🎯 Reorganized Tab Navigation**

**What Changed:**
- Tabs are now grouped into logical workflows instead of a flat list
- Easier to find features based on your task

**Tab Groups:**
```
🎸 PRIMARY (Core Audio)
  └─ Pedalboard
  └─ MIDI
  └─ Plugins

🎚️ PRODUCTION (Music Making)
  └─ Dashboard
  └─ Workflow
  └─ Automation

⚙️ SYSTEM (Management)
  └─ Network
  └─ Services
  └─ Health
  └─ Backup

ℹ️ OTHER
  └─ About
```

**Keyboard Shortcuts:**
- `1-9` and `0` - Jump to specific tabs
- `←` / `→` - Navigate between tabs
- `R` - Refresh current tab
- `Ctrl+R` - Hot reload modules

---

### **2. ⚡ Screen State Persistence**

**What It Does:**
- Saves your scroll position in each screen
- Remembers your selections and edits
- Automatically restores when you switch back

**Location:**
```
~/.config/map2/tui_state/
```

**New Module:** `screen_state.py`
- Manages persistent state for all screens
- Automatic cache expiration (configurable TTL)
- Fast loading from cache

---

### **3. 🎨 Real-Time Status Bar**

**Features:**
- Live CPU usage (color-coded: green < 70%, yellow < 85%, red ≥ 85%)
- Live RAM usage (same color coding)
- Network latency display
- Active chain name and plugin count
- Sync status indicator (🟢 Synced / 🔴 Error)
- Last update timestamp

**Updates:** Every 2 seconds (configurable)

**New Module:** `status_bar.py`
```
[green]CPU: 45%[/] │ [green]RAM: 62%[/] │ [green]RTL: 3.2ms[/] │ 
Chain: Ambient (8 fx) │ 🟢 Synced │ 14:23:45
```

---

### **4. 🔄 Real-Time Data Sync**

**Automatic Updates:**
- Metrics refresh every 2 seconds
- Status bar updates without blocking UI
- Background sync runs continuously
- Shows error status if API is unreachable

**Features:**
- Non-blocking async updates
- Timestamps for every metric
- Automatic retry on connection failure
- Connection status indicator

---

### **5. 🛠️ Better Architecture**

**New Modules:**

#### **base_screen.py**
- Standard interface for all screens
- Built-in state management
- Error handling with user-friendly messages
- Data caching with TTL
- Loading indicators

```python
class MyScreen(BaseScreen):
    screen_name = "MyScreen"
    
    def get_state(self):
        return {"scroll_pos": 0}
    
    def restore_state(self, state):
        self.scroll_position = state.get("scroll_pos", 0)
```

#### **config.py**
- Centralized configuration management
- Theme selection (Dark, Default, Nord)
- Customizable key bindings
- UI settings
- Automatic persistence

```python
from config import config

# Access config
theme = config.get("ui.theme")
timeout = config.get("api_timeout")

# Update config
config.set("ui.show_status_bar", True)
```

#### **error_handler.py**
- User-friendly error messages
- Automatic API error translation
- Centralized logging
- In-app notifications

```python
from error_handler import error_handler

try:
    await api.get_data()
except Exception as e:
    msg = error_handler.handle_api_error(e, "Loading data")
    error_handler.show_error(msg)
```

---

## **Usage**

### **Starting the TUI**

```bash
cd /home/mm/map2-audio
python -m tui.app
```

### **Configuration**

Edit `~/.config/map2/tui_config.json`:

```json
{
  "api_base_url": "http://localhost:8080",
  "api_timeout": 30,
  "log_level": "INFO",
  "ui": {
    "theme": "textual-dark",
    "show_status_bar": true,
    "show_metrics": true,
    "screen_cache_size": 4,
    "refresh_interval": 2,
    "data_cache_ttl": 300
  },
  "keybindings": {
    "next_tab": "right",
    "prev_tab": "left",
    "refresh": "r",
    "hot_reload": "ctrl+r"
  }
}
```

### **Keyboard Shortcuts**

| Key | Action |
|-----|--------|
| `1-9`, `0` | Jump to tab |
| `←` / `→` | Navigate tabs |
| `R` | Refresh current tab |
| `Ctrl+R` | Hot reload modules |
| `?` | Show help |
| `Q` | Quit |

---

## **Performance**

- **Memory:** LRU cache keeps only 4 screens in memory
- **Speed:** State persistence eliminates reload delays
- **Responsiveness:** Non-blocking async updates
- **Reliability:** Error recovery and automatic retries

---

## **Files Added/Modified**

### **New Files:**
- `screen_state.py` - State persistence system
- `status_bar.py` - Real-time metrics display
- `base_screen.py` - Base screen class
- `config.py` - Configuration management
- `error_handler.py` - Error handling system

### **Modified Files:**
- `app.py` - Integrated all new modules, reorganized tabs

---

## **Developer Guide**

### **Creating a New Screen**

```python
from base_screen import BaseScreen

class MyNewScreen(BaseScreen):
    screen_name = "MyScreen"
    
    def compose(self):
        yield Label("Hello, World!")
    
    async def load_data(self):
        """Load data from API."""
        data = await self.api_client.get_something()
        self.cache_data("my_data", data)
    
    def get_state(self):
        """Save screen state."""
        return {"selection": self.selected_item}
    
    def restore_state(self, state):
        """Restore screen state."""
        self.selected_item = state.get("selection")
```

### **Using Error Handler**

```python
from error_handler import error_handler

try:
    result = await self.api_client.do_something()
except ConnectionError as e:
    msg = error_handler.handle_api_error(e, "Connecting to server")
    error_handler.show_error(msg, severity="error")
```

### **Caching Data**

```python
# Cache with 5 minute TTL
self.cache_data("expensive_data", computed_value, ttl=300)

# Retrieve later
cached = self.get_cached_data("expensive_data")
if cached is not None:
    use(cached)
else:
    # Compute again
    computed = compute_value()
```

---

## **Troubleshooting**

### **Status Bar Not Showing**
- Check: `config.ui.show_status_bar = true`
- Restart the application

### **State Not Persisting**
- Check: `~/.config/map2/tui_state/` exists
- Verify permissions on `~/.config/map2/`

### **API Connection Errors**
- Check: `config.api_base_url` points to correct server
- Check: API server is running (`curl http://localhost:8080/health`)

### **Hot Reload Not Working**
- Press `Ctrl+R` (reload), not just `R` (refresh)
- Check console for import errors

---

## **Future Enhancements**

Potential improvements for next iteration:
- [ ] WebSocket support for real-time updates
- [ ] Plugin system for custom screens
- [ ] Theme customization
- [ ] Undo/Redo functionality
- [ ] Favorites/Quick Actions
- [ ] Search across all screens
- [ ] Screen recording/playback for demos
- [ ] Multi-user support

---

## **Support**

For issues or questions:
1. Check the logs: `~/.config/map2/tui.log`
2. Enable debug logging: `log_level: "DEBUG"` in config
3. Check GitHub issues: [map2-audio/issues](https://github.com/map2-audio/map2-audio/issues)

---

**Version:** 1.1  
**Last Updated:** January 22, 2026  
**Status:** Production Ready ✅
