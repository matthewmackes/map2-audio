# Gemini Image Generation Prompts for MAP2 Architecture Diagrams

Professional technical visualization prompts for creating stunning architecture diagrams with subtle grid backgrounds.

---

## 🎨 Prompt 1: Node Type Comparison Matrix

```
Create a professional technical infographic showing a comparison matrix of 4 different node types for a distributed audio processing system.

LAYOUT:
- Dark navy blue background (#0f172a) with a subtle isometric grid pattern in light gray (#334155) at 30% opacity
- Four vertical columns representing node types: "ALL-IN-ONE", "AUDIO-NODE", "CONTROL-NODE", "FRONTEND-ONLY"
- Each column contains a stylized server/computer icon at the top
- Below each icon, display key metrics in modern cards with glassmorphism effects

NODE CHARACTERISTICS:
1. ALL-IN-ONE (purple/indigo accent #6366f1):
   - Server icon with multiple screens
   - Latency: 4-5ms
   - Memory: ~800MB
   - Services: 18/18 enabled
   - Use case: "Complete workstation"

2. AUDIO-NODE (emerald green accent #10b981):
   - Compact rack server icon
   - Latency: <3ms
   - Memory: ~400MB
   - Services: 12/18 enabled
   - Use case: "Low-latency processing"

3. CONTROL-NODE (amber yellow accent #f59e0b):
   - Desktop tower icon
   - Latency: N/A
   - Memory: ~300MB
   - Services: 8/18 enabled
   - Use case: "Management hub"

4. FRONTEND-ONLY (sky blue accent #38bdf8):
   - Tablet/laptop icon
   - Latency: N/A
   - Memory: ~150MB
   - Services: 4/18 enabled
   - Use case: "Lightweight monitor"

VISUAL STYLE:
- Modern, professional technical illustration
- Soft shadows and glowing accents around each column
- Clean sans-serif typography (like Inter or SF Pro)
- Color-coded status indicators (green checkmarks, red X's, yellow warnings)
- Subtle connecting lines between related services
- Grid pattern should be barely visible, providing structure without distraction
- Overall aesthetic: sleek, professional, audio engineering software interface

DIMENSIONS: 1920x1080 landscape
```

---

## 🎨 Prompt 2: AVB/TSN Network Topology

```
Create a stunning network topology diagram illustrating an AVB/TSN audio network with Intel I210 hardware.

SCENE:
- Dark slate background (#1e293b) with hexagonal grid pattern in dim cyan (#164e63) at 25% opacity
- Central hub representing an AVB-capable switch (glowing indigo #6366f1)
- Multiple nodes radiating outward in a circular arrangement

NETWORK NODES (clockwise from top):
1. PTP Grandmaster (golden glow #fbbf24):
   - Clock tower icon
   - Label: "IEEE 802.1AS gPTP"
   - Status: "Sync <1μs"

2. Audio Talker Node (green glow #10b981):
   - Microphone/input icon
   - Label: "AUDIO-NODE (Talker)"
   - Streams: "8 TX → 64ch"

3. Audio Listener Node (blue glow #3b82f6):
   - Speaker/output icon
   - Label: "AUDIO-NODE (Listener)"
   - Streams: "8 RX ← 64ch"

4. Control Node (purple glow #8b5cf6):
   - Monitor/dashboard icon
   - Label: "CONTROL-NODE"
   - Status: "AVDECC Monitor"

CONNECTIONS:
- Glowing animated data streams between nodes and central switch
- Color-coded by traffic type:
  * Gold lines: gPTP synchronization (IEEE 802.1AS)
  * Green lines: AVTP audio streams (IEEE 1722)
  * Blue lines: AVDECC control (IEEE 1722.1)
  * Purple lines: Management traffic
- Pulse animation suggestion with gradient trails
- Each line should have subtle particle effects flowing along it

ANNOTATIONS:
- Small floating badges showing:
  * "2ms latency" near audio streams
  * "CBS Traffic Shaping" near switch
  * "Intel I210" hardware badge
  * "VLAN 2" on audio network segment

VISUAL STYLE:
- Futuristic network visualization aesthetic
- Glowing neon accents on dark background
- Clean, technical, professional
- Grid pattern provides depth and structure
- Think: Tron meets professional audio engineering
- Subtle depth with layered elements and shadows

DIMENSIONS: 1920x1200 landscape
```

---

## 🎨 Prompt 3: Studio Recording Setup Architecture

