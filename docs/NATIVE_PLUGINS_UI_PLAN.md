# Native Plugins Advanced Controls Page - Comprehensive Plan

## Executive Summary
Create a dedicated, state-of-the-art web page that showcases the three native plugins (NAM, IR Cabinet, IR Reverb) with advanced parameter controls, real-time visualizations, and professional audio plugin design patterns.

---

## 1. PLUGIN DISCOVERY & ANALYSIS

### The Three Native Plugins Identified:

#### 1.1 NAM Player (Neural Amp Modeler)
- **URI**: `urn:map2:nam-player`
- **Backend Class**: `NAMLoaderAdapter` (native_plugin_adapter.py)
- **Service**: `NAMProcessor` (nam_processor.py)
- **Current Parameters**:
  - `model`: String - Selected NAM model name
  - `mix`: Float (0.0-1.0) - Wet/dry mix
  - `bypass`: Boolean - Enable/disable
- **Purpose**: AI-based guitar amp and pedal modeling
- **Signal Flow Position**: Stage 1 (Input → NAM)

#### 1.2 IR Cabinet
- **URI**: `urn:map2:ir-cabinet`
- **Backend Class**: `CabinetIRLoaderAdapter` (native_plugin_adapter.py)
- **Service**: `IRProcessor` (ir_processor.py)
- **Current Parameters**:
  - `ir_file`: String - Selected cabinet IR filename
  - `mix`: Float (0.0-1.0) - Wet/dry mix
  - `bypass`: Boolean - Enable/disable
- **Purpose**: Speaker cabinet impulse response simulation
- **Signal Flow Position**: Stage 2 (NAM → Cabinet IR)

#### 1.3 IR Reverb
- **URI**: `urn:map2:ir-reverb`
- **Backend Class**: `ReverbIRLoaderAdapter` (native_plugin_adapter.py)
- **Service**: `IRProcessor` (ir_processor.py)
- **Current Parameters**:
  - `ir_file`: String - Selected reverb IR filename
  - `mix`: Float (0.0-1.0) - Wet/dry mix (default: 0.3)
  - `bypass`: Boolean - Enable/disable
- **Purpose**: Convolution-based room/space reverb simulation
- **Signal Flow Position**: Stage 3 (Cabinet → Reverb)

---

## 2. CURRENT WEB COMPONENT STRUCTURE

### Existing Components:
- **NativePluginsSection.tsx**: Grid container for 3 loader cards
- **NAMLoaderCard.tsx**: Simple card with model selection
- **CabinetIRLoaderCard.tsx**: Simple card with IR file selection
- **ReverbIRLoaderCard.tsx**: Simple card with IR file selection
- **Dialog Components**: 
  - NAMManagerDialog.tsx
  - CabinetIRManagerDialog.tsx
  - ReverbIRManagerDialog.tsx

