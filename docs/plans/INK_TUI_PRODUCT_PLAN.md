# MAP2 Ink TUI — Product & Architecture Plan

> **Created**: 2026-03-25
> **Status**: Planning complete — ready for implementation
> **Epic**: T412
> **Type**: New product surface (standalone terminal interface)

---

## A. Executive Summary

The MAP2 Ink TUI is a **standalone, first-class terminal interface** for the MAP2 Audio Platform, built with React + Ink. It provides a keyboard-driven, SSH-accessible control surface for audio engineers operating MAP2 in headless, remote, live-performance, and rack-mounted scenarios where a browser is unavailable, impractical, or slower than terminal workflow.

**Why it should exist:**

1. **Headless operation** — MAP2 runs on rack-mounted Linux machines accessed via SSH. A browser requires X11 forwarding or a separate device. A TUI runs natively in the SSH session.
2. **Live performance** — During a show, a terminal with large-font keypresses is faster and more reliable than mouse-driven browser UI. No accidental tab closes, no browser crashes, no latency from remote desktop.
3. **Operational monitoring** — Sysadmins and audio techs need real-time metering, CPU stats, PipeWire health, and device status without opening a browser.
4. **Multi-node fleet management** — SSH into any node, view the cluster, switch context — all without leaving the terminal.
5. **React code reuse** — Ink uses real React (hooks, state, effects, JSX). The existing API layer (`api.ts`), types (`types.ts`), WebSocket client (`websocket.ts`), Zustand stores, and React Query hooks can be shared with zero rewrite.

**What makes it first-class:**

- It is not a debug tool. It is a product surface with its own UX, screen map, keybinding system, and polish.
- It has a complete interaction model designed for terminal-native usage, not a degraded web experience.
- It is independently deployable, testable, and maintainable.
- It targets the same backend APIs as the web GUI — no separate backend work required.

---

## B. Product Principles

1. **Terminal-native first** — Every interaction is designed for keyboard. Mouse is optional. No interaction requires a mouse.
2. **Information density over decoration** — Terminals excel at dense, structured data. Use this strength. No whitespace waste.
3. **Instant response** — No loading spinners longer than one render cycle. Show stale data with a refresh indicator rather than blank screens.
4. **Discoverable without coaching** — Status bar shows available keys. Help overlay is always one keypress away. No wizard flows.
5. **Operational safety** — Destructive actions require explicit confirmation. State changes show before/after. No silent mutations.
6. **Portable React** — Share hooks, stores, API clients, types, and business logic with the web GUI. Only the rendering layer is terminal-specific.
7. **Zero web dependency** — The TUI never imports from `web/src/app/components/` or `web/src/app/pages/`. It imports only from `web/src/map2/` (shared domain layer).
8. **Respect the terminal** — Works in 80×24. Degrades gracefully. Supports 256-color and truecolor but functions in 16-color. No assumptions about font or ligatures.

---

## C. Conversion Strategy

### Portable React Patterns (reuse directly)

| Web Pattern | TUI Reuse | Notes |
|---|---|---|
| React hooks (`useState`, `useEffect`, `useMemo`, `useCallback`) | Direct | Identical API in Ink |
| React Query (`useQuery`, `useMutation`, `queryClient`) | Direct | Works in any React environment |
| Zustand stores (`graphStore`, `viewedNodeStore`, etc.) | Direct | Framework-agnostic |
| WebSocket client (`Map2WebSocket`, topic subscriptions) | Direct | Pure JS, no DOM dependency |
| REST API client (`api.ts` — `chainsApi`, `pluginsApi`, etc.) | Direct | Uses `fetch`, works in Node.js |
| TypeScript types (`types.ts`) | Direct | Shared type contracts |
| Custom hooks (`useCPUMetrics`, `useLatency`, etc.) | Direct* | *If they don't import React DOM or Carbon |
| React Context (`ClusterContext`) | Direct | Standard React API |
| Business logic (request batching, error handling) | Direct | Pure functions |

### Non-Portable Web Assumptions (must not carry over)

| Web Assumption | Why It Breaks | Terminal Reality |
|---|---|---|
| CSS layout (flexbox, grid, `@media`) | Terminals use character cells, not pixels | Ink `<Box>` uses Yoga flexbox (subset) |
| Carbon Design System components | DOM-specific, CSS-dependent | Must build terminal primitives |
| Mouse-first interaction (click, hover, drag) | Terminal input is keyboard-first | Keybinding + focus cycling |
| Infinite canvas width | Terminals have fixed columns | Must measure and wrap |
| Color via CSS variables | Terminal uses ANSI escape codes | Ink `<Text color="">` / chalk |
| Framer Motion / CSS animations | No animation runtime in terminal | Static or frame-based updates |
| React Router DOM | Depends on `window.location` | Custom screen stack / state machine |
| `localStorage` | No browser storage in Node.js | File-based persistence (`~/.map2/tui.json`) |
| SVG / Canvas / Three.js / D3 | No pixel rendering in terminal | ASCII art, sparklines, box-drawing characters |
| `window.innerWidth` / responsive breakpoints | No `window` object | `process.stdout.columns` / `process.stdout.rows` |

### Terminal-Native Replacements

| Web UX | Terminal Replacement |
|---|---|
| Sidebar navigation | Tab bar + screen stack with `Tab`/`Shift+Tab` |
| Modal dialogs | Full-screen overlay with `Esc` to dismiss |
| Dropdown selects | Filterable list with arrow keys |
| Data tables with click-to-sort | Tables with `j`/`k` navigation, column sort via `/` |
| Toast notifications | Status bar messages with auto-dismiss timer |
| Tabs (Carbon `Tabs`) | Horizontal tab row with `[`/`]` to switch |
| Breadcrumbs | Header line showing `Screen > Subview` path |
| Drag-and-drop reorder | `Shift+↑`/`Shift+↓` to move items |
| Color-coded status badges | ANSI-colored status markers: `●` green, `●` red, `○` gray |
| Charts (Recharts) | Sparkline characters `▁▂▃▄▅▆▇█` or `asciichart` |
| Spectrum analyzer | Horizontal bar graph per frequency band |
| Plugin card grid | Vertical list with inline parameter display |
| Mega menu | Command palette (fuzzy search) |

### What Must Be Redesigned (not just translated)

1. **Navigation** — Web uses URL routing with back/forward. TUI uses a screen stack with push/pop. No URL bar, no bookmarks. The command palette (`Ctrl+P`) replaces the advanced menu.

2. **Signal flow visualization** — The JUCE Grid 3D canvas and MPX1 flow canvas cannot render in a terminal. Replace with a **text-mode signal chain view**: `[Input] → [NAM] → [Cab IR] → [EQ] → [Comp] → [Reverb] → [Output]` with cursor selection to inspect/edit each block.

