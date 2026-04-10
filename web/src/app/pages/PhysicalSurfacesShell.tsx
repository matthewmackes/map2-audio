import './PhysicalSurfacesShell.css'

import type { ReactNode } from 'react'
import { useMemo } from 'react'
import {
  ConnectionSignal,
  DataStructured,
  IbmWatsonMachineLearning,
  Music,
  WarningAltFilled,
} from '@carbon/icons-react'
import { GlobalTheme, InlineNotification, Tag, Theme } from '@carbon/react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { enrichedPhysicalSurfacesApi } from '../../map2/clients/enrichedPhysicalSurfaces'
import type {
  EnrichedPhysicalSurfaceUnit,
  EnrichedPhysicalSurfacesSummary,
} from '../../map2/types'
import { WorkspacePageTemplate } from '../components/layout/WorkspacePageTemplate'
import {
  UnifiedWorkspaceSideNav,
  type UnifiedWorkspaceSideNavItem,
} from '../components/navigation/UnifiedWorkspaceSideNav'
import { useTheme } from '../theme'

type NavAccent = 'green' | 'blue' | 'warm-gray' | 'red'

const STANDALONE_SURFACE_ROUTE_BY_UNIT_ID: Record<string, string> = {
  'maschine-mk1': '/maschine',
  'ableton-push': '/labs/push-surface',
  'mackie-mcu-pro': '/mcu',
  'novation-launch-control': '/launch-control',
  'meloaudio-midi-commander': '/midi-commander',
}

function PhysicalSurfaceNavDot({ accent }: { accent: NavAccent | 'active' }) {
  return (
    <span
      className={`physical-surfaces-shell__nav-dot physical-surfaces-shell__nav-dot--${accent}`}
      aria-hidden="true"
    />
  )
}

function buildMetaTag(label: string | undefined, accent: NavAccent | undefined): ReactNode {
  if (!label) return null
  const type = accent === 'green' ? 'green' : accent === 'blue' ? 'blue' : accent === 'red' ? 'red' : 'cool-gray'
  return <Tag type={type}>{label}</Tag>
}

function statusAccent(status: string | undefined): NavAccent {
  if (status === 'online') return 'green'
  if (status === 'attention') return 'red'
  if (status === 'detected') return 'blue'
  return 'warm-gray'
}

function unitIcon(unitId: string) {
  switch (unitId) {
    case 'ground-control-pro':
      return DataStructured
    case 'mackie-mcu-pro':
      return ConnectionSignal
    case 'novation-launch-control':
      return IbmWatsonMachineLearning
    default:
      return Music
  }
}

export function resolvePhysicalSurfaceStandaloneRoute(
  unitId: string,
  specializedRoute?: string | null,
): string | null {
  if (specializedRoute && specializedRoute.trim()) {
    return specializedRoute
  }
  return STANDALONE_SURFACE_ROUTE_BY_UNIT_ID[unitId] ?? null
}

const FALLBACK_UNITS: Array<Pick<EnrichedPhysicalSurfaceUnit, 'unit_id' | 'display_name'> & { status: string }> = [
  { unit_id: 'maschine-mk1', display_name: 'Native Instruments Maschine MK1', status: 'planned' },
  { unit_id: 'ableton-push', display_name: 'Ableton Push', status: 'planned' },
  { unit_id: 'ground-control-pro', display_name: 'Voodoo Lab Ground Control Pro', status: 'planned' },
  { unit_id: 'meloaudio-midi-commander', display_name: 'MeloAudio MIDI Commander', status: 'planned' },
  { unit_id: 'novation-launch-control', display_name: 'Novation Launch Control Family', status: 'planned' },
  { unit_id: 'mackie-mcu-pro', display_name: 'Mackie MCU Pro', status: 'planned' },
]

export interface PhysicalSurfacesShellContextValue {
  summary: EnrichedPhysicalSurfacesSummary | null
  isLoading: boolean
  isError: boolean
}

