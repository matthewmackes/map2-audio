import { NodeNavBar } from '../components/NodeNav/NodeNavBar'
import { LatencyPressureShellReadout } from '../components/LatencyPressureShellReadout'
import { PushConfirmationNoticePill } from './PushConfirmationNoticePill'
import type { PushSurfacePendingConfirmation } from '../../map2/clients/pushSurface'

type TaskbarStatusStripProps = {
  launcherSummaryItems: string[]
  pendingPushConfirmation: PushSurfacePendingConfirmation | null
  platformStatusLabels: string[]
}

export function TaskbarStatusStrip({
  launcherSummaryItems,
  pendingPushConfirmation,
  platformStatusLabels,
}: TaskbarStatusStripProps) {
  return (
    <div className="window-taskbar__status-strip" aria-label="Shell status">
      {launcherSummaryItems.map((item) => (
        <span key={item} className="window-taskbar__pill window-taskbar__pill--info">
          {item}
        </span>
      ))}
      {platformStatusLabels.map((label) => (
        <span key={label} className="window-taskbar__pill window-taskbar__pill--status">
          {label}
        </span>
      ))}
      {pendingPushConfirmation ? (
        <PushConfirmationNoticePill pendingConfirmation={pendingPushConfirmation} />
      ) : null}
      <div className="window-taskbar__pill window-taskbar__pill--node">
        <NodeNavBar />
      </div>
      <div className="window-taskbar__pill window-taskbar__pill--latency">
        <LatencyPressureShellReadout />
      </div>
    </div>
  )
}
