# 🎵 MAP2 Audio Platform - Dual-Chain A/B Mode Implementation

## Overview

Complete implementation of professional-grade A/B comparison and blending mode for MAP2's signal chain builder. This feature brings PiPedal-like dual-chain capabilities to both web and terminal interfaces.

---

## 📦 What's Included

### 1. **Web UI Component** (`web/src/map2/components/ChainABMode.tsx`)
- Side-by-side chain visualization
- Real-time blend slider (0-100%)
- DSP load monitoring per chain
- Chain duplication for quick A/B pair creation
- Chain linking for synchronized pairs
- Keyboard shortcuts integration

### 2. **Backend API** (`app/routes/chains_ab_mode.py`)
New REST endpoints for A/B operations:
- `POST /api/chains/{chain_id}/duplicate` - Clone a chain
- `POST /api/chains/{chain_id}/blend` - Configure A/B blending
- `GET /api/chains/{chain_a_id}/compare/{chain_b_id}` - Compare chains
- `POST /api/chains/{chain_id}/morph` - Morph parameters between chains
- `GET /api/chains/{chain_id}/dsp-load` - Get DSP usage estimate

### 3. **Terminal UI** (`tui/chain_ab_mode.py`)
- Full-featured TUI for A/B operations
- Keyboard shortcuts (SPACE, A, B, X, L, D, arrows)
- Real-time blend visualization
- DSP load display
- Help system

### 4. **Integration Guide** (`AB_MODE_INTEGRATION_GUIDE.md`)
- Step-by-step integration instructions
- API usage examples
- Keyboard shortcut reference
- Workflow examples

### 5. **Neural DSP Research** (`NEURAL_DSP_INNOVATIONS.md`)
- 10 research-backed innovations inspired by Neural DSP
- Implementation priorities
- Research paper references

---

## 🎮 Features

### A/B Mode On Web
```
┌─────────────────────────────────────────┐
│ A/B MODE: ON                    [SPACE] │
├─────────────────────────────────────────┤
│                                         │
│  CHAIN A          BLEND        CHAIN B  │
│  ┌──────┐    ┌─────────┐    ┌──────┐   │
│  │Clean │    │ 50% ←→  │    │Dirty │   │
│  │ 8    │    │  Mix    │    │ 12   │   │
│  │CPU   │    │ Slider  │    │CPU   │   │
│  │45%   │    │         │    │62%   │   │
│  └──────┘    └─────────┘    └──────┘   │
│                                         │
│  [→A] [→B] [Swap] [Link] [Duplicate]    │
└─────────────────────────────────────────┘
```

### A/B Mode on TUI
```
╔════════════════════════════════════════════════════════════╗
║ A/B MODE: ON [LINKED]                      [SPACE]        ║
╠════════════════════════════════════════════════════════════╣
║ CHAIN A: Clean Lead         8 plugins  [a]                 ║
║ CPU: ✓ 45.2%                                               ║
║                                                            ║
║ BLEND: 50% (A←→B)                                          ║
║   ████████░░░░░░░░░░                                       ║
║   50% A / 50% B                                            ║
║                                                            ║
║ CHAIN B: Dirty Lead         12 plugins  [b]                ║
║ CPU: ✓ 62.3%                                               ║
╠════════════════════════════════════════════════════════════╣
║ [x]=Swap  [<>=]=Blend  [l]=Link  [d]=Duplicate  [h]=Help   ║
╚════════════════════════════════════════════════════════════╝
```

---

## ⌨️ Keyboard Shortcuts

### Web Interface
| Key | Action |
|-----|--------|
| SPACE | Toggle A/B Mode |
| ← | Decrease blend (more A) |
| → | Increase blend (more B) |

### TUI
| Key | Action |
|-----|--------|
| SPACE | Toggle A/B Mode |
| a | Select chain for position A |
| b | Select chain for position B |
| x | Swap chains (A ↔ B) |
| l | Link/unlink A/B pair |
| d | Duplicate chain |
| < | Blend decrease |
| > | Blend increase |
| [ | 100% A |
| ] | 100% B |
| = | 50/50 blend |
| h | Show help |

---

## 🔧 Integration Steps

### 1. Web UI Integration
The A/B mode component is already integrated into `ChainBuilder.tsx`:

```tsx
<ChainABMode
  chains={chains}
  selectedChainIdA={selectedChainIdA}
  selectedChainIdB={selectedChainIdB}
  onSelectChainA={setSelectedChainIdA}
  onSelectChainB={setSelectedChainIdB}
  onToggleABMode={setAbModeEnabled}
  onBlendChange={handleBlendChange}
  currentBlend={currentBlend}
  dspLoadA={dspLoadA}
  dspLoadB={dspLoadB}
/>
```

### 2. Backend Integration
Register new routes in `app/main.py`:

```python
from app.routes import chains_ab_mode
app.include_router(chains_ab_mode.router)
```

### 3. TUI Integration
Use in your terminal interface:

```python
from tui.chain_ab_mode import get_ab_mode_tui

ab_tui = get_ab_mode_tui()
ab_tui.set_chains(all_chains)
action = ab_tui.handle_input(key_pressed)
output = ab_tui.render()
```

---

## 🎯 Use Cases

