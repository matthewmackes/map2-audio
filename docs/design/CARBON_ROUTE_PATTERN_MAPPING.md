# Carbon Route-to-Pattern Mapping

Date: 2026-03-11 23:14 EDT
Canonical task: T114-subD
Scope: Map each active app route to a nearest Carbon pattern/template and concrete component replacement targets.

## 1. Global Shell and Shared Route Template Mapping

| Surface | Current file | Carbon target pattern | Primary component targets |
| --- | --- | --- | --- |
| Global app shell | `web/src/app/layout/AppShell.tsx` | Product shell with global header + side navigation | `Header`, `HeaderName`, `HeaderNavigation`, `HeaderMenuButton`, `SideNav`, `SideNavItems`, `SkipToContent`, `Content` |
| Route loading fallback | `web/src/app/App.tsx` | Carbon loading state | `Loading`, skeleton variants (`SkeletonText`, `SkeletonPlaceholder`) |
| Global error and notices | `web/src/app/components/Toasts.tsx`, `web/src/app/components/ErrorBoundary.tsx` | Notification and inline feedback pattern | `ToastNotification`, `InlineNotification`, `ActionableNotification` |

## 2. Top-Level Route Mapping

| Route | Current page file | Nearest Carbon pattern/template | Primary replacement targets |
| --- | --- | --- | --- |
| `/` | `web/src/app/pages/HomePage.tsx` | Landing overview with tile-based navigation | `Grid`, `Column`, `Tile`, `Link`, `Button`, `Tag`, `Search` |
| `/overview` | `web/src/app/pages/OverviewPage.tsx` | Operational dashboard | `Grid`, `Column`, `Tile`, `DataTable`, `Tag`, `ProgressBar` |
| `/chains` | `web/src/app/pages/ChainsPage.tsx` | Collection management with list + detail | `DataTable`, `Search`, `OverflowMenu`, `Modal`, `Pagination` |
| `/presets` | `web/src/app/pages/PresetsPage.tsx` | Asset browser and CRUD flows | `DataTable`, `Tabs`, `Modal`, `FileUploader`, `InlineNotification` |
| `/legacy` | `web/src/app/pages/LegacyPage.tsx` | Legacy compatibility surface | `InlineNotification`, `Accordion`, `Link` |
| `/about` | `web/src/app/pages/AboutPage.tsx` | Informational content page | `Grid`, `Column`, `StructuredList`, `Tag`, `Link` |
| `/plugins` | `web/src/app/pages/LV2PluginsPage.tsx` | Catalog and configuration table | `DataTable`, `Search`, `Dropdown`, `Tag`, `Modal` |
| `/library` | `web/src/app/pages/LibraryPage.tsx` | Library + filtering + import/export | `Tabs`, `DataTable`, `ComboBox`, `FileUploader`, `Tag`, `Pagination` |
| `/midi` | `web/src/app/pages/MIDIPage.tsx` | Control panel with forms and diagnostics | `Tabs`, `FormGroup`, `TextInput`, `NumberInput`, `Toggle`, `DataTable` |
| `/midi-hub` | `web/src/app/pages/MidiHubShell.tsx` | Sidebar-navigated show control platform with 7 service areas, persistent bottom status bar, deep-linkable child routes | `SideNav`, `SideNavItems`, `SideNavLink`, `Theme`, `Layer`, `Outlet` |
| `/midi-hub/connections` | `web/src/app/pages/midi-hub/MidiHubConnectionsPage.tsx` | Port routing matrix/patchbay + traffic monitor | `DataTable`, `Tabs`, `Modal`, `Tag`, `Toggle`, custom SVG patchbay |
| `/midi-hub/presets` | `web/src/app/pages/midi-hub/MidiHubPresetsPage.tsx` | Preset CRUD, program change slots, preset chains | `DataTable`, `FileUploader`, `ComposedModal`, `OrderedList` |
| `/midi-hub/transport` | `web/src/app/pages/midi-hub/MidiHubTransportPage.tsx` | MIDI clock + recorder with DAW-style transport controls | `Button`, `NumberInput`, `Slider`, `DataTable`, `Toggle` |
| `/midi-hub/events` | `web/src/app/pages/midi-hub/MidiHubEventsPage.tsx` | Timecode-driven event lists, MSC builder, Learn Mode, RTC scheduling | `DataTable`, `FormGroup`, `Select`, `NumberInput`, `TextInput` |
| `/midi-hub/processing` | `web/src/app/pages/midi-hub/MidiHubProcessingPage.tsx` | Filters, mappers, scripts, macros, scheduler | `DataTable`, `Accordion`, `Tag`, `Modal`, `TextArea` |
| `/midi-hub/network` | `web/src/app/pages/midi-hub/MidiHubNetworkPage.tsx` | RTP-MIDI, OSC + namespace browser, MIDI 2.0, Tesira TTP, virtual GPIO, string interface | `DataTable`, `Tabs`, `FormGroup`, `Toggle`, `TextInput` |
| `/midi-hub/lab` | `web/src/app/pages/midi-hub/MidiHubLabPage.tsx` | AI learn suggestions, mesh networking, device shadow state | `DataTable`, `AILabel`, `ProgressBar`, `Tag` |
| `/midi-hub-2` | `web/src/app/App.tsx` | Compatibility redirect to the canonical MIDI Hub route | `Navigate` |
| `/juce-grid` | `web/src/app/pages/JuceGridPage.tsx` | Signal-flow editor workspace | `Grid`, `Accordion`, `Toolbar pattern`, `Popover`, `Modal` |
| `/grid` | `web/src/app/App.tsx` | Legacy redirect alias to the supported editor | `Navigate` |
| `/grid-3d` | `web/src/app/App.tsx` | Legacy redirect alias to the supported editor | `Navigate` |
| `/dsp` | `web/src/app/pages/DSPPage.tsx` | Signal processing control panel | `Tabs`, `DataTable`, `NumberInput`, `Slider`, `Toggle` |
| `/edirol-ua1000` | `web/src/app/pages/EdirolUA1000Page.tsx` | Hardware profile dashboard | `Tile`, `DataTable`, `Tag`, `InlineNotification` |
| `/motu-rme` | `web/src/app/pages/MOTURMEPage.tsx` | Hardware profile dashboard | `Tile`, `DataTable`, `Tag`, `InlineNotification` |
| `/hotone-jogg` | `web/src/app/pages/HoToneJoGGPage.tsx` | Hardware profile dashboard | `Tile`, `DataTable`, `Tag`, `InlineNotification` |
| `/host-machine` | `web/src/app/pages/HostMachinePage.tsx` | System health dashboard | `Grid`, `Tile`, `DataTable`, `ProgressBar`, `Tag` |
| `/cpu-performance` | `web/src/app/pages/CPUPerformancePage.tsx` | Metrics and benchmark report | `Grid`, `DataTable`, charts + `Tag` severity labels |
| `/engine` | `web/src/app/pages/AudioEnginePage.tsx` | Realtime engine operations panel | `Tabs`, `Tile`, `NumberInput`, `Toggle`, `InlineNotification` |
| `/metering` | `web/src/app/pages/MeteringPage.tsx` | Telemetry dashboard | `Grid`, `Tile`, chart pattern wrappers, `Tag` |
| `/pipewire` | `web/src/app/pages/PipeWirePage.tsx` | Runtime status + controls | `DataTable`, `InlineNotification`, `Modal`, `CodeSnippet` pattern |
| `/welcome` | `web/src/app/pages/WelcomePage.tsx` | Legacy redirect alias to the canonical platform guide | `Navigate` |
| `/lcd` | `web/src/app/pages/LCDPage.tsx` | Device status workspace | `Tile`, `DataTable`, `InlineLoading`, `Tag` |
| `/platform?layer=cluster-dashboard` | `web/src/app/pages/PlatformShellPage.tsx` | Cluster Dashboard workspace inside the unified platform shell | `DataTable`, `Tag`, `InlineNotification`, `ClickableTile` |
| `/platform?layer=midi-cluster` | `web/src/app/pages/PlatformShellPage.tsx` | MIDI cluster matrix plus inline node detail | `DataTable`, `Tabs`, `Tag`, `InlineNotification`, `Tile` |
| `/platform?layer=single-node` | `web/src/app/pages/PlatformShellPage.tsx` | Single-node detail workspace reached from cluster node selection | `DataTable`, `Tag`, `InlineNotification`, `ClickableTile` |
| `/api-observatory` | `web/src/app/pages/ApiObservatoryPage.tsx` | Developer tool workspace | `Tabs`, `DataTable`, `Search`, `CodeSnippet`, `Modal`, `Tag` |
| `/drums` | `web/src/app/pages/DrumsPage.tsx` | Instrument management panel | `DataTable`, `FileUploader`, `Tabs`, `Modal` |
| `/avb-routing` | `web/src/app/pages/AvbRoutingPage.tsx` | Routing matrix + inspector workspace | `DataTable`, `Tabs`, `Tag`, `InlineNotification`, `Search` |
| `/expression` | `web/src/app/pages/ExpressionPage.tsx` | Parameter mapping and calibration form | `FormGroup`, `Slider`, `NumberInput`, `DataTable`, `Modal` |
| `/tesira/*` | `web/src/app/pages/TesiraPage.tsx` | Device-fleet dashboard with nested device tabs | `Tabs`, `DataTable`, `Tile`, `Tag`, `Modal` |
| `/mpx1/*` | `web/src/app/pages/MPX1Page.tsx` | Rack device shell with workflow tabs | `Tabs`, `Grid`, `DataTable`, `Slider`, `ButtonSet` |
| `/intelfx/*` | `web/src/app/pages/IntelFXPage.tsx` | Rack device shell with workflow tabs | `Tabs`, `Grid`, `DataTable`, `Slider`, `ButtonSet` |

