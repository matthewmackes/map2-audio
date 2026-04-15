import { Headphones } from '@carbon/icons-react'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/shared/EmptyState'
import { LoadingState } from '../components/shared/LoadingState'
import { DeviceContextBanner } from '../components/DeviceContext'
import { AudioInterfaceControl } from '../../map2/components/AudioInterfaceControl'
import { useCluster } from '../contexts/useCluster'
import { useDeviceNodeContext } from '../hooks/useDeviceNodeContext'

export function HoToneJoGGPage() {
  const { activeNodeId, localNodeId, nodes } = useCluster()
  const { deviceState } = useDeviceNodeContext('hotone-jogg')

  const selectedNodeId = activeNodeId && activeNodeId !== 'all' ? activeNodeId : localNodeId
  const selectedNode = nodes.find((node) => node.nodeId === selectedNodeId)
  const remoteSelected = selectedNodeId !== localNodeId
  const apiNodeId = remoteSelected ? selectedNodeId : null

  return (
    <div className="stack">
      <PageHeader
        title="HoTone JoGG"
        subtitle={
          remoteSelected
            ? `USB Audio Interface Configuration & Monitoring · Viewing ${selectedNode?.hostname ?? selectedNodeId}`
            : 'USB Audio Interface Configuration & Monitoring'
        }
        icon={<Headphones size={32} style={{ color: 'var(--interactive)' }} />}
      />

      <DeviceContextBanner deviceName="HoTone JoGG" deviceKey="hotone-jogg" />

      {deviceState === 'loading' ? (
        <LoadingState description="Checking cluster hardware inventory for the HoTone JoGG interface" />
      ) : null}

      {deviceState === 'not_found' ? (
        <EmptyState
          title="No HoTone JoGG interface is currently detected on any cluster node"
          description="Connect the interface or switch to the node where it is attached to manage it here."
          align="left"
        />
      ) : null}

      {deviceState === 'ready' ? (
        <AudioInterfaceControl nodeId={apiNodeId} />
      ) : null}
    </div>
  )
}