### 1. **Song-to-Song Switching**
```
Chain A: Verse Lead (light compression, subtle reverb)
Chain B: Chorus Lead (heavy distortion, large reverb)
→ Live guitarist switches chains mid-song with footpedal
```

### 2. **Tone Blending**
```
Chain A: Clean 100% (bypass all effects)
Chain B: Heavily effected tone
→ Use blend slider to morph from clean to processed
```

### 3. **A/B Testing**
```
Chain A: Compressor → Delay → Reverb
Chain B: Compressor → Reverb → Delay
→ Compare effect order by ear with real-time switching
```

### 4. **Parallel Processing**
```
Chain A: Drums (aggressive compression)
Chain B: Drums (subtle dynamics)
→ Blend for parallel drum processing effect
```

---

## 🚀 Performance Considerations

### DSP Load Monitoring
- Each chain shows estimated CPU %
- Total load = Chain A + Chain B (when blended)
- Warning shown if combined load > 80%
- Per-plugin load breakdown available

### Latency Tracking
- Display latency for each chain
- Show total chain latency
- Warn if latency > 10ms (problematic for live use)

### Optimization Tips
- Use blend mode instead of running both chains at full DSP
- Bypass unused plugins in each chain
- Monitor DSP load before going live

---

## 📊 API Examples

### Create A/B Pair
```bash
# Duplicate Chain A as Chain B
POST /api/chains/1/duplicate
{
  "name": "Lead - Heavy",
  "include_settings": true
}

# Response
{
  "id": 2,
  "name": "Lead - Heavy",
  "plugins": [...],
  "duplicated_from": 1
}
```

### Configure Blending
```bash
POST /api/chains/1/blend
{
  "chain_a_id": 1,
  "chain_b_id": 2,
  "blend_position": 0.5,
  "enabled": true,
  "linked": true
}
```

### Get DSP Load
```bash
GET /api/chains/1/dsp-load

# Response
{
  "chain_id": 1,
  "total_dsp_load_percent": 45.2,
  "plugin_loads": [
    {"name": "Compressor", "estimated_cpu_percent": 3.0},
    {"name": "Reverb", "estimated_cpu_percent": 15.0},
    {"name": "Delay", "estimated_cpu_percent": 5.0}
  ],
  "warning": false
}
```

---

## 🔗 Related Features

- **Neural Network Effect Modeling** (#1 in innovations list) - Replace multiple plugins with single neural model
- **Parameter Interpolation** (#4) - Smooth morphing between chain configurations  
- **CPU Profiling** (#9) - Adaptive quality scaling based on system load
- **MIDI Learn** (#10) - Map footpedal/expression to A/B switching

---

## 📚 Files Created/Modified

### New Files
- `web/src/map2/components/ChainABMode.tsx` - Web A/B UI component
- `app/routes/chains_ab_mode.py` - Backend API routes
- `tui/chain_ab_mode.py` - Terminal UI component
- `AB_MODE_INTEGRATION_GUIDE.md` - Integration documentation
- `NEURAL_DSP_INNOVATIONS.md` - Research-backed ideas
- `DUAL_CHAIN_AB_IMPLEMENTATION.md` - This file

### Modified Files
- `web/src/map2/components/ChainBuilder.tsx` - Integrated A/B mode
- `app/main.py` - Register new routes (manual)

---

## ✅ Testing Checklist

- [ ] Web: Toggle A/B mode on/off
- [ ] Web: Select chains for A and B positions
- [ ] Web: Drag blend slider and hear changes
- [ ] Web: Create duplicate chain
- [ ] Web: Link chains as pair
- [ ] Web: View DSP load for each chain
- [ ] Web: Keyboard shortcuts work (arrows, space)
- [ ] TUI: Display renders correctly
- [ ] TUI: Keyboard input (a, b, x, l, d, arrows)
- [ ] TUI: Show help with 'h'
- [ ] API: `/chains/{id}/duplicate` works
- [ ] API: `/chains/{id}/blend` accepts config
- [ ] API: `/chains/{id}/dsp-load` returns estimates
- [ ] Audio: Blending produces audible output mix
- [ ] Performance: No audio dropouts with dual chains active

---

## 🎓 Next Steps

### Phase 1: Validation (Week 1)
- [ ] Test all features in development environment
- [ ] Verify audio blending works correctly
- [ ] Stress test with CPU-intensive chains
- [ ] Gather user feedback

### Phase 2: Refinement (Week 2-3)
- [ ] Add MIDI learn for A/B switching
- [ ] Implement chain morphing animations
- [ ] Add preset pair export/import
- [ ] Performance optimizations

### Phase 3: Advanced Features (Week 4+)
- [ ] Neural network effect modeling integration
- [ ] Parallel chain routing UI
- [ ] Advanced visualizations (waveform, spectrum)
- [ ] Mobile/touchscreen optimization

---

## 📖 Additional Resources

- [Modern Real-Time Audio Programming Course](https://github.com/Neural-DSP/modern-rt-audio-course) - DSP fundamentals
- [RTNeural Paper](https://arxiv.org/pdf/2106.03037.pdf) - Real-time neural audio inference
- [PiPedal Documentation](https://github.com/rerdavies/PiPedal) - Reference implementation
- [GuitarML Papers](https://github.com/GuitarML/mldsp-papers) - Audio ML research

---

Generated: January 20, 2026
Status: ✅ Complete - Ready for testing and integration
