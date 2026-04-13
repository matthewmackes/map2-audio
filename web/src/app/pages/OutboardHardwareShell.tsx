import './OutboardHardwareShell.css'

import type { ComponentType, ReactNode } from 'react'
import { useMemo } from 'react'
import { Usb, Waveform } from '@carbon/icons-react'
import { GlobalTheme, Tag, Theme } from '@carbon/react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import {
  MapMatrixProcessorIcon,
  MapRackDeviceIcon,
} from '../components/icons/map'
import { WorkspacePageTemplate } from '../components/layout/WorkspacePageTemplate'
import {
  UnifiedWorkspaceSideNav,
  type UnifiedWorkspaceSideNavItem,
  type UnifiedWorkspaceSideNavMetaBlock,
} from '../components/navigation/UnifiedWorkspaceSideNav'
import { ShellWindowTitleStrip } from '../components/shared/ShellWindowTitleStrip'
import { ShellWindowProvider } from '../layout/ShellWindowContext'
import { useTheme } from '../theme'

type NavAccent = 'green' | 'blue' | 'warm-gray' | 'red'
type OutboardHardwareCategory = 'AVB DSP Mixer' | 'USB Audio Interface' | 'Multi-FX Processor'

export interface OutboardHardwareSpecItem {
  label: string
  value: string
}

export interface OutboardHardwareDevice {
  deviceId: string
  displayName: string
  shortLabel: string
  category: OutboardHardwareCategory
  dedicatedRoute: string
  icon: ComponentType<any>
  description: string
  operatorFocus: string
  connectionModel: string
  capabilitySummary: string
  protocols: string[]
  capabilities: string[]
  specs: OutboardHardwareSpecItem[]
}

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