3. **Real-time metering** — VU meters become horizontal bar characters. Spectrum becomes per-band bars. Phase correlation becomes a single character indicator. Refresh rate capped at 10 Hz to avoid terminal flicker.

4. **AVB routing matrix** — The CSS Grid matrix becomes a navigable ASCII table with row/column headers and `x`/`○` markers for connections.

5. **Form editing** — Web forms use controlled inputs with immediate feedback. TUI forms use a modal editor pattern: navigate to field, press Enter to edit, type value, press Enter to confirm, Esc to cancel.

---

## D. Proposed Architecture

### Application Structure

```
tui/
├── package.json              # Ink + React + shared deps
├── tsconfig.json
├── src/
│   ├── main.tsx              # Entry point — renders <App /> with Ink
│   ├── App.tsx               # Root: providers + screen router
│   ├── config.ts             # TUI-specific config (~/.map2/tui.json)
│   │
│   ├── shell/                # Application shell
│   │   ├── AppShell.tsx      # Header + content + status bar + help overlay
│   │   ├── Header.tsx        # Screen title + breadcrumb + node indicator
│   │   ├── StatusBar.tsx     # Keybindings + connection status + clock
│   │   ├── HelpOverlay.tsx   # Full-screen help (toggle with ?)
│   │   └── CommandPalette.tsx # Fuzzy screen search (Ctrl+P)
│   │
│   ├── screens/              # Top-level screens (one per major view)
│   │   ├── HomeScreen.tsx
│   │   ├── AudioGridScreen.tsx
│   │   ├── MeteringScreen.tsx
│   │   ├── MidiHubScreen.tsx
│   │   ├── Mpx1Screen.tsx
│   │   ├── PipeWireScreen.tsx
│   │   ├── CpuScreen.tsx
│   │   ├── DevicesScreen.tsx
│   │   ├── ClusterScreen.tsx
│   │   ├── AvbScreen.tsx
│   │   ├── TesiraScreen.tsx
│   │   ├── ArtifactsScreen.tsx
│   │   ├── SettingsScreen.tsx
│   │   └── DiagnosticsScreen.tsx
│   │
│   ├── panels/               # Composable sub-views within screens
│   │   ├── ParameterEditor.tsx
│   │   ├── PluginList.tsx
│   │   ├── ChainDetail.tsx
│   │   ├── MidiMappingPanel.tsx
│   │   ├── DeviceStatusPanel.tsx
│   │   └── ...
│   │
│   ├── components/           # Reusable TUI primitives
│   │   ├── DataTable.tsx
│   │   ├── FilterableList.tsx
│   │   ├── FormField.tsx
│   │   ├── ProgressBar.tsx
│   │   ├── Sparkline.tsx
│   │   ├── VuMeter.tsx
│   │   ├── StatusDot.tsx
│   │   ├── TabBar.tsx
│   │   ├── ConfirmDialog.tsx
│   │   ├── Toast.tsx
│   │   ├── Spinner.tsx
│   │   ├── Badge.tsx
│   │   ├── KeyHint.tsx
│   │   └── BoxPanel.tsx
│   │
│   ├── hooks/                # TUI-specific hooks
│   │   ├── useScreenRouter.ts
│   │   ├── useFocusManager.ts
│   │   ├── useKeybindings.ts
│   │   ├── useTerminalSize.ts
│   │   ├── useStatusBar.ts
│   │   └── useFileConfig.ts
│   │
│   ├── navigation/           # Screen routing and history
│   │   ├── ScreenRouter.tsx
│   │   ├── screenRegistry.ts
│   │   └── types.ts
│   │
│   └── theme/                # ANSI color system
│       ├── colors.ts
│       └── borders.ts
```

### Shared Code Strategy

The TUI imports from the **existing shared domain layer** at `web/src/map2/`:

```
web/src/map2/          ← SHARED (imported by both web and TUI)
├── api.ts             # REST API client
├── websocket.ts       # WebSocket client
├── types.ts           # TypeScript type contracts
├── mpx1Api.ts         # MPX1 device API
├── intelfxApi.ts      # IntelFX device API
└── hooks/             # WebSocket hooks (if DOM-free)
```

**Boundary rule**: The TUI never imports from `web/src/app/` (pages, components, layout, stores). If a Zustand store or hook is needed by both, it is moved to `web/src/map2/stores/` or `web/src/map2/hooks/`.

### Screen Router Model

No URL routing. The TUI uses a **screen stack**:

```typescript
type ScreenState = {
  stack: ScreenEntry[];     // Push/pop navigation
  current: ScreenEntry;     // Top of stack
  params: Record<string, string>; // Context params (e.g., pluginUri, chainId)
};

type ScreenEntry = {
  id: ScreenId;             // Enum of all screens
  title: string;
  params?: Record<string, string>;
};
```

- `Enter` on a list item pushes a detail screen
- `Esc` / `Backspace` pops back
- `Ctrl+P` opens command palette for direct navigation
- Number keys `1-9` jump to pinned screens
- `Tab` cycles focus zones within a screen

### Backend Integration

- **REST**: Uses the same `api.ts` fetch client, pointed at `http://localhost:8080/api` (or `MAP2_API_URL` env var)
- **WebSocket**: Uses the same `Map2WebSocket` singleton, connected to `ws://localhost:8080/ws`
- **React Query**: Same `QueryClient` config (`staleTime: 5000`, 1 retry), same query keys
- **No browser APIs**: Replace `fetch` with `node-fetch` or Node 18+ built-in `fetch`. Replace `WebSocket` with `ws` package.

### Event/Input Handling

Ink provides `useInput(handler)` for keyboard events. The TUI layers:

1. **Global keybindings** — Always active: `Ctrl+P` (palette), `?` (help), `Ctrl+C` (quit), `Esc` (back)
2. **Screen keybindings** — Active per-screen: screen-specific shortcuts shown in status bar
3. **Focus-zone keybindings** — Active per-focused component: `j`/`k` for list navigation, `Enter` to select

Priority: focus-zone > screen > global (most specific wins).

### Async Job / Status Handling

- Long-running operations (plugin load, IR import, firmware update) show a persistent status line in the status bar
- Progress is tracked via React Query mutation state + WebSocket events
- Background polling uses `refetchInterval` on React Query (same as web)
- Connection loss shows `[DISCONNECTED]` in status bar with auto-reconnect indicator

### Notification/Error Model

- **Errors**: Red text in status bar, persists until dismissed with any key
- **Warnings**: Yellow text in status bar, auto-dismiss after 5 seconds
- **Info**: Gray text in status bar, auto-dismiss after 3 seconds
- **Confirmations**: Full-screen overlay: `"Are you sure? [y/N]"`

### Logging / Diagnostics

- `--verbose` flag enables a scrollable log pane at bottom of screen
- `--log-file <path>` writes all API calls and errors to a file
- Diagnostics screen shows: API latency, WebSocket status, React Query cache stats, terminal size

