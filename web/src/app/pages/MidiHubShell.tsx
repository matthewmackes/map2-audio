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
  SideNav,
  SideNavItems,
  SideNavLink,
  Tag,
  Theme,
} from '@carbon/react'
import { useLocation, useNavigate, Outlet } from 'react-router-dom'
import type { ComponentType } from 'react'
import { MidiHubNodeScopeProvider } from '../components/MidiHub/MidiHubNodeScope'
import { useMidiHubOverview } from '../components/MidiHub/useMidiHubOverview'
import { useNodePageContext } from '../hooks/useNodePageContext'
import { NODE_PAGE_KEYS } from '../utils/nodeDisplay'
import './MidiHubShell.css'

type MidiHubNavItem = {
  key: string
  label: string
  to: string
  icon: ComponentType
  badge?: string
  accent?: 'green' | 'blue' | 'warm-gray'
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

  const navItems = useMemo<MidiHubNavItem[]>(() => [
    {
      key: 'connections',
      label: 'Connections',
      to: '/midi-hub/connections',
      icon: ArrowsHorizontal,
      badge: routesCount > 0 ? String(routesCount) : undefined,
      accent: routesCount > 0 ? 'green' : 'warm-gray',
    },
    {
      key: 'presets',
      label: 'Presets',
      to: '/midi-hub/presets',
      icon: Music,
      badge: activePresetName !== 'Manual' ? '1' : undefined,
      accent: 'blue',
    },
    {
      key: 'transport',
      label: 'Transport',
      to: '/midi-hub/transport',
      icon: Activity,
      badge: clockQuery.data?.running ? 'CLK' : undefined,
      accent: clockQuery.data?.running ? 'green' : 'warm-gray',
    },
    {
      key: 'events',
      label: 'Events',
      to: '/midi-hub/events',
      icon: Bullhorn,
      accent: 'warm-gray',
    },
    {
      key: 'processing',
      label: 'Processing',
      to: '/midi-hub/processing',
      icon: DataStructured,
      accent: 'warm-gray',
    },
    {
      key: 'network',
      label: 'Network',
      to: '/midi-hub/network',
      icon: ConnectionSignal,
      badge: sessionsCount > 0 ? String(sessionsCount) : undefined,
      accent: sessionsCount > 0 ? 'blue' : 'warm-gray',
    },
    {
      key: 'lab',
      label: 'Lab',
      to: '/midi-hub/lab',
      icon: IbmWatsonMachineLearning,
      accent: 'warm-gray',
    },
  ], [activePresetName, clockQuery.data?.running, routesCount, sessionsCount])

  return (
    <MidiHubNodeScopeProvider nodeId={apiNodeId} scopeKey={scopeKey}>
      <GlobalTheme theme={resolvedTheme}>
        <Theme as="div" theme={resolvedTheme} className="midi-hub-shell">
          <div className="midi-hub-shell__frame">
            <aside className="midi-hub-shell__sidebar">
              <SideNav aria-label="MIDI Hub navigation" expanded isFixedNav={false} className="midi-hub-shell__sidenav">
                <SideNavItems>
                  {navItems.map((item) => {
                    const isActive = location.pathname === item.to
                    return (
                      <SideNavLink
                        key={item.key}
                        isActive={isActive}
                        renderIcon={item.icon}
                        href={item.to}
                        onClick={(event) => {
                          event.preventDefault()
                          navigate(item.to)
                        }}
                        className="midi-hub-shell__nav-link"
                      >
                        <span className="midi-hub-shell__nav-copy">
                          <span className="midi-hub-shell__nav-label">
                            <span
                              className={`midi-hub-shell__nav-dot midi-hub-shell__nav-dot--${isActive ? 'active' : item.accent ?? 'warm-gray'}`}
                              aria-hidden="true"
                            />
                            {item.label}
                          </span>
                          {item.badge ? (
                            <Tag type={item.accent ?? 'cool-gray'}>{item.badge}</Tag>
                          ) : null}
                        </span>
                      </SideNavLink>
                    )
                  })}
                </SideNavItems>

                <div className="midi-hub-shell__sidebar-footer">
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
                </div>
              </SideNav>
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
