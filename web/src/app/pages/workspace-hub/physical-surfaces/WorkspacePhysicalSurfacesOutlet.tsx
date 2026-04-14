import { Outlet } from 'react-router-dom'

import { useUnifiedWorkspaceData } from '../../../hooks/useUnifiedWorkspaceData'
import type { PhysicalSurfacesShellContextValue } from '../../physicalSurfacesShared'
import '../../PhysicalSurfacesShell.css'

export function WorkspacePhysicalSurfacesOutlet() {
  const workspaceData = useUnifiedWorkspaceData()
  const contextValue: PhysicalSurfacesShellContextValue = {
    summary: workspaceData.physicalSurfaces.summary,
    isLoading: workspaceData.physicalSurfaces.isLoading,
    isError: workspaceData.physicalSurfaces.isError,
  }

  return <Outlet context={contextValue} />
}

export default WorkspacePhysicalSurfacesOutlet