### Theming

```typescript
const theme = {
  // Status colors
  ok: 'green',
  warn: 'yellow',
  error: 'red',
  muted: 'gray',

  // UI chrome
  border: 'gray',
  borderFocused: 'cyan',
  headerBg: 'blue',
  headerFg: 'white',

  // Data
  label: 'gray',
  value: 'white',
  accent: 'cyan',
  highlight: 'bgCyan',
};
```

Supports `--no-color` flag and `NO_COLOR` env var. Degrades to bold/underline in 16-color terminals.

### Testability

- **Unit tests**: Each component tested with `ink-testing-library` (renders to string, asserts content)
- **Integration tests**: Screen-level tests with simulated input sequences
- **Snapshot tests**: Terminal output snapshots for regression detection
- **API mocking**: Same MSW / manual mocks as web tests
- **CI**: `npm test` in the `tui/` directory, independent of web test suite

---

## E. Screen Map

### E1. Home Screen

- **Purpose**: Entry point — overview of system health and quick navigation
- **Tasks**: See system status at a glance, jump to any subsystem
- **Data**: Backend health, audio engine status, active chain, CPU load, connected devices, cluster node count
- **Interactions**: Arrow keys to select a card, Enter to navigate, number keys for pinned shortcuts
- **Backend**: `GET /api/health`, `GET /api/chains/active`, `GET /api/system/cpu`, WebSocket `cpu` topic
- **Constraints**: Must fit in 80×24. Cards are single-line items, not graphical tiles.

### E2. Audio Grid Screen

- **Purpose**: View and manage the active signal chain and plugins
- **Tasks**: View chain, reorder plugins, toggle bypass, adjust parameters
- **Data**: Active chain, plugin list with bypass state, selected plugin parameters
- **Interactions**: `j`/`k` to navigate plugins, `b` to toggle bypass, `Enter` to open parameter editor, `Shift+↑`/`Shift+↓` to reorder
- **Backend**: `chainsApi`, `pluginsApi`, WebSocket `chain_updates`
- **Constraints**: Signal chain shown as vertical list, not grid. Parameter editor is a side panel or overlay.

### E3. Metering Screen

- **Purpose**: Real-time audio level monitoring
- **Tasks**: Monitor input/output levels, check for clipping
- **Data**: Per-channel VU levels, peak hold, clipping indicators
- **Interactions**: Mostly passive viewing. `r` to reset peaks. `Tab` to switch between input/output/bus views.
- **Backend**: WebSocket `meters` topic (10 Hz refresh)
- **Constraints**: Horizontal bar meters using `█▓░` characters. Clipping shown as red `!`. Max 10 Hz refresh to prevent flicker.

### E4. MIDI Hub Screen

- **Purpose**: MIDI routing, device connections, event monitoring
- **Tasks**: View MIDI devices, create/edit routes, monitor live events, manage presets
- **Data**: Connected MIDI devices, active routes, live event stream, presets
- **Interactions**: Tab bar for sub-views (Connections, Routes, Events, Presets). `j`/`k` in lists, `Enter` to edit.
- **Backend**: `midiApi`, WebSocket `midi_activity`
- **Constraints**: Event stream is a scrolling log with timestamps. Rate-limit display to prevent flood.

### E5. MPX1 Screen

- **Purpose**: Behringer MPX-1 multi-effects control
- **Tasks**: Select programs, edit parameters, manage library, MIDI mapping
- **Data**: Current program, parameter values, library list, MIDI map
- **Interactions**: Tab bar for sub-views (Panel, Editor, Library, MIDI Map, Diagnostics). Knob values edited via number input.
- **Backend**: `mpx1Api`, WebSocket (if applicable)
- **Constraints**: No SVG panel or flow canvas. Program selection is a filterable list. Parameters shown as labeled value rows.

### E6. PipeWire Screen

- **Purpose**: PipeWire audio server status and configuration
- **Tasks**: View nodes, links, formats, quantum/rate status
- **Data**: PipeWire nodes, links, default sink/source, quantum, sample rate
- **Interactions**: `j`/`k` navigation, `Enter` to inspect node details
- **Backend**: `GET /api/pipewire/*`, WebSocket `pipewire`
- **Constraints**: Node list is a table. Link relationships shown as `Source → Sink` text rows.

### E7. CPU / Performance Screen

- **Purpose**: Real-time CPU and RT scheduling monitoring
- **Tasks**: Monitor CPU per-core, check RT thread priorities, view load history
- **Data**: Per-core CPU %, RT thread list with priorities, audio callback timing
- **Interactions**: Passive monitoring. `Tab` to switch between CPU overview and RT thread detail.
- **Backend**: `GET /api/system/cpu`, WebSocket `cpu` topic
- **Constraints**: Per-core bars using sparkline characters. Thread table with priority column.

### E8. Devices Screen

- **Purpose**: USB audio interface status (Edirol UA-1000, Hotone Jogg)
- **Tasks**: View connected devices, check status, see configuration
- **Data**: Device list, connection state, sample rate, buffer size
- **Interactions**: `j`/`k` to select device, `Enter` for detail view
- **Backend**: `GET /api/devices/*`
- **Constraints**: Simple table. Device detail is a key-value panel.

### E9. Cluster Screen

- **Purpose**: Multi-node cluster overview and management
- **Tasks**: View all nodes, check health, switch active node context
- **Data**: Node list with hostname, role, health %, status, alerts
- **Interactions**: `j`/`k` to select node, `Enter` to set as active, `d` for detail view
- **Backend**: `GET /api/cluster/*`, node discovery/health services
- **Constraints**: Node pills from web become table rows with colored status markers.

### E10. AVB Network Screen

- **Purpose**: AVB entity discovery and stream routing
- **Tasks**: View discovered entities, inspect streams, manage connections
- **Data**: Entity list, stream table, PTP status, connection matrix
- **Interactions**: Tab bar for sub-views (Entities, Streams, Matrix, PTP). Matrix uses arrow keys + `x` to toggle connections.
- **Backend**: `avbApi`, WebSocket `avb:*` topics
- **Constraints**: Routing matrix is an ASCII grid. Entity detail is a key-value panel.

### E11. Tesira Screen

- **Purpose**: Biamp Tesira fleet monitoring and control
- **Tasks**: View discovered Tesiras, DSP block status, presets, metering
- **Data**: Device fleet, DSP blocks, preset list, channel meters
- **Interactions**: Tab bar for sub-views (Fleet, DSP Blocks, Presets, Metering)
- **Backend**: `tesiraApi`, WebSocket `tesira:*` topics
- **Constraints**: Fleet is a device table. DSP blocks are a hierarchical list.

### E12. Artifacts Screen

