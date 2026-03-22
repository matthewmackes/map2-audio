import { useNavigate } from 'react-router-dom'

import { PlatformModalContent } from '../components/Platform/PlatformModal'
import { buildPlatformWorkspacePath } from '../platform/routes'

export function LabsPage() {
  const navigate = useNavigate()

  return (
    <PlatformModalContent
      surface="route"
      initialLabs
      onNavigate={(params) => {
        if (!params) {
          navigate('/labs')
          return
        }

        navigate(buildPlatformWorkspacePath((params.panel ?? params.layer) ?? 'overview'))
      }}
      onLaunchRoute={(to) => navigate(to)}
      onClose={() => navigate('/')}
    />
  )
}

export default LabsPage
