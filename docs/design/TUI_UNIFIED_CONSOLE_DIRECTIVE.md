# TUI Unified Console Directive — IBM Carbon Terminal Experience

**Date:** 2026-03-11
**Status:** Approved — Ready for implementation
**Scope:** Full refactoring of MAP2 Audio Platform terminal experience into a single unified Textual host application governed by IBM Design Language / Carbon design system principles.

---

## Executive Summary

The MAP2 Audio Platform currently ships 3 separate Textual TUI applications, 5+ interactive shell scripts with `read -p` prompts, 2 overlapping shell welcome systems, a whiptail-based installer, and 10 bespoke color themes — none aligned to any design system. The terminal experience is fragmented across 152 Python files (62,674 lines), 81 screen/tab/pane classes, a 2,618-line monolithic API client, and 982 notification calls with inconsistent severity and timeout behavior.

This directive consolidates everything into **one unified Textual host application** built on `MAP2AudioTUI` (tui/app.py), governed by IBM Design Language / Carbon design tokens, using Textual's native APIs (Theme, CommandProvider, workers) instead of custom reimplementations.

---

## Decision Record (35 Decisions)

### Welcome & Shell (Q1–Q10)
| # | Decision |
|---|----------|
| Q1 | Compact welcome — banner + Node Status Grid + service status only; details behind `map2-info` |
| Q2 | Numbered action menu at bottom with exact commands |
| Q3 | Single source of truth in `/etc/profile.d/map2-welcome.sh` |
| Q4 | Remove Shell Customization section — custom prompt is purpose-built |
| Q5 | Dark theme override matching IBM Carbon dark palette |
| Q6 | Single-line styled title + thin `───` rule (no ASCII art banner) |
| Q7 | `bind -x` hotkey for always-available action menu |
| Q8 | Keep all 7 fields in Node Status Grid |
| Q9 | `map2-info` = alias to `map2-tui` (Textual Node Console, live dashboard) |
| Q10 | Version from `git describe --tags` or `version.json` file |

### Architecture (Q11–Q15)
| # | Decision |
|---|----------|
| Q11 | `MAP2AudioTUI` is foundation — absorb NodeConsole and ClusterManagement as screens/modes |
| Q12 | Convert all interactive shell scripts to Python-native — eliminate shell for system operations |
| Q13 | Keep `__map2_prompt_command` as fallback for bare SSH sessions |
| Q14 | No embedded shell — Textual handles everything; `Ctrl+Z` suspends to bash, `fg` resumes |
| Q15 | Replace 10 themes with 2 Carbon themes (dark + high-contrast). Map all variables to Carbon tokens |

### Navigation & UX (Q16–Q20)
| # | Decision |
|---|----------|
| Q16 | Remap Undo to `Ctrl+U` — free `Ctrl+Z` for suspend-to-shell |
| Q17 | Grouped navigation — 4 top-level sections with sub-screens via sidebar |
| Q18 | Rewrite `install-node.sh` in Python/Textual — ship minimal `map2-install` bootstrap |
| Q19 | Split API client into domain modules: `api/audio.py`, `api/chains.py`, etc. |
| Q20 | Auto-detect first run and launch onboarding wizard; subsequent launches go to dashboard |

### Interaction & Data (Q21–Q25)
| # | Decision |
|---|----------|
| Q21 | Merge each duplicate screen pair — diff, combine best features, delete alternates |
| Q22 | Nav groups: `Dashboard` (standalone) · `Audio` (Chains, Effects, MIDI, Guitar, Stage) · `Platform` (Cluster, Monitor, Network, AVB, LCD) · `Settings` (Config, Mode, Workflow, Backup, Updates, Diagnostics) |
| Q23 | Text with Carbon-approved Unicode indicators — `·` or `▸` as active/section markers, no emoji |
| Q24 | Increase LRU screen cache to 8 screens |
| Q25 | Keep Textual `notify()` but enforce style guide: info=3s, success=3s, warning=5s, error=10s |