### Current Styling:
- Located in `/home/mm/map2-audio/web/src/index.css` (lines 726-823)
- Uses CSS classes: `.loader-card`, `.loader-card-header`, `.loader-card-icon`, etc.
- Color scheme: Dark theme with cyan accents (#37d6c9)
- Responsive grid: `grid three` (3-column layout)

---

## 3. MODERN AUDIO PLUGIN UI RESEARCH & DESIGN PATTERNS

### Industry Standards Observed:
1. **Professional Mixing Consoles** (Soundcraft, Behringer):
   - Multi-section card layouts with clear visual hierarchy
   - Real-time metering and visualization
   - Grouped controls by function
   - Large touch targets on mobile

2. **DAW Plugin Design** (Modern Trends):
   - Frequency response visualizers (EQ, Cabinet simulation)
   - Input/output level meters with peak detection
   - Waveform displays for reverb tail visualization
   - Gradient backgrounds for depth
   - Icon-based identification with subtle animations

3. **State-of-the-Art Elements**:
   - Glassmorphism/Neumorphism for modern appeal
   - Animated visualizations (spectrum, waveform)
   - Smooth transitions and hover states
   - Responsive charts (Recharts, Chart.js compatible)
   - Real-time spectrum analysis

---

## 4. PROPOSED PAGE ARCHITECTURE

### 4.1 Page Structure
**File**: `/home/mm/map2-audio/web/src/app/pages/NativePluginsPage.tsx`

```
┌─────────────────────────────────────────────────────────┐
│           PAGE HEADER: "Native Audio Processors"         │
│         Subtitle + Description of signal flow           │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│            SIGNAL FLOW VISUALIZATION BAR                │
│  Input → [NAM] → [Cabinet] → [Reverb] → Output         │
└─────────────────────────────────────────────────────────┘

┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│   NAM CARD       │ │  CABINET IR CARD │ │  REVERB IR CARD  │
│  (Advanced)      │ │  (Advanced)      │ │  (Advanced)      │
│                  │ │                  │ │                  │
│  - Controls      │ │  - Controls      │ │  - Controls      │
│  - Meters        │ │  - Frequency Viz │ │  - Tail Viz      │
│  - Status        │ │  - Status        │ │  - Status        │
└──────────────────┘ └──────────────────┘ └──────────────────┘

┌─────────────────────────────────────────────────────────┐
│        GLOBAL AUDIO STATISTICS & MONITORING             │
│         (Master levels, Processing time)                │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Card Components (3 Main Cards)

Each card will be a comprehensive React component with:
- **Header**: Plugin name, icon, status indicator
- **Visualization Area**: Graph/meter specific to plugin
- **Controls Section**: Sliders, buttons, selectors
- **Info Panel**: Current values, stats, monitoring

---

## 5. DETAILED CARD DESIGNS

### 5.1 NAM (Neural Amp Modeler) Card

**Visual Design**:
- Icon: Amplifier/Speaker with neural network accent
- Color scheme: Purple/Indigo gradients (warm amp character)
- Visualization: **Input Level Meter + Waveform Preview**

**Advanced Controls**:
```
┌─────────────────────────────────────┐
│ 🎸 NAM PLAYER                   [⚡] │  ← Icon + Status badge
├─────────────────────────────────────┤
│                                     │
│  ┌───────────────────────────────┐  │
│  │  Input Level Meter            │  │  ← Real-time VU meter
│  │  ▐███████░░░░░░ -6dB          │  │
│  │  Output Wave [════════════]   │  │  ← Waveform visualization
│  └───────────────────────────────┘  │
│                                     │
│  Model: [Dropdown: "My Amp v2" ▼]   │  ← Model selector
│                                     │
│  Wet/Dry Mix:  ●─────────── 100%   │  ← Fader with value
│  Tone:         ●─────────── 50%    │  ← Additional tone control
│                                     │
│  □ Bypass        [Reset Model]     │  ← Actions
│                                     │
│  Status: "Model loaded, 0.5ms" ✓    │  ← Info panel
└─────────────────────────────────────┘
```

**Visualization Details**:
- Live input/output level meters (VU-style, -∞ to +12dB)
- Real-time waveform display (oscilloscope style)
- Model info: Name, author, load time, latency
- Peak hold indicators

**Key Parameters**:
- Model selector (dropdown with available models)
- Wet/dry mix slider (0-100%)
- Optional: Tone controls (if available in NAM)
- Bypass toggle

---

### 5.2 IR Cabinet Card

**Visual Design**:
- Icon: Speaker cabinet with frequency visualization
- Color scheme: Orange/Amber gradients (warm, woody character)
- Visualization: **Frequency Response Chart + Input/Output Meters**

**Advanced Controls**:
```
┌─────────────────────────────────────┐
│ 🔊 CABINET IR                    [◉] │  ← Icon + Status (active)
├─────────────────────────────────────┤
│                                     │
│  ┌───────────────────────────────┐  │
│  │  Frequency Response (dB)      │  │  ← Chart showing cabinet
│  │    ┌─────┐                    │  │     coloration/response
│  │ 0 │     └─────────┐           │  │
│  │   │               └─────      │  │
│  │-12│                    └──    │  │
│  │   └──────────────────────────┘  │
│  │   20Hz  100Hz  1kHz  10kHz 20kHz│
│  │                                 │
│  │  In: ▐███░░░  -12dB  Out: ▐████░ -9dB  │
│  └───────────────────────────────┘  │
│                                     │
│  Cabinet: [Dropdown: "1x12 Celestion" ▼] │
│                                     │
│  Wet/Dry Mix:  ●─────────── 100%   │
│  Damping:      ●─────────── 75%    │
│                                     │
│  □ Bypass        [Browse IRs...]   │
│                                     │
│  Latency: 2048 samples    Size: 1.2s │
└─────────────────────────────────────┘
```

**Visualization Details**:
- Frequency response curve (20Hz - 20kHz range)
- Input/output level meters (color-coded)
- IR file size and latency information
- Cabinet type descriptor

**Key Parameters**:
- IR file selector (dropdown with uploaded IRs)
- Wet/dry mix slider (0-100%)
- Optional: Damping control (if supported)
- Bypass toggle

---

### 5.3 IR Reverb Card

**Visual Design**:
- Icon: Room/Space with reflections
- Color scheme: Blue/Cyan gradients (spacious, airy character)
- Visualization: **Reverb Tail Decay Chart + Pre-delay/Decay Controls**

**Advanced Controls**:
```
┌─────────────────────────────────────┐
│ 🌊 REVERB IR                     [◉] │  ← Icon + Status
├─────────────────────────────────────┤
│                                     │
│  ┌───────────────────────────────┐  │
│  │  Reverb Tail Decay            │  │  ← Energy decay curve
│  │  (Linear Amplitude)           │  │
│  │  │                            │  │
│  │ 0├─────┐                      │  │
│  │  │      └────┐                │  │
│  │ -│           └─────┐          │  │
│  │ ││                  └────┐    │  │
│  │ ││                       └────┤  │
│  │ ││                            │  │
│  │ └┴────────────────────────────┤  │
│  │  0ms   1s    2s    3s   4s    │  │
│  └───────────────────────────────┘  │
│                                     │
│  Reverb Space: [Dropdown: "Large Hall" ▼]  │
│                                     │
│  Wet/Dry Mix:  ●─────────── 30%    │  ← Lower default
│  Pre-delay:    ●─────────── 50ms   │
│  Decay Time:   ●─────────── 2.5s   │
│                                     │
│  □ Bypass        [Browse IRs...]   │
│                                     │
│  Type: "Large Room"  Decay: 2.8s   │
└─────────────────────────────────────┘
```

**Visualization Details**:
- Reverb tail decay visualization (energy over time)
- Pre-delay visualization on timeline
- Decay time (RT60) calculation
- Room type descriptor

**Key Parameters**:
- IR file selector (dropdown with reverb IRs)
- Wet/dry mix slider (0-100%, default 30%)
- Pre-delay slider (0-500ms)
- Optional: Decay time adjustment
- Bypass toggle

---

## 6. SHARED VISUALIZATION COMPONENTS

### 6.1 Meter Component
```typescript
// ReusableAudioMeter.tsx
- Props: current, peak, min, max, unit (dB/percent)
- Features: Peak hold, color scaling, smooth animation
- Renders: Horizontal bar with values
```

### 6.2 Chart Components (Using Recharts)
```typescript
// FrequencyResponseChart.tsx
- Props: data points (freq, magnitude)
- Type: Smooth line chart
- Features: Logarithmic frequency scale, dB magnitude

// ReverbTailChart.tsx
- Props: impulse response data points
- Type: Area chart with decay curve
- Features: Time domain visualization, energy scale
```

### 6.3 Status Badge Component
```typescript
// StatusBadge.tsx
- Props: active, processing, error
- Features: Animated indicators, color feedback
```

---

## 7. DATA FLOW & API INTEGRATION

### Backend Endpoints Required:
```
GET  /api/nam/models              → List available models
GET  /api/nam/status              → Current model + mix level
POST /api/nam/set-model/:name     → Load specific model
POST /api/nam/set-mix/:value      → Set wet/dry mix

GET  /api/ir/cabinets             → List cabinet IRs
GET  /api/ir/status               → Current cabinet + mix
POST /api/ir/set-cabinet/:name    → Load cabinet IR
POST /api/ir/set-cabinet-mix/:val → Set cabinet mix

GET  /api/ir/reverbs              → List reverb IRs
POST /api/ir/set-reverb/:name     → Load reverb IR
POST /api/ir/set-reverb-mix/:val  → Set reverb mix

GET  /api/audio/levels            → Real-time levels (input/output)
GET  /api/audio/spectrum          → Real-time spectrum data
GET  /api/system/processing-stats → Processing time, latency
```

### Real-time WebSocket Updates:
- Audio level changes (10-50ms intervals)
- Spectrum/frequency data (100ms intervals)
- Status changes (model loaded, bypass, etc.)

---

## 8. ARTWORK & VISUAL ASSETS

### 8.1 Plugin Icons (SVG)
- **NAM**: Amp/speaker with neural network pattern
- **Cabinet**: Speaker cabinet with frequency visualization accent
- **Reverb**: Room/space icon with wave reflections

### 8.2 Gradients & Color Schemes
```css
/* NAM - Warm Amp Character */
--nam-gradient: linear-gradient(135deg, #2d1b4e, #5a2d8f)
--nam-accent: #ff6b9d

/* Cabinet - Woody Warmth */
--cabinet-gradient: linear-gradient(135deg, #3d2817, #8b5a2b)
--cabinet-accent: #ffb84d

/* Reverb - Spatial Depth */
--reverb-gradient: linear-gradient(135deg, #0a3f51, #1e6f7f)
--reverb-accent: #37d6c9
```

### 8.3 Background Artwork
- Subtle SVG patterns (amp grilles, speaker cones, reflections)
- Animated gradient backgrounds on hover
- Glassmorphism effect (semi-transparent backdrop blur)

### 8.4 Download Resources:
- NAM model artwork: https://www.neuralampmodeler.com/
- Cabinet reference images: Professional cabinet photos (free from Unsplash)
- Room/space backgrounds: Abstract spatial imagery

---

## 9. IMPLEMENTATION ROADMAP

### Phase 1: Foundation (Week 1-2)
1. Create NativePluginsPage.tsx shell
2. Implement PageHeader and SignalFlowVisualization
3. Create base card component architecture
4. Set up API client calls for data fetching

### Phase 2: Visualization Components (Week 2-3)
1. Build AudioMeter component (with animation)
2. Create FrequencyResponseChart (Recharts)
3. Create ReverbTailChart
4. Implement real-time data streaming

### Phase 3: Plugin Cards (Week 3-4)
1. Implement NAMCard with visualizations
2. Implement CabinetIRCard with frequency response
3. Implement ReverbIRCard with decay visualization
4. Add control sliders and selectors

### Phase 4: Polish & Enhancement (Week 4-5)
1. Add animations and transitions
2. Implement hover effects
3. Add responsive design for mobile/tablet
4. Performance optimization

### Phase 5: Testing & Deployment (Week 5-6)
1. E2E testing with audio API
2. Visual regression testing
3. Accessibility audit (WCAG 2.1)
4. Documentation and deployment

---

## 10. TECHNOLOGY STACK

### Frontend Libraries:
- **React 18+**: UI framework
- **Recharts**: Real-time charting
- **Lucide React**: Icons
- **TanStack React Query**: Data fetching
- **Framer Motion** (optional): Advanced animations

### CSS/Styling:
- **Tailwind CSS** (if available) or vanilla CSS
- **CSS Animations**: Smooth transitions
- **CSS Grid/Flexbox**: Responsive layout

### State Management:
- **React Query**: Server state
- **React Hooks**: Local state
- **Context API** (optional): Theme/global config

---

## 11. RESPONSIVE DESIGN CONSIDERATIONS

### Breakpoints:
```css
Mobile:    < 640px   (1 card per row)
Tablet:    640-1024px (2 cards per row)
Desktop:   > 1024px  (3 cards per row)
```

### Touch Targets:
- Minimum 44x44px for interactive elements
- Larger sliders for mobile (48px height)
- Swipe support for mobile chart navigation

---

## 12. ACCESSIBILITY REQUIREMENTS

- WCAG 2.1 Level AA compliance
- Semantic HTML with ARIA labels
- Keyboard navigation support
- Color contrast ratios > 4.5:1
- Screen reader friendly chart descriptions
- Reduced motion support (@prefers-reduced-motion)

---

## 13. FILE STRUCTURE

```
web/src/app/
├── pages/
│   └── NativePluginsPage.tsx          # Main page
├── components/
│   ├── NativePlugins/
│   │   ├── NativePluginsPage.tsx
│   │   ├── SignalFlowVisualization.tsx
│   │   ├── PluginCard.tsx             # Base card
│   │   ├── NAMCard.tsx
│   │   ├── CabinetIRCard.tsx
│   │   ├── ReverbIRCard.tsx
│   │   └── PluginCardCommon.tsx
│   ├── Visualizations/
│   │   ├── AudioMeter.tsx
│   │   ├── FrequencyResponseChart.tsx
│   │   ├── ReverbTailChart.tsx
│   │   ├── Waveform.tsx
│   │   └── StatusBadge.tsx
│   └── Controls/
│       ├── ParameterSlider.tsx
│       ├── ModelSelector.tsx
│       └── IRFileSelector.tsx
├── styles/
│   └── native-plugins.css             # Dedicated styles
└── hooks/
    └── useNativePlugins.ts            # Custom hook for data
```

---

## 14. ESTIMATED METRICS

### Performance Targets:
- Initial load: < 2s
- Visualization update: 60fps
- Chart render: < 100ms
- API response: < 500ms

### Bundle Size Impact:
- Recharts: ~50KB (gzipped)
- New components: ~30KB (gzipped)
- Total addition: ~80-100KB

---

## 15. FUTURE ENHANCEMENTS

1. **Preset Management**: Save/load plugin configurations
2. **AB/Bypass Switching**: Compare wet vs. dry in real-time
3. **Spectrum Analyzer**: Full FFT visualization
4. **Recording/Capture**: Save processed audio samples
5. **Plugin Chaining UI**: Reorder plugins visually
6. **Advanced Metering**: Loudness (LUFS), Crest Factor
7. **Parameter Automation**: Record parameter changes over time
8. **Convolver GPU Acceleration**: Real-time IR convolution visualization

---

## 16. SUCCESS CRITERIA

✅ All 3 plugins have dedicated advanced control interface
✅ Real-time visualization updating at 30+ fps
✅ Professional appearance matching modern DAW standards
✅ Responsive design working on mobile/tablet/desktop
✅ Full accessibility compliance (WCAG 2.1 AA)
✅ API integration complete and tested
✅ Documentation for future maintainers
✅ Performance within target metrics
✅ User feedback indicates improvement over current UI

---

## Summary

This plan creates a **state-of-the-art, professional-grade audio plugin interface** for MAP2's three native processors. The design draws inspiration from industry leaders (Soundcraft, Behringer) while maintaining the project's modern aesthetic.

The 3-card layout provides:
- **Visual clarity** through dedicated plugin spaces
- **Real-time feedback** via meters and charts
- **Advanced controls** for power users
- **Professional appearance** with contemporary design patterns
- **Scalability** for future plugin additions

**Estimated Timeline**: 4-6 weeks for full implementation
**Development Priority**: High impact on user experience

