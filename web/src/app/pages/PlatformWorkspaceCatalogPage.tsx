import { useNavigate } from 'react-router-dom'

import { PlatformModalContent } from '../components/Platform/PlatformModal'
import { buildPlatformWorkspacePath } from '../platform/routes'

export function PlatformWorkspaceCatalogPage() {
  const navigate = useNavigate()

  return (
    <PlatformModalContent
      surface="route"
      initialWorkspaceCatalog
      onNavigate={(params) => {
        if (!params) {
          navigate('/platforms/workspace-catalog')
          return
        }

        navigate(buildPlatformWorkspacePath((params.panel ?? params.layer) ?? 'overview'))
      }}
      onLaunchRoute={(to) => navigate(to)}
      onClose={() => navigate('/')}
    />
  )
}

export default PlatformWorkspaceCatalogPage