### Systems & Patterns (Q26–Q30)
| # | Decision |
|---|----------|
| Q26 | Remove per-screen BINDINGS — all actions via command palette (`Ctrl+K`) or on-screen buttons. Footer shows only global nav keys |
| Q27 | Centralized polling manager: one 1s timer, screens register interest via `get_subscriptions()`, only visible screen triggers API calls |
| Q28 | Error deduplication: same error within 30s → suppress, show count badge |
| Q29 | Mandate `@work` for all API calls and system operations |
| Q30 | Layered testing: unit tests for API modules + theme tokens, integration for nav/lifecycle, smoke snapshots for 4 group landing screens |

### Platform & Rollout (Q31–Q35)
| # | Decision |
|---|----------|
| Q31 | Delete `command_palette.py` and `theme_engine.py` — replace with Textual's native `App.COMMANDS` + `Provider` and `App.register_theme()` + `Theme()` |
| Q32 | Command palette categories mirror nav groups: `Dashboard`, `Audio`, `Platform`, `Settings` + `System` for global actions |
| Q33 | Carbon dark = `background=#000000`, `foreground=#ffffff`, `surface=#1a1a1a`, `panel=#2a2a2a`, `primary=#0f62fe`, `error=#da1e28`, `warning=#f1c21b`, `success=#42be65`. High-contrast variant with same values |
| Q34 | Screens implement `get_subscriptions() -> list[str]` returning data domain keys. Poll manager calls registered fetchers and pushes results via Textual messages |
| Q35 | Big bang: build full unified app in feature branch `tui-carbon-unification`, swap when ready |

---

## IBM Design Language / Carbon Rules for Terminal UI

### Mandatory Color Tokens

All widgets, screens, and CSS must use these semantic tokens. **No hardcoded hex colors anywhere** except in the theme registration file.

| Semantic Role | Carbon Token | Hex Value | Textual Variable |
|---|---|---|---|
| Canvas background | `$cds-background` | `#000000` | `$background` |
| Panel background | `$cds-layer-01` | `#1a1a1a` | `$surface` |
| Elevated panel | `$cds-layer-02` | `#2a2a2a` | `$panel` |
| Primary action | `$cds-interactive-01` | `#0f62fe` | `$primary` |
| Secondary action | `$cds-interactive-02` | `#393939` | `$secondary` |
| Text primary | `$cds-text-primary` | `#ffffff` | `$foreground` (mapped to `$text`) |
| Text secondary | `$cds-text-secondary` | `#c6c6c6` | `$text-muted` |
| Border subtle | `$cds-border-subtle` | `#393939` | `$panel` borders |
| Border strong | `$cds-border-strong` | `#6f6f6f` | `$accent` borders |
| Support success | `$cds-support-success` | `#42be65` | `$success` |
| Support warning | `$cds-support-warning` | `#f1c21b` | `$warning` |
| Support error | `$cds-support-error` | `#da1e28` | `$error` |
| Focus | `$cds-focus` | `#ffffff` | Focus ring |
| Selected state | `$cds-interactive-01` | `#0f62fe` | Active selection |
| Disabled state | `$cds-text-disabled` | `#525252` | Disabled text |

### Typography Rules

- **Sentence case** for all UI text: "Chain manager", not "Chain Manager" or "CHAIN MANAGER"
- **No emoji** in UI labels, tab names, notifications, or status text
- Use `·` (middle dot) or `▸` (right-pointing triangle) as active/section markers
- Use clear, explicit labels — avoid icon-only controls
- Use IBM Plex Mono where terminal font configuration allows

### Layout Rules

- Gray-dominant surfaces with blue as the primary action signal
- Purposeful use of support colors (green/yellow/red) — never decorative
- Status must be communicated via **icon + text + color** (triple redundancy for accessibility)
- Breathing room: blank lines between logical groups in formatted output
- No decorative clutter — every visual element must earn its place

### Notification Style Guide

| Severity | Textual severity | Timeout | When to use |
|---|---|---|---|
| Info | `"information"` | 3s | Confirmations, state changes |
| Success | `"information"` | 3s | Completed operations (green tint via message prefix) |
| Warning | `"warning"` | 5s | Degraded state, non-critical failures |
| Error | `"error"` | 10s | Operation failures, connectivity loss |

**Deduplication rule:** If the same error message fires within 30 seconds, suppress the duplicate. Append count: `"Chain fetch failed (x3)"`.

---

## Current-to-Target Architecture Map

### Before (Fragmented)

