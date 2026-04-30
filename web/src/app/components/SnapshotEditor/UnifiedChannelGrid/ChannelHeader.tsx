import type { CSSProperties } from 'react'
import { Button, Tag } from '@carbon/react'
import { TrashCan, VolumeMute, VolumeUp } from '@carbon/icons-react'

import { SegmentedLedText } from '../../Displays/SegmentedLedText'
import { FlowLevelControl } from '../../../pages/snapshotEditor/FlowLevelControl'

import { COLUMN_WIDTHS, ROW_HEIGHTS, type UnifiedChannelRow } from './gridConstants'
import type { ChainMeterReading } from './useChainMeter'
import type { ChannelStripProps } from './UnifiedChannelGrid'

export interface ChannelHeaderProps {
  row: UnifiedChannelRow
  meter?: ChainMeterReading
  strip?: ChannelStripProps
  onToggleMute?: (rowId: string) => void
  onToggleSolo?: (rowId: string) => void
}

const CLIP_LED_COLOR = 'var(--cds-support-error, #da1e28)'

export function ChannelHeader({ row, meter, strip, onToggleMute, onToggleSolo }: ChannelHeaderProps) {
  const style: CSSProperties = {
    width: COLUMN_WIDTHS.channelHeader,
    height: ROW_HEIGHTS.channel,
  }

  const flowLabel = strip?.flowLabel ?? null
  const identitySubtitle = strip?.identitySubtitle ?? row.name
  const pathLabel = strip?.pathLabel ?? null
  const showStrip = Boolean(strip)
  const dryWetMix = strip?.flowDryWetMix ?? 100
  const showFader =
    strip?.flowDryWetMix !== undefined && typeof strip?.onFlowDryWetMixChange === 'function'
  const trashVisible = Boolean(strip?.canDeleteFlow && strip?.onDeleteFlow)

  return (
    <div
      className={`ucg-channel-header${showStrip ? ' ucg-channel-header--strip' : ''}`}
      style={style}
      role="rowheader"
      data-row-id={row.id}
      data-stereo={row.stereo ? 'true' : 'false'}
      data-muted={row.muted ? 'true' : 'false'}
      data-solo={row.solo ? 'true' : 'false'}
    >
      {showStrip && flowLabel ? (
        <div className="ucg-channel-header__identity">
          <span className="ucg-channel-header__badge" aria-hidden>
            {flowLabel}
          </span>
          <span className="ucg-channel-header__ident" title={`${flowLabel} · ${identitySubtitle}`}>
            <span className="ucg-channel-header__ident-name">{flowLabel}</span>
            <span className="ucg-channel-header__ident-sub">· {identitySubtitle}</span>
          </span>
        </div>
      ) : (
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
      )}

      {showStrip && pathLabel ? (
        <div className="ucg-channel-header__path-label">{pathLabel}</div>
      ) : null}

      {showStrip ? (
        <div className="ucg-channel-header__channel-sub" aria-label="Output">
          <SpeakerIcon />
          <span className="ucg-channel-header__channel-sub-tag">S</span>
        </div>
      ) : null}

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

      {showStrip && showFader ? (
        <div className="ucg-channel-header__fader">
          <FlowLevelControl
            flowId={row.id}
            flowLabel={flowLabel ?? row.name}
            value={dryWetMix}
            onChange={strip!.onFlowDryWetMixChange!}
            disabled={strip?.flowControlsDisabled ?? false}
          />
        </div>
      ) : null}

      {showStrip ? (
        <div
          className="ucg-channel-header__strip-controls"
          role="toolbar"
          aria-label={`${flowLabel ?? row.name} channel controls`}
        >
          <div
            className={`ucg-channel-header__pill ucg-channel-header__pill--clip${
              strip?.flowInputClipActive ? ' is-active' : ''
            }`}
            title={
              strip?.flowInputClipActive
                ? `${flowLabel ?? row.name} input clipping detected`
                : `${flowLabel ?? row.name} input is clean`
            }
          >
            <SegmentedLedText value="IN" size="xs" color={CLIP_LED_COLOR} />
          </div>
          <div
            className={`ucg-channel-header__pill ucg-channel-header__pill--clip${
              strip?.flowOutputClipActive ? ' is-active' : ''
            }`}
            title={
              strip?.flowOutputClipActive
                ? `${flowLabel ?? row.name} output clipping detected`
                : `${flowLabel ?? row.name} output is clean`
            }
          >
            <SegmentedLedText value="OUT" size="xs" color={CLIP_LED_COLOR} />
          </div>
          <div
            className={`ucg-channel-header__pill ucg-channel-header__pill--clip${
              strip?.flowClipActive ? ' is-active' : ''
            }`}
            title={
              strip?.flowClipActive
                ? `${flowLabel ?? row.name} channel clipping detected`
                : `${flowLabel ?? row.name} channel is clean`
            }
          >
            <SegmentedLedText value="CLIP" size="xs" color={CLIP_LED_COLOR} />
          </div>
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
          {trashVisible ? (
            <Button
              kind="ghost"
              size="sm"
              hasIconOnly
              iconDescription={`Delete ${flowLabel ?? row.name}`}
              renderIcon={TrashCan}
              onClick={() => strip!.onDeleteFlow?.()}
              data-action="delete-flow"
              disabled={strip?.flowControlsDisabled ?? false}
              className="ucg-channel-header__trash"
            />
          ) : null}
        </div>
      ) : (
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
      )}
    </div>
  )
}

function SpeakerIcon() {
  return (
    <svg
      className="ucg-channel-header__speaker"
      viewBox="0 0 16 16"
      width={14}
      height={14}
      fill="none"
      aria-hidden
    >
      <path
        d="M3 6v4h2.5L9 13V3L5.5 6H3z"
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinejoin="round"
      />
      <path
        d="M11 6c.8.6.8 3.4 0 4"
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinecap="round"
      />
    </svg>
  )
}
