import { Tag } from '@carbon/react'

import { NodeNavBar } from '../components/NodeNav/NodeNavBar'
import { LatencyPressureShellReadout } from '../components/LatencyPressureShellReadout'
import { TaskbarClock } from '../components/TaskbarClock'
import { PushConfirmationNoticePill } from './PushConfirmationNoticePill'
import type { PushSurfacePendingConfirmation } from '../../map2/clients/pushSurface'
import type { LauncherInterfaceSummary } from './useLauncherInterfaceSummary'

type SystemSummaryProps = {
  classNamePrefix: 'hp2-overlay' | 'shell-launcher'
  launcherInterfaceSummary: LauncherInterfaceSummary
  launcherSummaryItems: string[]
  pendingPushConfirmation: PushSurfacePendingConfirmation | null
  platformStatusLabels: string[]
}

type DeviceListProps = {
  classNamePrefix: SystemSummaryProps['classNamePrefix']
  items: string[]
  isLoading: boolean
  detectingLabel: string
  emptyLabel: string
}

function DeviceList({
  classNamePrefix,
  items,
  isLoading,
  detectingLabel,
  emptyLabel,
}: DeviceListProps) {
  if (isLoading && items.length === 0) {
    return <span className={`${classNamePrefix}__device-empty`}>{detectingLabel}</span>
  }

  if (items.length === 0) {
    return <span className={`${classNamePrefix}__device-empty`}>{emptyLabel}</span>
  }

  return items.map((name) => (
    <Tag key={name} className={`${classNamePrefix}__device-tag`} size="sm" type="cool-gray">
      {name}
    </Tag>
  ))
}

export function SystemSummary({
  classNamePrefix,
  launcherInterfaceSummary,
  launcherSummaryItems,
  pendingPushConfirmation,
  platformStatusLabels,
}: SystemSummaryProps) {
  return (
    <div className={`${classNamePrefix}__summary`} aria-label="System summary">
      <div className={`${classNamePrefix}__summary-meta`}>
        {launcherSummaryItems.map((item) => (
          <span key={item} className={`${classNamePrefix}__summary-meta-item`}>
            {item}
          </span>
        ))}
      </div>
      <div className={`${classNamePrefix}__summary-row ${classNamePrefix}__summary-row--node-status`}>
        <PushConfirmationNoticePill pendingConfirmation={pendingPushConfirmation} />
        <NodeNavBar />
      </div>
      <div className={`${classNamePrefix}__summary-row ${classNamePrefix}__summary-row--metrics`}>
        <LatencyPressureShellReadout />
        <TaskbarClock />
      </div>
      <div className={`${classNamePrefix}__status-list`} aria-label="Platform status">
        {platformStatusLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className={`${classNamePrefix}__device-summary`} aria-label="Detected interfaces">
        <div className={`${classNamePrefix}__device-group`}>
          <span className={`${classNamePrefix}__device-heading`}>Audio Interfaces</span>
          <div className={`${classNamePrefix}__device-list`}>
            <DeviceList
              classNamePrefix={classNamePrefix}
              items={launcherInterfaceSummary.audioInterfaces}
              isLoading={launcherInterfaceSummary.isLoading}
              detectingLabel="Detecting audio interfaces..."
              emptyLabel="No audio interfaces detected"
            />
          </div>
        </div>
        <div className={`${classNamePrefix}__device-group`}>
          <span className={`${classNamePrefix}__device-heading`}>MIDI Interfaces</span>
          <div className={`${classNamePrefix}__device-list`}>
            <DeviceList
              classNamePrefix={classNamePrefix}
              items={launcherInterfaceSummary.midiInterfaces}
              isLoading={launcherInterfaceSummary.isLoading}
              detectingLabel="Detecting MIDI interfaces..."
              emptyLabel="No MIDI interfaces detected"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