```
Create an isometric architectural diagram of a professional studio recording setup with distributed MAP2 nodes.

ENVIRONMENT:
- Dark charcoal background (#27272a) with subtle square grid pattern in gray (#3f3f46) at 20% opacity
- Isometric perspective view from top-right angle
- Three distinct physical spaces connected by glowing network lines

ROOM 1 - PRODUCER WORKSTATION (left):
- Desk with dual monitors
- CONTROL-NODE computer (amber glow #f59e0b)
- Floating UI elements showing: "Web Dashboard", "API Server", "Database"
- Person silhouette at desk (minimal, professional)
- Label: "Producer / Engineer Station"

ROOM 2 - TRACKING ROOM (center):
- Recording space with microphone
- AUDIO-NODE computer (green glow #10b981)
- USB audio interface with multiple inputs
- Floating UI showing: "JUCE Engine", "Plugin Chain", "USB I/O"
- Guitarist silhouette with instrument
- Label: "Tracking Room - <3ms latency"

ROOM 3 - MIX ROOM (right):
- Mixing desk with monitors
- AUDIO-NODE computer (indigo glow #6366f1)
- AVB network interface (Intel I210 badge)
- Floating UI showing: "Master Chain", "AVB I/O", "Reverb/Effects"
- Engineer silhouette at mixing position
- Label: "Mix Room - AVB Network"

NETWORK CONNECTIONS:
- Glowing ethernet cables connecting all three rooms
- Split into two layers:
  * Top layer: Green "AVB Audio Network (VLAN 2)" - IEEE 1722 streams
  * Bottom layer: Blue "Management Network (VLAN 1)" - HTTP/mDNS/RAFT
- Network switch in center with pulsing indicators

VISUAL STYLE:
- Clean isometric illustration with subtle 3D depth
- Professional technical aesthetic
- Minimal color palette with strategic accent colors
- Grid provides spatial reference without overwhelming
- Soft ambient lighting on objects
- Clean, modern icons for equipment
- Professional studio environment feel

DIMENSIONS: 1600x1200 landscape
```

---

## 🎨 Prompt 4: Service Distribution Infographic

```
Create a comprehensive service distribution infographic showing which services run on each node type.

LAYOUT:
- Deep space blue background (#0c4a6e) with diagonal grid lines in lighter blue (#075985) at 15% opacity
- Four vertical swim lanes, one per node type
- Horizontal rows representing service categories

SWIM LANE HEADERS (top):
1. ALL-IN-ONE (purple banner #6366f1)
2. AUDIO-NODE (green banner #10b981)
3. CONTROL-NODE (amber banner #f59e0b)
4. FRONTEND-ONLY (cyan banner #06b6d4)

SERVICE CATEGORIES (left sidebar):
1. Core Audio Services:
   - JUCE Audio Engine
   - Audio I/O (PipeWire/JACK)
   - Plugin Loader (LV2)

2. User Interfaces:
   - Web Dashboard (React)
   - Terminal UI (Textual)
   - LCD Display Manager

3. Backend Services:
   - FastAPI Server
   - Database (SQLite)

4. Cluster Services:
   - mDNS Discovery
   - RAFT Consensus
   - Health Monitor
   - Config Distributor
   - Event Producer

5. AVB/TSN Services (with Intel I210 icon):
   - gPTP (ptp4l + phc2sys)
   - AVTP Streaming
   - AVDECC Entity
   - TSN Traffic Shaping
   - AVB Router

STATUS INDICATORS:
- Green checkmark circle (✓) = ENABLED
- Red X circle (✗) = DISABLED
- Yellow warning triangle (⚠) = DEGRADED
- Each indicator should glow subtly with its color

VISUAL ENHANCEMENTS:
- Glassmorphism cards for each service cell
- Subtle connecting lines showing dependencies
- Service icons (microphone, network, database, etc.)
- Color-coded categories with left border accent
- Hover effect suggestions with tooltip areas
- Grid provides alignment structure

BOTTOM SUMMARY BAR:
- Quick stats for each node type:
  * Services enabled count
  * Memory usage
  * CPU overhead
  * Typical latency

VISUAL STYLE:
- Modern SaaS dashboard aesthetic
- Clean, organized, professional
- High contrast for readability
- Subtle animations (pulse, glow)
- Professional technical documentation quality

DIMENSIONS: 2400x1600 landscape (wide format)
```

---

## 🎨 Prompt 5: Deployment Architecture Patterns