## 3. Nested Route Mapping

### 3.1 MPX1 child routes

| Route | Current file | Carbon pattern |
| --- | --- | --- |
| `/mpx1/panel` | `web/src/app/pages/MPX1PanelView.tsx` | Device panel dashboard |
| `/mpx1/editor` | `web/src/app/pages/MPX1EditorView.tsx` | Parameter editor form |
| `/mpx1/midi-map` | `web/src/app/pages/MPX1MidiMapView.tsx` | Mapping table + detail editor |
| `/mpx1/matrix` | `web/src/app/pages/MPX1MatrixView.tsx` | Matrix/graph + inspector |
| `/mpx1/library` | `web/src/app/pages/MPX1LibraryView.tsx` | Asset library table |
| `/mpx1/perform` | `web/src/app/pages/MPX1PerformView.tsx` | Performance control strip |
| `/mpx1/diag` | `web/src/app/pages/MPX1DiagView.tsx` | Diagnostics dashboard |
| `/mpx1/flow` | `web/src/app/pages/MPX1FlowView.tsx` | Flow graph workspace |

### 3.2 IntelFX child routes

| Route | Current file | Carbon pattern |
| --- | --- | --- |
| `/intelfx/panel` | `web/src/app/pages/IntelFXPanelView.tsx` | Device panel dashboard |
| `/intelfx/editor` | `web/src/app/pages/IntelFXEditorView.tsx` | Parameter editor form |
| `/intelfx/midi-map` | `web/src/app/pages/IntelFXMidiMapView.tsx` | Mapping table + detail editor |
| `/intelfx/library` | `web/src/app/pages/IntelFXLibraryView.tsx` | Asset library table |
| `/intelfx/perform` | `web/src/app/pages/IntelFXPerformView.tsx` | Performance control strip |
| `/intelfx/diag` | `web/src/app/pages/IntelFXMonitorView.tsx` | Diagnostics dashboard |
| `/intelfx/flow` | `web/src/app/pages/IntelFXFlowView.tsx` | Flow graph workspace |

