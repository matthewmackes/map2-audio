/**
 * MidiCcBadge Component
 *
 * Visual indicator badge that shows MIDI CC assignment status for a parameter.
 * This is a display-only component - MIDI mappings are configured via
 * the MIDI Mapping Dialog (accessed from the plugin card menu).
 */

import { memo } from 'react'
import { Tag } from '@carbon/react'
import type { MIDIMappingV2 } from '../../../map2/types'
import './MidiCcBadge.css'

export interface MidiCcBadgeProps {
  /** MIDI mapping for this parameter (display only) */
  mapping?: MIDIMappingV2 | null
  /** Position relative to parent */
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'inline'
  /** Size variant */
  size?: 'small' | 'medium'
}

/**
 * Display-only badge showing MIDI CC assignment
 * Configuration is done via the MIDI Mapping Dialog
 */
export const MidiCcBadge = memo(function MidiCcBadge({
  mapping,
  position = 'top-right',
  size = 'small',
}: MidiCcBadgeProps) {
  // Don't render if no mapping
  if (!mapping) {
    return null
  }

  const badgeText = `CC${mapping.cc}`
  const channelText = mapping.channel === 0 ? 'Omni' : `Ch${mapping.channel}`
  const tooltipText = `${badgeText} on ${channelText}`

  return (
    <Tag
      className={`midi-cc-badge midi-cc-badge--${position}`}
      size={size === 'small' ? 'sm' : 'md'}
      type="blue"
      title={tooltipText}
      aria-label={`MIDI CC ${mapping.cc} on ${channelText}`}
    >
      {badgeText}
    </Tag>
  )
})

export default MidiCcBadge