```
Entry Points:
  ├── python -m tui.app          → MAP2AudioTUI (14 flat tabs, 50+ screens)
  ├── python -m tui.node_console → NodeConsoleApp (6 tabs, separate theme)
  ├── tui/apps/cluster_management_app.py → ClusterManagementApp (standalone)
  ├── branding/welcome.sh        → 525-line shell welcome + functions
  ├── /etc/profile.d/map2-welcome.sh → 354-line duplicate welcome
  ├── map2.sh                    → Master CLI (interactive output)
  ├── m2.sh                      → Quick CLI (pass-through)
  ├── scripts/setup_realtime.sh  → Interactive `read -p` wizard (11 phases)
  ├── scripts/setup_avb.sh       → Interactive `read -p` wizard
  ├── scripts/install-node.sh    → whiptail installer
  └── scripts/map2-mode.sh       → Mode manager with rich output

Custom Reimplementations:
  ├── tui/command_palette.py     → 228 lines reimplementing Textual's Provider
  ├── tui/theme_engine.py        → 306 lines, 10 themes, reimplementing Theme()
  ├── tui/keybindings_system.py  → 246 lines (vim/emacs profiles)
  └── tui/api_client.py          → 2618 lines, 288 methods, monolithic

Fragmentation:
  ├── 6 duplicate screen files (_enhanced, _v2, _refactored variants)
  ├── 26 screens with their own BINDINGS (overlapping with app-level)
  ├── 44 set_interval timers (0.25s to 30s, running when not visible)
  ├── 982 notification calls (inconsistent severity/timeout)
  ├── 30+ hardcoded hex colors in monitoring widgets
  └── 2 TCSS files + inline CSS in app.py (no shared token system)
```

### After (Unified)

```
Entry Points:
  ├── python -m tui.app          → MAP2ConsoleApp (unified, Carbon-themed)
  │   ├── Dashboard (standalone landing)
  │   ├── Audio group (Chains, Effects, MIDI, Guitar, Stage)
  │   ├── Platform group (Cluster, Monitor, Network, AVB, LCD)
  │   ├── Settings group (Config, Mode, Workflow, Backup, Updates, Diagnostics)
  │   ├── Onboarding wizard (first-run auto-detect)
  │   ├── RT setup wizard (native Python, replaces setup_realtime.sh)
  │   ├── AVB setup wizard (native Python, replaces setup_avb.sh)
  │   ├── Mode manager (native Python, replaces map2-mode.sh)
  │   └── Installer flow (replaces install-node.sh whiptail)
  ├── /etc/profile.d/map2-welcome.sh → Compact welcome (single source)
  │   ├── Single-line title + thin rule
  │   ├── Node Status Grid (7 fields)
  │   ├── Service status (3 lines)
  │   ├── "Type map2-tui or press F1-F4" hint
  │   └── Fallback PS1 prompt for bare SSH
  └── map2.sh / m2.sh             → Thin CLI wrappers (non-interactive)

Textual-Native APIs:
  ├── Theme("carbon-dark", ...) + Theme("carbon-dark-hc", ...)
  ├── App.COMMANDS with Provider subclasses (5 categories)
  ├── @work decorator on all API calls
  └── PollManager (centralized 1s tick, subscription-based)

Clean Structure:
  ├── tui/api/audio.py, chains.py, midi.py, cluster.py, plugins.py, system.py
  ├── tui/theme/carbon.py (Theme registration, single file)
  ├── tui/poll_manager.py (centralized polling)
  ├── tui/commands/ (Provider subclasses per nav group)
  ├── tui/screens/ (deduplicated, no _enhanced/_v2/_refactored variants)
  ├── tui/styles/carbon.tcss (single shared stylesheet)
  └── No per-screen BINDINGS (all actions via command palette or buttons)
```

---

## Fragmentation Findings by Severity

### Critical (Must Fix)

1. **Custom `command_palette.py` shows a notification instead of opening a searchable UI** — Textual 7.3.0's native `App.COMMANDS` + `Provider` provides a real fuzzy-search palette out of the box. The custom implementation is 228 lines of dead weight.

2. **Custom `theme_engine.py` with 10 non-Carbon themes** — Textual's `Theme()` constructor takes exactly the tokens we need (`primary`, `surface`, `panel`, `error`, `warning`, `success`, etc.). The 306-line reimplementation adds no value.

