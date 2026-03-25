import { useSearchParams } from 'react-router-dom'

import { PlatformRemediationWorkflow } from '../components/Platform/PlatformRemediationWorkflow'

export function PlatformAdoptionPage() {
  const [searchParams] = useSearchParams()
  const stateFilter = searchParams.get('state')
  return <PlatformRemediationWorkflow mode="adoption" stateFilter={stateFilter} embedded />
}

export default PlatformAdoptionPage
