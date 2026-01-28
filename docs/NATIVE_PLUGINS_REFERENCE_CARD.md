# Native Plugins Advanced Controls - Quick Reference Card

*Print this page or keep it open while developing*

---

## The Three Plugins at a Glance

```
┌─────────────────┬─────────────────┬─────────────────┐
│      NAM        │    CABINET      │     REVERB      │
├─────────────────┼─────────────────┼─────────────────┤
│  Neural Amp     │  Speaker Sim    │  Room Reverb    │
│  Modeler        │  (Impulse Resp) │  (Impulse Resp) │
├─────────────────┼─────────────────┼─────────────────┤
│ Controls:       │ Controls:       │ Controls:       │
│ • Model select  │ • IR select     │ • IR select     │
│ • Wet/dry mix   │ • Wet/dry mix   │ • Wet/dry mix   │
│ • Tone          │ • Damping       │ • Pre-delay     │
│ • Bypass        │ • Bypass        │ • Bypass        │
├─────────────────┼─────────────────┼─────────────────┤
│ Visualization:  │ Visualization:  │ Visualization:  │
│ • Level meters  │ • Frequency     │ • Decay curve   │
│ • Waveform      │   response      │ • Level meters  │
│ • Peak hold     │ • Level meters  │ • Peak hold     │
├─────────────────┼─────────────────┼─────────────────┤
│ Default Mix:    │ Default Mix:    │ Default Mix:    │
│ 100% (full)     │ 100% (full)     │ 30% (subtle)    │
├─────────────────┼─────────────────┼─────────────────┤
│ Color:          │ Color:          │ Color:          │
│ #ff6b9d         │ #ffb84d         │ #37d6c9         │
│ (Magenta)       │ (Orange)        │ (Cyan)          │
├─────────────────┼─────────────────┼─────────────────┤
│ Signal Pos:     │ Signal Pos:     │ Signal Pos:     │
│ Input Stage     │ Post-Amp        │ Post-Cabinet    │
└─────────────────┴─────────────────┴─────────────────┘
```

---

## Component File Map

```
web/src/app/
│
├── pages/
│   └── NativePluginsPage.tsx ..................... MAIN PAGE
│
├── components/
│   │
│   ├── NativePlugins/
│   │   ├── PluginCard.tsx ..................... Base card
│   │   ├── NAMCard.tsx ....................... Plugin 1
│   │   ├── CabinetIRCard.tsx ................. Plugin 2
│   │   ├── ReverbIRCard.tsx .................. Plugin 3
│   │   └── SignalFlowVisualization.tsx ....... Flow diagram
│   │
│   ├── Visualizations/
│   │   ├── AudioMeter.tsx .................... Level display
│   │   ├── FrequencyResponseChart.tsx ........ Cabinet viz
│   │   ├── ReverbTailChart.tsx ............... Decay curve
│   │   └── StatusBadge.tsx ................... Status icon
│   │
│   └── Controls/
│       └── ParameterSlider.tsx ............... Slider control
│
├── hooks/
│   └── useNativePlugins.ts .................... Data hook
│
├── styles/
│   └── native-plugins.css .................... All styles
│
└── map2/types/
    └── native-plugins.ts .................... TypeScript types
```

---

## API Endpoints Quick Reference

```
🎸 NAM ENDPOINTS
  GET  /api/nam/models              ← List models
  GET  /api/nam/status              ← Current status
  POST /api/nam/set-model/:name     ← Load model
  POST /api/nam/set-mix/:value      ← Set mix

🔊 CABINET ENDPOINTS
  GET  /api/ir/cabinets             ← List IRs
  GET  /api/ir/status?type=cabinet  ← Current status
  GET  /api/ir/cabinet-freq-response ← Freq data
  POST /api/ir/set-cabinet/:name    ← Load IR
  POST /api/ir/set-cabinet-mix/:val ← Set mix

🌊 REVERB ENDPOINTS
  GET  /api/ir/reverbs              ← List IRs
  GET  /api/ir/status?type=reverb   ← Current status
  GET  /api/ir/reverb-decay-tail    ← Decay data
  POST /api/ir/set-reverb/:name     ← Load IR
  POST /api/ir/set-reverb-mix/:val  ← Set mix
```

---

## TypeScript Types