3. **26 screens define BINDINGS that shadow app-level keys** — `r` means "refresh" at app level and in 15 screens. `d` means "goto Developer tab" at app level but "diagnostics" in DashboardScreen. `p` means "show progress" at app level but "ping all" in ClusterModeScreen.

4. **44 `set_interval` timers with no lifecycle management** — screens that aren't visible continue polling. `chains_refactored.py` alone registers 4 timers (0.5s, 5s, 5s, 10s). This wastes bandwidth and CPU.

5. **6 duplicate screen files totaling 300KB** — `chains_refactored.py` alone is 228KB (5,940 lines). Enhanced/v2 variants coexist with originals.

### High (Should Fix)

6. **2 overlapping welcome systems** — `branding/welcome.sh` (525 lines) and `/etc/profile.d/map2-welcome.sh` (354 lines) define different versions of the same functions and aliases.

7. **Monolithic `api_client.py`** (2,618 lines, 288 methods) — every screen imports the entire client. No domain separation.

8. **`@work` underused** (25 instances vs hundreds of inline `await`) — long operations can block the Textual event loop.

9. **Notification chaos** — 387 error notifications, many from repeated polling failures. Timeout values range from 1s to 15s with no pattern.

10. **30+ hardcoded hex colors** in monitoring widgets bypass any theme system.

### Medium (Should Fix During Refactor)

11. **`Ctrl+Z` bound to Undo** — conflicts with POSIX suspend-to-shell convention.

12. **Flat 14-tab navigation** — too many tabs for discoverability. Users can't find screens.

13. **LRU cache of 4** — too small for grouped navigation where users traverse more screens.

14. **No first-run detection** — app launches to dashboard whether it's the first time or the hundredth.

15. **`install-node.sh` uses whiptail** — visual and interaction model completely different from the Textual app.

---

## Unified Screen/Mode Map

### Navigation Structure

```
Dashboard (landing screen, standalone — key: 1)
  └── Node status, service health, quick actions, version info

Audio (group — key: 2)
  ├── Chains          — Chain management, A/B mode, DSP load
  ├── Effects         — Plugin browser, search, categories
  ├── MIDI            — Device management, mappings, learn mode
  ├── Guitar          — Signal chain, NAM models, Cabinet/Reverb IRs
  └── Stage           — Stage view, performance mode

Platform (group — key: 3)
  ├── Cluster         — Node dashboard, peer discovery, SSH trust
  ├── Monitor         — 13-service health grid, circuit breakers, alerts
  ├── Network         — Network configuration, firewall
  ├── AVB             — AVB/TSN status, PTP sync, streams
  └── LCD             — LCD display management, I2C hardware

Settings (group — key: 4)
  ├── Configuration   — Audio device settings, PipeDAL
  ├── Mode            — Mode switching (audio/all-in-one/management)
  ├── Workflow        — Workflow automation settings
  ├── Backup          — Backup and restore
  ├── Updates         — System update management
  └── Diagnostics     — System diagnostics, troubleshooting

Global (command palette only — Ctrl+K)
  ├── RT setup wizard
  ├── AVB setup wizard
  ├── Onboarding wizard
  ├── About
  ├── Help
  └── Developer tools
```

### Global Keybindings (Footer-Visible)

| Key | Action | Notes |
|---|---|---|
| `Ctrl+K` | Command palette | Replaces `Ctrl+Shift+P` — shorter, standard |
| `Ctrl+U` | Undo | Replaces `Ctrl+Z` |
| `Ctrl+Z` | Suspend to shell | POSIX standard, resume with `fg` |
| `1` | Dashboard | Direct jump |
| `2` | Audio group | Shows sub-nav |
| `3` | Platform group | Shows sub-nav |
| `4` | Settings group | Shows sub-nav |
| `r` | Refresh active screen | Universal |
| `Escape` | Back / close modal | Universal |
| `q` | Quit app | With confirmation if services running |
| `F1` | Help | Contextual |

### Command Palette Categories

