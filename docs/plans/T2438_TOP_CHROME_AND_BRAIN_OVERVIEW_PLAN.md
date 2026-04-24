# T2438 — Top Chrome Cutover + Brain Overview Four-Tab Redesign — Execution Plan

**Worklist entry:** `T2438` in [docs/PROJECT_WORKLIST.md](../PROJECT_WORKLIST.md).
**Design bundles:** Claude Design handoffs `ZWqoW_zMnpADvodrjj31fA` (Brain Overview) and `pcN48gu7JNF1cwPE0zxilQ` (Top Bar).
**Cadence:** Single atomic commit to `master`, dual-pushed to `origin` + `gitlab`, then rebuild and restart. No stubs, no feature flags, no legacy shims.
**Session shape:** This plan is written so the next session can execute top-to-bottom without re-deriving any decision.

---

## 0. Locked decisions (from Q1–Q31)

| # | Topic | Decision |
|---|---|---|
| Q1 | Brain Overview scope | Full four-tab replacement (Performance / Console / Step / Split). |
| Q2+Q3 | Fidelity | Pixel-faithful dark tokens (`#0e1116` canvas, `#161a21` surface, `#3b82f6` accent) + custom components, scoped to `.brain-page`. |
| Q4+Q6+Q7+Q12 | Data wiring | Every field with a backend counterpart is live. Placeholders (waveforms, A/B/C sends, A–H variations, song arrangement, trigger-scan sparkline) are rendered from static/derived data and marked with `data-placeholder`. |
| Q5 | Pad count | Dynamic from `slots.length`. |
| Q8 override | Sidebar | Leave `GlobalTreeNav` untouched; do not add health squares. |
| Q9+Q11 | Page header | Superseded by Q21/Q25 — chrome moves into AppShell. |
| Q10+Q15 → reversed | Routing | **See §1 note below.** Tabs are a frontend-only `?view=performance\|console\|step\|split` param scoped under `section=overview`. Server `active_section` stays on the canonical `'overview'` value. |
| Q13 | Internal headers | Dropped. Each view component renders only its working area. |
| Q14 | Bundling | One file per view under `web/src/app/pages/brainViews/`. |
| Q16 | Mono font | IBM Plex Mono (already shipped with Carbon). |
| Q17+Q19 | Tests | Snapshot update + tab-switch render tests per view; warn count derived from `qualification.issues.length + diagnostics.warnings.length`. |
| Q18 | Import CTAs | Stay only in the existing Library section. Removed from Overview. |
| Q20 | Done criteria | Commit + dual-push + rebuild + restart + visual verify. |
| Q21 | Chrome scope | Global — every route. |
| Q22 | Nav tree | `GlobalTreeNav` unchanged. New top chrome extends over the top of it. |
| Q23 | Context bar | Route-driven breadcrumb + session-only dismiss. |
| Q24 | Workspace buttons | Action-slot contract — real handlers only. |
| Q25 | Page header removal | Drop `PageHeader` on every route. |
| Q26 | Chrome ownership | `AppShell` owns chrome exclusively. `PageHeader` + `ShellWindowTitleStrip` + `WindowTitleStrip` **deleted**. |
| Q27 | Actions | Per-page action-slot contract via `useSetShellWindow`. |
| Q28 → Q30-A | Metadata source | Per-page declaration via `useSetShellWindow({title, subtitle, kicker, actions, accent})`; route table provides defaults. |
| Q29 | Cutover | Full sweep, single commit. |
| Q31 | Commits | One atomic commit. |

---

## 1. Critical constraint — server-side `active_section`

