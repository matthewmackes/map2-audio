/**
 * T2503 Set 10 (promoted 2026-05-10) — MultiTrack Recorder shell.
 *
 * Tier-1 platform surface, peer to MIDI Services. Composition mirrors
 * MidiHubShell exactly so the DAW reads as a first-class service:
 *
 *   - WorkspacePageTemplate (sidebar=null, content-only)
 *   - useSetShellWindow → top chrome (title / subtitle / kicker /
 *     ShellActionSlot rail wired to useDawOverview)
 *   - MultiTrackNodeScopeProvider → per-area queries inherit the
 *     active node id + scope key (Node Pill integration)
 *   - MultiTrackRecorderTabs → 8 sub-area routes via NavLink
 *   - MultiTrackHealthDrawer → opens from the System status action
 *   - <Outlet /> renders the active sub-area page
 *
 * The shell is intentionally light. Each sub-area page owns its own
 * data fetching, mutations, and layout. The shell exists to:
 *   1. own the node scope context,
 *   2. render the tab nav + status drawer,
 *   3. expose chrome to the global ShellWindow.
 */
import { useMemo, useState } from 'react'
import { GlobalTheme, Theme } from '@carbon/react'
import { useLocation, Outlet } from 'react-router-dom'
import {
  ConnectionSignal,
  Folder,
  Music,
  PlayFilled,
  RecordingFilled,
  Time,
  TrashCan,
} from '@carbon/icons-react'

import { WorkspacePageTemplate } from '../components/layout/WorkspacePageTemplate'
import { MultiTrackNodeScopeProvider } from '../components/MultiTrackRecorder/MultiTrackNodeScope'
import { MultiTrackHealthDrawer } from '../components/MultiTrackRecorder/MultiTrackHealthDrawer'
import { useDawOverview, type DawHealth } from '../components/MultiTrackRecorder/useDawOverview'
import { useNodePageContext } from '../hooks/useNodePageContext'
import { useSetShellWindow } from '../layout/useSetShellWindow'
import type { ShellActionSlot } from '../layout/ShellWindowContext'
import { toCarbonBaseTheme, useTheme } from '../theme'
import { NODE_PAGE_KEYS } from '../utils/nodeDisplay'
import { MultiTrackRecorderTabs } from './multitrack-recorder/MultiTrackRecorderTabs'
import './MultiTrackRecorderShell.css'

function toneForHealth(health: DawHealth): 'ok' | 'warn' | 'error' | 'info' {
  if (health === 'online') return 'ok'
  if (health === 'unavailable') return 'error'
  if (health === 'transitioning') return 'warn'
  return 'info'
}

export function MultiTrackRecorderShell() {
  const location = useLocation()
  const { localNode, viewedNodeId } = useNodePageContext(NODE_PAGE_KEYS.daw)
  const apiNodeId = viewedNodeId === localNode?.node_id ? null : viewedNodeId
  const scopeKey = apiNodeId ?? 'local'
  const { theme } = useTheme()
  const resolvedTheme = toCarbonBaseTheme(theme.carbonTheme)

  const {
    mode,
    available,
    health,
    activeProject,
    trackCount,
    clipCount,
    pluginCount,
    automationLaneCount,
  } = useDawOverview(scopeKey)

  const [healthDrawerOpen, setHealthDrawerOpen] = useState(false)

  const modeLabel = mode ? `${mode.mode}/${mode.state}` : 'unknown'
  const transportRunning = mode?.state === 'running'

  const actions = useMemo<ShellActionSlot[]>(() => [
    {
      id: 'mtr-system',
      label: `Engine ${health}`,
      status: toneForHealth(health),
      onClick: () => setHealthDrawerOpen(true),
      title: 'Open MultiTrack Recorder health drawer',
    },
    {
      id: 'mtr-mode',
      label: `Mode ${modeLabel}`,
      icon: ConnectionSignal,
      status: available ? 'ok' : 'error',
      disabled: true,
    },
    {
      id: 'mtr-transport',
      label: transportRunning ? 'Transport running' : 'Transport idle',
      icon: transportRunning ? PlayFilled : Time,
      status: transportRunning ? 'ok' : 'info',
      disabled: true,
    },
    {
      id: 'mtr-project',
      label: `Project ${activeProject ?? 'untitled'}`,
      icon: Folder,
      disabled: true,
    },
    {
      id: 'mtr-tracks',
      label: `Tracks ${trackCount}`,
      icon: Music,
      disabled: true,
    },
    {
      id: 'mtr-clips',
      label: `Clips ${clipCount}`,
      icon: RecordingFilled,
      disabled: true,
    },
    {
      id: 'mtr-plugins',
      label: `Plugins ${pluginCount}`,
      icon: ConnectionSignal,
      disabled: true,
    },
    {
      id: 'mtr-automation',
      label: `Auto ${automationLaneCount}`,
      icon: TrashCan,
      disabled: true,
    },
  ], [health, modeLabel, available, transportRunning, activeProject, trackCount, clipCount, pluginCount, automationLaneCount])

  useSetShellWindow({
    title: 'MultiTrack Recorder',
    subtitle: 'DAW workspace — transport, tracks, mixer, clips, plugins, automation, sessions, export.',
    kicker: 'Platform / DAW',
    actions,
  }, [actions])

  return (
    <MultiTrackNodeScopeProvider nodeId={apiNodeId} scopeKey={scopeKey}>
      <GlobalTheme theme={resolvedTheme}>
        <Theme as="div" theme={resolvedTheme} className="multitrack-recorder-shell">
          <WorkspacePageTemplate
            className="multitrack-recorder-shell__template"
            windowClassName="multitrack-recorder-shell__frame"
            contentClassName="multitrack-recorder-shell__content"
            sidebar={null}
            content={(
              <section
                className="multitrack-recorder-shell__content-body"
                aria-label="MultiTrack Recorder content"
                key={location.pathname}
                data-testid="multitrack-recorder-shell"
              >
                <MultiTrackRecorderTabs />
                {!available ? (
                  <div
                    className="multitrack-recorder-shell__flag-off"
                    role="status"
                    data-testid="multitrack-recorder-flag-off"
                  >
                    <strong>DAW mode disabled in this build.</strong>{' '}
                    This engine was compiled without <code>-DMAP2_DAW_MODE=ON</code>.
                    The interface remains visible; mutations return the
                    documented <code>503</code> error envelope.
                  </div>
                ) : null}
                <Outlet />
              </section>
            )}
          />
          <MultiTrackHealthDrawer
            open={healthDrawerOpen}
            onClose={() => setHealthDrawerOpen(false)}
            scopeKey={scopeKey}
          />
        </Theme>
      </GlobalTheme>
    </MultiTrackNodeScopeProvider>
  )
}

export default MultiTrackRecorderShell
