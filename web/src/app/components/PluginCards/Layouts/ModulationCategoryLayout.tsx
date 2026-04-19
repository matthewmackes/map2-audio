/**
 * ModulationCategoryLayout — AXE-FX Edit structural parity for modulation effects
 *
 * Standard layout: LFO Viz → Modulation → Character → Mix → Accordion(Advanced) → Footer
 * Used by: ChorusCard, PhaserCard, IntelliFXCard, CE2Chorus, BF2Flanger, TooB Phaser, TooB Tremolo
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

export interface ModulationCategoryLayoutProps {
  plugin: Plugin
  accentColor?: string
  compact?: boolean
  cardWidth?: number
  bypassed?: boolean
  onBypassToggle?: (bypassed: boolean) => void
  onOpenMidiMappings?: () => void

  /* Visualization — LFO waveform or custom */
  visualization?: ReactNode

  /* Modulation section */
  rate?: ParamSlot
  depth?: ParamSlot
  centreDelay?: ParamSlot

  /* Character section */
  feedback?: ParamSlot
  spread?: ParamSlot
  waveform?: { value: string; options: string[]; onChange: (v: string) => void }

  /* Mix section */
  mix?: ParamSlot

  /* Metering */
  inputLevel?: number
  outputLevel?: number

  /* Advanced sections */
  advancedSections?: AdvancedSection[]

  /* Presets */
  presets?: ReactNode

  /* Extra content */
  extraContent?: ReactNode
}

export function ModulationCategoryLayout({
  plugin,
  accentColor: providedAccent,
  compact = false,
  cardWidth,
  bypassed = false,
  onBypassToggle,
  onOpenMidiMappings,
  visualization,
  rate,
  depth,
  centreDelay,
  feedback,
  spread,
  waveform,
  mix,
  inputLevel = 0,
  outputLevel = 0,
  advancedSections,
  presets,
  extraContent,
}: ModulationCategoryLayoutProps) {
  const accentColor = providedAccent || getCategoryConfig(plugin.category).color
  const renderKnob = (slot: ParamSlot | undefined, size: 'small' | 'medium' = 'medium') => {
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
        size={compact ? 'small' : size}
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
      cardWidth={cardWidth}
    >
      {/* Modulation Section */}
      {(rate || depth || centreDelay) && (
        <CarbonParameterSection title="Modulation" accentColor={accentColor}>
          <div className="carbon-param-row">
            {renderKnob(rate)}
            {renderKnob(depth)}
            {renderKnob(centreDelay)}
          </div>
        </CarbonParameterSection>
      )}

      {/* Character Section */}
      {(feedback || spread || waveform) && (
        <CarbonParameterSection title="Character" accentColor={accentColor}>
          <div className="carbon-param-row">
            {renderKnob(feedback, 'small')}
            {renderKnob(spread, 'small')}
            {waveform && (
              <div className="carbon-preset-row">
                {waveform.options.map(opt => (
                  <button
                    key={opt}
                    className={`carbon-preset-btn ${waveform.value === opt ? 'active' : ''}`}
                    onClick={() => waveform.onChange(opt)}
                    style={waveform.value === opt ? { background: accentColor, borderColor: accentColor } : undefined}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
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

      {/* Presets */}
      {presets}

      {/* Extra content */}
      {extraContent}
    </CarbonCardShell>
  )
}

export default ModulationCategoryLayout
