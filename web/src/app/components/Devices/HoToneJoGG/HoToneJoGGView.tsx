import { Tag } from '@carbon/react'

import { useSetShellWindow } from '../../../layout/useSetShellWindow'
import { EmptyState } from '../../shared/EmptyState'
import { LoadingState } from '../../shared/LoadingState'
import { DeviceContextBanner } from '../../DeviceContext'
import { DeviceMeterSourceTag } from '../Shared/DeviceMeterSourceTag'
import { AudioInterfaceControl } from '../../../../map2/components/AudioInterfaceControl'
import { useCluster } from '../../../contexts/useCluster'
import { useDeviceNodeContext } from '../../../hooks/useDeviceNodeContext'
import { useDeviceMeterSource } from '../../../hooks/useDeviceMeterSource'

interface JoggMeterSourceBannerProps {
  enabled: boolean
}

function JoggMeterSourceBanner({ enabled }: JoggMeterSourceBannerProps) {
  // T2519 — meter-source signal for the JoGG. Pure status line; the
  // actual peak-meter values render inside AudioInterfaceControl.
  const meter = useDeviceMeterSource('hotone-jogg', { enabled })
  return (
    <div
      data-testid="jogg-meter-source-banner"
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        padding: '4px 0',
      }}
    >
      <Tag type="cool-gray" size="sm">Metering source</Tag>
      <DeviceMeterSourceTag
        source={meter.source}
        isError={meter.isError}
        testId="jogg-meter-source"
      />
    </div>
  )
}

export function HoToneJoGGView() {
  const { activeNodeId, localNodeId, nodes } = useCluster()
  const { deviceState, deviceLocation, targetNode } = useDeviceNodeContext('hotone-jogg')

  const selectedNodeId = activeNodeId && activeNodeId !== 'all' ? activeNodeId : localNodeId
  const selectedNode = nodes.find((node) => node.nodeId === selectedNodeId)
  const controlNodeId = deviceState === 'needs_switch'
    ? deviceLocation?.nodeId ?? null
    : selectedNodeId
  const controlIsRemote = Boolean(controlNodeId && controlNodeId !== localNodeId)
  const apiNodeId = controlIsRemote ? controlNodeId : null
  const controlHostname = deviceState === 'needs_switch'
    ? targetNode?.hostname ?? deviceLocation?.hostname ?? controlNodeId
    : selectedNode?.hostname ?? selectedNodeId

  useSetShellWindow({
    title: 'HoTone JoGG',
    subtitle: controlIsRemote
      ? `USB Audio Interface Configuration & Monitoring · Viewing ${controlHostname}`
      : 'USB Audio Interface Configuration & Monitoring',
    kicker: 'Platform / Devices / HoTone JoGG',
  }, [controlHostname, controlIsRemote])

  return (
    <div className="stack">
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

      {deviceState === 'node_offline' ? (
        <EmptyState
          title="The node with the HoTone JoGG interface is offline"
          description="Bring that node back online or connect the interface to the current node to manage it here."
          align="left"
        />
      ) : null}

      {deviceState === 'ready' || deviceState === 'needs_switch' ? (
        <>
          <JoggMeterSourceBanner enabled={!controlIsRemote} />
          <AudioInterfaceControl nodeId={apiNodeId} />
        </>
      ) : null}
    </div>
  )
}
