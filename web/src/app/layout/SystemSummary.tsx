import { NodeNavBar } from '../components/NodeNav/NodeNavBar'
import { LatencyPressureShellReadout } from '../components/LatencyPressureShellReadout'
import { TaskbarClock } from '../components/TaskbarClock'
import { DeviceInterfaceList } from './DeviceInterfaceList'
import { PushConfirmationNoticePill } from './PushConfirmationNoticePill'
import type { ShellSummaryData } from './useShellSummaryData'

type SystemSummaryProps = {
  classNamePrefix: 'map2-launcher'
  summaryData: ShellSummaryData
}

export function SystemSummary({
  classNamePrefix,
  summaryData,
}: SystemSummaryProps) {
  const {
    launcherInterfaceSummary,
    hostSummaryItems,
    hostSummaryState,
    pendingPushConfirmation,
    platformStatusItems,
  } = summaryData

  return (
    <div className={`${classNamePrefix}__summary`} aria-label="System summary">
      <div className={`${classNamePrefix}__summary-meta`}>
        {hostSummaryItems.map((item) => (
          <span
            key={item}
            className={`${classNamePrefix}__summary-meta-item ${classNamePrefix}__summary-meta-item--${hostSummaryState}`}
          >
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
        {platformStatusItems.map((item) => (
          <span
            key={item.label}
            className={`${classNamePrefix}__status-item ${classNamePrefix}__status-item--${item.state}`}
            data-status-state={item.state}
          >
            {item.label}
          </span>
        ))}
      </div>
      {launcherInterfaceSummary.errorMessage ? (
        <div className={`${classNamePrefix}__summary-note`} role="status" aria-live="polite">
          Live interface scan is degraded. Showing the last known hardware state.
        </div>
      ) : null}
      <div className={`${classNamePrefix}__device-summary`} aria-label="Detected interfaces">
        <div className={`${classNamePrefix}__device-group`}>
          <span className={`${classNamePrefix}__device-heading`}>Audio Interfaces</span>
          <div className={`${classNamePrefix}__device-list`}>
            <DeviceInterfaceList
              classNamePrefix={classNamePrefix}
              items={launcherInterfaceSummary.audioInterfaces}
              isLoading={launcherInterfaceSummary.isLoading}
              errorMessage={launcherInterfaceSummary.errorMessage}
              detectingLabel="Detecting audio interfaces..."
              emptyLabel="No audio interfaces detected"
              degradedLabel="Audio interface scan unavailable"
            />
          </div>
        </div>
        <div className={`${classNamePrefix}__device-group`}>
          <span className={`${classNamePrefix}__device-heading`}>MIDI Interfaces</span>
          <div className={`${classNamePrefix}__device-list`}>
            <DeviceInterfaceList
              classNamePrefix={classNamePrefix}
              items={launcherInterfaceSummary.midiInterfaces}
              isLoading={launcherInterfaceSummary.isLoading}
              errorMessage={launcherInterfaceSummary.errorMessage}
              detectingLabel="Detecting MIDI interfaces..."
              emptyLabel="No MIDI interfaces detected"
              degradedLabel="MIDI interface scan unavailable"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
