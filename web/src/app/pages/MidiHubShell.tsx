import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowsHorizontal,
  Bullhorn,
  ConnectionSignal,
  DataStructured,
  IbmWatsonMachineLearning,
  Music,
  WarningAltFilled,
} from '@carbon/icons-react'
import {
  GlobalTheme,
  Tag,
  Theme,
} from '@carbon/react'
import { useLocation, useNavigate, Outlet } from 'react-router-dom'
import type { ReactNode } from 'react'
import { MidiHubNodeScopeProvider } from '../components/MidiHub/MidiHubNodeScope'
import { UnifiedWorkspaceSideNav, type UnifiedWorkspaceSideNavItem } from '../components/navigation/UnifiedWorkspaceSideNav'
import { useMidiHubOverview } from '../components/MidiHub/useMidiHubOverview'
import { useNodePageContext } from '../hooks/useNodePageContext'
import { NODE_PAGE_KEYS } from '../utils/nodeDisplay'
import './MidiHubShell.css'

type MidiHubAccent = 'green' | 'blue' | 'warm-gray'

function MidiHubNavDot({ accent }: { accent: MidiHubAccent | 'active' }) {
  return (
    <span
      className={`midi-hub-shell__nav-dot midi-hub-shell__nav-dot--${accent}`}
      aria-hidden="true"
    />
  )
}

function buildMetaTag(label: string | undefined, accent: MidiHubAccent | undefined): ReactNode {
  if (!label) return null
  return <Tag type={accent ?? 'cool-gray'}>{label}</Tag>
}