export const OUTBOARD_HARDWARE_DEVICES: OutboardHardwareDevice[] = [
  {
    deviceId: 'biamp-tesira',
    displayName: 'Tesira AVB',
    shortLabel: 'Tesira',
    category: 'AVB DSP Mixer',
    dedicatedRoute: '/tesira',
    icon: MapMatrixProcessorIcon as ComponentType<any>,
    description: 'Biamp Tesira fleet operations, DSP work, AVB context, presets, and multi-device diagnostics remain available through the dedicated route.',
    operatorFocus: 'Fleet supervision, AVB DSP tuning, and deployment posture.',
    connectionModel: 'Networked AVB/TTP control surface with MAP2-side fleet orchestration.',
    capabilitySummary: 'Fleet views, DSP panels, AVB posture, preset control, and deployment tooling.',
    protocols: ['TTP / SSH control', 'AVB transport', 'Preset orchestration'],
    capabilities: ['Fleet health', 'DSP block editing', 'AVB topology visibility', 'Preset workflows'],
    specs: [
      { label: 'Vendor', value: 'Biamp' },
      { label: 'Hardware family', value: 'Tesira Forte AVB' },
      { label: 'Launch path', value: '/tesira' },
      { label: 'Primary role', value: 'Rack DSP and AVB infrastructure control' },
    ],
  },
  {
    deviceId: 'edirol-ua1000',
    displayName: 'Edirol UA-1000',
    shortLabel: 'UA-1000',
    category: 'USB Audio Interface',
    dedicatedRoute: '/edirol-ua1000',
    icon: Usb,
    description: 'Interface-specific status, latency visibility, and audio controls for the UA-1000 stay in the existing dedicated hardware page.',
    operatorFocus: 'Front-of-rig audio interface status and device-specific control.',
    connectionModel: 'Direct USB audio interface integration surfaced through the MAP2 hardware route.',
    capabilitySummary: 'Connection state, audio health, latency detail, and interface controls.',
    protocols: ['USB audio', 'ALSA / PipeWire status', 'Interface-specific monitoring'],
    capabilities: ['Runtime status', 'Latency posture', 'Interface controls', 'Host visibility'],
    specs: [
      { label: 'Vendor', value: 'Edirol / Roland' },
      { label: 'Hardware family', value: 'UA-1000 USB audio interface' },
      { label: 'Launch path', value: '/edirol-ua1000' },
      { label: 'Primary role', value: 'Dedicated MAP2 audio-interface control page' },
    ],
  },
  {
    deviceId: 'hotone-jogg',
    displayName: 'HoTone JoGG',
    shortLabel: 'JoGG',
    category: 'USB Audio Interface',
    dedicatedRoute: '/hotone-jogg',
    icon: Waveform,
    description: 'The JoGG route remains the dedicated place for host detection, profile-specific controls, and interface-state visibility.',
    operatorFocus: 'Portable interface status and profile-driven control visibility.',
    connectionModel: 'USB interface route with MAP2 profile awareness and host detection.',
    capabilitySummary: 'Connection-state visibility, profile-aware status, and interface controls.',
    protocols: ['USB audio', 'Host profile detection', 'Interface-state inspection'],
    capabilities: ['Runtime detection', 'Profile-specific controls', 'Host status', 'Device-specific workflow'],
    specs: [
      { label: 'Vendor', value: 'HoTone' },
      { label: 'Hardware family', value: 'JoGG USB interface' },
      { label: 'Launch path', value: '/hotone-jogg' },
      { label: 'Primary role', value: 'Portable audio-interface operations' },
    ],
  },
  {
    deviceId: 'lexicon-mpx1',
    displayName: 'MPX1 Rack',
    shortLabel: 'MPX1',
    category: 'Multi-FX Processor',
    dedicatedRoute: '/mpx1',
    icon: MapRackDeviceIcon,
    description: 'Live program control, editor access, diagnostics, library work, and MIDI mapping remain in the dedicated MPX1 rack route.',
    operatorFocus: 'Rack-effect editing, program management, and runtime diagnostics.',
    connectionModel: 'MIDI SysEx-driven rack processor with deep routed editor and diagnostics views.',
    capabilitySummary: 'Panel, editor, library, MIDI mapping, diagnostics, and performance views.',
    protocols: ['MIDI SysEx', 'Program recall', 'Runtime diagnostics'],
    capabilities: ['Editor workflows', 'Library tasks', 'MIDI mapping', 'Perform-mode views'],
    specs: [
      { label: 'Vendor', value: 'Lexicon' },
      { label: 'Hardware family', value: 'MPX-1 multi-effects processor' },
      { label: 'Launch path', value: '/mpx1' },
      { label: 'Primary role', value: 'Deep rack-effects editing and live control' },
    ],
  },
  {
    deviceId: 'eventide-intelfx',
    displayName: 'IntelFX Rack',
    shortLabel: 'IntelFX',
    category: 'Multi-FX Processor',
    dedicatedRoute: '/intelfx',
    icon: MapRackDeviceIcon,
    description: 'Signal-flow editing, preset library, MIDI mapping, scenes, and realtime parameter work remain on the dedicated IntelFX route.',
    operatorFocus: 'Realtime rack-effects control, preset workflows, and signal-flow editing.',
    connectionModel: 'Rack processor route with flow/editor/library surfaces and realtime parameter control.',
    capabilitySummary: 'Flow views, editor panels, library access, MIDI mapping, and monitoring.',
    protocols: ['MIDI SysEx', 'Preset workflows', 'Realtime parameter control'],
    capabilities: ['Signal-flow editing', 'Preset library', 'MIDI mapping', 'Monitor views'],
    specs: [
      { label: 'Vendor', value: 'Rocktron' },
      { label: 'Hardware family', value: 'Intellifex rack processor' },
      { label: 'Launch path', value: '/intelfx' },
      { label: 'Primary role', value: 'Rack-effects editing and monitoring' },
    ],
  },
]

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

export function resolveOutboardHardwareStandaloneRoute(deviceId: string): string | null {
  return OUTBOARD_HARDWARE_DEVICES.find((device) => device.deviceId === deviceId)?.dedicatedRoute ?? null
}

export interface OutboardHardwareShellContextValue {
  devices: OutboardHardwareDevice[]
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