| Category | Example Commands |
|---|---|
| `Dashboard` | "Go to dashboard", "Show version", "View system health" |
| `Audio` | "Go to chains", "Go to effects", "Go to MIDI", "Go to guitar", "Go to stage" |
| `Platform` | "Go to cluster", "Go to monitor", "Go to network", "Go to AVB", "Go to LCD" |
| `Settings` | "Go to configuration", "Go to mode", "Go to backup", "Go to updates", "Go to diagnostics" |
| `System` | "Quit", "Suspend to shell", "Switch theme", "Run RT setup", "Run onboarding", "Show about", "Show help" |

---

## Theme/Token Plan

### File: `tui/theme/carbon.py`

Register two themes using Textual's native `Theme()`:

```python
from textual.theme import Theme

CARBON_DARK = Theme(
    name="carbon-dark",
    primary="#0f62fe",      # IBM Blue 60 — interactive/action
    secondary="#393939",    # Gray 80 — secondary action
    warning="#f1c21b",      # Yellow 30 — support warning
    error="#da1e28",        # Red 60 — support error
    success="#42be65",      # Green 40 — support success
    accent="#0f62fe",       # Same as primary for consistency
    foreground="#ffffff",   # White — text primary
    background="#000000",   # Black — canvas background
    surface="#1a1a1a",      # Gray 100-ish — panel background
    panel="#2a2a2a",        # Gray 90-ish — elevated panel
    dark=True,
)

CARBON_DARK_HC = Theme(
    name="carbon-dark-hc",
    primary="#0f62fe",
    secondary="#525252",
    warning="#f1c21b",
    error="#da1e28",
    success="#42be65",
    accent="#0f62fe",
    foreground="#ffffff",
    background="#000000",
    surface="#1a1a1a",
    panel="#2a2a2a",
    dark=True,
    luminosity_spread=0.25,  # Higher contrast spread
)
```

### Migration: Existing Color References

Every hardcoded hex in the codebase must be replaced:

| Current Pattern | Replacement |
|---|---|
| `#10B981` (monitoring green) | `$success` |
| `#F59E0B` (monitoring yellow) | `$warning` |
| `#EF4444` (monitoring red) | `$error` |
| `#6B7280` (monitoring gray) | `$text-muted` |
| `#1E272E` (API log background) | `$surface` |
| `#0F172A` (node console surface) | `$background` |
| `#6366F1` (node console primary) | `$primary` |
| `#EC4899` (node console accent) | `$accent` |
| `color: green` / `[green]` Rich markup | `$success` or `color: $success` |
| `color: yellow` / `[yellow]` Rich markup | `$warning` or `color: $warning` |
| `color: red` / `[red]` Rich markup | `$error` or `color: $error` |
| `color: cyan` / `[cyan]` Rich markup | `$primary` or `color: $primary` |

---

## Refactor Plan — Phased Steps

### Phase 0: Branch & Foundation (T119)

1. Create feature branch `tui-carbon-unification`
2. Create `version.json` at repo root
3. Register Carbon themes via Textual's native `Theme()`
4. Delete `tui/theme_engine.py`
5. Delete `tui/command_palette.py`
6. Create `tui/theme/carbon.py` with theme registration
7. Create `tui/commands/` directory with `Provider` subclasses
8. Wire `App.COMMANDS` and set default theme to `carbon-dark`

### Phase 1: API Client Split (T120)

1. Split `tui/api_client.py` (2,618 lines) into domain modules
2. Create `tui/api/__init__.py` with facade re-exports
3. Modules: `audio.py`, `chains.py`, `midi.py`, `cluster.py`, `plugins.py`, `system.py`, `base.py`
4. Update all screen imports
5. Unit tests for each module

### Phase 2: Poll Manager (T121)

1. Create `tui/poll_manager.py` with centralized 1s tick
2. Define subscription interface: `get_subscriptions() -> list[str]`
3. Define data domain keys and registered fetcher functions
4. Only fetch for visible screen's subscriptions
5. Push results via Textual messages
6. Remove all 44 `set_interval` calls from screens
7. Integration tests for subscription lifecycle

### Phase 3: Screen Deduplication (T122)

1. Merge `dashboard_screen.py` + `dashboard_screen_enhanced.py` → single `dashboard_screen.py`
2. Merge `chains_manager_screen.py` + `chains_manager_enhanced.py` → single `chains_screen.py`
3. Merge `effects_manager_screen.py` + `effects_manager_enhanced.py` → single `effects_screen.py`
4. Merge `midi.py` + `midi_v2.py` + `midi_enhanced_tab.py` → single `midi_screen.py`
5. Audit `chains_refactored.py` (228KB) — extract live features, delete the file
6. Delete all `_enhanced`, `_v2`, `_refactored` files after merge
7. Verify 210 existing tests still pass