- **Purpose**: Browse audio plugins, IR files, NAM models
- **Tasks**: Search/filter artifacts, view details, load into chain
- **Data**: Plugin list (LV2), IR file list, NAM model list
- **Interactions**: Filterable list with search (`/`). `Enter` to view detail. `l` to load into chain.
- **Backend**: `GET /api/plugins`, `GET /api/artifacts/*`
- **Constraints**: No thumbnail previews. List with name, type, category columns.

### E13. Settings Screen

- **Purpose**: TUI preferences and platform configuration
- **Tasks**: Configure pinned screens, theme, API endpoint, node defaults
- **Data**: Current settings, available options
- **Interactions**: Form fields with `Enter` to edit, `Tab` to next field
- **Backend**: `GET/PATCH /api/settings/*`
- **Constraints**: Simple key-value form.

### E14. Diagnostics Screen

- **Purpose**: API health, WebSocket status, React Query cache, terminal info
- **Tasks**: Debug connectivity issues, inspect cache state, check terminal capabilities
- **Data**: API latency, WS connection state, query cache entries, terminal size/color support
- **Interactions**: Passive viewing with `r` to refresh
- **Backend**: Internal React Query state + connectivity checks
- **Constraints**: Developer-oriented. Dense information is acceptable.

### Transient Overlays

| Overlay | Trigger | Content |
|---|---|---|
| Command Palette | `Ctrl+P` | Fuzzy-searchable screen list |
| Help | `?` | Full keybinding reference for current screen |
| Confirm Dialog | Destructive action | `y`/`n` confirmation |
| Parameter Editor | `Enter` on a parameter | Inline or overlay value editor |
| Error Detail | `Enter` on error in status bar | Full error message + stack |

---

## F. Interaction Model

### Global Navigation

| Key | Action |
|---|---|
| `Ctrl+P` | Open command palette |
| `?` | Toggle help overlay |
| `Esc` | Close overlay / go back one screen |
| `Backspace` | Go back one screen |
| `1`–`9` | Jump to pinned screen 1–9 |
| `Ctrl+C` | Quit (with confirmation if unsaved state) |
| `Ctrl+L` | Redraw / clear screen |
| `Tab` | Cycle focus zones forward |
| `Shift+Tab` | Cycle focus zones backward |

### Local Navigation (within screens)

| Key | Action |
|---|---|
| `j` / `↓` | Move selection down |
| `k` / `↑` | Move selection up |
| `h` / `←` | Move left / collapse |
| `l` / `→` | Move right / expand |
| `Enter` | Activate / open / confirm |
| `Space` | Toggle (checkbox, bypass) |
| `/` | Open search/filter |
| `g` | Go to top of list |
| `G` | Go to bottom of list |
| `[` | Previous tab |
| `]` | Next tab |
| `r` | Refresh current view |

### Focus Management

- Each screen defines **focus zones** (e.g., sidebar list, detail panel, tab bar)
- `Tab` cycles through zones in defined order
- Active zone has a highlighted border (cyan vs gray)
- `j`/`k` navigation operates within the focused zone
- Overlays capture all input until dismissed

### Selection Patterns

- Single selection: arrow keys + `Enter`
- Multi-selection (where applicable): `Space` to toggle, `Enter` to confirm batch
- Range selection: `Shift+j`/`Shift+k` to extend selection

### Tables and Lists

- Sortable columns: press column letter key (shown in header) to sort
- Filterable: `/` opens filter input, `Esc` clears filter
- Pagination: `Page Up`/`Page Down` or `Ctrl+U`/`Ctrl+D` (half-page scroll)
- Row detail: `Enter` to push detail screen or expand inline

### Forms and Validation

- Navigate fields: `Tab` / `Shift+Tab`
- Edit field: `Enter` to activate, type value, `Enter` to confirm, `Esc` to cancel
- Validation: Inline error message below field in red
- Submit: `Ctrl+S` to save form
- Numeric fields: support `+`/`-` for increment/decrement

### Dialogs and Overlays

- Overlays render on top of the current screen (full-width, partial or full height)
- `Esc` always dismisses the topmost overlay
- Confirm dialogs: `y` to confirm, `n` or `Esc` to cancel
- Overlays block input to underlying screen

### Empty States

- Empty lists show a centered message: `No items found` with a hint for how to create/add
- Never show a blank screen — always provide context

### Error States

- API errors: red status bar message with error code
- Connection loss: persistent `[DISCONNECTED]` indicator, auto-reconnect with countdown
- Fatal errors: full-screen error message with suggested action

### Loading States

- Initial load: `⠋ Loading...` spinner in content area (Ink `<Spinner>`)
- Background refresh: subtle `↻` indicator in header, data remains visible
- Never blank the screen during refresh — show stale data with indicator

### Responsive Terminal Sizes

| Width | Behavior |
|---|---|
| ≥ 120 cols | Full layout: sidebar + detail panel side by side |
| 80–119 cols | Standard layout: stacked panels, full-width tables |
| < 80 cols | Compact mode: abbreviated labels, single-column, no borders |
| < 40 cols | Warning message: "Terminal too narrow" |

Height adapts similarly — tables paginate, panels stack vertically.

---

## G. Component System

### G1. AppShell

- **Responsibility**: Wraps all screens. Renders header, content area, status bar. Manages overlay stack.
- **Props/State**: Current screen, overlay stack, connection status, terminal dimensions
- **Reuse**: Singleton — one per app
- **Constraints**: Must fit header + content + status bar in terminal height. Content area = height - 2 (header) - 1 (status bar).

### G2. Header

- **Responsibility**: Shows current screen title, breadcrumb path, active node indicator, connection dot
- **Props/State**: Screen title, breadcrumb segments, node name, connection status
- **Reuse**: Rendered by AppShell
- **Constraints**: Single line. Truncate long titles. Right-align node indicator.

### G3. StatusBar

- **Responsibility**: Bottom line showing contextual keybindings, messages, clock
- **Props/State**: Active keybindings (from current screen + focus zone), message queue, timestamp
- **Reuse**: Rendered by AppShell
- **Constraints**: Single line. Key hints abbreviated: `^P:cmd  ?:help  esc:back`. Messages replace hints temporarily.

### G4. CommandPalette

- **Responsibility**: Fuzzy-searchable screen/action launcher
- **Props/State**: Search input, filtered screen list, selected index
- **Reuse**: Global overlay
- **Constraints**: Renders as top-aligned overlay. Max 10 visible results. `fzf`-style matching.

### G5. DataTable

- **Responsibility**: Sortable, filterable, navigable table
- **Props/State**: Columns config, rows data, sort state, filter string, selected row index, page offset
- **Reuse**: Used in ~10 screens (devices, plugins, MIDI, AVB, etc.)
- **Constraints**: Column widths proportional to terminal width. Overflow truncated with `…`. Header row is bold. Selected row is highlighted (inverse video). Box-drawing characters for borders: `┌─┬─┐│├─┼─┤└─┴─┘`.

