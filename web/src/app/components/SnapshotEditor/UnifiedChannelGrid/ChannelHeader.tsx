import type { CSSProperties } from 'react'
import { Button, Tag } from '@carbon/react'
import { VolumeMute, VolumeUp } from '@carbon/icons-react'

import { COLUMN_WIDTHS, ROW_HEIGHTS, type UnifiedChannelRow } from './gridConstants'
import type { ChainMeterReading } from './useChainMeter'

export interface ChannelHeaderProps {
  row: UnifiedChannelRow
  meter?: ChainMeterReading
  onToggleMute?: (rowId: string) => void
  onToggleSolo?: (rowId: string) => void
}

export function ChannelHeader({ row, meter, onToggleMute, onToggleSolo }: ChannelHeaderProps) {
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
        data-live={meter?.isLive ? 'true' : 'false'}
        data-clipped={meter?.clipped ? 'true' : 'false'}
        role="presentation"
      >
        <span className="ucg-channel-header__vu-track">
          <span
            className="ucg-channel-header__vu-fill"
            style={{ inlineSize: `${Math.round((meter?.left ?? 0) * 100)}%` }}
            aria-hidden
          />
        </span>
        {row.stereo ? (
          <span className="ucg-channel-header__vu-track">
            <span
              className="ucg-channel-header__vu-fill"
              style={{ inlineSize: `${Math.round((meter?.right ?? 0) * 100)}%` }}
              aria-hidden
            />
          </span>
        ) : null}
        {meter?.clipped ? (
          <Tag size="sm" type="red" className="ucg-channel-header__clip-tag">
            CLIP
          </Tag>
        ) : null}
        {meter?.isLive ? (
          <span
            className="ucg-channel-header__live-dot"
            aria-label="Live"
            title="Live — engine streaming meters"
          />
        ) : null}
      </div>
    </div>
  )
}