### Phase 4: Navigation Restructure (T123)

1. Replace flat 14-tab `TabbedNavigation` with grouped sidebar
2. Implement 4 groups: Dashboard, Audio, Platform, Settings
3. Each group expands to show sub-screens with `▸` active marker
4. Remove all emoji from `TAB_NAMES`
5. Apply sentence case to all labels
6. Increase LRU cache to 8
7. Remove all per-screen `BINDINGS` arrays (26 files)
8. Wire all former binding actions as command palette commands
9. Update `Ctrl+Z` → suspend, `Ctrl+U` → undo
10. Set `COMMAND_PALETTE_BINDING` to `"ctrl+k"`

### Phase 5: @work Migration (T124)

1. Audit all `await self.api_client.*` calls in event handlers
2. Wrap each in `@work` decorator
3. Add error deduplication (30s window, count badge)
4. Standardize notification timeouts: info=3s, success=3s, warning=5s, error=10s
5. Grep for all `self.app.notify` / `self.notify` calls and fix timeouts/severities

### Phase 6: Carbon CSS Migration (T125)

1. Create `tui/styles/carbon.tcss` — single shared stylesheet
2. Replace all hardcoded hex colors in `monitoring.tcss`
3. Replace all hardcoded hex in `node_console/theme.tcss`
4. Replace inline CSS in `app.py` with `carbon.tcss` import
5. Replace Rich markup colors (`[green]`, `[red]`, etc.) with theme-aware alternatives
6. Delete `tui/styles/monitoring.tcss` and `tui/node_console/theme.tcss`
7. Visual smoke test all 4 nav group landing screens

### Phase 7: Shell Script Elimination (T126)

1. Convert `scripts/setup_realtime.sh` (11 phases) → Python wizard screen
2. Convert `scripts/setup_avb.sh` → Python wizard screen
3. Convert `scripts/map2-mode.sh status/set/verify/chart` → Python mode screen
4. Convert `scripts/install-node.sh` → `map2-install` Textual bootstrap
5. Ensure all Python replacements call the same system commands (systemctl, pw-metadata, etc.)
6. Keep shell scripts on disk but mark deprecated

### Phase 8: Welcome System Consolidation (T127)

1. Rewrite `/etc/profile.d/map2-welcome.sh` as compact single source
2. Single-line title: `MAP2 Audio Platform` + thin `───` rule
3. Node Status Grid (7 fields) with Carbon dark ANSI colors
4. Service status (compact 1-line per service)
5. Action hint: `Type map2-tui to launch console · F1-F4 for quick access`
6. Version from `version.json`
7. Set terminal colors: `\e]11;#000000\e\\` (bg) + `\e]10;#ffffff\e\\` (fg)
8. Delete duplicate block from `.bashrc` (lines 27-60)
9. Delete `/etc/profile.d/map2-welcome.sh` old version
10. Simplify `.bashrc` to source only `branding/welcome.sh`
11. Keep `__map2_prompt_command` for bare SSH fallback but update colors to Carbon tokens

### Phase 9: NodeConsole & ClusterApp Absorption (T128)

1. Migrate `NodeConsoleApp` 6 panes into MAP2AudioTUI screens
2. Map: Dashboard→Dashboard, Audio→Audio group, Cluster→Platform group, Mode→Settings group, Logs→command palette action, Help→Help
3. Migrate `ClusterManagementApp` screens into Platform group
4. Delete `tui/node_console/` directory
5. Delete `tui/apps/cluster_management_app.py`
6. Update `tui.sh` and `map2.sh tui` to launch unified app
7. Update `python -m tui.node_console` entry point to redirect

### Phase 10: Testing & Validation (T129)