### G6. FilterableList

- **Responsibility**: Vertical list with inline search filter
- **Props/State**: Items array, filter string, selected index, render function per item
- **Reuse**: Artifacts, presets, programs, chain plugins
- **Constraints**: Filter activates with `/`. Items can be single-line or multi-line.

### G7. FormField

- **Responsibility**: Labeled input field with validation
- **Props/State**: Label, value, type (text/number/select/toggle), validation errors, focused state
- **Reuse**: Settings, parameter editing, MIDI mapping
- **Constraints**: Label left-aligned, value right-aligned or below. Error text in red below field.

### G8. ProgressBar

- **Responsibility**: Horizontal progress indicator
- **Props/State**: Progress (0–1), label, color
- **Reuse**: File imports, firmware updates, long operations
- **Constraints**: Uses `█░` characters. Shows percentage. Indeterminate mode uses `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` spinner.

### G9. VuMeter

- **Responsibility**: Horizontal audio level bar
- **Props/State**: Level (dB), peak hold, clipping flag, channel label
- **Reuse**: Metering screen, device status, Tesira metering
- **Constraints**: Green → yellow → red gradient using `▏▎▍▌▋▊▉█`. Peak hold shown as `│`. Clip shown as red `!`. Fixed width per channel.

### G10. Sparkline

- **Responsibility**: Inline mini time-series chart
- **Props/State**: Data array (numbers), width, label
- **Reuse**: CPU history, latency history, load trend
- **Constraints**: Uses `▁▂▃▄▅▆▇█` block characters. Single line height. Width adapts to available space.

### G11. StatusDot

- **Responsibility**: Colored dot indicator for status
- **Props/State**: Status enum (ok/warn/error/offline/unknown), label
- **Reuse**: Health indicators, connection status, device state
- **Constraints**: `●` green/yellow/red/gray + label text.

### G12. TabBar

- **Responsibility**: Horizontal tab selector
- **Props/State**: Tab labels, active tab index
- **Reuse**: Multi-view screens (MIDI Hub, MPX1, AVB, etc.)
- **Constraints**: Active tab bold + underline. Inactive tabs dimmed. `[`/`]` to switch. Shows `[1]Tab1  [2]Tab2  [3]Tab3` with number shortcuts.

### G13. ConfirmDialog

- **Responsibility**: Modal confirmation for destructive actions
- **Props/State**: Message, confirm/cancel labels, severity
- **Reuse**: Plugin unload, chain delete, preset overwrite
- **Constraints**: Centered box overlay. `y`/`n` keys. Red border for destructive actions.

### G14. Toast

- **Responsibility**: Transient status bar message
- **Props/State**: Message, tone (info/success/warn/error), auto-dismiss duration
- **Reuse**: Operation results, errors, confirmations
- **Constraints**: Renders in status bar area. Queue of messages, shown one at a time.

### G15. BoxPanel

- **Responsibility**: Bordered container with optional title
- **Props/State**: Title, children, border style (single/double/rounded), focused state
- **Reuse**: Detail panels, grouped form sections, inspector
- **Constraints**: Box-drawing characters for border. Focused = cyan border. Title in top border.

### G16. KeyHint

- **Responsibility**: Inline keybinding hint
- **Props/State**: Key label, action description
- **Reuse**: Status bar, help overlay, contextual hints
- **Constraints**: Renders as `[key]action` with dimmed styling for key bracket.

### G17. LogStream

- **Responsibility**: Scrollable, auto-tailing log viewer
- **Props/State**: Log entries array, auto-scroll flag, filter
- **Reuse**: MIDI events, diagnostics, verbose mode
- **Constraints**: New entries append at bottom. `Shift+G` to tail, `g` to top. Filter with `/`. Max buffer configurable (default 1000 lines).

---

## H. State / Data Model

### Local UI State (useState)

- Current focus zone index
- Overlay stack
- Form input values (in-progress edits)
- Table sort/filter state
- List selection index
- Scroll position

### Shared App State (Zustand)

Reuse existing stores where possible, create new TUI-specific stores as needed:

| Store | Source | Contents |
|---|---|---|
| `viewedNodeStore` | Existing (shared) | Active node per screen context |
| `graphStore` | Existing (shared) | Signal chain state, snapshots |
| `midiHubNavStore` | Existing (shared) | MIDI Hub active tab |
| `tuiNavStore` | New (TUI-only) | Screen stack, pinned screens, last visited |
| `tuiSettingsStore` | New (TUI-only) | Theme preference, terminal config |

### Remote / Server State (React Query)

- Same query keys and fetch functions as web GUI
- `staleTime: 5000` for general data, `staleTime: 0` for real-time metrics
- `refetchInterval` for polling screens (CPU: 2s, meters: 100ms via WS, devices: 10s)
- Mutations use `useMutation` with `onSuccess` invalidation

### Caching and Refresh

- React Query cache is the single source of truth for server state
- Background refetch keeps data fresh without blocking UI
- `r` key forces immediate refetch of current screen's queries
- Cache persists for session duration (no disk persistence)

### Optimistic vs. Confirmed Updates

- **Optimistic**: Plugin bypass toggle, parameter changes (instant visual feedback, rollback on error)
- **Confirmed**: Chain reorder, preset save, device configuration (wait for server response)
- Optimistic failures show a red flash on the affected row + error toast

### Failure Recovery

- API errors: show error toast, keep stale data visible, offer retry with `r`
- WebSocket disconnect: show `[RECONNECTING...]` in header, exponential backoff (same as web)
- Fatal errors: full-screen error with suggested action (restart, check backend, etc.)

### Long-Running Task Visibility

- Active operations tracked in a global `operationsStore`
- Status bar shows `[2 operations]` indicator when background tasks are running
- `Ctrl+O` opens operations panel showing all active/recent operations with status

### Background Polling

- WebSocket preferred for real-time data (meters, CPU, MIDI events)
- HTTP polling as fallback if WebSocket unavailable
- Polling intervals match web GUI (no additional backend load)

### View State vs. Domain State Separation

```
Domain State (shared):          View State (TUI-only):
├── Chain/plugin data           ├── Focus zone index
├── Device status               ├── Overlay stack
├── Node health                 ├── Table sort/filter
├── MIDI routes                 ├── Scroll position
├── AVB connections             ├── Command palette search
└── Audio metrics               └── Screen stack history
```

---

## I. Risk Register

### I1. Layout Mismatch

- **Risk**: Ink's Yoga flexbox is a subset of CSS flexbox. Some layouts won't translate.
- **Severity**: MEDIUM
- **Mitigation**: Design all layouts for terminal from scratch. Do not attempt to replicate web layouts. Use Ink's `<Box>` with `flexDirection`, `width`, `height` as percentages or fixed. Test at 80×24 minimum.

