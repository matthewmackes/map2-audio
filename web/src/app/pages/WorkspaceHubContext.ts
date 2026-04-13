import { createContext, useContext } from 'react'

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
}

export const WorkspaceHubContext = createContext<WorkspaceHubContextValue | null>(null)

export function useWorkspaceHubContext(): WorkspaceHubContextValue {
  const context = useContext(WorkspaceHubContext)
  if (!context) {
    throw new Error('useWorkspaceHubContext must be used within a WorkspaceHubContext provider')
  }
  return context
}