1. Unit tests for `tui/api/` domain modules (one test file per module)
2. Unit tests for `tui/theme/carbon.py` (verify token values, theme registration)
3. Integration tests for app shell lifecycle: mount, navigate between groups, first-run detection, onboarding trigger
4. Integration tests for suspend/resume (`Ctrl+Z` / `fg`)
5. Integration tests for command palette: search, category filtering, action execution
6. Smoke-test snapshots for 4 nav group landing screens
7. Integration tests for poll manager: subscribe, unsubscribe, visibility gating
8. Verify all 210 pre-existing tests still pass
9. Notification audit: grep all notify calls, verify severity and timeout compliance

---

## File Inventory — Files to Create

| File | Purpose |
|---|---|
| `version.json` | `{"version": "3.1.0", "build": "...", "date": "2026-03-11"}` |
| `tui/theme/__init__.py` | Package init |
| `tui/theme/carbon.py` | Carbon dark + high-contrast theme registration |
| `tui/api/__init__.py` | Facade re-exports |
| `tui/api/base.py` | Base HTTP client with error handling |
| `tui/api/audio.py` | Audio engine API methods |
| `tui/api/chains.py` | Chain management API methods |
| `tui/api/midi.py` | MIDI API methods |
| `tui/api/cluster.py` | Cluster API methods |
| `tui/api/plugins.py` | Plugin API methods |
| `tui/api/system.py` | System/health/config API methods |
| `tui/poll_manager.py` | Centralized polling with subscriptions |
| `tui/commands/__init__.py` | Package init |
| `tui/commands/dashboard.py` | Dashboard CommandProvider |
| `tui/commands/audio.py` | Audio group CommandProvider |
| `tui/commands/platform.py` | Platform group CommandProvider |
| `tui/commands/settings.py` | Settings group CommandProvider |
| `tui/commands/system.py` | System global CommandProvider |
| `tui/styles/carbon.tcss` | Single shared Carbon stylesheet |
| `tui/screens/rt_setup_wizard.py` | RT audio setup wizard (replaces shell script) |
| `tui/screens/avb_setup_wizard.py` | AVB setup wizard (replaces shell script) |
| `tui/screens/mode_manager_screen.py` | Mode management (replaces shell script) |

## File Inventory — Files to Delete

| File | Reason |
|---|---|
| `tui/theme_engine.py` | Replaced by Textual native `Theme()` |
| `tui/command_palette.py` | Replaced by Textual native `Provider` |
| `tui/screens/dashboard_screen_enhanced.py` | Merged into `dashboard_screen.py` |
| `tui/screens/chains_manager_enhanced.py` | Merged into `chains_screen.py` |
| `tui/screens/effects_manager_enhanced.py` | Merged into `effects_screen.py` |
| `tui/screens/chains_refactored.py` | Merged/deleted (228KB cruft) |
| `tui/screens/midi_v2.py` | Merged into `midi_screen.py` |
| `tui/screens/midi_enhanced_tab.py` | Merged into `midi_screen.py` |
| `tui/styles/monitoring.tcss` | Replaced by `carbon.tcss` |
| `tui/node_console/theme.tcss` | Replaced by `carbon.tcss` |
| `tui/node_console/` (entire directory) | Absorbed into main app |
| `tui/apps/cluster_management_app.py` | Absorbed into main app |

---

## Remaining Exceptions and Rationale

1. **`branding/welcome.sh` shell functions remain** — `map2_restart()`, `map2_stop()`, etc. are needed for bare SSH sessions where the Textual app is not running. These are the fallback, not the primary interface.

2. **`__map2_prompt_command` remains** — The multi-line PS1 prompt is needed for interactive bash sessions when the Textual app is suspended via `Ctrl+Z`. It provides mode, git, and venv context.

3. **`map2.sh` and `m2.sh` remain** — Thin CLI wrappers for scriptable/CI use. They become non-interactive (no formatted output beyond simple status lines). They delegate to the Python backend, not to shell functions.

4. **`scripts/setup_realtime.sh` and `scripts/setup_avb.sh` remain on disk** — Marked deprecated with a header comment redirecting to the Textual wizard. Kept for emergency use if Python/Textual is broken.

5. **`keybindings_system.py` can be removed later** — The vim/emacs keybinding profiles are low-priority. The refactor removes per-screen bindings first. The profile system can be revisited post-launch.

6. **Rich markup colors in API client log output** — Some `[green]`, `[red]` markup in log/debug strings is acceptable since these are developer-facing, not user-facing UI.