### I2. Complex Visualizations

- **Risk**: 3D canvas (JUCE Grid), SVG (MPX1 Flow), charts (Recharts) cannot render in terminal.
- **Severity**: HIGH
- **Mitigation**: Replace with terminal-native representations: text signal chains, ASCII tables, sparklines. Accept that some views will be simplified. The web GUI remains available for full visualization.

### I3. Terminal Size Variability

- **Risk**: Users may have terminals from 40×10 to 300×80. Layout must adapt.
- **Severity**: MEDIUM
- **Mitigation**: `useTerminalSize()` hook with `process.stdout.on('resize')`. Define three layout tiers (compact/standard/wide). Test all screens at each tier. Minimum viable: 80×24.

### I4. Color Support Inconsistency

- **Risk**: Some terminals support 16 colors, some 256, some truecolor. SSH sessions may strip colors.
- **Severity**: LOW
- **Mitigation**: Use Ink/chalk's automatic color detection. Define color palette with fallbacks. Support `--no-color` and `NO_COLOR` env var. All information must be conveyed by text/position, not color alone.

### I5. Input Conflicts

- **Risk**: Some key combinations are intercepted by the terminal emulator (Ctrl+S, Ctrl+Q, Ctrl+Z) or SSH.
- **Severity**: MEDIUM
- **Mitigation**: Avoid Ctrl+S/Q/Z as primary bindings. Use `Ctrl+P`, `Ctrl+O`, `Ctrl+L` which are generally safe. Document terminal configuration recommendations. Provide alternative bindings.

### I6. Real-Time Rendering Performance

- **Risk**: High-frequency updates (meters at 10 Hz, MIDI events) may cause terminal flicker or CPU overhead.
- **Severity**: MEDIUM
- **Mitigation**: Throttle rendering to max 10 fps for meters, 30 fps for static UI. Use Ink's batched rendering. Buffer WebSocket updates and render at fixed intervals. Test with `TERM=dumb` for worst case.

### I7. Loss of Discoverability

- **Risk**: Terminal UI hides features behind keybindings. New users won't find functionality.
- **Severity**: HIGH
- **Mitigation**: Status bar always shows relevant keybindings. `?` always opens help. Command palette (`Ctrl+P`) provides fuzzy search for all screens. Home screen shows all major destinations. Consistent key patterns across all screens.

### I8. Information Overload

- **Risk**: Porting all 84 web pages creates an overwhelming TUI. Too many screens = confusion.
- **Severity**: MEDIUM
- **Mitigation**: Curate to 14 top-level screens (see Screen Map). Consolidate related views into tabbed screens. Prioritize operational workflow over feature parity. Some web-only features (3D visualization, drum machine pattern editor) are explicitly excluded from TUI v1.

### I9. Accidental Legacy TUI Dependency

- **Risk**: Developers may import from existing TUI code or create coupling.
- **Severity**: MEDIUM
- **Mitigation**: Enforce boundary rule: TUI imports only from `tui/src/` and `web/src/map2/`. ESLint rule to ban imports from `web/src/app/`. Code review gate. Clear documentation.

### I10. Node.js WebSocket/Fetch Compatibility

- **Risk**: `api.ts` and `websocket.ts` may use browser-specific APIs (e.g., `window`, `document`, browser `WebSocket`).
- **Severity**: MEDIUM
- **Mitigation**: Audit shared modules for browser dependencies. Create thin adapters: `ws` package for WebSocket, Node `fetch` for HTTP. Abstract behind interface so both web and TUI can provide their platform's implementation.

### I11. Ink Ecosystem Maturity

- **Risk**: Ink is smaller ecosystem than React DOM. Some features may be missing or buggy. Community support is thinner.
- **Severity**: LOW
- **Mitigation**: Pin Ink version. Write custom components for anything not well-supported. Keep component library small and self-contained. The core (Box, Text, useInput, useApp) is stable.

---

## J. Delivery Phases

### Phase 1: Foundation (Estimated: 2 weeks)

**Milestone**: Bootable TUI shell with home screen and navigation

- Set up `tui/` directory with package.json, tsconfig, build scripts
- Implement AppShell (header, content area, status bar)
- Implement screen router with push/pop navigation
- Implement command palette
- Implement help overlay
- Build Home Screen with system health summary
- Wire up API client for Node.js (fetch/ws adapters)
- Wire up React Query provider
- Connect to backend health endpoint
- Terminal size detection and responsive layout tiers

**Validation gate**: TUI launches, shows home screen, navigates between screens, connects to backend.

### Phase 2: Core Audio Screens (Estimated: 2 weeks)

**Milestone**: Audio monitoring and control operational

- Build component primitives: DataTable, VuMeter, Sparkline, FilterableList, BoxPanel
- Implement Metering Screen (real-time VU bars via WebSocket)
- Implement Audio Grid Screen (chain view, plugin list, bypass toggle)
- Implement Parameter Editor panel (value editing overlay)
- Implement CPU / Performance Screen
- Implement PipeWire Screen

**Validation gate**: Can monitor audio levels, view/edit signal chain, see CPU stats — all via terminal.

### Phase 3: Device & MIDI Screens (Estimated: 2 weeks)

**Milestone**: Device management and MIDI routing operational

- Build FormField, ConfirmDialog, Toast components
- Implement MIDI Hub Screen (5 tabs: connections, routes, events, presets, processing)
- Implement Devices Screen (Edirol, Hotone)
- Implement MPX1 Screen (panel, editor, library views)
- Implement LogStream component for MIDI event monitoring
- Wire up WebSocket `midi_activity` topic

**Validation gate**: Can view MIDI devices, create routes, monitor events, control MPX1 — all via terminal.

### Phase 4: Network & Fleet Screens (Estimated: 2 weeks)

**Milestone**: Cluster and network management operational

- Implement Cluster Screen (node list, health, context switching)
- Implement AVB Screen (entities, streams, routing matrix)
- Implement Tesira Screen (fleet, DSP blocks, presets)
- Build ASCII routing matrix component for AVB
- Wire up cluster context and node switching

**Validation gate**: Can view cluster health, manage nodes, inspect AVB network — all via terminal.

### Phase 5: Polish & Production Readiness (Estimated: 2 weeks)

**Milestone**: Production-quality release

- Implement Artifacts Screen
- Implement Settings Screen
- Implement Diagnostics Screen
- Comprehensive keybinding review and conflict resolution
- 80×24 audit of all screens
- Color fallback testing (16/256/truecolor/no-color)
- Error state testing (backend down, WS disconnect, stale data)
- Performance profiling (render frame time, memory usage)
- Write test suite (unit + integration + snapshot)
- Documentation: man-page-style help, `--help` flag
- Package as installable CLI (`npx map2-tui` or `npm install -g map2-tui`)

