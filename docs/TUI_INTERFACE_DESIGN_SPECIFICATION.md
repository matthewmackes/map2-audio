# 🎨 MAP2 Audio Platform - TUI Interface Design Specification

## Table of Contents

1. [Design System](#design-system)
2. [Visual Design Language](#visual-design-language)
3. [Component Library](#component-library)
4. [Screen Designs](#screen-designs)
5. [Interaction Patterns](#interaction-patterns)
6. [Accessibility](#accessibility)

---

## Design System

### Color Palette

**Primary Brand Colors:**
```
Primary Blue:     #0066FF (main actions, highlights)
Accent Cyan:      #00CCFF (secondary actions)
Success Green:    #00DD00 (status ok, running)
Warning Yellow:   #FFDD00 (attention needed)
Error Red:        #FF3333 (errors, issues)
Dark BG:          #0A0E27 (main background)
Card BG:          #1A1F3A (cards, containers)
Text Primary:     #FFFFFF (main text)
Text Secondary:   #B0B8CC (secondary text)
Border:           #2A2F4A (borders, dividers)
```

**Gradients:**
```
Primary Gradient:  #0066FF → #00CCFF (left to right)
Success Gradient:  #00DD00 → #00FF88 (subtle)
Error Gradient:    #FF3333 → #FF6666 (warning)
```

### Typography

**Font Family:** `Monospace` (JetBrains Mono, Roboto Mono, or system monospace)

**Sizes:**
```
Header 1:    20pt (main titles)
Header 2:    16pt (section headers)
Header 3:    14pt (subsection headers)
Body:        12pt (main text)
Small:       10pt (captions, hints)
Micro:       9pt  (timestamps, secondary info)
```

**Weights:**
```
Normal:      400 (body text)
Bold:        700 (headers, emphasis)
```

### Spacing System

```
xs:   2px   (micro spacing)
sm:   4px   (small elements)
md:   8px   (standard)
lg:   16px  (sections)
xl:   24px  (major sections)
```

### Component Sizing

```
Button Height:        3 rows (including padding)
Input Height:         1 row
Card Padding:         1 row (vertical), 2 cols (horizontal)
Modal Margin:         2 rows from edge
List Item Height:     1 row
Header Height:        2 rows
Footer Height:        1 row
```

---

## Visual Design Language

### Header & Footer

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ 🎵 MAP2 Audio Platform v2.0                          [⚙️ ℹ️ ]┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

[Content Area]

┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
┃ [F1] Help  [F2] Settings  [TAB] Navigate  [ENTER] Select [Q] Quit ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

### Card Layout

```
┌─────────────────────────────────────────────────────────┐
│ Section Title                                      [⋮]  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Content area with padding                             │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Status Indicators

```
✓ Running/Success     (bright green)
○ Idle/Waiting        (gray)
⚡ Active            (bright blue)
⚠ Warning           (bright yellow)
✗ Error/Offline      (bright red)
⟳ Loading           (animated cyan)
```

### Animations

**Loading Spinner:**
```
⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏  (Unicode spinner)
```

**Progress Bar:**
```
Progress: ▓▓▓▓▓░░░░ 50%
Progress: ▓▓▓▓▓▓▓▓▓░ 90%
```

**Pulse Animation (for interactive elements):**
```
Fade in/out at 1 second interval
Used for: loading states, important notices
```

---

## Component Library

### Button

```python
# Standard Button
┌──────────────────────┐
│ [  Click Me  ]       │
└──────────────────────┘

# Button States
[  Default  ]    <- Normal (blue)
[ ⟳ Loading ]    <- Loading (cyan, animated)
[✓ Complete]    <- Success (green)
[✗ Error   ]    <- Error (red)
[  Disabled ]   <- Disabled (gray)
```

**Implementation:**
```
border_style = "solid"
height = 3
width = min(content_width + 4, max_width)
padding = (0, 2)
color = primary_blue
hover_color = accent_cyan
```

### Input Field

```python
# Text Input
┌─────────────────────────────────┐
│ Label: [Enter value here_____]  │
└─────────────────────────────────┘

# Input States
[active_____]    <- Focused (blue border)
[______]         <- Empty
[filled__]       <- Has value
[error!!!]       <- Error (red)
```

### Select/Dropdown

```python
# Dropdown/Select
├─ Option 1
│  Option 2  ← currently selected (highlighted)
│  Option 3
├─ Option 4
└─ Option 5
```

### Checkbox

```python
[✓] Option 1        <- Checked
[ ] Option 2        <- Unchecked
[~] Option 3        <- Mixed/Indeterminate
```

### Radio Button

```python
(●) Option 1        <- Selected
( ) Option 2        <- Unselected
( ) Option 3        <- Unselected
```

### List

```python
┌─────────────────────────────────┐
│ ❯ Item 1 (Selected) [details]   │
│ ( ) Item 2         [details]    │
│ ( ) Item 3         [details]    │
│ ( ) Item 4         [details]    │
└─────────────────────────────────┘

Navigation: ↑↓ arrow keys, Enter to select, Esc to cancel
```

### Tabs

```
┏━━━━━━━━━━┳━━━━━━━━━━┳━━━━━━━━━━┓
┃ Tab 1 ⋯  ┃ Tab 2    ┃ Tab 3    ┃
┣━━━━━━━━━━╋━━━━━━━━━━╋━━━━━━━━━━┫
┃ Content of active tab                ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

### Modal/Dialog

```
┌──────────────────────────────────┐
│ ⚠ Confirm Action                 │
├──────────────────────────────────┤
│                                   │
│ Are you sure you want to do this? │
│                                   │
│ [  Cancel  ]    [  Confirm  ]    │
└──────────────────────────────────┘
```

### Status Bar

```
Connected: 192.168.1.50  │ CPU: 15%  │ Memory: 512MB  │ Latency: 2.3ms  │ 12:34
```

### Progress Indicator

```
╔════════════════════════════════════════════════════╗
║ Scanning Networks...                               ║
├────────────────────────────────────────────────────┤
║ ▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░  45%        ║
├────────────────────────────────────────────────────┤
║ ✓ Network interfaces detected (2/3)                ║
║ ⟳ Scanning mDNS services...                        ║
║ ○ Validating connectivity...                       ║
╚════════════════════════════════════════════════════╝
```

---

## Screen Designs

### Screen 1: Launch/Splash

**Code in tui/screens/setup_wizard_screen.py:**

```python
class LaunchScreen(Screen):
    """Welcome and intro screen"""
    
    CSS = """
    Screen {
        background: $dark_bg;
    }
    
    #header_box {
        border: solid $primary_blue;
        height: 8;
    }
    
    #title {
        text-align: center;
        color: $primary_blue;
        text-style: bold;
    }
    
    #subtitle {
        text-align: center;
        color: $text_secondary;
    }
    
    #body {
        border: solid $border;
        height: 1fr;
        padding: 2 3;
    }
    
    #footer {
        height: 3;
        border-top: solid $border;
    }
    """
    
    def render(self):
        return """
        ╔═══════════════════════════════════════════════════════════════╗
        ║                                                               ║
        ║              🎵 MAP2 AUDIO PLATFORM v2.0                      ║
        ║           Distributed Deployment Configuration               ║
        ║                                                               ║
        ╚═══════════════════════════════════════════════════════════════╝
        
        Welcome! This is your first time running MAP2. Let's get you
        set up in just a few minutes.
        
        Choose your deployment mode:
        ...
        """
```

### Screen 2: Mode Selection

```python
class ModeSelectionScreen(Screen):
    """Choose deployment mode"""
    
    MODES = [
        {
            'id': 'all_in_one',
            'symbol': '◉',
            'title': 'All-in-One',
            'subtitle': '[localhost only]',
            'description': 'Single device with frontend & backend',
            'use_case': 'Best for: Desktop/Laptop, standalone use',
        },
        {
            'id': 'backend_server',
            'symbol': '◉',
            'title': 'Backend Server',
            'subtitle': '[network audio processor]',
            'description': 'Central audio processing server',
            'use_case': 'Best for: Professional studios, multi-user setups',
        },
        {
            'id': 'frontend_server',
            'symbol': '◉',
            'title': 'Frontend Server',
            'subtitle': '[remote control]',
            'description': 'Web UI connecting to remote backend',
            'use_case': 'Best for: Tablets, secondary devices',
        },
    ]
    
    def render_mode(self, mode, selected):
        indicator = '❯' if selected else '( )'
        style = 'color: $primary_blue' if selected else 'color: $text_secondary'
        
        return f"""
        {indicator} {mode['title']:20} {mode['subtitle']}
            {mode['description']}
            {mode['use_case']}
        """
```

### Screen 3: Configuration Details

```python
class ConfigurationScreen(Screen):
    """Detailed configuration for selected mode"""
    
    def render_mode_a(self):
        """All-in-One configuration"""
        return """
        ╔═══════════════════════════════════════════════════════════════╗
        ║ MODE A: ALL-IN-ONE CONFIGURATION                            ║
        ╚═══════════════════════════════════════════════════════════════╝
        
        This device will run both the audio engine and web interface.
        
        ▸ Network Configuration
          ├─ Hostname:              map2-desktop
          ├─ Web UI Port:           3000
          ├─ Backend Port:          8080
          └─ mDNS Advertisement:    [ ON ] • Discoverable as map2-desktop.local
        
        ▸ Audio Configuration
          ├─ Audio Device:          [AUTO-DETECT]
          ├─ Sample Rate:           48000 Hz
          ├─ Buffer Size:           256 samples
          └─ Latency:               ~5ms
        
        ▸ Database
          ├─ Location:              ~/.map2/map2.db
          └─ Auto-backup:           [ ON ] Daily
        """
    
    def render_mode_b(self):
        """Backend Server configuration"""
        return """
        ╔═══════════════════════════════════════════════════════════════╗
        ║ MODE B: BACKEND SERVER CONFIGURATION                         ║
        ╚═══════════════════════════════════════════════════════════════╝
        
        Configure this device as a central audio processing server.
        
        ▸ Server Identity
          ├─ Node ID:               map2-studio-main
          ├─ Hostname:              studio-main
          └─ mDNS Name:             map2-audio-studio-main._map2-audio._tcp
        
        ▸ Network Binding
          ├─ Bind Address:          [ 0.0.0.0 ] (all interfaces)
          ├─ API Port:              8080
          ├─ Metrics Port:          9090
          └─ Status:                ✓ All ports available
        """
    
    def render_mode_c(self):
        """Frontend discovery"""
        return """
        ╔═══════════════════════════════════════════════════════════════╗
        ║ MODE C: DISCOVERING BACKEND SERVERS...                       ║
        ╚═══════════════════════════════════════════════════════════════╝
        
        Searching for available MAP2 audio servers on your network...
        
        ⟳ Scanning...  [████░░░░░░░] 40%
        """
```

### Screen 4: Discovery Results

```python
class DiscoveryScreen(Screen):
    """Show discovered backend servers"""
    
    def render(self):
        return """
        ╔═══════════════════════════════════════════════════════════════╗
        ║ AVAILABLE BACKEND SERVERS                                    ║
        ╚═══════════════════════════════════════════════════════════════╝
        
        Discovered Servers:
        
          ❯ 🟢 studio-main (192.168.1.50)
              ├─ Status:          ONLINE
              ├─ Latency:         2.3ms
              ├─ Signal:          ▓▓▓▓▓ Excellent
              ├─ Capabilities:    audio, midi, plugins
              └─ Last Seen:       now
        
          ( ) 🟡 studio-secondary (192.168.1.51)
              ├─ Status:          ONLINE
              ├─ Latency:         5.6ms
              ├─ Signal:          ▓▓▓▓░ Good
              ├─ Capabilities:    audio, plugins
              └─ Last Seen:       2 minutes ago
        
          ( ) 🔴 office-system (192.168.1.100)
              ├─ Status:          OFFLINE (was online 30 min ago)
              ├─ Latency:         --
              ├─ Signal:          ░░░░░
              └─ Last Seen:       30 min ago
        
          [+ Configure Manually]
        
          ℹ No servers found? Ensure backend is running and on same network
            Press [S] to rescan, [M] for manual connection
        """
```

### Screen 5: Network Validation

```python
class ValidationScreen(Screen):
    """Validate network and system configuration"""
    
    async def validate_all(self):
        """Run all validation checks"""
        checks = [
            ('Network interfaces', self.check_network_interfaces),
            ('Hostname resolution', self.check_hostname),
            ('mDNS/Bonjour', self.check_mdns),
            ('Backend connectivity', self.check_backend),
            ('Audio device', self.check_audio),
            ('Firewall', self.check_firewall),
        ]
        
        for check_name, check_func in checks:
            self.update_check_status(check_name, 'running')
            try:
                result = await check_func()
                self.update_check_status(check_name, 'success', result)
            except Exception as e:
                self.update_check_status(check_name, 'error', str(e))
    
    def render(self):
        return """
        ╔═══════════════════════════════════════════════════════════════╗
        ║ VALIDATING NETWORK CONFIGURATION                             ║
        ╚═══════════════════════════════════════════════════════════════╝
        
        Running pre-flight checks...
        
          ✓ Network interfaces detected       [2 found]
          ✓ Hostname resolution working       [map2-desktop.local]
          ✓ mDNS/Bonjour responding           [online]
          
          [Checking Backend Connectivity...]
            ⟳ Connecting to studio-main (192.168.1.50)...
              └─ Latency: 2.3ms
              └─ API Version: 2.0.0
              └─ Capabilities Matched: ✓
          
          ✓ Backend connection successful
          
          [Checking Audio Device...]
            ✓ Default audio device: USB Audio Device
            ✓ Channels: 2 in / 2 out
            ✓ Sample rate: 48000 Hz
            
          [Checking Firewall...]
            ⚠ Port 8080 might be blocked by firewall
              Suggestion: Run 'sudo ufw allow 8080/tcp'
              [Apply Auto-Fix] [Dismiss] [Manual]
        """
```

### Screen 6: Ready to Start

```python
class ReadyScreen(Screen):
    """Configuration complete, ready to start"""
    
    def render(self):
        return """
        ╔═══════════════════════════════════════════════════════════════╗
        ║                     READY TO START                           ║
        ╚═══════════════════════════════════════════════════════════════╝
        
        Your MAP2 Audio Platform is configured and ready!
        
        Configuration Summary:
        
        ┌─────────────────────────────────────────────────────────────┐
        │ MODE:          All-in-One (Local)                           │
        │ HOSTNAME:      map2-desktop.local                           │
        │ WEB UI:        http://localhost:3000                        │
        │ API:           http://localhost:8080                        │
        │ AUDIO:         USB Audio Device (48kHz, stereo)             │
        │ STATUS:        ✓ Ready                                      │
        └─────────────────────────────────────────────────────────────┘
        
        Services to be started:
          ✓ Audio Engine
          ✓ Backend API (FastAPI)
          ✓ Web Server (Vite)
          ✓ Database
          ✓ Real-time Processor
          ✓ WebSocket Server
        
        Next Steps:
          1. [Start Now]      - Launch services and open web UI
          2. [Start & Close]  - Start in background
          3. [Manual Start]   - Show startup commands
          4. [Review Config]  - Edit settings before starting
        """
```

### Screen 7: Running Status

```python
class StatusScreen(Screen):
    """System running status and monitoring"""
    
    CSS = """
    #header_box {
        height: 1fr;
        background: $dark_bg;
    }
    
    #status_grid {
        layout: grid;
        grid-size: 2 3;
        height: 1fr;
    }
    
    .status_item {
        border: solid $border;
        padding: 1 2;
    }
    
    .status_item.running {
        border: solid $success_green;
    }
    
    .status_item.error {
        border: solid $error_red;
    }
    """
    
    def render(self):
        return """
        ╔═══════════════════════════════════════════════════════════════╗
        ║                      SYSTEM RUNNING                          ║
        ╚═══════════════════════════════════════════════════════════════╝
        
        Your MAP2 Audio Platform is now running!
        
        ┌──────────────────────────────────────────────────────────────┐
        │ REAL-TIME STATUS                                             │
        ├──────────────────────────────────────────────────────────────┤
        │ Audio Engine:        ✓ Running    CPU: 12%  Latency: 4.2ms  │
        │ Backend API:         ✓ Running    Uptime: 45s  Requests: 127 │
        │ Web Interface:       ✓ Running    Port 3000 • 1 client      │
        │ Database:            ✓ Running    145 presets loaded        │
        │ Plugins:             ✓ Loaded     23 instruments available  │
        │ Audio Device:        ✓ Connected  USB Audio Device (2ch)    │
        └──────────────────────────────────────────────────────────────┘
        
        Quick Access:
        
          [W] Web Interface      → http://localhost:3000
          [D] Diagnostics       → System Health & Performance
          [P] Preferences       → Configure settings
          [L] View Logs         → Real-time logs
          
          [M] Main Menu         → Navigate to other screens
          [Q] Quit              → Shutdown services
        
        ⚠ Note: Close this window to minimize MAP2 to system tray
        """
```

---

## Interaction Patterns

### Navigation Flow

```
Launch
  ↓
Mode Selection
  ├─→ All-in-One (Path A)
  ├─→ Backend Server (Path B)
  └─→ Frontend Server (Path C)
  
Path A:
  Configuration Details
    ↓
  Network Validation
    ↓
  Ready to Start
    ↓
  Running Status
  
Path B:
  Server Configuration
    ↓
  Network Validation
    ↓
  Ready to Start
    ↓
  Running Status
  
Path C:
  Discovery Scan
    ↓
  Backend Selection
    ↓
  Network Validation
    ↓
  Ready to Start
    ↓
  Running Status
```

### Keyboard Shortcuts

**Navigation:**
- `↑↓` - Navigate up/down
- `←→` - Navigate left/right / Collapse/expand
- `TAB` - Move to next element
- `Shift+TAB` - Move to previous element

**Actions:**
- `ENTER` - Select / Confirm
- `SPACE` - Toggle checkbox/radio
- `ESC` - Cancel / Go back
- `?` - Help
- `Q` - Quit

**Mode Specific:**
- `W` - Open web interface
- `D` - Diagnostics
- `S` - Rescan
- `M` - Manual config
- `E` - Edit config

### Responsive Behavior

**Wide Terminal (>100 cols):**
- Use 2-column layouts where applicable
- Show more details in list items
- Wider input fields

**Narrow Terminal (<80 cols):**
- Use single-column layouts
- Truncate long text with ellipsis
- Compact list items

**Minimum:**
- 80 columns x 24 rows

### Error Handling

**Validation Error:**
```
┌─────────────────────────────────────────┐
│ ✗ Validation Error                      │
├─────────────────────────────────────────┤
│ Port 8080 is already in use             │
│                                          │
│ Suggestion: Use a different port        │
│ Available ports: 8081, 8082, 8083       │
│                                          │
│ [Retry with 8081] [Choose Different]   │
└─────────────────────────────────────────┘
```

**Network Error:**
```
┌─────────────────────────────────────────┐
│ ⚠ Connection Failed                     │
├─────────────────────────────────────────┤
│ Could not connect to backend server     │
│                                          │
│ Troubleshooting:                        │
│ • Ensure backend is running             │
│ • Check network connectivity            │
│ • Verify firewall settings              │
│ • Try manual host entry                 │
│                                          │
│ [Retry]  [Manual Entry]  [Abort]       │
└─────────────────────────────────────────┘
```

---

## Accessibility

### Color Contrast

All text meets WCAG AA standards (4.5:1 for normal text, 3:1 for large text)

### Keyboard Navigation

- All interactive elements are keyboard accessible
- Logical tab order
- Visual focus indicators (blue border)

### Screen Reader Support

- Descriptive labels for all inputs
- Status updates announced
- Form validation messages read aloud

### Motor Accessibility

- Large click targets (minimum 3 rows height)
- Keyboard-only operation fully supported
- No time-based interactions (except progress)

---

## Implementation Notes

### Textual Framework Integration

```python
from textual.app import ComposeResult
from textual.containers import Container, Vertical, Horizontal
from textual.widgets import Header, Footer, Static, Label, Button
from textual.reactive import reactive

class SetupWizardApp(App):
    """Main setup wizard application"""
    
    MODES = ["all_in_one", "backend_server", "frontend_server"]
    SCREENS = {
        "launch": LaunchScreen,
        "mode_selection": ModeSelectionScreen,
        "configuration": ConfigurationScreen,
        "validation": ValidationScreen,
        "ready": ReadyScreen,
        "status": StatusScreen,
    }
    
    CSS = """
    Screen {
        background: $dark_bg;
        color: $text_primary;
    }
    
    Header {
        background: $card_bg;
        border-bottom: solid $border;
    }
    
    Footer {
        background: $card_bg;
        border-top: solid $border;
    }
    """
    
    def on_mount(self) -> None:
        """Load first screen"""
        self.push_screen("launch")
```

### CSS Styling

```css
/* Color Variables */
$dark_bg: #0A0E27;
$card_bg: #1A1F3A;
$primary_blue: #0066FF;
$accent_cyan: #00CCFF;
$success_green: #00DD00;
$warning_yellow: #FFDD00;
$error_red: #FF3333;
$text_primary: #FFFFFF;
$text_secondary: #B0B8CC;
$border: #2A2F4A;

/* Component Styles */
Button {
    border: solid $primary_blue;
    background: $primary_blue;
    color: $dark_bg;
    padding: 1 3;
    height: 3;
}

Button:focus {
    border: solid $accent_cyan;
    background: $accent_cyan;
}

Button:disabled {
    border: solid $text_secondary;
    background: $text_secondary;
    color: $dark_bg;
}

Input {
    border: solid $border;
    background: $card_bg;
    color: $text_primary;
    padding: 0 1;
    height: 1;
}

Input:focus {
    border: solid $primary_blue;
    background: $card_bg;
}
```

---

**Document Status:** DESIGN COMPLETE ✓  
**Last Updated:** February 4, 2025  
**Next Step:** Begin implementation in tui/screens/
