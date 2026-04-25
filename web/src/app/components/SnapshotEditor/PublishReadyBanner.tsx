/* PublishReadyBanner — surfaces a clear "ready to publish" call-to-action when
   the editor has a dirty draft of an existing snapshot. Mirrors the design in
   snapshot-editor.html (Snapshot Management — publish banner). */

import { ChartLine, Flash, Launch } from '@carbon/icons-react'
import { Button } from '@carbon/react'

import './PublishReadyBanner.css'

export interface PublishReadyBannerProps {
  snapshotName: string
  blockCount: number
  onDiff?: () => void
  onPublish: () => void
  diffDisabled?: boolean
  publishDisabled?: boolean
}

export function PublishReadyBanner({
  snapshotName,
  blockCount,
  onDiff,
  onPublish,
  diffDisabled = false,
  publishDisabled = false,
}: PublishReadyBannerProps) {
  const blockLabel = `${blockCount} ${blockCount === 1 ? 'block' : 'blocks'}`

  return (
    <div className="publish-ready-banner" role="status" aria-live="polite">
      <span className="publish-ready-banner__icon" aria-hidden>
        <Flash size={20} />
      </span>
      <div className="publish-ready-banner__copy">
        <p className="publish-ready-banner__title">Draft is ready to publish</p>
        <p className="publish-ready-banner__subtitle">
          “{snapshotName}” — {blockLabel}. Live listeners will hear the change immediately.
        </p>
      </div>
      <div className="publish-ready-banner__actions">
        {onDiff ? (
          <Button
            size="sm"
            kind="ghost"
            renderIcon={ChartLine}
            onClick={onDiff}
            disabled={diffDisabled}
          >
            Diff vs live
          </Button>
        ) : null}
        <Button
          size="sm"
          kind="primary"
          renderIcon={Launch}
          onClick={onPublish}
          disabled={publishDisabled}
        >
          Publish to live
        </Button>
      </div>
    </div>
  )
}

export default PublishReadyBanner
