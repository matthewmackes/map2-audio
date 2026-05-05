import { useMemo, useState } from 'react'
import {
  GlobalTheme,
  Theme,
} from '@carbon/react'
import { useLocation, Outlet } from 'react-router-dom'
import { ConnectionSignal, Events, Music, NetworkEnterprise, Time, Tools } from '@carbon/icons-react'
import { WorkspacePageTemplate } from '../components/layout/WorkspacePageTemplate'
import { MidiHubNodeScopeProvider } from '../components/MidiHub/MidiHubNodeScope'
import { useMidiHubOverview } from '../components/MidiHub/useMidiHubOverview'
import { useNodePageContext } from '../hooks/useNodePageContext'
import { useSetShellWindow } from '../layout/useSetShellWindow'
import type { ShellActionSlot } from '../layout/ShellWindowContext'
import { toCarbonBaseTheme, useTheme } from '../theme'
import { NODE_PAGE_KEYS } from '../utils/nodeDisplay'
import { MidiHubHealthDrawer } from './midi-hub/MidiHubHealthDrawer'
import { MidiLegacyRetirementBanner } from './midi-services/MidiLegacyRetirementBanner'
import './MidiHubShell.css'

function toneForHealth(health: string): 'ok' | 'warn' | 'error' | 'info' {
  if (health === 'online') return 'ok'
  if (health === 'degraded') return 'error'
  return 'info'
}

export function MidiHubShell() {
  const location = useLocation()
  const { localNode, viewedNodeId } = useNodePageContext(NODE_PAGE_KEYS.midiHub)
  const apiNodeId = viewedNodeId === localNode?.node_id ? null : viewedNodeId
  const scopeKey = apiNodeId ?? 'local'
  const { theme } = useTheme()
  const {
    clockQuery,
    activePresetName,
    routesCount,
    connectedDeviceCount,
    sessionsCount,
    health,
  } = useMidiHubOverview(apiNodeId, scopeKey)
  const resolvedTheme = toCarbonBaseTheme(theme.carbonTheme)

  const [healthDrawerOpen, setHealthDrawerOpen] = useState(false)

  const bpm = Number.isFinite(clockQuery.data?.bpm) ? Math.round(clockQuery.data?.bpm ?? 0) : 0
  const running = Boolean(clockQuery.data?.running)
  const eventListLabel = running ? `Timeline @ ${clockQuery.data?.song_position ?? 0}` : 'Timeline idle'

  const actions = useMemo<ShellActionSlot[]>(() => [
    {
      id: 'midi-hub-system',
      label: `System ${health}`,
      status: toneForHealth(health),
      onClick: () => setHealthDrawerOpen(true),
      title: 'Open MIDI Hub health drawer',
    },
    {
      id: 'midi-hub-clock',
      label: running ? `Clock ${bpm} BPM` : `Clock ${bpm} stopped`,
      icon: Time,
      status: running ? 'ok' : 'info',
      disabled: true,
    },
    {
      id: 'midi-hub-preset',
      label: `Preset ${activePresetName}`,
      icon: Music,
      disabled: true,
    },
    {
      id: 'midi-hub-timeline',
      label: eventListLabel,
      icon: Events,
      disabled: true,
    },
    {
      id: 'midi-hub-routes',
      label: `Routes ${routesCount}`,
      icon: ConnectionSignal,
      disabled: true,
    },
    {
      id: 'midi-hub-devices',
      label: `Devices ${connectedDeviceCount}`,
      icon: Tools,
      disabled: true,
    },
    {
      id: 'midi-hub-sessions',
      label: `Sessions ${sessionsCount}`,
      icon: NetworkEnterprise,
      disabled: true,
    },
  ], [health, running, bpm, activePresetName, eventListLabel, routesCount, connectedDeviceCount, sessionsCount])

  useSetShellWindow({
    // T2491 (2026-05-02 cleanup) — operator-visible "MIDI Hub" labels
    // aligned to the T2482 iter-94 rename. The component file name
    // (MidiHubShell.tsx) stays for git history / re-export continuity;
    // MidiServicesShell.tsx re-exports it as the canonical name.
    title: 'MIDI Services',
    subtitle: 'Routing, devices, bindings, presets, transport, events, processing, network, and lab workflows.',
    kicker: 'Platform / MIDI Services',
    actions,
  }, [actions])

  return (
    <MidiHubNodeScopeProvider nodeId={apiNodeId} scopeKey={scopeKey}>
      <GlobalTheme theme={resolvedTheme}>
        <Theme as="div" theme={resolvedTheme} className="midi-hub-shell">
          <WorkspacePageTemplate
            className="midi-hub-shell__template"
            windowClassName="midi-hub-shell__frame"
            contentClassName="midi-hub-shell__content"
            sidebar={null}
            content={(
              <section className="midi-hub-shell__content-body" aria-label="MIDI Hub content" key={location.pathname}>
                <MidiLegacyRetirementBanner />
                <Outlet />
              </section>
            )}
          />
          <MidiHubHealthDrawer
            open={healthDrawerOpen}
            onClose={() => setHealthDrawerOpen(false)}
            apiNodeId={apiNodeId}
            scopeKey={scopeKey}
          />
        </Theme>
      </GlobalTheme>
    </MidiHubNodeScopeProvider>
  )
}

export default MidiHubShell
