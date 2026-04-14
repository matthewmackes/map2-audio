import { NodeNavBar } from '../components/NodeNav/NodeNavBar'
import { LatencyPressureShellReadout } from '../components/LatencyPressureShellReadout'
import { PushConfirmationNoticePill } from './PushConfirmationNoticePill'
import type { PushSurfacePendingConfirmation } from '../../map2/clients/pushSurface'
import type { TaskbarPillItem } from './useAppShellPresentation'

type TaskbarStatusStripProps = {
  pendingPushConfirmation: PushSurfacePendingConfirmation | null
  pillItems: TaskbarPillItem[]
  onOpenPill: (route: string) => void
}

export function TaskbarStatusStrip({
  pendingPushConfirmation,
  pillItems,
  onOpenPill,
}: TaskbarStatusStripProps) {
  return (
    <div className="window-taskbar__status-strip" aria-label="Shell status">
      {pillItems.map((item) => (
        <button
          key={`${item.tone}-${item.label}`}
          type="button"
          className={`window-taskbar__pill window-taskbar__pill--${item.tone}`}
          onClick={() => onOpenPill(item.route)}
          title={`Open ${item.label}`}
        >
          {item.label}
        </button>
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
