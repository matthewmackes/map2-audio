import '../../PhysicalSurfacesShell.css'

import { PhysicalSurfacesOverviewPage } from '../../PhysicalSurfacesOverviewPage'
import { buildWorkspacePhysicalSurfacesPath } from '../../physicalSurfacesRoutes'

export function WorkspacePhysicalSurfacesOverviewPage() {
  return <PhysicalSurfacesOverviewPage buildUnitPath={buildWorkspacePhysicalSurfacesPath} />
}

export default WorkspacePhysicalSurfacesOverviewPage
