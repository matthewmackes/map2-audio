import { PhysicalSurfaceUnitPage } from '../../PhysicalSurfaceUnitPage'
import { buildWorkspacePhysicalSurfacesPath } from '../../physicalSurfacesRoutes'

export function WorkspacePhysicalSurfaceUnitPage() {
  return <PhysicalSurfaceUnitPage buildUnitPath={buildWorkspacePhysicalSurfacesPath} />
}

export default WorkspacePhysicalSurfaceUnitPage
