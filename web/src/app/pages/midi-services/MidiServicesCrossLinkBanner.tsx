/**
 * T2482 loop 14 / iter 133 — MidiServicesCrossLinkBanner.
 * T2483 loop 17 / iter 166 — added optional dismissibility (T2483-7)
 *   with localStorage persistence. Banner state is per-profileKey;
 *   the Brain banner uses linkTo so it's keyed by linkTo when no
 *   profileKey is set.
 *
 * Single source of truth for the cross-link banner that appears on
 * each per-device editor page (P3.9) and on the Brain pages (P3.10).
 */

import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { InlineNotification, Link as CarbonLink } from '@carbon/react'

import './MidiServicesCrossLinkBanner.css'

const DISMISSED_STORAGE_KEY = 'midi-services.banner-dismissed'

interface DismissedMap {
  [key: string]: number  // dismissed_at unix ms
}

function loadDismissed(): DismissedMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(DISMISSED_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as DismissedMap
    }
    return {}
  } catch {
    return {}
  }
}

function persistDismissed(map: DismissedMap): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // localStorage full or denied — silent fallback (banner just stays visible).
  }
}

interface MidiServicesCrossLinkBannerProps {
  /**
   * Device-pack profile_key (e.g. "native-instruments/maschine-mk1.midi").
   * Determines the link target — /midi/devices/{profileKey}.
   * Pass undefined for the Brain banner (link goes to /midi/devices index).
   */
  profileKey?: string

  /**
   * Override the default banner copy. Used by the iter-138 Brain page.
   */
  title?: string
  subtitle?: string
  linkLabel?: string
  linkTo?: string
  kind?: 'info' | 'low-contrast'

  /**
   * T2483-7 iter 166 — when true, banner shows a Carbon close button.
   * Dismissal persists in localStorage keyed by profileKey (or linkTo
   * if no profileKey). Banner stays hidden on subsequent renders.
   */
  dismissible?: boolean
}

const DEFAULT_TITLE = 'Bound to the canonical MIDI Services authority'
const DEFAULT_SUBTITLE =
  'This editor reads + writes through the MIDI Services Bindings authority. View this device-pack profile in the canonical surface.'
const DEFAULT_LINK_LABEL = 'Open in MIDI Services'

export function MidiServicesCrossLinkBanner({
  profileKey,
  title,
  subtitle,
  linkLabel,
  linkTo,
  dismissible,
}: MidiServicesCrossLinkBannerProps) {
  const computedLinkTo =
    linkTo ??
    (profileKey
      ? `/midi/devices/${encodeURIComponent(profileKey)}`
      : '/midi/devices')

  // T2483-7 iter 166 — dismissibility key uses profileKey first then
  // linkTo so both the per-device pages and the Brain banner persist
  // independently.
  const dismissKey = profileKey ?? linkTo ?? '__default__'
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!dismissible) return
    const map = loadDismissed()
    setDismissed(Boolean(map[dismissKey]))
  }, [dismissible, dismissKey])

  const handleClose = useCallback(() => {
    setDismissed(true)
    const map = loadDismissed()
    map[dismissKey] = Date.now()
    persistDismissed(map)
  }, [dismissKey])

  if (dismissible && dismissed) return null

  return (
    <div className="midi-services-crosslink-banner">
      <InlineNotification
        kind="info"
        lowContrast
        hideCloseButton={!dismissible}
        onCloseButtonClick={dismissible ? handleClose : undefined}
        title={title ?? DEFAULT_TITLE}
        subtitle={subtitle ?? DEFAULT_SUBTITLE}
      />
      <CarbonLink
        as={RouterLink}
        to={computedLinkTo}
        className="midi-services-crosslink-banner__link"
      >
        {linkLabel ?? DEFAULT_LINK_LABEL} →
      </CarbonLink>
    </div>
  )
}

export default MidiServicesCrossLinkBanner