export function MidiHubShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { localNode, viewedNodeId } = useNodePageContext(NODE_PAGE_KEYS.midiHub)
  const apiNodeId = viewedNodeId === localNode?.node_id ? null : viewedNodeId
  const scopeKey = apiNodeId ?? 'local'
  const [prefersDark, setPrefersDark] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const { routesCount, sessionsCount, activePresetName, clockQuery } = useMidiHubOverview(apiNodeId, scopeKey)
  const resolvedTheme = prefersDark ? 'g100' : 'white'

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const updatePreference = (event: MediaQueryListEvent) => setPrefersDark(event.matches)
    setPrefersDark(media.matches)
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', updatePreference)
      return () => media.removeEventListener('change', updatePreference)
    }
    media.addListener(updatePreference)
    return () => media.removeListener(updatePreference)
  }, [])

  const navItems = useMemo<UnifiedWorkspaceSideNavItem[]>(() => [
    {
      key: 'connections',
      label: 'Connections',
      to: '/midi-hub/connections',
      icon: ArrowsHorizontal,
      meta: buildMetaTag(routesCount > 0 ? String(routesCount) : undefined, routesCount > 0 ? 'green' : 'warm-gray'),
      labelDecor: <MidiHubNavDot accent={location.pathname === '/midi-hub/connections' ? 'active' : routesCount > 0 ? 'green' : 'warm-gray'} />,
      active: location.pathname === '/midi-hub/connections',
      onOpen: () => navigate('/midi-hub/connections'),
      description: 'Route and inspect controller links, patching, and live traffic from the unified MIDI workspace.',
    },
    {
      key: 'presets',
      label: 'Presets',
      to: '/midi-hub/presets',
      icon: Music,
      meta: buildMetaTag(activePresetName !== 'Manual' ? '1' : undefined, 'blue'),
      labelDecor: <MidiHubNavDot accent={location.pathname === '/midi-hub/presets' ? 'active' : 'blue'} />,
      active: location.pathname === '/midi-hub/presets',
      onOpen: () => navigate('/midi-hub/presets'),
      description: 'Recall presets, scenes, and show-time controller states without leaving the routed shell.',
    },
    {
      key: 'transport',
      label: 'Transport',
      to: '/midi-hub/transport',
      icon: Activity,
      meta: buildMetaTag(clockQuery.data?.running ? 'CLK' : undefined, clockQuery.data?.running ? 'green' : 'warm-gray'),
      labelDecor: <MidiHubNavDot accent={location.pathname === '/midi-hub/transport' ? 'active' : clockQuery.data?.running ? 'green' : 'warm-gray'} />,
      active: location.pathname === '/midi-hub/transport',
      onOpen: () => navigate('/midi-hub/transport'),
      description: 'Manage tempo, clock, transport generation, and route-linked time behavior.',
    },
    {
      key: 'events',
      label: 'Events',
      to: '/midi-hub/events',
      icon: Bullhorn,
      labelDecor: <MidiHubNavDot accent={location.pathname === '/midi-hub/events' ? 'active' : 'warm-gray'} />,
      active: location.pathname === '/midi-hub/events',
      onOpen: () => navigate('/midi-hub/events'),
      description: 'Author and monitor event-list logic, cues, and show-control actions.',
    },
    {
      key: 'processing',
      label: 'Processing',
      to: '/midi-hub/processing',
      icon: DataStructured,
      labelDecor: <MidiHubNavDot accent={location.pathname === '/midi-hub/processing' ? 'active' : 'warm-gray'} />,
      active: location.pathname === '/midi-hub/processing',
      onOpen: () => navigate('/midi-hub/processing'),
      description: 'Inspect mapping, transforms, filtering, and advanced controller-processing flows.',
    },
    {
      key: 'network',
      label: 'Network',
      to: '/midi-hub/network',
      icon: ConnectionSignal,
      meta: buildMetaTag(sessionsCount > 0 ? String(sessionsCount) : undefined, sessionsCount > 0 ? 'blue' : 'warm-gray'),
      labelDecor: <MidiHubNavDot accent={location.pathname === '/midi-hub/network' ? 'active' : sessionsCount > 0 ? 'blue' : 'warm-gray'} />,
      active: location.pathname === '/midi-hub/network',
      onOpen: () => navigate('/midi-hub/network'),
      description: 'Track network sessions, distributed transport, and MIDI-over-network topology.',
    },
    {
      key: 'lab',
      label: 'Lab',
      to: '/midi-hub/lab',
      icon: IbmWatsonMachineLearning,
      labelDecor: <MidiHubNavDot accent={location.pathname === '/midi-hub/lab' ? 'active' : 'warm-gray'} />,
      active: location.pathname === '/midi-hub/lab',
      onOpen: () => navigate('/midi-hub/lab'),
      description: 'Access experimental and parity-in-progress MIDI workflows without leaving the shell.',
    },
  ], [activePresetName, clockQuery.data?.running, location.pathname, navigate, routesCount, sessionsCount])

  return (
    <MidiHubNodeScopeProvider nodeId={apiNodeId} scopeKey={scopeKey}>
      <GlobalTheme theme={resolvedTheme}>
        <Theme as="div" theme={resolvedTheme} className="midi-hub-shell">
          <div className="midi-hub-shell__frame">
            <aside className="midi-hub-shell__sidebar">
              <UnifiedWorkspaceSideNav
                ariaLabel="MIDI Hub navigation"
                className="midi-hub-shell__sidenav"
                eyebrow="Navigation"
                title="MIDI Hub"
                description="Move through routed show-control areas from one shared rail while keeping preset, transport, and network context visible."
                items={navItems}
                footer={(
                  <>
                    <div className="midi-hub-shell__status-cards">
                      <div className="midi-hub-shell__status-card">
                        <span>Active preset</span>
                        <strong>{activePresetName}</strong>
                      </div>
                      <div className="midi-hub-shell__status-card">
                        <span>Clock state</span>
                        <strong>{clockQuery.data?.running ? 'Running' : 'Stopped'}</strong>
                      </div>
                      <div className="midi-hub-shell__status-card">
                        <span>Session routes</span>
                        <strong>{routesCount}</strong>
                      </div>
                    </div>

                    <div className="midi-hub-shell__warning">
                      <WarningAltFilled size={16} />
                      <span>Network protocol and event-list tooling are present in the shell, but deeper parity work is still in progress.</span>
                    </div>
                  </>
                )}
              />
            </aside>

            <main className="midi-hub-shell__content" key={location.pathname}>
              <Outlet />
            </main>
          </div>
        </Theme>
      </GlobalTheme>
    </MidiHubNodeScopeProvider>
  )
}

export default MidiHubShell