```typescript
interface NAMStatus {
  available: boolean
  activeModel: string | null
  mix: number (0-100)
  bypass: boolean
  inputLevel: number (dB)
  outputLevel: number (dB)
  peakInput: number
  peakOutput: number
  latency: number
  availableModels: string[]
}

interface CabinetStatus {
  loaded: string | null
  mix: number (0-100)
  bypass: boolean
  inputLevel: number
  outputLevel: number
  peakInput: number
  peakOutput: number
  latency: number
  frequencyResponse: [{freq, magnitude}]
  availableIRs: [{name, size, length}]
}

interface ReverbStatus {
  loaded: string | null
  mix: number (0-100)
  bypass: boolean
  inputLevel: number
  outputLevel: number
  peakInput: number
  peakOutput: number
  latency: number
  decayTail: [{time, amplitude}]
  availableIRs: [{name, type, decay}]
  currentDecay: number
  preDelay: number
}
```

---

## CSS Class Structure

```css
.plugin-card                 ← Main card container
  ├── .plugin-card--nam     ← NAM specific
  ├── .plugin-card--cabinet ← Cabinet specific
  └── .plugin-card--reverb  ← Reverb specific

.plugin-card__header        ← Title bar
.plugin-card__icon          ← Icon container
.plugin-card__title         ← Title text
.plugin-card__status        ← Status indicator

.plugin-card__visualization ← Charts area
.plugin-card__controls      ← Sliders area
.plugin-card__info          ← Info panel

.audio-meter                ← Level meter
.status-badge               ← Status icon
  ├── .status-badge--active
  ├── .status-badge--inactive
  └── .status-badge--error
```

---

## Color Palette

```
Dark Theme:
  Background:    #0e1625
  Cards:         #141e32
  Text:          #f2f6ff
  Dividers:      rgba(255, 255, 255, 0.1)

Plugin Accents:
  NAM:           #ff6b9d ← Magenta/Purple
  Cabinet:       #ffb84d ← Orange/Amber
  Reverb:        #37d6c9 ← Cyan/Turquoise

Status:
  Active:        #10b981 ← Green
  Warning:       #f59e0b ← Yellow
  Error:         #ef4444 ← Red
  Inactive:      #6b7280 ← Gray
```

---

## Layout Breakpoints

```
Mobile:  < 640px   → 1 column
Tablet:  640-1024px → 2 columns  
Desktop: > 1024px  → 3 columns
```

---

## Component Hierarchy

```
NativePluginsPage (Main Page)
├── PageHeader
├── SignalFlowVisualization
├── PluginCard (x3)
│   ├── NAMCard
│   │   ├── AudioMeter (input)
│   │   ├── AudioMeter (output)
│   │   ├── ParameterSlider (mix)
│   │   └── StatusBadge
│   ├── CabinetIRCard
│   │   ├── FrequencyResponseChart
│   │   ├── AudioMeter (input)
│   │   ├── AudioMeter (output)
│   │   ├── ParameterSlider (mix)
│   │   └── StatusBadge
│   └── ReverbIRCard
│       ├── ReverbTailChart
│       ├── AudioMeter (input)
│       ├── AudioMeter (output)
│       ├── ParameterSlider (mix)
│       └── StatusBadge
└── StatsPanel
```

---

## Development Workflow

```
DAY 1-2: Setup
  ✓ Create folders
  ✓ Create types
  ✓ Setup API client

DAY 3-5: Components
  ✓ Build PluginCard
  ✓ Build AudioMeter
  ✓ Build NAMCard

DAY 6-8: More Components
  ✓ Build FrequencyResponseChart
  ✓ Build CabinetIRCard
  ✓ Build ReverbIRCard

DAY 9-10: Data Integration
  ✓ Create useNativePlugins hook
  ✓ Connect API calls
  ✓ Test with real data

DAY 11-12: Styling
  ✓ Add CSS
  ✓ Responsive design
  ✓ Animations

DAY 13-15: Testing
  ✓ Unit tests
  ✓ Integration tests
  ✓ Mobile testing

DAY 16-20: Polish
  ✓ Performance
  ✓ Accessibility
  ✓ Bug fixes
  ✓ Code review
```

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Page load | < 2s |
| Chart FPS | 60+ |
| API response | < 500ms |
| Update interval | 100ms |
| Bundle size | < 100KB added |

---

## Keyboard Shortcuts (For User)

```
Tab/Shift+Tab   ← Navigate between controls
Arrow Keys      ← Adjust sliders
Enter/Space     ← Toggle checkboxes
Alt+M           ← Focus NAM Mix
Alt+C           ← Focus Cabinet Mix
Alt+R           ← Focus Reverb Mix
```

---

## Common Issues & Quick Fixes