export function PhysicalSurfacesShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const resolvedTheme = theme.carbonTheme ?? 'g100'

  const summaryQuery = useQuery({
    queryKey: ['enriched-physical-surfaces', 'summary'],
    queryFn: () => enrichedPhysicalSurfacesApi.getSummary(),
    refetchInterval: 10_000,
  })

  const summary = summaryQuery.data?.summary ?? null
  const shellContext = useMemo<PhysicalSurfacesShellContextValue>(
    () => ({
      summary,
      isLoading: summaryQuery.isLoading,
      isError: summaryQuery.isError,
    }),
    [summary, summaryQuery.isError, summaryQuery.isLoading],
  )

  const navItems = useMemo<UnifiedWorkspaceSideNavItem[]>(() => {
    const units = summary?.units ?? FALLBACK_UNITS
    const items: UnifiedWorkspaceSideNavItem[] = [
      {
        key: 'overview',
        label: 'Overview',
        to: '/physical-surfaces',
        icon: DataStructured,
        active: location.pathname === '/physical-surfaces',
        onOpen: () => navigate('/physical-surfaces'),
        description: 'See the full Enriched_MIDI_Physical_Surfaces stack, host observations, and per-device readiness in one routed shell.',
        labelDecor: <PhysicalSurfaceNavDot accent={location.pathname === '/physical-surfaces' ? 'active' : 'blue'} />,
        meta: buildMetaTag(summary?.units ? String(summary.units.length) : undefined, 'blue'),
      },
    ]

    for (const unit of units) {
      const to = `/physical-surfaces/${unit.unit_id}`
      const active = location.pathname === to
      const accent = active ? 'active' : statusAccent(unit.status)
      items.push({
        key: unit.unit_id,
        label: unit.display_name,
        to,
        icon: unitIcon(unit.unit_id),
        active,
        onOpen: () => navigate(to),
        description: `Open the ${unit.display_name} subpage inside the shared physical-surface shell.`,
        labelDecor: <PhysicalSurfaceNavDot accent={accent} />,
        meta: buildMetaTag(unit.status, statusAccent(unit.status)),
      })
    }

    return items
  }, [location.pathname, navigate, summary])

  const footerRouteItems = useMemo<UnifiedWorkspaceSideNavItem[]>(() => {
    const units = summary?.units ?? []
    const unitsById = new Map(units.map((unit) => [unit.unit_id, unit]))
    const routeUnits = FALLBACK_UNITS
      .map((fallback) => unitsById.get(fallback.unit_id) ?? fallback)
      .filter((unit) => resolvePhysicalSurfaceStandaloneRoute(unit.unit_id) !== null)

    return routeUnits.map((unit) => {
      const route = resolvePhysicalSurfaceStandaloneRoute(unit.unit_id)!
      return {
        key: `standalone:${unit.unit_id}`,
        label: unit.display_name,
        to: route,
        icon: unitIcon(unit.unit_id),
        active: location.pathname === route,
        onOpen: () => navigate(route),
        description: `Open the dedicated ${unit.display_name} route outside the shared physical-surface shell.`,
        labelDecor: <PhysicalSurfaceNavDot accent={location.pathname === route ? 'active' : statusAccent(unit.status)} />,
        meta: buildMetaTag(unit.status, statusAccent(unit.status)),
        variant: 'utility',
      }
    })
  }, [location.pathname, navigate, summary])

  return (
    <GlobalTheme theme={resolvedTheme}>
      <Theme as="div" theme={resolvedTheme} className="physical-surfaces-shell">
        <WorkspacePageTemplate
          className="physical-surfaces-shell__template"
          windowClassName="physical-surfaces-shell__frame"
          sidebarClassName="physical-surfaces-shell__sidebar"
          contentClassName="physical-surfaces-shell__content"
          stickySidebar
          sidebar={(
            <UnifiedWorkspaceSideNav
              ariaLabel="Physical surface navigation"
              className="physical-surfaces-shell__sidenav"
              eyebrow="Unified stack"
              title="Enriched_MIDI_Physical_Surfaces"
              description="Unified controller architecture for richer physical-surface discovery, transport selection, and device-family workflows."
              items={navItems}
              footerTitle="Dedicated Routes"
              footerItems={footerRouteItems}
              footer={(
                <div className="physical-surfaces-shell__warning">
                  <WarningAltFilled size={14} />
                  <span>Rich protocol depth still varies by device family; this shell exposes the shared truth and current posture.</span>
                </div>
              )}
            />
          )}
          content={(
            <main className="physical-surfaces-shell__content-body" key={location.pathname}>
              {summaryQuery.isError ? (
                <InlineNotification
                  kind="error"
                  lowContrast
                  hideCloseButton
                  title="Physical surface summary could not be loaded"
                  subtitle="The shared stack route exists, but the backend summary request failed."
                />
              ) : null}
              <Outlet context={shellContext} />
            </main>
          )}
        />
      </Theme>
    </GlobalTheme>
  )
}

export default PhysicalSurfacesShell
