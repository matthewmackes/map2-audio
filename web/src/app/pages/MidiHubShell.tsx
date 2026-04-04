import { useMemo } from 'react'
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
import { WorkspacePageTemplate } from '../components/layout/WorkspacePageTemplate'
import { MidiHubNodeScopeProvider } from '../components/MidiHub/MidiHubNodeScope'
import { UnifiedWorkspaceSideNav, type UnifiedWorkspaceSideNavItem } from '../components/navigation/UnifiedWorkspaceSideNav'
import { useMidiHubOverview } from '../components/MidiHub/useMidiHubOverview'
import { MidiHubStatusBar } from '../components/MidiHub/MidiHubStatusBar'
import { useNodePageContext } from '../hooks/useNodePageContext'
import { useTheme } from '../theme'
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
  const { theme } = useTheme()
  const { routesCount, sessionsCount, activePresetName, clockQuery } = useMidiHubOverview(apiNodeId, scopeKey)
  const resolvedTheme = theme.carbonTheme ?? 'g100'

  const { primaryNavItems, utilityNavItems } = useMemo(() => {
    const items: UnifiedWorkspaceSideNavItem[] = [
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
    ]

    const utilities: UnifiedWorkspaceSideNavItem[] = [
      {
        key: 'lab',
        label: 'Lab',
        to: '/midi-hub/lab',
        icon: IbmWatsonMachineLearning,
        labelDecor: <MidiHubNavDot accent={location.pathname === '/midi-hub/lab' ? 'active' : 'warm-gray'} />,
        active: location.pathname === '/midi-hub/lab',
        onOpen: () => navigate('/midi-hub/lab'),
        description: 'Access experimental and parity-in-progress MIDI workflows without leaving the shell.',
        variant: 'utility',
      },
    ]

    return { primaryNavItems: items, utilityNavItems: utilities }
  }, [activePresetName, clockQuery.data?.running, location.pathname, navigate, routesCount, sessionsCount])

  return (
    <MidiHubNodeScopeProvider nodeId={apiNodeId} scopeKey={scopeKey}>
      <GlobalTheme theme={resolvedTheme}>
        <Theme as="div" theme={resolvedTheme} className="midi-hub-shell">
          <WorkspacePageTemplate
            className="midi-hub-shell__template"
            windowClassName="midi-hub-shell__frame"
            sidebarClassName="midi-hub-shell__sidebar"
            contentClassName="midi-hub-shell__content"
            stickySidebar
            sidebar={(
              <UnifiedWorkspaceSideNav
                ariaLabel="MIDI Hub navigation"
                className="midi-hub-shell__sidenav"
                eyebrow="Navigation"
                title="MIDI Hub"
                description="Move across routing, transport, event, and network workspaces from one shell."
                items={primaryNavItems}
                footerTitle="Utilities"
                footerItems={utilityNavItems}
                footer={(
                  <div className="midi-hub-shell__warning">
                    <WarningAltFilled size={14} />
                    <span>Some protocol and event-list areas are still in progress.</span>
                  </div>
                )}
              />
            )}
            content={(
              <main className="midi-hub-shell__content-body" key={location.pathname}>
                <MidiHubStatusBar apiNodeId={apiNodeId} scopeKey={scopeKey} />
                <Outlet />
              </main>
            )}
          />
        </Theme>
      </GlobalTheme>
    </MidiHubNodeScopeProvider>
  )
}

export default MidiHubShell
