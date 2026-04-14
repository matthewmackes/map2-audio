import './OutboardHardwareShell.css'

import type { ComponentType, ReactNode } from 'react'
import { useMemo } from 'react'
import { Usb, Waveform } from '@carbon/icons-react'
import { GlobalTheme, Tag, Theme } from '@carbon/react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import { MapRackDeviceIcon } from '../components/icons/map'
import { WorkspacePageTemplate } from '../components/layout/WorkspacePageTemplate'
import {
  UnifiedWorkspaceSideNav,
  type UnifiedWorkspaceSideNavItem,
  type UnifiedWorkspaceSideNavMetaBlock,
} from '../components/navigation/UnifiedWorkspaceSideNav'
import { ShellWindowTitleStrip } from '../components/shared/ShellWindowTitleStrip'
import { ShellWindowProvider } from '../layout/ShellWindowContext'
import { useTheme } from '../theme'
import {
  OUTBOARD_HARDWARE_DEVICES,
  type OutboardHardwareDevice,
  type OutboardHardwareShellContextValue,
} from './outboardHardwareShared'

type NavAccent = 'green' | 'blue' | 'warm-gray' | 'red'
function categoryAccent(category: OutboardHardwareCategory): NavAccent {
  if (category === 'AVB DSP Mixer') return 'red'
  if (category === 'USB Audio Interface') return 'blue'
  return 'green'
}

function categoryTagType(category: OutboardHardwareCategory): 'red' | 'blue' | 'green' {
  if (category === 'AVB DSP Mixer') return 'red'
  if (category === 'USB Audio Interface') return 'blue'
  return 'green'
}

function matchesRoutePath(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`)
}

function OutboardHardwareNavDot({ accent }: { accent: NavAccent | 'active' }) {
  return (
    <span
      className={`outboard-hardware-shell__nav-dot outboard-hardware-shell__nav-dot--${accent}`}
      aria-hidden="true"
    />
  )
}

function buildMetaTag(label: string | undefined, accent: NavAccent | undefined): ReactNode {
  if (!label) return null
  const type = accent === 'green' ? 'green' : accent === 'blue' ? 'blue' : accent === 'red' ? 'red' : 'cool-gray'
  return <Tag type={type}>{label}</Tag>
}

export function OutboardHardwareShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const resolvedTheme = theme.carbonTheme ?? 'g100'

  const shellContext = useMemo<OutboardHardwareShellContextValue>(
    () => ({ devices: OUTBOARD_HARDWARE_DEVICES }),
    [],
  )

  const navItems = useMemo<UnifiedWorkspaceSideNavItem[]>(() => {
    const items: UnifiedWorkspaceSideNavItem[] = [
      {
        key: 'overview',
        label: 'Overview',
        to: '/outboard-hardware',
        icon: MapRackDeviceIcon,
        active: location.pathname === '/outboard-hardware',
        onOpen: () => navigate('/outboard-hardware'),
        description: 'See every supported outboard unit, grouped by hardware class, without losing the dedicated routes.',
        labelDecor: <OutboardHardwareNavDot accent={location.pathname === '/outboard-hardware' ? 'active' : 'warm-gray'} />,
        meta: buildMetaTag(String(OUTBOARD_HARDWARE_DEVICES.length), 'warm-gray'),
      },
    ]

    for (const device of OUTBOARD_HARDWARE_DEVICES) {
      const to = `/outboard-hardware/${device.deviceId}`
      const active = location.pathname === to
      const accent = active ? 'active' : categoryAccent(device.category)
      items.push({
        key: device.deviceId,
        label: device.displayName,
        to,
        icon: device.icon,
        active,
        onOpen: () => navigate(to),
        description: `Open ${device.displayName} inside the shared outboard-hardware shell.`,
        labelDecor: <OutboardHardwareNavDot accent={accent} />,
        meta: buildMetaTag(device.category, categoryAccent(device.category)),
      })
    }

    return items
  }, [location.pathname, navigate])

  const footerRouteItems = useMemo<UnifiedWorkspaceSideNavItem[]>(() => (
    OUTBOARD_HARDWARE_DEVICES.map((device) => ({
      key: `standalone:${device.deviceId}`,
      label: device.displayName,
      to: device.dedicatedRoute,
      icon: device.icon,
      active: matchesRoutePath(location.pathname, device.dedicatedRoute),
      onOpen: () => navigate(device.dedicatedRoute),
      description: `Open the unchanged dedicated ${device.displayName} route outside the shared shell.`,
      labelDecor: (
        <OutboardHardwareNavDot
          accent={matchesRoutePath(location.pathname, device.dedicatedRoute) ? 'active' : categoryAccent(device.category)}
        />
      ),
      meta: buildMetaTag(device.shortLabel, categoryAccent(device.category)),
      variant: 'utility',
    }))
  ), [location.pathname, navigate])

  const metaBlocks = useMemo<UnifiedWorkspaceSideNavMetaBlock[]>(() => {
    const avbMixers = OUTBOARD_HARDWARE_DEVICES.filter((device) => device.category === 'AVB DSP Mixer').length
    const interfaces = OUTBOARD_HARDWARE_DEVICES.filter((device) => device.category === 'USB Audio Interface').length
    const processors = OUTBOARD_HARDWARE_DEVICES.filter((device) => device.category === 'Multi-FX Processor').length

    return [
      { key: 'devices', label: 'Devices', value: OUTBOARD_HARDWARE_DEVICES.length },
      { key: 'interfaces', label: 'Interfaces', value: interfaces },
      { key: 'processors', label: 'Rack FX', value: processors },
      { key: 'mixers', label: 'AVB DSP', value: avbMixers },
    ]
  }, [])

  return (
    <GlobalTheme theme={resolvedTheme}>
      <Theme as="div" theme={resolvedTheme} className="outboard-hardware-shell">
        <ShellWindowTitleStrip />
        <ShellWindowProvider value={null}>
          <WorkspacePageTemplate
            className="outboard-hardware-shell__template"
            windowClassName="outboard-hardware-shell__frame"
            sidebarClassName="outboard-hardware-shell__sidebar"
            contentClassName="outboard-hardware-shell__content"
            stickySidebar
            sidebar={(
              <UnifiedWorkspaceSideNav
                ariaLabel="Outboard hardware navigation"
                className="outboard-hardware-shell__sidenav"
                eyebrow="Unified rack shell"
                title="Outboard Hardware"
                description="One routed workspace for MAP2 rack processors, AVB DSP hardware, and dedicated interface pages while preserving each specialized route."
                items={navItems}
                footerTitle="Dedicated Routes"
                footerItems={footerRouteItems}
                metaBlocks={metaBlocks}
                callout={{
                  kind: 'info',
                  text: 'This shell groups navigation and identity. Live status and deep control still come from each device family’s dedicated route.',
                }}
              />
            )}
            content={(
              <main className="outboard-hardware-shell__content-body" key={location.pathname}>
                <Outlet context={shellContext} />
              </main>
            )}
          />
        </ShellWindowProvider>
      </Theme>
    </GlobalTheme>
  )
}

export default OutboardHardwareShell
