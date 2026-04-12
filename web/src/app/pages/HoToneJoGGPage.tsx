import { Headphones } from '@carbon/icons-react'
import { Alert, Button, CircularProgress } from '@mui/material'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/shared/EmptyState'
import { LoadingState } from '../components/shared/LoadingState'
import { AudioInterfaceControl } from '../../map2/components/AudioInterfaceControl'
import { useCluster } from '../contexts/useCluster'
import { useDeviceLocation } from '../hooks/useDeviceLocation'

export function HoToneJoGGPage() {
  const { activeNodeId, localNodeId, nodes, setActiveNode } = useCluster()
  const { location, isLoading } = useDeviceLocation('hotone-jogg')

  const selectedNodeId = activeNodeId && activeNodeId !== 'all' ? activeNodeId : localNodeId
  const selectedNode = nodes.find((node) => node.nodeId === selectedNodeId)
  const locationNode = location ? nodes.find((node) => node.nodeId === location.nodeId) : null
  const remoteSelected = selectedNodeId !== localNodeId
  const apiNodeId = remoteSelected ? selectedNodeId : null
  const needsSwitch = Boolean(location && selectedNodeId !== location.nodeId)
  const locationLabel = location?.hostname ?? location?.nodeId ?? 'the correct node'

  return (
    <div className="stack">
      <PageHeader
        title="HoTone JoGG"
        subtitle={
          remoteSelected
            ? `USB Audio Interface Configuration & Monitoring · Viewing ${selectedNode?.hostname ?? selectedNodeId}`
            : 'USB Audio Interface Configuration & Monitoring'
        }
        icon={<Headphones size={32} style={{ color: '#3b82f6' }} />}
      />

      {isLoading ? (
        <LoadingState description="Checking cluster hardware inventory for the HoTone JoGG interface" />
      ) : null}

      {!isLoading && !location ? (
        <EmptyState
          title="No HoTone JoGG interface is currently detected on any cluster node"
          description="Connect the interface or switch to the node where it is attached to manage it here."
          align="left"
        />
      ) : null}

      {!isLoading && needsSwitch ? (
        <Alert
          severity="info"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => setActiveNode(location?.nodeId === localNodeId ? null : location?.nodeId ?? null)}
            >
              Switch to {locationLabel}
            </Button>
          }
        >
          HoTone JoGG is connected to {locationLabel}. Select that node to manage the interface directly.
        </Alert>
      ) : null}

      {!isLoading && location && !needsSwitch ? (
        <AudioInterfaceControl nodeId={apiNodeId} />
      ) : null}
    </div>
  )
}
