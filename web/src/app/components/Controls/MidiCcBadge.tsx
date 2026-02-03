/**
 * MidiCcBadge Component
 *
 * Small badge that shows MIDI CC assignment status for a parameter.
 * - Shows CC number when mapped (e.g., "CC 7")
 * - Click to enter MIDI learn mode
 * - Right-click to remove mapping
 * - Pulses when in learn mode
 */

import { memo, useCallback, useState } from 'react'
import { useMidiLearn } from '../../hooks/useMidiLearn'
import './MidiCcBadge.css'

export interface MidiCcBadgeProps {
  /** Plugin URI for MIDI mapping */
  pluginUri: string
  /** Parameter index within the plugin */
  paramIndex: number
  /** Human-readable parameter name */
  paramName: string
  /** Position relative to parent */
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'inline'
  /** Size variant */
  size?: 'small' | 'medium'
  /** Show even when no mapping exists (shows "MIDI" text) */
  showWhenEmpty?: boolean
}

export const MidiCcBadge = memo(function MidiCcBadge({
  pluginUri,
  paramIndex,
  paramName,
  position = 'top-right',
  size = 'small',
  showWhenEmpty = false,
}: MidiCcBadgeProps) {
  const {
    mapping,
    hasMapping,
    isLearning,
    isLearningThis,
    startLearn,
    stopLearn,
    removeMapping,
  } = useMidiLearn(pluginUri, paramIndex, paramName)

  const [showTooltip, setShowTooltip] = useState(false)

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()

    if (isLearningThis) {
      stopLearn()
    } else {
      startLearn()
    }
  }, [isLearningThis, startLearn, stopLearn])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()

    if (hasMapping) {
      removeMapping()
    }
  }, [hasMapping, removeMapping])

  // Don't render if no mapping and showWhenEmpty is false
  if (!hasMapping && !showWhenEmpty && !isLearningThis) {
    return null
  }

  const badgeText = isLearningThis
    ? '...'
    : hasMapping
    ? `CC${mapping!.cc}`
    : 'MIDI'

  const tooltipText = isLearningThis
    ? 'Move a MIDI controller to assign...'
    : hasMapping
    ? `CC ${mapping!.cc} Ch${mapping!.channel === 0 ? 'All' : mapping!.channel}\nRight-click to remove`
    : 'Click to assign MIDI CC'

  return (
    <div
      className={`midi-cc-badge ${position} ${size} ${isLearningThis ? 'learning' : ''} ${hasMapping ? 'mapped' : ''}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      title={tooltipText}
      role="button"
      tabIndex={0}
      aria-label={`MIDI CC assignment for ${paramName}`}
    >
      <span className="midi-cc-badge-text">{badgeText}</span>
      {isLearningThis && <span className="midi-cc-badge-pulse" />}
    </div>
  )
})

/**
 * Wrapper component that adds MIDI CC badge to any control
 */
export interface WithMidiCcProps {
  pluginUri: string
  paramIndex: number
  paramName: string
  children: React.ReactNode
  badgePosition?: MidiCcBadgeProps['position']
  showBadgeWhenEmpty?: boolean
}

export function WithMidiCc({
  pluginUri,
  paramIndex,
  paramName,
  children,
  badgePosition = 'top-right',
  showBadgeWhenEmpty = false,
}: WithMidiCcProps) {
  return (
    <div className="with-midi-cc-wrapper">
      {children}
      <MidiCcBadge
        pluginUri={pluginUri}
        paramIndex={paramIndex}
        paramName={paramName}
        position={badgePosition}
        showWhenEmpty={showBadgeWhenEmpty}
      />
    </div>
  )
}

export default MidiCcBadge