```
Create a multi-panel infographic showing 5 different deployment patterns for MAP2 clusters.

LAYOUT:
- Midnight blue background (#1e1b4b) with constellation-style dot grid pattern in dim purple (#312e81) at 18% opacity
- Five equal panels arranged in 2 rows (3 top, 2 bottom)
- Each panel is a self-contained mini-diagram

PANEL 1 - STUDIO RECORDING (top-left, emerald accent #10b981):
- 3 interconnected nodes in triangle formation
- Labels: "CONTROL-NODE (Producer)" + 2x "AUDIO-NODE (Track/Mix)"
- Small studio equipment icons
- Badge: "Professional Recording"
- Network: "10 GbE + AVB"

PANEL 2 - LIVE PERFORMANCE (top-center, purple accent #8b5cf6):
- 4 nodes in linear stage arrangement
- Labels: "ALL-IN-ONE (FOH)" + 2x "AUDIO-NODE (Instruments)" + "FRONTEND-ONLY (Monitor)"
- Small stage/speaker icons
- Badge: "Live Touring Rig"
- Network: "AVB/TSN"

PANEL 3 - DISTRIBUTED PROCESSING (top-right, cyan accent #06b6d4):
- Hub and spoke topology
- Center: "CONTROL-NODE (Master)"
- Spokes: "AUDIO-NODE 1-8 (Workers)"
- Server rack icons
- Badge: "Render Farm"
- Network: "10 GbE"

PANEL 4 - HYBRID CLOUD (bottom-left, amber accent #f59e0b):
- Cloud node on top
- 3 remote nodes below connected via internet
- Labels: "Cloud CONTROL-NODE" + remote "AUDIO-NODE x3"
- Cloud and building icons
- Badge: "Multi-Site"
- Network: "VPN/Internet"

PANEL 5 - EDGE PROCESSING (bottom-right, pink accent #ec4899):
- Raspberry Pi style mini-nodes
- Multiple small nodes in home layout
- Labels: "ALL-IN-ONE (Room 1-3)" + "FRONTEND-ONLY (Tablet)"
- Home/IoT icons
- Badge: "Smart Home Audio"
- Network: "WiFi + Ethernet"

VISUAL STYLE:
- Clean, minimalist topology diagrams
- Node represented as glowing rounded rectangles
- Network connections as curved, gradient lines
- Color-coded by use case
- Small icons representing equipment type
- Badge ribbons with use case names
- Grid provides cosmic/technical aesthetic
- Professional yet approachable

DIMENSIONS: 2200x1400 landscape
```

---

## 🎨 Prompt 6: Hardware Comparison Chart

```
Create a detailed hardware comparison visualization showing node capabilities with and without Intel I210.

LAYOUT:
- Rich dark purple background (#2e1065) with blueprint-style grid in light purple (#6b21a8) at 22% opacity
- Split view: left half "Standard Ethernet", right half "Intel I210/I225"
- Central dividing line with glowing hardware badge

LEFT SIDE - STANDARD ETHERNET:
- Node silhouette in muted gray (#6b7280)
- Service bubbles floating around:
  * mDNS Discovery (enabled, green)
  * RAFT Consensus (enabled, green)
  * HTTP/REST API (enabled, green)
  * AVB/TSN Streaming (disabled, red with X)
  * gPTP Sync (disabled, red with X)
- Badge: "Standard Deployment"
- Max Latency: "5-10ms network"

RIGHT SIDE - INTEL I210:
- Node silhouette in bright indigo (#6366f1) with glow
- Service bubbles floating around:
  * All standard services (enabled, green)
  * gPTP Sync (enabled, glowing gold #fbbf24)
  * AVTP Streaming (enabled, glowing green #10b981)
  * AVDECC (enabled, glowing blue #3b82f6)
  * TSN Traffic Shaping (enabled, glowing purple #8b5cf6)
- Badge: "AVB/TSN Enabled"
- Max Latency: "<2ms deterministic"

CENTRAL DIVIDER:
- Intel I210 chip illustration (photorealistic style)
- Glowing aura effect
- IEEE standards badges orbiting:
  * "IEEE 802.1AS"
  * "IEEE 1722"
  * "IEEE 1722.1"
  * "IEEE 802.1Qav"

BOTTOM COMPARISON TABLE:
Small table showing:
| Feature | Standard | I210 |
| Latency | 5-10ms | <2ms |
| Streams | N/A | 16 |
| Sync | NTP | gPTP <1μs |

VISUAL STYLE:
- High-tech product comparison aesthetic
- Glowing, holographic elements on I210 side
- Muted, professional on standard side
- Grid provides technical blueprint feel
- Premium hardware marketing quality
- Think: Apple product launch presentation

DIMENSIONS: 1920x1080 landscape
```

---

## 🎨 Prompt 7: Performance Metrics Dashboard

