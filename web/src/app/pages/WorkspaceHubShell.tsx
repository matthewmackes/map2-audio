import { useMemo } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { GlobalTheme, Theme } from '@carbon/react'

import { WorkspacePageTemplate } from '../components/layout/WorkspacePageTemplate'
import { PageHeader } from '../components/PageHeader'
import { ShellWindowProvider } from '../layout/ShellWindowContext'
import { useTheme } from '../theme'
import { useUnifiedWorkspaceData, type UnifiedWorkspaceSectionSummary } from '../hooks/useUnifiedWorkspaceData'
import {
  WorkspaceHubContext,
  type WorkspaceHubContextValue,
  type WorkspaceHubNavSection,
  useWorkspaceHubContext,
} from './WorkspaceHubContext'
import { WorkspaceHubNav } from './WorkspaceHubNav'
import './WorkspaceHubShell.css'

const WORKSPACE_HUB_SECTIONS: WorkspaceHubNavSection[] = [
  {
    key: 'platforms',
    label: 'Platforms',
    items: [{ key: 'platforms-overview', label: 'Overview', to: '/workspace/platforms/overview' }],
  },
  {
    key: 'physical-surfaces',
    label: 'Physical Surfaces',
    items: [{ key: 'physical-surfaces-overview', label: 'Overview', to: '/workspace/physical-surfaces' }],
  },
  {
    key: 'artifacts',
    label: 'Audio Artifacts',
    items: [{ key: 'artifacts-overview', label: 'Overview', to: '/workspace/artifacts' }],
  },
  {
    key: 'outboard-hardware',
    label: 'Outboard Hardware',
    items: [{ key: 'outboard-hardware-overview', label: 'Overview', to: '/workspace/outboard-hardware' }],
  },
]

export function WorkspaceHubIndexRedirect() {
  return <Navigate to="/workspace/platforms/overview" replace />
}

export function WorkspaceHubPlaceholder({
  title,
  subtitle,
  sectionKey,
}: {
  title: string
  subtitle: string
  sectionKey: UnifiedWorkspaceSectionSummary['key']
}) {
  const { summaries } = useWorkspaceHubContext()
  const summary = summaries[sectionKey]

  return (
    <div className="workspace-hub-shell__placeholder">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={(
          <div className="workspace-hub-shell__header-metrics" aria-label={`${title} summary`}>
            <span className="workspace-hub-shell__header-metric">{summary.metric}</span>
            <span className="workspace-hub-shell__header-detail">{summary.detail}</span>
          </div>
        )}
      />
      <div className="workspace-hub-shell__placeholder-card">
        <h2>Migration pending</h2>
        <p>
          This section now has a canonical `/workspace/*` address and flat navigation entry. Content migration lands in later
          workspace-hub slices.
        </p>
      </div>
    </div>
  )
}

export function WorkspaceHubShell() {
  const location = useLocation()
  const { theme } = useTheme()
  const resolvedTheme = theme.carbonTheme ?? 'g100'
  const workspaceData = useUnifiedWorkspaceData()
  const contextValue = useMemo<WorkspaceHubContextValue>(
    () => ({
      navSections: WORKSPACE_HUB_SECTIONS,
      summaries: workspaceData.summaries,
    }),
    [workspaceData.summaries],
  )

  return (
    <GlobalTheme theme={resolvedTheme}>
      <Theme as="div" theme={resolvedTheme} className="workspace-hub-shell">
        <ShellWindowProvider value={null}>
          <WorkspaceHubContext.Provider value={contextValue}>
            <WorkspacePageTemplate
              className="workspace-hub-shell__template"
              windowClassName="workspace-hub-shell__frame"
              sidebarClassName="workspace-hub-shell__sidebar"
              contentClassName="workspace-hub-shell__content"
              stickySidebar
              sidebar={<WorkspaceHubNav sections={WORKSPACE_HUB_SECTIONS} />}
              content={
                <main className="workspace-hub-shell__content-body" key={location.pathname}>
                  <section className="workspace-hub-shell__summary-grid" aria-label="Workspace summaries">
                    {workspaceData.orderedSummaries.map((summary) => (
                      <article
                        key={summary.key}
                        className={`workspace-hub-shell__summary-card workspace-hub-shell__summary-card--${summary.tone}`}
                      >
                        <p className="workspace-hub-shell__summary-label">{summary.label}</p>
                        <h2 className="workspace-hub-shell__summary-metric">{summary.metric}</h2>
                        <p className="workspace-hub-shell__summary-detail">{summary.detail}</p>
                      </article>
                    ))}
                  </section>
                  <Outlet />
                </main>
              }
            />
          </WorkspaceHubContext.Provider>
        </ShellWindowProvider>
      </Theme>
    </GlobalTheme>
  )
}

export default WorkspaceHubShell
