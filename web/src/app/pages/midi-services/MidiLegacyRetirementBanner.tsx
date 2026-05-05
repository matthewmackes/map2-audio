/**
 * T2459-H5 Slice 20 — MIDI v1 legacy-route retirement banner.
 *
 * Renders a Carbon `InlineNotification` on every MIDI Services page
 * during the deprecation window so operators get a visual countdown
 * ("MIDI v1 retires in N days — switch automation to /api/v2/midi").
 * After the flag flips (`MAP2_MIDI_LEGACY_RETIRED=1`), the banner
 * tells operators every legacy `/api/v1/midi/...` mount returns 410
 * Gone.
 *
 * Banner is dismissible via Carbon's built-in close button; dismissed
 * state lives in localStorage so a one-time dismiss survives reloads
 * but reappears whenever the days-remaining value changes (e.g. the
 * countdown ticks down).
 */

import { useEffect, useMemo, useState } from 'react'
import { InlineNotification } from '@carbon/react'

import { useMidiLegacyRetirement } from './useMidiLegacyRetirement'

const STORAGE_KEY = 'map2:midi-legacy-retirement-banner-dismissed-at'

function readDismissedAt(): number | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeDismissedAt(value: number): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value))
  } catch {
    // localStorage failures are non-fatal — the banner just keeps
    // showing on refresh.
  }
}

export function MidiLegacyRetirementBanner() {
  const status = useMidiLegacyRetirement()
  const [dismissedAt, setDismissedAt] = useState<number | null>(() =>
    readDismissedAt(),
  )

  const data = status.data

  // The banner reappears when the countdown value changes (so a
  // dismissed "30 days" banner pops back up at "29 days"). We key
  // dismiss-state on `days_remaining` for the deprecation window;
  // post-flip (retired=true) we key on the flag itself so the
  // post-flip banner can be dismissed separately.
  const dismissKey = useMemo(() => {
    if (!data) return null
    if (data.retired) return 'retired'
    if (data.days_remaining == null) return 'unknown'
    return `days-${data.days_remaining}`
  }, [data])

  // When the dismiss-key changes (e.g. countdown ticks), forget the
  // previous dismissal so the banner reappears on the new value.
  useEffect(() => {
    const stored = readDismissedAt()
    if (stored === null) return
    // Use a side-channel key in localStorage for the last-dismissed
    // dismissKey — if it differs from the current dismissKey, clear
    // dismissedAt so the banner returns.
    try {
      if (typeof window === 'undefined') return
      const lastKey = window.localStorage.getItem(STORAGE_KEY + ':key')
      if (dismissKey && lastKey && lastKey !== dismissKey) {
        window.localStorage.removeItem(STORAGE_KEY)
        window.localStorage.setItem(STORAGE_KEY + ':key', dismissKey)
        setDismissedAt(null)
      } else if (dismissKey && !lastKey) {
        window.localStorage.setItem(STORAGE_KEY + ':key', dismissKey)
      }
    } catch {
      // storage failures non-fatal
    }
  }, [dismissKey])

  if (status.isLoading || status.isError || !data) return null
  if (dismissedAt !== null) return null

  if (data.retired) {
    return (
      <InlineNotification
        kind="warning"
        lowContrast
        title="MIDI v1 routes retired"
        subtitle={
          `Every /api/v1/midi/... endpoint now returns 410 Gone. ` +
          `Migrate automation to ${data.successor_prefix}/...`
        }
        onCloseButtonClick={() => {
          const now = Date.now()
          writeDismissedAt(now)
          setDismissedAt(now)
        }}
        data-testid="midi-legacy-retirement-banner"
        data-state="retired"
      />
    )
  }

  // Deprecation window — show the countdown.
  const days = data.days_remaining ?? 0
  const sunset = data.sunset_iso
    ? data.sunset_iso.slice(0, 10)
    : data.sunset
  const subtitle =
    days <= 0
      ? `MIDI v1 retirement is overdue (sunset ${sunset}). Switch automation to ${data.successor_prefix}/... before the operator flips MAP2_MIDI_LEGACY_RETIRED.`
      : `MIDI v1 retires in ${days} day${days === 1 ? '' : 's'} (sunset ${sunset}). Switch automation to ${data.successor_prefix}/... — see /docs/midi/T2459H_CLOSEOUT.md.`

  return (
    <InlineNotification
      kind={days <= 7 ? 'warning' : 'info'}
      lowContrast
      title="MIDI v1 retirement scheduled"
      subtitle={subtitle}
      onCloseButtonClick={() => {
        const now = Date.now()
        writeDismissedAt(now)
        setDismissedAt(now)
      }}
      data-testid="midi-legacy-retirement-banner"
      data-state="deprecating"
      data-days-remaining={days}
    />
  )
}

export default MidiLegacyRetirementBanner