### 3.3 Tesira nested routes

| Route | Current target | Carbon pattern |
| --- | --- | --- |
| `/tesira/:deviceId/dashboard` | `TesiraDeviceDashboard` | Device summary dashboard |
| `/tesira/:deviceId/design` | `TesiraDesignCanvas` | Design workspace + side panels |
| `/tesira/:deviceId/dsp` | `TesiraDspExplorer` | Hierarchical explorer + detail |
| `/tesira/:deviceId/levels` | `TesiraLevelsTab` | Metering and level controls |
| `/tesira/:deviceId/mixer` | `TesiraMixerTab` | Matrix mixer table |
| `/tesira/:deviceId/eq` | `TesiraEQTab` | Parameter editing form |
| `/tesira/:deviceId/presets` | `TesiraPresetsTab` | Preset library table |
| `/tesira/:deviceId/avb` | `TesiraAvbTab` | AVB topology + table |
| `/tesira/:deviceId/faults` | `TesiraFaultsTab` | Fault events table and trend charts |
| `/tesira/:deviceId/loops` | `TesiraLoopBuilderTab` | Loop builder workflow |
| `/tesira/:deviceId/settings` | `TesiraDeviceSettings` | Device settings forms |

## 4. Shared Primitive Replacements to Reuse Across Routes

These replacements should be implemented once and reused:

- Navigation and shell: `Header`, `SideNav`, `SkipToContent`, `Content`
- Buttons/links: `Button`, `ButtonSet`, `Link`, `IconButton` patterns
- Forms: `TextInput`, `NumberInput`, `TextArea`, `Dropdown`, `ComboBox`, `MultiSelect`, `Checkbox`, `Toggle`, `Slider`
- Data display: `DataTable`, `StructuredList`, `Tag`, `Accordion`, `Tooltip`
- Overlays: `Modal`, `ComposedModal`, `Popover`, `OverflowMenu`
- Feedback/loading: `ToastNotification`, `InlineNotification`, `Loading`, `InlineLoading`, skeleton set

## 5. MIDI Hub v2 Route Notes

Date: 2026-03-19 21:33 EDT

- `/midi-hub` now resolves to a Carbon product-shell route host (`MidiHubShell.tsx`) with deep-linkable child routes instead of a monolithic scrolling operator page.
- The shipped child-route set is:
  - `/midi-hub/connections`
  - `/midi-hub/presets`
  - `/midi-hub/transport`
  - `/midi-hub/events`
  - `/midi-hub/processing`
  - `/midi-hub/network`
  - `/midi-hub/lab`
- Each child route now owns a route-local page composition with `MidiHubAreaLayout`, route-local CSS where needed, and focused route tests under `web/src/app/pages/midi-hub/*.test.tsx`.
- Network now includes the `/map2/*` OSC namespace browser and dispatch workflow; Lab now uses split Carbon panels for AI Learn, mesh, and device shadow instead of the prior single innovation panel.

## 6. Mapping Notes

- This mapping defines target patterns only; behavior and API contracts must remain unchanged unless accessibility/conformance requires updates.
- Route-level migration should start only after shared primitive migration is complete (T114-subF dependency).
- Exceptions must be documented in the worklist if a route cannot map cleanly to Carbon patterns in one pass.