`BrainState.active_section` is a server-typed union:
```ts
active_section: 'overview' | 'perform' | 'layers' | 'sequence' | 'routing'
  | 'inputs' | 'library' | 'session_media' | 'practice_coach' | 'diagnostics'
```
([web/src/map2/api.ts:1717](../../web/src/map2/api.ts#L1717))

Promoting Brain tabs (Performance/Console/Step/Split) to first-class `?section=` values would require widening this union, which means a backend change. That is **out of scope** for T2438.

**Resolution:** Keep `section=overview` as the canonical value. Introduce a new frontend-only URL param `?view=performance|console|step|split` that is scoped *under* `section=overview`. The tab row is rendered only when `activeSection === 'overview'`. The four-tab state is stored in the URL (bookmarkable, shareable), persisted separately in `localStorage` for the "last view used" UX, and falls back to `performance` by default. When the user navigates to a non-overview section (perform / layers / sequence / routing / inputs / library / session_media / practice_coach / diagnostics), the `?view=` param is stripped.

This reverses the spirit of Q10+Q15 ("promote tabs to first-class sections") without a backend change. **If the next session wants the full promotion, add a preceding subtask to widen `BrainState.active_section` in both Python (`app/services/brain_state_service.py`) and `web/src/map2/api.ts`, then update this plan's §8 accordingly.**

---

## 2. Execution phases (ordered)

Execute strictly in this order. Each phase must typecheck and test-pass before the next starts. The single atomic commit is made at the end of Phase 7.

| Phase | Goal | Effort estimate |
|---|---|---|
| 1 | Expand `ShellWindowContext` + add `useSetShellWindow` hook | 30 min |
| 2 | Build new chrome components (ContextBar, WorkspaceBar, ContentKicker) + CSS | 1.5 h |
| 3 | Rewire `AppShell` to render new chrome globally; expand presentation defaults | 1 h |
| 4 | Migrate all 25 pages off `<PageHeader>` / `<ShellWindowTitleStrip>` via `useSetShellWindow` | 3 h |
| 5 | Delete retired chrome files + their tests | 15 min |
| 6 | Brain Overview four-tab redesign (views + tab shell + warn count) | 3 h |
| 7 | Test updates: `AppShell.test.tsx`, `PerformanceBrainPage.test.tsx`, `DesktopExperience.snapshot.test.tsx.snap`, `HoToneJoGGView.test.tsx`, `HostMachinePage.test.tsx`, `GroundControlProPage.test.tsx`, `DesktopExperience.integration.test.tsx` | 1.5 h |
| 8 | Typecheck + full test run + build + commit + dual-push + rebuild + restart + verify | 45 min |

Total: **~11 hours** of focused execution. Budget accordingly.

---

## 3. Phase 1 — Expand `ShellWindowContext`

### 3.1 File: `web/src/app/layout/ShellWindowContext.ts`

**Before (current):**
```ts
export interface ShellWindowContextValue {
  title: string
  titleIcon: ComponentType<{ width?: number; height?: number; className?: string }>
  routeHint: string
  accentColor: string
  onClose: () => void
}
```

**After:**
```ts
import type { ComponentType, ReactNode } from 'react'

export type ShellActionStatus = 'ok' | 'warn' | 'error' | 'info'

export interface ShellActionSlot {
  /** Stable ID; also used as React key */
  id: string
  /** Short label in mono uppercase */
  label: string
  /** Optional icon component */
  icon?: ComponentType<{ size?: number; className?: string }>
  /** onClick handler */
  onClick?: () => void
  /** Active pill state (blue-outlined) */
  active?: boolean
  /** Optional status dot at left edge */
  status?: ShellActionStatus
  /** Disabled state */
  disabled?: boolean
  /** Tooltip / aria-label */
  title?: string
}

export interface ShellWindowContextValue {
  /** Display title for the current workspace/page */
  title: string
  /** Subtitle (one-line, under the title) */
  subtitle?: string
  /** Optional content-body kicker ("Platform / Brain") */
  kicker?: string
  /** Breadcrumb array for the blue context bar (["Workspace surface", "Brain"]) */
  crumbs?: string[]
  /** Icon component for the current workspace/page */
  titleIcon: ComponentType<{ width?: number; height?: number; className?: string; size?: number }>
  /** Breadcrumb-style route hint (e.g. "midi-hub / connections") */
  routeHint: string
  /** CSS color string for the workspace accent */
  accentColor: string
  /** 0–3 action slots rendered in the workspace bar */
  actions?: ShellActionSlot[]
  /** Optional content-kicker lead paragraph */
  lead?: ReactNode
  /** Close handler — navigates back to home */
  onClose: () => void
}

export const ShellWindowContext = createContext<ShellWindowContextValue | null>(null)
export const ShellWindowProvider = ShellWindowContext.Provider
```

### 3.2 New file: `web/src/app/layout/useSetShellWindow.ts`

```ts
import { useContext, useEffect } from 'react'
import { ShellWindowMutatorContext } from './ShellWindowMutatorContext'
import type { ShellWindowContextValue } from './ShellWindowContext'

export type ShellWindowPatch = Partial<Pick<
  ShellWindowContextValue,
  'title' | 'subtitle' | 'kicker' | 'crumbs' | 'actions' | 'lead' | 'accentColor'
>>

/**
 * Page-level hook: page declares its chrome metadata and action slots.
 * Applied at mount + whenever `patch` changes; cleared at unmount.
 */
export function useSetShellWindow(patch: ShellWindowPatch, deps: unknown[]): void {
  const mutator = useContext(ShellWindowMutatorContext)
  useEffect(() => {
    if (!mutator) return
    mutator.set(patch)
    return () => mutator.clear()
    // deps is the page-controlled array (mutations, handlers, derived state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
```

### 3.3 New file: `web/src/app/layout/ShellWindowMutatorContext.ts`

```ts
import { createContext } from 'react'
import type { ShellWindowPatch } from './useSetShellWindow'

export interface ShellWindowMutator {
  set: (patch: ShellWindowPatch) => void
  clear: () => void
}

export const ShellWindowMutatorContext = createContext<ShellWindowMutator | null>(null)
export const ShellWindowMutatorProvider = ShellWindowMutatorContext.Provider
```

### 3.4 Update `web/src/app/layout/useShellWindow.ts`

Unchanged surface. Still returns `ShellWindowContextValue | null`.

---

## 4. Phase 2 — Build new chrome components

All go under `web/src/app/layout/chrome/`:

### 4.1 `web/src/app/layout/chrome/ContextBar.tsx` + `ContextBar.css`

**Component spec:**
- 32px tall, sticky `top: 0`, `z-index: 60`.
- Background `var(--blue-60, #0f62fe)`, white text.
- Grid: `1fr auto`. Left = trail; right = `×` dismiss button.
- Trail: `~ crumb[0] / crumb[1] / … · routeHint` with the last crumb bold.
- Session-only dismiss: `useState(false)` lifted to `AppShell`, resets on reload. Add `aria-hidden` on dismissed state; apply `ctx--hidden` class (translateY(-100%), opacity 0).
- Font: `var(--f-mono, "IBM Plex Mono", ui-monospace, monospace)`.

**Props:** `{ crumbs: string[]; routeHint: string; onDismiss: () => void; hidden: boolean }`.

**CSS:** Port from design bundle `top-bar/project/Top Bar.html` lines 48-85 verbatim, renaming `.ctx` → `.shell-ctx`, matching `--blue-60` / `--g-100` with the Carbon tokens already in the app (`var(--cds-link-primary)` / `var(--cds-layer)`). CSS vars added to `:root` in this file:
```
--ctx-h: 32px;
--ws-h: 40px;
```

### 4.2 `web/src/app/layout/chrome/WorkspaceBar.tsx` + `WorkspaceBar.css`

**Component spec:**
- 40px tall, sticky `top: var(--ctx-h, 32px)`, `z-index: 55`. When context bar is hidden, top collapses to `0`.
- Three-column grid: `var(--global-tree-width, 16rem) | 1fr | auto`.
- Left cell (`#101010` bg, `border-right: 1px solid var(--border, #2a2a2a)`):
  - Hamburger icon (`M4 6h16M4 12h16M4 18h10`)
  - `"GLOBAL NAVIGATION"` in mono uppercase 11px, `letter-spacing: 0.14em`, `var(--cds-text-helper)`.
  - Pin toggle ( `‹` / `›`) with `aria-label="Toggle global navigation pin"` — shows only when the nav is pinned; hidden when already collapsed.
- Middle cell (`#0f0f0f` bg):
  - 6×6 blue dot (`var(--blue-50, #4589ff)`)
  - `"Platform Workspace · <workspace-name>"` with the workspace name bold.
- Right cell: up to 3 `ShellActionSlot` buttons + sections. Each:
  - 28px tall, `var(--f-mono)`, uppercase, `letter-spacing: 0.08em`.
  - Hover: `#1a1a1a`.
  - `active: true` → `color: var(--blue-30); border-color: rgba(15,98,254,0.35); background: rgba(15,98,254,0.08);`.
  - `status: 'ok'` → leading 6px green dot (`var(--signal-green, #42be65)`).
  - `status: 'warn'` → leading amber dot (`var(--signal-yellow, #f1c21b)`).
  - `status: 'error'` → leading red dot (`var(--signal-red, #fa4d56)`).

**Props:**
```ts
interface WorkspaceBarProps {
  workspaceLabel: string
  actions: ShellActionSlot[]
  navPinned: boolean
  onToggleNavPin: () => void
  contextBarHidden: boolean
}
```

### 4.3 `web/src/app/layout/chrome/ContentKicker.tsx` + `ContentKicker.css`

**Component spec:**
- Rendered at the top of `<main>` inside `AppShell`, above the page `children`.
- Eyebrow: mono 11px, `var(--blue-40)`, prefixed with a 20px horizontal accent bar (`::before { content: ''; width: 20px; height: 1px; background: var(--blue-40) }`).
- H1: `clamp(1.75rem, 3vw, 2.5rem)`, `font-weight: 300`, `letter-spacing: -0.02em`.
- Lead: `var(--cds-text-secondary)`, max-width `62ch`, 16px.
- Suppressed entirely when the current page has no `kicker` *and* no `subtitle` (prevents empty render on desktop/landing routes).

**Props:**
```ts
interface ContentKickerProps {
  kicker?: string
  title: string
  subtitle?: string
  lead?: ReactNode
}
```

### 4.4 Token bridge file: `web/src/app/layout/chrome/chrome-tokens.css`

Add the design-bundle tokens as CSS variables on `:root`:
```css
:root {
  --ctx-h: 32px;
  --ws-h: 40px;
  --blue-60: var(--cds-link-primary, #0f62fe);
  --blue-50: #4589ff;
  --blue-40: #78a9ff;
  --blue-30: #a6c8ff;
  --blue-20: #d0e2ff;
  --signal-green: #42be65;
  --signal-yellow: #f1c21b;
  --signal-red: #fa4d56;
  --f-mono: 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace;
  --f-sans: 'Inter Tight', 'Inter', 'IBM Plex Sans', system-ui, sans-serif;
}
```

Imported once via AppShell.

---

## 5. Phase 3 — Rewire `AppShell`

### 5.1 `web/src/app/layout/AppShell.tsx` changes

1. Lift `shellWindow` state (`ShellWindowContextValue` seed derived from `useAppShellPresentation`) plus the `patch` overlay state. Provide:
   - `ShellWindowProvider` with the *merged* value (seed + patch).
   - `ShellWindowMutatorProvider` with `{ set, clear }`.
2. Lift context-bar dismissed state (`useState(false)`, session-only).
3. Render order inside `.app-shell`:
   ```
   <ContextBar ... hidden={contextBarHidden} onDismiss={...} />
   <WorkspaceBar ... navPinned={globalNavPinned} onToggleNavPin={...} />
   <div className="app-shell__frame">
     <GlobalTreeNav ... />  {/* unchanged */}
     <main className="app-content app-content--with-global-tree">
       <ShellWindowProvider ...>
         <ShellWindowMutatorProvider ...>
           <ContentKicker kicker={title + subtitle + kicker} .../>
           <PageTransition>{children}</PageTransition>
         </ShellWindowMutatorProvider>
       </ShellWindowProvider>
     </main>
   </div>
   ```
4. The nav-collapsed rail (`.app-shell__nav-collapsed-rail`) still renders when `globalNavPinned === false`, but the workspace bar's left cell shrinks correspondingly via `--global-tree-width`. Re-verify that `--global-tree-width` updates correctly with this layout.
5. `.mobile-connection-banner` z-index unchanged (41, below workspace bar's 55).
6. Delete the existing `shellWindowContext` memo that uses `isDesktopRoute ? null : ...` — the provider is always mounted now; pages that shouldn't have chrome (e.g. desktop route) set `kicker=''` and `title=''` so `<ContentKicker>` renders nothing.

### 5.2 `web/src/app/layout/AppShell.css` changes

1. Bump `.app-shell__frame` to account for the fixed 72px of top chrome (32 + 40):
   ```css
   .app-shell__frame {
     display: grid;
     grid-template-columns: var(--global-tree-width, 0rem) 1fr;
     min-height: calc(100vh - var(--ctx-h, 32px) - var(--ws-h, 40px));
   }
   ```
2. When `contextBarHidden`, set `--ctx-h: 0px` on `.app-shell` so the workspace bar slides up and the frame grows.
3. Retire the `.app-shell--windowed` section (lines 178-194) — no more per-page title strip.

### 5.3 `web/src/app/layout/useAppShellPresentation.ts` expansion

Add per-route defaults:
```ts
return {
  // ... existing fields
  shellKicker: currentShellItem ? `Platform / ${currentShellItem.shortLabel ?? currentShellItem.label}` : undefined,
  shellSubtitle: currentShellItem?.description,
  shellCrumbs: ['Workspace surface', currentShellItem?.shortLabel ?? currentShellItem?.label ?? 'Workspace'],
}
```

Pages can override via `useSetShellWindow`. The seed wins for pages that don't call the hook.

---

## 6. Phase 4 — Migrate all 25 pages

### 6.1 Migration pattern (canonical)

Every page that currently renders `<PageHeader title="..." subtitle="..." icon={...} actions={...} />` or `<ShellWindowTitleStrip />` follows this pattern:

**Before:**
```tsx
return (
  <section className="page">
    <PageHeader
      title="Foo"
      subtitle="Bar"
      icon={<FooIcon size={32} />}
      actions={<Button onClick={handleSave}>Save</Button>}
    />
    {/* body */}
  </section>
)
```

**After:**
```tsx
useSetShellWindow({
  title: 'Foo',
  subtitle: 'Bar',
  kicker: 'Platform / Foo',
  actions: [
    { id: 'save', label: 'Save', icon: Save, onClick: handleSave, active: saveMutation.isPending },
  ],
}, [saveMutation.isPending, handleSave])

return (
  <section className="page">
    {/* body — no header */}
  </section>
)
```

**Rules:**
- `kicker` convention: `"Platform / <workspace-label>"`. For sub-routes: `"Platform / MIDI Hub / Connections"`.
- `actions` max 3; pages with >3 pre-existing buttons promote the top 3 to the workspace bar and move the rest into an in-body toolbar.
- Where `actions` was a complex JSX element (`<div className="flex">...<Tag>...</Tag>...<Button>...</Button></div>`), the Tag pills go into the `status` field of the first action slot OR into a new in-body status row (status tags don't belong in the workspace bar — only interactive buttons).
- Pages that currently render icons >24px in `PageHeader` drop the icon entirely; titleIcon is supplied by `useAppShellPresentation` from `allRouteNavigationItems`.

### 6.2 Page-by-page migration list

| # | File | Current chrome | `actions` surface | Notes |
|---|---|---|---|---|
| 1 | [web/src/app/components/Devices/EdirolUA1000/EdirolUA1000View.tsx](../../web/src/app/components/Devices/EdirolUA1000/EdirolUA1000View.tsx) | `<PageHeader>` | Start/Stop Audio, Refresh | Subtitle includes remote-node label when `remoteSelected` — dynamic subtitle via deps. |
| 2 | [web/src/app/components/Devices/HoToneJoGG/HoToneJoGGView.tsx](../../web/src/app/components/Devices/HoToneJoGG/HoToneJoGGView.tsx) | `<PageHeader>` | none | Subtitle is node-context aware. |
| 3 | [web/src/app/components/Devices/LCD/LCDView.tsx](../../web/src/app/components/Devices/LCD/LCDView.tsx) | `<PageHeader>` | Live/Paused toggle, Refresh | `hideChrome` conditional becomes a `useSetShellWindow` call guarded by the same flag. |
| 4 | [web/src/app/pages/AudioEnginePage.tsx](../../web/src/app/pages/AudioEnginePage.tsx) | `<PageHeader>` | per-page toolbar | Read first — likely multiple action buttons. |
| 5 | [web/src/app/pages/LaunchControlPage.tsx](../../web/src/app/pages/LaunchControlPage.tsx) | `<PageHeader>` | TBD | |
| 6 | [web/src/app/pages/McuPage.tsx](../../web/src/app/pages/McuPage.tsx) | `<PageHeader>` | TBD | |
| 7 | [web/src/app/pages/MidiCommanderPage.tsx](../../web/src/app/pages/MidiCommanderPage.tsx) | `<PageHeader>` | Connected/Ports/Daemon Tags — move to status row in body | |
| 8 | [web/src/app/pages/PushSurfacePage.tsx](../../web/src/app/pages/PushSurfacePage.tsx) | `<PageHeader>` | Back, Reload, Save (3 actions) | Back becomes `onClose` override. |
| 9 | [web/src/app/pages/HostMachinePage.tsx](../../web/src/app/pages/HostMachinePage.tsx) | `<PageHeader>` (two call sites) | Refresh | `allNodesSelected` variant changes title — dynamic title via deps. |
| 10 | [web/src/app/pages/GroundControlProPage.tsx](../../web/src/app/pages/GroundControlProPage.tsx) | `<PageHeader>` | Backup, Compile, Push (3 actions) | |
| 11 | [web/src/app/pages/MaschineMidiMapPage.tsx](../../web/src/app/pages/MaschineMidiMapPage.tsx) | `<PageHeader>` | TBD | |
| 12 | [web/src/app/pages/MaschinePage.tsx](../../web/src/app/pages/MaschinePage.tsx) | `<PageHeader>` | TBD | |
| 13 | [web/src/app/pages/PerformanceBrainPage.tsx](../../web/src/app/pages/PerformanceBrainPage.tsx) | `<PageHeader>` | Focus Overview, Back to Audio Grid | Also rewritten in Phase 6 — coordinate edits. |
| 14 | [web/src/app/components/Platform/PlatformModal.tsx](../../web/src/app/components/Platform/PlatformModal.tsx) | `<ShellWindowTitleStrip>` | n/a | Modal — use `Close` button instead of chrome. |
| 15 | [web/src/app/components/Devices/DevicesShell.tsx](../../web/src/app/components/Devices/DevicesShell.tsx) | `<ShellWindowTitleStrip>` | n/a | Shell — `useSetShellWindow` pushes child route's title through. |
| 16 | [web/src/app/pages/MOTURMEPage.tsx](../../web/src/app/pages/MOTURMEPage.tsx) | `<ShellWindowTitleStrip>` | n/a | |
| 17 | [web/src/app/pages/LegacyPage.tsx](../../web/src/app/pages/LegacyPage.tsx) | `<ShellWindowTitleStrip>` | n/a | |
| 18 | [web/src/app/pages/PipeWirePage.tsx](../../web/src/app/pages/PipeWirePage.tsx) | `<ShellWindowTitleStrip>` | n/a | |
| 19 | [web/src/app/pages/MeteringPage.tsx](../../web/src/app/pages/MeteringPage.tsx) | `<ShellWindowTitleStrip>` | n/a | |
| 20 | [web/src/app/pages/ExpressionPage.tsx](../../web/src/app/pages/ExpressionPage.tsx) | `<ShellWindowTitleStrip>` | n/a | |
| 21 | [web/src/app/pages/AudioArtifactsPage.tsx](../../web/src/app/pages/AudioArtifactsPage.tsx) | `<ShellWindowTitleStrip>` | n/a | |
| 22 | [web/src/app/pages/ChainsPage.tsx](../../web/src/app/pages/ChainsPage.tsx) | `<ShellWindowTitleStrip>` | n/a | |
| 23 | [web/src/app/pages/MidiHubShell.tsx](../../web/src/app/pages/MidiHubShell.tsx) | `<ShellWindowTitleStrip>` | n/a | Child pages call `useSetShellWindow` with their sub-route title. |
| 24 | [web/src/app/pages/SnapshotPublishPage.tsx](../../web/src/app/pages/SnapshotPublishPage.tsx) | `<ShellWindowTitleStrip>` | n/a | |
| 25 | [web/src/app/pages/SnapshotEditorPageContent.tsx](../../web/src/app/pages/SnapshotEditorPageContent.tsx) | `<ShellWindowTitleStrip>` | n/a | |

For each page: *read the full file* before editing. Identify which props come from page state vs. static strings, add the appropriate deps to the `useSetShellWindow` call.

### 6.3 MIDI Hub child pages

The MIDI Hub shell has 7 child pages under `web/src/app/pages/midi-hub/`:
- `MidiHubConnectionsPage`
- `MidiHubPresetsPage`
- `MidiHubTransportPage`
- `MidiHubEventsPage`
- `MidiHubProcessingPage`
- `MidiHubNetworkPage`
- `MidiHubLabPage`

Check each for local chrome usage — if any render `<PageHeader>` or status stripes, migrate via `useSetShellWindow` so the title/subtitle/actions show up in the top chrome instead of inline.

---

## 7. Phase 5 — Delete retired files

After all 25 migrations compile, delete:

```
web/src/app/components/PageHeader.tsx
web/src/app/components/PageHeader.css
web/src/app/components/PageHeader.test.tsx
web/src/app/components/shared/ShellWindowTitleStrip.tsx
web/src/app/components/shared/WindowTitleStrip.tsx
web/src/app/components/shared/WindowTitleStrip.css
```

Verify no other file still imports any of these (`grep -rn "from.*PageHeader\|from.*ShellWindowTitleStrip\|from.*WindowTitleStrip" web/src`).

---

## 8. Phase 6 — Brain Overview four-tab redesign

### 8.1 New files under `web/src/app/pages/brainViews/`

All four views share:
- Dark tokens scoped to `.brain-overview` (canvas `#0e1116`, surface `#161a21`, surface2 `#1c222b`, border `#2a3240`, accent `#3b82f6`, ok `#22c55e`, warn `#f59e0b`, danger `#ef4444`, magenta `#d946ef`, cyan `#22d3ee`).
- Mono font stack via `--f-mono` token from chrome-tokens.css.
- Rendered inside a shared container that applies `.brain-overview` class; individual views render only their working area (no BrainShell, no internal header — dropped per Q13).

#### 8.1.1 `brainViews/BrainOverviewShell.tsx`

Wraps the four views in a tab row that reads/writes `?view=` search param. Props:
```ts
interface Props {
  state: BrainState
  transport: BrainTransportState
  slots: BrainSlot[]
  layers: BrainLayer[]
  sequence: BrainSequence
  mixer: BrainMixerState
  inputs: BrainInputsState
  diagnostics: BrainDiagnostics
  // mutation handlers lifted from parent
  onTransport: (patch: Partial<BrainTransportState>) => void
  onSlotSelect: (slotId: number) => void
  onSlotUpdate: (slotId: number, patch: Partial<BrainSlot>) => void
}
```

Layout:
```
<div className="brain-overview">
  <div className="brain-overview__tabs">
    {VIEWS.map(v => <TabButton ... />)}
    <div className="brain-overview__tab-spacer" />
    <div className="brain-overview__tab-meta">
      {warnCount > 0 && <Tag tone="warn">{warnCount} WARN</Tag>}
      {readyCount === 4 && <Tag tone="ok">READY</Tag>}
    </div>
  </div>
  <div className="brain-overview__body">
    {activeView === 'performance' && <PerformanceView ... />}
    {activeView === 'console' && <ConsoleView ... />}
    {activeView === 'step' && <StepView ... />}
    {activeView === 'split' && <SplitView ... />}
  </div>
</div>
```

Warn count:
```ts
const warnCount = (diagnostics.controller_qualification.issues.length ?? 0) + (diagnostics.warnings.length ?? 0)
```

#### 8.1.2 `brainViews/PerformanceView.tsx` — Option A

Replicates design bundle's `option-a.jsx` ([brain-main-page/project/option-a.jsx](#)):
- **TransportHero:** play/stop/rec buttons wired to `onTransport({ is_playing, is_recording })`. BPM from `transport.bpm`. Position from `transport.bar`/`transport.beat`/`transport.step`. Mini waveform is a static math placeholder (`data-placeholder="transport-waveform"`). L/R meters static (`data-placeholder="master-meter"`). Voices from `diagnostics.active_voices`/`diagnostics.peak_voices`. Headroom from `diagnostics.polyphony_headroom`. Latency from `diagnostics.roundtrip_latency_ms`.
- **PadMatrix:** `slots.length` pads, grid shape = 4×4 / 4×3 / 4×2 chosen dynamically. Colors keyed by `slot.mode` + `slot.output_bus`. Active pad = `state.active_slot`. Mute/solo from slot state. onClick → `onSlotSelect(slot.slot_id)`.
- **StatusStrip:** Snapshot authority, Workspace, Tier, Qualification (1/4 or N/4), CPU, Roundtrip — from `state.snapshot_integration`, `diagnostics`, `qualification`.
- **AttentionList:** Iterate `qualification.issues` + each area's `issues[]`. Resolve buttons go to the section that issue belongs to (keyboard → layers, triggers → inputs, sequence → sequence, routing → routing).
- **Focused slot card:** active slot's name, bus, asset info from `activeSlot`. Mini waveform static.

#### 8.1.3 `brainViews/ConsoleView.tsx` — Option B

Replicates `option-b.jsx`:
- Inline transport + BPM strip.
- 16 channel strips — one per slot, max 16 (truncate if >16 slots). `level`, `mute`, `solo`, `pan` from `slot.level/mute/solo/pan`. Name = `slot.name`. Color keyed by mode. Fader drag → `onSlotUpdate(slot.slot_id, { level })` (debounce 100ms). Meter segs animate from `slot.level` (no real meter feed — flagged `data-placeholder="channel-meter"`).
- A/B/C sends: static 3-box UI with A active for slots with `reverb_send > 0` (derived from `BrainMixerState.buses[slot.output_bus].reverb_send`). Real send matrix is not in scope.
- Bus routing matrix: 8 × 10 grid from `mixer.buses` and `output_pair` counts; assignments = `buses.filter(b => b.output_pair === pairIdx)`.
- Qualification list: same data as PerformanceView AttentionList.

#### 8.1.4 `brainViews/StepView.tsx` — Option C

Replicates `option-c.jsx`:
- 8-track × 16-step grid. Tracks from `sequence.lanes.slice(0, 8)`. Each lane's `active_steps` count produces a deterministic placeholder pattern; real per-step bitmap is `data-placeholder="step-pattern"` until the API exposes it.
- Playhead = `transport.step`, animated.
- Pattern variation buttons A–H (1..8) — active = `transport.variation`, onClick → `onTransport({ variation })`.
- Song arrangement lane: from `state.song.entries`, one row per unique pattern ID.
- Per-step detail: derived from the active step (`transport.step`) + active track (default kick). Fields = Velocity / Probability / Micro / Retrig / Length / Cond with `data-placeholder` until per-step API lands.
- Trigger scan sparkline: from `diagnostics.trigger_latency_ms` history — keep a small rolling window in a `useRef` + `useEffect`. Real RMS feed not in scope.

#### 8.1.5 `brainViews/SplitView.tsx` — Option D

Replicates `option-d.jsx`:
- KeyboardModule: 3 octaves (21 white keys). Zones from `inputs.keyboard_zones`. Each zone span colored; held-key highlights static (no real MIDI feed) — flag `data-placeholder="keyboard-held-keys"`.
- PadsModule: first 8 slots.
- RoutingModule: 6×8 source × destination matrix. Sources from first 6 slots; destinations from `mixer.buses` + 2 hard "Main L/R" + `state.snapshot_integration` Rec/Ext pseudo-destinations. Assignments from `buses.output_pair` + `slot.output_bus`.
- Migration & import card: buttons REMOVED per Q18 — imports live in Library section only.
- Qualification progress strip: `ready_surface_count / 4` bar + same issue list.

### 8.2 `brainViews/brainViews.css`

Single stylesheet scoped under `.brain-overview`. Exports all the dark tokens as scoped CSS vars. Keep file ≤ 500 lines.

### 8.3 Update `web/src/app/pages/PerformanceBrainPage.tsx`

1. Add `?view=` search param handling:
   ```ts
   const viewParam = searchParams.get('view')
   const normalizedView = (['performance', 'console', 'step', 'split'] as const).includes(viewParam as any)
     ? viewParam as BrainViewId
     : (typeof window !== 'undefined' ? localStorage.getItem('brain:last-view') : null) as BrainViewId | null
     ?? 'performance'
   ```
2. When `activeSection === 'overview'`, render `<BrainOverviewShell {...props} />` in place of the existing `OverviewCards` block ([lines 602-667](../../web/src/app/pages/PerformanceBrainPage.tsx#L602-L667)).
3. When `activeSection !== 'overview'`, strip `?view=` from URL on change. This is already handled by `handleSectionChange` — extend it to delete `view` search param.
4. Replace the page-level `<PageHeader>` call ([lines 528-544](../../web/src/app/pages/PerformanceBrainPage.tsx#L528-L544)) with `useSetShellWindow`:
   ```ts
   useSetShellWindow({
     title: 'Performance Brain',
     subtitle: 'Unified drum-and-sequencer brain with keyboard layers, trigger nuance, routing, diagnostics, and snapshot-first workflow.',
     kicker: 'Platform / Performance Brain',
     actions: [
       { id: 'focus-overview', label: 'Focus Overview', icon: Reset, onClick: () => handleSectionChange('overview'), active: activeSection === 'overview' },
       { id: 'back-audio-grid', label: 'Back to Audio Grid', icon: ArrowLeft, onClick: () => navigate('/juce-grid') },
     ],
   }, [activeSection, handleSectionChange, navigate])
   ```
5. Delete the `OverviewCards` function ([lines 167-220](../../web/src/app/pages/PerformanceBrainPage.tsx#L167-L220)). Delete the `QualificationStrip` function if unused after Brain overview refactor (likely reused by `BrainOverviewShell` — inline it there).
6. Import `./PerformanceBrainPage.css` for the persistent surrounding layout; import `./brainViews/brainViews.css` for the overview tab styles.

---

## 9. Phase 7 — Test updates

Required updates, one file at a time:

1. **`web/src/app/pages/PerformanceBrainPage.test.tsx`**
   - Remove any `getByText('Performance Brain')` expectations that assumed `<PageHeader>` DOM.
   - Replace with assertions against `useSetShellWindow` mock (spy the mutator) OR against the `ContentKicker` DOM (if rendered inside the test's `AppShell` wrapper).
   - Add `describe('overview tabs')` block: renders each of the 4 tabs when `?section=overview&view=X`; tab click updates URL search param; warn count = `issues.length + warnings.length`.

2. **`web/src/app/layout/AppShell.test.tsx`**
   - Assert new chrome DOM: `.shell-ctx`, `.shell-ws`, `.shell-ctx__close` renders; dismiss sets `ctx--hidden`; workspace bar's workspace label reflects route.
   - Remove `<WindowTitleStrip>` expectations.

3. **`web/src/app/pages/__snapshots__/DesktopExperience.snapshot.test.tsx.snap`** — regenerate with `npx jest --testPathPattern=DesktopExperience.snapshot -u`.

4. **`web/src/app/pages/DesktopExperience.integration.test.tsx`** — update selectors from `.window-title-strip` to `.shell-ws` or `.shell-ctx`.

5. **`web/src/app/components/Devices/HoToneJoGG/HoToneJoGGView.test.tsx`** — remove `<PageHeader>` expectations; if the test asserts subtitle text, assert via `useSetShellWindow` mock or render within `AppShell`.

6. **`web/src/app/pages/HostMachinePage.test.tsx`**, **`GroundControlProPage.test.tsx`** — same treatment.

7. **Delete** `web/src/app/components/PageHeader.test.tsx`.

---

## 10. Phase 8 — Ship

Execute in this order once all prior phases pass:

```bash
cd web
npm run typecheck                      # must exit 0
npm run lint                            # must exit 0 or exit 1 with only pre-existing warnings
npx jest --no-coverage                  # full suite — must exit 0
npm run build                           # must exit 0

# Bundle-hash verification
ls web/dist/assets/PerformanceBrainPage-*.js
ls web/dist/assets/AppShell-*.js        # if AppShell has its own chunk

cd ..
git add -A
git diff --stat                         # sanity check
git commit -m "$(cat <<'EOF'
feat(T2438): replace page chrome with global AppShell top bar + redesign Brain Overview as four-tab shell

Retires PageHeader, ShellWindowTitleStrip, and WindowTitleStrip. Introduces a
blue context bar (32px) + workspace bar (40px) + content kicker rendered
globally by AppShell, and an action-slot contract via useSetShellWindow so
pages declare their chrome metadata + mutation-bound buttons at mount.

Adds BrainOverviewShell with four first-class views (Performance / Console /
Step / Split) wired to real brainApi data; tab state is a frontend-only ?view=
URL param scoped under ?section=overview (BrainState.active_section remains
unchanged on the server).

Why: two design handoffs (ZWqoW_zMnpADvodrjj31fA Brain Overview, pcN48gu7JNF1cwPE0zxilQ
Top Bar) locked chrome + Brain Overview redesign in user Q&A (Q1-Q31). No
stubs, no legacy shims — one atomic commit per user direction.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"

git push origin master && git push gitlab master

# Full release loop per CLAUDE.md §0.6 "update" shorthand
python3 scripts/continuous_release.py --commit-message "T2438 chrome + Brain Overview"
# (or manual: npm --prefix web run build && pkill -9 -f serve_web_dist.mjs && nohup ...)

# Verify port 3000
curl -sI http://localhost:3000/ | head -5
curl -s http://localhost:3000/ | grep -oE 'index-[a-z0-9]+\.js' | head -1
```

---

## 11. Rollback plan

If something breaks post-commit on `master`:
1. `git revert HEAD --no-edit` — single revert removes the whole change.
2. `git push origin master && git push gitlab master`.
3. Rebuild + restart.

Because there are no feature flags or compat shims, a revert restores the pre-T2438 state atomically.

---

## 12. Known follow-ups (not in scope for this epic)

- Widen `BrainState.active_section` server-side to include the four view IDs, then promote `?view=` into `?section=performance|console|step|split`.
- Real per-channel metering feed for ConsoleView (`slot.level` is a target level, not a current peak).
- Real per-step pattern data for StepView (no API today).
- Real held-key MIDI feed for SplitView's KeyboardModule.
- Action-slot contract extension: overflow menu when a page has >3 actions.

---

_Plan authored 2026-04-24 by Claude. Ready for straight-line execution in a fresh session._
