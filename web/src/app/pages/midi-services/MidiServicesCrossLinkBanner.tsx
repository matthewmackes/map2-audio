/**
 * T2482 loop 14 / iter 133 — MidiServicesCrossLinkBanner.
 *
 * Single source of truth for the cross-link banner that appears on
 * each per-device editor page (P3.9) and on the Brain pages (P3.10).
 * Per the iter-131 plan D1: one component, not 9 copies. Iters 134-138
 * each add 1 import + 1 JSX line per page.
 *
 * Per D2: profile_key → MidiServices Devices INDEX route is computed
 * directly (no dependency on the iter-98 inverted map).
 *
 * Per D3: Brain banner copy is bespoke; iter 138 passes its own
 * `kind`, `title`, and `subtitle` props.
 */

import { Link as RouterLink } from 'react-router-dom'
import { InlineNotification, Link as CarbonLink } from '@carbon/react'

import './MidiServicesCrossLinkBanner.css'

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
}: MidiServicesCrossLinkBannerProps) {
  const computedLinkTo =
    linkTo ??
    (profileKey
      ? `/midi/devices/${encodeURIComponent(profileKey)}`
      : '/midi/devices')

  return (
    <div className="midi-services-crosslink-banner">
      <InlineNotification
        kind="info"
        lowContrast
        hideCloseButton
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
