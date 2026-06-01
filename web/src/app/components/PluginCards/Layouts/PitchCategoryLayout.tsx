/**
 * PitchCategoryLayout — AXE-FX Edit structural parity for pitch effects
 *
 * Standard layout: Pitch Display → Pitch → Character → Mix → Accordion(Advanced) → Footer
 * Used by: IntervalShifter, EVHPitchShifter, BossXS1, Whammy, GlitchShifter, and pitch-template fallbacks
 */

import type { ReactNode } from 'react'
import type { Plugin } from '../../../../map2/types'
import { CarbonCardShell, type AdvancedSection } from '../Base/CarbonCardShell'
import { CarbonParameterSection } from '../Base/CarbonParameterSection'
import { CarbonMeteringFooter } from '../Base/CarbonMeteringFooter'
import { ParameterKnob } from '../../ParameterControl'
import { getCategoryConfig } from '../types'
import type { ParamSlot } from './DynamicsCategoryLayout'

export { type ParamSlot }

export interface PitchCategoryLayoutProps {
  plugin: Plugin
  accentColor?: string
  compact?: boolean
  bypassed?: boolean
  onBypassToggle?: (bypassed: boolean) => void
  onOpenMidiMappings?: () => void

  visualization?: ReactNode

  /* Pitch section */
  semitones?: ParamSlot
  cents?: ParamSlot
  detune?: ParamSlot
  interval?: ParamSlot

  /* Character section */
  glide?: ParamSlot
  feedback?: ParamSlot
  tracking?: ParamSlot
  delay?: ParamSlot

  /* Mix section */
  mix?: ParamSlot

  /* Metering */
  inputLevel?: number
  outputLevel?: number

  advancedSections?: AdvancedSection[]
  presets?: ReactNode
  extraContent?: ReactNode
}

export function PitchCategoryLayout({
  plugin,
  accentColor: providedAccent,
  compact = false,
  bypassed = false,
  onBypassToggle,
  onOpenMidiMappings,
  visualization,
  semitones,
  cents,
  detune,
  interval,
  glide,
  feedback,
  tracking,
  delay,
  mix,
  inputLevel = 0,
  outputLevel = 0,
  advancedSections,
  presets,
  extraContent,
}: PitchCategoryLayoutProps) {
  const accentColor = providedAccent || getCategoryConfig(plugin.category).color
  const renderKnob = (slot: ParamSlot | undefined, sz: 'small' | 'medium' = 'medium') => {
    if (!slot) return null
    return (
      <ParameterKnob
        label={slot.label}
        value={slot.value}
        min={slot.min}
        max={slot.max}
        defaultValue={slot.defaultValue}
        step={slot.step}
        unit={slot.unit}
        onChange={slot.onChange}
        isLogarithmic={slot.isLogarithmic}
        valueFormatter={slot.valueFormatter}
        accentColor={accentColor}
        size={compact ? 'small' : sz}
        midi={slot.midi}
      />
    )
  }

  const footer = (
    <CarbonMeteringFooter inputLevel={inputLevel} outputLevel={outputLevel} />
  )

  return (
    <CarbonCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={bypassed}
      onBypassToggle={onBypassToggle}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={visualization}
      advancedSections={advancedSections}
      footer={footer}
      compact={compact}
      cardHeight={480}
    >
      {/* Pitch Section */}
      {(semitones || cents || detune || interval) && (
        <CarbonParameterSection title="Pitch" accentColor={accentColor}>
          <div className="carbon-param-row">
            {renderKnob(semitones)}
            {renderKnob(cents, 'small')}
            {renderKnob(detune)}
            {renderKnob(interval)}
          </div>
        </CarbonParameterSection>
      )}

      {/* Character Section */}
      {(glide || feedback || tracking || delay) && (
        <CarbonParameterSection title="Character" accentColor={accentColor}>
          <div className="carbon-param-row">
            {renderKnob(glide, 'small')}
            {renderKnob(feedback, 'small')}
            {renderKnob(tracking, 'small')}
            {renderKnob(delay, 'small')}
          </div>
        </CarbonParameterSection>
      )}

      {/* Mix Section */}
      {mix && (
        <CarbonParameterSection title="Mix" accentColor={accentColor}>
          <div className="carbon-param-row">
            {renderKnob(mix)}
          </div>
        </CarbonParameterSection>
      )}

      {presets}
      {extraContent}
    </CarbonCardShell>
  )
}

export default PitchCategoryLayout