```
Create a live dashboard-style visualization showing real-time performance metrics across node types.

LAYOUT:
- Dark slate background (#0f172a) with hexagonal honeycomb grid pattern in blue-gray (#1e293b) at 20% opacity
- Four quadrants representing each node type
- Central hub showing aggregate cluster stats

QUADRANT LAYOUT (clockwise from top-left):

1. ALL-IN-ONE (top-left, purple theme #6366f1):
   - Circular gauge showing CPU: 15-20%
   - Memory bar graph: 800MB
   - Latency meter: 4-5ms
   - Services: 18/18 active (green indicators)
   - Small sparkline graphs showing trends

2. AUDIO-NODE (top-right, green theme #10b981):
   - Circular gauge showing CPU: 5-10%
   - Memory bar graph: 400MB
   - Latency meter: <3ms (glowing green)
   - Services: 12/18 active
   - Small waveform showing audio activity

3. CONTROL-NODE (bottom-left, amber theme #f59e0b):
   - Circular gauge showing CPU: 2-5%
   - Memory bar graph: 300MB
   - No latency (N/A grayed out)
   - Services: 8/18 active
   - Small network graph showing connections

4. FRONTEND-ONLY (bottom-right, cyan theme #06b6d4):
   - Circular gauge showing CPU: <1%
   - Memory bar graph: 150MB
   - No latency (N/A grayed out)
   - Services: 4/18 active
   - Small UI activity indicator

CENTER HUB:
- Circular cluster overview
- Total nodes: 4
- Aggregate health: 98%
- Total streams: 24
- PTP synced: 2/4
- Ring chart showing service distribution

VISUAL ELEMENTS:
- Glassmorphic dashboard panels with blur effects
- Animated gauge needles with smooth motion blur
- Glowing accent colors matching themes
- Small status LEDs (green/yellow/red)
- Subtle pulse animations on active metrics
- Grid provides structure and depth
- Modern monitoring software aesthetic

STYLE REFERENCE:
- Think: Grafana + Datadog + professional audio metering
- Clean, readable, information-dense
- Dark mode optimized
- Professional operations center quality

DIMENSIONS: 1920x1200 landscape
```

---

## 📐 General Guidelines for All Prompts

### Grid Pattern Specifications:
- **Opacity:** 15-30% maximum (should be subtle, not dominant)
- **Color:** Complementary to background, slightly lighter
- **Pattern Types:**
  * Isometric grid (for 3D views)
  * Square grid (for layouts/plans)
  * Hexagonal (for network topologies)
  * Diagonal lines (for infographics)
  * Dot grid / constellation (for space-themed)
- **Purpose:** Provides structure without distraction

### Color Palette (Consistent across all images):
- **Background:** Dark tones (#0f172a, #1e293b, #27272a)
- **ALL-IN-ONE:** Purple/Indigo (#6366f1)
- **AUDIO-NODE:** Emerald Green (#10b981)
- **CONTROL-NODE:** Amber Yellow (#f59e0b)
- **FRONTEND-ONLY:** Cyan/Sky Blue (#06b6d4, #38bdf8)
- **AVB/TSN:** Gold/Indigo blend (#fbbf24 + #6366f1)
- **Success:** Green (#10b981)
- **Warning:** Amber (#f59e0b)
- **Error:** Red (#ef4444)

### Typography:
- **Headings:** Bold, sans-serif (Inter, SF Pro, Roboto)
- **Body:** Regular, clean sans-serif
- **Code/Tech:** Monospace for technical details
- **Size Hierarchy:** Clear distinction between levels

### Visual Style Keywords:
- Professional
- Technical
- Modern
- Clean
- High-tech
- Audio engineering software aesthetic
- Dark mode optimized
- Glassmorphism effects
- Subtle animations (suggest motion)
- Glowing accents
- Depth with shadows and layers

---

## 🎯 Usage Instructions

1. **Copy the desired prompt** from above
2. **Paste into Gemini** (Google's image generation AI)
3. **Adjust dimensions** if needed for your use case
4. **Specify format:** "Create this as a high-quality technical diagram suitable for professional documentation"
5. **Iterate:** If the first result isn't perfect, refine with:
   - "Make the grid more subtle"
   - "Increase the glow on the accent colors"
   - "Make it more professional and less playful"
   - "Add more technical details"

---

## 📊 Recommended Image Sizes

- **Documentation:** 1920x1080 (16:9)
- **Presentations:** 1920x1200 (16:10)
- **Web Hero Images:** 2400x1200 (2:1)
- **Infographics:** 1600x2400 (portrait) or 2400x1600 (landscape)
- **Social Media:** 1200x630 (OG image)

---

**Document Version:** 1.0
**Created:** 2026-02-14
**Purpose:** Professional technical visualization generation for MAP2 Audio Platform documentation
