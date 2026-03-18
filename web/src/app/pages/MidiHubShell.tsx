import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowsHorizontal,
  Bullhorn,
  ConnectionSignal,
  DataStructured,
  IbmWatsonMachineLearning,
  Moon,
  Music,
  Sun,
  WarningAltFilled,
} from '@carbon/icons-react'
import {
  Button,
  GlobalTheme,
  HeaderSideNavItems,
  SideNav,
  SideNavItems,
  SideNavLink,
  Tag,
  Theme,
} from '@carbon/react'
import { useLocation, useNavigate, Outlet } from 'react-router-dom'
import type { ComponentType } from 'react'
import useMediaQuery from '@mui/material/useMediaQuery'
import { MidiHubNodeScopeProvider } from '../components/MidiHub/MidiHubNodeScope'
import { MidiHubStatusBar } from '../components/MidiHub/MidiHubStatusBar'
import { useMidiHubOverview } from '../components/MidiHub/useMidiHubOverview'
import { MAP2_PRIMARY_LABEL, Map2BrandMark } from '../components/branding/map2Branding'
import { useNodePageContext } from '../hooks/useNodePageContext'
import { NODE_PAGE_KEYS } from '../utils/nodeDisplay'
import './MidiHubShell.css'

type MidiHubThemePreference = 'system' | 'light' | 'dark'

type MidiHubNavItem = {
  key: string
  label: string
  to: string
  icon: ComponentType
  badge?: string
  accent?: 'green' | 'blue' | 'warm-gray'
}

const THEME_PREFERENCE_KEY = 'map2_theme_preference'
const THEME_LABELS: Record<MidiHubThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
}

function readThemePreference(): MidiHubThemePreference {
  if (typeof window === 'undefined') {
    return 'system'
  }
  const stored = window.localStorage.getItem(THEME_PREFERENCE_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

export function MidiHubShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { localNode, topology, viewedNodeId } = useNodePageContext(NODE_PAGE_KEYS.midiHub)
  const apiNodeId = viewedNodeId === localNode?.node_id ? null : viewedNodeId
  const scopeKey = apiNodeId ?? 'local'
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)')
  const [themePreference, setThemePreference] = useState<MidiHubThemePreference>(readThemePreference)
  const { routesCount, sessionsCount, activePresetName, clockQuery } = useMidiHubOverview(apiNodeId, scopeKey)
  useEffect(() => {
    window.localStorage.setItem(THEME_PREFERENCE_KEY, themePreference)
  }, [themePreference])

  const resolvedTheme = themePreference === 'system'
    ? (prefersDark ? 'g100' : 'white')
    : themePreference === 'dark'
      ? 'g100'
      : 'white'

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
                <div className="midi-hub-shell__brand">
                  <button
                    type="button"
                    className="midi-hub-shell__brand-link"
                    onClick={() => navigate('/midi-hub/connections')}
                    aria-label="Open MIDI Hub connections"
                  >
                    <span className="midi-hub-shell__brand-mark-wrap" aria-hidden="true">
                      <Map2BrandMark className="midi-hub-shell__brand-mark" />
                    </span>
                    <span className="midi-hub-shell__brand-copy">
                      <span className="midi-hub-shell__brand-kicker">{MAP2_PRIMARY_LABEL} studio control</span>
                      <span className="midi-hub-shell__brand-title">MIDI Hub</span>
                      <span className="midi-hub-shell__brand-body">
                        Routing, recall, transport, and protocol services tuned for studio operation.
                      </span>
                    </span>
                  </button>
                </div>

                <HeaderSideNavItems className="midi-hub-shell__section-label" aria-label="MIDI Hub sections">
                  Areas
                </HeaderSideNavItems>

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
                  <div className="midi-hub-shell__theme-row">
                    <span>Theme</span>
                    <div className="midi-hub-shell__theme-controls">
                      <Button
                        kind={themePreference === 'system' ? 'primary' : 'ghost'}
                        size="sm"
                        onClick={() => setThemePreference('system')}
                      >
                        {THEME_LABELS.system}
                      </Button>
                      <Button
                        kind={themePreference === 'light' ? 'primary' : 'ghost'}
                        size="sm"
                        renderIcon={Sun}
                        iconDescription="Use light theme"
                        onClick={() => setThemePreference('light')}
                      >
                        {THEME_LABELS.light}
                      </Button>
                      <Button
                        kind={themePreference === 'dark' ? 'primary' : 'ghost'}
                        size="sm"
                        renderIcon={Moon}
                        iconDescription="Use dark theme"
                        onClick={() => setThemePreference('dark')}
                      >
                        {THEME_LABELS.dark}
                      </Button>
                    </div>
                  </div>

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

          <MidiHubStatusBar apiNodeId={apiNodeId} scopeKey={scopeKey} />
        </Theme>
      </GlobalTheme>
    </MidiHubNodeScopeProvider>
  )
}

export default MidiHubShell
