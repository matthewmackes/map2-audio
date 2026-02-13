# GRID-ADVANCED Quick Reference

## 🚀 Access

**URL**: `/grid-advanced`  
**Navigation**: Main menu → **"Grid 3D"** (Cube icon)  
**Keyboard**: No direct shortcut (use nav)

## 🎮 Controls

### Camera
- **Orbit**: Left-click + drag
- **Pan**: Right-click + drag  
- **Zoom**: Scroll wheel
- **Reset**: Click "Reset Camera" button

### Nodes
- **Select**: Click node
- **Focus**: Auto-zooms to node's layer
- **Hover**: Shows quick info
- **Deselect**: Click empty space

### Toolbar Actions
| Button | Icon | Function |
|--------|------|----------|
| Add Node | ➕ | Create new plugin |
| Duplicate | 📋 | Copy selected |
| Delete | 🗑️ | Remove selected |
| Save Snapshot | 📷 | Capture scene |
| Snapshots | 📚 | View saved |
| Reset Camera | 🧊 | Default view |
| Re-layout | 🔄 | Force redraw |

## 🎨 Visual Guide

### Node Colors (by category)
- 🔴 `#ff6b35` - Amplifier
- 🟣 `#ff006e` - Distortion
- 🔵 `#00d9ff` - Modulation
- 🟢 `#00ff9f` - Delay
- 🟣 `#a239ca` - Reverb
- 🟡 `#ffbe0b` - Dynamics
- 🟢 `#06ffa5` - Filter
- 🟣 `#7209b7` - Utility

### Node States
- **Active**: Bright emissive glow
- **Bypassed**: Dim, 40% opacity
- **Selected**: White ring highlight
- **Hovered**: Brighter pulse

### Link Types
- **Audio**: Cyan (#007acc) → White gradient
- **MIDI**: Amber (#ffbe0b) → Magenta (#ff006e)
- **Layer Portal**: Purple (#a239ca) ring

## 🎹 MIDI Visualization

### Event Types
| MIDI Event | Visual Effect |
|------------|---------------|
| Note-On | Radial burst (50 particles) |
| Note-Off | Fade existing trails |
| CC | Color ripple along path |
| Velocity | Particle brightness/speed |

### Particle Colors
- **Low Velocity** (0-64): Cool blue
- **Mid Velocity** (65-100): Cyan/white
- **High Velocity** (101-127): Hot white/yellow

## 📸 Snapshots

### Save
1. Arrange scene to desired state
2. Click **"Save Snapshot"**
3. Enter name in prompt
4. Snapshot saved with camera position

### Load
1. Click **"Snapshots"** button
2. Select snapshot from list
3. Scene instantly restores

### Delete
- Click **❌** next to snapshot in list

## 🔍 Inspector Panel

Located on right side, shows:
- Current layer depth
- Selected node details:
  - ID
  - Label
  - Type
  - Category
  - Layer
  - Status (Active/Bypassed)

## 🌌 Layer Navigation

### Z-Depth Positioning
- **Layer 0**: z = 0 (main)
- **Layer -1**: z = -5
- **Layer -2**: z = -10
- **Layer -N**: z = -5N

### Auto-Navigate
- Click node → Camera animates to layer
- Smooth transition (300ms)
- Maintains orbit orientation

## ⚡ Performance Tips

### For Smooth 60 FPS
- ✅ Close unused browser tabs
- ✅ Use Chrome/Edge (best WebGL)
- ✅ Enable GPU acceleration
- ✅ Limit to <100 nodes per scene

### If Laggy
- Reduce window size
- Disable other apps using GPU
- Update graphics drivers
- Switch to original Grid page

## 🐛 Troubleshooting

### Black Screen
- **Cause**: WebGL not supported
- **Fix**: Update browser, enable GPU

### No Particles
- **Cause**: No MIDI events yet
- **Fix**: Play notes, check MIDI routing

### Nodes Overlapping
- **Cause**: Force layout still settling
- **Fix**: Click "Re-layout" or wait 2-3 sec

### Snapshot Not Loading
- **Cause**: Graph structure changed
- **Fix**: Delete old snapshot, create new

## 🔧 Technical Specs

### Browser Requirements
- WebGL 2.0
- ES2020+ JavaScript
- 4GB+ RAM
- GPU recommended

### Bundle Size
- Main chunk: ~150KB (gzipped)
- Lazy loaded on route
- Shared Three.js: ~500KB

### Frame Budget
- Target: 60 FPS
- Typical: 90-120 FPS
- Particles: 1000 max
- Nodes: 500 max tested

## 🆚 vs Original Grid

| Feature | Original | Advanced |
|---------|----------|----------|
| View | 2D Grid | 3D Space |
| Layout | Manual | Force-directed |
| Animation | CSS | GPU Shaders |
| MIDI Viz | Indicators | Particles |
| Layers | Slots | Z-depth |
| Aesthetic | Cortex | Asteroids |
| Performance | React | Three.js |

## 📝 Keyboard Shortcuts (Planned)

- `Space` - Play/pause animation
- `R` - Reset camera
- `L` - Toggle layer labels
- `S` - Save snapshot
- `Del` - Delete selected
- `Esc` - Deselect all

## 🎯 Tips & Tricks

### Best Practices
1. **Start Simple**: Build small graphs first
2. **Use Snapshots**: Save before major changes
3. **Layer Wisely**: Group related plugins
4. **Watch Performance**: Monitor FPS counter

### Creative Uses
- **Visual Jams**: Play along with MIDI viz
- **Screenshots**: Capture for social media
- **Teaching**: Show signal flow concepts
- **Debugging**: Trace audio paths visually

## 🔗 Related Pages

- `/grid` - Original 2D Grid editor
- `/chains` - Chain management
- `/midi` - MIDI routing
- `/plugins` - Plugin library

---

**Need Help?** Check the [full README](../components/GridFlowAdvanced/README.md)
