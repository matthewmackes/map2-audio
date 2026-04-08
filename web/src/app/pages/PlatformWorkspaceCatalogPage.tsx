import { Navigate } from 'react-router-dom'

import { buildPlatformWorkspacePath } from '../platform/routes'

export function PlatformWorkspaceCatalogPage() {
  return <Navigate to={buildPlatformWorkspacePath('overview')} replace />
}

export default PlatformWorkspaceCatalogPage