**Validation gate**: All screens functional, tested at 80×24, handles errors gracefully, documented.

### Review Gates

| Gate | Phase | Reviewer | Criteria |
|---|---|---|---|
| Architecture review | After Phase 1 | Lead engineer | Shell structure, navigation model, code boundaries |
| UX review | After Phase 2 | Product/UX | Interaction patterns, keybindings, information density |
| API compatibility review | After Phase 3 | Backend lead | No new backend requirements, shared code boundary clean |
| Security review | After Phase 4 | Security | No credential exposure, safe terminal handling |
| Production readiness | After Phase 5 | All stakeholders | Performance, stability, documentation, packaging |

---

## K. Global Work List

### Epic: T412 — MAP2 Ink TUI Product Surface

---

**ID**: T412
**Status**: [ ] Todo
**Title**: MAP2 Ink TUI — Standalone terminal interface (Epic)
**Description**:
- Goal / acceptance criteria: Deliver a first-class, standalone terminal interface for MAP2 built with React + Ink, covering 14 screens with full keyboard navigation, real-time metering, device control, and cluster management.
- Why it matters: Enables headless operation, SSH-based workflows, and live performance control without a browser.
- Dependencies: Existing backend APIs (no backend changes required)
- Estimated effort: Very High (10 weeks across 5 phases)
- Required outputs: `tui/` directory with complete Ink application, test suite, documentation
**Subtasks**: T412-subA through T412-subL (below)
**Assigned to**: Unassigned
**Last updated**: 2026-03-25

---

**ID**: T412-subA
**Status**: [ ] Todo
**Title**: TUI project scaffold and build system
**Description**:
- Goal / acceptance criteria: Create `tui/` directory with `package.json`, `tsconfig.json`, Ink + React dependencies, build scripts, and ESLint config with import boundary enforcement (ban `web/src/app/` imports).
- Why it matters: Foundation for all subsequent TUI development.
- Dependencies: None
- Estimated effort: Small
- Required outputs: Bootable empty Ink app that renders "MAP2 TUI" to terminal. `npm run build` and `npm test` work.
- Acceptance criteria: `cd tui && npm install && npm run build && node dist/main.js` renders text to terminal.
- Risk notes: Pin Ink version to latest stable (v4.x or v5.x). Verify React version compatibility with web's React 19.

---

**ID**: T412-subB
**Status**: [ ] Todo
**Title**: Node.js adapters for shared API/WebSocket layer
**Description**:
- Goal / acceptance criteria: Create thin adapter modules so `web/src/map2/api.ts` and `web/src/map2/websocket.ts` work in Node.js without browser globals.
- Why it matters: Enables code reuse of the entire API client and WebSocket layer.
- Dependencies: T412-subA
- Estimated effort: Medium
- Required outputs: Adapter modules that provide Node-compatible `fetch` and `WebSocket`. Shared modules import successfully from TUI. Verified with integration test against running backend.
- Acceptance criteria: TUI can call `GET /api/health` and subscribe to a WebSocket topic from Node.js.
- Risk notes: Audit `api.ts` and `websocket.ts` for all browser-specific APIs (`window`, `location`, `localStorage`). May require conditional imports or dependency injection.

---

**ID**: T412-subC
**Status**: [ ] Todo
**Title**: AppShell, screen router, and global navigation
**Description**:
- Goal / acceptance criteria: Implement AppShell (header + content + status bar), screen stack router with push/pop, command palette (Ctrl+P), help overlay (?), and global keybindings.
- Why it matters: Core navigation infrastructure that all screens depend on.
- Dependencies: T412-subA
- Estimated effort: Medium
- Required outputs: `shell/AppShell.tsx`, `shell/Header.tsx`, `shell/StatusBar.tsx`, `shell/CommandPalette.tsx`, `shell/HelpOverlay.tsx`, `navigation/ScreenRouter.tsx`, `navigation/screenRegistry.ts`, `hooks/useScreenRouter.ts`, `hooks/useKeybindings.ts`, `hooks/useTerminalSize.ts`.
- Acceptance criteria: Can launch TUI, see header/status bar, navigate between placeholder screens via Ctrl+P and number keys, see contextual keybindings in status bar, open help with ?.
- Risk notes: Test terminal size detection on resize. Verify keybinding conflicts with common terminal emulators.

---

**ID**: T412-subD
**Status**: [ ] Todo
**Title**: Core component library (primitives)
**Description**:
- Goal / acceptance criteria: Build the reusable TUI component library: DataTable, FilterableList, FormField, ProgressBar, VuMeter, Sparkline, StatusDot, TabBar, ConfirmDialog, Toast, BoxPanel, KeyHint, LogStream, Badge, Spinner.
- Why it matters: All screens compose from these primitives. Building them first enables parallel screen development.
- Dependencies: T412-subA
- Estimated effort: Large
- Required outputs: 15+ component files in `components/`, each with unit test using `ink-testing-library`. Storybook-like demo screen showing all components.
- Acceptance criteria: Each component renders correctly at 80-column width. DataTable handles sort/filter/selection. VuMeter renders levels with color. All components tested.
- Risk notes: DataTable is the most complex — invest time in column width calculation and overflow handling.

---

**ID**: T412-subE
**Status**: [ ] Todo
**Title**: Home Screen
**Description**:
- Goal / acceptance criteria: Implement the entry-point Home Screen showing system health summary, active chain, CPU load, connected devices, and navigation cards to all major screens.
- Why it matters: First screen users see. Sets the tone for the TUI experience.
- Dependencies: T412-subB, T412-subC, T412-subD
- Estimated effort: Medium
- Required outputs: `screens/HomeScreen.tsx` with health summary panel, active chain display, device count, CPU sparkline, and navigation list.
- Acceptance criteria: Shows live data from backend. All navigation targets reachable. Fits in 80×24.

---

**ID**: T412-subF
**Status**: [ ] Todo
**Title**: Metering and CPU screens
**Description**:
- Goal / acceptance criteria: Implement real-time Metering Screen (per-channel VU bars, peak hold, clipping) and CPU/Performance Screen (per-core bars, RT thread table, latency).
- Why it matters: Core operational monitoring — the primary reason to use the TUI in live performance.
- Dependencies: T412-subB (WebSocket), T412-subD (VuMeter, Sparkline, DataTable)
- Estimated effort: Medium
- Required outputs: `screens/MeteringScreen.tsx`, `screens/CpuScreen.tsx`. WebSocket subscription to `meters` and `cpu` topics. 10 Hz render cap for meters.
- Acceptance criteria: VU meters update in real-time. CPU per-core bars visible. RT thread priorities shown. No flicker at 10 Hz update rate.
- Risk notes: Throttle WebSocket updates to prevent terminal overload. Test with `TERM=dumb`.

