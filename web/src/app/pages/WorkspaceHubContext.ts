import { createContext, useContext } from 'react'

import type { UnifiedWorkspaceSectionKey, UnifiedWorkspaceSectionSummary } from '../hooks/useUnifiedWorkspaceData'

export interface WorkspaceHubNavItem {
  key: string
  label: string
  to: string
}

export interface WorkspaceHubNavSection {
  key: string
  label: string
  items: WorkspaceHubNavItem[]
}

export interface WorkspaceHubContextValue {
  navSections: WorkspaceHubNavSection[]
  summaries: Record<UnifiedWorkspaceSectionKey, UnifiedWorkspaceSectionSummary>
}

export const WorkspaceHubContext = createContext<WorkspaceHubContextValue | null>(null)

export function useWorkspaceHubContext(): WorkspaceHubContextValue {
  const context = useContext(WorkspaceHubContext)
  if (!context) {
    throw new Error('useWorkspaceHubContext must be used within a WorkspaceHubContext provider')
  }
  return context
}
