/**
 * T2499-A slice 4 — Device-pack picker.
 *
 * Operators land here from the Sequencer Setup "Map a MIDI controller"
 * card and from MIDI Services. The picker lists every registered
 * device-pack, polls each pack's `fetchStatus()` to detect presence
 * live, and offers a deep-link into the pack's configurator route
 * (bespoke today; framework-rendered when each pack's tabs land).
 *
 * Packs that detect a present device float to the top with a green
 * presence tag. Packs whose device is not on the bus stay listed
 * (operators may want to set bindings up before plugging the device
 * in). The MIDI Learn fallback (slice 5) is rendered as a
 * synthetic last entry.
 */
import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import {
  Button,
  ClickableTile,
  InlineLoading,
  InlineNotification,
  Section,
  Tag,
} from '@carbon/react'
import { ArrowRight } from '@carbon/icons-react'

import { ApiError } from '../../../map2/http'
import type {
  ConfiguratorPackDescriptor,
  DeviceDetectionStatus,
  DevicePresence,
} from './types'
import './DevicePackPicker.css'

const PRESENCE_TAG: Record<
  DevicePresence,
  { label: string; type: 'green' | 'blue' | 'magenta' | 'warm-gray' | 'cool-gray' }
> = {
  not_present: { label: 'Not connected', type: 'cool-gray' },
  present_stock: { label: 'Connected · Stock', type: 'blue' },
  present_custom: { label: 'Connected · Custom', type: 'green' },
  present_bootloader: { label: 'Connected · Bootloader', type: 'magenta' },
  present_unknown: { label: 'Connected · Unknown mode', type: 'warm-gray' },
}

const POLL_MS = 5000

interface DevicePackPickerProps {
  packs: ConfiguratorPackDescriptor[]
  /**
   * Called when the operator picks a device-pack. The host page
   * decides whether to deep-link, mount the framework shell, or
   * navigate to a bespoke route.
   */
  onPick: (pack: ConfiguratorPackDescriptor) => void
  /**
   * Called when the operator picks "MIDI Learn" — the fallback
   * path for unknown controllers (slice 5 will fill in the
   * destination).
   */
  onPickMidiLearn?: () => void
  /**
   * Override per-pack status poll interval. `false` disables
   * polling (useful for tests).
   */
  pollMs?: number | false
}

interface PackPresence {
  pack: ConfiguratorPackDescriptor
  status: DeviceDetectionStatus | null
  isLoading: boolean
  error: unknown
}

function presenceWeight(status: DeviceDetectionStatus | null): number {
  if (!status) return 99
  switch (status.presence) {
    case 'present_stock':
    case 'present_custom':
    case 'present_unknown':
      return 0
    case 'present_bootloader':
      return 1
    case 'not_present':
      return 2
    default:
      return 3
  }
}

function getErrorMessage(error: unknown): string | null {
  if (!error) return null
  if (error instanceof ApiError) {
    const detail =
      typeof error.body === 'object' && error.body !== null && 'detail' in error.body
        ? (error.body as { detail?: unknown }).detail
        : undefined
    if (typeof detail === 'string' && detail.trim().length > 0) {
      return detail
    }
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return null
}

export function DevicePackPicker({
  packs,
  onPick,
  onPickMidiLearn,
  pollMs = POLL_MS,
}: DevicePackPickerProps) {
  const queries = useQueries({
    queries: packs.map((pack) => ({
      queryKey: ['device-pack-picker', pack.packId],
      queryFn: () => pack.fetchStatus(),
      refetchInterval: pollMs === false ? false : pollMs,
      refetchIntervalInBackground: false,
    })),
  })

  const presences: PackPresence[] = useMemo(
    () =>
      packs.map((pack, idx) => {
        const q = queries[idx]
        return {
          pack,
          status: (q.data as DeviceDetectionStatus | undefined) ?? null,
          isLoading: q.isLoading,
          error: q.error,
        }
      }),
    [packs, queries],
  )

  const sorted = useMemo(
    () =>
      [...presences].sort((a, b) => {
        const w = presenceWeight(a.status) - presenceWeight(b.status)
        if (w !== 0) return w
        return a.pack.displayName.localeCompare(b.pack.displayName)
      }),
    [presences],
  )

  return (
    <Section
      className="device-pack-picker"
      data-testid="device-pack-picker"
      aria-label="Device-pack picker"
    >
      <ul className="device-pack-picker__list">
        {sorted.map(({ pack, status, isLoading, error }) => {
          const tag = status
            ? PRESENCE_TAG[status.presence] ?? PRESENCE_TAG.present_unknown
            : null
          const errMsg = getErrorMessage(error)
          return (
            <li key={pack.packId} className="device-pack-picker__item">
              <ClickableTile
                onClick={() => onPick(pack)}
                aria-label={`Open ${pack.displayName} configurator`}
                data-testid={`device-pack-tile-${pack.packId}`}
                className="device-pack-picker__tile"
              >
                <header className="device-pack-picker__tile-header">
                  <div className="device-pack-picker__tile-title-row">
                    <span className="device-pack-picker__tile-title">
                      {pack.displayName}
                    </span>
                    {pack.vendorName ? (
                      <span className="device-pack-picker__tile-vendor">
                        {pack.vendorName}
                      </span>
                    ) : null}
                  </div>
                  <div className="device-pack-picker__tile-tags">
                    {isLoading ? (
                      <InlineLoading description="Detecting…" status="active" />
                    ) : tag ? (
                      <Tag
                        type={tag.type}
                        size="sm"
                        data-testid={`device-pack-presence-${pack.packId}`}
                      >
                        {tag.label}
                      </Tag>
                    ) : null}
                    <ArrowRight aria-hidden size={20} />
                  </div>
                </header>
                {pack.summary ? (
                  <p className="device-pack-picker__tile-summary">{pack.summary}</p>
                ) : null}
                {errMsg ? (
                  <InlineNotification
                    kind="warning"
                    lowContrast
                    hideCloseButton
                    title="Detection failed"
                    subtitle={errMsg}
                  />
                ) : null}
              </ClickableTile>
            </li>
          )
        })}
        {onPickMidiLearn ? (
          <li className="device-pack-picker__item">
            <ClickableTile
              onClick={onPickMidiLearn}
              aria-label="Bind an unknown controller using MIDI Learn"
              data-testid="device-pack-tile-midi-learn"
              className="device-pack-picker__tile device-pack-picker__tile--learn"
            >
              <header className="device-pack-picker__tile-header">
                <div className="device-pack-picker__tile-title-row">
                  <span className="device-pack-picker__tile-title">
                    Bind any controller (MIDI Learn)
                  </span>
                  <span className="device-pack-picker__tile-vendor">Generic</span>
                </div>
                <div className="device-pack-picker__tile-tags">
                  <Tag type="purple" size="sm">
                    Fallback
                  </Tag>
                  <ArrowRight aria-hidden size={20} />
                </div>
              </header>
              <p className="device-pack-picker__tile-summary">
                Press a control on any MIDI controller to learn its CC/PC and
                bind it to a brain slot.
              </p>
            </ClickableTile>
          </li>
        ) : null}
      </ul>
      {onPickMidiLearn ? (
        <p className="device-pack-picker__hint">
          Don't see your controller? Use <Button kind="ghost" size="sm" onClick={onPickMidiLearn}>MIDI Learn</Button> to bind any device by pressing one of its controls.
        </p>
      ) : null}
    </Section>
  )
}