| Issue | Solution |
|-------|----------|
| Charts not rendering | Check ResponsiveContainer has parent width |
| Sliders not responding | Verify onChange handler connected |
| Data not updating | Check refetchInterval in useQuery |
| Mobile broken | Test CSS grid at breakpoints |
| High CPU usage | Reduce chart update frequency |
| Blurry on retina | Use SVG icons + vector graphics |

---

## Testing Checklist

```
Unit Tests:
  ☐ AudioMeter props handling
  ☐ ParameterSlider onChange
  ☐ StatusBadge states

Integration Tests:
  ☐ API data fetching
  ☐ Real-time updates
  ☐ All cards rendering

E2E Tests:
  ☐ Slider interaction
  ☐ Dropdown selection
  ☐ API integration
  ☐ Mobile flow

Accessibility:
  ☐ Keyboard nav
  ☐ Screen reader
  ☐ Color contrast
  ☐ Focus indicators
```

---

## Quick Commands

```bash
# Install dependencies
npm install recharts

# Start dev server
npm run dev

# Build for production
npm run build

# Run tests
npm run test

# Check accessibility
npx axe --dir ./src/app

# Profile performance
npm run analyze
```

---

## Documentation Quick Links

```
📄 NATIVE_PLUGINS_INDEX.md ............ This index
📄 NATIVE_PLUGINS_PLAN_SUMMARY.md .... High-level overview
📄 NATIVE_PLUGINS_UI_PLAN.md ......... Master plan & design
📄 NATIVE_PLUGINS_TECH_SPEC.md ....... Technical specs
📄 NATIVE_PLUGINS_QUICKSTART.md ...... Step-by-step guide
📄 NATIVE_PLUGINS_MOCKUPS.md ......... Visual mockups & code
```

---

## Success Metrics Checklist

```
Functional:
  ☐ All 3 plugins controllable
  ☐ Parameters updating correctly
  ☐ Real-time levels displaying

Visual:
  ☐ Professional appearance
  ☐ Consistent with design
  ☐ Responsive on all devices

Performance:
  ☐ 60+ FPS on main thread
  ☐ Charts smooth
  ☐ No lag on slider drag

Accessibility:
  ☐ WCAG 2.1 AA compliant
  ☐ Keyboard navigable
  ☐ Screen reader friendly

Testing:
  ☐ No console errors
  ☐ Full test coverage
  ☐ Mobile tested
```

---

## Key Decision Points

| Decision | Chosen | Reason |
|----------|--------|--------|
| Charting library | Recharts | Lightweight, responsive, TypeScript support |
| Update interval | 100ms | Feels real-time, performant |
| Layout | 3-column grid | All visible, responsive, industry standard |
| Color scheme | Dark with accents | Modern, WCAG compliant, fits brand |
| Responsive strategy | Mobile-first | Improves performance, UX |

---

## Before You Code

- [ ] Read NATIVE_PLUGINS_PLAN_SUMMARY.md (5 min)
- [ ] Skim NATIVE_PLUGINS_QUICKSTART.md (10 min)
- [ ] Ensure Node.js 16+ installed
- [ ] Install npm packages: `npm install recharts`
- [ ] Verify backend endpoints accessible
- [ ] Create git feature branch
- [ ] Set up code editor with TypeScript support

---

## During Development

- [ ] Keep NATIVE_PLUGINS_MOCKUPS.md open for code examples
- [ ] Reference NATIVE_PLUGINS_TECH_SPEC.md for APIs
- [ ] Follow NATIVE_PLUGINS_QUICKSTART.md phases
- [ ] Run tests frequently
- [ ] Commit regularly with clear messages
- [ ] Keep components small and focused

---

## After Completion

- [ ] Full test coverage (unit + E2E)
- [ ] Accessibility audit (axe DevTools)
- [ ] Performance audit (Lighthouse)
- [ ] Code review and approval
- [ ] Deploy to staging
- [ ] User testing
- [ ] Deploy to production
- [ ] Monitor for errors

---

## Contact & Questions

For implementation questions, refer to:
- **Code Examples**: NATIVE_PLUGINS_MOCKUPS.md
- **Component APIs**: NATIVE_PLUGINS_TECH_SPEC.md
- **Step-by-step Guide**: NATIVE_PLUGINS_QUICKSTART.md
- **Design Rationale**: NATIVE_PLUGINS_UI_PLAN.md

---

**Print This Page** ← Seriously, it helps during development!

**Last Updated**: January 22, 2026
**Status**: Ready for Implementation ✅

