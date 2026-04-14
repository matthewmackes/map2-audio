import { useMemo } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { GlobalTheme, Theme } from '@carbon/react'

import { WorkspacePageTemplate } from '../components/layout/WorkspacePageTemplate'
import { ShellWindowTitleStrip } from '../components/shared/ShellWindowTitleStrip'
import { MapOs2DrivesIcon } from '../components/icons/map'
import { platformPanelItems } from '../data/platformMenuItems'
import type { ShellWindowContextValue } from '../layout/ShellWindowContext'
import { ShellWindowProvider } from '../layout/ShellWindowContext'
import {
  WORKSPACE_ARTIFACTS_BASE_PATH,
  buildWorkspaceArtifactsDiscoverPath,
  buildWorkspaceArtifactsPath,
} from './audioArtifactsRoutes'
import { OUTBOARD_HARDWARE_DEVICES } from './outboardHardwareShared'
import { buildWorkspaceOutboardHardwarePath } from './outboardHardwareRoutes'
import { FALLBACK_PHYSICAL_SURFACE_UNITS } from './physicalSurfacesShared'
import { buildWorkspacePhysicalSurfacesPath } from './physicalSurfacesRoutes'
import { useTheme } from '../theme'
import { buildWorkspaceHubPlatformPath } from '../platform/routes'
import { useUnifiedWorkspaceData, type UnifiedWorkspaceSectionSummary } from '../hooks/useUnifiedWorkspaceData'
import {
  WorkspaceHubContext,
  type WorkspaceHubContextValue,
  type WorkspaceHubNavItem,
  type WorkspaceHubNavSection,
} from './WorkspaceHubContext'
import './WorkspaceHubShell.css'

const ARTIFACT_CATEGORY_ITEMS: Array<{ key: string; label: string; category: string | null }> = [
  { key: 'artifacts-overview', label: 'Overview', category: null },
  { key: 'artifacts-lv2', label: 'LV2 Plugins', category: 'lv2-plugins' },
  { key: 'artifacts-nam', label: 'NAM Models', category: 'nam-models' },
  { key: 'artifacts-cabinet-irs', label: 'Cabinet IRs', category: 'cabinet-irs' },
  { key: 'artifacts-reverb-irs', label: 'Reverb IRs', category: 'reverb-irs' },
  { key: 'artifacts-soundfonts', label: 'SoundFonts', category: 'soundfonts' },
  { key: 'artifacts-native-juce', label: 'Native JUCE', category: 'native-juce' },
  { key: 'artifacts-snapshots', label: 'Snapshots', category: 'snapshots' },
]

function buildWorkspaceArtifactsNavItem(
  key: string,
  label: string,
  category: string | null,
): WorkspaceHubNavItem {
  const to = category
    ? buildWorkspaceArtifactsPath(new URLSearchParams({ category }))
    : buildWorkspaceArtifactsPath()

  return {
    key,
    label,
    to,
    match: (location) => {
      if (location.pathname !== WORKSPACE_ARTIFACTS_BASE_PATH) {
        return false
      }

      const searchParams = new URLSearchParams(location.search)
      const activeCategory = searchParams.get('category') ?? 'lv2-plugins'
      return category === null ? activeCategory === 'lv2-plugins' : activeCategory === category
    },
  }
}

function buildWorkspaceHubSections(): WorkspaceHubNavSection[] {
  return [
    {
      key: 'platforms',
      label: 'Control Panels',
      items: platformPanelItems.map((item) => {
        const workspace = item.target.panel ?? item.target.layer ?? 'overview'
        return {
          key: `platforms-${workspace}`,
          label: item.label,
          to: buildWorkspaceHubPlatformPath(workspace),
          match: (location) => location.pathname === buildWorkspaceHubPlatformPath(workspace),
        }
      }),
    },
    {
      key: 'physical-surfaces',
      label: 'Surfaces',
      items: [
        {
          key: 'physical-surfaces-overview',
          label: 'Overview',
          to: buildWorkspacePhysicalSurfacesPath(),
          match: (location) => location.pathname === buildWorkspacePhysicalSurfacesPath(),
        },
        ...FALLBACK_PHYSICAL_SURFACE_UNITS.map((unit) => ({
          key: `physical-surfaces-${unit.unit_id}`,
          label: unit.display_name,
          to: buildWorkspacePhysicalSurfacesPath(unit.unit_id),
          match: (location) => location.pathname === buildWorkspacePhysicalSurfacesPath(unit.unit_id),
        })),
      ],
    },
    {
      key: 'artifacts',
      label: 'Audio Files',
      items: [
        ...ARTIFACT_CATEGORY_ITEMS.map((item) => buildWorkspaceArtifactsNavItem(item.key, item.label, item.category)),
        {
          key: 'artifacts-discover',
          label: 'Discover',
          to: buildWorkspaceArtifactsDiscoverPath(),
          match: (location) => location.pathname === buildWorkspaceArtifactsDiscoverPath(),
        },
      ],
    },
    {
      key: 'outboard-hardware',
      label: 'External Devices',
      items: [
        {
          key: 'outboard-hardware-overview',
          label: 'Overview',
          to: buildWorkspaceOutboardHardwarePath(),
          match: (location) => location.pathname === buildWorkspaceOutboardHardwarePath(),
        },
        ...OUTBOARD_HARDWARE_DEVICES.map((device) => ({
          key: `outboard-hardware-${device.deviceId}`,
          label: device.displayName,
          to: buildWorkspaceOutboardHardwarePath(device.deviceId),
          match: (location) => location.pathname === buildWorkspaceOutboardHardwarePath(device.deviceId),
        })),
      ],
    },
  ]
}

export function WorkspaceHubIndexRedirect() {
  return <Navigate to="/workspace/platforms/overview" replace />
}

export function WorkspaceHubShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const resolvedTheme = theme.carbonTheme ?? 'g100'
  const workspaceData = useUnifiedWorkspaceData()
  const navSections = useMemo(() => buildWorkspaceHubSections(), [])
  const contextValue = useMemo<WorkspaceHubContextValue>(
    () => ({
      navSections,
      summaries: workspaceData.summaries,
    }),
    [navSections, workspaceData.summaries],
  )
  const shellWindowContext = useMemo<ShellWindowContextValue>(
    () => ({
      title: 'Control Panel Hub',
      titleIcon: MapOs2DrivesIcon,
      routeHint: 'control panel / hub',
      accentColor: 'var(--cds-support-warning)',
      onClose: () => navigate('/'),
    }),
    [navigate],
  )

  return (
    <GlobalTheme theme={resolvedTheme}>
      <Theme as="div" theme={resolvedTheme} className="workspace-hub-shell">
        <ShellWindowProvider value={shellWindowContext}>
          <ShellWindowTitleStrip />
          <WorkspaceHubContext.Provider value={contextValue}>
            <ShellWindowProvider value={null}>
              <WorkspacePageTemplate
                className="workspace-hub-shell__template"
                windowClassName="workspace-hub-shell__frame"
                contentClassName="workspace-hub-shell__content"
                sidebar={null}
                content={
                  <main className="workspace-hub-shell__content-body">
                    <section className="workspace-hub-shell__outlet-surface" key={`${location.pathname}${location.search}`}>
                      <Outlet />
                    </section>
                  </main>
                }
              />
            </ShellWindowProvider>
          </WorkspaceHubContext.Provider>
        </ShellWindowProvider>
      </Theme>
    </GlobalTheme>
  )
}

export default WorkspaceHubShell
