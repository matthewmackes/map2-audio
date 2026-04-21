import type { CSSProperties } from 'react'
import { Button } from '@carbon/react'
import { VolumeMute, VolumeUp } from '@carbon/icons-react'

import { COLUMN_WIDTHS, ROW_HEIGHTS, type UnifiedChannelRow } from './gridConstants'

export interface ChannelHeaderProps {
  row: UnifiedChannelRow
  onToggleMute?: (rowId: string) => void
  onToggleSolo?: (rowId: string) => void
}

export function ChannelHeader({ row, onToggleMute, onToggleSolo }: ChannelHeaderProps) {
  const style: CSSProperties = {
    width: COLUMN_WIDTHS.channelHeader,
    height: ROW_HEIGHTS.channel,
  }

  return (
    <div
      className="ucg-channel-header"
      style={style}
      role="rowheader"
      data-row-id={row.id}
      data-stereo={row.stereo ? 'true' : 'false'}
      data-muted={row.muted ? 'true' : 'false'}
      data-solo={row.solo ? 'true' : 'false'}
    >
      <div className="ucg-channel-header__labels">
        <span className="ucg-channel-header__name" title={row.name}>
          {row.name}
        </span>
        {row.ioLabel ? (
          <span className="ucg-channel-header__io" title={row.ioLabel}>
            {row.ioLabel}
          </span>
        ) : null}
      </div>

      <div className="ucg-channel-header__controls">
        <Button
          kind={row.muted ? 'danger--tertiary' : 'ghost'}
          size="sm"
          hasIconOnly
          iconDescription={row.muted ? 'Unmute' : 'Mute'}
          renderIcon={row.muted ? VolumeMute : VolumeUp}
          onClick={() => onToggleMute?.(row.id)}
          aria-pressed={row.muted}
          data-action="mute"
        />
        <Button
          kind={row.solo ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => onToggleSolo?.(row.id)}
          aria-pressed={row.solo}
          data-action="solo"
        >
          S
        </Button>
      </div>

      <div
        className="ucg-channel-header__vu"
        aria-hidden
        data-placeholder="true"
        role="presentation"
      >
        <span className="ucg-channel-header__vu-bar" />
        {row.stereo ? <span className="ucg-channel-header__vu-bar" /> : null}
      </div>
    </div>
  )
}