---

**ID**: T412-subG
**Status**: [ ] Todo
**Title**: Audio Grid and PipeWire screens
**Description**:
- Goal / acceptance criteria: Implement Audio Grid Screen (text-mode signal chain, plugin list, bypass toggle, parameter editing) and PipeWire Screen (node list, link table, quantum/rate status).
- Why it matters: Signal chain management is the core workflow of the platform.
- Dependencies: T412-subB, T412-subD (FilterableList, FormField, BoxPanel)
- Estimated effort: Medium
- Required outputs: `screens/AudioGridScreen.tsx`, `screens/PipeWireScreen.tsx`, `panels/ParameterEditor.tsx`, `panels/PluginList.tsx`, `panels/ChainDetail.tsx`.
- Acceptance criteria: Can view active chain, navigate plugins, toggle bypass, edit parameters, view PipeWire nodes. Parameter changes persist to backend.

---

**ID**: T412-subH
**Status**: [ ] Todo
**Title**: MIDI Hub and Devices screens
**Description**:
- Goal / acceptance criteria: Implement MIDI Hub Screen (5-tab layout: connections, routes, events, presets, processing) and Devices Screen (USB audio interface status).
- Why it matters: MIDI routing is a critical live-performance workflow.
- Dependencies: T412-subB, T412-subD (TabBar, DataTable, LogStream, FormField)
- Estimated effort: Large
- Required outputs: `screens/MidiHubScreen.tsx` with 5 tab panels, `screens/DevicesScreen.tsx`, `panels/MidiMappingPanel.tsx`, `panels/DeviceStatusPanel.tsx`.
- Acceptance criteria: Can view MIDI devices, see live event stream (throttled), create/edit routes, load presets. Device list shows connection status.
- Risk notes: MIDI event stream must be rate-limited in display (buffer and show latest N). LogStream component handles this.

---

**ID**: T412-subI
**Status**: [ ] Todo
**Title**: MPX1 Screen
**Description**:
- Goal / acceptance criteria: Implement MPX1 Screen with tabbed views: Panel (program display + parameters), Editor (parameter editing), Library (preset browser), MIDI Map, Diagnostics.
- Why it matters: MPX1 is a primary hardware controller with deep integration.
- Dependencies: T412-subB, T412-subD (TabBar, FilterableList, FormField)
- Estimated effort: Medium
- Required outputs: `screens/Mpx1Screen.tsx` with tab panels for each view.
- Acceptance criteria: Can select programs, view/edit parameters, browse library, view MIDI mappings. Program numbering uses 1-based format (shared formatter).
- Risk notes: No flow canvas equivalent in TUI. Parameters displayed as labeled value rows.

---

**ID**: T412-subJ
**Status**: [ ] Todo
**Title**: Cluster, AVB, and Tesira screens
**Description**:
- Goal / acceptance criteria: Implement Cluster Screen (node health table, context switching), AVB Screen (entities, streams, ASCII routing matrix), and Tesira Screen (fleet, DSP blocks, presets).
- Why it matters: Multi-node and network management completes the TUI's operational coverage.
- Dependencies: T412-subB, T412-subD (DataTable, TabBar, StatusDot)
- Estimated effort: Large
- Required outputs: `screens/ClusterScreen.tsx`, `screens/AvbScreen.tsx`, `screens/TesiraScreen.tsx`. ASCII routing matrix component for AVB.
- Acceptance criteria: Can view all cluster nodes, switch active node context, view AVB entities/streams, toggle AVB connections in matrix, view Tesira fleet.
- Risk notes: AVB routing matrix in ASCII is the hardest component. May need a dedicated `AsciiMatrix` component with careful column alignment.

---

**ID**: T412-subK
**Status**: [ ] Todo
**Title**: Artifacts, Settings, and Diagnostics screens
**Description**:
- Goal / acceptance criteria: Implement Artifacts Screen (plugin/IR/NAM browser), Settings Screen (TUI preferences), and Diagnostics Screen (API health, cache stats, terminal info).
- Why it matters: Completes the screen map for v1.
- Dependencies: T412-subD (FilterableList, FormField, BoxPanel)
- Estimated effort: Medium
- Required outputs: `screens/ArtifactsScreen.tsx`, `screens/SettingsScreen.tsx`, `screens/DiagnosticsScreen.tsx`.
- Acceptance criteria: Can search/filter artifacts, modify TUI settings, view diagnostic information.

---

**ID**: T412-subL
**Status**: [ ] Todo
**Title**: Polish, testing, documentation, and packaging
**Description**:
- Goal / acceptance criteria: Achieve production quality: full test suite, 80×24 audit, color fallback testing, error state handling, performance profiling, CLI help text, man-page-style documentation, and npm packaging.
- Why it matters: Transforms a functional TUI into a shippable product.
- Dependencies: T412-subA through T412-subK
- Estimated effort: Large
- Required outputs: Test suite (unit + integration + snapshot), 80×24 verification for all 14 screens, `--help` output, `--no-color` support, `--verbose` log mode, `--log-file` support, README, performance benchmarks.
- Acceptance criteria: All tests pass. All screens render correctly at 80×24. No color-only information. Graceful error handling for backend-down and WS-disconnect scenarios. `npm pack` produces installable tarball.
- Risk notes: 80×24 audit often reveals layout assumptions. Budget time for layout fixes.

---

## L. Acceptance Criteria

The planning effort documented in this file is considered complete when:

1. **Executive definition** — The product purpose, target users, and first-class positioning are clearly stated (Section A).
2. **Conversion strategy** — Portable patterns, non-portable assumptions, and terminal-native replacements are explicitly categorized (Section C).
3. **Architecture** — The standalone application architecture is defined with shell, screens, routing, state, API integration, and testability boundaries (Section D).
4. **Screen map** — All 14 screens and transient overlays are described with purpose, data, interactions, and constraints (Section E).
5. **Interaction model** — Global/local navigation, keybindings, focus, forms, dialogs, errors, loading, empty states, and responsive behavior are defined (Section F).
6. **Component system** — All 17 reusable component types are described with responsibilities and constraints (Section G).
7. **State model** — Local, shared, and remote state boundaries are defined with caching, refresh, optimistic update, and failure recovery strategies (Section H).
8. **Risk register** — 11 risks identified with severity and mitigation (Section I).
9. **Delivery phases** — 5 phases with milestones, validation gates, and review gates (Section J).
10. **Work list** — 12 structured tasks (T412 epic + 12 subtasks) added to the global work list with title, purpose, scope, dependencies, outputs, and acceptance criteria (Section K).
11. **No code written** — This document contains zero implementation code, zero pseudocode, and zero scaffolding commands.
12. **No existing TUI dependency** — The plan explicitly prohibits imports from existing TUI or web presentation layers (Principle 7, Risk I9).
