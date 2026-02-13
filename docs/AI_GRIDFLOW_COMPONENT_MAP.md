# GridFlow Page — Component Architecture Map for AI Assistants

> **Created**: 2026-02-12  
> **Purpose**: Prevent future AIs from editing dead-code files instead of the real rendering components.

---

## ⚠️ CRITICAL LESSON LEARNED

### The Problem That Wasted Multiple Build Cycles

An AI assistant was asked to apply Tron-inspired styling to the Grid page (`/grid`). It found
`JuceAudioGraphViz.tsx` — a large D3.js/dagre-based graph visualization component — and applied
all styling changes there. **Multiple `vite build` + `vite preview` cycles** were run, each
producing the identical bundle hash (`GridFlowPage-CDk22wZM.js`), because:

> **`JuceAudioGraphViz` is dead code. It is not imported by any component in the application.**

The Tron colors were never compiled into the bundle because Vite's tree-shaking correctly
eliminated the unused component. The hash never changed because the *actually-used* source
files were never modified.

### How to Verify Before Editing

**ALWAYS verify a component is actually used before editing it:**

```bash
# Check if a component appears in the production bundle
grep -c 'ComponentName' dist/assets/PageName-*.js

# Check if a component is imported anywhere in the source
grep -rn 'import.*ComponentName' web/src/app/

# Check all exports from a barrel file that are actually consumed
grep -rn 'from.*GridFlow' web/src/app/pages/GridFlowPage.tsx
```

---

## Grid Page Component Architecture

### Route: `/grid` → `GridFlowPage.tsx`

```
web/src/app/pages/GridFlowPage.tsx (2,702 lines)
├── FlowRoutingVisualizer.tsx    ← SVG signal flow topology (IN → A → B → OUT)
├── SignalGrid.tsx               ← Container for plugin chain per flow
│   ├── SignalGridRow.tsx        ← Horizontal row of plugins with connectors
│   │   └── PluginCardShell     ← Individual plugin card in the flow
│   └── ChainEndpoint.tsx       ← INPUT/OUTPUT audio I/O cards at edges
├── ParameterEditor.tsx          ← Rotary knob parameter editing panel
├── ChainManagementCard          ← Chain selector cards (matt, Eddie, etc.)
├── FlowAssignmentDialog.tsx     ← Node assignment dialog
├── FlowSnapshots.tsx            ← Snapshot save/load panel
├── PortSelectorDialog           ← Audio port selection
└── AutomationTimeline.tsx       ← Automation lane editor
```

### Key Files to Edit for Visual Changes

| What You See on Screen | File to Edit | Location |
|---|---|---|
| **Flow colors** (A=cyan, B=magenta, etc.) | `GridFlowPage.tsx` | `SLOT_COLORS` constant (~line 135) |
| **Signal flow diagram** (IN → A → B → OUT with animated dashes) | `FlowRoutingVisualizer.tsx` | `WIRE_COLOR`, `WIRE_ACTIVE`, `IoNode`, `FlowNode` |
| **Flow row containers** (background, borders, shadows) | `index.css` | `.grid-flow-slot`, `.grid-flow-header`, `.grid-flow-slot-title` |
| **Plugin cards** in the signal chain | `PluginCardShell` | Separate component tree |
| **INPUT/OUTPUT cards** | `ChainEndpoint.tsx` | Via SignalGrid |
| **Page background & header gradient** | `index.css` | `.grid-flow-page`, `.grid-flow-header` |

### Files That Are NOT Used (Dead Code)

| File | Why It Exists | Used? |
|---|---|---|
| `JuceAudioGraphViz.tsx` | D3.js + dagre graph viz, was an early prototype | ❌ **NEVER IMPORTED** |

### Color Palette (Current — Tron-Inspired)

| Slot | Color | Hex | Usage |
|---|---|---|---|
| A | Cyan | `#00d9ff` | Primary flow, IN terminal |
| B | Magenta | `#ff006e` | Secondary flow |
| C | Green | `#00ff9f` | Tertiary flow, OUT terminal |
| D | Amber | `#ffbe0b` | Quaternary flow |
| E | Purple | `#a239ca` | Quinary flow |
| F | Cyan | `#00d9ff` | Senary flow |

### Wire/SVG Colors

| Element | Color | File |
|---|---|---|
| Wire (inactive) | `rgba(0, 217, 255, 0.15)` | `FlowRoutingVisualizer.tsx` → `WIRE_COLOR` |
| Wire (active) | `rgba(0, 217, 255, 0.5)` | `FlowRoutingVisualizer.tsx` → `WIRE_ACTIVE` |
| IN terminal | `#00d9ff` (cyan) | `FlowRoutingVisualizer.tsx` → `IoNode` color prop |
| OUT terminal | `#00ff9f` (green) | `FlowRoutingVisualizer.tsx` → `IoNode` color prop |
| Header gradient | `#0a1628 → #050d18 → #030a14` | `index.css` → `.grid-flow-header` |
| Header border | `rgba(0, 217, 255, 0.15)` | `index.css` → `.grid-flow-header` |

---

## Build Verification Checklist

After making visual changes to the Grid page, always verify:

```bash
# 1. Build
cd web && npx vite build

# 2. Check the hash changed (should be DIFFERENT from previous)
ls dist/assets/GridFlowPage-*.js

# 3. Verify your colors are in the bundle
grep -c 'YOUR_HEX_COLOR' dist/assets/GridFlowPage-*.js
# Must return > 0

# 4. For CSS changes, check the CSS bundle
grep -c 'YOUR_CSS_VALUE' dist/assets/index-*.css

# 5. Kill old preview and start fresh
sudo pkill -9 -f "vite preview"
npx vite preview --host 0.0.0.0 --port 3000
```

### If the Hash Doesn't Change

If the bundle hash is identical after a build, your changes are in a file that
is **not imported** by the component tree. Run:

```bash
# Find what the page actually imports
grep -n 'import' web/src/app/pages/GridFlowPage.tsx | head -30

# Check barrel exports
cat web/src/app/components/GridFlow/index.ts

# Verify your file is imported somewhere
grep -rn 'YourComponent' web/src/app/ --include='*.tsx' --include='*.ts'
```

---

## Routing Modes (FlowRoutingVisualizer)

The visualizer supports 5 routing topologies, each rendered by a separate function:

| Mode | Function | Description |
|---|---|---|
| `parallel_blend` | `renderParallel()` | Split → flows side-by-side → mix → output |
| `series` | `renderSeries()` | Input → Flow A → Flow B → ... → output |
| `ab_switch` | `renderABSwitch()` | Only the selected flow is active |
| `parameter_morph` | `renderMorph()` | Crossfade between two flow parameter sets |
| `sidechain` | `renderSidechain()` | Primary flow + sidechain source indicator |

Each function uses `IoNode` (IN/OUT terminals), `FlowNode` (circle badges), `Wire`/`CurvedWire`
(connecting paths), and `Junction` (split/merge dots).
