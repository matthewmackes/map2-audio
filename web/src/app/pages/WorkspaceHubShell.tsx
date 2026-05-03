import { useMemo } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { GlobalTheme, Theme } from '@carbon/react'

import { WorkspacePageTemplate } from '../components/layout/WorkspacePageTemplate'
import { isMidpointChildNavItem, platformPanelItems } from '../data/platformMenuItems'
import {
  ARTIFACTS_BASE_PATH,
  buildArtifactsDiscoverPath,
  buildArtifactsPath,
} from './audioArtifactsRoutes'
import { toCarbonBaseTheme, useTheme } from '../theme'
import { buildWorkspaceHubPlatformPath } from '../platform/routes'
import { useUnifiedWorkspaceData, type UnifiedWorkspaceSectionSummary } from '../hooks/useUnifiedWorkspaceData'
import { useRouteScrollRestoration } from '../hooks/useRouteScrollRestoration'
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

// Nav reorg 2026-05-03 (second pass) — Audio Artifacts is now its
// own top-level service group at `/artifacts`. The shell sidebar
// items below match against that canonical pathname instead of the
// old `/workspace/artifacts` mount.
function buildWorkspaceArtifactsNavItem(
  key: string,
  label: string,
  category: string | null,
): WorkspaceHubNavItem {
  const to = category
    ? buildArtifactsPath(new URLSearchParams({ category }))
    : buildArtifactsPath()

  return {
    key,
    label,
    to,
    match: (location) => {
      if (location.pathname !== ARTIFACTS_BASE_PATH) {
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
      items: platformPanelItems
        .filter((item) => !isMidpointChildNavItem(item))
        .map((item) => {
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
      key: 'artifacts',
      label: 'Audio Files',
      items: [
        ...ARTIFACT_CATEGORY_ITEMS.map((item) => buildWorkspaceArtifactsNavItem(item.key, item.label, item.category)),
        {
          key: 'artifacts-discover',
          label: 'Discover',
          to: buildArtifactsDiscoverPath(),
          match: (location) => location.pathname === buildArtifactsDiscoverPath(),
        },
      ],
    },
  ]
}

export function WorkspaceHubIndexRedirect() {
  // Nav reorg 2026-05-03 (second pass) — `/node-ops` (the canonical
  // base) lands on the Overview platform section. Pre-reorg this
  // redirected to `/workspace/platforms/overview`.
  return <Navigate to="/node-ops/overview" replace />
}

export function WorkspaceHubShell() {
  const location = useLocation()
  const { theme } = useTheme()
  const resolvedTheme = toCarbonBaseTheme(theme.carbonTheme)
  const workspaceData = useUnifiedWorkspaceData()
  useRouteScrollRestoration({
    storageKey: `map2.route-scroll.workspace:${location.pathname}${location.search}`,
  })
  const navSections = useMemo(() => buildWorkspaceHubSections(), [])
  const contextValue = useMemo<WorkspaceHubContextValue>(
    () => ({
      navSections,
      summaries: workspaceData.summaries,
    }),
    [navSections, workspaceData.summaries],
  )

  return (
    <GlobalTheme theme={resolvedTheme}>
      <Theme as="div" theme={resolvedTheme} className="workspace-hub-shell">
        <WorkspaceHubContext.Provider value={contextValue}>
          <WorkspacePageTemplate
            className="workspace-hub-shell__template"
            windowClassName="workspace-hub-shell__frame"
            contentClassName="workspace-hub-shell__content"
            sidebar={null}
            content={
              <section className="workspace-hub-shell__content-body" aria-label="Workspace hub content">
                <section className="workspace-hub-shell__outlet-surface" key={`${location.pathname}${location.search}`}>
                  <Outlet />
                </section>
              </section>
            }
          />
        </WorkspaceHubContext.Provider>
      </Theme>
    </GlobalTheme>
  )
}

export default WorkspaceHubShell
